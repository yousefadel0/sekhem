import { Wrench, Shield, CheckCircle, XCircle, Clock, Code, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { patchSuggestions } from "@/lib/demo-data"
import { AiPatchDraftRequestPanel } from "@/components/ai-patch-draft-request-panel"
import { AiGatewayPreviewPanel } from "@/components/ai-gateway-preview-panel"

export default function AIPatchAssistantPage() {
  const pendingPatches = patchSuggestions.filter(p => p.status === "pending-review")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Patch Assistant</h1>
            <p className="text-sm text-muted-foreground">Draft requests, human review, and controlled handoff</p>
          </div>
        </div>
        <Badge variant="outline" className="border-cyan/30 text-cyan bg-cyan/5">
          Pilot Scope
        </Badge>
      </div>

      {/* Important Notice */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Review-Only Workspace - Human Approval Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                The AI Patch Assistant records controlled draft requests for human review. It does not generate code,
                apply files, write to a repository, or deploy changes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AiGatewayPreviewPanel />

      <AiPatchDraftRequestPanel />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Wrench className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">{patchSuggestions.length}</p>
            <p className="text-xs text-muted-foreground">Review Examples</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{pendingPatches.length}</p>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {patchSuggestions.filter(p => p.status === "implemented").length}
            </p>
            <p className="text-xs text-muted-foreground">Example Records</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Code className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">85%</p>
            <p className="text-xs text-muted-foreground">Example Confidence</p>
          </CardContent>
        </Card>
      </div>

      {/* Illustrative Review Examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-4 h-4 text-success" />
              Illustrative Review Examples
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-gold">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Examples only. Runtime review artifacts for the active draft appear in the review-only workspace above.
          </p>
          {patchSuggestions.map((patch) => (
            <div key={patch.id} className={cn(
              "p-4 rounded-lg border transition-colors",
              patch.riskLevel === "high" && "bg-warning/5 border-warning/30",
              patch.riskLevel === "medium" && "bg-secondary/30 border-border",
              patch.riskLevel === "low" && "bg-secondary/20 border-border"
            )}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{patch.title}</h3>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      patch.riskLevel === "high" && "border-warning/50 text-warning",
                      patch.riskLevel === "medium" && "border-cyan/50 text-cyan",
                      patch.riskLevel === "low" && "border-success/50 text-success"
                    )}>
                      {patch.riskLevel} risk
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{patch.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[9px]">
                    {patch.confidence}% confidence
                  </Badge>
                  {patch.requiresHumanApproval && (
                    <Badge variant="outline" className="text-[9px] border-warning/30 text-warning">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      Human Required
                    </Badge>
                  )}
                </div>
              </div>

              {/* Target File */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Code className="w-3 h-3" />
                <code className="font-mono">{patch.targetFile}</code>
              </div>

              {/* Diff Preview */}
              <div className="bg-background rounded-lg border border-border overflow-hidden mb-3">
                <div className="px-3 py-1.5 bg-secondary/50 border-b border-border text-xs font-mono text-muted-foreground">
                  Example Change
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto">
                  <code>{patch.diff}</code>
                </pre>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs border-success/30 text-success hover:bg-success/10">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Review Example
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
                <Button size="sm" variant="ghost" className="text-xs">
                  View Context
                </Button>
                <div className="flex-1" />
                <span className="text-[10px] text-muted-foreground">
                  Example owner: {patch.suggestedBy}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
