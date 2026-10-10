import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./exact-proposal-stage.test";
import { ExactProposalApprovalService } from "../src/agent-runtime/execution/exact-proposal-approval.service";
import { authorizedPlanExecution } from "../src/agent-runtime/execution/plan-execution-state";
import { ConversationController } from "../src/conversation/conversation.controller";

export async function approvalFixture() {
  const f = fixture(), p = await f.service.prepare("conversation", f.claims, f.body);
  const rows = new Map<string, any>(), checks: any[] = [], audits: any[] = [];
  f.tx.agentApproval = {
    findUnique: async ({ where }: any) => rows.get(where.id),
    create: async ({ data }: any) => { assert.equal(data.approvalType, "EXACT_PROPOSAL"); rows.set(data.id, structuredClone(data)); return rows.get(data.id); },
    updateMany: async ({ where, data }: any) => { const row = rows.get(where.id); if (!row || row.status !== where.status) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }
  };
  const identity: any = { actor: async (...args: any[]) => { checks.push({ identity: args.slice(1) }); return f.claims; } };
  const resources: any = { assertAuthorized: async (...args: any[]) => { checks.push({ authorization: args }); } };
  const evidence: any = { admit: async () => {} };
  const service = new ExactProposalApprovalService((f.service as any).ledger, f.inspections, evidence, identity, resources,
    { recordWithClaimsTx: async (...args: any[]) => audits.push(args.slice(1)) } as any);
  const body = { planId: p.planId, proposalVersion: p.version, proposalDigest: p.digest };
  const request = () => service.request("conversation", p.proposalId, f.claims, body);
  const decide = (a: any, decision = "APPROVED") => service.decide("conversation", p.proposalId, f.claims,
    { ...body, approvalId: a.approvalId, fingerprint: a.binding.fingerprint, decision });
  return { ...f, p, body, rows, checks, audits, identity, resources, evidence, approvals: service, request, decide };
}

test("isolated request/decision binds immutable proposal, plan, source fingerprint and workspace without execution authority", async () => {
  const f = await approvalFixture(), original = structuredClone(f.p), a = await f.request();
  assert.equal(a.status, "PENDING");
  assert.equal(a.binding.proposalId, f.p.proposalId); assert.equal(a.binding.proposalVersion, 1); assert.equal(a.binding.proposalDigest, f.p.digest);
  assert.equal(a.binding.planVersion, 4); assert.equal(a.binding.planDigest, f.p.planDigest);
  assert.equal(a.binding.conversationId, "conversation"); assert.deepEqual(a.binding.workspace, f.p.workspace);
  assert.equal(a.binding.sourceDigest, f.p.sourceDigest); assert.match(a.binding.sourceFingerprint, /^[a-f0-9]{64}$/);
  const approved = await f.decide(a);
  assert.equal(approved.status, "APPROVED"); assert.equal(approved.executionEnabled, false);
  assert.equal(f.checks.filter(c => c.authorization).every(c => c.authorization[1] === "APPROVE" && c.authorization[2].requiredRole === "Technical Reviewer"), true);
  assert.deepEqual(f.p, original); assert.equal(f.p.authorization, "NOT_GRANTED");
  assert.equal(f.records.size, 1); // Only the immutable EXACT_PROPOSAL: no execution/runtime/permit records.
  assert.equal(await authorizedPlanExecution(f.tx, { ...f.run, plans: [f.plan] }, {}), null);
  assert.equal(f.messages.length, 1); assert.equal(f.run.status, undefined);
});

test("request and explicit decision replay are idempotent; conflicting decisions fail closed", async () => {
  const f = await approvalFixture(), a = await f.request();
  assert.deepEqual(await f.request(), a); const approved = await f.decide(a);
  const eventCount = f.events.length, auditCount = f.audits.length;
  assert.deepEqual(await f.decide(a), approved); assert.equal(f.rows.size, 1);
  assert.equal(f.events.length, eventCount); assert.equal(f.audits.length, auditCount);
  await assert.rejects(f.decide(a, "DENIED"), /APPROVAL_ALREADY_DECIDED/);
});

test("acknowledgment and decisions without a pending approval never create approval", async () => {
  const f = await approvalFixture();
  await assert.rejects(f.approvals.decide("conversation", f.p.proposalId, f.claims,
    { ...f.body, approvalId: "approval", fingerprint: "a".repeat(64), decision: "ACKNOWLEDGED" }), /EXACT_APPROVAL_REQUEST_INVALID/);
  await assert.rejects(f.approvals.decide("conversation", f.p.proposalId, f.claims,
    { ...f.body, approvalId: "approval", fingerprint: "a".repeat(64), decision: ["APPROVED"] }), /EXACT_APPROVAL_REQUEST_INVALID/);
  await assert.rejects(f.approvals.decide("conversation", f.p.proposalId, f.claims,
    { ...f.body, approvalId: "approval", fingerprint: "a".repeat(64), decision: "APPROVED" }), /EXACT_APPROVAL_REQUIRED/);
  assert.equal(f.rows.size, 0);
});

for (const kind of ["proposal", "plan", "source", "binding", "evidence", "conversation", "fingerprint", "version"]) {
  test(`changed ${kind} prevents both approval creation or decision`, async () => {
    for (const pending of [false, true]) {
      const f = await approvalFixture(), a = pending ? await f.request() : null;
      if (kind === "proposal") [...f.records.values()][0].payload.digest = "a".repeat(64);
      if (kind === "plan") f.plan.version++;
      if (kind === "source") f.fresh.digest = "changed";
      if (kind === "binding") f.fresh.binding.version++;
      if (kind === "evidence") f.fresh.references = [];
      if (kind === "conversation") f.run.conversationId = "other";
      if (kind === "fingerprint") f.fresh.binding.runtimeFingerprint = "changed";
      if (kind === "version") f.body.proposalVersion = 2;
      await assert.rejects(pending ? f.decide(a) : f.request());
      assert.equal(f.rows.size, pending ? 1 : 0);
      if (pending) assert.equal(f.rows.get(a.approvalId).status, "PENDING");
    }
  });
}

test("receipt rejection, revoked identity, or missing reviewer authorization prevents approval", async () => {
  for (const kind of ["evidence", "identity", "role"]) {
    const f = await approvalFixture();
    if (kind === "evidence") f.evidence.admit = async () => { throw new Error("EVIDENCE_REJECTED"); };
    if (kind === "identity") f.identity.actor = async () => { throw new Error("RUNTIME_AUTHORIZING_SESSION_INVALID"); };
    if (kind === "role") f.resources.assertAuthorized = async () => { throw new Error("FORBIDDEN"); };
    await assert.rejects(f.request()); assert.equal(f.rows.size, 0);
  }
});

test("expired approval, wrong approval ID/fingerprint, and source changes during admission fail closed", async () => {
  for (const kind of ["expired", "id", "fingerprint", "race"]) {
    const f = await approvalFixture(), a = await f.request();
    if (kind === "expired") f.rows.get(a.approvalId).dueAt = new Date(0);
    if (kind === "id") a.approvalId = "wrong";
    if (kind === "fingerprint") a.binding = { ...a.binding, fingerprint: "a".repeat(64) };
    if (kind === "race") f.evidence.admit = async () => { f.fresh.binding.version++; };
    await assert.rejects(f.decide(a)); assert.equal([...f.rows.values()][0].status, "PENDING");
  }
});

test("controller authenticates and separates approval request from explicit decision", async () => {
  const calls: any[] = [];
  const c = new ConversationController({ exactProposalApproval: async (...args: any[]) => { calls.push(args); return {}; } } as any,
    { validateDurableSession: async () => ({ sub: "user" }) } as any);
  await c.requestExactApproval("conversation", "proposal", "cookie", {});
  await c.decideExactApproval("conversation", "proposal", "cookie", {});
  assert.equal(calls[0][4], false); assert.equal(calls[1][4], true);
});
