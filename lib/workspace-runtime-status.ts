import type { RuntimeCapabilityEnrollment, RuntimeDevice, RuntimeGrant } from "@/backend/src/trusted-runtime/runtime.contract"
import type { RuntimeWorkspaceBinding, WorkspaceRuntimeDevice } from "./sekhem-agent"

export type RuntimeDeviceSummary = Pick<RuntimeDevice, "runtimeId" | "displayName" | "fingerprint" | "status" | "lastSeenAt">
export interface RuntimeInventory {
  devices: RuntimeDeviceSummary[]
  grants: RuntimeGrant[]
  enrollments?: RuntimeCapabilityEnrollment[]
  enrollmentErrors?: Record<string, string>
  loading: boolean
  error: string | null
  /** Identity/configuration snapshot error, independent of operational grant access. */
  configurationError?: string | null
  authenticationRequired?: boolean
}
export const emptyRuntimeInventory: RuntimeInventory = { devices: [], grants: [], loading: true, error: null }

/** Pairing registers identity; connectivity is established by the worker separately. */
export function runtimePairingLabel(device: RuntimeDeviceSummary | undefined, now = Date.now()) {
  if (!device) return "Device status unavailable"
  if (device.status !== "ACTIVE") return `Device ${device.status.toLowerCase()}`
  if (!device.lastSeenAt) return "Paired · waiting for first connection"
  return runtimeDeviceState(device, undefined, now).connection === "CONNECTED" ? "Connected" : "Disconnected"
}

/** Account connectivity is display-only; it never selects or retargets a workspace runtime. */
export function workspaceConnectionPresentation(binding: RuntimeWorkspaceBinding | undefined, inventory: RuntimeInventory | undefined, now = Date.now()) {
  const unavailable = !inventory || inventory.loading || inventory.authenticationRequired ||
    !!(inventory.configurationError === undefined ? inventory.error : inventory.configurationError)
  const connectedDevices = unavailable ? [] : inventory.devices.filter(d => runtimeDeviceState(d, undefined, now).connection === "CONNECTED")
  const boundDevice = binding && inventory?.devices.find(d => d.runtimeId === binding.runtimeId)
  const matches = !!boundDevice && boundDevice.fingerprint === binding?.runtimeFingerprint
  const boundStatus = unavailable ? "Status unavailable" : !binding ? "No workspace runtime bound"
    : !matches ? "Bound runtime unavailable" : runtimePairingLabel(boundDevice, now)
  const connected = !unavailable && !!binding && matches && runtimeDeviceState(boundDevice, undefined, now).connection === "CONNECTED"
  return { unavailable, connected, boundStatus, connectedDevices,
    otherConnectedDevices: connectedDevices.filter(d => d.runtimeId !== binding?.runtimeId), boundDevice: matches ? boundDevice : undefined }
}

/** Presentation eligibility only. The renewal endpoint revalidates session and all authority. */
export function runtimeEnrollmentState(device: RuntimeDeviceSummary | undefined, grant: RuntimeGrant | undefined,
  enrollment: RuntimeCapabilityEnrollment | undefined, now: number, required: readonly string[] = []) {
  const status = !enrollment ? "MISSING" : !device || enrollment.runtimeId !== device.runtimeId || enrollment.runtimeFingerprint !== device.fingerprint ? "STALE"
    : enrollment.status === "REVOKED" || enrollment.revokedAt ? "REVOKED"
    : enrollment.status !== "ACTIVE" || enrollment.expiresAt === undefined ? "INVALID"
    : enrollment.expiresAt !== null && (!Number.isFinite(Date.parse(enrollment.expiresAt)) || Date.parse(enrollment.expiresAt) <= now) ? "EXPIRED" : "ACTIVE"
  const missing = required.filter(capability => !enrollment?.capabilities.includes(capability as any))
  const configured = status === "ACTIVE" && missing.length === 0
  const access = runtimeDeviceState(device, grant, now)
  const enrollmentChanged = !!grant && !!enrollment && (grant.enrollment?.enrollmentId !== enrollment.enrollmentId ||
    grant.enrollment?.revision !== enrollment.revision || grant.enrollment?.runtimeFingerprint !== enrollment.runtimeFingerprint)
  return { status, missing, configurationRequired: !configured,
    canRenew: configured && device?.status === "ACTIVE" && (["EXPIRED", "MISSING"].includes(access.grantStatus) ||
      access.grantStatus === "ACTIVE" && (enrollmentChanged || required.some(capability => !grant?.capabilities.includes(capability as any)))), enrollmentChanged }
}

/** Presentation only: none of these labels authorize an operation. */
export function runtimeDeviceState(device: RuntimeDeviceSummary | undefined, grant: RuntimeGrant | undefined, now: number) {
  const identity = device?.status ?? "UNKNOWN"
  const connection = !device ? "UNKNOWN" : identity !== "ACTIVE" ? "UNAVAILABLE"
    : device.lastSeenAt && Date.parse(device.lastSeenAt) + 45000 > now ? "CONNECTED" : "OFFLINE"
  const grantStatus = !grant ? "MISSING" : grant.status === "REVOKED" ? "REVOKED"
    : grant.expiresAt && Date.parse(grant.expiresAt) <= now && !(grant.persistentReadAccess && grant.capabilities.every(c => ["filesystem.list", "filesystem.read", "filesystem.search"].includes(c))) ? "EXPIRED" : "ACTIVE"
  return { identity, connection, grantStatus }
}

/** Keep project-scoped discovery; refresh presentation from the shared inventory. */
export function workspaceFolderDevices(devices: WorkspaceRuntimeDevice[], inventory?: RuntimeInventory, now = Date.now()): WorkspaceRuntimeDevice[] {
  if (!inventory) return devices
  if (inventory.loading || inventory.error) return []
  return devices.flatMap(device => {
    const current = inventory.devices.find(d => d.runtimeId === device.runtimeId && d.fingerprint === device.fingerprint)
    return current ? [{ ...device, ...current, online: runtimeDeviceState(current, undefined, now).connection === "CONNECTED" }] : []
  })
}

export function workspaceRuntimeState(projectId: string | null, binding: RuntimeWorkspaceBinding | null | undefined,
  workspaceStatus: string, inventory: RuntimeInventory, now = Date.now()) {
  // Never substitute an arbitrary device when the binding cannot be resolved.
  const bound = binding?.projectId === projectId ? binding : null
  const device = inventory.devices.find(d => d.runtimeId === bound?.runtimeId)
  const grant = inventory.grants.find(g => g.runtimeId === bound?.runtimeId && g.projectId === projectId && g.organizationId === bound?.organizationId && g.userId === bound?.userId)
  const state = runtimeDeviceState(device, grant, now)
  const enrollment = inventory.enrollments?.find(e => e.runtimeId === bound?.runtimeId && e.projectId === projectId && e.userId === bound?.userId && e.organizationId === bound?.organizationId)
  let bindingStatus = workspaceStatus
  if (bound && ["READY", "VERIFYING", "DIRECTORY_MISSING"].includes(bindingStatus)) {
    if (inventory.loading || inventory.error || !device) bindingStatus = "UNAVAILABLE"
    else if (device.fingerprint !== bound.runtimeFingerprint) bindingStatus = "STALE"
    else if (device.status !== "ACTIVE") bindingStatus = "REVOKED"
    else if (state.grantStatus === "EXPIRED" && !grant?.persistentReadAccess) bindingStatus = "EXPIRED_GRANT"
    else if ((state.grantStatus !== "ACTIVE" && !(state.grantStatus === "EXPIRED" && grant?.persistentReadAccess)) || !grant?.capabilities.includes("filesystem.list") || !grant.capabilities.includes("filesystem.read")) bindingStatus = "UNAUTHORIZED"
    else if (state.connection === "OFFLINE") bindingStatus = "OFFLINE"
  }
  // A more recent binding availability result takes precedence over cached inventory.
  const connection = inventory.error || inventory.loading ? "UNKNOWN" : bindingStatus === "OFFLINE" ? "OFFLINE"
    : bindingStatus === "REVOKED" ? "UNAVAILABLE" : state.connection
  const identity = bindingStatus === "REVOKED" && state.identity === "ACTIVE" ? "REVOKED / DISABLED" : state.identity
  const grantStatus = bindingStatus === "EXPIRED_GRANT" ? "EXPIRED" : state.grantStatus
  const consent = grant?.workspaceRead;
  const consentMatches = !!bound && !!consent && consent.workspaceId === bound.workspaceId && consent.bindingId === bound.workspaceId && consent.bindingVersion === bound.version && consent.rootPath === bound.rootPath && consent.runtimeId === bound.runtimeId && consent.runtimeFingerprint === bound.runtimeFingerprint && consent.userId === bound.userId && consent.organizationId === bound.organizationId && consent.projectId === bound.projectId;
  const readConsentStatus = !consent ? "MISSING" : !consentMatches ? "STALE" : consent.status === "REVOKED" || consent.revokedAt ? "REVOKED" : grant?.persistentReadAccess && device?.status === "ACTIVE" && (consent.expiresAt === null || Number.isFinite(Date.parse(consent.expiresAt))) ? "ACTIVE" : consent.expiresAt === null || Date.parse(consent.expiresAt) <= now || !Number.isFinite(Date.parse(consent.expiresAt)) ? "EXPIRED" : "ACTIVE";
  const readAuthorized = readConsentStatus === "ACTIVE" && bindingStatus === "READY";
  const readAccess = readAuthorized ? "Authorized by Workspace Read Grant" : bound && bindingStatus === "READY" ? "Approval required for each operation"
    : bindingStatus === "EXPIRED_GRANT" ? "Project grant expired"
    : bindingStatus === "UNAUTHORIZED" ? "Workspace access required" : "Unavailable"
  const headline = !bound ? (workspaceStatus === "Loading" ? "Resolving Workspace Runtime" : ["Unavailable", "UNAUTHORIZED", "UNAVAILABLE"].includes(workspaceStatus) ? "Workspace Runtime unavailable" : "No runtime bound")
    : bindingStatus === "REVOKED" ? (identity === "DISABLED" ? "Disabled" : identity === "REVOKED" ? "Revoked" : "Revoked or disabled")
    : !device || inventory.error || inventory.loading ? "Workspace Runtime unavailable"
    : connection === "CONNECTED" ? "Connected" : connection === "OFFLINE" ? "Offline" : "Workspace Runtime unavailable"
  return { binding: bound, device, grant, enrollment, identity, connection, grantStatus, bindingStatus, readAccess, headline, readConsentStatus, readAuthorized,
    installation: "Installation status unknown", now, error: inventory.error }
}
export type WorkspaceRuntimeState = ReturnType<typeof workspaceRuntimeState>

/** Changing the selection here does not change a Workspace binding. */
export function runtimeSelection(boundId: string | undefined, selection: { scope: string; runtimeId: string } | null, scope: string) {
  return selection?.scope === scope ? selection.runtimeId : boundId ?? ""
}
