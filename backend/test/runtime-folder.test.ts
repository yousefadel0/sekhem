import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import type { FolderSelection } from "../src/trusted-runtime/runtime-folder.service";

async function setup() { const h = await inspectionHarness(); await h.request("connect", { workspaceReadProtocol: 1, folderPickerProtocol: 1 }); return h; }
test("native selection uses signed transport, dispatches once and grants no filesystem authority", async () => {
  const h = await setup(), before = h.tables.agentRun.size;
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  const s = await h.folders.request(h.claims, "project-a", h.device.runtimeId);
  const first = await h.request("poll"); assert.equal(first.execution, null); assert.equal(first.folderSelection.selectionId, s.selectionId);
  assert.equal((await h.request("poll")).folderSelection, undefined);
  await h.request("folder-result", { selectionId: s.selectionId, rootPath: "D:\\Selected folder" });
  assert.equal((await h.folders.observe(h.claims, "project-a", s.selectionId)).rootPath, "D:\\Selected folder");
  assert.equal((await h.store.getActiveBinding(h.claims.sub, "project-a", h.claims.organizationId!))!.workspaceId, h.binding.workspaceId);
  assert.equal(h.tables.agentRun.size, before);
  assert.deepEqual(await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a")), grant);
  await assert.rejects(h.request("folder-result", { selectionId: s.selectionId, rootPath: "D:\\Other" }), /CONSUMED/);
});
test("concurrent requests cannot open multiple dialogs", async () => {
  const h = await setup(); const results = await Promise.allSettled([1, 2].map(() => h.folders.request(h.claims, "project-a", h.device.runtimeId)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});
test("native cancellation returns no path and no binding", async () => {
  const h = await setup(), s = await h.folders.request(h.claims, "project-a", h.device.runtimeId); await h.request("poll");
  const result = await h.request("folder-result", { selectionId: s.selectionId, rootPath: null }); assert.equal(result.state, "CANCELLED"); assert.equal(result.rootPath, null);
});
for (const change of ["revoked", "disabled", "session", "project", "binding", "epoch", "offline", "unsupported"] as const) test(`selection fails closed after ${change} changes`, async () => {
  const h = await setup(), s = await h.folders.request(h.claims, "project-a", h.device.runtimeId); await h.request("poll");
  if (change === "revoked" || change === "disabled") await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, change === "revoked" ? "REVOKED" : "DISABLED");
  if (change === "session") h.tables.userSession.get(h.claims.sessionId).revokedAt = new Date();
  if (change === "project") h.tables.project.get("project-a").organizationId = "other-org";
  if (change === "binding") await h.runtime.createBinding(h.claims, "project-a", { runtimeId: h.device.runtimeId, rootPath: "D:\\Other", displayName: "Other", requestId: "switch" });
  if (change === "epoch") await h.request("connect", { folderPickerProtocol: 1 });
  if (change === "unsupported") await h.request("connect", { workspaceReadProtocol: 1 });
  if (change === "offline") await h.ledger.transaction(async tx => { const d = await h.identity.device(tx, h.device.runtimeId); await h.ledger.update(tx, d, { ...d.payload, lastSeenAt: new Date(0).toISOString() }); });
  await assert.rejects(h.folders.observe(h.claims, "project-a", s.selectionId));
  await assert.rejects(h.request("folder-result", { selectionId: s.selectionId, rootPath: "D:\\Selected" }));
});
test("another owner, project, organization or session cannot retrieve selection", async () => {
  const h = await setup(), s = await h.folders.request(h.claims, "project-a", h.device.runtimeId);
  for (const claims of [{ ...h.claims, sub: "other" }, { ...h.claims, organizationId: "other" }, { ...h.claims, sessionId: "other" }]) await assert.rejects(h.folders.observe(claims, "project-a", s.selectionId), /DENIED/);
  await assert.rejects(h.folders.observe(h.claims, "other-project", s.selectionId), /DENIED/);
});
test("expiry, paths outside supported Windows roots and arbitrary fields are rejected", async () => {
  const h = await setup(), s = await h.folders.request(h.claims, "project-a", h.device.runtimeId); await h.request("poll");
  for (const rootPath of ["..\\secret", "\\\\server\\share", "D:\\foo\\..\\bar"]) await assert.rejects(h.request("folder-result", { selectionId: s.selectionId, rootPath }));
  await assert.rejects(h.request("folder-result", { selectionId: s.selectionId, rootPath: "D:\\Safe", execute: "malicious" }), /INVALID/);
  await h.ledger.transaction(async tx => { const r = (await h.ledger.read<FolderSelection>(tx, "RUNTIME_FOLDER_SELECTION", s.selectionId))!; await h.ledger.update(tx, r, { ...r.payload, expiresAt: new Date(0).toISOString() }); });
  assert.equal((await h.folders.observe(h.claims, "project-a", s.selectionId)).state, "EXPIRED");
  await assert.rejects(h.request("folder-result", { selectionId: s.selectionId, rootPath: "D:\\Safe" }), /EXPIRED/);
});
test("old workers cannot be asked to open native dialogs", async () => {
  const h = await inspectionHarness(); await assert.rejects(h.folders.request(h.claims, "project-a", h.device.runtimeId), /RUNTIME_CHANGED/);
});
