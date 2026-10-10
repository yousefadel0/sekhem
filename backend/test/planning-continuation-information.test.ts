import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { livePlanningRequest, inlineLivePlanningRequest } from "./planning-information-continuation.test";
import { currentPlanningInformation, continuationObjective } from "../src/conversation/planning-continuation-information";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { generateConversationPlan } from "../src/agent-runtime/understanding/persisted-planning";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";

const source = '<section class="hero"><h1>Building <span>intelligent</span> digital experiences.</h1></section>';
for (const [format, request] of [["separate lines", livePlanningRequest], ["inline", inlineLivePlanningRequest]]) test(`current ${format} continuation reaches the deterministic Hero contract and model with signed source, and persists user provenance`, async () => {
  const h = await inspectionHarness(), run = await h.db.agentRun.create({ data: { ...h.run, id: "hero-source" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, "Read and analyze the Hero heading in index.html."));
  h.responses.push(h.inspectStructured("filesystem.read", "index.html")); await h.service.advance(run.id);
  const state = () => h.ledger.transaction(async tx => (await h.ledger.read<any>(tx, "AGENT_INSPECTION", run.id))!.payload);
  const pending = await state();
  await h.service.approve(run.id, h.claims, { planVersion: pending.current.planVersion, fingerprint: pending.current.fingerprint, decision: "APPROVED" });
  await h.complete((await h.request("poll")).execution, source); await h.service.advance(run.id);
  const read = await state(), context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: run.projectId, conversationId: run.conversationId, agentRunId: run.id, instruction: "Read and analyze the Hero heading in index.html.", runtimeEvidence: read.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible);
  const base = interpretContext(context, visible);
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: {
    constraintIds: base.constraints.map(c => c.id), facts: [{ id: "heading", text: source, evidenceRef: base.evidenceRefs[0] }], inferences: [], hypotheses: [], unknowns: [] } }));
  await h.service.advance(run.id); assert.equal((await state()).understanding.status, "GROUNDED");
  const information = currentPlanningInformation(request)!, objective = continuationObjective("Create the exact proposal for the contaminated saved plan.", information);
  const calls: any[] = [], gateway = { requestStructuredReasoning: async (input: any) => {
    calls.push(input);
    const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
    assert.equal(data.objective, objective); assert.ok(!data.constraints.some((c: any) => c.rule === "UNRESOLVED"));
    assert.ok(!JSON.stringify(data.constraints).includes("Do not request approval"));
    assert.ok(data.successCriteria.find((c: any) => c.id === "requested-outcome").description.includes("4. The result can be verified"));
    const refs = data.evidenceRefs, scopes = data.heroAllowedScopes[0].scopeRefs;
    const step = { evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [], verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Change only the Hero heading text.", verificationDescription: "Read back and compare the heading and all preserved bytes." };
    return JSON.stringify({ constraintIds: data.requiredConstraintIds, facts: [{ id: "heading", text: '<h1>Building <span>intelligent</span> digital experiences.</h1>', evidenceRef: refs[0] }], inferences: [], hypotheses: [], unknowns: [],
      steps: [{ ...step, id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", dependencies: [], effect: "WRITE" }, { ...step, id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", dependencies: ["change"], effect: "READ_ONLY" }] });
  } };
  const dependencies = { inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway };
  const before = structuredClone(await state());
  const result = await generateConversationPlan(dependencies, h.claims, "conversation-a", objective, "current-information", run.id, request);
  assert.equal(result.status, "PLAN_READY"); assert.equal(calls.length, 1);
  const plan = h.tables.agentPlan.get(result.planId), provenance = plan.steps[0].parameters.planningContinuation;
  assert.deepEqual(provenance.information, information); assert.equal(provenance.userId, h.claims.sub);
  assert.equal(provenance.messageDigest, toolDigest(request));
  assert.equal(h.tables.conversationMessage.get(provenance.messageId).content, request);
  assert.ok(calls[0].question.includes('"currentContinuation"')); assert.deepEqual(await state(), before);
  assert.deepEqual(await generateConversationPlan(dependencies, h.claims, "conversation-a", objective, "current-information", run.id, request), result);
  assert.equal(calls.length, 1); assert.equal((await h.request("poll")).execution, null);
});

test("inline quotes preserve exact Unicode and internal whitespace without normalization", () => {
  const request = inlineLivePlanningRequest.replace('"Building intelligent digital experiences." → "Building intelligent digital products."', '"  OLD e\u0301  &amp;  " → "  NEW é  &amp;  "');
  const information = currentPlanningInformation(request)!;
  assert.equal(information.change?.before, "  OLD e\u0301  &amp;  ");
  assert.equal(information.change?.after, "  NEW é  &amp;  ");
});

for (const replacement of ['"OLD" →', '→ "NEW"', '"OLD" → "NEW"\n"OTHER" → "SECOND"', '"OLD" → "NEW" → "THIRD"']) test(`inline missing or ambiguous change rejected: ${replacement}`, () => {
  assert.throws(() => currentPlanningInformation(inlineLivePlanningRequest.replace('"Building intelligent digital experiences." → "Building intelligent digital products."', replacement)), /PLANNING_CONTINUATION_INFORMATION_INVALID/);
});

for (const [label, change] of [
  ["duplicate acceptance", (s: string) => s + "\nAcceptance criteria:\n1. Something else."],
  ["unsupported preservation", (s: string) => s.replace("- Preserve the existing <h1> structure.", "- Preserve all network permissions.")],
  ["multiple target files", (s: string) => s.replace("Required change:\nindex.html", "Required change:\nindex.html\nother.html")],
  ["missing target", (s: string) => s.replace('"Building intelligent digital products."\n\nConstraints:', 'Constraints:')]
] as const) test(`${label} fails closed rather than reverting to contaminated history`, () => {
  assert.throws(() => currentPlanningInformation(change(livePlanningRequest)), /PLANNING_CONTINUATION_INFORMATION_INVALID/);
});

test("success criteria header is supported; absent current information retains historical fallback", () => {
  assert.deepEqual(currentPlanningInformation(livePlanningRequest.replace("Acceptance criteria:", "Success criteria:")), currentPlanningInformation(livePlanningRequest));
  assert.equal(currentPlanningInformation("Continue the current saved PLAN_NOT_READY workflow using the criteria already provided."), null);
});
