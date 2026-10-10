import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { readCoverageTx } from "../src/trusted-runtime/workspace-read-coverage";
import { WORKSPACE_READ_TOOLS } from "../src/trusted-runtime/runtime.contract";

async function inDevelopment(work: () => Promise<void>) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = "development";
  try { await work(); } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
}
async function fixture(write = false) {
  const h = await inspectionHarness();
  const e = await h.identity.configureCapabilities(h.claims, { runtimeId: h.device.runtimeId, projectId: "project-a", mode: "TRUSTED_MACHINE", expectedRevision: 0,
    capabilities: [...WORKSPACE_READ_TOOLS, ...(write ? ["filesystem.write" as const] : [])] });
  const body = { runtimeId: h.device.runtimeId, projectId: "project-a", requestId: "development-renew", enrollmentRevision: e.revision, expectedGrantVersion: 1, durationSeconds: 3600 };
  const g = await h.identity.renewGrant(h.claims, body);
  const consent = await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: g.version, durationMinutes: 60, requestId: "development-consent" });
  const active = (readOnly = true, version = g.version) => h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a", version, readOnly));
  const coverage = (grant = g, binding = h.binding, tool = "filesystem.read") => h.ledger.transaction(tx => readCoverageTx(h.ledger, tx, grant, { ...binding, bindingVersion: binding.version }, tool, `${binding.rootPath}\\session.ts`));
  const expireGrant = () => h.ledger.transaction(async tx => {
    const row = await h.ledger.read<any>(tx, "RUNTIME_GRANT", [h.device.runtimeId, "project-a"]);
    return (await h.ledger.update(tx, row!, { ...row!.payload, expiresAt: new Date(Date.now() - 1000).toISOString() })).payload;
  });
  return { ...h, e, g, body, consent, active, coverage, expireGrant };
}

test("development explicit enrolled reads and consent have no expiry, renewal replay stays identical and audited", () => inDevelopment(async () => {
  const h = await fixture();
  assert.equal(h.g.expiresAt, null); assert.equal(h.consent.expiresAt, null);
  assert.deepEqual(await h.identity.renewGrant(h.claims, h.body), h.g);
  assert.equal((await h.coverage())?.lifecycle, "DEVELOPMENT_ENROLLED_READ");
  assert.ok([...h.tables.auditEvent.values()].some(r => r.metadata.recordType === "RUNTIME_GRANT_RENEWAL"));
  assert.equal(h.g.version, 2); assert.equal(h.e.revision, 1);
}));

test("historical timed grants and consent remain immutable and usable for development reads without renewal", async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  let h: Awaited<ReturnType<typeof fixture>>;
  try { h = await fixture(); } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  assert.ok(h.g.expiresAt); assert.ok(h.consent.expiresAt);
  const oldNow = Date.now, later = oldNow() + 3601000;
  Date.now = () => later;
  try { await inDevelopment(async () => {
    const before = structuredClone([...h.tables.auditEvent]);
    assert.equal((await h.active()).persistentReadAccess, true);
    assert.equal((await h.coverage())?.consent.fingerprint, h.consent.fingerprint);
    assert.deepEqual([...h.tables.auditEvent], before);
    await assert.rejects(() => h.active(true, h.g.version + 1), /RUNTIME_GRANT_INVALID/);
  }); } finally { Date.now = oldNow; }
});

test("expired mixed grant admits only reads; write grant admission and write coverage still fail closed", () => inDevelopment(async () => {
  const h = await fixture(true), expired = await h.expireGrant();
  assert.equal((await h.active()).persistentReadAccess, true);
  assert.ok(await h.coverage(expired));
  await assert.rejects(() => h.active(false), /RUNTIME_GRANT_INVALID/);
  await assert.rejects(() => h.coverage(expired, h.binding, "filesystem.write"), /WORKSPACE_READ_GRANT_INVALID/);
}));

test("historical grants cannot infer enrollment and a forged presentation flag cannot authorize reads", () => inDevelopment(async () => {
  const h = await inspectionHarness();
  const raw = await h.ledger.transaction(async tx => {
    const row = await h.ledger.read<any>(tx, "RUNTIME_GRANT", [h.device.runtimeId, "project-a"]);
    return (await h.ledger.update(tx, row!, { ...row!.payload, expiresAt: new Date(Date.now() - 1).toISOString() })).payload;
  });
  await assert.rejects(() => h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a", undefined, true)), /RUNTIME_GRANT_INVALID/);
  const c = await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: raw.version, durationMinutes: 60 });
  assert.notEqual(c.expiresAt, null);
  await assert.rejects(() => h.ledger.transaction(tx => readCoverageTx(h.ledger, tx, { ...raw, persistentReadAccess: true }, { ...h.binding, bindingVersion: h.binding.version }, "filesystem.read", `${h.binding.rootPath}\\session.ts`)), /WORKSPACE_READ_GRANT_INVALID/);
}));

for (const boundary of ["runtime", "grant", "enrollment", "revision", "fingerprint"] as const)
  test(`development persistent reading rejects changed/revoked ${boundary}`, () => inDevelopment(async () => {
    const h = await fixture();
    await h.ledger.transaction(async tx => {
      const kind = boundary === "runtime" || boundary === "fingerprint" ? "RUNTIME_DEVICE" : boundary === "grant" ? "RUNTIME_GRANT" : "RUNTIME_CAPABILITY_ENROLLMENT";
      const key = kind === "RUNTIME_DEVICE" ? h.device.runtimeId : kind === "RUNTIME_GRANT" ? [h.device.runtimeId, "project-a"] : [h.claims.sub, h.claims.organizationId, "project-a", h.device.runtimeId];
      const row = kind === "RUNTIME_DEVICE" ? await h.identity.device(tx, h.device.runtimeId) : await h.ledger.read<any>(tx, kind, key);
      await h.ledger.update(tx, row!, { ...row!.payload, ...(boundary === "revision" ? { revision: row!.payload.revision + 1 } : boundary === "fingerprint" ? { fingerprint: "changed" } : { status: "REVOKED", revokedAt: new Date().toISOString() }) });
    });
    await assert.rejects(h.active, /RUNTIME_GRANT/);
  }));

test("revoked consent, different binding, and sensitive paths still fail closed", () => inDevelopment(async () => {
  const h = await fixture();
  assert.equal(await h.coverage(h.g, { ...h.binding, version: h.binding.version + 1 }), undefined);
  await assert.rejects(() => h.ledger.transaction(tx => readCoverageTx(h.ledger, tx, h.g, { ...h.binding, bindingVersion: h.binding.version }, "filesystem.read", `${h.binding.rootPath}\\.env`)), /WORKSPACE_READ_PATH_DENIED|FILE_SECURITY|Sensitive/);
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: h.g.version, requestId: "revoke-consent" }, true);
  await assert.rejects(h.coverage, /WORKSPACE_READ_GRANT_INVALID/);
}));

test("signed read dispatch/start uses persistent consent without renewal or any write capability", () => inDevelopment(async () => {
  const h = await fixture(), expired = await h.expireGrant();
  const op = await h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "READ", { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId: "development-read", relativePath: "session.ts" });
  assert.equal(op.state, "EXECUTING");
  const e = (await h.request("poll")).execution;
  assert.equal(e.attribution.workspaceRead.lifecycle, "DEVELOPMENT_ENROLLED_READ");
  assert.equal(e.attribution.grantVersion, expired.version);
  await h.complete(e);
  assert.equal((await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, op.operation.operationId)).state, "READY");
  assert.deepEqual((await h.active()).capabilities, h.g.capabilities);
  assert.equal([...h.tables.auditEvent.values()].filter(r => r.metadata.recordType === "RUNTIME_GRANT_RENEWAL").length, 1);
}));

test("production keeps timed read grant and consent expiry", async () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  try { const h = await fixture(); assert.ok(h.g.expiresAt); assert.ok(h.consent.expiresAt);
    await h.expireGrant(); await assert.rejects(h.active, /RUNTIME_GRANT_INVALID/);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test("persistent read policy does not bypass durable session authentication", () => inDevelopment(async () => {
  const h = await fixture();
  h.tables.userSession.get(h.claims.sessionId)!.revokedAt = new Date();
  await assert.rejects(() => h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "READ", { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId: "revoked-session", relativePath: "session.ts" }), /SESSION/);
}));
