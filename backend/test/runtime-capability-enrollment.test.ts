import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { RuntimeController } from "../src/trusted-runtime/runtime.controller";
import { RuntimeIdentityService } from "../src/trusted-runtime/runtime-identity.service";
import { runtimeKey } from "../src/trusted-runtime/runtime.contract";

const body = (h: Awaited<ReturnType<typeof inspectionHarness>>, expectedRevision = 0, capabilities = ["filesystem.read"]) =>
  ({ runtimeId: h.device.runtimeId, projectId: "project-a", mode: "TRUSTED_MACHINE", expectedRevision, capabilities });
const snapshot = (h: Awaited<ReturnType<typeof inspectionHarness>>) => structuredClone([...h.tables.auditEvent.values()]);

test("historical grants and inspection records never synthesize enrollment, including after reload", async () => {
  const h = await inspectionHarness(), before = snapshot(h);
  assert.equal(await h.identity.capabilityEnrollment(h.claims, h.device.runtimeId, "project-a"), null);
  assert.equal(await new RuntimeIdentityService(h.ledger).capabilityEnrollment(h.claims, h.device.runtimeId, "project-a"), null);
  assert.deepEqual(snapshot(h), before);
});

test("explicit configuration persists scoped ceiling and provenance without changing any existing record", async () => {
  const h = await inspectionHarness(), before = snapshot(h);
  const e = await h.identity.configureCapabilities(h.claims, body(h, 0, ["filesystem.write", "filesystem.read"]));
  assert.equal(e.revision, 1); assert.equal(e.userId, h.claims.sub); assert.equal(e.organizationId, h.claims.organizationId);
  assert.equal(e.projectId, "project-a"); assert.equal(e.runtimeId, h.device.runtimeId); assert.equal(e.runtimeFingerprint, h.device.fingerprint);
  assert.equal(e.configuredBy, h.claims.sub); assert.ok(Number.isFinite(Date.parse(e.configuredAt)));
  assert.deepEqual(e.capabilities, ["filesystem.read", "filesystem.write"]);
  for (const r of before) assert.deepEqual(h.tables.auditEvent.get(r.id), r);
  const added = snapshot(h).filter(r => !before.some(b => b.id === r.id));
  assert.deepEqual(added.map(r => r.metadata.recordType).sort(), ["RUNTIME_CAPABILITY_ENROLLMENT", "RUNTIME_REVISION"]);
  assert.deepEqual(await new RuntimeIdentityService(h.ledger).capabilityEnrollment(h.claims, h.device.runtimeId, "project-a"), e);
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  assert.ok(!grant.capabilities.includes("filesystem.write"), "enrollment cannot grant operational write capability");
});

test("configuration revisions are retained immutably; no-op configuration does not expand or revise", async () => {
  const h = await inspectionHarness(), first = await h.identity.configureCapabilities(h.claims, body(h));
  const revisionId = runtimeKey("RUNTIME_REVISION", [first.enrollmentId, 1]);
  const retained = structuredClone(h.tables.auditEvent.get(revisionId));
  assert.deepEqual(await h.identity.configureCapabilities(h.claims, body(h, 1)), first);
  const second = await h.identity.configureCapabilities(h.claims, body(h, 1, ["filesystem.read", "filesystem.write"]));
  assert.equal(second.revision, 2); assert.deepEqual(h.tables.auditEvent.get(revisionId), retained);
  await assert.rejects(() => h.ledger.transaction(async tx => {
    const row = await h.ledger.read(tx, "RUNTIME_REVISION", [first.enrollmentId, 1]);
    await h.ledger.update(tx, row!, {});
  }), /RUNTIME_RECORD_IMMUTABLE/);
  await assert.rejects(() => h.identity.configureCapabilities(h.claims, body(h, 1, ["filesystem.delete"])), /RUNTIME_CAPABILITY_ENROLLMENT_CHANGED/);
});

for (const kind of ["missing-acknowledgment", "unknown", "duplicates", "missing-list", "extra-authority", "invalid-revision"])
  test(`invalid or implicit configuration fails closed: ${kind}`, async () => {
    const h = await inspectionHarness(), input: any = body(h), before = snapshot(h);
    if (kind === "missing-acknowledgment") delete input.mode;
    if (kind === "unknown") input.capabilities = ["filesystem.superwrite"];
    if (kind === "duplicates") input.capabilities = ["filesystem.read", "filesystem.read"];
    if (kind === "missing-list") delete input.capabilities;
    if (kind === "extra-authority") input.grantVersion = 99;
    if (kind === "invalid-revision") input.expectedRevision = -1;
    await assert.rejects(() => h.identity.configureCapabilities(h.claims, input), /RUNTIME_CAPABILITY_ENROLLMENT_INVALID/);
    assert.deepEqual(snapshot(h), before);
  });

for (const kind of ["owner", "organization", "project", "inactive-runtime", "expired-session", "revoked-session", "viewer"])
  test(`existing authorization rejects enrollment configuration: ${kind}`, async () => {
    const h = await inspectionHarness(), input = body(h), claims = { ...h.claims };
    if (kind === "owner") { h.tables.user.set("other", { ...h.tables.user.get(claims.sub), id: "other" }); claims.sub = "other"; h.tables.userSession.get(claims.sessionId).userId = "other"; }
    if (kind === "organization") claims.organizationId = "other-org";
    if (kind === "project") h.tables.project.get("project-a").organizationId = "other-org";
    if (kind === "inactive-runtime") await h.ledger.transaction(async tx => {
      const row = await h.identity.device(tx, h.device.runtimeId);
      await h.ledger.update(tx, row, { ...row.payload, status: "REVOKED" });
    });
    if (kind === "expired-session") h.tables.userSession.get(claims.sessionId).expiresAt = new Date(0);
    if (kind === "revoked-session") h.tables.userSession.get(claims.sessionId).revokedAt = new Date();
    if (kind === "viewer") h.tables.user.get(claims.sub).roles = [{ role: { key: "Viewer" } }];
    const before = snapshot(h);
    await assert.rejects(() => h.identity.configureCapabilities(claims, input));
    assert.deepEqual(snapshot(h), before);
  });

test("concurrent configuration with the same expected revision has one winner", async () => {
  const h = await inspectionHarness();
  const results = await Promise.allSettled([h.identity.configureCapabilities(h.claims, body(h)), h.identity.configureCapabilities(h.claims, body(h, 0, ["filesystem.write"]))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
});

test("dedicated enrollment endpoint authenticates explicit configuration without invoking grant or execution", async () => {
  const calls: string[] = [];
  const claims: any = { sub: "user-a" };
  const input = { runtimeId: "runtime-a", projectId: "project-a", mode: "TRUSTED_MACHINE", expectedRevision: 0, capabilities: ["filesystem.read"] };
  const controller = new RuntimeController({ validateDurableSession: async (cookie: string) => { assert.equal(cookie, "cookie"); calls.push("authenticate"); return claims; } } as any,
    { configureCapabilities: async (actor: any, body: any) => { assert.equal(actor, claims); assert.equal(body, input); calls.push("configure"); return { revision: 1 }; },
      capabilityEnrollment: async () => { calls.push("read"); return null; },
      grant: async () => { throw new Error("grant must not be called"); } } as any,
    {} as any);
  await controller.configureCapabilities("cookie", input);
  assert.deepEqual(calls, ["authenticate", "configure"]);
  await controller.capabilityEnrollment("cookie", "runtime-a", "project-a");
  assert.deepEqual(calls, ["authenticate", "configure", "authenticate", "read"]);
});
