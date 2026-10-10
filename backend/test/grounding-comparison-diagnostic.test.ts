import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { factComparison, inferenceSupport } from "../src/agent-runtime/inspection/grounding-comparison-diagnostic";
import { inspectionValidationDiagnostic, inspectionValidationError } from "../src/agent-runtime/inspection/inspection-understanding";
import type { AgentUnderstandingProposal } from "../src/agent-runtime/understanding/agent-planning.contract";

for (const [name, source, fact, classification] of [
  ["line endings", "a\r\nb", "a\nb", "LINE_ENDINGS_ONLY"],
  ["whitespace", "a  b", "a b", "WHITESPACE_ONLY"],
  ["Unicode", "caf\u00e9", "cafe\u0301", "UNICODE_NORMALIZATION_ONLY"],
  ["HTML entity", "a &amp; b", "a & b", "HTML_ENTITY_DECODING_ONLY"],
  ["paraphrase", "The page contains a heading", "There is a title", "NON_VERBATIM"],
  ["combined fragments", "first\nseparator\nlast", "firstlast", "NON_VERBATIM"]
] as const) test(`rejected ${name} is classified without retaining strings`, () => {
  assert.equal(source.includes(fact), false);
  const result = factComparison(fact, source, true);
  assert.equal(result.classification, classification);
  assert.equal(result.factLength, fact.length);
  assert.equal(result.sourceLength, source.length);
  assert.match(result.factFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(result.factFingerprint, result.sourceFingerprint);
  assert.deepEqual(result, factComparison(fact, source, true));
  assert.ok(!Object.values(result).includes(source));
  assert.ok(!Object.values(result).includes(fact));
});

test("unadmitted reference and unavailable evidence are distinguished", () => {
  assert.equal(factComparison("private fact", undefined, false).classification, "REFERENCE_NOT_ADMITTED");
  const d = factComparison("private fact", undefined, true);
  assert.equal(d.classification, "EVIDENCE_UNAVAILABLE");
  assert.equal(d.sourceLength, null); assert.equal(d.sourceFingerprint, null);
});

test("support counts distinguish accepted, rejected, nonexistent and empty without IDs", () => {
  const proposal: AgentUnderstandingProposal = { facts: [{ id: "accepted-private", text: "x", evidenceRef: "r" },
    { id: "rejected-private", text: "y", evidenceRef: "r" }], constraintIds: [], inferences: [], hypotheses: [], unknowns: [] };
  const accepted = new Set(["accepted-private"]);
  const d = inferenceSupport(["accepted-private", "rejected-private", "missing-private"], proposal, accepted);
  assert.deepEqual(d, { accepted: 1, rejected: 1, nonexistent: 1, empty: false });
  assert.deepEqual(inferenceSupport([], proposal, accepted), { accepted: 0, rejected: 0, nonexistent: 0, empty: true });
  assert.ok(!JSON.stringify(d).includes("private"));
});

test("persisted projection whitelists comparison and support fields, stripping raw additions", () => {
  const comparison = { ...factComparison("private-fact", "private-source", true), raw: "secret" };
  const error = inspectionValidationError([
    { code: "UNSUPPORTED_FACT", path: "$.facts[0]", groundingDiagnostic: { evidenceReferenceAdmitted: true, exactSubstringMatch: false, comparison } },
    { code: "UNSUPPORTED_INFERENCE", path: "$.inferences[0]", groundingDiagnostic: { factIdsValid: false,
      support: { accepted: 1, rejected: 1, nonexistent: 0, empty: false, raw: "secret" } } as any }
  ]);
  const json = JSON.stringify(inspectionValidationDiagnostic(error));
  for (const raw of ["private-fact", "private-source", "secret", "raw"]) assert.ok(!json.includes(raw));
  assert.match(json, /NON_VERBATIM/); assert.match(json, /fingerprint/i);
});
