"use client"

import { useEffect, useState } from "react"
import type { ElementType } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Eye, FileText, Lightbulb, Plus, Radar, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi } from "@/lib/sekhem-api"
import { cn } from "@/lib/utils"
import { RDRadarLiveAnalysisPanel } from "@/components/rd-radar-live-analysis-panel"

type DataState = "loading" | "live" | "missing"
type Gate = "PM_REVIEW_REQUIRED" | "REVIEW_REQUIRED" | "BLOCKED" | "READY"

type RadarStatus = {
  radarStatus?: string
  evidenceCount?: number
  candidateCount?: number
  workflowRunCount?: number
  nextGate?: string
  forbiddenActionsObserved?: boolean
}

type EvidenceItem = {
  id: string
  title?: string
  sourceUrl?: string | null
  sanitizedFinding?: string
  collectionStatus?: string
  reviewerDecision?: string
}

type EvidencePayload = {
  evidence?: EvidenceItem[]
}

type Candidate = {
  candidateId: string
  title?: string
  status?: string
  problemStatement?: string
  evidenceSummary?: string
  expectedBusinessValue?: string
  requiredAdditionalEvidence?: string[]
  nextGate?: string
  requiresPMApproval?: boolean
  createdAsDraftOnly?: boolean
}

type CandidatePayload = Candidate[] | { items?: Candidate[]; candidates?: Candidate[] }

type PMDecision = {
  id: string
  candidateId: string
  decision?: string
  decisionReason?: string
  nextGate?: string
}

type PMDecisionPayload = PMDecision[] | { items?: PMDecision[]; decisions?: PMDecision[] }

const metricToneClasses = {
  gold: "text-gold",
  cyan: "text-cyan",
  destructive: "text-destructive",
  warning: "text-warning",
  success: "text-success",
}

const labelTone: Record<string, string> = {
  PASS: "border-success/30 text-success bg-success/5",
  FIX: "border-warning/30 text-warning bg-warning/5",
  BLOCKED: "border-destructive/30 text-destructive bg-destructive/5",
  REVIEW_REQUIRED: "border-gold/30 text-gold bg-gold/5",
  PM_REVIEW_REQUIRED: "border-gold/30 text-gold bg-gold/5",
  READY: "border-success/30 text-success bg-success/5",
  Live: "border-success/30 text-success bg-success/5",
  Loading: "border-info/30 text-info bg-info/5",
  Missing: "border-warning/30 text-warning bg-warning/5",
  available: "border-success/30 text-success bg-success/5",
  missing: "border-warning/30 text-warning bg-warning/5",
  draft: "border-info/30 text-info bg-info/5",
  ready: "border-success/30 text-success bg-success/5",
  blocked: "border-destructive/30 text-destructive bg-destructive/5",
}

function normalizeCandidates(payload: CandidatePayload | null): Candidate[] {
  if (Array.isArray(payload)) return payload
  return payload?.items ?? payload?.candidates ?? []
}

function normalizeDecisions(payload: PMDecisionPayload | null): PMDecision[] {
  if (Array.isArray(payload)) return payload
  return payload?.items ?? payload?.decisions ?? []
}

function displayState(state: DataState): "Live" | "Loading" | "Missing" {
  if (state === "live") return "Live"
  if (state === "missing") return "Missing"
  return "Loading"
}

function normalizeGate(value?: string, blocked?: boolean): Gate {
  if (blocked) return "BLOCKED"
  const gate = String(value ?? "").toUpperCase()
  if (gate === "PM_REVIEW_REQUIRED") return "PM_REVIEW_REQUIRED"
  if (gate === "READY" || gate === "NO_ACTION_REQUIRED") return "READY"
  if (gate === "BLOCKED") return "BLOCKED"
  return "REVIEW_REQUIRED"
}

function hasEvidenceLink(evidence?: EvidenceItem): boolean {
  return Boolean(evidence?.sourceUrl && evidence.sourceUrl.trim().length > 0)
}

export default function RDRadarPage() {
  const [statusState, setStatusState] = useState<DataState>("loading")
  const [evidenceState, setEvidenceState] = useState<DataState>("loading")
  const [candidateState, setCandidateState] = useState<DataState>("loading")
  const [decisionState, setDecisionState] = useState<DataState>("loading")
  const [radarStatus, setRadarStatus] = useState<RadarStatus | null>(null)
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [decisions, setDecisions] = useState<PMDecision[]>([])
  const nextGate = normalizeGate(radarStatus?.nextGate, radarStatus?.forbiddenActionsObserved)

  useEffect(() => {
    let cancelled = false

    async function loadLiveState(): Promise<void> {
      const [statusPayload, evidencePayload, candidatePayload, decisionPayload] = await Promise.all([
        fetchSekhemApi<RadarStatus>("/rd-radar/status"),
        fetchSekhemApi<EvidencePayload>("/rd-radar/evidence"),
        fetchSekhemApi<CandidatePayload>("/rd-radar/candidates"),
        fetchSekhemApi<PMDecisionPayload>("/rd-radar/pm-decisions"),
      ])

      if (cancelled) return

      const evidenceItems = evidencePayload?.evidence ?? []
      const candidateItems = normalizeCandidates(candidatePayload)
      const decisionItems = normalizeDecisions(decisionPayload)

      setRadarStatus(statusPayload)
      setEvidence(evidenceItems)
      setCandidates(candidateItems)
      setDecisions(decisionItems)
      setStatusState(statusPayload ? "live" : "missing")
      setEvidenceState(evidenceItems.length > 0 ? "live" : "missing")
      setCandidateState(candidateItems.length > 0 ? "live" : "missing")
      setDecisionState(decisionItems.length > 0 ? "live" : "missing")
    }

    void loadLiveState()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Radar className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">R&amp;D Radar</h1>
            <p className="text-sm text-muted-foreground">Owner view for evidence, candidate review, PM decision, and next gate.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={displayState(statusState)} />
          <StatusBadge label={nextGate} />
        </div>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Evidence linkage is pending PM schema approval.</p>
              <p className="text-xs text-muted-foreground mt-1">Missing evidence links stay visible as a known limitation. The UI does not replace them with fake success.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <RDRadarLiveAnalysisPanel />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricCard icon={FileText} value={radarStatus?.evidenceCount ?? evidence.length} label="Evidence" tone={evidenceState === "live" ? "success" : "warning"} />
        <MetricCard icon={Target} value={radarStatus?.candidateCount ?? candidates.length} label="Candidates" tone={candidateState === "live" ? "success" : "gold"} />
        <MetricCard icon={Clock} value={radarStatus?.workflowRunCount ?? 0} label="Review Runs" tone="cyan" />
        <MetricCard icon={CheckCircle} value={decisions.length} label="PM Decisions" tone="success" />
        <MetricCard icon={AlertTriangle} value={radarStatus?.forbiddenActionsObserved ? 1 : 0} label="Owner Blocks" tone={radarStatus?.forbiddenActionsObserved ? "destructive" : "warning"} alert={radarStatus?.forbiddenActionsObserved} />
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatePanel title="R&D Radar" state={statusState} detail={radarStatus?.radarStatus ?? "Live status is missing."} />
        <StatePanel title="Evidence" state={evidenceState} detail={evidenceState === "live" ? `${evidence.length} item(s) returned.` : "Evidence data is missing."} />
        <StatePanel title="Candidate/Initiative" state={candidateState} detail={candidateState === "live" ? `${candidates.length} candidate(s) returned.` : "Candidate state is missing."} />
        <StatePanel title="PM decision" state={decisionState} detail={decisionState === "live" ? `${decisions.length} decision(s) returned.` : "PM decision is missing or not submitted."} />
      </section>

      <Card className="border-gold/30 bg-gold/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="text-sm font-medium text-gold">Demo-only initiative draft</p>
                <p className="text-xs text-muted-foreground mt-1">Opens the separately labelled public demonstration route. It is not a Production persistence action.</p>
              </div>
            </div>
            <Button className="bg-gold text-background hover:bg-gold/90 shrink-0" asChild>
              <Link href="/demo/initiatives/new">Open Demo Route<ArrowRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Candidate/Initiative Review</h2>
          <p className="text-xs text-muted-foreground mt-1">Only persisted Backend candidates are rendered on this authenticated operational screen.</p>
        </div>
        <div className="space-y-4">
          {candidates.length === 0 ? <MissingState title="Candidate data missing" detail="The live Backend returned no persisted candidate records. No demonstration fixtures were substituted." /> : candidates.map((candidate, index) => {
            const evidenceItem = evidence[index]
            const decision = decisions.find((item) => item.candidateId === candidate.candidateId)
            const evidenceAvailable = evidenceState === "live" && Boolean(evidenceItem)
            const evidenceLabel = evidenceAvailable ? "available" : "missing"
            const linkMissing = evidenceLabel === "available" && !hasEvidenceLink(evidenceItem)
            const initiativeLabel = evidenceLabel === "missing" || radarStatus?.forbiddenActionsObserved ? "blocked" : candidate.createdAsDraftOnly ? "draft" : "ready"
            const gate = normalizeGate(decision?.nextGate ?? candidate?.nextGate ?? radarStatus?.nextGate, initiativeLabel === "blocked")
            const route = `/demo/initiatives/${candidate.candidateId}`

            return (
              <Card key={candidate.candidateId} className={cn("transition-all hover:shadow-lg", index === 0 && "ring-2 ring-gold/30 bg-gold/5")}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{customerSafeText(candidate.title ?? "Untitled candidate")}</h3>
                        <StatusBadge label={evidenceLabel} />
                        <StatusBadge label={initiativeLabel} />
                        <StatusBadge label={gate} />
                        <StatusBadge label="Live" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{customerSafeText(candidate.problemStatement ?? "Problem statement is missing.")}</p>
                    </div>
                    {(candidate.requiresPMApproval ?? true) && <StatusBadge label="REVIEW_REQUIRED" />}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniMetric label="Evidence" value={evidenceLabel} className={evidenceLabel === "available" ? "text-success" : "text-warning"} />
                    <MiniMetric label="Candidate" value={initiativeLabel} className={initiativeLabel === "blocked" ? "text-destructive" : "text-info"} />
                    <MiniMetric label="Next Gate" value={gate} className="text-gold truncate" />
                    <MiniMetric label="PM Decision" value={decision?.decision ?? "REVIEW_REQUIRED"} className="text-info truncate" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <OwnerNote title="Evidence details" label={linkMissing ? "REVIEW_REQUIRED" : evidenceLabel}>
                      {customerSafeText(candidate.evidenceSummary ?? evidenceItem?.sanitizedFinding ?? "Evidence details are missing.")}
                      {linkMissing && <KnownLimitation />}
                    </OwnerNote>
                    <OwnerNote title="Next owner action" label={gate}>
                      {gate === "READY" ? "Open the initiative and proceed with reviewed scope." : gate === "BLOCKED" ? "Resolve missing evidence or review block before proceeding." : "Review evidence and candidate state before the next gate."}
                    </OwnerNote>
                  </div>

                  {decision && (
                    <OwnerNote title="PM decision state" label={decision.decision ?? "REVIEW_REQUIRED"}>
                      {customerSafeText(decision.decisionReason ?? "Decision reason is not provided.")}
                    </OwnerNote>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={linkMissing ? "REVIEW_REQUIRED" : "PASS"} />
                      <StatusBadge label={initiativeLabel === "blocked" ? "BLOCKED" : "READY"} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild disabled={evidenceLabel !== "available"}>
                        <a href="#evidence-list"><Eye className="w-3 h-3 mr-1" />View Evidence</a>
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs" asChild>
                        <Link href="/demo/initiatives/new"><Plus className="w-3 h-3 mr-1" />Create Initiative</Link>
                      </Button>
                      <Button size="sm" className="text-xs bg-gold text-background hover:bg-gold/90" asChild={initiativeLabel !== "blocked"} disabled={initiativeLabel === "blocked"}>
                        {initiativeLabel !== "blocked" ? <Link href={route}>Open Initiative<ArrowRight className="w-3 h-3 ml-1" /></Link> : <span>Open Initiative<ArrowRight className="w-3 h-3 ml-1 inline" /></span>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section id="evidence-list" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Evidence</h2>
          <p className="text-xs text-muted-foreground mt-1">Live evidence details are shown when returned by the backend.</p>
        </div>
        {evidence.length > 0 ? evidence.map((item) => <EvidenceCard key={item.id} evidence={item} />) : <MissingState title="Evidence missing" detail="Evidence linkage is pending PM schema approval." />}
      </section>

      <section className="space-y-4"><h2 className="text-lg font-semibold text-foreground">Signals</h2><MissingState title="Live signal feed unavailable" detail="This operational screen has no persisted signal endpoint. Demonstration signal fixtures were not substituted." /></section>
    </div>
  )
}

function StatusBadge({ label }: { label: string }) {
  return <Badge variant="outline" className={cn("text-[9px]", labelTone[label] ?? "border-border/50 text-muted-foreground")}>{label}</Badge>
}

function MetricCard({ icon: Icon, value, label, tone, alert }: { icon: ElementType; value: number; label: string; tone: keyof typeof metricToneClasses; alert?: boolean }) {
  return (
    <Card className={cn("bg-card/50", alert && "border-destructive/30")}>
      <CardContent className="p-4"><Icon className={cn("w-5 h-5", metricToneClasses[tone])} /><p className="text-2xl font-bold text-foreground mt-2">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent>
    </Card>
  )
}

function StatePanel({ title, state, detail }: { title: string; state: DataState; detail: string }) {
  return (
    <Card className={cn("bg-card/50", state === "live" && "border-success/30", state === "missing" && "border-warning/30")}>
      <CardContent className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{title}</h3><StatusBadge label={displayState(state)} /></div><p className="mt-2 text-xs text-muted-foreground">{customerSafeText(detail)}</p></CardContent>
    </Card>
  )
}

function MiniMetric({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className="bg-secondary/30 rounded-lg p-2.5"><p className="text-[10px] text-muted-foreground mb-0.5">{label}</p><p className={cn("text-xs font-medium", className)}>{customerSafeText(value)}</p></div>
}

function OwnerNote({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return <Card className="border-border/50 bg-card/50"><CardContent className="p-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-medium">{title}</p><StatusBadge label={label} /></div><div className="text-xs text-muted-foreground">{children}</div></CardContent></Card>
}

function KnownLimitation() {
  return <p className="mt-2 text-xs text-warning">Evidence linkage is pending PM schema approval.</p>
}

function MissingState({ title, detail }: { title: string; detail: string }) {
  return <Card className="border-warning/30 bg-warning/5"><CardContent className="p-4"><div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-warning">{title}</p><p className="text-xs text-muted-foreground mt-1">{detail}</p></div></div></CardContent></Card>
}

function EvidenceCard({ evidence }: { evidence: EvidenceItem }) {
  const linked = hasEvidenceLink(evidence)
  return <Card className="bg-card/50"><CardContent className="p-4"><div className="flex items-start justify-between gap-4"><div className="space-y-2"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-semibold text-foreground">{customerSafeText(evidence.title ?? "Evidence item")}</h3><StatusBadge label={linked ? "Live" : "REVIEW_REQUIRED"} /><StatusBadge label={customerSafeText(evidence.reviewerDecision ?? "REVIEW_REQUIRED")} /></div><p className="text-xs text-muted-foreground">{customerSafeText(evidence.sanitizedFinding ?? "Evidence details are missing.")}</p>{!linked && <KnownLimitation />}</div><Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled><Eye className="w-3 h-3 mr-1" />Evidence Detail</Button></div></CardContent></Card>
}
