"use client"

import Link from "next/link"
import { Search, Bell, ChevronDown, Compass, Building2 } from "lucide-react"
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

interface TopBarProps {
  walkthroughActive: boolean
  walkthroughStep: number
  onStartWalkthrough: () => void
}

export function TopBar({ walkthroughActive, walkthroughStep, onStartWalkthrough }: TopBarProps) {
  return (
    <header className={cn(
      "sticky top-0 z-40 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300",
      walkthroughActive ? "border-gold/30 bg-background/98" : "border-border"
    )}>
      {/* Walkthrough Active Indicator Bar */}
      {walkthroughActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold via-cyan to-gold animated-border" />
      )}

      <div className="flex h-full items-center justify-between px-6">
        {/* Left: Project Context Selector */}
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-10 gap-3 px-3 hover:bg-secondary/80 border border-transparent hover:border-border/50 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-gold" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground leading-tight">Community SONiC Sovereign Program</p>
                    <p className="text-[10px] text-muted-foreground">Active Project Context</p>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <div className="px-2 py-2 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Context</p>
              </div>
              <DropdownMenuItem className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-gold" />
                </div>
                <div>
                  <p className="text-sm font-medium">Community SONiC Sovereign Program</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-cyan" />
                </div>
                <div>
                  <p className="text-sm font-medium">OpenWiFi Regional Deployment</p>
                  <p className="text-xs text-muted-foreground">Planning</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">OpenLAN Enterprise Trial</p>
                  <p className="text-xs text-muted-foreground">Evaluation</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-muted-foreground">View All Programs</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {walkthroughActive && (
            <Badge className="bg-gold/20 text-gold border border-gold/30">
              <Compass className="w-3 h-3 mr-1.5" />
              Step {walkthroughStep} of 5
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
          {/* Guided Client Walkthrough Button */}
          <Button
            onClick={onStartWalkthrough}
            className={cn(
              "h-10 gap-2 px-5 transition-all duration-300 font-medium",
              walkthroughActive 
                ? "bg-gold text-background hover:bg-gold/90 shadow-lg shadow-gold/20" 
                : "bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 hover:border-gold/50"
            )}
          >
            <Compass className="w-4 h-4" />
            <span>{walkthroughActive ? "Exit Walkthrough" : "Guided Client Walkthrough"}</span>
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="h-9 w-9 relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-secondary/80">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/40 flex items-center justify-center text-xs font-bold text-gold">
                  MC
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-medium text-foreground">Michael Carter</p>
                  <p className="text-[10px] text-muted-foreground">Technical Director</p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
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
    </header>
  )
}
