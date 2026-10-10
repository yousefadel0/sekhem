import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SourceEditor, sourceTokens } from "../components/workspace/source-editor"
import { PaneResize } from "../components/workspace/ide-controls"
import { SekhemShell } from "../components/workspace/sekhem-shell"
import { WorkspaceTerminal } from "../components/workspace/workspace-terminal"
import { terminalCommand, terminalInScope, terminalMessage } from "../lib/workspace-terminal"
import { readFileSync } from "node:fs"

test("syntax presentation preserves exact source text and escapes executable markup", () => {
  for (const line of ['const x = "<script>alert(1)</script>";', '  "version": "0.1.1",\r', '# a comment', 'مرحبا', ''])
    assert.equal(sourceTokens(line).map(token => token.text).join(""), line)
  const html = renderToStaticMarkup(createElement(SourceEditor, { path: "package.json", text: '<script>alert(1)</script>\n"version": "0.1.1"' }))
  assert.doesNotMatch(html, /<script>/); assert.match(html, /ide-codemirror/)
  assert.match(html, /data-editable="true"/); assert.match(html, /Find \/ Replace/); assert.match(html, /VERIFIED WORKSPACE SOURCE/)
  assert.doesNotMatch(html, /Save to disk/)
})
test("truncated sources cannot enter local edit mode", () => {
  const html = renderToStaticMarkup(createElement(SourceEditor, { path: "partial.ts", text: "const x = 1", truncated: true }))
  assert.match(html, /button[^>]*disabled[^>]*>Save \/ Review/); assert.match(html, /TRUNCATED \/ NON-EDITABLE/); assert.doesNotMatch(html, /data-editable="true"/)
})
test("resizers are keyboard accessible and expose bounded layout values", () => {
  const html = renderToStaticMarkup(createElement(PaneResize, { label: "Resize Terminal", value: 320, min: 200, max: 700, axis: "y", onChange: () => assert.fail("render must not resize") }))
  assert.match(html, /role="separator"/); assert.match(html, /tabindex="0"/); assert.match(html, /aria-valuemax="700"/)
})
test("shell renders one conversation alongside editor and bottom terminal with status", () => {
  const html = renderToStaticMarkup(createElement(SekhemShell, { header: "Header", navigation: "Activity", explorer: "Explorer", workarea: "Source editor", chat: "One conversation", terminal: "Governed terminal", statusBar: "Grant: ACTIVE",
    collapsed: true, drawer: null, onDrawer: () => {}, mobileSurface: "workspace", onSurface: () => {}, chatExpanded: false }))
  assert.equal(html.split("One conversation").length - 1, 1)
  assert.match(html, /ide-workspace/); assert.match(html, /Resize Explorer/); assert.match(html, /Resize Agent panel/)
  assert.match(html, /Governed terminal/); assert.match(html, /Grant: ACTIVE/)
})
test("terminal displays bounded independent actions, not unrestricted sessions", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceTerminal, { cwd: "C:\\fixture", conversationId: "conversation", runtimeId: "runtime", runIds: [], disabled: false, ensureConversation: async () => "conversation", onChanged: async () => {} }))
  for (const label of ["Terminal history tabs", "Search terminal output", "Copy output", "Select output", "Maximize Terminal", "Resize Terminal", "Review command", "Human approval required"]) assert.ok(html.includes(label), label)
  assert.match(html, /No persistent shell session/)
  assert.deepEqual(terminalMessage("node --version", "request").terminalAction.args, ["-NoProfile", "-NonInteractive", "-Command", "node --version"])
})
test("terminal history filters durable proposals to the exact conversation/runtime/cwd", () => {
  const proposal: any = { toolId: "terminal.execute", conversationId: "c", runtimeId: "r", validatedInput: { executable: "node", args: ["--version"], cwd: "C:\\fixture" } }
  assert.equal(terminalInScope(proposal, "c", "C:\\fixture", "r"), true)
  for (const different of [{ conversationId: "other" }, { runtimeId: "other" }, { toolId: "filesystem.read" }, { validatedInput: { ...proposal.validatedInput, cwd: "C:\\other" } }])
    assert.equal(terminalInScope({ ...proposal, ...different }, "c", "C:\\fixture", "r"), false)
  assert.equal(terminalCommand(proposal), "node --version")
  assert.equal(terminalCommand({ ...proposal, validatedInput: terminalMessage("Get-Date", "id").terminalAction }), "Get-Date")
})
test("editor and terminal do not add any command or save-to-disk transport", () => {
  for (const path of ["components/workspace/source-editor.tsx", "components/workspace/workspace-editor.tsx", "components/workspace/sekhem-shell.tsx"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /postSekhemApi|WebSocket|child_process|terminal\.execute/)
  }
  const terminal = readFileSync("components/workspace/workspace-terminal.tsx", "utf8")
  assert.match(terminal, /proposeTerminalCommand/); assert.match(terminal, /TrustedRuntimeExecutionCard/)
  assert.doesNotMatch(terminal, /decision: "APPROVED"|WebSocket|child_process/)
})
