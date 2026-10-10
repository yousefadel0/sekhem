"use client"
import { useEffect, useState } from "react"
import { Folder, FolderOpen, FileText, FileCode2, FileJson2, Search, ChevronRight, ChevronDown } from "lucide-react"
import { getWorkspaceTree, type WorkspaceBinding, type WorkspaceNode } from "@/lib/sekhem-agent"
import { RuntimeDirectory, WorkspaceFolderSelector, RuntimeWorkspaceSearch } from "./workspace-runtime"
import { WorkspaceReadGrantPanel } from "./workspace-read-grant"
import { WorkspaceRuntimeSummary, SavedObservationStatus } from "./sekhem-primitives"
import { workspaceConnectionPresentation, type RuntimeInventory, type WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"

function Directory({ binding, path, selectedPath, onOpen, query }: { binding: WorkspaceBinding; path: string; selectedPath?: string; onOpen: (path: string) => void; query: string }) {
  const [children, setChildren] = useState<WorkspaceNode[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setChildren(null); setError(null)
    void getWorkspaceTree(binding, path).then(tree => {
      if (active) { if (!tree) { setError("Workspace listing unavailable"); return }; setChildren(tree.root.children ?? []); setWarning(tree.truncated ? "Listing limited by workspace safety bounds." : tree.warnings.join(" ") || null) }
    }).catch(error => { if (active) setError(error.status === 403 ? "Unauthorized directory access" : error.message) })
    return () => { active = false }
  }, [binding.id, binding.version, path])
  if (error) return <p role="alert" className="p-2 text-xs text-amber">{error}</p>
  if (!children) return <p role="status" className="p-2 text-xs text-muted-foreground">Loading files…</p>
  return <div className={path ? "ml-3 border-l border-border/40 pl-1" : ""}>
    {children.length === 0 && <p className="p-2 text-xs text-muted-foreground">No accessible files</p>}
    {children.filter(node => node.type === "directory" || node.path.toLowerCase().includes(query.toLowerCase())).map(node => <div key={node.path}>
      <button type="button" className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2 focus-visible:ring-1 focus-visible:ring-lime"
        title={node.path} aria-expanded={node.type === "directory" ? expanded.has(node.path) : undefined}
        aria-current={node.type === "file" && node.path === selectedPath ? "true" : undefined}
        style={node.path === selectedPath ? { background: "var(--surface-2)", color: "var(--lime)" } : undefined}
        onClick={() => node.type === "file" ? onOpen(node.path) : setExpanded(previous => { const next = new Set(previous); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next })}>
        {node.type === "directory" ? <>{expanded.has(node.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{expanded.has(node.path) ? <FolderOpen size={14} className="file-icon-folder" /> : <Folder size={14} className="file-icon-folder" />}</> : /\.(json|ya?ml)$/.test(node.name) ? <FileJson2 size={14} className="ml-3 shrink-0 text-amber" /> : /\.(tsx?|jsx?|html|css|xml)$/.test(node.name) ? <FileCode2 size={14} className="ml-3 shrink-0 text-cyan" /> : <FileText size={14} className="ml-3 shrink-0 text-muted-foreground" />}
        <span className="truncate">{node.name}</span>
        {node.metadata?.kind === "image" && <span className="text-[10px] text-muted-foreground">Image understanding unavailable</span>}
        {["archive", "binary"].includes(node.metadata?.kind ?? "") && <span className="text-[10px] text-muted-foreground">Content unsupported</span>}
      </button>
      {node.type === "directory" && expanded.has(node.path) && <Directory binding={binding} path={node.path} selectedPath={selectedPath} onOpen={onOpen} query={query} />}
    </div>)}
    {warning && <p className="p-2 text-xs text-amber">{warning}</p>}
  </div>
}

export function WorkspaceExplorer({ binding, status, error, selectedPath, onOpen, projectId, ensureConversation, onChanged, runtime, inventory, requestedRead, onReadAllowed, onReadCancel, onConnect }: { binding: WorkspaceBinding | null; status: string; error: string | null; selectedPath?: string; onOpen: (path: string) => void; projectId?: string | null; ensureConversation?: (binding?: import("@/lib/sekhem-agent").RuntimeWorkspaceBinding) => Promise<string>; onChanged?: () => Promise<void>; runtime?: WorkspaceRuntimeState; inventory?: RuntimeInventory; requestedRead?: string; onReadAllowed?: () => Promise<void>; onReadCancel?: () => void; onConnect?: () => void }) {
  const [query, setQuery] = useState("")
  useEffect(() => setQuery(""), [binding?.id, binding?.version])
  const unauthenticated = status === "AUTHENTICATION_REQUIRED" || inventory?.authenticationRequired
  const connection = workspaceConnectionPresentation(binding?.runtime, inventory)
  const selector = !unauthenticated && projectId && ensureConversation && onChanged ? <WorkspaceFolderSelector key={projectId} projectId={projectId} boundRuntimeId={binding?.runtime?.runtimeId} inventory={inventory} ensureConversation={ensureConversation} onChanged={onChanged} /> : null
  const local = binding?.location === "TRUSTED_RUNTIME"
  const available = !unauthenticated && !error && ["READY", "VERIFYING", "DIRECTORY_MISSING"].includes(status)
  const labels: Record<string, string> = { READY: "Folder connected", VERIFYING: "Confirm folder access to open files", OFFLINE: "Computer is offline — cached folder identity only", REVOKED: "Computer access was revoked", EXPIRED_GRANT: "Read access expired — renew in Settings", UNAUTHORIZED: "Workspace access is not authorized", STALE: "Workspace changed — choose the current folder", DIRECTORY_MISSING: "Folder could not be found", UNAVAILABLE: "Connection status unavailable", Unavailable: "Workspace unavailable", EXPIRED: "Folder selection expired — choose the folder again" }
  return <section aria-label="Workspace" className="workspace-explorer">
    <div className="explorer-heading"><h2>Workspace</h2><span className="evidence-status">READ-ONLY</span></div>
    {unauthenticated ? <div className="workspace-notice" role="alert"><strong>Sign in required</strong><p>Your session is no longer authenticated. Sign in again to access this workspace.</p><a className="technical-button" href="/login?next=/">Sign in</a></div> : <>
      <div className="workspace-connection"><span>{binding?.runtime ? "Workspace runtime" : "Runtime"}</span><strong role="status" data-runtime-id={binding?.runtime?.runtimeId} className={connection.connected ? "is-connected" : ""}>{connection.boundStatus}{connection.boundDevice && ` · ${connection.boundDevice.displayName}`}</strong>{!connection.unavailable && !connection.connectedDevices.length && onConnect && <button type="button" className="technical-button" onClick={onConnect}>Connect Computer</button>}</div>
      {connection.otherConnectedDevices.map(device => <p key={device.runtimeId} role="status" data-runtime-id={device.runtimeId}>Connected · {device.displayName}{binding?.runtime ? " · not bound to this workspace" : " · workspace binding unavailable"}</p>)}
      {!binding && <div className="explorer-empty"><strong>No folder connected.</strong><p>{projectId ? "Choose a folder on your computer to browse files and inspect your project in Chat." : "Select an authorized project to open a workspace."}</p></div>}
      {selector}
      {binding && <div className="explorer-binding text-xs space-y-1"><strong><FolderOpen size={14} className="inline mr-1" />{binding.name}</strong><p role="status">{error ? "Workspace unavailable" : labels[status] ?? status}</p></div>}
      {error && <p role="alert" className="workspace-notice">{error}{onChanged && <button type="button" className="technical-button" onClick={() => void onChanged()}>Refresh workspace status</button>}</p>}
      {local ? <>
        {runtime && onChanged && (runtime.readAuthorized && !requestedRead
          ? <details className="workspace-advanced p-3"><summary>Read access · allowed</summary><WorkspaceReadGrantPanel runtime={runtime} onChanged={onChanged} /></details>
          : <WorkspaceReadGrantPanel key={`${binding.id}:${binding.version}`} runtime={runtime} onChanged={onChanged} requested={requestedRead} onAllowed={onReadAllowed} onCancel={onReadCancel} />)}
        {binding.runtime && ensureConversation && runtime?.readAuthorized && !error && <RuntimeWorkspaceSearch key={`${binding.id}:${binding.version}`} binding={binding.runtime} ensureConversation={ensureConversation} onOpen={onOpen} />}
        <div className="explorer-tree">{binding.runtime && ensureConversation && onChanged && available ? <RuntimeDirectory key={`${binding.id}:${binding.version}`} binding={binding.runtime} selectedPath={selectedPath} readAuthorized={runtime?.readAuthorized} ensureConversation={ensureConversation} onOpen={onOpen} onChanged={onChanged} /> : <p className="panel-empty">Files unavailable until this folder's connection and access are verified.</p>}</div>
        <details className="workspace-advanced p-3"><summary>Connection details</summary>{runtime && <WorkspaceRuntimeSummary runtime={runtime} />}{binding.runtime?.verifiedAt && !available && <SavedObservationStatus receipt={{ observedAt: binding.runtime.verifiedAt, bindingVersion: binding.runtime.version }} available={false} />}<p>Cached binding metadata only when unavailable. No backend filesystem fallback.</p></details>
      </> : binding ? <>
        <form className="file-search" onSubmit={event => { event.preventDefault(); if (query.trim()) onOpen(query.trim()) }}><Search size={14} aria-hidden="true" /><input id="workspace-file-search" type="search" aria-label="Search loaded files or enter a relative path" placeholder="Find file or enter path…" value={query} onChange={event => setQuery(event.target.value)} /></form>
        <div className="explorer-tree">{status === "Available" && !error ? <Directory key={`${binding.id}:${binding.version}`} binding={binding} path="" selectedPath={selectedPath} onOpen={onOpen} query={query} /> : <p className="panel-empty">Workspace files unavailable.</p>}</div>
      </> : status === "Loading" ? <p className="panel-empty" role="status">Checking workspace…</p> : null}
    </>}
    <div className="explorer-footer"><span>Files + Chat + Agent inspection</span></div>
  </section>
}
