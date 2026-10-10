/** Composer state only; submitted history and workflow state are never modified. */
export function clearSubmittedDraft(drafts: Record<string, string>, conversationId: string, newChatKey: string, originKey: string): Record<string, string> {
  return { ...drafts, [conversationId]: "", ...(originKey === newChatKey ? { [newChatKey]: "" } : {}) };
}
export function freshConversationDraft(drafts: Record<string, string>, previousKey: string, text: string, newChatKey: string): Record<string, string> {
  return { ...drafts, [previousKey]: text, [newChatKey]: "" };
}
