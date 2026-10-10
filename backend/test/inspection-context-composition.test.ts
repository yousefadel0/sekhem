import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalInspectionSources } from "../src/agent-runtime/inspection/inspection-evidence-context";
import { prepareInspectionContext, INSPECTION_CONTEXT_BYTES } from "../src/ai-gateway/inspection-context-budget";
import { chatCompletionBody } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { BadRequestException } from "@nestjs/common";

const input = (state: unknown) => ({ model: { contextWindow: 262144, maxOutputTokens: 8192 }, modelId: "GLM-5.2-Abliterated",
  systemPrompt: "Keep exact facts", question: "Current bounded request\n[INSPECTION STATE]\n" + JSON.stringify(state), history: [] });
test("canonical evidence appears once; anchors are exact UTF-16/UTF-8 ranges without duplicate source or references", () => {
  const body = "😀\r\n<h1>Exact heading</h1>\r\n";
  const source: any = { token: "S0000000000000000", path: "index.html", operation: "filesystem.read", evidenceRef: "runtime:receipt", body,
    reference: { operationId: "operation", receiptId: "receipt", observationTime: "2026-10-05T00:00:00Z", encoding: "utf-8-decoded", verificationState: "VERIFIED", truncated: false, contentIdentity: { status: "UNAVAILABLE" } } };
  const [canonical] = canonicalInspectionSources([source]);
  assert.equal(canonical.excerpt, body); assert.equal(canonical.evidenceRef, "runtime:receipt"); assert.equal(canonical.receipt.id, "receipt");
  assert.equal(canonical.sourceId, "operation"); assert.deepEqual(canonical.range, { start: 0, end: body.length, byteStart: 0, byteEnd: Buffer.byteLength(body) });
  const anchor = canonical.anchors![0]; assert.equal(body.slice(anchor.start, anchor.end), "<h1>Exact heading</h1>\r");
  assert.equal(anchor.byteStart, Buffer.byteLength(body.slice(0, anchor.start))); assert.ok(!Object.hasOwn(anchor, "excerpt"));
  assert.ok(!Object.hasOwn(anchor, "evidenceRef")); assert.equal(JSON.stringify(canonical).split("Exact heading").length - 1, 1);
  assert.deepEqual(canonicalInspectionSources([source]), [canonical]);
});
test("whole admitted source survives canonicalization beyond navigation anchors", () => {
  const body = Array.from({ length: 200 }, (_, i) => `"dependency-${i}": "1.0.0"`).join("\n");
  const [s] = canonicalInspectionSources([{ body, token: "S0000000000000000", path: "package.json", operation: "filesystem.read", evidenceRef: "runtime:r", reference: { operationId: "o", receiptId: "r" } } as any]);
  assert.equal(s.excerpt, body); assert.ok(s.excerpt.includes("dependency-199")); assert.equal(s.anchors?.length, 6);
});
test("whole-request UTF-8 budget is deterministic and counts the actual envelope including schema", () => {
  const request = { ...input({ sourceCitations: [{ excerpt: "Exact\r\n😀" }], priorFindings: null }),
    structuredOutput: { dialect: "LLAMACPP_JSON_SCHEMA", name: "inspection", schema: { type: "object" } } };
  const a = prepareInspectionContext(request), b = prepareInspectionContext(request);
  assert.deepEqual(a, b);
  const body = chatCompletionBody({ modelId: request.modelId, maxOutputTokens: a.maxOutputTokens, messages: a.messages,
    systemPrompt: a.systemPrompt, userPrompt: a.userPrompt, structuredOutput: request.structuredOutput as any }, a.maxOutputTokens);
  assert.equal(a.inspectionBudget.bytes, Buffer.byteLength(JSON.stringify(body))); assert.ok(a.inspectionBudget.bytes <= INSPECTION_CONTEXT_BYTES);
});
test("evicts advisory findings first without trimming current evidence, history, schema or projection", () => {
  const state = { currentInspectionScope: { objective: "Required objective" }, sourceCitations: [{ excerpt: "s".repeat(76000) }],
    historicalReferenceData: { messages: [{ content: "Required follow-up" }] }, projection: { cursor: 4 },
    priorFindings: { text: "界".repeat(10000) }, groundingFeedback: { complete: false } };
  const prepared = prepareInspectionContext(input(state));
  assert.deepEqual(prepared.inspectionBudget.evicted, ["priorFindings"]);
  const result = JSON.parse(prepared.userPrompt.split("[INSPECTION STATE]\n")[1]);
  assert.equal(result.sourceCitations[0].excerpt, state.sourceCitations[0].excerpt); assert.deepEqual(result.projection, state.projection);
  assert.deepEqual(result.historicalReferenceData, state.historicalReferenceData); assert.deepEqual(result.groundingFeedback, state.groundingFeedback);
});
test("mandatory evidence above the byte ceiling fails closed instead of clipping", () => {
  assert.throws(() => prepareInspectionContext(input({ sourceCitations: [{ excerpt: "界".repeat(33000) }] })), /INSPECTION_CONTEXT_BUDGET_EXCEEDED/);
});

test("long reviews evict whole quoted assistant reports while retaining user follow-ups and exact evidence", () => {
  const state = { currentInspectionScope: { objective: "Review current source" }, sourceCitations: [{ excerpt: "s".repeat(76000) }],
    historicalReferenceData: { classification: "EXPLICIT_HISTORICAL_REFERENCE_DATA", messages: [
      { sourceRole: "user", content: "Keep my follow-up" }, { sourceRole: "assistant", content: "界".repeat(10000) },
      { sourceRole: "user", content: "Current constraints remain" }
    ] } };
  const before = structuredClone(state), prepared = prepareInspectionContext(input(state));
  const result = JSON.parse(prepared.userPrompt.split("[INSPECTION STATE]\n")[1]);
  assert.deepEqual(state, before); assert.deepEqual(result.sourceCitations, state.sourceCitations);
  assert.deepEqual(result.historicalReferenceData.messages, state.historicalReferenceData.messages.filter(m => m.sourceRole === "user"));
  assert.equal(result.historicalReferenceData.omittedAssistantMessages, 1);
  assert.deepEqual(prepared.inspectionBudget.evicted, ["historicalReferenceData.assistant"]);
  assert.ok(prepared.inspectionBudget.bytes <= INSPECTION_CONTEXT_BYTES);
});
test("required active history cannot be silently dropped to fit a model window", () => {
  assert.throws(() => prepareInspectionContext({ ...input({ sourceCitations: [{ excerpt: "x".repeat(70000) }] }),
    model: { contextWindow: 100000, maxOutputTokens: 8192 }, history: [{ role: "user", content: "Required continuation " + "x".repeat(18000) }] }), /INSPECTION_CONTEXT_BUDGET_EXCEEDED/);
});
for (const dialect of ["LLAMACPP_JSON_SCHEMA", "JSON_OBJECT_ONLY"] as const) test(`inspection schema contract: ${dialect}`, async () => {
  const gateway: any = Object.create(AiGatewayService.prototype); let captured: any;
  const schema = { type: "object", properties: { exact: { type: "string" } } };
  gateway.resolveProviderAndModel = async () => ({ provider: { id: "p", providerType: "fixture", structuredOutputDialect: dialect, defaultTimeoutMs: 120000 },
    model: { modelId: "GLM-5.2-Abliterated", contextWindow: 131072, maxOutputTokens: 8192 }, adapter: { complete: async (_: any, request: any) => {
      captured = request; return { content: "{}", metadata: { finishReason: "stop", httpClassification: "SUCCESS" } }; } } });
  await gateway.requestStructuredReasoning({ question: "Required source", systemInstruction: "Exact facts only", schema, name: "inspection", purpose: "STRUCTURED_INSPECTION",
    inspectionReasoning: { beforeAttempt: async () => {}, settled: async () => {} } });
  assert.deepEqual(captured.structuredOutput.schema, schema);
  assert.equal(captured.systemPrompt.includes(JSON.stringify(schema)), dialect !== "LLAMACPP_JSON_SCHEMA");
});
test("inspection prompt contains canonical source once and validator still rejects invented outside-source facts", async () => {
  const h = await inspectionHarness(); const body = 'export function authenticate() { return "exact"; }';
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, body); await h.service.advance(h.run.id);
  h.responses.push((request: any) => {
    const state = JSON.parse(request.question.split("[INSPECTION STATE]\n")[1]), source = state.sourceCitations[0];
    assert.equal(source.excerpt, body); assert.ok(!request.question.includes("[/Evidence]"));
    assert.equal(JSON.stringify(state).split("export function authenticate()").length - 1, 1);
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", report: {
      constraintIds: state.planningContract.constraints.map((c: any) => c.id), facts: [{ id: "f", text: "Invented outside-source fact", evidenceRef: source.evidenceRef }],
      inferences: [], hypotheses: [], unknowns: [] } });
  });
  await h.service.advance(h.run.id); assert.equal((await h.state()).understanding, undefined);
});
test("mandatory-context failure persists terminal state and reload never redispatches", async () => {
  const h = await inspectionHarness(), gateway = (h.service as any).gateway;
  gateway.requestAgentConversation = async (request: any) => { prepareInspectionContext({ ...input({ sourceCitations: [{ excerpt: "界".repeat(33000) }] }), systemPrompt: request.systemInstruction }); throw new BadRequestException("unexpected"); };
  await h.service.advance(h.run.id); const s = await h.state();
  assert.equal(s.state, "FAILED"); assert.equal(s.code, "INSPECTION_CONTEXT_BUDGET_EXCEEDED"); assert.equal(s.operations.length, 0);
  const diagnostic = [...h.tables.agentRunEvent.values()].find(e => e.eventType === "INSPECTION_FAILURE_DIAGNOSTIC")?.payload;
  assert.equal(diagnostic.code, "INSPECTION_CONTEXT_BUDGET_EXCEEDED"); assert.equal(diagnostic.stage, "context");
  assert.equal(diagnostic.category, "APPLICATION"); assert.equal(diagnostic.responseReceived, false);
  const records = h.tables.auditEvent.size; await h.newService().advance(h.run.id); assert.equal(h.tables.auditEvent.size, records);
});
