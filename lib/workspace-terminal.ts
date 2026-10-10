import { postSekhemApi } from "./sekhem-api"
import type { RuntimeProposal } from "../backend/src/trusted-runtime/runtime.contract"

export function terminalCommand(proposal: RuntimeProposal) {
  const input = proposal.validatedInput
  const args = Array.isArray(input.args) ? input.args.map(String) : []
  return String(input.executable).toLowerCase() === "powershell.exe" && args.length === 4 && args[2] === "-Command"
    ? args[3] : [String(input.executable), ...args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg)].join(" ")
}
export function terminalInScope(proposal: RuntimeProposal, conversationId: string | null, cwd?: string, runtimeId?: string) {
  return proposal.toolId === "terminal.execute" && proposal.conversationId === conversationId && proposal.runtimeId === runtimeId && proposal.validatedInput.cwd === cwd
}

/** A single reviewed PowerShell invocation, never an interactive session. */
export function terminalMessage(command: string, requestId: string) {
  if (!command.trim() || command.length > 2048 || command.includes("\0")) throw new Error("Enter a command of at most 2048 characters.")
  return { content: `Terminal command for review: ${command}`, metadata: { clientMessageId: requestId },
    terminalAction: { executable: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", command], timeoutMs: 30000 } }
}
export async function proposeTerminalCommand(conversationId: string, command: string, requestId: string) {
  return postSekhemApi<{ agentRunId: string; status: string }, ReturnType<typeof terminalMessage>>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`, terminalMessage(command, requestId), { throwOnError: true })
}
