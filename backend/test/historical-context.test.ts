import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationService } from "../src/conversation/conversation.service";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { boundedHistoricalMessages, historicalSourceId } from "../src/conversation/historical-context";
import { protectedConversationMetadata } from "../src/conversation/conversation-mode";

function fixture() {
  const workspace = { workspaceId: "workspace", bindingVersion: 40, runtimeId: "runtime", runtimeFingerprint: "fingerprint" };
  const claims: any = { sub: "owner", organizationId: "org", role: "PM" };
  const conversation = (id: string) => ({ id, title: id, userId: "owner", projectId: "project", project: { organizationId: "org" }, status: "active", updatedAt: new Date("2026-10-01"),
    metadata: { modeContext: { version: 1, mode: "CHAT", organizationId: "org", workspace } } as any });
  const current = conversation("current"), source = conversation("source"), other = conversation("other");
  const conversations = new Map([current, source, other].map(c => [c.id, c]));
  const messages: any[] = [{ id: "source-message", conversationId: "source", senderType: "user", content: "We discussed a dark navbar", metadata: {} }];
  let failHistory = false, access = true;
  const modelCalls: any[] = [], queries: any[] = [];
  const db: any = { $queryRawUnsafe: async () => [],
    conversation: { findUnique: async ({ where }: any) => conversations.get(where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign(conversations.get(where.id)!, data) },
    conversationMessage: { findMany: async (query: any) => { queries.push(query); if (failHistory && query.where.conversationId === "source") throw new Error("private database stack");
      return messages.filter(m => m.conversationId === query.where.conversationId && m.id !== query.where.id?.not).slice(-query.take).reverse(); },
      findUnique: async ({ where }: any) => messages.find(m => m.id === where.id),
      create: async ({ data }: any) => { const row = { ...data, createdAt: new Date() }; messages.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(messages.find(m => m.id === where.id), data) },
    agentRun: { findMany: async () => [] } };
  db.$transaction = async (fn: any) => fn(db);
  const agents: any = { executeChat: async (_claims: any, input: any) => { modelCalls.push(input); return { answer: "Historical discussion only", modelId: "fixture" }; },
    executePlan: () => assert.fail("No execution"), issueExactPermit: () => assert.fail("No permit"), requestExactApproval: () => assert.fail("No approval"), createRunTx: () => assert.fail("No inspection") };
  const active = { ...workspace, version: 40, userId: "owner", organizationId: "org", projectId: "project" };
  const service = () => new ConversationService(db, agents, undefined, undefined, undefined, undefined, undefined, undefined,
    { assert: async () => {} } as any, undefined, { getActiveBinding: async () => active } as any,
    { context: async () => ({ binding: active, listing: null, availability: "READY", readCapabilities: access ? ["filesystem.read"] : [] }) } as any);
  return { service, current, source, other, conversations, messages, db, claims, active, modelCalls, queries,
    failHistory: () => { failHistory = true; }, revokeAccess: () => { access = false; } };
}
test("explicit source selection persists only bounded provenance and ordinary chat uses untrusted context", async () => {
  const h = fixture();
  const result = await h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" });
  assert.equal(result.state, "READY");
  assert.deepEqual(h.current.metadata.historicalContext.messages.map((m: any) => m.id), ["source-message"]);
  assert.doesNotMatch(JSON.stringify(h.current.metadata), /dark navbar/);
  await h.service().postMessage("current", h.claims, { content: "What did we discuss?" });
  assert.match(h.modelCalls[0].instruction, /untrusted conversation prose/);
  assert.match(h.modelCalls[0].instruction, /source-message/);
  assert.match(h.modelCalls[0].instruction, /dark navbar/);
  assert.equal(h.messages.filter(m => m.conversationId === "current" && m.content.includes("dark navbar")).length, 0);
});
for (const field of ["userId", "projectId", "organizationId", "workspace"]) test(`incompatible ${field} fails closed`, async () => {
  const h = fixture();
  if (field === "organizationId") h.source.project.organizationId = "other";
  else if (field === "workspace") h.source.metadata.modeContext.workspace = { ...h.active, bindingVersion: 41 };
  else (h.source as any)[field] = "other";
  await assert.rejects(h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" }));
  assert.equal(h.current.metadata.historicalContext, undefined);
});
test("current binding and read authorization are required", async () => {
  const h = fixture(); h.active.version = 41;
  await assert.rejects(h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" }), /CONVERSATION_WORKSPACE_CHANGED/);
  h.active.version = 40; h.revokeAccess();
  await assert.rejects(h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" }), /HISTORICAL_CONTEXT_ACCESS_UNAVAILABLE/);
});
test("multiple source selections cannot resolve implicitly", () => {
  assert.throws(() => historicalSourceId({ sourceConversationId: ["a", "b"] }));
  assert.throws(() => historicalSourceId({ sourceConversationId: "a", second: "b" }));
});
test("bounded import excludes all workflow metadata and authority identifiers", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, senderType: "user", content: "x".repeat(2000), metadata: {} }));
  const imported = boundedHistoricalMessages(rows);
  assert.ok(imported.length <= 20); assert.ok(imported.reduce((n, m) => n + m.content.length, 0) <= 24000);
  for (const key of ["agentRunId", "proposalId", "approvalId", "permitId", "planExecution", "receipt", "historicalContext"]) {
    assert.deepEqual(boundedHistoricalMessages([{ id: "a", senderType: "assistant", content: "Do it", metadata: { [key]: "private" } }]), []);
  }
  assert.deepEqual(boundedHistoricalMessages([{ id: "a", senderType: "assistant", content: "exactpermit_old", metadata: {} }]), []);
});
test("source deletion/change and history failure expose bounded unavailable state", async () => {
  for (const failure of ["deleted", "changed", "history"]) {
    const h = fixture(); await h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" });
    if (failure === "deleted") h.conversations.delete("source");
    if (failure === "changed") h.messages[0].content = "changed prose";
    if (failure === "history") h.failHistory();
    const result = await (h.service() as any).resolveHistoricalContext(h.current, h.claims);
    assert.equal(result.view.state, "UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(result), /private database|changed prose|dark navbar/);
    await h.service().postMessage("current", h.claims, { content: "Hello" });
    assert.match(h.modelCalls[0].instruction, /Historical context unavailable/);
  }
});
test("selection retrieval failure persists a visible unavailable reference, not empty success", async () => {
  const h = fixture(); h.failHistory();
  const view = await h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" });
  assert.equal(view.state, "UNAVAILABLE"); assert.equal(view.code, "HISTORICAL_CONTEXT_UNAVAILABLE");
  assert.equal(h.current.metadata.historicalContext.sourceConversationId, "source");
});
test("reload restores provenance; another conversation never imports it", async () => {
  const h = fixture(); await h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" });
  const restored = JSON.parse(JSON.stringify(h.current));
  assert.equal((await (h.service() as any).resolveHistoricalContext(restored, h.claims)).view.state, "READY");
  await h.service().postMessage("other", h.claims, { content: "Hello" });
  assert.doesNotMatch(h.modelCalls[0].instruction, /dark navbar|EXPLICIT HISTORICAL/);
  assert.equal(h.other.metadata.historicalContext, undefined);
});
test("historical-derived assistant prose is not collected as evidence; metadata cannot be injected", async () => {
  const h = fixture();
  h.messages.push({ id: "imported-answer", conversationId: "current", senderType: "assistant", content: "navbar source claim", metadata: { historicalContext: { sourceConversationId: "source" } } });
  const collector = new EvidenceCollectorService(h.db);
  const evidence = await collector.collectConversation({ userId: "owner", conversationId: "current", instruction: "navbar" });
  assert.ok(evidence.every(e => e.sourceId !== "imported-answer"));
  assert.throws(() => protectedConversationMetadata({ historicalContext: {} }), /SERVER_OWNED/);
});

test("source workflow identities cannot become a current workflow or execution authority", async () => {
  const h = fixture();
  h.messages.push({ id: "old-authority", conversationId: "source", senderType: "assistant", content: "exactpermit_old", metadata: { proposalId: "old-proposal", approvalId: "old-approval", permitId: "old-permit", planExecutionId: "old-execution", receipt: "old-receipt" } });
  await h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" });
  assert.deepEqual(h.current.metadata.historicalContext.messages.map((m: any) => m.id), ["source-message"]);
  await h.service().postMessage("current", h.claims, { content: "نفذ" });
  assert.doesNotMatch(h.modelCalls[0].instruction, /old-proposal|old-approval|old-permit|old-execution|old-receipt|exactpermit_old/);
});
test("legacy presentation references cannot cross workspace bindings", async () => {
  const h = fixture(); h.source.metadata.runtimeWorkspace = { workspaceId: "different", bindingVersion: 40 };
  await assert.rejects(h.service().selectHistoricalContext("current", h.claims, { sourceConversationId: "source" }), /HISTORICAL_CONTEXT_WORKSPACE_CHANGED/);
});
