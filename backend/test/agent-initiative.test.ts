import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentInitiativeService } from "../src/agent-runtime/initiative/agent-initiative.service";

const claims = { sub: "user-1", email: "user@example.test", displayName: "User", role: "PM" as const, organizationId: "org-1", sessionId: "s", exp: 1 };

function database() {
  const initiatives: any[] = [];
  const versions: any[] = [];
  const plans: any[] = [];
  const tasks: any[] = [];
  const decisions: any[] = [];
  const expand = (row: any, include: any) => include ? { ...row, versions: include.versions ? versions.filter((item) => item.initiativeId === row.id).sort((a, b) => b.version - a.version) : undefined, plans: include.plans ? plans.filter((item) => item.initiativeId === row.id) : undefined, tasks: include.tasks ? tasks.filter((item) => item.initiativeId === row.id).sort((a, b) => a.position - b.position) : undefined, decisions: include.decisions ? decisions.filter((item) => item.initiativeId === row.id) : undefined } : row;
  const db: any = {
    project: { findUnique: async () => ({ id: "project-1" }) },
    agentInitiative: {
      create: async ({ data }: any) => { initiatives.push({ ...data }); return initiatives.at(-1); },
      update: async ({ where, data }: any) => { const item = initiatives.find((row) => row.id === where.id); Object.assign(item, data); return item; },
      findUnique: async ({ where, include }: any) => { const item = initiatives.find((row) => row.id === where.id); return item ? expand(item, include) : null; },
      findMany: async ({ where }: any) => initiatives.filter((item) => item.projectId === where.projectId && (item.id === where.OR[0].id || item.title.toLowerCase().includes(where.OR[1].title.contains.toLowerCase())))
    },
    agentInitiativeVersion: {
      create: async ({ data }: any) => { versions.push({ ...data }); return versions.at(-1); },
      findFirst: async ({ where }: any) => versions.filter((item) => item.initiativeId === where.initiativeId).sort((a, b) => b.version - a.version)[0] ?? null,
      findUnique: async ({ where, include }: any) => { const key = where.initiativeId_version; const item = versions.find((row) => row.initiativeId === key.initiativeId && row.version === key.version); return item && include ? { ...item, plans: plans.filter((plan) => plan.versionId === item.id), decisions: decisions.filter((decision) => decision.versionId === item.id) } : item ?? null; },
      update: async ({ where, data }: any) => { const item = versions.find((row) => row.id === where.id); Object.assign(item, data); return item; }
    },
    agentInitiativePlan: { create: async ({ data }: any) => { plans.push({ ...data }); return plans.at(-1); } },
    agentInitiativeTask: {
      createMany: async ({ data }: any) => { tasks.push(...data.map((item: any) => ({ ...item, status: "TODO" }))); return { count: data.length }; },
      findMany: async ({ where }: any) => tasks.filter((item) => item.planId === where.planId).sort((a, b) => a.position - b.position),
      findUnique: async ({ where, include }: any) => { const item = tasks.find((row) => row.id === where.id); return item ? { ...item, initiative: include?.initiative ? initiatives.find((row) => row.id === item.initiativeId) : undefined } : null; },
      update: async ({ where, data }: any) => { const item = tasks.find((row) => row.id === where.id); Object.assign(item, data); return item; }
    },
    agentInitiativeDecision: { create: async ({ data }: any) => { decisions.push({ ...data }); return decisions.at(-1); } },
    agentRun: { findMany: async () => [] },
    auditEvent: { create: async () => ({}) },
    $transaction: async (work: any) => work(db)
  };
  return { db, initiatives, versions, tasks, decisions };
}

describe("5D-0.3 Agent Initiative", () => {
  it("persists draft, immutable versions, approval, selection, task state, and resume", async () => {
    const store = database();
    const authz = { assertAuthorized: async () => undefined };
    const service = new AgentInitiativeService(store.db, authz as never);
    const created = await service.create(claims, { projectId: "project-1", title: "Website reliability", objective: "Improve reliability", evidence: [{ provenance: "project-1:package.json", sourceType: "workspace" }], plan: [{ title: "Inspect deployment" }, { title: "Review alerts" }] });
    assert.equal(created.initiative.status, "DRAFT");
    assert.equal(created.tasks.length, 2);
    const second = await service.createVersion(claims, created.initiative.id, { plan: [{ title: "Inspect deployment v2" }] });
    assert.equal(second.version.version, 2);
    assert.equal(store.versions.find((item) => item.version === 1).plan[0].title, "Inspect deployment");
    await service.decide(claims, created.initiative.id, 1, "APPROVE", "approved by operator");
    await service.decide(claims, created.initiative.id, 2, "APPROVE");
    await service.selectApprovedVersion(claims, created.initiative.id, 1, "return to stable version");
    const resumed = await service.resume(claims, created.initiative.id);
    assert.equal(resumed.version.version, 1);
    assert.equal(resumed.openTasks.length, 2);
    await service.transition(claims, created.initiative.id, "ACTIVE");
    assert.equal(store.initiatives[0].status, "ACTIVE");
    await service.updateTask(claims, created.tasks[0].id, { status: "VERIFIED", verification: { evidence: "checked" } });
    assert.equal(store.tasks[0].status, "VERIFIED");
  });

  it("requires explicit approval and retains cross-user authorization enforcement", async () => {
    const store = database();
    let calls = 0;
    const authz = { assertAuthorized: async () => { calls++; } };
    const service = new AgentInitiativeService(store.db, authz as never);
    const created = await service.create(claims, { projectId: "project-1", title: "Auth", objective: "Review auth" });
    await assert.rejects(() => service.resume(claims, created.initiative.id), /approved initiative version/);
    await service.transition(claims, created.initiative.id, "PROPOSED");
    await service.decide(claims, created.initiative.id, 1, "REJECT", "needs scope");
    assert.equal(store.initiatives[0].status, "REJECTED");
    assert.ok(calls >= 4);
  });
});
