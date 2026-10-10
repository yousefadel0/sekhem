"use client"
import { useEffect, useRef, useState } from "react"
import { proposeTerminalCommand, terminalCommand, terminalInScope } from "@/lib/workspace-terminal"
import { TrustedRuntimeExecutionCard, type RuntimeActionSnapshot } from "./trusted-runtime-control"
import { outputFileReferences } from "@/lib/editor-document"
import { PaneResize } from "./ide-controls"

export function WorkspaceTerminal({ cwd, conversationId, runtimeId, runIds, disabled, ensureConversation, onChanged, onInspect, onAsk, onOpenReference }: {
  onOpenReference?: (reference: string) => void
  cwd?: string; conversationId: string | null; runtimeId?: string; runIds: string[]; disabled: boolean
  ensureConversation: () => Promise<string>; onChanged: (conversationId: string, runId?: string) => Promise<void>
  onInspect?: (runId: string) => void; onAsk?: (runId: string) => void
}) {
  const [command, setCommand] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [height, setHeight] = useState(320), [maximized, setMaximized] = useState(false)
  const [query, setQuery] = useState(""), [tab, setTab] = useState("all"), [historyIndex, setHistoryIndex] = useState(-1)
  const [snapshots, setSnapshots] = useState<Record<string, RuntimeActionSnapshot>>({})
  const log = useRef<HTMLDivElement>(null), scratch = useRef("")
  const find = useRef<HTMLInputElement>(null), followOutput = useRef(true)
  const [cleared, setCleared] = useState<string[]>([])
  const [localTabs, setLocalTabs] = useState<{ id: string; name: string; runs: string[] }[]>([])
  const [localTab, setLocalTab] = useState("all")
  const scopeKey = JSON.stringify([conversationId, runtimeId, cwd])
  const [loadedScope, setLoadedScope] = useState("")
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(`sekhem-terminal-tabs:${scopeKey}`) ?? "[]")
      if (Array.isArray(saved) && saved.length <= 8 && saved.every(t => t && typeof t.id === "string" && t.id.length <= 64 && typeof t.name === "string" && t.name.length <= 40 && Array.isArray(t.runs) && t.runs.length <= 200 && t.runs.every((id: unknown) => typeof id === "string" && /^rtrun_[a-zA-Z0-9_-]{1,128}$/.test(id)))) setLocalTabs(saved)
    } catch { /* Layout metadata is optional; durable history is loaded from the server. */ }
    setLoadedScope(scopeKey)
  }, [scopeKey])
  useEffect(() => { if (loadedScope === scopeKey) try { sessionStorage.setItem(`sekhem-terminal-tabs:${scopeKey}`, JSON.stringify(localTabs)) } catch {} }, [scopeKey, loadedScope, localTabs])
  useEffect(() => { if (followOutput.current && log.current) log.current.scrollTop = log.current.scrollHeight }, [snapshots, tab, localTab])
  const actions = runIds.flatMap(id => snapshots[id] && terminalInScope(snapshots[id].proposal, conversationId, cwd, runtimeId) ? [snapshots[id]] : [])
  const visibleActions = actions.filter(action => localTab === "all" || localTabs.find(t => t.id === localTab)?.runs.includes(action.proposal.runId))
  const history = [...visibleActions].sort((a, b) => b.proposal.createdAt.localeCompare(a.proposal.createdAt)).map(action => terminalCommand(action.proposal))
  const pending = useRef<{ command: string; id: string } | null>(null)
  function newTab() {
    if (localTabs.length >= 8) return
    const id = crypto.randomUUID()
    setLocalTabs(previous => [...previous, { id, name: `PowerShell ${previous.length + 2}`, runs: [] }]); setLocalTab(id); setTab("all"); setCommand(""); setHistoryIndex(-1)
  }
  useEffect(() => {
    window.addEventListener("sekhem-new-terminal", newTab)
    return () => window.removeEventListener("sekhem-new-terminal", newTab)
  }, [localTabs.length])
  async function submit() {
    if (busy || disabled || !cwd || !command.trim()) return
    setBusy(true); setError("")
    try {
      const id = await ensureConversation()
      if (!pending.current || pending.current.command !== command) pending.current = { command, id: crypto.randomUUID() }
      const result = await proposeTerminalCommand(id, command, pending.current.id)
      if (!result?.agentRunId) throw new Error("Proposal response unavailable. Refresh the conversation before continuing.")
      if (localTab !== "all") setLocalTabs(previous => previous.map(t => t.id === localTab ? { ...t, runs: [...new Set([...t.runs, result.agentRunId])].slice(-200) } : t))
      setCommand(""); setHistoryIndex(-1); pending.current = null; setTab("all")
      await onChanged(id, result.agentRunId)
    } catch (e) { setError(e instanceof Error ? e.message : "Terminal proposal unavailable") }
    finally { setBusy(false) }
  }
  return <section aria-label="Workspace Terminal" className={`ide-terminal ${maximized ? "ide-terminal-maximized" : ""}`} style={{ height: maximized ? undefined : height }} onKeyDown={e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") { e.preventDefault(); setCleared(visibleActions.map(a => a.proposal.runId)) }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); find.current?.focus() }
  }}>
    <PaneResize label="Resize Terminal" value={height} min={200} max={700} axis="y" reverse onChange={setHeight} />
    <header className="ide-terminal-toolbar"><h2>TERMINAL <span>PowerShell</span></h2><button type="button" aria-label={maximized ? "Restore Terminal" : "Maximize Terminal"} onClick={() => setMaximized(value => !value)}>{maximized ? "Restore" : "Maximize"}</button>
      <button type="button" onClick={() => { const selection = window.getSelection(); if (log.current && selection) { const range = document.createRange(); range.selectNodeContents(log.current); selection.removeAllRanges(); selection.addRange(range) } }}>Select output</button>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(visibleActions.filter(action => !cleared.includes(action.proposal.runId) && (tab === "all" || action.proposal.runId === tab)).map(action => `$ ${terminalCommand(action.proposal)}\n${action.execution?.result?.stdout ?? ""}\n${action.execution?.result?.stderr ?? ""}\nExit: ${action.execution?.result?.exitCode ?? "pending"}`).join("\n")) } catch { setError("Clipboard unavailable; select output and copy manually.") } }}>Copy output</button>
      <button type="button" disabled={localTabs.length >= 8} onClick={newTab}>New terminal tab</button>
    </header>
    <div className="ide-terminal-tabs" role="tablist" aria-label="PowerShell views"><button role="tab" aria-selected={localTab === "all"} onClick={() => { setLocalTab("all"); setTab("all"); setHistoryIndex(-1) }}>All durable actions</button>{localTabs.map(t => <span key={t.id}><button role="tab" aria-selected={localTab === t.id} onClick={() => { setLocalTab(t.id); setTab("all"); setHistoryIndex(-1) }}>{t.name}</button><button type="button" aria-label={`Close ${t.name}`} onClick={() => { setLocalTabs(previous => previous.filter(item => item.id !== t.id)); if (localTab === t.id) setLocalTab("all") }}>×</button></span>)}</div>
    <div className="ide-terminal-tabs" role="tablist" aria-label="Terminal history tabs"><button role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>PowerShell · All actions</button>{visibleActions.map(action => <button key={action.proposal.runId} role="tab" aria-selected={tab === action.proposal.runId} onClick={() => setTab(action.proposal.runId)} title={terminalCommand(action.proposal)}>{terminalCommand(action.proposal)}</button>)}</div>
    <div className="ide-find"><input ref={find} aria-label="Search terminal output" placeholder="Find command or output · Ctrl+F" value={query} onChange={e => setQuery(e.target.value)} /><span>30s / action · Human approval required</span>{cleared.length > 0 && <button type="button" onClick={() => setCleared([])}>Show saved history</button>}</div>
    <div ref={log} onScroll={() => { const el = log.current; if (el) followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50 }} className="ide-terminal-log" tabIndex={0} aria-label="Durable command history">
      <p className="text-xs opacity-70">Saved terminal actions for this conversation and workspace. Refresh restores durable results.</p>
      {conversationId && cwd && runtimeId && runIds.filter(id => id.startsWith("rtrun_")).map(id => {
        const snapshot = snapshots[id]
        const matches = !query || !snapshot || `${terminalCommand(snapshot.proposal)}\n${snapshot.execution?.result?.stdout ?? ""}\n${snapshot.execution?.result?.stderr ?? ""}`.toLowerCase().includes(query.toLowerCase())
        return <div key={id} hidden={cleared.includes(id) || localTab !== "all" && !localTabs.find(t => t.id === localTab)?.runs.includes(id) || (tab !== "all" && tab !== id) || !matches}><TrustedRuntimeExecutionCard runId={id}
          terminalScope={{ conversationId, cwd, runtimeId }} onSnapshot={snapshot => setSnapshots(previous => previous[id] === snapshot ? previous : { ...previous, [id]: snapshot })} onChanged={() => onChanged(conversationId)} onInspect={onInspect ? () => onInspect(id) : undefined} onAsk={onAsk ? () => onAsk(id) : undefined} />{onOpenReference && snapshot && terminalInScope(snapshot.proposal, conversationId, cwd, runtimeId) && outputFileReferences(`${snapshot.execution?.result?.stdout ?? ""}\n${snapshot.execution?.result?.stderr ?? ""}`).map(ref => <button type="button" key={ref} onClick={() => onOpenReference(ref)}>Open {ref}</button>)}</div>
      })}
    </div>
    <form onSubmit={e => { e.preventDefault(); void submit() }}>
      <label htmlFor="workspace-terminal-command" className="block font-mono text-xs break-all">PS {cwd ?? "Workspace unavailable"}&gt;</label>
      <textarea id="workspace-terminal-command" aria-label="PowerShell command" className="ide-command" rows={2} maxLength={2048}
        value={command} onChange={e => { setCommand(e.target.value); setHistoryIndex(-1) }} disabled={disabled || busy} placeholder="node --version"
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit() }
          if ((e.key === "ArrowUp" && e.currentTarget.selectionStart === 0 || e.key === "ArrowDown" && e.currentTarget.selectionEnd === command.length) && history.length) {
            e.preventDefault(); if (historyIndex === -1) scratch.current = command
            const next = Math.max(-1, Math.min(history.length - 1, historyIndex + (e.key === "ArrowUp" ? 1 : -1)))
            setHistoryIndex(next); setCommand(next === -1 ? scratch.current : history[next])
          }
        }} />
      <button type="submit" className="technical-button" disabled={disabled || busy || !cwd || !command.trim()}>{busy ? "Preparing proposal…" : "Review command"}</button>
    </form>
    <p className="ide-terminal-hint">Enter: Review · Shift+Enter: newline · ↑↓: history · Ctrl+L: clear view · Ctrl+F: find. No persistent shell session. Each action starts at workspace cwd.</p>
    {disabled && <p role="status">Terminal unavailable until the current workspace, conversation and terminal capability are ready.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
