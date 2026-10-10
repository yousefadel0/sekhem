"use client"
import { useEffect, useState, type ComponentProps } from "react"
import { RuntimeFileViewer } from "./workspace-runtime"
import { FilePanel } from "./agent-workspace"
import type { WorkspaceFile, AgentRunSummary } from "@/lib/sekhem-agent"
import { ExactChangePreview } from "../chat/implementation-summary"
import { EditorLocation, EditorProposals, EditorSavedRuns } from "./source-editor"

type RuntimeView = Pick<ComponentProps<typeof RuntimeFileViewer>, "binding" | "initial">
type Tab = { path: string; runtime?: RuntimeView; file?: WorkspaceFile }
export function WorkspaceEditor({ runtime, file, available, status, error, ensureConversation, onAnalyze, readAuthorized, location, workflow, savedRuns = [], onReviewProposal, onSaveProposed }: {
  onSaveProposed?: (id: string) => void; savedRuns?: Array<{ id: string; title: string; createdAt: string }>; onReviewProposal?: () => void
  workflow?: AgentRunSummary["workflow"]
  location?: { path: string; line: number }
  runtime?: RuntimeView; file: WorkspaceFile | null; available: boolean; status: string; error: string | null
  ensureConversation: ComponentProps<typeof RuntimeFileViewer>["ensureConversation"]; onAnalyze: ComponentProps<typeof RuntimeFileViewer>["onAnalyze"]; readAuthorized?: boolean
}) {
  const [tabs, setTabs] = useState<Tab[]>([]), [active, setActive] = useState(""), [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState("")
  const [split, setSplit] = useState(false), [secondary, setSecondary] = useState("")
  function closeActive() {
    if (dirty[active] && !window.confirm("Discard this unsaved local draft?")) return
    setTabs(previous => previous.filter(item => item.path !== active)); setActive(tabs.find(item => item.path !== active)?.path ?? "")
    setDirty(previous => ({ ...previous, [active]: false }))
  }
  useEffect(() => {
    const command = (event: Event) => {
      const action = (event as CustomEvent<string>).detail
      if (action === "split") { setSplit(value => !value); setSecondary(active) }
      if (action === "close") closeActive()
      if (action === "find") document.querySelector<HTMLInputElement>('.ide-file-content:not([hidden]) input[aria-label="Find in file"]')?.focus()
    }
    window.addEventListener("sekhem-editor-command", command)
    return () => window.removeEventListener("sekhem-editor-command", command)
  }, [active, tabs, dirty])
  useEffect(() => {
    const next = runtime ? { path: runtime.initial.operation.relativePath, runtime } : file ? { path: file.path, file } : null
    if (!next) return
    if (!tabs.some(tab => tab.path === next.path) && tabs.length >= 12) { setNotice("Close an editor tab before opening another (12-tab limit)."); return }
    if (dirty[next.path] && tabs.some(tab => tab.path === next.path)) { setNotice("Local draft retained. Close/discard it before replacing this tab with a newer observation."); setActive(next.path); return }
    setTabs(previous => [...previous.filter(tab => tab.path !== next.path), next]); setActive(next.path)
  }, [runtime?.initial.operation.operationId, file])
  return <EditorSavedRuns.Provider value={savedRuns}><EditorProposals.Provider value={workflow?.proposal.changes}><EditorLocation.Provider value={location}><section className="ide-editor" aria-label="Workspace editor">
    <div role="tablist" aria-label="Open files" className="ide-file-tabs">{tabs.map(tab => <div key={tab.path} className="ide-file-tab">
      <button role="tab" aria-selected={active === tab.path} title={tab.path} onClick={() => { if (split) setSecondary(active); setActive(tab.path) }}>{tab.path.split(/[\\/]/).at(-1)}{dirty[tab.path] ? " ●" : ""}</button>
      <button type="button" aria-label={`Close ${tab.path}`} onClick={() => {
        if (dirty[tab.path] && !window.confirm("Discard this unsaved local draft?")) return
        setTabs(previous => previous.filter(item => item.path !== tab.path)); if (active === tab.path) setActive(tabs.find(item => item.path !== tab.path)?.path ?? "")
        setDirty(previous => ({ ...previous, [tab.path]: false })); setNotice("")
      }}>×</button></div>)}</div>
    {notice && <p role="status">{notice}</p>}
    {workflow?.proposal && <details className="ide-editor-proposal"><summary>Proposed change · {workflow.proposal.state} · Approval: {workflow.approval?.state ?? "Required"}</summary>
      <ExactChangePreview changes={workflow.proposal.changes} /><p>Proposal content is not workspace source. Approval does not imply a persisted change. Read the file again to inspect a verified observation.</p>
      {onReviewProposal && <button type="button" onClick={onReviewProposal}>Review / Approve / Reject in existing workflow</button>}
      <details><summary>Proposal identity</summary><p>{workflow.proposal.id} · v{workflow.proposal.version} · {workflow.proposal.digest}</p></details>
    </details>}
    {!tabs.length && <div className="ide-editor-empty"><strong>SEKHEM</strong><p>Open a file from Explorer</p><small>Verified sources · Governed changes</small></div>}
    {status === "Loading" && <p role="status">Reading selected file through the current workspace…</p>}{error && <p role="alert">{error}</p>}
    <div className="ide-editor-toolbar"><button type="button" disabled={!tabs.length} aria-pressed={split} onClick={() => { setSplit(value => !value); setSecondary(tabs.find(t => t.path !== active)?.path ?? active) }}>Split editor</button>{split && <span>Select another tab to compare verified sources</span>}</div>
    <div className={split ? "ide-editor-panes ide-editor-split" : "ide-editor-panes"}>{tabs.map(tab => <div key={tab.path} hidden={active !== tab.path && (!split || secondary !== tab.path)} role="tabpanel" aria-label={tab.path} className="ide-file-content">
      {tab.runtime ? <RuntimeFileViewer onSaveProposed={onSaveProposed} {...tab.runtime} available={available} readAuthorized={readAuthorized} ensureConversation={ensureConversation} onAnalyze={onAnalyze} onDirty={value => setDirty(previous => ({ ...previous, [tab.path]: value }))} />
        : <FilePanel file={available ? tab.file ?? null : null} status={available ? tab.file?.status ?? status : "Unavailable"} error={error} onOpen={() => {}} onDirty={value => setDirty(previous => ({ ...previous, [tab.path]: value }))} />}
    </div>)}</div>
  </section></EditorLocation.Provider></EditorProposals.Provider></EditorSavedRuns.Provider>
}
