import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { ChatMessageItem } from "../components/chat/chat-message-item"
import { WorkflowActivityIndicator } from "../components/chat/thinking-indicator"

const run: any = { id: "internal-run", planVersion: 1, status: "RUNNING", title: "Understand the project", pendingApprovals: [], inspection: { state: "UNDERSTANDING", operations: [{ request: { operationId: "internal-operation" }, action: { tool: "filesystem.read", relativePath: "README.md" }, verification: "VERIFIED", state: "COMPLETED" }], executionVerified: 1 } }
const card = (value = run) => renderToStaticMarkup(<AgentRunCard run={value} detail={value} onSelect={() => {}} />)

test("conversation projects durable reading/grounding without exposing operations in its main progress", () => {
  const html = card(), [main, details] = html.split('data-chat-details="true"')
  assert.match(main, />Grounding</); assert.match(main, /Sources · 1/)
  assert.doesNotMatch(main, /filesystem.read|internal-operation|Workspace inspection|Agent<\/h3>/)
  assert.doesNotMatch(html, /undefined\/undefined/)
  assert.match(html, /Read file/)
  assert.match(details, /filesystem.read|Operation details/)
  assert.doesNotMatch(html, /<details[^>]*open/)
  assert.equal(card(JSON.parse(JSON.stringify(run))), html)
})

test("chat labels reading without changing the durable phase or default workspace presentation", () => {
  const reading = { ...run, inspection: { ...run.inspection, state: "EXECUTING" } }
  const html = renderToStaticMarkup(<WorkflowActivityIndicator run={reading} conversational />)
  assert.match(html, />Reading</); assert.match(html, /data-phase="INSPECTING"/)
  assert.match(renderToStaticMarkup(<WorkflowActivityIndicator run={reading} />), />Inspecting</)
})

test("required approval and clarification remain visible before technical Details", () => {
  const html = card({ ...run, status: "PAUSED", pendingApprovals: [{}], inspection: { ...run.inspection, state: "AWAITING_INPUT" } })
  const main = html.split('data-chat-details="true"')[0]
  assert.match(main, /Approval required/); assert.match(main, /Waiting for your clarification/)
  assert.doesNotMatch(main, /Result verified/)
})

test("assistant answer stays primary with automatic direction and source outcomes collapsed", () => {
  const message: any = { id: "message", conversationId: "conversation", senderType: "assistant", content: "## رأيي في المشروع\n\nRead README.md", metadata: { evidenceReceipt: [{ label: "README.md", outcome: "VERIFIED" }] } }
  const html = renderToStaticMarkup(<ChatMessageItem message={message} />)
  assert.ok(html.indexOf('رأيي في المشروع') < html.indexOf('<details'))
  assert.match(html, /dir="auto"/); assert.match(html, /<details[^>]*><summary>Details · Source outcomes/)
  assert.doesNotMatch(html, /<details[^>]*open/)
})

import { readFileSync } from "node:fs"
import { restoredWorkspaceSurface } from "../lib/conversation-restoration"

test("reload restores only the selected UI surface; it cannot restore authority or dispatch operations", () => {
  assert.equal(restoredWorkspaceSurface("chat"), "chat")
  assert.equal(restoredWorkspaceSurface("agent"), "agent")
  for (const saved of [null, "workspace", "APPROVED", "execute", '{"permit":true}']) assert.equal(restoredWorkspaceSurface(saved), "workspace")
  const page = readFileSync("app/page.tsx", "utf8")
  assert.match(page, /\[mobileSurface, setMobileSurface\] = useWorkspaceSurface\(\)/)
  assert.doesNotMatch(page, /sessionStorage|localStorage/)
  const preference = readFileSync("lib/use-workspace-surface.ts", "utf8")
  assert.match(preference, /setSurface\(restoredWorkspaceSurface\(sessionStorage.getItem\("sekhem.workspace.surface"\)\)\)/)
  assert.match(preference, /if \(!restored\) return/)
  assert.match(preference, /sessionStorage.setItem\("sekhem.workspace.surface", surface\)/)
  assert.equal((preference.match(/sessionStorage\./g) ?? []).length, 2)
})
