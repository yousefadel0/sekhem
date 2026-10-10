"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle, Clock, Database, Send, ShieldCheck, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"

type ReviewerDecision = "accepted" | "needs_follow_up" | "rejected"

type EvidenceReviewRecord = {
  id?: string
  evidenceId?: string
  sourceId?: string
  relevanceScore?: number
  credibilityScore?: number
  riskScore?: number
  reviewerDecision?: ReviewerDecision | string
  reviewerNotes?: string
  createdAt?: string
  updatedAt?: string
  persistence?: boolean
  candidateId?: string | null
}

type EvidenceReviewPayload =
  | EvidenceReviewRecord[]
  | {
      items?: EvidenceReviewRecord[]
      reviews?: EvidenceReviewRecord[]
      evidenceReviews?: EvidenceReviewRecord[]
    }

type EvidenceRecord = {
  id?: string
  sourceId?: string
  title?: string
}

type EvidencePayload =
  | EvidenceRecord[]
  | {
      evidence?: EvidenceRecord[]
      items?: EvidenceRecord[]
    }

type CreateEvidenceReviewResponse = {
  accepted?: boolean
  persistence?: boolean
  review?: EvidenceReviewRecord
}

type LoadState = "loading" | "live" | "fallback"
type SubmitState = "idle" | "submitting" | "success" | "failed"

const reviewerDecisionLabels: Record<ReviewerDecision, string> = {
  accepted: "Accept evidence",
  needs_follow_up: "Needs follow-up",
  rejected: "Reject evidence"
}

function normalizeEvidenceReviews(payload: EvidenceReviewPayload | null): EvidenceReviewRecord[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload?.items ?? payload?.reviews ?? payload?.evidenceReviews ?? []
}

function normalizeEvidence(payload: EvidencePayload | null): EvidenceRecord[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload?.evidence ?? payload?.items ?? []
}

function displayDecision(value?: string): string {
  return customerSafeText(value ? value.replace(/[-_]/g, " ") : "reviewed")
}

function displayTimestamp(review: EvidenceReviewRecord): string {
  const value = review.updatedAt ?? review.createdAt

  if (!value) {
    return "Timestamp pending"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function ScorePill({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{typeof value === "number" ? value : "N/A"}</p>
    </div>
  )
}

export function RDRadarEvidenceReviewPanel({ candidateId }: { candidateId: string | null }) {
  const [state, setState] = useState<LoadState>("loading")
  const [reviews, setReviews] = useState<EvidenceReviewRecord[]>([])
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceRecord | null>(null)
  const [reviewerDecision, setReviewerDecision] = useState<ReviewerDecision>("accepted")
  const [submitState, setSubmitState] = useState<SubmitState>("idle")

  const loadReviews = useCallback(async () => {
    const payload = await fetchSekhemApi<EvidenceReviewPayload>("/rd-radar/evidence-reviews")
    const normalized = normalizeEvidenceReviews(payload)

    if (payload && normalized.length > 0) {
      setReviews(normalized)
      setState("live")
      return
    }

    setReviews([])
    setState("fallback")
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const [payload, evidencePayload] = await Promise.all([
        fetchSekhemApi<EvidenceReviewPayload>("/rd-radar/evidence-reviews"),
        fetchSekhemApi<EvidencePayload>("/rd-radar/evidence")
      ])
      const normalized = normalizeEvidenceReviews(payload)
      const evidence = normalizeEvidence(evidencePayload)

      if (cancelled) {
        return
      }

      setEvidenceTarget(evidence.find((item) => item.id || item.sourceId) ?? null)

      if (payload && normalized.length > 0) {
        setReviews(normalized)
        setState("live")
        return
      }

      setReviews([])
      setState("fallback")
    }

    setState("loading")
    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const latestReview = useMemo(() => reviews[0], [reviews])
  const isLive = state === "live"
  const sourceLabel = isLive ? "Live data" : state === "loading" ? "Checking live data" : "Sample view"
  const canSubmit = Boolean(isLive && candidateId && (evidenceTarget?.id || evidenceTarget?.sourceId))

  async function submitReview(): Promise<void> {
    if (!candidateId || (!evidenceTarget?.id && !evidenceTarget?.sourceId)) {
      setSubmitState("failed")
      return
    }

    setSubmitState("submitting")

    const response = await postSekhemApi<CreateEvidenceReviewResponse, Record<string, unknown>>("/rd-radar/evidence-reviews", {
      candidateId,
      ...(evidenceTarget.id ? { evidenceId: evidenceTarget.id } : {}),
      ...(evidenceTarget.sourceId ? { sourceId: evidenceTarget.sourceId } : {}),
      relevanceScore: reviewerDecision === "accepted" ? 5 : reviewerDecision === "needs_follow_up" ? 3 : 1,
      credibilityScore: reviewerDecision === "rejected" ? 2 : 5,
      riskScore: reviewerDecision === "accepted" ? 1 : reviewerDecision === "needs_follow_up" ? 3 : 5,
      reviewerDecision,
      reviewerNotes:
        reviewerDecision === "accepted"
          ? "Evidence is credible and relevant for continued R&D Radar review."
          : reviewerDecision === "needs_follow_up"
            ? "Evidence requires additional source confirmation before promotion."
            : "Evidence is not strong enough for promotion at this stage."
    })

    if (!response?.accepted || !response.persistence || !response.review) {
      setSubmitState("failed")
      return
    }

    setSubmitState("success")
    await loadReviews()
  }

  return (
    <Card className={isLive ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={isLive ? "w-10 h-10 rounded-lg bg-success/20 border border-success/30 flex items-center justify-center shrink-0" : "w-10 h-10 rounded-lg bg-warning/20 border border-warning/30 flex items-center justify-center shrink-0"}>
              {isLive ? <Database className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <CardTitle className={isLive ? "text-sm text-success" : "text-sm text-warning"}>
                Evidence Review
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Review evidence quality and supporting context before moving forward.
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
          <p className="text-xs text-muted-foreground">Review mode</p>
          <p className="text-sm font-medium text-foreground">General Evidence Review</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Evidence reviews are shown at a general level in this view.
          </p>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            Checking evidence reviews...
          </div>
        )}

        {isLive && latestReview && (
          <div className="rounded-lg border border-success/20 bg-background/40 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {displayDecision(latestReview.reviewerDecision)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {customerSafeText(latestReview.reviewerNotes, "Evidence review is available.")}
                </p>
              </div>
              <Badge variant="outline" className="border-success/30 text-success shrink-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                Saved
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ScorePill label="Relevance" value={latestReview.relevanceScore} />
              <ScorePill label="Credibility" value={latestReview.credibilityScore} />
              <ScorePill label="Risk" value={latestReview.riskScore} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                General Evidence Review visible
              </span>
              <span>ID: {customerSafeText(latestReview.id, "available")}</span>
              <span>{displayTimestamp(latestReview)}</span>
            </div>
          </div>
        )}

        {state === "fallback" && (
          <div className="rounded-lg border border-warning/20 bg-background/40 p-3">
            <p className="text-sm font-medium text-warning">No saved evidence reviews are available yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sample view is shown while live evidence review data is unavailable.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.keys(reviewerDecisionLabels) as ReviewerDecision[]).map((decision) => (
            <Button
              key={decision}
              type="button"
              variant={reviewerDecision === decision ? "default" : "outline"}
              size="sm"
              className={reviewerDecision === decision ? "bg-gold text-background hover:bg-gold/90" : "text-xs"}
              onClick={() => setReviewerDecision(decision)}
              disabled={!isLive}
            >
              <Star className="w-3 h-3 mr-1" />
              {reviewerDecisionLabels[decision]}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">
            This action records a general evidence review for this view.
          </p>
          <Button onClick={() => void submitReview()} disabled={submitState === "submitting" || !canSubmit} className="bg-gold text-background hover:bg-gold/90 shrink-0">
            <Send className="w-3 h-3 mr-1" />
            {submitState === "submitting" ? "Submitting..." : "Submit Evidence Review"}
          </Button>
        </div>

        {submitState === "success" && <p className="text-xs text-success">Evidence review submitted. General review refreshed.</p>}
        {submitState === "failed" && <p className="text-xs text-warning">Evidence review submission was not accepted.</p>}
      </CardContent>
    </Card>
  )
}
