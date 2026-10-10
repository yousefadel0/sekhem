import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { RuntimeController } from "../src/trusted-runtime/runtime.controller";
import { RuntimeIdentityService } from "../src/trusted-runtime/runtime-identity.service";

async function fixture(configure = true) {
  const h = await inspectionHarness();
  const e = configure ? await h.identity.configureCapabilities(h.claims, { runtimeId: h.device.runtimeId, projectId: "project-a",
    mode: "TRUSTED_MACHINE", expectedRevision: 0, capabilities: ["filesystem.read", "filesystem.write", "filesystem.search", "filesystem.list"] }) : null;
  const g = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  const body = { runtimeId: h.device.runtimeId, projectId: "project-a", requestId: "renew-1", enrollmentRevision: e?.revision ?? 1,
    expectedGrantVersion: g.version, durationSeconds: 3600 };
  const snapshot = () => structuredClone([...h.tables.auditEvent]);
  return { ...h, e, g, body, snapshot };
}
async function changeEnrollment(h: Awaited<ReturnType<typeof fixture>>, changes: object) {
  return h.ledger.transaction(async tx => {
    const key = [h.claims.sub, h.claims.organizationId, "project-a", h.device.runtimeId];
    const r = await h.ledger.read<any>(tx, "RUNTIME_CAPABILITY_ENROLLMENT", key);
    const next = await h.ledger.update(tx, r!, JSON.parse(JSON.stringify({ ...r!.payload, ...changes, revision: r!.revision + 1 })));
    h.body.enrollmentRevision = next.revision;
  });
}

test("work-session renewal supports more than one hour without changing saved tools", async () => {
  const h = await fixture();
  h.claims.exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(h.claims.exp * 1000);
  const before = Date.now();
  const grant = await h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 8 * 3600 });
  assert.ok(Date.parse(grant.expiresAt!) >= before + 7 * 3600000);
  assert.ok(Date.parse(grant.expiresAt!) <= Date.now() + 8 * 3600000);
  assert.deepEqual(grant.capabilities, h.e!.capabilities);
  assert.equal(grant.enrollment!.revision, h.e!.revision);
});

for (const ceiling of ["token", "durable-session", "enrollment"] as const) test(`work-session renewal respects ${ceiling} expiry`, async () => {
  const h = await fixture();
  h.claims.exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(h.claims.exp * 1000);
  const limit = Math.floor(Date.now() / 1000) * 1000 + 90 * 60000;
  if (ceiling === "token") h.claims.exp = limit / 1000;
  if (ceiling === "durable-session") h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(limit);
  if (ceiling === "enrollment") await changeEnrollment(h, { expiresAt: new Date(limit).toISOString() });
  const grant = await h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 8 * 3600 });
  assert.equal(Date.parse(grant.expiresAt!), limit);
});

test("renewal from enrollment 2 to 3 restores existing binding without changing consent or executing", async () => {
  const h = await fixture();
  const configure = (revision: number, capabilities: any[]) => h.identity.configureCapabilities(h.claims, {
    runtimeId: h.device.runtimeId, projectId: "project-a", mode: "TRUSTED_MACHINE", expectedRevision: revision, capabilities });
  const e2 = await configure(1, h.e!.capabilities.filter(c => c !== "filesystem.write"));
  const g2 = await h.identity.renewGrant(h.claims, { ...h.body, enrollmentRevision: e2.revision });
  const e3 = await configure(2, [...h.e!.capabilities, "terminal.execute"]);
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    await assert.rejects(() => h.runtime.getBinding(h.claims, "project-a", h.binding.workspaceId), /RUNTIME_GRANT_INVALID/);
    const before = h.snapshot();
    const request = { ...h.body, requestId: "renew-enrollment-3", enrollmentRevision: 3, expectedGrantVersion: g2.version };
    const renewed = await h.identity.renewGrant(h.claims, request);
    assert.equal(renewed.enrollment!.revision, 3);
    assert.equal(renewed.version, g2.version + 1);
    assert.deepEqual(renewed.capabilities, e3.capabilities);
    assert.equal((await h.runtime.getBinding(h.claims, "project-a", h.binding.workspaceId)).status, "READY");
    for (const [id, row] of before) if (id !== renewed.grantId) assert.deepEqual(h.tables.auditEvent.get(id), row);
    const after = h.snapshot();
    await h.identity.renewGrant(h.claims, request);
    assert.deepEqual(h.snapshot(), after);
  } finally { if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv; }
});

test("renewal copies explicit enrollment server-side and leaves configuration and all unrelated records unchanged", async () => {
  const h = await fixture();
  // Create consent through the production service, backed by the in-memory test ledger.
  const consent = await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: h.g.version, durationMinutes: 60 });
  const old = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  h.body.expectedGrantVersion = old.version;
  const before = h.snapshot();
  const renewed = await h.identity.renewGrant(h.claims, h.body);
  assert.deepEqual(renewed.capabilities, h.e!.capabilities);
  assert.equal(renewed.version, old.version + 1); assert.equal(renewed.grantId, old.grantId);
  assert.deepEqual(renewed.workspaceRead, old.workspaceRead, "grant renewal never changes legacy inline reading consent");
  const consentRow = await h.ledger.transaction(tx => h.ledger.read(tx, "WORKSPACE_READ_CONSENT", [h.claims.sub, h.claims.organizationId, "project-a", h.binding.workspaceId, h.binding.version]));
  assert.deepEqual(consentRow!.payload, consent, "grant renewal never changes independent reading consent");
  assert.deepEqual(renewed.enrollment, { enrollmentId: h.e!.enrollmentId, revision: h.e!.revision, runtimeFingerprint: h.device.fingerprint });
  assert.ok(Date.parse(renewed.expiresAt!) <= h.claims.exp * 1000);
  assert.ok(Date.parse(renewed.expiresAt!) <= Date.now() + 3600000);
  for (const [id, row] of before) if (id !== renewed.grantId) assert.deepEqual(h.tables.auditEvent.get(id), row);
  assert.deepEqual(await h.identity.capabilityEnrollment(h.claims, h.device.runtimeId, "project-a"), h.e);
  const added = h.snapshot().filter(([id]) => !before.some(([oldId]) => oldId === id));
  assert.deepEqual(added.map(([,r]) => r.metadata.recordType).sort(), ["RUNTIME_GRANT_RENEWAL", "RUNTIME_REVISION"]);
  const revision = await h.ledger.transaction(tx => h.ledger.read(tx, "RUNTIME_REVISION", [renewed.grantId, renewed.version]));
  assert.equal(revision!.immutable, true);
  await assert.rejects(() => h.ledger.transaction(tx => h.ledger.update(tx, revision!, {})), /RUNTIME_RECORD_IMMUTABLE/);
});

for (const extra of [{ capabilities: ["filesystem.write"] }, { capabilities: [] }, { capabilities: ["filesystem.read"] },
  { expiresAt: null }, { enrollment: {} }, { durationSeconds: 28801 }, { durationSeconds: 0 }])
  test(`client cannot override capability ceiling or expiry policy: ${JSON.stringify(extra)}`, async () => {
    const h = await fixture(), before = h.snapshot();
    await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, ...extra }), /RUNTIME_GRANT_RENEWAL_INVALID/);
    assert.deepEqual(h.snapshot(), before);
  });

test("historical grants without enrollment cannot renew", async () => {
  const h = await fixture(false), before = h.snapshot();
  await assert.rejects(() => h.identity.renewGrant(h.claims, h.body), /RUNTIME_CAPABILITY_ENROLLMENT_INVALID/);
  assert.deepEqual(h.snapshot(), before);
});

for (const [label, changes] of [["revoked", { status: "REVOKED", revokedAt: new Date().toISOString() }],
  ["expired", { expiresAt: new Date(0).toISOString() }], ["invalid-expiry", { expiresAt: "invalid" }],
  ["legacy-missing-lifecycle", { status: undefined, expiresAt: undefined }], ["fingerprint", { runtimeFingerprint: "changed" }],
  ["foreign-scope", { organizationId: "other-org" }]] as const)
  test(`invalid enrollment rejects renewal: ${label}`, async () => {
    const h = await fixture(); await changeEnrollment(h, changes); const before = h.snapshot();
    await assert.rejects(() => h.identity.renewGrant(h.claims, h.body));
    assert.deepEqual(h.snapshot(), before);
  });

test("stale enrollment or grant version fails without rotation", async () => {
  const h = await fixture(), before = h.snapshot();
  await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, enrollmentRevision: 99 }), /RUNTIME_CAPABILITY_ENROLLMENT_CHANGED/);
  await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, expectedGrantVersion: 99 }), /RUNTIME_GRANT_CHANGED/);
  assert.deepEqual(h.snapshot(), before);
});

for (const kind of ["session-revoked", "session-expired", "user-inactive", "foreign-org", "viewer", "runtime-revoked", "runtime-fingerprint"])
  test(`renewal revalidates current authority: ${kind}`, async () => {
    const h = await fixture(), claims = { ...h.claims };
    if (kind === "session-revoked") h.tables.userSession.get(claims.sessionId).revokedAt = new Date();
    if (kind === "session-expired") h.tables.userSession.get(claims.sessionId).expiresAt = new Date(0);
    if (kind === "user-inactive") h.tables.user.get(claims.sub).status = "disabled";
    if (kind === "foreign-org") claims.organizationId = "other-org";
    if (kind === "viewer") h.tables.user.get(claims.sub).roles = [{ role: { key: "Viewer" } }];
    if (kind.startsWith("runtime-")) await h.ledger.transaction(async tx => {
      const r = await h.identity.device(tx, h.device.runtimeId);
      await h.ledger.update(tx, r, { ...r.payload, ...(kind === "runtime-revoked" ? { status: "REVOKED" as const } : { fingerprint: "changed" }) });
    });
    const before = h.snapshot(); await assert.rejects(() => h.identity.renewGrant(claims, h.body)); assert.deepEqual(h.snapshot(), before);
  });

test("same valid request replays exact issuance after service reload with no additional revision", async () => {
  const h = await fixture(), grant = await h.identity.renewGrant(h.claims, h.body), before = h.snapshot();
  assert.deepEqual(await new RuntimeIdentityService(h.ledger).renewGrant(h.claims, h.body), grant);
  assert.deepEqual(h.snapshot(), before);
  await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 300 }), /RUNTIME_GRANT_RENEWAL_CONFLICT/);
});

test("expired or superseded issuance replay cannot revive authorization", async () => {
  const h = await fixture(), first = await h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 1 });
  const original = Date.now;
  try { Date.now = () => Date.parse(first.expiresAt!) + 1;
    await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 1 }), /RUNTIME_GRANT_INVALID/);
  } finally { Date.now = original; }
  const next = await h.identity.renewGrant(h.claims, { ...h.body, requestId: "renew-2", expectedGrantVersion: first.version });
  await assert.rejects(() => h.identity.renewGrant(h.claims, { ...h.body, durationSeconds: 1 }), /RUNTIME_GRANT_RENEWAL_SUPERSEDED/);
  await assert.rejects(() => h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a", first.version)), /RUNTIME_GRANT_INVALID/);
  assert.equal((await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a", next.version))).version, next.version);
});

test("lease is capped by durable session, token and enrollment expiry", async () => {
  const h = await fixture();
  h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(Date.now() + 30000);
  await changeEnrollment(h, { expiresAt: new Date(Date.now() + 20000).toISOString() });
  const grant = await h.identity.renewGrant(h.claims, h.body);
  assert.equal(grant.expiresAt, (await h.identity.capabilityEnrollment(h.claims, h.device.runtimeId, "project-a"))!.expiresAt);
  assert.ok(Date.parse(grant.expiresAt!) <= +h.tables.userSession.get(h.claims.sessionId).expiresAt);
});

test("concurrent renewal has one revision and duplicate request has exact replay", async () => {
  const h = await fixture();
  const results = await Promise.all([h.identity.renewGrant(h.claims, h.body), h.identity.renewGrant(h.claims, h.body)]);
  assert.deepEqual(results[0], results[1]); assert.equal(results[0].version, h.g.version + 1);
});

test("renewal controller authenticates and never calls configuration, approval or execution", async () => {
  const calls: string[] = []; const input = { requestId: "one" }; const claims: any = { sub: "user" };
  const c = new RuntimeController({ validateDurableSession: async () => { calls.push("auth"); return claims; } } as any,
    { renewGrant: async (actor: any, body: any) => { assert.equal(actor, claims); assert.equal(body, input); calls.push("renew"); return {}; } } as any, {} as any);
  await c.renewGrant("cookie", input); assert.deepEqual(calls, ["auth", "renew"]);
});

test("legacy explicit enrollment remains readable but requires explicit lifecycle configuration before renewal", async () => {
  const h = await fixture(); await changeEnrollment(h, { status: undefined, expiresAt: undefined, revokedAt: undefined });
  const legacy = await h.identity.capabilityEnrollment(h.claims, h.device.runtimeId, "project-a");
  assert.equal(legacy!.status, undefined);
  await assert.rejects(() => h.identity.renewGrant(h.claims, h.body), /RUNTIME_CAPABILITY_ENROLLMENT_INVALID/);
  const configured = await h.identity.configureCapabilities(h.claims, { runtimeId: h.device.runtimeId, projectId: "project-a", mode: "TRUSTED_MACHINE",
    expectedRevision: legacy!.revision, capabilities: legacy!.capabilities });
  assert.equal(configured.status, "ACTIVE"); assert.equal(configured.revision, legacy!.revision + 1);
  assert.deepEqual(configured.capabilities, legacy!.capabilities);
  const renewed = await h.identity.renewGrant(h.claims, { ...h.body, enrollmentRevision: configured.revision });
  assert.deepEqual(renewed.capabilities, configured.capabilities);
});

test("replay never borrows a different valid session and revoked enrollment blocks replay", async () => {
  const h = await fixture(); await h.identity.renewGrant(h.claims, h.body);
  const claims = { ...h.claims, sessionId: "session-other" };
  h.tables.userSession.set(claims.sessionId, { ...h.tables.userSession.get(h.claims.sessionId), id: claims.sessionId });
  await assert.rejects(() => h.identity.renewGrant(claims, h.body), /RUNTIME_GRANT_RENEWAL_CONFLICT/);
  await changeEnrollment(h, { status: "REVOKED", revokedAt: new Date().toISOString() });
  await assert.rejects(() => h.identity.renewGrant(h.claims, h.body), /RUNTIME_CAPABILITY_ENROLLMENT_INVALID/);
});

test("token expiry caps a shorter lease without extending authentication", async () => {
  const h = await fixture(), claims = { ...h.claims, exp: Math.floor(Date.now() / 1000) + 10 };
  const sessionBefore = structuredClone(h.tables.userSession.get(claims.sessionId));
  const renewed = await h.identity.renewGrant(claims, h.body);
  assert.equal(Date.parse(renewed.expiresAt!), claims.exp * 1000);
  assert.deepEqual(h.tables.userSession.get(claims.sessionId), sessionBefore);
});
