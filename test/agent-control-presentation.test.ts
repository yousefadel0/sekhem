import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentControlCard } from "../components/workspace/agent-control-card"
import { controlLabel, runActivity, type AgentRunDetail } from "../lib/sekhem-agent"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"
import { subscribeToAgentRunEvents } from "../hooks/useAgentRunEvents"

function run(state = "ACTION_PROPOSED"): AgentRunDetail {
  return { id: "run-1", title: "Read source", agentName: "SEKHEM", status: "COMPLETED", outcome: "PLAN_READY", conversationId: "conv-1", projectId: "project-1",
    progressPercent: 100, startedAt: null, completedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:01Z", failureReason: null, pendingApprovals: [],
    control: { version: 1, revision: 3, runId: "run-1", state, code: "AUTHENTICATED_REVALIDATION_REQUIRED", executionPerformed: false,
      proposal: { proposalId: "proposal-1", proposalDigest: "a".repeat(64), planId: "plan-1", planVersion: 1, planStepId: "step-1", toolId: "filesystem.read", toolVersion: "1.0.0", purpose: "Inspect source", effect: "READ_ONLY", risk: "LOW",
        scope: { workspaceId: "workspace-1", paths: ["package.json"] }, workspaceBindingVersion: "version-1", validatedInput: { path: "package.json" }, preview: { available: true, description: "Read bounded source from package.json." } } } }
}
const render = (value: AgentRunDetail) => renderToStaticMarkup(React.createElement(AgentControlCard, { run: value }))
describe("Phase 0A truthful approval and intent presentation", () => {
  it("shows a proposed operation with its exact tool, target, effect, plan and review choice", () => {
    const html = render(run()); for (const text of ["filesystem.read", "package.json", "READ_ONLY", "LOW", "plan-1", "step-1", "Check current access", "Request human review", "No action has executed"]) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /Execution successful|Executing|Runtime connected/)
  })
  it("shows Approve/Reject only for a persisted exact pending fingerprint", () => {
    const r = run("AWAITING_APPROVAL"); r.status = "AWAITING_APPROVAL"; assert.doesNotMatch(render(r), />Allow once</)
    r.control!.approvalId = "approval-1"; assert.doesNotMatch(render(r), />Allow once</)
    r.control!.approvalFingerprint = "b".repeat(64)
    assert.match(render(r), />Allow once</); assert.match(render(r), />Reject</); assert.match(render(r), />Cancel</)
    assert.doesNotMatch(render(r), />Skip</)
    r.status = "CANCELLED"; assert.doesNotMatch(render(r), />Allow once</)
  })
  it("never invents a diff or command when detailed preview is unavailable", () => {
    const r = run("NEEDS_USER_INPUT"); r.control!.proposal = undefined; r.control!.code = "DETAILED_EXECUTION_PREVIEW_UNAVAILABLE"
    assert.match(render(r), /Detailed execution preview unavailable/); assert.doesNotMatch(render(r), />Allow once<|Check current access|npm run|diff/)
  })
  it("distinguishes approved, blocked intent, expired, invalidated and cancelled receipts", () => {
    const r = run("APPROVED"); assert.equal(controlLabel(r.control!), "Approved · Revalidation required")
    r.status = "PAUSED"; r.control!.state = "EXECUTION_BLOCKED"; r.control!.code = "EXECUTION_BOUNDARY_NOT_IMPLEMENTED"
    r.control!.intent = { intentId: "intent-1", status: "BOUNDARY_BLOCKED", expiresAt: "2099-01-01T00:00:00Z", runtimeId: null, dispatchable: false, executionAllowed: false }
    assert.match(render(r), /Execution blocked.*Local Runtime unavailable/); assert.doesNotMatch(render(r), />Allow once<|Check current access/)
    for (const status of ["EXPIRED", "INVALIDATED", "CANCELLED"]) { r.control!.intent.status = status; assert.ok(controlLabel(r.control!).toLowerCase().includes(status.toLowerCase())) }
  })
  it("elapsed expiry is displayed without inventing a new backend status or intent", () => {
    const r = run(); r.control!.intent = { intentId: "intent-1", status: "BOUNDARY_BLOCKED", expiresAt: "2020-01-01T00:00:00Z", runtimeId: null, dispatchable: false, executionAllowed: false }
    assert.equal(controlLabel(r.control!), "Execution intent expired"); assert.equal(r.control!.intent.status, "BOUNDARY_BLOCKED")
  })
  it("failure and cancellation still outrank an old proposal", () => {
    const r = run(); r.status = "FAILED"; assert.equal(runActivity(r), "Failed"); assert.doesNotMatch(render(r), /Check current access/)
    r.status = "CANCELLED"; assert.equal(runActivity(r), "Cancelled")
  })
  it("restores a newer persisted control transition after planning completion, rejects stale transitions", () => {
    const old = run(), incoming = structuredClone(old); incoming.status = "AWAITING_APPROVAL"; incoming.updatedAt = "2026-01-01T00:00:02Z"; incoming.control!.revision++
    const snapshot: any = { id: "conv-1", projectId: "project-1", messages: [], agentRuns: [old] }
    assert.equal(reconcileConversationSnapshot(snapshot, { ...snapshot, agentRuns: [incoming] }).agentRuns[0].status, "AWAITING_APPROVAL")
    incoming.control!.revision = old.control!.revision; assert.equal(reconcileConversationSnapshot(snapshot, { ...snapshot, agentRuns: [incoming] }).agentRuns[0].status, "COMPLETED")
  })
  it("new SSE events only notify consumers and do not infer terminal execution", () => {
    const sourceRef: { current?: Events } = {}; const received: any[] = []
    class Events { listeners = new Map(); closed = false; constructor() { sourceRef.current = this } addEventListener(t: string, fn: any) { this.listeners.set(t, fn) } removeEventListener(t: string) { this.listeners.delete(t) } close() { this.closed = true } }
    const stop = subscribeToAgentRunEvents({ runId: "run-1", onEvent: e => received.push(e), onError: () => assert.fail(), onLoadingChange: () => {}, EventSourceClass: Events })
    for (const type of ["ACTION_PROPOSED", "REVALIDATION_FAILED", "EXECUTION_INTENT_CREATED", "EXECUTION_BLOCKED"]) {
      assert.ok(sourceRef.current!.listeners.has(type)); sourceRef.current!.listeners.get(type)({ data: JSON.stringify({ id: type, agentRunId: "run-1", eventType: type, payload: { executionPerformed: false } }) })
    }
    assert.equal(received.length, 4); assert.equal(sourceRef.current!.closed, false); stop()
  })
})
