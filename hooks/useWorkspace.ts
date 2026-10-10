"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getWorkspace, getWorkspaceBindings, getRuntimeWorkspaceBinding, runtimeWorkspaceDescriptor, type WorkspaceBinding, type RuntimeWorkspaceReference } from "@/lib/sekhem-agent"
import { createSnapshotPoller, snapshotFailure } from "@/lib/snapshot-polling"
export function useWorkspace(projectId: string | null, reference?: RuntimeWorkspaceReference) {
  const [binding, setBinding] = useState<WorkspaceBinding | null>(null), [status, setStatus] = useState("Loading"), [error, setError] = useState<string | null>(null)
  // Retain the historical descriptor for display; expose the active one separately for explicit recovery.
  const [activeBinding, setActiveBinding] = useState<WorkspaceBinding | null>(null)
  const generation = useRef(0)
  const polling = useRef<ReturnType<typeof createSnapshotPoller> | null>(null)
  const read = useCallback(async () => {
    const sequence = ++generation.current
    if (!projectId) { setBinding(null); setActiveBinding(null); setStatus("Unavailable"); return false }
    try {
      const list = await getWorkspaceBindings(projectId)
      if (!list) throw new Error("Workspace bindings unavailable")
      const runtime = reference
        ? list.bindings.find(b => b.workspaceId === reference.workspaceId && b.version === reference.bindingVersion) ?? await getRuntimeWorkspaceBinding(projectId, reference)
        : list.bindings.find(b => b.workspaceId === list.activeWorkspaceId)
      if (reference && !runtime) throw new Error("Saved runtime Workspace unavailable")
      const value = runtime ? runtimeWorkspaceDescriptor(runtime) : await getWorkspace(projectId)
      if (sequence !== generation.current) return
      const active = list.bindings.find(b => b.workspaceId === list.activeWorkspaceId)
      setActiveBinding(active ? runtimeWorkspaceDescriptor(active) : null)
      setBinding(value ?? null); setStatus(runtime && list.activeWorkspaceId !== runtime.workspaceId ? "STALE" : runtime?.status ?? (value ? "Available" : "Unavailable")); setError(null)
    } catch (failure) {
      if (sequence !== generation.current) return
      setActiveBinding(null)
      const failureState = snapshotFailure(failure)
      setStatus(failureState.status); setError(failureState.message)
      throw failure
    }
  }, [projectId, reference?.workspaceId, reference?.bindingVersion])
  const refresh = useCallback(async () => { await polling.current?.refresh() }, [])
  useEffect(() => {
    setBinding(null); setStatus("Loading")
    const poller = createSnapshotPoller({ read, intervalMs: 5000, onError: (failure, stopped) => setError(`${snapshotFailure(failure).message}${stopped ? " Automatic refresh paused. Use Refresh after resolving the issue." : " Retrying temporarily."}`) })
    polling.current = poller; void poller.refresh()
    return () => { generation.current++; poller.stop() }
  }, [read])
  const matches = binding?.projectId === projectId && (!reference || binding.id === reference.workspaceId && binding.version === String(reference.bindingVersion))
  return { binding: matches ? binding : null, activeBinding: activeBinding?.projectId === projectId ? activeBinding : null,
    status: binding && !matches ? "Loading" : status, error, refresh }
}
