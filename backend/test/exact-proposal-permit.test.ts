import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalFixture } from "./exact-proposal-approval.test";
import { ExactProposalPermitService } from "../src/agent-runtime/execution/exact-proposal-permit.service";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { authorizedPlanExecution } from "../src/agent-runtime/execution/plan-execution-state";
import { ConversationController } from "../src/conversation/conversation.controller";
import { RuntimeLedgerService } from "../src/trusted-runtime/runtime-ledger.service";

export async function permitFixture(approve = true) {
  const f = await approvalFixture();
  Object.assign(f.claims, { sessionId: "session", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  const a = await f.request(); if (approve) await f.decide(a);
  const grant: any = { grantId: "grant", runtimeId: "runtime", userId: "user", organizationId: "org", projectId: "project",
    version: 62, status: "ACTIVE", capabilities: ["filesystem.read", "filesystem.write"], expiresAt: new Date(Date.now() + 3600000).toISOString() };
  const device: any = { fingerprint: "fingerprint", connectionEpoch: 1 };
  f.identity.activeGrant = async () => { if (grant.status !== "ACTIVE") throw new Error("RUNTIME_GRANT_INVALID"); return grant; };
  f.identity.device = async () => ({ payload: device });
  const ledger = (f.service as any).ledger;
  ledger.create = async (_tx: any, type: string, key: any, payload: any, options: any) => {
    assert.ok(["EXACT_EXECUTION_PERMIT", "EXACT_PERMIT_CONSUMPTION", "EXACT_PERMIT_HEAD", "EXACT_PERMIT_GENERATION", "EXACT_APPROVAL_HEAD", "EXACT_APPROVAL_GENERATION"].includes(type));
    assert.equal(options.immutable, !["EXACT_APPROVAL_HEAD", "EXACT_PERMIT_HEAD"].includes(type));
    const storageKey = JSON.stringify([type, key]); assert.equal(f.records.has(storageKey), false);
    const record = { payload: structuredClone(payload), immutable: options.immutable, revision: 1, createdAt: options.createdAt }; f.records.set(storageKey, record); return record;
  };
  ledger.update = async (_tx: any, record: any, payload: any) => {
    assert.equal(record.immutable, false); record.payload = structuredClone(payload); record.revision++; return record;
  };
  const permits = new ExactProposalPermitService(ledger, f.approvals, f.evidence, f.identity, f.resources);
  const body = { ...f.body, approvalId: a.approvalId };
  const issue = () => permits.issue("conversation", f.p.proposalId, f.claims, body);
  const consume = (intent = "future-intent") => ledger.transaction((tx: any) => permits.consumeTx(tx, "conversation", f.p.proposalId, f.claims, body, intent));
  return { ...f, a, grant, device, ledger, permits, body, issue, consume };
}

test("approved exact proposal produces immutable, bound, short-lived permit without execution side effects", async () => {
  const f = await permitFixture(), p = await f.issue();
  const { digest, ...base } = p; assert.equal(digest, toolDigest(base));
  assert.equal(p.binding.proposalId, f.p.proposalId); assert.equal(p.binding.proposalVersion, f.p.version);
  assert.equal(p.binding.proposalDigest, f.p.digest); assert.equal(p.binding.approvalId, f.a.approvalId);
  assert.equal(p.binding.approvalState, "APPROVED"); assert.equal(p.binding.planVersion, 4); assert.equal(p.binding.planDigest, f.p.planDigest);
  assert.equal(p.binding.conversationId, "conversation"); assert.deepEqual(p.binding.workspace, f.p.workspace);
  assert.equal(p.binding.sourceFingerprint, f.a.binding.sourceFingerprint); assert.equal(p.binding.actionsDigest, toolDigest(f.p.actions));
  assert.equal(p.binding.grantVersion, 62); assert.equal(p.binding.sessionId, "session");
  assert.ok(Date.parse(p.expiresAt) <= Date.now() + 60000); assert.equal(p.oneUse, true); assert.equal(p.runtimeDispatchEnabled, false);
  assert.equal(f.records.size, 2); assert.equal(f.run.status, undefined); assert.equal(f.messages.length, 1);
  assert.equal(f.rows.size, 1); assert.equal(f.p.executionEnabled, false);
  assert.equal(await authorizedPlanExecution(f.tx, { ...f.run, plans: [f.plan] }, {}), null);
  assert.ok(f.checks.some(c => c.authorization?.[1] === "EXECUTE"));
});

test("persisted permit lifetime is at most 60 seconds despite an earlier transaction timestamp", async () => {
  const f = await permitFixture(), rows = new Map<string, any>();
  const issuanceTime = Date.now(), transactionStart = new Date(issuanceTime - 156);
  const realLedger = new RuntimeLedgerService({} as any);
  const persistenceTx = { auditEvent: {
    findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
    create: async ({ data }: any) => {
      const row = structuredClone({ ...data, createdAt: data.createdAt ?? transactionStart });
      rows.set(row.id, row); return row;
    }
  } };
  f.ledger.create = async (_tx: any, type: any, key: any, payload: any, options: any) => {
    assert.equal(type, "EXACT_EXECUTION_PERMIT");
    const record = await realLedger.create(persistenceTx, type, key, payload, options);
    f.records.set(JSON.stringify([type, key]), record); return record;
  };
  const now = Date.now;
  Date.now = () => issuanceTime;
  try {
    const permit = await f.issue(), row = [...rows.values()][0];
    assert.equal(row.createdAt.getTime(), issuanceTime);
    assert.equal(Date.parse(row.metadata.payload.expiresAt) - row.createdAt.getTime(), 60000);
    assert.equal(Date.parse(permit.expiresAt) - transactionStart.getTime(), 60156);
    assert.deepEqual(realLedger.decode(row).payload, permit);
    assert.deepEqual(await f.issue(), permit);
    assert.equal(rows.size, 1);
    assert.equal(f.events.filter(e => e.eventType === "EXACT_EXECUTION_PERMIT_CREATED").length, 1);
    assert.equal(f.records.size, 2); // proposal and unused permit, no consumption
  } finally { Date.now = now; }
});

test("permit replay is idempotent and consumption is one-use without dispatch", async () => {
  const f = await permitFixture(), p = await f.issue();
  assert.deepEqual(await f.issue(), p);
  assert.equal(f.events.filter(e => e.eventType === "EXACT_EXECUTION_PERMIT_CREATED").length, 1);
  assert.deepEqual(await f.consume(), p);
  await assert.rejects(f.consume(), /EXACT_PERMIT_CONSUMED/);
  await assert.rejects(f.consume("different-intent"), /EXACT_PERMIT_CONSUMED/);
  await assert.rejects(f.issue(), /EXACT_PERMIT_CONSUMED/);
  assert.equal(f.records.size, 4); assert.equal(f.run.status, undefined);
});

test("pending, denied, revoked, expired, or changed approval cannot issue a permit", async () => {
  for (const kind of ["pending", "denied", "expired", "changed", "revoked-reviewer"]) {
    const f = await permitFixture(kind !== "pending"), row = f.rows.get(f.a.approvalId);
    if (kind === "denied") row.status = "DENIED";
    if (kind === "expired") row.dueAt = new Date(0);
    if (kind === "changed") row.revisedPlan.fingerprint = "a".repeat(64);
    if (kind === "revoked-reviewer") f.resources.assertAuthorized = async () => { throw new Error("FORBIDDEN"); };
    await assert.rejects(f.issue()); assert.equal(f.records.size, 1);
  }
});

for (const kind of ["proposal", "plan", "source", "workspace", "evidence", "grant", "fingerprint", "epoch", "session", "permission", "capabilities"]) {
  test(`changed ${kind} fails closed during permit issuance/replay and consumption`, async () => {
    const f = await permitFixture(); await f.issue();
    if (kind === "proposal") [...f.records.values()][0].payload.digest = "a".repeat(64);
    if (kind === "plan") f.plan.version++;
    if (kind === "source") f.fresh.digest = "changed";
    if (kind === "workspace") f.fresh.binding.version++;
    if (kind === "evidence") f.fresh.references = [];
    if (kind === "grant") f.grant.version++;
    if (kind === "fingerprint") f.device.fingerprint = "changed";
    if (kind === "epoch") f.device.connectionEpoch++;
    if (kind === "session") f.claims.sessionId = "other";
    if (kind === "permission") f.resources.assertAuthorized = async () => { throw new Error("FORBIDDEN"); };
    if (kind === "capabilities") f.grant.capabilities = ["filesystem.read"];
    await assert.rejects(f.issue()); await assert.rejects(f.consume()); assert.equal(f.records.size, 2);
  });
}

test("expired permit and revoked grant cannot be replayed or consumed", async () => {
  for (const kind of ["expiry", "grant"]) {
    const f = await permitFixture(); await f.issue();
    if (kind === "expiry") {
      const p = [...f.records.values()].find(r => r.payload.kind === "EXACT_EXECUTION_PERMIT").payload;
      p.expiresAt = new Date(0).toISOString(); const { digest, ...base } = p; p.digest = toolDigest(base);
    } else f.grant.status = "REVOKED";
    await assert.rejects(f.issue()); await assert.rejects(f.consume()); assert.equal(f.records.size, 2);
  }
});

test("evidence rejection or source change across admission prevents permit publication", async () => {
  for (const kind of ["rejected", "race"]) {
    const f = await permitFixture();
    f.evidence.admit = async () => { if (kind === "rejected") throw new Error("EVIDENCE_REJECTED"); f.fresh.binding.version++; };
    await assert.rejects(f.issue()); assert.equal(f.records.size, 1);
  }
});

test("distinct permit endpoint authenticates and delegates without invoking execution", async () => {
  const calls: any[] = [];
  const c = new ConversationController({ issueExactProposalPermit: async (...args: any[]) => { calls.push(args); return {}; } } as any,
    { validateDurableSession: async () => ({ sub: "user" }) } as any);
  await c.issueExactPermit("conversation", "proposal", "cookie", {});
  assert.deepEqual(calls, [["conversation", "proposal", { sub: "user" }, {}]]);
});
