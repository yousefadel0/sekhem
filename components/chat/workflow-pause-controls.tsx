"use client"
import { useRef, useState } from "react"
import { postSekhemApi } from "@/lib/sekhem-api"
import { workflowControlState, type AgentRunSummary } from "@/lib/sekhem-agent"
export function WorkflowPauseControls({ run, stale, onChanged }: { run: AgentRunSummary; stale?: boolean; onChanged?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const state = workflowControlState(run)
  if (!run.inspection && !run.execution || !["RUNNING", "AWAITING_APPROVAL", "PAUSE_REQUESTED", "PAUSED"].includes(state)) return null
  // A coarse PAUSED status is truthful, but resuming also needs the saved ledger revision.
  const missingPauseReference = state === "PAUSED" && run.workflowPause?.state !== "PAUSED"
  if (missingPauseReference && run.inspection?.state === "AWAITING_INPUT") return <section className="space-y-1 text-xs" aria-label="Workflow pause controls">
    <p role="status">Inspection stopped · Review the last response and diagnostics before continuing in Chat.</p>
    {onChanged && <button type="button" disabled={busy} onClick={() => void onChanged()}>Refresh saved status</button>}
  </section>
  async function submit(resume: boolean) {
    if (stale || lock.current || missingPauseReference || state === "PAUSE_REQUESTED" || error) return
    lock.current = true; setBusy(true); setError(null)
    try { await postSekhemApi(`/agent-runs/${encodeURIComponent(run.id)}/${resume ? "resume" : "pause"}`, { requestId: `control-${crypto.randomUUID()}`, expectedRevision: run.workflowPause?.revision ?? 0 }, { throwOnError: true }); await onChanged?.() }
    catch { setError("Control could not be confirmed. Refresh the saved state before continuing.") }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="space-y-1 text-xs" aria-label="Workflow pause controls">
    <p role="status">{state === "PAUSE_REQUESTED" ? "Pause requested · waiting for the admitted operation to finish safely" : state === "PAUSED" ? run.workflowPause?.resumeStatus === "AWAITING_APPROVAL" ? "Paused · Resume returns to awaiting approval" : "Paused · Resume revalidates saved authority" : state === "AWAITING_APPROVAL" ? "Awaiting approval · the saved approval boundary is preserved" : "Workflow active"}</p>
    <button type="button" disabled={stale || busy || missingPauseReference || state === "PAUSE_REQUESTED" || !!error} onClick={() => void submit(state === "PAUSED")}>{state === "PAUSED" ? "Resume" : "Pause / Stop"}</button>
    {missingPauseReference && <><p>{run.inspection?.state === "AWAITING_INPUT" ? "More information is needed. Continue in the conversation." : "Access needs to be revalidated."}</p>{onChanged && <button type="button" disabled={busy} onClick={() => void onChanged()}>Refresh saved status</button>}<details><summary>Diagnostics</summary>Refresh the saved control reference before resuming.</details></>}
    <p>Completed steps and receipts are retained. Resume rechecks authority and never repeats a write.</p>
    {error && <p role="alert">{error}</p>}
  </section>
}
