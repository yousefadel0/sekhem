"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSekhemApi } from "@/lib/sekhem-api"
import { createSnapshotPoller, snapshotFailure } from "@/lib/snapshot-polling"
import { emptyRuntimeInventory, workspaceRuntimeState, type RuntimeInventory, type RuntimeDeviceSummary } from "@/lib/workspace-runtime-status"
import type { RuntimeGrant } from "@/backend/src/trusted-runtime/runtime.contract"
import type { RuntimeWorkspaceBinding } from "@/lib/sekhem-agent"
import { getRuntimeCapabilityEnrollment } from "@/lib/sekhem-agent"

/** One inventory poll shared by the navbar, Explorer and Runtime panel. */
export function useWorkspaceRuntime(projectId: string | null, binding: RuntimeWorkspaceBinding | undefined, status: string) {
  const [inventory, setInventory] = useState<RuntimeInventory>(emptyRuntimeInventory)
  const [now, setNow] = useState(Date.now)
  const generation = useRef(0)
  const polling = useRef<ReturnType<typeof createSnapshotPoller> | null>(null)
  const read = useCallback(async () => {
    const sequence = ++generation.current
    let configurationReady = false
    if (!projectId) { setInventory({ devices: [], grants: [], loading: false, error: null }); return false }
    try {
      const [deviceResult, grantResult] = await Promise.allSettled([
        fetchSekhemApi<{ devices: RuntimeDeviceSummary[] }>("/trusted-runtime/devices", { throwOnError: true }),
        fetchSekhemApi<RuntimeGrant[]>("/trusted-runtime/grants", { throwOnError: true }),
      ])
      if (deviceResult.status === "rejected") throw deviceResult.reason
      const devices = deviceResult.value
      if (!devices) throw new Error("Runtime identity unavailable")
      const grantError = grantResult.status === "rejected" ? grantResult.reason : !grantResult.value ? new Error("Runtime access unavailable") : null
      const grants = grantResult.status === "fulfilled" ? grantResult.value : null
      const results = await Promise.allSettled(devices.devices.filter(d => d.status === "ACTIVE").map(async d => ({ runtimeId: d.runtimeId, enrollment: await getRuntimeCapabilityEnrollment(d.runtimeId, projectId) })))
      const activeDevices = devices.devices.filter(d => d.status === "ACTIVE")
      const enrollments = results.flatMap(r => r.status === "fulfilled" && r.value.enrollment ? [r.value.enrollment] : [])
      const enrollmentErrors = Object.fromEntries(results.flatMap((r, i) => r.status === "rejected" ? [[activeDevices[i].runtimeId, "Capability configuration unavailable"]] : []))
      if (sequence === generation.current) { setInventory(previous => ({ devices: devices.devices, grants: grants ?? previous.grants, enrollments, enrollmentErrors, loading: false, configurationError: null,
        error: grantError ? (grantError instanceof Error ? grantError.message : "Runtime access unavailable") : null,
        authenticationRequired: (grantError as { status?: number } | null)?.status === 401 })); setNow(Date.now()) }
      configurationReady = true
      // Operational access stays unavailable; configuration has its own fresh identity snapshot.
      if (grantError) throw grantError
    } catch (error) {
      if (sequence === generation.current) { setInventory(previous => ({ ...previous, loading: false,
        configurationError: configurationReady && (error as { status?: number }).status !== 401 ? null : error instanceof Error ? error.message : "Runtime identity unavailable",
        error: error instanceof Error ? error.message : "Runtime status unavailable", authenticationRequired: (error as { status?: number }).status === 401 })); setNow(Date.now()) }
      throw error
    }
  }, [projectId])
  const refresh = useCallback(async () => { await polling.current?.refresh() }, [])
  useEffect(() => {
    setInventory(emptyRuntimeInventory)
    const poller = createSnapshotPoller({ read, intervalMs: 15000, onError: (error, stopped) => setInventory(previous => ({ ...previous,
      error: `${snapshotFailure(error).message}${stopped ? " Automatic refresh paused. Refresh after resolving the issue." : " Retrying temporarily."}` })) })
    polling.current = poller; void poller.refresh()
    return () => { generation.current++; poller.stop() }
  }, [read])
  return { inventory, state: workspaceRuntimeState(projectId, binding, status, inventory, Math.max(now, Date.now())), refresh }
}
