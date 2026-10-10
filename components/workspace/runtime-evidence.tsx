"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { createSnapshotPoller, snapshotFailure } from "@/lib/snapshot-polling"
import { getRuntimeEvidence, requestRuntimeEvidence, type RuntimeEvidenceReference, type RuntimeEvidenceState, type RuntimeEvidenceView, type RuntimeWorkspaceBinding } from "@/lib/sekhem-agent"
import { SekhemApiError } from "@/lib/sekhem-api"
import { RuntimeEvidenceProvenance } from "@/components/chat/agent-run-card"
import { TrustedRuntimeExecutionCard } from "./trusted-runtime-control"

export const evidenceStateLabels: Record<RuntimeEvidenceState, string> = {
  PENDING: "Evidence request pending", APPROVAL_REQUIRED: "Approval required", EXECUTING: "Runtime reading",
  VERIFIED: "Verified evidence", TRUNCATED: "Verified evidence · truncated", UNAVAILABLE: "Evidence unavailable",
  DENIED: "Evidence denied", FAILED: "Evidence failed", STALE: "Stale evidence binding"
}
export const canAnalyzeEvidence = (view: RuntimeEvidenceView | null) => !!view?.reference && !view.historical && ["VERIFIED", "TRUNCATED"].includes(view.state)
export function RuntimeEvidenceStatus({ state }: { state: RuntimeEvidenceState }) { return <p role="status">{evidenceStateLabels[state]}</p> }

export function RuntimeEvidenceAction({ binding, relativePath, ensureConversation, onAnalyze, readAuthorized }: {
  readAuthorized?: boolean;
  binding: RuntimeWorkspaceBinding; relativePath: string; ensureConversation: (binding?: RuntimeWorkspaceBinding) => Promise<string>;
  onAnalyze: (instruction: string, reference: RuntimeEvidenceReference) => Promise<void>
}) {
  const [view, setView] = useState<RuntimeEvidenceView | null>(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null), [state, setState] = useState<RuntimeEvidenceState | null>(null)
  const [instruction, setInstruction] = useState("Summarize this file.")
  const polling = useRef<ReturnType<typeof createSnapshotPoller> | null>(null)
  const failure = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Runtime evidence unavailable")
    setState(e instanceof SekhemApiError && [401, 403].includes(e.status) ? "DENIED" : "UNAVAILABLE")
  }
  const refresh = useCallback(async () => {
    await polling.current?.refresh()
  }, [binding.workspaceId, binding.version, view?.request.requestId])
  useEffect(() => {
    if (!view) return
    let active = true
    const poller = createSnapshotPoller({ intervalMs: 2000, read: async () => {
      const next = await getRuntimeEvidence(binding, view.request.requestId)
      if (active) { setView(next); setState(next.state); setError(null) }
      return ["PENDING", "APPROVAL_REQUIRED", "EXECUTING"].includes(next.state)
    }, onError: (e, stopped) => { if (active) { failure(e); setError(`${snapshotFailure(e).message}${stopped ? " Automatic refresh paused." : " Retrying temporarily."}`) } } })
    polling.current = poller; void poller.refresh()
    return () => { active = false; poller.stop() }
  }, [binding.workspaceId, binding.version, view?.request.requestId])
  const request = async () => {
    setBusy(true); setError(null); setState("PENDING")
    try { const next = await requestRuntimeEvidence(binding, await ensureConversation(binding), relativePath); setView(next); setState(next.state) }
    catch (e) { failure(e) } finally { setBusy(false) }
  }
  return <section className="rounded border border-border/50 p-3 space-y-3 text-xs" aria-label="Ask Agent about runtime file">
    <p>Opening this file does not add Agent evidence. {readAuthorized ? "Ask Agent requests a fresh read under the Workspace Read Grant; evidence admission is checked separately." : "Ask Agent requests a fresh read that requires approval."}</p>
    <button type="button" className="technical-button" disabled={busy || !!state && ["PENDING", "APPROVAL_REQUIRED", "EXECUTING"].includes(state)} onClick={() => void request()}>{view ? readAuthorized ? "Request fresh evidence" : "Request fresh evidence · approval required" : readAuthorized ? "Ask Agent" : "Ask Agent · approval required"}</button>
    {state && <RuntimeEvidenceStatus state={state} />}{error && <p role="alert">{error}{view && <button type="button" onClick={() => void refresh()}>Refresh evidence status</button>}</p>}
    {view?.operation && ["APPROVAL_REQUIRED", "EXECUTING"].includes(state ?? "") && <TrustedRuntimeExecutionCard runId={view.operation.runId} showOutput={false} onChanged={refresh} />}
    {view?.reference && <><p>{view.historical || error ? "Historical receipt only; unavailable for new analysis." : "Verified observation; context admission will recheck authorization."}</p><details><summary>Evidence provenance</summary><RuntimeEvidenceProvenance reference={view.reference} /></details></>}
    {canAnalyzeEvidence(view) && !error && <><label className="block">Agent request<input className="block w-full bg-surface-2 p-2" aria-label="Runtime file Agent request" value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
      <button type="button" className="technical-button" disabled={busy || !instruction.trim()} onClick={() => void (async () => {
        setBusy(true); try { await onAnalyze(instruction, view!.reference!) } catch (e) { failure(e) } finally { setBusy(false) }
      })()}>Send to Agent</button></>}
  </section>
}
