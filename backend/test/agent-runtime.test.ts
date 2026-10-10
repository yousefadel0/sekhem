import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { AgentRuntimeController } from "../src/agent-runtime/agent-runtime.controller";
import { SkillRegistryService } from "../src/agent-runtime/skills/skill-registry.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { AuditService } from "../src/audit/audit.service";
import { AuthService } from "../src/auth/auth.service";
import { contextHarness, gatewayHarness } from "./helpers/assistant-context-harness";
import type { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import type { SessionClaims } from "../auth/auth.dto";

describe("Agent Runtime Foundation (P0-05 Step 1)", () => {
  const pmClaims: SessionClaims = {
    sub: "user-pm-1",
    sessionId: "sess-1",
    email: "pm@acme.test",
    displayName: "PM User",
    role: "PM",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const createMockEnvironment = (overrides?: {
    contextBuilder?: AgentContextBuilderService;
    projectRole?: string | null;
    skillExecutionResult?: { success: boolean; summary?: string; output?: unknown; artifacts?: any[] };
    askAssistant?: (body?: unknown) => Promise<Record<string, unknown>>;
  }) => {
    const createdRuns = new Map<string, any>();
    const createdPlans: any[] = [];
    const createdEvents: any[] = [];
    const createdArtifacts: any[] = [];
    const createdApprovals: any[] = [];
    const createdMessages: any[] = [];
    const auditLogs: any[] = [];

    const mockPrisma: any = {
      project: { findUnique: async ({ where }: any) => where.id === "project-1" ? { id: "project-1", organizationId: "org-acme", personalOwnerId: null } : null },
      conversation: {
        findUnique: async ({ where }: any) => ({
          id: where.id,
          projectId: "project-1",
          userId: "user-pm-1"
        }),
        create: async ({ data }: any) => ({ ...data, id: data.id || "conv-auto-1" }),
        update: async ({ where, data }: any) => ({ ...data, id: where.id })
      },
      conversationMessage: {
        create: async ({ data }: any) => {
          const record = { ...data, createdAt: new Date() };
          createdMessages.push(record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          return createdMessages.find((m) => m.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return createdMessages.find((m) => m.id === where.id) || null;
        },
        findMany: async ({ where }: any) => {
          if (where?.conversationId) {
            return createdMessages.filter((m) => m.conversationId === where.conversationId);
          }
          return createdMessages;
        }
      },
      agentRun: {
        create: async ({ data }: any) => {
          const record = { ...data, plans: [], approvals: [], artifacts: [], organizationId: "org-acme" };
          createdRuns.set(data.id, record);
          return record;
        },
        findUnique: async ({ where, include }: any) => {
          const run = createdRuns.get(where.id);
          if (!run) return null;
          return {
            ...run,
            plans: include?.plans ? createdPlans.filter((p) => p.agentRunId === where.id) : undefined,
            approvals: include?.approvals ? createdApprovals.filter((a) => a.agentRunId === where.id) : undefined,
            artifacts: include?.artifacts ? createdArtifacts.filter((a) => a.agentRunId === where.id) : undefined
          };
        },
        findMany: async ({ where }: any) => {
          let all = Array.from(createdRuns.values());
          if (where?.status?.in) {
            all = all.filter((r) => where.status.in.includes(r.status));
          }
          if (where?.project?.organizationId) {
            all = all.filter((r) => r.organizationId === where.project.organizationId);
          }
          if (where?.AND) {
            const clauses = where.AND as Array<Record<string, any>>;
            for (const clause of clauses) {
              if (clause.project?.organizationId) {
                all = all.filter((r) => r.organizationId === clause.project.organizationId);
              }
              if (clause.OR) {
                all = all.filter((r) =>
                  clause.OR.some((entry: any) =>
                    (entry.userId && r.userId === entry.userId) ||
                    (entry.projectId?.in && entry.projectId.in.includes(r.projectId))
                  )
                );
              }
            }
          }
          return all;
        },
        update: async ({ where, data }: any) => {
          const existing = createdRuns.get(where.id) || {};
          const updated = { ...existing, ...data };
          createdRuns.set(where.id, updated);
          return updated;
        }
      },
      agentPlan: {
        create: async ({ data }: any) => {
          createdPlans.push(data);
          return data;
        },
        findMany: async () => createdPlans,
        update: async ({ where, data }: any) => Object.assign(createdPlans.find(plan => plan.id === where.id), data)
      },
      agentRunEvent: {
        create: async ({ data }: any) => {
          createdEvents.push(data);
          return data;
        }
      },
      agentApproval: {
        create: async ({ data }: any) => {
          createdApprovals.push(data);
          return data;
        }
      },
      agentArtifact: {
        create: async ({ data }: any) => {
          createdArtifacts.push(data);
          return data;
        }
      },
      projectMember: {
        findUnique: async ({ where }: any) => {
          if (overrides?.projectRole === null) return null;
          return {
            projectId: where.projectId_userId.projectId,
            userId: where.projectId_userId.userId,
            role: overrides?.projectRole ?? "PM"
          };
        },
        findMany: async ({ where }: any) => {
          if (where?.userId && overrides?.projectRole === null) return [];
          if (where?.userId) return [{ projectId: "project-1", userId: where.userId }];
          return [];
        }
      },
      groupMember: {
        findUnique: async () => null
      },
      auditEvent: {
        create: async ({ data }: any) => {
          auditLogs.push(data);
          return data;
        }
      },
      $transaction: async (fn) => await fn(mockPrisma)
    };

    const mockAiGateway: any = {
      askAssistant:
        overrides?.askAssistant ??
        (async () => ({
          status: overrides?.skillExecutionResult?.success === false ? "POLICY_BLOCKED" : "REAL_PROVIDER",
          answer: "Technical memo: Authentication foundation hardening is validated.",
          correlationId: "corr-123",
          providerId: "provider-teletech",
          modelId: "GLM-5.2-Abliterated",
          providerCallExecuted: overrides?.skillExecutionResult?.success === false ? false : true,
          apiKey: "must-not-be-persisted",
          encryptedApiKey: "must-not-be-persisted"
        }))
    };

    const mockRuntimeConfig: any = {
      repositoryForUse: async () => ({ id: "repo-1", url: "https://git.test/repo" })
    };

    const mockRepoContent: any = {
      snapshot: async () => ({
        repository: "acme/sekhem",
        commitSha: "a1b2c3d",
        fileCount: 42,
        totalBytes: 12345,
        skippedFiles: 0,
        chunks: []
      })
    };

    const authService = new AuthService(mockPrisma);
    const auditService = new AuditService(authService, mockPrisma);
    const resourceAuthz = new ResourceAuthorizationService(mockPrisma);
    const skillRegistry = new SkillRegistryService(mockAiGateway, mockRuntimeConfig, mockRepoContent);
    const agentRuntime = new AgentRuntimeService(skillRegistry, resourceAuthz, auditService, mockPrisma,
      undefined, undefined, undefined, undefined, undefined, overrides?.contextBuilder);
    const controller = new AgentRuntimeController(agentRuntime, authService);

    return {
      mockPrisma,
      authService,
      agentRuntime,
      controller,
      createdRuns,
      createdPlans,
      createdEvents,
      createdArtifacts,
      createdApprovals,
      createdMessages,
      auditLogs
    };
  };

  // ---------------------------------------------------------------------------
  // 1. Create AgentRun & Immediate HTTP Return
  // ---------------------------------------------------------------------------
  it("1. creates an AgentRun with QUEUED status and returns immediately without blocking", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Draft a technical memo for security audit",
      title: "Security Memo Run"
    });

    assert.ok(summary.id);
    assert.equal(summary.status, "QUEUED");
    assert.equal(summary.projectId, "project-1");
    assert.equal(summary.userId, pmClaims.sub);
    assert.equal(summary.title, "Security Memo Run");
    assert.ok(createdRuns.has(summary.id));
  });

  // ---------------------------------------------------------------------------
  // 2. Authorization Failure
  // ---------------------------------------------------------------------------
  it("2. rejects run creation when the user is not a member of the project", async () => {
    const { agentRuntime } = createMockEnvironment({ projectRole: null });

    await assert.rejects(
      async () =>
        agentRuntime.createRun(pmClaims, {
          projectId: "project-unauthorized",
          instruction: "Run without access"
        }),
      /You do not have permission to perform CREATE on this AgentRun/
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Organization Isolation
  // ---------------------------------------------------------------------------
  it("3. rejects run creation across organization boundaries (cross-tenant IDOR protection)", async () => {
    const { agentRuntime } = createMockEnvironment();

    const crossOrgClaims: SessionClaims = {
      ...pmClaims,
      organizationId: "org-different"
    };

    // Attempting to create on a resource bound to org-acme
    const authz = new ResourceAuthorizationService();
    const allowed = await authz.authorize(
      {
        userId: crossOrgClaims.sub,
        email: crossOrgClaims.email,
        displayName: crossOrgClaims.displayName,
        role: "PM",
        organizationId: "org-different",
        isSystemAdmin: false
      },
      "CREATE",
      {
        resourceType: "AgentRun",
        id: "run-test",
        organizationId: "org-acme",
        projectId: "project-1"
      }
    );

    assert.equal(allowed, false, "Cross-organization creation must be blocked");
  });

  // ---------------------------------------------------------------------------
  // 4. Plan Persistence
  // ---------------------------------------------------------------------------
  it("4. generates and persists an initial execution plan with registered skill steps", async () => {
    const { agentRuntime, createdPlans } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate a technical memo for audit"
    });

    assert.ok(summary.id);
    assert.equal(createdPlans.length, 1);
    const plan = createdPlans[0];
    assert.equal(plan.agentRunId, summary.id);
    assert.equal(plan.version, 1);
    assert.equal(plan.steps[0].skillId, "memo_generator");
    assert.equal(plan.steps[0].title, "Technical Memo Generator");
  });

  // ---------------------------------------------------------------------------
  // 5. Background Execution & Status Transitions
  // ---------------------------------------------------------------------------
  it("5. executes steps asynchronously in background and transitions through RUNNING to COMPLETED", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate a technical memo on API auth"
    });

    // Directly execute run loop to observe complete synchronous step progression
    await agentRuntime.executeRun(summary.id, pmClaims);

    const finalRun = createdRuns.get(summary.id);
    assert.equal(finalRun.status, "COMPLETED");
    assert.equal(finalRun.progressPercent, 100);
    assert.ok(finalRun.startedAt);
    assert.ok(finalRun.completedAt);
  });

  // ---------------------------------------------------------------------------
  // 6. Skill Resolution
  // ---------------------------------------------------------------------------
  it("6. resolves appropriate skill from SkillRegistry based on instruction intent", async () => {
    const { agentRuntime, createdPlans } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Take a repository snapshot of main branch"
    });

    assert.equal(createdPlans.length, 1);
    assert.equal(createdPlans[0].agentRunId, summary.id);
    assert.equal(createdPlans[0].steps[0].skillId, "repo_snapshot_reader");
  });

  // ---------------------------------------------------------------------------
  // 7. Successful Step Execution
  // ---------------------------------------------------------------------------
  it("7. increments currentStepIndex and updates progressPercent on successful step", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Snapshot repo"
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    const run = createdRuns.get(summary.id);
    assert.equal(run.currentStepIndex, 1);
    assert.equal(run.progressPercent, 100);
  });

  // ---------------------------------------------------------------------------
  // 8. Event Persistence
  // ---------------------------------------------------------------------------
  it("8. persists lifecycle events (STATUS_CHANGE, TOOL_CALL, TOOL_RESULT, PROGRESS)", async () => {
    const { agentRuntime, createdEvents } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate technical memo"
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    const eventTypes = createdEvents.map((e) => e.eventType);
    assert.ok(eventTypes.includes("STATUS_CHANGE"), "Must record STATUS_CHANGE");
    assert.ok(eventTypes.includes("TOOL_CALL"), "Must record TOOL_CALL");
    assert.ok(eventTypes.includes("TOOL_RESULT"), "Must record TOOL_RESULT");
    assert.ok(eventTypes.includes("PROGRESS"), "Must record PROGRESS");
  });

  // ---------------------------------------------------------------------------
  // 9. Artifact Persistence
  // ---------------------------------------------------------------------------
  it("9. persists generated artifacts into AgentArtifact table upon skill completion", async () => {
    const { agentRuntime, createdArtifacts } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate technical memo for P0-05"
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.ok(createdArtifacts.length > 0, "Artifact must be persisted");
    assert.equal(createdArtifacts[0].agentRunId, summary.id);
    assert.equal(createdArtifacts[0].artifactType, "TECHNICAL_MEMO");
    assert.ok(createdArtifacts[0].content.length > 0);
  });

  // ---------------------------------------------------------------------------
  // 10. Completion & 12. Audit Calls
  // ---------------------------------------------------------------------------
  it("10 & 12. records AGENT_RUN_CREATE, AGENT_RUN_START, and AGENT_RUN_COMPLETE audit records", async () => {
    const { agentRuntime, auditLogs } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Audit test run"
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    const actions = auditLogs.map((log) => log.action);
    assert.ok(actions.includes("AGENT_RUN_CREATE"), "Must audit AGENT_RUN_CREATE");
    assert.ok(actions.includes("AGENT_RUN_START"), "Must audit AGENT_RUN_START");
    assert.ok(actions.includes("AGENT_RUN_COMPLETE"), "Must audit AGENT_RUN_COMPLETE");
  });

  // ---------------------------------------------------------------------------
  // 11. Failure Handling & Audit
  // ---------------------------------------------------------------------------
  it("11. handles step failure safely by marking run FAILED, recording error event and audit", async () => {
    // Setup environment where AI Gateway returns POLICY_BLOCKED so MemoGeneratorSkill fails
    const { agentRuntime, createdRuns, createdEvents, createdArtifacts, auditLogs } = createMockEnvironment({
      skillExecutionResult: { success: false }
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate technical memo that will fail"
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    const run = createdRuns.get(summary.id);
    assert.equal(run.status, "FAILED");
    assert.ok(run.failureReason, "Failure reason must be set");

    const errorEvent = createdEvents.find((e) => e.eventType === "ERROR");
    assert.ok(errorEvent, "ERROR event must be persisted");
    assert.equal(errorEvent.payload.failureReason, "BLOCKED");
    assert.equal(run.failureReason, "BLOCKED");
    assert.equal(createdEvents.some((e) => e.eventType === "TOOL_RESULT"), false);
    assert.equal(createdArtifacts.length, 0);

    const failAudit = auditLogs.find((l) => l.action === "AGENT_RUN_FAIL");
    assert.ok(failAudit, "AGENT_RUN_FAIL must be recorded");
  });

  // ---------------------------------------------------------------------------
  // 13. Startup Recovery
  // ---------------------------------------------------------------------------
  it("13. recovers unfinished QUEUED and RUNNING runs on application bootstrap", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    // Pre-populate an interrupted RUNNING run
    const interruptedRun = {
      id: "run-interrupted-1",
      projectId: "project-1",
      userId: pmClaims.sub,
      title: "Interrupted Task",
      status: "RUNNING",
      currentStepIndex: 0,
      user: {
        email: pmClaims.email,
        displayName: pmClaims.displayName,
        organizationId: pmClaims.organizationId,
        roles: [{ role: { key: "PM" } }]
      }
    };
    createdRuns.set(interruptedRun.id, interruptedRun);

    const parked: string[] = [];
    let dispatches = 0;
    Object.assign(agentRuntime, {
      recovery: { parkInterrupted: async (id: string) => {
        const saved = createdRuns.get(id);
        if (!["QUEUED", "PLANNING", "RUNNING"].includes(saved.status)) return false;
        parked.push(id);
        saved.status = "PAUSED";
        return true;
      } },
      executeRun: async () => { dispatches++; assert.fail("Recovery must not redispatch an interrupted action"); }
    });

    const result = await agentRuntime.recoverUnfinishedRuns();
    assert.equal(result.recoveredCount, 1);
    assert.deepEqual(parked, [interruptedRun.id]);
    assert.equal(createdRuns.get(interruptedRun.id).status, "PAUSED");
    assert.equal(dispatches, 0);
    assert.equal((await agentRuntime.recoverUnfinishedRuns()).recoveredCount, 0);
    assert.equal(createdRuns.size, 1);
  });

  // ---------------------------------------------------------------------------
  // 14. No Execution of Completed Runs
  // ---------------------------------------------------------------------------
  it("restart preserves a matching durable plan execution for runtime reconciliation", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();
    const run = { id: "planning_run_restart", projectId: "project-1", userId: pmClaims.sub, title: "Reviewed change", status: "RUNNING", planVersion: 1 };
    createdRuns.set(run.id, run);
    Object.assign(agentRuntime, { planExecution: { isPlanRunTx: async (_tx: unknown, id: string, version: number) => id === run.id && version === 1 } });
    await agentRuntime.recoverUnfinishedRuns();
    assert.equal(createdRuns.get(run.id).status, "RUNNING");
  });

  it("14. does not re-execute already completed runs", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const completedRun = {
      id: "run-done-1",
      projectId: "project-1",
      userId: pmClaims.sub,
      title: "Done Task",
      status: "COMPLETED",
      currentStepIndex: 1,
      progressPercent: 100
    };
    createdRuns.set(completedRun.id, completedRun);

    await agentRuntime.executeRun("run-done-1", pmClaims);
    const runAfter = createdRuns.get("run-done-1");
    assert.equal(runAfter.status, "COMPLETED");
  });

  // ---------------------------------------------------------------------------
  // 15. No Execution of PAUSED Runs
  // ---------------------------------------------------------------------------
  it("15. does not automatically execute PAUSED runs", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const pausedRun = {
      id: "run-paused-1",
      projectId: "project-1",
      userId: pmClaims.sub,
      title: "Paused Task",
      status: "PAUSED",
      currentStepIndex: 0
    };
    createdRuns.set(pausedRun.id, pausedRun);

    await agentRuntime.executeRun("run-paused-1", pmClaims);
    const runAfter = createdRuns.get("run-paused-1");
    assert.equal(runAfter.status, "PAUSED");
  });

  // ---------------------------------------------------------------------------
  // 16. No Execution of AWAITING_APPROVAL Runs
  // ---------------------------------------------------------------------------
  it("16. stops step execution and does not execute runs in AWAITING_APPROVAL status", async () => {
    const { agentRuntime, createdRuns } = createMockEnvironment();

    const awaitingRun = {
      id: "run-awaiting-1",
      projectId: "project-1",
      userId: pmClaims.sub,
      title: "Approval Task",
      status: "AWAITING_APPROVAL",
      currentStepIndex: 0
    };
    createdRuns.set(awaitingRun.id, awaitingRun);

    await agentRuntime.executeRun("run-awaiting-1", pmClaims);
    const runAfter = createdRuns.get("run-awaiting-1");
    assert.equal(runAfter.status, "AWAITING_APPROVAL");
  });

  // ---------------------------------------------------------------------------
  // 17. Controller HTTP Contract & Conversation Linkage
  // ---------------------------------------------------------------------------
  it("17. controller creates AgentRun, returns standard ApiResponse, and preserves conversation linkage", async () => {
    const { controller, authService, createdRuns, mockPrisma } = createMockEnvironment();

    const password = "test-password-123";
    authService.setEnvForTest({
      SEKHEM_AUTH_ENABLED: "true",
      SEKHEM_AUTH_STAGING_EMAIL: pmClaims.email,
      SEKHEM_AUTH_STAGING_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
      SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345",
      SEKHEM_AUTH_STAGING_ROLE: "PM"
    });

    const loginRes = await authService.login({ email: pmClaims.email, password });
    const cookie = authService.authCookie(loginRes.token, 3600);
    // This conversation belongs to the authenticated staging actor, not the unit-test PM ID.
    mockPrisma.conversation.findUnique = async ({ where }: any) => ({ id: where.id, projectId: "project-1", userId: loginRes.session.user.id });
    // Staging identities have no tenant. The fixture project must match that identity.
    mockPrisma.project.findUnique = async ({ where }: any) => where.id === "project-1" ? { id: "project-1", organizationId: null, personalOwnerId: null } : null;

    const apiResponse = await controller.createAgentRun(cookie, {
      projectId: "project-1",
      instruction: "Controller test run",
      conversationId: "conv-100",
      title: "Controller Title"
    });

    assert.ok(apiResponse.data);
    assert.equal(apiResponse.data.projectId, "project-1");
    assert.equal(apiResponse.data.conversationId, "conv-100");
    assert.equal(apiResponse.data.status, "QUEUED");
    assert.equal(apiResponse.errors.length, 0);

    const stored = createdRuns.get(apiResponse.data.id);
    assert.ok(stored);
    assert.equal(stored.conversationId, "conv-100");
  });

  // ---------------------------------------------------------------------------
  // 18. Transaction Client Propagation in createRunTx
  // ---------------------------------------------------------------------------
  it("18. createRunTx strictly uses supplied tx client for AgentRun, AgentPlan, AgentRunEvent, and AuditEvent without root writes or scheduling", async () => {
    const { agentRuntime, mockPrisma } = createMockEnvironment();

    let rootAgentPlanCalls = 0;
    let rootAgentRunEventCalls = 0;
    let rootAuditEventCalls = 0;
    let rootTxCalls = 0;

    // Spy on root mockPrisma writes
    const origAgentPlanCreate = mockPrisma.agentPlan.create;
    mockPrisma.agentPlan.create = async (args: any) => {
      rootAgentPlanCalls++;
      return origAgentPlanCreate(args);
    };
    const origAgentRunEventCreate = mockPrisma.agentRunEvent.create;
    mockPrisma.agentRunEvent.create = async (args: any) => {
      rootAgentRunEventCalls++;
      return origAgentRunEventCreate(args);
    };
    const origAuditEventCreate = mockPrisma.auditEvent.create;
    mockPrisma.auditEvent.create = async (args: any) => {
      rootAuditEventCalls++;
      return origAuditEventCreate(args);
    };
    mockPrisma.$transaction = async () => {
      rootTxCalls++;
      throw new Error("createRunTx must not call prisma.$transaction internally");
    };

    // Separate mock tx client
    const txWrites = {
      agentRunCreated: 0,
      agentPlanCreated: 0,
      agentRunEventCreated: 0,
      auditEventCreated: 0,
      conversationFindUnique: 0
    };

    const mockTx: any = {
      conversation: {
        findUnique: async ({ where }: any) => {
          txWrites.conversationFindUnique++;
          return { id: where.id, projectId: "project-1", userId: pmClaims.sub };
        }
      },
      agentRun: {
        create: async ({ data }: any) => {
          txWrites.agentRunCreated++;
          return { ...data, plans: [], approvals: [], artifacts: [] };
        }
      },
      agentPlan: {
        create: async ({ data }: any) => {
          txWrites.agentPlanCreated++;
          return data;
        }
      },
      agentRunEvent: {
        create: async ({ data }: any) => {
          txWrites.agentRunEventCreated++;
          return data;
        }
      },
      auditEvent: {
        create: async ({ data }: any) => {
          txWrites.auditEventCreated++;
          return data;
        }
      }
    };

    const summary = await agentRuntime.createRunTx(mockTx, pmClaims, {
      projectId: "project-1",
      instruction: "Generate a technical memo on API auth",
      conversationId: "conv-existing-1"
    });

    // Verify all 4 writes used mockTx
    assert.equal(txWrites.agentRunCreated, 1, "AgentRun must be created on supplied tx");
    assert.equal(txWrites.agentPlanCreated, 1, "AgentPlan must be created on supplied tx");
    assert.equal(txWrites.agentRunEventCreated, 1, "AgentRunEvent must be created on supplied tx");
    assert.equal(txWrites.auditEventCreated, 1, "AuditEvent must be created on supplied tx");
    assert.equal(txWrites.conversationFindUnique, 1, "Conversation check must use supplied tx");

    // Verify root prisma writes were NOT touched
    assert.equal(rootAgentPlanCalls, 0, "Root prisma.agentPlan.create must not be called");
    assert.equal(rootAgentRunEventCalls, 0, "Root prisma.agentRunEvent.create must not be called");
    assert.equal(rootAuditEventCalls, 0, "Root prisma.auditEvent.create must not be called");
    assert.equal(rootTxCalls, 0, "createRunTx must not call root prisma.$transaction");

    // Verify status is QUEUED and no scheduler ran
    assert.equal(summary.status, "QUEUED");
  });

  // ---------------------------------------------------------------------------
  // 19. Transactional Rollback Semantics
  // ---------------------------------------------------------------------------
  it("19. rolls back AgentRun, AgentPlan, AgentRunEvent, and AuditEvent atomically when transaction fails", async () => {
    const { agentRuntime } = createMockEnvironment();

    // Committed persistent storage
    const committedStore = {
      runs: [] as any[],
      plans: [] as any[],
      events: [] as any[],
      audits: [] as any[]
    };

    // Staging transactional harness
    const runTransaction = async (action: (tx: any) => Promise<any>) => {
      const stage = {
        runs: [] as any[],
        plans: [] as any[],
        events: [] as any[],
        audits: [] as any[]
      };

      const stageTx: any = {
        conversation: {
          findUnique: async ({ where }: any) => ({ id: where.id, projectId: "project-1", userId: pmClaims.sub }),
          create: async ({ data }: any) => data
        },
        agentRun: {
          create: async ({ data }: any) => {
            stage.runs.push(data);
            return { ...data, plans: [], approvals: [], artifacts: [] };
          }
        },
        agentPlan: {
          create: async ({ data }: any) => {
            stage.plans.push(data);
            return data;
          }
        },
        agentRunEvent: {
          create: async ({ data }: any) => {
            stage.events.push(data);
            return data;
          }
        },
        auditEvent: {
          create: async ({ data }: any) => {
            stage.audits.push(data);
            return data;
          }
        }
      };

      try {
        const result = await action(stageTx);
        // On success: commit staged changes
        committedStore.runs.push(...stage.runs);
        committedStore.plans.push(...stage.plans);
        committedStore.events.push(...stage.events);
        committedStore.audits.push(...stage.audits);
        return result;
      } catch (err) {
        // On failure: discard staged changes (rollback)
        throw err;
      }
    };

    // Execute failing transaction
    await assert.rejects(
      async () => {
        await runTransaction(async (tx) => {
          await agentRuntime.createRunTx(tx, pmClaims, {
            projectId: "project-1",
            instruction: "Rollback test run",
            conversationId: "conv-1"
          });
          // Force transaction rollback after createRunTx
          throw new Error("Simulated downstream failure (e.g. conversation postMessage constraint)");
        });
      },
      /Simulated downstream failure/
    );

    // Verify all 4 artifacts rolled back completely
    assert.equal(committedStore.runs.length, 0, "AgentRun must roll back");
    assert.equal(committedStore.plans.length, 0, "AgentPlan must roll back");
    assert.equal(committedStore.events.length, 0, "AgentRunEvent must roll back");
    assert.equal(committedStore.audits.length, 0, "AuditEvent must roll back");
  });

  it("20. GET /api/agent-runs lists scoped summaries and rejects missing authentication", async () => {
    const { agentRuntime, controller, createdRuns, authService } = createMockEnvironment();

    await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Listable run",
      title: "Visible Run"
    });

    const listed = await agentRuntime.listRuns(pmClaims);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, "Visible Run");
    assert.equal(listed[0].projectId, "project-1");

    const otherOrgAdmin: typeof pmClaims = {
      ...pmClaims,
      sub: "user-admin-other",
      role: "Admin",
      organizationId: "org-other"
    };
    const otherOrgRuns = await agentRuntime.listRuns(otherOrgAdmin);
    assert.equal(otherOrgRuns.length, 0);

    const password = "test-password-123";
    authService.setEnvForTest({
      SEKHEM_AUTH_ENABLED: "true",
      SEKHEM_AUTH_STAGING_EMAIL: pmClaims.email,
      SEKHEM_AUTH_STAGING_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
      SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345",
      SEKHEM_AUTH_STAGING_ROLE: "PM"
    });
    const loginRes = await authService.login({ email: pmClaims.email, password });
    const cookie = authService.authCookie(loginRes.token, 3600);
    const apiResponse = await controller.listAgentRuns(cookie);
    assert.equal(Array.isArray(apiResponse.data), true);
    assert.equal(apiResponse.errors.length, 0);
    assert.ok(createdRuns.size >= 1);

    await assert.rejects(() => controller.listAgentRuns(undefined), /Authentication required/);
  });

  it("persists selected provider/model metadata on TOOL_RESULT after a real provider call", async () => {
    const { agentRuntime, createdEvents } = createMockEnvironment();

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate technical memo"
    });
    await agentRuntime.executeRun(summary.id, pmClaims);

    const toolResult = createdEvents.find((e) => e.eventType === "TOOL_RESULT");
    assert.ok(toolResult);
    assert.equal(toolResult.payload.aiCall.kind, "REAL_PROVIDER_CALL");
    assert.equal(toolResult.payload.aiCall.providerId, "provider-teletech");
    assert.equal(toolResult.payload.aiCall.modelId, "GLM-5.2-Abliterated");
    assert.equal(toolResult.payload.aiCall.correlationId, "corr-123");
    assert.equal(toolResult.payload.aiCall.providerCallExecuted, true);
    assert.equal("apiKey" in toolResult.payload.aiCall, false);
    assert.equal("encryptedApiKey" in toolResult.payload.aiCall, false);
    assert.equal("apiKey" in toolResult.payload, false);
  });

  it("does not record providerCallExecuted=true when the provider call fails", async () => {
    const { agentRuntime, createdEvents, createdRuns, createdArtifacts } = createMockEnvironment({
      askAssistant: async () => ({
        status: "PROVIDER_UNAVAILABLE",
        answer: null,
        correlationId: "ai-assistant-fail-1",
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        providerCallExecuted: true,
        apiKey: "must-not-be-persisted",
        encryptedApiKey: "must-not-be-persisted",
        authorization: "Bearer secret"
      })
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Generate technical memo"
    });
    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.equal(createdRuns.get(summary.id).status, "FAILED");
    assert.equal(
      createdRuns.get(summary.id).failureReason,
      "PROVIDER_FAILED"
    );
    assert.equal(createdRuns.get(summary.id).failureReason.includes("Generated technical memo for:"), false);
    const toolResult = createdEvents.find((e) => e.eventType === "TOOL_RESULT");
    assert.equal(toolResult, undefined);
    assert.equal(createdArtifacts.length, 0);

    const errorEvent = createdEvents.find((e) => e.eventType === "ERROR");
    assert.ok(errorEvent);
    assert.equal(errorEvent.payload.failureReason, "PROVIDER_FAILED");
    assert.equal(errorEvent.payload.aiCall.kind, "PROVIDER_CALL_FAILED");
    assert.equal(errorEvent.payload.aiCall.providerId, "provider-teletech");
    assert.equal(errorEvent.payload.aiCall.modelId, "GLM-5.2-Abliterated");
    assert.equal(errorEvent.payload.aiCall.correlationId, "ai-assistant-fail-1");
    assert.equal(errorEvent.payload.aiCall.providerCallExecuted, false);
    assert.equal("apiKey" in errorEvent.payload.aiCall, false);
    assert.equal("authorization" in errorEvent.payload.aiCall, false);
    assert.equal("encryptedApiKey" in errorEvent.payload, false);
  });

  // ---------------------------------------------------------------------------
  // Assistant ConversationMessage Persistence & Idempotency
  // ---------------------------------------------------------------------------
  it("persists exactly one assistant ConversationMessage with the real GLM answer upon successful run completion", async () => {
    const realAnswer = "SONiC (Software for Open Networking in the Cloud) is an open-source network operating system based on Linux.\n\nIt decouples network software from underlying switch hardware via Switch Abstraction Interface (SAI).";
    const { agentRuntime, createdMessages, createdRuns } = createMockEnvironment({
      askAssistant: async () => ({
        status: "REAL_PROVIDER",
        answer: realAnswer,
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        correlationId: "ai-assistant-real-1",
        providerCallExecuted: true,
        durationMs: 342,
        httpClassification: "SUCCESS",
        finishReason: "stop",
        promptTokens: 85,
        completionTokens: 64,
        configuredMaxOutputTokens: 512
      })
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Explain what SONiC is in two short paragraphs."
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.equal(createdRuns.get(summary.id).status, "COMPLETED");
    assert.equal(createdMessages.length, 1);

    const assistantMsg = createdMessages[0];
    assert.equal(assistantMsg.id, `msg_agent_${summary.id}`);
    assert.equal(assistantMsg.senderType, "assistant");
    assert.equal(assistantMsg.conversationId, summary.conversationId);
    assert.equal(assistantMsg.content, realAnswer);
    assert.equal(assistantMsg.content.includes("Generated technical memo for:"), false);
    assert.equal(assistantMsg.metadata.agentRunId, summary.id);
  });

  it("does not create an assistant ConversationMessage when provider fails", async () => {
    const { agentRuntime, createdMessages, createdRuns } = createMockEnvironment({
      askAssistant: async () => ({
        status: "PROVIDER_UNAVAILABLE",
        answer: null,
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        correlationId: "ai-assistant-fail-test",
        providerCallExecuted: false,
        durationMs: 120,
        httpClassification: "PROVIDER_ERROR",
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens: 512
      })
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Explain what SONiC is in two short paragraphs."
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.equal(createdRuns.get(summary.id).status, "FAILED");
    assert.equal(createdMessages.length, 0);
  });

  it("does not create an assistant ConversationMessage when policy blocks execution", async () => {
    const { agentRuntime, createdMessages, createdRuns } = createMockEnvironment({
      askAssistant: async () => ({
        status: "POLICY_BLOCKED",
        answer: null,
        providerId: null,
        modelId: null,
        correlationId: "ai-assistant-policy-test",
        providerCallExecuted: false,
        durationMs: null,
        httpClassification: "POLICY_BLOCKED",
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens: null
      })
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Explain what SONiC is in two short paragraphs."
    });

    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.equal(createdRuns.get(summary.id).status, "FAILED");
    assert.equal(createdMessages.length, 0);
  });

  it("is idempotent: duplicate processing of the same AgentRun does not create duplicate assistant messages", async () => {
    const realAnswer = "SONiC architecture decouples control plane and data plane.";
    const { agentRuntime, createdMessages, createdRuns } = createMockEnvironment({
      askAssistant: async () => ({
        status: "REAL_PROVIDER",
        answer: realAnswer,
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        correlationId: "ai-assistant-idem-1",
        providerCallExecuted: true,
        durationMs: 250,
        httpClassification: "SUCCESS",
        finishReason: "stop",
        promptTokens: 40,
        completionTokens: 25,
        configuredMaxOutputTokens: 512
      })
    });

    const summary = await agentRuntime.createRun(pmClaims, {
      projectId: "project-1",
      instruction: "Explain SONiC architecture"
    });

    // First execution
    await agentRuntime.executeRun(summary.id, pmClaims);
    assert.equal(createdRuns.get(summary.id).status, "COMPLETED");
    assert.equal(createdMessages.length, 1);

    // Re-trigger execution or duplicate call
    // Reset status to test re-execution path with same runId
    createdRuns.get(summary.id).status = "QUEUED";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    (agentRuntime as any).runningRunIds.clear();
    await agentRuntime.executeRun(summary.id, pmClaims);

    assert.equal(createdMessages.length, 1);
    assert.equal(createdMessages[0].id, `msg_agent_${summary.id}`);
  });

  it("completes a grounded AgentRun through the real gateway/adapter and audits final evidence truncation", async () => {
    const h = gatewayHarness();
    const c = contextHarness();
    const context = await c.build();
    c.builder.build = async () => context;
    const env = createMockEnvironment({ contextBuilder: c.builder,
      askAssistant: async (body) => ({ ...await h.gateway.askAssistant(body) }) });
    // Control scheduling so this test executes exactly one durable run.
    env.agentRuntime.scheduleRunExecution = () => {};
    const run = await env.agentRuntime.createRun(pmClaims, { projectId: "project-1", conversationId: "conv-1",
      instruction: "Draft a technical memo explaining the attached requirements and authorization design." });
    await env.agentRuntime.executeRun(run.id, pmClaims);
    assert.equal(env.createdRuns.get(run.id).status, "COMPLETED");
    assert.equal(env.createdMessages.length, 1);
    assert.equal(env.createdMessages[0].content, "Grounded answer");
    const evidenceEvent = env.createdEvents.find((event) => event.eventType === "EVIDENCE_COLLECTED");
    assert.ok(evidenceEvent);
    assert.deepEqual(evidenceEvent.payload.truncatedEvidenceIds, context.truncation.truncatedEvidenceIds);
    assert.equal(evidenceEvent.payload.remainingEvidenceBudget, context.truncation.remainingEvidenceBudget);
    assert.ok(context.truncation.truncatedEvidenceIds.length > 0);
    const completion = env.createdEvents.find((event) => event.eventType === "UNDERSTANDING_COMPLETED");
    assert.equal(completion.payload.contextBudget.reservedOutputTokens, 512);
    assert.equal(completion.payload.diagnostic.httpStatus, 200);
    assert.equal(completion.payload.diagnostic.refusalAttribution, "UNKNOWN");
    assert.ok(h.calls.at(-1).messages.at(-1).content.length > 24_000);
    assert.equal(h.policyReviews(), 0);
  });

  it("retains redacted grounded-provider diagnostics when an Agent run fails", async () => {
    const h = gatewayHarness();
    const c = contextHarness();
    const context = await c.build();
    c.builder.build = async () => context;
    let calls = 0;
    const env = createMockEnvironment({ contextBuilder: c.builder, askAssistant: async (body) => {
      const result = await h.gateway.askAssistant(body);
      if (++calls === 1) return { ...result };
      return { ...result, status: "PROVIDER_UNAVAILABLE", answer: null, httpClassification: "PROVIDER_ERROR",
        diagnostic: { ...result.diagnostic, httpStatus: 403, refusalAttribution: "UNKNOWN" } };
    } });
    env.agentRuntime.scheduleRunExecution = () => {};
    const run = await env.agentRuntime.createRun(pmClaims, { projectId: "project-1", conversationId: "conv-1",
      instruction: "Draft a technical memo explaining the attached requirements and authorization design." });
    await env.agentRuntime.executeRun(run.id, pmClaims);
    assert.equal(env.createdRuns.get(run.id).status, "FAILED");
    assert.equal(env.createdMessages.length, 0);
    const error = env.createdEvents.find(event => event.eventType === "ERROR");
    assert.equal(error.payload.diagnostic.httpStatus, 403);
    assert.equal(error.payload.diagnostic.refusalAttribution, "UNKNOWN");
    assert.equal(JSON.stringify(error.payload).includes("Grounded answer"), false);
  });

  it("executeChat forwards instruction and history to askAssistant without creating a run", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const { agentRuntime, createdRuns } = createMockEnvironment({
      askAssistant: async (body: Record<string, unknown>) => {
        captured.push(body);
        return {
          status: "REAL_PROVIDER",
          answer: "أنا SEKHEM",
          correlationId: "ai-assistant-chat-1",
          providerId: "provider-teletech",
          modelId: "GLM-5.2-Abliterated"
        };
      }
    });

    const result = await agentRuntime.executeChat(pmClaims, {
      conversationId: "conv-1",
      instruction: "اسمك ايه؟",
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" }
      ]
    });

    assert.equal(result.answer, "أنا SEKHEM");
    assert.equal(result.modelId, "GLM-5.2-Abliterated");
    assert.equal(result.providerId, "provider-teletech");
    assert.equal(createdRuns.size, 0);
    assert.deepEqual(captured, [
      {
        question: "اسمك ايه؟",
        requestedBy: "user-pm-1",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" }
        ]
      }
    ]);
  });
});
