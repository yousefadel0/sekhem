import assert from "node:assert/strict"
import { it } from "node:test"
import { NextRequest } from "next/server"
import { GET } from "../app/api/[[...path]]/route"

it("forwards SSE before the backend closes, preserving cookies and resume cursor", async () => {
  const original = globalThis.fetch
  const encoder = new TextEncoder()
  let source!: ReadableStreamDefaultController<Uint8Array>
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("cookie"), "sekhem_session=test")
    assert.equal(headers.get("last-event-id"), "evt-previous")
    return new Response(new ReadableStream({ start(controller) { source = controller; controller.enqueue(encoder.encode("id: evt-one\nevent: UNDERSTANDING_STARTED\ndata: {}\n\n")) } }), { headers: { "content-type": "text/event-stream" } })
  }
  try {
    const result = await Promise.race([GET(new NextRequest("http://localhost/api/agent-runs/run/events", { headers: { cookie: "sekhem_session=test", "last-event-id": "evt-previous" } }), { params: Promise.resolve({ path: ["agent-runs", "run", "events"] }) }),
      new Promise<never>((_, reject) => setTimeout(() => reject(Error("Proxy buffered a live stream")), 500))])
    const reader = result.body!.getReader()
    assert.match(new TextDecoder().decode((await reader.read()).value), /UNDERSTANDING_STARTED/)
    source.enqueue(encoder.encode("id: evt-two\nevent: PLAN_CREATED\ndata: {}\n\n"))
    assert.match(new TextDecoder().decode((await reader.read()).value), /PLAN_CREATED/)
    source.close()
    assert.equal((await reader.read()).done, true)
  } finally { globalThis.fetch = original }
})

it("preserves ordinary JSON and Set-Cookie proxy responses", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { ok: true }, errors: [] }), { headers: { "content-type": "application/json", "set-cookie": "sekhem_session=test; HttpOnly; Path=/" } })
  try {
    const response = await GET(new NextRequest("http://localhost/api/auth/session"), { params: Promise.resolve({ path: ["auth", "session"] }) })
    assert.equal((await response.json()).data.ok, true)
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/)
  } finally { globalThis.fetch = original }
})
