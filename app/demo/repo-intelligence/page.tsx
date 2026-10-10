import { GitBranch, AlertTriangle, CheckCircle, FileCode, GitMerge, Shield, ChevronRight, TrendingUp, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { repositories, mergeRequests } from "@/lib/demo-data"

export default function RepoIntelligencePage() {
  const highRiskMRs = mergeRequests.filter(mr => mr.riskScore >= 70)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <GitBranch className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Repo Intelligence</h1>
            <p className="text-sm text-muted-foreground">Repository analysis, MR risk scoring, and impact analysis</p>
          </div>
        </div>
        <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">
          Phase 1 Ready
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <GitBranch className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">{repositories.length}</p>
            <p className="text-xs text-muted-foreground">Repositories</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <GitMerge className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {mergeRequests.filter(mr => mr.status === "open").length}
            </p>
            <p className="text-xs text-muted-foreground">Open MRs</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", highRiskMRs.length > 0 && "border-warning/30")}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{highRiskMRs.length}</p>
            <p className="text-xs text-muted-foreground">High-Risk MRs</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <TrendingUp className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">78%</p>
            <p className="text-xs text-muted-foreground">Avg Coverage</p>
          </CardContent>
        </Card>
      </div>

      {/* Repositories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitored Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {repositories.map((repo) => (
              <div key={repo.id} className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-sm">{repo.name}</h3>
                    <p className="text-xs text-muted-foreground">{repo.description}</p>
                  </div>
                  <Badge variant="secondary" className="text-[9px]">{repo.language}</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                  <span className="flex items-center gap-1">
                    <GitMerge className="w-3 h-3" />
                    {repo.openMRs} open
                    {repo.highRiskMRs > 0 && (
                      <Badge variant="outline" className="text-[8px] border-warning/30 text-warning ml-1">
                        {repo.highRiskMRs} risk
                      </Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {repo.coverage}% coverage
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {repo.lastCommit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Merge Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-gold" />
              Open Merge Requests
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-gold">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {mergeRequests.filter(mr => mr.status === "open").map((mr) => (
            <div key={mr.id} className={cn(
              "p-4 rounded-lg border transition-colors",
              mr.riskScore >= 70 ? "bg-warning/5 border-warning/30" :
              mr.riskScore >= 40 ? "bg-secondary/30 border-border" :
              "bg-secondary/20 border-border"
            )}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">!{mr.number}</span>
                    <h3 className="font-medium text-sm">{mr.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{mr.repository} • by {mr.author}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    mr.riskScore >= 70 ? "border-warning/50 text-warning" :
                    mr.riskScore >= 40 ? "border-cyan/50 text-cyan" :
                    "border-success/50 text-success"
                  )}>
                    Risk: {mr.riskScore}
                  </Badge>
                  {mr.requiresApproval && (
                    <Badge variant="outline" className="text-[9px] border-gold/30 text-gold">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      Approval Required
                    </Badge>
                  )}
                </div>
              </div>

              {mr.riskFactors.length > 0 && (
                <div className="flex items-center gap-1 mb-3">
                  <AlertTriangle className="w-3 h-3 text-warning" />
                  <span className="text-[10px] text-muted-foreground">Risk factors:</span>
                  {mr.riskFactors.map((factor) => (
                    <Badge key={factor} variant="secondary" className="text-[9px]">{factor}</Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="text-success">+{mr.linesAdded}</span>
                <span className="text-destructive">-{mr.linesRemoved}</span>
                <span>{mr.filesChanged} files</span>
                <span>{mr.testsAffected} tests affected</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
