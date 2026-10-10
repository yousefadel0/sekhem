"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle, Clock, GitBranch, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { customerSafeText } from "@/lib/customer-safe-text"
import { fetchSekhemApi } from "@/lib/sekhem-api"

type RepositoryReadinessRecord = {
  integrationStatus?: string
  branchProtectionStatus?: string
  requiredCheckName?: string
  latestCheckStatus?: string | null
  writeActionsExecuted?: boolean
  checkedAt?: string
}

type LoadState = "loading" | "live" | "unavailable"

function displayStatus(value?: string | null): string {
  return customerSafeText(value ? value.replace(/[-_]/g, " ") : "not reported")
}

export function RDRadarRepositoryReadinessPanel() {
  const [state, setState] = useState<LoadState>("loading")
  const [readiness, setReadiness] = useState<RepositoryReadinessRecord | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReadiness(): Promise<void> {
      const payload = await fetchSekhemApi<RepositoryReadinessRecord>("/rd-radar/github-status")

      if (cancelled) {
        return
      }

      if (payload) {
        setReadiness(payload)
        setState("live")
        return
      }

      setReadiness(null)
      setState("unavailable")
    }

    setState("loading")
    void loadReadiness()

    return () => {
      cancelled = true
    }
  }, [])

  const isLive = state === "live"
  const isLoading = state === "loading"
  const sourceLabel = isLive ? "Live data" : isLoading ? "Checking live data" : "Readiness status pending"

  return (
    <Card className={isLive ? "border-success/30 bg-success/5" : isLoading ? "border-border/50 bg-card/50" : "border-warning/30 bg-warning/5"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={isLive ? "w-10 h-10 rounded-lg bg-success/20 border border-success/30 flex items-center justify-center shrink-0" : isLoading ? "w-10 h-10 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-center shrink-0" : "w-10 h-10 rounded-lg bg-warning/20 border border-warning/30 flex items-center justify-center shrink-0"}>
              {isLive ? <ShieldCheck className="w-5 h-5 text-success" /> : isLoading ? <Clock className="w-5 h-5 text-muted-foreground" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <CardTitle className={isLive ? "text-sm text-success" : isLoading ? "text-sm text-muted-foreground" : "text-sm text-warning"}>
                Readiness Check
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Read-only readiness check.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={isLive ? "border-success/30 text-success" : isLoading ? "border-border/50 text-muted-foreground" : "border-warning/30 text-warning"}>
            {sourceLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border/50 bg-background/40 p-3">
          <p className="text-sm font-medium text-foreground">
            This view is read-only and does not make source-control changes.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This panel reports readiness state only and does not request write access.
          </p>
        </div>

        {isLive && readiness && (
          <div className="rounded-lg border border-success/20 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {displayStatus(readiness.integrationStatus)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Required check: {displayStatus(readiness.requiredCheckName)}
                </p>
              </div>
              <Badge variant="outline" className="border-success/30 text-success shrink-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                Read-only
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                Readiness check visible
              </span>
              <span>Check status: {displayStatus(readiness.latestCheckStatus)}</span>
              <span>Write actions executed: {readiness.writeActionsExecuted ? "yes" : "no"}</span>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            Checking readiness status...
          </div>
        )}

        {state === "unavailable" && (
          <div className="rounded-lg border border-warning/20 bg-background/40 p-3">
            <p className="text-sm font-medium text-warning">Readiness status pending</p>
            <p className="text-xs text-muted-foreground mt-1">
              Readiness can be reviewed manually while the status is pending.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
