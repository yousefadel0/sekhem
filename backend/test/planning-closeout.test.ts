import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Logger, RequestTimeoutException } from "@nestjs/common";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { AGENT_ENGINEERING_PLAN_SCHEMA, interpretContext, parsePlanningProposal, validatePlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";

function fixture() {
  const service = new AgentUnderstandingService();
  const context = service.understand({ userId: "user", projectId: "project", instruction: "Plan a defensive review. Acceptance: describe safe offline handling.", workspaceAvailable: true, availableCapabilities: ["workspace_reader"] });
  context.evidence = [{ sourceType: "workspace", sourceId: "source", relativePath: "source.ts", provenance: "runtime:receipt", status: "COLLECTED", metadata: {}, warnings: [], content: { text: "export const mode = 'offline';", extractorId: "text", detectedMime: "text/plain", truncated: false } }];
  const visible = new Map<string, string>(), prompt = new AgentContextSerializerService().forReasoning(context, visible);
  const base = interpretContext(context, visible), ref = base.evidenceRefs[0];
  const proposal = {
    constraintIds: base.constraints.map(c => c.id), facts: [{ id: "fact", text: "export const mode = 'offline';", evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [], steps: [{
      id: "review", type: "ANALYZE", purpose: "UNDERSTAND", description: "Review the observed offline mode.", verificationDescription: "The review cites the observed mode without running code.",
      evidenceRefs: [ref], scopeRefs: [base.scope.find(s => s.evidenceRefs.includes(ref))!.id], dependencies: [], missingInformationIds: [], verificationCriterionIds: ["grounding"], effect: "READ_ONLY", dependencyStatus: "KNOWN"
    }]
  };
  return { service, context, visible, prompt, proposal, base };
}

test("concrete planning declares its deadline and exact excerpt/scope rules with an explicit engineering-only information classification", async () => {
  const f = fixture(); let input: any;
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async i => { input = i; return JSON.stringify(f.proposal); } }, true);
  assert.equal(input.purpose, "ENGINEERING_PLANNING");
  assert.match(input.systemInstruction, /one contiguous literal excerpt/);
  assert.match(input.systemInstruction, /factIds must reference supported facts you emit in this response/);
  assert.match(input.systemInstruction, /project scope does not implicitly include any evidence/);
  assert.match(input.systemInstruction, /A step missingInformationIds reference always makes the record REQUIRED_FOR_PLAN/);
  assert.match(input.systemInstruction, /Do not relabel genuine blockers, delete unknowns, or mark them resolved/);
  const legacy = structuredClone(input.schema);
  delete legacy.properties.unknowns.items.properties.classification;
  legacy.properties.unknowns.items.required = legacy.properties.unknowns.items.required.filter((key: string) => key !== "classification");
  assert.equal(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"), "3d7d4d9cabc11cae8d0ef555ef2e53c73d32d23723d4461833829f191a7db8a4");
  assert.equal(result?.plan.readiness, "PLAN_READY"); assert.equal(result?.plan.authorization, "NOT_GRANTED");
});

function futureWriteFixture() {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = ["fresh_preimage_before_write", "human_approval_for_write", "execution_permit", "post_write_readback_authorization"].map(id => ({
    id, description: `Future gate: ${id}.`, whyNeeded: "Revalidate at the execution stage; not yet satisfied.", severity: "HIGH", classification: "FUTURE_EXECUTION_PREREQUISITE"
  }));
  const step = candidate.steps[0];
  candidate.steps = [
    { ...step, id: "implement", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", verificationCriterionIds: ["requested-outcome"],
      description: "Describe the future bounded change after preimage, human approval and permit gates pass.", verificationDescription: "The approved change must match the requested outcome." },
    { ...step, id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", dependencies: ["implement"], verificationCriterionIds: ["requested-outcome"],
      description: "Describe future authorized read-back after the write.", verificationDescription: "Read-back verifies the requested outcome." }
  ];
  return { ...f, candidate };
}

test("planning instruction separates current construction blockers from unsatisfied future execution gates", async () => {
  const f = futureWriteFixture();
  await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async input => {
    assert.match(input.systemInstruction!, /missingInformationIds MUST mean information required to CONSTRUCT THE CURRENT PLAN/);
    assert.match(input.systemInstruction!, /Future execution prerequisites must NOT be placed in missingInformationIds, including on future IMPLEMENT\/VERIFY steps/);
    assert.match(input.systemInstruction!, /Keep fresh_preimage_before_write, human_approval_for_write, permits, and post_write_readback_authorization as FUTURE_EXECUTION_PREREQUISITE/);
    assert.match(input.systemInstruction!, /unsatisfied UNKNOWN future gates, non-blocking for planning even when future IMPLEMENT\/VERIFY steps are present/);
    assert.match(input.systemInstruction!, /They must be revalidated at their execution stage/);
    assert.doesNotMatch(input.systemInstruction!, /planned or executed without/);
    return JSON.stringify(f.candidate);
  } }, true);
});

test("future IMPLEMENT and VERIFY plan reaches PLAN_READY while execution gates remain UNKNOWN and not granted", async () => {
  const f = futureWriteFixture(); let calls = 0;
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => { calls++; return JSON.stringify(f.candidate); } }, true);
  assert.equal(calls, 1);
  assert.equal(result?.plan.validation.valid, true);
  assert.equal(result?.plan.readiness, "PLAN_READY");
  assert.equal(result?.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(result?.plan.authorization, "NOT_GRANTED");
  assert.deepEqual(result?.plan.steps.map(s => s.type), ["IMPLEMENT", "VERIFY"]);
  assert.equal(result?.planningInformation?.length, 4);
  assert.ok(result?.planningInformation?.every(i => i.state === "UNKNOWN" && i.classification === "FUTURE_EXECUTION_PREREQUISITE" && !i.blocking));
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, []);
  assert.ok(result?.readinessDiagnostic?.requirements.every(i => i.status === "UNKNOWN" && !i.blocking && i.resolvedByExistingEvidence === false));
});

test("a genuine current planning blocker still needs clarification alongside future execution gates", async () => {
  const f = futureWriteFixture();
  f.candidate.unknowns.push({ id: "current_target", description: "The requested change has two possible targets.", whyNeeded: "Choose the target before constructing the change step.", severity: "HIGH", classification: "REQUIRED_FOR_PLAN" });
  f.candidate.steps[0].missingInformationIds = ["current_target"];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(f.candidate) }, true);
  assert.equal(result?.plan.validation.valid, true);
  assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
  assert.equal(result?.understanding.readiness, "NEEDS_CLARIFICATION");
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, ["current_target"]);
  assert.equal(result?.planningInformation?.filter(i => i.state === "UNKNOWN" && !i.blocking).length, 4);
  assert.equal(result?.plan.authorization, "NOT_GRANTED");
});

for (const severity of ["LOW", "MEDIUM", "HIGH"]) test(`TEST D: open ${severity} requirement stays blocking, including when no step refers to it`, async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [{ id: "missing-target", description: "Identify which observed module the requested change targets.", whyNeeded: "The request has two incompatible possible targets.", severity, classification: "REQUIRED_FOR_PLAN" }];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.validation.valid, true); assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
  assert.deepEqual(result?.readinessDiagnostic?.requirements, [{ ...candidate.unknowns[0], status: "UNKNOWN", source: "MODEL", affectedStepIds: [], blocking: true, resolvedByExistingEvidence: false }]);
  assert.equal(result?.readinessDiagnostic?.groundingStatus, "VERIFIED_SOURCE_EXCERPTS");
});

test("optional uncertainty uses existing hypotheses without resolving unknown facts or granting authority", async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.hypotheses = [{ id: "history-not-established", text: "Prior execution history is outside this static documentation review.", uncertainty: "No execution history has been inspected; no prior execution is asserted.", evidenceRefs: [candidate.facts[0].evidenceRef] }];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY"); assert.deepEqual(result?.plan.missingInformation, []);
  assert.equal(result?.understanding.facts.length, 1); assert.equal(result?.understanding.hypotheses.length, 1);
  assert.equal(result?.plan.assumptions[0].status, "UNVERIFIED"); assert.equal(result?.plan.authorization, "NOT_GRANTED");
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, []);
  candidate.steps[0].missingInformationIds = ["history-not-established"];
  const invalid = validatePlanningProposal(f.base, candidate, f.visible, true);
  assert.equal(invalid.plan.readiness, "PLAN_NOT_READY"); assert.ok(invalid.plan.validation.issues.some(i => i.code === "UNKNOWN_INFORMATION"));
});

test("offline plan retains unread out-of-scope content and future authority as UNKNOWN without blocking", async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [
    { id: "unknown-recon2-content", description: "recon2.py was listed but not read.", whyNeeded: "Outside this review of already-read sources; no content claim is made.", severity: "MEDIUM", classification: "LIMITATION" },
    { id: "unknown-authorization-status", description: "Future external contact has no documented authorization.", whyNeeded: "The current offline plan prohibits external contact.", severity: "HIGH", classification: "FUTURE_EXECUTION_PREREQUISITE" }];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY"); assert.equal(result?.plan.validation.valid, true);
  assert.deepEqual(result?.plan.missingInformation, []); assert.equal(result?.plan.authorization, "NOT_GRANTED");
  assert.deepEqual(result?.understanding.facts.map(x => x.text), [candidate.facts[0].text]);
  assert.deepEqual(result?.planningInformation?.map(x => ({ id: x.id, state: x.state, classification: x.classification, blocking: x.blocking })), candidate.unknowns.map((x: any) => ({ id: x.id, state: "UNKNOWN", classification: x.classification, blocking: false })));
  assert.equal(result?.readinessDiagnostic?.groundingStatus, "VERIFIED_SOURCE_EXCERPTS");
  assert.equal(result?.readinessDiagnostic?.requirements.length, 2);
  assert.ok(result?.readinessDiagnostic?.requirements.every(x => x.status === "UNKNOWN" && !x.blocking && x.resolvedByExistingEvidence === false));
});

test("TEST A: a LIMITATION mentioned by a step does NOT automatically become REQUIRED_FOR_PLAN", async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [
    { id: "unknown-recon2-content", description: "recon2.py was listed but not read.", whyNeeded: "Outside this review of already-read sources; no content claim is made.", severity: "MEDIUM", classification: "LIMITATION" }
  ];
  // Step mentions the limitation in prose (description and verificationDescription) without listing it in missingInformationIds
  candidate.steps[0].description = "Review the observed offline mode, documenting the unread recon2.py limitation (unknown-recon2-content) in descriptive context.";
  candidate.steps[0].verificationDescription = "The review cites the observed mode, explicitly noting unknown-recon2-content was not read.";
  candidate.steps[0].missingInformationIds = [];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY");
  assert.equal(result?.plan.validation.valid, true);
  assert.equal(result?.planningInformation?.[0].classification, "LIMITATION");
  assert.equal(result?.planningInformation?.[0].declaredClassification, "LIMITATION");
  assert.equal(result?.planningInformation?.[0].blocking, false);
  assert.equal(result?.planningInformation?.[0].state, "UNKNOWN");
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, []);
  assert.deepEqual(result?.readinessDiagnostic?.requirements[0].affectedStepIds, []);
});

test("TEST C: a FUTURE_EXECUTION_PREREQUISITE does NOT block an offline plan when the current plan does not require the future action", async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [
    { id: "unknown-authorization-status", description: "Future external contact has no documented authorization.", whyNeeded: "The current offline plan prohibits external contact.", severity: "HIGH", classification: "FUTURE_EXECUTION_PREREQUISITE" }
  ];
  // Offline plan explicitly prohibits external contact; step does not require future action
  candidate.steps[0].effect = "READ_ONLY";
  candidate.steps[0].missingInformationIds = [];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY");
  assert.equal(result?.plan.validation.valid, true);
  assert.equal(result?.planningInformation?.[0].classification, "FUTURE_EXECUTION_PREREQUISITE");
  assert.equal(result?.planningInformation?.[0].declaredClassification, "FUTURE_EXECUTION_PREREQUISITE");
  assert.equal(result?.planningInformation?.[0].blocking, false);
  assert.equal(result?.planningInformation?.[0].state, "UNKNOWN");
  assert.equal(result?.plan.authorization, "NOT_GRANTED");
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, []);
  assert.deepEqual(result?.readinessDiagnostic?.requirements[0].affectedStepIds, []);
});

for (const classification of ["LIMITATION", "FUTURE_EXECUTION_PREREQUISITE"]) test(`TEST B: a genuine step prerequisite DOES become REQUIRED_FOR_PLAN and blocks readiness (${classification})`, async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [{ id: "required-source", description: "The requested step requires an unread source.", whyNeeded: "Its contents determine the specified change.", severity: "LOW", classification }];
  candidate.steps[0].missingInformationIds = ["required-source"];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_NOT_READY"); assert.equal(result?.plan.validation.valid, true);
  assert.equal(result?.planningInformation?.[0].classification, "REQUIRED_FOR_PLAN");
  assert.equal(result?.planningInformation?.[0].declaredClassification, classification);
  assert.deepEqual(result?.readinessDiagnostic?.blockingRequirementIds, ["required-source"]);
  assert.deepEqual(result?.readinessDiagnostic?.requirements[0].affectedStepIds, ["review"]);
});

test("classification never hides duplicate IDs, unsupported claims, excessive records or schema errors", async () => {
  for (const defect of ["duplicate", "cross-group", "unsupported", "bounds", "missing-category", "invalid-category", "extra-field"]) {
    const f = fixture(), candidate: any = structuredClone(f.proposal);
    const note = { id: "optional", description: "Unread sources remain unknown.", whyNeeded: "Outside the requested scope.", severity: "HIGH", classification: "LIMITATION" };
    candidate.unknowns = [note];
    if (defect === "duplicate") candidate.unknowns.push({ ...note });
    if (defect === "cross-group") note.id = candidate.facts[0].id;
    if (defect === "unsupported") candidate.facts[0].text = "Unsupported source claim";
    if (defect === "bounds") candidate.unknowns = Array.from({ length: 7 }, (_, i) => ({ ...note, id: `optional-${i}` }));
    if (defect === "missing-category") delete candidate.unknowns[0].classification;
    if (defect === "invalid-category") candidate.unknowns[0].classification = "RESOLVED";
    if (defect === "extra-field") candidate.unknowns[0].resolved = true;
    const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
    assert.equal(result?.plan.readiness, "PLAN_NOT_READY", defect); assert.equal(result?.plan.validation.valid, false, defect);
    assert.equal(result?.plan.authorization, "NOT_GRANTED");
  }
});

test("readiness diagnostics identify affected steps and do not resolve requirements by matching evidence prose", async () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.unknowns = [{ id: "mode-gap", description: candidate.facts[0].text, whyNeeded: "A model claim of a requirement is not a resolution certificate.", severity: "HIGH", classification: "REQUIRED_FOR_PLAN" }];
  candidate.steps[0].missingInformationIds = ["mode-gap"];
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
  assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
  assert.deepEqual(result?.readinessDiagnostic?.requirements[0].affectedStepIds, ["review"]);
  assert.equal(result?.readinessDiagnostic?.requirements[0].resolvedByExistingEvidence, false);
});

test("pre-model context gaps and invalid output are observable without a raw request or response", async () => {
  const f = fixture(); f.context.projectId = undefined; f.context.workspaceContext.required = true;
  const blocked = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => assert.fail("context gap must block") }, true);
  assert.equal(blocked?.readinessDiagnostic?.requirements[0].source, "REQUEST_CONTEXT");
  assert.equal(blocked?.readinessDiagnostic?.groundingStatus, "NOT_EVALUATED");
  f.context.projectId = "project";
  const failed = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => "private invalid response" }, true);
  assert.equal(failed?.readinessDiagnostic?.requirements[0].source, "PLANNING_VALIDATION");
  assert.equal(failed?.readinessDiagnostic?.validator.valid, false);
  assert.doesNotMatch(JSON.stringify(failed?.readinessDiagnostic), /private invalid response/);
});

test("diagnostic fields are bounded and redact credential-like values without weakening the underlying blocker", async () => {
  for (const sensitive of ["password=do-not-record", "Bearer private-credential", "https://user:secret@example.invalid/path", "-----BEGIN PRIVATE KEY-----", "token: hidden-value", "eyJhbGci.eyJwYXlsb2Fk.signature", "sk-test-secret", "operator@example.invalid"]) {
    const f = fixture(), candidate: any = structuredClone(f.proposal);
    candidate.unknowns = [{ id: "secret-gap", description: sensitive, whyNeeded: "Specify the safe prerequisite without copying values.", severity: "HIGH", classification: "REQUIRED_FOR_PLAN" }];
    const result = await f.service.createPlan(f.context, f.prompt, f.visible, { requestStructuredReasoning: async () => JSON.stringify(candidate) }, true);
    assert.equal(result?.readinessDiagnostic?.requirements[0].description, "[redacted]");
    assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
    assert.ok(JSON.stringify(result?.readinessDiagnostic).length < 3000);
  }
});

test("unsupported excerpts, dependent inferences and project-only scope remain rejected", () => {
  const f = fixture(), candidate: any = structuredClone(f.proposal);
  candidate.facts[0].text = "The mode is offline.";
  candidate.inferences = [{ id: "interpretation", text: "The file defines an offline mode.", factIds: ["fact"], uncertainty: "Only this source is inspected." }];
  candidate.steps[0].scopeRefs = ["project"];
  const parsed = parsePlanningProposal(JSON.stringify(candidate), true); assert.ok(parsed.proposal);
  const result = validatePlanningProposal(f.base, parsed.proposal, f.visible, true);
  assert.deepEqual(result.plan.validation.issues.map(i => i.code), ["UNSUPPORTED_FACT", "UNSUPPORTED_INFERENCE", "FACT_REQUIRED", "EVIDENCE_OUTSIDE_SCOPE"]);
  assert.equal(result.plan.readiness, "PLAN_NOT_READY");
  assert.equal(result.plan.authorization, "NOT_GRANTED");
});

test("internal planning and structured inspection get 300 seconds; other requests retain provider settings", async t => {
  t.mock.method(Logger.prototype, "log", () => { });
  const calls: any[] = [];
  const provider = Object.freeze({ id: "provider", providerType: "vllm_openai_compatible", baseUrl: "https://provider.invalid/v1", apiKey: null, defaultTimeoutMs: 120000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" });
  const model = Object.freeze({ modelId: "GLM-5.2-Abliterated", contextWindow: 262144, maxOutputTokens: 8192 });
  const adapter: any = { complete: async (configuration: any, request: any) => { calls.push({ configuration, request }); return { content: '{"answer":"hello"}', metadata: { httpStatus: 200, finishReason: "stop" } }; } };
  const gateway = new AiGatewayService({} as any, {} as any, {} as any, {} as any, {} as any, "mock", {} as any);
  gateway.resolveProviderAndModel = async () => ({ provider, model, adapter }) as any;
  const input = { question: "Plan", systemInstruction: "Describe proposed work.", schema: AGENT_ENGINEERING_PLAN_SCHEMA as any, name: "plan" };
  await gateway.requestStructuredReasoning({ ...input, purpose: "ENGINEERING_PLANNING" });
  await gateway.requestStructuredReasoning({ ...input, purpose: "STRUCTURED_INSPECTION" });
  await gateway.requestStructuredReasoning(input);
  await gateway.requestAgentConversation({ question: "Inspect", systemInstruction: "Read-only observations." });
  await gateway.askAssistant({ question: "hello", purpose: "ENGINEERING_PLANNING", timeoutMs: 999999 });
  assert.deepEqual(calls.map(c => c.configuration.timeoutMs), [300000, 300000, 120000, 120000, 120000]);
  assert.equal(provider.defaultTimeoutMs, 120000);
  for (const c of calls) { assert.equal(c.request.maxOutputTokens, 8192); assert.equal(c.request.contextWindow, 262144); assert.equal(c.request.timeoutMs, undefined); assert.equal(c.request.purpose, undefined); }
  gateway.resolveProviderAndModel = async () => ({ provider: { ...provider, defaultTimeoutMs: 360000 }, model, adapter }) as any;
  await gateway.requestStructuredReasoning({ ...input, purpose: "STRUCTURED_INSPECTION" });
  assert.equal(calls.at(-1).configuration.timeoutMs, 360000);
});

test("planning deadline failure is recorded once, never retried or converted into a plan", async t => {
  t.mock.method(Logger.prototype, "log", () => { });
  const f = fixture(); let calls = 0;
  const gateway = new AiGatewayService({} as any, {} as any, {} as any, {} as any, {} as any, "mock");
  gateway.resolveProviderAndModel = async () => ({
    provider: { id: "provider", providerType: "vllm_openai_compatible", baseUrl: "https://provider.invalid/v1", apiKey: null, defaultTimeoutMs: 120000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" }, model: { modelId: "model", contextWindow: 262144, maxOutputTokens: 8192 }, adapter: {
      complete: async (configuration: any) => {
        calls++; assert.equal(configuration.timeoutMs, 300000);
        throw Object.assign(new RequestTimeoutException("Provider request timed out"), { vllmMetadata: { httpStatus: null, httpClassification: "TIMEOUT", failureStage: "REQUEST", failureCode: "CLIENT_DEADLINE", durationMs: 300000 } });
      }
    }
  }) as any;
  const result = await f.service.createPlan(f.context, f.prompt, f.visible, gateway, true);
  assert.equal(calls, 1); assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
  assert.equal(result?.plan.validation.issues[0].code, "PROVIDER_FAILED");
  assert.equal(f.context.providerDiagnostics?.[0].failureCode, "CLIENT_DEADLINE");
});
