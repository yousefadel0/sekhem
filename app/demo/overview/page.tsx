"use client"

import { useState } from "react"
import { 
  Layers, Brain, Cpu, Radar, Database, GitBranch, 
  Workflow, Wrench, Package, Shield, FileCheck, Activity, 
  FlaskConical, ChevronRight, Zap, Rocket, AlertTriangle,
  CheckCircle, Clock, TrendingUp, ExternalLink
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { modules, kpiData, categoryColors } from "@/lib/sekhem-data"
import { useOverviewApiData } from "@/lib/sekhem-api-fallbacks"
import Link from "next/link"

const categoryIcons: Record<string, React.ElementType> = {
  core: Zap,
  intelligence: Brain,
  execution: Rocket,
  assurance: Shield,
  expansion: FlaskConical
}

const moduleIcons: Record<string, React.ElementType> = {
  "Command Center": Cpu,
  "AI Assistant War Room": Cpu,
  "AI CTO Office": Brain,
  "R&D Radar": Radar,
  "Knowledge Base": Database,
  "Repo Intelligence": GitBranch,
  "Workflow Manager": Workflow,
  "AI Patch Assistant": Wrench,
  "Release Factory": Package,
  "Security Gate": Shield,
  "Audit & Approval Hub": FileCheck,
  "Infrastructure Health": Activity,
  "Lab Validation / Support AI": FlaskConical
}

const moduleRoutes: Record<string, string> = {
  "Command Center": "/demo/command-center",
  "AI Assistant War Room": "/demo/agent-war-room",
  "AI CTO Office": "/demo/ai-cto",
  "R&D Radar": "/demo/rd-radar",
  "Knowledge Base": "/demo/knowledge-base",
  "Repo Intelligence": "/demo/repo-intelligence",
  "Workflow Manager": "/demo/workflow-manager",
  "AI Patch Assistant": "/demo/ai-patch-assistant",
  "Release Factory": "/demo/release-factory",
  "Security Gate": "/demo/security-gate",
  "Audit & Approval Hub": "/demo/audit-approvals",
  "Infrastructure Health": "/demo/infrastructure-health",
  "Lab Validation / Support AI": "/demo/lab-validation-support"
}

export default function OverviewPage() {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const apiData = useOverviewApiData(modules, kpiData)
  const displayModules = apiData.modules
  const displayKpiData = apiData.kpiData

  const kpis = [
    { label: "Total Modules", value: displayKpiData.totalModules, icon: Layers, trend: null },
    { label: "Phase 1 Scope", value: `${displayKpiData.phase1Modules} + Core`, icon: CheckCircle, trend: null, highlight: true },
    { label: "AI Assistants Active", value: displayKpiData.aiAgentsActive, icon: Cpu, trend: "up" },
    { label: "Pending Approvals", value: displayKpiData.pendingApprovals, icon: Clock, trend: null, alert: true },
    { label: "Release Candidates", value: displayKpiData.releaseCandidates, icon: Package, trend: null },
    { label: "R&D Signals", value: displayKpiData.rdSignals, icon: Radar, trend: "up" },
    { label: "High-Risk Findings", value: displayKpiData.highRiskFindings, icon: AlertTriangle, trend: null, alert: true },
    { label: "Platform Health", value: `${displayKpiData.platformHealth}%`, icon: Activity, trend: "up" },
  ]

  // Group modules by category
  const groupedModules = displayModules.reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = []
    }
    acc[module.category].push(module)
    return acc
  }, {} as Record<string, typeof displayModules>)

  const categoryOrder = ["core", "intelligence", "execution", "assurance", "expansion"]
  const categoryLabels: Record<string, string> = {
    core: "Core Command",
    intelligence: "Intelligence & Knowledge",
    execution: "Execution & Automation",
    assurance: "Assurance & Governance",
    expansion: "Expansion & Support"
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sekhem Platform Overview</h1>
              <p className="text-sm text-muted-foreground">Open Infrastructure Factory - 13 Integrated Modules</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan/30 text-cyan bg-cyan/5">
            Phase 1 Activation
          </Badge>
          <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">
            Limited Preview
          </Badge>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={cn(
            "bg-card/50 border-border/50 hover:border-gold/30 transition-colors",
            kpi.highlight && "border-gold/30 bg-gold/5",
            kpi.alert && "border-warning/30 bg-warning/5"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <kpi.icon className={cn(
                  "w-4 h-4",
                  kpi.highlight ? "text-gold" : kpi.alert ? "text-warning" : "text-muted-foreground"
                )} />
                {kpi.trend === "up" && <TrendingUp className="w-3 h-3 text-success" />}
              </div>
              <p className={cn(
                "text-xl font-bold",
                kpi.highlight ? "text-gold" : kpi.alert ? "text-warning" : "text-foreground"
              )}>
                {kpi.value}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Module Grid by Category */}
      <div className="space-y-8">
        {categoryOrder.map((category) => {
          const categoryModules = groupedModules[category] || []
          const CategoryIcon = categoryIcons[category]
          const colors = categoryColors[category]
          
          return (
            <div 
              key={category}
              className="relative"
              onMouseEnter={() => setHoveredCategory(category)}
              onMouseLeave={() => setHoveredCategory(null)}
            >
              {/* Category Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  colors.bg, colors.border, "border"
                )}>
                  <CategoryIcon className={cn("w-4 h-4", colors.text)} />
                </div>
                <div className="flex items-center gap-3">
                  <h2 className={cn("text-lg font-semibold", colors.text)}>
                    {categoryLabels[category]}
                  </h2>
                  <Badge variant="outline" className={cn("text-[10px]", colors.border, colors.text)}>
                    {categoryModules.length} modules
                  </Badge>
                </div>
                <div className={cn("h-px flex-1", colors.bg)} />
              </div>

              {/* Module Cards */}
              <div className={cn(
                "grid gap-4",
                categoryModules.length <= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
              )}>
                {categoryModules.map((module) => {
                  const ModuleIcon = moduleIcons[module.name] || Layers
                  const isPhase1 = module.phase === "phase1"
                  
                  return (
                    <Link key={module.id} href={moduleRoutes[module.name] || "#"}>
                      <Card className={cn(
                        "group cursor-pointer transition-all duration-300 hover:shadow-lg relative overflow-hidden",
                        "bg-card/50 border-border/50 hover:border-gold/30",
                        isPhase1 && "ring-1 ring-gold/20",
                        hoveredCategory === category && "border-opacity-100"
                      )}>
                        {/* Top Accent */}
                        <div className={cn(
                          "absolute top-0 left-0 right-0 h-0.5",
                          colors.bg.replace("/10", "")
                        )} />

                        {/* Phase 1 Indicator */}
                        {isPhase1 && (
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-gold/20 text-gold border border-gold/30 text-[9px] px-1.5">
                              Phase 1
                            </Badge>
                          </div>
                        )}

                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                              colors.bg, colors.border, "border group-hover:border-opacity-100"
                            )}>
                              <ModuleIcon className={cn("w-5 h-5", colors.text)} />
                            </div>
                            <div className="flex-1 min-w-0 pr-12">
                              <CardTitle className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors">
                                {module.name}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {module.description}
                              </p>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                          {/* Status Badges */}
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className={cn(
                              "text-[9px]",
                              module.statusBadge === "Phase 1 Ready" && "border-gold/30 text-gold",
                              module.statusBadge === "Active" && "border-success/30 text-success",
                              module.statusBadge === "Pilot Scope" && "border-cyan/30 text-cyan",
                              module.statusBadge === "Future Expansion" && "border-info/30 text-info"
                            )}>
                              {module.statusBadge}
                            </Badge>
                            <Badge variant="secondary" className="text-[9px] bg-secondary/50">
                              {module.valueBadge}
                            </Badge>
                          </div>

                          {/* Preview KPI */}
                          <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                            <span className="text-xs text-muted-foreground">{module.previewKPI}</span>
                            <span className={cn("text-sm font-bold", colors.text)}>
                              {module.previewValue}
                            </span>
                          </div>

                          {/* View Link */}
                          <div className="flex items-center justify-end mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-gold flex items-center gap-1">
                              View Module <ExternalLink className="w-3 h-3" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-center gap-4 pt-4">
        <Button className="bg-gold text-background hover:bg-gold/90" asChild>
          <Link href="/demo/command-center">
            Open Command Center
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
        <Button variant="outline" className="border-cyan/30 text-cyan hover:bg-cyan/10" asChild>
          <Link href="/demo/rd-radar">
            Start with R&D Radar
            <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
