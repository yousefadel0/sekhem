import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { performRuntimeOperation } from "../src/trusted-runtime/runtime-operations";

test("runtime search preserves workspace discovery and sensitive-file exclusions", async () => {
  const root = await mkdtemp(join(tmpdir(), "sekhem-inspection-search-"));
  try {
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "unrelated.js"), "auth excluded dependency");
    await writeFile(join(root, ".env"), "auth excluded configuration");
    await writeFile(join(root, "session.ts"), "export function authenticate() {}\n");
    const result = await performRuntimeOperation({ executionId: "search-test", operationDigest: "test", tool: "filesystem.search",
      validatedInput: { path: root, query: "auth" }, permitExpiresAt: new Date(Date.now() + 60000).toISOString() } as any, {});
    assert.equal(result.state, "SUCCEEDED");
    assert.deepEqual((result.result.matches as any[]).map(m => m.path), [join(root, "session.ts")]);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.ok(basename(root).startsWith("sekhem-inspection-search-"));
    await rm(root, { recursive: true, force: true });
  }
});
