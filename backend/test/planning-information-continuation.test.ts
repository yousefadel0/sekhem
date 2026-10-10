import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationService } from "../src/conversation/conversation.service";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { planningAcceptanceSection } from "../src/conversation/conversation-intent";
import { currentPlanningInformation, continuationObjective } from "../src/conversation/planning-continuation-information";

const criteria = "Success criteria:\n- index.html contains the exact Hero heading.\n- Preserve every other part of index.html.";
const pending = { runId: "planning", sourceRunId: "grounded", objective: "Change only the Hero heading in index.html.", missingInformationIds: ["success-criteria"] };
function context(): ConversationWorkflowSummary {
  return { activeInspections: [], certifiedUnderstanding: { runId: "grounded", sequence: 1 }, latestPlan: { runId: "planning", planId: "plan", readiness: "PLAN_NOT_READY" },
    execution: null, pendingApprovals: [], workspace: { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" }, pendingPlanning: [pending] };
}
for (const header of ["Success criteria", "Acceptance criteria", "معايير النجاح", "معايير القبول"]) test(`explicit ${header} resumes pending planning before workspace inspection`, () => {
  const c = context(), before = structuredClone(c);
  const d = resolveConversationIntent(criteria.replace("Success criteria", header), c);
  assert.equal(d.route, "PLANNING"); assert.equal(d.reason, "pending-planning-information"); assert.equal(d.target?.runId, "grounded");
  assert.ok(d.planningInstruction?.startsWith(pending.objective)); assert.deepEqual(c, before);
});
test("ambiguous/truncated planning answers fail closed; ordinary reads are unaffected", () => {
  const c = context(); c.pendingPlanning!.push({ ...pending, runId: "other" });
  assert.equal(resolveConversationIntent(criteria, c).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent(criteria, { ...context(), truncated: true }).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Read index.html", context()).route, "INSPECTION");
  assert.equal(resolveConversationIntent("Hello", context()).route, "CONVERSATION");
});

test("the live continuation and prefaced acceptance answer use persisted planning, never ordinary chat", () => {
  const request = "Continue the current PLAN_NOT_READY engineering plan using the explicit acceptance criteria I already provided. Do not start a new inspection. Generate the next immutable plan version and report whether it is PLAN_READY.";
  const d = resolveConversationIntent(request, context());
  assert.equal(d.route, "PLANNING"); assert.equal(d.target?.runId, "grounded");
  assert.equal(d.planningInstruction, pending.objective);
  assert.equal(resolveConversationIntent(request, { ...context(), pendingPlanning: [] }).route, "UNAVAILABLE");
  const answer = "For the current engineering plan, use these explicit acceptance criteria:\n1. Preserve the existing structure.\n2. Only the exact target text changes.";
  const section = planningAcceptanceSection(answer)!;
  assert.equal(section, "Acceptance:\n1. Preserve the existing structure.\n2. Only the exact target text changes.");
  assert.equal(resolveConversationIntent(answer, context()).planningInstruction, `${pending.objective}\n\n${section}`);
});

function serviceFixture(change: "none" | "workspace" | "runtime" | "ready" | "execution" | "future" | "constraint" = "none") {
  const service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  const binding = { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" };
  const conversation = { id: "conversation", userId: "user", projectId: "project", metadata: { runtimeWorkspace: { workspaceId: "workspace", bindingVersion: 41 } } };
  const plan = { planId: "plan", planVersion: change === "constraint" ? 4 : 1, digest: "digest", sourceRunId: "grounded", workspace: { ...binding,
    ...(change === "workspace" ? { bindingVersion: 40 } : {}), ...(change === "runtime" ? { runtimeFingerprint: "old" } : {}) } };
  const inspection = { state: "COMPLETED", workspace: binding, evidence: [], understanding: { sequence: 1, status: "GROUNDED", understanding: { readiness: "UNDERSTANDING_READY", facts: [] }, grounding: { complete: true } } };
  const checkpoint = structuredClone(inspection);
  service.runtimeWorkspaces = { getBinding: async () => ({ ...binding, version: 41, userId: "user", projectId: "project", organizationId: "org" }) };
  service.prisma = { conversationMessage: { findUnique: async () => null }, conversation: { findUnique: async () => conversation }, agentRun: { findMany: async () => [{ id: "planning", status: "COMPLETED" }], findUnique: async () => ({ status: "COMPLETED" }) },
    agentPlan: { findUnique: async () => ({ agentRunId: "planning", version: plan.planVersion, summary: pending.objective }) } };
  service.agentRuntimeService = { getRun: async () => ({ inspection, ...(change === "execution" ? { execution: { status: "COMPLETED" } } : {}), presentation: { engineeringPlan: plan,
    planning: { plan: { readiness: change === "ready" ? "PLAN_READY" : "PLAN_NOT_READY", validation: { valid: false } }, readinessDiagnostic: { requirements: [{ id: change === "constraint" ? "constraint-interpretation" : "success-criteria", source: "REQUEST_CONTEXT", status: "UNKNOWN", blocking: true,
      classification: change === "future" ? "FUTURE_EXECUTION_PREREQUISITE" : "REQUIRED_FOR_PLAN" }] } } } }),
    planFromConversation: async (...args: any[]) => { calls.push(args); return { runId: "planning" }; } };
  return { service, calls, conversation, inspection, checkpoint, claims: { sub: "user", role: "Admin", organizationId: "org" } };
}
test("production summary and message route preserve grounded source and dispatch planning only", async () => {
  const h = serviceFixture();
  const summary = await h.service.workflowSummary(h.conversation, h.claims, criteria);
  assert.deepEqual(summary.pendingPlanning, [pending]);
  const result = await h.service.postMessage("conversation", h.claims, { content: criteria, metadata: { clientMessageId: "answer" } });
  assert.equal(result.agentRunId, "planning"); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], ["conversation", h.claims, `${pending.objective}\n\n${criteria}`, "answer", "grounded"]);
  assert.deepEqual(h.inspection, h.checkpoint);
});
test("constraint-only NOT_READY revision remains an explicit continuation target without declaring it READY", async () => {
  const h = serviceFixture("constraint"), request = "Continue the current PLAN_NOT_READY engineering plan using the explicit acceptance criteria already provided.";
  const summary = await h.service.workflowSummary(h.conversation, h.claims, request);
  assert.equal(summary.latestPlan.readiness, "PLAN_NOT_READY");
  assert.deepEqual(summary.pendingPlanning, [{ ...pending, missingInformationIds: ["constraint-interpretation"] }]);
  const decision = resolveConversationIntent(request, summary);
  assert.equal(decision.route, "PLANNING"); assert.equal(decision.planningInstruction, pending.objective);
  assert.equal(decision.target?.runId, "grounded");
  assert.equal(resolveConversationIntent(criteria, summary).route, "UNAVAILABLE"); // Criteria alone cannot resolve another blocker.
  assert.equal(h.calls.length, 0); assert.deepEqual(h.inspection, h.checkpoint);
  const ambiguous = { ...summary, pendingPlanning: [...summary.pendingPlanning, { ...summary.pendingPlanning[0], runId: "other" }] };
  assert.equal(resolveConversationIntent(request, ambiguous).route, "AMBIGUOUS");
});
for (const verb of ["Continue", "Resume", "Please continue"]) test(`${verb} current NOT_READY engineering workflow selects persisted latest planning context, never inspection`, async () => {
  const h = serviceFixture("constraint");
  const request = `${verb} the current PLAN_NOT_READY engineering workflow from its persisted V4 state. Do not start a new inspection.`;
  const summary = await h.service.workflowSummary(h.conversation, h.claims, request);
  const decision = resolveConversationIntent(request, summary);
  assert.equal(decision.route, "PLANNING"); assert.equal(decision.reason, "pending-planning-information");
  assert.equal(decision.planningInstruction, pending.objective); assert.equal(decision.target?.runId, "grounded");
  assert.equal(resolveConversationIntent(request, { ...summary, pendingPlanning: [] }).route, "UNAVAILABLE");
  assert.equal(h.calls.length, 0);
});
for (const change of ["workspace", "runtime", "ready", "execution", "future"] as const) test(`persisted ${change} context cannot become a planning-information target`, async () => {
  const h = serviceFixture(change), summary = await h.service.workflowSummary(h.conversation, h.claims, criteria);
  assert.equal(summary.pendingPlanning, undefined); assert.equal(h.calls.length, 0);
  if (change !== "ready") assert.equal(resolveConversationIntent(criteria, summary).route, "UNAVAILABLE");
});

export const livePlanningRequest = `Continue the current saved PLAN_NOT_READY workflow and resolve its remaining required planning information.

Use the authoritative persisted Version 4 and its existing source checkpoint.

Required change:
index.html
"Building intelligent digital experiences."
→
"Building intelligent digital products."

Constraints:
- Change only the Hero heading text.
- Preserve the existing <h1> structure.
- Preserve the existing <span> wrapping "intelligent".
- Preserve all surrounding structure and whitespace.
- Do not intentionally change any other content.

Acceptance criteria:
1. index.html contains the Hero heading exactly "Building intelligent digital products."
2. The existing <h1> and <span> structure is preserved.
3. No other content is intentionally changed.
4. The result can be verified by reading index.html after execution.

Planning continuation only.
Do not create a proposal.
Do not request approval.
Do not issue an execution permit.
Do not modify any file.`;

export const inlineLivePlanningRequest = livePlanningRequest.replace(
  '"Building intelligent digital experiences."\n→\n"Building intelligent digital products."',
  '"Building intelligent digital experiences." → "Building intelligent digital products."');

test("latest live inline continuation selects the eligible plan and supplies the same bounded information", async () => {
  const h = serviceFixture("constraint"), request = inlineLivePlanningRequest;
  const summary = await h.service.workflowSummary(h.conversation, h.claims, request);
  const information = currentPlanningInformation(request)!;
  assert.deepEqual(information, currentPlanningInformation(livePlanningRequest));
  assert.equal(information.acceptance.length, 4); assert.equal(information.preservation.length, 5);
  const objective = continuationObjective("contaminated saved objective", information);
  const decision = resolveConversationIntent(request, summary);
  assert.equal(decision.route, "PLANNING"); assert.equal(decision.planningInstruction, objective);
  assert.equal(decision.planningContinuationMessage, request);
  await h.service.postMessage("conversation", h.claims, { content: request, metadata: { clientMessageId: "inline-continuation" } });
  assert.deepEqual(h.calls, [["conversation", h.claims, objective, "inline-continuation", "grounded", request]]);
  assert.ok(!objective.includes("Do not create a proposal")); assert.ok(!objective.includes("Do not modify any file"));
  assert.deepEqual(h.inspection, h.checkpoint);
});

test("invalid planning information has a specific notice without dispatching planning or inspection", async () => {
  const h = serviceFixture("constraint"), notices: string[] = [];
  h.service.saveModeNotice = async (_c: unknown, _claims: unknown, _text: unknown, _dto: unknown, content: string) => { notices.push(content); return { content }; };
  const invalid = inlineLivePlanningRequest.replace('"Building intelligent digital products."\n\nConstraints:', '"Building intelligent digital products." → "Another target"\n\nConstraints:');
  assert.equal(resolveConversationIntent(invalid, await h.service.workflowSummary(h.conversation, h.claims, invalid)).reason, "planning-continuation-information-invalid");
  await h.service.postMessage("conversation", h.claims, { content: invalid });
  assert.equal(notices.length, 1); assert.match(notices[0], /supplied planning information is invalid or ambiguous/);
  assert.ok(!notices[0].includes("No eligible saved workflow")); assert.equal(h.calls.length, 0);
});

for (const opening of [
  "Continue the current saved PLAN_NOT_READY workflow",
  "Continue the current PLAN_NOT_READY workflow",
  "Resume the existing PLAN_NOT_READY engineering workflow"
]) test(`full live multiline planning continuation: ${opening}`, async () => {
  const h = serviceFixture("constraint"), request = livePlanningRequest.replace("Continue the current saved PLAN_NOT_READY workflow", opening);
  const summary = await h.service.workflowSummary(h.conversation, h.claims, request);
  assert.deepEqual(summary.latestPlan, { runId: "planning", planId: "plan", readiness: "PLAN_NOT_READY" });
  assert.deepEqual(summary.pendingPlanning, [{ ...pending, missingInformationIds: ["constraint-interpretation"] }]);
  const decision = resolveConversationIntent(request, summary, { triggerAgent: true });
  assert.equal(decision.route, "PLANNING"); assert.equal(decision.reason, "pending-planning-information");
  const supplied = currentPlanningInformation(request)!;
  assert.equal(supplied.change?.relativePath, "index.html");
  assert.equal(supplied.change?.before, "Building intelligent digital experiences.");
  assert.equal(supplied.change?.after, "Building intelligent digital products.");
  assert.equal(supplied.acceptance.length, 4); assert.equal(supplied.preservation.length, 5);
  assert.ok(supplied.preservation.some(item => item.quote.includes("<h1>")));
  assert.ok(supplied.preservation.some(item => item.quote.includes("<span>")));
  const objective = continuationObjective(pending.objective, supplied);
  assert.equal(decision.planningInstruction, objective); assert.equal(decision.planningContinuationMessage, request);
  assert.ok(!objective.includes("Do not create a proposal")); assert.ok(!objective.includes(pending.objective));
  const result = await h.service.postMessage("conversation", h.claims, { content: request, metadata: { clientMessageId: "full-continuation" }, triggerAgent: true });
  assert.equal(result.agentRunId, "planning");
  assert.deepEqual(h.calls, [["conversation", h.claims, objective, "full-continuation", "grounded", request]]);
  assert.deepEqual(h.inspection, h.checkpoint);
  assert.equal(resolveConversationIntent(request, { ...summary, pendingPlanning: [] }, { triggerAgent: true }).route, "UNAVAILABLE");
  for (const change of ["workspace", "runtime", "ready", "execution", "future"] as const) {
    const rejected = serviceFixture(change), unavailable = await rejected.service.workflowSummary(rejected.conversation, rejected.claims, request);
    assert.equal(resolveConversationIntent(request, unavailable, { triggerAgent: true }).route, "UNAVAILABLE");
    assert.equal(rejected.calls.length, 0);
  }
});
