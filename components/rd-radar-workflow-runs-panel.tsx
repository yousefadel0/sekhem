"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, CheckCircle, Clock, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi } from "@/lib/sekhem-api"

type WorkflowRunRecord = {
  id?: string
  runId?: string
  workflowRunId?: string
  workflowName?: string
  name?: string
  status?: string
  summary?: string
  sanitizedExecutionSummary?: string
  createdAt?: string
  updatedAt?: string
  startedAt?: string
  finishedAt?: string
  persistence?: boolean
}

type WorkflowRunsPayload =
  | WorkflowRunRecord[]
  | {
      items?: WorkflowRunRecord[]
      workflowRuns?: WorkflowRunRecord[]
      runs?: WorkflowRunRecord[]
    }

type LoadState = "loading" | "live" | "fallback"

function normalizeWorkflowRuns(payload: WorkflowRunsPayload | null): WorkflowRunRecord[] {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload?.items ?? payload?.workflowRuns ?? payload?.runs ?? []
}

function displayStatus(status?: string): string {
  return customerSafeText(status ? status.replace(/[-_]/g, " ") : "recorded")
}

function displayTimestamp(run: WorkflowRunRecord): string {
  const value = run.finishedAt ?? run.updatedAt ?? run.startedAt ?? run.createdAt

  if (!value) {
    return "Timestamp pending"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export function RDRadarWorkflowRunsPanel() {
  const [state, setState] = useState<LoadState>("loading")
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadWorkflowRuns(): Promise<void> {
      const payload = await fetchSekhemApi<WorkflowRunsPayload>("/rd-radar/workflow-runs")
      const normalized = normalizeWorkflowRuns(payload)

      if (cancelled) {
        return
      }

      if (payload && normalized.length > 0) {
        setRuns(normalized)
        setState("live")
        return
      }

      setRuns([])
      setState("fallback")
    }

    setState("loading")
    void loadWorkflowRuns()

    return () => {
      cancelled = true
    }
  }, [])

  const latestRun = useMemo(() => runs[0], [runs])
  const sourceLabel = state === "live" ? "Live data" : state === "loading" ? "Checking live data" : "Sample view"
  const isLive = state === "live"

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
                Workflow Summary
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Summarizes recent workflow activity for this view.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={isLive ? "border-success/30 text-success" : "border-warning/30 text-warning"}>
            {sourceLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            Checking workflow summary...
          </div>
        )}

        {isLive && latestRun && (
          <div className="rounded-lg border border-success/20 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {customerSafeText(latestRun.workflowName ?? latestRun.name, "Workflow summary")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {customerSafeText(latestRun.summary ?? latestRun.sanitizedExecutionSummary, "Workflow summary is available for review.")}
                </p>
              </div>
              <Badge variant="outline" className="border-success/30 text-success shrink-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                {displayStatus(latestRun.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Workflow run visible
              </span>
              <span>ID: {customerSafeText(latestRun.workflowRunId ?? latestRun.runId ?? latestRun.id, "available")}</span>
              <span>{displayTimestamp(latestRun)}</span>
            </div>
          </div>
        )}

        {state === "fallback" && (
          <div className="rounded-lg border border-warning/20 bg-background/40 p-3">
            <p className="text-sm font-medium text-warning">Showing sample information until live information is available.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sample information is shown while live workflow data is unavailable.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
