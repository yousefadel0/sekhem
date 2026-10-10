import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WorkspaceExplorer } from "../components/workspace/workspace-explorer"
import { RuntimeSetup } from "../components/workspace/trusted-runtime-control"
import { workspaceConnectionPresentation, type RuntimeInventory } from "../lib/workspace-runtime-status"
import type { RuntimeWorkspaceBinding } from "../lib/sekhem-agent"

const device = { runtimeId: "replacement", displayName: "Replacement PC", fingerprint: "new", status: "ACTIVE" as const, lastSeenAt: new Date().toISOString() }
const inventory: RuntimeInventory = { devices: [device], grants: [], loading: false, error: null }
const bound = { runtimeId: device.runtimeId, runtimeFingerprint: device.fingerprint } as RuntimeWorkspaceBinding
const explorer = (runtime?: RuntimeWorkspaceBinding, data = inventory) => renderToStaticMarkup(createElement(WorkspaceExplorer, {
  binding: runtime ? { id: "workspace", name: "Golden", version: "40", projectId: "project", location: "TRUSTED_RUNTIME", runtime } as any : null,
  status: "UNAVAILABLE", error: null, onOpen: () => {}, inventory: data, onConnect: () => {} }))

test("Settings and Workspace identify the same bound connected runtime independently of missing grants", () => {
  const settings = renderToStaticMarkup(createElement(RuntimeSetup, { projectId: "project", boundRuntimeId: device.runtimeId, inventory, onChanged: async () => {} }))
  assert.match(settings, /Replacement PC · Connected/)
  assert.match(explorer(bound), /Connected · Replacement PC/)
  assert.equal(workspaceConnectionPresentation(bound, inventory).connected, true)
})

test("connected unbound computer is visible without fabricating workspace availability or selecting it", () => {
  const html = explorer()
  assert.match(html, /Connected · Replacement PC · workspace binding unavailable/)
  assert.match(html, /No workspace runtime bound/)
  assert.doesNotMatch(html, /Not connected|Connect Computer/)
  assert.equal(workspaceConnectionPresentation(undefined, inventory).boundDevice, undefined)
})

test("revoked old workspace runtime cannot borrow replacement connection", () => {
  const old = { ...bound, runtimeId: "old", runtimeFingerprint: "old-key" }
  const data: RuntimeInventory = { ...inventory, devices: [{ ...device, runtimeId: "old", fingerprint: "old-key", status: "REVOKED" }, device] }
  const state = workspaceConnectionPresentation(old, data)
  assert.equal(state.connected, false); assert.equal(state.boundStatus, "Device revoked")
  assert.match(explorer(old, data), /Connected · Replacement PC · not bound to this workspace/)
  assert.doesNotMatch(explorer(old, data), /Not connected|Connect Computer/)
})

test("missing IDs and changed fingerprints never masquerade as bound runtime", () => {
  for (const b of [{ ...bound, runtimeId: "missing" }, { ...bound, runtimeFingerprint: "wrong" }]) {
    const state = workspaceConnectionPresentation(b, inventory)
    assert.equal(state.connected, false); assert.equal(state.boundDevice, undefined); assert.equal(state.boundStatus, "Bound runtime unavailable")
  }
})

test("multiple connected computers remain separately addressable without implicit binding", () => {
  const data: RuntimeInventory = { ...inventory, devices: [device, { ...device, runtimeId: "second", displayName: "Second PC", fingerprint: "second-key" }] }
  const state = workspaceConnectionPresentation(undefined, data)
  assert.deepEqual(state.connectedDevices.map(d => d.runtimeId), ["replacement", "second"])
  assert.equal(state.boundDevice, undefined)
  const html = explorer(undefined, data)
  assert.match(html, /data-runtime-id="replacement"/); assert.match(html, /data-runtime-id="second"/)
})

test("failed identity snapshots hide stale connectivity while grant errors remain separate", () => {
  assert.equal(workspaceConnectionPresentation(bound, { ...inventory, configurationError: "Identity unavailable" }).connected, false)
  assert.equal(workspaceConnectionPresentation(bound, { ...inventory, authenticationRequired: true }).connected, false)
  assert.equal(workspaceConnectionPresentation(bound, { ...inventory, error: "Grant unavailable", configurationError: null }).connected, true)
})
