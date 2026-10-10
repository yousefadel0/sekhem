"use client"
import { useEffect, useRef, useState } from "react"
import { postSekhemApi } from "@/lib/sekhem-api"
import type { EngineeringPlanIdentity } from "@/lib/sekhem-agent"

/** Explicit execution controls; snapshots/history never call this endpoint. */
export function PlanExecutionApproval({ conversationId, plan, disabled, delegationEligible, onChanged, approvalMode = "MANUAL" }: {
  approvalMode?: "MANUAL" | "TASK";
  conversationId: string; plan: EngineeringPlanIdentity; disabled: boolean; delegationEligible: boolean; onChanged?: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const lock = useRef(false), request = useRef<string | null>(null), current = useRef(""), mounted = useRef(true)
  const key = `${conversationId}:${plan.planId}:${plan.planVersion}:${plan.digest}`
  current.current = key
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { request.current = null; setError(null) }, [key])
  async function approve(mode: "ACTION" | "TASK") {
    if (disabled || lock.current || error || mode === "TASK" && !delegationEligible) return
    lock.current = true; setBusy(true)
    request.current ??= `workflow-${crypto.randomUUID()}`
    try {
      const result = await postSekhemApi<import("@/backend/src/agent-runtime/execution/plan-execution-state").PlanExecutionView, Record<string, unknown>>(`/conversations/${encodeURIComponent(conversationId)}/plans/approve-execution`, {
        planId: plan.planId, planVersion: plan.planVersion, planDigest: plan.digest, requestId: request.current, mode
      }, { throwOnError: true })
      if (!result || result.planId !== plan.planId || result.planVersion !== plan.planVersion) throw new Error("Execution state unavailable")
    } catch {
      if (mounted.current && current.current === key) setError("Execution could not be confirmed. Review the saved workflow state; do not repeat the change.")
    } finally {
      if (mounted.current && current.current === key) {
        try { await onChanged?.() } catch { setError("Saved state unavailable. Refresh before continuing.") }
        setBusy(false)
      }
      lock.current = false
    }
  }
  async function decide(decision: "REJECT" | "SKIP") {
    if (disabled || lock.current || error) return
    const source = key; lock.current = true; setBusy(true)
    request.current ??= `workflow-${crypto.randomUUID()}`
    try {
      await postSekhemApi(`/conversations/${encodeURIComponent(conversationId)}/plans/decision`, {
        planId: plan.planId, planVersion: plan.planVersion, planDigest: plan.digest, requestId: request.current, decision
      }, { throwOnError: true })
    } catch { if (mounted.current && current.current === source) setError("Decision could not be confirmed. Refresh saved state before continuing.") }
    finally {
      if (mounted.current && current.current === source) { try { await onChanged?.() } catch { setError("Saved state unavailable.") } setBusy(false) }
      lock.current = false
    }
  }
  return <section aria-label="Approve plan execution" className="space-y-2 text-sm">
    <div className="flex gap-2 flex-wrap">
      <button type="button" disabled={disabled || busy || !!error || approvalMode === "TASK" && !delegationEligible} onClick={() => void approve(approvalMode === "TASK" ? "TASK" : "ACTION")}>{busy ? "Recording authorization…" : approvalMode === "TASK" ? "Approve for Me" : "Approve"}</button>
      <button type="button" disabled={disabled || busy || !!error} onClick={() => void decide("REJECT")}>Reject</button>
      <button type="button" disabled={disabled || busy || !!error} onClick={() => void decide("SKIP")}>Skip</button>
    </div>
    <p className="text-xs text-muted-foreground">Approve starts this exact change after server validation. Approve for Me continues only eligible steps in this plan, for up to 15 minutes. New or high-impact actions require fresh approval. Neither grants file access.</p>
    {!delegationEligible && <p className="text-xs">Delegated approval is unavailable for this plan; commands and unsupported effects require individual approval.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
