import { postSekhemApi, deleteSekhemApi } from "./sekhem-api"
import type { DownstreamWorkflowView } from "@/backend/src/conversation/workflow-presentation.contract"
export type ApprovalPost = (url: string, body: Record<string, unknown>) => Promise<any>
const post: ApprovalPost = (url, body) => postSekhemApi(url, body, { throwOnError: true })
/** Presentation guard only; every request/decision is independently admitted by the backend. */
export function approvalPresentation(workflow: DownstreamWorkflowView, stale = false, now = Date.now()) {
  const a = workflow.approval
  const state = workflow.proposal.state !== "READY" ? "STALE" : a?.state ?? "NOT_REQUESTED"
  const validDeadline = !!a?.deadline && Number.isFinite(Date.parse(a.deadline))
  const effective = a && ["PENDING", "APPROVED"].includes(state) && (!validDeadline || Date.parse(a.deadline!) <= now) ? "EXPIRED" : state
  const pending = effective === "PENDING" && a?.actionable && /^[a-f0-9]{64}$/.test(a.fingerprint ?? "")
  const selected = workflow.consent?.selected
  return { state: effective, canApprove: !stale && (!selected || selected.state === "ACTIVE" && Date.parse(selected.reference.expiresAt) > now) && workflow.permit?.state !== "CONSUMED" && !!workflow.proposal.planId && !!workflow.proposal.changes?.length && (effective === "NOT_REQUESTED" || effective === "EXPIRED" || !!pending) }
}
export function consentPresentation(workflow: DownstreamWorkflowView, stale = false, now = Date.now()) {
  const c = workflow.consent, selected = c?.selected
  const state = selected?.state === "ACTIVE" && Date.parse(selected.reference.expiresAt) <= now ? "EXPIRED" : selected?.state ?? c?.state ?? "UNAVAILABLE"
  const allowed = ["AVAILABLE", "AMBIGUOUS", "ACTIVE", "EXPIRED", "REVOKED", "SUPERSEDED"].includes(state)
  return { state, canConsent: !stale && !!c?.eligible && allowed && workflow.proposal.state === "READY" && !!workflow.proposal.planId && !!workflow.proposal.changes?.length && workflow.permit?.state !== "CONSUMED" && !["DENIED", "CANCELLED"].includes(workflow.approval?.state ?? "") && !(workflow.approval?.state === "APPROVED" && state === "ACTIVE"),
    canRevoke: !stale && !!selected?.revocable && !["REVOKED", "SUPERSEDED", "INVALID", "UNAVAILABLE"].includes(state) }
}
/** Explicit creation and explicit selection/application only. No fallback or execution endpoint. */
export async function approveWithConsent(conversationId: string, workflow: DownstreamWorkflowView, type: "TASK" | "SESSION", requestId: string, stale = false, send: ApprovalPost = post, stillCurrent: () => boolean = () => true) {
  if (!stillCurrent() || !consentPresentation(workflow, stale).canConsent) throw new Error("CONSENT_NOT_ACTIONABLE")
  const p = workflow.proposal, base = { planId: p.planId!, proposalVersion: p.version, proposalDigest: p.digest }
  const url = `/conversations/${encodeURIComponent(conversationId)}/exact-proposals/${encodeURIComponent(p.id)}`
  const matches = workflow.consent!.policies.filter(v => v.type === type && v.state === "ACTIVE" && Date.parse(v.reference.expiresAt) > Date.now())
  if (matches.length > 1) throw new Error("CONSENT_POLICY_AMBIGUOUS")
  let reference = matches[0]?.reference
  if (!reference) reference = await send(`${url}/${type === "TASK" ? "task" : "session"}-consent`, { ...base, requestId, durationSeconds: 900 })
  if (!reference || !/^[A-Za-z0-9_-]{1,128}$/.test(reference.policyId ?? "") || !/^[a-f0-9]{64}$/.test(reference.digest ?? "") || !Number.isSafeInteger(reference.generation) || reference.generation < 1 || reference.generation > 10000 || !Number.isFinite(Date.parse(reference.expiresAt)) || Date.parse(reference.expiresAt) <= Date.now() || (type === "SESSION" ? reference.scope !== "SESSION" || !reference.session : reference.scope !== undefined)) throw new Error("CONSENT_RESPONSE_INVALID")
  if (!stillCurrent()) throw new Error("APPROVAL_CONTEXT_CHANGED")
  const result = await send(`${url}/approval/task-consent`, { ...base, requestId: `${requestId}-apply`, consent: reference })
  const applied = result?.binding?.taskConsent
  if (!result || result.status !== "APPROVED" || result.binding?.proposalId !== p.id || result.binding?.proposalDigest !== p.digest || result.binding?.planId !== p.planId || !applied || ["policyId", "generation", "digest", "expiresAt", "consentedBy", "scope"].some(k => (applied as any)[k] !== (reference as any)[k]) || (["id", "issuedAt", "expiresAt"] as const).some(k => applied.session?.[k] !== reference.session?.[k])) throw new Error("CONSENT_APPLICATION_NOT_CONFIRMED")
  return result
}
export async function revokeSelectedConsent(conversationId: string, workflow: DownstreamWorkflowView, stale = false, remove = (url: string) => deleteSekhemApi<any>(url, { throwOnError: true }), stillCurrent: () => boolean = () => true) {
  if (!stillCurrent() || !consentPresentation(workflow, stale).canRevoke) throw new Error("CONSENT_NOT_ACTIONABLE")
  const v = workflow.consent!.selected!
  const response = await remove(`/conversations/${encodeURIComponent(conversationId)}/${v.type === "TASK" ? "task" : "session"}-consents/${encodeURIComponent(v.reference.policyId)}`)
  if (!response || response.status !== "REVOKED" || response.policyId !== v.reference.policyId || response.generation !== v.reference.generation) throw new Error("CONSENT_REVOCATION_NOT_CONFIRMED")
  return response
}
/** One explicit user action. No permit/execution endpoints, retries or automatic lifecycle effects. */
export async function approveExactAction(conversationId: string, workflow: DownstreamWorkflowView, requestId: string, stale = false, send: ApprovalPost = post, stillCurrent: (approvalId?: string) => boolean = () => true) {
  if (!stillCurrent() || !approvalPresentation(workflow, stale).canApprove) throw new Error("APPROVAL_NOT_ACTIONABLE")
  const p = workflow.proposal, base = { planId: p.planId!, proposalVersion: p.version, proposalDigest: p.digest }
  const url = `/conversations/${encodeURIComponent(conversationId)}/exact-proposals/${encodeURIComponent(p.id)}/approval`
  let approval = workflow.approval
  if (!approval || approvalPresentation(workflow).state === "EXPIRED") {
    const response = await send(url, { ...base, requestId })
    if (!response || response.status !== "PENDING" || !/^[A-Za-z0-9_-]{1,128}$/.test(response.approvalId ?? "") ||
      !Number.isSafeInteger(response.generation) || response.generation < 1 || response.generation > 10000 ||
      (approval && response.generation <= approval.generation) || !/^[a-f0-9]{64}$/.test(response.binding?.fingerprint ?? "") ||
      response.binding?.proposalId !== p.id || response.binding?.proposalDigest !== p.digest || response.binding?.proposalVersion !== p.version ||
      response.binding?.planId !== p.planId || !response.dueAt || Date.parse(response.dueAt) <= Date.now() || !Number.isFinite(Date.parse(response.dueAt))) throw new Error("APPROVAL_REQUEST_CHANGED")
    approval = { id: response.approvalId, generation: response.generation, revision: 1, state: "PENDING", actionable: true, deadline: response.dueAt, fingerprint: response.binding.fingerprint }
  }
  if (!stillCurrent(approval.id)) throw new Error("APPROVAL_CONTEXT_CHANGED")
  const response = await send(`${url}/decision`, { ...base, approvalId: approval.id, fingerprint: approval.fingerprint!, decision: "APPROVED" })
  if (!response || response.status !== "APPROVED" || response.approvalId !== approval.id || response.generation !== approval.generation) throw new Error("APPROVAL_DECISION_NOT_CONFIRMED")
  return response
}
