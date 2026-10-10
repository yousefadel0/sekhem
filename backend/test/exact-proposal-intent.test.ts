import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationService } from "../src/conversation/conversation.service";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { validateExactPlan } from "../src/agent-runtime/execution/exact-proposal.service";

const target = { runId: "planning", planId: "ready-v2", planVersion: 2, digest: "a".repeat(64) };
const context = (): ConversationWorkflowSummary => ({ activeInspections: [], certifiedUnderstanding: { runId: "grounded", sequence: 1 },
  latestPlan: { runId: "planning", planId: "not-ready-v3", readiness: "PLAN_NOT_READY" }, eligiblePlans: [target], execution: null, pendingApprovals: [], workspace: null });
for (const text of ["Create the exact proposal", "Prepare an exact proposal from the current ready plan.", "Create the exact proposal for index.html. Preserve everything else. Do not execute."])
  test(`explicit proposal intent takes proposal path: ${text}`, () => {
    const c = context(), before = structuredClone(c), decision = resolveConversationIntent(text, c);
    assert.equal(decision.route, "EXACT_PROPOSAL"); assert.deepEqual(decision.target, target); assert.deepEqual(c, before);
  });
test("latest eligible ready revision wins within one workflow; unrelated workflows stay ambiguous", () => {
  const c = context(); c.eligiblePlans!.push({ ...target, planId: "ready-v1", planVersion: 1 });
  assert.deepEqual(resolveConversationIntent("Create the exact proposal", c).target, target);
  c.eligiblePlans!.push({ ...target, runId: "other", planId: "other-plan" });
  assert.equal(resolveConversationIntent("Create the exact proposal", c).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Create the exact proposal for plan ready-v2", c).target?.planId, "ready-v2");
});
test("missing/truncated proposal target stops rather than inspecting or replanning", () => {
  assert.equal(resolveConversationIntent("Create the exact proposal", { ...context(), eligiblePlans: [] }).route, "UNAVAILABLE");
  assert.equal(resolveConversationIntent("Create the exact proposal", { ...context(), truncated: true }).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Create an engineering plan", context()).route, "PLANNING");
  assert.equal(resolveConversationIntent("Read index.html", context()).route, "INSPECTION");
});

function fixture(stale = false) {
  const service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  const binding = { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" };
  const conversation = { id: "conversation", userId: "user", projectId: "project", metadata: { runtimeWorkspace: { workspaceId: "workspace", bindingVersion: 41 } } };
  const saved = { id: target.planId, agentRunId: target.runId, status: "PLAN_READY", version: 2, steps: [{ parameters: { engineeringPlan: { ...target, workspace: { ...binding, bindingVersion: stale ? 40 : 41 } },
    planning: { plan: { readiness: "PLAN_READY", validation: { valid: true } } } } }] };
  const before = structuredClone(saved);
  const run = { id: target.runId, conversationId: "conversation", projectId: "project", presentation: { engineeringPlan: { ...target, planId: "not-ready-v3", planVersion: 3, workspace: binding },
    planning: { plan: { readiness: "PLAN_NOT_READY", validation: { valid: true } } } } };
  service.runtimeWorkspaces = { getBinding: async () => ({ ...binding, version: 41, userId: "user", projectId: "project", organizationId: "org" }) };
  service.prisma = { conversation: { findUnique: async () => conversation }, conversationMessage: { findUnique: async () => null }, agentRun: { findMany: async () => [{ id: target.runId, status: "COMPLETED" }] },
    agentPlan: { findMany: async (query: any) => { assert.deepEqual(query.where.agentRun, { conversationId: "conversation", userId: "user", projectId: "project" }); assert.equal(query.where.status, "PLAN_READY"); assert.equal(query.take, 21); return [saved]; } } };
  service.agentRuntimeService = new Proxy({ getRun: async () => run, continueExactProposal: async (...args: any[]) => { calls.push(args); return { proposalId: "proposal", version: 1 }; } },
    { get(obj: any, key) { if (key in obj) return obj[key]; if (key === "inspectionView") return undefined; return () => { throw Error(`Forbidden call: ${String(key)}`); }; } });
  service.saveModeNotice = async (_conv: any, _claims: any, _text: any, _dto: any, content: string) => ({ content });
  return { service, conversation, saved, before, calls, claims: { sub: "user", organizationId: "org", role: "Admin" } };
}
test("persisted READY v2 survives NOT_READY v3 projection and dispatches only proposal preparation", async () => {
  const f = fixture();
  const summary = await f.service.workflowSummary(f.conversation, f.claims, "Create the exact proposal");
  assert.equal(summary.latestPlan.planId, "not-ready-v3"); assert.deepEqual(summary.eligiblePlans, [target]);
  await f.service.postMessage("conversation", f.claims, { content: "Create the exact proposal", metadata: { clientMessageId: "request" } });
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0], ["conversation", f.claims, { planId: target.planId, planVersion: 2, planDigest: target.digest, requestId: "request" }]);
  assert.deepEqual(f.saved, f.before);
});
test("stale ready revision produces safe notice without proposal, plan, inspection or execution calls", async () => {
  const f = fixture(true), reply = await f.service.postMessage("conversation", f.claims, { content: "Create the exact proposal" });
  assert.match(reply.content, /No eligible saved workflow/); assert.equal(f.calls.length, 0); assert.deepEqual(f.saved, f.before);
});
test("routing never bypasses the existing current plan-version admission gate", () => {
  assert.throws(() => validateExactPlan({ conversationId: "conversation", userId: "user", projectId: "project", planVersion: 3 },
    { version: 2, status: "PLAN_READY", steps: [{ parameters: {} }] }, { conversation: { projectId: "project" } }, { sub: "user" } as any, "conversation"), /PLAN_READY_REQUIRED/);
});
