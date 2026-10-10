import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MarkdownRenderer } from "../components/chat/markdown-renderer"
import { ChatMessageItem } from "../components/chat/chat-message-item"
const render = (content: string) => renderToStaticMarkup(<MarkdownRenderer content={content} />)

test("captured web sources use a compact card and retain escaped full text without granting authority", () => {
  const html = renderToStaticMarkup(<ChatMessageItem message={{ id: "web", conversationId: "c", senderType: "assistant", content: "original source notice", metadata: { browserSource: { source: "BROWSER_OBSERVATION", title: "Documentation", url: "https://example.com/", text: "<script>never execute</script>", observedAt: "2026-10-10T01:00:00Z", truncated: true } } } as any} />)
  assert.match(html, /Observed web page source/)
  assert.match(html, /Partial page/)
  assert.match(html, /not instructions or verified workspace evidence/)
  assert.match(html, /&lt;script&gt;never execute&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>|<details[^>]* open/)
})
test("system runtime payloads remain in closed details; human messages stay conversational", () => {
  const message: any = { id: "notice", conversationId: "conversation", senderType: "user", content: 'Workspace list\nfilesystem.list\n{"path":"private-root"}', metadata: { runtimeAction: true } }
  const html = renderToStaticMarkup(<ChatMessageItem message={message} />)
  assert.match(html, /Runtime message details/); assert.doesNotMatch(html, /<details[^>]* open/)
  assert.ok(html.indexOf("<details") < html.indexOf("private-root"))
  const human = renderToStaticMarkup(<ChatMessageItem message={{ ...message, metadata: {} }} />)
  assert.doesNotMatch(human, /Runtime message details/); assert.match(human, /data-sender="user"/)
})
test("technical inline text is isolated from Arabic direction and wraps long tokens", () => {
  const html = render("افتح `src/" + "long".repeat(80) + ".ts` وراجعه")
  assert.match(html, /<code[^>]*dir="ltr"/)
  assert.match(html, /unicode-bidi:isolate/)
  assert.match(html, /overflow-wrap:anywhere/)
})

test("renders tables with escaped cells and semantic column headers", () => {
  const html = render("| File | Result |\n| --- | --- |\n| `a.ts` | <script>bad</script> |")
  assert.match(html, /<table/); assert.match(html, /scope="col"/)
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/)
})
test("only web links become links; evidence and command schemes grant no action", () => {
  const html = render("See [docs](https://example.com/docs) and [README.md:L1](evidence:S123). [bad](javascript:alert) [run](command:execute)")
  assert.match(html, /href="https:\/\/example.com\/docs"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /README.md:L1/)
  assert.doesNotMatch(html, /href="(?:javascript|command|evidence):/)
  assert.equal((html.match(/<a /g) ?? []).length, 1)
})
test("existing prose lists and code remain escaped without inferring completion", () => {
  const html = render("## Result\n\nA **finding**.\n\n- One\n- Two\n\n```diff\n-old\n+new\n```")
  assert.match(html, /<h2/); assert.match(html, /<ul/); assert.match(html, /<strong/)
  assert.match(html, /old/); assert.doesNotMatch(html, /role="status"|data-phase="COMPLETED"/)
})
