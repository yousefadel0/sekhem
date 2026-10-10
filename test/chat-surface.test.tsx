import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatContextBar, ProjectChat } from "../components/workspace/project-chat"
import { CommandComposer } from "../components/chat/command-composer"

const noop = () => {}
test("composer follows Arabic and English draft direction without changing submission controls", () => {
  for (const value of ["اقرأ المشروع", "Review the project"]) {
    const html = renderToStaticMarkup(<CommandComposer value={value} onChange={noop} onSend={noop} />)
    assert.match(html, /<textarea[^>]*dir="auto"/)
    assert.match(html, /press Enter to send, Shift\+Enter for new line/)
    assert.match(html, /Send message/)
  }
})
const render = (props: Partial<React.ComponentProps<typeof ChatContextBar>> = {}) => renderToStaticMarkup(<ChatContextBar name="My project" onDetails={noop} onActivity={noop} {...props} />)
test("Chat context stays compact and exposes details and activity without raw authority metadata", () => {
  const html = render()
  assert.match(html, /My project/); assert.match(html, />Details</); assert.match(html, />Activity</)
  assert.doesNotMatch(html, /filesystem\.|grantVersion|runtimeId|fingerprint|<details|<article|Access needs attention/)
})
for (const [props, label] of [
  [{ changed: true }, "Workspace changed"], [{ unavailable: true }, "Workspace unavailable"],
  [{ accessWarning: true }, "Access needs attention"], [{ stale: true }, "Updates unavailable"],
] as const) test(`compact truthful warning: ${label}`, () => {
  const html = render(props)
  assert.match(html, /role="status"/); assert.ok(html.includes(label)); assert.match(html, />Details</)
  assert.doesNotMatch(html, /disabled|progressbar|thinking-dots/)
})
test("unbound context never implies workspace access", () => {
  assert.match(render({ name: undefined }), /No workspace bound/)
  assert.doesNotMatch(render({ name: undefined }), /Reading allowed|Connected|Authorized/)
})
test("Chat retains timeline and a single bottom composer with existing navigation", () => {
  const html = renderToStaticMarkup(<ProjectChat expanded={false} onExpand={noop} onHistory={noop} onNew={noop} conversationTitle="Saved conversation" projectName="Project">
    <ChatContextBar name="Folder" onDetails={noop} onActivity={noop} />
    <div className="chat-message-scroll">Timeline</div><textarea aria-label="Message" />
  </ProjectChat>)
  assert.equal((html.match(/<textarea/g) ?? []).length, 1)
  assert.ok(html.indexOf("Timeline") < html.indexOf("<textarea"))
  assert.match(html, /Saved conversation/); assert.match(html, /Conversation history|New conversation/)
})
test("production integration moves large context/access controls out of the Chat timeline layout", () => {
  const page = readFileSync("app/page.tsx", "utf8")
  const chat = page.slice(page.indexOf("chat={<ProjectChat"), page.indexOf("</ProjectChat>}"))
  assert.match(chat, /<ChatContextBar/); assert.match(chat, /<CommandComposer key=\{`composer:/)
  assert.doesNotMatch(chat, /<HistoricalContextControl|<ConversationWorkspaceNotice|<RuntimeAccessStatus|<RuntimeStatus/)
  assert.match(chat, /<ThinkingIndicator stale=\{runState.isStale\}/)
  assert.match(chat, /Showing the last successfully saved conversation state/)
  assert.match(chat, /runState.isStale && runState.conversation/)
  assert.match(chat, /Request notice.*Conversation unavailable.*Notice/)
  assert.doesNotMatch(chat, /Checking saved progress; it has not been resubmitted/)
  const details = page.slice(page.indexOf("<Sheet open={chatDetailsOpen}"), page.indexOf("<Sheet open={historyOpen}"))
  for (const component of ["HistoricalContextControl", "ConversationWorkspaceNotice", "ConversationWorkspaceIndicator", "RuntimeAccessStatus", "RuntimeStatus"]) assert.ok(details.includes(`<${component}`))
  assert.match(details, /selectHistoricalContext\(id, sourceId\)/)
  assert.match(details, /onChanged=\{refreshWorkspace\}/)
  assert.match(page, /<details className="chat-run-access"><summary>/)
})
test("layout dedicates remaining height to scrolling messages and keeps composer outside the scroller", () => {
  const css = readFileSync("app/workspace.css", "utf8")
  assert.match(css, /\.project-chat > :not\(\.chat-message-scroll\) \{ flex-shrink: 0;/)
  assert.match(css, /\.chat-message-scroll \{[^}]*flex: 1 1 0;[^}]*min-height: 0;/)
  assert.match(css, /@media \(max-width: 480px\).*chat-context-bar/)
  assert.match(css, /\[data-sender="assistant"\].*border-bottom:/)
})
