import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Logger } from "@nestjs/common";
import { AssistantContextBudgetError, estimateContextTokens, modelContextBudget, prepareAssistantContext } from "../src/ai-gateway/assistant-context-budget";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { ProviderAdapterRegistry } from "../src/ai-gateway/provider-adapter.registry";
import { VllmOpenAiCompatibleAdapter } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { INSPECTION_DECISION_SCHEMA } from "../src/agent-runtime/inspection/inspection.contract";
import { RD_RADAR_OUTPUT_SCHEMA } from "../src/ai-gateway/rd-radar-output.schema";

const connection = { baseUrl: "https://provider.invalid/glm52/v1", apiKey: null, timeoutMs: 1000 };
function harness(maxOutputTokens: number, contextWindow = 262_144, finishReason = "stop") {
  const calls: any[] = [];
  const provider = Object.freeze({ ...connection, defaultTimeoutMs: connection.timeoutMs, id: "provider", providerType: "vllm_openai_compatible", structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" });
  const model = Object.freeze({ id: "model", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow, maxOutputTokens, supportedTasks: ["repository_analysis"] });
  const adapter = new VllmOpenAiCompatibleAdapter(async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    const content = '{"answer":"Unchanged answer"}';
    return body.stream
      ? new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`)
      : Response.json({ choices: [{ message: { content }, finish_reason: finishReason }] });
  });
  const configuration = { providers: async () => [{ ...provider, enabled: true, healthState: "healthy" }],
    providerForUse: async () => provider, models: async () => [model], modelForUse: async () => model };
  const gateway = new AiGatewayService({} as never, {} as never, {} as never, {} as never, {} as never,
    "mock", configuration as never, adapter, new ProviderAdapterRegistry(adapter));
  return { gateway, adapter, calls, model, provider };
}

describe("Configured model output reservation", () => {
  beforeEach(t => { t.mock.method(Logger.prototype, "log", () => undefined); });

  it("Agent conversation uses the saved budget and thinking controls without requiring a proposal schema", async () => {
    const h = harness(8192);
    const reply = await h.gateway.requestAgentConversation({ question: "Understand this project", systemInstruction: "Explain findings naturally; actions require authorization." });
    assert.ok(reply);
    const body = h.calls[0];
    assert.equal(body.max_tokens, 8192); assert.equal(body.temperature, 0);
    assert.equal(body.reasoning_effort, "none"); assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.response_format, undefined);
    assert.ok(!body.messages[0].content.includes("Expected JSON schema:"));
    assert.ok(!body.messages[0].content.includes('"answer"'));
    assert.equal(h.model.maxOutputTokens, 8192);
  });

  for (const output of [512, 2048, 8192, 16384, 65536]) {
    it(`reserves the configured ${output} tokens without a 4096 clamp`, () => {
      const p = prepareAssistantContext({ model: { contextWindow: 262_144, maxOutputTokens: output }, systemPrompt: "Policy", question: "Inspect safely." });
      assert.equal(p.maxOutputTokens, output);
      assert.equal(p.metadata.reservedOutputTokens, output);
      assert.equal(p.metadata.headroomTokens, 13_108);
      assert.ok(p.metadata.estimatedInputTokens + output + p.metadata.headroomTokens <= 262_144);
    });
  }

  it("rejects invalid or impossible output reservations instead of silently reducing them", () => {
    for (const maxOutputTokens of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 249_036, 262_144]) {
      assert.throws(() => modelContextBudget({ contextWindow: 262_144, maxOutputTokens }),
        (e: unknown) => e instanceof AssistantContextBudgetError && e.code === "INVALID_MODEL_CONTEXT");
    }
  });

  it("accounts for UTF-8/schema framing at the exact remaining context boundary", () => {
    const model = { contextWindow: 16_384, maxOutputTokens: 8192 };
    const structuredOutput = { dialect: "LLAMACPP_JSON_SCHEMA", schema: INSPECTION_DECISION_SCHEMA };
    const prefix = 'عربي\n"quoted"';
    const systemPrompt = "Unchanged security instructions";
    const overhead = estimateContextTokens([{ role: "system", content: systemPrompt }, { role: "user", content: prefix }], structuredOutput);
    const limit = modelContextBudget(model).inputTokenLimit;
    const question = prefix + "x".repeat(limit - overhead);
    const p = prepareAssistantContext({ model, systemPrompt, question, structuredOutput });
    assert.equal(p.metadata.estimatedInputTokens, limit);
    assert.equal(p.metadata.requestTruncated, false);
    assert.equal(p.messages.at(-1)?.content, question);
    assert.throws(() => prepareAssistantContext({ model, systemPrompt, question: question + "x", structuredOutput }), AssistantContextBudgetError);
  });

  it("larger output reservation drops only whole old history, never the current request", () => {
    const input = { model: { contextWindow: 16_384, maxOutputTokens: 8192 }, systemPrompt: "Policy", question: "Current question",
      history: Array.from({ length: 4 }, (_, i) => ({ role: "user", content: `${i}: ${"h".repeat(3000)}` })) };
    const p = prepareAssistantContext(input);
    assert.ok(p.metadata.history.retained < input.history.length);
    assert.deepEqual(p.messages.slice(1, -1), input.history.slice(-p.metadata.history.retained));
    assert.equal(p.messages.at(-1)?.content, input.question);
    assert.equal(p.maxOutputTokens, 8192);
    assert.equal(p.metadata.requestTruncated, false);
  });

  for (const output of [512, 8192, 65536]) {
    it(`Chat, streaming and Agent preserve ${output} at the real adapter wire boundary`, async () => {
      const h = harness(output), before = JSON.stringify({ model: h.model, provider: h.provider });
      assert.equal((await h.gateway.askAssistant({ question: "Hello" })).answer, "Unchanged answer");
      assert.equal((await h.gateway.streamAssistant({ question: "Hello" }, () => {})).answer, "Unchanged answer");
      await h.gateway.requestStructuredReasoning({ name: "agent_workspace_inspection", schema: INSPECTION_DECISION_SCHEMA,
        systemInstruction: "Use the unchanged inspection contract.", question: "Analyze this project." });
      assert.equal(h.calls.length, 3);
      for (const body of h.calls) {
        assert.equal(body.max_tokens, output);
        assert.equal(body.temperature, 0);
        assert.equal(body.reasoning_effort, "none");
        assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
      }
      assert.deepEqual(h.calls[2].response_format, { type: "json_schema", schema: INSPECTION_DECISION_SCHEMA });
      assert.equal(JSON.stringify({ model: h.model, provider: h.provider }), before);
    });
  }

  it("R&D reserves and sends the same configured budget without changing its schema", async () => {
    const h = harness(8192);
    await h.gateway.analyzeRepository({ providerId: "provider", modelId: "model", analysisPurpose: "Inspect",
      chunks: [{ citationId: "src", path: "app.ts", startLine: 1, endLine: 1, content: "export const app = true;" } as never] });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].max_tokens, 8192);
    assert.deepEqual(h.calls[0].response_format.schema, RD_RADAR_OUTPUT_SCHEMA);
  });

  it("adapter rejects mandatory input plus output overflow in completion and streaming before fetch", async () => {
    const h = harness(8192, 16_384);
    const request = { modelId: h.model.modelId, contextWindow: h.model.contextWindow, maxOutputTokens: 8192,
      systemPrompt: "S", userPrompt: "Q", messages: [{ role: "user", content: "x".repeat(8000) }] };
    await assert.rejects(() => h.adapter.complete(connection, request), AssistantContextBudgetError);
    await assert.rejects(() => h.adapter.stream(connection, request), AssistantContextBudgetError);
    assert.equal(h.calls.length, 0);
  });

  it("retains the conservative legacy fallback when no context capability is supplied", async () => {
    const h = harness(8192);
    const request = { modelId: "legacy", maxOutputTokens: 8192, systemPrompt: "S", userPrompt: "Q" };
    await h.adapter.complete(connection, request);
    await h.adapter.stream(connection, request);
    assert.ok(h.calls.every(body => body.max_tokens === 4096));
  });

  it("a larger budget does not make a length-terminated Agent response acceptable", async () => {
    const h = harness(8192, 262_144, "length");
    await assert.rejects(() => h.gateway.requestStructuredReasoning({ name: "agent_workspace_inspection", schema: INSPECTION_DECISION_SCHEMA,
      systemInstruction: "Use the inspection contract.", question: "Analyze this project." }), /did not finish/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].max_tokens, 8192);
  });
});
