import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentRunCard, EvidenceList } from "../components/chat/agent-run-card"
import { activityLabel, evidenceSummary, runtimeActionLabel, runTimeline } from "../lib/workspace-presentation"
import type { AgentRunDetail, EvidenceReceipt } from "../lib/sekhem-agent"

const base: EvidenceReceipt = { id: "evidence-one", sourceType: "runtime-workspace", label: "index.html", relativePath: "index.html", outcome: "READ", discovered: true, read: false, selected: true, usedInAnswer: "UNKNOWN", truncated: false, selectionReason: "Selected for inspection" }
const reference = { verificationState: "VERIFIED", receiptId: "receipt-one", relativePath: "index.html", observationTime: "2026-09-27T10:00:00Z" } as NonNullable<EvidenceReceipt["runtimeReference"]>
test("workspace observations do not become source facts, and reads do not become execution results", () => {
  assert.match(evidenceSummary({ ...base, runtimeReference: reference, operation: "filesystem.list" }), /source contents not read/)
  assert.match(evidenceSummary({ ...base, runtimeReference: reference, operation: "filesystem.search" }), /matching excerpts only/)
  const read = { ...base, read: true, operation: "filesystem.read", runtimeReference: reference }
  assert.match(evidenceSummary(read), /Verified Runtime read/); assert.doesNotMatch(evidenceSummary(read), /modified|understood|executed/)
  assert.match(evidenceSummary({ ...read, truncated: true }), /partial/)
  assert.doesNotMatch(evidenceSummary({ ...base, operation: "filesystem.read" }), /Verified Runtime read/)
  assert.match(evidenceSummary({ ...base, outcome: "DENIED" }), /Access denied/)
  assert.match(evidenceSummary({ ...base, runtimeReference: reference }), /See details/)
  const html = renderToStaticMarkup(React.createElement(EvidenceList, { evidence: [read], onOpen: () => {} }))
  assert.match(html, /View evidence details/); assert.ok(html.indexOf("<details>") < html.indexOf("receipt-one"))
  assert.match(html, /Historical observation/); assert.match(html, /does not establish which source influenced/)
})
test("activity separates waiting for instruction, approval and verified execution", () => {
  assert.equal(activityLabel("AWAITING_INPUT"), "Waiting for your instruction")
  assert.equal(activityLabel("AWAITING_APPROVAL"), "Waiting for your approval")
  assert.equal(activityLabel("SECRET_INTERNAL_EVENT"), "Activity recorded — view details")
  assert.doesNotMatch(activityLabel("UNDERSTANDING_CHECKPOINT", { status: "INTERMEDIATE" }), /Grounded findings/)
  assert.match(activityLabel("UNDERSTANDING_CHECKPOINT", { status: "INTERMEDIATE" }), /certification state/)
  assert.equal(runtimeActionLabel("SUCCEEDED", "UNVERIFIED"), "Action finished; verification incomplete")
  assert.equal(runtimeActionLabel("SUCCEEDED", "VERIFIED"), "Action result verified")
  assert.match(runtimeActionLabel("OUTCOME_UNKNOWN"), /uncertain/)
})
test("an inspection paused with a previous action is not displayed as actively working", () => {
  const run = { inspection: { state: "AWAITING_INPUT", iterations: 1, maxIterations: 8, executionVerified: 0, current: {}, objectiveGrounded: false } } as AgentRunDetail
  const inspection = runTimeline(run).find(s => s.label === "Inspection")!
  assert.notEqual(inspection.state, "active"); assert.equal(inspection.detail, "Waiting for your instruction")
})

test("a new plan on a reused run cannot present the previous plan's exact proposal", () => {
  const run: any = { id: "run", status: "FAILED", planVersion: 2, title: "Review next version", createdAt: "2026-10-07T08:49:00Z" }
  const detail: any = { ...run, pendingApprovals: [], workflow: { observedAt: 1, proposal: {
    id: "old-proposal", planId: "old-plan", version: 1, digest: "a".repeat(64), revision: 1, state: "STALE",
    changes: [{ path: "package.json", before: "old-before-preview", after: "old-after-preview" }]
  } }, presentation: { evidence: [], engineeringPlan: {
    planId: "new-plan", planVersion: 2, digest: "b".repeat(64), sourceRunId: "read-run", understandingSequence: 1,
    workspace: { workspaceId: "workspace", bindingVersion: 44 }, evidenceReferences: []
  }, planning: { understanding: { objective: "Review next version", constraints: [] }, plan: {
    readiness: "PLAN_NOT_READY", validation: { valid: false }, steps: [], successCriteria: []
  } } } }
  const render = (value: any) => renderToStaticMarkup(React.createElement(AgentRunCard, { run, detail: value, onSelect: () => {} }))
  const html = render(detail)
  assert.match(html, /Plan · Needs information/)
  assert.doesNotMatch(html, /old-before-preview|old-after-preview|Exact proposal ·|>Approve<|>Proceed</)
  assert.equal(render(structuredClone(detail)), html)
  detail.workflow.proposal.planId = "new-plan"
  assert.match(render(detail), /old-before-preview/)
})
