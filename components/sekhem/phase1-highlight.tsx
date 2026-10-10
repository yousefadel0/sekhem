"use client"

import { CheckCircle2, Zap, Layers, Star, UserCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { phase1Scope } from "@/lib/sekhem-data"

interface Phase1HighlightProps {
  walkthroughActive: boolean
  highlightSection?: string
}

export function Phase1Highlight({ walkthroughActive, highlightSection }: Phase1HighlightProps) {
  const isHighlighted = highlightSection === "phase1" || highlightSection === "governance"

  return (
    <section 
      id="phase1-highlight"
      className={cn(
        "relative overflow-hidden transition-all duration-500",
        walkthroughActive && !isHighlighted && "opacity-40",
        walkthroughActive && isHighlighted && "ring-2 ring-gold/30 rounded-2xl"
      )}
    >
      {/* Main Card */}
      <div className="relative bg-gradient-to-br from-card via-card to-gold/5 border border-gold/40 rounded-2xl overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gold/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-cyan/5 rounded-full blur-3xl" />
        </div>

        {/* Header */}
        <div className="relative border-b border-gold/20 px-6 py-5 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/40 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-gold" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Star className="w-4 h-4 text-gold fill-gold" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gold">Phase 1 Strategic Selection</h2>
                  <Badge className="bg-gold text-background font-semibold text-xs px-2.5">
                    Priority
                  </Badge>
                </div>
                <p className="text-sm text-gold/70 mt-0.5">Initial deployment scope for rapid value realization</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative p-6">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Selected Modules */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gold/20 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold" />
                </div>
                <span>Strategic Module Selection</span>
                <Badge variant="outline" className="ml-auto text-xs font-mono border-gold/30 text-gold">
                  3 Modules
                </Badge>
              </h3>
              <div className="space-y-3">
                {phase1Scope.selectedModules.map((module, index) => (
                  <div
                    key={module.name}
                    className="group flex items-center gap-4 p-4 bg-card/80 backdrop-blur-sm border border-gold/20 rounded-xl hover:border-gold/40 hover:bg-card transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/30 flex items-center justify-center text-lg font-bold text-gold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors">
                        {module.name}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {module.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Core Foundation + Governance */}
            <div className="space-y-6">
              {/* Core Foundation */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan/20 flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5 text-cyan" />
                  </div>
                  <span>Core Platform Foundation</span>
                  <Badge variant="outline" className="ml-auto text-xs font-mono border-cyan/30 text-cyan">
                    Included
                  </Badge>
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {phase1Scope.coreFoundation.map((component, index) => (
                    <div
                      key={component.name}
                      className="flex items-center gap-3 p-3 bg-cyan/5 border border-cyan/20 rounded-lg hover:border-cyan/30 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-md bg-cyan/10 flex items-center justify-center text-xs font-mono text-cyan">
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className="text-xs font-medium text-cyan/90">{component.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Human Approval Requirements - Governance Section */}
              <div className={cn(
                "transition-all duration-500",
                walkthroughActive && highlightSection === "governance" && "ring-2 ring-warning/30 rounded-xl p-4 -m-4 bg-warning/5"
              )}>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-warning/20 flex items-center justify-center">
                    <UserCheck className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <span>Human Oversight Requirements</span>
                </h3>
                <div className="space-y-2">
                  {[
                    "All release approvals require human sign-off",
                    "Security exceptions reviewed by governance board",
                    "AI recommendations are advisory, not autonomous",
                    "Complete audit trail for all decisions"
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-warning/5 border border-warning/20 rounded-lg"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                      <span className="text-xs text-warning/90">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="mt-6 p-4 bg-gold/5 border border-gold/20 rounded-xl">
            <p className="text-sm text-gold/80 leading-relaxed">
              <span className="font-semibold text-gold">Strategic Note:</span> {phase1Scope.note}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
