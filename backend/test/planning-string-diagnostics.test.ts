import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlanningProposal, interpretContext, notReady } from "../src/agent-runtime/understanding/agent-planning.contract";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { planningReadinessDiagnostic } from "../src/agent-runtime/understanding/planning-readiness-diagnostic";
import { planningOutcome } from "../src/agent-runtime/agent-result";

function proposal(description?: unknown) {
  return { constraintIds: [], facts: [], inferences: [], hypotheses: [], unknowns: [], steps: [{
    id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", dependencyStatus: "KNOWN",
    evidenceRefs: [], missingInformationIds: [], dependencies: [], scopeRefs: [], verificationCriterionIds: [],
    verificationDescription: "Read back the approved change", ...(description === undefined ? {} : { description })
  }] };
}
for (const [name, value, metadata] of [
  ["missing", undefined, { presence: "missing", valueKind: "undefined" }],
  ["non-string", 42, { presence: "present", valueKind: "number" }],
  ["blank", " \t\n", { presence: "present", valueKind: "string", trimmedEmpty: true, characterCount: 3 }],
  ["oversized", "PRIVATE_MODEL_DESCRIPTION".repeat(24), { presence: "present", valueKind: "string", trimmedEmpty: false, characterCount: 600 }]
] as const) test(`engineering string failure metadata: ${name}`, () => {
  const parsed = parsePlanningProposal(JSON.stringify(proposal(value)), true);
  assert.equal(parsed.proposal, undefined);
  assert.deepEqual(parsed.issues, [{ code: "SCHEMA_STRING", path: "$.steps[0].description", stringDiagnostic: metadata }]);
  const context = new AgentUnderstandingService().understand({ userId: "u", projectId: "p", instruction: "Create a plan", availableCapabilities: [] });
  const failed = notReady(interpretContext(context, new Map()), "INVALID_PROPOSAL");
  failed.plan.validation.issues = parsed.issues;
  const diagnostic = planningReadinessDiagnostic(failed, [], [], false);
  assert.deepEqual(diagnostic.validator.issues[0], parsed.issues[0]);
  const saved = JSON.parse(JSON.stringify({ validation: failed.plan.validation, diagnostic }));
  assert.deepEqual(saved.validation.issues[0].stringDiagnostic, metadata);
  assert.ok(!JSON.stringify(saved).includes("PRIVATE_MODEL_DESCRIPTION"));
  assert.ok(!JSON.stringify(saved).includes("Read back the approved change"));
  assert.equal(planningOutcome(failed), "INVALID_STRUCTURED_OUTPUT");
});
test("valid short description passes without failure metadata", () => {
  const parsed = parsePlanningProposal(JSON.stringify(proposal("Change the Hero text")), true);
  assert.deepEqual(parsed.issues, []);
  assert.ok(parsed.proposal);
});
test("legacy planning diagnostics remain unchanged", () => {
  const p = proposal(); delete (p.steps[0] as any).verificationDescription;
  p.steps[0].id = "INVALID";
  assert.deepEqual(parsePlanningProposal(JSON.stringify(p)).issues, [{ code: "SCHEMA_STRING", path: "$.steps[0].id" }]);
});
