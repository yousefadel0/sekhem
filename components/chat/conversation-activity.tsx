import React from "react"
import type { ConversationMessageDto } from "@/lib/sekhem-conversation"
import type { AgentRunSummary, AgentRunDetail } from "@/lib/sekhem-agent"

export function isRoutineHistory(message: ConversationMessageDto, runs: AgentRunSummary[], details: Record<string, AgentRunDetail>) {
  if (message.metadata?.runtimeAction !== true || typeof message.metadata.agentRunId !== "string") return false
  const run = runs.find(r => r.id === message.metadata.agentRunId)
  if (!run || run.status !== "COMPLETED" || !/^Workspace (verify|list|read|search) · /.test(run.title)) return false
  const detail = details[run.id]
  if (detail && (detail.id !== run.id || detail.planVersion !== run.planVersion)) return false
  const receipt = detail?.runtimeActionReceipt ?? run.runtimeActionReceipt
  if (receipt && (receipt.state !== "SUCCEEDED" || receipt.verificationState !== "VERIFIED")) return false
  if (detail?.failureReason || detail?.outcome && detail.outcome !== "COMPLETED") return false
  return !run.execution && !run.workflow && !run.inspection && !detail?.execution && !detail?.workflow && !detail?.inspection &&
    !("pendingApprovals" in run && Array.isArray(run.pendingApprovals) && run.pendingApprovals.length) && !detail?.pendingApprovals?.length && (!run.outcome || run.outcome === "COMPLETED")
}

export function ConversationActivity({ messages, routine, renderMessage }: { messages: ConversationMessageDto[]; routine: (message: ConversationMessageDto) => boolean; renderMessage: (message: ConversationMessageDto, index: number) => React.ReactNode }) {
  const completedReports = messages.filter(message => message.senderType === "assistant" && message.metadata?.inspectionReport === true && message.metadata.outcome === "COMPLETED" && typeof message.metadata.agentRunId === "string")
  const completedRuns = new Set(completedReports.map(message => message.metadata.agentRunId))
  const sections: Array<{ grouped: boolean; rows: Array<{ message: ConversationMessageDto; index: number }> }> = []
  messages.forEach((message, index) => {
    const finalizedProgress = message.senderType === "assistant" && message.id.startsWith("inspection_reply_") &&
      message.metadata?.modelConversation === true && message.metadata.outcome === "IN_PROGRESS" &&
      message.metadata.answerPresentation !== "EVIDENCE_LIMITED" && completedRuns.has(message.metadata.agentRunId) &&
      (!message.metadata.grounding || completedReports.some(report => report.metadata.agentRunId === message.metadata.agentRunId && report.content === message.content))
    const grouped = routine(message) || finalizedProgress, previous = sections.at(-1)
    if (grouped && previous?.grouped) previous.rows.push({ message, index })
    else sections.push({ grouped, rows: [{ message, index }] })
  })
  return <>{sections.map(section => section.grouped ? <details key={section.rows[0].message.id} className="rounded border-l border-border/30 px-3 py-2 text-xs text-muted-foreground" aria-label="Historical workspace activity">
    <summary className="cursor-pointer focus-visible:outline focus-visible:outline-1">Saved workspace activity · {section.rows.length} records · Details</summary>
    <div className="mt-2 space-y-2">{section.rows.map(row => <React.Fragment key={row.message.id}>{renderMessage(row.message, row.index)}</React.Fragment>)}</div>
  </details> : <React.Fragment key={section.rows[0].message.id}>{renderMessage(section.rows[0].message, section.rows[0].index)}</React.Fragment>)}</>
}
