import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { conversationWorkspaceChanged, isConversationWorkspaceConflict, resolveWorkspaceConversation, type ConversationSummaryDto } from "../lib/sekhem-conversation"
import { runtimeWorkspaceDescriptor, type RuntimeWorkspaceBinding } from "../lib/sekhem-agent"
import { ConversationWorkspaceNotice, ConversationWorkspaceIndicator } from "../components/workspace/project-chat"
import { acceptsConversationPreview, reconcileConversationSnapshot } from "../lib/conversation-restoration"
import { SekhemApiError } from "../lib/sekhem-api"
import { readFileSync } from "node:fs"

const runtime: RuntimeWorkspaceBinding = { workspaceId: "workspace-old", version: 24, revision: 1, projectId: "project", organizationId: "org", userId: "user", runtimeId: "runtime", runtimeFingerprint: "fingerprint", rootPath: "D:\\fixture", displayName: "fixture", status: "READY", verifiedAt: "2026-09-25T00:00:00Z", verificationReceiptId: "receipt", createdAt: "", updatedAt: "" }
const binding = runtimeWorkspaceDescriptor(runtime)
const conversation: ConversationSummaryDto = { id: "old-chat", projectId: "project", userId: "user", title: "Chat", mode: "CHAT", status: "active", createdAt: "", updatedAt: "", modeContext: { version: 1, mode: "CHAT", organizationId: "org", workspace: { workspaceId: runtime.workspaceId, bindingVersion: 24, runtimeId: runtime.runtimeId, runtimeFingerprint: runtime.runtimeFingerprint } } }

test("current binding permits Normal Chat presentation without requiring a Runtime operation", () => {
  assert.equal(conversationWorkspaceChanged(conversation, binding, "READY"), false)
  assert.equal(conversationWorkspaceChanged(conversation, binding, "OFFLINE"), false)
})
test("restored historical binding marked STALE cannot compare equal to itself and enable Send", () => {
  assert.equal(conversationWorkspaceChanged(conversation, binding, "STALE"), true)
})
for (const sameFolder of [true, false]) test(`new binding is stale even when folder ${sameFolder ? "is unchanged" : "changes"}`, () => {
  const next = runtimeWorkspaceDescriptor({ ...runtime, workspaceId: "workspace-new", version: 26, rootPath: sameFolder ? runtime.rootPath : "D:\\other" })
  assert.equal(conversationWorkspaceChanged(conversation, next, "READY"), true)
  const fresh: ConversationSummaryDto = { ...conversation, id: "new-chat", modeContext: { ...conversation.modeContext!, workspace: { ...conversation.modeContext!.workspace!, workspaceId: next.id, bindingVersion: 26 } } }
  assert.equal(conversationWorkspaceChanged(fresh, next, "READY"), false)
  assert.equal(resolveWorkspaceConversation([conversation, fresh], "CHAT", { projectId: "project", workspaceId: next.id, bindingVersion: next.version })?.id, fresh.id)
  assert.equal(conversation.modeContext!.workspace!.bindingVersion, 24)
})
test("reload retains saved binding and stale state without retargeting evidence", () => {
  const saved = { ...conversation, metadata: { runtimeWorkspace: { workspaceId: runtime.workspaceId, bindingVersion: 24 } }, messages: [], agentRuns: [] }
  const restored = reconcileConversationSnapshot(undefined, JSON.parse(JSON.stringify(saved)))
  assert.deepEqual(restored.modeContext, conversation.modeContext)
  assert.equal(conversationWorkspaceChanged(restored, binding, "STALE"), true)
})
test("runtime identity and project mismatches remain blocked", () => {
  for (const changed of [{ ...runtime, runtimeId: "other" }, { ...runtime, runtimeFingerprint: "other" }, { ...runtime, projectId: "other" }]) {
    assert.equal(conversationWorkspaceChanged(conversation, runtimeWorkspaceDescriptor(changed), "READY"), true)
  }
})
test("recovery is explicit, labels both bindings and requires an available current descriptor", () => {
  const active = runtimeWorkspaceDescriptor({ ...runtime, workspaceId: "workspace-new", version: 26, displayName: "other", rootPath: "D:\\other" })
  let switched = false
  const html = renderToStaticMarkup(createElement(ConversationWorkspaceNotice, { saved: binding, active, onNew: () => { switched = true } }))
  assert.match(html, /Saved workspace: fixture · binding 24/); assert.match(html, /Current workspace: other · binding 26/)
  assert.match(html, /New Chat in current workspace/); assert.match(html, /does not transfer old evidence or grant file access/)
  assert.equal(switched, false)
  assert.match(renderToStaticMarkup(createElement(ConversationWorkspaceNotice, { saved: binding, active: null, onNew() {} })), /disabled=""/)
})
test("late API rejection is recognized without treating unrelated HTTP failures as binding changes", () => {
  assert.equal(isConversationWorkspaceConflict(new SekhemApiError(409, "CONVERSATION_WORKSPACE_CHANGED", "Recoverable")), true)
  assert.equal(isConversationWorkspaceConflict(new SekhemApiError(409, "HTTP_ERROR", "CONVERSATION_WORKSPACE_CHANGED")), true)
  assert.equal(isConversationWorkspaceConflict(new SekhemApiError(409, "HTTP_ERROR", "WORKSPACE_EVIDENCE_STALE")), false)
  assert.equal(isConversationWorkspaceConflict(new SekhemApiError(403, "FORBIDDEN", "Denied")), false)
})

test("switching conversations sharing a workspace rejects late previews and request revisions", () => {
  assert.equal(acceptsConversationPreview("chat-a", "chat-a", 1, 1), true)
  assert.equal(acceptsConversationPreview("chat-a", "chat-b", 1, 1), false)
  assert.equal(acceptsConversationPreview("chat-a", "chat-a", 1, 2), false)
})
test("reload restores saved workspace indicator without IDs or authorization claims", () => {
  const saved = { ...conversation, metadata: { workspaceBinding: binding }, messages: [], agentRuns: [] }
  const restored = reconcileConversationSnapshot(undefined, JSON.parse(JSON.stringify(saved)))
  const html = renderToStaticMarkup(createElement(ConversationWorkspaceIndicator, { name: (restored.metadata.workspaceBinding as typeof binding).name }))
  assert.match(html, /This conversation uses fixture/)
  assert.doesNotMatch(html, /workspace-old|fingerprint|binding 24|authorized/)
})
test("workspace indicator distinguishes changed and unavailable without retargeting", () => {
  assert.match(renderToStaticMarkup(createElement(ConversationWorkspaceIndicator, { name: "Old folder", changed: true })), /Old folder.*Workspace changed/)
  assert.match(renderToStaticMarkup(createElement(ConversationWorkspaceIndicator, { name: "Old folder", unavailable: true })), /Old folder.*Workspace unavailable/)
  assert.match(renderToStaticMarkup(createElement(ConversationWorkspaceIndicator, {})), /Conversation workspace unavailable/)
})
test("late preview delivery after a same-workspace conversation switch is ignored", async () => {
  let current = "chat-a", revision = 1, displayed: string | null = null
  let complete!: (value: string) => void
  const response = new Promise<string>(resolve => { complete = resolve })
  const delivery = response.then(value => { if (acceptsConversationPreview("chat-a", current, 1, revision)) displayed = value })
  current = "chat-b"; revision++; displayed = null
  complete("old file content"); await delivery
  assert.equal(displayed, null)
  // Switching back must not resurrect the previous request either.
  current = "chat-a"
  assert.equal(acceptsConversationPreview("chat-a", current, 1, revision), false)
})
test("page resets preview and pending read on conversation changes and scopes delayed consent", () => {
  const source = readFileSync("app/page.tsx", "utf8")
  assert.match(source, /setPendingWorkspaceRead\(null\).*\[currentConversationId, selectedProjectId/)
  assert.match(source, /pending\.conversationId === currentConversationIdRef\.current/)
  assert.match(source, /acceptsConversationPreview\(origin, currentConversationIdRef\.current, sequence, fileSequence\.current\)/)
})
