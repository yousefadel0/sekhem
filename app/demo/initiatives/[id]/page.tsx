"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, Target, FileText, Shield, CheckCircle, Clock, 
  AlertTriangle, Zap, Lock, Play, Eye, ChevronRight,
  Sparkles, Users, Search, Calendar, ListTodo, Activity,
  AlertCircle, Package, ExternalLink, Info
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { initiatives, type Initiative, type ExecutionPath } from "@/lib/demo-data"
import { useInitiativeDetailApiData } from "@/lib/sekhem-api-fallbacks"

const riskColors: Record<string, { bg: string; border: string; text: string }> = {
  low: { bg: "bg-success/10", border: "border-success/30", text: "text-success" },
  medium: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  high: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  "very-high": { bg: "bg-destructive/20", border: "border-destructive/50", text: "text-destructive" }
}

const statusIcons: Record<string, { icon: React.ElementType; color: string }> = {
  enabled: { icon: CheckCircle, color: "text-success" },
  "limited-preview": { icon: Eye, color: "text-warning" },
  "locked-addon": { icon: Lock, color: "text-muted-foreground" },
  "locked-advanced": { icon: Lock, color: "text-muted-foreground" }
}

const activityTypeIcons: Record<string, { icon: React.ElementType; color: string }> = {
  signal: { icon: Zap, color: "text-cyan" },
  evidence: { icon: Search, color: "text-info" },
  recommendation: { icon: Sparkles, color: "text-gold" },
  "path-selection": { icon: Target, color: "text-success" },
  memo: { icon: FileText, color: "text-gold" },
  task: { icon: ListTodo, color: "text-cyan" },
  code: { icon: Package, color: "text-warning" },
  security: { icon: Shield, color: "text-destructive" },
  approval: { icon: Users, color: "text-warning" },
  blocker: { icon: AlertTriangle, color: "text-destructive" },
  release: { icon: Package, color: "text-success" }
}

const evidenceTypeLabels: Record<string, { label: string; color: string }> = {
  "community-signal": { label: "Community Signal", color: "text-cyan" },
  "security-advisory": { label: "Security Advisory", color: "text-destructive" },
  "roadmap-gap": { label: "Roadmap Gap", color: "text-warning" },
  "customer-request": { label: "Customer Request", color: "text-success" },
  "compliance-requirement": { label: "Compliance Requirement", color: "text-gold" }
}

const taskStatusColors: Record<string, { bg: string; text: string }> = {
  todo: { bg: "bg-muted", text: "text-muted-foreground" },
  "in-progress": { bg: "bg-cyan/20", text: "text-cyan" },
  review: { bg: "bg-warning/20", text: "text-warning" },
  done: { bg: "bg-success/20", text: "text-success" },
  blocked: { bg: "bg-destructive/20", text: "text-destructive" }
}

function ExecutionPathSelector({ paths, selectedPath, onSelect }: { 
  paths: ExecutionPath[]
  selectedPath: string | null
  onSelect: (pathId: string) => void 
}) {
  return (
    <div className="space-y-3">
      {paths.map((path) => {
        const riskColor = riskColors[path.riskLevel]
        const statusInfo = statusIcons[path.status]
        const StatusIcon = statusInfo.icon
        const isSelected = selectedPath === path.id
        const isLocked = path.status === "locked-addon" || path.status === "locked-advanced"
        const isLimitedPreview = path.status === "limited-preview"
        
        return (
          <Card 
            key={path.id} 
            className={cn(
              "transition-all cursor-pointer",
              isSelected && "ring-2 ring-gold/50 bg-gold/5",
              isLocked && "opacity-60 cursor-not-allowed",
              !isLocked && !isSelected && "hover:bg-secondary/30"
            )}
            onClick={() => !isLocked && onSelect(path.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                    isSelected ? "bg-gold/20 border-gold/30" : riskColor.bg, riskColor.border
                  )}>
                    {isLocked ? (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <Target className={cn("w-5 h-5", isSelected ? "text-gold" : riskColor.text)} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{path.name}</h4>
                      {isSelected && (
                        <Badge className="bg-gold/20 text-gold border border-gold/30 text-[9px]">
                          Selected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{path.description}</p>
                    
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">Risk:</span>
                        <Badge variant="outline" className={cn("text-[9px]", riskColor.border, riskColor.text)}>
                          {path.riskLevel === "very-high" ? "Very High" : path.riskLevel.charAt(0).toUpperCase() + path.riskLevel.slice(1)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{path.estimatedDuration}</span>
                      </div>
                      {path.requiresApproval && (
                        <div className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-warning" />
                          <span className="text-[10px] text-warning">Approval Required</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[9px]",
                      path.status === "enabled" && "border-success/30 text-success",
                      path.status === "limited-preview" && "border-warning/30 text-warning",
                      isLocked && "border-muted text-muted-foreground"
                    )}
                  >
                    <StatusIcon className="w-2.5 h-2.5 mr-1" />
                    {path.status === "enabled" && "Enabled Path"}
                    {path.status === "limited-preview" && "Preview Only (Full Requires Activation)"}
                    {path.status === "locked-addon" && "Locked (Activation Required)"}
                    {path.status === "locked-advanced" && "Locked (Advanced Activation Required)"}
                  </Badge>
                  
                  {isLimitedPreview && (
                    <span className="text-[9px] text-warning">Preview access only</span>
                  )}
                  {isLocked && (
                    <span className="text-[9px] text-muted-foreground">Request Activation Review</span>
                  )}
                </div>
              </div>

              {/* Deliverables - shown when selected */}
              {isSelected && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground mb-2">Deliverables:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {path.deliverables.map((d, i) => (
                      <Badge key={i} variant="secondary" className="text-[9px] bg-gold/10 text-gold">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function InitiativeWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedPath, setSelectedPath] = useState<string | null>("path-discovery")
  
  // Support both ID and slug-based lookups
  const slugMap: Record<string, string> = {
    "evpn-bgp-validation-pack": "init-001",
    "secure-image-upgrade-workflow": "init-002",
    "openconfig-gnmi-telemetry-pack": "init-003",
    "openwifi-validation-extension": "init-004",
    "release-governance-automation": "init-005"
  }
  const requestedSlug = params.id as string
  const initiativeId = slugMap[requestedSlug] || requestedSlug
  const fallbackInitiative = initiatives.find(i => i.id === initiativeId)
  const initiative = useInitiativeDetailApiData(requestedSlug, fallbackInitiative)
  
  if (!initiative) {
    return (
      <div className="p-6">
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Initiative Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested initiative does not exist or has been removed.</p>
            <Button variant="outline" onClick={() => router.push("/demo/rd-radar")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to R&D Radar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const completedTasks = initiative.tasks.filter(t => t.status === "done").length
  const totalTasks = initiative.tasks.length
  const pendingActivities = initiative.activities.filter(a => a.status === "pending").length
  const openBlockers = initiative.blockers.filter(b => b.status !== "resolved").length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/demo/rd-radar")} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[9px] border-gold/30 text-gold">
                Initiative
              </Badge>
              <Badge variant="outline" className={cn(
                "text-[9px]",
                initiative.status === "recommended" && "border-gold/30 text-gold",
                initiative.status === "in-progress" && "border-cyan/30 text-cyan",
                initiative.status === "pending-approval" && "border-warning/30 text-warning"
              )}>
                {initiative.status.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-foreground">{initiative.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{initiative.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {initiative.humanApprovalRequired && (
            <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">
              <Shield className="w-3 h-3 mr-1" />
              Human Approval Required
            </Badge>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Business Value</p>
            <p className={cn(
              "text-lg font-bold",
              initiative.businessValue === "high" && "text-success",
              initiative.businessValue === "medium" && "text-warning",
              initiative.businessValue === "low" && "text-muted-foreground"
            )}>
              {initiative.businessValue.charAt(0).toUpperCase() + initiative.businessValue.slice(1)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Technical Risk</p>
            <p className={cn(
              "text-lg font-bold",
              initiative.technicalRisk === "high" && "text-destructive",
              initiative.technicalRisk === "medium" && "text-warning",
              initiative.technicalRisk === "low" && "text-success"
            )}>
              {initiative.technicalRisk.charAt(0).toUpperCase() + initiative.technicalRisk.slice(1)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Evidence Sources</p>
            <p className="text-lg font-bold text-cyan">{initiative.evidenceSources}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Tasks Progress</p>
            <p className="text-lg font-bold text-foreground">{completedTasks}/{totalTasks}</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", openBlockers > 0 && "border-destructive/30")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Open Blockers</p>
            <p className={cn("text-lg font-bold", openBlockers > 0 ? "text-destructive" : "text-success")}>
              {openBlockers}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recommended Path Banner */}
      <Card className="bg-gold/5 border-gold/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">AI Technical Planner Recommended Safe Path</p>
              <p className="text-sm font-medium text-gold">{initiative.recommendedPath}</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs border-gold/30 text-gold hover:bg-gold/10">
              <Info className="w-3 h-3 mr-1" />
              Why this path?
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-secondary/30 p-1">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Overview
          </TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Evidence
            <Badge variant="secondary" className="ml-1.5 text-[9px] bg-cyan/20 text-cyan">
              {initiative.evidence.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="execution-path" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Execution Path
          </TabsTrigger>
          <TabsTrigger value="memo" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            AI Technical Memo
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Execution
            <Badge variant="secondary" className="ml-1.5 text-[9px]">
              {completedTasks}/{totalTasks}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Activity
            {pendingActivities > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[9px] bg-warning/20 text-warning">
                {pendingActivities}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="blockers" className="text-xs data-[state=active]:bg-gold/20 data-[state=active]:text-gold">
            Blockers/Failures
            {openBlockers > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[9px] bg-destructive/20 text-destructive">
                {openBlockers}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {initiative.overview.summary}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Business Case</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {initiative.overview.businessCase}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Technical Scope</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {initiative.overview.technicalScope}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Target Outcome</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {initiative.overview.targetOutcome}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-secondary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {initiative.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evidence Tab */}
        <TabsContent value="evidence" className="space-y-4">
          <Card className="bg-cyan/5 border-cyan/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Search className="w-5 h-5 text-cyan shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-cyan">Evidence Collection</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The AI Technical Planner has gathered {initiative.evidence.length} evidence sources to support this initiative recommendation.
                    All sources are traceable and auditable.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {initiative.evidence.map((ev) => {
              const typeInfo = evidenceTypeLabels[ev.type]
              return (
                <Card key={ev.id} className="bg-card/50 hover:bg-secondary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                        ev.relevance === "high" && "bg-success/10 border-success/30",
                        ev.relevance === "medium" && "bg-warning/10 border-warning/30",
                        ev.relevance === "low" && "bg-muted border-border"
                      )}>
                        <FileText className={cn(
                          "w-5 h-5",
                          ev.relevance === "high" && "text-success",
                          ev.relevance === "medium" && "text-warning",
                          ev.relevance === "low" && "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{ev.title}</h4>
                              <Badge variant="outline" className={cn("text-[9px]", typeInfo.color)}>
                                {typeInfo.label}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{ev.source}</p>
                          </div>
                          <Badge variant="outline" className={cn(
                            "text-[9px] shrink-0",
                            ev.relevance === "high" && "border-success/30 text-success",
                            ev.relevance === "medium" && "border-warning/30 text-warning",
                            ev.relevance === "low" && "border-muted text-muted-foreground"
                          )}>
                            {ev.relevance} relevance
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{ev.summary}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {new Date(ev.timestamp).toLocaleDateString("en-US", { 
                            month: "short", day: "numeric", year: "numeric" 
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* Execution Path Tab */}
        <TabsContent value="execution-path" className="space-y-4">
          <Card className="bg-gold/5 border-gold/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gold">Select Execution Path</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose how you want to proceed with this initiative. Higher-risk paths require human approval and may have limited availability.
                    The AI Technical Planner recommends starting with lower-risk paths.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ExecutionPathSelector 
            paths={initiative.executionPaths} 
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />

          {selectedPath && (
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" size="sm" className="text-xs">
                Cancel
              </Button>
              <Button size="sm" className="text-xs bg-gold text-background hover:bg-gold/90">
                <Play className="w-3 h-3 mr-1" />
                Start Selected Path
              </Button>
            </div>
          )}
        </TabsContent>

        {/* AI Technical Memo Tab */}
        <TabsContent value="memo" className="space-y-4">
          {initiative.technicalMemo ? (
            <>
              <Card className="bg-gold/5 border-gold/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gold">AI Technical Memo</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Generated by {initiative.technicalMemo.generatedBy} on{" "}
                          {new Date(initiative.technicalMemo.generatedAt).toLocaleDateString("en-US", { 
                            month: "short", day: "numeric", year: "numeric" 
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      initiative.technicalMemo.status === "approved" && "border-success/30 text-success",
                      initiative.technicalMemo.status === "review" && "border-warning/30 text-warning",
                      initiative.technicalMemo.status === "draft" && "border-muted text-muted-foreground"
                    )}>
                      {initiative.technicalMemo.status.charAt(0).toUpperCase() + initiative.technicalMemo.status.slice(1)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {initiative.technicalMemo.sections.map((section, index) => (
                  <Card key={index} className="bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {section.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {initiative.technicalMemo.status !== "approved" && (
                <Card className="bg-warning/5 border-warning/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-warning" />
                        <div>
                          <p className="text-sm font-medium text-warning">Review Required</p>
                          <p className="text-xs text-muted-foreground">This memo requires human review before approval.</p>
                        </div>
                      </div>
                      <Button size="sm" className="text-xs bg-warning text-background hover:bg-warning/90">
                        Submit for Approval
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="bg-secondary/20">
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-sm font-medium mb-2">No Technical Memo Yet</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  The AI Technical Planner has not yet generated a technical memo for this initiative.
                </p>
                <Button size="sm" variant="outline" className="text-xs">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Request Memo Generation
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tasks / Execution Kanban Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Execution Kanban</p>
              <p className="text-xs text-muted-foreground">
                {completedTasks} of {totalTasks} tasks completed
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs" disabled>
              <Lock className="w-3 h-3 mr-1" />
              Add Task (Requires Approval)
            </Button>
          </div>

          {/* Kanban Board */}
          <div className="grid grid-cols-8 gap-2 overflow-x-auto pb-4">
            {[
              { id: "backlog", label: "Backlog", color: "bg-muted/50 border-muted" },
              { id: "analysis", label: "Analysis", color: "bg-info/10 border-info/30" },
              { id: "design", label: "Design", color: "bg-cyan/10 border-cyan/30" },
              { id: "approved", label: "Approved", color: "bg-success/10 border-success/30" },
              { id: "in-progress", label: "In Progress", color: "bg-warning/10 border-warning/30" },
              { id: "testing", label: "Testing", color: "bg-gold/10 border-gold/30" },
              { id: "blocked", label: "Blocked", color: "bg-destructive/10 border-destructive/30" },
              { id: "done", label: "Done", color: "bg-success/20 border-success/50" },
            ].map((lane) => {
              // Map initiative tasks to kanban lanes
              const kanbanTasks = [
                { id: "k1", title: "Define EVPN validation criteria", lane: "done", priority: "high", assignee: "AI Technical Planner" },
                { id: "k2", title: "Map BGP underlay requirements", lane: "done", priority: "high", assignee: "Engineering Team" },
                { id: "k3", title: "Create Type-2 route test cases", lane: "approved", priority: "high", assignee: "Engineering Team" },
                { id: "k4", title: "Create Type-5 route test cases", lane: "design", priority: "medium", assignee: "Engineering Team" },
                { id: "k5", title: "Design VXLAN encap validation", lane: "analysis", priority: "medium", assignee: "Engineering Team" },
                { id: "k6", title: "Implement BGP session tests", lane: "in-progress", priority: "high", assignee: "Engineering Team" },
                { id: "k7", title: "Multi-homing failover tests", lane: "testing", priority: "high", assignee: "Engineering Team" },
                { id: "k8", title: "Security gate documentation", lane: "backlog", priority: "medium", assignee: "Security Team" },
                { id: "k9", title: "Human approval for execution", lane: "backlog", priority: "high", assignee: "Technical Lead" },
              ].filter(t => t.lane === lane.id)

              return (
                <div key={lane.id} className="min-w-[140px]">
                  <div className={cn(
                    "rounded-lg border p-2 h-full min-h-[200px]",
                    lane.color
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-medium truncate">{lane.label}</p>
                      <Badge variant="secondary" className="text-[9px] px-1.5 h-4">
                        {kanbanTasks.length}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {kanbanTasks.map((task) => (
                        <div 
                          key={task.id} 
                          className="bg-background rounded border border-border/50 p-2 text-[10px] hover:border-gold/30 transition-colors cursor-pointer"
                        >
                          <p className="font-medium line-clamp-2 mb-1">{task.title}</p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className={cn(
                              "text-[8px] px-1 h-3",
                              task.priority === "high" && "border-destructive/30 text-destructive",
                              task.priority === "medium" && "border-warning/30 text-warning"
                            )}>
                              {task.priority}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Task List Below Kanban */}
          <Card className="bg-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {initiative.tasks.map((task) => {
                const statusColor = taskStatusColors[task.status]
                return (
                  <div key={task.id} className="flex items-center gap-4 p-2 rounded-lg bg-card/50 border border-border/50">
                    <div className={cn(
                      "w-6 h-6 rounded flex items-center justify-center shrink-0",
                      statusColor.bg
                    )}>
                      {task.status === "done" ? (
                        <CheckCircle className={cn("w-3 h-3", statusColor.text)} />
                      ) : task.status === "blocked" ? (
                        <AlertTriangle className={cn("w-3 h-3", statusColor.text)} />
                      ) : (
                        <Clock className={cn("w-3 h-3", statusColor.text)} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs font-medium truncate",
                        task.status === "done" && "line-through text-muted-foreground"
                      )}>
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] text-muted-foreground">{task.assignee}</span>
                      <Badge variant="outline" className={cn("text-[8px]", statusColor.text)}>
                        {task.status.replace("-", " ")}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card className="bg-info/5 border-info/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-info shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-info">Activity Timeline</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Complete audit trail of all actions taken on this initiative, from signal detection through execution.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50" />
            
            <div className="space-y-4">
              {initiative.activities.map((activity, index) => {
                const typeInfo = activityTypeIcons[activity.type]
                const Icon = typeInfo.icon
                
                return (
                  <div key={activity.id} className="relative flex items-start gap-4 pl-2">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10 border",
                      activity.status === "completed" && "bg-success/10 border-success/30",
                      activity.status === "pending" && "bg-warning/10 border-warning/30",
                      activity.status === "in-progress" && "bg-cyan/10 border-cyan/30",
                      activity.status === "blocked" && "bg-destructive/10 border-destructive/30"
                    )}>
                      <Icon className={cn("w-4 h-4", typeInfo.color)} />
                    </div>
                    
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-medium text-sm">{activity.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-muted-foreground">
                              {activity.actor}
                            </span>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(activity.timestamp).toLocaleDateString("en-US", { 
                                month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                              })}
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-[9px] shrink-0",
                          activity.status === "completed" && "border-success/30 text-success",
                          activity.status === "pending" && "border-warning/30 text-warning",
                          activity.status === "in-progress" && "border-cyan/30 text-cyan",
                          activity.status === "blocked" && "border-destructive/30 text-destructive"
                        )}>
                          {activity.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* Blockers Tab */}
        <TabsContent value="blockers" className="space-y-4">
          {/* Safety Rule */}
          <Card className="bg-destructive/5 border-destructive/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Blocker Safety Rule</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI technical assistants cannot bypass, dismiss, or resolve blockers marked as &ldquo;Human Approval Gate&rdquo;.
                    These blockers require explicit human authorization before the initiative can proceed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {initiative.blockers.length === 0 ? (
            <Card className="bg-success/5 border-success/30">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                <h3 className="text-sm font-medium text-success mb-2">No Active Blockers</h3>
                <p className="text-xs text-muted-foreground">
                  This initiative currently has no blockers. All systems are clear to proceed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {initiative.blockers.map((blocker) => {
                const typeLabels: Record<string, { label: string; color: string }> = {
                  "security-finding": { label: "Security Finding", color: "border-destructive/30 text-destructive" },
                  "human-approval-gate": { label: "Human Approval Gate", color: "border-warning/30 text-warning" },
                  "external-dependency": { label: "External Dependency", color: "border-cyan/30 text-cyan" },
                  "technical-constraint": { label: "Technical Constraint", color: "border-info/30 text-info" },
                  "resource-limitation": { label: "Resource Limitation", color: "border-muted text-muted-foreground" }
                }
                const typeInfo = typeLabels[blocker.type] || { label: blocker.type, color: "border-muted text-muted-foreground" }
                
                return (
                  <Card key={blocker.id} className={cn(
                    "bg-card/50",
                    blocker.status !== "resolved" && "border-destructive/30"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                          blocker.status === "resolved" && "bg-success/10 border-success/30",
                          blocker.status !== "resolved" && "bg-destructive/10 border-destructive/30"
                        )}>
                          {blocker.status === "resolved" ? (
                            <CheckCircle className="w-5 h-5 text-success" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <h4 className="font-medium text-sm">{blocker.title}</h4>
                              <p className="text-xs text-muted-foreground mt-0.5">{blocker.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className={cn("text-[9px]", typeInfo.color)}>
                                {typeInfo.label}
                              </Badge>
                              <Badge variant="outline" className={cn(
                                "text-[9px]",
                                blocker.severity === "critical" && "border-destructive/50 text-destructive",
                                blocker.severity === "high" && "border-destructive/30 text-destructive",
                                blocker.severity === "medium" && "border-warning/30 text-warning"
                              )}>
                                {blocker.severity}
                              </Badge>
                              <Badge variant="outline" className={cn(
                                "text-[9px]",
                                blocker.status === "resolved" && "border-success/30 text-success",
                                blocker.status === "investigating" && "border-warning/30 text-warning",
                                blocker.status === "open" && "border-destructive/30 text-destructive"
                              )}>
                                {blocker.status}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Created: {new Date(blocker.createdAt).toLocaleDateString("en-US", { 
                              month: "short", day: "numeric", year: "numeric" 
                            })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
