import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionReasoningRetry } from "../src/ai-gateway/inspection-reasoning-retry";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";

function transport(code = "CLIENT_DEADLINE", stage = "REQUEST", classification = "TIMEOUT") {
  return Object.assign(new Error("fixture"), { providerDiagnostic: { failureCode: code, failureStage: stage, httpClassification: classification, httpStatus: null } });
}
function fixture() {
  let time = 1000;
  const starts: any[] = [], ends: any[] = [], budgets: number[] = [];
  return { starts, ends, budgets, advance: (ms: number) => { time += ms; },
    run: <T>(invoke: (ms: number) => Promise<T>) => inspectionReasoningRetry({ request: { question: "fixed request", schema: { type: "object" } },
      timeoutMs: 300_000, now: () => time, lifecycle: { beforeAttempt: async s => { starts.push(s); }, settled: async s => { ends.push(s); } },
      invoke: ms => { budgets.push(ms); return invoke(ms); } }) };
}

test("eligible early timeout retries once with identical identity and only remaining deadline", async () => {
  const h = fixture(); let calls = 0;
  const result = await h.run(async () => { if (++calls === 1) { h.advance(40_000); throw transport(); } return "valid"; });
  assert.equal(result, "valid"); assert.equal(calls, 2); assert.deepEqual(h.budgets, [300_000, 260_000]);
  assert.equal(h.starts[0].requestId, h.starts[1].requestId); assert.equal(h.starts[0].deadlineAt, h.starts[1].deadlineAt);
  assert.equal(h.ends[0].terminalReason, "RESPONSE_RECEIVED");
});
test("full first deadline has no retry", async () => {
  const h = fixture();
  await assert.rejects(h.run(async () => { h.advance(300_000); throw transport(); }), /fixture/);
  assert.equal(h.starts.length, 1); assert.equal(h.ends[0].terminalReason, "DEADLINE_EXHAUSTED");
});
test("retry exhaustion persists timeout without extending the overall deadline", async () => {
  const h = fixture();
  await assert.rejects(h.run(async ms => { h.advance(h.starts.length === 1 ? 10 : ms); throw transport(); }), e => (e as any).inspectionReasoningFailure === "INSPECTION_REASONING_TIMEOUT");
  assert.equal(h.starts.length, 2); assert.deepEqual(h.budgets, [300_000, 299_990]); assert.equal(h.ends[0].terminalReason, "DEADLINE_EXHAUSTED");
});
test("second early transport failure never gets a third attempt", async () => {
  const h = fixture(); await assert.rejects(h.run(async () => { h.advance(1); throw transport("ECONNRESET", "REQUEST", "PROVIDER_ERROR"); }));
  assert.equal(h.starts.length, 2); assert.equal(h.ends[0].terminalReason, "TRANSPORT_FAILURE");
});
for (const [code, stage, classification, reason] of [
  ["HTTP_REJECTION", "REQUEST", "UNAUTHORIZED", "TRANSPORT_FAILURE"],
  ["INVALID_CONTENT", "RESPONSE_CONTENT", "INVALID_SCHEMA", "MALFORMED_RESPONSE"],
  ["INVALID_JSON", "RESPONSE_BODY", "INVALID_JSON", "MALFORMED_RESPONSE"],
  ["INVALID_CONTENT", "RESPONSE_CONTENT", "SUCCESS", "MODEL_REJECTION"],
  ["CERT_HAS_EXPIRED", "REQUEST", "PROVIDER_ERROR", "TRANSPORT_FAILURE"]
]) test(`no retry for ${classification}/${stage}/${code}`, async () => {
  const h = fixture(); await assert.rejects(h.run(async () => { throw transport(code, stage, classification); }));
  assert.equal(h.starts.length, 1); assert.equal(h.ends[0].terminalReason, reason);
});
test("late response cannot become success after the overall deadline", async () => {
  const h = fixture(); await assert.rejects(h.run(async () => { h.advance(300_001); return "late"; }));
  assert.equal(h.ends[0].terminalReason, "DEADLINE_EXHAUSTED");
});
test("a received response cannot become retry-eligible through a transport label", async () => {
  const h = fixture(), error = transport(); Object.assign(error.providerDiagnostic, { finishReason: "stop" });
  await assert.rejects(h.run(async () => { throw error; })); assert.equal(h.starts.length, 1);
});

test("production structured gateway passes remaining time and unchanged model payload on retry", async () => {
  const gateway: any = Object.create(AiGatewayService.prototype), calls: any[] = [], states: any[] = [];
  let time = 1000;
  const originalNow = Date.now;
  Date.now = () => time;
  try {
    gateway.resolveProviderAndModel = async () => ({ provider: { id: "provider", providerType: "fixture", defaultTimeoutMs: 120_000,
      structuredOutputDialect: "LLAMACPP_JSON_SCHEMA", baseUrl: "https://fixture.invalid", apiKey: "fixture" },
      model: { modelId: "GLM-5.2-Abliterated", contextWindow: 131072, maxOutputTokens: 8192 }, adapter: {
        complete: async (configuration: any, request: any) => {
          calls.push({ configuration, request });
          if (calls.length === 1) { time += 40_000; throw Object.assign(new Error("fixture timeout"), { vllmMetadata: {
            httpClassification: "TIMEOUT", failureStage: "REQUEST", failureCode: "CLIENT_DEADLINE", durationMs: 40_000 } }); }
          return { content: "{}", metadata: { finishReason: "stop", httpClassification: "SUCCESS", httpStatus: 200 } };
        }
      } });
    assert.equal(await gateway.requestStructuredReasoning({ question: "fixed source-only request", systemInstruction: "Keep exact facts.",
      schema: { type: "object" }, name: "inspection_decision", purpose: "STRUCTURED_INSPECTION",
      inspectionReasoning: { beforeAttempt: async (s: any) => { states.push(s); }, settled: async () => {} } }), "{}");
    assert.deepEqual(calls.map(c => c.configuration.timeoutMs), [300_000, 260_000]);
    assert.deepEqual(calls[0].request, calls[1].request); assert.equal(states[0].requestId, states[1].requestId);
  } finally { Date.now = originalNow; }
});
test("production conversational gateway matches the 300s inspection ceiling and never retries a full deadline", async () => {
  const gateway: any = Object.create(AiGatewayService.prototype); let time = 1000, calls = 0; const ends: any[] = [];
  const originalNow = Date.now; Date.now = () => time;
  try {
    gateway.resolveProviderAndModel = async () => ({ provider: { id: "provider", providerType: "fixture", defaultTimeoutMs: 120_000 },
      model: { modelId: "GLM-5.2-Abliterated", contextWindow: 131072, maxOutputTokens: 8192 }, adapter: {
        complete: async (configuration: any) => { calls++; assert.equal(configuration.timeoutMs, 300_000); time += 300_000;
          throw Object.assign(new Error("fixture timeout"), { vllmMetadata: { httpClassification: "TIMEOUT", failureStage: "REQUEST", failureCode: "CLIENT_DEADLINE", durationMs: 300_000 } }); }
      } });
    await assert.rejects(gateway.requestAgentConversation({ question: "review source", systemInstruction: "ground claims",
      inspectionReasoning: { beforeAttempt: async () => {}, settled: async (s: any) => { ends.push(s); } } }),
      (e: any) => e.inspectionReasoningFailure === "INSPECTION_REASONING_TIMEOUT");
    assert.equal(calls, 1); assert.equal(ends[0].terminalReason, "DEADLINE_EXHAUSTED");
  } finally { Date.now = originalNow; }
});

function attachRetry(h: Awaited<ReturnType<typeof inspectionHarness>>) {
  const gateway = (h.service as any).gateway;
  for (const name of ["requestStructuredReasoning", "requestAgentConversation"]) {
    const original = gateway[name].bind(gateway);
    gateway[name] = (input: any) => inspectionReasoningRetry({ request: { question: input.question, schema: input.schema }, timeoutMs: name === "requestStructuredReasoning" ? 300_000 : 120_000,
      lifecycle: input.inspectionReasoning, invoke: () => original(input) });
  }
}
test("early retry dispatches one read, one read permit and no second AgentRun; replay does not redispatch", async () => {
  const h = await inspectionHarness(); attachRetry(h);
  const runs = h.tables.agentRun.size;
  const permitsBefore = [...h.tables.auditEvent.values()].filter((r: any) => r.metadata?.recordType === "RUNTIME_PERMIT_CONSUMPTION").length;
  h.responses.push(() => { throw transport(); }, h.inspect("filesystem.read", "session.ts"));
  await h.service.advance(h.run.id);
  let s = await h.state(); assert.equal(s.reasoningRequest?.attempts, 2); assert.equal(s.operations.length, 1);
  const requests = h.calls; assert.equal(requests.length, 2);
  await h.approve(); const execution = (await h.request("poll")).execution; assert.ok(execution);
  const runCount = h.tables.agentRun.size; assert.equal(runCount, runs);
  const permitCount = [...h.tables.auditEvent.values()].filter((r: any) => r.metadata?.recordType === "RUNTIME_PERMIT_CONSUMPTION").length;
  assert.equal(permitCount, permitsBefore + 1);
  await h.service.advance(h.run.id); assert.equal(h.calls.length, 2); assert.equal(h.tables.agentRun.size, runCount);
  assert.equal((await h.request("poll")).execution, null);
});
test("post-read retry failure persists terminal reason; reload cannot reread or retry", async () => {
  const h = await inspectionHarness(); attachRetry(h);
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "export function authenticate() {}"); await h.service.advance(h.run.id);
  const runs = h.tables.agentRun.size;
  const authorityCounts = () => [h.tables.agentApproval.size, h.tables.agentPlan.size,
    ...["RUNTIME_PROPOSAL", "RUNTIME_EXECUTION", "RUNTIME_PERMIT_CONSUMPTION"].map(type =>
      [...h.tables.auditEvent.values()].filter((r: any) => r.metadata?.recordType === type).length)];
  const authorityBefore = authorityCounts();
  h.responses.push(() => { throw transport(); }, () => { throw transport(); });
  await h.service.advance(h.run.id);
  const s = await h.state(); assert.equal(s.state, "FAILED"); assert.equal(s.code, "INSPECTION_REASONING_TIMEOUT");
  assert.equal(s.reasoningRequest?.attempts, 2); assert.equal(s.reasoningRequest?.terminalReason, "TRANSPORT_TIMEOUT");
  assert.equal(s.operations.length, 1); assert.equal(s.operations[0].verification, "VERIFIED"); assert.equal(s.understanding, undefined);
  assert.deepEqual(authorityCounts(), authorityBefore);
  const calls = h.calls.length, records = h.tables.auditEvent.size; await h.newService().advance(h.run.id);
  assert.equal(h.calls.length, calls); assert.equal(h.tables.agentRun.size, runs); assert.equal(h.tables.auditEvent.size, records);
  assert.equal((await h.request("poll")).execution, null);
  const restored = await h.newService().view(h.run.id, h.claims);
  assert.equal(restored?.state, "FAILED"); assert.equal(restored?.code, "INSPECTION_REASONING_TIMEOUT");
});
