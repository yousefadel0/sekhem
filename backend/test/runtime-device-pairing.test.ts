import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { runtimeSigningText } from "../src/trusted-runtime/runtime.contract";

async function preparation(h: Awaited<ReturnType<typeof inspectionHarness>>) {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = String(keys.publicKey.export({ type: "spki", format: "pem" }));
  const pending = await h.identity.enrollment(publicKey, "1.0.0");
  const timestamp = new Date().toISOString();
  await h.identity.proveEnrollment(pending.code, timestamp, sign(null, Buffer.from(runtimeSigningText(pending.challenge, timestamp)), keys.privateKey).toString("base64"));
  return { keys, pending };
}

test("fresh pairing registers ACTIVE identity with no connection or filesystem authority", async () => {
  const h = await inspectionHarness(), p = await preparation(h);
  const before = new Set(h.tables.auditEvent.keys());
  const d = await h.identity.enroll(h.claims, p.pending.code, "Replacement computer");
  assert.equal(d.status, "ACTIVE"); assert.equal(d.lastSeenAt, null); assert.equal(d.connectionEpoch, 0);
  assert.notEqual(d.runtimeId, h.device.runtimeId); assert.equal(d.displayName, "Replacement computer");
  const added = [...h.tables.auditEvent.values()].filter(r => !before.has(r.id));
  assert.ok(added.every(r => ["RUNTIME_DEVICE", "RUNTIME_FINGERPRINT", "RUNTIME_AUTH_CONSUMPTION", "RUNTIME_REVISION"].includes(r.metadata.recordType)));
  assert.ok(added.every(r => !JSON.stringify(r.metadata).includes("PRIVATE KEY")));
  await assert.rejects(h.ledger.transaction(tx => h.identity.activeGrant(tx, d.runtimeId, "project-a")), /RUNTIME_GRANT_INVALID/);
});

test("invalid expired and unproved pairing codes fail closed", async () => {
  const h = await inspectionHarness();
  await assert.rejects(h.identity.enroll(h.claims, "bad", "Computer"), /RUNTIME_ENROLLMENT_INVALID/);
  await assert.rejects(h.identity.enroll(h.claims, "0".repeat(24), "Computer"), /RUNTIME_ENROLLMENT_INVALID/);
  const p = await preparation(h);
  const row = [...h.tables.auditEvent.values()].find(r => r.metadata.payload.challenge?.challengeId === p.pending.challenge.challengeId)!;
  const original = structuredClone(row);
  row.metadata.payload.challenge.expiresAt = new Date(0).toISOString();
  // Keep the fixture ledger digest valid while testing expiration, not corruption.
  const { toolDigest } = await import("../src/agent-runtime/tools/tool-contract");
  row.metadata.payloadDigest = toolDigest(row.metadata.payload);
  await assert.rejects(h.identity.enroll(h.claims, p.pending.code, "Computer"), /RUNTIME_ENROLLMENT_INVALID/);
  h.tables.auditEvent.set(row.id, original);
  original.metadata.payload.proved = false; original.metadata.payloadDigest = toolDigest(original.metadata.payload);
  await assert.rejects(h.identity.enroll(h.claims, p.pending.code, "Computer"), /RUNTIME_ENROLLMENT_INVALID/);
});

test("same-owner consumed pairing code replay returns the same device without granting authority", async () => {
  const h = await inspectionHarness(), p = await preparation(h);
  const first = await h.identity.enroll(h.claims, p.pending.code, "Computer");
  const before = structuredClone([...h.tables.auditEvent.values()]);
  assert.deepEqual(await h.identity.enroll(h.claims, p.pending.code, "Computer"), first);
  assert.deepEqual([...h.tables.auditEvent.values()], before);
});

test("revoked original remains rejected while replacement authenticates and connects independently", async () => {
  const h = await inspectionHarness();
  await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED");
  const revoked = structuredClone(h.tables.auditEvent.get(h.device.runtimeId));
  await assert.rejects(h.identity.challenge(h.device.runtimeId, "connect", {}), /RUNTIME_NOT_ACTIVE/);
  const p = await preparation(h), d = await h.identity.enroll(h.claims, p.pending.code, "Replacement");
  const body = { workspaceReadProtocol: 1, conditionalWriteProtocol: 1 }, c = await h.identity.challenge(d.runtimeId, "connect", body), timestamp = new Date().toISOString();
  const auth = { runtimeId: d.runtimeId, connectionEpoch: c.connectionEpoch, challengeId: c.challengeId, timestamp,
    signature: sign(null, Buffer.from(runtimeSigningText(c, timestamp)), p.keys.privateKey).toString("base64") };
  const connected = await h.executions.request("connect", body, auth);
  assert.equal(connected.runtimeId, d.runtimeId); assert.equal(connected.status, "ACTIVE"); assert.ok(connected.lastSeenAt); assert.equal(connected.connectionEpoch, 1);
  assert.deepEqual(h.tables.auditEvent.get(h.device.runtimeId), revoked);
  await assert.rejects(h.executions.request("connect", body, auth), /REVOKED_OR_STALE|REPLAY/);
});

test("multiple devices and signatures remain isolated", async () => {
  const h = await inspectionHarness(), a = await preparation(h), b = await preparation(h);
  const da = await h.identity.enroll(h.claims, a.pending.code, "Computer A"), db = await h.identity.enroll(h.claims, b.pending.code, "Computer B");
  assert.notEqual(da.runtimeId, db.runtimeId); assert.notEqual(da.fingerprint, db.fingerprint);
  const c = await h.identity.challenge(da.runtimeId, "connect", {}), timestamp = new Date().toISOString();
  await assert.rejects(h.executions.request("connect", {}, { runtimeId: da.runtimeId, connectionEpoch: c.connectionEpoch, challengeId: c.challengeId, timestamp,
    signature: sign(null, Buffer.from(runtimeSigningText(c, timestamp)), b.keys.privateKey).toString("base64") }), /RUNTIME_SIGNATURE_INVALID/);
  assert.ok((await h.identity.devices(h.claims)).some(d => d.runtimeId === da.runtimeId));
  assert.ok((await h.identity.devices(h.claims)).some(d => d.runtimeId === db.runtimeId));
});

async function secondDevice(h: Awaited<ReturnType<typeof inspectionHarness>>) {
  const p = await preparation(h), device = await h.identity.enroll(h.claims, p.pending.code, "Computer B");
  const request = async (operation: "connect" | "poll" | "started" | "result", body: any = {}) => {
    const challenge = await h.identity.challenge(device.runtimeId, operation, body), timestamp = new Date().toISOString();
    return h.executions.request(operation, body, { runtimeId: device.runtimeId, connectionEpoch: challenge.connectionEpoch,
      challengeId: challenge.challengeId, timestamp,
      signature: sign(null, Buffer.from(runtimeSigningText(challenge, timestamp)), p.keys.privateKey).toString("base64") }) as Promise<any>;
  };
  await request("connect", { workspaceReadProtocol: 1, conditionalWriteProtocol: 1 });
  await h.identity.grant(h.claims, device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search"]);
  return { device, request };
}

async function approvedRead(h: Awaited<ReturnType<typeof inspectionHarness>>) {
  const view = await h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "READ", {
    bindingVersion: h.binding.version, relativePath: "session.ts", conversationId: "conversation-a", requestId: "device-isolation-read"
  });
  const snapshot = await h.control.snapshot(h.claims, view.operation.runId);
  await h.control.approve(h.claims, view.operation.runId, snapshot!.proposal.approvalFingerprint!, "APPROVED");
  return view;
}

test("a separately authorized device cannot dispatch, acknowledge or return another device's read", async () => {
  const h = await inspectionHarness(), b = await secondDevice(h), view = await approvedRead(h);
  assert.equal((await b.request("poll")).execution, null);
  const execution = (await h.request("poll")).execution;
  assert.equal(execution.attribution.runtimeId, h.device.runtimeId);
  const attribution = { executionId: execution.attribution.executionId, operationDigest: execution.attribution.operationDigest };
  await assert.rejects(b.request("started", attribution), /RUNTIME_RESULT_ATTRIBUTION_INVALID/);
  const now = new Date().toISOString(), text = "export const device = 'B';";
  await assert.rejects(b.request("result", { ...attribution, state: "SUCCEEDED", startedAt: now, finishedAt: now,
    durationMs: 1, pid: null, exitCode: null, stdout: text, stderr: "", error: null, truncated: false,
    result: { path: execution.attribution.validatedInput.path, bytesRead: Buffer.byteLength(text), size: Buffer.byteLength(text) },
    verificationState: "VERIFIED", verificationResult: { observed: true } }), /RUNTIME_RESULT_ATTRIBUTION_INVALID/);
  await h.complete(execution, "export const device = 'A';");
  const observed = await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, view.operation.operationId);
  assert.equal(observed.state, "READY");
  assert.equal(observed.receipt?.runtimeId, h.device.runtimeId);
  assert.equal(observed.file?.text, "export const device = 'A';");
  assert.equal((await h.request("poll")).execution, null);
});

test("reconnecting and revoking device B preserves device A's in-flight execution and binding", async () => {
  const h = await inspectionHarness(), b = await secondDevice(h), view = await approvedRead(h);
  const execution = (await h.request("poll")).execution;
  const bindingBefore = await h.store.getBinding(h.binding.workspaceId);
  const deviceBefore = structuredClone(h.tables.auditEvent.get(h.device.runtimeId));
  await b.request("connect", { workspaceReadProtocol: 1, conditionalWriteProtocol: 1 });
  await h.identity.setDeviceStatus(h.claims, b.device.runtimeId, "REVOKED");
  await assert.rejects(b.request("poll"), /RUNTIME_NOT_ACTIVE/);
  assert.deepEqual(h.tables.auditEvent.get(h.device.runtimeId), deviceBefore);
  assert.deepEqual(await h.store.getBinding(h.binding.workspaceId), bindingBefore);
  await h.complete(execution, "export const stillConnected = true;");
  const observed = await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, view.operation.operationId);
  assert.equal(observed.state, "READY");
  assert.equal(observed.receipt?.runtimeId, h.device.runtimeId);
});
