import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { EditorState } from "@codemirror/state"
import { documentChanges, revertChange, editableSource, editorReference, editorLanguage, outputFileReferences } from "../lib/editor-document"
import { prepareEditorSave, editorReadBackMatches } from "../lib/editor-save"
import { editorLineEndingExtensions } from "../lib/editor-line-endings"
import type { RuntimeWorkspaceBinding, WorkspaceOperationView } from "../lib/sekhem-agent"

const original = '{\r\n  "version": "0.1.1"\r\n}\r\n', draft = original.replace("0.1.1", "0.1.2")
const binding = { status: "READY", projectId: "p", runtimeId: "r", workspaceId: "w", version: 44, rootPath: "C:\\fixture" } as RuntimeWorkspaceBinding
const view = { state: "READY", operation: { tool: "filesystem.read", conversationId: "c", projectId: "p", runtimeId: "r", relativePath: "package.json", absolutePath: "C:\\fixture\\package.json" }, receipt: { receiptId: "read1", truncated: false, workspaceId: "w", bindingVersion: 44, runtimeId: "r", relativePath: "package.json" }, file: { text: original } } as WorkspaceOperationView

test("real editor state preserves verified source and CRLF while editing a separate draft", () => {
  const state = EditorState.create({ doc: original, extensions: EditorState.lineSeparator.of("\r\n") })
  const at = state.doc.toString().indexOf("0.1.1")
  const edited = state.update({ changes: { from: at, to: at + 5, insert: "0.1.2" } }).state
  assert.equal(state.sliceDoc(), original); assert.equal(edited.sliceDoc(), draft)
  assert.equal(revertChange(original, edited.sliceDoc(), 0), original)
})

for (const separator of ["\n", "\r\n"]) test(`pasted mixed line breaks preserve the source's ${JSON.stringify(separator)} separator`, () => {
  const source = `first${separator}last${separator}`
  const state = EditorState.create({ doc: source, extensions: editorLineEndingExtensions(source) })
  const edited = state.update({ changes: { from: state.doc.length, insert: "\nmarker\r\nnext\rfinal\n" } }).state
  assert.equal(state.sliceDoc(), source)
  assert.equal(edited.sliceDoc(), source + ["", "marker", "next", "final", ""].join(separator))
  assert.equal(editableSource("README.md", edited.sliceDoc()), null)
  assert.equal(revertChange(source, edited.sliceDoc(), 0), source)
})
for (const [before, after, kind] of [["a\n", "a\nb\n", "added"], ["a\nb\n", "a\n", "deleted"], [original, draft, "modified"]]) test(`exact ${kind} diff and individual revert`, () => {
  assert.equal(documentChanges(before, after)[0].kind, kind)
  assert.equal(revertChange(before, after, 0), before)
})
test("normal and unfamiliar text stay editable; unsafe or incomplete source is explicit", () => {
  for (const path of ["package.json", "x.tsx", ".env", "unknown.foo"]) assert.equal(editableSource(path, original), null)
  for (const [path, content, truncated] of [["x", original, true], ["x", "x\0", false], ["x.tsbuildinfo", "{}", false], ["x", "x".repeat(131073), false], ["x", "a\r\nb\n", false]] as const) assert.ok(editableSource(path, content, truncated))
  assert.equal(editorLanguage("x.tsx"), "TSX")
})
test("reliable relative references navigate to exact lines; outside paths rejected", () => {
  assert.deepEqual(editorReference("package.json:3"), { path: "package.json", line: 3 })
  assert.deepEqual(editorReference("src/a.ts:L12-L15"), { path: "src/a.ts", line: 12 })
  for (const path of ["../x:3", "C:\\x:3", "/x:3", "x:0"]) assert.equal(editorReference(path), null)
})
test("terminal references are bounded, relative, and explicit; output cannot become authority", () => {
  assert.deepEqual(outputFileReferences("src/app.ts:12:3 error\n../secret.ts:2 error\nC:\\x.ts:4 error\nnot a location\nsrc/app.ts:12:3 error"), ["src/app.ts:12"])
  assert.equal(outputFileReferences(Array.from({length: 30}, (_, i) => `x${i}.ts:1 error`).join("\n")).length, 20)
})
test("save activates same-conversation work then prepares exact proposal with fresh preimage; never approves or executes", async () => {
  const saved = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"
  const calls: string[] = []
  globalThis.fetch = (async (url, init) => {
    calls.push(String(url)); const body = JSON.parse(String(init?.body))
    if (String(url).endsWith("/conversations/c/messages")) {
      assert.equal(body.transferToAgent, true); assert.equal(body.metadata.clientMessageId, "editor_stable-request");
      assert.match(body.content, /Do not execute/); assert.equal(body.approval, undefined); assert.equal(body.permit, undefined);
      return new Response(JSON.stringify({ data: { kind: "AGENT_TRANSFER", conversationId: "c", agentConversationId: "c" }, errors: [] }))
    }
    assert.equal(body.tool, "filesystem.write"); assert.equal(body.input.content, draft)
    assert.equal(body.input.expectedSha256, createHash("sha256").update(original).digest("hex"))
    assert.equal(body.requestId, "stable-request"); assert.equal(body.approval, undefined); assert.equal(body.permit, undefined)
    return new Response(JSON.stringify({ data: { runId: "save1", proposal: { toolId: body.tool, validatedInput: body.input } }, errors: [] }))
  }) as typeof fetch
  try {
    assert.equal((await prepareEditorSave(binding, view, "c", original, draft, "stable-request")).runId, "save1")
    assert.deepEqual(calls, ["https://example.test/api/conversations/c/messages", "https://example.test/api/trusted-runtime/proposals"])
    for (const invalid of [{ ...view, state: "FAILED" }, { ...view, receipt: { ...view.receipt!, truncated: true } }, { ...view, file: { ...view.file!, text: "different" } }]) await assert.rejects(prepareEditorSave(binding, invalid as WorkspaceOperationView, "c", original, draft, "stable-request"))
    assert.equal(calls.length, 2)
  } finally { globalThis.fetch = saved; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base }
})
test("save stops before proposing when activation fails or points to a different conversation", async () => {
  const saved = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL;
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api";
  try {
    for (const denied of [true, false]) {
      const calls: string[] = [];
      globalThis.fetch = (async url => {
        calls.push(String(url));
        return denied ? new Response(JSON.stringify({ data: null, errors: [{ code: "DENIED", message: "Access denied" }] }), { status: 403 })
          : new Response(JSON.stringify({ data: { kind: "AGENT_TRANSFER", conversationId: "c", agentConversationId: "other" }, errors: [] }));
      }) as typeof fetch;
      await assert.rejects(prepareEditorSave(binding, view, "c", original, draft, "activation-failed"));
      assert.deepEqual(calls, ["https://example.test/api/conversations/c/messages"]);
    }
  } finally { globalThis.fetch = saved; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base; }
});

test("only new complete matching bound read-back can mark draft persisted", () => {
  const back = { ...view, receipt: { ...view.receipt!, receiptId: "read2" }, file: { ...view.file!, text: draft } }
  assert.equal(editorReadBackMatches(back, binding, "package.json", draft, "read1"), true)
  assert.equal(editorReadBackMatches(back, binding, "package.json", draft, "read2"), false)
  assert.equal(editorReadBackMatches(back, { ...binding, version: 45 }, "package.json", draft, "read1"), false)
  assert.equal(editorReadBackMatches(view, binding, "package.json", draft, "read1"), false)
})
