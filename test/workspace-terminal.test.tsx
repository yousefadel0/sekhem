import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WorkspaceTerminal } from "../components/workspace/workspace-terminal"
import { terminalMessage, proposeTerminalCommand } from "../lib/workspace-terminal"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { runtimeActionLabel } from "../lib/workspace-presentation"

test("command submission is only explicit conversation intent, with no client cwd or authority", () => {
  const body = terminalMessage("node --version", "same-request")
  assert.deepEqual(body.terminalAction, { executable: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", "node --version"], timeoutMs: 30000 })
  assert.deepEqual(body, terminalMessage("node --version", "same-request"))
  assert.equal("approval" in body, false); assert.equal("cwd" in body.terminalAction, false)
})
test("invalid or oversized commands fail closed", () => {
  for (const text of ["", "  ", "x\0y", "x".repeat(2049)]) assert.throws(() => terminalMessage(text, "id"))
})
test("terminal surface shows cwd, explicit approval boundary and disabled unavailable input", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceTerminal, { cwd: "C:\\fixture", conversationId: null, runIds: [], disabled: true,
    ensureConversation: async () => { throw new Error("must not create on render") }, onChanged: async () => {} }))
  assert.match(html, /PS C:\\fixture/); assert.match(html, /Review command/)
  assert.match(html, /Human approval required/); assert.match(html, /textarea[^>]*disabled/)
  assert.match(html, /Saved terminal actions/)
})
test("durable verified terminal state is presented truthfully", () => {
  assert.equal(runtimeActionLabel("SUCCEEDED", "VERIFIED"), "Action result verified")
  assert.notEqual(runtimeActionLabel("SUCCEEDED", "PENDING"), "Action result verified")
  assert.equal(runtimeActionLabel("AWAITING_APPROVAL"), "Waiting for your approval")
})

test("panel sends only the existing conversation request, never approval or execution", async () => {
  const saved = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  const calls: string[] = []
  globalThis.fetch = (async (url, init) => {
    calls.push(String(url)); assert.deepEqual(JSON.parse(String(init?.body)), terminalMessage("node --version", "request"))
    return new Response(JSON.stringify({ data: { agentRunId: "rtrun_test", status: "AWAITING_APPROVAL" }, errors: [] }))
  }) as typeof fetch
  try { assert.equal((await proposeTerminalCommand("conversation", "node --version", "request"))?.status, "AWAITING_APPROVAL")
    assert.deepEqual(calls, ["https://example.test/api/conversations/conversation/messages"])
  } finally { globalThis.fetch = saved; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base }
})

test("verified runtime receipt takes precedence over generic engineering-plan activity", () => {
  const run: any = { id: "rtrun_test", title: "Terminal", status: "COMPLETED", planVersion: 1, pendingApprovals: [],
    runtimeActionReceipt: { id: "receipt", state: "SUCCEEDED", verificationState: "VERIFIED" } }
  const html = renderToStaticMarkup(createElement(AgentRunCard, { run, onSelect: () => {}, detail: { ...run,
    presentation: { engineeringPlan: { planId: "plan", workspace: { workspaceId: "workspace", bindingVersion: 1 }, evidenceReferences: [] }, evidence: [], steps: [] } } }))
  assert.match(html, /Action verified/); assert.doesNotMatch(html, /Verification unavailable/)
})
