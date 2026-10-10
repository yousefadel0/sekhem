"use client"

import { useState } from "react"
import { 
  LayoutDashboard, TrendingUp, AlertTriangle, Clock, 
  CheckCircle, XCircle, Activity, Package, Shield,
  Users, GitBranch, Cpu, ChevronRight, ArrowUpRight, ArrowDownRight,
  Radar, Lightbulb, Plus
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { approvals, aiAgents, releaseCandidates, workflows, servers } from "@/lib/demo-data"
import Link from "next/link"
import { NewProgramWorkspaceDialog } from "@/components/demo/new-program-workspace-dialog"

export default function CommandCenterPage() {
  const [newProgramOpen, setNewProgramOpen] = useState(false)
  const pendingApprovals = approvals.filter(a => a.status === "pending")
  const criticalApprovals = pendingApprovals.filter(a => a.priority === "critical")
  const onlineAgents = aiAgents.filter(a => a.status === "online" || a.status === "busy")
  const runningWorkflows = workflows.filter(w => w.status === "running")
  const healthyServers = servers.filter(s => s.status === "healthy")

  const stats = [
    { 
      label: "Pending Approvals", 
      value: pendingApprovals.length, 
      icon: Clock, 
      trend: criticalApprovals.length > 0 ? "critical" : "neutral",
      subtext: `${criticalApprovals.length} critical`,
      href: "/demo/audit-approvals"
    },
    { 
      label: "AI Assistants Online", 
      value: onlineAgents.length, 
      icon: Cpu, 
      trend: "up",
      subtext: `of ${aiAgents.length} total`,
      href: "/demo/agent-war-room"
    },
    { 
      label: "Active Workflows", 
      value: runningWorkflows.length, 
      icon: Activity, 
      trend: "neutral",
      subtext: "currently running",
      href: "/demo/workflow-manager"
    },
    { 
      label: "Release Candidates", 
      value: releaseCandidates.length, 
      icon: Package, 
      trend: "neutral",
      subtext: "in pipeline",
      href: "/demo/release-factory"
    },
    { 
      label: "Platform Health", 
      value: `${healthyServers.length}/${servers.length}`, 
      icon: Shield, 
      trend: healthyServers.length === servers.length ? "up" : "warning",
      subtext: "servers healthy",
      href: "/demo/infrastructure-health"
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center">
            <LayoutDashboard className="w-6 h-6 text-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
            <p className="text-sm text-muted-foreground">Executive control dashboard for platform operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-success/30 text-success bg-success/5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse mr-1.5" />
            System Operational
          </Badge>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gold/30 bg-gold/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gold">New Initiative</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start with an idea, requirement, or problem. R&D Radar can study it and suggest a safe execution path.
                  </p>
                </div>
              </div>
              <Button className="bg-gold text-background hover:bg-gold/90 shrink-0" size="sm" asChild>
                <Link href="/demo/initiatives/new">
                  New Initiative
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan/30 bg-cyan/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan/20 border border-cyan/30 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 text-cyan" />
                </div>
                <div>
                  <p className="text-sm font-medium text-cyan">New Program Workspace</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a governed workspace for a new SONiC, OpenWiFi, OpenLAN, or open infrastructure program. Enterprise Admin only.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="border-cyan/30 text-cyan hover:bg-cyan/10 shrink-0" size="sm" onClick={() => setNewProgramOpen(true)}>
                New Program Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:border-gold/30",
              stat.trend === "critical" && "border-destructive/30 bg-destructive/5"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className={cn(
                    "w-5 h-5",
                    stat.trend === "critical" ? "text-destructive" :
                    stat.trend === "up" ? "text-success" :
                    stat.trend === "warning" ? "text-warning" :
                    "text-muted-foreground"
                  )} />
                  {stat.trend === "up" && <ArrowUpRight className="w-4 h-4 text-success" />}
                  {stat.trend === "critical" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{stat.subtext}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* R&D Radar Quick Access */}
      <Card className="border-cyan/30 bg-cyan/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan/20 border border-cyan/30 flex items-center justify-center">
                <Radar className="w-5 h-5 text-cyan" />
              </div>
              <div>
                <p className="text-sm font-medium text-cyan">R&D Radar - Primary Entry Point</p>
                <p className="text-xs text-muted-foreground">View recommended initiatives based on community signals and evidence</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-cyan/30 text-cyan hover:bg-cyan/10" asChild>
              <Link href="/demo/rd-radar">
                Open R&D Radar
                <ChevronRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                Pending Approvals
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-gold" asChild>
                <Link href="/demo/audit-approvals">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.slice(0, 4).map((approval) => (
              <div 
                key={approval.id} 
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg bg-secondary/30 border",
                  approval.priority === "critical" ? "border-destructive/30" :
                  approval.priority === "high" ? "border-warning/30" :
                  "border-transparent"
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    approval.priority === "critical" ? "bg-destructive animate-pulse" :
                    approval.priority === "high" ? "bg-warning" :
                    "bg-muted-foreground"
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{approval.title}</p>
                    <p className="text-xs text-muted-foreground">{approval.module}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {approval.requiresHumanApproval && (
                    <Badge variant="outline" className="text-[9px] border-warning/30 text-warning">
                      Human Approval Required
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    approval.priority === "critical" && "border-destructive/50 text-destructive",
                    approval.priority === "high" && "border-warning/50 text-warning"
                  )}>
                    {approval.priority}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Technical Assistant Activity */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan" />
                AI Assistant Activity
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-gold" asChild>
                <Link href="/demo/agent-war-room">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiAgents.slice(0, 4).map((agent) => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    agent.status === "busy" ? "bg-cyan/20 border border-cyan/30" :
                    agent.status === "online" ? "bg-success/20 border border-success/30" :
                    "bg-muted"
                  )}>
                    <Cpu className={cn(
                      "w-4 h-4",
                      agent.status === "busy" ? "text-cyan" :
                      agent.status === "online" ? "text-success" :
                      "text-muted-foreground"
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {agent.currentTask || agent.role}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px] shrink-0",
                  agent.status === "busy" && "border-cyan/30 text-cyan",
                  agent.status === "online" && "border-success/30 text-success",
                  agent.status === "idle" && "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {agent.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Workflows */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-success" />
                Recent Workflows
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-gold" asChild>
                <Link href="/demo/workflow-manager">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflows.slice(0, 3).map((workflow) => (
              <div key={workflow.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    workflow.status === "running" && "bg-cyan animate-pulse",
                    workflow.status === "completed" && "bg-success",
                    workflow.status === "failed" && "bg-destructive"
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{workflow.name}</p>
                    <p className="text-xs text-muted-foreground">{workflow.trigger}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px] shrink-0",
                  workflow.status === "running" && "border-cyan/30 text-cyan",
                  workflow.status === "completed" && "border-success/30 text-success",
                  workflow.status === "failed" && "border-destructive/30 text-destructive"
                )}>
                  {workflow.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Release Pipeline */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-gold" />
                Release Pipeline
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-gold" asChild>
                <Link href="/demo/release-factory">
                  View All <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {releaseCandidates.map((rc) => (
              <div key={rc.id} className={cn(
                "p-3 rounded-lg bg-secondary/30 border",
                rc.status === "blocked" ? "border-destructive/30" : "border-transparent"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{rc.version}</p>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      rc.status === "review" && "border-gold/30 text-gold",
                      rc.status === "blocked" && "border-destructive/30 text-destructive"
                    )}>
                      {rc.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Security: {rc.securityScore}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Tests: {rc.testsPassed}/{rc.testsTotal}</span>
                  <span>Changes: {rc.changeCount}</span>
                  {rc.blockingIssues > 0 && (
                    <span className="text-destructive">
                      {rc.blockingIssues} blocking
                    </span>
                  )}
                </div>
                {/* Approval Progress */}
                <div className="flex items-center gap-1 mt-2">
                  {rc.approvals.map((approval, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        approval.approved ? "bg-success" : "bg-muted"
                      )}
                      title={`${approval.role}: ${approval.approved ? "Approved" : "Pending"}`}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {rc.approvals.filter(a => a.approved).length}/{rc.approvals.length} approvals
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <NewProgramWorkspaceDialog open={newProgramOpen} onOpenChange={setNewProgramOpen} />
    </div>
  )
}
