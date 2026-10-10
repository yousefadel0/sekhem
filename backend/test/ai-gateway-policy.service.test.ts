import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiGatewayPolicyService } from "../src/ai-gateway/ai-gateway-policy.service";

const safeRequest = {
  requestId: "ai-request-temp-001",
  requestType: "rag_answer_preview",
  userQuestion: "What reviewed readiness evidence is available?",
  approvedSourceRefs: ["knowledge-item:knowledge-001"],
  retrievalMode: "approved_sources_only",
  providerRoutingPolicy: "mock_only",
  responseMode: "draft_with_citations",
  humanReviewRequired: true
};

describe("AiGatewayPolicyService preview-only policy and redaction layer", () => {
  it("allows a safe preview request", () => {
    const result = new AiGatewayPolicyService().reviewRequest(safeRequest);

    assert.deepEqual(result, {
      policyStatus: "ALLOWED_PREVIEW_ONLY",
      blocked: false,
      redactionsApplied: [],
      riskFlags: [],
      safeForPreview: true
    });
  });

  it("blocks and redacts secret-like content", () => {
    const blockedValue = "password=blocked-sentinel-value";
    const service = new AiGatewayPolicyService();
    const result = service.reviewRequest({ ...safeRequest, userQuestion: blockedValue });

    assert.equal(result.blocked, true);
    assert.equal(result.safeForPreview, false);
    assert.equal(result.riskFlags.includes("SECRET_LIKE_CONTENT"), true);
    assert.equal(result.redactionsApplied.includes("SECRET_LIKE_CONTENT"), true);
    assert.equal(JSON.stringify(result).includes(blockedValue), false);

    for (const unsafeInput of [
      { token: "blocked-sentinel-value" },
      { authorization: { scheme: "blocked-sentinel-value" } },
      { filePath: ".env.local" },
      { privateKey: 1234 },
      { userQuestion: "Inspect .env file secrets" }
    ]) {
      assert.equal(service.reviewRequest({ ...safeRequest, ...unsafeInput }).blocked, true);
    }
  });

  it("blocks repository write requests", () => {
    const result = new AiGatewayPolicyService().reviewRequest({ ...safeRequest, userQuestion: "Please git push this branch." });

    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("REPOSITORY_WRITE_REQUESTED"), true);
    assert.equal(result.riskFlags.includes("HIGH_RISK_ACTION"), true);
  });

  it("blocks deployment requests", () => {
    const result = new AiGatewayPolicyService().reviewRequest({ ...safeRequest, userQuestion: "Run kubectl apply for this service." });

    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("DEPLOYMENT_REQUESTED"), true);
    assert.equal(result.riskFlags.includes("HIGH_RISK_ACTION"), true);
  });

  it("blocks raw logs", () => {
    const result = new AiGatewayPolicyService().reviewRequest({ ...safeRequest, rawLogs: "service startup details" });

    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("RAW_LOG_CONTENT"), true);
    assert.equal(result.riskFlags.includes("HIGH_RISK_ACTION"), true);
  });

  it("blocks stack traces", () => {
    const result = new AiGatewayPolicyService().reviewRequest({
      ...safeRequest,
      userQuestion: "Error: unavailable\n    at startServer (src/main.ts:12:3)"
    });

    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("RAW_LOG_CONTENT"), true);
    assert.equal(result.riskFlags.includes("HIGH_RISK_ACTION"), true);
  });

  it("blocks unsupported request types", () => {
    const result = new AiGatewayPolicyService().reviewRequest({ ...safeRequest, requestType: "provider_execute" });

    assert.deepEqual(result, {
      policyStatus: "BLOCKED",
      blocked: true,
      redactionsApplied: [],
      riskFlags: ["UNSUPPORTED_REQUEST_TYPE"],
      safeForPreview: false
    });
  });

  it("never leaks blocked values from nested fields", () => {
    const blockedValue = "-----BEGIN PRIVATE KEY----- never-return-this-value";
    const result = new AiGatewayPolicyService().reviewRequest({
      ...safeRequest,
      nested: {
        authorization: blockedValue
      }
    });

    assert.equal(result.blocked, true);
    assert.equal(JSON.stringify(result).includes(blockedValue), false);
    assert.deepEqual((result.sanitizedInput as { nested: { authorization: string } }).nested.authorization, "[redacted]");
  });

  it("blocks internal IPs, file apply commands, and autonomous execution requests", () => {
    for (const userQuestion of ["Inspect 192.168.10.20", "Run apply_patch now", "Execute automatically without human review"]) {
      const result = new AiGatewayPolicyService().reviewRequest({ ...safeRequest, userQuestion });

      assert.equal(result.blocked, true);
      assert.equal(result.riskFlags.includes("HIGH_RISK_ACTION"), true);
      assert.equal(JSON.stringify(result).includes(userQuestion), false);
    }
  });

  it("has no provider, persistence, vector-store, deployment, or repository-write delegates", () => {
    const service = new AiGatewayPolicyService() as unknown as Record<string, unknown>;

    for (const field of ["aiProvider", "providerAdapter", "prismaClient", "database", "embeddings", "vectorStore", "deployment", "repositoryWriter", "github"]) {
      assert.equal(field in service, false);
    }
  });
});
