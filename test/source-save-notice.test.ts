import { test } from "node:test"
import assert from "node:assert/strict"
import { sourceSaveNotice } from "../lib/source-save-notice"

test("Chat save explains the existing Agent requirement without claiming a write", () => {
  const notice = sourceSaveNotice(new Error("AGENT_CONVERSATION_REQUIRED"))
  assert.match(notice, /Workspace work has not been activated/)
  assert.match(notice, /draft is retained; no workspace write occurred/)
  assert.match(notice, /approval controls/)
})
test("other failures retain their diagnostic and unknown errors retain the draft", () => {
  assert.equal(sourceSaveNotice(new Error("PREIMAGE_CHANGED")), "PREIMAGE_CHANGED")
  assert.equal(sourceSaveNotice(null), "Proposal unavailable; draft retained")
})
