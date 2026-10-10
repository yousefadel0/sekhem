import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { AiGatewayPolicyService } from "../src/ai-gateway/ai-gateway-policy.service";
import { VllmOpenAiCompatibleAdapter } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { ProviderAdapterRegistry } from "../src/ai-gateway/provider-adapter.registry";
import { SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT } from "../src/ai-gateway/assistant-answer.contract";
import type { ProviderDiagnostic } from "../src/ai-gateway/provider-diagnostic";

function gatewayFor(response: (body: any, init?: RequestInit) => Response | Promise<Response>) {
  const requests: any[] = [];
  let reviews = 0;
  const policy = new AiGatewayPolicyService();
  const original = policy.reviewRequest.bind(policy);
  policy.reviewRequest = input => { reviews++; return original(input); };
  const adapter = new VllmOpenAiCompatibleAdapter(async (_url, init) => {
    const body = JSON.parse(String(init?.body)); requests.push(body); return response(body, init);
  });
  const runtime = {
    providers: async () => [{ id: "provider", providerType: adapter.providerType, enabled: true, healthState: "healthy" }],
    providerForUse: async () => ({ id: "provider", providerType: adapter.providerType, baseUrl: "https://private-endpoint.invalid/private-path", apiKey: "private-api-credential", defaultTimeoutMs: 1000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" }),
    models: async () => [{ id: "model", modelId: "GLM-5.2-Abliterated", enabled: true, defaultForProvider: true, contextWindow: 262144, maxOutputTokens: 512 }]
  };
  const gateway = new AiGatewayService(policy, {} as never, {} as never, {} as never, {} as never, "mock", runtime as never, adapter, new ProviderAdapterRegistry(adapter));
  return { gateway, requests, reviews: () => reviews };
}

describe("C: redacted provider diagnostics without behavior/policy changes", () => {
  let logs: string[];
  beforeEach(t => {
    logs = [];
    t.mock.method(Logger.prototype, "log", (message: unknown) => { logs.push(String(message)); });
  });
  const assertRedacted = (value: unknown) => {
    const text = JSON.stringify(value);
    for (const forbidden of ["private-api-credential", "private-path", "private-user-content", "private-memory-content", "private-refusal-content", "private-response-content"]) assert.equal(text.includes(forbidden), false, forbidden);
  };
  it("ordinary inspection reasoning captures bounded timing without changing its configured timeout or output", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: "unchanged" }, finish_reason: "stop" }] }));
    let diagnostic: ProviderDiagnostic | undefined;
    const answer = await h.gateway.requestAgentConversation({ question: "private-user-content", systemInstruction: "Review",
      onDiagnostic: value => { diagnostic = value; } });
    assert.equal(answer, "unchanged"); assert.ok(diagnostic?.requestTiming);
    assert.equal(diagnostic.requestTiming.providerOrigin, "https://private-endpoint.invalid");
    assert.ok(diagnostic.requestTiming.requestBytes > 0); assert.ok(diagnostic.requestTiming.responseHeadersAt !== null);
    assertRedacted(diagnostic.requestTiming); assertRedacted(logs);
  });

  it("records identifiers, instruction fingerprint, dialect, roles and transport result", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: '{"answer":"private-response-content"}' }, finish_reason: "stop" }] }));
    const result = await h.gateway.askAssistant({ question: "private-user-content", memoryContext: "private-memory-content", history: [{ role: "user", content: "earlier" }, { role: "assistant", content: "reply" }] });
    assert.equal(result.answer, "private-response-content");
    const d = result.diagnostic!;
    assert.equal(d.correlationId, result.correlationId);
    assert.equal(d.providerId, "provider");
    assert.equal(d.modelId, "GLM-5.2-Abliterated");
    assert.equal(d.instructionVersion, "sekhem-assistant-v1");
    assert.equal(d.instructionFingerprint, createHash("sha256").update(h.requests[0].messages[0].content).digest("hex"));
    assert.deepEqual(d.messageRoleCounts, { system: 1, user: 2, assistant: 1, tool: 0, other: 0 });
    assert.equal(d.dialect, "LLAMACPP_JSON_SCHEMA");
    assert.equal(d.httpStatus, 200);
    assert.equal(d.finishReason, "stop");
    assert.equal(d.refusalFieldPresent, false);
    assert.equal(d.refusalAttribution, "UNKNOWN");
    assert.equal(h.requests[0].temperature, 0);
    assert.equal(h.requests[0].max_tokens, 512);
    assert.equal(h.requests[0].response_format.type, "json_schema");
    assert.equal(h.requests[0].messages[0].content, `${SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT}\n\nprivate-memory-content`);
    assert.equal(h.reviews(), 0);
    assertRedacted(d); assertRedacted(logs);
  });

  it("records refusal-field presence without storing its text or assigning a cause", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: null, refusal: "private-refusal-content" }, finish_reason: "content_filter" }] }));
    const result = await h.gateway.askAssistant({ question: "private-user-content" });
    assert.equal(result.status, "PROVIDER_UNAVAILABLE");
    assert.equal(result.diagnostic?.refusalFieldPresent, true);
    assert.equal(result.diagnostic?.httpStatus, 200);
    assert.equal(result.diagnostic?.finishReason, "content_filter");
    assert.equal(result.diagnostic?.refusalAttribution, "UNKNOWN");
    assertRedacted(result.diagnostic); assertRedacted(logs);
  });

  it("retains HTTP rejection metadata without reading or logging the upstream error body", async () => {
    const h = gatewayFor(() => new Response("private-refusal-content", { status: 403 }));
    const result = await h.gateway.askAssistant({ question: "private-user-content" });
    assert.equal(result.diagnostic?.httpStatus, 403);
    assert.equal(result.diagnostic?.finishReason, null);
    assert.equal(result.diagnostic?.refusalFieldPresent, null);
    assert.equal(result.diagnostic?.refusalAttribution, "UNKNOWN");
    assert.equal(result.diagnostic?.httpClassification, "UNAUTHORIZED");
    assert.equal(result.diagnostic?.failureCode, "HTTP_REJECTION");
    assertRedacted(result.diagnostic); assertRedacted(logs);
  });

  it("records streamed refusal metadata and preserves normal chunks", async () => {
    const h = gatewayFor(() => new Response('data: {"choices":[{"delta":{"content":"answer","refusal":"private-refusal-content"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
    const chunks: string[] = [];
    const result = await h.gateway.streamAssistant({ question: "private-user-content" }, chunk => chunks.push(chunk));
    assert.deepEqual(chunks, ["answer"]);
    assert.equal(result.answer, "answer");
    assert.equal(result.diagnostic?.refusalFieldPresent, true);
    assert.equal(result.diagnostic?.httpStatus, 200);
    assert.equal(h.reviews(), 0);
    assertRedacted(result.diagnostic); assertRedacted(logs);
  });

  it("passes structured Agent diagnostics to its caller without changing the result", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 123, completion_tokens: 45 } }));
    let captured: ProviderDiagnostic | undefined;
    const result = await h.gateway.requestStructuredReasoning({ question: "private-user-content", systemInstruction: "Propose a plan.", schema: { type: "object" }, name: "plan", onDiagnostic: d => { captured = d; } });
    assert.equal(result, '{"ok":true}');
    assert.match(captured!.correlationId, /^ai-reasoning-/);
    assert.equal(captured!.httpStatus, 200);
    assert.equal(captured!.configuredMaxOutputTokens, 512);
    assert.equal(captured!.promptTokens, 123); assert.equal(captured!.completionTokens, 45);
    assert.equal(captured!.httpClassification, "SUCCESS"); assert.equal(captured!.failureCode, null);
    assert.ok(Number.isSafeInteger(captured!.durationMs));
    assertRedacted(captured); assertRedacted(logs);
  });

  it("preserves a client deadline before headers through the structured planning diagnostic", async () => {
    const h = gatewayFor((_body, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("private-api-credential private-user-content")), { once: true });
    }));
    let captured: ProviderDiagnostic | undefined;
    await assert.rejects(h.gateway.requestStructuredReasoning({ question: "private-user-content", systemInstruction: "Plan", schema: {}, name: "plan", onDiagnostic: d => { captured = d; } }));
    assert.equal(captured!.failureCode, "CLIENT_DEADLINE"); assert.equal(captured!.failureStage, "REQUEST");
    assert.equal(captured!.httpClassification, "TIMEOUT"); assert.equal(captured!.httpStatus, null);
    assert.equal(captured!.configuredMaxOutputTokens, 512); assert.ok(captured!.durationMs! >= 900);
    assertRedacted(captured); assertRedacted(logs);
  });

  for (const code of ["ECONNRESET", "private-api-credential"]) it(`retains only allowlisted transport codes: ${code === "ECONNRESET" ? code : "redacted"}`, async () => {
    const h = gatewayFor(() => { throw new TypeError("private-endpoint private-api-credential", { cause: Object.assign(new Error("private-user-content"), { code }) }); });
    const result = await h.gateway.askAssistant({ question: "private-user-content" });
    assert.equal(result.diagnostic!.failureCode, code === "ECONNRESET" ? "ECONNRESET" : "NETWORK_ERROR");
    assert.equal(result.diagnostic!.failureStage, "REQUEST"); assert.equal(result.diagnostic!.httpStatus, null);
    assert.equal(result.diagnostic!.httpClassification, "PROVIDER_ERROR"); assertRedacted(result.diagnostic); assertRedacted(logs);
  });

  it("distinguishes invalid response JSON from a deadline during response body reading", async () => {
    const malformed = gatewayFor(() => new Response("private-response-content", { status: 200 }));
    const invalid = await malformed.gateway.askAssistant({ question: "private-user-content" });
    assert.equal(invalid.diagnostic!.failureCode, "INVALID_JSON"); assert.equal(invalid.diagnostic!.failureStage, "RESPONSE_BODY");
    assert.equal(invalid.diagnostic!.httpStatus, 200); assertRedacted(invalid.diagnostic);
    const slow = gatewayFor((_body, init) => new Response(new ReadableStream({ start(controller) {
      init!.signal!.addEventListener("abort", () => controller.error(new Error("private-response-content")), { once: true });
    } }), { status: 200 }));
    const timed = await slow.gateway.askAssistant({ question: "private-user-content" });
    assert.equal(timed.diagnostic!.failureCode, "CLIENT_DEADLINE"); assert.equal(timed.diagnostic!.failureStage, "RESPONSE_BODY");
    assert.equal(timed.diagnostic!.httpStatus, 200); assertRedacted(timed.diagnostic); assertRedacted(logs);
  });

  it("enables timing only for structured inspection without changing its request content", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: '{}'}, finish_reason: "stop" }] }));
    let diagnostic: ProviderDiagnostic | undefined;
    const input = { question: "private-user-content", systemInstruction: "Inspect", schema: {}, name: "inspection_decision",
      onDiagnostic: (d: ProviderDiagnostic) => { diagnostic = d; } };
    await h.gateway.requestStructuredReasoning({ ...input, purpose: "STRUCTURED_INSPECTION" });
    assert.ok(diagnostic!.requestTiming);
    assert.equal(diagnostic!.requestTiming!.requestBytes, Buffer.byteLength(JSON.stringify(h.requests[0])));
    assert.equal(diagnostic!.modelId, "GLM-5.2-Abliterated");
    assert.ok(diagnostic!.correlationId.startsWith("ai-reasoning-"));
    assertRedacted(diagnostic);
    await h.gateway.requestStructuredReasoning(input);
    assert.equal(diagnostic!.requestTiming, undefined);
    assert.deepEqual(h.requests[0], h.requests[1]);
  });

  it("sanitizes unexpected finish metadata and survives a failing diagnostic consumer", async () => {
    const h = gatewayFor(() => Response.json({ choices: [{ message: { content: '{"answer":"ok"}' }, finish_reason: "private-refusal-content" }] }));
    const result = await h.gateway.askAssistant({ question: "Hi" });
    assert.equal(result.answer, "ok");
    assert.equal(result.diagnostic?.finishReason, "OTHER");
    assertRedacted(logs);
    const normal = gatewayFor(() => Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }));
    assert.equal(await normal.gateway.requestStructuredReasoning({ question: "Hi", systemInstruction: "Plan", schema: {}, name: "test", onDiagnostic: () => { throw new Error("diagnostic consumer"); } }), '{"ok":true}');
  });
});
