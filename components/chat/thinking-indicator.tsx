"use client"
import { SekhemMark } from "@/components/workspace/sekhem-primitives"
import { useEffect, useState } from "react"
import { Check, Search, Hand, Wrench, ShieldCheck, AlertCircle, Pause, Clock, Sparkles } from "lucide-react"
import { runPhase, workflowPhaseLabel, type AgentRunSummary } from "@/lib/sekhem-agent"

export function ThinkingIndicator({ label = "Responding", stale = false }: { label?: string; stale?: boolean }) {
  return <div className="thinking-indicator response-pending-card" role="status" data-stale={stale || undefined} aria-label={stale ? "Updates unavailable" : label}>
    <span className="response-pending-mark" aria-hidden="true"><SekhemMark size={23} /></span>
    <div className="response-pending-copy"><strong>{stale ? "Updates unavailable" : label}{!stale && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}</strong><span>{stale ? "Showing last saved state" : "Waiting for the model response"}</span></div>
    {!stale && <span className="response-pending-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
  </div>
}

/** Presentation of the existing persisted phase; no timers, optimistic steps or authority. */
export function WorkflowActivityIndicator({ run, stale = false, conversational = false }: { run: AgentRunSummary; stale?: boolean; conversational?: boolean }) {
  const reasoning = run.inspection?.reasoning
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!reasoning || stale) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [reasoning?.startedAt, stale])
  const phase = runPhase(run)
  const reading = !!run.inspection && !run.execution
  const processing = !stale && ["ANALYZING", "UNDERSTANDING", "INSPECTING", "PLANNING", "EXECUTING", "VERIFYING"].includes(phase)
  const waiting = phase === "WAITING_FOR_APPROVAL"
  const attention = ["FAILED", "BLOCKED", "OUTCOME_UNKNOWN"].includes(phase)
  const title = conversational && reading && phase === "INSPECTING" ? "Reading" : conversational && reading && phase === "UNDERSTANDING" && run.inspection?.operations.some(op => op.action.tool === "filesystem.read" && op.verification === "VERIFIED") ? "Grounding" : ({ INSPECTING: "Inspecting", PROPOSAL_READY: "Proposal ready", WAITING_FOR_APPROVAL: "Awaiting approval", EXECUTING: "Executing", VERIFYING: "Verifying", COMPLETED: "Completed", BLOCKED: "Blocked" } as Record<string, string>)[phase] ?? workflowPhaseLabel(phase)
  const Icon = waiting ? Hand : attention ? AlertCircle : phase === "COMPLETED" ? Check : phase === "VERIFYING" ? ShieldCheck : phase === "EXECUTING" ? Wrench : phase === "PAUSED" ? Pause : phase === "QUEUED" ? Clock : reading ? Search : Sparkles
  const reads = run.inspection?.operations.filter(op => op.action.tool === "filesystem.read" && op.verification === "VERIFIED") ?? []
  const activeTarget = run.inspection?.current?.action.relativePath || "workspace root"
  const operationCount = Number.isSafeInteger(run.inspection?.iterations) && Number.isSafeInteger(run.inspection?.maxIterations)
    ? ` · ${run.inspection!.iterations}/${run.inspection!.maxIterations} operations` : ""
  const stepLabels: Record<string, string> = { "filesystem.read": "Read file", "filesystem.list": "Listed folder", "filesystem.search": "Searched files" }
  const detail = stale ? "Last saved state · Live updates unavailable" : waiting ? reading ? "Waiting for you · Review the read request" : "Waiting for you · Review the approval request"
    : reading && phase === "INSPECTING" ? `Read-only inspection · ${activeTarget}` : phase === "UNDERSTANDING" ? reading
      ? `${reads.length ? `Analyzing ${reads.length} verified source read(s)` : "Choosing the next source"}${operationCount}`
      : "Checking findings against saved evidence" : phase === "PROPOSAL_READY" ? "No change executed"
    : phase === "PLAN_READY" ? "Planning finished · No proposal inferred" : phase === "BLOCKED" ? "Needs attention · Open details"
    : phase === "FAILED" ? run.inspection?.code === "OUTPUT_TRUNCATED" ? "Output truncated · Inspection incomplete" : "Stopped · Open details"
    : phase === "OUTCOME_UNKNOWN" ? "Review the saved result before continuing" : phase === "COMPLETED" ? reading ? "Grounded understanding saved" : "Result verified and saved" : undefined
  return <div className={`workflow-activity ${reading ? "is-reading" : ""} ${waiting || attention || stale ? "needs-attention" : ""} ${processing ? "is-processing" : ""}`} role="status" aria-live="polite" aria-atomic="true" data-phase={phase} data-activity={reading ? "read" : run.execution ? "execution" : "workflow"} data-stale={stale || undefined}>
    <span className="workflow-activity-icon" aria-hidden="true"><Icon size={15} /></span>
    <div><span className="workflow-activity-title">{title}</span>{detail && <span className="workflow-activity-detail">{detail}</span>}
      {reasoning && !stale && <span className="workflow-activity-detail" aria-live="off">Model response pending · {Math.max(0, Math.floor((now - reasoning.startedAt) / 1000))}s elapsed</span>}
      {!!run.inspection?.operations.length && <details className="recorded-progress-details"><summary>Recorded steps · {run.inspection.operations.length}</summary><ol>{run.inspection.operations.slice(-4).map((operation, index) => <li key={index}><span>{stepLabels[operation.action.tool] ?? "Recorded operation"}</span><span>{operation.action.relativePath || "workspace root"}</span><strong>{operation.verification}</strong></li>)}</ol>{run.inspection.operations.length > 4 && <small>Latest 4 recorded steps</small>}</details>}</div>
    {processing && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}
  </div>
}
