"use client"
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react"
import { PaneResize } from "./ide-controls"
import { Home, FolderKanban, FolderOpen, MessagesSquare, FlaskConical, Layers3, Bot, ShieldCheck, Search, Settings2, X, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { IconButton } from "./sekhem-primitives"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"

export type WorkspaceSection = "home" | "projects" | "workspace" | "conversations" | "runs" | "approvals" | "search" | "settings"
const navigation = [
  ["home", "Home", Home], ["projects", "Projects", FolderKanban], ["workspace", "Workspace", FolderOpen],
  ["conversations", "Conversations", MessagesSquare], ["research", "R&D", FlaskConical], ["initiatives", "Initiatives", Layers3],
  ["runs", "Agent Runs", Bot], ["approvals", "Approvals", ShieldCheck], ["search", "Search", Search], ["settings", "Settings", Settings2],
] as const

export function PrimaryNavigation({ section, onNavigate, collapsed, onCollapse, runtime }: { section: WorkspaceSection; onNavigate: (section: WorkspaceSection) => void; collapsed: boolean; onCollapse: () => void; runtime?: WorkspaceRuntimeState }) {
  return <><div className="nav-caption"><span>WORKSPACE</span><IconButton label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={onCollapse}>{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</IconButton></div>
    <nav className="primary-navigation" aria-label="Primary navigation">{navigation.map(([id, label, Icon]) => {
      const unavailable = id === "research" || id === "initiatives"
      return <button key={id} type="button" title={unavailable ? `${label} — not available in this workspace` : label} aria-label={unavailable ? `${label} — unavailable` : label} disabled={unavailable} aria-current={section === id ? "page" : undefined} onClick={() => !unavailable && onNavigate(id as WorkspaceSection)}><Icon size={17} aria-hidden="true" /><span>{label}</span>{unavailable && <small>SOON</small>}</button>
    })}</nav>
  </>
}

type Drawer = "navigation" | "explorer" | "chat" | null
export function SekhemShell({ header, navigation: nav, explorer, workarea, chat, collapsed, drawer, onDrawer, mobileSurface, onSurface, chatExpanded, terminal, statusBar }: {
  terminal?: ReactNode; statusBar?: ReactNode;
  header: ReactNode; navigation: ReactNode; explorer: ReactNode; workarea: ReactNode; chat: ReactNode; collapsed: boolean;
  drawer: Drawer; onDrawer: (drawer: Drawer) => void; mobileSurface: "workspace" | "agent" | "chat"; onSurface: (surface: "workspace" | "agent" | "chat") => void; chatExpanded: boolean
}) {
  const root = useRef<HTMLElement>(null)
  const [small, setSmall] = useState(false)
  const [explorerWidth, setExplorerWidth] = useState(240), [agentWidth, setAgentWidth] = useState(380)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1199px)")
    const update = () => setSmall(query.matches)
    update(); query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  const modal = small ? drawer : null
  // A single Chat/composer stays mounted across expansion and responsive surfaces.
  useEffect(() => {
    if (!modal) return
    const panel = root.current?.querySelector<HTMLElement>(`[data-panel="${modal}"]`)
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length)
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onDrawer(null) }
      if (event.key === "Tab") {
        const nodes = focusable(); const first = nodes[0]; const last = nodes.at(-1)
        if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", keydown)
    return () => { document.removeEventListener("keydown", keydown); previous?.focus() }
  }, [modal, onDrawer])
  const panelProps = (name: Exclude<Drawer, null>) => ({ "data-panel": name, role: modal === name ? "dialog" : undefined, "aria-modal": modal === name ? true as const : undefined, inert: modal !== null && modal !== name ? true : undefined })
  return <main ref={root} style={{ "--ide-explorer-width": `${explorerWidth}px`, "--ide-agent-width": `${agentWidth}px` } as CSSProperties} className={`sekhem-shell unified-workspace ide-workspace ${collapsed ? "nav-collapsed" : ""} ${chatExpanded ? "chat-expanded" : ""}`} data-drawer={modal ?? "none"} data-surface={mobileSurface} aria-label="SEKHEM AI Engineering Workspace">
    <div inert={!!modal}>{header}</div>
    <div className="workspace-mobile-bar" inert={!!modal}>
      <nav className="surface-switch" aria-label="Workspace navigation"><button aria-pressed={mobileSurface === "workspace"} onClick={() => onSurface("workspace")}><FolderOpen size={16} />Workspace</button><button aria-pressed={mobileSurface === "chat"} onClick={() => onSurface("chat")}><MessagesSquare size={14} />Chat</button><button aria-pressed={mobileSurface === "agent"} onClick={() => onSurface("agent")}><Bot size={14} />Details</button></nav>
      <span className="workspace-flow-label">Project / Workspace / Files + Chat</span>
    </div>
    <div className="workspace-grid">
      {modal && <button className="workspace-scrim" aria-label="Close panel" tabIndex={-1} onClick={() => onDrawer(null)} />}
      <aside className="workspace-nav" aria-label="Navigation" {...panelProps("navigation")}><div className="drawer-close"><IconButton label="Close navigation" onClick={() => onDrawer(null)}><X size={18} /></IconButton></div>{nav}</aside>
      <aside className="workspace-files technical-panel" aria-label="Workspace explorer" {...panelProps("explorer")}><div className="drawer-close"><IconButton label="Close workspace files" onClick={() => onDrawer(null)}><X size={18} /></IconButton></div>{explorer}</aside>
      <div className="ide-explorer-resize"><PaneResize label="Resize Explorer" value={explorerWidth} min={180} max={420} onChange={setExplorerWidth} /></div>
      <div className="workspace-center" inert={!!modal}>{workarea}{terminal}</div>
      <div className="ide-agent-resize"><PaneResize label="Resize Agent panel" value={agentWidth} min={300} max={640} reverse onChange={setAgentWidth} /></div>
      <aside className="workspace-chat technical-panel" aria-label="Project chat" {...panelProps("chat")}><div className="drawer-close"><IconButton label="Close project chat" onClick={() => onDrawer(null)}><X size={18} /></IconButton></div>{chat}</aside>
    </div>
    <footer className="workspace-footer ide-status-bar" inert={!!modal}>{statusBar ?? <><span>SEKHEM</span><span>Governed workspace · Approval required for execution</span></>}</footer>
  </main>
}
