"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle, Clock, ExternalLink, GitBranch, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi } from "@/lib/sekhem-api"
import { cn } from "@/lib/utils"

type GithubSonicEvidenceSource = {
  sourceSystem: "github"
  collectionMode: "read_only"
  repo: string
  repoUrl: string
  approvedRepos?: GithubSonicApprovedRepo[]
  signalType: string
  maxItems: number
  persistence: false
}

type GithubSonicApprovedRepo = {
  repo: string
  repoUrl: string
  riskArea: string
}

type GithubSonicRepositorySignal = {
  id: string
  repo: string
  title: string
  url: string
  authorLogin: string
  createdAt: string | null
  updatedAt: string | null
  labels: string[]
  sanitizedSummary: string
  technicalDomain: string
  riskArea: string
  priorityScore: number
  evidenceStrength: "moderate" | "high" | "strong"
}

type GithubSonicTopRisk = GithubSonicRepositorySignal & {
  customerSafeSummary: string
  whyItMatters: string
}

type GithubSonicClassificationSummary = {
  byTechnicalDomain: Record<string, number>
  byRiskArea: Record<string, number>
  topRisks: GithubSonicTopRisk[]
}

type GithubSonicDraftRecommendation = {
  candidateId: string
  title: string
  evidenceSource: string
  recommendedPath: string
  nextGate: "PM_REVIEW_REQUIRED"
  humanApprovalRequired: true
  createdAsDraftOnly: true
}

type GithubSonicPreview = {
  githubEvidenceSource: GithubSonicEvidenceSource
  repositorySignals: GithubSonicRepositorySignal[]
  draftRecommendations: GithubSonicDraftRecommendation[]
  classificationSummary?: GithubSonicClassificationSummary
}

type LoadState = "loading" | "ready" | "unavailable"

function friendlyGate(value: string): string {
  return customerSafeText(value.replace(/_/g, " "))
}

function signalTone(score: number): string {
  if (score >= 4) {
    return "border-warning/30 text-warning bg-warning/5"
  }

  return "border-cyan/30 text-cyan bg-cyan/5"
}

function friendlyLabel(value: string): string {
  return customerSafeText(value.replace(/_/g, " "))
}

export function RDRadarGithubSonicSignalsPanel() {
  const [state, setState] = useState<LoadState>("loading")
  const [preview, setPreview] = useState<GithubSonicPreview | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPreview(): Promise<void> {
      const data = await fetchSekhemApi<GithubSonicPreview>("/rd-radar/github-sonic-preview")

      if (cancelled) {
        return
      }

      if (data?.githubEvidenceSource && data.repositorySignals?.length > 0) {
        setPreview(data)
        setState("ready")
        return
      }

      setPreview(null)
      setState("unavailable")
    }

    setState("loading")
    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [])

  const evidenceSource = preview?.githubEvidenceSource
  const approvedRepos = useMemo(() => preview?.githubEvidenceSource.approvedRepos ?? [], [preview])
  const signals = useMemo(() => preview?.repositorySignals ?? [], [preview])
  const recommendations = useMemo(() => preview?.draftRecommendations ?? [], [preview])
  const classificationSummary = preview?.classificationSummary

  return (
    <Card className="border-cyan/30 bg-cyan/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan/20 border border-cyan/30 flex items-center justify-center shrink-0">
              <GitBranch className="w-5 h-5 text-cyan" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-cyan">SONiC GitHub Signals</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Read-only source review for public SONiC repository activity. Draft recommendations require PM review before action.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 shrink-0">
            PM Review Required
          </Badge>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            Preparing SONiC GitHub Signals preview...
          </div>
        )}

        {state === "unavailable" && (
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-sm font-medium text-muted-foreground">SONiC GitHub Signals preview is not available in this view.</p>
            <p className="text-xs text-muted-foreground mt-1">Recommended Initiatives and existing Signals remain available for review.</p>
          </div>
        )}

        {state === "ready" && preview && evidenceSource && (
          <div className="space-y-4">
            <div className="rounded-lg border border-cyan/20 bg-background/40 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-cyan">GitHub Evidence Source</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {customerSafeText(evidenceSource.repo)} - Repository signals - Read-only source
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-success/30 text-success">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Read-only source
                  </Badge>
                  <Badge variant="outline" className="border-cyan/30 text-cyan">
                    {signals.length} Repository Signal{signals.length === 1 ? "" : "s"}
                  </Badge>
                </div>
              </div>
            </div>

            {approvedRepos.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Approved SONiC Sources</p>
                  <Badge variant="outline" className="border-success/30 text-success">
                    {approvedRepos.length} approved repos
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {approvedRepos.map((approvedRepo) => (
                    <a
                      key={approvedRepo.repo}
                      href={approvedRepo.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-card/40 px-2 py-1 text-xs text-cyan hover:underline"
                    >
                      {customerSafeText(approvedRepo.repo)}
                      <span className="text-muted-foreground">- {customerSafeText(approvedRepo.riskArea)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {classificationSummary && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">Technical Domain Summary</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(classificationSummary.byTechnicalDomain).map(([domain, count]) => (
                      <Badge key={domain} variant="secondary" className="bg-secondary/50">
                        {friendlyLabel(domain)}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">Risk Area Summary</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(classificationSummary.byRiskArea).map(([riskArea, count]) => (
                      <Badge key={riskArea} variant="secondary" className="bg-secondary/50">
                        {friendlyLabel(riskArea)}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3 lg:col-span-2">
                  <p className="text-sm font-medium text-foreground">Top Risks for PM Review</p>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {classificationSummary.topRisks.map((risk) => (
                      <div key={risk.id} className="rounded-md border border-border/50 bg-background/40 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">{customerSafeText(risk.customerSafeSummary)}</p>
                          <Badge variant="outline" className={cn("shrink-0 text-[10px]", signalTone(risk.priorityScore))}>
                            Priority {risk.priorityScore}/5
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{customerSafeText(risk.whyItMatters)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">Repository Signals</p>
                <Badge variant="outline" className="border-cyan/30 text-cyan">GitHub Evidence Source</Badge>
              </div>

              {signals.map((signal) => (
                <div key={signal.id} className="rounded-lg border border-border/50 bg-card/40 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{customerSafeText(signal.title)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{customerSafeText(signal.sanitizedSummary)}</p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0", signalTone(signal.priorityScore))}>
                      Priority {signal.priorityScore}/5
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge variant="secondary" className="text-[10px] bg-secondary/50">
                      {customerSafeText(signal.technicalDomain)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] bg-secondary/50">
                      {customerSafeText(signal.riskArea)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-success/30 text-success">
                      {customerSafeText(signal.evidenceStrength)} evidence
                    </Badge>
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-cyan hover:underline"
                    >
                      View public source
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Draft Recommendations</p>
              {recommendations.map((recommendation) => (
                <div key={recommendation.candidateId} className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gold">Draft Recommendation</p>
                      <p className="text-xs text-muted-foreground mt-1">{customerSafeText(recommendation.title)}</p>
                    </div>
                    <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 shrink-0">
                      Human Approval Required
                    </Badge>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/40 p-2">
                    <p className="text-[10px] text-muted-foreground">Recommended Path</p>
                    <p className="text-xs font-medium text-foreground">{customerSafeText(recommendation.recommendedPath)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-warning/30 text-warning">
                      <Shield className="w-3 h-3 mr-1" />
                      PM Review Required
                    </Badge>
                    <Badge variant="outline" className="border-success/30 text-success">
                      Draft Recommendation
                    </Badge>
                    <Badge variant="outline" className="border-gold/30 text-gold">
                      {friendlyGate(recommendation.nextGate)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
