import { FlaskConical, Play, CheckCircle, Clock, AlertTriangle, Wifi, Network, ChevronRight, Lock, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { validationScenarios } from "@/lib/demo-data"

export default function LabValidationPage() {
  const passedScenarios = validationScenarios.filter(s => s.status === "passed")
  const runningScenarios = validationScenarios.filter(s => s.status === "running")

  return (
    <div className="p-6 space-y-6">
      {/* Locked Banner */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Module Locked – Activation Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                Lab Validation & Support requires advanced activation and dedicated infrastructure.
                This preview shows module capabilities. Request activation review to enable full functionality.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-info/20 border border-info/30 flex items-center justify-center">
            <FlaskConical className="w-6 h-6 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lab Validation & Support</h1>
            <p className="text-sm text-muted-foreground">Validation scenarios, diagnostics, and expansion readiness</p>
          </div>
        </div>
        <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5">
          <Lock className="w-3 h-3 mr-1" />
          Locked Module
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <FlaskConical className="w-5 h-5 text-info" />
            <p className="text-2xl font-bold text-foreground mt-2">{validationScenarios.length}</p>
            <p className="text-xs text-muted-foreground">Scenarios</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">{passedScenarios.length}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Play className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">{runningScenarios.length}</p>
            <p className="text-xs text-muted-foreground">Running</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <p className="text-2xl font-bold text-foreground mt-2">
              {validationScenarios.filter(s => s.status === "not-started").length}
            </p>
            <p className="text-xs text-muted-foreground">Not Started</p>
          </CardContent>
        </Card>
      </div>

      {/* Validation Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {validationScenarios.map((scenario) => (
            <div key={scenario.id} className={cn(
              "p-4 rounded-lg border transition-colors",
              scenario.status === "passed" && "bg-success/5 border-success/30",
              scenario.status === "running" && "bg-cyan/5 border-cyan/30",
              scenario.status === "failed" && "bg-destructive/5 border-destructive/30",
              scenario.status === "not-started" && "bg-secondary/30 border-border"
            )}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{scenario.name}</h3>
                    <Badge variant="secondary" className="text-[9px]">{scenario.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{scenario.description}</p>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px] shrink-0",
                  scenario.status === "passed" && "border-success/30 text-success",
                  scenario.status === "running" && "border-cyan/30 text-cyan",
                  scenario.status === "failed" && "border-destructive/30 text-destructive",
                  scenario.status === "not-started" && "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {scenario.status === "running" && <Play className="w-2.5 h-2.5 mr-1 animate-pulse" />}
                  {scenario.status === "passed" && <CheckCircle className="w-2.5 h-2.5 mr-1" />}
                  {scenario.status}
                </Badge>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      scenario.status === "passed" && "bg-success",
                      scenario.status === "running" && "bg-cyan",
                      scenario.status === "failed" && "bg-destructive",
                      scenario.status === "not-started" && "bg-muted"
                    )}
                    style={{ width: `${(scenario.passedSteps / scenario.steps) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {scenario.passedSteps}/{scenario.steps} steps
                </span>
              </div>

              {scenario.lastRun && (
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Last run: {new Date(scenario.lastRun).toLocaleString()}</span>
                  {scenario.duration && <span>Duration: {scenario.duration}</span>}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Expansion Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expansion Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-info/20 border border-info/30 flex items-center justify-center">
                  <Wifi className="w-5 h-5 text-info" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">OpenWiFi Integration</h3>
                  <p className="text-xs text-muted-foreground">WiFi access point management</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] border-info/30 text-info">
                Future Expansion
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                Planned integration with OpenWiFi for unified open infrastructure management.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-info/20 border border-info/30 flex items-center justify-center">
                  <Network className="w-5 h-5 text-info" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">OpenLAN Integration</h3>
                  <p className="text-xs text-muted-foreground">Enterprise LAN management</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] border-info/30 text-info">
                Future Expansion
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                Planned integration with OpenLAN for enterprise network orchestration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
