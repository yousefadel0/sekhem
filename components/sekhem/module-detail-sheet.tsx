"use client"

import { 
  CheckCircle2, 
  Target, 
  FileText, 
  Link2, 
  Calendar,
  Zap,
  AlertCircle,
  UserCheck
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { type Module, categoryColors } from "@/lib/sekhem-data"

interface ModuleDetailSheetProps {
  module: Module | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const statusBadgeStyles: Record<string, string> = {
  "Phase 1 Ready": "bg-gold/20 text-gold border-gold/30",
  "Active": "bg-success/20 text-success border-success/30",
  "Future Expansion": "bg-info/20 text-info border-info/30"
}

export function ModuleDetailSheet({ module, open, onOpenChange }: ModuleDetailSheetProps) {
  if (!module) return null

  const colors = categoryColors[module.category]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg border-l border-border bg-card">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs font-medium border",
                statusBadgeStyles[module.statusBadge]
              )}
            >
              {module.statusBadge}
            </Badge>
            {module.phase === "phase1" && (
              <Badge className="bg-gold/20 text-gold border border-gold/30 text-xs">
                Phase 1
              </Badge>
            )}
          </div>
          <SheetTitle className="text-xl text-foreground">{module.name}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {module.categoryLabel}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <div className="space-y-6">
            {/* Strategic Purpose */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-gold" />
                Strategic Purpose
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {module.description}
              </p>
            </div>

            <Separator className="bg-border" />

            {/* Business Problem Solved */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                Business Problem Solved
              </h4>
              <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg">
                <p className="text-sm text-warning/90 leading-relaxed">
                  {module.businessProblem}
                </p>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Core Capabilities */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan" />
                Core Capabilities
              </h4>
              <ul className="space-y-2">
                {module.capabilities.map((capability, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan mt-2 flex-shrink-0" />
                    {capability}
                  </li>
                ))}
              </ul>
            </div>

            <Separator className="bg-border" />

            {/* Strategic Value */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-gold" />
                Strategic Value
              </h4>
              <div className="p-3 bg-gold/5 border border-gold/20 rounded-lg">
                <p className="text-sm text-gold/90 leading-relaxed">
                  {module.strategicValue}
                </p>
              </div>
            </div>

            {/* Example Outputs */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-success" />
                Example Outputs
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {module.exampleOutputs.map((output, index) => (
                  <div
                    key={index}
                    className="p-2.5 bg-secondary/50 border border-border rounded-lg text-xs text-muted-foreground"
                  >
                    {output}
                  </div>
                ))}
              </div>
            </div>

            {/* Related Modules */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-info" />
                Related Modules
              </h4>
              <div className="flex flex-wrap gap-2">
                {module.relatedModules.map((related) => (
                  <Badge
                    key={related}
                    variant="outline"
                    className="text-xs"
                  >
                    {related}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Phase Status */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-info" />
                Phase Status
              </h4>
              <div className={cn(
                "p-3 rounded-lg border",
                module.phase === "phase1" 
                  ? "bg-gold/5 border-gold/20" 
                  : "bg-secondary/50 border-border"
              )}>
                <p className={cn(
                  "text-sm font-medium",
                  module.phase === "phase1" ? "text-gold" : "text-muted-foreground"
                )}>
                  {module.phase === "phase1" 
                    ? "Included in Phase 1 Activation" 
                    : "Planned for Future Expansion"
                  }
                </p>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Human Approval Requirements */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-warning" />
                Human Approval Requirements
              </h4>
              <div className="space-y-2">
                {module.humanApproval.map((approval, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                    <span className="text-xs text-warning/90">{approval}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
