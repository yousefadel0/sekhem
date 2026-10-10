import assert from "node:assert/strict"
import { beforeEach, afterEach, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RuntimeEvidenceAction, RuntimeEvidenceStatus, canAnalyzeEvidence, evidenceStateLabels } from "../components/workspace/runtime-evidence"
import { RuntimeFileViewer } from "../components/workspace/workspace-runtime"
import { EvidenceList, RuntimeEvidenceProvenance } from "../components/chat/agent-run-card"
import { getRuntimeEvidence, requestRuntimeEvidence, type RuntimeEvidenceReference, type RuntimeEvidenceView, type RuntimeWorkspaceBinding, type WorkspaceOperationView } from "../lib/sekhem-agent"
import { postConversationMessage } from "../lib/sekhem-conversation"
const binding: RuntimeWorkspaceBinding = { workspaceId: "workspace-a", version: 1, revision: 2, projectId: "project-a", organizationId: "org-a", userId: "user-a", runtimeId: "runtime-a", runtimeFingerprint: "fingerprint-a", rootPath: "D:\\fixture", displayName: "Acceptance fixture", status: "READY", verifiedAt: "2026-09-23T17:00:00Z", verificationReceiptId: "verify-a", createdAt: "2026-09-23T16:59:00Z", updatedAt: "2026-09-23T17:00:00Z" }
const reference: RuntimeEvidenceReference = { workspaceId: binding.workspaceId, bindingVersion: 1, runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint,
  relativePath: "HELLO.md", receiptId: "receipt-a", requestId: "evidence-a", projectId: binding.projectId, organizationId: binding.organizationId, userId: binding.userId,
  conversationId: "conversation-a", operationId: "operation-a", observationTime: binding.verifiedAt!, contentIdentity: { status: "UNAVAILABLE" }, truncated: false, encoding: "utf-8-decoded", sourceType: "runtime-workspace", verificationState: "VERIFIED" }
const view: RuntimeEvidenceView = { request: reference, reference, state: "VERIFIED", historical: false }
const operation: WorkspaceOperationView = { state: "READY", operation: { ...reference, runId: "run-view", runtimeRequestId: "view-a", tool: "filesystem.read", kind: "READ", absolutePath: "D:\\fixture\\HELLO.md", createdAt: binding.createdAt },
  receipt: { ...reference, observedAt: reference.observationTime }, file: { text: "harmless source", fileName: "HELLO.md", mimeType: "text/plain", warnings: [] } }
let result: unknown = view
const requests: { url: string; method: string; body: any }[] = []
const original = globalThis.fetch, base = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
beforeEach(() => { requests.length = 0; result = view; process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"; globalThis.fetch = (async (url: any, opts: any) => {
  requests.push({ url: String(url), method: opts?.method ?? "GET", body: opts?.body && JSON.parse(opts.body) }); return new Response(JSON.stringify({ data: result, errors: [], meta: {} }), { status: 200 })
}) as typeof fetch })
afterEach(() => { globalThis.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = base })
test("opening and rendering a selected file only exposes explicit Ask Agent; no request/admission or Agent dispatch", () => {
  let calls = 0
  const html = renderToStaticMarkup(createElement(RuntimeFileViewer, { binding, initial: operation, available: true,
    ensureConversation: async () => { calls++; return "conversation-a" }, onAnalyze: async () => { calls++ } }))
  assert.match(html, /Ask Agent · approval required/); assert.match(html, /does not add Agent evidence/); assert.match(html, /fresh read/)
  assert.doesNotMatch(html, /Send to Agent|Verified evidence/); assert.equal(calls, 0); assert.equal(requests.length, 0)
})
for (const [state, label] of Object.entries(evidenceStateLabels)) test(`evidence UI distinguishes ${state}`, () => {
  const html = renderToStaticMarkup(createElement(RuntimeEvidenceStatus, { state: state as keyof typeof evidenceStateLabels })); assert.ok(html.includes(label))
  assert.equal(canAnalyzeEvidence({ ...view, state: state as keyof typeof evidenceStateLabels }), ["VERIFIED", "TRUNCATED"].includes(state))
})
test("historical references and missing verification cannot enable Send to Agent", () => {
  assert.equal(canAnalyzeEvidence({ ...view, historical: true }), false); assert.equal(canAnalyzeEvidence({ ...view, reference: undefined }), false); assert.equal(canAnalyzeEvidence(null), false)
})
test("explicit evidence request uses exact structured file and same Conversation, never a viewer receipt or raw content", async () => {
  await requestRuntimeEvidence(binding, "conversation-a", "HELLO.md"); await requestRuntimeEvidence(binding, "conversation-a", "HELLO.md")
  assert.ok(requests.every(r => r.method === "POST" && r.url.endsWith("/workspace/bindings/workspace-a/evidence")))
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["bindingVersion", "conversationId", "relativePath", "requestId", "runtimeId"].sort())
  assert.equal(requests[0].body.conversationId, "conversation-a"); assert.equal(requests[0].body.relativePath, "HELLO.md"); assert.notEqual(requests[0].body.requestId, requests[1].body.requestId)
})
test("evidence refresh is read-only and cannot dispatch a runtime operation", async () => {
  assert.deepEqual(await getRuntimeEvidence(binding, "evidence-a"), view); assert.equal(requests[0].method, "GET"); assert.match(requests[0].url, /evidence\/evidence-a\?version=1$/)
})
test("Send to Agent preserves exact reference and explicit routing in existing Conversation", async () => {
  result = { agentRunId: "run-a", conversationId: "conversation-a" }
  await postConversationMessage("conversation-a", "Summarize this file.", undefined, { triggerAgent: true, runtimeEvidence: [reference] })
  assert.match(requests[0].url, /conversations\/conversation-a\/messages$/); assert.equal(requests[0].body.triggerAgent, true)
  assert.deepEqual(requests[0].body.runtimeEvidence, [reference]); assert.equal(requests[0].body.content, "Summarize this file.")
})
test("provenance is visible both before analysis and in saved evidence cards", () => {
  const html = renderToStaticMarkup(createElement(RuntimeEvidenceProvenance, { reference }))
  for (const expected of [reference.workspaceId, reference.runtimeId, reference.runtimeFingerprint, "Binding v1", "HELLO.md", "receipt-a", reference.observationTime, "operation-a", "Unavailable", "original bytes were not inspected"]) assert.ok(html.includes(expected), expected)
  const saved = renderToStaticMarkup(createElement(EvidenceList, { evidence: [{ id: "ev-a", sourceType: "workspace", label: "HELLO.md", outcome: "READ", discovered: true, read: true, selected: true, usedInAnswer: "UNKNOWN", truncated: false, selectionReason: "Explicit file", runtimeReference: reference }], onOpen: () => assert.fail() }))
  assert.match(saved, /Historical observation saved with this run/); assert.match(saved, /receipt-a/)
})
