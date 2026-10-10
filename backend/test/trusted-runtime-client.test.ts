import "reflect-metadata";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import { RuntimeHttpError, RuntimeHttpsClient, runRuntimeWorker } from "../src/trusted-runtime/runtime-client";
import type { RuntimeExecution } from "../src/trusted-runtime/runtime.contract";

type Reply = Error | { status: number; body: unknown };
function transport(t: TestContext, replies: Reply[]) {
  const requests: string[] = [];
  t.mock.method(https, "request", (url: URL, _options: unknown, receive: (res: any) => void) => {
    requests.push(url.pathname.split("/").at(-1)!);
    const reply = replies.shift(); assert.ok(reply, "Unexpected transport retry");
    const req: any = new EventEmitter();
    req.destroy = (error: Error) => req.emit("error", error);
    req.end = () => queueMicrotask(() => {
      if (reply instanceof Error) { req.emit("error", reply); return; }
      const res = Object.assign(new EventEmitter(), { statusCode: reply.status }); receive(res);
      res.emit("data", Buffer.from(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body)));
      res.emit("end");
    });
    return req;
  });
  return requests;
}
function client() {
  const key = generateKeyPairSync("ed25519");
  return new RuntimeHttpsClient("https://localhost:7443", Buffer.alloc(0), { runtimeId: "fixture-runtime",
    publicKey: String(key.publicKey.export({ type: "spki", format: "pem" })), privateKey: String(key.privateKey.export({ type: "pkcs8", format: "pem" })) });
}
const ok = (data: unknown): Reply => ({ status: 200, body: { data, errors: [] } });
const challenge = (operation: string, connectionEpoch = 0) => ok({ challengeId: "fixture-challenge", runtimeId: "fixture-runtime", connectionEpoch,
  nonce: "fixture-nonce", operation, bodyDigest: "fixture-digest", expiresAt: new Date(Date.now() + 30000).toISOString() });
const denied = (message: string, status = 401): Reply => ({ status, body: { data: null, errors: [{ code: "UNAUTHORIZED", message }] } });
const network = (code = "ECONNRESET") => Object.assign(new Error("Temporary fixture network failure"), { code });
const execution = (args = ["--version"]) => ({ attribution: { executionId: "fixture-execution", operationDigest: "fixture-operation", tool: "terminal.execute",
  validatedInput: { executable: process.execPath, args, cwd: process.cwd(), timeoutMs: 10000 }, permitExpiresAt: new Date(Date.now() + 60000).toISOString() } }) as RuntimeExecution;

test("pair preparation performs enrollment and proof only, never connect or runtime execution", async t => {
  const c = client(), requests = transport(t, [ok({ code: "a".repeat(24), challenge: { challengeId: "pairing", runtimeId: c.identity.runtimeId,
    connectionEpoch: 0, nonce: "nonce", operation: "enroll", bodyDigest: "digest", expiresAt: new Date(Date.now() + 600000).toISOString() } }), ok({ proved: true })]);
  assert.equal(await c.pair(), "a".repeat(24));
  assert.deepEqual(requests, ["enrollment", "enrollment-proof"]);
});

test("native picker does not block polling and is cancelled when runtime authorization rejects", async () => {
  let polls = 0, opens = 0, aborted = false;
  const worker: any = { identity: { runtimeId: "test" }, execute: () => assert.fail("UI request is not tool execution"), authenticated: async (op: string, body: any) => {
    if (op === "connect") { assert.equal(body.folderPickerProtocol, 1); return {}; }
    if (op === "poll" && ++polls === 1) return { folderSelection: { selectionId: "selection", expiresAt: new Date(Date.now() + 180000).toISOString() } };
    throw new RuntimeHttpError(401);
  } };
  await assert.rejects(runRuntimeWorker(worker, async () => {}, (_expiry, signal) => new Promise(resolve => { opens++; signal.addEventListener("abort", () => { aborted = true; resolve(null); }, { once: true }); })), /401/);
  assert.equal(polls, 2); assert.equal(opens, 1); assert.equal(aborted, true);
});

test("lost picker response never reopens a dialog or replays selection", async () => {
  let polls = 0, opens = 0, results = 0;
  const worker: any = { identity: { runtimeId: "test" }, execute: () => assert.fail(), authenticated: async (op: string) => {
    if (op === "connect") return {};
    if (op === "folder-result") { results++; throw network(); }
    if (op === "poll" && ++polls === 1) return { folderSelection: { selectionId: "selection", expiresAt: new Date(Date.now() + 180000).toISOString() } };
    if (polls < 3) return {};
    throw new RuntimeHttpError(401);
  } };
  await assert.rejects(runRuntimeWorker(worker, async () => { await new Promise(resolve => setImmediate(resolve)); }, async () => { opens++; return "D:\\Fixture"; }), /401/);
  assert.equal(opens, 1); assert.equal(results, 1);
});

test("revoked runtime exits the worker on its first normalized 401 without retry", async t => {
  const requests = transport(t, [denied("RUNTIME_NOT_ACTIVE")]), worker = client();
  const sleeps: number[] = []; t.mock.method(worker, "execute", () => assert.fail("Rejected worker cannot execute"));
  await assert.rejects(runRuntimeWorker(worker, async ms => { sleeps.push(ms); }), (e: any) => e instanceof RuntimeHttpError && e.statusCode === 401);
  assert.deepEqual(requests, ["challenge"]); assert.deepEqual(sleeps, []);
});
test("disabled runtime stops after connection instead of polling or reconnecting", async t => {
  const requests = transport(t, [challenge("connect"), ok({ connectionEpoch: 1 }), denied("RUNTIME_NOT_ACTIVE")]);
  await assert.rejects(runRuntimeWorker(client(), async () => assert.fail("Permanent rejection must not sleep")), /RUNTIME_HTTP_401/);
  assert.deepEqual(requests, ["challenge", "connect", "challenge"]);
});
test("invalid runtime identity/signature rejection stops without another authentication attempt", async t => {
  const requests = transport(t, [challenge("connect"), denied("RUNTIME_SIGNATURE_INVALID")]);
  await assert.rejects(runRuntimeWorker(client(), async () => assert.fail("Invalid identity cannot retry")), /RUNTIME_HTTP_401/);
  assert.deepEqual(requests, ["challenge", "connect"]);
});
test("invalid local signing identity is fatal without retry", async t => {
  const requests = transport(t, [challenge("connect")]), worker = client(); worker.identity.privateKey = "invalid-private-key";
  await assert.rejects(runRuntimeWorker(worker, async () => assert.fail("Local identity failure cannot retry")));
  assert.deepEqual(requests, ["challenge"]);
});
test("connection fencing is fatal and cannot be undone by reconnecting", async t => {
  const requests = transport(t, [challenge("connect"), ok({ connectionEpoch: 1 }), challenge("poll", 2)]);
  await assert.rejects(runRuntimeWorker(client(), async () => assert.fail("Fenced identity cannot retry")), /RUNTIME_CONNECTION_FENCED/);
  assert.deepEqual(requests, ["challenge", "connect", "challenge"]);
});
test("temporary network failures back off to 30 seconds, recover, and reset the delay", async t => {
  const requests = transport(t, [
    ...Array.from({ length: 6 }, () => network("ECONNREFUSED")), challenge("connect"), ok({ connectionEpoch: 1 }),
    challenge("poll", 1), ok({ execution: null }), network(), challenge("poll", 1), ok({ execution: null }), denied("RUNTIME_NOT_ACTIVE")
  ]);
  const sleeps: number[] = [];
  await assert.rejects(runRuntimeWorker(client(), async ms => { sleeps.push(ms); }), /RUNTIME_HTTP_401/);
  assert.deepEqual(sleeps, [2000, 4000, 8000, 16000, 30000, 30000, 2000, 2000, 2000]);
  assert.equal(requests.filter(op => op === "connect").length, 1);
  assert.equal(requests.filter(op => op === "poll").length, 2);
});
test("temporary HTTP unavailability retries even when its error body is not JSON", async t => {
  transport(t, [{ status: 503, body: "Service unavailable" }, denied("RUNTIME_NOT_ACTIVE")]);
  const sleeps: number[] = [];
  await assert.rejects(runRuntimeWorker(client(), async ms => { sleeps.push(ms); }), /RUNTIME_HTTP_401/);
  assert.deepEqual(sleeps, [2000]);
});
test("permanent authorization rejection stops even with a non-JSON response", async t => {
  transport(t, [{ status: 403, body: "Forbidden" }]);
  await assert.rejects(runRuntimeWorker(client(), async () => assert.fail("Forbidden cannot retry")), (e: any) => e.statusCode === 403);
});
test("permanent receipt rejection stops immediately after one OS operation", async t => {
  const worker = client(), operations: string[] = [];
  t.mock.method(worker, "authenticated", async (op: string) => {
    operations.push(op); if (op === "started") return { execute: true, cancel: false };
    throw new RuntimeHttpError(401);
  });
  await assert.rejects(worker.execute(execution()), /RUNTIME_HTTP_401/);
  assert.deepEqual(operations, ["started", "result"]);
});
test("permanent heartbeat rejection aborts the process and propagates without receipt retries", { timeout: 15000 }, async t => {
  const worker = client(), operations: string[] = [];
  t.mock.method(worker, "authenticated", async (op: string) => {
    operations.push(op); if (op === "started") return { execute: true, cancel: false };
    assert.equal(op, "heartbeat"); throw new RuntimeHttpError(401);
  });
  await assert.rejects(worker.execute(execution(["-e", "setInterval(()=>{},1000)"])), /RUNTIME_HTTP_401/);
  assert.deepEqual(operations, ["started", "heartbeat"]);
});
test("temporary receipt failures retry identical results without another start or OS execution", async t => {
  const worker = client(), operations: string[] = [], receipts: unknown[] = [];
  t.mock.method(worker, "authenticated", async (op: string, body: unknown) => {
    operations.push(op); if (op === "started") return { execute: true, cancel: false };
    assert.equal(op, "result"); receipts.push(body); if (receipts.length < 3) throw network(); return { state: "SUCCEEDED" };
  });
  assert.equal((await worker.execute(execution())).state, "SUCCEEDED");
  assert.deepEqual(operations, ["started", "result", "result", "result"]);
  assert.equal(receipts[0], receipts[1]); assert.equal(receipts[0], receipts[2]);
});
