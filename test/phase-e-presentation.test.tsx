import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { clearSubmittedDraft, freshConversationDraft } from "../lib/conversation-drafts"
import { runActivity, type AgentRunDetail } from "../lib/sekhem-agent"
import { WorkflowPauseControls } from "../components/chat/workflow-pause-controls"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { AgentRunPanel } from "../components/workspace/agent-workspace"
import { ChatMessageItem } from "../components/chat/chat-message-item"
import type { ConversationMessageDto } from "../lib/sekhem-conversation"

const action = (): AgentRunDetail => ({ id: "rtrun_action", status: "COMPLETED", outcome: "COMPLETED", title: "Read target",
  agentName: "SEKHEM", progressPercent: 100, startedAt: null, completedAt: null, createdAt: "2026-10-05T09:00:00Z",
  conversationId: "b", projectId: "p", failureReason: null, pendingApprovals: [], runtimeActionReceipt: {
    id: "receipt", state: "SUCCEEDED", verificationState: "VERIFIED", target: "C:\\Authorized\\package.json" } })

test("paused inspection does not advertise its read-step seed as an engineering plan", () => {
  const run = { ...action(), id: "inspection", status: "PAUSED", inspection: { state: "AWAITING_INPUT", operations: [],
    iterations: 1, maxIterations: 2, executionVerified: 1, workspace: { name: "Fixture" }, understanding: { status: "INTERMEDIATE" } },
    presentation: { evidence: [], warnings: [], planning: { understanding: { objective: "Inspect", readiness: "UNDERSTANDING_READY" }, plan: { readiness: "PLAN_READY" } } } } as unknown as AgentRunDetail
  const html = renderToStaticMarkup(<AgentRunPanel run={run} events={[]} streamStatus="CLOSED" loading={false} onOpen={() => {}} onTab={() => {}} onPrompt={() => {}} />)
  assert.match(html, /Inspection checkpoint: INTERMEDIATE/)
  assert.match(html, /Inspection only · No engineering plan/)
  assert.doesNotMatch(html, /Understanding: UNDERSTANDING_READY · Plan: PLAN_READY/)
})
test("verified authoritative runtime receipt restores truthful summary", () => {
  const detail = JSON.parse(JSON.stringify(action())) as AgentRunDetail
  const summary = { ...detail, runtimeActionReceipt: undefined }
  const html = renderToStaticMarkup(<AgentRunCard run={summary} detail={detail} onSelect={() => {}} />)
  assert.match(html, /Action verified/); assert.doesNotMatch(html, /Verification unavailable/)
  assert.match(runActivity(detail), /verified/)
  detail.runtimeActionReceipt!.verificationState = "PENDING"
  assert.doesNotMatch(runActivity(detail), /Action verified/)
})
test("standalone bound action presents its persisted target rather than missing binding", () => {
  const html = renderToStaticMarkup(<AgentRunPanel run={action()} events={[]} streamStatus="CLOSED" loading={false}
    onOpen={() => {}} onTab={() => {}} onPrompt={() => {}} />)
  assert.match(html, /Authorized.*package.json/); assert.doesNotMatch(html, /Workspace binding unavailable/)
})
test("paused persisted state never labels the workflow as running", () => {
  const r = { ...action(), id: "inspection", status: "PAUSED", inspection: { state: "APPROVED" },
    workflowPause: { state: "PAUSED", resumeStatus: "RUNNING", revision: 2 } } as unknown as AgentRunDetail
  const restored = JSON.parse(JSON.stringify(r)) as AgentRunDetail
  const html = renderToStaticMarkup(<WorkflowPauseControls run={restored} />)
  assert.match(html, />Resume</); assert.doesNotMatch(html, /Paused · running|Workflow active|Pause \/ Stop/)
  assert.equal(runActivity(restored), "Paused")
})
test("submitted new-chat draft cannot leak into the next conversation", () => {
  const drafts = { b: "submitted B", a: "unsent A", new: "submitted B" }
  const cleared = clearSubmittedDraft(drafts, "b", "new", "new")
  const next = freshConversationDraft(cleared, "b", "", "new")
  assert.equal(next.new, ""); assert.equal(next.b, ""); assert.equal(next.a, "unsent A")
  assert.equal(drafts.b, "submitted B")
})
test("fresh conversation clears scratch text while preserving another conversation draft", () => {
  const next = freshConversationDraft({ b: "", new: "stale" }, "b", "unsent B", "new")
  assert.equal(next.new, ""); assert.equal(next.b, "unsent B")
})
test("an existing conversation submission does not clear another composer's draft", () => {
  const next = clearSubmittedDraft({ b: "submitted", new: "unsent new conversation" }, "b", "new", "b")
  assert.equal(next.new, "unsent new conversation"); assert.equal(next.b, "")
})
test("durable dispatch failure remains visible after JSON restoration without a run", () => {
  const message = JSON.parse(JSON.stringify({ id: "failure", conversationId: "c", senderId: "agent", senderType: "assistant",
    content: "Request failed: INSPECTION_TARGET_AMBIGUOUS. Check the saved workflow state before continuing.",
    metadata: { submissionFailure: true, code: "INSPECTION_TARGET_AMBIGUOUS" }, createdAt: "2026-10-05T09:00:00Z" })) as ConversationMessageDto
  const html = renderToStaticMarkup(<ChatMessageItem message={message} />)
  assert.match(html, /INSPECTION_TARGET_AMBIGUOUS/); assert.match(html, /Request failed/)
  assert.doesNotMatch(html, />Approve<|Execute|Permit issued/)
})
