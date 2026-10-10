import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ConversationActivity, isRoutineHistory } from "../components/chat/conversation-activity"

test("completed inspection discloses progress history while retaining the final answer and evidence-limited replies", () => {
  const base = { conversationId: "c", senderId: "agent", senderType: "assistant", createdAt: "" } as const
  const messages = [
    { ...base, id: "inspection_reply_progress", content: "Prior progress", metadata: { agentRunId: "r", modelConversation: true, outcome: "IN_PROGRESS" } },
    { ...base, id: "inspection_reply_limited", content: "Unresolved findings", metadata: { agentRunId: "r", modelConversation: true, outcome: "IN_PROGRESS", answerPresentation: "EVIDENCE_LIMITED" } },
    { ...base, id: "inspection_report_final", content: "Final findings", metadata: { agentRunId: "r", inspectionReport: true, outcome: "COMPLETED" } },
  ]
  const html = renderToStaticMarkup(<ConversationActivity messages={messages} routine={() => false} renderMessage={m => <p>{m.content}</p>} />)
  const closed = html.match(/<details[^>]*>[\s\S]*?<\/details>/)![0]
  assert.match(closed, /Prior progress/)
  assert.doesNotMatch(closed, /Final findings|Unresolved findings/)
  assert.match(html.replace(closed, ""), /Final findings/)
  assert.match(html.replace(closed, ""), /Unresolved findings/)
  const active = renderToStaticMarkup(<ConversationActivity messages={messages.slice(0, 1)} routine={() => false} renderMessage={m => <p>{m.content}</p>} />)
  assert.doesNotMatch(active, /<details/)
})
const msg = (id: string): any => ({ id, metadata: { runtimeAction: true, agentRunId: id }, content: id })
const run = (id: string, extra = {}): any => ({ id, status: "COMPLETED", title: "Workspace list · private-id · v45", pendingApprovals: [], ...extra })
test("consecutive history groups preserve chronology and human boundaries", () => {
  const messages = [msg("a"), msg("b"), { ...msg("human"), metadata: {} }, msg("c")]
  const html = renderToStaticMarkup(<ConversationActivity messages={messages} routine={m => m.metadata.runtimeAction === true} renderMessage={m => <p>{m.content}</p>} />)
  assert.match(html, /2 records/); assert.equal((html.match(/Historical workspace activity/g) || []).length, 2)
  assert.ok(html.indexOf(">a<") < html.indexOf(">b<")); assert.ok(html.indexOf(">b<") < html.indexOf(">human<")); assert.ok(html.indexOf(">human<") < html.indexOf(">c<"))
  assert.doesNotMatch(html, /<details[^>]* open|verified|succeeded/i)
})
test("failed, active, approval and execution records never qualify as routine history", () => {
  for (const extra of [{ status: "FAILED" }, { status: "RUNNING" }, { status: "AWAITING_APPROVAL" }, { pendingApprovals: [{}] }, { execution: {} }, { workflow: {} }, { outcome: "BLOCKED" }]) assert.equal(isRoutineHistory(msg("a"), [run("a", extra)], {}), false)
  assert.equal(isRoutineHistory(msg("a"), [run("a")], {}), true)
  assert.equal(isRoutineHistory(msg("a"), [run("a")], { a: { id: "a", pendingApprovals: [{}] } as any }), false)
  assert.equal(isRoutineHistory(msg("a"), [], {}), false)
  assert.equal(isRoutineHistory(msg("a"), [run("a", { runtimeActionReceipt: { state: "SUCCEEDED", verificationState: "FAILED" } })], {}), false)
  assert.equal(isRoutineHistory(msg("a"), [run("a")], { a: { id: "a", failureReason: "verification failed" } as any }), false)
})
test("attention remains visible outside grouped details and technical content is retained", () => {
  const messages = [msg("a"), msg("failure"), msg("approval")]
  const html = renderToStaticMarkup(<ConversationActivity messages={messages} routine={m => m.id === "a"} renderMessage={m => <p>{m.id === "a" ? "receipt-private" : m.id}</p>} />)
  assert.match(html, /receipt-private/)
  const visible = html.replace(/<details[\s\S]*?<\/details>/g, "")
  assert.match(visible, /failure/); assert.match(visible, /approval/); assert.doesNotMatch(visible, /receipt-private/)
})
