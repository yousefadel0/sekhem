"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { postSekhemApi } from "@/lib/sekhem-api"
import { cn } from "@/lib/utils"

type AiGatewayPreview = {
  policyStatus: string
  blocked: boolean
  safeForPreview?: boolean
  riskFlags: string[]
  redactionsApplied: string[]
  answerPreview?: string
  previewOnly: boolean
  humanReviewRequired: boolean
  readOnly: boolean
}

const fallbackPreview: AiGatewayPreview = {
  policyStatus: "SAFE_FALLBACK_PREVIEW",
  blocked: false,
  safeForPreview: true,
  riskFlags: [],
  redactionsApplied: [],
  answerPreview: "Safe static preview is available for review while live preview status is unavailable.",
  previewOnly: true,
  humanReviewRequired: true,
  readOnly: true,
}

function textList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None"
}

export function AiGatewayPreviewPanel() {
  const [preview, setPreview] = useState(fallbackPreview)
  const [isFallback, setIsFallback] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadPreview(): Promise<void> {
      const result = await postSekhemApi<AiGatewayPreview, Record<string, unknown>>("/ai-gateway/preview-request", {
        requestType: "ai_patch_explanation_preview",
        question: "Provide a controlled review-only preview for the AI Patch Assistant workspace.",
        sourceScope: ["knowledge_base"],
        requestedBy: "demo-reviewer",
      })

      if (!cancelled && result) {
        setPreview({
          ...result,
          safeForPreview: !result.blocked,
        })
        setIsFallback(false)
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [])

  const safeForPreview = preview.safeForPreview ?? !preview.blocked

  return (
    <Card data-testid="ai-gateway-preview" className="border-cyan/30 bg-cyan/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg border border-cyan/30 bg-cyan/10 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-cyan" />
            </div>
            <div>
              <p className="text-sm font-medium text-cyan">AI Gateway Preview</p>
              <p className="text-xs text-muted-foreground mt-1">
                Preview only. No live AI provider connected.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 w-fit">
            Human review required
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <GatewayPreviewItem label="Policy status" value={preview.policyStatus} tone={preview.blocked ? "blocked" : "safe"} />
          <GatewayPreviewItem label="Blocked / safe for preview" value={`${preview.blocked} / ${safeForPreview}`} tone={preview.blocked ? "blocked" : "safe"} />
          <GatewayPreviewItem label="Preview mode" value={`previewOnly=${preview.previewOnly}`} />
          <GatewayPreviewItem label="Review gate" value={`humanReviewRequired=${preview.humanReviewRequired}`} />
          <GatewayPreviewItem label="Access mode" value={`readOnly=${preview.readOnly}`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div className="rounded-lg border border-border/70 bg-secondary/30 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Review controls</p>
            <p className="text-xs text-muted-foreground">Risk flags: {textList(preview.riskFlags)}</p>
            <p className="text-xs text-muted-foreground">Redactions applied: {textList(preview.redactionsApplied)}</p>
          </div>

          <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
            <p className="text-xs font-medium text-foreground">Mock preview response</p>
            <p className="text-xs text-muted-foreground mt-2">{preview.answerPreview ?? "No preview response returned."}</p>
            {isFallback && (
              <p className="text-[11px] text-warning mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Safe fallback preview
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GatewayPreviewItem({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "safe" | "blocked"
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xs font-mono mt-1",
          tone === "safe" && "text-success",
          tone === "blocked" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
}
