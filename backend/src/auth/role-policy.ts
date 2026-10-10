import type { AuthRoleDto } from "./auth.dto";

// Persisted keys stay compatible with existing accounts and sessions.
// AI, Software, Security and Network are equal project operator roles.
const PROJECT_ROLES: readonly AuthRoleDto[] = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"];

export function isProjectOperator(role: string): role is AuthRoleDto {
  return PROJECT_ROLES.includes(role as AuthRoleDto);
}

export function roleCanUse(role: string, required: readonly AuthRoleDto[]): boolean {
  if (!isProjectOperator(role) || required.length === 0) return false;
  // An exclusively administrative policy never becomes an operator policy.
  if (required.every(value => value === "Admin")) return role === "Admin";
  return required.some(value => value !== "Admin" && isProjectOperator(value));
}
