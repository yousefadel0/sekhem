import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInspectionDecision, INSPECTION_TOOLS, INSPECTION_CANONICAL_SCHEMA, INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION } from "../src/agent-runtime/inspection/inspection.contract";
import { chatCompletionBody } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { inspectionValidationDiagnostic, inspectionValidationError } from "../src/agent-runtime/inspection/inspection-understanding";
const binding: any = { rootPath: "C:\\fixture" };
const valid = { decision: "INSPECT", tool: "filesystem.read", relativePath: "package.json", query: "", purpose: "inspect", report: null };
for (const [name, raw, path, category] of [
  ["JSON", "{", "$", "INVALID_JSON"],
  ["shape", "[]", "$", "INVALID_SHAPE"],
  ["enum", JSON.stringify({ ...valid, tool: "PRIVATE" }), "$.tool", "INVALID_ENUM"],
  ["decision enum", JSON.stringify({ ...valid, decision: "PRIVATE" }), "$.decision", "INVALID_ENUM"],
  ["STOP report", JSON.stringify({ ...valid, decision: "STOP", tool: "none", relativePath: "", report: {} }), "$.report", "INVALID_FIELD"],
  ["field", JSON.stringify({ ...valid, purpose: 5 }), "$.purpose", "INVALID_FIELD"],
  ["target", JSON.stringify({ ...valid, relativePath: "../PRIVATE" }), "$.relativePath", "INVALID_TARGET"],
  ["report field", JSON.stringify({ ...valid, report: { facts: [] } }), "$.report.constraintIds", "INVALID_SHAPE"]
]) test(`strict rejection reports ${name} without model values`, () => {
  assert.throws(() => parseInspectionDecision(raw, binding), error => {
    const d = inspectionValidationDiagnostic(error)!;
    assert.ok(d.issues.some(i => i.path === path && (i as any).category === category));
    assert.ok(!JSON.stringify(d).includes("PRIVATE")); return true;
  });
});
for (const [code, detail, expected] of [
  ["UNSUPPORTED_FACT", { evidenceReferenceAdmitted: false, exactSubstringMatch: false }, "INVALID_FACT_REFERENCE"],
  ["UNSUPPORTED_FACT", { evidenceReferenceAdmitted: true, exactSubstringMatch: false }, "NON_VERBATIM_FACT"],
  ["UNKNOWN_EVIDENCE", undefined, "EVIDENCE_REFERENCE_MISMATCH"],
  ["UNSUPPORTED_INFERENCE", { factIdsValid: false }, "INVALID_INFERENCE_REFERENCE"],
  ["CONSTRAINT_UNRESOLVED", undefined, "INVALID_CONSTRAINT"],
  ["FACT_REQUIRED", undefined, "OTHER_CONTRACT_VIOLATION"]
] as const) test(`bounded mapping ${expected} preserves legacy code`, () => {
  const d = inspectionValidationDiagnostic(inspectionValidationError([{ code, path: "$.facts[0]", groundingDiagnostic: detail as any }]))!;
  assert.equal(d.issues[0].code, code); assert.equal((d.issues[0] as any).category, expected);
});
test("valid decision remains accepted", () => assert.equal(parseInspectionDecision(JSON.stringify(valid), binding).decision, "INSPECT"));

function rejected(value: unknown) {
  try { parseInspectionDecision(JSON.stringify(value), binding); assert.fail("invalid decision accepted"); }
  catch (error) { const d = inspectionValidationDiagnostic(error); assert.ok(d); return d; }
}
test("missing top-level key is reported without values", () => {
  const { report: _report, ...missing } = valid;
  const issue = rejected(missing).issues[0];
  assert.equal(issue.code, "INVALID_SHAPE"); assert.equal(issue.path, "$");
  assert.deepEqual(issue.structure!.missingKeys, ["report"]);
  assert.deepEqual(issue.structure!.actualKeys, Object.keys(missing));
  assert.ok(issue.structure!.expectedKeys.includes("report"));
  assert.equal(issue.structure!.expectedType, "object"); assert.equal(issue.structure!.actualType, "object");
});
test("unexpected key is fingerprinted, never persisted as secret text", () => {
  const issue = rejected({ ...valid, PRIVATE_SECRET_KEY: "PRIVATE_VALUE" }).issues[0];
  assert.equal(issue.code, "INVALID_SHAPE");
  assert.equal(issue.structure!.unexpectedKeys.length, 1);
  assert.match(issue.structure!.unexpectedKeys[0], /^unknown:sha256:[a-f0-9]{64}$/);
  assert.ok(issue.structure!.actualKeys.includes(issue.structure!.unexpectedKeys[0]));
  assert.ok(!JSON.stringify(issue).includes("PRIVATE"));
});
test("wrong top-level type identifies exact field and structural types", () => {
  const issue = rejected({ ...valid, purpose: 7 }).issues[0];
  assert.equal(issue.path, "$.purpose");
  assert.equal(issue.structure!.expectedType, "string"); assert.equal(issue.structure!.actualType, "number");
});
test("shape rejection also records wrong-type fields without values", () => {
  const { report: _report, ...missing } = valid;
  const structure = rejected({ ...missing, purpose: true }).issues[0].structure!;
  assert.deepEqual(structure.wrongTypeFields, [{ path: "$.purpose", expectedType: "string", actualType: "boolean" }]);
});
test("nested wrong type retains exact validator path and expected/actual types", () => {
  const issue = rejected({ ...valid, report: { constraintIds: {}, facts: [], inferences: [], hypotheses: [], unknowns: [] } }).issues.find(i => i.path === "$.report.constraintIds")!;
  assert.equal(issue.code, "SCHEMA_ARRAY"); assert.equal(issue.structure!.expectedType, "array"); assert.equal(issue.structure!.actualType, "object");
});
test("nested object keys and required fields are bounded structural data", () => {
  const issue = rejected({ ...valid, report: { constraintIds: [], facts: [{ id: "f", PRIVATE_KEY: "PRIVATE_VALUE" }], inferences: [], hypotheses: [], unknowns: [] } }).issues.find(i => i.code === "ADDITIONAL_PROPERTY")!;
  assert.equal(issue.path, "$.report.facts[0]");
  assert.deepEqual(issue.structure!.missingKeys, ["text", "evidenceRef"]);
  assert.ok(!JSON.stringify(issue).includes("PRIVATE"));
});
test("every key/type list is capped and reports truncation", () => {
  const issue = rejected({ ...valid, ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`secret_${i}`, i])) }).issues[0];
  for (const list of [issue.structure!.expectedKeys, issue.structure!.actualKeys, issue.structure!.missingKeys, issue.structure!.unexpectedKeys, issue.structure!.wrongTypeFields]) assert.ok(list.length <= 32);
  assert.equal(issue.structure!.truncated, true); assert.ok(!JSON.stringify(issue).includes("secret_"));
});
test("fabricated structural diagnostics cannot expose raw fields", () => {
  const diagnostic = inspectionValidationDiagnostic(inspectionValidationError([{ code: "INVALID_SHAPE", path: "$", structure: { actualKeys: ["PRIVATE_SECRET"], raw: "PRIVATE_VALUE" } } as any]));
  assert.equal(diagnostic!.issues[0].structure, undefined);
  assert.ok(!JSON.stringify(diagnostic).includes("PRIVATE"));
});

const canonical = { ...valid, recommendation: null };
for (const field of ["decision", "purpose", "recommendation"] as const) test(`canonical envelope rejects missing ${field}`, () => {
  const value: any = { ...canonical }; delete value[field];
  assert.throws(() => parseInspectionDecision(JSON.stringify(value), binding, true), error => {
    assert.equal((error as Error).message, "INVALID_MODEL_PROPOSAL");
    const issue = inspectionValidationDiagnostic(error)!.issues[0];
    assert.ok(issue.structure!.missingKeys.includes(field)); return true;
  });
});
test("live structural failure class stays rejected; unknown fields are never aliases", () => {
  const invalid = { tool: "filesystem.read", relativePath: "package.json", query: "", report: null,
    fixtureExtra1: null, fixtureExtra2: null, fixtureExtra3: null, fixtureExtra4: null, fixtureExtra5: null };
  assert.throws(() => parseInspectionDecision(JSON.stringify(invalid), binding, true), error => {
    const issue = inspectionValidationDiagnostic(error)!.issues[0];
    assert.equal(issue.code, "INVALID_SHAPE"); assert.deepEqual(issue.structure!.missingKeys, ["decision", "purpose", "recommendation"]);
    assert.equal(issue.structure!.unexpectedKeys.length, 5); return true;
  });
});
test("canonical schema and field instructions agree; valid seven-key shape is unchanged", () => {
  assert.deepEqual(INSPECTION_CANONICAL_SCHEMA.required, Object.keys(canonical));
  assert.equal(INSPECTION_CANONICAL_SCHEMA.additionalProperties, false);
  assert.equal(parseInspectionDecision(JSON.stringify(canonical), binding, true).decision, "INSPECT");
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /decision is required/);
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /purpose is required/);
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /No additional top-level fields/);
  assert.ok(!INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes('"properties"'));
});
test("legacy six-key conversational adapter remains isolated from canonical structured validation", () => {
  assert.equal(parseInspectionDecision(JSON.stringify(valid), binding).decision, "INSPECT");
  assert.throws(() => parseInspectionDecision(JSON.stringify(valid), binding, true));
});

for (const tool of [...INSPECTION_TOOLS, "none"]) test(`canonical tool ${tool} is accepted for its supported decision`, () => {
  const value = tool === "none" ? { ...canonical, decision: "STOP", tool, relativePath: "" }
    : { ...canonical, tool, query: tool === "filesystem.search" ? "version" : "" };
  assert.equal(parseInspectionDecision(JSON.stringify(value), binding, true).decision, tool === "none" ? "STOP" : "INSPECT");
});
for (const tool of ["read_file", "read", "list_directory", "filesystem.write"]) test(`non-canonical tool ${tool} remains rejected`, () => {
  assert.throws(() => parseInspectionDecision(JSON.stringify({ ...canonical, tool }), binding, true), error => {
    assert.partialDeepStrictEqual(inspectionValidationDiagnostic(error)!.issues[0], { code: "INVALID_ENUM", category: "INVALID_ENUM", path: "$.tool" });
    return true;
  });
});
for (const value of [
  { ...canonical, tool: "none" },
  { ...canonical, decision: "STOP", relativePath: "" }
]) test(`decision/tool pairing remains strict: ${value.decision}/${value.tool}`, () => {
  assert.throws(() => parseInspectionDecision(JSON.stringify(value), binding, true), error => {
    assert.equal(inspectionValidationDiagnostic(error)!.issues[0].path, "$.tool"); return true;
  });
});
test("structured schema and instructions use exactly the strict validator tool vocabulary", () => {
  const values = [...INSPECTION_TOOLS, "none"];
  assert.deepEqual(INSPECTION_CANONICAL_SCHEMA.properties.tool.enum, values);
  assert.ok(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes(`The only tool values are ${JSON.stringify(values)}.`));
  assert.ok(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes(`For decision INSPECT, tool must be one of ${JSON.stringify(INSPECTION_TOOLS)}.`));
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /REPORT or STOP, tool must be exactly none/);
});
test("llama.cpp serializer preserves the canonical inspection tool enum without aliases", () => {
  const body = chatCompletionBody({ modelId: "fixture", systemPrompt: INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION,
    userPrompt: "Read package.json.", maxOutputTokens: 32,
    structuredOutput: { dialect: "LLAMACPP_JSON_SCHEMA", name: "inspection_decision", schema: INSPECTION_CANONICAL_SCHEMA } }, 32);
  assert.deepEqual((body.response_format as any).schema.properties.tool.enum, [...INSPECTION_TOOLS, "none"]);
  for (const name of ["read_file", "list_directory", "filesystem.write", "sekhem-action"]) assert.ok(!JSON.stringify(body).includes(name));
});
