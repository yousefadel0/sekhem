import { approvalPresentation } from "@/lib/exact-proposal-approval"
import { runPhase, type AgentRunSummary } from "@/lib/sekhem-agent"

/** A view of saved workflow state. Never submits, approves, or resumes work. */
export function WorkflowContinuationNotice({ run, stale = false }: { run: AgentRunSummary; stale?: boolean }) {
  if (!run.workflow) return null
  const phase = runPhase(run)
  const approval = approvalPresentation(run.workflow, stale)
  let title: string, description: string
  if (stale) {
    title = "Saved proposal · Updates unavailable"
    description = "Refresh the saved workflow before approving or continuing. Nothing is resubmitted on reconnect."
  } else if (run.execution || ["FAILED", "BLOCKED", "OUTCOME_UNKNOWN", "PAUSED", "PAUSE_REQUESTED", "CANCELLED", "SKIPPED"].includes(phase) || run.workflowDecision) {
    title = phase === "COMPLETED" ? "This change is verified" : phase === "EXECUTING" ? "Continuing the approved workflow" : phase === "VERIFYING" || phase === "READING_BACK" ? "Checking the saved execution result" : "Saved workflow · Review current activity"
    description = phase === "COMPLETED" ? "The result and verification are saved in this conversation. No repeat execution is needed." : "The activity above reflects the existing workflow. Review its saved result before taking another action."
  } else if (approval.state === "APPROVED") {
    title = "Approval recorded · Execution not yet confirmed"
    description = "Continue through the existing workflow controls. The server must still validate authority and the one-use permit; approval alone is not execution success."
  } else if (["NOT_REQUESTED", "PENDING"].includes(approval.state) && run.workflow.permit?.state !== "CONSUMED") {
    title = "Human approval required"
    description = "Your exact proposal is saved here. Proceed opens approval review. Messages such as نفّذ, موافق or Proceed continue the conversation; they do not grant authorization."
  } else {
    title = "Approval needs review"
    description = "The saved approval or proposal is not ready to continue. Review the recorded state; no approval is inferred from chat history."
  }
  return <aside className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm" aria-label="Workflow continuation" aria-live="polite">
    <p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>
  </aside>
}
