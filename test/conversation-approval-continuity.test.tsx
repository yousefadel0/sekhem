import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WorkflowContinuationNotice } from "../components/chat/workflow-continuation-notice"
import { CompactProposalCard } from "../components/chat/agent-run-card"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"
import { resolveConversationIntent } from "../backend/src/conversation/conversation-intent-resolver"

const workflow: any = { observedAt: 1, proposal: { id: "proposal", planId: "plan", version: 1, revision: 1, digest: "a".repeat(64), state: "READY", changes: [{ path: "package.json", before: "0.1.1", after: "0.1.2" }] } }
const run: any = { id: "existing-run", status: "COMPLETED", planVersion: 3, workflow }
const render = (value: any, stale = false) => renderToStaticMarkup(<WorkflowContinuationNotice run={value} stale={stale} />)

test("reload retains the pending proposal and explicit human boundary without submission", () => {
  const snapshot: any = { id: "conversation", projectId: "project", messages: [], agentRuns: [run] }
  const restored = reconcileConversationSnapshot(undefined, JSON.parse(JSON.stringify(snapshot)))
  assert.equal(restored.agentRuns[0].id, "existing-run")
  assert.equal(render(restored.agentRuns[0]), render(run))
  assert.match(render(run), /Human approval required/)
  assert.match(render(run), /do not grant authorization/)
  assert.doesNotMatch(render(run), /<button|<form/)
})

test("pending approval restores its disclosure without performing an action", () => {
  const html = renderToStaticMarkup(<CompactProposalCard proposal={workflow.proposal} approvalPending approvalControls={<button>Approve</button>} />)
  assert.match(html, /<details open="">/)
  assert.match(html, /No approval or execution is submitted/)
  assert.match(html, /package.json/)
})

test("recorded approval is not execution success; uncertain, failed and stale states do not imply success", () => {
  const approved = { ...run, workflow: { ...workflow, approval: { state: "APPROVED", deadline: "2099-01-01" } } }
  assert.match(render(approved), /Approval recorded · Execution not yet confirmed/)
  assert.match(render(approved, true), /Updates unavailable/)
  for (const status of ["FAILED", "BLOCKED", "RUNNING"]) {
    const html = render({ ...approved, execution: { status, phase: "VERIFYING" } })
    assert.doesNotMatch(html, /This change is verified/)
  }
  assert.match(render({ ...approved, execution: { status: "COMPLETED", totalSteps: 2, completedSteps: 2, receipts: [{ runtimeReference: { verificationState: "VERIFIED" } }] } }), /This change is verified/)
})

test("natural continuation uses the existing backend target and never treats text as authorization", () => {
  const context: any = { activeInspections: [], certifiedUnderstanding: null, latestPlan: { runId: "existing-run", planId: "plan", readiness: "PLAN_READY" }, eligiblePlans: [{ runId: "existing-run", planId: "plan", planVersion: 3, digest: "digest", proposalId: "proposal" }], execution: null, pendingApprovals: [{ runId: "existing-run", approvalId: "approval" }], workspace: null }
  for (const text of ["نفّذ", "موافق", "Proceed"]) {
    const result = resolveConversationIntent(text, context)
    assert.equal(result.route, text === "نفّذ" ? "UNDERSTANDING" : "APPROVAL_GUIDANCE", text)
    assert.equal(result.target?.runId, "existing-run", text)
  }
  for (const text of ["نفّذ", "موافق"]) {
    assert.equal(resolveConversationIntent(text, { ...context, truncated: true }).route, "AMBIGUOUS")
    assert.equal(resolveConversationIntent(text, { ...context, eligiblePlans: [] }).route, text === "نفّذ" ? "UNDERSTANDING" : "UNAVAILABLE")
    assert.equal(resolveConversationIntent(text, { ...context, eligiblePlans: [...context.eligiblePlans, { ...context.eligiblePlans[0], runId: "other", planId: "other-plan" }] }).route, "AMBIGUOUS")
  }
  assert.notEqual(resolveConversationIntent("لا تنفّذ", context).route, "APPROVAL_GUIDANCE")
})
