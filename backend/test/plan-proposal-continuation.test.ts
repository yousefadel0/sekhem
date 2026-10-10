import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { ConversationService } from "../src/conversation/conversation.service";
import { fixture } from "./exact-proposal-stage.test";
const plan = { runId: "run", planId: "plan", planVersion: 4, digest: "a".repeat(64) };
const context = (): ConversationWorkflowSummary => ({ eligiblePlans: [plan], activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [], workspace: null });
for (const text of ["Proceed", "تمام", "اعملها", "Proceed with plan plan"]) test(`proposal-only continuation: ${text}`, () => {
  const c = context(), before = JSON.stringify(c), d = resolveConversationIntent(text, c);
  assert.equal(d.route, "EXACT_PROPOSAL"); assert.deepEqual(d.target, plan); assert.equal(JSON.stringify(c), before);
});
test("multiple plans or competing approval are ambiguous; explicit card target stays unique", () => {
  const c = context(); c.eligiblePlans!.push({ ...plan, planId: "other", runId: "other" });
  assert.equal(resolveConversationIntent("Proceed", c).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Proceed with plan plan", c).target?.planId, "plan");
  c.eligiblePlans = [plan]; c.pendingApprovals = [{ runId: "other" }];
  assert.equal(resolveConversationIntent("تمام", c).route, "AMBIGUOUS");
});
test("missing/stale eligible target cannot prepare; ordinary chat remains available", () => {
  const c = context(); c.eligiblePlans = [];
  assert.equal(resolveConversationIntent("Proceed", c).route, "CONVERSATION");
  assert.equal(resolveConversationIntent("Proceed with plan stale", c).route, "UNAVAILABLE");
  c.truncated = true; assert.equal(resolveConversationIntent("Proceed", c).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Hello", c).route, "CONVERSATION");
});
test("existing proposal is reused; approval-only acknowledgment stays guidance", () => {
  const c = context(); c.eligiblePlans![0] = { ...plan, proposalId: "proposal" };
  assert.equal(resolveConversationIntent("اعملها", c).reason, "reuse-exact-proposal");
  c.eligiblePlans = []; c.pendingApprovals = [{ runId: "run", approvalId: "approval" }];
  assert.equal(resolveConversationIntent("تمام", c).route, "APPROVAL_GUIDANCE");
});
test("continuation reuses immutable proposal with fresh message ID and revalidates source", async () => {
  const f = fixture(), p = await f.service.continuePlan("conversation", f.claims, f.body);
  const before = JSON.stringify([...f.records]);
  assert.deepEqual(await f.service.continuePlan("conversation", f.claims, { ...f.body, requestId: "next-message" }), p);
  assert.deepEqual(await f.service.continuePlan("conversation", f.claims, f.body), p);
  assert.equal(f.calls().modelCalls, 1); assert.equal(f.messages.length, 1); assert.equal(JSON.stringify([...f.records]), before);
  assert.equal(p.authorization, "NOT_GRANTED"); assert.equal(p.executionEnabled, false);
  assert.deepEqual(f.events.map(e => e.eventType), ["EXACT_PROPOSAL_READY"]);
  f.fresh.digest = "changed";
  await assert.rejects(f.service.continuePlan("conversation", f.claims, f.body), /PLAN_SOURCE_CHANGED/);
});
test("production message dispatch invokes only proposal preparation in same conversation", async () => {
  const service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  service.prisma = { conversationMessage: { findUnique: async () => null }, conversation: { findUnique: async () => ({ id: "conversation", userId: "user", projectId: "project" }) } };
  service.workflowSummary = async () => context();
  service.saveModeNotice = async (_c: any, _claims: any, _text: any, _dto: any, content: string) => ({ content });
  service.agentRuntimeService = new Proxy({ continueExactProposal: async (...args: any[]) => { calls.push(args); return { proposalId: "proposal", version: 1 }; } }, { get(target: any, key) { if (key in target) return target[key]; return () => { throw new Error(`forbidden downstream call: ${String(key)}`); }; } });
  const reply = await service.postMessage("conversation", { sub: "user", role: "Admin", organizationId: "org" }, { content: "Proceed", metadata: { clientMessageId: "message" } });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "conversation"); assert.deepEqual(calls[0][2], { planId: "plan", planVersion: 4, planDigest: plan.digest, requestId: "message" });
  assert.match(reply.content, /No approval, permit or execution/);
});

test("proposal with pending approval uses guidance instead of preparation", () => {
  const c = context(); c.eligiblePlans = [{ ...plan, proposalId: "proposal" }]; c.pendingApprovals = [{ runId: "run", approvalId: "approval" }];
  assert.equal(resolveConversationIntent("تمام", c).route, "APPROVAL_GUIDANCE");
  c.pendingApprovals.push({ runId: "run", approvalId: "second" });
  assert.equal(resolveConversationIntent("اعملها", c).route, "AMBIGUOUS");
});
test("persisted summary admits only validated workspace-matching ready plans and bounds candidates", async () => {
  const service: any = Object.create(ConversationService.prototype);
  const workspace = { workspaceId: "workspace", version: 40, runtimeId: "runtime", runtimeFingerprint: "fingerprint" };
  service.runtimeWorkspaces = { getBinding: async () => ({ ...workspace, userId: "user", projectId: "project", organizationId: "org" }) };
  let rows = [{ id: "ready", status: "COMPLETED" }, { id: "stale", status: "COMPLETED" }, { id: "invalid", status: "COMPLETED" }];
  service.prisma = { agentRun: { findMany: async () => rows }, agentApproval: { findMany: async () => [] } };
  service.agentRuntimeService = { getRun: async (id: string) => ({ id, presentation: { engineeringPlan: { ...plan, planId: id, workspace: { ...workspace, bindingVersion: id === "stale" ? 39 : 40 } }, planning: { plan: { readiness: "PLAN_READY", validation: { valid: id !== "invalid" } } } } }) };
  const conversation = { id: "conversation", projectId: "project", metadata: { runtimeWorkspace: { workspaceId: "workspace", bindingVersion: 40 } } };
  const c = await service.workflowSummary(conversation, { sub: "user", organizationId: "org" });
  assert.deepEqual(c.eligiblePlans.map((p: any) => p.planId), ["ready"]);
  rows = Array.from({ length: 21 }, (_, i) => ({ id: `ready-${i}`, status: "COMPLETED" }));
  const bounded = await service.workflowSummary(conversation, { sub: "user", organizationId: "org" });
  assert.equal(bounded.eligiblePlans.length, 20); assert.equal(bounded.truncated, true);
  assert.equal(resolveConversationIntent("Proceed", bounded).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Hello", bounded).route, "CONVERSATION");
});
