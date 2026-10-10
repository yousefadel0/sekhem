import { chatCompletionBody } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecommendation, recommendationRejection, RECOMMENDATION_SCHEMA, RECOMMENDATION_STRATEGIES } from "../src/conversation/recommendation.contract";
import { INSPECTION_CANONICAL_SCHEMA, INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";
import { inspectionValidationDiagnostic, inspectionValidationError } from "../src/agent-runtime/inspection/inspection-understanding";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
const valid = { title: "PRIVATE_TITLE", objective: "PRIVATE_OBJECTIVE", strategy: "CONTENT", changeKind: "TEXT", preservation: "UNSPECIFIED" };
const report = { constraintIds: [], facts: [], inferences: [], hypotheses: [], unknowns: [] };
const envelope = (recommendation: unknown) => JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report, recommendation });
test("valid recommendation and seven-field report remain accepted", () => {
  assert.deepEqual(parseRecommendation(valid), valid);
  assert.equal(parseInspectionDecision(envelope(valid), {} as any, true).decision, "REPORT");
  assert.match(RECOMMENDATION_SCHEMA.properties.title.description, /non-whitespace/);
});
for (const [field, value, reason] of [
  ["title", 1, "TEXT_TYPE"], ["title", "  ", "TEXT_BLANK"], ["title", "x".repeat(129), "TEXT_TOO_LONG"],
  ["objective", null, "TEXT_TYPE"], ["objective", "\n", "TEXT_BLANK"], ["objective", "x".repeat(1025), "TEXT_TOO_LONG"],
  ["strategy", "PRIVATE_ENUM", "ENUM_INVALID"], ["changeKind", "PRIVATE_ENUM", "ENUM_INVALID"], ["preservation", "PRIVATE_ENUM", "ENUM_INVALID"]
] as const) test(`bounded ${field} ${reason}`, () => {
  assert.throws(() => parseInspectionDecision(envelope({ ...valid, [field]: value }), {} as any, true), error => {
    const d = inspectionValidationDiagnostic(error)!;
    assert.equal(d.issues[0].path, `$.recommendation.${field}`); assert.equal(d.issues[0].recommendationReason, reason);
    assert.ok(!JSON.stringify(d).includes("PRIVATE")); return true;
  });
});
for (const [value, reason] of [[null, "OBJECT_REQUIRED"], [{ ...valid, extra: true }, "KEYS_INVALID"], [{ title: "x" }, "KEYS_INVALID"]] as const)
  test(`direct recommendation rejects ${reason}`, () => { assert.throws(() => parseRecommendation(value), e => { assert.equal(recommendationRejection(e)?.reason, reason); return true; }); });
test("forged diagnostic reasons are discarded", () => {
  const d = inspectionValidationDiagnostic(inspectionValidationError([{ code: "INVALID_FIELD", path: "$.recommendation", recommendationReason: "PRIVATE" as any }]))!;
  assert.ok(!JSON.stringify(d).includes("PRIVATE"));
});
test("invalid recommendation persists failure without checkpoint or redispatch", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  }); h.responses.push(envelope({ ...valid, strategy: "PRIVATE" }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED"); assert.ok(!(await h.state()).understanding);
  assert.equal((await h.state()).operations.length, 0);
  const e = [...h.tables.agentRunEvent.values()] as any[];
  assert.equal(e.filter(x => x.eventType === "UNDERSTANDING_CHECKPOINT").length, 0);
  const d = e.find(x => x.eventType === "INSPECTION_FAILURE_DIAGNOSTIC").payload;
  assert.equal(d.validation.issues[0].recommendationReason, "ENUM_INVALID");
  await h.newService().advance(h.run.id); assert.equal(h.calls.length, 1);
});

for (const supported of [true, false]) test(`recommendation report ${supported ? "persists grounded checkpoint" : "cannot bypass unsupported evidence"} and replay is inert`, async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  });
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, '{"version":"0.1.0"}');
  await h.service.advance(h.run.id);
  h.responses.push(input => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    const source = state.sourceCitations[0];
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report observed evidence",
      report: { constraintIds: state.planningContract.constraints.map((c: any) => c.id),
        facts: [{ id: "version", text: supported ? source.excerpt : "PRIVATE_UNSUPPORTED_FACT", evidenceRef: source.evidenceRef }],
        inferences: [], hypotheses: [], unknowns: [] }, recommendation: valid });
  });
  await h.service.advance(h.run.id);
  const state = await h.state();
  const messages = [...h.tables.conversationMessage.values()] as any[];
  const persisted = messages.filter(m => m.metadata?.recommendation);
  assert.equal(state.operations.length, 1); assert.equal(state.operations[0].verification, "VERIFIED");
  if (supported) {
    assert.equal(state.state, "COMPLETED"); assert.equal(state.understanding?.status, "GROUNDED");
    assert.equal(state.understanding?.understanding.readiness, "UNDERSTANDING_READY");
    assert.equal(persisted.length, 1); assert.equal(persisted[0].metadata.recommendation.sourceRunId, h.run.id);
    assert.equal(persisted[0].metadata.recommendation.sourceSequence, state.understanding?.sequence);
    assert.equal(persisted[0].metadata.recommendation.objective, valid.objective);
    assert.equal((h.tables.agentRun.get(h.run.id) as any).status, "COMPLETED");
    const checkpoints = [...h.tables.agentRunEvent.values()].filter((e: any) => e.eventType === "UNDERSTANDING_CHECKPOINT") as any[];
    assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].payload.status, "GROUNDED");
  } else {
    assert.notEqual(state.state, "COMPLETED"); assert.notEqual(state.understanding?.status, "GROUNDED");
    assert.equal(persisted.length, 0);
  }
  const calls = h.calls.length;
  await h.newService().advance(h.run.id);
  assert.equal(h.calls.length, calls); assert.equal((await h.state()).operations.length, 1);
});

// The prompt, transport schema and strict parser share one canonical vocabulary.
for (const strategy of RECOMMENDATION_STRATEGIES) test(`canonical strategy ${strategy} accepted unchanged`, () => {
  const recommendation = { ...valid, strategy };
  assert.deepEqual(parseRecommendation(recommendation), recommendation);
  const decision = parseInspectionDecision(envelope(recommendation), {} as any, true);
  assert.equal(decision.decision, "REPORT");
  if (decision.decision === "REPORT") assert.deepEqual(decision.recommendation, recommendation);
});
for (const strategy of ["content", "ARCHITECTURE", "CONTENT,SECURITY", " CONTENT", "", null, 1]) test(`unsupported strategy fixture ${JSON.stringify(strategy)} rejects without coercion`, () => {
  assert.throws(() => parseInspectionDecision(envelope({ ...valid, strategy }), {} as any, true), error => {
    const issue = inspectionValidationDiagnostic(error)!.issues[0];
    assert.equal(issue.path, "$.recommendation.strategy"); assert.equal(issue.code, "INVALID_FIELD");
    assert.equal(issue.recommendationReason, "ENUM_INVALID"); return true;
  });
});
test("strategy enum is identical in canonical schema, model guidance and actual transport body", () => {
  const schema = INSPECTION_CANONICAL_SCHEMA.properties.recommendation.anyOf[0];
  assert.deepEqual(schema.properties.strategy.enum, RECOMMENDATION_STRATEGIES);
  assert.ok(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes("case-sensitive string from " + JSON.stringify(RECOMMENDATION_STRATEGIES)));
  const body = chatCompletionBody({ modelId: "fixture", messages: [{ role: "user", content: "fixture" }], structuredOutput: { dialect: "LLAMACPP_JSON_SCHEMA", name: "inspection_decision", schema: INSPECTION_CANONICAL_SCHEMA } } as any, 32) as any;
  assert.deepEqual(body.response_format.schema.properties.recommendation.anyOf[0].properties.strategy.enum, RECOMMENDATION_STRATEGIES);
  const { strategy, ...withoutStrategy } = valid;
  assert.deepEqual(parseRecommendation(withoutStrategy), withoutStrategy);
});
