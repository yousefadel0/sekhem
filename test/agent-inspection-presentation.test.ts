import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentControlCard } from "../components/workspace/agent-control-card"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { runActivity, type AgentRunDetail } from "../lib/sekhem-agent"
import { runTimeline } from "../lib/workspace-presentation"
import { isTerminalEvent, subscribeToAgentRunEvents, SSE_EVENT_TYPES } from "../hooks/useAgentRunEvents"
import { reconcileConversationSnapshot, conversationRunDetails } from "../lib/conversation-restoration"

function run(state = "AWAITING_APPROVAL"): AgentRunDetail {
  const op: any = { planVersion: 2, request: { operationId: "op-1", requestId: "request-1", runtimeId: "runtime-test" }, action: { tool: "filesystem.read", relativePath: "src/auth/session.ts", purpose: "Understand session handling" },
    proposalId: "proposal-1", approvalId: "approval-1", fingerprint: "a".repeat(64), state }
  return { id: "agent-1", projectId: "project-1", conversationId: "conv-1", title: "Understand authentication", agentName: "SEKHEM", status: "AWAITING_APPROVAL", progressPercent: 0,
    startedAt: null, completedAt: null, createdAt: "2026-09-23T00:00:00Z", updatedAt: "2026-09-23T00:00:00Z", failureReason: null, pendingApprovals: [],
    inspection: { state: state as any, code: state, iterations: 1, maxIterations: 4, workspace: { workspaceId: "workspace-1", bindingVersion: 3, name: "Example project", runtimeId: "runtime-test" },
      current: op, operations: [op], evidence: [], planning: null, executionVerified: 0, objectiveGrounded: false } }
}
const render = (r: AgentRunDetail) => renderToStaticMarkup(React.createElement(AgentControlCard, { run: r }))

test("live reasoning lifecycle is subscribed and never mistaken for terminal completion", () => {
  for (const eventType of ["INSPECTION_REASONING_ATTEMPT", "INSPECTION_REASONING_SETTLED"]) {
    assert.ok(SSE_EVENT_TYPES.includes(eventType));
    assert.equal(isTerminalEvent({ eventType, payload: { terminalReason: "RESPONSE_RECEIVED" } } as any), false);
  }
});
test("approval card identifies the exact read, target, purpose, workspace, runtime and risk", () => {
  const html = render(run());
  for (const text of ["Read files", "filesystem.read", "src/auth/session.ts", "Understand session handling", "Example project", "runtime-test", "workspace-1", "Read-only workspace inspection", ">Allow once<", ">Skip<"]) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /Local Runtime is unavailable|No action has executed|Inspect evidence/)
})
test("same-conversation Chat card exposes runtime inspection without claiming planning-only execution", () => {
  const r = run(); r.pendingApprovals = [{ id: "approval-1", approvalType: "TOOL", status: "PENDING", requiredRole: "Technical Reviewer", dueAt: null }]
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.match(html, /Workspace inspection/); assert.match(html, /Execution requires approval and revalidation/)
  assert.doesNotMatch(html, /Planning only|Execution remains unavailable/)
  assert.match(html, /Results appear in this conversation/)
  assert.match(html, /View details/)
  assert.doesNotMatch(html, /Open Agent workspace|Agent run|runtime-test|workspace-1|proposal-1/)
})

test("a failed inspection card cannot display an old plan-ready headline alongside the failure", () => {
  const r = run("FAILED"); r.status = "FAILED"; r.inspection!.code = "OUTPUT_TRUNCATED"
  r.presentation = { evidence: [], planning: { understanding: { objective: "Inspect authentication" }, plan: { readiness: "PLAN_READY" } } } as any
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.match(html, /Output truncated/)
  assert.doesNotMatch(html, /PLAN_READY|Completed/)
})
test("a failed analysis with verified observations does not claim the project read never started", () => {
  const r = run("FAILED"); r.status = "FAILED"; r.inspection!.code = "INSPECTION_REASONING_TIMEOUT"
  r.inspection!.current = null; r.inspection!.operations = []; r.inspection!.evidence = [{ id: "receipt-1" } as any]
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.match(html, /Verified observations are saved, but the analysis could not be completed/)
  assert.doesNotMatch(html, /Project analysis could not start/)
  assert.match(html, /Observations retained/)
  assert.doesNotMatch(html, /No verified read completed/)
})

test("running inspection exposes pause control before collapsed details and explains actual progress", () => {
  const r = run("UNDERSTANDING"); r.status = "PLANNING"; r.inspection!.current = null
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.ok(html.indexOf("Pause / Stop") < html.indexOf("data-chat-details"))
  assert.match(html, /Choosing the next source/)
  assert.doesNotMatch(html, /Checking findings against saved evidence/)
})

test("waiting-for-input card offers an actionable explanation without a disabled resume button", () => {
  const r = run("AWAITING_INPUT"); r.status = "PAUSED"; r.inspection!.current = null
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.match(html, /Review the last response and diagnostics/)
  assert.doesNotMatch(html, />Resume</)
})
test("each live inspection state is displayed from persisted state", () => {
  for (const [state, label] of Object.entries({ UNDERSTANDING: "Understanding", INSPECTION_PLANNED: "Inspecting", AWAITING_APPROVAL: "Waiting for approval", EXECUTING: "Reading workspace", VERIFYING: "Verifying evidence", NEEDS_MORE_EVIDENCE: "Needs more evidence" })) {
    const r = run(state); assert.equal(runActivity(r), label); assert.match(render(r), new RegExp(label))
    if (state !== "AWAITING_APPROVAL") assert.doesNotMatch(render(r), />Allow once<|>Reject</)
  }
})
test("verified observation exposes receipt and evidence viewing without completing objective", () => {
  const r = run("NEEDS_MORE_EVIDENCE"); const op = r.inspection!.operations[0]; op.receiptId = "receipt-1"; op.verification = "VERIFIED"; op.state = "VERIFIED"; r.inspection!.current = null; r.inspection!.executionVerified = 1
  const html = render(r); assert.match(html, /receipt-1/); assert.match(html, /Inspect evidence/); assert.match(html, /Engineering objective not yet completed/)
  assert.equal(runTimeline(r).at(-1)!.state, "pending")
})

test("same-Chat clarification stays open and approval offers reject, skip and a comment", () => {
  const waiting = run("AWAITING_INPUT"); waiting.status = "PAUSED"; waiting.inspection!.current = null
  assert.equal(runActivity(waiting), "Waiting for your instruction")
  assert.match(render(waiting), /Continue in Chat/)
  assert.doesNotMatch(render(waiting), /INVALID_MODEL_PROPOSAL|>Allow once<|>Skip</)
  const pending = render(run("AWAITING_APPROVAL"))
  assert.match(pending, />Allow once</); assert.match(pending, />Skip</)
  assert.match(pending, /Inspection approval comment/)
})
test("failure/truncation/cancellation remain explicit without approving an old proposal", () => {
  const r = run("FAILED"); r.status = "FAILED"; r.inspection!.code = "OUTPUT_TRUNCATED"
  assert.equal(runActivity(r), "Output truncated · Plan not ready"); assert.doesNotMatch(render(r), />Allow once</)
  r.inspection!.code = "RUNTIME_OFFLINE"; assert.match(render(r), /runtime offline/)
  r.status = "CANCELLED"; r.inspection!.state = "CANCELLED"; assert.equal(runActivity(r), "Cancelled"); assert.doesNotMatch(render(r), /Cancel inspection|>Allow once</)
})
test("completion distinguishes grounded report from runtime verification", () => {
  const r = run("COMPLETED"); r.status = "COMPLETED"; r.inspection!.objectiveGrounded = true; r.inspection!.executionVerified = 2
  assert.match(render(r), /Grounded report saved in this conversation/); assert.match(render(r), /does not verify the entire engineering objective/)
  assert.equal(runTimeline(r).at(-1)!.state, "settled")
})
test("conversation reload retains loop and ignores older snapshots", () => {
  const r = run(), newer = run("EXECUTING"); newer.updatedAt = "2026-09-23T00:00:02Z"
  const snapshot: any = { id: "conv-1", projectId: "project-1", messages: [], agentRuns: [newer] }
  const restored = reconcileConversationSnapshot(snapshot, { ...snapshot, agentRuns: [r] })
  assert.equal(conversationRunDetails(restored)[r.id].inspection!.state, "EXECUTING")
})
test("inspection SSE refreshes terminal state but closes only after durable replay drains", () => {
  const sourceRef: { current?: Events } = {}; const received: any[] = []
  class Events { listeners = new Map(); closed = false; constructor() { sourceRef.current = this } addEventListener(t: string, fn: any) { this.listeners.set(t, fn) } removeEventListener(t: string) { this.listeners.delete(t) } close() { this.closed = true } }
  const stop = subscribeToAgentRunEvents({ runId: "agent-1", onEvent: e => received.push(e), onError: () => assert.fail(), onLoadingChange: () => {}, EventSourceClass: Events })
  const emit = (state: string) => sourceRef.current!.listeners.get("INSPECTION_STATE_CHANGED")({ data: JSON.stringify({ id: state, eventType: "INSPECTION_STATE_CHANGED", payload: { state } }) })
  emit("NEEDS_MORE_EVIDENCE"); assert.equal(sourceRef.current!.closed, false)
  emit("FAILED"); assert.equal(sourceRef.current!.closed, false); assert.equal(received.length, 2)
  sourceRef.current!.listeners.get("INSPECTION_STATE_CHANGED")({ data: JSON.stringify({ id: "final-diagnostic", seq: 3, eventType: "INSPECTION_STATE_CHANGED", payload: { state: "FAILED", code: "GROUNDING_INCOMPLETE" } }) })
  assert.equal(received.length, 3); assert.equal(received[2].id, "final-diagnostic"); assert.equal(sourceRef.current!.closed, false)
  sourceRef.current!.listeners.get("stream-drained")({ data: "{}" })
  assert.equal(sourceRef.current!.closed, true); stop()
})

test("Chat shows exact observed read progress and never counts a listing as a source read", () => {
  const r = run("NEEDS_MORE_EVIDENCE"), read = r.inspection!.operations[0]
  read.verification = "VERIFIED"; read.state = "TRUNCATED"; r.inspection!.current = null
  r.inspection!.operations.push({ ...read, request: { ...read.request, operationId: "listing" }, action: { tool: "filesystem.list", relativePath: "", purpose: "Discover" }, state: "VERIFIED" })
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.match(html, /1 Runtime source reads verified/); assert.match(html, /src\/auth\/session.ts/)
  assert.match(html, /Verified · truncated observation/); assert.match(html, /Workspace root/)
  assert.doesNotMatch(html, /Analysis complete|2 Runtime source reads/)
})

test("partial understanding is terminal, needs attention, and is never displayed as completed or approved", () => {
  const r = run("PARTIAL"); r.status = "FAILED"; r.inspection!.current = null
  r.inspection!.understanding = { version: 1, sequence: 1, status: "PARTIAL", evidence: [], observedAt: "2026-09-24T00:00:00Z", understanding: {} as any }
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: r, detail: r, onSelect: () => {} }))
  assert.equal(runActivity(r), "Understanding incomplete")
  assert.match(html, /remaining gaps/); assert.doesNotMatch(html, /Completed|Plan ready/)
  assert.doesNotMatch(render(r), /Cancel inspection|>Allow once<|>Reject</)
  assert.equal(runTimeline(r).at(-1)!.state, "attention")
  assert.equal(isTerminalEvent({ eventType: "INSPECTION_STATE_CHANGED", payload: { state: "PARTIAL" } } as any), true)
  assert.equal(isTerminalEvent({ eventType: "UNDERSTANDING_CHECKPOINT", payload: { status: "INTERMEDIATE" } } as any), false)
})
