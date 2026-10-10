"use client"

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
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
  walkthroughActive: boolean
}

const navigationItems = [
  {
    category: "Core Command",
    items: [
      { icon: LayoutDashboard, label: "Command Center", active: true },
      { icon: Cpu, label: "AI Assistant War Room" },
      { icon: Brain, label: "AI CTO Office" },
    ]
  },
  {
    category: "Intelligence",
    items: [
      { icon: Radar, label: "R&D Radar" },
      { icon: Database, label: "Knowledge Base" },
      { icon: GitBranch, label: "Repo Intelligence" },
    ]
  },
  {
    category: "Execution",
    items: [
      { icon: Workflow, label: "Workflow Manager" },
      { icon: Wrench, label: "AI Patch Assistant" },
      { icon: Package, label: "Release Factory" },
    ]
  },
  {
    category: "Assurance",
    items: [
      { icon: Shield, label: "Security Gate" },
      { icon: FileCheck, label: "Audit & Approval Hub" },
      { icon: Activity, label: "Infrastructure Health" },
    ]
  },
  {
    category: "Expansion",
    items: [
      { icon: FlaskConical, label: "Lab Validation" },
    ]
  }
]

export function Sidebar({ walkthroughActive }: SidebarProps) {
  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50",
      walkthroughActive && "opacity-60"
    )}>
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-gold" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-foreground tracking-tight">Sekhem</h1>
            <p className="text-xs text-muted-foreground">Open Infrastructure Factory</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navigationItems.map((section) => (
          <div key={section.category} className="mb-6">
            <h3 className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {section.category}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.label}>
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      item.active
                        ? "bg-sidebar-accent text-gold"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.active && (
                      <ChevronRight className="w-4 h-4 ml-auto text-gold/50" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <HelpCircle className="w-4 h-4" />
          <span>Support</span>
        </button>
      </div>
    </aside>
  )
}
