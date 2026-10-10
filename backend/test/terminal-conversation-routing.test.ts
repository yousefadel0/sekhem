import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { ConversationService } from "../src/conversation/conversation.service";
import { inspectionHarness } from "./helpers/inspection-loop-harness";

const context = (): ConversationWorkflowSummary => ({ activeInspections: [], certifiedUnderstanding: null, latestPlan: null,
  execution: null, pendingApprovals: [], workspace: { workspaceId: "workspace", bindingVersion: 1, runtimeId: "runtime", runtimeFingerprint: "fingerprint" } });
test("literal node version request routes to terminal proposal before engineering inspection", () => {
  for (const text of ["Run node --version", "please run node --version"]) {
    assert.equal(resolveConversationIntent(text, context()).route, "TERMINAL_PROPOSAL");
  }
  for (const text of ["Read package.json", "Inspect README.md"]) assert.equal(resolveConversationIntent(text, context()).route, "INSPECTION");
  assert.equal(resolveConversationIntent("Hello", context()).route, "CONVERSATION");
  for (const text of ["Do not run node --version", "Run node --version && whoami", "Run node --version; whoami"])
    assert.notEqual(resolveConversationIntent(text, context()).route, "TERMINAL_PROPOSAL");
  assert.equal(resolveConversationIntent("Run node --version", { ...context(), workspace: null }).route, "UNAVAILABLE");
});

async function fixture(mode: "AGENT" | "CHAT", capability = true) {
  const h = await inspectionHarness();
  const conversation = h.tables.conversation.get("conversation-a");
  conversation.metadata = { ...conversation.metadata, modeContext: { version: 1, mode, organizationId: h.claims.organizationId,
    workspace: { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version, runtimeId: h.device.runtimeId, runtimeFingerprint: h.device.fingerprint } } };
  if (capability) await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "terminal.execute"]);
  const service: any = Object.create(ConversationService.prototype);
  service.prisma = h.db; service.workspaceRuntime = h.runtime; service.runtimeControl = h.control;
  service.workflowSummary = async () => ({ ...context(), workspace: conversation.metadata.modeContext.workspace });
  service.agentRuntimeService = { planFromConversation: () => assert.fail("must not invoke grounded engineering planner"),
    createRunTx: () => assert.fail("must not create inspection"), scheduleRunExecution: () => assert.fail("must not dispatch") };
  return { ...h, service };
}

test("Terminal surface enters the same governed conversation proposal; no permit or execution", async () => {
  const h = await fixture("CHAT");
  const dto = { content: "Terminal command for review: node --version", metadata: { clientMessageId: "panel-request" },
    terminalAction: { executable: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", "node --version"], timeoutMs: 30000 } };
  const result = await h.service.postMessage("conversation-a", h.claims, dto);
  const snapshot = await h.control.snapshot(h.claims, result.agentRunId);
  assert.equal(snapshot!.proposal.state, "AWAITING_APPROVAL");
  assert.deepEqual(snapshot!.proposal.validatedInput, { ...dto.terminalAction, cwd: h.binding.rootPath });
  assert.equal(h.tables.agentPlan.get(snapshot!.proposal.planId).status, "PLAN_READY");
  assert.equal(snapshot!.execution, null); assert.equal(h.calls.length, 0);
  const count = h.tables.auditEvent.size;
  assert.equal((await h.service.postMessage("conversation-a", h.claims, dto)).agentRunId, result.agentRunId);
  assert.equal(h.tables.auditEvent.size, count);
  const denied = await fixture("CHAT", false);
  await assert.rejects(() => denied.service.postMessage("conversation-a", denied.claims, dto), /RUNTIME_CAPABILITY/);
  await assert.rejects(() => h.service.postMessage("conversation-a", h.claims, { ...dto, terminalAction: { ...dto.terminalAction, cwd: "C:\\other" } }), /TERMINAL_INPUT_INVALID/);
});

for (const mode of ["CHAT", "AGENT"] as const) test(`${mode} enters governed terminal plan/proposal awaiting approval without execution`, async () => {
  const h = await fixture(mode);
  const before = new Set(h.tables.auditEvent.keys());
  const dto = { content: "Run node --version", metadata: { clientMessageId: "terminal-request" } };
  const result = await h.service.postMessage("conversation-a", h.claims, dto);
  assert.equal(result.status, "AWAITING_APPROVAL");
  assert.equal(result.conversationId, "conversation-a");
  assert.equal(h.tables.conversation.size, 1);
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.mode, "AGENT");
  const snapshot = await h.control.snapshot(h.claims, result.agentRunId);
  assert.equal(snapshot!.proposal.toolId, "terminal.execute");
  assert.equal(snapshot!.proposal.state, "AWAITING_APPROVAL");
  assert.deepEqual(snapshot!.proposal.validatedInput, { executable: "node", args: ["--version"], cwd: h.binding.rootPath, timeoutMs: 30000 });
  assert.equal(snapshot!.execution, null);
  assert.equal(h.tables.agentPlan.get(snapshot!.proposal.planId).status, "PLAN_READY");
  const added = [...h.tables.auditEvent].filter(([id]) => !before.has(id));
  assert.ok(added.every(([, r]) => !/PERMIT|EXECUTION/.test(r.metadata.recordType)));
  const count = h.tables.auditEvent.size;
  const replay = await h.service.postMessage("conversation-a", h.claims, dto);
  assert.equal(replay.agentRunId, result.agentRunId); assert.equal(h.tables.auditEvent.size, count);
  assert.equal(h.calls.length, 0);
});

test("terminal routing preserves missing capability without promoting the conversation", async () => {
  for (const mode of ["CHAT", "AGENT"] as const) {
    const h = await fixture(mode, false);
    await assert.rejects(() => h.service.postMessage("conversation-a", h.claims,
      { content: "Run node --version", metadata: { clientMessageId: "blocked-terminal" } }), /RUNTIME_CAPABILITY/);
    assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.mode, mode);
    assert.equal(h.calls.length, 0);
  }
});

test("direct terminal API still rejects CHAT; a client cannot supply lifecycle authority", async () => {
  const h = await fixture("CHAT");
  const body = { conversationId: "conversation-a", projectId: "project-a", runtimeId: h.device.runtimeId,
    tool: "terminal.execute" as const, input: { executable: "node", args: ["--version"], cwd: h.binding.rootPath, timeoutMs: 30000 }, purpose: "Run node --version", requestId: "direct" };
  await assert.rejects(() => h.control.propose(h.claims, body), /AGENT_CONVERSATION_REQUIRED/);
  await assert.rejects(() => h.control.propose(h.claims, { ...body, agentTransition: h.binding } as any), /RUNTIME_PROPOSAL_INVALID/);
});

test("missing session authority cannot transition CHAT or create a terminal proposal", async () => {
  const h = await fixture("CHAT");
  h.tables.userSession.get(h.claims.sessionId).revokedAt = new Date();
  await assert.rejects(() => h.service.postMessage("conversation-a", h.claims,
    { content: "Run node --version", metadata: { clientMessageId: "revoked-session" } }));
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.mode, "CHAT");
  assert.equal([...h.tables.agentRun.values()].filter(r => r.id.startsWith("rtrun_") && r.status === "AWAITING_APPROVAL").length, 0);
});

test("stale binding cannot enter Agent lifecycle", async () => {
  const h = await fixture("CHAT");
  const c = h.tables.conversation.get("conversation-a");
  c.metadata.modeContext.workspace.bindingVersion++;
  await assert.rejects(() => h.service.postMessage("conversation-a", h.claims,
    { content: "Run node --version", metadata: { clientMessageId: "stale-binding" } }), /WORKSPACE_BINDING_CHANGED/);
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.mode, "CHAT");
});

test("proposal rejection rolls back internal transition and leaves runtime authority untouched", async () => {
  const h = await fixture("CHAT");
  const before = structuredClone([...h.tables.auditEvent]);
  // Inject a late authorization denial to verify the shared transaction boundary.
  h.control.authorization.authorize = async () => ({ status: "BLOCKED", code: "SCOPE_VIOLATION" }) as any;
  await assert.rejects(() => h.service.postMessage("conversation-a", h.claims,
    { content: "Run node --version", metadata: { clientMessageId: "late-denial" } }), /SCOPE_VIOLATION/);
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.mode, "CHAT");
  assert.deepEqual([...h.tables.auditEvent], before);
});
