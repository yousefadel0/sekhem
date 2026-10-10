import assert from "node:assert/strict";
import { test } from "node:test";
import { permitFixture } from "./exact-proposal-permit.test";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { RuntimeIdentityService } from "../src/trusted-runtime/runtime-identity.service";

const key = ["user", "conversation"];
function issuance(f: Awaited<ReturnType<typeof permitFixture>>, requestId: string) {
  return f.permits.issue("conversation", f.p.proposalId, f.claims, { ...f.body, requestId });
}
function consume(f: Awaited<ReturnType<typeof permitFixture>>, requestId: string) {
  return f.ledger.transaction((tx: any) => f.permits.consumeTx(tx, "conversation", f.p.proposalId, f.claims,
    { ...f.body, requestId }, "future-intent"));
}
async function afterExpiry<T>(expiresAt: string, work: () => Promise<T>) {
  const now = Date.now; Date.now = () => Date.parse(expiresAt) + 1;
  try { return await work(); } finally { Date.now = now; }
}

test("first request persists one immutable issuance and identity mapping; replay has no side effects", async () => {
  const f = await permitFixture(), p = await issuance(f, "request-1");
  assert.equal(p.generation, 1); assert.equal(p.requestId, "request-1");
  assert.equal(p.binding.approvalId, f.a.approvalId); assert.equal(p.binding.planDigest, f.p.planDigest);
  const record = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  assert.equal(record.immutable, true);
  assert.ok(Date.parse(p.expiresAt) - record.createdAt.getTime() <= 60000);
  const snapshot = structuredClone([...f.records]), count = f.events.length;
  assert.deepEqual(await issuance(f, "request-1"), p);
  assert.deepEqual([...f.records], snapshot); assert.equal(f.events.length, count);
  await assert.rejects(issuance(f, "request-other"), /EXACT_PERMIT_REQUEST_CONFLICT/);
  assert.equal(f.run.status, undefined); assert.equal(p.runtimeDispatchEnabled, false);
});

test("expired unused issuance permits a fresh generation without mutating history; only current request consumes", async () => {
  const f = await permitFixture(), first = await issuance(f, "request-1");
  const record = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  const snapshot = structuredClone(record);
  await afterExpiry(first.expiresAt, async () => {
    await assert.rejects(issuance(f, "request-1"), /EXACT_PERMIT_EXPIRED/);
    const second = await issuance(f, "request-2");
    assert.equal(second.generation, 2); assert.notEqual(second.permitId, first.permitId);
    assert.deepEqual(second.binding, first.binding); assert.deepEqual(record, snapshot);
    const next = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId, 2]]));
    assert.equal(next.immutable, true); assert.ok(Date.parse(second.expiresAt) - next.createdAt.getTime() <= 60000);
    assert.deepEqual(await issuance(f, "request-2"), second);
    await assert.rejects(issuance(f, "request-1"), /EXACT_PERMIT_SUPERSEDED/);
    await assert.rejects(consume(f, "request-1"), /EXACT_PERMIT_SUPERSEDED/);
    assert.deepEqual(await consume(f, "request-2"), second);
    // Prove the scope-wide marker independently prevents cross-generation reuse.
    f.records.delete(JSON.stringify(["EXACT_PERMIT_CONSUMPTION", second.permitId]));
    await assert.rejects(consume(f, "request-2"), /EXACT_PERMIT_CONSUMED/);
    await assert.rejects(issuance(f, "request-3"), /EXACT_PERMIT_CONSUMED/);
    assert.deepEqual(record, snapshot);
  });
});

test("expired legacy permit migrates as generation one without rewriting its payload", async () => {
  const f = await permitFixture(), legacy = await f.issue(), snapshot = structuredClone([...f.records][1]);
  await afterExpiry(legacy.expiresAt, async () => {
    const next = await issuance(f, "renew-legacy");
    assert.equal(next.generation, 2); assert.deepEqual([...f.records][1], snapshot);
    await assert.rejects(f.consume(), /EXACT_PERMIT_SUPERSEDED/);
  });
});

test("consumed legacy issuance cannot be replaced even after expiry", async () => {
  const f = await permitFixture(), p = await f.issue(); await f.consume();
  await afterExpiry(p.expiresAt, async () => {
    await assert.rejects(issuance(f, "renew"), /EXACT_PERMIT_CONSUMED/);
    await assert.rejects(f.consume(), /EXACT_PERMIT_CONSUMED/);
  });
});

test("historical legacy consumption marker blocks renewal without a new global marker", async () => {
  const f = await permitFixture(), p = await f.issue();
  f.records.set(JSON.stringify(["EXACT_PERMIT_CONSUMPTION", p.permitId]), { payload: { permitId: p.permitId }, immutable: true });
  await afterExpiry(p.expiresAt, () => assert.rejects(issuance(f, "renew"), /EXACT_PERMIT_CONSUMED/));
});

test("stale bindings and revoked authority fail closed before renewal", async () => {
  for (const kind of ["plan", "source", "workspace", "grant", "fingerprint", "capabilities", "permission", "approval"]) {
    const f = await permitFixture(), p = await issuance(f, "first"), before = structuredClone([...f.records]);
    if (kind === "plan") f.plan.version++;
    if (kind === "source") f.fresh.digest = "changed";
    if (kind === "workspace") f.fresh.binding.version++;
    if (kind === "grant") f.grant.grantId = "different-grant";
    if (kind === "fingerprint") f.device.fingerprint = "changed";
    if (kind === "capabilities") f.grant.capabilities = ["filesystem.read"];
    if (kind === "permission") f.resources.assertAuthorized = async () => { throw new Error("FORBIDDEN"); };
    if (kind === "approval") f.rows.get(f.a.approvalId).dueAt = new Date(0);
    await afterExpiry(p.expiresAt, () => assert.rejects(issuance(f, "renew")));
    assert.deepEqual([...f.records], before);
  }
});

test("bounded request identities and corrupted expiry remain rejected", async () => {
  const f = await permitFixture();
  await assert.rejects(issuance(f, "x".repeat(1000)), /EXACT_PERMIT_REQUEST_INVALID/);
  const p = await issuance(f, "first");
  const record = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  record.payload.expiresAt = "invalid";
  const { digest, ...base } = record.payload; record.payload.digest = toolDigest(base);
  await assert.rejects(issuance(f, "renew"), /EXACT_PERMIT_EXPIRED/);
});

test("fresh expired-unused renewal admits a new session and preserves every non-session binding", async () => {
  const f = await permitFixture(), first = await issuance(f, "first-session");
  const record = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  const snapshot = structuredClone(record);
  await afterExpiry(first.expiresAt, async () => {
    Object.assign(f.claims, { sessionId: "new-session", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
    f.checks.length = 0;
    const next = await issuance(f, "new-session-request");
    assert.equal(next.generation, 2);
    assert.equal(next.binding.sessionId, f.claims.sessionId);
    assert.equal(next.binding.sessionIssuedAt, f.claims.iat);
    assert.equal(next.binding.sessionExpiresAt, f.claims.exp);
    assert.ok(f.checks.filter(c => c.identity?.[3]).length >= 2);
    assert.ok(f.checks.filter(c => c.identity?.[3]).every(c => c.identity[3].id === "new-session"));
    assert.ok(f.checks.some(c => c.authorization?.[1] === "EXECUTE"));
    assert.deepEqual(next.binding, { ...first.binding, sessionId: f.claims.sessionId,
      sessionIssuedAt: f.claims.iat, sessionExpiresAt: f.claims.exp });
    assert.deepEqual(record, snapshot);
    const nextRecord = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId, 2]]));
    assert.equal(Date.parse(next.expiresAt) - nextRecord.createdAt.getTime(), 60000);
    assert.deepEqual(await issuance(f, "new-session-request"), next);
    f.claims.sessionId = "third-session";
    await assert.rejects(issuance(f, "new-session-request"), /EXACT_PERMIT_CHANGED/);
    await assert.rejects(consume(f, "new-session-request"), /EXACT_PERMIT_CHANGED/);
    f.claims.sessionId = "new-session";
    assert.deepEqual(await consume(f, "new-session-request"), next);
    await assert.rejects(consume(f, "new-session-request"), /EXACT_PERMIT_CONSUMED/);
    f.claims.sessionId = "third-session";
    await assert.rejects(issuance(f, "another-request"), /EXACT_PERMIT_CONSUMED/);
  });
});

test("same-request replay requires all original session fields, including after expiry", async () => {
  for (const field of ["sessionId", "iat", "exp"] as const) {
    const f = await permitFixture(), first = await issuance(f, "request");
    const before = structuredClone([...f.records]);
    if (field === "sessionId") f.claims.sessionId = "different";
    else f.claims[field]! += 1;
    await assert.rejects(issuance(f, "request"), /EXACT_PERMIT_CHANGED/);
    await afterExpiry(first.expiresAt, () => assert.rejects(issuance(f, "request"), /EXACT_PERMIT_CHANGED/));
    assert.deepEqual([...f.records], before);
  }
});

test("new session cannot replace an unexpired permit or bypass session admission", async () => {
  const f = await permitFixture(), first = await issuance(f, "first"), before = structuredClone([...f.records]);
  f.claims.sessionId = "new-session";
  await assert.rejects(issuance(f, "fresh"), /EXACT_PERMIT_CHANGED/);
  f.identity.actor = async (...args: any[]) => {
    if (args[4]?.id === "new-session") throw new Error("RUNTIME_AUTHORIZING_SESSION_INVALID");
    return f.claims;
  };
  await afterExpiry(first.expiresAt, () => assert.rejects(issuance(f, "fresh"), /RUNTIME_AUTHORIZING_SESSION_INVALID/));
  assert.deepEqual([...f.records], before);
});

async function newApproval(f: Awaited<ReturnType<typeof permitFixture>>, approve = true) {
  const old = f.rows.get(f.body.approvalId);
  old.dueAt = new Date(Date.now() - 1);
  const snapshot = structuredClone(old);
  const requested = await f.approvals.request("conversation", f.p.proposalId, f.claims,
    { planId: f.p.planId, proposalVersion: f.p.version, proposalDigest: f.p.digest, requestId: "approval-renewal" });
  if (approve) await f.decide(requested);
  f.body.approvalId = requested.approvalId;
  assert.deepEqual(old, snapshot);
  return { requested, old, snapshot };
}

test("expired unused permit renews with current approved generation and new session without changing historical records", async () => {
  const f = await permitFixture(), first = await issuance(f, "old-request");
  const previous = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  const snapshot = structuredClone(previous);
  await afterExpiry(first.expiresAt, async () => {
    Object.assign(f.claims, { sessionId: "renewed-session", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
    const { requested, old, snapshot: oldApproval } = await newApproval(f);
    await assert.rejects(issuance(f, "old-request"), /EXACT_PERMIT_CHANGED/);
    const next = await issuance(f, "fresh-request");
    assert.equal(next.generation, 2); assert.equal(next.binding.generation, requested.generation);
    assert.equal(next.binding.approvalId, requested.approvalId);
    assert.equal(next.binding.requestId, requested.binding.requestId);
    assert.equal(next.binding.fingerprint, requested.binding.fingerprint);
    assert.equal(next.binding.approvalDecidedAt, new Date(f.rows.get(requested.approvalId).decidedAt).toISOString());
    assert.equal(next.binding.sessionId, "renewed-session");
    assert.equal(next.binding.sessionIssuedAt, f.claims.iat); assert.equal(next.binding.sessionExpiresAt, f.claims.exp);
    const authorizationFields = ["approvalId", "generation", "requestId", "fingerprint", "approvalDecisionBy", "approvalDecidedAt",
      "sessionId", "sessionIssuedAt", "sessionExpiresAt"];
    const artifact = (binding: any) => Object.fromEntries(Object.entries(binding).filter(([k]) => !authorizationFields.includes(k)));
    assert.deepEqual(artifact(next.binding), artifact(first.binding));
    assert.deepEqual(previous, snapshot); assert.deepEqual(old, oldApproval);
    const nextRecord = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId, 2]]));
    assert.equal(Date.parse(next.expiresAt) - nextRecord.createdAt.getTime(), 60000);
    assert.deepEqual(await issuance(f, "fresh-request"), next);
    assert.deepEqual(await consume(f, "fresh-request"), next);
    f.records.delete(JSON.stringify(["EXACT_PERMIT_CONSUMPTION", next.permitId]));
    await assert.rejects(consume(f, "fresh-request"), /EXACT_PERMIT_CONSUMED/);
    await assert.rejects(issuance(f, "third-request"), /EXACT_PERMIT_CONSUMED/);
    assert.deepEqual(previous, snapshot); assert.deepEqual(old, oldApproval);
  });
});

test("current approval must pass approvedTx before expired-permit renewal", async () => {
  for (const state of ["PENDING", "DENIED", "expired", "changed"]) {
    const f = await permitFixture(), first = await issuance(f, "old-request");
    await afterExpiry(first.expiresAt, async () => {
      const { requested } = await newApproval(f, state !== "PENDING");
      const row = f.rows.get(requested.approvalId);
      if (state === "DENIED") row.status = "DENIED";
      if (state === "expired") row.dueAt = new Date(0);
      if (state === "changed") row.revisedPlan.fingerprint = "a".repeat(64);
      const before = structuredClone([...f.records]);
      await assert.rejects(issuance(f, "fresh"), /EXACT_APPROVAL_REQUIRED|APPROVAL_EXPIRED/);
      assert.deepEqual([...f.records], before);
    });
  }
});

test("new approval cannot bypass consumed reservation or changed artifact/grant/connection bindings", async () => {
  for (const kind of ["consumed", "grant", "epoch", "workspace", "source"]) {
    const f = await permitFixture(), first = await issuance(f, "old-request");
    if (kind === "consumed") await consume(f, "old-request");
    await afterExpiry(first.expiresAt, async () => {
      await newApproval(f);
      if (kind === "grant") f.grant.grantId = "different-grant";
      if (kind === "epoch") f.device.connectionEpoch++;
      if (kind === "workspace") f.fresh.binding.version++;
      if (kind === "source") f.fresh.digest = "changed";
      const before = structuredClone([...f.records]);
      await assert.rejects(issuance(f, "fresh"));
      assert.deepEqual([...f.records], before);
    });
  }
});

test("same-request replay and consumption reject a newly approved generation", async () => {
  const f = await permitFixture(); await issuance(f, "same-request");
  await newApproval(f);
  const before = structuredClone([...f.records]);
  await assert.rejects(issuance(f, "same-request"), /EXACT_PERMIT_CHANGED/);
  await assert.rejects(consume(f, "same-request"), /EXACT_PERMIT_CHANGED/);
  assert.deepEqual([...f.records], before);
});

test("expired unused permit renews at current grant revision with unchanged approval and exact downstream consumption", async () => {
  const f = await permitFixture(), first = await issuance(f, "old-grant-request");
  const old = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId]]));
  const snapshot = structuredClone(old), approval = structuredClone(f.rows.get(f.a.approvalId));
  await afterExpiry(first.expiresAt, async () => {
    f.grant.version++;
    f.grant.capabilities.push("terminal.execute"); // Broader grant never broadens the exact actions.
    await assert.rejects(issuance(f, "old-grant-request"), /EXACT_PERMIT_CHANGED/);
    const next = await issuance(f, "new-grant-request");
    assert.equal(next.generation, 2);
    assert.deepEqual(next.binding, { ...first.binding, grantVersion: f.grant.version });
    assert.equal(next.binding.actionsDigest, toolDigest(f.p.actions));
    assert.deepEqual(old, snapshot); assert.deepEqual(f.rows.get(f.a.approvalId), approval);
    const persisted = f.records.get(JSON.stringify(["EXACT_EXECUTION_PERMIT", [...key, f.p.proposalId, 2]]));
    assert.ok(Date.parse(next.expiresAt) - persisted.createdAt.getTime() <= 60000);
    const count = f.events.length;
    assert.deepEqual(await issuance(f, "new-grant-request"), next); assert.equal(f.events.length, count);
    f.grant.version++;
    await assert.rejects(issuance(f, "new-grant-request"), /EXACT_PERMIT_CHANGED/);
    await assert.rejects(consume(f, "new-grant-request"), /EXACT_PERMIT_CHANGED/);
    f.grant.version--;
    assert.deepEqual(await consume(f, "new-grant-request"), next);
    f.records.delete(JSON.stringify(["EXACT_PERMIT_CONSUMPTION", next.permitId]));
    f.grant.version++;
    await assert.rejects(issuance(f, "third-grant-request"), /EXACT_PERMIT_CONSUMED/);
    await assert.rejects(consume(f, "new-grant-request"), /EXACT_PERMIT_CONSUMED/);
  });
});

test("renewal uses existing activeGrant validation for revoked, inactive, expired and capability-reduced grants", async () => {
  for (const kind of ["revoked", "inactive", "expired", "capabilities", "owner", "organization"]) {
    const f = await permitFixture(), first = await issuance(f, "old");
    await afterExpiry(first.expiresAt, async () => {
      f.grant.version++; f.grant.mode = "TRUSTED_MACHINE";
      f.records.set(JSON.stringify(["RUNTIME_GRANT", ["runtime", "project"]]), { payload: f.grant, immutable: false });
      f.device.status = "ACTIVE"; f.device.userId = f.claims.sub; f.device.organizationId = f.claims.organizationId;
      f.identity.ledger = f.ledger;
      f.identity.activeGrant = (...args: any[]) => (RuntimeIdentityService.prototype.activeGrant as any).apply(f.identity, args);
      if (kind === "revoked") f.grant.status = "REVOKED";
      if (kind === "inactive") f.grant.status = "INACTIVE";
      if (kind === "expired") f.grant.expiresAt = new Date(Date.now() - 1).toISOString();
      if (kind === "capabilities") f.grant.capabilities = ["filesystem.read"];
      if (kind === "owner") f.grant.userId = "other";
      if (kind === "organization") f.grant.organizationId = "other";
      const before = structuredClone([...f.records]);
      await assert.rejects(issuance(f, "fresh"), /RUNTIME_GRANT_INVALID|RUNTIME_GRANT_IDENTITY_INVALID|EXACT_PERMIT_RUNTIME_CHANGED/);
      assert.deepEqual([...f.records], before);
    });
  }
});

test("grant renewal cannot replace a consumed old permit or bypass admission race detection", async () => {
  for (const kind of ["consumed", "race"]) {
    const f = await permitFixture(), first = await issuance(f, "old");
    if (kind === "consumed") await consume(f, "old");
    await afterExpiry(first.expiresAt, async () => {
      f.grant.version++;
      if (kind === "race") f.evidence.admit = async () => { f.grant.version++; };
      const before = structuredClone([...f.records]);
      await assert.rejects(issuance(f, "fresh"), kind === "race" ? /EXACT_PERMIT_SOURCE_CHANGED/ : /EXACT_PERMIT_CONSUMED/);
      assert.deepEqual([...f.records], before);
    });
  }
});
