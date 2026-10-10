import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ComposerSubmission } from "../lib/conversation-restoration"
import { ChatMessageItem } from "../components/chat/chat-message-item"
import { runActivity } from "../lib/sekhem-agent"
import { postConversationMessage, getConversation } from "../lib/sekhem-conversation"

test("one composer edit dispatches once even across timeout/replay; a new identical edit is allowed", () => {
  const draft = new ComposerSubmission(); let dispatches = 0
  const submit = () => { if (draft.claim()) dispatches++ }
  submit(); submit(); assert.equal(dispatches, 1)
  // Neither a timeout nor saved completion/reconnect is an edit or submission.
  submit(); assert.equal(dispatches, 1)
  draft.edited(); submit(); assert.equal(dispatches, 2)
})
test("client wiring guards before send; delivery errors refresh saved state without reposting", () => {
  const composer = readFileSync("components/chat/command-composer.tsx", "utf8")
  assert.ok(composer.indexOf("submission.current.claim()") < composer.indexOf("onSend(attsToSend)"))
  assert.match(composer, /submission.current.edited\(\); onChange/)
  const page = readFileSync("app/page.tsx", "utf8")
  const recovery = page.slice(page.indexOf("// Delivery uncertainty"), page.indexOf("// Delivery uncertainty") + 220)
  assert.match(recovery, /runState.refresh\(requestConversationId\)/); assert.doesNotMatch(recovery, /postConversationMessage/)
})
test("deadline and reconnect use saved request identity and never retry POST; a new identical request is distinct", async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window
  const requests: any[] = []
  globalThis.window = { location: { hostname: "localhost" } } as any
  globalThis.fetch = (async (_url: any, init: any) => {
    requests.push(init?.method === "POST" ? JSON.parse(init.body) : { method: "GET" })
    return new Response(JSON.stringify(init?.method === "POST" && requests.length === 1 ? { errors: [{ code: "CLIENT_DEADLINE", message: "Delivery uncertain" }] } : { data: { id: "durable", messages: [], agentRuns: [] }, errors: [] }), { status: requests.length === 1 ? 504 : 200 })
  }) as any
  try {
    await assert.rejects(postConversationMessage("conversation", "same text", { clientMessageId: "request-one" }, { throwOnError: true }))
    assert.equal(requests.length, 1)
    await getConversation("conversation"); await getConversation("conversation")
    assert.equal(requests.filter(r => r.content).length, 1)
    await postConversationMessage("conversation", "same text", { clientMessageId: "request-two" }, { throwOnError: true })
    assert.deepEqual(requests.filter(r => r.content).map(r => r.metadata.clientMessageId), ["request-one", "request-two"])
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow }
})
for (const [id, metadata, content] of [
  ["inspection_reply_fixture", { agentRunId: "run", modelConversation: true, outcome: "IN_PROGRESS" }, "project-internal-id: perform filesystem.list"],
  ["inspection_report_fixture", { agentRunId: "run", inspectionReport: true, outcome: "FAILED", code: "INVALID_MODEL_PROPOSAL" }, "Workspace inspection stopped: INVALID_MODEL_PROPOSAL"],
] as const) test(`inspection technical text remains in Details: ${id}`, () => {
  const html = renderToStaticMarkup(<ChatMessageItem message={{ id, conversationId: "conversation", senderType: "assistant", senderId: "agent", createdAt: "", metadata, content }} />)
  assert.doesNotMatch(html.slice(0, html.indexOf("<details")), /project-internal-id|filesystem.list|INVALID_MODEL_PROPOSAL/)
  assert.ok(html.includes(content)); assert.match(html, /Inspection diagnostics/)
})
test("verified reads are not presented as no action; completed grounded answers remain primary", () => {
  assert.match(runActivity({ inspection: { state: "FAILED", code: "INVALID_MODEL_PROPOSAL", operations: [{ action: { tool: "filesystem.read" }, verification: "VERIFIED" }] } } as any), /Some sources read/)
  const html = renderToStaticMarkup(<ChatMessageItem message={{ id: "inspection_report_good", conversationId: "conversation", senderType: "assistant", senderId: "agent", createdAt: "", metadata: { agentRunId: "run", inspectionReport: true, outcome: "COMPLETED" }, content: "Grounded advice" }} />)
  assert.match(html, /Grounded advice/); assert.doesNotMatch(html, /could not be completed/)
})
test("substantive evidence-limited follow-up remains primary without claiming grounding or completion", () => {
  const content = "المعروف من القراءة السابقة فقط: اسم الحزمة ونسختها. غرض المشروع غير معروف؛ الاستنتاج من الاسم ليس حقيقة مؤكدة."
  const html = renderToStaticMarkup(<ChatMessageItem message={{ id: "inspection_reply_followup", conversationId: "conversation", senderType: "assistant", senderId: "agent", createdAt: "", content,
    metadata: { agentRunId: "run", modelConversation: true, outcome: "IN_PROGRESS", answerPresentation: "EVIDENCE_LIMITED" } }} />)
  assert.ok(html.includes(content)); assert.doesNotMatch(html, /Inspection diagnostics|Reviewing project evidence|Grounded understanding saved/)
  assert.match(runActivity({ status: "PAUSED", inspection: { state: "AWAITING_INPUT" } } as any), /Waiting|clarification/i)
})
