"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ConversationDetailDto } from "@/lib/sekhem-conversation"
import { runIsActive, workflowNeedsRefresh } from "@/lib/sekhem-agent"
import { conversationRunDetails, createConversationLoader, reconcileConversationSnapshot, selectConversationRun, snapshotDeliveryFailure } from "@/lib/conversation-restoration"
import { useAgentRunEvents } from "./useAgentRunEvents"
import { createSnapshotPoller, conversationSnapshotError } from "@/lib/snapshot-polling"

/** One persisted conversation snapshot supplies cards, inspector, messages and activity. */
export function useConversationRuns(conversationId: string | null, outstandingSubmission = false) {
  const [conversations, setConversations] = useState<Record<string, ConversationDetailDto | undefined>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const outstanding = useRef(outstandingSubmission)
  outstanding.current = outstandingSubmission
  const loader = useRef<ReturnType<typeof createConversationLoader> | null>(null)
  const polling = useRef<{ id: string; poller: ReturnType<typeof createSnapshotPoller> } | null>(null)
  if (!loader.current) loader.current = createConversationLoader()
  const conversation = conversationId ? conversations[conversationId] : undefined
  const history = conversation?.agentRuns ?? []
  const details = conversationRunDetails(conversation)
  const selectedId = selectConversationRun(history, conversationId ? selected[conversationId] : undefined)
  const selectedRun = details[selectedId]
  // Retain paused-run SSE for explicit resume elsewhere; it never supplies outcomes.
  // Terminal streams retain their existing drain/close semantics; snapshots cover isolated stages.
  // Retain the stream through its server drain, including a terminal snapshot.
  const streamId = selectedRun ? selectedId : ""
  const stream = useAgentRunEvents(streamId)

  const read = useCallback(async (id: string) => {
    setLoading(previous => ({ ...previous, [id]: true }))
    try {
      const snapshot = await loader.current!(id)
      if (!snapshot) return false
      setConversations(previous => ({ ...previous, [id]: reconcileConversationSnapshot(previous[id], snapshot) }))
      setErrors(previous => ({ ...previous, [id]: null }))
      setStale(previous => ({ ...previous, [id]: false }))
      setLoading(previous => ({ ...previous, [id]: false }))
      return outstanding.current || snapshot.agentRuns.some(run => workflowNeedsRefresh(run))
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error instanceof Error ? error.message : "Run state unavailable" }))
      setStale(previous => ({ ...previous, [id]: true }))
      setConversations(previous => ({ ...previous, [id]: snapshotDeliveryFailure(previous[id]).snapshot }))
      setLoading(previous => ({ ...previous, [id]: false }))
      throw error
    }
  }, [])
  const refresh = useCallback(async (id: string) => {
    if (polling.current?.id === id) await polling.current.poller.refresh({ afterPending: true })
    else await read(id).catch(() => {}) // The read path records the error; never dispatches work.
  }, [read])

  const select = useCallback((id: string, runId: string) => {
    setSelected(previous => ({ ...previous, [id]: runId }))
  }, [])
  const accept = useCallback((id: string, runId: string) => { select(id, runId); void refresh(id) }, [select, refresh])
  useEffect(() => {
    if (!conversationId) return
    const poller = createSnapshotPoller({ read: () => read(conversationId), intervalMs: 5000,
      onError: (error, stopped) => setErrors(previous => ({ ...previous, [conversationId]: conversationSnapshotError(error, stopped) })) })
    polling.current = { id: conversationId, poller }; void poller.refresh()
    return () => { poller.stop(); polling.current = null }
  }, [conversationId, read])

  const latest = stream.events.at(-1)
  useEffect(() => {
    if (conversationId && outstandingSubmission) void polling.current?.poller.refresh()
  }, [conversationId, outstandingSubmission])
  useEffect(() => {
    if (conversationId && latest?.agentRunId === selectedId) void polling.current?.poller.check()
  }, [latest?.id, conversationId, selectedId, refresh])

  return { history, details, selectedId, selectedRun, select, accept, refresh, conversation,
    events: selectedRun?.activity ?? [], error: conversationId ? errors[conversationId] : null,
    isLoading: Boolean(conversationId && loading[conversationId]),
    isStale: Boolean(conversationId && stale[conversationId]),
    streamStatus: !selectedId ? "IDLE" : !streamId ? "CLOSED" : stream.error ? "DISCONNECTED" : stream.isLoading ? "CONNECTING" : "LIVE" }
}
