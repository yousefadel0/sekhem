"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { fetchSekhemApi, mutateSekhemApi } from "@/lib/sekhem-api"

type Provider = { id: string; displayName: string; enabled: boolean; healthState: string }
type Model = { id: string; providerId: string; displayName: string; modelId: string; enabled: boolean; defaultForProvider: boolean }
type Repository = { id: string; displayName: string; repositoryIdentifier: string; defaultBranch: string; enabled: boolean }
type Branch = { name: string; commitSha: string }
type Citation = { citationId: string; repository: string; commitSha: string; path: string; startLine: number; endLine: number }
type Finding = {
  title: string; category: string; severity: string; confidence: number; citations: Citation[]; businessImpact: string;
  technicalRisk: string; recommendation: string; uncertainty: string; requiredAdditionalEvidence: string[]; candidateDraftRecommendation: string
}
type ValidationIssue = { path: string; code: string; expectedType: string }
type RuntimeMetadata = {
  finishReason: string | null; promptTokens: number | null; completionTokens: number | null; configuredMaxOutputTokens: number
}
type Run = {
  id: string; repositoryConnectionId: string; providerId: string; modelId: string; requestedRef: string; commitSha: string | null;
  status: "RUNNING" | "FAIL" | "ABORTED" | "REVIEW_REQUIRED"; sanitizedFailureReason: string | null; candidateId: string | null;
  result: {
    schemaVersion?: string; summary?: string; findings?: Finding[];
    validationIssues?: ValidationIssue[]; runtimeMetadata?: RuntimeMetadata
  }
}

export function RDRadarLiveAnalysisPanel() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [repositoryId, setRepositoryId] = useState("")
  const [providerId, setProviderId] = useState("")
  const [modelId, setModelId] = useState("")
  const [reference, setReference] = useState("")
  const [exactCommit, setExactCommit] = useState("")
  const [purpose, setPurpose] = useState("")
  const [includePaths, setIncludePaths] = useState("")
  const [run, setRun] = useState<Run | null>(null)
  const [running, setRunning] = useState(false)
  const [configurationLoaded, setConfigurationLoaded] = useState(false)
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState("")

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchSekhemApi<Provider[]>("/ai-gateway/providers"),
      fetchSekhemApi<Model[]>("/ai-gateway/models"),
      fetchSekhemApi<Repository[]>("/repository-source/connections"),
      fetchSekhemApi<Run[]>("/rd-radar/analysis-runs"),
    ]).then(([providerData, modelData, repositoryData, runs]) => {
      if (cancelled) return
      const liveProviders = (providerData ?? []).filter((item) => item.enabled)
      const liveRepositories = (repositoryData ?? []).filter((item) => item.enabled)
      setProviders(liveProviders)
      setModels((modelData ?? []).filter((item) => item.enabled))
      setRepositories(liveRepositories)
      setRun(runs?.[0] ?? null)
      setProviderId(liveProviders[0]?.id ?? "")
      setRepositoryId(liveRepositories[0]?.id ?? "")
      setConfigurationLoaded(Boolean(providerData && modelData && repositoryData))
    })
    return () => { cancelled = true }
  }, [])

  const providerModels = useMemo(() => models.filter((model) => model.providerId === providerId), [models, providerId])
  useEffect(() => {
    const selected = providerModels.find((model) => model.defaultForProvider) ?? providerModels[0]
    setModelId(selected?.id ?? "")
  }, [providerId, providerModels])

  useEffect(() => {
    if (!repositoryId) { setBranches([]); setReference(""); return }
    let cancelled = false
    fetchSekhemApi<Branch[]>(`/repository-source/connections/${encodeURIComponent(repositoryId)}/branches`).then((data) => {
      if (cancelled) return
      const next = data ?? []
      setBranches(next)
      const repository = repositories.find((item) => item.id === repositoryId)
      setReference(next.find((item) => item.name === repository?.defaultBranch)?.name ?? next[0]?.name ?? "")
    })
    return () => { cancelled = true }
  }, [repositoryId, repositories])

  useEffect(() => {
    setPendingIdempotencyKey("")
  }, [repositoryId, providerId, modelId, reference, exactCommit, purpose, includePaths])

  async function analyze() {
    if (!repositoryId || !providerId || !modelId || (!reference && !exactCommit) || !purpose.trim()) return
    setRunning(true)
    setRun(null)
    const idempotencyKey = pendingIdempotencyKey || crypto.randomUUID()
    setPendingIdempotencyKey(idempotencyKey)
    const result = await mutateSekhemApi<Run>("POST", "/rd-radar/analysis-runs", {
      idempotencyKey,
      repositoryConnectionId: repositoryId,
      ...(exactCommit.trim() ? { commit: exactCommit.trim() } : { branch: reference }),
      providerId,
      modelId,
      analysisPurpose: purpose,
      ...(includePaths.trim() ? { includePaths: includePaths.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
    })
    if (result) setPendingIdempotencyKey("")
    setRun(result ?? { id: "not-created", repositoryConnectionId: repositoryId, providerId, modelId, requestedRef: reference, commitSha: null, status: "FAIL", sanitizedFailureReason: "Analysis failed. Review configuration and retry; raw transport details are not displayed.", candidateId: null, result: {} })
    setRunning(false)
  }

  const selectedProvider = providers.find((item) => item.id === (run?.providerId ?? providerId))
  const selectedModel = models.find((item) => item.id === (run?.modelId ?? modelId))
  const selectedRepository = repositories.find((item) => item.id === (run?.repositoryConnectionId ?? repositoryId))
  const empty = configurationLoaded && (!providers.length || !repositories.length || !models.length)

  return <Card className="border-cyan/30 bg-cyan/5">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Manual live repository analysis</CardTitle><Badge variant="outline">Live data only</Badge></div><p className="text-xs text-muted-foreground">Repository → immutable commit → AI Gateway → selected provider/model → evidence → candidate draft → PM review.</p></CardHeader>
    <CardContent className="space-y-4">
      {!configurationLoaded ? <p className="text-sm text-warning">Configuration API unavailable for this session.</p> : empty ? <p className="text-sm text-warning">Empty state: an Admin must enable a tested provider, model, and read-only repository connection.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Picker label="Repository" value={repositoryId} onChange={setRepositoryId} items={repositories.map((item) => ({ id: item.id, label: item.displayName }))} />
        <Picker label="Branch" value={reference} onChange={setReference} items={branches.map((item) => ({ id: item.name, label: `${item.name} · ${item.commitSha.slice(0, 12)}` }))} />
        <Picker label="Provider" value={providerId} onChange={setProviderId} items={providers.map((item) => ({ id: item.id, label: item.displayName }))} />
        <Picker label="Model" value={modelId} onChange={setModelId} items={providerModels.map((item) => ({ id: item.id, label: `${item.displayName} · ${item.modelId}` }))} />
        <div className="space-y-1 md:col-span-2"><Label>Exact commit SHA (optional)</Label><Input value={exactCommit} onChange={(event) => setExactCommit(event.target.value)} maxLength={40} placeholder="40-character SHA overrides the selected branch" /></div>
        <div className="space-y-1 md:col-span-2"><Label>Analysis purpose</Label><Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={2000} placeholder="Describe the bounded business or technical question." /></div>
        <div className="space-y-1 md:col-span-2"><Label>Optional include paths</Label><Input value={includePaths} onChange={(event) => setIncludePaths(event.target.value)} placeholder="backend/src/rd-radar.service.ts, backend/src/ai-gateway/**" /><p className="text-[11px] text-muted-foreground">Must remain inside the Admin-configured repository scope.</p></div>
        <div><Button disabled={running || !modelId || (!reference && !exactCommit) || !purpose.trim()} onClick={() => void analyze()}>{running ? "Analysis running…" : "Analyze manually"}</Button></div>
      </div>}

      {running && <div className="rounded-lg border p-3"><Badge variant="outline">RUNNING</Badge><p className="mt-2 text-xs text-muted-foreground">Collecting a bounded, read-only snapshot and waiting for the selected model.</p></div>}
      {run && <div className="space-y-3 rounded-lg border bg-background/60 p-4">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{run.status}</Badge><span className="text-xs text-muted-foreground">{selectedRepository?.displayName ?? run.repositoryConnectionId} · {selectedProvider?.displayName ?? run.providerId} · {selectedModel?.displayName ?? run.modelId} · {run.commitSha ?? run.requestedRef}</span></div>
        {run.status === "FAIL" || run.status === "ABORTED" ? <p className="text-sm text-warning">{run.sanitizedFailureReason ?? "Analysis did not complete."}</p> : null}
        {run.status === "FAIL" && run.result.validationIssues?.length ? <div className="rounded border border-warning/30 bg-warning/5 p-3 text-xs">
          <b>Safe validation diagnostics</b>
          <div className="mt-2 space-y-1">{run.result.validationIssues.map((issue, index) => <code key={`${issue.path}-${issue.code}-${index}`} className="block break-all">{issue.path} · {issue.code} · {issue.expectedType}</code>)}</div>
        </div> : null}
        {run.status === "FAIL" && run.result.runtimeMetadata ? <div className="grid gap-1 rounded border p-3 text-xs sm:grid-cols-2">
          <span><b>Finish reason:</b> {run.result.runtimeMetadata.finishReason ?? "not recorded"}</span>
          <span><b>Prompt tokens:</b> {run.result.runtimeMetadata.promptTokens ?? "not recorded"}</span>
          <span><b>Completion tokens:</b> {run.result.runtimeMetadata.completionTokens ?? "not recorded"}</span>
          <span><b>Configured max output:</b> {run.result.runtimeMetadata.configuredMaxOutputTokens}</span>
        </div> : null}
        {run.status === "REVIEW_REQUIRED" && run.result.summary && <p className="text-sm">{run.result.summary}</p>}
        {run.status === "REVIEW_REQUIRED" && run.result.findings?.map((finding, index) => <div key={`${finding.title}-${index}`} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{finding.title}</b><Badge variant="outline">{finding.severity}</Badge><span className="text-xs text-muted-foreground">confidence {Math.round(finding.confidence * 100)}%</span></div>
          <p className="text-xs"><b>Risk:</b> {finding.technicalRisk}</p><p className="text-xs"><b>Recommendation:</b> {finding.recommendation}</p>
          <div className="space-y-1">{finding.citations.map((citation) => <code key={citation.citationId} className="block rounded bg-secondary px-2 py-1 text-[11px] break-all">{citation.path}:{citation.startLine}-{citation.endLine} @ {citation.commitSha.slice(0, 12)}</code>)}</div>
        </div>)}
        {run.status === "REVIEW_REQUIRED" && run.candidateId && <div className="rounded border border-gold/30 bg-gold/5 p-3 text-xs"><b>Candidate Draft:</b> {run.candidateId} → PM review required. No downstream action was executed.</div>}
      </div>}
    </CardContent>
  </Card>
}

function Picker({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: { id: string; label: string }[] }) {
  return <label className="space-y-1 text-xs"><span className="font-medium">{label}</span><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
}
