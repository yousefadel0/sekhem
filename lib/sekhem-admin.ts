import { fetchSekhemApi, postSekhemApi, patchSekhemApi, deleteSekhemApi, requireSekhemList } from "./sekhem-api"

import { SEKHEM_ROLE_KEYS } from "./sekhem-roles"

export const ADMIN_ROLES = SEKHEM_ROLE_KEYS
export type AdminRole = typeof ADMIN_ROLES[number]
export type AdminUser = { id: string; email: string; displayName: string; status: "active" | "suspended"; roles: { role: { key: AdminRole; name: string } }[] }
export type AdminMember = { userId: string; role: string; user: { displayName: string; email: string } }
export type AdminGroup = { id: string; name: string; members: AdminMember[] }
export type AdminAudit = { id: string; action: string; actor: string; target: string; module: string; createdAt: string }
export function adminErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Administration request failed."
  const notices: Record<string, string> = {
    ADMIN_DUPLICATE_RECORD: "An account or group with these details already exists.",
    ADMIN_ORGANIZATION_ACCESS_DENIED: "You can manage accounts and access only within your organization.",
    ADMIN_RESOURCE_NOT_FOUND: "This account, project or group is unavailable to your organization.",
    ADMIN_ROLE_INVALID: "Choose one of the supported roles.",
    ADMIN_ROLE_NOT_CONFIGURED: "This role is not configured. No account changes were saved.",
    ADMIN_SELF_LOCKOUT_DENIED: "You cannot suspend your own administrator account or remove your own administrator role.",
    ADMIN_STATUS_INVALID: "Choose Active or Suspended.",
    ADMIN_NAME_INVALID: "Enter a display name."
  }
  return notices[message] ?? message
}
export async function adminList<T>(path: string): Promise<T[]> {
  return requireSekhemList<T>(await fetchSekhemApi(path, { throwOnError: true }), path)
}
export async function saveAdminUser(id: string | null, input: Record<string, unknown>) {
  const path = id ? `/admin/users/${encodeURIComponent(id)}` : "/admin/users"
  return id ? patchSekhemApi<AdminUser, Record<string, unknown>>(path, input, { throwOnError: true })
    : postSekhemApi<AdminUser, Record<string, unknown>>(path, input, { throwOnError: true })
}
export async function saveAdminMember(kind: "projects" | "groups", id: string, userId: string, role: string) {
  return postSekhemApi(`/admin/${kind}/${encodeURIComponent(id)}/members`, { userId, role }, { throwOnError: true })
}
export async function removeAdminMember(kind: "projects" | "groups", id: string, userId: string) {
  return deleteSekhemApi(`/admin/${kind}/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { throwOnError: true })
}
