export type SekhemRole = "Admin" | "PM" | "Technical Reviewer" | "Security Reviewer" | "Viewer"

export type DemoRoutePolicy =
  | { mode: "public_demo"; roles: readonly SekhemRole[] }
  | { mode: "operational"; roles: readonly SekhemRole[] }

const ALL_AUTHENTICATED: readonly SekhemRole[] = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"]

const OPERATIONAL_ROUTES: Array<{ prefix: string; roles: readonly SekhemRole[] }> = [
  { prefix: "/demo/admin-settings", roles: ["Admin"] },
  { prefix: "/demo/rd-radar", roles: ALL_AUTHENTICATED },
  { prefix: "/demo/ai-patch-assistant", roles: ALL_AUTHENTICATED },
  { prefix: "/demo/knowledge-base", roles: ALL_AUTHENTICATED },
]

export function demoRoutePolicy(pathname: string): DemoRoutePolicy {
  const operational = OPERATIONAL_ROUTES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return operational ? { mode: "operational", roles: operational.roles } : { mode: "public_demo", roles: [] }
}

export function roleCanAccessDemoRoute(pathname: string, role: SekhemRole | null): boolean {
  const policy = demoRoutePolicy(pathname)
  return policy.mode === "public_demo" || (role !== null && policy.roles.includes(role))
}
