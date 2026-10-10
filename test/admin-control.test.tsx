import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ADMIN_ROLES, adminList, adminErrorMessage, saveAdminUser, saveAdminMember, removeAdminMember } from "../lib/sekhem-admin"
import { AdminControlPanel } from "../components/admin/admin-control-panel"
import { sekhemRoleLabel } from "../lib/sekhem-roles"
const originalFetch = globalThis.fetch, originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL; else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase })
function fake(status = 200, data: unknown = []) {
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
  const calls: { url: string; options?: RequestInit }[] = []
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    calls.push({ url: String(url), options }); return new Response(JSON.stringify({ data: status < 400 ? data : null,
      errors: status < 400 ? [] : [{ code: "FORBIDDEN", message: "Denied" }] }), { status })
  }) as typeof fetch
  return calls
}
test("Admin Control presents real-data sections with loading state rather than mock account counts", () => {
  const html = renderToStaticMarkup(createElement(AdminControlPanel, { userId: "admin-a", projectId: "project-a" }))
  for (const label of ["Accounts", "Project access", "Services", "Activity", "Loading accounts"]) assert.ok(html.includes(label))
  assert.doesNotMatch(html, /Executive Viewer|CTO|users:|private_key|passwordHash/)
  assert.ok(html.includes("Personal chats and workspaces remain private"))
  assert.deepEqual(ADMIN_ROLES.map(sekhemRoleLabel), ["AI", "Security", "Software", "Admin", "Network"])
})
test("admin lists reject failed and malformed responses rather than showing an empty success", async () => {
  fake(403); await assert.rejects(adminList("/admin/users"), /Denied/)
  fake(200, { items: [] }); await assert.rejects(adminList("/admin/users"), /did not return an array/)
})
test("account mutations use authenticated POST/PATCH and encode identifiers", async () => {
  const calls = fake(200, { id: "user-a" })
  await saveAdminUser(null, { email: "test@example.test", password: "fixture-only", displayName: "Test", role: "Viewer" })
  await saveAdminUser("user/a", { status: "suspended" })
  assert.equal(calls[0].options?.method, "POST"); assert.equal(calls[1].options?.method, "PATCH")
  assert.ok(calls[1].url.endsWith("/admin/users/user%2Fa"))
  assert.ok(calls.every(call => call.options?.credentials === "include" && call.options?.cache === "no-store"))
  assert.equal(JSON.parse(String(calls[1].options?.body)).status, "suspended")
})
test("project and group mutations preserve exact scope; errors propagate", async () => {
  const calls = fake(200, { removed: true })
  await saveAdminMember("projects", "project/a", "user-a", "Viewer")
  await removeAdminMember("groups", "group/a", "user/b")
  assert.ok(calls[0].url.endsWith("/admin/projects/project%2Fa/members"))
  assert.ok(calls[1].url.endsWith("/admin/groups/group%2Fa/members/user%2Fb"))
  assert.equal(calls[1].options?.method, "DELETE")
  fake(403); await assert.rejects(saveAdminUser("user-a", { role: "Admin" }), /Denied/)
})
test("administration errors explain the failure without hiding it", () => {
  assert.match(adminErrorMessage(new Error("ADMIN_DUPLICATE_RECORD")), /already exists/)
  assert.match(adminErrorMessage(new Error("ADMIN_ROLE_NOT_CONFIGURED")), /No account changes were saved/)
  assert.match(adminErrorMessage(new Error("ADMIN_SELF_LOCKOUT_DENIED")), /cannot suspend your own/)
  assert.equal(adminErrorMessage(new Error("Unexpected service failure")), "Unexpected service failure")
})
