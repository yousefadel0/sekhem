import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { RequestTimeoutException } from "@nestjs/common";
import { createContractTestApp } from "./helpers/contract-test-app";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { AiGatewayProviderSettingsService } from "../src/ai-gateway/ai-gateway-provider-settings.service";
import { AiGatewayPolicyService } from "../src/ai-gateway/ai-gateway-policy.service";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import type {
  AiGatewayProviderAdapter,
  AiGatewayProviderPreviewRequest,
  AiGatewayProviderPreviewResponse
} from "../src/ai-gateway/providers/ai-gateway-provider.adapter";
import { MockAiGatewayProviderAdapter } from "../src/ai-gateway/providers/mock-ai-gateway-provider.adapter";
import { AutomationContractService } from "../src/automation-contract.service";
import { contractActivity } from "../src/contract-memory";
import { auditEvents } from "../src/data/seed-data";

const validBody = {
  requestType: "rag_answer_preview",
  question: "What evidence supports this initiative?",
  sourceScope: ["knowledge_base", "repository_evidence"],
  requestedBy: "pm"
};

class CountingMockAiGatewayProviderAdapter extends MockAiGatewayProviderAdapter {
  previewCount = 0;

  override preview(request: AiGatewayProviderPreviewRequest) {
    this.previewCount += 1;
    return super.preview(request);
  }
}

class CountingOpenAiDryRunProviderAdapter implements AiGatewayProviderAdapter {
  previewCount = 0;

  async preview(request: AiGatewayProviderPreviewRequest): Promise<AiGatewayProviderPreviewResponse> {
    this.previewCount += 1;
    return {
      providerType: "openai_dry_run",
      providerCallExecuted: true,
      aiGenerated: true,
      responseMode: "openai_dry_run_preview",
      answerPreview: "Mocked OpenAI text preview.",
      citations: request.citations,
      safetyFlags: {
        noNetworkCall: false,
        noCredentials: false,
        noEnvironmentRead: false,
        noRepositoryWrite: true,
        noDeployment: true,
        noEmbedding: true,
        noVectorDb: true,
        readOnly: true,
        previewOnly: true,
        humanReviewRequired: true
      }
    };
  }
}

const createService = (
  mockProvider = new CountingMockAiGatewayProviderAdapter(),
  openAiProvider = new CountingOpenAiDryRunProviderAdapter(),
  providerMode: "mock" | "openai_dry_run" = "mock",
  policyService = new AiGatewayPolicyService(),
  providerSettingsService = new AiGatewayProviderSettingsService()
) => ({
  mockProvider,
  openAiProvider,
  providerSettingsService,
  service: new AiGatewayService(policyService, mockProvider, openAiProvider, new AutomationContractService(), providerSettingsService, providerMode)
});

describe("AI Gateway preview-only service", () => {
  it("creates a preview request with fixed safety flags", async () => {
    const { mockProvider, service } = createService();
    const result = await service.createPreviewRequest(validBody);

    assert.match(result.gatewayRequestId, /^ai-gateway-preview-/);
    assert.equal(result.status, "GATEWAY_PREVIEW_ONLY");
    assert.equal(result.nextGate, "POLICY_REVIEW_REQUIRED");
    assert.equal(result.requestType, "rag_answer_preview");
    assert.equal(result.policyStatus, "ALLOWED_PREVIEW_ONLY");
    assert.equal(result.blocked, false);
    assert.deepEqual(result.riskFlags, []);
    assert.deepEqual(result.redactionsApplied, []);
    assert.equal(result.providerCallExecuted, false);
    assert.equal(result.aiGenerated, false);
    assert.equal(result.responseMode, "deterministic_preview");
    assert.equal(result.noProviderCall, true);
    assert.equal(result.noAiExecution, true);
    assert.equal(result.humanReviewRequired, true);
    assert.equal(result.citationsRequired, true);
    assert.equal(result.readOnly, true);
    assert.equal(result.previewOnly, true);
    assert.match(result.answerPreview ?? "", /deterministic sample/);
    assert.equal(mockProvider.previewCount, 1);
  });

  it("blocks unsupported request types", async () => {
    const result = await createService().service.createPreviewRequest({
      ...validBody,
      requestType: "execute_ai"
    });

    assert.equal(result.status, "GATEWAY_PREVIEW_BLOCKED");
    assert.equal(result.blocked, true);
    assert.deepEqual(result.riskFlags, ["UNSUPPORTED_REQUEST_TYPE"]);
  });

  it("records the allowed mock preview decision trace through the shared in-memory audit and activity mechanism", async () => {
    const beforeAudit = auditEvents.length;
    const beforeActivity = contractActivity.length;
    const result = await createService().service.createPreviewRequest(validBody);
    const traceActions = auditEvents.slice(beforeAudit).map((event) => event.action);
    const traceActivity = contractActivity.slice(beforeActivity);

    assert.deepEqual(traceActions, [
      "ai_gateway_preview_requested",
      "ai_gateway_policy_allowed",
      "ai_gateway_mock_preview_returned",
      "ai_gateway_human_review_required"
    ]);
    assert.deepEqual(
      traceActivity.map((event) => event.type),
      ["ai_gateway", "ai_gateway", "ai_gateway", "ai_gateway"]
    );
    assert.deepEqual(
      traceActivity.map((event) => event.status),
      ["accepted", "accepted", "placeholder_recorded", "queued"]
    );
    assert.equal(auditEvents.slice(beforeAudit).every((event) => event.target === result.gatewayRequestId), true);
  });

  it("records policy blocked trace and does not return a mock preview", async () => {
    const beforeAudit = auditEvents.length;
    const beforeActivity = contractActivity.length;

    const result = await createService().service.createPreviewRequest({
      ...validBody,
      question: "Please git push this branch."
    });
    assert.equal(result.status, "GATEWAY_PREVIEW_BLOCKED");
    assert.deepEqual(
      auditEvents.slice(beforeAudit).map((event) => event.action),
      ["ai_gateway_preview_requested", "ai_gateway_policy_blocked"]
    );
    assert.deepEqual(
      contractActivity.slice(beforeActivity).map((event) => event.status),
      ["accepted", "blocked"]
    );
  });

  it("blocks secret-like requests and never calls the mock provider", async () => {
    const { mockProvider, service } = createService();
    const result = await service.createPreviewRequest({
      ...validBody,
      nested: {
        secrets: "not-allowed"
      }
    });

    assert.equal(result.status, "GATEWAY_PREVIEW_BLOCKED");
    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("SECRET_LIKE_CONTENT"), true);
    assert.equal(result.redactionsApplied.includes("SECRET_LIKE_CONTENT"), true);
    assert.equal(result.providerCallExecuted, false);
    assert.equal(mockProvider.previewCount, 0);
  });

  it("blocks repository-write requests and never calls the mock provider", async () => {
    const { mockProvider, service } = createService();
    const result = await service.createPreviewRequest({
      ...validBody,
      question: "Please git push this branch."
    });

    assert.equal(result.status, "GATEWAY_PREVIEW_BLOCKED");
    assert.equal(result.blocked, true);
    assert.equal(result.riskFlags.includes("REPOSITORY_WRITE_REQUESTED"), true);
    assert.equal(result.providerCallExecuted, false);
    assert.equal(mockProvider.previewCount, 0);
  });

  it("keeps OpenAI dry-run mode on deterministic mock while provider settings are off", async () => {
    const { mockProvider, openAiProvider, service } = createService(
      new CountingMockAiGatewayProviderAdapter(),
      new CountingOpenAiDryRunProviderAdapter(),
      "openai_dry_run"
    );
    const result = await service.createPreviewRequest(validBody);

    assert.equal(result.providerCallExecuted, false);
    assert.equal(result.aiGenerated, false);
    assert.equal(result.responseMode, "deterministic_preview");
    assert.equal(result.noProviderCall, true);
    assert.equal(result.noAiExecution, true);
    assert.equal(mockProvider.previewCount, 1);
    assert.equal(openAiProvider.previewCount, 0);
  });

  it("never calls the OpenAI dry-run provider for blocked requests", async () => {
    const { openAiProvider, service } = createService(
      new CountingMockAiGatewayProviderAdapter(),
      new CountingOpenAiDryRunProviderAdapter(),
      "openai_dry_run"
    );
    const result = await service.createPreviewRequest({
      ...validBody,
      question: "Please git push this branch."
    });

    assert.equal(result.blocked, true);
    assert.equal(openAiProvider.previewCount, 0);
  });

  it("never calls the OpenAI dry-run provider when policy is not safe for preview", async () => {
    const policyService = {
      reviewRequest: () => ({
        policyStatus: "ALLOWED_PREVIEW_ONLY" as const,
        blocked: false,
        redactionsApplied: [],
        riskFlags: [],
        safeForPreview: false
      })
    } as AiGatewayPolicyService;
    const { openAiProvider, service } = createService(
      new CountingMockAiGatewayProviderAdapter(),
      new CountingOpenAiDryRunProviderAdapter(),
      "openai_dry_run",
      policyService,
      new AiGatewayProviderSettingsService()
    );
    const result = await service.createPreviewRequest(validBody);

    assert.equal(result.blocked, true);
    assert.equal(openAiProvider.previewCount, 0);
  });

  it("has no model, credential, persistence, repository-write, file-apply, or deployment delegates", () => {
    const service = createService().service as unknown as Record<string, unknown>;

    for (const field of [
      "openai",
      "claude",
      "localModel",
      "apiKey",
      "credentials",
      "prismaClient",
      "database",
      "repositoryWriter",
      "fileApply",
      "deployment"
    ]) {
      assert.equal(field in service, false);
    }
  });
});

describe("Sekhem Assistant real provider routing", () => {
  it("uses the active persisted provider and never fabricates evidence", async () => {
    const metadata = { providerCallExecuted: true as const, durationMs: 18, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 9, completionTokens: 11, configuredMaxOutputTokens: 512 };
    const runtime = {
      providers: async () => [{ id: "provider-live", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-live", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000 }),
      models: async () => [{ id: "model-live", modelId: "model-live", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 1024 }]
    };
    const vllm = { chat: async () => ({ content: '{"answer":"Human review remains required."}', metadata }) };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);
    const response = await service.askAssistant({ question: "Summarize the safe review gate." });
    assert.equal(response.status, "REAL_PROVIDER");
    assert.equal(response.providerCallExecuted, true);
    assert.equal(response.answer, "Human review remains required.");
    assert.deepEqual(response.evidence, []);
    assert.match(response.correlationId, /^ai-assistant-/);
  });

  it("returns an explicit unavailable state instead of a canned answer", async () => {
    const runtime = { providers: async () => [] };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, {} as never);
    const response = await service.askAssistant({ question: "Is the provider available?" });
    assert.equal(response.status, "PROVIDER_UNAVAILABLE");
    assert.equal(response.providerCallExecuted, false);
    assert.equal(response.answer, null);
    assert.deepEqual(response.evidence, []);
  });

  it("normal real provider response in askAssistant is not classified as TIMEOUT", async () => {
    const metadata = { providerCallExecuted: true as const, durationMs: 450, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 40, completionTokens: 80, configuredMaxOutputTokens: 512 };
    const runtime = {
      providers: async () => [{ id: "provider-teletech", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-teletech", baseUrl: "https://teltech.tailb1fa44.ts.net/glm52/v1", apiKey: "test-key", defaultTimeoutMs: 120_000 }),
      models: async () => [{ id: "model-glm", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 512 }]
    };
    const vllm = { chat: async () => ({ content: '{"answer":"Real technical memo answer"}', metadata }) };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);
    const response = await service.askAssistant({ question: "Explain SONiC networking architecture." });

    assert.equal(response.status, "REAL_PROVIDER");
    assert.equal(response.httpClassification, "SUCCESS");
    assert.notEqual(response.httpClassification, "TIMEOUT");
    assert.equal(response.providerCallExecuted, true);
    assert.equal(response.answer, "Real technical memo answer");
    assert.equal(response.modelId, "GLM-5.2-Abliterated");
    assert.equal(response.providerId, "provider-teletech");
    assert.equal(response.durationMs, 450);
  });

  it("genuine timeout in askAssistant remains PROVIDER_UNAVAILABLE/TIMEOUT with no fallback and preserved traceability", async () => {
    const error = Object.assign(new RequestTimeoutException("Provider request timed out"), {
      vllmMetadata: {
        providerCallExecuted: true as const,
        durationMs: 120_005,
        httpClassification: "TIMEOUT" as const,
        httpStatus: null,
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens: 512
      }
    });
    const runtime = {
      providers: async () => [{ id: "provider-teletech", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-teletech", baseUrl: "https://teltech.tailb1fa44.ts.net/glm52/v1", apiKey: "test-key", defaultTimeoutMs: 120_000 }),
      models: async () => [{ id: "model-glm", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 512 }]
    };
    const vllm = { chat: async () => { throw error; } };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);
    const response = await service.askAssistant({ question: "Explain what SONiC is in two short paragraphs." });

    assert.equal(response.status, "PROVIDER_UNAVAILABLE");
    assert.equal(response.httpClassification, "TIMEOUT");
    assert.equal(response.providerCallExecuted, true);
    assert.equal(response.answer, null);
    assert.equal(response.providerId, "provider-teletech");
    assert.equal(response.modelId, "GLM-5.2-Abliterated");
    assert.equal(response.durationMs, 120_005);
    assert.deepEqual(response.evidence, []);
  });

  it("applies SEKHEM identity system instructions for name questions without changing the technical model id", async () => {
    const { SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT } = await import("../src/ai-gateway/assistant-answer.contract");
    const captured: Array<{ systemPrompt: string; userPrompt: string; modelId: string; messages?: Array<{ role: string; content: string }> }> = [];
    const metadata = { providerCallExecuted: true as const, durationMs: 20, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 9, completionTokens: 11, configuredMaxOutputTokens: 512 };
    const runtime = {
      providers: async () => [{ id: "provider-teletech", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-teletech", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000 }),
      models: async () => [{ id: "model-glm", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 1024 }]
    };
    const vllm = {
      chat: async (_configuration: unknown, request: { systemPrompt: string; userPrompt: string; modelId: string; messages?: Array<{ role: string; content: string }> }) => {
        captured.push(request);
        return { content: '{"answer":"أنا SEKHEM، مساعد الذكاء الاصطناعي لمنصة Sekhem. إزاي أقدر أساعدك؟"}', metadata };
      }
    };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);

    const arabic = await service.askAssistant({ question: "اسمك ايه؟" });
    const english = await service.askAssistant({ question: "Who are you?" });

    assert.equal(arabic.status, "REAL_PROVIDER");
    assert.match(arabic.answer ?? "", /SEKHEM/i);
    assert.equal(arabic.modelId, "GLM-5.2-Abliterated");
    assert.equal(arabic.providerId, "provider-teletech");
    assert.equal(english.status, "REAL_PROVIDER");
    assert.match(english.answer ?? "", /SEKHEM/i);

    assert.equal(captured.length, 2);
    assert.equal(captured[0]?.userPrompt, "اسمك ايه؟");
    assert.equal(captured[1]?.userPrompt, "Who are you?");
    for (const request of captured) {
      assert.equal(request.systemPrompt, SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT);
      assert.equal(request.modelId, "GLM-5.2-Abliterated");
      assert.match(request.systemPrompt, /You are SEKHEM/);
      assert.match(request.systemPrompt, /اسمك ايه؟/);
      assert.match(request.systemPrompt, /who are you/i);
      assert.ok(request.systemPrompt.length <= 8_000);
    }
  });

  it("does not wrap ordinary technical questions with a model-identity disclosure payload", async () => {
    const { SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT } = await import("../src/ai-gateway/assistant-answer.contract");
    let captured: { systemPrompt: string; userPrompt: string } | undefined;
    const metadata = { providerCallExecuted: true as const, durationMs: 20, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 9, completionTokens: 11, configuredMaxOutputTokens: 512 };
    const runtime = {
      providers: async () => [{ id: "provider-teletech", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-teletech", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000 }),
      models: async () => [{ id: "model-glm", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 1024 }]
    };
    const vllm = {
      chat: async (_configuration: unknown, request: { systemPrompt: string; userPrompt: string }) => {
        captured = request;
        return { content: '{"answer":"SONiC is an open-source network operating system."}', metadata };
      }
    };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);
    const response = await service.askAssistant({ question: "Explain SONiC networking architecture." });

    assert.equal(response.status, "REAL_PROVIDER");
    assert.equal(response.answer, "SONiC is an open-source network operating system.");
    assert.equal(captured?.userPrompt, "Explain SONiC networking architecture.");
    assert.equal(captured?.systemPrompt, SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT);
    assert.match(captured?.systemPrompt ?? "", /Do not volunteer your name, model, or provider on normal technical questions/);
    assert.equal(captured?.userPrompt.includes("GLM"), false);
    assert.equal(captured?.userPrompt.includes("Z.ai"), false);
    assert.equal((response.answer ?? "").includes("GLM"), false);
    assert.equal((response.answer ?? "").includes("Z.ai"), false);
  });

  it("keeps SEKHEM identity as the first system message when conversation history is present", async () => {
    const { SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT } = await import("../src/ai-gateway/assistant-answer.contract");
    let captured: { systemPrompt: string; userPrompt: string; messages?: Array<{ role: string; content: string }> } | undefined;
    const metadata = { providerCallExecuted: true as const, durationMs: 20, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 9, completionTokens: 11, configuredMaxOutputTokens: 512 };
    const runtime = {
      providers: async () => [{ id: "provider-teletech", enabled: true, healthState: "healthy", providerType: "vllm_openai_compatible" }],
      providerForUse: async () => ({ id: "provider-teletech", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000 }),
      models: async () => [{ id: "model-glm", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262_144, maxOutputTokens: 1024 }]
    };
    const vllm = {
      chat: async (_configuration: unknown, request: { systemPrompt: string; userPrompt: string; messages?: Array<{ role: string; content: string }> }) => {
        captured = request;
        return { content: '{"answer":"SONiC uses SAI to talk to switch ASICs."}', metadata };
      }
    };
    const service = new AiGatewayService(new AiGatewayPolicyService(), new MockAiGatewayProviderAdapter(), new CountingOpenAiDryRunProviderAdapter(), new AutomationContractService(), new AiGatewayProviderSettingsService(), "mock", runtime as never, vllm as never);
    const response = await service.askAssistant({
      question: "What is SAI?",
      history: [
        { role: "user", content: "What is SONiC?" },
        { role: "assistant", content: "SONiC is an open-source NOS." }
      ]
    });

    assert.equal(response.status, "REAL_PROVIDER");
    assert.equal(response.answer, "SONiC uses SAI to talk to switch ASICs.");
    assert.equal(captured?.systemPrompt, SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT);
    assert.equal(captured?.userPrompt, "What is SAI?");
    assert.deepEqual(captured?.messages, [
      { role: "system", content: SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT },
      { role: "user", content: "What is SONiC?" },
      { role: "assistant", content: "SONiC is an open-source NOS." },
      { role: "user", content: "What is SAI?" }
    ]);
  });
});

describe("AI Gateway preview-only HTTP contract", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await createContractTestApp();
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => string | { port: number } | null };
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a local port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  it("returns a wrapped preview-only gateway response", async () => {
    const response = await fetch(`${baseUrl}/api/ai-gateway/preview-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(validBody)
    });
    const body = (await response.json()) as {
      data: ReturnType<AiGatewayService["createPreviewRequest"]>;
      meta: { timestamp?: string };
      errors: unknown[];
    };

    assert.equal(response.status, 201);
    assert.match(body.data.gatewayRequestId, /^ai-gateway-preview-/);
    assert.equal(body.data.status, "GATEWAY_PREVIEW_ONLY");
    assert.equal(body.data.nextGate, "POLICY_REVIEW_REQUIRED");
    assert.equal(body.data.policyStatus, "ALLOWED_PREVIEW_ONLY");
    assert.equal(body.data.blocked, false);
    assert.equal(body.data.providerCallExecuted, false);
    assert.equal(body.data.aiGenerated, false);
    assert.equal(body.data.responseMode, "deterministic_preview");
    assert.equal(body.data.noProviderCall, true);
    assert.equal(body.data.noAiExecution, true);
    assert.equal(body.data.humanReviewRequired, true);
    assert.equal(body.data.citationsRequired, true);
    assert.equal(body.data.readOnly, true);
    assert.equal(body.data.previewOnly, true);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, []);
  });

  it("returns fail-closed blocked responses for policy violations", async () => {
    for (const body of [
      { ...validBody, requestType: "execute_ai" },
      { ...validBody, secrets: "not-allowed" },
      { ...validBody, question: "Please git push this branch." }
    ]) {
      const response = await fetch(`${baseUrl}/api/ai-gateway/preview-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const result = (await response.json()) as {
        data: ReturnType<AiGatewayService["createPreviewRequest"]>;
        errors: unknown[];
      };

      assert.equal(response.status, 201);
      assert.equal(result.data.status, "GATEWAY_PREVIEW_BLOCKED");
      assert.equal(result.data.blocked, true);
      assert.equal(result.data.providerCallExecuted, false);
      assert.equal(result.data.aiGenerated, false);
      assert.deepEqual(result.errors, []);
    }
  });

  it("returns normalized errors for structurally invalid safe requests", async () => {
    const response = await fetch(`${baseUrl}/api/ai-gateway/preview-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...validBody,
        sourceScope: []
      })
    });
    const result = (await response.json()) as { data: unknown; errors: unknown[] };

    assert.equal(response.status >= 400, true);
    assert.equal(result.data, null);
    assert.equal(result.errors.length > 0, true);
  });
});
