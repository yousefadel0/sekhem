import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ExactProposalApprovalCard } from "../components/chat/exact-proposal-approval-card"
import { approveWithConsent, consentPresentation, revokeSelectedConsent } from "../lib/exact-proposal-approval"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"
import { readFileSync } from "node:fs"
const reference = (type: string): any => ({ policyId: "private-policy", generation: 2, digest: "c".repeat(64), expiresAt: "2099-01-01T00:00:00Z", consentedBy: "user", ...(type === "SESSION" ? { scope: "SESSION", session: { id: "private-session", issuedAt: 1, expiresAt: 9999999999 } } : {}) })
const view = (): any => ({ observedAt: 10, proposal: { id: "proposal", version: 1, digest: "a".repeat(64), planId: "plan", state: "READY", changes: [{ path: "index.html", before: "simple", after: "intelligent" }] }, consent: { eligible: true, state: "AVAILABLE", reasons: [], policies: [] } })
const policy = (type: string, state = "ACTIVE"): any => ({ type, reference: reference(type), revision: 2, state, reasons: [], revocable: true })
for (const type of ["TASK", "SESSION"] as const) test(`${type} creation explicitly applies only its returned reference; replay reuses persisted policy`, async () => {
  const w = view(), calls: string[] = [], ref = reference(type)
  const send = async (url: string, body: any) => { calls.push(url); if (url.endsWith("/approval/task-consent")) { assert.deepEqual(body.consent, ref); return { status: "APPROVED", binding: { proposalId: "proposal", proposalDigest: w.proposal.digest, planId: "plan", taskConsent: ref } } }; assert.equal(body.durationSeconds, 900); return ref }
  await approveWithConsent("conversation", w, type, "request", false, send)
  assert.equal(calls.length, 2); assert.ok(calls[0].endsWith(type === "TASK" ? "/task-consent" : "/session-consent"));
  assert.doesNotMatch(calls.join(" "), /permit|execute|runtime/)
  w.consent.policies = [policy(type)]; calls.length = 0
  await approveWithConsent("conversation", w, type, "request", false, send); assert.equal(calls.length, 1)
});
test("selected rejection never falls back to another policy or action approval", async () => {
  const w = view(); w.consent.policies = [policy("TASK"), policy("SESSION")]; let calls = 0
  await assert.rejects(approveWithConsent("c", w, "SESSION", "id", false, async (_url, body) => { calls++; assert.equal((body.consent as any).scope, "SESSION"); throw new Error("revoked") }), /revoked/)
  assert.equal(calls, 1)
});
test("context switch or late creation response cannot submit application", async () => {
  const w = view(); let valid = true, calls = 0
  await assert.rejects(approveWithConsent("old", w, "TASK", "id", false, async () => { calls++; valid = false; return reference("TASK") }, () => valid), /APPROVAL_CONTEXT_CHANGED/)
  assert.equal(calls, 1)
  assert.match(readFileSync("components/chat/agent-run-card.tsx", "utf8"), /key=\{`\$\{conversationId\}:\$\{workflow.proposal.id\}`\}/)
});
for (const state of ["ACTIVE", "EXPIRED", "REVOKED", "SUPERSEDED", "STALE", "INVALID", "UNAVAILABLE"]) test(`renders ${state} without technical primary details`, () => {
  const w = view(); w.consent.selected = policy("SESSION", state)
  const html = renderToStaticMarkup(<ExactProposalApprovalCard conversationId="c" workflow={w} />)
  assert.match(html, /Session consent selected/)
  const primary = html.replace(/<details[\s\S]*?<\/details>/g, "")
  assert.doesNotMatch(primary, /private-policy|private-session|cccccccc|Generation|filesystem\./)
  if (["STALE", "INVALID", "UNAVAILABLE"].includes(state)) assert.equal(consentPresentation(w).canConsent, false)
});
test("scope wording is bounded and critical/mixed actions hide delegated choices", () => {
  const w = view(), render = () => renderToStaticMarkup(<ExactProposalApprovalCard conversationId="c" workflow={w} />)
  assert.match(render(), /Approve for this task/); assert.match(render(), /Approve for this session/)
  assert.match(render(), /Neither covers future plans or grants file access/); assert.doesNotMatch(render(), /Approve for all/)
  w.consent.eligible = false; assert.doesNotMatch(render(), /Approve for this task|Approve for this session/)
});
test("renewal uses fresh request; revocation targets exact selected generation and never executes", async () => {
  const w = view(); w.consent.selected = policy("TASK", "EXPIRED"); const old = structuredClone(w.consent.selected)
  await approveWithConsent("c", w, "TASK", "fresh", false, async (url, body) => {
    const next = { ...reference("TASK"), generation: 3 }
    assert.ok(String(body.requestId).startsWith("fresh")); return url.endsWith("/approval/task-consent") ? { status: "APPROVED", binding: { proposalId: "proposal", proposalDigest: w.proposal.digest, planId: "plan", taskConsent: next } } : next
  }); assert.deepEqual(w.consent.selected, old)
  w.consent.selected.state = "ACTIVE"
  await revokeSelectedConsent("c", w, false, async url => { assert.equal(url, "/conversations/c/task-consents/private-policy"); return { status: "REVOKED", policyId: "private-policy", generation: 2 } })
});
test("reload preserves selection; old revisions cannot restore revoked actionable consent", () => {
  const w = view(); w.consent.selected = policy("TASK", "REVOKED"); w.consent.selected.revision = 3
  const snapshot: any = { id: "c", projectId: "p", messages: [], agentRuns: [{ id: "run", status: "COMPLETED", planVersion: 1, workflow: w }] }
  const restored = reconcileConversationSnapshot(undefined, structuredClone(snapshot)); assert.deepEqual(restored.agentRuns[0].workflow!.consent!.selected, w.consent.selected)
  const old = structuredClone(snapshot); old.agentRuns[0].workflow.observedAt = 11; old.agentRuns[0].workflow.consent.selected = policy("TASK")
  const reconciled = reconcileConversationSnapshot(snapshot, old); assert.equal(reconciled.agentRuns[0].workflow!.consent!.selected!.state, "REVOKED")
  assert.equal(consentPresentation(w, true).canConsent, false); assert.equal(consentPresentation(w, true).canRevoke, false)
});
