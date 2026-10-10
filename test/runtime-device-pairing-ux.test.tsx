import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { RuntimeSetup } from "../components/workspace/trusted-runtime-control"
import { pairRuntimeDevice } from "../lib/sekhem-agent"
import { runtimePairingLabel, type RuntimeDeviceSummary } from "../lib/workspace-runtime-status"
import { WorkspaceFolderSelector } from "../components/workspace/workspace-runtime"

const device: RuntimeDeviceSummary = { runtimeId: "new-runtime", displayName: "Golden replacement", fingerprint: "a".repeat(64), status: "ACTIVE", lastSeenAt: null }

test("registered never-connected device restores as paired awaiting connection, not failed pairing", () => {
  const html = renderToStaticMarkup(createElement(RuntimeSetup, { projectId: "project-a", boundRuntimeId: device.runtimeId,
    inventory: { devices: [device], grants: [], loading: false, error: null }, onChanged: async () => {} }))
  assert.match(html, /Golden replacement/); assert.match(html, /Paired · waiting for first connection/)
  assert.match(html, /Pairing succeeded/); assert.match(html, /without -PairOnly using the same -StateDirectory/)
  assert.match(html, /Pairing again is not required/); assert.doesNotMatch(html, /Disconnected/)
  assert.match(html, /Pairing computer name/)
})

test("pairing and connectivity statuses distinguish revoked, connected, disconnected and unavailable", () => {
  assert.equal(runtimePairingLabel(device), "Paired · waiting for first connection")
  assert.equal(runtimePairingLabel({ ...device, lastSeenAt: new Date().toISOString() }), "Connected")
  assert.equal(runtimePairingLabel({ ...device, lastSeenAt: new Date(0).toISOString() }), "Disconnected")
  assert.equal(runtimePairingLabel({ ...device, status: "REVOKED" }), "Device revoked")
  assert.equal(runtimePairingLabel(undefined), "Device status unavailable")
})

test("explicit pair request registers named identity only and never grants or executes", async () => {
  const original = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL, calls: any[] = []
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  globalThis.fetch = (async (url: any, options: any) => { calls.push({ url: String(url), body: JSON.parse(options.body), credentials: options.credentials }); return new Response(JSON.stringify({ data: device, errors: [] }), { status: 200 }) }) as typeof fetch
  try {
    assert.deepEqual(await pairRuntimeDevice(` ${"a".repeat(24)} `, " Golden replacement "), device)
    assert.deepEqual(calls, [{ url: "https://example.test/api/trusted-runtime/enroll", body: { code: "a".repeat(24), displayName: "Golden replacement" }, credentials: "include" }])
  } finally { globalThis.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base }
})

test("safe pairing rejection is preserved instead of becoming a disconnected result", async () => {
  const original = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: null, errors: [{ code: "UNAUTHORIZED", message: "RUNTIME_ENROLLMENT_INVALID" }] }), { status: 401 })) as typeof fetch
  try { await assert.rejects(pairRuntimeDevice("a".repeat(24), "Computer"), /RUNTIME_ENROLLMENT_INVALID/) }
  finally { globalThis.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base }
  const source = readFileSync("components/workspace/trusted-runtime-control.tsx", "utf8")
  assert.match(source, /setError\(e instanceof Error \? e.message/); assert.match(source, /role="alert"/)
})

test("pair-only launcher preserves state selection and exits before worker connection", () => {
  const worker = readFileSync("backend/src/trusted-runtime/runtime-client.ts", "utf8"), launcher = readFileSync("runtime-windows/run-local.ps1", "utf8")
  assert.match(worker, /if \(args.includes\("--pair-only"\)\) return;[\s\S]*await runRuntimeWorker/)
  assert.match(launcher, /'--state', \$StateDirectory/); assert.match(launcher, /if \(\$PairOnly\).*'--pair-only'/)
})

test("new account can pair from the folder selector without navigating to Settings", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceFolderSelector, { projectId: "project-a",
    inventory: { devices: [], grants: [], loading: false, error: null }, ensureConversation: async () => "conversation", onChanged: async () => {} }))
  assert.match(html, /Connect a computer/); assert.match(html, /Connect computer pairing code/)
  assert.match(html, /Pair this computer/); assert.match(html, /Choose Folder/)
  assert.match(html, /Connect your computer above/)
  assert.doesNotMatch(html, /Connect your computer in Settings/)
})

test("inline pairing hides advanced capability configuration and does not change folder authority", () => {
  const html = renderToStaticMarkup(createElement(RuntimeSetup, { pairingOnly: true, projectId: "project-a", boundRuntimeId: device.runtimeId,
    inventory: { devices: [device], grants: [], loading: false, error: null }, onChanged: async () => {} }))
  assert.match(html, /No file access is granted by pairing/)
  assert.doesNotMatch(html, /Configure capabilities|Allow access for this work session|Setup computer/)
})
