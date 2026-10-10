import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { CAPABILITY_LABELS, capabilityLabel, capabilityDescription, workspaceAccessSummary } from "../lib/workspace-presentation"
import { RUNTIME_TOOLS } from "../backend/src/trusted-runtime/runtime.contract"
import { TOOL_PERMISSIONS } from "../backend/src/agent-runtime/tools/tool-contract"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { AgentControlCard } from "../components/workspace/agent-control-card"
import { AgentInspectionCard } from "../components/workspace/agent-inspection-card"
import { TrustedRuntimeExecutionCard } from "../components/workspace/trusted-runtime-control"
import { WorkspaceRuntimeSummary } from "../components/workspace/sekhem-primitives"
import { workspaceRuntimeState } from "../lib/workspace-runtime-status"

const expected = {
  "filesystem.list": "Browse workspace", "filesystem.search": "Search workspace", "filesystem.read": "Read files",
  "filesystem.write": "Modify files", "filesystem.create": "Create files", "filesystem.delete": "Delete files",
  "filesystem.move": "Move files", "filesystem.copy": "Copy files", "terminal.execute": "Run a reviewed command",
  "git.read": "Read Git data", "git.write": "Modify Git data", "package.install": "Install packages", "browser.open": "Open web pages",
  "git.status": "View Git status", "git.diff": "View Git changes", "git.log": "View Git history", "git.branch": "View Git branches",
  "git.checkout": "Switch Git revision", "git.add": "Stage Git changes", "git.commit": "Commit Git changes", "git.push": "Push Git changes",
}
for (const [id, label] of Object.entries(expected)) test(`${id} has a distinct truthful label`, () => assert.equal(capabilityLabel(id), label))
test("every runtime capability and permission has a label; unknown IDs confer nothing", () => {
  for (const id of [...RUNTIME_TOOLS, ...TOOL_PERMISSIONS]) assert.notEqual(capabilityLabel(id), "Unknown capability")
  assert.deepEqual(CAPABILITY_LABELS, expected)
  for (const id of ["filesystem.unrecognized", "process.kill", "toString", "__proto__", ""]) assert.equal(capabilityLabel(id), "Unknown capability")
  assert.equal(capabilityDescription("Requested filesystem.delete"), "Requested Delete files")
})
const primary = (html: string) => html.replace(/<details\b[^>]*\bopen=""[^>]*>/g, "").replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "")
const render = (component: any, props: any) => renderToStaticMarkup(React.createElement(component, props))
const run = (): any => ({ id: "run-a", conversationId: "conversation-a", projectId: "project-a", title: "Inspect source", status: "RUNNING", agentName: "SEKHEM", progressPercent: 0, pendingApprovals: [], createdAt: "2026-10-01", updatedAt: "2026-10-01",
  inspection: { state: "EXECUTING", code: "OK", executionVerified: 0, operations: [{ request: { operationId: "operation-a" }, action: { tool: "filesystem.read", relativePath: "index.html" }, state: "EXECUTING" }], evidence: [], objectiveGrounded: false } })
test("conversation read activity uses labels and retains the tool in advanced details", () => {
  const r = run(), html = render(AgentRunCard, { run: r, detail: r, onSelect: () => {} })
  assert.match(primary(html), /Read files/); assert.doesNotMatch(primary(html), /filesystem\.read|Executing/)
  assert.match(html, /<details><summary>Operation details<\/summary>filesystem\.read/)
})
test("inspection approval has human-readable reading scope, with identity only in details", () => {
  const r = run(), op = { ...r.inspection.operations[0], planVersion: 2, proposalId: "proposal-secret", action: { tool: "filesystem.search", relativePath: "index.html", purpose: "Inspect filesystem.search" } }
  r.inspection = { ...r.inspection, state: "AWAITING_APPROVAL", iterations: 1, maxIterations: 4, workspace: { name: "Fixture", workspaceId: "workspace-secret", runtimeId: "runtime-secret", bindingVersion: 40 }, current: op, operations: [op] }
  const html = render(AgentInspectionCard, { run: r })
  assert.match(primary(html), /Search workspace/); assert.match(primary(html), /Read-only workspace inspection/)
  assert.doesNotMatch(primary(html), /filesystem\.search|proposal-secret|runtime-secret|workspace-secret/)
  assert.match(html, /Tool filesystem\.search/)
})
test("action card hides technical identities and fingerprints without losing audit data", () => {
  const hash = "a".repeat(64), r = { ...run(), inspection: undefined, control: { state: "ACTION_PROPOSED", executionPerformed: false, proposal: {
    toolId: "filesystem.delete", toolVersion: "1.0.0", scope: { paths: ["obsolete.txt"], workspaceId: "workspace-secret" },
    purpose: "Review filesystem.delete", preview: { available: true, description: `filesystem.delete preimage ${hash}` }, effect: "DESTRUCTIVE", risk: "HIGH",
    planId: "plan-secret", planVersion: 4, planStepId: "step-secret", workspaceBindingVersion: 40, proposalDigest: hash,
  } } }
  const html = render(AgentControlCard, { run: r })
  assert.match(primary(html), /Delete files/)
  assert.doesNotMatch(primary(html), /filesystem\.delete|workspace-secret|plan-secret|step-secret|aaaaaaaa|DESTRUCTIVE|HIGH|1\.0\.0/)
  for (const value of ["filesystem.delete", hash, "workspace-secret", "plan-secret"]) assert.ok(html.includes(value))
})
function runtimeMarkup(tool: string) {
  // A persisted snapshot only: effects/polling never run and no API is called.
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  const prior = internals.H
  let state = 0
  internals.H = { useState: (initial: any) => [state++ === 0 ? { proposal: {
    toolId: tool, state: "EXPIRED", purpose: "Runtime record", validatedInput: { path: "index.html" },
    preview: { description: `${tool} fingerprint ${"c".repeat(64)}` }, proposalDigest: "d".repeat(64), grantVersion: 78,
  }, execution: null } : initial, () => {}], useRef: () => ({ current: null }), useEffect: () => {} }
  let element: ReturnType<typeof TrustedRuntimeExecutionCard>
  try { element = TrustedRuntimeExecutionCard({ runId: "runtime-run" }) } finally { internals.H = prior }
  assert.ok(element, "Unscoped runtime action card must render")
  return renderToStaticMarkup(element)
}
for (const tool of RUNTIME_TOOLS) test(`runtime action ${tool} retains its exact effect label`, () => {
  const html = runtimeMarkup(tool)
  assert.ok(primary(html).includes(capabilityLabel(tool)))
  assert.ok(!primary(html).includes(tool)); assert.doesNotMatch(primary(html), /cccccccc|dddddddd|Grant v78/)
  assert.ok(html.includes(tool)); assert.match(html, /cccccccc/)
})
test("unknown runtime tool presentation does not imply permission", () => {
  const html = primary(runtimeMarkup("filesystem.future"))
  assert.match(html, /Unknown capability/); assert.doesNotMatch(html, /Allowed|Authorized|Approved|Modify files/)
})
test("access summaries distinguish expiry, revocation, stale binding and unavailability", () => {
  const base = workspaceRuntimeState("p", null, "Unavailable", { devices: [], grants: [], loading: false, error: null })
  const states = [
    { ...base, readConsentStatus: "EXPIRED" }, { ...base, readConsentStatus: "REVOKED" },
    { ...base, readConsentStatus: "STALE" }, { ...base, readConsentStatus: "ACTIVE", connection: "OFFLINE" },
    { ...base, readConsentStatus: "ACTIVE", connection: "UNKNOWN" },
  ] as any[]
  const labels = states.map(workspaceAccessSummary)
  assert.equal(new Set(labels).size, states.length)
  for (const label of labels) assert.doesNotMatch(label, /allowed|Modify|Delete|Run a/)
})
test("primary runtime access stays separate from static support and technical grant records", () => {
  const runtime: any = { ...workspaceRuntimeState("p", null, "Unavailable", { devices: [], grants: [], loading: false, error: null }),
    binding: { runtimeId: "runtime-secret", runtimeFingerprint: "b".repeat(64), version: 40 }, device: { displayName: "My computer" },
    readConsentStatus: "EXPIRED", grantStatus: "ACTIVE", grant: { version: 78 }, bindingStatus: "READY" }
  const html = render(WorkspaceRuntimeSummary, { runtime })
  assert.match(primary(html), /Reading permission expired/)
  assert.doesNotMatch(primary(html), />[^<]*(?:runtime-secret|bbbbbbbb|Binding v40|filesystem\.write)/)
  assert.match(html, /Access and connection details/); assert.match(html, /bbbbbbbb/)
})
test("read consent wording is bounded and handlers retain exact contract IDs", () => {
  const panel = readFileSync("components/workspace/workspace-read-grant.tsx", "utf8")
  assert.match(panel, /does not allow file changes, deletion, or command execution/)
  assert.match(panel, /own duration of up to 60 minutes/); assert.doesNotMatch(panel, /Always allow|permanent|capped by the current project grant/)
  assert.match(panel, /setWorkspaceReadGrant\(b, grant\?\.version \?\? 0, revoke\)/)
  const control = readFileSync("components/workspace/trusted-runtime-control.tsx", "utf8")
  assert.match(control, /configureRuntimeCapabilities\(runtimeId, projectId, editing.revision, editing.capabilities\)/)
  assert.doesNotMatch(control, /post\("grants",/)
  assert.match(control, /runtimeId, tool, input, purpose:/)
  const approval = readFileSync("components/chat/exact-proposal-approval-card.tsx", "utf8")
  assert.match(approval, /Approve for this task/)
  assert.match(approval, /Approve for this session/)
  assert.doesNotMatch(approval, /Approve for all/)
  assert.match(approval, /Execution is a separate stage/)
})
