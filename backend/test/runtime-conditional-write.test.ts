import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { performRuntimeOperation } from "../src/trusted-runtime/runtime-operations";
import { runtimeInput, type RuntimeAttribution } from "../src/trusted-runtime/runtime.contract";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
test("conditional write preserves the 21,276-byte HTML fixture except the approved split Hero word", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sekhem-write-")), path = join(dir, "index.html");
  const head = "<!doctype html>\r\n<h1>\r\n Building\r\n <span>simple</span>\r\n digital experiences.\r\n</h1>\r\n";
  const before = head + " ".repeat(21276 - Buffer.byteLength(head)), after = before.replace("<span>simple</span>", "<span>intelligent</span>");
  try {
    await writeFile(path, before);
    const a = { executionId: "fixture", operationDigest: "fixture", tool: "filesystem.write", permitExpiresAt: new Date(Date.now() + 60000).toISOString(), validatedInput: { path, content: after, expectedSha256: sha(before) } } as RuntimeAttribution;
    const result = await performRuntimeOperation(a);
    assert.equal(result.state, "SUCCEEDED"); assert.equal(result.verificationState, "VERIFIED");
    assert.equal(await readFile(path, "utf8"), after); assert.equal(result.result.sha256, sha(after));
    const replay = await performRuntimeOperation(a);
    assert.equal(replay.state, "FAILED"); assert.equal(replay.error, "RUNTIME_SOURCE_CHANGED");
    assert.equal(await readFile(path, "utf8"), after);
    await writeFile(path, "independently changed");
    assert.equal((await performRuntimeOperation(a)).error, "RUNTIME_SOURCE_CHANGED");
    assert.equal(await readFile(path, "utf8"), "independently changed");
  } finally { await unlink(path).catch(() => {}); await rmdir(dir); }
});
test("byte and serialized-input bounds still apply to conditional writes", () => {
  const path = "C:\\Fixture\\index.html";
  assert.throws(() => runtimeInput("filesystem.write", { path, content: "x".repeat(16385) }));
  assert.throws(() => runtimeInput("filesystem.write", { path, content: "ع".repeat(12000), expectedSha256: "a".repeat(64) }));
  assert.throws(() => runtimeInput("filesystem.write", { path, content: "x", expectedSha256: "invalid" }));
  assert.throws(() => runtimeInput("filesystem.write", { path, content: '"'.repeat(22000), expectedSha256: "a".repeat(64) }));
});
