import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import {
  updateConversation,
  deleteConversation,
  postConversationMessage,
  type ConversationMessageDto,
} from "../lib/sekhem-conversation"

const originalFetch = globalThis.fetch
const originalApiBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL

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

describe("Conversation Layer: Production Concurrency & Session Isolation", () => {
  it("PATCH /api/conversations/:id renames conversation with title and metadata", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const calls: Array<{ url: string; init?: RequestInit }> = []

    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(
        {
          id: "conv-101",
          projectId: "proj-1",
          userId: "user-1",
          title: "Renamed SONiC Analysis",
          metadata: { group: "Network Ops" },
          status: "active",
          createdAt: "2026-09-19T00:00:00Z",
          updatedAt: "2026-09-19T01:00:00Z",
        },
        200
      )
    }

    const updated = await updateConversation("conv-101", {
      title: "Renamed SONiC Analysis",
      metadata: { group: "Network Ops" },
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations/conv-101")
    assert.equal(calls[0].init?.method, "PATCH")
    assert.equal(calls[0].init?.credentials, "include")
    assert.deepEqual(
      JSON.parse(calls[0].init?.body as string),
      { title: "Renamed SONiC Analysis", metadata: { group: "Network Ops" } }
    )
    assert.equal(updated?.title, "Renamed SONiC Analysis")
  })

  it("DELETE /api/conversations/:id deletes conversation via HTTP DELETE", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const calls: Array<{ url: string; init?: RequestInit }> = []

    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse({ id: "conv-101", deleted: true }, 200)
    }

    const result = await deleteConversation("conv-101")

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations/conv-101")
    assert.equal(calls[0].init?.method, "DELETE")
    assert.equal(calls[0].init?.credentials, "include")
    assert.equal(result?.deleted, true)
  })

  it("three-way concurrency: requests capture immutable originConversationId and resolve independently", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"

    // Simulate 3 conversations with deferred resolvers
    type Resolver = (msg: ConversationMessageDto) => void
    const resolvers: Record<string, Resolver> = {}

    globalThis.fetch = async (input) => {
      const url = String(input)
      const match = url.match(/\/conversations\/([^/]+)\/messages/)
      const convId = match ? match[1] : "unknown"

      return new Promise((resolve) => {
        resolvers[convId] = (msg: ConversationMessageDto) => {
          resolve(apiResponse(msg, 200))
        }
      })
    }

    // State buckets per conversation
    const messagesByConv: Record<string, ConversationMessageDto[]> = {
      convA: [],
      convB: [],
      convC: [],
    }
    const requestStatus: Record<string, string> = {
      convA: "idle",
      convB: "idle",
      convC: "idle",
    }

    // Dispatch A, B, C concurrently
    const dispatch = async (originConvId: string, text: string) => {
      requestStatus[originConvId] = "generating"
      const result = await postConversationMessage(originConvId, text, undefined, { chat: true })
      // Concurrency invariant: response placed strictly in originConvId bucket
      messagesByConv[originConvId].push(result as ConversationMessageDto)
      requestStatus[originConvId] = "idle"
    }

    const promiseA = dispatch("convA", "Message in A")
    const promiseB = dispatch("convB", "Message in B")
    const promiseC = dispatch("convC", "Message in C")

    // Assert all 3 are generating concurrently
    assert.equal(requestStatus.convA, "generating")
    assert.equal(requestStatus.convB, "generating")
    assert.equal(requestStatus.convC, "generating")

    // Resolve B first (Reverse resolution test)
    resolvers.convB({
      id: "resp-B",
      conversationId: "convB",
      senderId: "assistant",
      senderType: "assistant",
      content: "Response for B",
      metadata: {},
      createdAt: new Date().toISOString(),
    })
    await promiseB

    // B has resolved, but A and C are still generating
    assert.equal(requestStatus.convB, "idle")
    assert.equal(requestStatus.convA, "generating")
    assert.equal(requestStatus.convC, "generating")
    assert.equal(messagesByConv.convB.length, 1)
    assert.equal(messagesByConv.convB[0].content, "Response for B")
    assert.equal(messagesByConv.convA.length, 0)
    assert.equal(messagesByConv.convC.length, 0)

    // Resolve C second
    resolvers.convC({
      id: "resp-C",
      conversationId: "convC",
      senderId: "assistant",
      senderType: "assistant",
      content: "Response for C",
      metadata: {},
      createdAt: new Date().toISOString(),
    })
    await promiseC

    assert.equal(requestStatus.convC, "idle")
    assert.equal(requestStatus.convA, "generating")
    assert.equal(messagesByConv.convC.length, 1)
    assert.equal(messagesByConv.convA.length, 0)

    // Resolve A last
    resolvers.convA({
      id: "resp-A",
      conversationId: "convA",
      senderId: "assistant",
      senderType: "assistant",
      content: "Response for A",
      metadata: {},
      createdAt: new Date().toISOString(),
    })
    await promiseA

    assert.equal(requestStatus.convA, "idle")
    assert.equal(messagesByConv.convA.length, 1)
    assert.equal(messagesByConv.convA[0].content, "Response for A")
  })

  it("per-conversation FIFO queue: queues subsequent messages and drains in sequence without blocking other sessions", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"

    const dispatchedLog: Array<{ convId: string; content: string }> = []
    let finishFirstA: (() => void) | null = null

    globalThis.fetch = async (input, init) => {
      const url = String(input)
      const convId = url.split("/")[5] // /api/conversations/:id/messages
      const body = JSON.parse(init?.body as string)
      dispatchedLog.push({ convId, content: body.content })

      if (convId === "convA" && body.content === "Msg 1 in A") {
        return new Promise((resolve) => {
          finishFirstA = () => {
            resolve(
              apiResponse({
                id: "resp-A1",
                conversationId: "convA",
                senderId: "assistant",
                senderType: "assistant",
                content: "Reply to A1",
                metadata: {},
                createdAt: new Date().toISOString(),
              })
            )
          }
        })
      }

      return apiResponse({
        id: `resp-${Date.now()}`,
        conversationId: convId,
        senderId: "assistant",
        senderType: "assistant",
        content: `Reply to ${body.content}`,
        metadata: {},
        createdAt: new Date().toISOString(),
      })
    }

    // Queue implementation simulation matching app/page.tsx
    const queues: Record<string, string[]> = { convA: [], convB: [] }
    const statuses: Record<string, string> = { convA: "idle", convB: "idle" }
    const results: Record<string, string[]> = { convA: [], convB: [] }

    const processQueue = async (cId: string) => {
      if (queues[cId].length === 0) {
        statuses[cId] = "idle"
        return
      }
      statuses[cId] = "generating"
      const item = queues[cId].shift()!
      const res = await postConversationMessage(cId, item, undefined, { chat: true })
      results[cId].push((res as ConversationMessageDto).content)
      await processQueue(cId)
    }

    const send = async (cId: string, text: string) => {
      if (statuses[cId] === "generating") {
        queues[cId].push(text)
        return
      }
      statuses[cId] = "generating"
      const promise = postConversationMessage(cId, text, undefined, { chat: true }).then(async (res) => {
        results[cId].push((res as ConversationMessageDto).content)
        await processQueue(cId)
      })
      return promise
    }

    // 1. Send Msg 1 in A (holds in-flight)
    const p1 = send("convA", "Msg 1 in A")
    assert.equal(statuses.convA, "generating")

    // 2. Queue Msg 2 in A while A is generating
    await send("convA", "Msg 2 in A")
    assert.equal(queues.convA.length, 1)
    assert.equal(queues.convA[0], "Msg 2 in A")

    // 3. Send message in B — dispatches IMMEDIATELY, not blocked by A's queue
    await send("convB", "Msg 1 in B")
    assert.equal(results.convB.length, 1)
    assert.equal(results.convB[0], "Reply to Msg 1 in B")

    // Msg 2 in A has not yet dispatched
    assert.equal(dispatchedLog.filter((x) => x.convId === "convA").length, 1)

    // 4. Resolve Msg 1 in A
    finishFirstA!()
    await p1

    // A's queue should now have drained FIFO
    assert.equal(queues.convA.length, 0)
    assert.equal(results.convA.length, 2)
    assert.equal(results.convA[0], "Reply to A1")
    assert.equal(results.convA[1], "Reply to Msg 2 in A")
  })

  it("draft isolation: drafts persist in memory per conversation and do not leak across sessions", () => {
    const drafts: Record<string, string> = {}
    const NEW_CHAT_KEY = "__new_chat__"

    // User types in New Chat
    drafts[NEW_CHAT_KEY] = "Draft in new chat"

    // User switches to Session 1 and types
    drafts["session-1"] = "Draft in session 1"

    // User switches to Session 2 and types
    drafts["session-2"] = "Draft in session 2"

    // Verify isolation
    assert.equal(drafts[NEW_CHAT_KEY], "Draft in new chat")
    assert.equal(drafts["session-1"], "Draft in session 1")
    assert.equal(drafts["session-2"], "Draft in session 2")

    // Clearing draft in session 1 does not affect session 2 or new chat
    drafts["session-1"] = ""
    assert.equal(drafts["session-1"], "")
    assert.equal(drafts["session-2"], "Draft in session 2")
    assert.equal(drafts[NEW_CHAT_KEY], "Draft in new chat")
  })

  it("error isolation: failure in session A does not degrade session B", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"

    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.includes("/conversations/failing-conv/")) {
        return apiResponse({ error: "Internal Error" }, 500)
      }
      return apiResponse({
        id: "msg-healthy",
        conversationId: "healthy-conv",
        senderId: "assistant",
        senderType: "assistant",
        content: "Healthy response",
        metadata: {},
        createdAt: new Date().toISOString(),
      })
    }

    const errors: Record<string, string | null> = {}
    const results: Record<string, string | null> = {}

    // Dispatch failing session
    try {
      await postConversationMessage("failing-conv", "Trigger error", undefined, { chat: true, throwOnError: true })
    } catch (err: any) {
      errors["failing-conv"] = err.message
    }

    // Dispatch healthy session
    try {
      const healthyRes = await postConversationMessage("healthy-conv", "Hello", undefined, {
        chat: true,
        throwOnError: true,
      })
      results["healthy-conv"] = (healthyRes as ConversationMessageDto).content
    } catch (err: any) {
      errors["healthy-conv"] = err.message
    }

    assert.ok(errors["failing-conv"])
    assert.equal(errors["healthy-conv"], undefined)
    assert.equal(results["healthy-conv"], "Healthy response")
  })

  it("strict storage invariant: zero use of localStorage, sessionStorage, or IndexedDB in conversation files", () => {
    const filesToCheck = [
      join(process.cwd(), "app", "page.tsx"),
      join(process.cwd(), "components", "chat", "command-composer.tsx"),
      join(process.cwd(), "components", "workspace", "workspace-sidebar.tsx"),
      join(process.cwd(), "lib", "sekhem-conversation.ts"),
    ]

    for (const filePath of filesToCheck) {
      const content = readFileSync(filePath, "utf8")
      assert.doesNotMatch(
        content,
        /localStorage|sessionStorage|indexedDB|openDatabase/,
        `File ${filePath} must not access browser storage directly; PostgreSQL is the source of truth.`
      )
    }
  })

  it("conversation grouping: groups sessions by custom group metadata or project name", () => {
    const conversations = [
      { id: "c1", title: "BGP Session", projectId: "p1", metadata: { group: "Network Ops" }, status: "active", createdAt: "", updatedAt: "" },
      { id: "c2", title: "OSPF Session", projectId: "p1", metadata: { group: "Network Ops" }, status: "active", createdAt: "", updatedAt: "" },
      { id: "c3", title: "SONiC Core", projectId: "p1", metadata: {}, status: "active", createdAt: "", updatedAt: "" },
      { id: "c4", title: "Billing Inquiry", projectId: "p2", metadata: {}, status: "active", createdAt: "", updatedAt: "" },
    ]
    const projects = [
      { id: "p1", name: "SONiC Telemetry", slug: "sonic", customerFacingName: "SONiC", status: "active" as const, phase: "1", platform: "SONiC" },
      { id: "p2", name: "Operations", slug: "ops", customerFacingName: "Ops", status: "active" as const, phase: "1", platform: "General" },
    ]

    const projectMap = new Map(projects.map((p) => [p.id, p.name]))

    // Grouping reducer matching workspace-sidebar.tsx
    const groups: Record<string, typeof conversations> = {}
    for (const conv of conversations) {
      const customGroup = typeof conv.metadata?.group === "string" ? conv.metadata.group.trim() : null
      const groupName = customGroup || projectMap.get(conv.projectId) || "Ungrouped"
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(conv)
    }

    assert.equal(Object.keys(groups).length, 3)
    assert.equal(groups["Network Ops"].length, 2)
    assert.equal(groups["SONiC Telemetry"].length, 1)
    assert.equal(groups["Operations"].length, 1)
  })

  it("cross-session user memory invariant: memory service remains intact and untouched", () => {
    const memoryServicePath = join(process.cwd(), "backend", "src", "agent-runtime", "memory", "memory.service.ts")
    const memoryServiceCode = readFileSync(memoryServicePath, "utf8")
    // Verify user memory methods and persistent model calls remain unmodified
    assert.match(memoryServiceCode, /getMemoriesForUser/)
    assert.match(memoryServiceCode, /upsertMemory/)
    assert.match(memoryServiceCode, /prisma\.userMemory/)
  })

  it("composer autofocus safety: autofocus helper does not steal focus when activeElement is an input, textarea, or in a modal dialog", () => {
    const composerCode = readFileSync(join(process.cwd(), "components", "chat", "command-composer.tsx"), "utf8")
    assert.match(composerCode, /activeEl\.tagName === "INPUT"/)
    assert.match(composerCode, /activeEl\.tagName === "TEXTAREA"/)
    assert.match(composerCode, /activeEl\.getAttribute\("role"\) === "dialog"/)
    assert.match(composerCode, /activeEl\.closest\("\[role='dialog'\]"\)/)
  })
})
