import { postSekhemApi } from "./sekhem-api"
import type { RuntimeWorkspaceBinding, WorkspaceOperationView } from "./sekhem-agent"
import type { RuntimeProposal } from "@/backend/src/trusted-runtime/runtime.contract"

export async function prepareEditorSave(binding: RuntimeWorkspaceBinding, view: WorkspaceOperationView, conversationId: string, original: string, draft: string, requestId: string) {
  const r = view.receipt, op = view.operation
  if (binding.status !== "READY" || view.state !== "READY" || !r || r.truncated || !view.file || view.file.text !== original ||
    op.tool !== "filesystem.read" || op.conversationId !== conversationId || op.projectId !== binding.projectId || op.runtimeId !== binding.runtimeId ||
    r.workspaceId !== binding.workspaceId || r.bindingVersion !== binding.version || r.runtimeId !== binding.runtimeId || r.relativePath !== op.relativePath ||
    !op.absolutePath.startsWith(binding.rootPath.replace(/[\\/]+$/, "") + "\\")) throw new Error("A current complete verified source in this conversation is required")
  if (draft === original || new TextEncoder().encode(draft).length > 22528 || draft.includes("\0")) throw new Error("No change or content exceeds the existing conditional-write limit")
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(original)))].map(n => n.toString(16).padStart(2, "0")).join("")
  // Save/Review is an explicit workspace-work request, never execution approval.
  // Activate through the authenticated conversation owner; do not bypass tool guards.
  const handoff = await postSekhemApi<{ kind: string; conversationId: string; agentConversationId: string }, Record<string, unknown>>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    content: `Prepare the local editor change for review: ${op.relativePath}. Do not execute.`,
    transferToAgent: true, metadata: { clientMessageId: `editor_${requestId}` },
  }, { throwOnError: true })
  if (handoff?.kind !== "AGENT_TRANSFER" || handoff.conversationId !== conversationId || handoff.agentConversationId !== conversationId) throw new Error("Workspace task activation unavailable; draft retained")
  const result = await postSekhemApi<{ runId: string; proposal: RuntimeProposal }, Record<string, unknown>>("/trusted-runtime/proposals", {
    conversationId, projectId: binding.projectId, runtimeId: binding.runtimeId, tool: "filesystem.write",
    input: { path: op.absolutePath, content: draft, expectedSha256: hash }, purpose: `Editor save for review: ${op.relativePath}`, requestId,
  }, { throwOnError: true })
  if (!result?.runId || result.proposal?.toolId !== "filesystem.write" || result.proposal.validatedInput.content !== draft || result.proposal.validatedInput.expectedSha256 !== hash) throw new Error("Exact save proposal unavailable; refresh before continuing")
  return result
}
export function editorReadBackMatches(view: WorkspaceOperationView, binding: RuntimeWorkspaceBinding, path: string, expected: string, oldReceipt: string) {
  return view.state === "READY" && !!view.receipt && !view.receipt.truncated && view.receipt.receiptId !== oldReceipt &&
    binding.status === "READY" && view.operation.tool === "filesystem.read" && view.operation.projectId === binding.projectId && view.operation.runtimeId === binding.runtimeId &&
    view.receipt.workspaceId === binding.workspaceId && view.receipt.bindingVersion === binding.version && view.receipt.runtimeId === binding.runtimeId &&
    view.receipt.relativePath === path && view.operation.relativePath === path && view.file?.text === expected
}
