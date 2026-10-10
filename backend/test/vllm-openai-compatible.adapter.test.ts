import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadGatewayException, RequestTimeoutException } from "@nestjs/common";
import {
  ProviderDialectTestError,
  VllmOpenAiCompatibleAdapter,
  vllmMetadataFromError
} from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { RD_RADAR_OUTPUT_SCHEMA } from "../src/ai-gateway/rd-radar-output.schema";

const dialectConfiguration = { baseUrl: "http://127.0.0.1:8000", apiKey: "credential-must-not-leak", timeoutMs: 1_000 };

async function dialectFailure(fetcher: typeof fetch): Promise<ProviderDialectTestError> {
  const adapter = new VllmOpenAiCompatibleAdapter(fetcher);
  try {
    await adapter.testStructuredOutputDialect(dialectConfiguration, "model", "LLAMACPP_JSON_SCHEMA", 4096);
    assert.fail("expected dialect validation to fail");
  } catch (error) {
    assert.ok(error instanceof ProviderDialectTestError);
    assert.equal(JSON.stringify(error).includes(dialectConfiguration.apiKey), false);
    return error;
  }
}

describe("vLLM OpenAI-compatible adapter", () => {
  it("refuses provider redirects so HTTPS policy cannot be bypassed", async () => {
    let redirect: RequestRedirect | undefined;
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      redirect = init?.redirect;
      return Response.json({ data: [] });
    });

    await adapter.discoverModels({ baseUrl: "https://provider.example.test", apiKey: null, timeoutMs: 1_000 });
    assert.equal(redirect, "error");
  });

  it("discovers models and sends bounded Chat Completions with optional authentication", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const adapter = new VllmOpenAiCompatibleAdapter(async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/v1/models")) return Response.json({ data: [{ id: "model-a", owned_by: "llamacpp" }, { id: "model-b" }] });
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"schemaVersion":"rd-radar-analysis.v1"}' } }], usage: { prompt_tokens: 12, completion_tokens: 7 } });
    });
    const configuration = { baseUrl: "https://teltech.tailb1fa44.ts.net/glm52/v1", apiKey: "test-only-key", timeoutMs: 1_000 };
    assert.deepEqual(await adapter.discoverModels(configuration), ["model-a", "model-b"]);
    assert.deepEqual(await adapter.discoverModelMetadata(configuration), [{ id: "model-a", ownedBy: "llamacpp" }, { id: "model-b", ownedBy: null }]);
    const result = await adapter.chat(configuration, { modelId: "model-b", systemPrompt: "safe", userPrompt: "bounded", maxOutputTokens: 999_999 });
    assert.equal(result.content, '{"schemaVersion":"rd-radar-analysis.v1"}');
    assert.equal(result.metadata.providerCallExecuted, true);
    assert.equal(result.metadata.finishReason, "stop");
    assert.equal(result.metadata.promptTokens, 12);
    assert.equal(result.metadata.completionTokens, 7);
    assert.equal(result.metadata.configuredMaxOutputTokens, 4096);
    assert.equal(calls.every((call) => call.init?.headers && (call.init.headers as Record<string, string>).authorization === "Bearer test-only-key"), true);
    const chatBody = JSON.parse(String(calls[2]?.init?.body)) as { model: string; max_tokens: number };
    assert.equal(chatBody.model, "model-b");
    assert.equal(chatBody.max_tokens, 4096);
    assert.equal(JSON.stringify(result).includes("test-only-key"), false);
    assert.deepEqual(calls.map((call) => call.url), [
      "https://teltech.tailb1fa44.ts.net/glm52/v1/models",
      "https://teltech.tailb1fa44.ts.net/glm52/v1/models",
      "https://teltech.tailb1fa44.ts.net/glm52/v1/chat/completions"
    ]);
  });

  it("retains a single OpenAI API version when a configured base URL already ends in /v1", async () => {
    const urls: string[] = [];
    const adapter = new VllmOpenAiCompatibleAdapter(async (input) => {
      urls.push(String(input));
      return String(input).endsWith("/models")
        ? Response.json({ data: [] })
        : Response.json({ choices: [{ finish_reason: "stop", message: { content: "ok" } }], usage: {} });
    });
    const configuration = { baseUrl: "https://teltech.tailb1fa44.ts.net/glm52/v1", apiKey: null, timeoutMs: 1_000 };
    await adapter.discoverModels(configuration);
    await adapter.chat(configuration, { modelId: "GLM-5.2-Abliterated", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 32 });
    assert.deepEqual(urls, [
      "https://teltech.tailb1fa44.ts.net/glm52/v1/models",
      "https://teltech.tailb1fa44.ts.net/glm52/v1/chat/completions"
    ]);
    assert.equal(urls.some((url) => url.includes("/v1/v1")), false);
  });

  it("reuses one schema with llama.cpp, OpenAI, vLLM, and explicit JSON-object transport dialects", async () => {
    const bodies: Record<string, unknown>[] = [];
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: {} });
    });
    const configuration = { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 1_000 };
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    for (const dialect of ["LLAMACPP_JSON_SCHEMA", "OPENAI_JSON_SCHEMA", "VLLM_STRUCTURED_OUTPUTS", "JSON_OBJECT_ONLY"] as const) {
      await adapter.chat(configuration, { modelId: "model", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 32, structuredOutput: { dialect, schema, name: "rd_radar_analysis" } });
    }
    assert.deepEqual(bodies[0]?.response_format, { type: "json_schema", schema });
    assert.equal(bodies[0]?.reasoning_effort, "none");
    assert.deepEqual(bodies[0]?.chat_template_kwargs, { enable_thinking: false });
    assert.deepEqual(bodies[1]?.response_format, { type: "json_schema", json_schema: { name: "rd_radar_analysis", strict: true, schema } });
    assert.deepEqual(bodies[2]?.structured_outputs, { json: schema });
    assert.equal("response_format" in bodies[2]!, false);
    assert.deepEqual(bodies[3]?.response_format, { type: "json_object" });
    for (const body of bodies.slice(1)) {
      assert.equal("reasoning_effort" in body, false);
      assert.equal("chat_template_kwargs" in body, false);
    }
  });

  it("applies every explicit dialect identically in completion and streaming without imposing JSON mode on plain requests", async () => {
    const calls: Record<string, unknown>[] = [];
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push(body);
      if (body.stream) {
        return new Response('data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } });
      }
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: {} });
    });
    const configuration = { baseUrl: "https://provider.invalid", apiKey: null, timeoutMs: 1_000 };
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const variants = [undefined, "LLAMACPP_JSON_SCHEMA", "OPENAI_JSON_SCHEMA", "VLLM_STRUCTURED_OUTPUTS", "JSON_OBJECT_ONLY"] as const;
    for (const dialect of variants) {
      const request = { modelId: "model", systemPrompt: "Return JSON when requested.", userPrompt: "Confirm.", maxOutputTokens: 512,
        ...(dialect ? { structuredOutput: { dialect, schema, name: "answer" } } : {}) };
      await adapter.complete(configuration, request);
      const streamed = await adapter.stream(configuration, request);
      assert.equal(streamed.content, '{"ok":true}');
      const completion = calls.at(-2)!;
      const { stream, ...streamBody } = calls.at(-1)!;
      assert.equal(stream, true);
      assert.deepEqual(streamBody, completion);
      assert.equal(completion.max_tokens, 512);
      if (dialect === "JSON_OBJECT_ONLY") {
        assert.deepEqual(completion.response_format, { type: "json_object" });
        assert.equal("structured_outputs" in completion, false);
      } else if (dialect === "LLAMACPP_JSON_SCHEMA") {
        assert.deepEqual(completion.response_format, { type: "json_schema", schema });
      } else if (dialect === "OPENAI_JSON_SCHEMA") {
        assert.deepEqual(completion.response_format, { type: "json_schema", json_schema: { name: "answer", strict: true, schema } });
      } else if (dialect === "VLLM_STRUCTURED_OUTPUTS") {
        assert.deepEqual(completion.structured_outputs, { json: schema });
        assert.equal("response_format" in completion, false);
      } else {
        assert.equal("response_format" in completion, false);
        assert.equal("structured_outputs" in completion, false);
      }
      if (dialect !== "LLAMACPP_JSON_SCHEMA") {
        assert.equal("reasoning_effort" in completion, false);
        assert.equal("chat_template_kwargs" in completion, false);
      }
    }
  });

  it("verifies explicitly configured JSON_OBJECT_ONLY using the same transport contract", async () => {
    let calls = 0;
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.max_tokens, 512);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: {} });
    });
    const result = await adapter.testStructuredOutputDialect(
      { baseUrl: "https://provider.invalid", apiKey: null, timeoutMs: 1_000 }, "model", "JSON_OBJECT_ONLY", 512);
    assert.equal(calls, 1);
    assert.equal(result.attemptedDialect, "JSON_OBJECT_ONLY");
    assert.equal(result.reasonCode, null);
    assert.equal(result.schemaIssues.length, 0);
  });

  it("sends the exact canonical R&D schema in the llama.cpp envelope", async () => {
    let body: Record<string, unknown> = {};
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"schemaVersion":"rd-radar-analysis.v1","summary":"safe","findings":[]}' } }], usage: {} });
    });
    await adapter.chat(
      { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 1_000 },
      { modelId: "model", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 64, structuredOutput: { dialect: "LLAMACPP_JSON_SCHEMA", schema: RD_RADAR_OUTPUT_SCHEMA, name: "rd_radar_analysis" } }
    );
    assert.deepEqual(body.response_format, { type: "json_schema", schema: RD_RADAR_OUTPUT_SCHEMA });
    assert.equal(body.temperature, 0);
    assert.equal(body.max_tokens, 64);
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  });

  it("classifies every safe dialect failure without retaining credentials or raw content", async () => {
    const rejected = await dialectFailure(async () => Response.json({ raw: "upstream-body-must-not-leak" }, { status: 422 }));
    assert.equal(rejected.reasonCode, "DIALECT_HTTP_REJECTION");
    assert.equal(rejected.diagnostic.upstreamHttpStatus, 422);
    assert.equal(rejected.diagnostic.responseReceived, true);
    assert.equal(rejected.diagnostic.generationStarted, false);

    const timedOut = await dialectFailure((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("raw-timeout-must-not-leak")), { once: true });
    }));
    assert.equal(timedOut.reasonCode, "DIALECT_TIMEOUT");
    assert.equal(timedOut.diagnostic.responseReceived, false);
    assert.equal(timedOut.diagnostic.contentPresent, false);

    const noContent = await dialectFailure(async () => Response.json({ choices: [{ finish_reason: null, message: { content: "" } }], usage: {} }));
    assert.equal(noContent.reasonCode, "DIALECT_NO_CONTENT");
    assert.equal(noContent.diagnostic.upstreamHttpStatus, 200);
    assert.equal(noContent.diagnostic.responseReceived, true);
    assert.equal(noContent.diagnostic.contentPresent, false);

    const truncatedNoContent = await dialectFailure(async () => Response.json({
      choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "raw-reasoning-must-not-leak" } }],
      usage: { prompt_tokens: 29, completion_tokens: 4096 }
    }));
    assert.equal(truncatedNoContent.reasonCode, "DIALECT_OUTPUT_TRUNCATED");
    assert.equal(truncatedNoContent.diagnostic.finishReason, "length");
    assert.equal(truncatedNoContent.diagnostic.completionTokens, 4096);
    assert.equal(truncatedNoContent.diagnostic.contentPresent, false);
    assert.equal(JSON.stringify(truncatedNoContent).includes("raw-reasoning-must-not-leak"), false);

    const truncatedPartialJson = await dialectFailure(async () => Response.json({
      choices: [{ finish_reason: "length", message: { content: "{\"ok\":" } }],
      usage: { prompt_tokens: 29, completion_tokens: 4096 }
    }));
    assert.equal(truncatedPartialJson.reasonCode, "DIALECT_OUTPUT_TRUNCATED");
    assert.equal(truncatedPartialJson.diagnostic.jsonParseResult, "FAIL");
    assert.equal(truncatedPartialJson.diagnostic.contentPresent, true);
    assert.equal(JSON.stringify(truncatedPartialJson).includes("{\"ok\":"), false);

    const invalidJson = await dialectFailure(async () => Response.json({
      choices: [{ finish_reason: "stop", message: { content: "raw-model-output-must-not-leak" } }],
      usage: { prompt_tokens: 4, completion_tokens: 5 }
    }));
    assert.equal(invalidJson.reasonCode, "DIALECT_JSON_INVALID");
    assert.equal(invalidJson.diagnostic.jsonParseResult, "FAIL");
    assert.equal(invalidJson.diagnostic.finishReason, "stop");
    assert.equal(JSON.stringify(invalidJson).includes("raw-model-output-must-not-leak"), false);

    const invalidSchema = await dialectFailure(async () => Response.json({
      choices: [{ finish_reason: "stop", message: { content: '{"ok":false,"raw-field-must-not-leak":"value"}' } }],
      usage: { prompt_tokens: 6, completion_tokens: 7 }
    }));
    assert.equal(invalidSchema.reasonCode, "DIALECT_SCHEMA_INVALID");
    assert.deepEqual(invalidSchema.diagnostic.schemaIssues, [
      { path: "$.ok", code: "EXPECTED_TRUE" },
      { path: "$", code: "ADDITIONAL_PROPERTIES" }
    ]);
    assert.equal(JSON.stringify(invalidSchema).includes("raw-field-must-not-leak"), false);
  });

  it("returns a sanitized success diagnostic for the verified dialect", async () => {
    let body: Record<string, unknown> = {};
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 }
      });
    });
    const diagnostic = await adapter.testStructuredOutputDialect(dialectConfiguration, "model", "LLAMACPP_JSON_SCHEMA", 99_999);
    assert.equal(diagnostic.reasonCode, null);
    assert.equal(diagnostic.attemptedDialect, "LLAMACPP_JSON_SCHEMA");
    assert.equal(diagnostic.upstreamHttpStatus, 200);
    assert.equal(diagnostic.jsonParseResult, "PASS");
    assert.deepEqual(diagnostic.schemaIssues, []);
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(JSON.stringify(diagnostic).includes(dialectConfiguration.apiKey), false);
  });

  it("uses the configured dialect-test output budget and limits reasoning controls to llama.cpp", async () => {
    const bodies: Record<string, unknown>[] = [];
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: {} });
    });
    await adapter.testStructuredOutputDialect(dialectConfiguration, "model", "LLAMACPP_JSON_SCHEMA", 1024);
    await adapter.testStructuredOutputDialect(dialectConfiguration, "model", "OPENAI_JSON_SCHEMA", 2048);
    assert.equal(bodies[0]?.max_tokens, 1024);
    assert.equal(bodies[0]?.reasoning_effort, "none");
    assert.deepEqual(bodies[0]?.chat_template_kwargs, { enable_thinking: false });
    assert.equal(bodies[1]?.max_tokens, 2048);
    assert.equal("reasoning_effort" in bodies[1]!, false);
    assert.equal("chat_template_kwargs" in bodies[1]!, false);
  });

  it("omits authentication when not configured and sanitizes malformed responses", async () => {
    let headers: HeadersInit | undefined;
    const adapter = new VllmOpenAiCompatibleAdapter(async (_input, init) => {
      headers = init?.headers;
      return Response.json({ unexpected: true });
    });
    await assert.rejects(() => adapter.chat({ baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 1_000 }, { modelId: "manual", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 10 }), BadGatewayException);
    assert.equal(Object.hasOwn(headers as object, "authorization"), false);
  });

  it("aborts a provider request on timeout", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await assert.rejects(() => adapter.discoverModels({ baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 5 }), RequestTimeoutException);
  });

  it("normal real provider response is not classified as TIMEOUT and reports SUCCESS", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter(async () => {
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"answer":"Real answer from GLM"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 30 }
      });
    });
    const result = await adapter.chat(
      { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 120_000 },
      { modelId: "GLM-5.2-Abliterated", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 512 }
    );
    assert.equal(result.content, '{"answer":"Real answer from GLM"}');
    assert.equal(result.metadata.httpClassification, "SUCCESS");
    assert.notEqual(result.metadata.httpClassification, "TIMEOUT");
    assert.equal(result.metadata.providerCallExecuted, true);
    assert.equal(result.metadata.httpStatus, 200);
  });

  it("genuine timeout on chat request remains classified as TIMEOUT", async () => {
    const adapter = new VllmOpenAiCompatibleAdapter((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    let caughtError: unknown;
    try {
      await adapter.chat(
        { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 10 },
        { modelId: "GLM-5.2-Abliterated", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 512 }
      );
    } catch (err) {
      caughtError = err;
    }
    assert(caughtError instanceof RequestTimeoutException);
    const metadata = vllmMetadataFromError(caughtError);
    assert.equal(metadata?.httpClassification, "TIMEOUT");
    assert.equal(metadata?.providerCallExecuted, true);
    assert.equal(metadata?.finishReason, null);
  });

  it("classifies upstream HTTP 504 and 408 as TIMEOUT", async () => {
    const adapter504 = new VllmOpenAiCompatibleAdapter(async () => new Response("Gateway Timeout", { status: 504 }));
    let err504: unknown;
    try {
      await adapter504.chat(
        { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 60_000 },
        { modelId: "GLM-5.2-Abliterated", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 512 }
      );
    } catch (e) {
      err504 = e;
    }
    assert.equal(vllmMetadataFromError(err504)?.httpClassification, "TIMEOUT");

    const adapter408 = new VllmOpenAiCompatibleAdapter(async () => new Response("Request Timeout", { status: 408 }));
    let err408: unknown;
    try {
      await adapter408.chat(
        { baseUrl: "http://127.0.0.1:8000", apiKey: null, timeoutMs: 60_000 },
        { modelId: "GLM-5.2-Abliterated", systemPrompt: "safe", userPrompt: "safe", maxOutputTokens: 512 }
      );
    } catch (e) {
      err408 = e;
    }
    assert.equal(vllmMetadataFromError(err408)?.httpClassification, "TIMEOUT");
  });
});
