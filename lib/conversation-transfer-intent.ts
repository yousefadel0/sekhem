/** Explicit conversation handoff only. This never approves or dispatches a write. */
export function requestsAgentConversationTransfer(value: string): boolean {
  return /^(?:Continue in Agent|كمّل في وضع Agent|كمل في وضع Agent)[.!؟?\s]*$/i.test(value.trim())
}
