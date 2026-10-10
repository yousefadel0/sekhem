import { 
  Cpu, Activity, Clock, CheckCircle, AlertTriangle, 
  Play, Pause, RefreshCw, Shield, Brain, Search,
  TrendingUp, BarChart3
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { aiAgents } from "@/lib/demo-data"

export default function AgentWarRoomPage() {
  const onlineAgents = aiAgents.filter(a => a.status === "online" || a.status === "busy")
  const busyAgents = aiAgents.filter(a => a.status === "busy")
  const totalTasks = aiAgents.reduce((sum, a) => sum + a.tasksCompleted, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Cpu className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Assistant War Room</h1>
            <p className="text-sm text-muted-foreground">Central orchestration view of all AI specialist agents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5">
            <Shield className="w-3 h-3 mr-1" />
            Human Oversight Active
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Cpu className="w-5 h-5 text-success" />
              <Badge variant="secondary" className="text-[10px]">Live</Badge>
            </div>
            <p className="text-2xl font-bold text-foreground mt-2">{onlineAgents.length}</p>
            <p className="text-xs text-muted-foreground">Agents Online</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Activity className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">{busyAgents.length}</p>
            <p className="text-xs text-muted-foreground">Currently Active</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">{totalTasks}</p>
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <TrendingUp className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">98.5%</p>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {aiAgents.map((agent) => (
          <Card key={agent.id} className={cn(
            "relative overflow-hidden transition-all hover:shadow-lg",
            agent.status === "busy" && "border-cyan/30",
            agent.status === "online" && "border-success/30",
            agent.status === "offline" && "opacity-60"
          )}>
            {/* Status Indicator Bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-0.5",
              agent.status === "busy" && "bg-cyan",
              agent.status === "online" && "bg-success",
              agent.status === "idle" && "bg-muted",
              agent.status === "offline" && "bg-destructive"
            )} />

            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    agent.status === "busy" && "bg-cyan/20 border border-cyan/30",
                    agent.status === "online" && "bg-success/20 border border-success/30",
                    agent.status === "idle" && "bg-muted border border-border",
                    agent.status === "offline" && "bg-destructive/20 border border-destructive/30"
                  )}>
                    <Brain className={cn(
                      "w-5 h-5",
                      agent.status === "busy" && "text-cyan",
                      agent.status === "online" && "text-success",
                      agent.status === "idle" && "text-muted-foreground",
                      agent.status === "offline" && "text-destructive"
                    )} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{agent.role}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  agent.status === "busy" && "border-cyan/30 text-cyan",
                  agent.status === "online" && "border-success/30 text-success",
                  agent.status === "idle" && "border-muted-foreground/30 text-muted-foreground",
                  agent.status === "offline" && "border-destructive/30 text-destructive"
                )}>
                  {agent.status === "busy" && <Activity className="w-2.5 h-2.5 mr-1 animate-pulse" />}
                  {agent.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Current Task */}
              {agent.currentTask ? (
                <div className="bg-secondary/30 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground mb-1">Current Task</p>
                  <p className="text-xs text-foreground">{agent.currentTask}</p>
                </div>
              ) : (
                <div className="bg-secondary/20 rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground italic">No active task</p>
                </div>
              )}

              {/* Specializations */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Specializations</p>
                <div className="flex flex-wrap gap-1">
                  {agent.specialization.map((spec) => (
                    <Badge key={spec} variant="secondary" className="text-[9px] bg-secondary/50">
                      {spec}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle className="w-3 h-3" />
                  {agent.tasksCompleted} completed
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {agent.lastActive}
                </div>
              </div>

              {/* Human Approval Badge */}
              {agent.humanApprovalRequired && (
                <div className="flex items-center gap-2 p-2 bg-warning/10 rounded-lg border border-warning/20">
                  <Shield className="w-3.5 h-3.5 text-warning" />
                  <span className="text-[10px] text-warning font-medium">Human Approval Required for Actions</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-xs">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  View Logs
                </Button>
                {agent.status !== "offline" && (
                  <Button variant="outline" size="icon" className="h-7 w-7">
                    {agent.status === "busy" ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Important Notice */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">AI Assistant Governance Notice</p>
              <p className="text-xs text-muted-foreground mt-1">
                All AI technical assistants operate under strict governance controls. Agents cannot approve repository changes, deploy to production, 
                approve releases, bypass security policies, or access secrets without explicit human approval. 
                All agent actions are logged and auditable.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
