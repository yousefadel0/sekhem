import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { fetchSekhemApi, requireSekhemList, SekhemApiError } from "../lib/sekhem-api"

const originalFetch = globalThis.fetch
const originalApiBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalApiBase
})

describe("Admin Overview API contract helpers", () => {
  it("rejects non-array audit payloads instead of calling slice on an object", () => {
    assert.throws(
      () => requireSekhemList({ items: [] }, "GET /api/audit-events"),
      (error: unknown) => {
        assert.ok(error instanceof SekhemApiError)
        assert.equal(error.code, "INVALID_RESPONSE")
        return true
      },
    )
  })

  it("accepts a real array envelope payload", () => {
    const events = requireSekhemList<{ id: string }>([{ id: "evt-1" }], "GET /api/audit-events")
    assert.equal(events.length, 1)
    assert.equal(events.slice(0, 5)[0].id, "evt-1")
  })

  it("surfaces HTTP status instead of converting failures into empty arrays", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        data: null,
        meta: { timestamp: new Date(0).toISOString() },
        errors: [{ code: "UNAUTHORIZED", message: "Authentication required" }],
      }), { status: 401, headers: { "content-type": "application/json" } })

    await assert.rejects(
      () => fetchSekhemApi("/audit-events", { throwOnError: true }),
      (error: unknown) => {
        assert.ok(error instanceof SekhemApiError)
        assert.equal(error.status, 401)
        assert.equal(error.code, "UNAUTHORIZED")
        return true
      },
    )
  })
})
