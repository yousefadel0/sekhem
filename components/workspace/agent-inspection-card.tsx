"use client"
import { capabilityLabel, capabilityDescription } from "@/lib/workspace-presentation"
import { useState } from "react"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"
import { inspectionLabel, runActivity, setWorkspaceReadGrant, type AgentRunDetail, type WorkspaceOperationView } from "@/lib/sekhem-agent"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"
import { ApprovalActions } from "./approval-actions"
import { TechnicalPanel, SavedObservationStatus } from "./sekhem-primitives"

/** Approval submits only the persisted proposal version/fingerprint. Evidence viewing never dispatches work. */
export function AgentInspectionCard({ run, onChanged, runtime }: { runtime?: WorkspaceRuntimeState; run: AgentRunDetail; onChanged?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [observation, setObservation] = useState<WorkspaceOperationView | null>(null)
  const [comment, setComment] = useState("")
  const loop = run.inspection
  if (!loop) return null
  const available = runtime ? runtime.bindingStatus === "READY" && runtime.binding?.workspaceId === loop.workspace.workspaceId && runtime.binding.version === loop.workspace.bindingVersion && runtime.binding.runtimeId === loop.workspace.runtimeId : undefined
  const current = loop.current, terminal = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(loop.state)
  const submit = async (decision?: "APPROVED" | "DENIED" | "SKIPPED") => {
    setBusy(true); setError(null)
    try {
      await postSekhemApi(`/agent-runs/${encodeURIComponent(run.id)}/${decision ? "inspection/decision" : "cancel"}`,
        decision && current ? { planVersion: current.planVersion, fingerprint: current.fingerprint, decision, comment } : {}, { throwOnError: true })
      setComment("")
      await onChanged?.()
    } catch (e) { setError(e instanceof Error ? e.message : "Inspection control unavailable") }
    finally { setBusy(false) }
  }
  const inspect = async (op: typeof loop.operations[number]) => {
    setBusy(true); setError(null); setObservation(null)
    try {
      const result = await fetchSekhemApi<{ view: WorkspaceOperationView | null }>(`/projects/${encodeURIComponent(run.projectId)}/workspace/bindings/${encodeURIComponent(loop.workspace.workspaceId)}/${op.action.tool === "filesystem.read" ? "file" : "tree"}?version=${loop.workspace.bindingVersion}&path=${encodeURIComponent(op.action.relativePath)}&operationId=${encodeURIComponent(op.request.operationId)}`, { throwOnError: true })
      if (!result?.view) throw new Error("Saved observation unavailable")
      setObservation(result.view)
    } catch (e) { setError(e instanceof Error ? e.message : "Evidence unavailable") }
    finally { setBusy(false) }
  }
  return <details className="text-xs" open={loop.state === "AWAITING_APPROVAL"}><summary>Agent Activity · {loop.operations.filter(op => op.action.tool === "filesystem.read" && op.verification === "VERIFIED").length} verified source read(s) · {runActivity(run)}</summary><TechnicalPanel className="section-page" label="Agent workspace inspection">
    <h2>{runActivity(run)}</h2>
    <p>{loop.workspace.name}</p>
    {["FAILED", "PARTIAL"].includes(loop.state) && loop.code && <p role="status">Inspection diagnostic: {loop.code.toLowerCase().replace(/_/g, " ")}</p>}
    {loop.understanding && <p>{loop.understanding.status === "INTERMEDIATE" ? "Intermediate findings" : loop.understanding.status === "PARTIAL" ? "Incomplete understanding" : "Grounded understanding of inspected scope"} saved in this conversation. This is not execution approval.</p>}
    {current && !terminal && <dl className="approval-receipt">
      <dt>Operation</dt><dd>{capabilityLabel(current.action.tool)}</dd><dt>Target</dt><dd>{current.action.relativePath || "Workspace root"}</dd>
      {current.action.query && <><dt>Search</dt><dd>{current.action.query}</dd></>}
      <dt>Purpose</dt><dd>{capabilityDescription(current.action.purpose)}</dd><dt>Scope</dt><dd>Read-only workspace inspection</dd>

    </dl>}
    {current && <details className="workspace-advanced"><summary>Inspection details</summary><p>Tool {current.action.tool}</p><p>Runtime {loop.workspace.runtimeId}<br />Binding {loop.workspace.workspaceId} · v{loop.workspace.bindingVersion}<br />Proposal {current.proposalId} · Plan v{current.planVersion}</p></details>}
    {current && loop.state === "AWAITING_APPROVAL" && <>
      <label>Comment or instruction<textarea aria-label="Inspection approval comment" value={comment} onChange={e => setComment(e.target.value)} maxLength={4000} /></label>
      <ApprovalActions disabled={busy || !!error || !!run.workflowPause && run.workflowPause.state !== "RUNNING"}
        state={inspectionLabel(loop.state)}
        purpose={`${capabilityLabel(current.action.tool)}${current.action.query ? ` · ${current.action.query}` : ""}`}
        target={current.action.relativePath || "Workspace root"}
        reason={capabilityDescription(current.action.purpose)}
        onApprove={() => submit("APPROVED")}
        onReject={() => submit("DENIED")}
        onSkip={() => submit("SKIPPED")}
        onCancel={() => submit()}
        {...(runtime?.binding && runtime.grant ? {
          // Existing bounded Workspace Read Grant consent (list/search/read, ≤60 min) and its revoke endpoint.
          onAlwaysAllow: async () => { await setWorkspaceReadGrant(runtime.binding!, runtime.grant!.version ?? 0); await onChanged?.() },
          onAskEveryTime: async () => { await setWorkspaceReadGrant(runtime.binding!, runtime.grant!.version ?? 0, true); await onChanged?.() }
        } : {})} />
    </>}
    {!terminal && <p>Continue in Chat to ask questions or change direction. A message does not approve an action.</p>}
    {!terminal && <button type="button" className="technical-button" disabled={busy} onClick={() => void submit()}>Cancel inspection</button>}
    {error && <p className="workspace-notice" role="alert">{error}</p>}
    <details className="workspace-advanced"><summary>Inspected files & verification details</summary><ol className="run-files" aria-label="Inspection operations">{loop.operations.map(op => <li key={op.request.operationId} className="artifact-receipt">
      <strong>{op.action.tool} · {op.action.relativePath || "Workspace root"}</strong><span>{op.state}</span>
      <p>Runtime {op.request.runtimeId}<br />Receipt {op.receiptId ?? "Not recorded"}<br />Verification: {op.verification ?? "Not verified"}</p>
      {op.workspaceRead && <p>Authorized by Workspace Read Grant · {op.workspaceRead.consent.workspaceId} · {op.workspaceRead.consent.rootPath} · Binding v{op.workspaceRead.consent.bindingVersion} · Grant v{op.workspaceRead.grantVersion}{op.workspaceRead.consent.expiresAt && ` · Recorded expiry ${new Date(op.workspaceRead.consent.expiresAt).toLocaleString()}`}</p>}
      {op.verification === "VERIFIED" && <button type="button" className="technical-button" disabled={busy} onClick={() => void inspect(op)}>Inspect evidence</button>}
    </li>)}</ol><p>Receipt verification establishes the observation; it does not verify the entire engineering objective.</p></details>
    {observation && <section aria-label="Saved runtime observation"><h3>Saved observation</h3>
      {observation.receipt && <SavedObservationStatus receipt={observation.receipt} available={available} />}
      <p className="panel-caption">{observation.receipt?.truncated ? "Partial observation · Truncated" : "Saved observation"}</p><details><summary>Receipt details</summary>{observation.receipt?.receiptId} · {observation.receipt?.observedAt}</details>
      {observation.message && <p>{observation.message}</p>}
      {available !== false ? <pre className="whitespace-pre-wrap break-words text-xs">{observation.file?.text ?? JSON.stringify(observation.matches ?? observation.entries ?? [], null, 2)}</pre> : <p>Historical receipt retained. Content is unavailable under current Workspace access.</p>}
    </section>}
    {loop.understanding?.grounding && <details><summary>Grounding diagnostics</summary><p>Checkpoint {loop.understanding.sequence} · {loop.understanding.status}</p><ul>{loop.understanding.grounding.claims.map((claim, i) => <li key={i}>Finding {i + 1}: {claim.status}{claim.reason ? ` · ${claim.reason}` : ""}</li>)}</ul></details>}
    <p className="execution-boundary">{loop.executionVerified} observations verified. {loop.objectiveGrounded ? "Grounded report saved in this conversation." : "Engineering objective not yet completed."}</p>
  </TechnicalPanel></details>
}
