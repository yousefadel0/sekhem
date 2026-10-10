import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./task-consent.test";
import { projectConsent } from "../src/conversation/consent-presentation";
import { projectDownstreamWorkflow } from "../src/conversation/workflow-presentation";

for (const scope of ["TASK", "SESSION"] as const) {
  test(`${scope} bounded projection restores selected identity and generation without mutation`, async () => {
    const h = await fixture(300, scope); await h.approve();
    const before = JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentApproval.values()]);
    const view = await projectConsent(h.db, h.p, h.f.plan, h.ref, h.claims);
    assert.equal(view.eligible, true); assert.equal(view.selected?.state, "ACTIVE"); assert.equal(view.selected?.type, scope);
    assert.deepEqual(view.selected?.reference, h.ref); assert.equal(view.policies.length, 1);
    assert.deepEqual(await h.create(), h.ref);
    assert.equal(JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentApproval.values()]), before);
    assert.doesNotMatch(JSON.stringify(view), /validatedInput|expectedSha256|raw-model|stdout|capabilities/);
  });
  test(`${scope} revocation makes historical APPROVED presentation non-actionable without changing approval`, async () => {
    const h = await fixture(300, scope), a = await h.approve(); await h.revoke();
    const view = await projectDownstreamWorkflow(h.db, { ...h.f.run, plans: [h.f.plan] }, { id: "conversation-a", userId: h.claims.sub, projectId: "project-a", metadata: { runtimeWorkspace: h.p.workspace } }, Date.now(), h.claims);
    assert.equal(view?.consent?.selected?.state, "REVOKED"); assert.equal(view?.approval?.state, "STALE"); assert.equal(view?.approval?.actionable, false);
    assert.equal(h.tables.agentApproval.get(a.approvalId).status, "APPROVED");
  });
}
test("overlap is ambiguous until an explicit policy is selected", async () => {
  const h = await fixture(300, "SESSION"); await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "task" });
  assert.equal((await projectConsent(h.db, h.p, h.f.plan, undefined, h.claims)).state, "AMBIGUOUS");
  assert.equal((await projectConsent(h.db, h.p, h.f.plan, h.ref, h.claims)).selected?.type, "SESSION");
});
test("expiry, supersession and fresh immutable renewal are projected", async () => {
  const h = await fixture(), realNow = Date.now;
  try { Date.now = () => Date.parse(h.ref.expiresAt) + 1; assert.equal((await projectConsent(h.db, h.p, h.f.plan, h.ref, h.claims)).selected?.state, "EXPIRED"); }
  finally { Date.now = realNow; }
  await h.revoke(); const next = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "next" });
  const view = await projectConsent(h.db, h.p, h.f.plan, h.ref, h.claims);
  assert.equal(view.selected?.state, "SUPERSEDED"); assert.equal(view.policies[0].reference.generation, next.generation);
});
test("critical/mixed actions remain individual approval only", async () => {
  const h = await fixture();
  for (const tool of ["filesystem.delete", "terminal.execute", "browser.open", "unknown"]) {
    const view = await projectConsent(h.db, { ...h.p, actions: [...h.p.actions, { ...h.p.actions[0], stepId: "critical", tool }] }, h.f.plan, undefined, h.claims);
    assert.equal(view.eligible, false); assert.ok(view.reasons.includes("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED"));
  }
});
test("different authenticated session cannot reconstruct actionable SESSION consent", async () => {
  const h = await fixture(300, "SESSION"), claims = { ...h.claims, sessionId: "new-session" };
  await h.db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, expiresAt: new Date(claims.exp * 1000), revokedAt: null } });
  const view = await projectConsent(h.db, h.p, h.f.plan, h.ref, claims);
  assert.equal(view.selected?.state, "STALE"); assert.equal(view.selected?.revocable, false);
});
test("unavailable/invalid/stale projection preserves provenance and never exposes exception text", async () => {
  const h = await fixture();
  const unavailable = await projectConsent({ ...h.db, $transaction: async () => { throw new Error("private stack/value"); } }, h.p, h.f.plan, h.ref, h.claims);
  assert.equal(unavailable.selected?.state, "UNAVAILABLE"); assert.deepEqual(unavailable.selected?.reference, h.ref);
  assert.doesNotMatch(JSON.stringify(unavailable), /private|stack/);
  assert.equal((await projectConsent(h.db, h.p, h.f.plan, { ...h.ref, digest: "bad" }, h.claims)).selected?.state, "INVALID");
  assert.equal((await projectConsent(h.db, h.p, h.f.plan, h.ref, h.claims, true)).selected?.state, "STALE");
});
