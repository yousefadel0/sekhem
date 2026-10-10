import { test } from "node:test"
import assert from "node:assert/strict"
import { inspectionReportSummary } from "../lib/inspection-report-presentation"
import type { ConversationMessageDto } from "../lib/sekhem-conversation"

const message = { id: "report", conversationId: "conversation", senderId: "agent", createdAt: "", senderType: "assistant", content: "Project understanding — inspected scope\nInspected scope:\nREADME.md\nObserved (exact source excerpts):\nprivate-receipt\nInferred (not certified facts):\n- Summary [fact-1]. Uncertainty: source claim only.\nUnknown / missing information:\n- Server not inspected.\nOnly recorded observations are covered.", metadata: { agentRunId: "run", inspectionReport: true, understandingReport: true, outcome: "COMPLETED" } } as ConversationMessageDto
test("report projection preserves inference uncertainty and unknown scope; full content is unchanged", () => {
  const before = JSON.stringify(message), summary = inspectionReportSummary(message)!
  assert.match(summary, /Summary/)
  assert.doesNotMatch(summary, /\[fact-1\]/)
  assert.match(summary, /Limits: source claim only/)
  assert.match(summary, /Server not inspected/)
  assert.doesNotMatch(summary, /private-receipt/)
  assert.equal(JSON.stringify(message), before)
})
test("Arabic summary uses readable labels and numbered points without losing limitations", () => {
  const content = message.content.replace("- Summary [fact-1]. Uncertainty: source claim only.", "(1) الهدف الأول (2) الهدف الثاني [fact-one, fact-two]. Uncertainty: من نص الملف فقط (truncated=false).")
  const original = { ...message, content }
  const summary = inspectionReportSummary(original)!
  assert.match(summary, /الملخص والاستنتاجات/)
  assert.match(summary, /1\. الهدف الأول\n\n2\. الهدف الثاني/)
  assert.match(summary, /حدود الاستنتاج: من نص الملف فقط/)
  assert.match(summary, /Server not inspected/)
  assert.doesNotMatch(summary, /fact-one|truncated=false|Uncertainty:/)
  assert.equal(original.content, content)
})
test("unrecognized, failed, incomplete and unmarked reports are never summarized", () => {
  for (const changed of [{ metadata: {} }, { senderType: "user" }, { content: "ordinary prose" },
    { metadata: { ...message.metadata, outcome: "FAILED" } }, { content: message.content.replace("Inferred (not certified facts):", "Other") }])
    assert.equal(inspectionReportSummary({ ...message, ...changed } as ConversationMessageDto), null)
})
