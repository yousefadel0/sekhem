import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConversationService } from "../src/conversation/conversation.service";
import { ConversationController } from "../src/conversation/conversation.controller";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { SkillRegistryService } from "../src/agent-runtime/skills/skill-registry.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { AuditService } from "../src/audit/audit.service";
import { AuthService } from "../src/auth/auth.service";
import type { SessionClaims } from "../src/auth/auth.dto";

describe("Conversation & Agent Runtime Integration", () => {
  const pmClaims: SessionClaims = {
    sub: "user-pm-1",
    sessionId: "sess-pm-1",
    email: "pm@acme.test",
    displayName: "PM User",
    role: "PM",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const viewerClaims: SessionClaims = {
    sub: "user-viewer-1",
    sessionId: "sess-viewer-1",
    email: "viewer@acme.test",
    displayName: "Viewer User",
    role: "Viewer",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const otherOrgClaims: SessionClaims = {
    sub: "user-other-org",
    sessionId: "sess-other-1",
    email: "other@othercorp.test",
    displayName: "Other User",
    role: "PM",
    organizationId: "org-other",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const createHarness = (options?: { forceTxFailure?: boolean }) => {
    let messageClock = Date.now();
    const nextMessageTime = () => new Date(++messageClock);
    // Committed persistent tables
    const committedConversations = new Map<string, any>();
    const committedMessages: any[] = [];
    const committedRuns = new Map<string, any>();
    const committedPlans: any[] = [];
    const committedEvents: any[] = [];
    const committedAudits: any[] = [];
    const committedArtifacts: any[] = [];
    const committedApprovals: any[] = [];
    const scheduledExecutions: { runId: string; claims: SessionClaims; instruction: string }[] = [];

    // Preseed a project and conversation
    const defaultProject = {
      id: "project-1",
      organizationId: "org-acme"
    };

    const initialConv = {
      id: "conv-test-1",
      projectId: "project-1",
      userId: pmClaims.sub,
      title: "Architecture Planning",
      status: "active",
      metadata: {},
      createdAt: new Date(Date.now() - 60000),
      updatedAt: new Date(Date.now() - 60000),
      project: defaultProject
    };
    committedConversations.set(initialConv.id, initialConv);

    const initialViewerConv = {
      id: "conv-viewer-1",
      projectId: "project-1",
      userId: viewerClaims.sub,
      title: "Viewer Chat",
      status: "active",
      metadata: {},
      createdAt: new Date(Date.now() - 60000),
      updatedAt: new Date(Date.now() - 60000),
      project: defaultProject
    };
    committedConversations.set(initialViewerConv.id, initialViewerConv);

    const initialOtherOrgConv = {
      id: "conv-other-org",
      projectId: "project-2",
      userId: otherOrgClaims.sub,
      title: "Other Org Chat",
      status: "active",
      metadata: {},
      createdAt: new Date(Date.now() - 60000),
      updatedAt: new Date(Date.now() - 60000),
      project: { id: "project-2", organizationId: "org-other" }
    };
    committedConversations.set(initialOtherOrgConv.id, initialOtherOrgConv);

    const mockPrisma: any = {
      project: { findUnique: async ({ where }: any) => where.id === "project-1"
        ? { ...defaultProject, personalOwnerId: null }
        : where.id === "project-2" ? { id: where.id, organizationId: "org-other", personalOwnerId: null } : null },
      conversation: {
        findUnique: async ({ where, include }: any) => {
          const conv = committedConversations.get(where.id);
          if (!conv) return null;
          return {
            ...conv,
            project: include?.project ? conv.project : undefined,
            messages: include?.messages
              ? committedMessages
                .filter((m) => m.conversationId === where.id)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              : undefined,
            agentRuns: include?.agentRuns
              ? Array.from(committedRuns.values())
                .filter((r) => r.conversationId === where.id)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              : undefined
          };
        },
        create: async ({ data }: any) => {
          const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
          committedConversations.set(data.id, record);
          return record;
        },
        findMany: async ({ where }: any) => {
          return Array.from(committedConversations.values()).filter((c) => {
            if (where?.userId && c.userId !== where.userId) return false;
            if (where?.projectId && c.projectId !== where.projectId) return false;
            if (where?.status && c.status !== where.status) return false;
            return true;
          });
        },
        update: async ({ where, data }: any) => {
          const conv = committedConversations.get(where.id);
          if (!conv) throw new NotFoundException("Conversation not found");
          const updated = { ...conv, ...data };
          committedConversations.set(where.id, updated);
          return updated;
        }
      },
      conversationMessage: {
        create: async ({ data }: any) => {
          const record = { ...data, createdAt: nextMessageTime() };
          committedMessages.push(record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          return committedMessages.find((m) => m.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return committedMessages.find((m) => m.id === where.id) || null;
        },
        findMany: async ({ where, orderBy, take }: any) => {
          const descending = (Array.isArray(orderBy) ? orderBy[0] : orderBy)?.createdAt === "desc";
          return committedMessages.filter((m) => m.conversationId === where.conversationId && m.id !== where.id?.not)
            .sort((a, b) => (descending ? -1 : 1) * (a.createdAt.getTime() - b.createdAt.getTime()))
            .slice(0, take ?? committedMessages.length);
        }
      },
      agentRun: {
        create: async ({ data }: any) => {
          const record = { ...data, plans: [], approvals: [], artifacts: [] };
          committedRuns.set(data.id, record);
          return record;
        },
        findUnique: async ({ where, include }: any) => {
          const run = committedRuns.get(where.id);
          if (!run) return null;
          return {
            ...run,
            plans: include?.plans ? committedPlans.filter((p) => p.agentRunId === where.id) : undefined,
            approvals: include?.approvals ? committedApprovals.filter((a) => a.agentRunId === where.id) : undefined,
            artifacts: include?.artifacts ? committedArtifacts.filter((a) => a.agentRunId === where.id) : undefined
          };
        },
        findMany: async ({ where }: any) => {
          const all = Array.from(committedRuns.values());
          if (where?.status?.in) {
            return all.filter((r) => where.status.in.includes(r.status));
          }
          return all;
        },
        update: async ({ where, data }: any) => {
          const existing = committedRuns.get(where.id) || {};
          const updated = { ...existing, ...data };
          committedRuns.set(where.id, updated);
          return updated;
        }
      },
      agentPlan: {
        create: async ({ data }: any) => {
          committedPlans.push(data);
          return data;
        },
        findMany: async ({ where }: any) => {
          if (where?.agentRunId) {
            return committedPlans.filter((p) => p.agentRunId === where.agentRunId);
          }
          return committedPlans;
        }
      },
      agentRunEvent: {
        create: async ({ data }: any) => {
          committedEvents.push(data);
          return data;
        }
      },
      agentApproval: {
        create: async ({ data }: any) => {
          committedApprovals.push(data);
          return data;
        }
      },
      agentArtifact: {
        create: async ({ data }: any) => {
          committedArtifacts.push(data);
          return data;
        }
      },
      auditEvent: {
        create: async ({ data }: any) => {
          committedAudits.push(data);
          return data;
        }
      },
      projectMember: {
        findUnique: async ({ where }: any) => {
          const userId = where.projectId_userId.userId;
          if (userId === "user-pm-1") {
            return { projectId: "project-1", userId, role: "PM" };
          }
          if (userId === "user-viewer-1") {
            return { projectId: "project-1", userId, role: "Viewer" };
          }
          if (userId === "user-other-org") {
            return { projectId: "project-2", userId, role: "PM" };
          }
          return null;
        }
      },
      groupMember: {
        findUnique: async () => null
      },
      $transaction: async (action: (tx: any) => Promise<any>) => {
        // Transactional buffer for atomic all-or-nothing rollback
        const stagedConversations = new Map<string, any>();
        const stagedMessages: any[] = [];
        const stagedRuns: any[] = [];
        const stagedPlans: any[] = [];
        const stagedEvents: any[] = [];
        const stagedAudits: any[] = [];

        const txClient: any = {
          conversationMessage: {
            create: async ({ data }: any) => {
              const record = { ...data, createdAt: nextMessageTime() };
              stagedMessages.push(record);
              return record;
            }
          },
          conversation: {
            findUnique: async ({ where }: any) => committedConversations.get(where.id) || null,
            update: async ({ where, data }: any) => {
              const existing = committedConversations.get(where.id);
              const updated = { ...existing, ...data };
              stagedConversations.set(where.id, updated);
              return updated;
            }
          },
          agentRun: {
            create: async ({ data }: any) => {
              const record = { ...data, plans: [], approvals: [], artifacts: [] };
              stagedRuns.push(record);
              return record;
            }
          },
          agentPlan: {
            create: async ({ data }: any) => {
              stagedPlans.push(data);
              return data;
            }
          },
          agentRunEvent: {
            create: async ({ data }: any) => {
              stagedEvents.push(data);
              return data;
            }
          },
          auditEvent: {
            create: async ({ data }: any) => {
              stagedAudits.push(data);
              return data;
            }
          }
        };

        if (options?.forceTxFailure) {
          throw new Error("Simulated transactional crash");
        }

        const result = await action(txClient);

        // Commit staged items to persistent store only upon successful resolution
        stagedMessages.forEach((m) => committedMessages.push(m));
        stagedConversations.forEach((val, key) => committedConversations.set(key, val));
        stagedRuns.forEach((r) => committedRuns.set(r.id, r));
        stagedPlans.forEach((p) => committedPlans.push(p));
        stagedEvents.forEach((e) => committedEvents.push(e));
        stagedAudits.forEach((a) => committedAudits.push(a));

        return result;
      }
    };

    const askAssistantCalls: Array<{ question?: string; history?: Array<{ role: string; content: string }> }> = [];
    const mockAiGateway: any = {
      askAssistant: async (body: { question?: string; history?: Array<{ role: string; content: string }> }) => {
        askAssistantCalls.push(body);
        return { status: "REAL_PROVIDER", answer: "Done", correlationId: "c-1" };
      }
    };
    const mockRuntimeConfig: any = {
      repositoryForUse: async () => ({ id: "repo-1", url: "https://git.test/repo" })
    };
    const mockRepoContent: any = {
      snapshot: async () => ({
        repository: "repo",
        commitSha: "sha",
        fileCount: 1,
        totalBytes: 10,
        skippedFiles: 0,
        chunks: []
      })
    };

    const authService = new AuthService(mockPrisma);
    const auditService = new AuditService(authService, mockPrisma);
    const resourceAuthz = new ResourceAuthorizationService(mockPrisma);
    const skillRegistry = new SkillRegistryService(mockAiGateway, mockRuntimeConfig, mockRepoContent);
    const agentRuntime = new AgentRuntimeService(skillRegistry, resourceAuthz, auditService, mockPrisma);

    // Spy on scheduleRunExecution
    const origSchedule = agentRuntime.scheduleRunExecution.bind(agentRuntime);
    agentRuntime.scheduleRunExecution = (runId: string, claims: SessionClaims, instruction: string) => {
      scheduledExecutions.push({ runId, claims, instruction });
      origSchedule(runId, claims, instruction);
    };

    const conversationService = new ConversationService(mockPrisma, agentRuntime, resourceAuthz);
    const conversationController = new ConversationController(conversationService, authService);

    return {
      conversationService,
      conversationController,
      agentRuntime,
      authService,
      mockPrisma,
      committedConversations,
      committedMessages,
      committedRuns,
      committedPlans,
      committedEvents,
      committedAudits,
      scheduledExecutions,
      askAssistantCalls
    };
  };

  // ---------------------------------------------------------------------------
  // 1. Authentication & 401 Enforcement
  // ---------------------------------------------------------------------------
  it("1. rejects unauthenticated requests with 401 Unauthorized", async () => {
    const { conversationController } = createHarness();

    await assert.rejects(
      async () => {
        await conversationController.postMessage("conv-test-1", undefined, { content: "Hello" });
      },
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal(err.message, "Authentication required");
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Cross-Organization Boundary Enforcement
  // ---------------------------------------------------------------------------
  it("2. rejects cross-organization conversation access with 403 Forbidden", async () => {
    const { conversationService } = createHarness();

    // User from Org B tries to post a message to a conversation belonging to Org A
    await assert.rejects(
      async () => {
        await conversationService.postMessage("conv-test-1", otherOrgClaims, {
          content: "Attempting cross-org access"
        });
      },
      (err: any) => {
        // Must fail with NotFound or Forbidden
        assert.ok(err instanceof NotFoundException || err instanceof ForbiddenException);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Network (legacy Viewer) has the same project Agent access.
  // ---------------------------------------------------------------------------
  it("3. Network can trigger its own Agent run", async () => {
    const { conversationService, scheduledExecutions } = createHarness();
    const result: any = await conversationService.postMessage("conv-viewer-1", viewerClaims, {
      content: "Generate technical memo for P0-05 auth hardening", triggerAgent: true
    });
    assert.equal(result.status, "QUEUED");
    assert.equal(scheduledExecutions.length, 1);
    assert.equal(scheduledExecutions[0].runId, result.agentRunId);
  });

  // ---------------------------------------------------------------------------  // 4. Normal Message Creation Without Agent Trigger
  // ---------------------------------------------------------------------------
  it("4. normal chat persists user and assistant messages without creating AgentRun", async () => {
    const { conversationService, committedMessages, committedRuns, scheduledExecutions } = createHarness();

    const response = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "Discussing architecture alternatives",
      senderType: "user"
    });

    // Validates normal response format
    assert.ok(response);
    assert.equal("conversationId" in response, true);
    assert.equal("content" in response && response.content, "Done");
    assert.equal("status" in response, false); // No agent run status

    // Persisted state validation
    assert.equal(committedMessages.length, 2);
    assert.equal(committedMessages[0].content, "Discussing architecture alternatives");
    assert.equal(committedMessages[1].senderType, "assistant");
    assert.equal(committedRuns.size, 0, "No AgentRun should be created for normal message");
    assert.equal(scheduledExecutions.length, 0, "No scheduler invocation for normal message");
  });

  // ---------------------------------------------------------------------------
  // 5. triggerAgent === true Creates AgentRun Atomically
  // ---------------------------------------------------------------------------
  it("5. triggerAgent === true creates ConversationMessage and QUEUED AgentRun atomically in one transaction", async () => {
    const {
      conversationService,
      committedMessages,
      committedRuns,
      committedPlans,
      committedEvents,
      committedAudits,
      scheduledExecutions
    } = createHarness();

    const result = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "Generate technical memo for P0-05 auth hardening",
      triggerAgent: true
    });

    // Check required response shape
    assert.equal(result.conversationId, "conv-test-1");
    assert.ok("messageId" in result && result.messageId);
    assert.ok("agentRunId" in result && result.agentRunId);
    assert.equal("status" in result && result.status, "QUEUED");

    // Check message was created
    assert.equal(committedMessages.length, 1);
    assert.equal(committedMessages[0].content, "Generate technical memo for P0-05 auth hardening");

    // Check AgentRun was created in QUEUED state
    const createdRun = committedRuns.get((result as any).agentRunId);
    assert.ok(createdRun);
    assert.equal(createdRun.status, "QUEUED");
    assert.equal(createdRun.projectId, "project-1");
    assert.equal(createdRun.conversationId, "conv-test-1");

    // Check initial AgentPlan, AgentRunEvent, and AuditEvent
    assert.equal(committedPlans.length, 1);
    assert.equal(committedPlans[0].agentRunId, createdRun.id);

    const statusEvents = committedEvents.filter((e) => e.eventType === "STATUS_CHANGE");
    assert.ok(statusEvents.length >= 1);

    const auditCreate = committedAudits.find((a) => a.action === "AGENT_RUN_CREATE");
    assert.ok(auditCreate);

    // Check post-commit scheduling
    assert.equal(scheduledExecutions.length, 1);
    assert.equal(scheduledExecutions[0].runId, createdRun.id);
  });

  // ---------------------------------------------------------------------------
  // 6. Rollback Semantics: No Orphaned Message or Agent State
  // ---------------------------------------------------------------------------
  it("6. rolls back ConversationMessage, AgentRun, Plan, Event, and Audit atomically on transaction failure", async () => {
    const {
      conversationService,
      committedMessages,
      committedRuns,
      committedPlans,
      committedEvents,
      committedAudits,
      scheduledExecutions
    } = createHarness({ forceTxFailure: true });

    await assert.rejects(
      async () => {
        await conversationService.postMessage("conv-test-1", pmClaims, {
          content: "Inspect this workspace; this request will crash inside the transaction",
          triggerAgent: true
        });
      },
      /Simulated transactional crash/
    );

    // Verify complete absence of all entities
    assert.equal(committedMessages.length, 0, "ConversationMessage must roll back");
    assert.equal(committedRuns.size, 0, "AgentRun must roll back");
    assert.equal(committedPlans.length, 0, "AgentPlan must roll back");
    assert.equal(committedEvents.length, 0, "AgentRunEvent must roll back");
    assert.equal(committedAudits.length, 0, "AuditEvent must roll back");

    // Scheduling MUST NOT occur on rollback
    assert.equal(scheduledExecutions.length, 0, "Scheduler must NEVER be called on rollback");
  });

  // ---------------------------------------------------------------------------
  // 7. Conversation Detail Returns Ordered Messages and Linked AgentRuns
  // ---------------------------------------------------------------------------
  it("7. getConversation returns messages ordered ascending and linked AgentRuns ordered descending", async () => {
    const { conversationService } = createHarness();

    // Post first normal message
    await conversationService.postMessage("conv-test-1", pmClaims, { content: "Message 1" });

    // Post second message with agent trigger
    await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "Read auth.ts",
      triggerAgent: true
    });

    // Post third message
    await conversationService.postMessage("conv-test-1", pmClaims, { content: "Message 3" });

    const detail = await conversationService.getConversation("conv-test-1", pmClaims.sub);

    assert.equal(detail.id, "conv-test-1");
    assert.deepEqual(detail.messages.map((message) => message.content), ["Message 1", "Done", "Read auth.ts", "Message 3", "Done"]);

    // Agent run linked to conversation
    assert.equal(detail.agentRuns.length, 1);
    assert.equal(detail.agentRuns[0].status, "QUEUED");
  });

  // ---------------------------------------------------------------------------
  // 8. Chat Remains Usable While Agent Run is QUEUED or RUNNING
  // ---------------------------------------------------------------------------
  it("8. conversation remains immediately usable to post and read messages while AgentRun is QUEUED or RUNNING", async () => {
    const { conversationService } = createHarness();

    // Trigger an agent run
    const triggerRes = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "Start background task",
      triggerAgent: true
    });
    assert.equal("status" in triggerRes && triggerRes.status, "QUEUED");

    // Non-blocking user message while run is queued
    const followUp = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "While you're working on that, here is more context"
    });
    assert.ok(followUp);
    assert.equal("content" in followUp && followUp.content, "Done");

    const detail = await conversationService.getConversation("conv-test-1", pmClaims.sub);
    assert.equal(detail.messages.length, 3);
    assert.equal(detail.messages[1].content, "While you're working on that, here is more context");
  });

  // ---------------------------------------------------------------------------
  // 9. createAssistantMessage Persistence & Idempotency
  // ---------------------------------------------------------------------------
  it("9. createAssistantMessage creates assistant message with deterministic ID and is idempotent", async () => {
    const { conversationService } = createHarness();
    const runId = "run-test-idempotent-123";
    const answer = "This is the real GLM technical memo answer.";

    const msg1 = await conversationService.createAssistantMessage(
      "conv-test-1",
      runId,
      answer,
      "SekhemEngineer"
    );

    assert.ok(msg1);
    assert.equal(msg1.id, `msg_agent_${runId}`);
    assert.equal(msg1.senderType, "assistant");
    assert.equal(msg1.content, answer);
    assert.equal(msg1.conversationId, "conv-test-1");

    // Repeat call with identical runId (idempotency check)
    const msg2 = await conversationService.createAssistantMessage(
      "conv-test-1",
      runId,
      answer,
      "SekhemEngineer"
    );

    assert.equal(msg2.id, msg1.id);
    assert.equal(msg2.content, answer);

    // Verify conversation detail returns exactly one assistant message for this run
    const detail = await conversationService.getConversation("conv-test-1", pmClaims.sub);
    const runAssistantMsgs = detail.messages.filter((m) => m.id === `msg_agent_${runId}`);
    assert.equal(runAssistantMsgs.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 10. chat: true executes SEKHEM Agent conversational path and returns assistant message
  // ---------------------------------------------------------------------------
  it("10. chat: true persists user message, routes to SEKHEM Agent, and returns persisted assistant message", async () => {
    const { conversationService, committedMessages, committedRuns } = createHarness();

    const response = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "What is SONiC?",
      senderType: "user",
      chat: true
    });

    assert.ok(response);
    assert.equal(response.senderType, "assistant");
    assert.equal(response.content, "Done");
    assert.equal(committedRuns.size, 0, "No AgentRun should be created for direct chat");
    assert.equal(committedMessages.length, 2, "Both user and assistant messages should be persisted");
    assert.equal(committedMessages[0].content, "What is SONiC?");
    assert.equal(committedMessages[0].senderType, "user");
    assert.equal(committedMessages[1].content, "Done");
    assert.equal(committedMessages[1].senderType, "assistant");
  });

  it("11. chat: true loads prior session messages as history on the next turn", async () => {
    const { conversationService, committedMessages, askAssistantCalls } = createHarness();

    await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "What is SONiC?",
      senderType: "user",
      chat: true
    });
    const second = await conversationService.postMessage("conv-test-1", pmClaims, {
      content: "What is SAI?",
      senderType: "user",
      chat: true
    });

    assert.equal(second.content, "Done");
    assert.equal(askAssistantCalls.length, 2);
    assert.equal(askAssistantCalls[0]?.question, "What is SONiC?");
    assert.deepEqual(askAssistantCalls[0]?.history ?? [], []);
    assert.equal(askAssistantCalls[1]?.question, "What is SAI?");
    assert.deepEqual(askAssistantCalls[1]?.history, [
      { role: "user", content: "What is SONiC?" },
      { role: "assistant", content: "Done" }
    ]);
    assert.equal(committedMessages.filter((m: { senderType: string }) => m.senderType === "user").length, 2);
    assert.equal(committedMessages.filter((m: { senderType: string }) => m.senderType === "assistant").length, 2);
  });
});
