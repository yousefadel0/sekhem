import { Workflow, Play, Pause, CheckCircle, XCircle, Clock, ChevronRight, RotateCcw, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { workflows } from "@/lib/demo-data"

export default function WorkflowManagerPage() {
  const runningWorkflows = workflows.filter(w => w.status === "running")
  const failedWorkflows = workflows.filter(w => w.status === "failed")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center">
            <Workflow className="w-6 h-6 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workflow Manager</h1>
            <p className="text-sm text-muted-foreground">Controlled workflow automation and orchestration</p>
          </div>
        </div>
        <Badge variant="outline" className="border-success/30 text-success bg-success/5">
          Active
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Play className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">{runningWorkflows.length}</p>
            <p className="text-xs text-muted-foreground">Running</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {workflows.filter(w => w.status === "completed").length}
            </p>
            <p className="text-xs text-muted-foreground">Completed Today</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", failedWorkflows.length > 0 && "border-destructive/30")}>
          <CardContent className="p-4">
            <XCircle className="w-5 h-5 text-destructive" />
            <p className="text-2xl font-bold text-foreground mt-2">{failedWorkflows.length}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">23</p>
            <p className="text-xs text-muted-foreground">Runs This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Workflows */}
      <div className="space-y-4">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className={cn(
            "transition-all",
            workflow.status === "running" && "border-cyan/30",
            workflow.status === "failed" && "border-destructive/30"
          )}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    workflow.status === "running" && "bg-cyan/20 border border-cyan/30",
                    workflow.status === "completed" && "bg-success/20 border border-success/30",
                    workflow.status === "failed" && "bg-destructive/20 border border-destructive/30"
                  )}>
                    <Workflow className={cn(
                      "w-5 h-5",
                      workflow.status === "running" && "text-cyan",
                      workflow.status === "completed" && "text-success",
                      workflow.status === "failed" && "text-destructive"
                    )} />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{workflow.name}</h3>
                    <p className="text-xs text-muted-foreground">{workflow.trigger}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    workflow.status === "running" && "border-cyan/30 text-cyan",
                    workflow.status === "completed" && "border-success/30 text-success",
                    workflow.status === "failed" && "border-destructive/30 text-destructive"
                  )}>
                    {workflow.status === "running" && <Play className="w-2.5 h-2.5 mr-1 animate-pulse" />}
                    {workflow.status}
                  </Badge>
                  {workflow.duration && (
                    <span className="text-xs text-muted-foreground">{workflow.duration}</span>
                  )}
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                {workflow.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs",
                      step.status === "completed" && "bg-success/20 text-success",
                      step.status === "running" && "bg-cyan/20 text-cyan",
                      step.status === "pending" && "bg-secondary text-muted-foreground",
                      step.status === "failed" && "bg-destructive/20 text-destructive",
                      step.status === "skipped" && "bg-muted text-muted-foreground"
                    )}>
                      {step.status === "completed" && <CheckCircle className="w-3.5 h-3.5" />}
                      {step.status === "running" && <Play className="w-3 h-3 animate-pulse" />}
                      {step.status === "pending" && <Clock className="w-3 h-3" />}
                      {step.status === "failed" && <XCircle className="w-3.5 h-3.5" />}
                      {step.status === "skipped" && <span>-</span>}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className={cn(
                        "text-xs",
                        step.status === "pending" && "text-muted-foreground",
                        step.status === "skipped" && "text-muted-foreground line-through"
                      )}>
                        {step.name}
                      </span>
                      {step.duration && (
                        <span className="text-[10px] text-muted-foreground">{step.duration}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                {workflow.status === "running" && (
                  <Button size="sm" variant="outline" className="text-xs">
                    <Pause className="w-3 h-3 mr-1" />
                    Pause
                  </Button>
                )}
                {workflow.status === "failed" && (
                  <Button size="sm" variant="outline" className="text-xs border-cyan/30 text-cyan">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-xs ml-auto">
                  View Details <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
