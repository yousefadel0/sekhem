export function sourceSaveNotice(error: unknown): string {
  const code = error instanceof Error ? error.message : ""
  if (code === "AGENT_CONVERSATION_REQUIRED") return "Workspace work has not been activated in this conversation. Your local draft is retained; no workspace write occurred. Continue the workspace task in this conversation, then review the exact proposal and approval controls."
  return code || "Proposal unavailable; draft retained"
}
