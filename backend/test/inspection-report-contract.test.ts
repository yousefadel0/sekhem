import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_UNDERSTANDING_SCHEMA, parseUnderstandingProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { INSPECTION_CANONICAL_SCHEMA, INSPECTION_REPORT_INSTRUCTION, INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";
import { inspectionValidationDiagnostic } from "../src/agent-runtime/inspection/inspection-understanding";
import { chatCompletionBody } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { inspectionHarness } from "./helpers/inspection-loop-harness";

const binding: any = { rootPath: "C:\\fixture" };
const report = { constraintIds: [], facts: [{ id: "version", text: '"version": "0.1.0"', evidenceRef: "fixture-evidence" }],
  inferences: [{ id: "inference", text: "Fixture inference", factIds: ["version"], uncertainty: "Source-only inference" }],
  hypotheses: [], unknowns: [] };
const envelope = (value: unknown) => ({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report observed source", report: value, recommendation: null });
for (const [name, text, reason] of [["empty", "", "BLANK"], ["whitespace", " \t\n", "BLANK"], ["513 characters", "x".repeat(513), "MAX_LENGTH"]] as const) test(`report string predicate persists: ${name}`, async () => {
  const value = { ...report, facts: [report.facts[0], report.facts[0], report.facts[0], { ...report.facts[0], text }] };
  assert.throws(() => parseInspectionDecision(JSON.stringify(envelope(value)), binding, true), error => {
    const issue = inspectionValidationDiagnostic(error)!.issues[0];
    assert.equal(issue.path, "$.report.facts[3].text"); assert.equal(issue.code, "SCHEMA_STRING");
    assert.deepEqual(issue.stringPredicate, { reason, characterCount: text.length, countTruncated: false, maxLength: 512 });
    if (text.length > 512) assert.ok(!JSON.stringify(issue).includes(text));
    return true;
  });
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  });
  h.responses.push(JSON.stringify(envelope(value))); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED");
  assert.equal((await h.state()).understanding, undefined);
  const events = [...h.tables.agentRunEvent.values()];
  assert.ok(!events.some(e => e.eventType === "UNDERSTANDING_CHECKPOINT"));
  const saved = events.find(e => e.eventType === "INSPECTION_FAILURE_DIAGNOSTIC")!.payload.validation.issues[0];
  assert.equal(saved.path, "$.report.facts[3].text"); assert.equal(saved.stringPredicate.reason, reason);
});
test("512-character report fact remains accepted by the unchanged schema", () => {
  const value = { ...report, facts: [{ ...report.facts[0], text: "x".repeat(512) }] };
  const result = parseInspectionDecision(JSON.stringify(envelope(value)), binding, true);
  assert.equal(result.decision, "REPORT");
  if (result.decision === "REPORT") assert.deepEqual(result.understanding, value);
});
test("evidence-limited prose is presentation-only and remains durably paused", async () => {
  const h = await inspectionHarness();
  h.responses.push("المعروف من القراءة السابقة فقط هو اسم الحزمة ونسختها؛ غرض المشروع غير معروف من هذين الحقلين. لن أقرأ ملفات إضافية.");
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "AWAITING_INPUT");
  assert.equal(h.tables.agentRun.get(h.run.id).status, "PAUSED");
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.modelConversation)!;
  assert.equal(message.metadata.answerPresentation, "EVIDENCE_LIMITED");
  assert.equal(message.metadata.grounding, undefined);
  assert.equal((await h.state()).operations.length, 0);
  assert.ok(![...h.tables.agentRunEvent.values()].some(e => e.agentRunId === h.run.id &&
    (e.eventType === "UNDERSTANDING_CHECKPOINT" && e.payload.status === "GROUNDED" || ["EXECUTION_PERMIT_CREATED", "EXECUTION_DISPATCHED"].includes(e.eventType))));
});
test("prose promising a read remains operational diagnostics, not a substantive answer", async () => {
  const h = await inspectionHarness(); h.responses.push("I will read the next source.");
  await h.service.advance(h.run.id);
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.modelConversation)!;
  assert.equal(message.metadata.answerPresentation, undefined);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal((await h.state()).operations.length, 0);
});

test("invalid recommendation retains bounded inspection diagnostics after a valid report", () => {
  assert.throws(() => parseInspectionDecision(JSON.stringify({ ...envelope(report), recommendation: {
    title: "PRIVATE_MODEL_VALUE", objective: "PRIVATE_MODEL_VALUE", changeKind: "INVALID", preservation: "UNSPECIFIED"
  } }), binding, true), error => {
    const diagnostic = inspectionValidationDiagnostic(error)!;
    assert.equal(diagnostic.code, "INVALID_MODEL_PROPOSAL");
    assert.equal(diagnostic.issues[0].path, "$.recommendation.changeKind");
    assert.equal(diagnostic.issues[0].code, "INVALID_FIELD");
    assert.ok(!JSON.stringify(diagnostic).includes("PRIVATE_MODEL_VALUE"));
    return true;
  });
});

test("valid recommendation remains accepted without changing its fields", () => {
  const recommendation = { title: "Review", objective: "Review source-supported improvements", changeKind: "REDESIGN", preservation: "UNSPECIFIED" };
  const result = parseInspectionDecision(JSON.stringify({ ...envelope(report), recommendation }), binding, true);
  assert.equal(result.decision, "REPORT");
  if (result.decision === "REPORT") assert.deepEqual(result.recommendation, recommendation);
});

for (const [name, recommendation, expectedPath] of [
  ["invalid recommendation", { title: "Review", objective: "Review", changeKind: "INVALID", preservation: "UNSPECIFIED" }, "$.recommendation.changeKind"],
  ["invented preservation", { title: "Review", objective: "Review", changeKind: "REDESIGN", preservation: "SPECIFIED" }, "$.recommendation.preservation"]
] as const) test(`service persists ${name} rejection rather than generic failure`, async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  });
  h.responses.push(JSON.stringify({ ...envelope(report), recommendation }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "FAILED");
  assert.equal(state.code, "INVALID_MODEL_PROPOSAL");
  assert.equal(state.operations.length, 0);
  const events = [...h.tables.agentRunEvent.values()];
  const diagnostic = events.find((event: any) => event.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.ok(diagnostic);
  assert.equal(diagnostic.payload.validation.issues[0].path, expectedPath);
  await h.service.advance(h.run.id);
  assert.equal(h.calls.length, 1);
  assert.equal((await h.state()).state, "FAILED");
});

test("canonical nested report passes unchanged", () => {
  assert.deepEqual(parseUnderstandingProposal(JSON.stringify(report)).proposal, report);
  const result = parseInspectionDecision(JSON.stringify(envelope(report)), binding, true);
  assert.equal(result.decision, "REPORT");
  if (result.decision === "REPORT") assert.deepEqual(result.understanding, report);
});

test("unknown generation guidance uses canonical required fields without changing acceptance", () => {
  const unknown = { id: "unread", description: "Unread modules", whyNeeded: "Further source review is needed for module-specific advice", severity: "LOW", evidenceCategory: "OPTIONAL_CONTEXT" };
  const value = { ...report, unknowns: [unknown] };
  assert.equal(parseInspectionDecision(JSON.stringify(envelope(value)), binding, true).decision, "REPORT");
  assert.match(INSPECTION_REPORT_INSTRUCTION, /second and subsequent items/);
  assert.match(INSPECTION_REPORT_INSTRUCTION, /whyNeeded is a required non-empty string/);
  for (const invalid of [{ ...unknown, whyNeeded: undefined }, { ...unknown, reason: "Not an accepted alias" }]) {
    assert.throws(() => parseInspectionDecision(JSON.stringify(envelope({ ...report, unknowns: [unknown, invalid] })), binding, true), error => {
      assert.ok(inspectionValidationDiagnostic(error)?.issues.some(i => i.path.startsWith("$.report.unknowns[1]"))); return true;
    });
  }
});

for (const [name, mutate, path, code] of [
  ["missing hypotheses", (r: any) => { delete r.hypotheses; }, "$.report.hypotheses", "SCHEMA_ARRAY"],
  ["missing inference factIds", (r: any) => { delete r.inferences[0].factIds; }, "$.report.inferences[0].factIds", "SCHEMA_ARRAY"],
  ["missing inference uncertainty", (r: any) => { delete r.inferences[0].uncertainty; }, "$.report.inferences[0].uncertainty", "SCHEMA_STRING"],
  ["facts map", (r: any) => { r.facts = { version: "0.1.0" }; }, "$.report.facts", "SCHEMA_ARRAY"],
  ["facts strings", (r: any) => { r.facts = ["version 0.1.0"]; }, "$.report.facts[0]", "SCHEMA_OBJECT"],
  ["over-bound facts array", (r: any) => { r.facts = Array.from({ length: AGENT_UNDERSTANDING_SCHEMA.properties!.facts.maxItems! + 1 }, () => report.facts[0]); }, "$.report.facts", "SCHEMA_ARRAY"],
  ["unexpected report property", (r: any) => { r.fixtureExtra = []; }, "$.report", "ADDITIONAL_PROPERTY"],
  ["unexpected inference property", (r: any) => { r.inferences[0].fixtureExtra = []; }, "$.report.inferences[0]", "ADDITIONAL_PROPERTY"]
] as const) test(`strict report rejection: ${name}`, () => {
  const value = structuredClone(report); mutate(value);
  assert.equal(parseUnderstandingProposal(JSON.stringify(value)).proposal, undefined);
  assert.throws(() => parseInspectionDecision(JSON.stringify(envelope(value)), binding, true), error => {
    assert.ok(inspectionValidationDiagnostic(error)!.issues.some(i => i.path === path && i.code === code)); return true;
  });
});

test("model transport and validator share the canonical nested schema without aliases or defaults", () => {
  const body: any = chatCompletionBody({ modelId: "fixture", systemPrompt: INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION,
    userPrompt: "Report the supplied fixture", maxOutputTokens: 512, contextWindow: 32768,
    structuredOutput: { dialect: "LLAMACPP_JSON_SCHEMA", schema: INSPECTION_CANONICAL_SCHEMA as any, name: "inspection_decision" } }, 512);
  assert.strictEqual(body.response_format.schema.properties.report.anyOf[0], AGENT_UNDERSTANDING_SCHEMA);
  assert.deepEqual(AGENT_UNDERSTANDING_SCHEMA.required, ["constraintIds", "facts", "inferences", "hypotheses", "unknowns"]);
  for (const [field, schema] of Object.entries(AGENT_UNDERSTANDING_SCHEMA.properties!)) {
    assert.ok(INSPECTION_REPORT_INSTRUCTION.includes(`report.${field} is a required array, maximum ${schema.maxItems} items`));
    if (schema.items!.properties) {
      assert.equal(schema.items!.additionalProperties, false);
      for (const [key, child] of Object.entries(schema.items!.properties!)) {
        assert.ok(INSPECTION_REPORT_INSTRUCTION.includes(`${key}: ${child.type}`));
        assert.ok(INSPECTION_REPORT_INSTRUCTION.includes(`${schema.items!.required!.includes(key) ? "(required)" : "(optional)"}`));
      }
    }
  }
  assert.ok(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes(INSPECTION_REPORT_INSTRUCTION));
  assert.match(INSPECTION_REPORT_INSTRUCTION, /Include hypotheses: \[\] and inferences: \[\]/);
  assert.ok(!INSPECTION_REPORT_INSTRUCTION.includes('"properties"'));
});

test("structured service sends the derived nested instructions, including on correction", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json.", correctiveAttempts: 1 }, "active");
  });
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id);
  const request = h.calls.at(-1);
  assert.equal(request.structured, true);
  assert.ok(request.systemInstruction.includes(INSPECTION_REPORT_INSTRUCTION));
  assert.deepEqual(request.schema.properties.report.anyOf[0], AGENT_UNDERSTANDING_SCHEMA);
  assert.ok(!request.systemInstruction.includes('"steps"'));
});
