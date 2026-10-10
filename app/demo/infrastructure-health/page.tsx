import { Activity, Server, Cpu, HardDrive, MemoryStick, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { servers } from "@/lib/demo-data"

export default function InfrastructureHealthPage() {
  const healthyServers = servers.filter(s => s.status === "healthy")
  const warningServers = servers.filter(s => s.status === "warning")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-warning/20 border border-warning/30 flex items-center justify-center">
            <Activity className="w-6 h-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Infrastructure Health</h1>
            <p className="text-sm text-muted-foreground">3-server architecture status and operational readiness</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            warningServers.length > 0 
              ? "border-warning/30 text-warning bg-warning/5" 
              : "border-success/30 text-success bg-success/5"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full mr-1.5",
              warningServers.length > 0 ? "bg-warning" : "bg-success animate-pulse"
            )} />
            {warningServers.length > 0 ? "Degraded" : "All Systems Operational"}
          </Badge>
          <Button variant="outline" size="sm" className="text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Server className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">{healthyServers.length}/{servers.length}</p>
            <p className="text-xs text-muted-foreground">Servers Healthy</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Activity className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">99.2%</p>
            <p className="text-xs text-muted-foreground">Platform Uptime</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">45d</p>
            <p className="text-xs text-muted-foreground">Current Uptime</p>
          </CardContent>
        </Card>
        <Card className={cn("bg-card/50", warningServers.length > 0 && "border-warning/30")}>
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">{warningServers.length}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Server Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {servers.map((server) => (
          <Card key={server.id} className={cn(
            "transition-all hover:shadow-lg",
            server.status === "healthy" && "border-success/20",
            server.status === "warning" && "border-warning/30",
            server.status === "critical" && "border-destructive/30"
          )}>
            {/* Status Bar */}
            <div className={cn(
              "h-1",
              server.status === "healthy" && "bg-success",
              server.status === "warning" && "bg-warning",
              server.status === "critical" && "bg-destructive"
            )} />

            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    server.status === "healthy" && "bg-success/20 border border-success/30",
                    server.status === "warning" && "bg-warning/20 border border-warning/30"
                  )}>
                    <Server className={cn(
                      "w-5 h-5",
                      server.status === "healthy" && "text-success",
                      server.status === "warning" && "text-warning"
                    )} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{server.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{server.role}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  server.status === "healthy" && "border-success/30 text-success",
                  server.status === "warning" && "border-warning/30 text-warning"
                )}>
                  {server.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Resource Metrics */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">CPU</span>
                  </div>
                  <span className={cn(
                    "font-medium",
                    server.cpu > 80 ? "text-destructive" :
                    server.cpu > 60 ? "text-warning" : "text-foreground"
                  )}>{server.cpu}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      server.cpu > 80 ? "bg-destructive" :
                      server.cpu > 60 ? "bg-warning" : "bg-success"
                    )}
                    style={{ width: `${server.cpu}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <MemoryStick className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Memory</span>
                  </div>
                  <span className={cn(
                    "font-medium",
                    server.memory > 80 ? "text-destructive" :
                    server.memory > 60 ? "text-warning" : "text-foreground"
                  )}>{server.memory}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      server.memory > 80 ? "bg-destructive" :
                      server.memory > 60 ? "bg-warning" : "bg-success"
                    )}
                    style={{ width: `${server.memory}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Disk</span>
                  </div>
                  <span className={cn(
                    "font-medium",
                    server.disk > 80 ? "text-destructive" :
                    server.disk > 60 ? "text-warning" : "text-foreground"
                  )}>{server.disk}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      server.disk > 80 ? "bg-destructive" :
                      server.disk > 60 ? "bg-warning" : "bg-success"
                    )}
                    style={{ width: `${server.disk}%` }}
                  />
                </div>
              </div>

              {/* Services */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-2">Services</p>
                <div className="space-y-1.5">
                  {server.services.map((service) => (
                    <div key={service.name} className="flex items-center justify-between text-xs p-2 bg-secondary/30 rounded">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          service.status === "running" && "bg-success",
                          service.status === "degraded" && "bg-warning",
                          service.status === "stopped" && "bg-muted-foreground",
                          service.status === "error" && "bg-destructive"
                        )} />
                        <span>{service.name}</span>
                      </div>
                      {service.port && (
                        <span className="text-muted-foreground">:{service.port}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Uptime */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium">{server.uptime}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Architecture Note */}
      <Card className="border-cyan/30 bg-cyan/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Server className="w-5 h-5 text-cyan shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-cyan">Target Architecture</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sekhem operates on a 3-server architecture: Application Node (frontend, API, AI gateway), 
                Engineering Node (Source Control Platform, workflows, build agents), and Data Node (databases, storage, monitoring). 
                This is the recommended Phase 1 deployment topology.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
