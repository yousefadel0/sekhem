import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import {
  authenticateSekhemSession,
  logoutSekhemSession,
  runSekhemLoginFlow,
  type SekhemAuthSession,
} from "../lib/sekhem-auth"

const originalFetch = globalThis.fetch
const originalApiBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL

const adminSession: SekhemAuthSession = {
  authenticated: true,
  user: { id: "user-test", email: "admin@example.test", displayName: "Admin", role: "Admin" },
  expiresAt: "2030-01-01T00:00:00.000Z",
}

function apiResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, meta: { timestamp: new Date(0).toISOString() }, errors: [] }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalApiBase
})

describe("Frontend real authentication client", () => {
  it("logs in through the Backend, confirms the cookie-backed session, and never returns a token", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(adminSession, calls.length === 1 ? 201 : 200)
    }

    const result = await authenticateSekhemSession(" admin@example.test ", "test-password")

    assert.deepEqual(result, adminSession)
    assert.equal("token" in (result as unknown as Record<string, unknown>), false)
    assert.deepEqual(calls.map((call) => call.url), [
      "https://api.example.test/api/auth/login",
      "https://api.example.test/api/auth/session",
    ])
    assert.equal(calls[0].init?.method, "POST")
    assert.equal(calls[0].init?.credentials, "include")
    assert.equal(calls[1].init?.credentials, "include")
  })

  it("does not submit a blank form or redirect after invalid credentials", async () => {
    let authenticateCalls = 0
    let redirects = 0
    const authenticate = async () => {
      authenticateCalls += 1
      return null
    }

    const result = await runSekhemLoginFlow("", "", () => {
      redirects += 1
    }, authenticate)

    assert.equal(result.authenticated, false)
    assert.equal(authenticateCalls, 0)
    assert.equal(redirects, 0)
  })

  it("retries session confirmation when initial session check returns 401", async () => {
    // Simulate login with valid credentials but first session call fails (401)
    // We'll mock fetch to return 201 on login, then 401 on first session attempt, then 200 on second attempt.
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    let redirects = 0
    const calls: Array<{ url: string; init?: RequestInit }> = []
    let fetchCallCount = 0
    globalThis.fetch = async (input, init) => {
      fetchCallCount++
      calls.push({ url: String(input), init })
      if (fetchCallCount === 1) {
        // login
        return new Response(JSON.stringify({ data: adminSession, meta: {}, errors: [] }), { status: 201 })
      } else if (fetchCallCount === 2) {
        // first session attempt – simulate 401
        return new Response(JSON.stringify({ data: null, meta: {}, errors: [{ code: "UNAUTHORIZED", message: "" }] }), { status: 401 })
      } else {
        // second session attempt – succeed
        return new Response(JSON.stringify({ data: adminSession, meta: {}, errors: [] }), { status: 200 })
      }
    }
    const loginResult = await runSekhemLoginFlow("admin@example.test", "test-password", () => { redirects += 1 }, async (e, p) => {
      // Use the real authenticateSekhemSession which now includes retry
      return await authenticateSekhemSession(e, p)
    })
    assert.deepEqual(loginResult, { authenticated: true, message: "" })
    assert.equal(redirects, 1)
    // Expect three fetch calls: login + two session attempts
    assert.equal(calls.length, 3)
    assert.equal(calls[0].url, "https://api.example.test/api/auth/login")
    assert.equal(calls[1].url, "https://api.example.test/api/auth/session")
    assert.equal(calls[2].url, "https://api.example.test/api/auth/session")
  })

  it("fails login when session confirmation persistently returns 401", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    let redirects = 0
    // Persistent failure: session never validates
    let fetchCallCount = 0
    const callsFail: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      fetchCallCount++
      callsFail.push({ url: String(input), init })
      if (fetchCallCount === 1) {
        return new Response(JSON.stringify({ data: adminSession, meta: {}, errors: [] }), { status: 201 })
      } else {
        // All session attempts return 401
        return new Response(JSON.stringify({ data: null, meta: {}, errors: [{ code: "UNAUTHORIZED", message: "" }] }), { status: 401 })
      }
    }
    const persistFail = await runSekhemLoginFlow("admin@example.test", "test-password", () => { redirects += 1 }, async (e, p) => {
      return await authenticateSekhemSession(e, p)
    })
    assert.deepEqual(persistFail, { authenticated: false, message: "Invalid credentials" })
    assert.equal(redirects, 0)
    assert.equal(callsFail.length, 4) // login + 3 session attempts
    assert.equal(callsFail[0].url, "https://api.example.test/api/auth/login")
    assert.equal(callsFail[1].url, "https://api.example.test/api/auth/session")
    assert.equal(callsFail[2].url, "https://api.example.test/api/auth/session")
    assert.equal(callsFail[3].url, "https://api.example.test/api/auth/session")
  })

  it("redirects only after the confirmed session and logs out through the Backend", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    let redirects = 0
    const login = await runSekhemLoginFlow(
      "admin@example.test",
      "test-password",
      () => { redirects += 1 },
      async () => adminSession,
    )

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse({ authenticated: false, loggedOut: true }, 201)
    }
    const loggedOut = await logoutSekhemSession()

    assert.deepEqual(login, { authenticated: true, message: "" })
    assert.equal(redirects, 1)
    assert.equal(loggedOut, true)
    assert.equal(calls[0].url, "https://api.example.test/api/auth/logout")
    assert.equal(calls[0].init?.method, "POST")
    assert.equal(calls[0].init?.credentials, "include")
  })

  it("keeps SSO disabled and never persists credentials or session tokens in browser storage", () => {
    const loginPage = readFileSync(join(process.cwd(), "app", "login", "page.tsx"), "utf8")
    const authClient = readFileSync(join(process.cwd(), "lib", "sekhem-auth.ts"), "utf8")
    const source = `${loginPage}\n${authClient}`

    assert.match(loginPage, /SSO not configured/)
    assert.match(loginPage, /disabled/)
    assert.doesNotMatch(loginPage, /ENV: PRODUCTION|CLUSTER: ACTIVE|PROTOCOL: HTTP-ONLY/)
    assert.doesNotMatch(loginPage, /setTimeout/)
    assert.doesNotMatch(source, /localStorage|sessionStorage|sekhem_session/)
  })

})
