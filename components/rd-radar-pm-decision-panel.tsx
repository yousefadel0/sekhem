"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, Send, UserCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"

type PMDecisionValue = "approved" | "more_evidence_required" | "rejected"

type PMDecisionRecord = {
  id?: string
  candidateId?: string
  pmDecision?: PMDecisionValue | string
  decision?: PMDecisionValue | string
  status?: string
  pmDecisionReason?: string
  reason?: string
  approvedScopeIfAny?: string
  nextGate?: string
  createdAt?: string
  updatedAt?: string
  persistence?: boolean
}

type PMDecisionPayload =
  | PMDecisionRecord[]
  | {
      items?: PMDecisionRecord[]
      decisions?: PMDecisionRecord[]
      pmDecisions?: PMDecisionRecord[]
    }

type LoadState = "loading" | "live" | "fallback"
type SubmitState = "idle" | "submitting" | "success" | "failed"

const decisionLabels: Record<PMDecisionValue, string> = {
  approved: "Approve candidate",
  more_evidence_required: "Request more evidence",
  rejected: "Reject candidate"
}

function normalizeDecisionPayload(payload: PMDecisionPayload | null): PMDecisionRecord[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload?.items ?? payload?.decisions ?? payload?.pmDecisions ?? []
}

function displayDecision(value?: string): string {
  if (!value) {
    return "Pending review"
  }

  return customerSafeText(value.replace(/[-_]/g, " "))
}

function displayTimestamp(decision: PMDecisionRecord): string {
  const value = decision.updatedAt ?? decision.createdAt

  if (!value) {
    return "Timestamp pending"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export function RDRadarPMDecisionPanel({ candidateId, candidateTitle }: { candidateId: string; candidateTitle: string }) {
  const [state, setState] = useState<LoadState>("loading")
  const [decisions, setDecisions] = useState<PMDecisionRecord[]>([])
  const [selectedDecision, setSelectedDecision] = useState<PMDecisionValue>("approved")
  const [submitState, setSubmitState] = useState<SubmitState>("idle")

  const loadDecisions = useCallback(async () => {
    const payload = await fetchSekhemApi<PMDecisionPayload>(`/rd-radar/pm-decisions?candidateId=${encodeURIComponent(candidateId)}`)
    const normalized = normalizeDecisionPayload(payload)

    if (payload && normalized.length > 0) {
      setDecisions(normalized)
      setState("live")
      return
    }

    setDecisions([])
    setState("fallback")
  }, [candidateId])

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const payload = await fetchSekhemApi<PMDecisionPayload>(`/rd-radar/pm-decisions?candidateId=${encodeURIComponent(candidateId)}`)
      const normalized = normalizeDecisionPayload(payload)

      if (cancelled) {
        return
      }

      if (payload && normalized.length > 0) {
        setDecisions(normalized)
        setState("live")
        return
      }

      setDecisions([])
      setState("fallback")
    }

    setState("loading")
    void load()

    return () => {
      cancelled = true
    }
  }, [candidateId])

  const latestDecision = useMemo(() => decisions[0], [decisions])
  const isLive = state === "live"
  const sourceLabel = isLive ? "Live data" : state === "loading" ? "Checking live data" : "Sample view"

  async function submitDecision(): Promise<void> {
    setSubmitState("submitting")

    const response = await postSekhemApi<PMDecisionRecord, Record<string, unknown>>("/rd-radar/pm-decisions", {
      candidateId,
      decision: selectedDecision,
      decisionReason:
        selectedDecision === "approved"
          ? "PM approved candidate scope for controlled next-gate review."
          : selectedDecision === "more_evidence_required"
            ? "PM requires additional evidence before promotion."
            : "PM rejected candidate promotion at this gate.",
      approvedScopeIfAny: selectedDecision === "approved" ? "Controlled R&D Radar candidate review only" : "",
      nextGate: selectedDecision === "approved" ? "pm_approved_for_initiative_creation" : selectedDecision
    })

    if (!response) {
      setSubmitState("failed")
      return
    }

    setSubmitState("success")
    await loadDecisions()
  }

  return (
    <Card className={isLive ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={isLive ? "w-10 h-10 rounded-lg bg-success/20 border border-success/30 flex items-center justify-center shrink-0" : "w-10 h-10 rounded-lg bg-warning/20 border border-warning/30 flex items-center justify-center shrink-0"}>
              {isLive ? <ShieldCheck className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <CardTitle className={isLive ? "text-sm text-success" : "text-sm text-warning"}>
                PM Decision Gate
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Capture the human decision gate for the selected R&amp;D Radar candidate.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={isLive ? "border-success/30 text-success" : "border-warning/30 text-warning"}>
            {sourceLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/50 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Candidate</p>
          <p className="text-sm font-medium text-foreground">{candidateTitle}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Candidate ID: {candidateId}</p>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            Checking PM decision status...
          </div>
        )}

        {isLive && latestDecision && (
          <div className="rounded-lg border border-success/20 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {displayDecision(latestDecision.pmDecision ?? latestDecision.decision ?? latestDecision.status)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {customerSafeText(latestDecision.pmDecisionReason ?? latestDecision.reason, "PM decision is available for review.")}
                </p>
              </div>
              <Badge variant="outline" className="border-success/30 text-success shrink-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                Saved
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                PM decision visible
              </span>
              <span>{displayTimestamp(latestDecision)}</span>
              {latestDecision.nextGate && <span>Next gate: {displayDecision(latestDecision.nextGate)}</span>}
            </div>
          </div>
        )}

        {state === "fallback" && (
          <div className="rounded-lg border border-warning/20 bg-background/40 p-3">
            <p className="text-sm font-medium text-warning">No saved PM decision is available yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sample view is shown while live PM decision data is unavailable for this candidate.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.keys(decisionLabels) as PMDecisionValue[]).map((decision) => (
            <Button
              key={decision}
              type="button"
              variant={selectedDecision === decision ? "default" : "outline"}
              size="sm"
              className={selectedDecision === decision ? "bg-gold text-background hover:bg-gold/90" : "text-xs"}
              onClick={() => setSelectedDecision(decision)}
            >
              {decisionLabels[decision]}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">
            Decision submission is controlled and requires confirmation in this view.
          </p>
          <Button onClick={() => void submitDecision()} disabled={submitState === "submitting"} className="bg-gold text-background hover:bg-gold/90 shrink-0">
            <Send className="w-3 h-3 mr-1" />
            {submitState === "submitting" ? "Submitting..." : "Submit PM Decision"}
          </Button>
        </div>

        {submitState === "success" && <p className="text-xs text-success">PM decision submitted. Decision status refreshed.</p>}
        {submitState === "failed" && <p className="text-xs text-warning">PM decision submission was not accepted.</p>}
      </CardContent>
    </Card>
  )
}
