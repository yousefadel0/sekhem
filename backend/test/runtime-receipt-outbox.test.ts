import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeReceiptOutbox } from "../src/trusted-runtime/runtime-receipt-outbox";
import { RuntimeHttpsClient, runRuntimeWorker } from "../src/trusted-runtime/runtime-client";

test("durable signed receipt survives worker restart and reconciles exactly once without an OS operation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sekhem-receipt-test-"));
  try {
    const key = generateKeyPairSync("ed25519"), identity = { runtimeId: "runtime-a", publicKey: String(key.publicKey.export({ type: "spki", format: "pem" })), privateKey: String(key.privateKey.export({ type: "pkcs8", format: "pem" })) };
    const attribution: any = { runtimeId: identity.runtimeId, executionId: "execution-a", operationDigest: "operation-a", connectionEpoch: 11 };
    const result: any = { executionId: attribution.executionId, operationDigest: attribution.operationDigest, state: "SUCCEEDED" };
    await new RuntimeReceiptOutbox(directory, identity).put(attribution, result);
    const saved = (await readdir(directory))[0];
    // Crash after journal fsync but before publication: the complete pending journal is recoverable.
    await rename(join(directory, saved), join(directory, `${saved}.00000000-0000-0000-0000-000000000000.pending`));
    const restarted = new RuntimeReceiptOutbox(directory, identity), client = new RuntimeHttpsClient("https://localhost", undefined, identity, restarted);
    let calls = 0;
    client.authenticated = async () => { throw new Error("RUNTIME_CONNECTION_FENCED"); };
    await assert.rejects(client.reconcileReceipts(), /FENCED/);
    assert.equal((await restarted.pending()).length, 1);
    client.authenticated = async (operation, body) => { assert.equal(operation, "result"); assert.deepEqual(body, result); calls++; return { duplicate: true }; };
    await client.reconcileReceipts(); await client.reconcileReceipts();
    assert.equal(calls, 1); assert.deepEqual(await restarted.pending(), []);
    await restarted.put(attribution, result);
    await assert.rejects(restarted.put(attribution, { ...result, state: "FAILED" }), /CONFLICT/);
    const file = join(directory, (await readdir(directory)).find(n => n.endsWith(".json"))!);
    const envelope = JSON.parse(await readFile(file, "utf8")); envelope.payload.result.state = "FAILED";
    await writeFile(file, JSON.stringify(envelope));
    await assert.rejects(restarted.pending(), /CORRUPT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unreconciled receipts stop reconnect and never trigger execution", async () => {
  const calls: string[] = [];
  const worker: any = { identity: {}, reconcileReceipts: async () => { calls.push("receipt"); throw new Error("RUNTIME_CONNECTION_FENCED"); },
    authenticated: async () => assert.fail("must not reconnect"), execute: async () => assert.fail("must not execute") };
  await assert.rejects(runRuntimeWorker(worker), /FENCED/); assert.deepEqual(calls, ["receipt"]);
});
