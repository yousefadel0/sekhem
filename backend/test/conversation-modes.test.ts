import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent } from "../src/conversation/conversation-intent-resolver";
import { ConversationService } from "../src/conversation/conversation.service";
import { assertConversationTool, requestsConversationExecution, transferredConversation } from "../src/conversation/conversation-mode";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { citationSources } from "../src/agent-runtime/inspection/inspection-grounding";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { ConflictException } from "@nestjs/common";

async function legacyTransfer(h: any) {
  const source = h.tables.conversation.get("conversation-a"), messageId = "legacy-source-message", id = "legacy-agent";
  const evidence = (await h.state()).references ?? [];
  await h.db.conversationMessage.create({data:{id:messageId,conversationId:source.id,senderId:h.claims.sub,senderType:"user",content:"Legacy request",metadata:{agentConversationId:id}}});
  await h.db.conversation.create({data:{id,userId:source.userId,projectId:source.projectId,title:"Legacy Agent",status:"active",metadata:{modeContext:{...structuredClone(source.metadata.modeContext),mode:"AGENT",source:{conversationId:source.id,messageId,contextMessageIds:[],evidence}}}}});
  return {agentConversationId:id,messageId};
}

async function fixture() {
  const h = await inspectionHarness(), scheduled: string[] = [];
  const findConversation = h.db.conversation.findUnique;
  h.db.conversation.findUnique = async (arg: any) => { const row = await findConversation(arg); if (row && arg.include?.messages) return { ...row, messages: [...h.tables.conversationMessage.values()].filter(m => m.conversationId === row.id), agentRuns: [...h.tables.agentRun.values()].filter(r => r.conversationId === row.id) }; return row; };
  const agents: any = { inspectionView: async (id: string, claims: any) => id === h.run.id ? h.service.view(id, claims) : null,
    createRunTx: async (_tx: any, _claims: any, body: any) => { assert.equal(body.conversationId, "conversation-a"); return { id: "read-run", status: "QUEUED" }; },
    scheduleRunExecution: (id: string) => scheduled.push(id), executeChat: async () => ({ answer: "Hello", providerId: "fixture", modelId: "fixture" }) };
  const service = new ConversationService(h.db, agents, undefined, undefined, undefined, undefined, undefined, new ExecutionModeDetectorService(), undefined, undefined, h.store);
  const create = (mode: "CHAT" | "AUTOMATION" = "CHAT") => service.createConversation(h.claims.sub, { projectId: "project-a", title: mode, mode }, h.claims);
  const source = await create();
  // Reuse the fixture's genuine inspection conversation so its receipts retain original identity.
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: { modeContext: source.modeContext }, title: "Source" } });
  const transfer = (clientMessageId = "transfer-one", content = "Modify src/auth/session.ts to add a comment.") => service.postMessage("conversation-a", h.claims, { content, metadata: { clientMessageId } }) as Promise<any>;
  return { ...h, conversations: service, agents, scheduled, create, transfer };
}

test("hello with the current binding reaches Chat without changing Runtime ledger or scheduling work", async () => {
  const h = await fixture(), before = JSON.stringify([...h.tables.auditEvent]), runs = h.tables.agentRun.size;
  let calls = 0;
  h.agents.executeChat = async (_claims: any, input: any) => { calls++;
    assert.match(input.instruction, /WORKSPACE VISIBILITY/); assert.doesNotMatch(input.instruction, /session\.ts/);
    assert.match(input.instruction, /not source contents or authorization/);
    assert.match(input.instruction, /This connection observation did not read any file contents/);
    assert.doesNotMatch(input.instruction, /sourceContentReadByThisObservation|bindingVersion|workspaceId|runtimeFingerprint/);
    return { answer: "Hello", modelId: "fixture" }; };
  const reply: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "hello" });
  assert.equal(reply.content, "Hello"); assert.equal(calls, 1);
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.workspace.workspaceId, h.binding.workspaceId);
  assert.equal(h.tables.conversation.get("conversation-a").metadata.modeContext.workspace.bindingVersion, h.binding.version);
  assert.doesNotMatch(reply.content, /sourceContentReadByThisObservation|workspaceId|bindingVersion/);
  assert.equal(JSON.stringify([...h.tables.auditEvent]), before); assert.equal(h.tables.agentRun.size, runs);
  assert.deepEqual(h.scheduled, []);
});

test("reopening the active folder reuses the binding and does not stale the current conversation", async () => {
  const h = await fixture(), original = structuredClone(h.tables.conversation.get("conversation-a"));
  const { workspaceId, version, revision, status, verifiedAt, verificationReceiptId, createdAt, updatedAt, ...scope } = h.binding;
  const current = await h.store.createBinding({ ...scope }, "explicit-reopen");
  assert.equal(current.workspaceId, workspaceId); assert.equal(current.version, version);
  let modelCalls = 0;
  h.agents.executeChat = async () => { modelCalls++; return { answer: "Hello" }; };
  const reply: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "hello" });
  assert.equal(reply.content, "Hello"); assert.equal(modelCalls, 1);
  const restored = await h.conversations.getConversation("conversation-a", h.claims.sub, h.claims);
  assert.deepEqual(restored.modeContext, original.metadata.modeContext);
  assert.deepEqual(h.tables.conversation.get("conversation-a").metadata, original.metadata);
});

test("explicit workspace switch preserves old conversations and binds new Chat to the current workspace", async () => {
  const h = await fixture(), original = structuredClone(h.tables.conversation.get("conversation-a"));
  const { workspaceId, version, revision, status, verifiedAt, verificationReceiptId, createdAt, updatedAt, ...scope } = h.binding;
  const current = await h.store.createBinding({ ...scope, rootPath: "D:\\OtherFixture" }, "explicit-switch");
  assert.equal(current.version, version + 1); assert.notEqual(current.workspaceId, workspaceId);
  const messages = h.tables.conversationMessage.size, ledger = JSON.stringify([...h.tables.auditEvent]);
  let modelCalls = 0;
  h.agents.executeChat = async () => { modelCalls++; return { answer: "Hello" }; };
  await assert.rejects(h.conversations.postMessage("conversation-a", h.claims, { content: "hello" }), /CONVERSATION_WORKSPACE_CHANGED/);
  assert.equal(modelCalls, 0); assert.equal(h.tables.conversationMessage.size, messages);
  const restored = await h.conversations.getConversation("conversation-a", h.claims.sub, h.claims);
  assert.deepEqual(restored.modeContext, original.metadata.modeContext);
  assert.equal(JSON.stringify([...h.tables.auditEvent]), ledger);
  const created = await h.create(), reply: any = await h.conversations.postMessage(created.id, h.claims, { content: "hello" });
  assert.equal(reply.content, "Hello"); assert.equal(modelCalls, 1);
  const reloaded = await h.conversations.getConversation(created.id, h.claims.sub, h.claims);
  assert.equal(reloaded.modeContext!.workspace!.workspaceId, current.workspaceId);
  assert.equal(reloaded.modeContext!.workspace!.bindingVersion, current.version);
  assert.deepEqual(h.tables.conversation.get("conversation-a").metadata, original.metadata);
  assert.equal(JSON.stringify([...h.tables.auditEvent]), ledger); assert.deepEqual(h.scheduled, []);
});

test("stale conversation rejection exposes only a specific recoverable 409 code", () => {
  let status: number | undefined, body: any;
  const response = { status: (value: number) => { status = value; return response; }, json: (value: any) => { body = value; } };
  const host: any = { switchToHttp: () => ({ getResponse: () => response }) };
  const filter = new ApiExceptionFilter();
  filter.catch(new ConflictException("CONVERSATION_WORKSPACE_CHANGED"), host);
  assert.equal(status, 409); assert.equal(body.errors[0].code, "CONVERSATION_WORKSPACE_CHANGED");
  assert.match(body.errors[0].message, /Start a new Chat/); assert.match(body.errors[0].message, /remain unchanged/);
  filter.catch(new ConflictException({ message: "unrelated", code: "DO_NOT_EXPOSE", secret: "private" }), host);
  assert.equal(body.errors[0].code, "HTTP_ERROR"); assert.doesNotMatch(JSON.stringify(body), /DO_NOT_EXPOSE|private/);
});

test("CHAT and AUTOMATION persist the authoritative workspace and immutable mode; AGENT requires a source", async () => {
  const h = await fixture();
  for (const mode of ["CHAT", "AUTOMATION"] as const) {
    const c = await h.create(mode), saved = await h.db.conversation.findUnique({ where: { id: c.id } });
    assert.equal(c.mode, mode); assert.equal(saved.metadata.modeContext.workspace.workspaceId, h.binding.workspaceId);
    assert.equal(saved.metadata.modeContext.workspace.bindingVersion, h.binding.version);
    assert.equal(saved.metadata.modeContext.organizationId, h.claims.organizationId);
    await assert.rejects(h.conversations.updateConversation(c.id, h.claims.sub, { metadata: { modeContext: { mode: "AGENT" } } }), /SERVER_OWNED/);
  }
  await assert.rejects(h.conversations.createConversation(h.claims.sub, { projectId: "project-a", title: "bad", mode: "AGENT" }, h.claims), /AGENT_SOURCE_REQUIRED/);
  await assert.rejects(h.conversations.createConversation(h.claims.sub, { projectId: "project-a", title: "bad", metadata: { modeContext: { mode: "AGENT" } } }, h.claims), /SERVER_OWNED/);
});

test("handoff stays in the original conversation without a child, run or permit", async () => {
  const h = await fixture(), count = h.tables.conversation.size, runs = h.tables.agentRun.size, audit = h.tables.auditEvent.size;
  const result = await h.transfer();
  assert.equal(result.conversationId, "conversation-a"); assert.equal(result.agentConversationId, "conversation-a");
  assert.equal(h.tables.conversation.size, count); assert.equal(h.tables.agentRun.size, runs); assert.equal(h.tables.auditEvent.size, audit);
  const restored = await h.conversations.getConversation("conversation-a", h.claims.sub, h.claims);
  assert.equal(restored.mode, "AGENT"); assert.equal(restored.modeContext!.source, undefined);
  assert.ok(restored.messages.some(m => m.id === result.messageId)); assert.deepEqual(h.scheduled, []);
});
test("duplicate handoffs persist once and changed content conflicts", async () => {
  const h = await fixture(), count = h.tables.conversation.size;
  const [a,b] = await Promise.all([h.transfer(),h.transfer()]); assert.deepEqual(a,b);
  assert.equal(h.tables.conversation.size,count);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.id === a.messageId).length,1);
  await assert.rejects(h.transfer("transfer-one","Delete another file"), /CONFLICT/);
});

test("activation in a historical Agent conversation preserves its certified source relationship", async () => {
  const h = await fixture(), legacy = await legacyTransfer(h);
  const before = structuredClone(h.tables.conversation.get(legacy.agentConversationId).metadata.modeContext.source);
  await h.conversations.postMessage(legacy.agentConversationId, h.claims, { content: "Prepare workspace work for review. Do not execute.", transferToAgent: true, metadata: { clientMessageId: "historical-activation" } });
  const current = h.tables.conversation.get(legacy.agentConversationId);
  assert.deepEqual(current.metadata.modeContext.source, before);
  assert.ok(await transferredConversation(h.db, current));
  assert.deepEqual(h.scheduled, []);
});

test("all five roles can use Chat and activate workspace work; stale bindings still fail", async () => {
  for (const role of ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const) {
    const h = await fixture();
    h.claims.role = role;
    const reply: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "hello" });
    assert.equal(reply.content, "Hello");
    const transferred = await h.transfer();
    assert.equal(transferred.agentConversationId, "conversation-a");
    const restored = await h.conversations.getConversation("conversation-a", h.claims.sub, h.claims);
    assert.equal(restored.mode, "AGENT");
    assert.ok(restored.messages.some(m => m.id === transferred.messageId));
  }
  {
    const h = await fixture();
    h.tables.conversation.get("conversation-a").metadata.modeContext.workspace.bindingVersion = 999;
    const before = structuredClone(h.tables.conversation.get("conversation-a"));
    await assert.rejects(h.transfer(), /WORKSPACE_CHANGED/);
    assert.deepEqual(h.tables.conversation.get("conversation-a"), before);
    assert.deepEqual(h.scheduled, []);
  }
});

test("workspace activation cannot skip project CREATE authorization", async () => {
  const h = await fixture(), before = structuredClone(h.tables.conversation.get("conversation-a"));
  Object.defineProperty(h.conversations, "projectAccess", { value: { assert: async (_claims: unknown, projectId: string, action: string) => {
    assert.equal(projectId, "project-a");
    if (action === "CREATE") throw new Error("PROJECT_CREATE_DENIED");
  } } });
  await assert.rejects(h.transfer(), /PROJECT_CREATE_DENIED/);
  assert.deepEqual(h.tables.conversation.get("conversation-a"), before);
  assert.deepEqual(h.scheduled, []);
});
test("handoff transaction rolls back if notice persistence fails", async () => {
  const h = await fixture(), count = h.tables.conversationMessage.size, create = h.db.conversationMessage.create;
  h.db.conversationMessage.create = async (arg: any) => { if(arg.data.metadata?.handoffContext) throw new Error("unavailable"); return create(arg); };
  await assert.rejects(h.transfer(), /unavailable/); assert.equal(h.tables.conversationMessage.size,count);
});

test("workspace-aware CHAT routes real inspection even with the old chat flag; AUTOMATION never schedules", async () => {
  const h = await fixture();
  const result: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "Read src/auth/session.ts", chat: true });
  assert.equal(result.agentRunId, "read-run"); assert.deepEqual(h.scheduled, ["read-run"]);
  const automation = await h.create("AUTOMATION");
  await h.conversations.postMessage(automation.id, h.claims, { content: "Read src/auth/session.ts", triggerAgent: true });
  assert.deepEqual(h.scheduled, ["read-run"]);
});

test("Agent receives execution requests as held conversation messages, not automatic work or Planning", async () => {
  const h = await fixture(), transfer = await legacyTransfer(h), before = h.tables.agentRun.size;
  const reply: any = await h.conversations.postMessage(transfer.agentConversationId, h.claims, { content: "Run npm test", triggerAgent: true });
  assert.equal(reply.metadata.executionStarted, false); assert.equal(h.tables.agentRun.size, before); assert.deepEqual(h.scheduled, []);
});

for (const change of ["workspace", "runtime", "organization", "user", "message"]) test(`transfer fails closed on ${change} mismatch`, async () => {
  const h = await fixture();
  if (change === "workspace" || change === "runtime") {
    const c = h.tables.conversation.get("conversation-a");
    c.metadata.modeContext.workspace[change === "workspace" ? "bindingVersion" : "runtimeId"] = change === "workspace" ? 999 : "different";
    await assert.rejects(h.transfer(), /WORKSPACE_CHANGED/); return;
  }
  const result = await legacyTransfer(h), child = h.tables.conversation.get(result.agentConversationId);
  if (change === "organization") child.metadata.modeContext.organizationId = "different";
  if (change === "user") child.userId = "different";
  if (change === "message") child.metadata.modeContext.source.messageId = "missing";
  await assert.rejects(transferredConversation(h.db, child), /TRANSFER_INVALID/);
});

test("Normal Chat direct Runtime mutation/terminal requests reject even with a broader machine grant", async () => {
  const h = await fixture();
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search", "filesystem.write", "terminal.execute"]);
  for (const [tool, input] of [["filesystem.write", { path: "D:\\Fixture\\safe.txt", content: "no" }], ["terminal.execute", { executable: "node", args: ["--version"], cwd: "D:\\Fixture", timeoutMs: 1000 }]] as const) {
    await assert.rejects(h.control.propose(h.claims, { conversationId: "conversation-a", projectId: "project-a", runtimeId: h.device.runtimeId, requestId: tool, tool, input, purpose: "must reject" } as any), /AGENT_CONVERSATION_REQUIRED/);
  }
});

for (const content of ["حلل المشروع", "افحص المشروع", "Analyze the project", "Inspect this workspace", "ابحث داخل المشروع للقراءة فقط؛ لا تشغّل أي سكربت ولا تنفّذ الخطة."])
  test(`workspace inspection stays in its source Chat without a transfer: ${content}`, async () => {
    const h = await fixture(), conversationsBefore = h.tables.conversation.size;
    const result: any = await h.conversations.postMessage("conversation-a", h.claims, { content });
    assert.equal(result.agentRunId, "read-run");
    assert.equal(result.conversationId, "conversation-a");
    assert.equal(h.tables.conversation.size, conversationsBefore);
    assert.deepEqual(h.scheduled, ["read-run"]);
  });

test("a linked Agent action revalidates its conversation binding before approval", async () => {
  const h = await fixture(), transfer = await legacyTransfer(h);
  const result = await h.control.propose(h.claims, { conversationId: transfer.agentConversationId, projectId: "project-a", runtimeId: h.device.runtimeId,
    requestId: "bound-read", tool: "filesystem.read", input: { path: "D:\\Fixture\\safe.txt" }, purpose: "Read authorized source" });
  const child = h.tables.conversation.get(transfer.agentConversationId);
  child.metadata.modeContext.workspace.bindingVersion += 1;
  await assert.rejects(h.control.approve(h.claims, result.runId, result.proposal.approvalFingerprint!, "APPROVED"), /WORKSPACE_CHANGED/);
});

test("transfer inherits and re-admits actual verified evidence without rewriting its source receipt", async () => {
  const h = await fixture();
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "export const sessionActive = true;"); await h.service.advance(h.run.id);
  const reference = (await h.state()).references[0], transfer = await legacyTransfer(h);
  const collector = new EvidenceCollectorService({} as any, undefined, undefined, h.db, undefined, undefined, undefined, undefined, h.store, h.evidence);
  const contexts = new AgentContextBuilderService(new AgentUnderstandingService(), collector, new AgentContextSerializerService());
  const context = await contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId, sessionClaims: h.claims,
    projectId: "project-a", conversationId: transfer.agentConversationId, instruction: "Explain authentication in this workspace", runtimeEvidence: [], availableCapabilities: ["workspace_reader"] });
  assert.deepEqual(context.evidence[0].runtimeReference, reference);
  const visible = new Map<string, string>(); contexts.toReasoningPrompt(context, visible);
  assert.equal(citationSources(context, visible, h.binding).length, 1);
  assert.equal(context.evidence[0].runtimeReference!.conversationId, "conversation-a");
  await h.identity.revokeGrant(h.claims, h.device.runtimeId, "project-a");
  await assert.rejects(collector.collectTransferredWorkspace(h.claims, "project-a", transfer.agentConversationId));
});

for (const request of ["Hi", "What is BGP?", "How do I run a service?", "Explain how to create a project", "Read index.html", "Inspect authentication in this workspace", "حلل المشروع", "افحص المشروع", "كمل التحليل للقراءة فقط؛ لا تشغّل أي سكربت ولا تنفّذ الخطة.", "اقرأ الملفات ولا تعدّل الملف", "Read the file; do not execute it."]) test(`read/conversational intent stays read-only: ${request}`, () => assert.equal(requestsConversationExecution(request), false));
for (const request of ["Create test.txt", "Delete README.md", "Run npm test", "نفذ الخطة", "عدّل الملف", "Analyze the files and fix the issue", "لا تحذف الملف، عدّل التعليق", "Don't delete it; write a new file"]) test(`execution intent transfers: ${request}`, () => assert.equal(requestsConversationExecution(request), true));
for (const tool of ["filesystem.write", "filesystem.create", "filesystem.delete", "filesystem.copy", "filesystem.move", "terminal.execute"]) test(`CHAT mode cannot authorize ${tool}`, () => assert.throws(() => assertConversationTool({ metadata: {} }, tool), /AGENT_CONVERSATION_REQUIRED/));

test("same-conversation handoff re-admits receipts with unchanged provenance", async () => {
  const h = await fixture();
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "export const sessionActive = true;"); await h.service.advance(h.run.id);
  const reference = (await h.state()).references[0];
  const collector = new EvidenceCollectorService({} as any, undefined, undefined, h.db, undefined, undefined, undefined, undefined, h.store, h.evidence);
  (h.conversations as any).contextBuilder = new AgentContextBuilderService(new AgentUnderstandingService(),collector,new AgentContextSerializerService());
  const result = await h.transfer();
  const detail = await h.conversations.getConversation(result.conversationId,h.claims.sub,h.claims);
  const notice = detail.messages.find(m => m.metadata.handoffContext === true)!;
  const receipts = notice.metadata.evidenceReceipt as any[];
  assert.deepEqual(receipts[0].runtimeReference,reference); assert.equal(result.conversationId,"conversation-a");
  assert.equal([...h.tables.conversation.values()].filter(c => c.metadata.modeContext?.source).length,0);
});

test("handoff retains attachment associations on the original message", async () => {
  const h = await fixture();
  (h.conversations as any).attachmentService = { getAttachment: async () => ({id:"attachment-one",conversationId:"conversation-a"}) };
  const result: any = await h.conversations.postMessage("conversation-a",h.claims,{content:"Continue in Agent",transferToAgent:true,attachmentIds:["attachment-one"],metadata:{clientMessageId:"attachment-handoff"}});
  const message = h.tables.conversationMessage.get(result.messageId);
  assert.equal(message.conversationId,"conversation-a"); assert.deepEqual(message.metadata.attachmentIds,["attachment-one"]);
  await assert.rejects(h.conversations.postMessage("conversation-a",h.claims,{content:"Continue in Agent",transferToAgent:true,attachmentIds:[],metadata:{clientMessageId:"attachment-handoff"}}), /CONFLICT/);
});

test("resolver integration keeps unrelated chat separate and continues only the unique inspection", async () => {
  const h = await fixture(); let continued = 0;
  h.agents.continueInspectionConversation = async (conversationId: string) => { continued++; return {conversationId,messageId:"continued",agentRunId:h.run.id,status:"PAUSED"}; };
  await h.conversations.postMessage("conversation-a",h.claims,{content:"What is BGP?"});
  assert.equal(continued,0);
  const result: any = await h.conversations.postMessage("conversation-a",h.claims,{content:"continue"});
  assert.equal(continued,1); assert.equal(result.conversationId,"conversation-a"); assert.equal(result.agentRunId,h.run.id); assert.deepEqual(h.scheduled,[]);
});
test("resolver integration holds multiple matching inspections without dispatch", async () => {
  const h = await fixture();
  h.tables.agentRun.set("second-inspection",{...h.run,id:"second-inspection"});
  h.agents.inspectionView = async () => ({state:"AWAITING_INPUT",evidence:[],workspace:{workspaceId:h.binding.workspaceId,bindingVersion:h.binding.version,runtimeId:h.binding.runtimeId}});
  h.agents.continueInspectionConversation = async () => { throw new Error("must not continue"); };
  const reply: any = await h.conversations.postMessage("conversation-a",h.claims,{content:"continue"});
  assert.match(reply.content,/More than one workflow/); assert.equal(reply.metadata.executionStarted,false); assert.deepEqual(h.scheduled,[]);
});

test("bare نفذ resolves saved workflow state without approval, permit or execution", async () => {
  const h = await fixture();
  const before = JSON.stringify([...h.tables.auditEvent]);
  h.agents.getRun = async (id: string) => ({ id, conversationId: "conversation-a", projectId: "project-a", status: "PAUSED", inspection: await h.service.view(id, h.claims) });
  h.agents.executePlan = h.agents.issueExactPermit = h.agents.requestExactApproval = () => assert.fail("Continuation must not authorize or execute");
  const reply: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "نفذ", metadata: { clientMessageId: "bare-execute" } });
  assert.match(reply.content, /Saved workflow/);
  assert.equal(reply.metadata.executionStarted, false);
  assert.equal(JSON.stringify([...h.tables.auditEvent]), before);
  assert.deepEqual(h.scheduled, []);
});

test("same-conversation continuity resolves approval and persisted execution state", async () => {
  const h = await fixture(), conversationId = "conversation-a", count = h.tables.conversation.size;
  const requested: any = await h.conversations.postMessage(conversationId,h.claims,{content:"Read src/auth/session.ts",metadata:{clientMessageId:"continuity-inspect"}});
  assert.equal(requested.conversationId,conversationId);
  // Obtain an actual verified fixture runtime receipt, not model-generated evidence.
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution,"export const sessionActive = true;"); await h.service.advance(h.run.id);
  const reference = structuredClone((await h.state()).references[0]);
  assert.equal(reference.verificationState,"VERIFIED"); assert.equal(reference.conversationId,conversationId);
  const planRunId = "continuity-plan", approvalId = "continuity-pending-approval";
  let planned = 0, chat = 0;
  // Fixture planning adapter persists workflow state; it never executes a write or grants approval.
  h.agents.planFromConversation = async (id: string, _claims: any, instruction: string) => {
    assert.equal(id,conversationId); assert.match(instruction,/inspected result/); planned++;
    await h.db.agentRun.create({data:{...h.run,id:planRunId,conversationId,status:"AWAITING_APPROVAL"}});
    await h.db.conversationMessage.create({data:{id:"continuity-plan-message",conversationId,senderId:"agent",senderType:"assistant",content:"Fixture proposal pending explicit approval",metadata:{agentRunId:planRunId}}});
    return {runId:planRunId};
  };
  const originalView = h.agents.inspectionView;
  h.agents.getRun = async (id: string) => id === planRunId ? {
    id,conversationId,projectId:"project-a",status:"AWAITING_APPROVAL",
    presentation:{engineeringPlan:{planId:"continuity-plan-id"},planning:{plan:{readiness:"PLAN_READY"}}},
    execution:{status:"AWAITING_APPROVAL",receipts:[{id:"execution-receipt-fixture"}]},pendingApprovals:[{id:approvalId}]
  } : {inspection:await originalView(id,h.claims)};
  const modification: any = await h.conversations.postMessage(conversationId,h.claims,{content:"Modify the comment using the inspected result",metadata:{clientMessageId:"continuity-plan"}});
  assert.equal(modification.conversationId,conversationId); assert.equal(modification.agentRunId,planRunId); assert.equal(planned,1);
  const summary = await (h.conversations as any).workflowSummary(h.tables.conversation.get(conversationId),h.claims);
  assert.equal(summary.latestPlan.planId,"continuity-plan-id"); assert.equal(summary.execution.status,"AWAITING_APPROVAL");
  assert.deepEqual(summary.pendingApprovals,[{runId:planRunId,approvalId}]);
  const auditBefore = JSON.stringify([...h.tables.auditEvent]);
  const guidance: any = await h.conversations.postMessage(conversationId,h.claims,{content:"approve",metadata:{clientMessageId:"continuity-approve"}});
  assert.equal(guidance.conversationId,conversationId); assert.match(guidance.content,/does not grant approval/);
  assert.equal(h.tables.agentRun.get(planRunId).status,"AWAITING_APPROVAL");
  assert.equal(JSON.stringify([...h.tables.auditEvent]),auditBefore);
  // Contextual approval resolves the exact reference without granting authority.
  const contextualApproval = resolveConversationIntent("I approve the pending proposal",summary);
  assert.equal(contextualApproval.route,"APPROVAL_GUIDANCE"); assert.deepEqual(contextualApproval.target,{runId:planRunId,approvalId});
  // Follow-up reads persisted execution state without invoking the model.
  const followup = resolveConversationIntent("What happened to that proposal?",summary);
  assert.equal(followup.route,"UNDERSTANDING"); assert.equal(followup.target?.runId,planRunId);
  h.agents.executeChat = async (_claims: any, input: any) => {
    assert.equal(input.conversationId,conversationId); chat++;
    assert.ok(Array.isArray(input.history));
    assert.equal(h.tables.conversationMessage.get("continuity-plan-message").conversationId,conversationId);
    return {answer:"Fixture conversational response",modelId:"fixture"};
  };
  const happened: any = await h.conversations.postMessage(conversationId,h.claims,{content:"What happened to that proposal?"});
  const unrelated: any = await h.conversations.postMessage(conversationId,h.claims,{content:"What is BGP?"});
  assert.equal(happened.conversationId,conversationId); assert.equal(unrelated.conversationId,conversationId); assert.equal(chat,1);
  assert.match(happened.content,/AWAITING_APPROVAL/); assert.match(happened.content,/execution-receipt-fixture/);
  assert.equal(h.tables.conversation.size,count);
  assert.deepEqual((await h.state()).references[0],reference);
  assert.deepEqual(h.scheduled,["read-run"]);
  assert.equal(JSON.stringify([...h.tables.auditEvent]),auditBefore);
});

test("dispatch follows resolver routes despite legacy chat/agent flags", async () => {
  const h = await fixture(); let plans = 0, executions = 0, chats = 0;
  h.agents.planFromConversation = async (id: string) => { assert.equal(id,"conversation-a"); plans++; return {runId:h.run.id}; };
  h.agents.executePlan = async () => { executions++; throw new Error("must not execute"); };
  h.agents.executeChat = async () => { chats++; return {answer:"Normal chat"}; };
  await h.conversations.postMessage("conversation-a",h.claims,{content:"Create an engineering plan",chat:true});
  assert.equal(plans,1); assert.equal(executions,0);
  await h.conversations.postMessage("conversation-a",h.claims,{content:"What is BGP?",chat:true});
  assert.equal(chats,1); assert.equal(plans,1);
  await h.conversations.postMessage("conversation-a",h.claims,{content:"approve",triggerAgent:true});
  assert.equal(chats,2); assert.equal(plans,1); assert.equal(executions,0); assert.deepEqual(h.scheduled,[]);
});
test("resolver inspection and continuation override old chat flag without rerouting", async () => {
  const h=await fixture(); let continued=0;
  h.agents.continueInspectionConversation=async(id:string)=>{continued++;return {conversationId:id,agentRunId:h.run.id,messageId:"continuation",status:"PAUSED"};};
  await h.conversations.postMessage("conversation-a",h.claims,{content:"Read index.html",chat:true});
  assert.deepEqual(h.scheduled,["read-run"]); assert.equal(continued,0);
  await h.conversations.postMessage("conversation-a",h.claims,{content:"continue",chat:true});
  assert.equal(continued,1); assert.deepEqual(h.scheduled,["read-run"]);
});

for (const scenario of ["greeting", "continuation", "approval", "active-overflow"]) test(`bounded workflow context with many historical runs: ${scenario}`, async () => {
  const h=await fixture();
  for(let i=0;i<70;i++) h.tables.agentRun.set("historical-"+i,{...h.run,id:"historical-"+i,status:i%2 ? "FAILED" : "COMPLETED"});
  const activeView={state:"AWAITING_INPUT",evidence:[],workspace:{workspaceId:h.binding.workspaceId,bindingVersion:h.binding.version,runtimeId:h.binding.runtimeId}};
  h.agents.getRun=async(id:string)=>({id,conversationId:"conversation-a",projectId:"project-a",status:h.tables.agentRun.get(id).status,
    inspection:id===h.run.id || id.startsWith("active-") ? activeView : null,
    pendingApprovals:id==="pending-old" ? [{id:"approval-old"}] : []});
  let continued=0;
  h.agents.continueInspectionConversation=async(id:string)=>{continued++;return {conversationId:id,agentRunId:h.run.id,messageId:"continue-old",status:"PAUSED"};};
  if(scenario==="approval") h.tables.agentRun.set("pending-old",{...h.run,id:"pending-old",status:"AWAITING_APPROVAL"});
  if(scenario==="active-overflow") for(let i=0;i<25;i++) h.tables.agentRun.set("active-"+i,{...h.run,id:"active-"+i,status:"PAUSED"});
  const summary=await (h.conversations as any).workflowSummary(h.tables.conversation.get("conversation-a"),h.claims);
  assert.ok(summary.activeInspections.some((r:any)=>r.runId===h.run.id));
  if(scenario==="greeting") {
    assert.equal(resolveConversationIntent("hello",summary).route,"CONVERSATION");
    const reply:any=await h.conversations.postMessage("conversation-a",h.claims,{content:"hello"});assert.equal(reply.content,"Hello");
  } else if(scenario==="continuation") {
    assert.equal(resolveConversationIntent("continue",summary).target?.runId,h.run.id);
    await h.conversations.postMessage("conversation-a",h.claims,{content:"continue"});assert.equal(continued,1);
  } else if(scenario==="approval") {
    assert.equal(resolveConversationIntent("approve the pending proposal",summary).target?.approvalId,"approval-old");
    const reply:any=await h.conversations.postMessage("conversation-a",h.claims,{content:"approve the pending proposal"});assert.match(reply.content,/approval-old/);
  } else {
    assert.equal(summary.truncated,true);assert.equal(summary.activeInspections.length,20);
    assert.equal(resolveConversationIntent("continue",summary).route,"AMBIGUOUS");
    assert.equal(resolveConversationIntent("hello",summary).route,"CONVERSATION");
    const reply:any=await h.conversations.postMessage("conversation-a",h.claims,{content:"continue"});assert.match(reply.content,/More than one workflow/);assert.equal(continued,0);
  }
});
