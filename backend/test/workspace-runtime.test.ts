import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceHarness } from "./helpers/workspace-runtime-harness";
import { WorkspaceBindingService } from "../src/workspace-intelligence/workspace-binding.service";
import { workspaceTarget } from "../src/workspace-intelligence/workspace-runtime.contract";

test("missing proposal is a failed projection, not evidence of a failed read or permission denial", async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "LIST", "src");
  h.snapshots.delete(v.operation.runId);
  const before = h.calls.length;
  const result = await h.observe(v);
  assert.equal(result.state, "FAILED");
  assert.match(result.message!, /Saved operation cannot be verified/);
  assert.match(result.message!, /execution outcome is unknown/);
  assert.equal(result.receipt, undefined); assert.equal(result.entries, undefined);
  assert.equal(h.calls.slice(before).filter(c => c.tool).length, 0);
  await assert.rejects(h.service.operation({ ...h.claims, sub: "other" }, "project-a", b.workspaceId, b.version, v.operation.operationId));
});

test("directory navigation projects only accessible children at every depth", async () => {
  const h = workspaceHarness(), b = await h.verified();
  for (const path of ["", "src", "src/components/ui", "src/pages", "src", "src/components/ui"]) {
    const v = await h.request(b, "LIST", path);
    h.complete(v, { entries: [{ name: "dist", type: "directory" }, { name: "node_modules", type: "directory" }, { name: ".git", type: "directory" }, { name: ".env", type: "file" }, { name: "child", type: "directory" }] });
    const observed = await h.observe(v);
    assert.deepEqual(observed.entries?.map(e => e.path), [[path, "child"].filter(Boolean).join("/")]);
    assert.ok(observed.receipt);
    assert.equal((await h.service.latest(h.claims, "project-a", b.workspaceId, b.version, path, "filesystem.list"))?.operation.operationId, v.operation.operationId);
  }
  const count = h.calls.filter(c => c.tool).length;
  for (const path of ["../outside", "src/../../outside", "C:\\outside", "/outside", "src/dist", "src/node_modules", "src/.git"]) await assert.rejects(h.request(b, "LIST", path));
  assert.equal(h.calls.filter(c => c.tool).length, count);
  for (const [error, state] of [[undefined, "READY"], ["EACCES", "DENIED"], ["ENOENT", "DIRECTORY_MISSING"]] as const) {
    const v = await h.request(b, "LIST", "src/empty"); h.complete(v, { entries: [], error });
    const observed = await h.observe(v); assert.equal(observed.state, state);
    assert.deepEqual(observed.entries, error ? undefined : []);
  }
});

for (const [name, claims, project] of [["wrong user", { sub: "other-user" }, "project-a"], ["wrong organization", { organizationId: "org-b" }, "project-a"], ["wrong project", {}, "project-b"]] as const) test(`binding rejects ${name}`, async () => {
  const h = workspaceHarness(), b = await h.create(); await assert.rejects(h.service.getBinding({ ...h.claims, ...claims }, project, b.workspaceId));
});
test("listBindings checks availability sequentially and preserves store order", async () => {
  const h = workspaceHarness();
  await h.create("binding-a", "D:\\Projects\\a"); await h.create("binding-b", "D:\\Projects\\b"); await h.create("binding-c", "D:\\Projects\\c");
  const expected = (await h.store.listBindings(h.claims.sub, "project-a", h.claims.organizationId)).map(binding => binding.workspaceId);
  const original = h.service.getBinding.bind(h.service); let inFlight = 0, maxInFlight = 0; const visited: string[] = [];
  h.service.getBinding = async (claims, projectId, id, version) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); visited.push(id);
    try { await new Promise(resolve => setTimeout(resolve, 0)); return await original(claims, projectId, id, version); }
    finally { inFlight--; }
  };
  const result = await h.service.listBindings(h.claims, "project-a");
  assert.equal(maxInFlight, 1); assert.deepEqual(visited, expected); assert.deepEqual(result.bindings.map(binding => binding.workspaceId), expected);
});
test("listBindings preserves fail-fast errors and does not inspect later bindings", async () => {
  const h = workspaceHarness();
  await h.create("binding-a", "D:\\Projects\\a"); await h.create("binding-b", "D:\\Projects\\b"); await h.create("binding-c", "D:\\Projects\\c");
  const ordered = (await h.store.listBindings(h.claims.sub, "project-a", h.claims.organizationId)).map(binding => binding.workspaceId);
  const failure = new Error("availability database failure"), visited: string[] = [];
  const original = h.service.getBinding.bind(h.service);
  h.service.getBinding = async (claims, projectId, id, version) => {
    visited.push(id);
    if (id === ordered[1]) throw failure;
    return original(claims, projectId, id, version);
  };
  await assert.rejects(h.service.listBindings(h.claims, "project-a"), error => error === failure);
  assert.deepEqual(visited, ordered.slice(0, 2));
});
test("listBindings retains project authorization before any binding inspection", async () => {
  const h = workspaceHarness(); let inspected = 0;
  h.service.getBinding = async () => { inspected++; throw new Error("must not inspect"); };
  await assert.rejects(h.service.listBindings({ ...h.claims, organizationId: "other-organization" }, "project-a"));
  assert.equal(inspected, 0);
});
for (const [name, change, expected] of [
  ["revoked", (h: any) => h.device.status = "REVOKED", "REVOKED"], ["disabled", (h: any) => h.device.status = "DISABLED", "REVOKED"],
  ["expired grant", (h: any) => h.grant.expiresAt = new Date(0).toISOString(), "EXPIRED_GRANT"],
  ["offline", (h: any) => h.device.lastSeenAt = new Date(0).toISOString(), "OFFLINE"],
  ["revoked grant", (h: any) => h.grant.status = "REVOKED", "UNAUTHORIZED"],
  ["changed fingerprint", (h: any) => h.device.fingerprint = "b".repeat(64), "STALE"]] as const) test(`${name} prevents proposals and reports ${expected}`, async () => {
  const h = workspaceHarness(), b = await h.create(); change(h); assert.equal((await h.service.getBinding(h.claims, "project-a", b.workspaceId)).status, expected);
  await assert.rejects(h.request(b, "VERIFY")); assert.equal(h.calls.filter(c => c.tool).length, 0);
});
test("folder requires verified approved listing; exact Windows root is frozen", async () => {
  const h = workspaceHarness(), b = await h.create(); assert.equal(b.status, "VERIFYING"); await assert.rejects(h.request(b, "READ", "HELLO.md"));
  const v = await h.request(b, "VERIFY"); assert.equal(v.state, "APPROVAL_REQUIRED"); assert.equal(v.operation.absolutePath, b.rootPath);
  assert.deepEqual(h.calls.find(c => c.tool).input, { path: b.rootPath }); assert.notEqual(b.workspaceId, h.grant.grantId);
  assert.equal((await h.store.getBinding(b.workspaceId))?.status, "VERIFYING"); h.complete(v); assert.equal((await h.observe(v)).state, "READY"); assert.equal((await h.store.getBinding(b.workspaceId))?.status, "READY");
});

test("lazy binding is identity-only and directory/file requests stay scoped to one path", async () => {
  const h = workspaceHarness(), b = await h.create();
  assert.equal(b.status, "VERIFYING");
  assert.equal(h.calls.filter(c => c.tool).length, 0);
  assert.equal(h.snapshots.size, 0);
  const verify = await h.request(b, "VERIFY");
  h.complete(verify, { entries: [{ name: ".cursor", type: "directory" }, { name: "node_modules", type: "directory" }, { name: "src", type: "directory" }] });
  await h.observe(verify);
  const ready = (await h.store.getBinding(b.workspaceId))!;
  const list = await h.request(ready, "LIST", "src");
  assert.equal(list.state, "APPROVAL_REQUIRED");
  h.complete(list); const observed = await h.observe(list);
  assert.equal(observed.file, undefined);
  assert.deepEqual(h.calls.filter(c => c.tool).map(c => [c.tool, c.input]), [
    ["filesystem.list", { path: b.rootPath }], ["filesystem.list", { path: `${b.rootPath}\\src` }]
  ]);
  await h.service.latest(h.claims, "project-a", b.workspaceId, b.version, "src", "filesystem.list");
  assert.equal(h.calls.filter(c => c.tool).length, 2);
  const file = await h.request(ready, "READ", "src/index.ts");
  assert.equal(file.state, "APPROVAL_REQUIRED");
  assert.deepEqual(h.calls.filter(c => c.tool).at(-1).input, { path: `${b.rootPath}\\src\\index.ts` });
  assert.equal(h.calls.filter(c => c.tool).length, 3);
});
test("relative navigation rejects escapes without changing trusted machine scope", () => {
  for (const path of ["../secret", "a/../b", "D:\\elsewhere", "\\server\\share", "/outside", "a:stream", "CON", "a. "]) assert.throws(() => workspaceTarget("D:\\project", path));
  assert.equal(workspaceTarget("D:\\project", "src/app.ts").absolutePath, "D:\\project\\src\\app.ts");
});
test("binding version mismatch and old binding cannot retarget a proposal", async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", "HELLO.md");
  await assert.rejects(h.service.getBinding(h.claims, "project-a", b.workspaceId, 2)); await h.create("second", "E:\\other");
  await assert.rejects(h.request(b, "READ", "HELLO.md")); assert.equal((await h.store.getOperation(v.operation.operationId))?.absolutePath, "D:\\Projects\\test\\HELLO.md");
});
test("missing root is persisted as DIRECTORY_MISSING", async () => { const h = workspaceHarness(), b = await h.create(), v = await h.request(b, "VERIFY"); h.complete(v, { error: "ENOENT" }); assert.equal((await h.observe(v)).state, "DIRECTORY_MISSING"); assert.equal((await h.store.getBinding(b.workspaceId))?.status, "DIRECTORY_MISSING"); });

test("observing an older verification cannot replace a newer verification receipt", async () => {
  const h = workspaceHarness(), b = await h.create(), first = await h.request(b, "VERIFY"); h.complete(first);
  h.snapshots.get(first.operation.runId).execution.result.finishedAt = "2026-09-22T00:00:00.000Z";
  await h.observe(first); const second = await h.request((await h.store.getBinding(b.workspaceId))!, "VERIFY"); h.complete(second); await h.observe(second);
  const newer = await h.store.getBinding(b.workspaceId); await h.observe(first);
  assert.deepEqual(await h.store.getBinding(b.workspaceId), newer);
});
test("denied and failed receipts remain distinct", async () => { for (const error of ["EACCES", "EIO"]) { const h = workspaceHarness(), b = await h.create(), v = await h.request(b, "VERIFY"); h.complete(v, { error }); assert.equal((await h.observe(v)).state, error === "EACCES" ? "DENIED" : "FAILED"); } });

for (const state of ["REJECTED", "CANCELLED"] as const) test(`${state} proposal without execution reports control rejection without replay`, async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "LIST", "src/components/layout");
  const snapshot = h.snapshots.get(v.operation.runId);
  snapshot.proposal.state = state;
  snapshot.execution = null;
  const callsBefore = h.calls.filter(c => c.tool).length;
  const observed = await h.observe(v);
  assert.equal(observed.state, "DENIED");
  assert.match(observed.message!, /before execution/);
  assert.match(observed.message!, /not a filesystem permission result/);
  assert.equal(observed.receipt, undefined);
  assert.equal(observed.entries, undefined);
  assert.equal(h.calls.filter(c => c.tool).length, callsBefore);
});
test("listing cap and truncation are surfaced", async () => { const h = workspaceHarness(), b = await h.create(), v = await h.request(b, "VERIFY"); h.complete(v, { truncated: true, entries: Array.from({ length: 256 }, (_, i) => ({ name: `${i}.txt`, type: "file" })) }); const r = await h.observe(v); assert.equal(r.state, "TRUNCATED"); assert.equal(r.entries?.length, 256); });
test("bounded decoded text carries provenance and truncation", async () => { const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", "HELLO.md"); h.complete(v, { text: "x".repeat(32768), truncated: true }); const r = await h.observe(v); assert.equal(r.state, "TRUNCATED"); assert.equal(r.file?.text.length, 32768); assert.equal(r.receipt?.runtimeId, b.runtimeId); assert.ok(r.receipt?.observedAt); assert.match(r.file!.warnings.join(" "), /original bytes were not inspected/); });
for (const [path, text] of [["bad.bin", "apparently text"], ["file.txt", "binary\0content"], ["file.txt", "invalid\ufffd"], ["file.txt", "%PDF-1.7"]]) test(`unsupported ${path}/${JSON.stringify(text)} is not displayed as text`, async () => { const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", path); h.complete(v, { text }); const r = await h.observe(v); assert.equal(r.state, "UNSUPPORTED"); assert.equal(r.file, undefined); });
test("source HTML is preserved; sensitive filenames and secrets remain denied", async () => {
  const h = workspaceHarness(), b = await h.verified(); await assert.rejects(h.request(b, "READ", ".env")); const v = await h.request(b, "READ", "index.html"); h.complete(v, { text: "<script>sourceOnly()</script>" }); assert.equal((await h.observe(v)).file?.mimeType, "text/html");
  const secret = await h.request(b, "READ", "config.txt"); h.complete(secret, { text: 'api_key="abcdefghijklmnop12345678"' }); assert.equal((await h.observe(secret)).state, "DENIED");
});
test("authoritative receipt mismatch is rejected; offline never returns cached file content", async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", "HELLO.md"); h.complete(v); h.snapshots.get(v.operation.runId).proposal.validatedInput.path = "E:\\other"; await assert.rejects(h.observe(v), /MISMATCH/);
  h.device.lastSeenAt = new Date(0).toISOString(); const offline = await h.observe(v); assert.equal(offline.state, "OFFLINE"); assert.equal(offline.file, undefined);
});
test("runtime selection blocks backend fallback, including Agent binding resolution", async () => {
  const h = workspaceHarness(); await h.create(); const bindings = new WorkspaceBindingService(h.projects, h.store); await assert.rejects(bindings.resolve(h.claims, "project-a"), /Backend filesystem fallback is disabled/);
});
test("unknown outcome and reload do not replay operations; mutations are unavailable", async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", "HELLO.md"); h.complete(v, { state: "OUTCOME_UNKNOWN" }); const count = h.calls.length;
  assert.equal((await h.observe(v)).state, "FAILED"); await h.service.latest(h.claims, "project-a", b.workspaceId, 1, "HELLO.md", "filesystem.read"); assert.equal(h.calls.filter(c => c.tool).length, 2);
  await assert.rejects(h.request(b, "WRITE" as any)); assert.ok(h.calls.length >= count); assert.ok(h.calls.filter(c => c.tool).every(c => ["filesystem.list", "filesystem.read"].includes(c.tool)));
});
