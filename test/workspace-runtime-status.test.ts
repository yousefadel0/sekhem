import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { runtimeDeviceState, runtimeSelection, workspaceRuntimeState, workspaceFolderDevices, type RuntimeInventory } from "../lib/workspace-runtime-status"
import { RuntimeStatus, WorkspaceRuntimeSummary, SavedObservationStatus } from "../components/workspace/sekhem-primitives"
import { TrustedRuntimeComposer } from "../components/workspace/trusted-runtime-control"
import { WorkspaceExplorer } from "../components/workspace/workspace-explorer"
import type { RuntimeWorkspaceBinding } from "../lib/sekhem-agent"

const now = Date.parse("2026-09-24T00:00:00Z")
const binding: RuntimeWorkspaceBinding = { workspaceId: "workspace-b", runtimeId: "runtime-b", runtimeFingerprint: "b".repeat(64), version: 18, revision: 2, projectId: "project-a", organizationId: "org-a", userId: "user-a", rootPath: "D:\\fixture", displayName: "fixture", status: "READY", verifiedAt: new Date(now - 3600000).toISOString(), verificationReceiptId: "receipt-b", createdAt: "", updatedAt: "" }
const inventory: RuntimeInventory = { loading: false, error: null, devices: [
  { runtimeId: "runtime-a", displayName: "Old PC", fingerprint: "a".repeat(64), status: "REVOKED", lastSeenAt: new Date(now).toISOString() },
  { runtimeId: "runtime-b", displayName: "Workspace PC", fingerprint: binding.runtimeFingerprint, status: "ACTIVE", lastSeenAt: new Date(now).toISOString() },
  { runtimeId: "runtime-c", displayName: "Offline PC", fingerprint: "c".repeat(64), status: "ACTIVE", lastSeenAt: new Date(0).toISOString() },
], grants: [{ grantId: "grant-b", runtimeId: "runtime-b", projectId: "project-a", organizationId: "org-a", userId: "user-a", mode: "TRUSTED_MACHINE", version: 1, status: "ACTIVE", capabilities: ["filesystem.list", "filesystem.read"], createdAt: "", revokedAt: null, expiresAt: new Date(now + 3600000).toISOString() }] }
const project = (data = inventory, status = "READY", b: RuntimeWorkspaceBinding | null = binding) => workspaceRuntimeState("project-a", b, status, data, now)
const html = (component: any, props: any) => renderToStaticMarkup(createElement(component, props))
const noop = async () => {}

test("navbar, Workspace summary and composer identify bound B when revoked A is first", () => {
  const state = project()
  assert.equal(state.device?.runtimeId, "runtime-b")
  for (const component of [RuntimeStatus, WorkspaceRuntimeSummary]) {
    const output = html(component, { runtime: state }); assert.match(output, /data-runtime-id="runtime-b"/); assert.match(output, /Workspace PC/); assert.doesNotMatch(output, /Old PC|Offline PC/)
  }
  const output = html(TrustedRuntimeComposer, { projectId: "project-a", runtime: state, inventory, ensureConversation: noop, onProposed: noop })
  assert.match(output, /value="runtime-b" selected=""/); assert.doesNotMatch(output, /value="runtime-a" selected/)
  assert.match(output, /Identity: ACTIVE/); assert.match(output, /Connection: CONNECTED/); assert.match(output, /Project grant: ACTIVE/)
  assert.match(output, /Workspace binding: READY/); assert.match(output, /Each exact action requires approval/)
})
test("without a binding no owned device is silently chosen", () => {
  const state = project(inventory, "Available", null)
  assert.equal(state.device, undefined); assert.equal(state.headline, "No runtime bound")
  const output = html(TrustedRuntimeComposer, { projectId: "project-a", runtime: state, inventory, ensureConversation: noop, onProposed: noop })
  assert.match(output, /value="" selected=""/); assert.doesNotMatch(output, /value="runtime-[abc]" selected/)
  assert.match(html(RuntimeStatus, { runtime: state }), /Installation status unknown/)
})
test("missing bound runtime never substitutes another active device", () => {
  const state = project({ ...inventory, devices: inventory.devices.filter(d => d.runtimeId !== "runtime-b") })
  assert.equal(state.headline, "Workspace Runtime unavailable"); assert.equal(state.binding?.runtimeId, "runtime-b"); assert.equal(state.device, undefined)
  assert.equal(state.bindingStatus, "UNAVAILABLE")
})
for (const identity of ["REVOKED", "DISABLED"] as const) test(`${identity} B stays bound and is unavailable`, () => {
  const data = structuredClone(inventory); data.devices[1].status = identity
  const state = project(data); assert.equal(state.identity, identity); assert.equal(state.connection, "UNAVAILABLE"); assert.equal(state.bindingStatus, "REVOKED")
  assert.equal(state.device?.runtimeId, "runtime-b"); assert.equal(state.readAccess, "Unavailable")
})
test("offline B cannot borrow another device's connection", () => {
  const data = structuredClone(inventory); data.devices[1].lastSeenAt = new Date(now - 45001).toISOString(); data.devices[2].lastSeenAt = new Date(now).toISOString()
  const state = project(data); assert.equal(state.connection, "OFFLINE"); assert.equal(state.bindingStatus, "OFFLINE"); assert.equal(state.device?.runtimeId, "runtime-b")
})
for (const kind of ["REVOKED", "EXPIRED", "MISSING"] as const) test(`connected identity with ${kind} project grant is not ready or authorized`, () => {
  const data = structuredClone(inventory)
  if (kind === "MISSING") data.grants = []
  else if (kind === "REVOKED") data.grants[0].status = "REVOKED"
  else data.grants[0].expiresAt = new Date(now).toISOString()
  const state = project(data); assert.equal(state.connection, "CONNECTED"); assert.equal(state.grantStatus, kind); assert.notEqual(state.bindingStatus, "READY")
  assert.notEqual(state.readAccess, "Approval required for each operation")
})
test("fresh binding rejection overrides older inventory and retains the exact runtime", () => {
  for (const status of ["REVOKED", "OFFLINE", "STALE", "UNAUTHORIZED", "EXPIRED_GRANT"]) {
    const state = project(inventory, status); assert.equal(state.bindingStatus, status); assert.equal(state.binding?.runtimeId, "runtime-b"); assert.notEqual(state.readAccess, "Approval required for each operation")
  }
})
test("fingerprint mismatch and failed status lookup do not claim availability", () => {
  const data = structuredClone(inventory); data.devices[1].fingerprint = "d".repeat(64)
  assert.equal(project(data).bindingStatus, "STALE")
  assert.equal(project({ ...inventory, error: "Unavailable" }).headline, "Workspace Runtime unavailable")
  assert.equal(project({ ...inventory, error: "Unavailable" }).connection, "UNKNOWN")
})
test("explicit selector changes never retarget bindings; entering a different binding resets selection", () => {
  const state = project(), selection = { scope: "workspace-b:18", runtimeId: "runtime-a" }
  assert.equal(runtimeSelection(state.binding?.runtimeId, null, "workspace-b:18"), "runtime-b")
  assert.equal(runtimeSelection(state.binding?.runtimeId, selection, "workspace-b:18"), "runtime-a")
  assert.equal(state.binding?.runtimeId, "runtime-b")
  assert.equal(runtimeSelection("runtime-c", selection, "workspace-c:19"), "runtime-c")
  assert.equal(runtimeSelection(undefined, selection, "no-workspace"), "")
})
test("project switching cannot display the previous project's runtime as the new binding", () => {
  assert.equal(workspaceRuntimeState("project-other", binding, "Loading", inventory, now).binding, null)
})
test("historical receipt label never claims a live scan or authorizes a new operation", () => {
  const receipt = { observedAt: binding.verifiedAt!, bindingVersion: 18 }
  const visible = html(SavedObservationStatus, { receipt, available: true })
  assert.match(visible, /Saved observation/); assert.match(visible, /Previously verified/); assert.match(visible, /Binding v18/)
  assert.match(visible, /new operations require current authorization/); assert.match(visible, /filesystem may have changed/)
  assert.match(html(SavedObservationStatus, { receipt, available: false }), /currently unavailable/)
  assert.match(html(SavedObservationStatus, { receipt }), /availability not checked/)
})
test("unavailable Explorer shows saved receipt metadata, no directory operation or backend tree", () => {
  for (const status of ["REVOKED", "OFFLINE", "STALE", "UNAUTHORIZED", "EXPIRED_GRANT"]) {
    const output = html(WorkspaceExplorer, { binding: { id: binding.workspaceId, projectId: binding.projectId, name: binding.displayName, version: "18", location: "TRUSTED_RUNTIME", mode: "READ_ONLY", runtime: binding }, status, runtime: project(inventory, status), error: null, onOpen: noop, ensureConversation: noop, onChanged: noop })
    assert.match(output, /Saved observation/); assert.match(output, /currently unavailable/); assert.match(output, /No backend filesystem fallback/)
    assert.doesNotMatch(output, /Refresh directory|Load directory|Verify \/ list folder/)
  }
})
test("ACTIVE identity is not installation detection or perpetual connectivity", () => {
  const device = inventory.devices[1]
  assert.equal(runtimeDeviceState(device, inventory.grants[0], now + 45000).connection, "OFFLINE")
  assert.equal(project().installation, "Installation status unknown")
})

test("folder selector stops presenting a cached online device after shared inventory revocation", () => {
  const discovered = [{ ...inventory.devices[1], online: true }]
  const data = structuredClone(inventory); data.devices[1].status = "REVOKED"
  assert.equal(workspaceFolderDevices(discovered, data, now)[0].status, "REVOKED")
  assert.equal(workspaceFolderDevices(discovered, data, now)[0].online, false)
  // The shared inventory cannot introduce devices absent from project-scoped discovery.
  assert.equal(workspaceFolderDevices(discovered, inventory, now).length, 1)
  assert.equal(workspaceFolderDevices(discovered, inventory, now + 45001)[0].online, false)
  assert.deepEqual(workspaceFolderDevices(discovered, { ...inventory, error: "Unavailable" }, now), [])
  assert.deepEqual(workspaceFolderDevices(discovered, { ...inventory, devices: [] }, now), [])
})
