import "reflect-metadata";
import { test, before, after, mock } from "node:test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { performRuntimeOperation } from "../src/trusted-runtime/runtime-operations";
import { runtimeInput, runtimeKey, runtimePublicKey, type RuntimeAttribution, type RuntimeTool } from "../src/trusted-runtime/runtime.contract";
import { generateKeyPairSync } from "node:crypto";
import { RuntimeHttpsClient } from "../src/trusted-runtime/runtime-client";
import { RuntimeTransportController } from "../src/trusted-runtime/runtime.controller";
import { presentPlan } from "../src/agent-runtime/understanding/agent-presentation";

let root: string;

test("lazy listing opens only the requested directory and a targeted read opens only its file", async () => {
  const folder = join(root, "lazy-fixture");
  await fs.mkdir(join(folder, ".cursor", "nested"), { recursive: true });
  await fs.mkdir(join(folder, "node_modules", "large-unrelated"), { recursive: true });
  await fs.writeFile(join(folder, "README.md"), "Purpose only.");
  await fs.writeFile(join(folder, ".cursor", "nested", "irrelevant.txt"), "Must not be read.");
  const openedDirectories: string[] = [], openedFiles: string[] = [];
  const opendir = fs.opendir, open = fs.open;
  const directorySpy = mock.method(fs, "opendir", async (...args: Parameters<typeof fs.opendir>) => { openedDirectories.push(String(args[0])); return opendir(...args); });
  const fileSpy = mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => { openedFiles.push(String(args[0])); return open(...args); });
  try {
    const listed = await operation("filesystem.list", { path: folder });
    assert.equal(listed.verificationState, "VERIFIED");
    assert.deepEqual(openedDirectories, [folder]);
    assert.deepEqual(openedFiles, []);
    assert.ok((listed.result.entries as any[]).some(e => e.name === ".cursor"));
    const read = await operation("filesystem.read", { path: join(folder, "README.md") });
    assert.equal(read.stdout, "Purpose only.");
    assert.equal(read.verificationState, "VERIFIED");
    assert.deepEqual(openedDirectories, [folder]);
    assert.deepEqual(openedFiles, [join(folder, "README.md")]);
  } finally { directorySpy.mock.restore(); fileSpy.mock.restore(); }
});
before(async () => { root = await mkdtemp(join(tmpdir(), "sekhem-trusted-runtime-")); });
after(async () => { assert.equal(dirname(root), resolve(tmpdir())); assert.ok(basename(root).startsWith("sekhem-trusted-runtime-")); await rm(root, { recursive: true, force: true }); });
const operation = (tool: RuntimeTool, input: object, signal?: AbortSignal) => performRuntimeOperation({ executionId: "fixture", operationDigest: "fixture-digest", tool, validatedInput: input, permitExpiresAt: new Date(Date.now() + 60000).toISOString() } as RuntimeAttribution, { signal });
test("real create/read/write/list/search/copy/move/delete and deterministic verification", async () => {
  const path = join(root, "one.txt"), copy = join(root, "copy.txt"), moved = join(root, "moved.txt");
  assert.equal((await operation("filesystem.create", { path, content: "first" })).state, "SUCCEEDED");
  assert.equal((await operation("filesystem.read", { path })).stdout, "first");
  const written = await operation("filesystem.write", { path, content: "SEKHEM LOCAL RUNTIME WORKS" });
  assert.equal(written.verificationState, "VERIFIED"); assert.equal(await readFile(path, "utf8"), "SEKHEM LOCAL RUNTIME WORKS");
  assert.match((await operation("filesystem.list", { path: root })).stdout, /one.txt/);
  assert.equal(((await operation("filesystem.search", { path: root, query: "LOCAL RUNTIME" })).result.matches as any[]).length, 1);
  assert.equal((await operation("filesystem.copy", { source: path, destination: copy })).verificationState, "VERIFIED");
  assert.equal((await operation("filesystem.move", { source: copy, destination: moved })).verificationResult.sourceAbsent, true);
  assert.equal((await operation("filesystem.delete", { path: moved })).verificationResult.notFound, true); await assert.rejects(access(moved));
});
test("create cannot overwrite and failed write is not verified", async () => {
  const path = join(root, "exists.txt"); await operation("filesystem.create", { path, content: "preserved" });
  assert.equal((await operation("filesystem.create", { path, content: "replace" })).state, "FAILED"); assert.equal(await readFile(path, "utf8"), "preserved");
  const result = await operation("filesystem.write", { path: join(root, "missing", "file.txt"), content: "x" }); assert.equal(result.state, "FAILED"); assert.notEqual(result.verificationState, "VERIFIED");
});
test("real node version, stdout, stderr, exit and process verification", async () => {
  const input = { executable: process.execPath, args: ["--version"], cwd: root, timeoutMs: 5000 };
  const version = await operation("terminal.execute", input); assert.match(version.stdout, /^v\d/); assert.equal(version.exitCode, 0); assert.ok(version.pid); assert.equal(version.verificationState, "VERIFIED");
  const fail = await operation("terminal.execute", { ...input, args: ["-e", "console.log('actual stdout');console.error('actual stderr');process.exitCode=3"] });
  assert.match(fail.stdout, /actual stdout/); assert.match(fail.stderr, /actual stderr/); assert.equal(fail.exitCode, 3); assert.equal(fail.state, "FAILED"); assert.notEqual(fail.verificationState, "VERIFIED");
});
test("real process timeout and cancellation confirm termination", async () => {
  const input = { executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], cwd: root, timeoutMs: 300 };
  const timeout = await operation("terminal.execute", input); assert.equal(timeout.state, "TIMED_OUT"); assert.equal(timeout.verificationResult.terminationConfirmed, true);
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 300);
  try { const cancelled = await operation("terminal.execute", { ...input, timeoutMs: 10000 }, abort.signal); assert.equal(cancelled.state, "CANCELLED"); assert.equal(cancelled.verificationResult.terminationConfirmed, true); } finally { clearTimeout(timer); }
});
test("bounded output and no shell command interpretation", async () => {
  const input = { executable: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(100000))"], cwd: root, timeoutMs: 5000 };
  const r = await operation("terminal.execute", input); assert.equal(r.truncated, true); assert.ok(Buffer.byteLength(r.stdout) <= 32768);
  assert.equal((await operation("terminal.execute", { ...input, executable: "definitely-not-a-runtime-executable", args: [] })).state, "FAILED");
  assert.throws(() => runtimeInput("terminal.execute", { command: "npm test", cwd: root }));
  assert.throws(() => runtimeInput("filesystem.write", { path: join(root, "x"), content: "x".repeat(20000) }));
});
test("deterministic public identity, private key rejection, and mandatory HTTPS", () => {
  const key = generateKeyPairSync("ed25519"), publicKey = String(key.publicKey.export({ type: "spki", format: "pem" }));
  assert.equal(runtimeKey("RUNTIME_DEVICE", runtimePublicKey(publicKey).fingerprint), runtimeKey("RUNTIME_DEVICE", runtimePublicKey(publicKey).fingerprint));
  assert.throws(() => runtimePublicKey(String(key.privateKey.export({ type: "pkcs8", format: "pem" }))));
  assert.throws(() => new RuntimeHttpsClient("http://localhost", Buffer.alloc(0), { runtimeId: "x", publicKey, privateKey: "unused" }));
});
test("transport rejects HTTP and forwarded-HTTPS claims before identity or execution", async () => {
  const forbidden = () => assert.fail("HTTP must not reach runtime authority");
  const controller = new RuntimeTransportController({ challenge: forbidden, enrollment: forbidden } as any, { request: forbidden } as any);
  const req = { socket: { encrypted: false }, headers: { "x-forwarded-proto": "https" } } as any;
  await assert.rejects(controller.challenge(req, {}), /HTTPS_REQUIRED/);
  await assert.rejects(controller.operation(req, "poll", {}), /HTTPS_REQUIRED/);
});
test("runtime plan presentation defers execution claims to the independent ledger", () => {
  const presentation = presentPlan([{ parameters: { runtimeAction: true } }]);
  assert.equal(presentation.executionAuthority, "RUNTIME_LEDGER");
  assert.equal(presentation.executionPerformed, null); assert.equal(presentation.executionAvailable, null);
  assert.equal(presentPlan([]).executionPerformed, false);
});
