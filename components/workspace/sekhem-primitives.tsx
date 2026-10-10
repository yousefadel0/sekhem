"use client"
import { workspaceAccessSummary } from "@/lib/workspace-presentation"
import { type ReactNode, type ButtonHTMLAttributes } from "react"
import { MonitorOff } from "lucide-react"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"
import type { WorkspaceReceiptReference } from "@/lib/sekhem-agent"

export function SekhemMark({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="sekhem-mark">
    <path d="M22 4H37L33 9H24L38 34H31L18 10L22 4Z" fill="currentColor" />
    <path d="M12 7L18 11L8 28H18L21 34H2L12 17L8 16L12 7Z" fill="currentColor" opacity=".72" />
    <path d="M7 4H13L10 9H4L7 4Z" fill="currentColor" opacity=".45" />
  </svg>
}

export function TechnicalPanel({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={`technical-panel ${className}`}>{children}</section>
}

export function IconButton({ label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={`sekhem-icon-button ${className}`} {...props}>{children}</button>
}

export function RuntimeStatus({ compact = false, runtime }: { compact?: boolean; runtime?: WorkspaceRuntimeState }) {
  return <div className={`runtime-status ${compact ? "runtime-compact" : ""}`} aria-label="Workspace Runtime status" data-runtime-id={runtime?.binding?.runtimeId}>
    <MonitorOff size={16} aria-hidden="true" />
    <div><strong>Local Runtime</strong><span>{runtime?.headline ?? "No runtime bound"}</span>
      {runtime?.binding && <span>{runtime.device?.displayName ?? "Connected computer"}</span>}
      {runtime?.binding && runtime.readAccess !== "Approval required for each operation" && <span>{workspaceAccessSummary(runtime)}</span>}
      {runtime?.connection === "OFFLINE" && <span>Last seen {runtime.device?.lastSeenAt ? new Date(runtime.device.lastSeenAt).toLocaleString() : "unknown"}</span>}
    </div>
    {runtime?.binding && <details><summary>Connection details</summary><p>{runtime.binding.runtimeId} · {runtime.binding.runtimeFingerprint}</p></details>}
    {!compact && <p>{runtime?.binding ? `${workspaceAccessSummary(runtime)}. Changes require explicit approval and execution authorization.` : "Installation status unknown. Connect an enrolled runtime through the Workspace binding flow."}</p>}
  </div>
}

export function WorkspaceRuntimeSummary({ runtime }: { runtime: WorkspaceRuntimeState }) {
  return <section className="workspace-notice text-xs" aria-label="Workspace Runtime" data-runtime-id={runtime.binding?.runtimeId}>
    <strong>Workspace Runtime · {runtime.headline}</strong>
    {runtime.binding && <><p>{runtime.device?.displayName ?? "Connected computer"}</p>
      <p>{workspaceAccessSummary(runtime)}</p><details><summary>Access and connection details</summary><p>Runtime {runtime.binding.runtimeId} · Fingerprint {runtime.binding.runtimeFingerprint}</p><p>Identity: {runtime.identity} · Connection: {runtime.connection}</p>
      <p>Project grant: {runtime.grantStatus}{runtime.grant?.expiresAt && ` · Expires ${new Date(runtime.grant.expiresAt).toLocaleString()}`}</p>
      <p>Binding v{runtime.binding.version}: {runtime.bindingStatus}</p><p>Read access: {runtime.readAccess}</p>
      </details><p>Last seen: {runtime.device?.lastSeenAt ? new Date(runtime.device.lastSeenAt).toLocaleString() : "Unknown"}</p></>}
    <p>{runtime.installation}</p>{runtime.error && <p role="alert">{runtime.error}</p>}
  </section>
}

export function SavedObservationStatus({ receipt, available }: { receipt: Pick<WorkspaceReceiptReference, "observedAt" | "bindingVersion">; available?: boolean }) {
  return <div className="panel-caption" role="status"><strong>Saved observation · Previously verified</strong>
    <p>Observed {new Date(receipt.observedAt).toLocaleString()}</p>
    <p>{available === true ? "Current workspace access available; new operations require current authorization." : available === false ? "Runtime Workspace currently unavailable." : "Current workspace availability not checked."}</p>
    <details><summary>Observation details</summary>Binding v{receipt.bindingVersion}</details>
    <p>This observation is historical. The filesystem may have changed.</p>
  </div>
}
