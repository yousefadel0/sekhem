"use client"

import { useState } from "react"
import { DemoSidebar } from "@/components/demo/sidebar"
import { DemoTopBar } from "@/components/demo/top-bar"
import { DemoRouteBoundary } from "@/components/demo/demo-route-boundary"
import { AiAssistantPanel, AiAssistantTrigger } from "@/components/demo/ai-assistant-panel"
import { cn } from "@/lib/utils"

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [strategicMode, setStrategicMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className={cn(
      "min-h-screen bg-background",
      strategicMode && "strategic-mode"
    )}>
      {/* Sidebar */}
      <DemoSidebar 
        strategicMode={strategicMode}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      {/* Main Content */}
      <div className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "ml-16" : "ml-64"
      )}>
        {/* Top Bar */}
        <DemoTopBar 
          strategicMode={strategicMode}
          onStrategicModeToggle={() => setStrategicMode(!strategicMode)}
          onAssistantOpen={() => setAssistantOpen(true)}
        />
        
        {/* Page Content */}
        <main className="min-h-[calc(100vh-4rem)]">
          <DemoRouteBoundary>{children}</DemoRouteBoundary>
        </main>
      </div>

      {/* Strategic Mode Overlay */}
      {strategicMode && (
        <div className="fixed inset-0 pointer-events-none z-[60]">
          <div className="absolute inset-0 bg-gradient-to-b from-gold/5 via-transparent to-gold/5" />
        </div>
      )}

      {/* AI Technical Assistant */}
      <AiAssistantPanel 
        isOpen={assistantOpen} 
        onClose={() => setAssistantOpen(false)} 
      />
      {!assistantOpen && (
        <AiAssistantTrigger onClick={() => setAssistantOpen(true)} />
      )}
    </div>
  )
}
