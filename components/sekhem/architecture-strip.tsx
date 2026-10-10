"use client"

import { Server, Monitor, Cpu, Database, ArrowRight, Shield, Layers, Network } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { architectureData } from "@/lib/sekhem-data"

interface ArchitectureStripProps {
  walkthroughActive: boolean
  highlightSection?: string
}

const serverMeta = [
  { 
    icon: Monitor, 
    colors: { bg: "bg-gold/10", border: "border-gold/30", text: "text-gold" },
    badge: "Access"
  },
  { 
    icon: Cpu, 
    colors: { bg: "bg-cyan/10", border: "border-cyan/30", text: "text-cyan" },
    badge: "Automation"
  },
  { 
    icon: Database, 
    colors: { bg: "bg-success/10", border: "border-success/30", text: "text-success" },
    badge: "Data"
  }
]

export function ArchitectureStrip({ walkthroughActive, highlightSection }: ArchitectureStripProps) {
  const isHighlighted = highlightSection === "architecture"

  return (
    <section 
      id="architecture-strip"
      className={cn(
        "relative transition-all duration-500",
        walkthroughActive && !isHighlighted && "opacity-40",
        walkthroughActive && isHighlighted && "ring-2 ring-gold/30 rounded-2xl p-6 -m-6 bg-gold/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center">
            <Server className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Target Deployment Architecture</h2>
            <p className="text-xs text-muted-foreground">3-Node Enterprise Deployment Model</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-mono text-cyan border-cyan/30">
          <div className="w-2 h-2 rounded-full bg-cyan mr-2" />
          Phase 1 Activation
        </Badge>
      </div>

      {/* Architecture Visualization */}
      <div className="relative bg-card border border-border rounded-2xl p-6 overflow-hidden">
        {/* Background Grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }} />

        {/* Connection Lines (Desktop) */}
        <div className="hidden md:block absolute top-1/2 left-[calc(33.33%-20px)] w-[40px] h-px">
          <div className="w-full h-full bg-gradient-to-r from-gold/50 to-cyan/50" />
          <ArrowRight className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan/50" />
        </div>
        <div className="hidden md:block absolute top-1/2 left-[calc(66.66%-20px)] w-[40px] h-px">
          <div className="w-full h-full bg-gradient-to-r from-cyan/50 to-success/50" />
          <ArrowRight className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-success/50" />
        </div>

        {/* Server Cards */}
        <div className="relative grid md:grid-cols-3 gap-6">
          {architectureData.servers.map((server, index) => {
            const meta = serverMeta[index]
            const Icon = meta.icon
            
            return (
              <div
                key={server.name}
                className={cn(
                  "group relative bg-card border rounded-xl overflow-hidden transition-all duration-300",
                  "hover:shadow-lg hover:-translate-y-1",
                  meta.colors.border
                )}
              >
                {/* Top Glow */}
                <div className={cn(
                  "absolute top-0 left-4 right-4 h-px",
                  index === 0 && "bg-gradient-to-r from-transparent via-gold/50 to-transparent",
                  index === 1 && "bg-gradient-to-r from-transparent via-cyan/50 to-transparent",
                  index === 2 && "bg-gradient-to-r from-transparent via-success/50 to-transparent"
                )} />

                <div className="p-5">
                  {/* Server Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center border transition-colors",
                        meta.colors.bg,
                        meta.colors.border
                      )}>
                        <Icon className={cn("w-6 h-6", meta.colors.text)} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{server.name}</h3>
                        <p className={cn("text-xs", meta.colors.text)}>{server.role}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[10px] font-mono",
                      meta.colors.text,
                      meta.colors.border
                    )}>
                      {meta.badge}
                    </Badge>
                  </div>

                  {/* Services - Generic Names */}
                  <div className="space-y-2 mb-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      Services
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {server.services.map((service) => (
                        <span
                          key={service}
                          className={cn(
                            "px-2.5 py-1 text-[11px] rounded-md border font-medium",
                            meta.colors.bg,
                            meta.colors.border,
                            meta.colors.text
                          )}
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Readiness Label */}
                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">
                        {server.readinessLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Service Readiness View */}
        <div className="flex items-center justify-center gap-8 mt-6 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="w-3.5 h-3.5 text-gold" />
            <span>Target Architecture</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-cyan" />
            <span>Service Readiness View</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Network className="w-3.5 h-3.5 text-success" />
            <span>Backup Policy Defined</span>
          </div>
        </div>
      </div>
    </section>
  )
}
