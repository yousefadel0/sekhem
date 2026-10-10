"use client"
import { useEffect, useState } from "react"
import { restoredWorkspaceSurface } from "./conversation-restoration"

/** Stores only a layout preference. Never persists conversation data or authority. */
export function useWorkspaceSurface() {
  const [surface, setSurface] = useState<"workspace" | "agent" | "chat">("workspace")
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try { setSurface(restoredWorkspaceSurface(sessionStorage.getItem("sekhem.workspace.surface"))) }
    catch { /* Layout storage is optional. */ }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try { sessionStorage.setItem("sekhem.workspace.surface", surface) }
    catch { /* Layout storage cannot block a conversation. */ }
  }, [surface, restored])
  return [surface, setSurface] as const
}
