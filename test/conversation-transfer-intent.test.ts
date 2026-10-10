import { test } from "node:test"
import assert from "node:assert/strict"
import { requestsAgentConversationTransfer } from "../lib/conversation-transfer-intent"

test("only an explicit whole-message Agent handoff activates the existing transfer option", () => {
  for (const text of ["Continue in Agent.", "كمل في وضع Agent", "كمّل في وضع Agent؟"]) assert.equal(requestsAgentConversationTransfer(text), true)
  for (const text of ["Continue", "Do not continue in Agent.", "Explain Continue in Agent", "Continue in Agent and delete files", "موافق", "نفذ"]) assert.equal(requestsAgentConversationTransfer(text), false)
})
