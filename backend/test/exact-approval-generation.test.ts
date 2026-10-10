import assert from "node:assert/strict";
import { test } from "node:test";
import { permitFixture } from "./exact-proposal-permit.test";

function renew(f: Awaited<ReturnType<typeof permitFixture>>, requestId: string) {
  return f.approvals.request("conversation", f.p.proposalId, f.claims,
    { planId: f.p.planId, proposalVersion: f.p.version, proposalDigest: f.p.digest, requestId });
}

test("expired legacy approval creates and approves a new generation without changing historical approval", async () => {
  const f = await permitFixture();
  f.rows.get(f.a.approvalId).dueAt = new Date(0);
  const old = structuredClone(f.rows.get(f.a.approvalId)), proposal = structuredClone(f.p);
  const next = await renew(f, "renew-1");
  assert.notEqual(next.approvalId, old.id); assert.equal(next.generation, 2); assert.equal(next.status, "PENDING");
  assert.equal(next.binding.generation, 2); assert.equal(next.binding.requestId, "renew-1");
  assert.equal(next.binding.proposalDigest, f.p.digest); assert.equal(next.binding.planDigest, f.p.planDigest);
  assert.deepEqual(next.binding.workspace, f.p.workspace); assert.equal(next.binding.conversationId, "conversation");
  assert.equal(next.binding.sourceFingerprint, f.a.binding.sourceFingerprint);
  assert.ok(+new Date(next.dueAt) > Date.now());
  assert.deepEqual(await renew(f, "renew-1"), next);
  const approved = await f.decide(next); assert.equal(approved.status, "APPROVED");
  const count = f.events.length; assert.deepEqual(await f.decide(next), approved); assert.equal(f.events.length, count);
  assert.deepEqual(f.rows.get(old.id), old); assert.deepEqual(f.p, proposal);
  assert.equal(f.records.size, 3); // Proposal, generation identity and head only; no permit/execution.
  await assert.rejects(f.issue(), /EXACT_APPROVAL_REQUIRED/); // Old approval must not issue a permit.
  const admitted = await f.approvals.approvedTx(f.tx, "conversation", f.p.proposalId, f.claims, { ...f.body, approvalId: next.approvalId });
  assert.equal(admitted.approval.id, next.approvalId);
  assert.equal(f.run.status, undefined);
});

test("expired generation replay cannot silently create another generation; superseded requests cannot rotate current approval", async () => {
  const f = await permitFixture(); f.rows.get(f.a.approvalId).dueAt = new Date(0);
  const second = await renew(f, "renew-1"); f.rows.get(second.approvalId).dueAt = new Date(0);
  const oldSecond = structuredClone(f.rows.get(second.approvalId));
  await assert.rejects(renew(f, "renew-1"), /APPROVAL_EXPIRED/); assert.equal(f.rows.size, 2);
  const third = await renew(f, "renew-2"); assert.equal(third.generation, 3);
  assert.deepEqual(f.rows.get(second.approvalId), oldSecond);
  await assert.rejects(renew(f, "renew-1"), /EXACT_APPROVAL_SUPERSEDED/);
  await assert.rejects(f.decide(second), /EXACT_APPROVAL_REQUIRED/);
  await f.decide(third);
  await assert.rejects(f.approvals.approvedTx(f.tx, "conversation", f.p.proposalId, f.claims,
    { ...f.body, approvalId: second.approvalId }), /EXACT_APPROVAL_REQUIRED/);
});

test("valid approval is not replaced, and expiry without a fresh request ID does not mutate history", async () => {
  const f = await permitFixture(); const snapshot = structuredClone(f.rows.get(f.a.approvalId));
  assert.equal((await renew(f, "early-renewal")).approvalId, f.a.approvalId); assert.equal(f.rows.size, 1);
  f.rows.get(f.a.approvalId).dueAt = new Date(0);
  await assert.rejects(f.request(), /APPROVAL_EXPIRED/); assert.equal(f.rows.size, 1);
  assert.equal(f.rows.get(f.a.approvalId).decidedAt.toISOString(), snapshot.decidedAt.toISOString());
});

test("changed source/plan/workspace/proposal/runtime identity still prevents approval renewal", async () => {
  for (const kind of ["source", "plan", "workspace", "proposal", "runtime"]) {
    const f = await permitFixture(); f.rows.get(f.a.approvalId).dueAt = new Date(0);
    const old = structuredClone(f.rows.get(f.a.approvalId));
    if (kind === "source") f.fresh.digest = "changed";
    if (kind === "plan") f.plan.version++;
    if (kind === "workspace") f.fresh.binding.version++;
    if (kind === "proposal") [...f.records.values()][0].payload.digest = "a".repeat(64);
    if (kind === "runtime") f.fresh.binding.runtimeFingerprint = "changed";
    await assert.rejects(renew(f, "renew-1"));
    assert.equal(f.rows.size, 1); assert.equal(f.records.size, 1); assert.deepEqual(f.rows.get(f.a.approvalId), old);
  }
});
