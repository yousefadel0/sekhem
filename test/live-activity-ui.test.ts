import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ThinkingIndicator, WorkflowActivityIndicator } from "../components/chat/thinking-indicator"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { reconcileConversationSnapshot, snapshotDeliveryFailure, submissionRun } from "../lib/conversation-restoration"

const base = (extra: any = {}): any => ({ id: "run", conversationId: "conversation", projectId: "project", title: "Read the heading", status: "RUNNING",
  agentName: "SEKHEM", createdAt: "2026-10-01", updatedAt: "2026-10-01", progressPercent: 0, planVersion: 1, pendingApprovals: [], ...extra })
const inspection = (state: string, extra: any = {}): any => ({ state, code: "OK", iterations: 1, maxIterations: 4, operations: [], evidence: [], executionVerified: 1, objectiveGrounded: false, ...extra })
const ready = (): any => ({ observedAt: 1, proposal: { id: "proposal", version: 1, revision: 1, state: "READY", digest: "secret-digest" } })
const render = (run: any, stale = false) => renderToStaticMarkup(React.createElement(WorkflowActivityIndicator, { run, stale }))
test("workspace activity hides binding identifiers while preserving original title in Details", () => {
  const run = base({ id: "rtrun_saved", title: "Workspace list · workspace_private · v45", status: "COMPLETED" })
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run, onSelect: () => {} }))
  assert.match(html, /Reviewing project structure/)
  assert.doesNotMatch(html.split("<details")[0], /workspace_private|v45/)
  assert.match(html, /workspace_private/)
})

for (const [run, label, phase] of [
  [base(), "Analyzing", "ANALYZING"],
  [base({ inspection: inspection("UNDERSTANDING") }), "Understanding", "UNDERSTANDING"],
  [base({ inspection: inspection("EXECUTING") }), "Inspecting", "INSPECTING"],
  [base({ status: "PLANNING" }), "Planning", "PLANNING"],
  [base({ status: "COMPLETED", workflow: ready() }), "Proposal ready", "PROPOSAL_READY"],
  [base({ inspection: inspection("AWAITING_APPROVAL") }), "Awaiting approval", "WAITING_FOR_APPROVAL"],
  [base({ execution: { status: "RUNNING", phase: "EXECUTING" } }), "Executing", "EXECUTING"],
  [base({ execution: { status: "RUNNING", phase: "VERIFYING" } }), "Verifying", "VERIFYING"],
  [base({ status: "COMPLETED", inspection: inspection("COMPLETED", { objectiveGrounded: true, understanding: { status: "GROUNDED", understanding: { readiness: "UNDERSTANDING_READY" } } }) }), "Completed", "COMPLETED"],
  [base({ status: "FAILED", inspection: inspection("FAILED") }), "Failed", "FAILED"],
  [base({ execution: { status: "BLOCKED" } }), "Blocked", "BLOCKED"],
] as const) test(`visible saved phase: ${label}`, () => {
  const html = render(run)
  assert.match(html, new RegExp(`>${label}<`)); assert.ok(html.includes(`data-phase="${phase}"`))
  assert.doesNotMatch(html, /progressbar|secret-digest|security|capabilities|chain.of.thought/)
  assert.equal(render(JSON.parse(JSON.stringify(run))), html)
})

test("conversation activity ignores transient labels and restores persisted understanding", () => {
  const run = base({ inspection: inspection("UNDERSTANDING") })
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run, activity: "EXECUTION_COMPLETED", onSelect: () => {} }))
  assert.match(html, /data-phase="UNDERSTANDING"/)
  assert.doesNotMatch(html, /data-phase="COMPLETED"/)
  assert.match(render(run, true), /Last saved state/)
  assert.doesNotMatch(render(run, true), /thinking-dots/)
})

test("operation evidence stays in a collapsed disclosure", () => {
  const run = base({ inspection: inspection("EXECUTING", { operations: [{ request: { operationId: "op" }, action: { tool: "filesystem.read", relativePath: "package.json" }, verification: "VERIFIED", state: "COMPLETED" }] }) })
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run, onSelect: () => {} }))
  assert.match(html, /<details[^>]*><summary[^>]*>Inspection details · 1 operations<\/summary>/)
  assert.doesNotMatch(html, /<details[^>]*\bopen/)
})

test("approval is waiting for the user without processing dots; read request stays distinct", () => {
  const html = render(base({ inspection: inspection("AWAITING_APPROVAL") }))
  assert.match(html, /Waiting for you · Review the read request/); assert.match(html, /data-activity="read"/)
  assert.doesNotMatch(html, /thinking-dots|is-processing|Executing/)
  const proposal = ready(); proposal.approval = { state: "PENDING", actionable: true, deadline: "2099-01-01", generation: 1 }
  assert.match(render(base({ status: "COMPLETED", workflow: proposal })), /Waiting for you · Review the approval request/)
})

test("read and modification activity use distinct labels and styles", () => {
  const read = render(base({ inspection: inspection("EXECUTING") })), write = render(base({ execution: { status: "RUNNING", phase: "EXECUTING" } }))
  assert.match(read, /is-reading/); assert.match(read, /Read-only inspection/); assert.doesNotMatch(read, />Executing</)
  assert.match(write, /data-activity="execution"/); assert.doesNotMatch(write, /is-reading|Read-only inspection/)
})

test("settled/attention states have no processing animation and unknown outcomes stay explicit", () => {
  for (const status of ["FAILED", "BLOCKED", "CANCELLED"]) assert.doesNotMatch(render(base({ execution: { status } })), /thinking-dots/)
  assert.match(render(base({ execution: { status: "FAILED", reason: "OUTCOME_UNKNOWN" } })), /Outcome unknown/)
  assert.match(render(base({ status: "PAUSED" })), /Paused/)
  assert.match(render(base({ status: "QUEUED" })), /Queued/)
  assert.match(render(base({ status: "COMPLETED", outcome: "PLAN_READY" })), /Plan ready/)
  assert.doesNotMatch(render(base({ status: "COMPLETED", outcome: "PLAN_READY" })), /Proposal ready/)
})

test("stale snapshot retains saved phase, clearly labels stale delivery and stops animation", () => {
  const saved = base({ inspection: inspection("EXECUTING") })
  const last = snapshotDeliveryFailure(saved)
  const html = render(last.snapshot, last.stale)
  assert.match(html, /Inspecting/); assert.match(html, /Last saved state · Live updates unavailable/)
  assert.match(html, /data-stale="true"/); assert.doesNotMatch(html, /thinking-dots|is-processing/)
})

test("reload and older reconnect snapshot preserve the same execution phase without commands", () => {
  const current: any = { id: "conversation", projectId: "project", messages: [], agentRuns: [base({ execution: { runId: "run", planVersion: 1, revision: 3, status: "RUNNING", phase: "VERIFYING" } })] }
  const loaded = reconcileConversationSnapshot(undefined, current)
  assert.equal(render(loaded.agentRuns[0]), render(current.agentRuns[0]))
  const older = { ...current, agentRuns: [base({ execution: { runId: "run", planVersion: 1, revision: 2, status: "RUNNING", phase: "EXECUTING" } })] }
  assert.match(render(reconcileConversationSnapshot(loaded, older).agentRuns[0]), />Verifying</)
})

test("ordinary chat stays normal while a different workflow is pending", () => {
  const snapshot: any = { id: "conversation", projectId: "project", messages: [], agentRuns: [base({ workflow: ready() })] }
  assert.equal(submissionRun(snapshot, { id: "greeting", content: "Hello" }), undefined)
  const html = renderToStaticMarkup(React.createElement(ThinkingIndicator))
  assert.match(html, /Responding/); assert.doesNotMatch(html, /data-phase|Proposal ready|Waiting for approval/)
})

test("run card keeps history/details while showing the persisted phase and omits raw diagnostic/model values", () => {
  const run = base({ inspection: inspection("UNDERSTANDING"), activity: [{ payload: { text: "RAW_MODEL_OUTPUT" } }], workflow: undefined })
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run, detail: run, stale: true, onSelect: () => {} }))
  assert.match(html, />Understanding</); assert.match(html, /View details/); assert.match(html, /Read the heading/)
  assert.match(html, /Last saved state/); assert.doesNotMatch(html, /RAW_MODEL_OUTPUT/)
})
