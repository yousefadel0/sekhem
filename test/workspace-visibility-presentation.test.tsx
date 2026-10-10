import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMessageItem } from "../components/chat/chat-message-item"

const content = 'المجلد المختار: project\nC:\\private\\project\nآخر قائمة موثقة من التحقق من المجلد (2026-10-05T09:21:57.075Z): .cursor, node_modules, README.md.\nالرد ده مبني على بيانات الربط المحفوظة؛ السؤال ده ما بدأش قراءة محتوى الملفات أو فحص جديد.\nمتصل؛ كل عملية تخضع لفحص الصلاحيات.'
const message = (text = content, metadata: Record<string, unknown> = { modeNotice: true, executionStarted: false }): any => ({ id: 'reply', conversationId: 'conversation', senderType: 'assistant', content: text, metadata })
const render = (value: any) => renderToStaticMarkup(<ChatMessageItem message={value} />)

test('workspace visibility is concise; path/listing/timestamp/access internals stay in closed Details', () => {
  const saved = message(), before = JSON.stringify(saved), html = render(saved)
  const main = html.slice(0, html.indexOf('<details'))
  assert.match(main, /أيوه، شايف المشروع ومتصل بيه/)
  assert.doesNotMatch(main, /private|node_modules|README|2026-10|بيانات الربط|فحص الصلاحيات/)
  assert.match(html, /<details[^>]*aria-label="Workspace visibility details"[^>]*><summary>Details<\/summary>/)
  assert.doesNotMatch(html, /<details[^>]*open/)
  assert.ok(html.includes(content)); assert.match(html, /unicode-bidi:plaintext/)
  assert.equal(JSON.stringify(saved), before)
  assert.equal(render(JSON.parse(before)), html)
})

test('offline/expired/unknown visibility never claims a healthy connection', () => {
  for (const status of ['الجهاز غير متصل؛ البيانات المعروضة ملاحظة محفوظة.', 'إذن القراءة انتهى؛ البيانات المعروضة ملاحظة محفوظة.', 'حالة الوصول غير متاحة.']) {
    const html = render(message(content.replace('متصل؛ كل عملية تخضع لفحص الصلاحيات.', status)))
    const main = html.slice(0, html.indexOf('<details'))
    assert.match(main, /مش مؤكد حاليًا/); assert.doesNotMatch(main, /متصل بيه/)
    assert.ok(html.includes(status))
  }
})

test('English saved visibility receives the same presentation without losing original details', () => {
  const html = render(message('Selected folder: project\nC:\\private\\project\nThis uses saved workspace metadata.\nConnected; each operation still requires current authorization.'))
  assert.match(html.slice(0, html.indexOf('<details')), /Yes, the project is connected/)
  assert.match(html, /C:\\private\\project/)
})

test('natural greetings and ordinary prose are unchanged; content alone is not a notice marker', () => {
  const greeting = render(message('أهلاً! إزيك؟', {}))
  assert.match(greeting, /أهلاً! إزيك؟/); assert.doesNotMatch(greeting, /<details|شايف المشروع/)
  assert.doesNotMatch(render(message(content, {})), /Workspace visibility details/)
  const user = render({ ...message(), senderType: 'user', content: 'شايف المشروع؟' })
  assert.match(user, /شايف المشروع؟/); assert.doesNotMatch(user, /متصل بيه/)
})
