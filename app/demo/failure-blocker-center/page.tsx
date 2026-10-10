"use client"

import Link from "next/link"
import { 
  AlertTriangle, XCircle, Clock, Shield, ChevronRight, 
  ArrowRight, CheckCircle, User, RotateCcw, AlertCircle,
  Code, Lock, GitBranch, Package, Cpu
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBlockersApiData } from "@/lib/sekhem-api-fallbacks"

// Mock data for blockers
const fallbackBlockers = [
  {
    id: "blocker-001",
    title: "EVPN Multi-Homing Test Timeout",
    type: "Code Error",
    severity: "critical",
    status: "investigating",
    cause: "Test timeout during route convergence validation",
    affectedComponent: "EVPN Validation Pack",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Test logs show convergence taking 45s vs expected 10s threshold",
    suggestedAction: "Increase timeout threshold or optimize convergence logic",
    nextStep: "Review BGP timer configurations in test environment",
    rollbackOption: "Revert to previous test configuration",
    assignee: "Engineering Team",
    createdAt: "2024-02-15T08:00:00Z",
    updatedAt: "2024-02-15T11:30:00Z"
  },
  {
    id: "blocker-002",
    title: "Security Gate CVE Detection",
    type: "Security Gate Failed",
    severity: "high",
    status: "open",
    cause: "High-severity CVE detected in build dependency",
    affectedComponent: "Release Candidate RC-2024.1.3",
    affectedInitiative: null,
    initiativeId: null,
    evidence: "CVE-2024-1234 affects jsonwebtoken < 9.0.0",
    suggestedAction: "Upgrade jsonwebtoken to 9.0.2 or later",
    nextStep: "Dependency upgrade and security rescan",
    rollbackOption: "Block release until CVE resolved",
    assignee: "Security Team",
    createdAt: "2024-02-14T14:00:00Z",
    updatedAt: "2024-02-15T09:00:00Z"
  },
  {
    id: "blocker-003",
    title: "Lab Hardware Unavailable",
    type: "Lab Validation Failed",
    severity: "medium",
    status: "pending-escalation",
    cause: "Physical switch rack offline for maintenance",
    affectedComponent: "Hardware Lab Automation",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Switch rack A-01 scheduled maintenance until 2024-02-16",
    suggestedAction: "Reschedule tests to alternate rack or wait for maintenance completion",
    nextStep: "Notify lab operations for expedited maintenance",
    rollbackOption: "Run subset of tests on available hardware",
    assignee: "Lab Operations",
    createdAt: "2024-02-15T06:00:00Z",
    updatedAt: "2024-02-15T10:00:00Z"
  },
  {
    id: "blocker-004",
    title: "Approval Chain Incomplete",
    type: "Missing Approval",
    severity: "medium",
    status: "pending-human",
    cause: "Missing security team approval for release candidate",
    affectedComponent: "Release Candidate RC-2024.1.3",
    affectedInitiative: null,
    initiativeId: null,
    evidence: "Security review pending since 2024-02-14",
    suggestedAction: "Escalate to security team lead",
    nextStep: "Request expedited security review",
    rollbackOption: "Delay release until approval received",
    assignee: "Security Team",
    createdAt: "2024-02-14T16:00:00Z",
    updatedAt: "2024-02-15T08:00:00Z"
  },
  {
    id: "blocker-005",
    title: "Reference Design Conflict",
    type: "Design Error",
    severity: "high",
    status: "investigating",
    cause: "Proposed reference topology conflicts with the approved spine-leaf boundary assumption",
    affectedComponent: "EVPN Reference Design",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Evidence packet shows two incompatible L2 extension assumptions in the same design note",
    suggestedAction: "Freeze design adoption and request architecture review",
    nextStep: "Engineering lead validates the approved topology boundary",
    rollbackOption: "Return to discovery-only evidence review",
    assignee: "Architecture Owner",
    createdAt: "2024-02-15T07:30:00Z",
    updatedAt: "2024-02-15T11:10:00Z"
  },
  {
    id: "blocker-006",
    title: "Workspace Permission Missing",
    type: "Permission Error",
    severity: "medium",
    status: "pending-human",
    cause: "Required reviewer does not have access to the sandboxed artifact workspace",
    affectedComponent: "Sandboxed Code Draft Workspace",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Access audit shows reviewer group missing from artifact review policy",
    suggestedAction: "Assign authorized activation owner to approve reviewer access",
    nextStep: "Update review access policy after human approval",
    rollbackOption: "Keep artifacts read-only until access is approved",
    assignee: "Authorized Activation Owner",
    createdAt: "2024-02-15T09:20:00Z",
    updatedAt: "2024-02-15T11:40:00Z"
  },
  {
    id: "blocker-007",
    title: "External Dependency Review Required",
    type: "Dependency Error",
    severity: "medium",
    status: "open",
    cause: "Artifact validation helper references an external parser not yet approved for Phase 1 use",
    affectedComponent: "Dependency Review",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Dependency review queue shows parser approval status as pending",
    suggestedAction: "Replace with approved parser or complete dependency review",
    nextStep: "Security team confirms allowed dependency path",
    rollbackOption: "Remove optional parser reference from the artifact pack",
    assignee: "Security Team",
    createdAt: "2024-02-15T10:00:00Z",
    updatedAt: "2024-02-15T11:45:00Z"
  },
  {
    id: "blocker-008",
    title: "Low Confidence Technical Recommendation",
    type: "Low AI Confidence",
    severity: "low",
    status: "pending-human",
    cause: "AI Technical Planner confidence is below the adoption threshold for a recommended test case",
    affectedComponent: "AI Technical Memo",
    affectedInitiative: "EVPN BGP Validation Pack",
    initiativeId: "evpn-bgp-validation-pack",
    evidence: "Confidence score: 62%; threshold for adoption path: 80%",
    suggestedAction: "Route the recommendation to a human NOS reviewer",
    nextStep: "Reviewer confirms whether the test case remains in scope",
    rollbackOption: "Exclude the low-confidence recommendation from the Phase 1 artifact pack",
    assignee: "Engineering Lead",
    createdAt: "2024-02-15T10:15:00Z",
    updatedAt: "2024-02-15T11:55:00Z"
  }
]

const typeIcons: Record<string, React.ElementType> = {
  "Design Error": GitBranch,
  "Code Error": Code,
  "Permission Error": Lock,
  "Dependency Error": Package,
  "Security Gate Failed": Shield,
  "Lab Validation Failed": Cpu,
  "Low AI Confidence": AlertCircle,
  "Missing Approval": User,
}

const typeColors: Record<string, string> = {
  "Design Error": "border-muted-foreground/30 text-muted-foreground bg-muted/5",
  "Code Error": "border-cyan/30 text-cyan bg-cyan/5",
  "Permission Error": "border-warning/30 text-warning bg-warning/5",
  "Dependency Error": "border-info/30 text-info bg-info/5",
  "Security Gate Failed": "border-destructive/30 text-destructive bg-destructive/5",
  "Lab Validation Failed": "border-gold/30 text-gold bg-gold/5",
  "Low AI Confidence": "border-warning/30 text-warning bg-warning/5",
  "Missing Approval": "border-gold/30 text-gold bg-gold/5",
}

const severityColors: Record<string, string> = {
  critical: "border-destructive text-destructive bg-destructive/10 animate-pulse",
  high: "border-warning text-warning bg-warning/10",
  medium: "border-gold text-gold bg-gold/10",
  low: "border-muted-foreground text-muted-foreground bg-muted/10"
}

const statusColors: Record<string, string> = {
  open: "border-destructive/30 text-destructive",
  investigating: "border-cyan/30 text-cyan",
  "pending-escalation": "border-warning/30 text-warning",
  "pending-human": "border-gold/30 text-gold",
  resolved: "border-success/30 text-success"
}

export default function FailureBlockerCenterPage() {
  const blockers = useBlockersApiData(fallbackBlockers)
  const criticalBlockers = blockers.filter(b => b.severity === "critical")
  const openBlockers = blockers.filter(b => b.status !== "resolved")
  const pendingHumanAction = blockers.filter(b => b.status === "pending-human" || b.status === "pending-escalation")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-destructive/20 border border-destructive/30 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Failure / Blocker Center</h1>
            <p className="text-sm text-muted-foreground">Active blockers, root causes, and resolution paths</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalBlockers.length > 0 && (
            <Badge className="bg-destructive text-destructive-foreground animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {criticalBlockers.length} Critical
            </Badge>
          )}
          <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">Phase 1 Activation</Badge>
        </div>
      </div>

      {/* AI Fix Attempt Rule */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Resolution Rule</p>
              <p className="text-xs text-muted-foreground mt-1">
                Max AI fix attempts: 2. After that, human review is required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn("bg-card/50", criticalBlockers.length > 0 && "border-destructive/30")}>
          <CardContent className="p-4">
            <XCircle className="w-5 h-5 text-destructive" />
            <p className="text-2xl font-bold text-foreground mt-2">{criticalBlockers.length}</p>
            <p className="text-xs text-muted-foreground">Critical Blockers</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{openBlockers.length}</p>
            <p className="text-xs text-muted-foreground">Open Blockers</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <User className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">{pendingHumanAction.length}</p>
            <p className="text-xs text-muted-foreground">Pending Human Action</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {blockers.filter(b => b.status === "resolved").length}
            </p>
            <p className="text-xs text-muted-foreground">Resolved Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Blocker Types Covered */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-cyan" />
            Blocker Types Covered
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.keys(typeIcons).map((type) => (
              <Badge key={type} variant="outline" className={cn("text-[10px]", typeColors[type])}>
                {type}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Blockers List */}
      <div className="space-y-4">
        {blockers.map((blocker) => {
          const TypeIcon = typeIcons[blocker.type] || AlertCircle
          return (
            <Card key={blocker.id} className={cn(
              "transition-all",
              blocker.severity === "critical" && "border-destructive/50 bg-destructive/5"
            )}>
              <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      typeColors[blocker.type]
                    )}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{blocker.title}</h3>
                      <p className="text-sm text-muted-foreground">{blocker.affectedComponent}</p>
                      {blocker.affectedInitiative && (
                        <Link 
                          href={`/demo/initiatives/${blocker.initiativeId}`}
                          className="text-xs text-cyan hover:underline"
                        >
                          Initiative: {blocker.affectedInitiative}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[9px]", severityColors[blocker.severity])}>
                      {blocker.severity}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[9px]", statusColors[blocker.status])}>
                      {blocker.status.replace("-", " ")}
                    </Badge>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cause</p>
                      <p className="text-sm">{blocker.cause}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Evidence</p>
                      <p className="text-sm text-muted-foreground">{blocker.evidence}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Suggested Action</p>
                      <p className="text-sm">{blocker.suggestedAction}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Next Step</p>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-3 h-3 text-cyan" />
                        <p className="text-sm text-cyan">{blocker.nextStep}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rollback Option */}
                <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg mb-4">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rollback Option</p>
                    <p className="text-sm">{blocker.rollbackOption}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Owner: {blocker.assignee}</span>
                    <span>Updated: {new Date(blocker.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocker.status === "pending-human" && (
                      <Button size="sm" variant="outline" className="text-xs border-gold/30 text-gold hover:bg-gold/10">
                        <User className="w-3 h-3 mr-1" />
                        Take Action
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs">
                      View Details
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Escalation Notice */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Human Escalation Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI technical assistants identify blockers and suggest resolutions but cannot resolve critical blockers, 
                approve workarounds, or bypass security policies. All blocker resolutions require human approval.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" asChild>
              <Link href="/demo/security-gate">
                <ChevronRight className="w-4 h-4 mr-2 rotate-180" />
                Security Gate
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/demo/release-factory">
                  Release Factory
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/demo/locked-advanced-modules">
                  Advanced Modules
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
