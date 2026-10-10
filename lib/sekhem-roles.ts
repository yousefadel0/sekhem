// Use stable stored keys so existing accounts and sessions retain their identity.
export const SEKHEM_ROLE_LABELS = {
  PM: "AI",
  "Security Reviewer": "Security",
  "Technical Reviewer": "Software",
  Admin: "Admin",
  Viewer: "Network",
} as const

export type SekhemRoleKey = keyof typeof SEKHEM_ROLE_LABELS
export const SEKHEM_ROLE_KEYS = ["PM", "Security Reviewer", "Technical Reviewer", "Admin", "Viewer"] as const

export function sekhemRoleLabel(role: string | null | undefined): string {
  return role && Object.prototype.hasOwnProperty.call(SEKHEM_ROLE_LABELS, role)
    ? SEKHEM_ROLE_LABELS[role as SekhemRoleKey] : role ?? ""
}
