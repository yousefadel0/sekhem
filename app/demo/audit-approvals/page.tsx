import { FileCheck, Clock, CheckCircle, XCircle, AlertTriangle, Shield, User, Bot, Server, ChevronRight, Filter } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { approvals, auditEvents } from "@/lib/demo-data"

const actorIcons: Record<string, React.ElementType> = {
  user: User,
  agent: Bot,
  system: Server
}

export default function AuditApprovalsPage() {
  const pendingApprovals = approvals.filter(a => a.status === "pending")
  const criticalApprovals = pendingApprovals.filter(a => a.priority === "critical")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-warning/20 border border-warning/30 flex items-center justify-center">
            <FileCheck className="w-6 h-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit & Approvals</h1>
            <p className="text-sm text-muted-foreground">Approval workflows, traceability, and decision logging</p>
          </div>
        </div>
        <Badge variant="outline" className="border-success/30 text-success bg-success/5">
          Active
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn("bg-card/50", pendingApprovals.length > 0 && "border-warning/30")}>
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{pendingApprovals.length}</p>
            <p className="text-xs text-muted-foreground">Pending Approvals</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", criticalApprovals.length > 0 && "border-destructive/30")}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <p className="text-2xl font-bold text-foreground mt-2">{criticalApprovals.length}</p>
            <p className="text-xs text-muted-foreground">Critical Priority</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {approvals.filter(a => a.status === "approved").length}
            </p>
            <p className="text-xs text-muted-foreground">Approved Today</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <FileCheck className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">{auditEvents.length}</p>
            <p className="text-xs text-muted-foreground">Audit Events</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approval Queue */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                Approval Queue
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs">
                <Filter className="w-3 h-3 mr-1" />
                Filter
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className={cn(
                "p-4 rounded-lg border transition-colors",
                approval.priority === "critical" && "bg-destructive/5 border-destructive/30",
                approval.priority === "high" && "bg-warning/5 border-warning/30",
                approval.priority === "medium" && "bg-secondary/30 border-border"
              )}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn(
                        "text-[9px]",
                        approval.priority === "critical" && "border-destructive/50 text-destructive",
                        approval.priority === "high" && "border-warning/50 text-warning"
                      )}>
                        {approval.priority}
                      </Badge>
                      <Badge variant="secondary" className="text-[9px]">{approval.type}</Badge>
                    </div>
                    <h3 className="font-medium text-sm">{approval.title}</h3>
                    <p className="text-xs text-muted-foreground">{approval.module}</p>
                  </div>
                  {approval.requiresHumanApproval && (
                    <Badge variant="outline" className="text-[9px] border-warning/30 text-warning shrink-0">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      Human Required
                    </Badge>
                  )}
                </div>

                {/* AI Recommendation */}
                {approval.aiRecommendation && (
                  <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg mb-3">
                    <Bot className="w-3.5 h-3.5 text-cyan" />
                    <span className="text-[10px] text-muted-foreground">AI Recommendation:</span>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      approval.aiRecommendation === "approve" && "border-success/30 text-success",
                      approval.aiRecommendation === "reject" && "border-destructive/30 text-destructive",
                      approval.aiRecommendation === "review" && "border-warning/30 text-warning"
                    )}>
                      {approval.aiRecommendation}
                    </Badge>
                    {approval.aiConfidence && (
                      <span className="text-[10px] text-muted-foreground">
                        ({approval.aiConfidence}% confidence)
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-xs border-success/30 text-success hover:bg-success/10">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                    <XCircle className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs ml-auto">
                    Details <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-gold" />
                Recent Audit Events
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-gold">
                Export <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditEvents.map((event) => {
                const ActorIcon = actorIcons[event.actorType]
                return (
                  <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      event.actorType === "user" && "bg-gold/20",
                      event.actorType === "agent" && "bg-cyan/20",
                      event.actorType === "system" && "bg-muted"
                    )}>
                      <ActorIcon className={cn(
                        "w-4 h-4",
                        event.actorType === "user" && "text-gold",
                        event.actorType === "agent" && "text-cyan",
                        event.actorType === "system" && "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium">{event.actor}</span>
                        <Badge variant="secondary" className="text-[8px]">{event.actorType}</Badge>
                        <Badge variant="outline" className={cn(
                          "text-[8px]",
                          event.riskLevel === "high" && "border-destructive/30 text-destructive",
                          event.riskLevel === "medium" && "border-warning/30 text-warning"
                        )}>
                          {event.riskLevel}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground">{event.action}</p>
                      <p className="text-[10px] text-muted-foreground">{event.details}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {event.module} • {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Governance Notice */}
      <Card className="border-gold/30 bg-gold/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gold">Audit & Governance</p>
              <p className="text-xs text-muted-foreground mt-1">
                All platform decisions are logged with full traceability. AI recommendations are advisory only - 
                final approval authority rests with authorized human reviewers. Audit trails are immutable 
                and available for compliance reporting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
