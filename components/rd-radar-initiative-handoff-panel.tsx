"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type InitiativeOption = {
  id: string
  name: string
  recommendedPath: string
}

const handoffSteps = [
  {
    title: "Handoff Requested",
    description: "The selected initiative is prepared for a review-only handoff preview.",
  },
  {
    title: "Draft Workspace Created",
    description: "The preview shows the controlled workspace stage. No workspace is created from this demo.",
  },
  {
    title: "Human Review Required",
    description: "A human decision remains required before any next step.",
  },
]

export function RDRadarInitiativeHandoffPanel({ initiatives }: { initiatives: InitiativeOption[] }) {
  const [selectedInitiativeId, setSelectedInitiativeId] = useState(initiatives[0]?.id ?? "")
  const [isHandoffPreviewVisible, setIsHandoffPreviewVisible] = useState(false)

  const selectedInitiative = initiatives.find((initiative) => initiative.id === selectedInitiativeId)

  function handleInitiativeChange(nextInitiativeId: string): void {
    setSelectedInitiativeId(nextInitiativeId)
    setIsHandoffPreviewVisible(false)
  }

  function handleHandoffPreview(): void {
    setIsHandoffPreviewVisible(true)
  }

  return (
    <Card className="border-cyan/30 bg-cyan/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-cyan">AI Patch Workspace Handoff</p>
            <p className="text-xs text-muted-foreground mt-1">
              Preview a review-only handoff for a recommended initiative. No workspace or source-control change is created from this demo.
            </p>
          </div>
          <Badge variant="outline" className="border-cyan/30 text-cyan shrink-0">
            Review-only preview
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Recommended initiative</span>
            <select
              value={selectedInitiativeId}
              onChange={(event) => handleInitiativeChange(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-cyan/60"
              aria-label="Recommended initiative"
            >
              {initiatives.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {initiative.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="bg-cyan text-background hover:bg-cyan/90"
            onClick={handleHandoffPreview}
            disabled={!selectedInitiative}
            aria-controls="rd-radar-initiative-handoff-status"
            aria-expanded={isHandoffPreviewVisible}
          >
            Send to AI Patch Workspace
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {selectedInitiative && (
          <p className="text-xs text-muted-foreground">
            Recommended path: <span className="text-foreground">{selectedInitiative.recommendedPath}</span>
          </p>
        )}

        {isHandoffPreviewVisible && (
          <div id="rd-radar-initiative-handoff-status" className="grid gap-3 md:grid-cols-3" aria-live="polite">
            {handoffSteps.map((step) => {
              return (
                <div
                  key={step.title}
                  className="min-h-32 rounded-lg border border-success/30 bg-success/5 p-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-8 h-8 rounded-lg border border-success/30 bg-success/10 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-success" />
                    </div>
                    <Badge variant="outline" className="text-[9px] border-success/30 text-success">
                      Preview stage
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-3">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
