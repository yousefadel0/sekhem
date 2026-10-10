"use client"
import { workspaceAccessSummary } from "@/lib/workspace-presentation"
import { useState } from "react"
import { setWorkspaceReadGrant } from "@/lib/sekhem-agent"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"

export function WorkspaceReadGrantPanel({ runtime, onChanged, onAllowed, onCancel, requested }: { runtime: WorkspaceRuntimeState; onChanged: () => Promise<void>; onAllowed?: () => Promise<void>; onCancel?: () => void; requested?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const b = runtime.binding, grant = runtime.grant, consent = grant?.workspaceRead
  const consentActive = runtime.readConsentStatus === "ACTIVE"
  const unavailable = !!runtime.error || ["STALE", "UNAVAILABLE"].includes(runtime.bindingStatus)
  if (!b?.verifiedAt) return null
  const act = async (revoke: boolean) => {
    setBusy(true); setError(null)
    try { await setWorkspaceReadGrant(b, grant?.version ?? 0, revoke); await onChanged(); if (!revoke) await onAllowed?.() }
    catch (e) { setError(e instanceof Error ? e.message : "Workspace read consent unavailable") }
    finally { setBusy(false) }
  }
  return <section className="workspace-notice text-xs space-y-2" aria-label="Workspace Read Access">
    <strong>Read workspace</strong>
    {consentActive && consent ? <><p role="status">{workspaceAccessSummary(runtime)}</p>{!runtime.readAuthorized && <p>New operations unavailable: {runtime.bindingStatus}. Consent does not override runtime availability.</p>}</> : <><p role="status">{workspaceAccessSummary(runtime)}</p><h3>Allow bounded reading of this workspace?</h3>{requested && <p>Requested file: {requested}</p>}</>}
    <p>Workspace: {b.displayName}<br />Path: {b.rootPath}</p>
    <p>Browse, search and read files only.<br />This does not allow file changes, deletion, or command execution.</p>
    <details><summary>Access details</summary><p>Binding: {b.workspaceId} · v{b.version}<br />Runtime: {runtime.device?.displayName ?? "Bound runtime"} · {b.runtimeFingerprint.slice(0, 20)}</p>{consent && <p>Consent v{consent.version} · {runtime.readConsentStatus}{consent.expiresAt && ` · Recorded expiry ${new Date(consent.expiresAt).toLocaleString()}`}</p>}{grant && <p>Independent runtime access: Grant v{grant.version} · {runtime.grantStatus}</p>}<p>Scope applies only to this binding, runtime, project and account. Sensitive/excluded files remain denied. Each operation is revalidated and receives its own receipt.</p></details>
    <p>{grant?.persistentReadAccess ? "Development reading remains available until revoked while this computer and its enrollment are active." : "Reading consent has its own duration of up to 60 minutes."} It does not configure capabilities or renew runtime access.</p>
    {runtime.grantStatus !== "ACTIVE" && !grant?.persistentReadAccess && <p>Runtime access is {runtime.grantStatus.toLowerCase()}. Reads also require independently valid runtime access.</p>}
    {consentActive ? <button type="button" className="technical-button" disabled={busy || unavailable} onClick={() => void act(true)}>Stop workspace reading</button> : <><button type="button" className="technical-button" disabled={busy || unavailable || runtime.connection !== "CONNECTED" || runtime.identity !== "ACTIVE"} onClick={() => void act(false)}>{grant?.persistentReadAccess ? "Allow workspace reading" : "Allow workspace reading for up to one hour"}</button>{onCancel && <button type="button" className="technical-button" disabled={busy} onClick={onCancel}>Cancel</button>}</>}
    {error && <p role="alert">{error}</p>}
  </section>
}
