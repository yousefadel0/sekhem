import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { workspaceHarness } from "./helpers/workspace-runtime-harness";
import { WorkspaceStoreService, workspaceRecordId } from "../src/workspace-intelligence/workspace-store.service";

test("duplicate/concurrent creation is deterministic; conflicting request reuse rejects", async () => {
  const h = workspaceHarness(), [a, b] = await Promise.all([h.create(), h.create()]); assert.deepEqual(a, b); assert.equal((await h.store.listBindings("user-a", "project-a", "org-a")).length, 1); await assert.rejects(h.create("create-one", "E:\\other"), /CONFLICT/);
});
test("reopening the active folder does not mint a new binding; a different folder still does", async () => {
  const h = workspaceHarness(), first = await h.verified(), same = await h.create("retry-open");
  assert.equal(same.workspaceId, first.workspaceId); assert.equal(same.version, first.version);
  assert.equal((await h.store.listBindings("user-a", "project-a", "org-a")).length, 1);
  const next = await h.create("switch-folder", "E:\\second"), again = await h.create("retry-after-switch", "E:\\second");
  assert.notEqual(next.workspaceId, first.workspaceId); assert.equal(next.version, first.version + 1);
  assert.equal(again.workspaceId, next.workspaceId); assert.equal((await h.store.listBindings("user-a", "project-a", "org-a")).length, 2);
});
test("active binding survives reload; previous bindings and immutable history remain", async () => {
  const h = workspaceHarness(), a = await h.verified(), b = await h.create("second", "E:\\second"), reload = new WorkspaceStoreService(h.db);
  assert.equal(b.version, a.version + 1);
  assert.equal((await reload.getActiveBinding("user-a", "project-a", "org-a"))?.workspaceId, b.workspaceId); assert.equal((await reload.getBinding(a.workspaceId))?.rootPath, a.rootPath);
  assert.equal((await reload.listBindings("user-a", "project-a", "org-a")).length, 2); assert.ok([...h.rows.values()].filter(r => r.metadata.kind === "history").length >= 5);
});
test("CAS allows only one competing update and retains the original target", async () => {
  const h = workspaceHarness(), b = await h.create(), results = await Promise.allSettled([h.store.updateBinding(b.workspaceId, 1, { status: "STALE" }), h.store.updateBinding(b.workspaceId, 1, { status: "REVOKED" })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await h.store.getBinding(b.workspaceId))?.rootPath, b.rootPath); await assert.rejects(h.store.updateBinding(b.workspaceId, 2, { status: "STALE", rootPath: "E:\\changed" } as any), /IMMUTABLE/);
});
test("corrupt payload and database errors fail closed", async () => {
  const h = workspaceHarness(), b = await h.create(); h.rows.get(workspaceRecordId("binding", b.workspaceId)).metadata.payload.rootPath = "E:\\tampered"; await assert.rejects(h.store.getBinding(b.workspaceId), /CORRUPT/);
  h.db.$transaction = async () => { throw new Error("database unavailable") }; await assert.rejects(h.store.getActiveBinding("user-a", "project-a", "org-a"), /unavailable/);
});
test("private Workspace records do not masquerade as runtime records or appear in generic audit", async () => {
  const h = workspaceHarness(); await h.verified(); assert.ok([...h.rows.values()].every(r => r.module === "SEKHEM_WORKSPACE_V1" && r.projectId === null && r.initiativeId === null));
  const source = readFileSync("src/data-access/postgres-product-read.repository.ts", "utf8"); assert.match(source, /notIn: \["SEKHEM_TRUSTED_RUNTIME_V1", "SEKHEM_WORKSPACE_V1"\]/);
  assert.equal((await h.db.auditEvent.findMany({ where: { module: { notIn: ["SEKHEM_TRUSTED_RUNTIME_V1", "SEKHEM_WORKSPACE_V1"] } } })).length, 0);
});
test("opening a file does not admit its runtime messages as model evidence", async () => {
  const h = workspaceHarness(), b = await h.verified(), v = await h.request(b, "READ", "HELLO.md");
  const messages = [{ content: "UI observation", metadata: { agentRunId: v.operation.runId } }, { content: "Real user question", metadata: {} }];
  assert.deepEqual(await h.store.modelMessages(messages), [messages[1]]);
});
