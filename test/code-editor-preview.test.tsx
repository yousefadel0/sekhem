import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CodeEditor } from "../components/workspace/code-editor"

test("editor preview preserves source before hydration without executing HTML or saving", () => {
  let saves = 0, changes = 0
  const source = '<script>alert("source")</script>\nشرح عربي & code'
  const markup = renderToStaticMarkup(createElement(CodeEditor, {
    path: "index.html", original: source, value: source, readOnly: true, sideBySide: false,
    onSave: () => { saves++ }, onChange: () => { changes++ }, onCursor: () => {},
  }))
  assert.match(markup, /Source preview index.html/)
  assert.match(markup, /&lt;script&gt;/)
  assert.match(markup, /شرح عربي &amp; code/)
  assert.doesNotMatch(markup, /<script>/)
  assert.match(markup, /data-editable="false"/)
  assert.equal(saves, 0)
  assert.equal(changes, 0)
})
