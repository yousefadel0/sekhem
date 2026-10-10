// agent-runtime.steering.test.ts
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { AgentRuntimeController } from "../src/agent-runtime/agent-runtime.controller";
import { SkillRegistryService } from "../src/agent-runtime/skills/skill-registry.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { AuditService } from "../src/audit/audit.service";
import { AuthService } from "../src/auth/auth.service";
import type { SessionClaims } from "../src/auth/auth.dto";

/**
 * Helper to create a mock environment similar to the one used in `agent-runtime.test.ts`.
 * It provides in‑memory mocks for Prisma and other services.
 */
function createMockEnvironment(overrides?: {
  projectRole?: string | null;
  skillExecutionResult?: { success: boolean; summary?: string; output?: unknown; artifacts?: any[] };
}) {
  const createdRuns = new Map<string, any>();
  const createdPlans: any[] = [];
  const createdEvents: any[] = [];
  const createdArtifacts: any[] = [];
  const createdApprovals: any[] = [];
  const auditLogs: any[] = [];

  // In-memory mock storage for conversations
  const _conversations = new Map<string, any>();

  const mockPrisma: any = {
    $transaction: async (fn: any) => await fn(mockPrisma),
    project: { findUnique: async ({ where }: any) => ["project-1", "proj-1"].includes(where.id)
      ? { id: where.id, organizationId: "org-acme", personalOwnerId: null } : null },
    conversation: {
      findUnique: async ({ where }: any) => {
        // Return existing mock conversation or a default placeholder
        if (_conversations.has(where.id)) {
          return _conversations.get(where.id);
        }
        // Used when checking an existing conversation ID before creation; return minimal fields
        return { id: where.id, projectId: "project-1", userId: "user-pm-1" };
      },
      create: async ({ data }: any) => {
        const conv = { ...data, id: data.id || `conv-auto-${Date.now()}` };
        _conversations.set(conv.id, conv);
        return conv;
      },
      update: async ({ where, data }: any) => {
        // Simple merge for in‑memory update; ignore if not present
        const existing = _conversations.get(where.id) || { id: where.id };
        const updated = { ...existing, ...data };
        _conversations.set(where.id, updated);
        return updated;
      },
    },


    agentRun: {
      create: async ({ data }: any) => {
        const record = { ...data, plans: [], approvals: [], artifacts: [] };
        createdRuns.set(data.id, record);
        return record;
      },
      findUnique: async ({ where, include }: any) => {
        const run = createdRuns.get(where.id);
        if (!run) return null;
        return {
          ...run,
          plans: include?.plans ? createdPlans.filter(p => p.agentRunId === where.id) : undefined,
          approvals: include?.approvals ? createdApprovals.filter(a => a.agentRunId === where.id) : undefined,
          artifacts: include?.artifacts ? createdArtifacts.filter(a => a.agentRunId === where.id) : undefined,
        };
      },
      findMany: async ({ where }: any) => {
        const all = Array.from(createdRuns.values());
        if (where?.status?.in) {
          return all.filter(r => where.status.in.includes(r.status));
        }
        return all;
      },
      update: async ({ where, data }: any) => {
        const existing = createdRuns.get(where.id) || {};
        const updated = { ...existing, ...data };
        createdRuns.set(where.id, updated);
        return updated;
      },
    },
    agentPlan: {
      create: async ({ data }: any) => {
        createdPlans.push(data);
        return data;
      },
      findMany: async () => createdPlans,
    },
    agentRunEvent: {
      create: async ({ data }: any) => {
        createdEvents.push(data);
        return data;
      },
    },
    agentApproval: {
      create: async ({ data }: any) => {
        createdApprovals.push(data);
        return data;
      },
    },
    agentArtifact: {
      create: async ({ data }: any) => {
        createdArtifacts.push(data);
        return data;
      },
    },
    projectMember: {
      findUnique: async ({ where }: any) => {
        if (overrides?.projectRole === null) return null;
        return {
          projectId: where.projectId_userId.projectId,
          userId: where.projectId_userId.userId,
          role: overrides?.projectRole ?? "PM",
        };
      },
    },
    groupMember: { findUnique: async () => null },
    auditEvent: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  const mockAiGateway: any = {
    askAssistant: async () => ({
      status: overrides?.skillExecutionResult?.success === false ? "POLICY_BLOCKED" : "REAL_PROVIDER",
      answer: "Technical memo: Authentication foundation hardening is validated.",
      correlationId: "corr-123",
    }),
  };

  const mockRuntimeConfig: any = { repositoryForUse: async () => ({ id: "repo-1", url: "https://git.test/repo" }) };
  const mockRepoContent: any = { snapshot: async () => ({ repository: "acme/sekhem", commitSha: "a1b2c3d", fileCount: 42, totalBytes: 12345, skippedFiles: 0, chunks: [] }) };

  const authService = new AuthService(mockPrisma);
  const auditService = new AuditService(authService, mockPrisma);
  const resourceAuthz = new ResourceAuthorizationService(mockPrisma);
  const skillRegistry = new SkillRegistryService(mockAiGateway, mockRuntimeConfig, mockRepoContent);
  const agentRuntime = new AgentRuntimeService(skillRegistry, resourceAuthz, auditService, mockPrisma);
  const controller = new AgentRuntimeController(agentRuntime, authService);

  const pmClaims: SessionClaims = {
    sub: "user-pm-1",
    sessionId: "sess-1",
    email: "pm@acme.test",
    displayName: "PM User",
    role: "PM",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const adminClaims: SessionClaims = {
    sub: "user-admin-1",
    sessionId: "sess-admin-1",
    email: "admin@acme.test",
    displayName: "Admin User",
    role: "Admin",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  return { mockPrisma, authService, agentRuntime, controller, createdRuns, createdPlans, createdEvents, createdArtifacts, createdApprovals, auditLogs, pmClaims, adminClaims };
}

describe("Agent Runtime Steering (Step 3)", () => {
  let env: ReturnType<typeof createMockEnvironment>;

  before(() => {
    env = createMockEnvironment();
  });

  it("rejects steering when authentication claims are missing", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    await assert.rejects(
      async () => await env.agentRuntime.steerRun(run.id, {} as any, { instruction: "new" }),
      /You do not have permission/,
    );
  });

  it("rejects steering across organization boundaries", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    await env.mockPrisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });
    const foreignClaims = { ...env.pmClaims, organizationId: "org-other" } as SessionClaims;
    await assert.rejects(
      async () => await env.agentRuntime.steerRun(run.id, foreignClaims, { instruction: "new" }),
      /You do not have permission/,
    );
  });

  it("rejects steering without permission", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    const unpermittedClaims: SessionClaims = {
      ...env.pmClaims,
      role: "Viewer",
    };
    await assert.rejects(
      async () => await env.agentRuntime.steerRun(run.id, unpermittedClaims, { instruction: "new" }),
      (err: any) => {
        assert(err instanceof ForbiddenException || err.name === "ForbiddenException");
        assert.match(err.message, /You do not have permission to perform UPDATE on this AgentRun/);
        return true;
      },
    );
  });

  it("allows only authorized role to steer", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    await env.mockPrisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });

    const viewerClaims = { ...env.adminClaims, role: "Viewer" } as SessionClaims;
    await assert.rejects(
      async () => await env.agentRuntime.steerRun(run.id, viewerClaims, { instruction: "new" }),
      /You do not have permission to perform UPDATE on this AgentRun/,
    );

    const res = await env.agentRuntime.steerRun(run.id, env.adminClaims, { instruction: "authorized steer" });
    assert.equal(res.id, run.id);
  });

  it("rejects steering when run is not RUNNING", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    await env.mockPrisma.agentRun.update({ where: { id: run.id }, data: { status: "PAUSED" } });
    await assert.rejects(
      async () => await env.agentRuntime.steerRun(run.id, env.adminClaims, { instruction: "new" }),
      (err: any) => {
        assert(err instanceof BadRequestException || err.name === "BadRequestException");
        assert.match(err.message, /(?:Run must be in RUNNING state|Steering is only allowed for RUNNING runs)/);
        return true;
      },
    );
  });

  it("creates exactly one STEERING_SUBMITTED event per request", async () => {
    const run = await env.agentRuntime.createRun(env.adminClaims, { projectId: "proj-1", instruction: "orig", title: "t" });
    await env.mockPrisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });

    await env.agentRuntime.steerRun(run.id, env.adminClaims, { instruction: "first" });
    const eventsAfterFirst = env.createdEvents.filter(
      (e) => (e.agentRunId === run.id || e.runId === run.id) && e.eventType === "STEERING_SUBMITTED",
    );
    assert.equal(eventsAfterFirst.length, 1);
    assert.equal(eventsAfterFirst[0].agentRunId, run.id);
    assert.equal(eventsAfterFirst[0].payload.instruction, "first");
    assert.equal(eventsAfterFirst[0].payload.consumed, false);

    await env.agentRuntime.steerRun(run.id, env.adminClaims, { instruction: "second" });
    const eventsAfterSecond = env.createdEvents.filter(
      (e) => (e.agentRunId === run.id || e.runId === run.id) && e.eventType === "STEERING_SUBMITTED",
    );
    assert.equal(eventsAfterSecond.length, 2);
    assert.notEqual(eventsAfterSecond[0].id, eventsAfterSecond[1].id);
    assert.equal(eventsAfterSecond[1].agentRunId, run.id);
    assert.equal(eventsAfterSecond[1].payload.instruction, "second");
    assert.equal(eventsAfterSecond[1].payload.consumed, false);

    const eventIds = new Set(eventsAfterSecond.map((e) => e.id));
    assert.equal(eventIds.size, 2);
  });
});
