import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockAiGatewayProviderAdapter } from "../src/ai-gateway/providers/mock-ai-gateway-provider.adapter";

const previewRequest = {
  requestType: "rag_answer_preview" as const,
  question: "What reviewed readiness evidence is available?",
  citations: [
    {
      citationRef: "knowledge-item:knowledge-001",
      citationLabel: "Approved knowledge source"
    }
  ]
};

describe("MockAiGatewayProviderAdapter deterministic preview", () => {
  it("returns the same deterministic preview for the same request", async () => {
    const adapter = new MockAiGatewayProviderAdapter();

    assert.deepEqual(await adapter.preview(previewRequest), await adapter.preview(previewRequest));
  });

  it("returns a provider-neutral mock response without an AI provider call", async () => {
    const result = await new MockAiGatewayProviderAdapter().preview(previewRequest);

    assert.equal(result.providerType, "mock_provider");
    assert.equal(result.providerCallExecuted, false);
    assert.equal(result.aiGenerated, false);
    assert.equal(result.responseMode, "deterministic_preview");
    assert.notEqual(result.answerPreview, "");
    assert.deepEqual(result.citations, previewRequest.citations);
    assert.deepEqual(result.safetyFlags, {
      noNetworkCall: true,
      noCredentials: true,
      noEnvironmentRead: true,
      noRepositoryWrite: true,
      noDeployment: true,
      noEmbedding: true,
      noVectorDb: true,
      readOnly: true,
      previewOnly: true,
      humanReviewRequired: true
    });
  });

  it("returns cloned citations so callers cannot mutate the request", async () => {
    const result = await new MockAiGatewayProviderAdapter().preview(previewRequest);

    assert.notEqual(result.citations, previewRequest.citations);
    assert.notEqual(result.citations[0], previewRequest.citations[0]);
  });

  it("has no environment, network, repository-write, DB, embedding, or deployment delegates", () => {
    const adapter = new MockAiGatewayProviderAdapter() as unknown as Record<string, unknown>;

    for (const field of [
      "env",
      "config",
      "fetch",
      "axios",
      "httpClient",
      "providerSdk",
      "prismaClient",
      "database",
      "embeddings",
      "vectorStore",
      "repositoryWriter",
      "github",
      "filesystem",
      "deployment"
    ]) {
      assert.equal(field in adapter, false);
    }
  });
});
