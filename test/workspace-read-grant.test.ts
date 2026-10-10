import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WorkspaceReadGrantPanel } from "../components/workspace/workspace-read-grant"
import { workspaceRuntimeState, type RuntimeInventory } from "../lib/workspace-runtime-status"
import { AgentInspectionCard } from "../components/workspace/agent-inspection-card"
import { runtimeOutputVisible } from "../components/workspace/trusted-runtime-control"
import type { RuntimeWorkspaceBinding } from "../lib/sekhem-agent"

const now = Date.now(), time = new Date(now).toISOString()
const b: RuntimeWorkspaceBinding = { workspaceId: "workspace-a", version: 2, revision: 2, runtimeId: "runtime-a", runtimeFingerprint: "a".repeat(64), rootPath: "D:\\fixture", projectId: "project-a", userId: "user-a", organizationId: "org-a", displayName: "Fixture", status: "READY", verifiedAt: time, verificationReceiptId: "verify-a", createdAt: time, updatedAt: time }
const consent = { kind: "WORKSPACE_READ" as const, workspaceId: b.workspaceId, bindingId: b.workspaceId, bindingVersion: b.version, rootPath: b.rootPath, runtimeId: b.runtimeId, runtimeFingerprint: b.runtimeFingerprint, userId: b.userId, organizationId: b.organizationId, projectId: b.projectId, capabilities: ["filesystem.list", "filesystem.search", "filesystem.read"] as any, version: 1, status: "ACTIVE" as const, approvedBy: b.userId, approvedAt: time, expiresAt: new Date(now + 3600000).toISOString(), revokedAt: null, fingerprint: "f".repeat(64) }
const data: RuntimeInventory = { devices: [{ runtimeId: b.runtimeId, displayName: "Windows", fingerprint: b.runtimeFingerprint, status: "ACTIVE", lastSeenAt: time }], loading: false, error: null, grants: [{ grantId: "grant-a", runtimeId: b.runtimeId, userId: b.userId, organizationId: b.organizationId, projectId: b.projectId, mode: "TRUSTED_MACHINE", status: "ACTIVE", capabilities: consent.capabilities, createdAt: time, expiresAt: consent.expiresAt, revokedAt: null, version: 3 }] }
const markup = (inventory: RuntimeInventory, at = now) => renderToStaticMarkup(createElement(WorkspaceReadGrantPanel, { runtime: workspaceRuntimeState(b.projectId, b, "READY", inventory, at), onChanged: async () => {}, onCancel: () => {}, requested: "README.md" }))

test("first read shows one explicit consent with exact scope, bounded duration and prohibited effects", () => {
  const html = markup(data)
  assert.equal((html.match(/>Allow workspace reading for up to one hour</g) ?? []).length, 1)
  for (const text of ["Allow bounded reading of this workspace?", "Fixture", "D:\\fixture", "workspace-a", "v2", "Windows", "Browse, search and read files only.", "This does not allow file changes, deletion, or command execution.", "60 minutes", "Cancel", "README.md"]) assert.ok(html.includes(text), text)
})
test("active read consent displays expiry/version and replaces the approval control with revoke", () => {
  const inventory = structuredClone(data); inventory.grants[0].workspaceRead = consent
  const html = markup(inventory)
  assert.match(html, /Reading allowed until/); assert.match(html, /Grant v3/); assert.match(html, /Recorded expiry/); assert.match(html, /Stop workspace reading/); assert.doesNotMatch(html, />Allow workspace reading for up to one hour</)
  assert.equal(workspaceRuntimeState(b.projectId, b, "READY", inventory, now).readAuthorized, true)
})
for (const state of ["REVOKED", "EXPIRED", "STALE"] as const) test(`${state} consent cannot present active reusable reading`, () => {
  const inventory = structuredClone(data); inventory.grants[0].workspaceRead = structuredClone(consent)
  if (state === "REVOKED") inventory.grants[0].workspaceRead!.status = "REVOKED"
  if (state === "EXPIRED") inventory.grants[0].workspaceRead!.expiresAt = new Date(now - 1).toISOString()
  if (state === "STALE") inventory.grants[0].workspaceRead!.bindingVersion++
  const html = markup(inventory); assert.match(html, new RegExp(({ REVOKED: 'revoked', EXPIRED: 'expired', STALE: 'no longer matches' })[state])); assert.doesNotMatch(html, /Active ·/)
  assert.equal(workspaceRuntimeState(b.projectId, b, "READY", inventory, now).readAuthorized, false)
})
test("covered Agent activity remains visible with each receipt and grant scope", () => {
  const op = { request: { operationId: "operation-a", runtimeId: "runtime-a" }, action: { tool: "filesystem.read", relativePath: "session.ts", purpose: "Inspect source" }, proposalId: "proposal-a", planVersion: 2, state: "VERIFIED", verification: "VERIFIED", receiptId: "receipt-a", workspaceRead: { kind: "WORKSPACE_READ_GRANT", grantId: "grant-a", grantVersion: 3, consent } }
  const run: any = { id: "run-a", projectId: b.projectId, status: "RUNNING", inspection: { state: "NEEDS_MORE_EVIDENCE", iterations: 1, maxIterations: 4, workspace: { workspaceId: b.workspaceId, bindingVersion: 2, runtimeId: b.runtimeId, name: "Fixture" }, operations: [op], current: null, evidence: [], executionVerified: 1, objectiveGrounded: false } }
  const html = renderToStaticMarkup(createElement(AgentInspectionCard, { run }))
  for (const text of ["Authorized by Workspace Read Grant", "filesystem.read", "session.ts", "receipt-a", "VERIFIED", "Grant v3", "Recorded expiry"]) assert.ok(html.includes(text))
  assert.doesNotMatch(html, />Approve</)
})
test("Workspace search results cannot escape current checks through standalone receipt output", () => {
  assert.equal(runtimeOutputVisible({ purpose: `Workspace search · workspace_${"a".repeat(64)} · v2`, toolId: "filesystem.search" }), false)
  assert.equal(runtimeOutputVisible({ purpose: "Requested terminal.execute", toolId: "terminal.execute" }), true)
})

test("offline runtime keeps consent visible without claiming current read availability", () => {
  const inventory = structuredClone(data); inventory.grants[0].workspaceRead = consent
  inventory.devices[0].lastSeenAt = new Date(now - 60000).toISOString()
  const html = markup(inventory)
  assert.match(html, /New operations unavailable: OFFLINE/); assert.match(html, /Stop workspace reading/); assert.doesNotMatch(html, />Allow workspace reading for up to one hour</)
  assert.equal(workspaceRuntimeState(b.projectId, b, "READY", inventory, now).readAuthorized, false)
})

test("revoked parent grant cannot display active reading consent", () => {
  const inventory = structuredClone(data); inventory.grants[0].workspaceRead = consent; inventory.grants[0].status = "REVOKED"
  assert.doesNotMatch(markup(inventory), /Active ·/)
  assert.equal(workspaceRuntimeState(b.projectId, b, "READY", inventory, now).readAuthorized, false)
})
