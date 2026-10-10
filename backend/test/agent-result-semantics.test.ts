import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ForbiddenException, Logger } from "@nestjs/common";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { interpretContext, type AgentPlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { ConversationService } from "../src/conversation/conversation.service";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { VllmOpenAiCompatibleAdapter } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { ProviderAdapterRegistry } from "../src/ai-gateway/provider-adapter.registry";
import type { SessionClaims } from "../src/auth/auth.dto";

const claims = { sub: "user", role: "PM", organizationId: "org" } as SessionClaims;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Mode = "ready" | "evidence" | "input" | "provider" | "provider-http" | "length" | "empty-length" | "json" | "incomplete-json" | "shape" | "denied" | "auth" | "internal" | "cancel" | "pause" | "cancel-internal" | "pause-internal" | "cancel-success" | "pause-success";

async function fixture(mode: Mode) {
  const understanding = new AgentUnderstandingService(), serializer = new AgentContextSerializerService();
  const instruction = mode === "input" ? "Fix authentication." : "Inspect authentication in this workspace";
  const context = understanding.understand({ userId: "user", projectId: "project", instruction, availableCapabilities: ["workspace_reader"], workspaceAvailable: true });
  const ref = "project:src/auth.ts";
  if (mode !== "evidence") context.evidence = [{ sourceType: "workspace", sourceId: "project", relativePath: "src/auth.ts", provenance: ref,
    status: mode === "denied" ? "DENIED" : "COLLECTED", metadata: {}, warnings: [],
    ...(mode === "denied" ? {} : { content: { text: "return validateSession();", extractorId: "text", detectedMime: "text/plain", truncated: false } }) }];
  const visible = new Map<string, string>(); serializer.forReasoning(context, visible);
  const proposal: AgentPlanningProposal = { constraintIds: interpretContext(context, visible).constraints.map(c => c.id),
    facts: [{ id: "fact-1", text: "return validateSession();", evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [],
    steps: [{ id: "step-1", type: "ANALYZE", purpose: "UNDERSTAND", evidenceRefs: [ref], missingInformationIds: [], dependencies: [],
      scopeRefs: ["scope-1"], verificationCriterionIds: ["grounding"], effect: "READ_ONLY", dependencyStatus: "KNOWN" }] };
  let run: any, plan: any, calls = 0, deny = false;
  const events: any[] = [], messages: any[] = [];
  const matches = (where: any) => run && run.id === where.id && (!where.status || (typeof where.status === "string" ? run.status === where.status : where.status.in.includes(run.status)));
  const db: any = {
    $transaction: async (fn: any) => fn(db),
    agentRun: {
      create: async ({ data }: any) => (run = clone(data)),
      findUnique: async ({ include }: any) => clone({ ...run, ...(include?.plans ? { plans: [plan] } : {}), approvals: [] }),
      findMany: async () => [clone({ ...run, plans: [plan] })],
      update: async ({ where, data }: any) => { if (!matches(where)) throw Error("Conditional update rejected"); run = { ...run, ...clone(data) }; return clone(run); },
      updateMany: async ({ where, data }: any) => { if (!matches(where)) return { count: 0 }; run = { ...run, ...clone(data) }; return { count: 1 }; }
    },
    agentPlan: { create: async ({ data }: any) => (plan = clone(data)), update: async ({ data }: any) => (plan = { ...plan, ...clone(data) }) },
    agentRunEvent: { create: async ({ data }: any) => { events.push(clone(data)); return data; } },
    conversation: {
      findUnique: async () => ({ id: "conversation", userId: "user", projectId: "project", messages: clone(messages), agentRuns: run ? [clone({ ...run, plans: [plan] })] : [] }),
      update: async () => ({ id: "conversation" })
    },
    conversationMessage: {
      findUnique: async ({ where }: any) => messages.find(m => m.id === where.id),
      create: async ({ data }: any) => { messages.push(clone(data)); return data; }
    }
  };
  let runtime: AgentRuntimeService;
  const adapter = new VllmOpenAiCompatibleAdapter(async () => {
    calls++;
    if (mode === "cancel" || mode === "cancel-success") await runtime.cancelRun(run.id, claims, {});
    if (mode === "pause" || mode === "pause-success") await runtime.pauseRun(run.id, claims, {});
    if (["provider", "cancel", "pause"].includes(mode)) throw Error("private-provider-detail credential=do-not-log");
    if (mode === "provider-http") return new Response("private-provider-detail", { status: 403 });
    const content = mode === "json" ? "not JSON" : mode === "incomplete-json" ? JSON.stringify(proposal).slice(0, -4) : mode === "shape" ? '{"answer":"not a plan"}' : mode === "empty-length" ? "" : JSON.stringify(proposal);
    return Response.json({ choices: [{ message: { content }, finish_reason: mode.includes("length") ? "length" : "stop" }] });
  });
  const configuration = {
    providers: async () => [{ id: "provider", enabled: true, healthState: "healthy" }],
    providerForUse: async () => ({ id: "provider", providerType: adapter.providerType, baseUrl: "https://provider.invalid", apiKey: null, defaultTimeoutMs: 1000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" }),
    models: async () => [{ modelId: "model", enabled: true, defaultForProvider: true, contextWindow: 262144, maxOutputTokens: 512 }]
  };
  const gateway = new AiGatewayService({ reviewRequest: () => assert.fail("No preview policy in live planning") } as never, {} as never, {} as never, {} as never, {} as never, "mock", configuration as never, adapter, new ProviderAdapterRegistry(adapter));
  const registry = { getAvailableSkills: () => [{ id: "workspace_reader", name: "Read workspace", requiresApproval: false }],
    getSkill: () => assert.fail("Planning cannot dispatch skills"), getAiGateway: () => gateway };
  const builder = new AgentContextBuilderService(understanding, {} as never, serializer);
  builder.build = async () => {
    if (mode === "cancel-internal") await runtime.cancelRun(run.id, claims, {});
    if (mode === "pause-internal") await runtime.pauseRun(run.id, claims, {});
    if (mode.includes("internal")) throw Error("private-internal-detail credential=do-not-log");
    return context;
  };
  const authz = { assertAuthorized: async (_subject: any, action: string) => { if (deny && action === "EXECUTE") throw new ForbiddenException("private-authorization-detail"); }, buildDatabaseScopeFilter: async () => ({}) };
  const audit = { recordWithClaims: async () => {}, recordWithClaimsTx: async () => {} };
  const makeRuntime = () => new AgentRuntimeService(registry as never, authz as never, audit as never, db, new ConversationService(db), gateway, undefined, undefined, understanding, builder);
  runtime = makeRuntime(); runtime.scheduleRunExecution = () => {};
  await runtime.createRun(claims, { projectId: "project", conversationId: "conversation", instruction });
  deny = mode === "auth";
  return { runtime, execute: () => runtime.executeRun(run.id, claims), calls: () => calls, events, messages,
    run: () => run, plan: () => plan,
    reload: async () => { run = clone(run); plan = clone(plan); return makeRuntime().getRun(run.id, claims); },
    conversation: () => new ConversationService(db).getConversation("conversation", "user"),
    list: () => makeRuntime().listRuns(claims)
  };
}

describe("P1-A authoritative Agent result semantics", () => {
  beforeEach(t => { t.mock.method(Logger.prototype, "log", () => undefined); });

  const cases: Array<[Mode, string, string]> = [
    ["ready", "PLAN_READY", "COMPLETED"], ["evidence", "NEEDS_EVIDENCE", "COMPLETED"], ["input", "NEEDS_USER_INPUT", "COMPLETED"],
    ["provider", "PROVIDER_FAILED", "FAILED"], ["length", "OUTPUT_TRUNCATED", "FAILED"], ["empty-length", "OUTPUT_TRUNCATED", "FAILED"],
    ["provider-http", "PROVIDER_FAILED", "FAILED"], ["incomplete-json", "INVALID_STRUCTURED_OUTPUT", "FAILED"],
    ["json", "INVALID_STRUCTURED_OUTPUT", "FAILED"], ["shape", "INVALID_STRUCTURED_OUTPUT", "FAILED"],
    ["denied", "BLOCKED", "FAILED"], ["auth", "BLOCKED", "FAILED"], ["internal", "FAILED", "FAILED"],
    ["cancel", "CANCELLED", "CANCELLED"], ["pause", "PAUSED", "PAUSED"],
    ["cancel-internal", "CANCELLED", "CANCELLED"], ["pause-internal", "PAUSED", "PAUSED"],
    ["cancel-success", "CANCELLED", "CANCELLED"], ["pause-success", "PAUSED", "PAUSED"]
  ];
  for (const [mode, outcome, lifecycle] of cases) {
    it(`${mode} persists ${outcome} across detail, list and Conversation reload`, async () => {
      const h = await fixture(mode); await h.execute();
      assert.equal(h.run().status, lifecycle);
      const reloaded = await h.reload();
      assert.equal((reloaded as any).outcome, outcome);
      assert.equal(((await h.conversation()).agentRuns[0] as any).outcome, outcome);
      assert.equal(((await h.list())[0] as any).outcome, outcome);
      if (["evidence", "input", "denied", "auth", "internal", "cancel-internal", "pause-internal"].includes(mode)) assert.equal(h.calls(), 0);
      else assert.equal(h.calls(), 1);
      if (mode === "ready") {
        assert.equal(reloaded.presentation?.planning?.plan.readiness, "PLAN_READY");
        assert.equal(reloaded.presentation?.planning?.plan.authorization, "NOT_GRANTED");
        assert.equal(h.messages[0].metadata.outcome, "PLAN_READY");
      }
      if (lifecycle === "FAILED") {
        assert.equal(h.events.some(e => e.eventType === "STATUS_CHANGE" && e.payload.newStatus === "COMPLETED"), false);
        assert.equal(h.events.some(e => e.eventType === "UNDERSTANDING_COMPLETED"), false);
        assert.equal(h.events.some(e => e.eventType === "PLAN_CREATED"), false);
        assert.equal(h.events.findLast(e => e.eventType === "STATUS_CHANGE")?.payload.outcome, outcome);
        assert.notEqual(h.run().progressPercent, 100);
      }
      if (lifecycle === "CANCELLED" || lifecycle === "PAUSED") {
        assert.equal(h.messages.length, 0, "A late provider result must not publish a completion memo");
        assert.equal(h.events.some(e => e.eventType === "STATUS_CHANGE" && e.payload.newStatus === "COMPLETED"), false);
      }
      assert.doesNotMatch(JSON.stringify({ events: h.events, messages: h.messages, run: h.run() }), /private-provider-detail|private-internal-detail|private-authorization-detail|credential=do-not-log|Analysis completed/);
      await h.execute();
      assert.ok(h.calls() <= 1, "No automatic retry after terminal/pause outcome");
    });
  }

  it("persists the failure cause in plan data and its assistant message", async () => {
    const h = await fixture("length"); await h.execute();
    assert.equal(h.plan().status, "PLAN_NOT_READY");
    assert.equal(h.plan().steps[0].parameters.outcome, "OUTPUT_TRUNCATED");
    assert.equal(h.messages[0].metadata.outcome, "OUTPUT_TRUNCATED");
    assert.match(h.messages[0].content, /OUTPUT_TRUNCATED/);
    assert.doesNotMatch(h.messages[0].content, /Needs information:|Analysis completed/);
  });

  it("reads legacy completed non-ready failures without inventing a user requirement", async () => {
    const h = await fixture("provider"); await h.execute();
    h.run().status = "COMPLETED"; h.run().failureReason = null;
    const parameters = h.plan().steps[0].parameters;
    delete parameters.outcome;
    parameters.planning.plan.validation.issues = [{ code: "STRUCTURED_OUTPUT_UNAVAILABLE", path: "$" }];
    assert.equal((await h.reload()).outcome, "FAILED");
    assert.equal((await h.conversation()).agentRuns[0].outcome, "FAILED");
  });
});
