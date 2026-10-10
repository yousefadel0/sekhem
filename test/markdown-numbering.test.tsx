import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MarkdownRenderer } from "../components/chat/markdown-renderer"

test("numbered paragraphs retain their explicit start instead of restarting at one", () => {
  const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content: "1. أول نقطة\n\n2. ثاني نقطة" }))
  assert.match(html, /start="2"/)
  assert.match(html, />2\./)
  assert.match(html, /ثاني نقطة/)
})
