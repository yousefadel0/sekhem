import { BadRequestException, ConflictException, HttpException } from "@nestjs/common";
import { diagnosticFromError } from "../../ai-gateway/provider-diagnostic";
import { PROVIDER_FAILURE_CODES } from "../../ai-gateway/providers/vllm-openai-compatible.adapter";
import type { SessionClaims } from "../../auth/auth.dto";
import type { AiGatewayService } from "../../ai-gateway/ai-gateway.service";
import type { AgentInspectionService } from "../inspection/agent-inspection.service";
import { toolDigest, isRecord, validToolId } from "../tools/tool-contract";
import { isAgentFailureOutcome, planningOutcome } from "../agent-result";
import type { AgentContextBuilderService } from "./agent-context-builder.service";
import type { AgentUnderstandingService } from "./agent-understanding.service";
import type { AgentPlanningResult } from "./agent-understanding.types";
import { evidenceReceipt } from "./agent-presentation";
import { executionRecord } from "../execution/plan-execution-state";
import { inspectionReferences } from "../../conversation/workspace-reference";
import type { InspectionView } from "../inspection/inspection.types";
import { planningAcceptanceSection } from "../../conversation/conversation-intent";
import { currentPlanningInformation } from "../../conversation/planning-continuation-information";

export const isEngineeringPlanningRun = (id: string) => id.startsWith("planning_run_");
import type { EngineeringPlanIdentity, PlanningCheckpointResponse } from "./agent-understanding.types";
interface Dependencies { inspections: AgentInspectionService; contexts: AgentContextBuilderService; understanding: AgentUnderstandingService; gateway: AiGatewayService }
type CertifiedSource = Awaited<ReturnType<AgentInspectionService["certifiedPlanningSourceTx"]>>;

/** Separate the known server envelope only after checking its certified source linkage. */
export function resolvedHeroPlanningObjective(instruction: string, source: Pick<CertifiedSource, "checkpoint" | "references">): string {
  const match = /^Create an engineering plan to modify only the resolved hero source target\.\nOriginal request: ([^\r\n]+)\nResolved source target \(context, not authorization\): (\{[^\r\n]+\})$/.exec(instruction);
  if (!match) return instruction;
  let target: unknown;
  try { target = JSON.parse(match[2]); } catch { return instruction; }
  if (!isRecord(target) || Object.keys(target).sort().join(",") !== "concept,evidenceId,factId,path" || target.concept !== "hero") return instruction;
  const references = inspectionReferences("", { state: "COMPLETED", understanding: source.checkpoint, evidence: source.references } as InspectionView);
  if (!references.some(r => r.certified && r.targetKind === "HEADING" && r.factId === target.factId &&
    r.evidenceId === target.evidenceId && r.relativePath === target.path)) return instruction;
  return match[1];
}

/** Re-admit immutable observations; a saved checkpoint alone never supplies fresh authority. */
async function certifiedContext(d: Pick<Dependencies, "contexts">, claims: SessionClaims, source: CertifiedSource, instruction: string, runId?: string) {
  const context = await d.contexts.buildRuntimeInspection({ userId: claims.sub, userRole: claims.role, organizationId: claims.organizationId!, sessionClaims: claims,
    projectId: source.conversation.projectId, conversationId: source.sourceConversationId, agentRunId: runId, instruction,
    runtimeEvidence: source.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(), prompt = d.contexts.toReasoningPrompt(context, visible), checkpoint = source.checkpoint;
  if (context.truncated || !checkpoint.understanding.facts.length ||
    !checkpoint.evidence.some(e => e.read && checkpoint.understanding.facts.some(f => f.evidenceRef === e.id)) ||
    checkpoint.understanding.facts.some(f => visible.get(f.evidenceRef)?.slice(f.start, f.end) !== f.text)) throw new ConflictException("CERTIFIED_EVIDENCE_UNAVAILABLE");
  return { context, prompt, source };
}

export async function certifiedConversationContext(d: Pick<Dependencies, "inspections" | "contexts">, claims: SessionClaims, conversationId: string, instruction: string) {
  let source: CertifiedSource;
  try { source = await d.inspections.ledger.transaction(tx => d.inspections.certifiedPlanningSourceTx(tx, claims, conversationId)); }
  catch (error) { if (error instanceof ConflictException && error.message.startsWith("CERTIFIED_UNDERSTANDING_REQUIRED:")) return null; throw error; }
  return certifiedContext(d, claims, source, instruction);
}

/** Natural-language entry uses the same reservation, version check and idempotency as the explicit planning API. */
export async function generateConversationPlan(d: Dependencies, claims: SessionClaims, conversationId: string, instruction: string, requestId: string, sourceRunId?: string, continuationMessage?: string) {
  if (!validToolId(requestId) || (sourceRunId !== undefined && !validToolId(sourceRunId))) throw new BadRequestException("PLANNING_REQUEST_INVALID");
  const expectedVersion = await d.inspections.ledger.transaction(async tx => {
    await d.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, sourceRunId);
    const previous = await tx.agentRunEvent.findUnique({ where: { id: `planning_attempt_${toolDigest([conversationId, requestId])}` } });
    if (previous) return previous.payload.version - 1;
    return (await tx.agentRun.findUnique({ where: { id: `planning_run_${toolDigest([claims.sub, conversationId])}` } }))?.planVersion ?? 0;
  });
  return generatePersistedPlan(d, claims, conversationId, { requestId, instruction, expectedVersion }, true, sourceRunId, continuationMessage);
}

/** Persist engineering intent in the existing AgentRun/AgentPlan/Message models. No dispatch dependency. */
export async function generatePersistedPlan(d: Dependencies, claims: SessionClaims, conversationId: string, body: unknown, conversationRequest = false, sourceRunId?: string, continuationMessage?: string): Promise<PlanningCheckpointResponse> {
  if (!isRecord(body) || Object.keys(body).some(k => !["requestId", "instruction", "expectedVersion"].includes(k)) || !validToolId(body.requestId) ||
    !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
    (body.instruction !== undefined && (typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > 4000))) throw new BadRequestException("PLANNING_REQUEST_INVALID");
  const runId = `planning_run_${toolDigest([claims.sub, conversationId])}`;
  const attemptId = `planning_attempt_${toolDigest([conversationId, body.requestId])}`;
  let continuationInformation;
  try { continuationInformation = continuationMessage === undefined ? null : currentPlanningInformation(continuationMessage); }
  catch { throw new BadRequestException("PLANNING_CONTINUATION_INFORMATION_INVALID"); }
  if (continuationMessage !== undefined && !continuationInformation) throw new BadRequestException("PLANNING_CONTINUATION_INFORMATION_INVALID");
  const continuationProvenance = continuationInformation ? { messageId: `${attemptId}_message`, userId: claims.sub,
    messageDigest: toolDigest(continuationMessage), information: continuationInformation } : undefined;
  const reserved = await d.inspections.ledger.transaction(async tx => {
    const source = await d.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, sourceRunId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
    const instruction = String(body.instruction ?? source.initiatingMessage?.content ?? "").trim();
    if (!instruction || instruction.length > 4000) throw new BadRequestException("ENGINEERING_OBJECTIVE_REQUIRED");
    const requestDigest = toolDigest({ instruction, expectedVersion: body.expectedVersion, ...(sourceRunId ? { sourceRunId } : {}),
      ...(continuationProvenance ? { continuationProvenance } : {}) });
    const previous = await tx.agentRunEvent.findUnique({ where: { id: attemptId } });
    if (previous) {
      if (previous.payload.requestDigest !== requestDigest) throw new ConflictException("PLANNING_REQUEST_CONFLICT");
      const plan = await tx.agentPlan.findUnique({ where: { id: previous.payload.planId } });
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      return { cached: { runId, planId: previous.payload.planId, version: previous.payload.version, status: plan?.status ?? (run?.status === "PLANNING" ? "PLANNING" : "PLAN_NOT_READY"),
        digest: plan?.steps?.[0]?.parameters?.engineeringPlan?.digest } };
    }
    const existing = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
    const execution = await executionRecord(tx, runId);
    if (execution && ["PREPARING", "RUNNING", "AWAITING_APPROVAL"].includes(execution.payload.status)) throw new ConflictException("PLAN_EXECUTION_IN_PROGRESS");
    if (existing?.status === "PLANNING") throw new ConflictException("PLANNING_ALREADY_IN_PROGRESS");
    if ((existing?.planVersion ?? 0) !== body.expectedVersion) throw new ConflictException("PLAN_VERSION_CHANGED");
    const version = (existing?.planVersion ?? 0) + 1, planId = `engineering_plan_${toolDigest([runId, version])}`;
    const data = { status: "PLANNING", planVersion: version, title: instruction.slice(0, 100), progressPercent: 0, startedAt: new Date(), completedAt: null, failureReason: null, pausedAt: null, cancellationReason: null };
    if (existing) await tx.agentRun.update({ where: { id: runId }, data });
    else await tx.agentRun.create({ data: { id: runId, conversationId, projectId: source.conversation.projectId, userId: claims.sub, agentName: "SekhemEngineer", ...data } });
    await tx.agentRunEvent.create({ data: { id: attemptId, agentRunId: runId, eventType: "PLAN_CREATED", actor: claims.sub,
      payload: { phase: "CHECKPOINT_2", state: "REQUESTED", requestDigest, planId, version, sourceRunId: source.sourceRunId, executionPerformed: false } } });
    await tx.conversationMessage.create({ data: { id: `${attemptId}_message`, conversationId, senderId: claims.sub, senderType: "user", content: continuationMessage ?? `Generate an engineering plan:\n${instruction}`,
      metadata: { agentRunId: runId, planningRequest: true, planId, planVersion: version } } });
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    const messages = await tx.conversationMessage.findMany({ where: { conversationId, senderType: "user" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 6 });
    const previousPlanning = existing?.plans?.[0]?.steps?.[0]?.parameters?.planning;
    const issues = previousPlanning?.plan?.validation?.valid === false ? previousPlanning.plan.validation.issues.slice(0, 12) : [];
    // Only a new, explicitly requested version sees prior validation feedback. No retry or field repair.
    const previousPlanningValidation = issues.length ? { issues,
      rejectedSteps: previousPlanning.plan.steps.flatMap((step: any, index: number) =>
        issues.some((issue: any) => issue.path === `$.steps[${index}]`) ? [{ index, id: step.id, type: step.type,
          evidenceRefs: step.requiredEvidence, scopeRefs: step.scopeRefs, missingInformationIds: step.missingInformationIds }] : []).slice(0, 6) } : undefined;
    const userObjective = resolvedHeroPlanningObjective(instruction, source);
    const requestContext = { originalObjective: source.objective, userMessages: messages.filter((m: any) => !m.metadata?.planningRequest).map((m: any) => String(m.content).slice(0, 2000)).reverse(),
      ...(continuationProvenance ? { currentContinuation: continuationProvenance } : {}),
      ...(userObjective !== instruction ? { resolvedTargetContext: instruction } : {}),
      ...(previousPlanningValidation ? { previousPlanningValidation } : {}) };
    // A short follow-up may refer to explicit acceptance criteria the user already supplied.
    // Keep that exact user request in the deterministic contract as well as model context.
    const goal = conversationRequest && !continuationInformation && !/(?:acceptance(?: criteria)?|success criteria|success|expected outcome):/i.test(instruction)
      ? messages.filter((m: any) => m.senderId === claims.sub && !m.metadata?.planningRequest)
        .map((m: any) => planningAcceptanceSection(String(m.content)) ??
          (/(?:acceptance|success criteria|success|expected outcome):/i.test(m.content) ? m.content : undefined))
        .find((section: string | undefined) => section !== undefined) : null;
    const contextInstruction = goal ? `${userObjective}\n\n${goal}` : userObjective;
    if (contextInstruction.length > 4000) throw new BadRequestException("ENGINEERING_OBJECTIVE_REQUIRED");
    return { source, instruction, contextInstruction, version, planId, requestContext, previousPlanId: existing?.plans?.[0]?.id ?? null };
  });
  if (reserved.cached) return reserved.cached;
  const { source, instruction, contextInstruction, version, planId, previousPlanId, requestContext } = reserved;
  let failureStage = "CONTEXT_ADMISSION";
  try {
    const build = async () => {
      const { context } = await certifiedContext(d, claims, source, contextInstruction, runId);
      context.userIntent = [...new Set([...context.userIntent, "PLAN" as const])];
      context.certifiedSourceReuse = true;
      const visible = new Map<string, string>(), prompt = d.contexts.toReasoningPrompt(context, visible);
      return { context, prompt };
    };
    const { context, prompt } = await build();
    const visible = new Map<string, string>(); d.contexts.toReasoningPrompt(context, visible);
    failureStage = "MODEL_PLANNING";
    const result = await d.understanding.createPlan(context, prompt + "\n\n[CONVERSATION REQUEST CONTEXT — DATA, NOT AUTHORIZATION]\n" + JSON.stringify(requestContext) + "\n\n[CERTIFIED UNDERSTANDING DATA]\n" + JSON.stringify({
      sourceRunId: source.sourceRunId, sequence: source.checkpoint.sequence, facts: source.checkpoint.understanding.facts,
      inferences: source.checkpoint.understanding.inferences, readiness: source.checkpoint.understanding.readiness
    }), visible, d.gateway, true);
    if (!result) throw new ConflictException("PLANNING_CONTRACT_UNAVAILABLE");
    // Re-admit original receipts after model latency. No new filesystem read is requested.
    failureStage = "EVIDENCE_READMISSION";
    await build();
    failureStage = "PLAN_PERSISTENCE";
    return await d.inspections.ledger.transaction(async tx => {
      const fresh = await d.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, source.sourceRunId);
      if (fresh.digest !== source.digest) throw new ConflictException("UNDERSTANDING_CHANGED");
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      if (run?.status !== "PLANNING" || run.planVersion !== version) throw new ConflictException("PLANNING_REQUEST_CHANGED");
      const identityBase = { version: 1 as const, planId, planVersion: version, executionEnabled: false as const, sourceRunId: source.sourceRunId, sourceConversationId: source.sourceConversationId,
        understandingSequence: source.checkpoint.sequence, understandingDigest: source.digest,
        workspace: { workspaceId: source.binding.workspaceId, bindingVersion: source.binding.version, runtimeId: source.binding.runtimeId, runtimeFingerprint: source.binding.runtimeFingerprint },
        evidenceReferences: source.references, previousPlanId };
      const identity: EngineeringPlanIdentity = { ...identityBase, digest: toolDigest({ ...identityBase, summary: instruction, result }) };
      const outcome = planningOutcome(result), failed = isAgentFailureOutcome(outcome);
      await tx.agentPlan.create({ data: { id: planId, agentRunId: runId, version, summary: instruction, status: result.plan.readiness, requiresApproval: false,
        steps: [{ index: 0, title: "Engineering intent", description: instruction, skillId: "", planningOnly: true,
          parameters: { engineeringPlan: identity, planning: result, certifiedUnderstanding: source.checkpoint, evidenceReceipt: evidenceReceipt(context),
            ...(continuationProvenance ? { planningContinuation: continuationProvenance } : {}),
            contextWarnings: ["Historical verified observations. This plan does not authorize or execute work."], originatingMessageId: `${attemptId}_message` } }] } });
      await tx.conversationMessage.create({ data: { id: `${attemptId}_result`, conversationId, senderId: "agent", senderType: "assistant",
        content: planningMessage(identity, result), metadata: { agentRunId: runId, planningReport: true, planId, planVersion: version, planDigest: identity.digest, outcome, executionPerformed: false } } });
      await tx.agentRun.update({ where: { id: runId }, data: { status: failed ? "FAILED" : "COMPLETED", failureReason: failed ? outcome : null,
        progressPercent: outcome === "PLAN_READY" ? 100 : 0, completedAt: new Date() } });
      await tx.agentRunEvent.create({ data: { id: `${attemptId}_result`, agentRunId: runId, eventType: outcome === "PLAN_READY" ? "PLAN_READY" : "PLAN_VALIDATED", actor: "system",
        payload: { phase: "CHECKPOINT_2", planId, version, digest: identity.digest, outcome, validation: result.plan.validation,
          readinessDiagnostic: result.readinessDiagnostic, providerDiagnostics: context.providerDiagnostics ?? [], executionPerformed: false } } });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return { runId, planId, version, status: result.plan.readiness, digest: identity.digest };
    });
  } catch (error) {
    const diagnostic = planningFailureDiagnostic(error, failureStage);
    // An interrupted or revoked attempt never publishes a ready plan and is never automatically replayed.
    await d.inspections.ledger.transaction(async tx => {
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      if (run?.status !== "PLANNING" || run.planVersion !== version) return;
      await tx.agentRun.update({ where: { id: runId }, data: { status: "FAILED", failureReason: "BLOCKED", completedAt: new Date() } });
      await tx.agentRunEvent.create({ data: { id: `${attemptId}_blocked`, agentRunId: runId, eventType: "PLAN_VALIDATED", actor: "system", payload: { outcome: "BLOCKED", planId, version, diagnostic, executionPerformed: false } } });
    });
    throw error;
  }
}

/** Allowlisted identifiers only; never exception text, response bodies or stacks. */
function planningFailureDiagnostic(error: unknown, stage: string) {
  const provider = diagnosticFromError(error);
  const known = ["CERTIFIED_EVIDENCE_UNAVAILABLE", "PLANNING_CONTRACT_UNAVAILABLE", "UNDERSTANDING_CHANGED", "PLANNING_REQUEST_CHANGED",
    "PLANNING_SOURCE_SCOPE_DENIED", "PLANNING_NOT_PERMITTED", "INSPECTION_SCOPE_DENIED", "WORKSPACE_EVIDENCE_RECEIPT_MISMATCH",
    "WORKSPACE_EVIDENCE_REFERENCE_INVALID", "WORKSPACE_EVIDENCE_EXPIRED_GRANT", "WORKSPACE_EVIDENCE_DENIED",
    "RUNTIME_GRANT_INVALID", "EXPIRED_GRANT", "SESSION_EXPIRED", "SESSION_INVALID"];
  const code = provider?.failureCode && PROVIDER_FAILURE_CODES.includes(provider.failureCode) ? provider.failureCode
    : error instanceof HttpException && known.includes(error.message) ? error.message
    : error instanceof HttpException ? `HTTP_${error.getStatus()}` : "UNCLASSIFIED_EXCEPTION";
  return { code, stage };
}

/** A durable request for a future milestone, deliberately without an execution/approval/permit delegate. */
export async function preparePlanHandoff(d: Pick<Dependencies, "inspections" | "contexts">, claims: SessionClaims, conversationId: string, instruction: string, requestId: string) {
  if (!validToolId(requestId) || !instruction.trim() || instruction.length > 4000) throw new BadRequestException("HANDOFF_REQUEST_INVALID");
  const admitted = await certifiedConversationContext(d, claims, conversationId, "Explain the certified understanding of this project.");
  if (!admitted) throw new ConflictException("CERTIFIED_UNDERSTANDING_REQUIRED");
  const runId = `planning_run_${toolDigest([claims.sub, conversationId])}`, id = `plan_handoff_${toolDigest([claims.sub, conversationId, requestId])}`;
  return d.inspections.ledger.transaction(async tx => {
    const fresh = await d.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
    if (fresh.digest !== admitted.source.digest || fresh.sourceRunId !== admitted.source.sourceRunId) throw new ConflictException("UNDERSTANDING_CHANGED");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
    const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
    const plan = run?.plans?.[0], parameters = plan?.steps?.[0]?.parameters, identity = parameters?.engineeringPlan, result = parameters?.planning;
    if (!run || run.conversationId !== conversationId || run.userId !== claims.sub || run.projectId !== fresh.conversation.projectId ||
      run.status !== "COMPLETED" || !plan || plan.version !== run.planVersion || plan.status !== "PLAN_READY" ||
      !identity || identity.executionEnabled !== false || !result?.plan?.validation?.valid || result.plan.readiness !== "PLAN_READY") throw new ConflictException("PLAN_READY_REQUIRED");
    const { digest, ...identityBase } = identity;
    if (identity.planId !== plan.id || identity.planVersion !== plan.version || digest !== toolDigest({ ...identityBase, summary: plan.summary, result }) ||
      identity.sourceRunId !== fresh.sourceRunId || identity.sourceConversationId !== fresh.sourceConversationId || identity.understandingDigest !== fresh.digest ||
      identity.understandingSequence !== fresh.checkpoint.sequence || toolDigest(identity.evidenceReferences) !== toolDigest(fresh.references) ||
      toolDigest(identity.workspace) !== toolDigest({ workspaceId: fresh.binding.workspaceId, bindingVersion: fresh.binding.version, runtimeId: fresh.binding.runtimeId, runtimeFingerprint: fresh.binding.runtimeFingerprint })) throw new ConflictException("PLAN_SOURCE_CHANGED");
    const requestDigest = toolDigest({ instruction, planId: plan.id, version: plan.version, digest });
    const prior = await tx.agentRunEvent.findUnique({ where: { id } });
    if (prior) {
      if (prior.payload.requestDigest !== requestDigest) throw new ConflictException("HANDOFF_REQUEST_CONFLICT");
      return tx.conversationMessage.findUnique({ where: { id: `${id}_result` } });
    }
    const handoff = { version: 1, handoffId: id, status: "PREPARED_EXECUTION_DISABLED", conversationId, userId: claims.sub,
      organizationId: claims.organizationId, projectId: fresh.conversation.projectId, planId: plan.id, planVersion: plan.version, planDigest: digest,
      sourceRunId: fresh.sourceRunId, understandingDigest: fresh.digest, workspace: identity.workspace,
      executionEnabled: false, executionPerformed: false, authorization: "NOT_GRANTED", requestDigest };
    await tx.agentRunEvent.create({ data: { id, agentRunId: runId, eventType: "PLAN_HANDOFF_PREPARED", actor: claims.sub, payload: handoff } });
    await tx.conversationMessage.create({ data: { id: `${id}_message`, conversationId, senderId: claims.sub, senderType: "user", content: instruction,
      metadata: { planHandoffId: id, clientMessageId: requestId } } });
    const message = await tx.conversationMessage.create({ data: { id: `${id}_result`, conversationId, senderId: "agent", senderType: "assistant",
      content: `Execution handoff prepared for Plan ${plan.id} · Version ${plan.version}\nDigest: ${digest}\nThe exact persisted plan is linked to this request. Execution is not enabled. No approval, permit, file change or terminal operation was created.`,
      metadata: { agentRunId: runId, planHandoff: handoff, executionPerformed: false } } });
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return message;
  });
}

function planningMessage(identity: EngineeringPlanIdentity, result: AgentPlanningResult) {
  return [`${result.plan.readiness} · Plan ${identity.planId} · Version ${identity.planVersion}`,
    result.plan.readiness === "PLAN_READY" ? "Based on the certified understanding and verified workspace context, here is the proposed engineering plan:" : "The plan is not ready. Resolve the recorded gaps before generating a new version.",
    ...result.plan.steps.map((s, i) => `${i + 1}. ${s.objective}\n   Dependencies: ${s.dependencies.join(", ") || "None"}. Verification: ${s.expectedResult}`),
    ...(result.readinessDiagnostic ? result.readinessDiagnostic.requirements.map(m =>
      `Information ${m.id} · ${m.status} · ${m.blocking ? "BLOCKING" : "NON_BLOCKING"} · ${m.source} · ${m.classification} · Steps: ${m.affectedStepIds.join(", ") || (m.blocking ? "Plan-wide" : "No dependent step")}. ${m.description} ${m.whyNeeded}`)
      : result.plan.missingInformation.map(m => `Needs clarification: ${m.description} ${m.whyNeeded}`)),
    ...result.plan.assumptions.map(m => `Unverified limitation: ${m.description}`),
    ...result.plan.validation.issues.map(i => `Validation: ${i.code}`),
    `Source understanding: ${identity.sourceRunId} · checkpoint ${identity.understandingSequence}`,
    `Workspace binding: ${identity.workspace.workspaceId} · version ${identity.workspace.bindingVersion}`,
    "Engineering intent only. No approval, permit, write, terminal command or execution was created."].join("\n\n");
}
