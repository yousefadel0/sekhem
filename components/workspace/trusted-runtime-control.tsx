"use client"
import { capabilityLabel, capabilityDescription } from "@/lib/workspace-presentation"
import { ApprovalActions } from "./approval-actions"
import { useEffect, useRef, useState } from "react"
import { createSnapshotPoller, snapshotFailure } from "@/lib/snapshot-polling"
import { runtimeActionLabel } from "@/lib/workspace-presentation"
import { terminalCommand } from "@/lib/workspace-terminal"
import { TerminalAction } from "./terminal-action"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"
import { configureRuntimeCapabilities, pairRuntimeDevice, renewRuntimeAccess } from "@/lib/sekhem-agent"
import type { RuntimeProposal, RuntimeExecution, RuntimeTool } from "@/backend/src/trusted-runtime/runtime.contract"
import { TechnicalPanel } from "./sekhem-primitives"
import { emptyRuntimeInventory, runtimeDeviceState, runtimeEnrollmentState, runtimePairingLabel, runtimeSelection, type RuntimeDeviceSummary, type RuntimeInventory, type WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"
import { prepareWorkspaceReads, workspaceReadTools } from "@/lib/workspace-read-setup"

export function WorkspaceReadSetup({ projectId, runtimeId, inventory, onChanged }: { projectId: string; runtimeId: string; inventory: RuntimeInventory; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const device = inventory.devices.find(d => d.runtimeId === runtimeId)
  const enrollment = inventory.enrollments?.find(e => e.runtimeId === runtimeId && e.projectId === projectId)
  const grant = inventory.grants.find(g => g.runtimeId === runtimeId && g.projectId === projectId)
  const state = runtimeEnrollmentState(device, grant, enrollment, Date.now(), workspaceReadTools)
  const access = runtimeDeviceState(device, grant, Date.now())
  // The server may confirm enrolled development reads while a mixed write/terminal
  // grant is expired. This presentation does not renew it or authorize operations.
  const readAccessReady = access.grantStatus === "ACTIVE" || access.grantStatus === "EXPIRED" &&
    grant?.persistentReadAccess === true && grant.status === "ACTIVE" && !grant.revokedAt && device?.status === "ACTIVE"
  const ready = !state.configurationRequired && !state.enrollmentChanged && readAccessReady && workspaceReadTools.every(t => grant?.capabilities.includes(t))
  const unavailable = inventory.loading || !!inventory.error || !!inventory.configurationError || !!inventory.enrollmentErrors?.[runtimeId] || access.connection !== "CONNECTED"
  if (!runtimeId) return null
  const setup = async () => {
    setBusy(true); setError("")
    try { await prepareWorkspaceReads(enrollment, enrollment?.revision ?? 0,
      async (revision, tools) => { const saved = await configureRuntimeCapabilities(runtimeId, projectId, revision, tools); if (!saved) throw new Error("Capability configuration was not returned. Refresh before retrying."); return saved },
      current => renewRuntimeAccess(current, grant?.version ?? 0, crypto.randomUUID(), 8 * 60 * 60)) }
    catch (e) { setError(e instanceof Error ? e.message : "Reading setup failed. Try again after refreshing the connection.") }
    finally { try { await onChanged() } catch { setError(previous => previous || "Status refresh failed. Refresh the workspace to check the saved setup.") }; setBusy(false) }
  }
  return <section aria-label="Folder connection setup" data-reading-ready={ready} className="workspace-notice space-y-2">
    <strong>{ready ? "Reading tools ready" : "Complete folder connection"}</strong>
    {!ready && <><p role="status">{state.configurationRequired ? "Missing permission: list, read or search files." : "Reading access needs activation for this account and project."}</p>
      <p>Allow list, read and search on this computer for this project. Existing configured tools are retained. Development reading can remain available until revoked while this computer and its enrollment are active; otherwise session access lasts up to 8 hours. Folder reading still requires confirmation below.</p>
      {enrollment && <p>Saved tools: {enrollment.capabilities.map(capabilityLabel).join(" · ")}</p>}
      <button type="button" className="technical-button" disabled={busy || unavailable} onClick={() => void setup()}>{busy ? "Preparing reading access…" : "Set up file reading"}</button></>}
    {unavailable && <p role="alert">{inventory.error || inventory.configurationError || inventory.enrollmentErrors?.[runtimeId] || "Connect this computer to complete setup."}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

const tools: RuntimeTool[] = ["filesystem.read", "filesystem.write", "filesystem.list", "filesystem.search", "filesystem.create", "filesystem.delete", "filesystem.move", "filesystem.copy", "terminal.execute"]
const label = "Runs on your connected computer. Current access and approval are checked separately."
/** Presentation routing only. This exact purpose is frozen by the Workspace adapter;
 * it never grants access. Workspace content must pass the adapter's current checks. */
export function runtimeOutputVisible(proposal: Pick<RuntimeProposal, "purpose" | "toolId"> | undefined, requested = true) {
  const workspaceObservation = proposal && ["filesystem.list", "filesystem.read", "filesystem.search"].includes(proposal.toolId) && /^Workspace (?:verify|list|read|search) · workspace_[a-f0-9]{64} · v[1-9][0-9]*$/.test(proposal.purpose)
  return requested && !workspaceObservation
}
const post = (path: string, body: Record<string, unknown>) => postSekhemApi<any, Record<string, unknown>>(`/trusted-runtime/${path}`, body, { throwOnError: true })

export function RuntimeAccessStatus({ projectId, runtimeId, inventory, onChanged, onConfigure, required = [] }: {
  projectId: string | null; runtimeId: string; inventory: RuntimeInventory; onChanged: () => Promise<void>; onConfigure?: () => void; required?: readonly string[]
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const device = inventory.devices.find(d => d.runtimeId === runtimeId)
  const grant = inventory.grants.find(g => g.runtimeId === runtimeId && g.projectId === projectId)
  const enrollment = inventory.enrollments?.find(e => e.runtimeId === runtimeId && e.projectId === projectId && e.userId === grant?.userId && e.organizationId === grant?.organizationId)
    ?? (!grant ? inventory.enrollments?.find(e => e.runtimeId === runtimeId && e.projectId === projectId) : undefined)
  const state = runtimeEnrollmentState(device, grant, enrollment, Date.now(), required)
  const access = runtimeDeviceState(device, grant, Date.now())
  const persistentReads = !state.enrollmentChanged && device?.status === "ACTIVE" && grant?.persistentReadAccess && (required.length ? required : grant.capabilities).every(c => ["filesystem.list", "filesystem.read", "filesystem.search"].includes(c) && grant.capabilities.includes(c as any))
  const needsAccess = (!persistentReads && access.grantStatus !== "ACTIVE") || required.some(c => !grant?.capabilities.includes(c as any))
  const unavailable = inventory.loading || !!inventory.error || !!inventory.enrollmentErrors?.[runtimeId]
  if (!runtimeId || !projectId) return null
  const renew = async () => { if (!enrollment || unavailable || !state.canRenew) return; setBusy(true); setError("")
    try { await renewRuntimeAccess(enrollment, grant?.version ?? 0, crypto.randomUUID(), 8 * 60 * 60); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : "Runtime renewal unavailable") } finally { setBusy(false) }
  }
  return <section aria-label="Runtime access" className="workspace-notice text-xs space-y-2">
    <strong>Runtime access</strong><p role="status">{unavailable ? "Current access unavailable" : `Runtime access ${access.grantStatus.toLowerCase()}`}{grant?.expiresAt && ` · Until ${new Date(grant.expiresAt).toLocaleString()}`}</p>
    {!unavailable && needsAccess && state.configurationRequired && <p>Capability configuration required{state.missing.length ? `: ${state.missing.map(capabilityLabel).join(", ")}` : ` · ${state.status.toLowerCase()}`}. {onConfigure && <button type="button" onClick={onConfigure}>Open runtime settings</button>}</p>}
    {persistentReads && !unavailable && <p>Development read access does not require renewal while this computer and enrollment are active.</p>}
    {!unavailable && !persistentReads && state.canRenew && <button type="button" disabled={busy} onClick={() => void renew()}>Allow access for this work session</button>}
    {!persistentReads && <p>Uses the saved tools for up to 8 hours, ending sooner when your sign-in session or capability configuration expires. Exact changes still require approval. Access is not renewed automatically.</p>}
    <p>Renewal uses only your saved capability configuration. Approval alone does not grant capabilities; each operation still needs current authorization.</p>
    {state.enrollmentChanged && state.canRenew && !unavailable && <p>Saved capability configuration has changed. Renew runtime access to use the current enrollment.</p>}
    {grant && <details><summary>Runtime access details</summary><p>Grant v{grant.version} · {grant.grantId} · Grant-bound enrollment revision {grant.enrollment?.revision ?? "none"}{enrollment && ` · Current enrollment revision ${enrollment.revision}`}</p></details>}
    {(error || inventory.error || inventory.enrollmentErrors?.[runtimeId]) && <p role="alert">{error || inventory.error || inventory.enrollmentErrors?.[runtimeId]}</p>}
  </section>
}

export function RuntimeCapabilitySettings({ projectId, runtimeId, inventory, onChanged }: { projectId: string | null; runtimeId: string; inventory: RuntimeInventory; onChanged: () => Promise<void> }) {
  const enrollment = inventory.enrollments?.find(e => e.runtimeId === runtimeId && e.projectId === projectId)
  const device = inventory.devices.find(d => d.runtimeId === runtimeId)
  const [draft, setDraft] = useState<{ scope: string; revision: number; capabilities: RuntimeTool[] } | null>(null)
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const scope = `${projectId}:${runtimeId}`, editing = draft?.scope === scope ? draft : null
  const configurationError = inventory.configurationError === undefined ? inventory.error : inventory.configurationError
  const unavailable = inventory.loading || !!configurationError || !!inventory.enrollmentErrors?.[runtimeId] || device?.status !== "ACTIVE"
  if (!runtimeId || !projectId) return null
  const save = async () => { if (!editing || !acknowledged || unavailable) return; setBusy(true); setError("")
    try { await configureRuntimeCapabilities(runtimeId, projectId, editing.revision, editing.capabilities); setDraft(null); setAcknowledged(false); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : "Capability configuration unavailable") } finally { setBusy(false) }
  }
  return <section aria-label="Runtime capability configuration" className="space-y-2"><h3>Configured capabilities</h3>
    <p>{unavailable ? "Capability configuration unavailable" : enrollment ? enrollment.capabilities.map(capabilityLabel).join(" · ") : "No explicit capability configuration"}</p>
    <p>Saved for this account, project and computer. Configuring capabilities does not approve a task or activate runtime access.</p>
    {enrollment && <details><summary>Configuration details</summary><p>Enrollment revision {enrollment.revision} · {enrollment.status ?? "Legacy configuration"} · {enrollment.enrollmentId}</p><p>{enrollment.capabilities.join(", ")}</p><p>Configured {new Date(enrollment.configuredAt).toLocaleString()}</p></details>}
    {!editing ? <button type="button" disabled={unavailable || busy} onClick={() => { setDraft({ scope, revision: enrollment?.revision ?? 0, capabilities: [...(enrollment?.capabilities ?? [])] }); setAcknowledged(false) }}>Configure capabilities</button> : <>
      <fieldset disabled={busy}><legend>Explicit capability configuration</legend>{tools.map(t => <label className="block" key={t}><input type="checkbox" checked={editing.capabilities.includes(t)} onChange={e => setDraft({ ...editing, capabilities: e.target.checked ? [...editing.capabilities, t] : editing.capabilities.filter(c => c !== t) })} />{capabilityLabel(t)}</label>)}</fieldset>
      <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I explicitly configure this capability ceiling. Tasks require separate authorization.</label>
      <button type="button" disabled={busy || unavailable || !acknowledged || !editing.capabilities.length || editing.revision !== (enrollment?.revision ?? 0)} onClick={() => void save()}>Save capability configuration</button>
      <button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel configuration</button>
    </>}{(error || inventory.enrollmentErrors?.[runtimeId]) && <p role="alert">{error || inventory.enrollmentErrors?.[runtimeId]}</p>}
  </section>
}

/** Setup uses the same enrollment and project grant endpoints as Advanced. */
export function RuntimeSetup({ projectId, inventory, onChanged, boundRuntimeId = "", pairingOnly = false, onComputerSelected }: { projectId: string | null; inventory: RuntimeInventory; onChanged: () => Promise<void>; boundRuntimeId?: string; pairingOnly?: boolean; onComputerSelected?: (runtimeId: string) => void }) {
  const [code, setCode] = useState(""), [computer, setComputer] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const [displayName, setDisplayName] = useState("My Windows computer")
  const [paired, setPaired] = useState<RuntimeDeviceSummary | null>(null)
  const selectedComputer = computer || boundRuntimeId
  const selectedDevice = inventory.devices.find(d => d.runtimeId === selectedComputer) ?? (paired?.runtimeId === selectedComputer ? paired : undefined)
  const [releaseAvailable, setReleaseAvailable] = useState(false)
  useEffect(() => { let active = true; void fetch("/runtime/release.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(r => {
    if (active) setReleaseAvailable(r?.format === 1 && r?.signed === true && /^[a-f0-9]{64}$/i.test(r?.sha256 ?? ""))
  }).catch(() => {}); return () => { active = false } }, [])
  const act = async (work: () => Promise<void>) => { setBusy(true); setError(""); try { await work(); await onChanged() } catch (e) { setError(e instanceof Error ? e.message : "Connection unavailable") } finally { setBusy(false) } }
  return <section className="space-y-3" aria-label="Connect your computer"><h3>Connect your computer</h3>
    <p>Install SEKHEM Runtime, choose Pair computer, then enter its code here.</p>
    {releaseAvailable ? <a className="technical-button" href="/runtime/SEKHEM%20Runtime%20Setup.exe" download>Download Windows Runtime</a>
      : <p role="status">A signed Windows installer has not been published yet.</p>}
    <label className="block">Pairing code<input aria-label="Connect computer pairing code" className="w-full bg-surface-2 p-2" value={code} maxLength={24} onChange={e => setCode(e.target.value)} /></label>
    <label className="block">Computer name<input aria-label="Pairing computer name" value={displayName} maxLength={80} onChange={e => setDisplayName(e.target.value)} /></label>
    <button type="button" className="technical-button" disabled={busy || !displayName.trim() || !/^[a-f0-9]{24}$/.test(code.trim())} onClick={() => void act(async () => { const d = await pairRuntimeDevice(code, displayName); setPaired(d); setComputer(d.runtimeId); setCode(""); onComputerSelected?.(d.runtimeId) })}>Pair this computer</button>
    <p>Pair once, then connect for normal use. No file access is granted by pairing.</p>
    {selectedDevice && <p role="status">{selectedDevice.displayName} · {inventory.authenticationRequired ? "Device status unavailable" : runtimePairingLabel(selectedDevice)}</p>}
    {selectedDevice?.status === "ACTIVE" && !selectedDevice.lastSeenAt && <p>Pairing succeeded. Click Connect in the Runtime window. If you used -PairOnly, it has exited: run the launcher again without -PairOnly using the same -StateDirectory. Pairing again is not required.</p>}
    {!pairingOnly && <><label className="block">Computer<select aria-label="Setup computer" className="w-full bg-surface-2 p-2" value={selectedComputer} onChange={e => { setComputer(e.target.value); onComputerSelected?.(e.target.value) }}><option value="">Choose your computer</option>{paired && !inventory.devices.some(d => d.runtimeId === paired.runtimeId) && <option value={paired.runtimeId}>{paired.displayName} · Paired · status refresh pending</option>}{inventory.devices.filter(d => d.status === "ACTIVE").map(d => <option key={d.runtimeId} value={d.runtimeId}>{d.displayName} · {runtimePairingLabel(d)}</option>)}</select></label>
    <RuntimeCapabilitySettings key={`${projectId}:${selectedComputer}`} projectId={projectId} runtimeId={selectedComputer} inventory={inventory} onChanged={onChanged} />
    <RuntimeAccessStatus key={`access:${projectId}:${selectedComputer}`} projectId={projectId} runtimeId={selectedComputer} inventory={inventory} onChanged={onChanged} /></>}
    {(error || inventory.configurationError) && <p role="alert">{error || inventory.configurationError}</p>}
  </section>
}

export function TrustedRuntimeComposer({ projectId, ensureConversation, onProposed, runtime, inventory = emptyRuntimeInventory, onRefresh }: { projectId: string | null; ensureConversation: () => Promise<string>; onProposed: (conversationId: string, runId: string) => Promise<void>; runtime?: WorkspaceRuntimeState; inventory?: RuntimeInventory; onRefresh?: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<{ scope: string; runtimeId: string } | null>(null)
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const scope = `${projectId}:${runtime?.binding?.workspaceId}:${runtime?.binding?.version}:${runtime?.binding?.runtimeId}`
  const runtimeId = runtimeSelection(runtime?.binding?.runtimeId, selection, scope)
  const setRuntimeId = (runtimeId: string) => setSelection({ scope, runtimeId })
  const { devices, grants } = inventory
  const [tool, setTool] = useState<RuntimeTool>("filesystem.read"), [path, setPath] = useState(""), [destination, setDestination] = useState("")
  const [content, setContent] = useState(""), [executable, setExecutable] = useState("node"), [args, setArgs] = useState('["--version"]'), [timeoutMs, setTimeoutMs] = useState(30000)
  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(""); try { await work(); await onRefresh?.() } catch (e) { setError(e instanceof Error ? e.message : "Runtime request failed") } finally { setBusy(false) } }
  useEffect(() => { if (open) void onRefresh?.() }, [open, onRefresh])
  const grant = grants.find(g => g.runtimeId === runtimeId && g.projectId === projectId)
  const device = devices.find(d => d.runtimeId === runtimeId)
  const selected = runtimeDeviceState(device, grant, runtime?.now ?? Date.now())
  const isBound = !!runtime?.binding && runtimeId === runtime.binding.runtimeId
  const identity = isBound ? runtime.identity : selected.identity
  const connection = isBound ? runtime.connection : selected.connection
  const grantStatus = isBound ? runtime.grantStatus : selected.grantStatus
  return <details className="trusted-runtime-composer" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>Trusted Local Runtime · exact action</summary>
    <p>{label}</p><p className="panel-caption">Saved capabilities and current runtime access are separate from approval of each exact action.</p>
    {(error || inventory.error) && <p role="alert">{error || inventory.error}</p>}
    <p className="panel-caption">Installation status unknown</p>
    <label>Pairing code<input aria-label="Runtime pairing code" value={code} onChange={e => setCode(e.target.value)} /></label>
    <button disabled={busy || !code} onClick={() => void act(async () => { const d = await post("enroll", { code: code.trim(), displayName: "Local Windows runtime" }); setRuntimeId(d.runtimeId); setCode("") })}>Enroll runtime</button>
    <p className="panel-caption">Start the local runtime client to obtain a pairing code. Enrollment alone grants no project access.</p>
    <label>Runtime<select aria-label="Runtime device" value={runtimeId} onChange={e => setRuntimeId(e.target.value)}><option value="">Select runtime</option>{runtimeId && !device && <option value={runtimeId}>Workspace Runtime unavailable</option>}{devices.map(d => <option key={d.runtimeId} value={d.runtimeId}>{d.displayName} · {d.fingerprint.slice(0, 12)} · {d.status}{d.runtimeId === runtime?.binding?.runtimeId ? " · Workspace Runtime" : ""}</option>)}</select></label>
    {runtime?.binding && !isBound && <p role="status">Not the Workspace Runtime. <button type="button" onClick={() => setRuntimeId(runtime.binding!.runtimeId)}>Select Workspace Runtime</button></p>}
    {!runtime?.binding && <p>No runtime bound. Selecting a device does not bind the Workspace.</p>}
    {isBound && !device && <p role="status">Workspace Runtime unavailable</p>}
    {device && <div className="panel-caption" aria-label="Selected Runtime details" data-runtime-id={runtimeId}>
      <p>Device: {device.displayName}</p><p>Runtime identity: {device.fingerprint.slice(0, 20)}</p>
      <p>Identity: {identity}</p><p>Connection: {connection}</p>
      <p>Last seen: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Unknown"}</p>
      <p>Project grant: {grantStatus}{grant?.expiresAt && ` · Expires ${new Date(grant.expiresAt).toLocaleString()}`}</p>
      <p>Workspace binding: {isBound ? `${runtime.bindingStatus} · v${runtime.binding!.version}` : "Not the Workspace Runtime"}</p>
      <p>Operation authorization: {isBound && runtime.readAuthorized ? "Workspace list/search/read use the Workspace Read Grant. Mutations and terminal still require separate exact-action approval." : "Each exact action requires approval and revalidation."}</p>
    </div>}
    <RuntimeCapabilitySettings key={`config:${scope}:${runtimeId}`} projectId={projectId} runtimeId={runtimeId} inventory={inventory} onChanged={onRefresh ?? (async () => {})} />
    <RuntimeAccessStatus key={`access:${scope}:${runtimeId}`} projectId={projectId} runtimeId={runtimeId} inventory={inventory} required={[tool]} onChanged={onRefresh ?? (async () => {})} />
    {grant && <><span> Grant v{grant.version} · {grantStatus}</span>{grantStatus === "ACTIVE" && <button disabled={busy} onClick={() => void act(() => post("grants/revoke", { runtimeId, projectId }))}>Revoke project grant</button>}</>}
    {device?.status === "ACTIVE" && <button disabled={busy} onClick={() => void act(() => post(`devices/${runtimeId}/status`, { status: "REVOKED" }))}>Revoke runtime</button>}
    <hr /><label>Action<select aria-label="Runtime action" value={tool} onChange={e => setTool(e.target.value as RuntimeTool)}>{tools.map(t => <option key={t}>{t}</option>)}</select></label>
    <label>{tool === "terminal.execute" ? "Working directory" : tool === "filesystem.copy" || tool === "filesystem.move" ? "Source path" : "Absolute path"}<input aria-label="Runtime absolute path" value={path} onChange={e => setPath(e.target.value)} placeholder="D:\project\file.txt" /></label>
    {["filesystem.move", "filesystem.copy"].includes(tool) && <label>Destination<input aria-label="Runtime destination" value={destination} onChange={e => setDestination(e.target.value)} /></label>}
    {["filesystem.write", "filesystem.create", "filesystem.search"].includes(tool) && <label>{tool === "filesystem.search" ? "Search text" : "Exact file content"}<textarea aria-label="Runtime content" value={content} onChange={e => setContent(e.target.value)} /></label>}
    {tool === "terminal.execute" && <><label>Executable<input aria-label="Runtime executable" value={executable} onChange={e => setExecutable(e.target.value)} /></label><label>Arguments (JSON array of strings)<textarea aria-label="Runtime arguments" value={args} onChange={e => setArgs(e.target.value)} /></label><label>Timeout (milliseconds)<input aria-label="Runtime timeout" type="number" min={100} max={300000} value={timeoutMs} onChange={e => setTimeoutMs(Number(e.target.value))} /></label></>}
    <button disabled={busy || connection !== "CONNECTED" || grantStatus !== "ACTIVE" || !grant?.capabilities.includes(tool) || !path} onClick={() => void act(async () => {
      const input = tool === "terminal.execute" ? { executable, args: JSON.parse(args), cwd: path, timeoutMs } : ["filesystem.copy", "filesystem.move"].includes(tool) ? { source: path, destination } : ["filesystem.write", "filesystem.create"].includes(tool) ? { path, content } : tool === "filesystem.search" ? { path, query: content } : { path }
      const conversationId = await ensureConversation(), result = await post("proposals", { conversationId, projectId, runtimeId, tool, input, purpose: `Requested ${tool}: ${path}`, requestId: crypto.randomUUID() })
      await onProposed(conversationId, result.runId)
    })}>Create plan and request approval</button>
  </details>
}

export type RuntimeActionSnapshot = { proposal: RuntimeProposal; execution: RuntimeExecution | null }
export function TrustedRuntimeExecutionCard({ runId, onChanged, showOutput = true, activePlan = false, terminalScope, onSnapshot, onInspect, onAsk }: { runId: string; onChanged?: () => Promise<void>; showOutput?: boolean; activePlan?: boolean; terminalScope?: { conversationId: string; cwd: string; runtimeId: string }; onSnapshot?: (snapshot: RuntimeActionSnapshot) => void; onInspect?: () => void; onAsk?: () => void }) {
  const [snapshot, setSnapshot] = useState<{ proposal: RuntimeProposal; execution: RuntimeExecution | null } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false)
  const polling = useRef<ReturnType<typeof createSnapshotPoller> | null>(null)
  const snapshotListener = useRef(onSnapshot)
  snapshotListener.current = onSnapshot
  useEffect(() => {
    let active = true; setSnapshot(null)
    const poller = createSnapshotPoller({ intervalMs: 1500, read: async () => {
      const s = await fetchSekhemApi<typeof snapshot>(`/trusted-runtime/runs/${runId}`, { throwOnError: true })
      if (active) { setSnapshot(s); setError(""); if (s) snapshotListener.current?.(s) }
      return activePlan || !!s && (s.execution ? ["DISPATCHED", "RUNNING"].includes(s.execution.state) : ["AWAITING_APPROVAL", "APPROVED"].includes(s.proposal.state))
    }, onError: (e, stopped) => { if (active) setError(`${snapshotFailure(e).message}${stopped ? " Automatic refresh paused." : " Retrying temporarily."}`) } })
    polling.current = poller; void poller.refresh()
    return () => { active = false; poller.stop() }
  }, [runId, activePlan])
  const act = async (suffix: string, body: Record<string, unknown>) => { setBusy(true); try { await post(`runs/${runId}/${suffix}`, body); await polling.current?.refresh(); await onChanged?.() } catch (e) { setError(e instanceof Error ? e.message : "Runtime control failed") } finally { setBusy(false) } }
  const p = snapshot?.proposal, e = snapshot?.execution, r = e?.result
  const displayOutput = runtimeOutputVisible(p, showOutput)
  if (terminalScope && p && (p.toolId !== "terminal.execute" || p.conversationId !== terminalScope.conversationId || p.runtimeId !== terminalScope.runtimeId || p.validatedInput.cwd !== terminalScope.cwd)) return null
  if (terminalScope && !p && !error) return <p role="status">Loading saved action…</p>
  if (terminalScope && snapshot) return <TerminalAction snapshot={snapshot} busy={busy} error={error} refresh={() => void polling.current?.refresh()}
    approve={() => act("decision", { fingerprint: p!.approvalFingerprint, decision: "APPROVED" })}
    reject={() => act("decision", { fingerprint: p!.approvalFingerprint, decision: "DENIED" })} cancel={() => act("cancel", {})} onInspect={onInspect} onAsk={onAsk} />
  return <TechnicalPanel className="section-page" label="Runtime action approval and execution"><div className="empty-kicker">{terminalScope && p ? `PS ${terminalScope.cwd}> ${terminalCommand(p)}` : "EXACT ACTION · TRUSTED LOCAL RUNTIME"}</div><h2>{runtimeActionLabel(e?.state ?? p?.state, e?.verificationState)}</h2>{!terminalScope && <p>{label}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void polling.current?.refresh()}>Refresh action state</button></p>}{p && <><p>{capabilityLabel(p.toolId)}</p><p>{p.workspaceRead ? "Authorized → Execute → Verify" : "Review → Approve → Execute → Verify"}</p><strong>{capabilityLabel(p.toolId)}</strong><p>{String(p.validatedInput.path ?? p.validatedInput.cwd ?? "")}</p><pre className="runtime-output">{capabilityDescription(p.preview.description)}</pre>
      <details><summary>Action details</summary><p>Tool {p.toolId}</p><p>{p.purpose}</p><p>{p.preview.description}</p><pre className="runtime-output">{JSON.stringify(p.validatedInput, null, 2)}</pre><p className="panel-caption">Proposal {p.proposalDigest.slice(0, 16)} · Grant v{p.grantVersion}</p></details>
      {p.workspaceRead && <details><summary>Reading access details</summary><p>Authorized by Workspace Read Grant · {p.workspaceRead.consent.workspaceId} · Binding v{p.workspaceRead.consent.bindingVersion} · {p.workspaceRead.consent.rootPath} · Grant v{p.workspaceRead.grantVersion}{p.workspaceRead.consent.expiresAt && ` · Recorded expiry ${new Date(p.workspaceRead.consent.expiresAt).toLocaleString()}`}</p></details>}
      {p.state === "AWAITING_APPROVAL" && <><p>{["filesystem.list", "filesystem.read", "filesystem.search"].includes(p.toolId) ? "This inspection accesses the shown path; this approval does not authorize file mutation." : "Review this action’s exact effect in the details. Approval does not replace current access checks."}</p>
        {p.toolId === "filesystem.write" && typeof p.validatedInput.expectedSha256 === "string" && <p>The Runtime checks the file's preimage digest before writing the exact approved content, then verifies the result. The plan requires a subsequent read-back to match that content. No automatic rollback is promised; restoring previous content requires a new reviewed action.</p>}
        <ApprovalActions disabled={busy || !!error}
          state={runtimeActionLabel(e?.state ?? p.state, e?.verificationState)}
          purpose={capabilityLabel(p.toolId)}
          target={String(p.validatedInput.path ?? p.validatedInput.cwd ?? "") || undefined}
          reason={capabilityDescription(p.preview.description)}
          onApprove={() => act("decision", { fingerprint: p.approvalFingerprint, decision: "APPROVED" })}
          onReject={() => act("decision", { fingerprint: p.approvalFingerprint, decision: "DENIED" })} onCancel={() => act("cancel", {})} /></>}
      {!e && p.state === "APPROVED" && <p>{p.workspaceRead ? "Covered by your bounded reading permission. Waiting for your computer." : "Approved. Waiting for your computer and current access checks."}</p>}
      {(!e && ["AWAITING_APPROVAL", "APPROVED"].includes(p.state) || e && ["DISPATCHED", "RUNNING"].includes(e.state)) && <button disabled={busy || e?.cancellationState === "REQUESTED"} onClick={() => void act("cancel", {})}>Cancel runtime action</button>}
    </>}{e && <><details><summary>Execution receipt</summary><p>{e.attribution.executionId}</p><p>Verification: {e.verificationState} · Cancellation: {e.cancellationState}</p></details>{e.state === "OUTCOME_UNKNOWN" && <p role="alert">The OS outcome is unknown. Inspect the machine before proposing another mutation. This operation will not be repeated automatically.</p>}
      {!r && e.error && <p role="alert">{e.error}</p>}
      {!displayOutput && r && <p>Workspace observations are displayed through the Explorer and Files viewer after current access and runtime checks.</p>}
      {displayOutput && !r && e.output && <details><summary>Runtime output details</summary><h3>Actual stdout · partial</h3><pre className="runtime-output">{e.output.stdout || "(empty)"}</pre><h3>Actual stderr · partial</h3><pre className="runtime-output">{e.output.stderr || "(empty)"}</pre></details>}
      {displayOutput && r && <details open={!!terminalScope}><summary>Runtime result details</summary><p>PID {r.pid ?? "—"} · Exit {r.exitCode ?? "—"} · {r.durationMs} ms{r.truncated ? " · Output truncated" : ""}</p><h3>Actual stdout</h3><pre className="runtime-output">{r.stdout || "(empty)"}</pre><h3>Actual stderr</h3><pre className="runtime-output">{r.stderr || "(empty)"}</pre>{r.error && <p role="alert">{r.error}</p>}<pre className="runtime-output">{JSON.stringify(r.verificationResult, null, 2)}</pre></details>}
    </>}
  </TechnicalPanel>
}
