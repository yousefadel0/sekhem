import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, link, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { performRuntimeOperation } from "../src/trusted-runtime/runtime-operations";
import type { RuntimeAttribution, RuntimeTool } from "../src/trusted-runtime/runtime.contract";

test("scoped worker reads source and blocks foreign, sensitive, hard-linked and junction targets", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "sekhem-read-grant-")), root = join(fixture, "workspace"), outside = join(fixture, "outside");
  try {
    await mkdir(root); await mkdir(outside); await writeFile(join(root, "source.ts"), "export const authenticate = true;\n");
    await writeFile(join(outside, "foreign.ts"), "outside content"); await writeFile(join(root, ".env"), "sensitive fixture");
    await link(join(outside, "foreign.ts"), join(root, "alias.ts"));
    await symlink(outside, join(root, "junction"), process.platform === "win32" ? "junction" : "dir");
    const attribution = (tool: RuntimeTool, input: Record<string, unknown>): RuntimeAttribution => ({ tool, validatedInput: input, executionId: "execution", operationDigest: "digest", runtimeId: "runtime", userId: "user", projectId: "project", organizationId: "org", grantId: "grant", grantVersion: 2, permitExpiresAt: new Date(Date.now() + 60000).toISOString(), workspaceRead: { kind: "WORKSPACE_READ_GRANT", grantId: "grant", grantVersion: 2, consent: { kind: "WORKSPACE_READ", workspaceId: "workspace", bindingId: "workspace", bindingVersion: 1, rootPath: root, runtimeId: "runtime", runtimeFingerprint: "a".repeat(64), userId: "user", projectId: "project", organizationId: "org", approvedBy: "user", approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), status: "ACTIVE", revokedAt: null, version: 1, capabilities: ["filesystem.read", "filesystem.list", "filesystem.search"], fingerprint: "f".repeat(64) } } } as RuntimeAttribution);
    const read = await performRuntimeOperation(attribution("filesystem.read", { path: join(root, "source.ts") })); assert.equal(read.state, "SUCCEEDED"); assert.match(read.stdout, /authenticate/);
    // The server-issued signed scope, rather than the worker's NODE_ENV, carries the development lifecycle.
    const persistent = attribution("filesystem.read", { path: join(root, "source.ts") });
    persistent.workspaceRead!.consent.expiresAt = new Date(Date.now() - 1).toISOString();
    assert.equal((await performRuntimeOperation(persistent)).state, "FAILED", "ordinary timed consent still expires");
    persistent.workspaceRead!.lifecycle = "DEVELOPMENT_ENROLLED_READ";
    assert.equal((await performRuntimeOperation(persistent)).state, "SUCCEEDED");
    persistent.workspaceRead!.consent.expiresAt = null;
    assert.equal((await performRuntimeOperation(persistent)).state, "SUCCEEDED");
    persistent.tool = "filesystem.write"; persistent.validatedInput = { path: join(root, "source.ts"), content: "forbidden" };
    assert.equal((await performRuntimeOperation(persistent)).state, "FAILED", "persistent read attribution cannot authorize writes");
    persistent.tool = "filesystem.read"; persistent.workspaceRead!.consent.revokedAt = new Date().toISOString();
    assert.equal((await performRuntimeOperation(persistent)).state, "FAILED", "revocation is still effective");
    for (const path of [join(outside, "foreign.ts"), join(root, ".env"), join(root, "alias.ts"), join(root, "junction", "foreign.ts")]) {
      const result = await performRuntimeOperation(attribution("filesystem.read", { path })); assert.equal(result.state, "FAILED", path); assert.equal(result.stdout, ""); assert.notEqual(result.verificationState, "VERIFIED");
    }
    const listing = await performRuntimeOperation(attribution("filesystem.list", { path: root })); assert.equal(listing.state, "SUCCEEDED"); assert.doesNotMatch(listing.stdout, /alias|junction|\.env/);
    const search = await performRuntimeOperation(attribution("filesystem.search", { path: root, query: "authenticate" })); assert.equal(search.state, "SUCCEEDED"); assert.equal((search.result.matches as any[]).length, 1);
    for (const tool of ["filesystem.write", "filesystem.create", "filesystem.delete", "filesystem.move", "filesystem.copy", "terminal.execute"] as RuntimeTool[]) {
      const input = tool === "terminal.execute" ? { executable: "node", args: ["--version"], cwd: root, timeoutMs: 1000 } : ["filesystem.copy", "filesystem.move"].includes(tool) ? { source: join(root, "source.ts"), destination: join(root, "copy.ts") } : { path: join(root, "source.ts"), ...(["filesystem.write", "filesystem.create"].includes(tool) ? { content: "forbidden" } : {}) };
      assert.equal((await performRuntimeOperation(attribution(tool, input))).state, "FAILED");
    }
  } finally { assert.equal(dirname(fixture), resolve(tmpdir())); assert.ok(basename(fixture).startsWith("sekhem-read-grant-")); await rm(fixture, { recursive: true, force: true }); }
});
