import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { RuntimeEvidenceReference } from "../workspace-intelligence/workspace-runtime.contract";

export type ConversationMode = "CHAT" | "AGENT" | "AUTOMATION";
export interface ConversationModeContext {
  version: 1;
  mode: ConversationMode;
  organizationId: string;
  workspace: { workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string } | null;
  source?: { conversationId: string; messageId: string; contextMessageIds: string[]; evidence: RuntimeEvidenceReference[] };
}
export function parseConversationMode(value: unknown): ConversationMode {
  if (!["CHAT", "AGENT", "AUTOMATION"].includes(String(value))) throw new BadRequestException("CONVERSATION_MODE_INVALID");
  return value as ConversationMode;
}
/** Old conversations remain readable, and default to the least privileged mode. */
export function modeContext(conversation: any): ConversationModeContext | undefined {
  const context = conversation?.metadata?.modeContext;
  if (context === undefined) return;
  if (context?.version !== 1) throw new BadRequestException("CONVERSATION_MODE_INVALID");
  parseConversationMode(context.mode);
  return context;
}
export function conversationMode(conversation: any): ConversationMode { return modeContext(conversation)?.mode ?? "CHAT"; }
export function assertConversationTool(conversation: any, toolId: string) {
  const mode = conversationMode(conversation);
  if (mode === "AUTOMATION" || (mode === "CHAT" && !["filesystem.list", "filesystem.search", "filesystem.read"].includes(toolId))) {
    throw new ForbiddenException(mode === "AUTOMATION" ? "AUTOMATION_NOT_ENABLED" : "AGENT_CONVERSATION_REQUIRED");
  }
}
export function assertConversationBinding(conversation: any, binding: any) {
  const context = modeContext(conversation);
  if (!context) return; // Existing inspection authority still validates legacy bindings.
  const expected = context.workspace;
  if (!expected || !binding || context.organizationId !== binding.organizationId || conversation.userId !== binding.userId || conversation.projectId !== binding.projectId ||
    expected.workspaceId !== binding.workspaceId || expected.bindingVersion !== binding.version || expected.runtimeId !== binding.runtimeId || expected.runtimeFingerprint !== binding.runtimeFingerprint) {
    throw new ConflictException("CONVERSATION_WORKSPACE_CHANGED");
  }
}
export { requestsConversationExecution, requestsConversationPlan, requestsPlanHandoff, requestsUnderstandingFollowup } from "./conversation-intent";
export function protectedConversationMetadata(metadata: Record<string, unknown> = {}) {
  if (["modeContext", "conversationMode", "sourceConversationId", "sourceMessageId", "historicalContext", "historicalContextView"].some(key => key in metadata)) throw new BadRequestException("CONVERSATION_METADATA_SERVER_OWNED");
  if ("approvalMode" in metadata && !["MANUAL", "TASK"].includes(String(metadata.approvalMode))) throw new BadRequestException("CONVERSATION_APPROVAL_MODE_INVALID");
  return metadata;
}
/** Resolve only a server-persisted relationship; references retain their source conversation. */
export async function transferredConversation(tx: any, conversation: any) {
  const context = modeContext(conversation), source = context?.source;
  if (!source) return null;
  const parent = await tx.conversation.findUnique({ where: { id: source.conversationId } });
  const message = await tx.conversationMessage.findUnique({ where: { id: source.messageId } });
  if (context?.mode !== "AGENT" || !parent || parent.userId !== conversation.userId || parent.projectId !== conversation.projectId ||
    modeContext(parent)?.organizationId !== context.organizationId || JSON.stringify(modeContext(parent)?.workspace) !== JSON.stringify(context.workspace) ||
    !message || message.conversationId !== parent.id || message.senderId !== conversation.userId || message.senderType !== "user" || message.metadata?.agentConversationId !== conversation.id) {
    throw new ForbiddenException("CONVERSATION_TRANSFER_INVALID");
  }
  return { parent, source };
}
