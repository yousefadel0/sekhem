import { getConversation, type ConversationDetailDto, type ConversationMessageDto } from "./sekhem-conversation"
import { runActivity, runIsActive, runIsTerminal, type AgentRunDetail, type AgentRunSummary } from "./sekhem-agent"

/** One composer edit is one submission; replay and request settlement never reset it. */
export class ComposerSubmission {
  private consumed = false
  edited() { this.consumed = false }
  claim() { if (this.consumed) return false; this.consumed = true; return true }
}

/** Layout preference only; never workflow or authority state. */
export function restoredWorkspaceSurface(value: string | null): "workspace" | "agent" | "chat" {
  return value === "chat" || value === "agent" ? value : "workspace"
}

/** A preview response belongs to both its request revision and originating conversation. */
export function acceptsConversationPreview(origin: string | null, current: string | null, sequence: number, latest: number): boolean {
  return origin === current && sequence === latest;
}

export function submissionRun(conversation: ConversationDetailDto | undefined, request?: { id: string; content: string }): ConversationDetailDto["agentRuns"][number] | undefined {
  if (!conversation || !request) return undefined;
  const messages = conversation.messages.filter(m => m.senderType === "user" && (m.id === request.id ||
    m.metadata.clientMessageId === request.id || m.content === `Generate an engineering plan:\n${request.content}`));
  const matches = conversation.agentRuns.filter(run => messages.some(m => m.metadata.agentRunId === run.id ||
    run.presentation?.originatingMessageId === m.id));
  return matches.length === 1 ? matches[0] : undefined;
}
export function submissionActivity(conversation: ConversationDetailDto | undefined, request?: { id: string; content: string }): string {
  const run = submissionRun(conversation, request);
  return run ? runActivity(run, undefined, run.presentation?.planning) : "Request pending · Waiting for a saved update";
}

/** Delivery failure preserves data; it never creates a workflow outcome. */
export function snapshotDeliveryFailure<T>(lastSuccessful: T | undefined) { return { snapshot: lastSuccessful, stale: true as const }; }

const timestamp = (value?: string) => value ? new Date(value).getTime() || 0 : 0
export function orderConversationRuns<T extends AgentRunSummary>(runs: T[]): T[] {
  return [...runs].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || b.id.localeCompare(a.id))
}
export function selectConversationRun(runs: AgentRunSummary[], explicitId?: string): string {
  const ordered = orderConversationRuns(runs)
  return ordered.find(run => run.id === explicitId)?.id ?? ordered.find(run => runIsActive(run.status))?.id ?? ordered[0]?.id ?? ""
}

/** Compare only backend snapshots. SSE payloads never participate in state merging. */
export function reconcileConversationSnapshot(previous: ConversationDetailDto | undefined, incoming: ConversationDetailDto): ConversationDetailDto {
  if (previous && (previous.id !== incoming.id || previous.projectId !== incoming.projectId)) previous = undefined
  const agentRuns = orderConversationRuns(incoming.agentRuns.map(run => {
    const old = previous?.agentRuns.find(item => item.id === run.id)
    if (!old) return run
    if ((run.planVersion ?? 0) <= (old.planVersion ?? 0)) {
      if ((run.workflowPause?.revision ?? 0) < (old.workflowPause?.revision ?? 0)) return old
      if (old.workflowDecision && !run.workflowDecision) return old
    }
    if (old.workflow && (run.planVersion ?? 0) <= (old.planVersion ?? 0)) {
      if (!run.workflow) run = { ...run, workflow: old.workflow }
      else if (run.workflow.observedAt < old.workflow.observedAt ||
        (run.workflow.consent?.selected?.state !== "UNAVAILABLE" && run.workflow.consent?.selected?.reference.policyId === old.workflow.consent?.selected?.reference.policyId && ((run.workflow.consent?.selected?.revision ?? 0) < (old.workflow.consent?.selected?.revision ?? 0) || (old.workflow.consent?.selected?.state === "REVOKED" && run.workflow.consent?.selected?.state === "ACTIVE"))) ||
        (run.workflow.consent?.selected?.type === old.workflow.consent?.selected?.type && (run.workflow.consent?.selected?.reference.generation ?? 0) < (old.workflow.consent?.selected?.reference.generation ?? 0)) ||
        (run.workflow.approval?.generation ?? 0) < (old.workflow.approval?.generation ?? 0) ||
        (run.workflow.permit?.generation ?? 0) < (old.workflow.permit?.generation ?? 0)) run = { ...run, workflow: old.workflow }
    }
    const age = timestamp(run.updatedAt) - timestamp(old.updatedAt)
    if (old.execution || run.execution) {
      const before = old.execution, next = run.execution
      if (next?.runId === run.id && next.planVersion === run.planVersion && (run.planVersion ?? 0) >= (old.planVersion ?? 0) && (!before || next.revision > before.revision)) return run
      if (before && (run.planVersion ?? 0) <= (old.planVersion ?? 0) && (!next || next.revision < before.revision)) return old
    }
    // Final states cannot regress. A paused run may resume only in a newer saved revision.
    const controlTransition = old.status === "COMPLETED" && old.outcome === "PLAN_READY" && age > 0 &&
      run.control?.version === 1 && run.control.runId === run.id && (run.control.revision > (old.control?.revision ?? 0)) &&
      ["AWAITING_APPROVAL", "PAUSED", "CANCELLED"].includes(run.status)
    const planRevision = run.id.startsWith("planning_run_") && (run.planVersion ?? 0) > (old.planVersion ?? 0) && age >= 0
    if (age < 0 || (runIsTerminal(old.status) && run.status !== old.status && !controlTransition && !planRevision && !((run.workflowPause?.revision ?? 0) > (old.workflowPause?.revision ?? 0) && run.workflowPause?.state === "PAUSED")) ||
      (age === 0 && old.status === "PAUSED" && run.status !== "PAUSED" && run.status !== "CANCELLED" && (run.workflowPause?.revision ?? 0) <= (old.workflowPause?.revision ?? 0))) return old
    return run
  }))
  return { ...incoming, agentRuns }
}

export function conversationRunDetails(conversation?: ConversationDetailDto): Record<string, AgentRunDetail> {
  return Object.fromEntries((conversation?.agentRuns ?? []).map(run => [run.id, {
    ...run, conversationId: conversation!.id, projectId: conversation!.projectId,
    failureReason: run.failureReason ?? null, pendingApprovals: run.pendingApprovals ?? []
  }]))
}

/** A memo committed by a late completion must not contradict a saved pause/cancellation. */
export function restoredConversationMessages(conversation: ConversationDetailDto): ConversationMessageDto[] {
  return conversation.messages.filter(message => {
    if (message.senderType !== "assistant") return true
    // Saved conversation and verified inspection checkpoints are history, not late completion memos.
    if (message.metadata?.modelConversation === true || message.metadata?.inspectionUnderstanding === true || message.metadata?.inspectionClarification === true) return true
    if (message.metadata?.planExecution || message.metadata?.planExecutionId || message.metadata?.planExecutionReport) return true
    const run = conversation.agentRuns.find(item => item.id === message.metadata?.agentRunId)
    return !run || !["PAUSED", "CANCELLED"].includes(run.status) || message.metadata.outcome === run.status
  })
}

/** Persisted attachment metadata replaces local upload previews once acknowledged. */
export function messageAttachmentPresentation(message: ConversationMessageDto, local?: { id: string; name: string; previewUrl?: string }[]): { id: string; name: string; previewUrl?: string }[] | undefined {
  return message.attachments !== undefined ? message.attachments.map(attachment => ({ id: attachment.id, name: attachment.fileName })) : local
}

export function conversationLocation(conversation: Pick<ConversationDetailDto, "id" | "projectId">): string {
  return `/?project=${encodeURIComponent(conversation.projectId)}&conversation=${encodeURIComponent(conversation.id)}`
}

/** One GET per refresh. Late responses and errors are isolated to their conversation. */
export function createConversationLoader(read = (id: string) => getConversation(id, { throwOnError: true })) {
  const sequences = new Map<string, number>()
  return async (id: string): Promise<ConversationDetailDto | undefined> => {
    const sequence = (sequences.get(id) ?? 0) + 1
    sequences.set(id, sequence)
    try {
      const conversation = await read(id)
      if (sequences.get(id) !== sequence) return
      if (!conversation || conversation.id !== id) throw new Error("Conversation snapshot unavailable")
      return conversation
    } catch (error) {
      if (sequences.get(id) === sequence) throw error
    }
  }
}
