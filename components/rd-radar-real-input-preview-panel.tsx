"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle, FileText, Send, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { customerSafeText } from "@/lib/customer-safe-text"
import { postSekhemApi } from "@/lib/sekhem-api"

type PreviewEvidenceItem = {
  id: string
  title: string
  sourceUrl: string
  sanitizedFinding: string
  relevanceScore: number
  riskLevel: "low" | "medium" | "high"
  businessValue: "low" | "medium" | "high"
}

type PreviewInitiative = {
  candidateId: string
  title: string
  recommendedPath: string
  expectedBusinessValue: string
  riskLevel: "low" | "medium" | "high"
  humanApprovalRequired: true
  nextGate: "PM_REVIEW_REQUIRED"
  createdAsDraftOnly: true
}

type PreviewResponse = {
  accepted: true
  persistence: boolean
  evidenceItems: PreviewEvidenceItem[]
  recommendedInitiative: PreviewInitiative
}

type SubmitState = "idle" | "submitting" | "ready" | "not-ready"

const riskTone: Record<string, string> = {
  low: "border-success/30 text-success bg-success/5",
  medium: "border-warning/30 text-warning bg-warning/5",
  high: "border-destructive/30 text-destructive bg-destructive/5"
}

const valueTone: Record<string, string> = {
  low: "border-muted/50 text-muted-foreground bg-muted/20",
  medium: "border-info/30 text-info bg-info/5",
  high: "border-success/30 text-success bg-success/5"
}

function customerLabel(value: string): string {
  return customerSafeText(value.replace(/[-_]/g, " "))
}

export function RDRadarRealInputPreviewPanel() {
  const [inputText, setInputText] = useState("Customer wants to evaluate NIST CSF readiness for infrastructure cybersecurity risk.")
  const [sourceUrl, setSourceUrl] = useState("https://www.nist.gov/cyberframework")
  const [category, setCategory] = useState("security")
  const [purpose, setPurpose] = useState("Assess whether this signal should become a reviewed R&D Radar candidate.")
  const [submitState, setSubmitState] = useState<SubmitState>("idle")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)

  async function submitSignal(): Promise<void> {
    const trimmedInput = inputText.trim()
    const trimmedCategory = category.trim()
    const trimmedPurpose = purpose.trim()

    if (!trimmedInput || !trimmedCategory || !trimmedPurpose) {
      setSubmitState("not-ready")
      return
    }

    setSubmitState("submitting")

    const response = await postSekhemApi<PreviewResponse, Record<string, unknown>>("/rd-radar/real-input-preview", {
      inputText: trimmedInput,
      ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      category: trimmedCategory,
      submittedBy: "pm",
      purpose: trimmedPurpose
    })

    if (!response?.accepted || !response.recommendedInitiative || response.recommendedInitiative.nextGate !== "PM_REVIEW_REQUIRED") {
      setSubmitState("not-ready")
      return
    }

    setPreview(response)
    setSubmitState("ready")
  }

  const initiative = preview?.recommendedInitiative

  return (
    <Card className="border-cyan/30 bg-cyan/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan/20 border border-cyan/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-cyan" />
            </div>
            <div>
              <p className="text-sm font-medium text-cyan">Submit R&amp;D Signal</p>
              <p className="text-xs text-muted-foreground mt-1">
                Turn a customer signal into an evidence preview and a draft recommendation for PM review.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 shrink-0">
            PM Review Required
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="rd-signal-input">
              R&amp;D signal
            </label>
            <Textarea
              id="rd-signal-input"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              className="min-h-24"
              placeholder="Describe the signal, requirement, risk, or opportunity to review."
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground" htmlFor="rd-signal-category">
                Category
              </label>
              <Input id="rd-signal-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="security" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground" htmlFor="rd-signal-source">
                Source link
              </label>
              <Input id="rd-signal-source" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/source" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="rd-signal-purpose">
              Review purpose
            </label>
            <Input id="rd-signal-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Explain what decision this signal should support." />
          </div>
          <Button onClick={() => void submitSignal()} disabled={submitState === "submitting"} className="bg-cyan text-background hover:bg-cyan/90">
            <Send className="w-3 h-3 mr-1" />
            {submitState === "submitting" ? "Preparing Preview..." : "Submit R&D Signal"}
          </Button>
        </div>

        {submitState === "not-ready" && (
          <p className="text-xs text-warning">Add a clear signal, category, and review purpose before preparing a draft recommendation.</p>
        )}

        {preview && initiative && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-cyan/20 bg-background/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-cyan">Evidence Preview</p>
                <Badge variant="outline" className="border-cyan/30 text-cyan">
                  {preview.evidenceItems.length} item{preview.evidenceItems.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {preview.evidenceItems.map((item) => (
                <div key={item.id} className="rounded-md border border-border/50 bg-card/40 p-3">
                  <p className="text-sm font-medium text-foreground">{customerSafeText(item.title)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{customerSafeText(item.sanitizedFinding)}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge variant="outline" className="border-cyan/30 text-cyan">
                      Relevance {item.relevanceScore}/5
                    </Badge>
                    <Badge variant="outline" className={riskTone[item.riskLevel]}>
                      Risk {customerLabel(item.riskLevel)}
                    </Badge>
                    <Badge variant="outline" className={valueTone[item.businessValue]}>
                      Value {customerLabel(item.businessValue)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gold">Draft Recommendation</p>
                  <p className="text-xs text-muted-foreground mt-1">{customerSafeText(initiative.title)}</p>
                </div>
                <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 shrink-0">
                  Human Approval Required
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Business value</p>
                  <p className="text-xs font-medium text-foreground">{customerSafeText(initiative.expectedBusinessValue)}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Risk level</p>
                  <p className="text-xs font-medium text-foreground">{customerLabel(initiative.riskLevel)}</p>
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-2">
                <p className="text-[10px] text-muted-foreground">Recommended path</p>
                <p className="text-xs font-medium text-foreground">{customerSafeText(initiative.recommendedPath)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-warning/30 text-warning">
                  <Shield className="w-3 h-3 mr-1" />
                  PM Review Required
                </Badge>
                <Badge variant="outline" className="border-success/30 text-success">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Draft only
                </Badge>
                <Badge variant="outline" className="border-gold/30 text-gold">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Next gate: {customerLabel(initiative.nextGate)}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
