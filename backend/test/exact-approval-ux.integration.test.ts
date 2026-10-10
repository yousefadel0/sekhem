import assert from "node:assert/strict";
import { test } from "node:test";
import { approveExactAction } from "../../lib/exact-proposal-approval";
import { approvalFixture } from "./exact-proposal-approval.test";
import { permitFixture } from "./exact-proposal-permit.test";
const view = (): any => ({ observedAt: 1, proposal: { id: "proposal-secret-id", planId: "plan", version: 1, digest: "a".repeat(64), revision: 1, state: "READY", changes: [{ path: "index.html", before: "simple", after: "intelligent" }], verification: ["Read-back and expected content hash comparison"] } })
const row = (state: string): any => ({ id: "approval-secret-id", generation: 2, revision: 1, state, deadline: "2099-01-01T00:00:00Z", actionable: state === "PENDING", fingerprint: "b".repeat(64) })
test("explicit action calls separate request and decision backend operations only", async () => {
  const f = await approvalFixture(), w = view(); w.proposal = { ...w.proposal, id: f.p.proposalId, planId: f.p.planId, digest: f.p.digest };
  const calls: string[] = []; let requested: any;
  const post = async (url: string, body: any) => { calls.push(url); assert.ok(url.endsWith("/approval") || url.endsWith("/approval/decision"));
    if (url.endsWith("/decision")) return f.approvals.decide("conversation", f.p.proposalId, f.claims, body);
    requested = await f.approvals.request("conversation", f.p.proposalId, f.claims, body);
    assert.equal(requested.status, "PENDING"); assert.equal(f.rows.get(requested.approvalId).status, "PENDING"); return requested;
  };
  const result = await approveExactAction("conversation", w, "explicit-user-request", false, post);
  assert.equal(result.status, "APPROVED"); assert.equal(result.executionEnabled, false); assert.equal(calls.length, 2);
  assert.equal(f.records.size, 1); assert.equal(f.rows.size, 1); assert.deepEqual(f.events.map(e => e.eventType), ["EXACT_PROPOSAL_READY", "EXACT_PROPOSAL_APPROVAL_REQUESTED", "EXACT_PROPOSAL_APPROVED"]);
  const events = f.events.length; w.approval = { ...row("PENDING"), id: requested.approvalId, generation: requested.generation, fingerprint: requested.binding.fingerprint, deadline: requested.dueAt };
  await approveExactAction("conversation", w, "replay", false, post); assert.equal(f.events.length, events);
});

test("renewal uses a new generation and leaves expired approval untouched", async () => {
  const f = await permitFixture(false); f.rows.get(f.a.approvalId).dueAt = new Date(0); const old = structuredClone(f.rows.get(f.a.approvalId));
  const w = view(); w.proposal = { ...w.proposal, id: f.p.proposalId, planId: f.p.planId, digest: f.p.digest }; w.approval = { ...row("EXPIRED"), id: f.a.approvalId, generation: 1, deadline: old.dueAt, fingerprint: f.a.binding.fingerprint };
  const post = (url: string, body: any) => url.endsWith("/decision") ? f.approvals.decide("conversation", f.p.proposalId, f.claims, body) : f.approvals.request("conversation", f.p.proposalId, f.claims, body);
  const result = await approveExactAction("conversation", w, "fresh-renewal", false, post);
  assert.equal(result.generation, 2); assert.equal(result.status, "APPROVED"); assert.notEqual(result.approvalId, old.id); assert.deepEqual(f.rows.get(old.id), old);
  assert.ok([...f.records.keys()].every(k => !/EXACT_EXECUTION_PERMIT|PLAN_EXECUTION|RUNTIME_PROPOSAL/.test(k)));
});
