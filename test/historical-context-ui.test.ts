import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HistoricalContextControl } from "../components/workspace/project-chat"
import { selectHistoricalContext } from "../lib/sekhem-conversation"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"

test("explicit source selector describes context isolation and never presents execution controls", () => {
  const html = renderToStaticMarkup(createElement(HistoricalContextControl, { sources: [], onSelect: async () => assert.fail("Rendering must not dispatch") }))
  assert.match(html, /Choose one conversation/); assert.match(html, /Evidence and approvals are not transferred/)
  assert.doesNotMatch(html, /Approve this action|Execution Permit|execute|filesystem.write/)
})
test("reload restores historical provenance and unavailable presentation without redispatch", () => {
  const current: any = { id: "current", projectId: "project", messages: [], agentRuns: [], metadata: { historicalContext: { sourceConversationId: "source", messages: [{ id: "message", digest: "digest" }] }, historicalContextView: { state: "UNAVAILABLE", sourceConversationId: "source", messageCount: 0 } } }
  const restored = reconcileConversationSnapshot(undefined, JSON.parse(JSON.stringify(current)))
  assert.deepEqual(restored.metadata.historicalContext, current.metadata.historicalContext)
  const html = renderToStaticMarkup(createElement(HistoricalContextControl, { sources: [], view: restored.metadata.historicalContextView as any, disabled: true, onSelect: async () => assert.fail("No replay") }))
  assert.match(html, /Historical context unavailable/); assert.match(html, /disabled/)
  assert.doesNotMatch(html, /digest|sourceConversationId/)
  const other: any = { ...current, id: "other", metadata: {} }
  assert.deepEqual(reconcileConversationSnapshot(restored, other).metadata, {})
})
test("explicit context client submits only source identity to the originating conversation", async () => {
  const original = globalThis.fetch, calls: any[] = []
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "localhost" } } })
  globalThis.fetch = (async (url: any, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, data: { state: "READY", sourceConversationId: "source", messageCount: 1 } }), { status: 200, headers: { "content-type": "application/json" } }) }) as any
  try {
    await selectHistoricalContext("current", "source")
    assert.match(String(calls[0].url), /conversations\/current\/historical-context$/)
    assert.deepEqual(calls[0].body, { sourceConversationId: "source" }); assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = original
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
    else Reflect.deleteProperty(globalThis, "window")
  }
})
