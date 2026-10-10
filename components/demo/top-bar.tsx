"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, Bell, ChevronDown, Monitor, Presentation, AlertTriangle, Sparkles, Plus, Grid3X3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { projects, currentProject, approvals } from "@/lib/demo-data"
import { NewProgramWorkspaceDialog } from "@/components/demo/new-program-workspace-dialog"

interface DemoTopBarProps {
  strategicMode: boolean
  onStrategicModeToggle: () => void
  onAssistantOpen: () => void
}

export function DemoTopBar({ strategicMode, onStrategicModeToggle, onAssistantOpen }: DemoTopBarProps) {
  const [newProgramOpen, setNewProgramOpen] = useState(false)
  const pendingApprovals = approvals.filter(a => a.status === "pending").length
  const criticalApprovals = approvals.filter(a => a.status === "pending" && a.priority === "critical").length

  return (
    <header className={cn(
      "sticky top-0 z-40 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300",
      strategicMode ? "border-gold/30 bg-background/98" : "border-border"
    )}>
      {/* Strategic Mode Indicator Bar */}
      {strategicMode && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold via-cyan to-gold animated-border" />
      )}

      <div className="flex h-full items-center justify-between px-6">
        {/* Left: Project Selector */}
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 border-border bg-secondary/50 hover:bg-secondary max-w-[320px]">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  currentProject.status === "active" ? "bg-success animate-pulse" : 
                  currentProject.status === "planning" ? "bg-cyan" : "bg-warning"
                )} />
                <span className="text-sm font-medium truncate">{currentProject.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {projects.map((project) => (
                <DropdownMenuItem key={project.id} className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    project.status === "active" ? "bg-success" : 
                    project.status === "planning" ? "bg-cyan" : "bg-warning"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.phase}</p>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/demo/overview" className="flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" />
                  View All Programs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNewProgramOpen(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Program Workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {strategicMode && (
            <Badge className="bg-gold/20 text-gold border border-gold/30 animate-pulse">
              <Presentation className="w-3 h-3 mr-1.5" />
              Client Meeting Mode
            </Badge>
          )}
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search modules, documents, approvals..."
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-secondary/50 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/30 transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              <span>⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Environment Indicator */}
          <Badge variant="outline" className="hidden lg:flex border-cyan/30 text-cyan bg-cyan/5 text-[10px]">
            Phase 1 Activation
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={onAssistantOpen}
            className="hidden xl:flex gap-2 h-9 border-cyan/30 text-cyan hover:bg-cyan/10"
          >
            <Sparkles className="w-4 h-4" />
            Ask Sekhem Assistant
          </Button>

          {/* Strategic Mode Toggle */}
          <Button
            variant={strategicMode ? "default" : "outline"}
            size="sm"
            onClick={onStrategicModeToggle}
            className={cn(
              "gap-2 h-9 transition-all duration-300",
              strategicMode 
                ? "bg-gold text-background hover:bg-gold/90 shadow-lg shadow-gold/20" 
                : "border-gold/30 text-gold hover:bg-gold/10 hover:border-gold/50"
            )}
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden lg:inline">{strategicMode ? "Exit" : "Enter"} Meeting Mode</span>
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                <Bell className="w-4 h-4" />
                {pendingApprovals > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {pendingApprovals}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">{pendingApprovals} pending approvals</p>
              </div>
              {criticalApprovals > 0 && (
                <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <p className="text-xs font-medium">{criticalApprovals} critical approval(s) require attention</p>
                  </div>
                </div>
              )}
              {approvals.filter(a => a.status === "pending").slice(0, 3).map((approval) => (
                <DropdownMenuItem key={approval.id} className="flex flex-col items-start gap-1 py-2">
                  <div className="flex items-center gap-2 w-full">
                    <Badge variant="outline" className={cn(
                      "text-[9px] shrink-0",
                      approval.priority === "critical" && "border-destructive/50 text-destructive",
                      approval.priority === "high" && "border-warning/50 text-warning"
                    )}>
                      {approval.priority}
                    </Badge>
                    <p className="text-sm font-medium truncate">{approval.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{approval.module}</p>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center text-sm text-gold">
                View All Approvals
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-gold/10">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/40 flex items-center justify-center text-xs font-bold text-gold">
                  MC
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-medium text-foreground">Michael Carter</p>
                  <p className="text-[10px] text-muted-foreground">Technical Director</p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground hidden lg:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-2 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Michael Carter</p>
                <p className="text-xs text-muted-foreground">Technical Director</p>
                <Badge variant="outline" className="mt-2 text-[10px] border-gold/30 text-gold">
                  Enterprise Admin
                </Badge>
              </div>
              <DropdownMenuItem asChild>
                <Link href="/demo/admin-settings">Profile Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/demo/admin-settings">Team Management</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/demo/admin-settings">API Access</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" asChild>
                <Link href="/login">Sign Out</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <NewProgramWorkspaceDialog open={newProgramOpen} onOpenChange={setNewProgramOpen} />
    </header>
  )
}
