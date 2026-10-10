import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RD_RADAR_OUTPUT_GENERATION_REQUIREMENTS,
  RD_RADAR_OUTPUT_SCHEMA,
  validateRdRadarOutputSchema
} from "../src/ai-gateway/rd-radar-output.schema";

function valid() {
  return { schemaVersion: "rd-radar-analysis.v1", summary: "Safe summary", findings: [{
    title: "Finding", category: "risk", severity: "medium", confidence: 0.8, citations: ["src/a.ts#L1-L2"],
    businessImpact: "Impact", technicalRisk: "Risk", recommendation: "Review", uncertainty: "Unknown",
    requiredAdditionalEvidence: ["PM review"], candidateDraftRecommendation: "Draft only"
  }] };
}

describe("canonical R&D Radar output schema", () => {
  it("emits the bounded llama.cpp-supported semantic constraints", () => {
    const serialized = JSON.stringify(RD_RADAR_OUTPUT_SCHEMA);
    for (const forbidden of ["$ref", "pattern", "format", "oneOf", "anyOf", "maxLength", "minimum", "maximum"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    const root = RD_RADAR_OUTPUT_SCHEMA as {
      properties: {
        summary: Record<string, unknown>;
        findings: { minItems: number; maxItems: number; items: { properties: Record<string, Record<string, unknown>> } };
      };
    };
    const finding = root.properties.findings.items.properties;
    assert.deepEqual(root.properties.summary, { type: "string", minLength: 1 });
    assert.equal(root.properties.findings.minItems, 1);
    assert.equal(root.properties.findings.maxItems, 5);
    assert.equal(finding.title?.minLength, 1);
    assert.equal(finding.citations?.minItems, 1);
    assert.equal(finding.citations?.maxItems, 20);
    assert.equal(finding.requiredAdditionalEvidence?.minItems, 0);
    assert.equal(finding.requiredAdditionalEvidence?.maxItems, 25);
    assert.deepEqual(finding.confidence, { type: "number" });
  });

  it("keeps the provider subset and canonical validator contract-aligned", () => {
    assert.deepEqual(validateRdRadarOutputSchema(valid()), []);
    const missing = valid();
    delete (missing.findings[0] as Partial<typeof missing.findings[0]>).recommendation;
    assert.deepEqual(validateRdRadarOutputSchema(missing), [
      { path: "$.findings[0].recommendation", code: "REQUIRED", expectedType: "string" }
    ]);
    const extra = { ...valid(), rawResponse: "must never be accepted" };
    assert.deepEqual(validateRdRadarOutputSchema(extra), [
      { path: "$.rawResponse", code: "ADDITIONAL_PROPERTY", expectedType: "no additional property" }
    ]);
    assert.equal(JSON.stringify(validateRdRadarOutputSchema(extra)).includes("must never be accepted"), false);
  });

  it("derives the exact lowercase severity requirement from the canonical enum", () => {
    const severity = (RD_RADAR_OUTPUT_SCHEMA as {
      properties: { findings: { items: { properties: { severity: { enum: string[] } } } } };
    }).properties.findings.items.properties.severity;
    const allowed = ["info", "low", "medium", "high", "critical"];
    assert.deepEqual(severity.enum, allowed);
    assert.match(
      RD_RADAR_OUTPUT_GENERATION_REQUIREMENTS,
      /Severity must be exactly one lowercase value: info, low, medium, high, critical\./
    );
    assert.doesNotMatch(RD_RADAR_OUTPUT_GENERATION_REQUIREMENTS, /moderate|severe|fallback|raw output/i);

    for (const unsupported of ["moderate", "severe"]) {
      const invalid = valid();
      invalid.findings[0]!.severity = unsupported as never;
      const issues = validateRdRadarOutputSchema(invalid);
      assert.deepEqual(issues, [
        { path: "$.findings[0].severity", code: "ENUM", expectedType: "canonical enum value" }
      ]);
      assert.equal(JSON.stringify(issues).includes(unsupported), false);
    }
  });

  it("reports safe enum, type, nullability, and semantic constraint paths", () => {
    const wrong = valid();
    wrong.findings[0]!.severity = "unexpected" as never;
    wrong.findings[0]!.confidence = 2;
    wrong.findings[0]!.citations = [];
    wrong.findings[0]!.uncertainty = null as never;
    assert.deepEqual(validateRdRadarOutputSchema(wrong), [
      { path: "$.findings[0].severity", code: "ENUM", expectedType: "canonical enum value" },
      { path: "$.findings[0].confidence", code: "RANGE", expectedType: "number from 0 to 1" },
      { path: "$.findings[0].citations", code: "MIN_ITEMS", expectedType: "array with at least 1 item(s)" },
      { path: "$.findings[0].uncertainty", code: "TYPE", expectedType: "string" }
    ]);
  });

  it("requires findings and citations while preserving intentionally empty evidence arrays", () => {
    const minimal = valid();
    minimal.findings[0]!.requiredAdditionalEvidence = [];
    assert.deepEqual(validateRdRadarOutputSchema(minimal), []);
    minimal.findings = [];
    assert.deepEqual(validateRdRadarOutputSchema(minimal), [
      { path: "$.findings", code: "MIN_ITEMS", expectedType: "array with at least 1 item(s)" }
    ]);
  });
});
