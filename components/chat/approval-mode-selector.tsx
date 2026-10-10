"use client"
import { useEffect, useRef, useState } from "react"
import { updateConversation } from "@/lib/sekhem-conversation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
export type ConversationApprovalMode = "MANUAL" | "TASK"
/** Persisted preference only. Selecting a mode never requests consent or execution. */
export function ApprovalModeSelector({ conversationId, mode, disabled, onChanged }: {
  conversationId?: string | null; mode?: unknown; disabled?: boolean; onChanged?: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const origin = useRef(conversationId), mounted = useRef(true), lock = useRef(false)
  origin.current = conversationId
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const value = mode === "TASK" ? "TASK" : "MANUAL"
  async function change(next: ConversationApprovalMode) {
    if (!conversationId || disabled || lock.current) return
    const id = conversationId; lock.current = true; setBusy(true); setError(false)
    try {
      await updateConversation(id, { metadata: { approvalMode: next } }, { throwOnError: true })
      if (mounted.current && origin.current === id) await onChanged?.()
    } catch { if (mounted.current && origin.current === id) setError(true) }
    finally { lock.current = false; if (mounted.current && origin.current === id) setBusy(false) }
  }
  return <div className="approval-mode-control text-xs" aria-label="Conversation approval mode">
    <Select value={value} disabled={!conversationId || disabled || busy} onValueChange={next => void change(next as ConversationApprovalMode)}>
      <SelectTrigger size="sm" className="approval-mode-trigger" aria-label="Approval mode" title="Preference only; explicit approval and current access are still required"><SelectValue>{value === "TASK" ? "Approve for Me" : "Manual Approval"}</SelectValue></SelectTrigger>
      <SelectContent className="approval-mode-menu" side="top" align="end">
        <SelectItem value="MANUAL">Manual Approval</SelectItem><SelectItem value="TASK">Approve for Me</SelectItem>
      </SelectContent>
    </Select>
    {error && <span role="alert">Mode could not be saved. Refresh before approving.</span>}
  </div>
}
