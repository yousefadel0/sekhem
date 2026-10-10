import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { demoRoutePolicy, roleCanAccessDemoRoute } from "../lib/sekhem-route-access"
import { SEKHEM_ROLE_KEYS, sekhemRoleLabel } from "../lib/sekhem-roles"

describe("Frontend route access policy", () => {
  it("keeps explicitly illustrative routes public and visibly classified as demo", () => {
    assert.deepEqual(demoRoutePolicy("/demo/overview"), { mode: "public_demo", roles: [] })
    assert.equal(roleCanAccessDemoRoute("/demo/overview", null), true)
  })

  it("gives all five roles operational access and reserves administration for Admin", () => {
    assert.deepEqual(demoRoutePolicy("/demo/admin-settings"), { mode: "operational", roles: ["Admin"] })
    assert.equal(roleCanAccessDemoRoute("/demo/admin-settings", "PM"), false)
    assert.equal(roleCanAccessDemoRoute("/demo/admin-settings", "Admin"), true)
    assert.deepEqual(SEKHEM_ROLE_KEYS.map(sekhemRoleLabel), ["AI", "Security", "Software", "Admin", "Network"])
    for (const role of SEKHEM_ROLE_KEYS) {
      for (const path of ["/demo/rd-radar", "/demo/ai-patch-assistant", "/demo/knowledge-base"]) assert.equal(roleCanAccessDemoRoute(path, role), true)
      assert.equal(roleCanAccessDemoRoute("/demo/admin-settings", role), role === "Admin")
    }
  })

  it("denies missing or expired sessions on operational routes", () => {
    for (const path of ["/demo/admin-settings", "/demo/rd-radar", "/demo/ai-patch-assistant", "/demo/knowledge-base"]) {
      assert.equal(roleCanAccessDemoRoute(path, null), false)
    }
  })

  it("does not substitute demo fixtures on authenticated live-data screens", () => {
    const radar = readFileSync(join(process.cwd(), "app/demo/rd-radar/page.tsx"), "utf8")
    const knowledge = readFileSync(join(process.cwd(), "app/demo/knowledge-base/page.tsx"), "utf8")
    assert.equal(radar.includes('from "@/lib/demo-data"'), false)
    assert.equal(knowledge.includes('from "@/lib/demo-data"'), false)
    assert.match(radar, /No demonstration fixtures were substituted/)
    assert.match(knowledge, /Demonstration fixtures were not substituted/)
  })
})
