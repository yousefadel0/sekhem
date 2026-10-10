import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WorkspaceExplorer } from "../components/workspace/workspace-explorer"
import { WorkspaceFolderSelector, WorkspaceOperationStatus, RuntimeFileViewer } from "../components/workspace/workspace-runtime"
import { RuntimeSetup, runtimeOutputVisible } from "../components/workspace/trusted-runtime-control"
import { chooseWorkspaceFolder, getFolderSelection } from "../lib/sekhem-agent"

test("restored Workspace run cards cannot bypass the checked source viewer; standalone runtime output is preserved", () => {
  for (const [kind, toolId] of [["verify", "filesystem.list"], ["list", "filesystem.list"], ["read", "filesystem.read"]] as const) {
    assert.equal(runtimeOutputVisible({ purpose: `Workspace ${kind} · workspace_${"a".repeat(64)} · v1`, toolId }), false)
  }
  assert.equal(runtimeOutputVisible({ purpose: "Requested filesystem.read: D:\\test\\HELLO.md", toolId: "filesystem.read" }), true)
  assert.equal(runtimeOutputVisible({ purpose: "Requested terminal.execute", toolId: "terminal.execute" }), true)
  assert.equal(runtimeOutputVisible(undefined, false), false)
})
import { FilePanel } from "../components/workspace/agent-workspace"
import { createWorkspaceBinding, openWorkspaceBinding, getWorkspaceBindings, getWorkspaceDevices, getWorkspaceFile, getWorkspaceTree, getWorkspaceOperation, getRuntimeWorkspaceBinding, requestWorkspaceOperation, runtimeWorkspaceDescriptor, workspaceOperationFile, type RuntimeWorkspaceBinding, type WorkspaceOperationView } from "../lib/sekhem-agent"

const originalFetch = globalThis.fetch, originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
const calls: Array<{ url: string; method: string; body: any }> = []
let result: unknown
beforeEach(() => { calls.length = 0; process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://example.test/api"; globalThis.fetch = (async (url: any, options: any) => {
  calls.push({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(options.body) : undefined }); return new Response(JSON.stringify({ data: result, errors: [], meta: {} }), { status: 200 })
}) as typeof fetch })
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase })
const binding: RuntimeWorkspaceBinding = { workspaceId: "workspace-a", version: 3, revision: 2, projectId: "project-a", organizationId: "org-a", userId: "user-a", runtimeId: "runtime-a", runtimeFingerprint: "abc", rootPath: "D:\\real-project", displayName: "Real project", status: "READY", verifiedAt: "2026-09-23T10:00:00Z", verificationReceiptId: "verify-receipt", createdAt: "2026-09-23T10:00:00Z", updatedAt: "2026-09-23T10:00:00Z" }
const operation: WorkspaceOperationView = { state: "READY", operation: { operationId: "operation-a", workspaceId: binding.workspaceId, bindingVersion: binding.version, projectId: binding.projectId, organizationId: binding.organizationId, userId: binding.userId, runtimeId: binding.runtimeId, conversationId: "conversation-a", runtimeRequestId: "request-a", runId: "rtrun_a", tool: "filesystem.read", kind: "READ", relativePath: "HELLO.md", absolutePath: "D:\\real-project\\HELLO.md", createdAt: binding.createdAt },
  receipt: { workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId, relativePath: "HELLO.md", receiptId: "read-receipt", observedAt: binding.verifiedAt!, operationId: "operation-a", truncated: false }, file: { text: "<script>source only</script>", fileName: "HELLO.md", mimeType: "text/plain", warnings: ["UTF-8 decoded text; original bytes were not inspected."] } }
const noop = async () => {}

test("an empty Workspace offers a visible folder choice and computer setup without backend-host jargon", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceExplorer, { binding: null, status: "Unavailable", error: null, projectId: "project-a", ensureConversation: async () => "conversation-a", onChanged: noop, onOpen: () => {}, onConnect: () => {}, inventory: { devices: [], grants: [], loading: false, error: null } }))
  for (const label of ["No folder connected.", "Choose Folder", "Connect Computer", "No workspace runtime bound"]) assert.ok(html.includes(label), label)
  assert.doesNotMatch(html, /authorized backend workspace|Backend host|No workspace bound/)
  assert.equal(calls.length, 0)
})

test("expired authentication suppresses cached ready state, file browsing and folder actions", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceExplorer, { binding: runtimeWorkspaceDescriptor(binding), status: "AUTHENTICATION_REQUIRED", error: "Authentication required", projectId: "project-a", ensureConversation: async () => "conversation-a", onChanged: noop, onOpen: () => {}, onConnect: () => {}, inventory: { devices: [], grants: [], loading: false, error: "Authentication required", authenticationRequired: true } }))
  assert.match(html, /Sign in required/)
  assert.doesNotMatch(html, /Folder connected|Choose Folder|Connect Computer|HELLO.md|Verify \/ list/)
  assert.equal(calls.length, 0)
})

test("status lookup failure is distinguished from a disconnected computer", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceExplorer, { binding: null, status: "Unavailable", error: "Network request failed", onOpen: () => {}, inventory: { devices: [], grants: [], loading: false, error: "Network request failed" } }))
  assert.match(html, /Status unavailable/)
  assert.doesNotMatch(html, /● Connected|○ Not connected|Folder connected/)
})

test("unpaired computer setup grants no capability or runtime access", () => {
  const html = renderToStaticMarkup(createElement(RuntimeSetup, { projectId: "project-a", inventory: { devices: [], grants: [], loading: false, error: null }, onChanged: noop }))
  assert.match(html, /signed Windows installer has not been published/)
  assert.doesNotMatch(html, /href="\/runtime\/.*\.exe"/)
  assert.match(html, /No file access is granted by pairing/)
  assert.doesNotMatch(html, /<fieldset>|Runtime target path|terminal\.execute|filesystem\.write/)
  assert.doesNotMatch(html, /Allow read-only project access|Grant selected capabilities/)
})

test("native folder selection uses project-scoped requests and observation never submits another selection", async () => {
  result = { selectionId: "selection-a", state: "PENDING" }
  await chooseWorkspaceFolder("project-a", "runtime-a")
  await getFolderSelection("project-a", "selection-a")
  assert.deepEqual(calls.map(c => c.method), ["POST", "GET"])
  assert.deepEqual(calls[0].body, { runtimeId: "runtime-a" })
  assert.match(calls[0].url, /projects\/project-a\/folder-selections$/)
  assert.match(calls[1].url, /projects\/project-a\/folder-selections\/selection-a$/)
})
test("native folder selector keeps manual connection under Advanced and fails closed without a capable runtime", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceFolderSelector, { projectId: "project-a", ensureConversation: async () => "conversation-a", onChanged: noop }));
  for (const label of ["Workspace runtime", "Workspace local folder", "Choose Folder", "Advanced connection", "not a sandbox"]) assert.ok(html.includes(label)); assert.doesNotMatch(html, /type="file"|webkitdirectory|showDirectoryPicker/); assert.match(html, /disabled=""[^>]*>Choose Folder/); assert.doesNotMatch(html, />Open<\/button>/)
})
test("device selection and binding creation use project-scoped APIs", async () => {
  result = []; await getWorkspaceDevices("project-a"); result = binding; await createWorkspaceBinding("project-a", { runtimeId: binding.runtimeId, rootPath: binding.rootPath, displayName: binding.displayName, requestId: "new-binding" });
  assert.match(calls[0].url, /project-a\/workspace\/runtime\/devices$/); assert.equal(calls[1].method, "POST"); assert.equal(calls[1].body.rootPath, binding.rootPath)
})

test("opening an unverified workspace connects identity without listing, reading or uploading files", async () => {
  result = { ...binding, status: "VERIFYING", verifiedAt: null, verificationReceiptId: null }
  const conversations: RuntimeWorkspaceBinding[] = []
  const opened = await openWorkspaceBinding("project-a", { runtimeId: binding.runtimeId, rootPath: binding.rootPath, displayName: binding.displayName, requestId: "identity-only" }, async b => { conversations.push(b); return "conversation-a" })
  assert.equal(opened.status, "VERIFYING")
  assert.deepEqual(conversations, [opened])
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/bindings$/)
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["displayName", "requestId", "rootPath", "runtimeId"])
  // Listing remains an explicit separate operation; it has no recursive/content input.
  result = operation
  await requestWorkspaceOperation(binding, "tree", "conversation-a", "src")
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.relativePath, "src")
  assert.match(calls[1].url, /\/tree$/)
})
test("verification, lazy directory request, and file selection require distinct exact proposals", async () => {
  result = operation; for (const [kind, path] of [["verify", ""], ["tree", "src"], ["file", "HELLO.md"]] as const) await requestWorkspaceOperation(binding, kind, "conversation-a", path)
  assert.deepEqual(calls.map(c => c.method), ["POST", "POST", "POST"]); assert.deepEqual(calls.map(c => c.body.relativePath), ["", "src", "HELLO.md"]); assert.ok(calls.every(c => c.body.bindingVersion === 3)); assert.equal(new Set(calls.map(c => c.body.requestId)).size, 3)
})
for (const [state, label] of [["LOADING", "Loading"], ["APPROVAL_REQUIRED", "Approval required"], ["EXECUTING", "Executing"], ["READY", "Verified observation"], ["OFFLINE", "Offline"], ["DIRECTORY_MISSING", "Directory missing"], ["DENIED", "Denied"], ["FAILED", "Failed"], ["TRUNCATED", "Truncated"], ["UNSUPPORTED", "Unsupported content"], ["STALE", "Workspace changed"], ["EXPIRED_GRANT", "Project grant expired"]] as const) test(`Workspace visibly distinguishes ${state}`, () => {
  assert.ok(renderToStaticMarkup(createElement(WorkspaceOperationStatus, { view: { ...operation, state } })).includes(label))
})
test("runtime explorer is lazy and cannot render a backend tree for offline metadata", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceExplorer, { binding: runtimeWorkspaceDescriptor({ ...binding, status: "OFFLINE" }), status: "OFFLINE", error: null, onOpen: () => {}, ensureConversation: async () => "conversation-a", onChanged: noop }));
  assert.match(html, /Cached binding metadata only/); assert.match(html, /No backend filesystem fallback/); assert.doesNotMatch(html, /HELLO.md/); assert.equal(calls.length, 0)
})

test("revoked viewer reports revocation without exposing cached source", () => {
  const html = renderToStaticMarkup(createElement(RuntimeFileViewer, { binding: { ...binding, status: "REVOKED" }, initial: operation, available: false }));
  assert.match(html, /Runtime revoked or disabled/); assert.doesNotMatch(html, /source only|<pre|Offline/)
})
test("file viewer escapes source and identifies runtime, binding, receipt and observation", () => {
  const file = workspaceOperationFile(runtimeWorkspaceDescriptor(binding), operation); assert.ok(file)
  const html = renderToStaticMarkup(createElement(FilePanel, { file, status: "READY", error: null, onOpen: () => {} }));
  for (const text of ["runtime-a", "workspace-a", "Binding v3", "read-receipt", "2026-09-23", "original bytes were not inspected"]) assert.ok(html.includes(text)); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/)
})
test("truncated read and unsupported results cannot be represented as complete files", () => {
  const v = { ...operation, state: "TRUNCATED" as const, receipt: { ...operation.receipt!, truncated: true } }; assert.equal(workspaceOperationFile(runtimeWorkspaceDescriptor(binding), v)?.truncated, true)
  assert.equal(workspaceOperationFile(runtimeWorkspaceDescriptor(binding), { ...operation, state: "UNSUPPORTED" }), null)
  assert.equal(workspaceOperationFile(runtimeWorkspaceDescriptor({ ...binding, version: 4 }), operation), null)
})
test("offline file viewer discards observed content and retains unavailable state", () => {
  const html = renderToStaticMarkup(createElement(RuntimeFileViewer, { binding, initial: operation, available: false, ensureConversation: async () => "conversation-a", onAnalyze: noop })); assert.match(html, /Offline/); assert.doesNotMatch(html, /source only|<pre|Ask Agent/)
})
test("reload revalidates saved identity without replaying a runtime operation", async () => {
  result = { activeWorkspaceId: binding.workspaceId, bindings: [binding] }; await getWorkspaceBindings(binding.projectId)
  result = binding; assert.deepEqual(await getRuntimeWorkspaceBinding(binding.projectId, { workspaceId: binding.workspaceId, bindingVersion: binding.version }), binding)
  result = { view: operation }; await getWorkspaceOperation(binding, "HELLO.md", operation); assert.ok(calls.every(c => c.method === "GET")); assert.match(calls[2].url, /operationId=operation-a/)
})
test("runtime binding can never use backend file/tree clients", () => {
  assert.throws(() => getWorkspaceFile(runtimeWorkspaceDescriptor(binding), "HELLO.md"), /approved runtime/); assert.throws(() => getWorkspaceTree(runtimeWorkspaceDescriptor(binding)), /approved runtime/); assert.equal(calls.length, 0)
})
