import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { RuntimeExecutionService } from "../src/trusted-runtime/runtime-execution.service";
import type { RuntimeDevice } from "../src/trusted-runtime/runtime.contract";

interface LivenessProbe {
  poll(tx: unknown, device: RuntimeDevice): Promise<unknown>;
  heartbeat(tx: unknown, device: RuntimeDevice, body: { executionId: string; operationDigest: string }, started: boolean): Promise<unknown>;
}

function fixture(age = 60000) {
  const device = { runtimeId: "device", userId: "user", organizationId: "org", connectionEpoch: 1, lastSeenAt: new Date(Date.now() - age).toISOString() } as RuntimeDevice;
  const execution = { payload: { state: "RUNNING", lastSeenAt: new Date().toISOString(), startedAt: new Date().toISOString(), cancellationState: "NONE",
    attribution: { executionId: "execution", runtimeId: "device", userId: "user", organizationId: "org", connectionEpoch: 1, operationDigest: "digest", projectId: "project", grantVersion: 1, tool: "terminal.execute", validatedInput: { timeoutMs: 300000 } } } };
  const writes: { row: unknown; payload: { lastSeenAt: string } }[] = [];
  const ledger = { list: async () => [execution], read: async () => null, decode: () => execution, update: async (_tx: unknown, row: unknown, payload: { lastSeenAt: string }) => { writes.push({ row, payload }); return { payload }; } };
  const identity = { device: async () => ({ payload: device }), activeGrant: async () => ({}) };
  type Dependencies = ConstructorParameters<typeof RuntimeExecutionService>;
  const service = new RuntimeExecutionService(ledger as unknown as Dependencies[0], identity as unknown as Dependencies[1], { event: async () => {} } as unknown as Dependencies[2]);
  const tx = { auditEvent: { findUnique: async () => ({}) } };
  return { service: service as unknown as LivenessProbe, device, tx, writes };
}

test("active execution poll refreshes device liveness without redispatch", async () => {
  const h = fixture();
  assert.deepEqual(await h.service.poll(h.tx, h.device), { execution: null, activeExecutionId: "execution" });
  assert.equal(h.writes.length, 1);
  assert.ok(Date.parse(h.writes[0].payload.lastSeenAt) > Date.parse(h.device.lastSeenAt));
});
test("authenticated execution heartbeat refreshes device while preserving grant checks", async () => {
  const h = fixture();
  const result = await h.service.heartbeat(h.tx, h.device, { executionId: "execution", operationDigest: "digest" }, false);
  assert.deepEqual(result, { state: "RUNNING", cancel: false, execute: false });
  assert.equal(h.writes.length, 2);
  assert.ok(Date.parse(h.writes[1].payload.lastSeenAt) > Date.parse(h.device.lastSeenAt));
});
test("heartbeat writes remain throttled and foreign attribution cannot refresh liveness", async () => {
  const h = fixture(1000);
  await h.service.heartbeat(h.tx, h.device, { executionId: "execution", operationDigest: "digest" }, false);
  assert.equal(h.writes.length, 1);
  h.writes.length = 0;
  await assert.rejects(h.service.heartbeat(h.tx, h.device, { executionId: "execution", operationDigest: "foreign" }, false), /RUNTIME_RESULT_ATTRIBUTION_INVALID/);
  assert.equal(h.writes.length, 0);
});
