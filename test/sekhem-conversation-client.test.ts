import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import {
  fetchProjects,
  listConversations,
  createConversation,
  postConversationMessage,
  generateConversationPlan,
  getConversation,
  isTriggerAgentResponse,
  isConversationTransfer,
  reconcileConversationMessages,
  acknowledgeConversationMessage,
  resolveWorkspaceConversation,
  type TriggerAgentMessageResponseDto,
} from "../lib/sekhem-conversation"

const originalFetch = globalThis.fetch
const originalApiBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL

function apiResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, meta: { timestamp: new Date(0).toISOString() }, errors: [] }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

it("planning is an explicit versioned POST and exposes the server-persisted identity", async () => {
  process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api";
  const body = { requestId: "explicit-attempt", expectedVersion: 2, instruction: "Revise the proposed comment. Acceptance: behavior is unchanged." };
  let posted: unknown;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/conversations\/agent-chat\/plans$/); assert.equal(init?.method, "POST");
    posted = JSON.parse(String(init?.body));
    return apiResponse({ runId: "planning_run_saved", planId: "plan-saved", version: 3, status: "PLAN_READY", digest: "immutable-digest" });
  };
  const result = await generateConversationPlan("agent-chat", body);
  assert.deepEqual(posted, body); assert.equal(result?.planId, "plan-saved"); assert.equal(result?.version, 3);
});

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalApiBase
})

describe("Frontend Conversation & Project API client", () => {
  it("correlates a completed planning acknowledgement before or after snapshot arrival without duplicate optimistic messages", () => {
    const pending = { id: "msg_user_opt_plan", conversationId: "conv", senderId: "u", senderType: "user", content: "Plan the change", metadata: {}, createdAt: new Date(0).toISOString() };
    const queued = { ...pending, id: "msg_user_queued_next" };
    const saved = { ...pending, id: "planning_attempt_message", content: "Generate an engineering plan: Plan the change" };
    const acknowledged = acknowledgeConversationMessage([pending, queued], pending.id, saved.id);
    assert.equal(acknowledged[0].metadata.clientMessageId, pending.id);
    assert.equal(pending.id, "msg_user_opt_plan");
    assert.deepEqual(reconcileConversationMessages([saved], acknowledged), [saved, queued]);
    assert.deepEqual(acknowledgeConversationMessage([saved, pending, queued], pending.id, saved.id), [saved, queued]);
  });
  it("preserves identical queued messages and replaces only the acknowledged client message", () => {
    const message = { id: "msg_user_opt_1", conversationId: "conv", senderId: "u", senderType: "user", content: "Inspect auth", metadata: {}, createdAt: new Date(0).toISOString() };
    const queued = { ...message, id: "msg_user_queued_2", metadata: { isQueued: true } };
    const saved = { ...message, id: "server-1", metadata: { clientMessageId: message.id } };
    assert.deepEqual(reconcileConversationMessages([saved], [message, queued]).map(item => item.id), ["server-1", "msg_user_queued_2"]);
  })
  it("fetches projects through the backend contract GET /api/projects", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockProjects = [
      {
        id: "project-1",
        slug: "community-sonic",
        name: "Community SONiC",
        customerFacingName: "Community SONiC",
        status: "active" as const,
        phase: "phase_1",
        platform: "SONiC",
      },
    ]

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockProjects, 200)
    }

    const projects = await fetchProjects()
    assert.deepEqual(projects, mockProjects)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/projects")
    assert.equal(calls[0].init?.credentials, "include")
  })

  it("reports an invalid project response instead of presenting an empty project list", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () => apiResponse({}, 200)

    await assert.rejects(fetchProjects(), /Projects response is invalid/)
  })

  it("creates conversation via POST /api/conversations with required projectId and title", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockConv = {
      id: "conv-101",
      projectId: "project-1",
      userId: "user-1",
      title: "SONiC Telemetry Analysis",
      status: "active",
      createdAt: "2026-09-16T00:00:00Z",
      updatedAt: "2026-09-16T00:00:00Z",
    }

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockConv, 201)
    }

    const conv = await createConversation("project-1", "SONiC Telemetry Analysis")
    assert.deepEqual(conv, mockConv)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations")
    assert.equal(calls[0].init?.method, "POST")
    assert.equal(calls[0].init?.credentials, "include")
    assert.equal(calls[0].init?.body, JSON.stringify({ projectId: "project-1", title: "SONiC Telemetry Analysis", mode: "CHAT" }))
  })

  it("posts message to conversation via POST /api/conversations/:id/messages", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockMsg = {
      id: "msg-201",
      conversationId: "conv-101",
      senderId: "user-1",
      senderType: "user",
      content: "Analyze BGP EVPN fabric routes",
      metadata: {},
      createdAt: "2026-09-16T00:00:01Z",
    }

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockMsg, 201)
    }

    const msg = await postConversationMessage("conv-101", "Analyze BGP EVPN fabric routes")
    assert.deepEqual(msg, mockMsg)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations/conv-101/messages")
    assert.equal(calls[0].init?.method, "POST")
    assert.equal(calls[0].init?.credentials, "include")
    assert.equal(
      calls[0].init?.body,
      JSON.stringify({ content: "Analyze BGP EVPN fabric routes", senderType: "user" })
    )
  })

  it("fetches conversation detail via GET /api/conversations/:id", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockDetail = {
      id: "conv-101",
      projectId: "project-1",
      userId: "user-1",
      title: "SONiC Telemetry Analysis",
      status: "active",
      createdAt: "2026-09-16T00:00:00Z",
      updatedAt: "2026-09-16T00:00:00Z",
      messages: [],
      agentRuns: [],
      metadata: {},
    }

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockDetail, 200)
    }

    const detail = await getConversation("conv-101")
    assert.deepEqual(detail, mockDetail)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations/conv-101")
    assert.equal(calls[0].init?.credentials, "include")
  })

  it("throws SekhemApiError on createConversation failure when throwOnError is true", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: null,
          meta: { timestamp: new Date(0).toISOString() },
          errors: [{ code: "BAD_REQUEST", message: "projectId and title are required" }],
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )

    await assert.rejects(
      async () => {
        await createConversation("", "", undefined, { throwOnError: true })
      },
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 400)
        assert.equal((err as { code: string }).code, "BAD_REQUEST")
        assert.equal((err as { message: string }).message, "projectId and title are required")
        return true
      }
    )
  })

  it("throws SekhemApiError on postConversationMessage failure when throwOnError is true", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: null,
          meta: { timestamp: new Date(0).toISOString() },
          errors: [{ code: "NOT_FOUND", message: "Conversation not found" }],
        }),
        { status: 404, headers: { "content-type": "application/json" } }
      )

    await assert.rejects(
      async () => {
        await postConversationMessage("non-existent-conv", "Hello", undefined, { throwOnError: true })
      },
      (err: unknown) => {
        assert.equal((err as { status: number }).status, 404)
        assert.equal((err as { code: string }).code, "NOT_FOUND")
        assert.equal((err as { message: string }).message, "Conversation not found")
        return true
      }
    )
  })

  it("posts message with triggerAgent: true and returns TriggerAgentMessageResponseDto", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockTriggerResponse: TriggerAgentMessageResponseDto = {
      conversationId: "conv-101",
      messageId: "msg-999",
      agentRunId: "run_abc123",
      status: "QUEUED",
    }

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockTriggerResponse, 201)
    }

    const res = await postConversationMessage("conv-101", "Analyze SONiC telemetry", undefined, {
      triggerAgent: true,
      throwOnError: true,
    })

    assert.ok(res !== null)
    assert.ok(isTriggerAgentResponse(res))
    assert.equal(res.agentRunId, "run_abc123")
    assert.equal(res.status, "QUEUED")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations/conv-101/messages")
    assert.equal(
      calls[0].init?.body,
      JSON.stringify({ content: "Analyze SONiC telemetry", senderType: "user", triggerAgent: true })
    )
  })

  it("recognizes same-run continuation acknowledgements without treating ordinary messages as runs", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const continuation = { conversationId: "conv-101", messageId: "followup", agentRunId: "existing-run", status: "RUNNING" as const }
    globalThis.fetch = async () => apiResponse(continuation, 201)
    const result = await postConversationMessage("conv-101", "Explain the file you read", undefined, { throwOnError: true })
    assert.ok(isTriggerAgentResponse(result))
    assert.equal(result.agentRunId, "existing-run")
    assert.equal(result.messageId, "followup")
    assert.equal(isTriggerAgentResponse(null), false)
    assert.equal(isTriggerAgentResponse({ ...continuation, messageId: undefined } as never), false)
    assert.equal(isTriggerAgentResponse({ ...continuation, status: "UNKNOWN" } as never), false)
    // Persisted planning may finish before POST returns. Such a response has
    // run/message references, not the metadata/content of a Chat message.
    for (const status of ["PLANNING", "AWAITING_APPROVAL", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]) {
      const settled = { ...continuation, agentRunId: "planning_run_fixture", status }
      assert.equal(isTriggerAgentResponse(settled as never), true)
      assert.equal(isTriggerAgentResponse({ ...settled, messageId: undefined } as never), false)
    }
    assert.equal(isTriggerAgentResponse({ id: "ordinary", content: "Hello", metadata: { agentRunId: "existing-run" } } as never), false)
  })

  it("never accesses localStorage, sessionStorage, or document.cookie in conversation client or main workspace", () => {
    const clientCode = readFileSync(join(process.cwd(), "lib", "sekhem-conversation.ts"), "utf8")
    assert.doesNotMatch(clientCode, /localStorage|sessionStorage|document\.cookie/)
    const pageCode = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8")
    assert.doesNotMatch(pageCode, /localStorage|sessionStorage|document\.cookie/)
  })

  it("fetches conversation detail with server-persisted assistant messages", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const realAnswer =
      "SONiC is an open-source network operating system based on Linux.\n\nIt decouples software from hardware via SAI."
    const mockDetail = {
      id: "conv-101",
      projectId: "project-1",
      userId: "user-1",
      title: "SONiC Analysis",
      status: "active",
      createdAt: "2026-09-16T00:00:00Z",
      updatedAt: "2026-09-16T00:01:00Z",
      messages: [
        {
          id: "msg-1",
          conversationId: "conv-101",
          senderId: "user-1",
          senderType: "user",
          content: "Explain what SONiC is in two short paragraphs.",
          metadata: {},
          createdAt: "2026-09-16T00:00:00Z",
        },
        {
          id: "msg_agent_run_abc123",
          conversationId: "conv-101",
          senderId: "SekhemEngineer",
          senderType: "assistant",
          content: realAnswer,
          metadata: { agentRunId: "run_abc123" },
          createdAt: "2026-09-16T00:01:00Z",
        },
      ],
      agentRuns: [
        {
          id: "run_abc123",
          status: "COMPLETED",
          progressPercent: 100,
        },
      ],
      metadata: {},
    }

    globalThis.fetch = async () => apiResponse(mockDetail, 200)

    const detail = await getConversation("conv-101")
    assert.ok(detail)
    assert.equal(detail.messages.length, 2)
    assert.equal(detail.messages[1].senderType, "assistant")
    assert.equal(detail.messages[1].content, realAnswer)
    assert.equal(detail.messages[1].id, "msg_agent_run_abc123")
  })

  // ── listConversations tests ───────────────────────────────────────────────

  it("listConversations fetches sessions via GET /api/conversations without projectId", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const mockList = [
      {
        id: "conv-101",
        projectId: "project-1",
        userId: "user-1",
        title: "Explain BGP",
        status: "active",
        createdAt: "2026-09-16T00:00:00Z",
        updatedAt: "2026-09-17T10:00:00Z",
        messageCount: 3,
      },
      {
        id: "conv-102",
        projectId: "project-1",
        userId: "user-1",
        title: "SONiC Architecture",
        status: "active",
        createdAt: "2026-09-15T00:00:00Z",
        updatedAt: "2026-09-16T12:00:00Z",
        messageCount: 5,
      },
    ]

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return apiResponse(mockList, 200)
    }

    const result = await listConversations()
    assert.deepEqual(result, mockList)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations")
    assert.equal(calls[0].init?.credentials, "include")
  })

  it("listConversations passes projectId as query param when provided", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const calls: Array<{ url: string }> = []
    globalThis.fetch = async (input) => {
      calls.push({ url: String(input) })
      return apiResponse([], 200)
    }

    await listConversations("project-42")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.example.test/api/conversations?projectId=project-42")
  })

  it("listConversations returns empty array when backend returns an empty list", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () => apiResponse([], 200)

    const result = await listConversations("project-1")
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it("listConversations surfaces a failed response instead of presenting an empty conversation list", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    globalThis.fetch = async () => apiResponse(null, 200)

    await assert.rejects(listConversations())
  })

  it("listConversations never accesses localStorage, sessionStorage, or document.cookie", () => {
    const clientCode = readFileSync(join(process.cwd(), "lib", "sekhem-conversation.ts"), "utf8")
    assert.doesNotMatch(clientCode, /localStorage|sessionStorage|document\.cookie/)
  })
})


describe("Persisted workspace conversation modes", () => {
  it("Automation-to-Agent navigation reuses the linked Agent, while explicit Chat keeps its own lineage", () => {
    const scope = { projectId: "project", workspaceId: "ws", bindingVersion: "2" };
    const agent = { id: "agent", projectId: "project", mode: "AGENT", modeContext: { workspace: { workspaceId: "ws", bindingVersion: 2 }, source: { conversationId: "parent" } } } as any;
    assert.equal(resolveWorkspaceConversation([agent], "AGENT", scope)?.id, "agent");
    assert.equal(resolveWorkspaceConversation([agent], "AGENT", scope, "parent")?.id, "agent");
    assert.equal(resolveWorkspaceConversation([agent], "AGENT", scope, "another-parent"), undefined);
    assert.equal(resolveWorkspaceConversation([agent], "AGENT", { ...scope, projectId: "other" }), undefined);
    assert.equal(resolveWorkspaceConversation([agent], "AGENT", { ...scope, bindingVersion: "3" }), undefined);
  });
  it("creates Automation identity without a trigger or execution request", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    let body: any;
    globalThis.fetch = async (_url, init) => { body = JSON.parse(String(init?.body)); return apiResponse({ id: "automation", mode: "AUTOMATION" }); };
    const result = await createConversation("project", "Automation", undefined, { throwOnError: true }, "AUTOMATION");
    assert.equal(body.mode, "AUTOMATION"); assert.equal(body.triggerAgent, undefined); assert.equal(result?.mode, "AUTOMATION");
  });
  it("transfer response selects a linked conversation, never masquerading as an AgentRun", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    let body: any;
    const transfer = { kind: "AGENT_TRANSFER", conversationId: "parent", messageId: "message", agentConversationId: "child" };
    globalThis.fetch = async (_url, init) => { body = JSON.parse(String(init?.body)); return apiResponse(transfer); };
    const result = await postConversationMessage("parent", "Continue in Agent", { clientMessageId: "once" }, { transferToAgent: true });
    assert.equal(body.transferToAgent, true); assert.equal(body.triggerAgent, undefined);
    assert.equal(isConversationTransfer(result), true); assert.equal(isTriggerAgentResponse(result), false);
  });
  it("reload preserves mode, binding, initiating message and original evidence coordinates", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const context = { version: 1, mode: "AGENT", organizationId: "org", workspace: { workspaceId: "ws", bindingVersion: 2, runtimeId: "rt", runtimeFingerprint: "fingerprint" },
      source: { conversationId: "parent", messageId: "message", contextMessageIds: ["older"], evidence: [{ conversationId: "parent", receiptId: "receipt" }] } };
    globalThis.fetch = async () => apiResponse({ id: "child", projectId: "project", mode: "AGENT", modeContext: context, metadata: { modeContext: context }, messages: [], agentRuns: [] });
    const restored = await getConversation("child");
    assert.deepEqual(restored?.modeContext, context); assert.equal(restored?.agentRuns.length, 0);
  });
});
