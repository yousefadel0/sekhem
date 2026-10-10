import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { prepareWorkspaceReads, workspaceReadTools } from "../lib/workspace-read-setup"
import { WorkspaceReadSetup } from "../components/workspace/trusted-runtime-control"

const device = { runtimeId: "test-pc", fingerprint: "test-fingerprint", displayName: "TEST computer", status: "ACTIVE" as const, lastSeenAt: new Date().toISOString() }
const enrollment = { runtimeId: device.runtimeId, projectId: "project", runtimeFingerprint: device.fingerprint, status: "ACTIVE", revision: 1, expiresAt: null, revokedAt: null, capabilities: workspaceReadTools } as any

test("missing configuration is explicit and setup does not run during rendering", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceReadSetup, { projectId: "project", runtimeId: device.runtimeId, inventory: { devices: [device], grants: [], loading: false, error: null }, onChanged: async () => { throw new Error("No automatic setup") } }))
  assert.match(html, /Missing permission/); assert.match(html, /Set up file reading/)
})
test("first setup configures only read tools then renews the returned revision", async () => {
  const calls: string[] = []
  await prepareWorkspaceReads(undefined, 0, async (revision, tools) => { assert.equal(revision, 0); assert.deepEqual(tools, workspaceReadTools); calls.push("configure"); return enrollment }, async current => { assert.equal(current, enrollment); calls.push("renew") })
  assert.deepEqual(calls, ["configure", "renew"])
})
test("existing capabilities are preserved when adding missing read tools", async () => {
  await prepareWorkspaceReads({ ...enrollment, capabilities: ["terminal.execute"] }, 1, async (_, tools) => { assert.deepEqual(tools, ["terminal.execute", ...workspaceReadTools]); return enrollment }, async () => {})
})
test("configuration failure stops renewal", async () => {
  let renewed = false
  await assert.rejects(prepareWorkspaceReads(undefined, 0, async () => { throw new Error("CONFIGURATION_DENIED") }, async () => { renewed = true }), /CONFIGURATION_DENIED/)
  assert.equal(renewed, false)
})
test("retry after renewal failure reuses saved configuration", async () => {
  let configured = false
  await assert.rejects(prepareWorkspaceReads(enrollment, 1, async () => { configured = true; return enrollment }, async () => { throw new Error("SESSION_EXPIRED") }), /SESSION_EXPIRED/)
  assert.equal(configured, false)
})
test("offline setup is disabled and explains recovery", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceReadSetup, { projectId: "project", runtimeId: device.runtimeId, inventory: { devices: [{ ...device, lastSeenAt: null }], grants: [], loading: false, error: null }, onChanged: async () => {} }))
  assert.match(html, /disabled/); assert.match(html, /Connect this computer/)
})

for (const [scenario, persistentReadAccess, stale, revoked, expectedReady] of [
  ["server confirms persistent reading for an expired mixed grant", true, false, false, true],
  ["expired grant without confirmed persistent reading", false, false, false, false],
  ["changed enrollment still requires setup", true, true, false, false],
  ["revoked grant cannot present reading as ready", true, false, true, false],
] as const) test(scenario, () => {
  const configured = { ...enrollment, enrollmentId: "reading-enrollment", capabilities: [...workspaceReadTools, "filesystem.write"] }
  const grant = { runtimeId: device.runtimeId, projectId: "project", status: revoked ? "REVOKED" : "ACTIVE",
    revokedAt: revoked ? new Date().toISOString() : null, expiresAt: new Date(Date.now() - 60_000).toISOString(),
    persistentReadAccess, capabilities: configured.capabilities,
    enrollment: { enrollmentId: configured.enrollmentId, revision: stale ? 0 : configured.revision, runtimeFingerprint: device.fingerprint } } as any
  const html = renderToStaticMarkup(createElement(WorkspaceReadSetup, { projectId: "project", runtimeId: device.runtimeId,
    inventory: { devices: [device], grants: [grant], enrollments: [configured], loading: false, error: null },
    onChanged: async () => { throw new Error("Rendering must not configure or renew access") } }))
  assert.equal(html.includes('data-reading-ready="true"'), expectedReady)
  assert.equal(html.includes("Reading tools ready"), expectedReady)
  assert.equal(html.includes("Set up file reading"), !expectedReady)
  assert.equal(html.includes("Reading access needs activation"), !expectedReady)
})
