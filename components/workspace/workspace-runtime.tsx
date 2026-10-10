"use client"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { ChevronRight, ChevronDown, FileText, Folder, Loader2 } from "lucide-react"
import { chooseWorkspaceFolder, getFolderSelection, type FolderSelection, openWorkspaceBinding, getWorkspaceDevices, getWorkspaceOperation, requestWorkspaceOperation, runtimeWorkspaceDescriptor, workspaceOperationFile,
  type RuntimeWorkspaceBinding, type WorkspaceOperationView, type WorkspaceRuntimeDevice } from "@/lib/sekhem-agent"
import { TrustedRuntimeExecutionCard, WorkspaceReadSetup, RuntimeSetup } from "./trusted-runtime-control"
import { FilePanel } from "./agent-workspace"
import { RuntimeEvidenceAction } from "./runtime-evidence"
import { SavedObservationStatus } from "./sekhem-primitives"
import { workspaceFolderDevices, type RuntimeInventory } from "@/lib/workspace-runtime-status"
import { prepareEditorSave, editorReadBackMatches } from "@/lib/editor-save"
import { EditorSavedRuns } from "./source-editor"
import { fetchSekhemApi } from "@/lib/sekhem-api"
import type { RuntimeActionSnapshot } from "./trusted-runtime-control"
import { createDirectoryDiscovery, createDirectoryLoader, isCurrentDirectoryObservation, MAX_AUTOMATIC_DIRECTORY_DISCOVERY } from "@/lib/directory-loading"

const loadDirectory = createDirectoryLoader<WorkspaceOperationView>()
let directoryLoadSequence = 0

const ready = (v?: WorkspaceOperationView | null) => !!v && ["READY", "TRUNCATED"].includes(v.state)
export function WorkspaceOperationStatus({ view, error, available }: { view?: WorkspaceOperationView | null; error?: string | null; available?: boolean }) {
  const labels: Record<string, string> = { LOADING: "Loading", APPROVAL_REQUIRED: "Approval required", EXECUTING: "Executing", READY: "Ready", OFFLINE: "Offline · cached metadata only; reconnect the computer to refresh", REVOKED: "Runtime revoked or disabled", EXPIRED_GRANT: "Project grant expired — renew read access in Settings", UNAUTHORIZED: "Unauthorized", DIRECTORY_MISSING: "Directory missing", NOT_FOUND: "File missing", DENIED: "Denied", FAILED: "Failed", TRUNCATED: "Truncated", UNSUPPORTED: "Unsupported content", STALE: "Workspace changed — this saved binding is not the current folder", EXPIRED: "Folder selection expired. Choose Folder again." }
  return <div className="workspace-notice" role={error ? "alert" : "status"}>{error || (view?.receipt && ready(view) ? view.state === "TRUNCATED" ? "Truncated saved observation" : "Verified observation" : labels[view?.state ?? "LOADING"] || view?.state)}{view?.message && <p>{view.message}</p>}{view?.receipt && <details><summary>Observation details</summary><SavedObservationStatus receipt={view.receipt} available={available} /></details>}</div>
}
function useObservation(binding: RuntimeWorkspaceBinding, initial: WorkspaceOperationView | null, onChanged?: () => Promise<void>) {
  const [view, setView] = useState(initial), [error, setError] = useState<string | null>(null)
  const callback = useRef(onChanged); callback.current = onChanged
  useEffect(() => { setView(initial); setError(null) }, [initial?.operation.operationId, binding.workspaceId, binding.version])
  const refresh = useCallback(async () => {
    if (!view) return
    setView(await getWorkspaceOperation(binding, view.operation.relativePath, view)); setError(null)
  }, [binding.workspaceId, binding.version, view?.operation.operationId])
  useEffect(() => {
    if (!view || !["APPROVAL_REQUIRED", "EXECUTING", "LOADING"].includes(view.state)) return
    let active = true
    const read = async () => { try { const next = await getWorkspaceOperation(binding, view.operation.relativePath, view); if (active) { setView(next); setError(null) } } catch (e) { if (active) { setError(e instanceof Error ? e.message : "Workspace unavailable"); setView(v => v ? { ...v, state: "FAILED", file: undefined, entries: undefined } : v) } } }
    const timer = setInterval(() => void read(), 1500)
    return () => { active = false; clearInterval(timer) }
  }, [binding.workspaceId, binding.version, view?.operation.operationId, view?.state])
  useEffect(() => { if (ready(view)) void callback.current?.() }, [view?.receipt?.receiptId])
  return { view, setView, error, setError, refresh }
}
function OperationApproval({ view, refresh }: { view: WorkspaceOperationView | null; refresh: () => Promise<void> }) {
  return view && ["APPROVAL_REQUIRED", "EXECUTING"].includes(view.state) ? <details open={view.state === "APPROVAL_REQUIRED"} className="workspace-advanced"><summary>{view.state === "APPROVAL_REQUIRED" ? "Review folder access" : "Reading folder… · Details"}</summary><TrustedRuntimeExecutionCard runId={view.operation.runId} showOutput={false} onChanged={refresh} /></details> : null
}
export function DirectoryObservation({ view, error, available, refresh, refreshDisabled }: { view: WorkspaceOperationView | null; error?: string | null; available: boolean; refresh: () => void; refreshDisabled: boolean }) {
  const pending = !!view && ["LOADING", "EXECUTING"].includes(view.state)
  const failure = error || (view && !ready(view) && !pending && view.state !== "APPROVAL_REQUIRED" ? view.message || view.state : null)
  return <div className="directory-observation text-[11px] text-muted-foreground">
    {pending && <p role="status" className="flex items-center gap-1.5 px-2 py-1"><Loader2 size={12} className="animate-spin" aria-hidden="true" />Loading…</p>}
    {failure && <p role="alert" className="px-2 py-1 text-destructive break-words">{failure}</p>}
    <details className="directory-observation-details px-2 py-0.5">
      <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-1">Directory details</summary>
      <WorkspaceOperationStatus view={view} error={error} available={available} />
      <button type="button" className="technical-button text-xs" disabled={refreshDisabled} onClick={refresh}>Refresh directory</button>
    </details>
  </div>
}
export function WorkspaceFolderSelector({ projectId, ensureConversation, onChanged, inventory, boundRuntimeId }: { projectId: string; ensureConversation: (binding?: RuntimeWorkspaceBinding) => Promise<string>; onChanged: () => Promise<void>; inventory?: RuntimeInventory; boundRuntimeId?: string }) {
  const [selection, setSelection] = useState<FolderSelection | null>(null)
  const [devices, setDevices] = useState<WorkspaceRuntimeDevice[]>([]), [runtimeId, setRuntimeId] = useState(""), [rootPath, setRootPath] = useState("")
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const deviceInventoryKey = inventory?.devices.map(d => d.runtimeId).sort().join(":")
  const load = async () => { try { setDevices(await getWorkspaceDevices(projectId) ?? []); setError(null) } catch (e) { setError(e instanceof Error ? e.message : "Runtime devices unavailable") } }
  useEffect(() => { setError(null); setSelection(null); setRootPath("") }, [projectId])
  useEffect(() => { let active = true; void getWorkspaceDevices(projectId).then(d => { if (active) setDevices(d ?? []) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [projectId, deviceInventoryKey])
  const currentDevices = workspaceFolderDevices(devices, inventory)
  // Reuse the single connected capable device; never substitute a different device for a pending selection.
  const capable = currentDevices.filter(d => d.status === "ACTIVE" && d.online && d.folderPickerProtocol === 1)
  const effectiveId = runtimeId || boundRuntimeId || (capable.length === 1 ? capable[0].runtimeId : "")
  const selectedDevice = currentDevices.find(d => d.runtimeId === effectiveId)
  useEffect(() => {
    if (!selection || !["PENDING", "DISPATCHED"].includes(selection.state)) return
    let active = true
    const timer = setInterval(() => {
      if (Date.parse(selection.expiresAt) <= Date.now()) { setSelection(s => s ? { ...s, state: "EXPIRED", rootPath: null } : s); return }
      void getFolderSelection(projectId, selection.selectionId).then(next => { if (active && next) { setSelection(next); if (next.state === "SELECTED") { setRootPath(next.rootPath || ""); setRuntimeId(next.runtimeId) } } }).catch(e => { if (active) { setError(e.message); setSelection(null) } })
    }, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [projectId, selection?.selectionId, selection?.state])
  const waiting = !!selection && ["PENDING", "DISPATCHED"].includes(selection.state)
  return <section className="p-2 text-xs space-y-2" aria-label="Choose workspace folder">
    {inventory && <details open={!inventory.devices.length} className="workspace-advanced"><summary>Connect a computer</summary><RuntimeSetup pairingOnly projectId={projectId} inventory={inventory} onChanged={onChanged} boundRuntimeId={effectiveId} onComputerSelected={id => { setRuntimeId(id); setSelection(null); setRootPath(""); setError(null) }} /></details>}
    {currentDevices.length > 1 && <label>Computer<select aria-label="Folder computer" value={effectiveId} disabled={busy || waiting} onChange={e => { setRuntimeId(e.target.value); setSelection(null); setRootPath(""); setError(null) }}><option value="">Choose your computer</option>{currentDevices.map(d => <option key={d.runtimeId} value={d.runtimeId} disabled={d.status !== "ACTIVE"}>{d.displayName} · {d.online ? "Connected" : "Waiting for connection"}</option>)}</select></label>}
    {selectedDevice && <details className="workspace-advanced"><summary>{selectedDevice.online ? "Computer connection details" : "Waiting for connection · Details"}</summary><p role="status">Selected computer: {selectedDevice.displayName} · {selectedDevice.online ? "Connected" : "Waiting for connection"}. The current folder stays on its bound computer until you open a new selection.</p></details>}
    {inventory && effectiveId && <WorkspaceReadSetup key={`${projectId}:${effectiveId}`} projectId={projectId} runtimeId={effectiveId} inventory={inventory} onChanged={onChanged} />}
    <button type="button" className="technical-button workspace-choose-folder" disabled={busy || waiting || !selectedDevice?.online || selectedDevice.status !== "ACTIVE" || selectedDevice.folderPickerProtocol !== 1} onClick={() => void (async () => {
      setBusy(true); setError(null); setRootPath("")
      try { const result = await chooseWorkspaceFolder(projectId, effectiveId); if (!result) throw new Error("Folder picker unavailable"); setSelection(result) }
      catch (e) { setError(e instanceof Error ? e.message : "Folder picker unavailable") }
      finally { setBusy(false) }
    })()}>Choose Folder</button>
    {waiting && <p role="status">Select a folder in the Windows dialog. No file access is granted yet.</p>}
    {selection?.state === "CANCELLED" && <p role="status">Folder selection cancelled.</p>}
    {selection?.state === "EXPIRED" && <p role="status">Folder selection expired. Choose Folder again.</p>}
    {capable.length > 1 && !effectiveId && <p>Choose your computer under Advanced connection, then Choose Folder.</p>}
    {!capable.length && <p>Connect your computer above, then choose a folder here.</p>}
    <details><summary>Advanced connection</summary><p className="panel-caption">Use an enrolled runtime. Folder verification requires approval; bounded workspace consent then covers multiple reads. Broad machine access; this folder is not a sandbox.</p>
    <label className="block">Runtime<select aria-label="Workspace runtime" className="w-full bg-surface-2 p-2" value={effectiveId} disabled={waiting} onChange={e => { setRuntimeId(e.target.value); setSelection(null); setRootPath("") }}><option value="">Select enrolled runtime</option>{runtimeId && !selectedDevice && <option value={runtimeId} disabled>Runtime unavailable</option>}{currentDevices.map(d => <option key={d.runtimeId} value={d.runtimeId} disabled={d.status !== "ACTIVE"}>{d.displayName} · {d.fingerprint.slice(0, 12)} · {d.status !== "ACTIVE" ? d.status : d.online ? "Online" : "Offline"}</option>)}</select></label>
    <button type="button" className="technical-button" onClick={() => void load()}>Refresh runtimes</button>
    {!devices.length && <p>Enroll a runtime and grant filesystem.list and filesystem.read using the existing Trusted Local Runtime controls.</p>}
    <label className="block">Local folder<input aria-label="Workspace local folder" className="w-full bg-surface-2 p-2" placeholder="D:\Projects\sekhem" value={rootPath} onChange={e => setRootPath(e.target.value)} /></label>
    </details>
    {rootPath && <p className="break-all">Selected folder: {rootPath}</p>}
    {rootPath && <button type="button" className="technical-button" disabled={busy || waiting || selectedDevice?.status !== "ACTIVE" || !selectedDevice.online || !rootPath} onClick={() => void (async () => {
      setBusy(true); setError(null)
      try {
        await openWorkspaceBinding(projectId, { runtimeId: effectiveId, rootPath, displayName: rootPath.split(/[\\/]/).filter(Boolean).at(-1) || "Local workspace", requestId: crypto.randomUUID() }, ensureConversation)
        await onChanged()
      } catch (e) { setError(e instanceof Error ? e.message : "Folder connection failed"); await onChanged() } finally { setBusy(false) }
    })()}>Open</button>}{busy && <p role="status">Connecting folder identity…</p>}{error && <p role="alert">{error}</p>}
  </section>
}
export function RuntimeDirectory({ binding, path = "", selectedPath, ensureConversation, onOpen, onChanged, readAuthorized, discovery: inheritedDiscovery, refreshEpoch = 0, onRefreshTree }: { binding: RuntimeWorkspaceBinding; path?: string; selectedPath?: string; ensureConversation: (binding?: RuntimeWorkspaceBinding) => Promise<string>; onOpen: (path: string) => void; onChanged: () => Promise<void>; readAuthorized?: boolean; discovery?: ReturnType<typeof createDirectoryDiscovery>; refreshEpoch?: number; onRefreshTree?: () => void }) {
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [initial, setInitial] = useState<WorkspaceOperationView | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [autoDiscoveredOperation, setAutoDiscoveredOperation] = useState<string | null>(null), [directoryLimitReached, setDirectoryLimitReached] = useState(false)
  const [localRefreshEpoch, setLocalRefreshEpoch] = useState(0)
  const observation = useObservation(binding, initial, onChanged), { view, error, setError } = observation
  const depth = path.split("/").filter(Boolean).length
  const effectiveRefreshEpoch = inheritedDiscovery ? refreshEpoch : localRefreshEpoch
  const refreshTree = onRefreshTree ?? (() => setLocalRefreshEpoch(previous => previous + 1))
  const discoveryScope = JSON.stringify([binding.projectId, binding.workspaceId, binding.version, effectiveRefreshEpoch])
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const currentObservation = isCurrentDirectoryObservation(discoveryScope, loadedScope, initial?.operation.operationId, view?.operation.operationId)
  const [ownedDiscovery, setOwnedDiscovery] = useState<{ scope: string; discovery: ReturnType<typeof createDirectoryDiscovery> } | null>(null)
  const ownDiscovery = ownedDiscovery?.scope === discoveryScope ? ownedDiscovery.discovery : null
  const discovery = inheritedDiscovery ?? ownDiscovery
  useEffect(() => {
    if (inheritedDiscovery) return
    const instance = createDirectoryDiscovery()
    setOwnedDiscovery({ scope: discoveryScope, discovery: instance })
    return () => instance.dispose()
  }, [inheritedDiscovery, discoveryScope])
  useEffect(() => {
    let active = true; setLoading(true); setLoadedScope(null)
    if (!discovery) return () => { active = false }
    if (depth >= 16) { setLoading(false); return () => { active = false } }
    if (!discovery.reserve(path)) { setDirectoryLimitReached(true); setLoading(false); return () => { active = false } }
    let shared: ReturnType<typeof loadDirectory> | null = null
    const key = `${binding.projectId}:${binding.workspaceId}:${binding.version}:${path}:${!!readAuthorized}:${effectiveRefreshEpoch}`
    const work = discovery.schedule(key, async scheduledActive => {
      // Give each scheduled attempt its own inner key so a cancelled Strict Mode
      // mount cannot leave a stale request callback for the next mount to join.
      const loadKey = `${key}:${++directoryLoadSequence}`
      shared = loadDirectory(loadKey, () => effectiveRefreshEpoch === 0 ? getWorkspaceOperation(binding, path) : Promise.resolve(null), async stillActive => {
        if (!scheduledActive() || !readAuthorized || binding.status !== "READY") return null
        const conversationId = await ensureConversation(binding)
        if (!stillActive() || !scheduledActive()) return null
        return requestWorkspaceOperation(binding, "tree", conversationId, path)
      })
      return shared.promise
    })
    void work.promise.then(v => { if (active) { setInitial(v); setLoadedScope(discoveryScope) } }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; work.cancel(); shared?.cancel() }
  }, [binding.projectId, binding.workspaceId, binding.version, path, binding.status, readAuthorized, discovery, effectiveRefreshEpoch, depth])
  useEffect(() => {
    if (loading || !currentObservation || !discovery || !ready(view) || !view?.operation.operationId || autoDiscoveredOperation === view.operation.operationId) return
    const directories = (view.entries ?? []).filter(entry => entry.type === "directory")
    const accepted = directories.filter(entry => discovery.reserve(entry.path)).map(entry => entry.path)
    setDirectoryLimitReached(directories.length > accepted.length)
    setVisited(previous => new Set([...previous, ...accepted]))
    setExpanded(previous => new Set([...previous, ...accepted]))
    setAutoDiscoveredOperation(view.operation.operationId)
  }, [view?.operation.operationId, view?.state, view?.entries, autoDiscoveredOperation, discovery, depth, currentObservation, loading])
  const request = async () => { setBusy(true); setError(null); try { setInitial(await requestWorkspaceOperation(binding, path === "" && binding.status !== "READY" ? "verify" : "tree", await ensureConversation(binding), path)) } catch (e) { setError(e instanceof Error ? e.message : "Listing failed") } finally { setBusy(false) } }
  const refreshDisabled = busy || (binding.status === "READY" && !readAuthorized) || !!view && ["APPROVAL_REQUIRED", "EXECUTING"].includes(view.state)
  return <div className={path ? "ml-3 border-l border-border/20 pl-0.5" : ""}>
    {loading || !discovery ? <p role="status" className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" aria-hidden="true" />Loading…</p> : <>
      {(view || error) && <DirectoryObservation view={view} error={error} available={binding.status === "READY"} refresh={() => void request()} refreshDisabled={refreshDisabled} />}
      {view?.state === "APPROVAL_REQUIRED" && <OperationApproval view={view} refresh={observation.refresh} />}
      {depth < 16 && (!path || binding.status !== "READY" || !readAuthorized) && <button type="button" className="technical-button text-xs" disabled={refreshDisabled} onClick={() => binding.status !== "READY" ? void request() : refreshTree()}>{busy ? "Requesting…" : binding.status !== "READY" ? "Verify / list folder · approval required" : !readAuthorized ? "Allow reading above to browse" : "Refresh project tree"}</button>}
      {depth >= 16 && <p role="status">Explorer depth limit reached (16). Partial tree shown.</p>}
      {directoryLimitReached && <p role="status">Automatic discovery limit reached ({MAX_AUTOMATIC_DIRECTORY_DISCOVERY} directories). Some nested folders are not listed.</p>}
      {currentObservation && ready(view) && view?.entries?.map(entry => <div key={entry.path}><button type="button" title={entry.path} className="workspace-tree-row flex min-h-7 w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-lime" disabled={entry.type === "other"} aria-current={entry.type === "file" && entry.path === selectedPath ? "true" : undefined} aria-expanded={entry.type === "directory" ? expanded.has(entry.path) : undefined} onClick={() => { if (entry.type === "file") onOpen(entry.path); else { setVisited(prev => new Set(prev).add(entry.path)); setExpanded(prev => { const next = new Set(prev); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next }) } }}>
        {entry.type === "directory" ? <>{expanded.has(entry.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={14} /></> : <FileText size={14} />}<span className="truncate">{entry.name}{entry.type === "other" && " · unsupported entry"}</span></button>
        {entry.type === "directory" && visited.has(entry.path) && <div hidden={!expanded.has(entry.path)}><RuntimeDirectory key={entry.path} binding={binding} path={entry.path} selectedPath={selectedPath} readAuthorized={readAuthorized} ensureConversation={ensureConversation} onOpen={onOpen} onChanged={onChanged} discovery={discovery} refreshEpoch={effectiveRefreshEpoch} onRefreshTree={refreshTree} /></div>}
      </div>)}
      {ready(view) && view?.entries?.length === 0 && <p>No entries in this observed directory.</p>}
      {view?.state === "TRUNCATED" && <p role="status">Showing first 256 entries; results may be incomplete.</p>}
    </>}
  </div>
}
export function RuntimeFileViewer({ binding, initial, available, ensureConversation, onAnalyze, readAuthorized, onDirty, onSaveProposed }: { onSaveProposed?: (id: string) => void; onDirty?: (dirty: boolean) => void; binding: RuntimeWorkspaceBinding; initial: WorkspaceOperationView; available: boolean; ensureConversation?: (binding?: RuntimeWorkspaceBinding) => Promise<string>; onAnalyze?: (instruction: string, reference: import("@/lib/sekhem-agent").RuntimeEvidenceReference) => Promise<void>; readAuthorized?: boolean }) {
  const { view, setView, error, setError, refresh } = useObservation(binding, initial)
  const [save, setSave] = useState<{ runId: string; content: string; receipt: string } | null>(null)
  const savedRuns = useContext(EditorSavedRuns)
  const priorSave = [...savedRuns].filter(r => r.title === `Editor save for review: ${initial.operation.relativePath}`).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id
  const [restoring, setRestoring] = useState(false)
  useEffect(() => {
    if (!priorSave || save) return
    let active = true; setRestoring(true)
    void fetchSekhemApi<RuntimeActionSnapshot>(`/trusted-runtime/runs/${encodeURIComponent(priorSave)}`, { throwOnError: true }).then(s => {
      if (!active || !s) return
      const p = s.proposal
      if (p.toolId !== "filesystem.write" || p.runtimeId !== binding.runtimeId || p.projectId !== binding.projectId || p.conversationId !== initial.operation.conversationId || p.validatedInput.path !== initial.operation.absolutePath || typeof p.validatedInput.content !== "string") throw new Error("Saved editor proposal scope mismatch")
      if (!["DENIED", "CANCELLED", "EXPIRED"].includes(p.state)) setSave({ runId: priorSave, content: p.validatedInput.content, receipt: initial.receipt?.receiptId ?? "" })
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Saved proposal unavailable") }).finally(() => { if (active) setRestoring(false) })
    return () => { active = false }
  }, [priorSave, binding.workspaceId, binding.version])
  const readBackStarted = useRef<string | null>(null), request = useRef<{ content: string; original: string; id: string } | null>(null)
  const lastFile = useRef<ReturnType<typeof workspaceOperationFile>>(null)
  const observedFile = available && view ? workspaceOperationFile(runtimeWorkspaceDescriptor(binding), view) : null
  if (observedFile) lastFile.current = observedFile
  const file = observedFile ?? (available && readBackStarted.current ? lastFile.current : null)
  const matched = !!save && !!view && editorReadBackMatches(view, binding, initial.operation.relativePath, save.content, save.receipt)
  const readBackMismatch = !!save && !!readBackStarted.current && view?.state === "READY" && !!view.receipt && view.receipt.receiptId !== save.receipt && !matched
  const unavailableState = binding.status === "VERIFYING" || binding.status === "READY" ? "OFFLINE" : binding.status
  const fileObservation = <WorkspaceOperationStatus view={available ? view : { ...initial, state: unavailableState, file: undefined, receipt: undefined }} error={error} available={available} />
  return <>{available && !error && view?.state === "READY" && view.receipt ? <details className="file-observation-details"><summary>Verified read · Details</summary>{fileObservation}</details> : fileObservation}{!available && view?.receipt && <SavedObservationStatus receipt={view.receipt} available={false} />}{available && <OperationApproval view={view} refresh={refresh} />}
    {available && ensureConversation && onAnalyze && <RuntimeEvidenceAction readAuthorized={readAuthorized} key={`${binding.workspaceId}:${binding.version}:${initial.operation.relativePath}`} binding={binding} relativePath={initial.operation.relativePath} ensureConversation={ensureConversation} onAnalyze={onAnalyze} />}
    {readBackMismatch && <p role="alert">Read-back does not match the exact save proposal. Draft retained; persisted result not verified. No automatic retry.</p>}
    <FilePanel onDirty={onDirty} savedContent={matched ? save!.content : undefined} onSave={ensureConversation ? async (original, draft) => {
      if (!available || !view || save && !matched || restoring || error) throw new Error("Resolve the current save proposal or refresh its durable state before creating another")
      const id = await ensureConversation(binding)
      if (!request.current || request.current.content !== draft || request.current.original !== original) request.current = { content: draft, original, id: crypto.randomUUID() }
      const result = await prepareEditorSave(binding, view, id, original, draft, request.current.id)
      readBackStarted.current = null
      setSave({ runId: result.runId, content: draft, receipt: view.receipt!.receiptId })
      onSaveProposed?.(result.runId)
    } : undefined} file={file} status={available ? view?.state ?? "Loading" : unavailableState} error={error || (!available ? "Runtime Workspace unavailable. Cached identity only; no backend fallback." : !file && view && !["APPROVAL_REQUIRED", "EXECUTING"].includes(view.state) ? view.message ?? view.state : null)} onOpen={() => {}} />
    {save && <details open><summary>Governed editor save · {matched ? "PERSISTED VERIFIED RESULT" : "Not yet verified by read-back"}</summary><TrustedRuntimeExecutionCard runId={save.runId} onSnapshot={snapshot => {
      const execution = snapshot.execution
      if (["DENIED", "CANCELLED", "EXPIRED"].includes(snapshot.proposal.state) && !execution) { setSave(null); request.current = null; return }
      if (!available || !ensureConversation || !execution || execution.state !== "SUCCEEDED" || execution.verificationState !== "VERIFIED" || readBackStarted.current || snapshot.proposal.validatedInput.content !== save.content) return
      readBackStarted.current = execution.attribution.executionId
      void ensureConversation(binding).then(id => requestWorkspaceOperation(binding, "file", id, initial.operation.relativePath)).then(setView).catch(e => setError(e instanceof Error ? e.message : "Authorized read-back unavailable; source not marked saved"))
    }} /><p>Only an authorized matching read-back makes this draft persisted source. No automatic approval or write retry.</p></details>}
  </>
}

export function RuntimeWorkspaceSearch({ binding, ensureConversation, onOpen }: { binding: RuntimeWorkspaceBinding; ensureConversation: (binding?: RuntimeWorkspaceBinding) => Promise<string>; onOpen: (path: string) => void }) {
  const [query, setQuery] = useState(""), [initial, setInitial] = useState<WorkspaceOperationView | null>(null), [busy, setBusy] = useState(false)
  const observation = useObservation(binding, initial)
  const search = async () => { setBusy(true); observation.setError(null); try { setInitial(await requestWorkspaceOperation(binding, "search", await ensureConversation(binding), "", query)) } catch (e) { observation.setError(e instanceof Error ? e.message : "Workspace search unavailable") } finally { setBusy(false) } }
  return <section className="p-2 space-y-2 text-xs" aria-label="Runtime workspace search"><form onSubmit={e => { e.preventDefault(); void search() }}>
    <label>Search workspace<input aria-label="Search workspace text" value={query} maxLength={512} onChange={e => setQuery(e.target.value)} className="w-full bg-surface-2 p-2" /></label>
    <button className="technical-button" disabled={busy || !query.trim() || ["EXECUTING", "APPROVAL_REQUIRED"].includes(observation.view?.state ?? "")}>Search workspace</button></form>
    {(observation.view || observation.error) && <WorkspaceOperationStatus view={observation.view} error={observation.error} available />}
    <OperationApproval view={observation.view} refresh={observation.refresh} />
    {observation.view?.receipt && <details><summary>Search details</summary><p>Receipt {observation.view.receipt.receiptId}</p></details>}
    {observation.view?.matches?.map((match, i) => <button type="button" className="block text-left" key={i} onClick={() => onOpen(match.path)}>{match.path}:{match.line} · {match.text}</button>)}
  </section>
}
