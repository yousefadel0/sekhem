import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { executionFixture } from "./agent-plan-execution.test";
import { ConversationService } from "../src/conversation/conversation.service";
import { presentPlan } from "../src/agent-runtime/understanding/agent-presentation";
import { resolveConversationIntent } from "../src/conversation/conversation-intent-resolver";
import { validateExactPlan } from "../src/agent-runtime/execution/exact-proposal.service";

async function pendingFixture() {
  const h = await executionFixture(true);
  // Remove the fixture's default user criteria so the real request contract,
  // rather than a model-invented unknown, produces REQUEST_CONTEXT success-criteria.
  for (const message of h.tables.conversationMessage.values()) if (message.senderType === "user") message.content = message.content.replace(/Acceptance:[\s\S]*/i, "");
  const first = await h.post("Create a plan to modify auth.ts by adding a function comment.", "not-ready");
  const old = structuredClone([...h.tables.agentPlan.values()].find(p => p.agentRunId === first.agentRunId)!);
  assert.equal(old.status, "PLAN_NOT_READY");
  (h.agents as any).getRun = async (id: string) => {
    const run = await h.db.agentRun.findUnique({ where: { id }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
    return { ...run, presentation: presentPlan(run.plans?.[0]?.steps), ...(id === h.run.id ? { inspection: await h.service.view(id, h.claims) } : {}) };
  };
  const summary = await (h.conversations as any).workflowSummary(h.tables.conversation.get("conversation-a"), h.claims, "Success criteria: preserve behavior");
  assert.ok(summary.pendingPlanning?.length, JSON.stringify(summary));
  return { ...h, old, first };
}

test("acceptance continuation commits READY v2 and exact source provenance retrievable by proposal routing", async () => {
  const h = await pendingFixture();
  const result = await h.post("For the current engineering plan, use these explicit acceptance criteria:\n- The descriptive function comment is present and function behavior remains unchanged.", "criteria");
  assert.equal(result.agentRunId, h.first.agentRunId);
  const plans = [...h.tables.agentPlan.values()].filter(p => p.agentRunId === result.agentRunId);
  const ready = plans.find(p => p.version === 2)!;
  assert.equal(ready.status, "PLAN_READY"); assert.deepEqual(h.tables.agentPlan.get(h.old.id), h.old);
  const run = h.tables.agentRun.get(result.agentRunId), fresh = await h.service.certifiedPlanningSourceTx(h.db, h.claims, "conversation-a");
  validateExactPlan(run, ready, fresh, h.claims, "conversation-a");
  const summary = await (h.conversations as any).workflowSummary(h.tables.conversation.get("conversation-a"), h.claims, "Create the exact proposal");
  const target = resolveConversationIntent("Create the exact proposal", summary);
  assert.equal(target.route, "EXACT_PROPOSAL"); assert.equal(target.target?.planId, ready.id);
  assert.equal(target.target?.digest, ready.steps[0].parameters.engineeringPlan.digest);
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.planningReport && m.metadata.planId === ready.id)!;
  assert.match(message.content, /^PLAN_READY/); assert.equal(message.metadata.planVersion, 2);
  assert.ok(![...h.tables.auditEvent.values()].some(row => ["EXACT_PROPOSAL", "PLAN_EXECUTION", "EXACT_EXECUTION_PERMIT"].includes(row.metadata?.recordType)));
});

test("explicit continuation reuses bounded persisted user acceptance without another inspection", async () => {
  const h = await pendingFixture(), before = structuredClone(await h.state()), runCount = h.tables.agentRun.size;
  await h.db.conversationMessage.create({ data: { id: "previous-criteria", conversationId: "conversation-a", senderId: h.claims.sub, senderType: "user",
    content: "For the current engineering plan, use these explicit acceptance criteria:\n- The descriptive function comment is present and function behavior remains unchanged.", metadata: {} } });
  const response = await h.post("Continue the current PLAN_NOT_READY engineering plan using the explicit acceptance criteria I already provided. Do not start a new inspection. Generate the next immutable plan version and report whether it is PLAN_READY.", "resume");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === response.agentRunId && p.version === 2)!;
  assert.equal(plan.status, "PLAN_READY", JSON.stringify(plan.steps[0].parameters.planning)); assert.deepEqual(await h.state(), before);
  assert.equal(h.tables.agentRun.size, runCount); // Reuse the existing planning run; no new inspection.
});

for (const request of ["criteria", "workflow"] as const) for (const failure of ["plan", "report"] as const) test(`failed ${failure} persistence from ${request} continuation cannot publish READY or mutate historical plan`, async () => {
  const h = await pendingFixture();
  if (request === "workflow") await h.db.conversationMessage.create({ data: { id: "previous-criteria", conversationId: "conversation-a", senderId: h.claims.sub, senderType: "user",
    content: "Success criteria:\n- Preserve function behavior while adding its descriptive comment.", metadata: {} } });
  if (failure === "plan") h.db.agentPlan.create = async () => { throw new Error("TEST_PERSISTENCE_FAILURE"); };
  else {
    const create = h.db.conversationMessage.create;
    h.db.conversationMessage.create = async (q: any) => { if (q.data.metadata?.planningReport) throw new Error("TEST_PERSISTENCE_FAILURE"); return create(q); };
  }
  await assert.rejects(h.post(request === "criteria" ? "Success criteria:\n- Preserve function behavior while adding its descriptive comment." : "Continue the current PLAN_NOT_READY engineering workflow using the explicit acceptance criteria already provided. Do not start a new inspection.", "failed-criteria"), /TEST_PERSISTENCE_FAILURE/);
  assert.deepEqual(h.tables.agentPlan.get(h.old.id), h.old);
  assert.ok(![...h.tables.agentPlan.values()].some(p => p.agentRunId === h.first.agentRunId && p.status === "PLAN_READY"));
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.planningReport && /^PLAN_READY/.test(m.content)));
  assert.ok(![...h.tables.agentRunEvent.values()].some(e => e.agentRunId === h.first.agentRunId && e.eventType === "PLAN_READY"));
});

test("ordinary chat cannot present model-generated PLAN_READY as a saved workflow result", async () => {
  const records: any[] = [], db: any = { $transaction: async (work: any) => work(db), conversation: { findUnique: async () => ({ id: "c", userId: "u", projectId: "p" }), update: async () => ({}) },
    conversationMessage: { findUnique: async ({ where }: any) => records.find(r => r.id === where.id) ?? null,
      findMany: async () => [], create: async ({ data }: any) => { records.push(data); return { ...data, createdAt: new Date() }; } } };
  const service = new ConversationService(db, { executeChat: async () => ({ answer: "PLAN_READY · Plan fake · Version 2\nStatus: PLAN_READY" }) } as any);
  const response: any = await service.postMessage("c", { sub: "u", role: "Admin" } as any, { content: "Hello" });
  assert.ok(!response.content.includes("PLAN_READY")); assert.match(response.content, /did not create or update a plan/);
  assert.equal(records.filter(r => r.senderType === "assistant").length, 1);
});
