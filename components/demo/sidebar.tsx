"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Cpu, 
  Brain, 
  Radar, 
  Database, 
  GitBranch,
  Workflow,
  Wrench,
  Package,
  Shield,
  FileCheck,
  Activity,
  FlaskConical,
  Settings,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  Layers,
  AlertTriangle,
  Lock,
  SlidersHorizontal,
  Lightbulb
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface DemoSidebarProps {
  strategicMode: boolean
  collapsed: boolean
  onCollapse: () => void
}

type NavigationColor = "gold" | "cyan" | "success" | "warning" | "info"

type NavigationItem = {
  icon: LucideIcon
  label: string
  href: string
  badge?: string
}

type NavigationSection = {
  category: string
  color?: NavigationColor
  items: NavigationItem[]
}

const navigationItems: NavigationSection[] = [
  {
    category: "Overview",
    items: [
      { icon: Layers, label: "Platform Overview", href: "/demo/overview", badge: "Phase 1" },
    ]
  },
  {
    category: "Core Command",
    color: "gold",
    items: [
      { icon: LayoutDashboard, label: "Command Center", href: "/demo/command-center", badge: "Enabled" },
      { icon: Cpu, label: "AI Assistant War Room", href: "/demo/agent-war-room", badge: "Running" },
      { icon: Brain, label: "AI Technical Planner", href: "/demo/ai-cto" },
      { icon: Workflow, label: "Initiatives", href: "/demo/initiatives" },
    ]
  },
  {
    category: "Intelligence",
    color: "cyan",
    items: [
      { icon: Radar, label: "R&D Radar", href: "/demo/rd-radar", badge: "Primary" },
      { icon: Lightbulb, label: "New Initiative Intake", href: "/demo/initiatives/new", badge: "Submit" },
      { icon: Database, label: "Knowledge Base", href: "/demo/knowledge-base" },
      { icon: GitBranch, label: "Repo Intelligence", href: "/demo/repo-intelligence", badge: "Review" },
    ]
  },
  {
    category: "Execution",
    color: "success",
    items: [
      { icon: Wrench, label: "Sandboxed Code Draft", href: "/demo/code-draft-demo", badge: "Sandbox" },
      { icon: Package, label: "Release Factory", href: "/demo/release-factory", badge: "2 RC" },
      { icon: Shield, label: "Security Gate", href: "/demo/security-gate", badge: "Gate" },
    ]
  },
  {
    category: "Assurance",
    color: "warning",
    items: [
      { icon: AlertTriangle, label: "Failure / Blocker Center", href: "/demo/failure-blocker-center", badge: "Blocked" },
      { icon: FileCheck, label: "Audit & Approvals", href: "/demo/audit-approvals", badge: "7 Pending" },
      { icon: Activity, label: "Infrastructure Health", href: "/demo/infrastructure-health" },
    ]
  },
  {
    category: "Expansion",
    color: "info",
    items: [
      { icon: Lock, label: "Locked Advanced Modules", href: "/demo/locked-advanced-modules", badge: "Add-on" },
      { icon: FlaskConical, label: "Lab Validation", href: "/demo/lab-validation-support", badge: "Locked" },
      { icon: SlidersHorizontal, label: "Admin / Settings", href: "/demo/admin-settings" },
    ]
  },
]

const colorMap: Record<NavigationColor, string> = {
  gold: "text-gold",
  cyan: "text-cyan",
  success: "text-success",
  warning: "text-warning",
  info: "text-info"
}

const dotColorMap: Record<NavigationColor, string> = {
  gold: "bg-gold",
  cyan: "bg-cyan",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info"
}

export function DemoSidebar({ strategicMode, collapsed, onCollapse }: DemoSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-all duration-300",
      collapsed ? "w-16" : "w-64",
      strategicMode && "dim-element"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {collapsed ? (
            <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <span className="text-gold font-bold text-lg">S</span>
            </div>
          ) : (
            <div className="overflow-hidden">
              <div className="text-lg font-bold tracking-[0.28em] text-gold leading-none">SEKHEM</div>
              <p className="text-[10px] text-muted-foreground truncate mt-1">Open Infrastructure Factory</p>
            </div>
          )}
        </div>
      </div>

      {/* Environment Badge */}
      {!collapsed && (
        <div className="px-4 py-2 border-b border-sidebar-border">
          <Badge variant="outline" className="w-full justify-center text-[10px] border-cyan/30 text-cyan bg-cyan/5">
            Phase 1 Activation
          </Badge>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navigationItems.map((section) => (
          <div key={section.category} className="mb-4">
            {!collapsed && (
              <div className="flex items-center gap-2 px-2 mb-1.5">
                {section.color && (
                  <div className={cn("w-1.5 h-1.5 rounded-full", dotColorMap[section.color])} />
                )}
                <h3 className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  section.color ? colorMap[section.color] : "text-muted-foreground"
                )}>
                  {section.category}
                </h3>
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
                        isActive
                          ? "bg-sidebar-accent text-gold shadow-sm"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                        collapsed && "justify-center px-2"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className={cn(
                        "shrink-0",
                        collapsed ? "w-5 h-5" : "w-4 h-4",
                        isActive && "text-gold"
                      )} />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-secondary/80">
                              {item.badge}
                            </Badge>
                          )}
                          {isActive && (
                            <ChevronRight className="w-3 h-3 text-gold/50" />
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        <Link href="/demo/admin-settings" className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
          collapsed && "justify-center px-2"
        )}>
          <Settings className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
          {!collapsed && <span>Admin / Settings</span>}
        </Link>
        <Link href="/demo/support" className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
          collapsed && "justify-center px-2"
        )}>
          <HelpCircle className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
          {!collapsed && <span>Support</span>}
        </Link>
        
        {/* Collapse Toggle */}
        <button 
          onClick={onCollapse}
          className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
            collapsed && "justify-center px-2"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
