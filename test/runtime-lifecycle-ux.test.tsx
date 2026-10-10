import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { RuntimeCapabilitySettings, RuntimeAccessStatus } from "../components/workspace/trusted-runtime-control"
import { WorkspaceReadGrantPanel } from "../components/workspace/workspace-read-grant"
import { runtimeEnrollmentState, workspaceRuntimeState, type RuntimeInventory } from "../lib/workspace-runtime-status"
import { configureRuntimeCapabilities, getRuntimeCapabilityEnrollment, renewRuntimeAccess, setWorkspaceReadGrant } from "../lib/sekhem-agent"
import { fetchSekhemApi } from "../lib/sekhem-api"
import type { RuntimeWorkspaceBinding } from "../lib/sekhem-agent"
import type { RuntimeCapabilityEnrollment } from "../backend/src/trusted-runtime/runtime.contract"

const now = Date.now(), timestamp = new Date(now).toISOString()
const binding: RuntimeWorkspaceBinding = { workspaceId: "workspace-a", version: 40, revision: 1, runtimeId: "runtime-a", runtimeFingerprint: "a".repeat(64), userId: "user-a", organizationId: "org-a", projectId: "project-a", rootPath: "D:\\fixture", displayName: "Fixture", status: "READY", verifiedAt: timestamp, verificationReceiptId: "receipt-a", createdAt: timestamp, updatedAt: timestamp }
const enrollment: RuntimeCapabilityEnrollment = { enrollmentId: "enrollment-a", revision: 3, runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint, userId: binding.userId, organizationId: binding.organizationId, projectId: binding.projectId, capabilities: ["filesystem.list", "filesystem.read", "filesystem.search", "filesystem.write"], configuredBy: "user-a", configuredAt: timestamp, status: "ACTIVE", expiresAt: null, revokedAt: null }
const inventory: RuntimeInventory = { loading: false, error: null, enrollments: [enrollment], devices: [{ runtimeId: binding.runtimeId, fingerprint: binding.runtimeFingerprint, displayName: "Computer", status: "ACTIVE", lastSeenAt: timestamp }], grants: [{ grantId: "grant-a", userId: binding.userId, organizationId: binding.organizationId, projectId: binding.projectId, runtimeId: binding.runtimeId, mode: "TRUSTED_MACHINE", status: "ACTIVE", capabilities: [...enrollment.capabilities], version: 7, createdAt: timestamp, expiresAt: new Date(now - 1).toISOString(), revokedAt: null }] }
const props = (data = inventory) => ({ projectId: binding.projectId, runtimeId: binding.runtimeId, inventory: data, onChanged: async () => {} })
const access = (data = inventory) => renderToStaticMarkup(createElement(RuntimeAccessStatus, { ...props(data), required: ["filesystem.write"] }))

const configuration = (data = inventory) => renderToStaticMarkup(createElement(RuntimeCapabilitySettings, props(data)))
const configurationButton = (html: string) => html.match(/<button[^>]*>Configure capabilities<\/button>/)?.[0] ?? ""

test("server-derived development read access needs no renewal; mixed write expiry remains distinct", () => {
  const data = structuredClone(inventory)
  data.grants[0].enrollment = { enrollmentId: enrollment.enrollmentId, revision: enrollment.revision, runtimeFingerprint: enrollment.runtimeFingerprint }
  data.grants[0].persistentReadAccess = true
  data.grants[0].workspaceRead = { kind: "WORKSPACE_READ", workspaceId: binding.workspaceId, bindingId: binding.workspaceId, bindingVersion: binding.version,
    runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint, rootPath: binding.rootPath, userId: binding.userId,
    organizationId: binding.organizationId, projectId: binding.projectId, capabilities: ["filesystem.list", "filesystem.read", "filesystem.search"],
    version: 1, approvedBy: binding.userId, approvedAt: timestamp, expiresAt: new Date(now - 1).toISOString(), status: "ACTIVE", revokedAt: null, fingerprint: "consent-fingerprint" }
  const html = renderToStaticMarkup(createElement(RuntimeAccessStatus, { ...props(data), required: ["filesystem.read"] }))
  assert.match(html, /read access does not require renewal/)
  assert.doesNotMatch(html, /<button[^>]*>Allow access for this work session/)
  assert.match(access(data), /Allow access for this work session/)
  const state = workspaceRuntimeState(binding.projectId, binding, "READY", data, now)
  assert.equal(state.grantStatus, "EXPIRED", "write authorization remains expired")
  assert.equal(state.bindingStatus, "READY"); assert.equal(state.readAuthorized, true)
  const panel = renderToStaticMarkup(createElement(WorkspaceReadGrantPanel, { runtime: state, onChanged: async () => {} }))
  assert.match(panel, /Development reading allowed until revoked/)
  assert.doesNotMatch(panel, /Reading consent has its own duration of up to 60 minutes/)
  data.grants[0].workspaceRead.expiresAt = null
  assert.equal(workspaceRuntimeState(binding.projectId, binding, "READY", JSON.parse(JSON.stringify(data)), now).readAuthorized, true)
  assert.doesNotMatch(renderToStaticMarkup(createElement(WorkspaceReadGrantPanel, { runtime: workspaceRuntimeState(binding.projectId, binding, "READY", data, now), onChanged: async () => {} })), /Invalid Date|1970/)
  data.grants[0].workspaceRead.status = "REVOKED"
  assert.equal(workspaceRuntimeState(binding.projectId, binding, "READY", data, now).readAuthorized, false)
  data.devices[0].status = "REVOKED"
  assert.equal(workspaceRuntimeState(binding.projectId, binding, "READY", data, now).bindingStatus, "REVOKED")
})

test("reload preserves server-owned persistent read state without authorizing stale bindings", () => {
  const data = structuredClone(inventory)
  data.grants[0].persistentReadAccess = true
  data.grants[0].capabilities = ["filesystem.list", "filesystem.read", "filesystem.search"]
  const state = workspaceRuntimeState(binding.projectId, binding, "READY", JSON.parse(JSON.stringify(data)), now)
  assert.equal(state.grantStatus, "ACTIVE"); assert.equal(state.bindingStatus, "READY")
  assert.equal(workspaceRuntimeState(binding.projectId, { ...binding, runtimeFingerprint: "changed" }, "READY", data, now).bindingStatus, "STALE")
  delete data.grants[0].persistentReadAccess
  assert.equal(workspaceRuntimeState(binding.projectId, binding, "READY", data, now).bindingStatus, "EXPIRED_GRANT")
})

test("active runtime and selected project can configure first enrollment with an expired grant", () => {
  const data = structuredClone(inventory); data.enrollments = []
  assert.match(configuration(data), /No explicit capability configuration/)
  assert.match(configurationButton(configuration(data)), /Configure capabilities/)
  assert.doesNotMatch(configurationButton(configuration(data)), /disabled/)
  data.grants = []
  assert.doesNotMatch(configurationButton(configuration(data)), /disabled/)
  assert.equal(renderToStaticMarkup(createElement(RuntimeCapabilitySettings, { ...props(data), projectId: null })), "")
})

test("fresh configuration snapshot remains available despite operational grant failure", () => {
  const data = { ...inventory, enrollments: [], error: "RUNTIME_GRANT_INVALID", configurationError: null }
  assert.doesNotMatch(configurationButton(configuration(data)), /disabled/)
  assert.doesNotMatch(configuration(data), /Capability configuration unavailable/)
  assert.doesNotMatch(access(data), /Allow access for this work session/)
  const hook = readFileSync("hooks/useWorkspaceRuntime.ts", "utf8")
  assert.match(hook, /Promise\.allSettled/)
  assert.match(hook, /if \(deviceResult.status === "rejected"\) throw deviceResult.reason/)
  assert.match(hook, /configurationReady && .*status !== 401/)
})

test("missing inactive stale or unauthorized configuration identity stays disabled", () => {
  for (const data of [
    { ...inventory, devices: [] },
    { ...inventory, devices: [{ ...inventory.devices[0], status: "REVOKED" as const }] },
    { ...inventory, configurationError: "Identity snapshot unavailable" },
    { ...inventory, configurationError: "Authentication required" },
    { ...inventory, enrollmentErrors: { "runtime-a": "Configuration unavailable" } },
    { ...inventory, loading: true },
  ]) assert.match(configurationButton(configuration(data)), /disabled/)
})

test("configuration lookup accepts explicit null enrollment without treating API failures as missing enrollment", async () => {
  const originalFetch = globalThis.fetch, originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  let response = { status: 200, body: { data: null, errors: [] as { code: string; message: string }[] } }
  globalThis.fetch = (async () => new Response(JSON.stringify(response.body), { status: response.status })) as typeof fetch
  try {
    assert.equal(await getRuntimeCapabilityEnrollment(binding.runtimeId, binding.projectId), null)
    await assert.rejects(fetchSekhemApi("/trusted-runtime/grants", { throwOnError: true }))
    response = { status: 403, body: { data: null, errors: [{ code: "FORBIDDEN", message: "Not authorized" }] } }
    await assert.rejects(getRuntimeCapabilityEnrollment(binding.runtimeId, binding.projectId), /Not authorized/)
    response = { status: 200, body: { data: null, errors: [{ code: "INVALID", message: "Invalid configuration" }] } }
    await assert.rejects(getRuntimeCapabilityEnrollment(binding.runtimeId, binding.projectId), /Invalid configuration/)
  } finally { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase }
})

test("explicit enrollment configuration never renews runtime access or read consent", async () => {
  const originalFetch = globalThis.fetch, originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL, calls: string[] = []
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  globalThis.fetch = (async (url: any) => { calls.push(String(url)); return new Response(JSON.stringify({ data: enrollment, errors: [] }), { status: 200 }) }) as typeof fetch
  try {
    await configureRuntimeCapabilities(binding.runtimeId, binding.projectId, 0, [...enrollment.capabilities])
    assert.deepEqual(calls, ["https://example.test/api/trusted-runtime/capability-enrollments"])
    const control = readFileSync("components/workspace/trusted-runtime-control.tsx", "utf8")
    const settings = control.split("export function RuntimeCapabilitySettings")[1].split("export function RuntimeSetup")[0]
    assert.doesNotMatch(settings, /renewRuntimeAccess|setWorkspaceReadGrant|execute|permit/)
  } finally { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase }
})

test("persisted enrolled capabilities and revision restore without a capability checklist", () => {
  const first = renderToStaticMarkup(createElement(RuntimeCapabilitySettings, props()))
  assert.equal(renderToStaticMarkup(createElement(RuntimeCapabilitySettings, props(structuredClone(inventory)))), first)
  assert.match(first, /Modify files/); assert.match(first, /Enrollment revision 3/)
  assert.doesNotMatch(first, /<fieldset>|type="checkbox"/)
  assert.match(first, /does not approve a task or activate runtime access/)
})
test("expired operational access renews enrolled capabilities without reselection", () => {
  const html = access(); assert.match(html, /Allow access for this work session/)
  assert.doesNotMatch(html, /<fieldset>|type="checkbox"|Configure capabilities|filesystem\.write/)
  assert.match(html, /Approval alone does not grant capabilities/)
})
test("active legacy access remains usable without inferred enrollment", () => {
  const data = structuredClone(inventory); data.enrollments = []; data.grants[0].expiresAt = new Date(now + 3600000).toISOString()
  assert.doesNotMatch(access(data), /Capability configuration required|Allow access for this work session/)
  data.grants[0].expiresAt = new Date(now - 1).toISOString()
  assert.match(access(data), /Capability configuration required/)
})
test("genuinely missing enrollment capability requires configuration and cannot renew", () => {
  const data = structuredClone(inventory); data.enrollments![0].capabilities = ["filesystem.read"]
  assert.match(access(data), /Capability configuration required: Modify files/)
  assert.doesNotMatch(access(data), /Allow access for this work session/)
})
test("current grant missing enrolled write offers lifecycle renewal only", () => {
  const data = structuredClone(inventory); data.grants[0].expiresAt = new Date(now + 3600000).toISOString(); data.grants[0].capabilities = ["filesystem.read"]
  assert.match(access(data), /Allow access for this work session/); assert.doesNotMatch(access(data), /Capability configuration required/)
})

test("active grant bound to enrollment 2 offers renewal to current enrollment 3 in Settings", () => {
  const data = structuredClone(inventory)
  data.grants[0].expiresAt = new Date(now + 3600000).toISOString()
  data.grants[0].enrollment = { enrollmentId: enrollment.enrollmentId, revision: 2, runtimeFingerprint: enrollment.runtimeFingerprint }
  data.grants[0].persistentReadAccess = true // stale inventory cannot hide explicit renewal
  const output = renderToStaticMarkup(createElement(RuntimeAccessStatus, props(data)))
  assert.match(output, /Allow access for this work session/)
  assert.match(output, /Grant-bound enrollment revision 2/)
  assert.match(output, /Current enrollment revision 3/)
  data.grants[0].enrollment.revision = 3
  assert.equal(runtimeEnrollmentState(data.devices[0], data.grants[0], data.enrollments![0], now).canRenew, false)
  data.grants[0].status = "REVOKED"
  data.grants[0].enrollment.revision = 2
  assert.equal(runtimeEnrollmentState(data.devices[0], data.grants[0], data.enrollments![0], now).canRenew, false)
})
test("expired revoked invalid stale or unavailable enrollment is never actionable renewal", () => {
  for (const change of [{ status: "REVOKED" }, { expiresAt: new Date(now - 1).toISOString() }, { status: undefined }, { runtimeFingerprint: "different" }]) {
    const data = structuredClone(inventory); Object.assign(data.enrollments![0], change)
    assert.equal(runtimeEnrollmentState(data.devices[0], data.grants[0], data.enrollments![0], now, ["filesystem.write"]).canRenew, false)
    assert.doesNotMatch(access(data), /Allow access for this work session/)
  }
  for (const data of [{ ...inventory, error: "Snapshot stale" }, { ...inventory, loading: true }, { ...inventory, enrollmentErrors: { "runtime-a": "Configuration unavailable" } }]) assert.doesNotMatch(access(data), /Allow access for this work session/)
})
test("read-consent lifecycle and renewal display never alter capability configuration", () => {
  const data = structuredClone(inventory), before = JSON.stringify(data.enrollments)
  data.grants[0].workspaceRead = { kind: "WORKSPACE_READ", ...binding, bindingId: binding.workspaceId, bindingVersion: binding.version, capabilities: ["filesystem.list", "filesystem.search", "filesystem.read"], version: 5, approvedBy: binding.userId, approvedAt: timestamp, expiresAt: new Date(now + 3600000).toISOString(), status: "ACTIVE", revokedAt: null, fingerprint: "consent-fingerprint" }
  const state = workspaceRuntimeState(binding.projectId, binding, "READY", data, now)
  assert.equal(state.readConsentStatus, "ACTIVE"); assert.equal(state.grantStatus, "EXPIRED"); assert.equal(state.readAuthorized, false)
  const html = renderToStaticMarkup(createElement(WorkspaceReadGrantPanel, { runtime: state, onChanged: async () => {} }))
  assert.match(html, /own duration|does not configure capabilities/); assert.doesNotMatch(html, /capped by the current project grant|filesystem\.write|type="checkbox"/)
  assert.equal(JSON.stringify(data.enrollments), before)
})
test("configuration renewal and consent send separate exact production contracts", async () => {
  const originalFetch = globalThis.fetch, originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  const calls: Array<{ url: string; body: any }> = []
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  globalThis.fetch = (async (url: any, options: any) => { calls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null }); return new Response(JSON.stringify({ success: true, data: enrollment, errors: [] }), { status: 200 }) }) as typeof fetch
  try {
    await getRuntimeCapabilityEnrollment(binding.runtimeId, binding.projectId)
    await configureRuntimeCapabilities(binding.runtimeId, binding.projectId, 3, [...enrollment.capabilities])
    await renewRuntimeAccess(enrollment, 7, "explicit-renewal-request")
    await setWorkspaceReadGrant(binding, 7)
    assert.match(calls[0].url, /capability-enrollment$/)
    assert.deepEqual(calls[1].body, { runtimeId: binding.runtimeId, projectId: binding.projectId, expectedRevision: 3, capabilities: enrollment.capabilities, mode: "TRUSTED_MACHINE" })
    assert.deepEqual(calls[2].body, { runtimeId: binding.runtimeId, projectId: binding.projectId, enrollmentRevision: 3, expectedGrantVersion: 7, requestId: "explicit-renewal-request", durationSeconds: 3600 })
    assert.deepEqual(calls[3].body, { bindingVersion: 40, expectedGrantVersion: 7, durationMinutes: 60 })
    assert.ok(calls.every(c => !/permit|execute|proposals|approval/.test(c.url)))
  } finally { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase }
})
test("normal conversation exposes renewal with authoritative refresh; no auto configuration", () => {
  const page = readFileSync("app/page.tsx", "utf8"), hook = readFileSync("hooks/useWorkspaceRuntime.ts", "utf8"), control = readFileSync("components/workspace/trusted-runtime-control.tsx", "utf8")
  assert.match(page, /RuntimeAccessStatus/); assert.match(page, /onChanged={refreshWorkspace}/)
  assert.match(hook, /getRuntimeCapabilityEnrollment/); assert.match(hook, /sequence === generation.current/)
  assert.doesNotMatch(hook, /configureRuntimeCapabilities|renewRuntimeAccess/)
  assert.doesNotMatch(control, /post\("grants",/)
  assert.match(control, /await renewRuntimeAccess[\s\S]*?await onChanged\(\)/)
})
