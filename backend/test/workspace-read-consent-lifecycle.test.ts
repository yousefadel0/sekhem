import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { workspaceReadConsentTx } from "../src/trusted-runtime/workspace-read-coverage";
import { runtimeKey } from "../src/trusted-runtime/runtime.contract";
import { RuntimeController } from "../src/trusted-runtime/runtime.controller";

async function fixture(write = false) {
  const h = await inspectionHarness();
  if (write) await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search", "filesystem.write"]);
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  const key = [h.claims.sub, h.claims.organizationId, "project-a", h.binding.workspaceId, h.binding.version];
  const allow = (requestId?: string) => h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId,
    { bindingVersion: h.binding.version, expectedGrantVersion: grant.version, durationMinutes: 1, ...(requestId ? { requestId } : {}) });
  const read = () => h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "READ",
    { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId: "read", relativePath: "session.ts" });
  return { ...h, grant, key, allow, read };
}

for (const write of [false, true]) test(`expired read consent renews independently; write capability remains ${write ? "present" : "absent"}`, async () => {
  const h = await fixture(write), first = await h.allow("consent-1"), grantRow = structuredClone(h.tables.auditEvent.get(h.grant.grantId));
  const oldRevision = structuredClone(h.tables.auditEvent.get(runtimeKey("RUNTIME_REVISION", [runtimeKey("WORKSPACE_READ_CONSENT", h.key), 1])));
  const original = Date.now;
  try {
    Date.now = () => Date.parse(first.expiresAt) + 1;
    await h.ledger.transaction(async tx => { const d = await h.identity.device(tx, h.device.runtimeId); await h.ledger.update(tx, d, { ...d.payload, lastSeenAt: new Date(Date.now()).toISOString() }); });
    await assert.rejects(h.read, /WORKSPACE_READ_GRANT_INVALID/);
    const renewed = await h.allow("consent-2"); assert.equal(renewed.version, first.version + 1);
    assert.deepEqual(h.tables.auditEvent.get(h.grant.grantId), grantRow);
    assert.deepEqual(h.tables.auditEvent.get(oldRevision.id), oldRevision);
    assert.equal(grantRow.metadata.payload.capabilities.includes("filesystem.write"), write);
    assert.deepEqual(await h.allow("consent-2"), renewed);
  } finally { Date.now = original; }
});

test("read consent creation and request replay create only consent ledger/audit records", async () => {
  const h = await fixture(true), before = structuredClone([...h.tables.auditEvent]);
  const approvals = h.tables.agentApproval.size, events = h.tables.agentRunEvent.size;
  const c = await h.allow("consent-request"), after = structuredClone([...h.tables.auditEvent]);
  assert.deepEqual(await h.allow("consent-request"), c); assert.deepEqual([...h.tables.auditEvent], after);
  for (const [id, row] of before) assert.deepEqual(h.tables.auditEvent.get(id), row);
  assert.deepEqual(after.filter(([id]) => !before.some(([old]) => id === old)).map(([,r]) => r.metadata.recordType).sort(),
    ["RUNTIME_REVISION", "WORKSPACE_READ_CONSENT", "WORKSPACE_READ_CONSENT_REQUEST"]);
  assert.equal(h.tables.agentApproval.size, approvals); assert.equal(h.tables.agentRunEvent.size, events);
  await assert.rejects(() => h.ledger.transaction(async tx => {
    const row = await h.ledger.read(tx, "RUNTIME_REVISION", [runtimeKey("WORKSPACE_READ_CONSENT", h.key), 1]);
    await h.ledger.update(tx, row!, {});
  }), /RUNTIME_RECORD_IMMUTABLE/);
});

for (const missing of [false, true]) test(`${missing ? "missing" : "expired"} runtime grant is never synthesized or renewed by reading consent`, async () => {
  const h = await fixture();
  if (missing) { h.tables.auditEvent.delete(h.grant.grantId); h.grant.version = 0; }
  else await h.ledger.transaction(async tx => { const g = await h.ledger.read<any>(tx, "RUNTIME_GRANT", [h.device.runtimeId, "project-a"]); await h.ledger.update(tx, g!, { ...g!.payload, expiresAt: new Date(0).toISOString() }); });
  const before = structuredClone(h.tables.auditEvent.get(h.grant.grantId));
  await h.allow(); assert.deepEqual(h.tables.auditEvent.get(h.grant.grantId), before);
  await assert.rejects(h.read, /EXPIRED_GRANT|UNAUTHORIZED|RUNTIME_GRANT_INVALID/i);
});

test("renewal cannot inject capabilities or enrollment and retains exact current grant version", async () => {
  const h = await fixture(true), c = await h.allow();
  for (const extra of [{ capabilities: ["filesystem.delete"] }, { enrollmentRevision: 99 }, { expiresAt: null }])
    await assert.rejects(() => h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId,
      { bindingVersion: h.binding.version, expectedGrantVersion: h.grant.version, durationMinutes: 1, ...extra }));
  assert.equal((await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a", h.grant.version))).version, h.grant.version);
  assert.equal((await workspaceReadConsentTx(h.ledger, h.db, { ...h.binding, bindingVersion: h.binding.version }, h.grant))!.fingerprint, c.fingerprint);
  assert.equal([...h.tables.auditEvent.values()].filter(r => r.metadata.recordType === "RUNTIME_CAPABILITY_ENROLLMENT").length, 0);
});

test("standalone revocation overrides historical inline consent without changing grant", async () => {
  const h = await fixture(), consent = await h.allow();
  await h.ledger.transaction(async tx => { const g = await h.ledger.read<any>(tx, "RUNTIME_GRANT", [h.device.runtimeId, "project-a"]); await h.ledger.update(tx, g!, { ...g!.payload, workspaceRead: consent }); });
  h.grant.version = (await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"))).version;
  const before = structuredClone(h.tables.auditEvent.get(h.grant.grantId));
  const revoked = await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: h.grant.version, requestId: "revoke" }, true);
  assert.equal(revoked.status, "REVOKED"); assert.deepEqual(h.tables.auditEvent.get(h.grant.grantId), before);
  await assert.rejects(h.read, /WORKSPACE_READ_GRANT_INVALID/);
});

test("request replay after consent expiry fails closed instead of extending it", async () => {
  const h = await fixture(), c = await h.allow("original"), now = Date.now;
  try { Date.now = () => Date.parse(c.expiresAt) + 1;
    await assert.rejects(() => h.allow("original"), /WORKSPACE_READ_GRANT_INVALID/);
  } finally { Date.now = now; }
});

test("consent renewal enforces saved binding and runtime identity without touching grant", async () => {
  const h = await fixture(true), before = structuredClone(h.tables.auditEvent.get(h.grant.grantId));
  await assert.rejects(() => h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId,
    { bindingVersion: h.binding.version + 1, expectedGrantVersion: h.grant.version, durationMinutes: 1 }), /WORKSPACE_BINDING_CHANGED/);
  await h.ledger.transaction(async tx => {
    const d = await h.identity.device(tx, h.device.runtimeId);
    await h.ledger.update(tx, d, { ...d.payload, fingerprint: "changed-fingerprint" });
  });
  await assert.rejects(() => h.allow("changed-runtime"));
  assert.deepEqual(h.tables.auditEvent.get(h.grant.grantId), before);
  assert.equal([...h.tables.auditEvent.values()].filter(r => r.metadata.recordType === "WORKSPACE_READ_CONSENT").length, 0);
});

test("consent renewal requires current actor session and reviewer authority", async () => {
  const h = await fixture(), before = structuredClone([...h.tables.auditEvent]);
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: new Date() } });
  await assert.rejects(() => h.allow("revoked-session"));
  assert.deepEqual([...h.tables.auditEvent], before);
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: null } });
  await h.db.user.update({ where: { id: h.claims.sub }, data: { roles: [] } });
  await assert.rejects(() => h.allow("lost-reviewer"));
  assert.deepEqual([...h.tables.auditEvent], before);
});

test("concurrent consent request replay creates one audited revision with independent duration", async () => {
  const h = await fixture(true), grantBefore = structuredClone(h.tables.auditEvent.get(h.grant.grantId));
  const [a, b] = await Promise.all([h.allow("concurrent"), h.allow("concurrent")]);
  assert.deepEqual(a, b);
  assert.equal(Date.parse(a.expiresAt) - Date.parse(a.approvedAt), 60000);
  assert.equal([...h.tables.auditEvent.values()].filter(r => r.metadata.recordType === "WORKSPACE_READ_CONSENT").length, 1);
  assert.equal([...h.tables.auditEvent.values()].filter(r => r.metadata.recordType === "WORKSPACE_READ_CONSENT_REQUEST").length, 1);
  assert.deepEqual(h.tables.auditEvent.get(h.grant.grantId), grantBefore);
});

test("grant inventory projects independent consent without rewriting persisted grants", async () => {
  const h = await fixture(true), c = await h.allow(), before = structuredClone([...h.tables.auditEvent]);
  const controller = new RuntimeController({ validateDurableSession: async () => h.claims } as any, h.identity, h.control);
  const inventory: any = await controller.grants("authenticated");
  assert.deepEqual(inventory.data.find((g: any) => g.grantId === h.grant.grantId).workspaceRead, c);
  assert.deepEqual([...h.tables.auditEvent], before);
});
