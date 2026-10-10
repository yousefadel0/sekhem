import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { startDiagnostic, failureCategory } from "../src/trusted-runtime/runtime-start-diagnostics";
import { RuntimeHttpsClient } from "../src/trusted-runtime/runtime-client";
import type { RuntimeExecution } from "../src/trusted-runtime/runtime.contract";
import "reflect-metadata";
import { EventEmitter } from "node:events";
import { UnauthorizedException } from "@nestjs/common";
import { RuntimeExecutionService } from "../src/trusted-runtime/runtime-execution.service";
import { RuntimeTransportController } from "../src/trusted-runtime/runtime.controller";

function capture(t: TestContext) {
  const records: any[] = [];
  t.mock.method(console, "info", (line: string) => { records.push(JSON.parse(line)); });
  return records;
}
test("transaction commit is logged only after the transaction promise resolves", async t => {
  const records = capture(t), response = { state: "RUNNING", execute: true, cancel: false };
  let resolved = false;
  const ledger = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const value = await callback({}); assert.ok(!records.some(r => r.stage === "TX_COMMITTED")); resolved = true; return value;
  } };
  const service = new RuntimeExecutionService(ledger as any, { authenticate: async () => ({}) } as any, {} as any);
  t.mock.method(service as any, "heartbeat", async () => response);
  assert.equal(await service.request("started", { executionId: "fixture" }, { challengeId: "fixture" } as any), response);
  assert.ok(resolved); assert.equal(records.at(-1).stage, "TX_COMMITTED"); assert.equal(records.at(-1).eventCommitted, true);
});
test("failed transaction preserves its error and emits no committed confirmation", async t => {
  const records = capture(t), error = Object.assign(new Error("SECRET_CANARY"), { code: "P2028" });
  const service = new RuntimeExecutionService({ transaction: async (callback: any) => { await callback({}); throw error; } } as any, { authenticate: async () => ({}) } as any, {} as any);
  t.mock.method(service as any, "heartbeat", async () => ({ state: "RUNNING", execute: true, cancel: false }));
  await assert.rejects(service.request("started", { executionId: "fixture" }, { challengeId: "fixture" } as any), e => e === error);
  assert.ok(!records.some(r => r.stage === "TX_COMMITTED")); assert.equal(records.at(-1).category, "P2028"); assert.ok(!JSON.stringify(records).includes("SECRET_CANARY"));
});
test("auth rejection keeps the same exception and cannot reach the execution gate", async t => {
  const records = capture(t), error = new UnauthorizedException("RUNTIME_SIGNATURE_INVALID");
  const service = new RuntimeExecutionService({ transaction: async (cb: any) => cb({}) } as any, { authenticate: async () => { throw error; } } as any, {} as any);
  t.mock.method(service as any, "heartbeat", async () => assert.fail("Rejected auth cannot start"));
  await assert.rejects(service.request("started", {}, {} as any), e => e === error);
  assert.equal(records.at(-1).category, "RUNTIME_SIGNATURE_INVALID"); assert.ok(!records.some(r => r.stage === "TX_COMMITTED"));
});
test("controller distinguishes response preparation, finish and premature close", async t => {
  const records = capture(t), result = { execute: false, cancel: true }, res = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: false });
  const controller = new RuntimeTransportController({} as any, { request: async () => result } as any);
  const value = await controller.operation({ socket: { encrypted: true } } as any, "started", { payload: { executionId: "fixture" }, auth: { challengeId: "fixture", signature: "SECRET_CANARY" } }, res as any);
  assert.equal(value.data, result); assert.equal(records.at(-1).stage, "RESPONSE_READY");
  res.emit("close"); assert.equal(records.at(-1).stage, "RESPONSE_CLOSED_EARLY");
  res.writableFinished = true; res.emit("finish"); assert.equal(records.at(-1).stage, "RESPONSE_FINISHED"); assert.ok(!JSON.stringify(records).includes("SECRET_CANARY"));
});
test("redacts bodies, credentials, signatures, personal data and arbitrary error text", () => {
  const lines: string[] = [], secret = "SECRET_CANARY_PRIVATE_KEY_TOKEN_CONTENT";
  const d = startDiagnostic("runtime", { executionId: "execution-fixture", challengeId: "challenge-fixture", privateKey: secret, email: "private@example.invalid" } as any, s => { lines.push(s); });
  d.emit("HTTP_FAILED", { category: secret, body: secret, signature: secret, token: secret, status: 503 } as any);
  const text = lines.join("\n"); assert.ok(!text.includes(secret)); assert.ok(!text.includes("private@example.invalid")); assert.ok(!text.includes("execution-fixture"));
  assert.equal(JSON.parse(lines[0]).category, "UNKNOWN"); assert.equal(JSON.parse(lines[0]).status, 503);
});
test("both processes correlate the same challenge without sharing attempt identity", () => {
  const lines: any[] = [], sink = (s: string) => { lines.push(JSON.parse(s)); };
  startDiagnostic("runtime", { challengeId: "challenge-fixture" }, sink).emit("HTTP_SUBMIT");
  startDiagnostic("backend", { challengeId: "challenge-fixture" }, sink).emit("BACKEND_RECEIVED");
  assert.equal(lines[0].challengeRef, lines[1].challengeRef); assert.notEqual(lines[0].attempt, lines[1].attempt);
});
test("throwing log sink does not throw or change a simulated operation result", async () => {
  const result = { execute: false, cancel: true }, d = startDiagnostic("backend", {}, () => { throw new Error("sink unavailable"); });
  assert.doesNotThrow(() => d.emit("EXECUTION_GATE", result)); assert.deepEqual(result, { execute: false, cancel: true });
});
test("only enumerated categories are emitted; exceptions are never serialized", () => {
  assert.equal(failureCategory(Object.assign(new Error("SECRET"), { code: "ETIMEDOUT" })), "ETIMEDOUT");
  assert.equal(failureCategory(Object.assign(new Error("SECRET"), { code: "P2028" })), "P2028");
  assert.equal(failureCategory(new Error("RUNTIME_SIGNATURE_INVALID")), "RUNTIME_SIGNATURE_INVALID");
  assert.equal(failureCategory(new Error("SECRET")), "UNKNOWN");
  assert.equal(failureCategory(Object.assign(new Error("SECRET"), { statusCode: 401 })), "HTTP_REJECTED");
});
test("rejects malformed fields and unknown stages without logging them", () => {
  const lines: string[] = [], d = startDiagnostic("runtime", { executionId: "x".repeat(257) }, s => { lines.push(s); });
  d.emit("HTTP_HEADERS", { status: Infinity, execute: "SECRET", category: "SECRET" } as any);
  d.emit("SECRET" as any); const entry = JSON.parse(lines[0]); assert.equal(lines.length, 1);
  assert.equal(entry.executionRef, undefined); assert.equal(entry.execute, undefined); assert.equal(entry.status, undefined);
});
test("correlation updates preserve execution reference and add safe challenge reference", () => {
  const lines: any[] = [], d = startDiagnostic("runtime", { executionId: "execution-fixture" }, s => { lines.push(JSON.parse(s)); });
  d.emit("DISPATCH_RECEIVED"); d.correlate({ challengeId: "challenge-fixture" }); d.emit("CHALLENGE_OBSERVED");
  assert.equal(lines[0].executionRef, lines[1].executionRef); assert.equal(lines[0].challengeRef, undefined);
  assert.match(lines[1].challengeRef, /^[a-f0-9]{64}$/); assert.ok(lines[1].elapsedMs >= 0);
});
test("logging an unconfirmed transaction failure cannot manufacture committed evidence", () => {
  const lines: any[] = [], d = startDiagnostic("backend", {}, s => { lines.push(JSON.parse(s)); });
  d.emit("TX_REJECTED_COMMIT_UNCONFIRMED", { category: "P2028" });
  assert.equal(lines[0].eventCommitted, undefined); assert.equal(lines[0].stage, "TX_REJECTED_COMMIT_UNCONFIRMED");
});
test("existing real client gates execution on a denied acknowledgement without touching an operation", async t => {
  const client = new RuntimeHttpsClient("https://localhost:7443", undefined, { runtimeId: "fixture", publicKey: "unused", privateKey: "unused" });
  const calls: string[] = [];
  t.mock.method(client, "authenticated", async (operation: string) => { calls.push(operation); return { execute: false, cancel: true }; });
  // Deliberately incomplete input: performing the operation would fail this test.
  assert.equal(await client.execute({ attribution: { executionId: "fixture", operationDigest: "fixture" } } as RuntimeExecution), undefined);
  assert.deepEqual(calls, ["started"]);
});
test("diagnostic initialization failure returns a no-op without changing execution", t => {
  t.mock.method(performance, "now", () => { throw new Error("fixture clock unavailable"); });
  assert.doesNotThrow(() => { const d = startDiagnostic("runtime", {}); d.correlate({ challengeId: "fixture" }); d.emit("EXECUTION_GATE", { execute: false }); });
});
test("existing real client preserves an ambiguous start failure and never retries or returns a result", async t => {
  const client = new RuntimeHttpsClient("https://localhost:7443", undefined, { runtimeId: "fixture", publicKey: "unused", privateKey: "unused" });
  const original = Object.assign(new Error("fixture timeout"), { code: "ETIMEDOUT" }), calls: string[] = [];
  t.mock.method(client, "authenticated", async (operation: string) => { calls.push(operation); throw original; });
  await assert.rejects(client.execute({ attribution: { executionId: "fixture", operationDigest: "fixture" } } as RuntimeExecution), error => error === original);
  assert.deepEqual(calls, ["started"]);
});

