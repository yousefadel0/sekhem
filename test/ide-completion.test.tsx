import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { parseQuickOpen, CommandPalette } from "../components/workspace/command-palette"
import { TerminalAction, terminalState, terminalText } from "../components/workspace/terminal-action"
import type { RuntimeActionSnapshot } from "../components/workspace/trusted-runtime-control"
import { WorkspaceEditor } from "../components/workspace/workspace-editor"
import { runActivity } from "../lib/sekhem-agent"
import { EditorLocation, SourceEditor } from "../components/workspace/source-editor"

const pending = { proposal: { runId: "rtrun_fixture", state: "AWAITING_APPROVAL", createdAt: "2026-10-07T12:00:00Z", toolId: "terminal.execute", validatedInput: { executable: "node", args: ["--version"], cwd: "C:\\fixture" }, preview: { description: "Read node version" } }, execution: null } as unknown as RuntimeActionSnapshot
const noAction = async () => assert.fail("Rendering must not submit any approval or command")
function render(snapshot: RuntimeActionSnapshot, error = "") {
  return renderToStaticMarkup(createElement(TerminalAction, { snapshot, busy: false, error, refresh: () => {}, approve: noAction, reject: noAction, cancel: noAction }))
}
test("quick open accepts workspace-relative files and bounded line numbers", () => {
  assert.deepEqual(parseQuickOpen("src/app.ts:42"), { path: "src/app.ts", line: 42 })
  assert.deepEqual(parseQuickOpen("package.json"), { path: "package.json", line: undefined })
  for (const path of ["", "../secret", "src/../../secret", "C:\\secret", "/etc/passwd", "a\0b", "file:0", "file:99999999"]) assert.equal(parseQuickOpen(path), null)
})
test("command palette rendering never performs actions or reads", () => {
  const html = renderToStaticMarkup(createElement(CommandPalette, { actions: [{ name: "New Terminal", run: () => assert.fail() }], onOpenFile: () => assert.fail() }))
  assert.match(html, /Ctrl\+Shift\+P/)
})
test("pending terminal renders explicit approval controls without invoking them", () => {
  const html = render(pending)
  assert.match(html, /AWAITING APPROVAL/); assert.match(html, />Approve</); assert.match(html, />Reject</)
  assert.match(html, /Review and Enter do not authorize execution/)
  assert.doesNotMatch(html, /Receipt \/ permit/)
})
test("stale terminal response disables authorization controls", () => {
  assert.match(render(pending, "Saved state unavailable"), /button[^>]*disabled[^>]*>Approve/)
})
test("terminal verified presentation requires authoritative verified receipt", () => {
  const succeeded = { ...pending, proposal: { ...pending.proposal, state: "COMPLETED" }, execution: { state: "SUCCEEDED", verificationState: "VERIFIED", attribution: { executionId: "receipt", permitDigest: "digest", runtimeId: "runtime" }, result: { stdout: "v24.21.0\n", stderr: "", exitCode: 0, durationMs: 61, finishedAt: "2026-10-07T12:01:00Z", verificationResult: { state: "VERIFIED" } } } } as unknown as RuntimeActionSnapshot
  const html = render(succeeded)
  assert.match(html, /v24.21.0/); assert.match(html, /Exit 0/); assert.match(html, /Receipt receipt/)
  assert.doesNotMatch(html, />Approve</); assert.equal(terminalState(succeeded), "VERIFIED")
  assert.equal(terminalState({ ...succeeded, execution: { ...succeeded.execution!, verificationState: "PENDING" } }), "VERIFICATION INCOMPLETE")
})
test("untrusted output is text only and terminal control sequences cannot act", () => {
  assert.equal(terminalText("\x1b[31mred\x1b[0m\n\x1b]0;title\x07safe"), "red\nsafe")
  assert.equal(terminalText("<script>x</script>"), "<script>x</script>")
})
test("uncertain terminal outcome exposes stop state without retry control", () => {
  const uncertain = { ...pending, proposal: { ...pending.proposal, state: "FAILED" }, execution: { state: "OUTCOME_UNKNOWN", attribution: {} } } as unknown as RuntimeActionSnapshot
  const html = render(uncertain)
  assert.match(html, /Outcome uncertain/); assert.match(html, /No automatic retry/); assert.doesNotMatch(html, />Approve</)
})
test("editor keeps immutable proposal excerpts distinct from observed source", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceEditor, { file: null, available: true, status: "Ready", error: null, ensureConversation: async () => { throw new Error("no calls") }, onAnalyze: async () => {}, workflow: { observedAt: Date.parse("2026-10-07T12:00:00Z"), proposal: { id: "proposal", version: 1, revision: 1, digest: "digest", state: "READY", changes: [{ path: "package.json", before: '"version": "0.1.1"', after: '"version": "0.1.2"' }] } } }))
  assert.match(html, /After · proposed/); assert.match(html, /Approval: Required/)
  assert.match(html, /Proposal content is not workspace source/); assert.doesNotMatch(html, />Approve</)
})
test("older run summaries defer to receipt instead of falsely claiming verification unavailable", () => {
  assert.equal(runActivity({ id: "rtrun_fixture", status: "COMPLETED" } as any), "Completion recorded · Inspect execution receipt")
})
test("line navigation is scoped to the exact observed file and does not alter content", () => {
  const html = renderToStaticMarkup(createElement(EditorLocation.Provider, { value: { path: "package.json", line: 3 } }, createElement(SourceEditor, { path: "package.json", text: '{\n  "name": "fixture",\n  "version": "0.1.1"\n}' })))
  assert.match(html, /data-source-path="package.json" data-line="3"/)
  assert.match(html, /data-editable="true"/)
})
