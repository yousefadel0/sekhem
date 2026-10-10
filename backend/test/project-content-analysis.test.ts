import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { projectContentAnalysisRequest, projectContentInspectionScope } from "../src/conversation/review-intent";
import { contentAnalysisActionIssue } from "../src/agent-runtime/inspection/conversational-inspection";
import { ConversationService } from "../src/conversation/conversation.service";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";

const objective = "اقرأه وقولي خطة تطويره";
const base = (): ConversationWorkflowSummary => ({ activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [], workspace: { workspaceId: "workspace", bindingVersion: 1, runtimeId: "runtime", runtimeFingerprint: "fingerprint" } });
for (const text of [objective, "اقرأه و قولي خطة تطويره", "اقرأ المشروع وحللّه", "اقرأ الكود وقولي أطور إيه", "analyze the project and give me a development plan"]) test(`content request enters governed review: ${text}`, () => {
  const state = base(), before = structuredClone(state), d = resolveConversationIntent(text, state);
  assert.equal(d.route, "INSPECTION"); assert.equal(d.inspectionInstruction, text);
  assert.equal(d.inspectionPlanningObjective, undefined); assert.deepEqual(state, before);
  assert.equal(resolveConversationIntent(text, { ...state, workspace: null }).route, "UNAVAILABLE");
  assert.equal(resolveConversationIntent(text, { ...state, certifiedUnderstanding: { runId: "grounded", sequence: 1 } }).reason, "certified-project-recommendation");
});

test("advisory recognition neither swallows mutation nor alters greetings/visibility", () => {
  for (const text of ["عدّل package.json", "اقرأه وقولي خطة تطويره ونفذها", "Run node --version", "ازيك", "شايف المشروع؟"]) assert.equal(projectContentAnalysisRequest(text), false);
  assert.equal(resolveConversationIntent("ازيك", base()).route, "CONVERSATION");
  assert.equal(resolveConversationIntent("شايف المشروع؟", base()).route, "WORKSPACE");
});

test("explicit fresh files outrank an older certified project review without creating authority", () => {
  const state = { ...base(), certifiedUnderstanding: { runId: "older-report", sequence: 1 } }, before = structuredClone(state);
  const request = "راجع المشروع قراءة فقط. اقرأ src/pages/Dashboard.tsx وsrc/pages/Applications.tsx. لا تعدّل الملفات.";
  const decision = resolveConversationIntent(request, state);
  assert.equal(decision.route, "INSPECTION"); assert.equal(decision.inspectionInstruction, request);
  assert.equal(decision.target, undefined); assert.deepEqual(state, before);
  assert.equal(resolveConversationIntent("راجع المشروع قراءة فقط. اقرأ ../../outside.ts.", state).route, "UNAVAILABLE");
});

test("dynamic sources are allowed without a fixed filename order; unrelated trees fail closed", () => {
  for (const path of ["", "src", "src/session.ts", "docs/architecture.md", "pyproject.toml", "tsconfig.json", "package.json"])
    assert.equal(contentAnalysisActionIssue({ tool: "filesystem.read", relativePath: path, purpose: "Review relevant content" }), undefined);
  for (const path of [".cursor", ".next/cache", ".git/config", "node_modules/lib/index.js", ".pnpm-store", "backend/dist/main.js"])
    assert.equal(contentAnalysisActionIssue({ tool: "filesystem.list", relativePath: path, purpose: "Review" }), "INSPECTION_RELEVANT_SOURCE_REQUIRED");
});

test("production entry preserves the request and replays its existing inspection instead of chat", async () => {
  const h = await inspectionHarness(), service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  service.prisma = h.db; service.workflowSummary = async () => base();
  service.agentRuntimeService = { createRunTx: async (tx: any, claims: any, dto: any, messageId: string) => {
    calls.push(dto); const run = await tx.agentRun.create({ data: { ...h.run, id: "content-analysis" } });
    await h.service.initializeTx(tx, run, claims, h.binding, dto.instruction, [], [], messageId); return run;
  }, scheduleRunExecution: () => {} };
  const dto = { content: objective, metadata: { clientMessageId: "content-request" } };
  const result = await service.postMessage("conversation-a", h.claims, dto);
  const replay = await service.postMessage("conversation-a", h.claims, dto);
  assert.equal(result.agentRunId, "content-analysis"); assert.equal(replay.agentRunId, result.agentRunId); assert.equal(calls.length, 1);
  assert.equal(calls[0].instruction, objective); assert.equal(calls[0].conversationId, "conversation-a");
  const s: any = await h.ledger.transaction(async tx => (await h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId))!.payload);
  assert.equal(s.objective, objective); assert.equal(s.originatingMessageId, result.messageId); assert.equal(s.operations.length, 0);
});

async function readEvidence() {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!; await h.ledger.update(tx, row, { ...row.payload, objective }); });
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: grant.version, durationMinutes: 60 });
  h.responses.push(h.inspectStructured("filesystem.read", "src/session.ts")); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "APPROVED");
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.status === "PENDING").length, 0);
  await h.complete((await h.request("poll")).execution, "export function authenticate() {}"); await h.service.advance(h.run.id);
  const s = await h.state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId, sessionClaims: h.claims, projectId: h.run.projectId, conversationId: h.run.conversationId, agentRunId: h.run.id, instruction: projectContentInspectionScope(objective), runtimeEvidence: s.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible); const contract = interpretContext(context, visible);
  const report = { constraintIds: contract.constraints.map(c => c.id), facts: [{ id: "source", text: visible.get(contract.evidenceRefs[0])!, evidenceRef: contract.evidenceRefs[0] }], inferences: [], hypotheses: [], unknowns: [] };
  return { ...h, report };
}

test("verified model-selected source automatically resumes grounded development advice; reload cannot redispatch", async () => {
  const h = await readEvidence();
  (h.report.unknowns as any[]).push({ id: "unread_modules", description: "Other modules are unread", whyNeeded: "Module-specific recommendations need further source review", severity: "LOW", evidenceCategory: "OPTIONAL_CONTEXT" });
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Ground development advice", report: h.report,
    recommendation: { title: "Document session handling", objective: "1. Review authentication requirements. 2. Add tests for the inspected authenticate entrypoint. Unread modules remain unknown.", changeKind: "ADDITION", preservation: "UNSPECIFIED" } }));
  await h.service.advance(h.run.id);
  const s = await h.state(); assert.equal(s.state, "COMPLETED"); assert.equal(s.understanding?.status, "GROUNDED");
  assert.equal(s.objective, objective); assert.equal(s.operations.length, 1); assert.equal(s.operations[0].verification, "VERIFIED");
  const reply = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport && m.metadata?.recommendation);
  assert.ok(reply); assert.match(reply.content, /ما قرأته في المشروع/); assert.match(reply.content, /خطة التطوير المقترحة/); assert.doesNotMatch(reply.content, /runtime:|checkpoint|Binding|receipt/); assert.match(reply.content, /Add tests/);
  assert.ok(h.calls.every(c => c.structured)); assert.ok(h.calls.every(c => c.question.includes(objective)));
  assert.match(h.calls.at(-1).systemInstruction, /no fixed file sequence/);
  assert.match(h.calls.at(-1).systemInstruction, /fulfil every requested deliverable and its requested count\/order/);
  assert.match(h.calls.at(-1).systemInstruction, /One recommendation envelope may contain multiple phases/);
  assert.match(reply.content, /المصدر: src\/session.ts/);
  const calls = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, calls); assert.equal((await h.request("poll")).execution, null);
});

test("review presentation retains each roadmap phase and source-linked finding without granting authority", async () => {
  const h = await readEvidence();
  const roadmap = "1. Inventory supported gaps; check each against source.\n2. Propose bounded fixes; review the diff.\n3. Verify live behavior; retain unknowns until tested.";
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: {
    ...h.report, inferences: [{ id: "deduction", text: "The inspected source declares authenticate.", factIds: ["source"], uncertainty: "Runtime behavior is not tested." }]
  }, recommendation: { title: "Three-stage review", objective: roadmap, changeKind: "ADDITION", preservation: "UNSPECIFIED" } }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "COMPLETED");
  const reply = [...h.tables.conversationMessage.values()].find(m => m.metadata?.recommendation);
  assert.ok(reply); assert.ok(reply.content.includes(roadmap));
  assert.match(reply.content, /\[source\]/); assert.match(reply.content, /المصدر: src\/session.ts/);
  assert.equal((await h.request("poll")).execution, null);
});

test("a claim inferred solely from a filename fails certification and produces no development recommendation", async () => {
  const h = await readEvidence();
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: { ...h.report, facts: [{ ...h.report.facts[0], text: "backend_typecheck.txt definitely contains recent errors" }] }, recommendation: null }));
  await h.service.advance(h.run.id); assert.notEqual((await h.state()).understanding?.status, "GROUNDED");
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
});

test("malformed post-read unknown cannot certify facts or publish recommendations", async () => {
  const h = await readEvidence();
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: { ...h.report, unknowns: [{ id: "gap", description: "Unread scope", severity: "LOW", evidenceCategory: "OPTIONAL_CONTEXT" }] }, recommendation: null }));
  await h.service.advance(h.run.id);
  const s = await h.state(); assert.equal(s.state, "FAILED"); assert.notEqual(s.understanding?.status, "GROUNDED");
  assert.equal(s.operations.length, 1); assert.equal(s.operations[0].verification, "VERIFIED");
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
});

test("ordinary chat sees connection context, not technical visibility payload or filenames as facts", async () => {
  const h = await inspectionHarness(), service: any = Object.create(ConversationService.prototype), seen: any[] = [];
  const workspace = { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version, runtimeId: h.binding.runtimeId, runtimeFingerprint: h.binding.runtimeFingerprint };
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: { modeContext: { mode: "CHAT", version: 1, organizationId: h.claims.organizationId, workspace } } } });
  const content = 'Selected folder: Fixture\nD:\\Fixture\nLast verified folder listing (2026-10-05): backend_typecheck.txt\nThis uses saved workspace metadata.';
  await h.db.conversationMessage.create({ data: { id: "visibility", conversationId: "conversation-a", senderType: "assistant", senderId: "agent", content, metadata: { modeNotice: true, executionStarted: false } } });
  service.prisma = h.db; service.workflowSummary = async () => ({ ...base(), workspace }); service.runtimeWorkspaces = h.store;
  service.agentRuntimeService = { executeChat: async (_claims: any, input: any) => { seen.push(input); return { answer: "I have not inspected the source yet." }; } };
  await service.postMessage("conversation-a", h.claims, { content: "طيب ايه رأيك فيه؟" });
  assert.equal(seen.length, 1);
  const input = JSON.stringify(seen[0]); assert.doesNotMatch(input, /D:\\\\Fixture|backend_typecheck.txt|2026-10-05|bindingVersion|visibleEntries|observedAt/);
  assert.match(input, /Never assert file contents, errors, architecture, quality or activity recency/);
  assert.equal(h.tables.conversationMessage.get("visibility").content, content);
});

test("content review cannot complete or publish advice from metadata without a verified source read", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!; await h.ledger.update(tx, row, { ...row.payload, objective }); });
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: { constraintIds: [], facts: [], inferences: [], hypotheses: [], unknowns: [] }, recommendation: null }));
  await h.service.advance(h.run.id);
  const s = await h.state(); assert.notEqual(s.state, "COMPLETED"); assert.notEqual(s.understanding?.status, "GROUNDED");
  assert.equal(s.operations.length, 0); assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
  assert.equal((await h.request("poll")).execution, null);
});
