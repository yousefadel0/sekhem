"use client"

import { 
  Layers, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  Package, 
  Radar, 
  AlertTriangle,
  Activity
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { kpiData } from "@/lib/sekhem-data"

interface HeroSectionProps {
  walkthroughActive: boolean
  highlightSection?: string
}

const kpis = [
  { 
    label: "Total Modules", 
    value: kpiData.totalModules, 
    icon: Layers,
    color: "text-foreground",
    bgColor: "bg-secondary",
    borderColor: "border-border"
  },
  { 
    label: "Phase 1 Modules", 
    value: kpiData.phase1Modules, 
    icon: CheckCircle2,
    color: "text-gold",
    bgColor: "bg-gold/10",
    borderColor: "border-gold/30",
    priority: true
  },
  { 
    label: "AI Assistants", 
    value: kpiData.aiAgentsActive, 
    icon: Cpu,
    color: "text-cyan",
    bgColor: "bg-cyan/10",
    borderColor: "border-cyan/30"
  },
  { 
    label: "Pending Approvals", 
    value: kpiData.pendingApprovals, 
    icon: Clock,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30"
  },
  { 
    label: "Release Candidates", 
    value: kpiData.releaseCandidates, 
    icon: Package,
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/30"
  },
  { 
    label: "R&D Signals", 
    value: kpiData.rdSignals, 
    icon: Radar,
    color: "text-info",
    bgColor: "bg-info/10",
    borderColor: "border-info/30"
  },
  { 
    label: "High-Risk Findings", 
    value: kpiData.highRiskFindings, 
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30"
  },
  { 
    label: "Service Readiness", 
    value: "Active", 
    icon: Activity,
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/30"
  },
]

export function HeroSection({ walkthroughActive, highlightSection }: HeroSectionProps) {
  return (
    <section className={cn(
      "relative transition-all duration-500",
      walkthroughActive && highlightSection !== "hero" && "opacity-40"
    )}>
      {/* Background Pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-cyan/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan/5 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-gold" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  Sekhem Platform
                </h1>
                <span className="px-3 py-1 text-xs font-medium text-gold bg-gold/10 border border-gold/30 rounded-full">
                  Phase 1 Activation
                </span>
              </div>
              <p className="text-base text-muted-foreground mt-1">
                Open Infrastructure Factory
              </p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Enterprise AI Engineering Platform enabling <span className="text-foreground font-medium">sovereign capability</span> over 
              Community SONiC, OpenWiFi, and OpenLAN through evidence-based planning, governed execution, and human approval controls.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground whitespace-nowrap">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan" />
                <span>Phase 1 Activation</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold/90 transition-colors"
            >
              Open Sekhem Product Application
            </Link>
            <Link
              href="/demo/rd-radar"
              className="inline-flex items-center justify-center rounded-lg border border-cyan/30 bg-cyan/5 px-4 py-2 text-sm font-medium text-cyan hover:bg-cyan/10 transition-colors"
            >
              Start with R&D Radar
            </Link>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className={cn(
                "group relative bg-card/80 backdrop-blur-sm border rounded-xl p-4 transition-all duration-300",
                "hover:shadow-lg hover:-translate-y-0.5",
                kpi.borderColor,
                kpi.priority && "ring-1 ring-gold/20"
              )}
            >
              {/* Top accent */}
              <div className={cn(
                "absolute top-0 left-3 right-3 h-px",
                kpi.color === "text-gold" && "bg-gradient-to-r from-transparent via-gold/50 to-transparent",
                kpi.color === "text-cyan" && "bg-gradient-to-r from-transparent via-cyan/50 to-transparent",
                kpi.color === "text-success" && "bg-gradient-to-r from-transparent via-success/50 to-transparent",
                kpi.color === "text-warning" && "bg-gradient-to-r from-transparent via-warning/50 to-transparent",
                kpi.color === "text-info" && "bg-gradient-to-r from-transparent via-info/50 to-transparent",
                kpi.color === "text-destructive" && "bg-gradient-to-r from-transparent via-destructive/50 to-transparent"
              )} />

              <div className="flex items-center justify-between mb-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
                  kpi.bgColor,
                  kpi.borderColor
                )}>
                  <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                </div>
                {kpi.priority && (
                  <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                )}
              </div>
              <div className={cn("text-2xl font-bold mb-1 tabular-nums", kpi.color)}>
                {kpi.value}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {kpi.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
