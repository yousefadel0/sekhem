import assert from "node:assert/strict";
import { test } from "node:test";
import { VllmOpenAiCompatibleAdapter, vllmMetadataFromError } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { inspectionRequestDiagnostic } from "../src/ai-gateway/provider-diagnostic";

const request = { modelId: "model", systemPrompt: "PRIVATE_SOURCE", userPrompt: "PRIVATE_PROMPT", maxOutputTokens: 32 };
const config = { baseUrl: "https://provider.invalid", apiKey: "PRIVATE_CREDENTIAL", timeoutMs: 20, captureRequestTiming: true };

test("structured timing records actual serialized bytes and headers without content", async () => {
  let bytes = 0;
  const adapter = new VllmOpenAiCompatibleAdapter(async (_url, init) => {
    bytes = Buffer.byteLength(String(init?.body));
    assert.equal(JSON.parse(String(init?.body)).stream, undefined);
    return Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] });
  });
  const result = await adapter.complete(config, request);
  const timing = result.metadata.requestTiming!;
  assert.equal(timing.requestBytes, bytes);
  assert.equal(timing.providerOrigin, "https://provider.invalid");
  assert.equal(timing.deadlineAt, timing.dispatchedAt + config.timeoutMs);
  assert.ok(timing.responseCompleteAt! >= timing.responseHeadersAt!);
  assert.ok(timing.responseHeadersAt! >= timing.dispatchedAt);
  assert.ok(result.metadata.durationMs >= 0);
  assert.ok(!JSON.stringify(timing).includes("PRIVATE"));
  assert.equal((await adapter.complete({ ...config, captureRequestTiming: false }, request)).metadata.requestTiming, undefined);
});

test("request deadline preserves dispatch with no observed headers and unchanged rejection", async () => {
  const adapter = new VllmOpenAiCompatibleAdapter((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error("PRIVATE_ERROR")), { once: true });
  }));
  await assert.rejects(adapter.complete(config, request), error => {
    const metadata = vllmMetadataFromError(error)!;
    assert.equal(metadata.failureCode, "CLIENT_DEADLINE");
    assert.equal(metadata.failureStage, "REQUEST");
    assert.equal(metadata.requestTiming!.responseHeadersAt, null);
    assert.equal(metadata.requestTiming!.responseCompleteAt, null);
    assert.equal(metadata.requestTiming!.deadlineAt, metadata.requestTiming!.dispatchedAt + config.timeoutMs);
    assert.ok(metadata.durationMs >= config.timeoutMs);
    assert.ok(!JSON.stringify(metadata).includes("PRIVATE"));
    return true;
  });
});

test("body deadline retains received-header timestamp and RESPONSE_BODY classification", async () => {
  const adapter = new VllmOpenAiCompatibleAdapter(async (_url, init) => ({ ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("PRIVATE_BODY")), { once: true }))
  } as Response));
  await assert.rejects(adapter.complete(config, request), error => {
    const m = vllmMetadataFromError(error)!;
    assert.equal(m.failureCode, "CLIENT_DEADLINE");
    assert.equal(m.failureStage, "RESPONSE_BODY");
    assert.ok(m.requestTiming!.responseHeadersAt! >= m.requestTiming!.dispatchedAt);
    return true;
  });
});

test("persisted timing projection whitelists fields and rejects invalid sizes", () => {
  const input: any = { correlationId: "correlation", providerId: "provider", providerType: "vllm", modelId: "model",
    durationMs: 300001, httpClassification: "TIMEOUT", failureStage: "REQUEST", failureCode: "CLIENT_DEADLINE",
    requestTiming: { dispatchedAt: 1000, responseHeadersAt: null, requestBytes: 123, rawPrompt: "PRIVATE" }, rawResponse: "PRIVATE" };
  const value = inspectionRequestDiagnostic(input)!;
  assert.equal(value.requestBytes, 123);
  assert.equal(value.correlationId, "correlation");
  assert.ok(!JSON.stringify(value).includes("PRIVATE"));
  assert.equal(inspectionRequestDiagnostic({ ...input, requestTiming: { ...input.requestTiming, requestBytes: Infinity } }), undefined);
});

 test("safe origin excludes credentials, path, query and fragment; persisted HTTP/completion survive", async () => {
  const adapter = new VllmOpenAiCompatibleAdapter(async () => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
  const result = await adapter.complete({ ...config, baseUrl: "https://PRIVATE:SECRET@provider.invalid/base?TOKEN=SECRET#PRIVATE" }, request);
  const value = inspectionRequestDiagnostic({ ...result.metadata, correlationId: "c", providerId: "p", providerType: "vllm", modelId: "m", requestTiming: result.metadata.requestTiming } as any)!;
  assert.equal(value.providerOrigin, "https://provider.invalid"); assert.equal(value.httpStatus, 200);
  assert.ok(value.responseCompleteAt! >= value.responseHeadersAt!);
  assert.ok(!JSON.stringify(value).includes("SECRET")); assert.ok(!JSON.stringify(value).includes("PRIVATE"));
 });
