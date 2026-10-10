"use client"

import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, Lock, FileWarning, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { securityFindings, approvals } from "@/lib/demo-data"
import { useSecurityGateApiData } from "@/lib/sekhem-api-fallbacks"

export default function SecurityGatePage() {
  const apiData = useSecurityGateApiData(securityFindings, approvals)
  const displaySecurityFindings = apiData.securityFindings
  const securityApprovals = apiData.approvals.filter(a => a.type === "security" || a.module === "Security Gate")
  const openFindings = displaySecurityFindings.filter(f => f.status === "open")
  const criticalFindings = displaySecurityFindings.filter(f => f.severity === "critical")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-warning/20 border border-warning/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Security Gate</h1>
            <p className="text-sm text-muted-foreground">Security review, policy control, and release blocking conditions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalFindings.length > 0 && (
            <Badge className="bg-destructive text-destructive-foreground animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {criticalFindings.length} Critical
            </Badge>
          )}
          <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">
            Phase 1 Ready
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Shield className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">94%</p>
            <p className="text-xs text-muted-foreground">Risk Score</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", openFindings.length > 0 && "border-warning/30")}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{openFindings.length}</p>
            <p className="text-xs text-muted-foreground">Open Findings</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {securityApprovals.filter(a => a.status === "pending").length}
            </p>
            <p className="text-xs text-muted-foreground">Pending Exceptions</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Lock className="w-5 h-5 text-destructive" />
            <p className="text-2xl font-bold text-foreground mt-2">1</p>
            <p className="text-xs text-muted-foreground">Blocked Releases</p>
          </CardContent>
        </Card>
      </div>

      {/* Security Findings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-warning" />
              Security Findings
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-gold">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {displaySecurityFindings.map((finding) => (
            <div key={finding.id} className={cn(
              "p-4 rounded-lg border transition-colors",
              finding.severity === "critical" && "bg-destructive/5 border-destructive/30",
              finding.severity === "high" && "bg-warning/5 border-warning/30",
              finding.severity === "medium" && "bg-secondary/30 border-border",
              finding.severity === "low" && "bg-secondary/20 border-border"
            )}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    finding.severity === "critical" && "border-destructive/50 text-destructive",
                    finding.severity === "high" && "border-warning/50 text-warning",
                    finding.severity === "medium" && "border-cyan/50 text-cyan",
                    finding.severity === "low" && "border-muted-foreground/50 text-muted-foreground"
                  )}>
                    {finding.severity}
                  </Badge>
                  <h3 className="font-medium text-sm">{finding.title}</h3>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  finding.status === "open" && "border-warning/30 text-warning",
                  finding.status === "mitigated" && "border-success/30 text-success",
                  finding.status === "accepted" && "border-cyan/30 text-cyan"
                )}>
                  {finding.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{finding.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Source: {finding.source}</span>
                <span>Component: {finding.affectedComponent}</span>
                {finding.cve && (
                  <Badge variant="secondary" className="text-[9px]">{finding.cve}</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security Checklist */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Security Gate Controls
            </CardTitle>
            <Badge variant="outline" className="text-[9px] border-warning/30 text-warning">
              Human Verification Required
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { id: "secrets", label: "Secrets Scan", status: "passed" },
            { id: "license", label: "License Check", status: "passed" },
            { id: "policy", label: "Policy Check", status: "passed" },
            { id: "sbom", label: "SBOM Status", status: "passed" },
            { id: "external", label: "External Dependency Warning", status: "pending" },
            { id: "risk", label: "Risk Score", status: "passed" },
            { id: "blocked", label: "Blocked / Passed Status", status: "pending" },
            { id: "human", label: "Human Approval Gate", status: "pending" },
          ].map((item) => (
            <div key={item.id} className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              item.status === "passed" && "bg-success/5 border-success/20",
              item.status === "pending" && "bg-warning/5 border-warning/20",
              item.status === "na" && "bg-secondary/30 border-border"
            )}>
              <div className="flex items-center gap-3">
                {item.status === "passed" ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : item.status === "pending" ? (
                  <Clock className="w-4 h-4 text-warning" />
                ) : (
                  <span className="w-4 h-4 flex items-center justify-center text-[9px] text-muted-foreground">N/A</span>
                )}
                <span className="text-sm">{item.label}</span>
              </div>
              <Badge variant="outline" className={cn(
                "text-[9px]",
                item.status === "passed" && "border-success/30 text-success",
                item.status === "pending" && "border-warning/30 text-warning",
                item.status === "na" && "border-muted text-muted-foreground"
              )}>
                {item.status === "na" ? "Not Applicable" : item.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Exception Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Exception Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityApprovals.filter(a => a.status === "pending").map((approval) => (
            <div key={approval.id} className="p-4 rounded-lg bg-secondary/30 border border-warning/20">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-sm">{approval.title}</h3>
                  <p className="text-xs text-muted-foreground">{approval.description}</p>
                </div>
                <Badge variant="outline" className="border-warning/30 text-warning text-[9px]">
                  Human Approval Required
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <Button size="sm" variant="outline" className="text-xs border-success/30 text-success hover:bg-success/10">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
                <Button size="sm" variant="ghost" className="text-xs">
                  Request More Info
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Policy Notice */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Security Policy Enforcement</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI technical assistants cannot bypass security policies, approve security exceptions, access secrets, 
                or override release blocks. All security decisions require explicit human authorization.
                Security gate violations will block releases until resolved.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
