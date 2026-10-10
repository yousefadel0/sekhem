"use client"

import { ExternalLink, Zap, Brain, Rocket, Shield, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { modules, categoryColors, type Module } from "@/lib/sekhem-data"

interface ModuleGridProps {
  onModuleClick: (module: Module) => void
  walkthroughActive: boolean
  highlightSection?: string
}

const categoryOrder = ["core", "intelligence", "execution", "assurance", "expansion"]

const categoryMeta: Record<string, { label: string; icon: typeof Zap; description: string }> = {
  core: { 
    label: "Command Layer", 
    icon: Zap,
    description: "Central orchestration and control"
  },
  intelligence: { 
    label: "Intelligence Layer", 
    icon: Brain,
    description: "AI-driven insights and analytics"
  },
  execution: { 
    label: "Execution Layer", 
    icon: Rocket,
    description: "Automated deployment and operations"
  },
  assurance: { 
    label: "Assurance Layer", 
    icon: Shield,
    description: "Compliance, security, and governance"
  },
  expansion: { 
    label: "Expansion Layer", 
    icon: Sparkles,
    description: "Integration and extensibility"
  }
}

const statusBadgeStyles: Record<string, string> = {
  "Phase 1 Ready": "bg-gold/20 text-gold border-gold/40",
  "Active": "bg-success/20 text-success border-success/40",
  "Future Expansion": "bg-info/20 text-info border-info/40"
}

export function ModuleGrid({ onModuleClick, walkthroughActive, highlightSection }: ModuleGridProps) {
  const groupedModules = categoryOrder.map(category => ({
    category,
    meta: categoryMeta[category],
    modules: modules.filter(m => m.category === category)
  }))

  const isHighlighted = highlightSection === "modules"

  return (
    <section 
      id="module-grid"
      className={cn(
        "relative transition-all duration-500",
        walkthroughActive && !isHighlighted && "opacity-40",
        walkthroughActive && isHighlighted && "ring-2 ring-gold/30 rounded-2xl p-6 -m-6 bg-gold/5"
      )}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-gold to-gold/20" />
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Platform Capabilities</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-4 pl-3">
            13 integrated modules across 5 capability layers
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          {categoryOrder.map(cat => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                cat === "core" && "bg-gold",
                cat === "intelligence" && "bg-cyan",
                cat === "execution" && "bg-success",
                cat === "assurance" && "bg-warning",
                cat === "expansion" && "bg-info"
              )} />
              <span className="text-xs text-muted-foreground">{categoryMeta[cat].label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-12">
        {groupedModules.map(({ category, meta, modules: categoryModules }, groupIndex) => {
          const Icon = meta.icon
          return (
            <div key={category} className="relative">
              {/* Category Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className={cn(
                  "flex items-center justify-center w-11 h-11 rounded-xl border",
                  category === "core" && "bg-gold/10 border-gold/30",
                  category === "intelligence" && "bg-cyan/10 border-cyan/30",
                  category === "execution" && "bg-success/10 border-success/30",
                  category === "assurance" && "bg-warning/10 border-warning/30",
                  category === "expansion" && "bg-info/10 border-info/30"
                )}>
                  <Icon className={cn(
                    "w-5 h-5",
                    category === "core" && "text-gold",
                    category === "intelligence" && "text-cyan",
                    category === "execution" && "text-success",
                    category === "assurance" && "text-warning",
                    category === "expansion" && "text-info"
                  )} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      categoryColors[category]?.text || "text-muted-foreground"
                    )}>
                      {String.fromCharCode(65 + groupIndex)}.
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {meta.label}
                    </h3>
                    <div className={cn(
                      "h-px flex-1 max-w-[300px]",
                      category === "core" && "bg-gradient-to-r from-gold/40 to-transparent",
                      category === "intelligence" && "bg-gradient-to-r from-cyan/40 to-transparent",
                      category === "execution" && "bg-gradient-to-r from-success/40 to-transparent",
                      category === "assurance" && "bg-gradient-to-r from-warning/40 to-transparent",
                      category === "expansion" && "bg-gradient-to-r from-info/40 to-transparent"
                    )} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                </div>
                <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                  {categoryModules.length} module{categoryModules.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Module Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {categoryModules.map((module) => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    onClick={() => onModuleClick(module)}
                    category={category}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

interface ModuleCardProps {
  module: Module
  onClick: () => void
  category: string
}

function ModuleCard({ module, onClick, category }: ModuleCardProps) {
  const isPhase1 = module.statusBadge === "Phase 1 Ready"
  const isFuture = module.statusBadge === "Future Expansion"
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative bg-card border rounded-xl overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:-translate-y-0.5",
        isPhase1 && "border-gold/40 hover:border-gold/60 hover:shadow-gold/10",
        isFuture && "border-border/50 hover:border-info/30",
        !isPhase1 && !isFuture && "border-border hover:border-gold/30"
      )}
    >
      {/* Glow effect for Phase 1 */}
      {isPhase1 && (
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent pointer-events-none" />
      )}

      {/* Top accent bar */}
      <div className={cn(
        "h-1 w-full",
        category === "core" && "bg-gradient-to-r from-gold via-gold/80 to-gold/40",
        category === "intelligence" && "bg-gradient-to-r from-cyan via-cyan/80 to-cyan/40",
        category === "execution" && "bg-gradient-to-r from-success via-success/80 to-success/40",
        category === "assurance" && "bg-gradient-to-r from-warning via-warning/80 to-warning/40",
        category === "expansion" && "bg-gradient-to-r from-info via-info/80 to-info/40"
      )} />

      <div className="p-5">
        {/* Header - Bigger Module Name */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] font-semibold border px-2 py-0.5",
                  statusBadgeStyles[module.statusBadge] || "bg-secondary border-border"
                )}
              >
                {module.statusBadge}
              </Badge>
              {isPhase1 && (
                <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
              )}
            </div>
            <h4 className="text-lg font-bold text-foreground group-hover:text-gold transition-colors leading-tight">
              {module.name}
            </h4>
          </div>
        </div>

        {/* Short Description */}
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
          {module.description}
        </p>

        {/* Value Badge */}
        <div className="mb-4">
          <Badge 
            variant="secondary"
            className={cn(
              "text-[10px] font-medium bg-secondary/80",
              module.valueBadge.includes("Strategic") && "text-gold",
              module.valueBadge.includes("R&D") && "text-cyan",
              module.valueBadge.includes("Governance") && "text-warning",
              module.valueBadge.includes("Risk") && "text-destructive",
              module.valueBadge.includes("Operational") && "text-success"
            )}
          >
            {module.valueBadge}
          </Badge>
        </div>

        {/* Preview KPI - Simplified */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border bg-secondary/30",
          category === "core" && "border-gold/20",
          category === "intelligence" && "border-cyan/20",
          category === "execution" && "border-success/20",
          category === "assurance" && "border-warning/20",
          category === "expansion" && "border-info/20"
        )}>
          <span className="text-xs text-muted-foreground">{module.previewKPI}</span>
          <span className={cn(
            "text-lg font-bold tabular-nums",
            category === "core" && "text-gold",
            category === "intelligence" && "text-cyan",
            category === "execution" && "text-success",
            category === "assurance" && "text-warning",
            category === "expansion" && "text-info"
          )}>
            {module.previewValue}
          </span>
        </div>

        {/* Action Button */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full mt-4 gap-2 transition-all",
            "hover:bg-gold/10 hover:text-gold"
          )}
        >
          <span>View Details</span>
          <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  )
}
