"use client"
import { useState, type ReactNode } from "react"
import { History, Maximize2, MessageCircle, Minimize2, Plus } from "lucide-react"
import { IconButton } from "./sekhem-primitives"
import { CONVERSATION_WORKSPACE_NOTICE } from "@/lib/sekhem-conversation"
import type { WorkspaceBinding } from "@/lib/sekhem-agent"
import type { ConversationSummaryDto, HistoricalContextView } from "@/lib/sekhem-conversation"

export function HistoricalContextControl({ sources, view, disabled, onSelect }: { sources: ConversationSummaryDto[]; view?: HistoricalContextView; disabled?: boolean; onSelect: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  return <details className="workspace-advanced p-2 text-xs" aria-label="Cross-chat historical context">
    <summary>{view?.state === "UNAVAILABLE" ? "Historical context unavailable" : view ? `Historical context: ${view.sourceTitle || "Selected chat"}` : "Use context from another chat"}</summary>
    <p>Selected messages are historical context only. Evidence and approvals are not transferred.</p>
    {view && <p role="status">{view.state === "READY" ? `${view.messageCount} historical messages selected` : "Source context is unavailable or changed. Select it again to revalidate."}</p>}
    <label>Source conversation<select aria-label="Source conversation" value={selected} disabled={disabled || busy} onChange={event => { setSelected(event.target.value); setError(false) }}>
      <option value="">Choose one conversation</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
    </select></label>
    <button type="button" className="technical-button" disabled={disabled || busy || !selected} onClick={() => { setBusy(true); setError(false); void onSelect(selected).catch(() => setError(true)).finally(() => setBusy(false)) }}>{busy ? "Checking context…" : "Use selected context"}</button>
    {error && <p role="alert">Historical context unavailable. No context or authorization was transferred.</p>}
  </details>
}

export function ConversationWorkspaceIndicator({ name, changed, unavailable }: { name?: string; changed?: boolean; unavailable?: boolean }) {
  return <p className="chat-conversation-title" role="status" aria-label="Conversation workspace">
    {name ? `This conversation uses ${name}` : "Conversation workspace unavailable"}
    {changed ? " · Workspace changed — start a new conversation to use the current folder" : unavailable && name ? " · Workspace unavailable" : ""}
  </p>
}

/** Compact context is presentation only; details retain the existing controls. */
export function ChatContextBar({ name, changed, unavailable, accessWarning, stale, onDetails, onActivity }: {
  name?: string; changed?: boolean; unavailable?: boolean; accessWarning?: boolean; stale?: boolean; onDetails: () => void; onActivity: () => void
}) {
  const status = changed ? "Workspace changed" : unavailable ? "Workspace unavailable" : accessWarning ? "Access needs attention" : stale ? "Updates unavailable" : null
  return <div className="chat-context-bar" aria-label="Conversation context">
    <span className="chat-context-name" title={name}>{name || "No workspace bound"}</span>
    {status && <span className="chat-context-warning" role="status">{status}</span>}
    <div className="chat-context-actions"><button type="button" className="technical-button" onClick={onActivity}>Activity</button><button type="button" className="technical-button" onClick={onDetails}>Details</button></div>
  </div>
}

export function ConversationWorkspaceNotice({ saved, active, onNew }: { saved?: WorkspaceBinding | null; active?: WorkspaceBinding | null; onNew: () => void }) {
  return <div className="workspace-notice" role="alert" aria-label="Conversation workspace changed">
    <strong>Conversation workspace changed</strong><p>{CONVERSATION_WORKSPACE_NOTICE}</p>
    {saved && <p>Saved workspace: {saved.name} · binding {saved.version}</p>}
    {active && <p>Current workspace: {active.name} · binding {active.version}{active.runtime ? ` · ${active.runtime.rootPath}` : ""}</p>}
    <p>Starting a new Chat does not transfer old evidence or grant file access.</p>
    <button type="button" className="technical-button" disabled={!active} onClick={onNew}>New Chat in current workspace</button>
  </div>
}

export function ProjectChat({ children, expanded, onExpand, onHistory, onNew, conversationTitle, projectName }: { children: ReactNode; expanded: boolean; onExpand: () => void; onHistory: () => void; onNew: () => void; conversationTitle?: string; projectName?: string }) {
  return <div className="project-chat">
    <header className="chat-panel-header"><div className="chat-panel-title"><MessageCircle size={15} /><h2>SEKHEM Agent</h2><span title={projectName}>{projectName ? "Connected to this project" : "Select a project"}</span></div><div className="chat-panel-actions"><IconButton label="Conversation history" onClick={onHistory}><History size={15} /></IconButton><IconButton label={expanded ? "Collapse chat" : "Expand chat"} onClick={onExpand}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconButton><IconButton label="New conversation" onClick={onNew}><Plus size={17} /></IconButton></div></header>
    <div className="chat-conversation-title" title={conversationTitle}>{conversationTitle || "New conversation"}</div>
    {children}
  </div>
}
