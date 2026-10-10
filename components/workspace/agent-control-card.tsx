"use client"
import { capabilityLabel, capabilityDescription } from "@/lib/workspace-presentation"
import { useState } from "react"
import { postSekhemApi } from "@/lib/sekhem-api"
import { controlLabel, runActivity, setWorkspaceReadGrant, type AgentRunDetail } from "@/lib/sekhem-agent"
import { TechnicalPanel } from "./sekhem-primitives"
import { TrustedRuntimeExecutionCard } from "./trusted-runtime-control"
import { AgentInspectionCard } from "./agent-inspection-card"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"
import { RECOVERY_ERRORS } from "@/backend/src/common/recovery-errors"
import { ApprovalActions } from "./approval-actions"

/** Buttons submit exact persisted fingerprints; only the refreshed server snapshot changes state. */
export function AgentControlCard({ run, onChanged, runtime }: { runtime?: WorkspaceRuntimeState; run?: AgentRunDetail; onChanged?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const control = run?.control
  if (run?.execution) return <section aria-label="Plan execution">
    <p>{runActivity(run)}</p>
    <p>{run.execution.completedSteps} of {run.execution.totalSteps} steps verified</p>
    {run.execution.reason && <p role="status">{RECOVERY_ERRORS[run.execution.reason] ?? run.execution.reason.replaceAll("_", " ").toLowerCase()}</p>}
    {run.execution.changes.map(change => <details key={change.path} open={run.execution?.status === "AWAITING_APPROVAL"}>
      <summary>{change.path} · Proposed change</summary><h4>Before</h4><pre>{change.before}</pre><h4>After</h4><pre>{change.after}</pre>
    </details>)}
    {run.execution.status !== "PREPARING" && run.execution.status !== "BLOCKED" && <TrustedRuntimeExecutionCard runId={run.id} activePlan={["RUNNING", "AWAITING_APPROVAL"].includes(run.execution.status)} onChanged={onChanged} />}
  </section>
  if (run?.inspection) return <AgentInspectionCard key={run.id} runtime={runtime} run={run} onChanged={onChanged} />
  if (run?.id.startsWith("rtrun_")) return <TrustedRuntimeExecutionCard runId={run.id} onChanged={onChanged} />
  if (!run || !control) return null
  const proposal = control.proposal
  const submit = async (suffix: string, body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      await postSekhemApi(`/agent-runs/${encodeURIComponent(run.id)}/${suffix}`, body, { throwOnError: true })
      await onChanged?.()
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Control operation failed") }
    finally { setBusy(false) }
  }
  const active = ["COMPLETED", "AWAITING_APPROVAL"].includes(run.status)
  const pending = active && control.state === "AWAITING_APPROVAL" && control.approvalId && control.approvalFingerprint
  const canCheck = active && ["ACTION_PROPOSED", "APPROVED"].includes(control.state) && proposal?.preview.available
  return <TechnicalPanel className="section-page" label="Action approval and execution boundary">
    <div className="empty-kicker">ACTION REVIEW</div><h2>{controlLabel(control)}</h2>
    {proposal ? <><dl className="approval-receipt"><dt>Action</dt><dd>{capabilityLabel(proposal.toolId)}</dd>
      <dt>Target</dt><dd>{proposal.scope.paths.join(", ")}</dd>
      <dt>Reason</dt><dd>{capabilityDescription(proposal.purpose)}</dd>
      </dl>
      <p>{proposal.preview.available ? capabilityDescription(proposal.preview.description) : "Detailed execution preview unavailable"}</p>
      <details><summary>Authorization details</summary><p>{proposal.purpose}</p><p>{proposal.preview.description}</p><p>Tool {proposal.toolId} · {proposal.toolVersion}</p><p>{proposal.effect} · {proposal.risk}</p><p>Plan {proposal.planId} · v{proposal.planVersion} · {proposal.planStepId}</p><p>Workspace {proposal.scope.workspaceId} · {proposal.workspaceBindingVersion}</p><p>Proposal {proposal.proposalDigest}</p></details></> :
      <p>{control.code === "DETAILED_EXECUTION_PREVIEW_UNAVAILABLE" ? "Detailed execution preview unavailable" : "A single grounded inspection action is required before authorization can be checked."}</p>}
    {error && <p role="alert" className="workspace-notice">{error}</p>}
    {pending && proposal?.preview.available && <ApprovalActions disabled={busy || !!error}
      state={controlLabel(control)}
      purpose={capabilityDescription(proposal.purpose)}
      target={proposal.scope.paths.join(", ") || undefined}
      reason={capabilityDescription(proposal.preview.description)}
      onApprove={() => submit(`tool-approvals/${encodeURIComponent(control.approvalId!)}/decision`, { decision: "APPROVED", fingerprint: control.approvalFingerprint })}
      onReject={() => submit(`tool-approvals/${encodeURIComponent(control.approvalId!)}/decision`, { decision: "DENIED", fingerprint: control.approvalFingerprint })}
      onCancel={() => submit("cancel", {})}
      {...(runtime?.binding && runtime.grant ? {
        // Existing bounded Workspace Read Grant consent (list/search/read, ≤60 min) and its revoke endpoint.
        onAlwaysAllow: async () => { await setWorkspaceReadGrant(runtime.binding!, runtime.grant!.version ?? 0); await onChanged?.() },
        onAskEveryTime: async () => { await setWorkspaceReadGrant(runtime.binding!, runtime.grant!.version ?? 0, true); await onChanged?.() }
      } : {})} />}
    {canCheck && <div className="workspace-starters"><button type="button" disabled={busy} onClick={() => void submit("decision", { proposalDigest: proposal!.proposalDigest })}>Check current access</button>
      {control.state === "ACTION_PROPOSED" && <button type="button" disabled={busy} onClick={() => void submit("decision", { proposalDigest: proposal!.proposalDigest, requestApproval: true })}>Request human review</button>}</div>}
    {control.intent && <details><summary>Authorization record</summary><p className="panel-caption">Intent: {control.intent.intentId} · {control.intent.status}<br />Expires {new Date(control.intent.expiresAt).toLocaleString()}</p></details>}
    {!["CANCELLED", "FAILED"].includes(run.status) && <button type="button" className="technical-button" disabled={busy} onClick={() => void submit("cancel", {})}>Cancel control request</button>}
    <p className="execution-boundary">{control.executionPerformed ? "Consult the execution receipt for the verified result." : "No action has executed. Approval and current Runtime authorization are required before dispatch."}</p>
  </TechnicalPanel>
}
