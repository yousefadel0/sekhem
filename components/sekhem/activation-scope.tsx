"use client"

import { 
  Clock, 
  CheckCircle2, 
  Shield, 
  Compass, 
  Zap,
  Calendar,
  Users,
  FileCheck
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { phase1Scope } from "@/lib/sekhem-data"

interface ActivationScopeProps {
  walkthroughActive: boolean
  highlightSection?: string
}

export function ActivationScope({ walkthroughActive, highlightSection }: ActivationScopeProps) {
  const isHighlighted = highlightSection === "timeline"

  return (
    <section 
      id="activation-scope"
      className={cn(
        "relative transition-all duration-500",
        walkthroughActive && !isHighlighted && "opacity-40",
        walkthroughActive && isHighlighted && "ring-2 ring-gold/30 rounded-2xl p-6 -m-6 bg-gold/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Phase 1 Activation Scope</h2>
            <p className="text-xs text-muted-foreground">Implementation readiness and support coverage</p>
          </div>
        </div>
        <Badge className="bg-gold/20 text-gold border border-gold/30">
          Activation Ready
        </Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Strategic Modules */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="border-b border-border px-5 py-4 bg-secondary/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-gold" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Strategic Module Selection</h3>
                <p className="text-[10px] text-muted-foreground">Phase 1 Priority Modules</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {phase1Scope.selectedModules.map((module, index) => (
              <div
                key={module.name}
                className="flex items-center gap-4 p-3 bg-gold/5 border border-gold/20 rounded-lg"
              >
                <div className="w-8 h-8 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center text-sm font-bold text-gold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{module.name}</p>
                  <p className="text-xs text-muted-foreground">{module.description}</p>
                </div>
              </div>
            ))}

            {/* Core Foundation */}
            <div className="pt-3 mt-3 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                Core Platform Foundation (Included)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {phase1Scope.coreFoundation.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 p-2 bg-secondary/50 border border-border/50 rounded-lg"
                  >
                    <div className="w-5 h-5 rounded bg-cyan/20 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-cyan" />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Activation Details */}
        <div className="space-y-4">
          {/* Activation Scope Items */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-cyan/10 border border-cyan/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-cyan" />
                </div>
                <span className="text-xs text-muted-foreground">Implementation</span>
              </div>
              <p className="text-xl font-bold text-foreground">12 Weeks</p>
              <p className="text-[10px] text-muted-foreground mt-1">Phased delivery timeline</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-success/10 border border-success/30 flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-success" />
                </div>
                <span className="text-xs text-muted-foreground">Acceptance</span>
              </div>
              <p className="text-xl font-bold text-foreground">2 Weeks</p>
              <p className="text-[10px] text-muted-foreground mt-1">Testing and validation</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-gold" />
                </div>
                <span className="text-xs text-muted-foreground">Support</span>
              </div>
              <p className="text-xl font-bold text-foreground">24 Months</p>
              <p className="text-[10px] text-muted-foreground mt-1">Enterprise coverage</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-info/10 border border-info/30 flex items-center justify-center">
                  <Compass className="w-4 h-4 text-info" />
                </div>
                <span className="text-xs text-muted-foreground">Advisory</span>
              </div>
              <p className="text-xl font-bold text-foreground">Included</p>
              <p className="text-[10px] text-muted-foreground mt-1">Roadmap guidance</p>
            </div>
          </div>

          {/* Implementation Timeline */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="border-b border-border px-4 py-3 bg-secondary/30">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Implementation Timeline</span>
              </div>
            </div>
            <div className="p-4">
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-gold via-cyan to-success rounded-full" />

                <div className="space-y-3">
                  {[
                    { weeks: "1–2", milestone: "Core Platform Setup", color: "gold" },
                    { weeks: "3–4", milestone: "R&D Radar Activation", color: "cyan" },
                    { weeks: "5–6", milestone: "AI CTO / Repo Intelligence", color: "cyan" },
                    { weeks: "7–8", milestone: "Release Factory / Security Gate", color: "cyan" },
                    { weeks: "9–10", milestone: "Integration and Training", color: "success" },
                    { weeks: "11–12", milestone: "Acceptance and Handover", color: "success" }
                  ].map((item, index) => (
                    <div key={item.weeks} className="flex items-center gap-3 relative">
                      <div className={cn(
                        "w-[23px] h-[23px] rounded-full border-2 flex items-center justify-center flex-shrink-0 bg-card z-10",
                        item.color === "gold" && "border-gold bg-gold/10",
                        item.color === "cyan" && "border-cyan bg-cyan/10",
                        item.color === "success" && "border-success bg-success/10"
                      )}>
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          item.color === "gold" && "bg-gold",
                          item.color === "cyan" && "bg-cyan",
                          item.color === "success" && "bg-success"
                        )} />
                      </div>
                      <div className="flex items-center gap-3 flex-1">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] font-mono",
                            item.color === "gold" && "border-gold/30 text-gold",
                            item.color === "cyan" && "border-cyan/30 text-cyan",
                            item.color === "success" && "border-success/30 text-success"
                          )}
                        >
                          Week {item.weeks}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.milestone}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Resources Note */}
          <div className="flex items-start gap-3 p-3 bg-cyan/5 border border-cyan/20 rounded-lg">
            <Users className="w-4 h-4 text-cyan mt-0.5" />
            <p className="text-[11px] text-cyan/80 leading-relaxed">
              <span className="font-semibold text-cyan">Includes:</span> Dedicated Project Manager, Technical Resources, Executive Steering Committee, and Knowledge Transfer Sessions.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
