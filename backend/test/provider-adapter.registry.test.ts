import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { ProviderAdapterRegistry } from "../src/ai-gateway/provider-adapter.registry";
import { VllmOpenAiCompatibleAdapter } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import type { AiGatewayExecutionAdapter, ProviderStreamOptions } from "../src/ai-gateway/provider-execution.adapter";

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function sseStreamResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(evt));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

describe("ProviderAdapterRegistry", () => {
  it("initializes with VllmOpenAiCompatibleAdapter when injected", () => {
    const vllm = new VllmOpenAiCompatibleAdapter();
    const registry = new ProviderAdapterRegistry(vllm);

    assert.equal(registry.hasAdapter("vllm_openai_compatible"), true);
    assert.equal(registry.registeredTypes().includes("vllm_openai_compatible"), true);
    const resolved = registry.resolve("vllm_openai_compatible");
    assert.equal(resolved, vllm);
    assert.equal(resolved.providerType, "vllm_openai_compatible");
    assert.ok(resolved.capabilities.includes("chat"));
    assert.ok(resolved.capabilities.includes("streaming"));
  });

  it("throws BadRequestException when resolving an unknown or unregistered provider type", () => {
    const registry = new ProviderAdapterRegistry();
    assert.equal(registry.hasAdapter("anthropic_unknown"), false);
    assert.throws(
      () => registry.resolve("anthropic_unknown"),
      (err) => err instanceof BadRequestException && err.message.includes("anthropic_unknown")
    );
  });

  it("allows registering future provider adapters dynamically without modifying the gateway", () => {
    const registry = new ProviderAdapterRegistry();
    const customAdapter: AiGatewayExecutionAdapter = {
      providerType: "custom_future_provider",
      capabilities: Object.freeze(["chat", "streaming"]),
      discoverModels: async () => ["custom-model-1"],
      discoverModelMetadata: async () => [{ id: "custom-model-1", ownedBy: "custom" }],
      testConnection: async () => {},
      testStructuredOutputDialect: async () => ({} as any),
      complete: async () => ({
        content: "custom response",
        metadata: {
          providerCallExecuted: true,
          durationMs: 10,
          httpClassification: "SUCCESS",
          httpStatus: 200,
          finishReason: "stop",
          promptTokens: 5,
          completionTokens: 2,
          configuredMaxOutputTokens: 100
        }
      }),
      stream: async (_cfg, _req, options) => {
        options?.onChunk?.({ delta: "custom", accumulated: "custom" });
        return {
          content: "custom",
          metadata: {
            providerCallExecuted: true,
            durationMs: 10,
            httpClassification: "SUCCESS",
            httpStatus: 200,
            finishReason: "stop",
            promptTokens: 5,
            completionTokens: 1,
            configuredMaxOutputTokens: 100
          }
        };
      }
    };

    registry.register(customAdapter);
    assert.equal(registry.hasAdapter("custom_future_provider"), true);
    const resolved = registry.resolve("custom_future_provider");
    assert.equal(resolved.providerType, "custom_future_provider");
  });
});

describe("VllmOpenAiCompatibleAdapter execution contract & streaming", () => {
  const configuration = { baseUrl: "https://teltech.tailb1fa44.ts.net/glm52/v1", apiKey: "test-key", timeoutMs: 5_000 };

  it("complete() delegates to chat() and returns normalized VllmChatResult", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter(async () =>
      fakeResponse(200, JSON.stringify({
        id: "chatcmpl-123",
        choices: [{ index: 0, message: { role: "assistant", content: "Complete response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }))
    );

    const result = await adapter.complete(configuration, {
      modelId: "GLM-5.2-Abliterated",
      systemPrompt: "You are SEKHEM.",
      userPrompt: "Hello",
      maxOutputTokens: 100
    });

    assert.equal(result.content, "Complete response");
    assert.equal(result.metadata.httpClassification, "SUCCESS");
    assert.equal(result.metadata.promptTokens, 10);
    assert.equal(result.metadata.completionTokens, 5);
  });

  it("stream() parses real SSE stream, invokes onChunk callback, and returns full completion", async () => {
    const chunks: string[] = [];
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":3}}\n\n',
      'data: [DONE]\n\n'
    ];

    const adapter = new VllmOpenAiCompatibleAdapter(async () => sseStreamResponse(ssePayload));

    const result = await adapter.stream(
      configuration,
      {
        modelId: "GLM-5.2-Abliterated",
        systemPrompt: "You are SEKHEM.",
        userPrompt: "Hello",
        maxOutputTokens: 100
      },
      {
        onChunk: (chunk) => chunks.push(chunk.delta)
      }
    );

    assert.equal(result.content, "Hello world!");
    assert.deepEqual(chunks, ["Hello", " world", "!"]);
    assert.equal(result.metadata.finishReason, "stop");
    assert.equal(result.metadata.promptTokens, 8);
    assert.equal(result.metadata.completionTokens, 3);
    assert.equal(result.metadata.httpClassification, "SUCCESS");
  });

  it("stream() cancels immediately when AbortSignal is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const adapter = new VllmOpenAiCompatibleAdapter(async () =>
      fakeResponse(200, "data: [DONE]\n\n", { "content-type": "text/event-stream" })
    );

    await assert.rejects(
      async () => {
        await adapter.stream(
          configuration,
          {
            modelId: "GLM-5.2-Abliterated",
            systemPrompt: "You are SEKHEM.",
            userPrompt: "Hello",
            maxOutputTokens: 100
          },
          { signal: abortController.signal }
        );
      },
      (err: any) => err.safeHttpClassification === "TIMEOUT"
    );
  });

  it("stream() handles provider HTTP error and normalizes error classification", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter(async () =>
      fakeResponse(401, JSON.stringify({ error: "Unauthorized" }))
    );

    await assert.rejects(
      async () => {
        await adapter.stream(configuration, {
          modelId: "GLM-5.2-Abliterated",
          systemPrompt: "You are SEKHEM.",
          userPrompt: "Hello",
          maxOutputTokens: 100
        });
      },
      (err: any) => err.safeHttpClassification === "UNAUTHORIZED" && err.safeHttpStatus === 401
    );
  });

  it("stream() rejects inputs that exceed configured bounds", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter();
    const oversizedPrompt = "a".repeat(100_000);

    await assert.rejects(
      async () => {
        await adapter.stream(configuration, {
          modelId: "GLM-5.2-Abliterated",
          systemPrompt: "System",
          userPrompt: oversizedPrompt,
          maxOutputTokens: 100
        });
      },
      (err) => err instanceof BadRequestException
    );
  });
});
