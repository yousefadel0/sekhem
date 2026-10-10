"use client"

import Link from "next/link"
import { Workflow, ChevronRight, Radar, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { initiatives } from "@/lib/demo-data"
import { useInitiativesApiData } from "@/lib/sekhem-api-fallbacks"
import { cn } from "@/lib/utils"

const statusColors: Record<string, string> = {
  recommended: "border-cyan/30 text-cyan bg-cyan/5",
  "in-progress": "border-gold/30 text-gold bg-gold/5",
  "pending-approval": "border-warning/30 text-warning bg-warning/5",
  completed: "border-success/30 text-success bg-success/5",
  blocked: "border-destructive/30 text-destructive bg-destructive/5"
}

const valueColors: Record<string, string> = {
  high: "text-success",
  medium: "text-gold",
  low: "text-muted-foreground"
}

const riskColors: Record<string, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-success"
}

export default function InitiativesPage() {
  const displayInitiatives = useInitiativesApiData(initiatives)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Workflow className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Initiatives</h1>
            <p className="text-sm text-muted-foreground">R&D-driven initiatives with evidence, execution paths, and activity tracking</p>
          </div>
        </div>
        <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">Phase 1 Activation</Badge>
      </div>

      {/* Navigation Hint */}
      <Card className="border-cyan/30 bg-cyan/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Radar className="w-5 h-5 text-cyan" />
            <div className="flex-1">
              <p className="text-sm text-cyan font-medium">Primary Journey</p>
              <p className="text-xs text-muted-foreground">
                Start from R&D Radar to see recommended initiatives based on community signals and evidence.
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-cyan/30 text-cyan hover:bg-cyan/10" asChild>
              <Link href="/demo/rd-radar">
                Go to R&D Radar
                <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Initiatives List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">All Initiatives</h2>
        {displayInitiatives.map((initiative) => (
          <Card key={initiative.id} className="hover:border-gold/30 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{initiative.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{initiative.description}</p>
                </div>
                <Badge variant="outline" className={cn("text-[9px]", statusColors[initiative.status])}>
                  {initiative.status.replace("-", " ")}
                </Badge>
              </div>
              
              <div className="flex items-center gap-6 mb-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Business Value: </span>
                  <span className={cn("font-medium capitalize", valueColors[initiative.businessValue])}>{initiative.businessValue}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Technical Risk: </span>
                  <span className={cn("font-medium capitalize", riskColors[initiative.technicalRisk])}>{initiative.technicalRisk}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Evidence: </span>
                  <span className="font-medium">{initiative.evidenceSources} sources</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Path: </span>
                  <span className="font-medium text-cyan">{initiative.recommendedPath}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  {initiative.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[9px]">{tag}</Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="text-xs" asChild>
                  <Link href={`/demo/initiatives/${initiative.slug ?? initiative.id}`}>
                    View Workspace
                    <ChevronRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
