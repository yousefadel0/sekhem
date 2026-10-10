"use client"
import { useEffect, useRef, useState } from "react"
import type { DownstreamWorkflowView } from "@/backend/src/conversation/workflow-presentation.contract"
import { approveExactAction, approvalPresentation, approveWithConsent, consentPresentation, revokeSelectedConsent } from "@/lib/exact-proposal-approval"
const labels: Record<string, string> = { NOT_REQUESTED: "Ready for your approval", PENDING: "Waiting for your approval", APPROVED: "Approved · Execution is a separate stage", DENIED: "Approval declined", CANCELLED: "Approval cancelled", EXPIRED: "Approval expired", STALE: "Approval no longer valid", INVALID: "Approval no longer valid" }
const consentLabels: Record<string, string> = { ACTIVE: "Consent active", EXPIRED: "Consent expired · Renew explicitly", REVOKED: "Consent revoked", SUPERSEDED: "Previous consent replaced", STALE: "Consent no longer valid · Review required", INVALID: "Consent invalid · Review required", AMBIGUOUS: "Choose task or session consent explicitly", UNAVAILABLE: "Consent status unavailable · Refresh required", AVAILABLE: "Eligible actions can use bounded consent" }
export function ExactProposalApprovalCard({ conversationId, workflow, stale = false, onChanged }: { conversationId: string; workflow: DownstreamWorkflowView; stale?: boolean; onChanged?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const lock = useRef(false), request = useRef<string | null>(null), current = useRef({ workflow, stale, conversationId }), mounted = useRef(true)
  current.current = { workflow, stale, conversationId }
  const presentation = approvalPresentation(workflow, stale)
  const consent = consentPresentation(workflow, stale)
  const [, tick] = useState(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => { setError(false); request.current = null }, [conversationId, workflow.proposal.id, workflow.approval?.id, workflow.observedAt])
  const approve = async (type: "ACTION" | "TASK" | "SESSION" | "REVOKE" = "ACTION") => {
    const now = current.current
    if (lock.current || (type === "ACTION" ? !approvalPresentation(now.workflow, now.stale).canApprove : type === "REVOKE" ? !consentPresentation(now.workflow, now.stale).canRevoke : !consentPresentation(now.workflow, now.stale).canConsent)) return
    lock.current = true; setBusy(true); setError(false)
    request.current ??= `exact-approval-${crypto.randomUUID()}`
    const valid = (approvalId?: string) => mounted.current && current.current.conversationId === conversationId && !current.current.stale && current.current.workflow.proposal.id === workflow.proposal.id && current.current.workflow.proposal.digest === workflow.proposal.digest && (current.current.workflow.approval?.id === workflow.approval?.id || current.current.workflow.approval?.id === approvalId) && JSON.stringify(current.current.workflow.consent?.selected) === JSON.stringify(workflow.consent?.selected)
    try {
      if (type === "ACTION") await approveExactAction(conversationId, now.workflow, request.current, now.stale, undefined, valid)
      else if (type === "REVOKE") await revokeSelectedConsent(conversationId, now.workflow, now.stale, undefined, valid)
      else await approveWithConsent(conversationId, now.workflow, type, request.current, now.stale, undefined, valid)
    }
    catch { if (mounted.current && current.current.conversationId === conversationId) setError(true) }
    finally { if (mounted.current && current.current.conversationId === conversationId) { try { await onChanged?.() } catch { setError(true) }; setBusy(false) }; lock.current = false }
  }
  return <section className="rounded border border-border/50 p-3 space-y-2 text-sm" aria-label="Exact proposal approval">
    <h4>{["NOT_REQUESTED", "PENDING"].includes(presentation.state) ? "Review this exact change" : labels[presentation.state] ?? "Approval unavailable"}</h4>
    {workflow.proposal.changes?.map(c => <div key={c.path}><h5 className="font-mono text-xs break-all" dir="ltr">{c.path}</h5><div className="grid gap-2 sm:grid-cols-2" aria-label={`Exact change in ${c.path}`}>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">Before</p><pre dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 text-xs">{c.before}</pre></div>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">After</p><pre dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 text-xs">{c.after}</pre></div>
    </div></div>)}
    <p>Preserved: content outside the exact replacement.</p>
    <p>Verification: {workflow.proposal.verification?.length ? workflow.proposal.verification.join(" · ") : "Consult the persisted proposal verification details."}</p>
    <p role="status">{labels[presentation.state] ?? "Approval unavailable"}</p>
    {stale && <p>Showing saved state · Refresh before approving.</p>}
    {workflow.approval?.deadline && <p className="text-xs">Approval deadline: {new Date(workflow.approval.deadline).toLocaleString()}</p>}
    {["NOT_REQUESTED", "PENDING", "EXPIRED"].includes(presentation.state) && <button type="button" disabled={!presentation.canApprove || busy || error} onClick={() => void approve()}>{busy ? "Saving your decision…" : presentation.state === "EXPIRED" ? "Renew and approve this action" : "Approve this action"}</button>}
    {workflow.consent && <div className="space-y-2">
      {workflow.consent.selected && <p>{workflow.consent.selected.type === "TASK" ? "Task consent selected" : "Session consent selected"} · {consentLabels[consent.state]}</p>}
      {!workflow.consent.selected && <p>{consentLabels[consent.state]}</p>}
      {workflow.consent.selected && <p className="text-xs">Consent ends: {new Date(workflow.consent.selected.reference.expiresAt).toLocaleString()}</p>}
      {workflow.consent.eligible && <details><summary>Approval options</summary><div className="flex gap-2 flex-wrap py-2">
        <button type="button" disabled={!consent.canConsent || busy || error} onClick={() => void approve("TASK")}>{["EXPIRED", "REVOKED", "SUPERSEDED"].includes(consent.state) ? "Renew approval for this task" : "Approve for this task"}</button>
        <button type="button" disabled={!consent.canConsent || busy || error} onClick={() => void approve("SESSION")}>{["EXPIRED", "REVOKED", "SUPERSEDED"].includes(consent.state) ? "Renew approval for this session" : "Approve for this session"}</button>
      </div><p className="text-xs">Task consent covers eligible actions in this exact plan only. Session consent also requires this conversation and the same signed-in session. Both last up to 15 minutes; session consent may end earlier. Neither covers future plans or grants file access.</p></details>}
      {!workflow.consent.eligible && workflow.consent.state !== "UNAVAILABLE" && <p className="text-xs">These actions require individual approval; bounded consent is unavailable.</p>}
      {workflow.consent.selected && <button type="button" disabled={!consent.canRevoke || busy || error} onClick={() => void approve("REVOKE")}>Revoke consent</button>}
    </div>}
    {error && <p role="alert">Approval could not be confirmed. Refresh the saved state before trying again.</p>}
    <p className="text-xs text-muted-foreground">Approval records your decision only. A separate permit and authorized execution are still required.</p>
    <details className="text-xs break-all"><summary>Technical provenance</summary><p>Proposal {workflow.proposal.id} · Version {workflow.proposal.version}</p><p>{workflow.proposal.digest}</p>{workflow.approval && <p>Approval {workflow.approval.id} · Generation {workflow.approval.generation}</p>}</details>
  </section>
}
