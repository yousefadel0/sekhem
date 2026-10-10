import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionReferences, normalizeWorkspaceLanguage, naturalWorkspaceRequest, REFERENCE_LIMIT } from "../src/conversation/workspace-reference";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { ConversationService } from "../src/conversation/conversation.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";

const workspace = { workspaceId: "workspace-a", bindingVersion: 40, runtimeId: "runtime-a", runtimeFingerprint: "a".repeat(64) };
const base = (): ConversationWorkflowSummary => ({ workspace, activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [], references: [], recentConcepts: [] });
function view(certified = true, path = "src/Navbar.tsx", text = '<nav class="navbar">Menu</nav>'): any {
  const ref = { ...workspace, receiptId: "receipt-a", relativePath: path, verificationState: "VERIFIED", truncated: false, conversationId: "conversation-a" };
  return { state: certified ? "COMPLETED" : "UNDERSTANDING", workspace, evidence: [ref], operations: [], understanding: {
    status: certified ? "GROUNDED" : "PARTIAL", sequence: 1, grounding: { complete: true },
    evidence: [{ id: "source-a", runtimeReference: ref, read: true, selected: true }],
    understanding: { readiness: certified ? "UNDERSTANDING_READY" : "NEEDS_CLARIFICATION", facts: [{ id: "navbar-a", text, evidenceRef: "runtime:receipt-a" }], inferences: [] }
  } };
}
const reference = () => inspectionReferences("source-run", view())[0];
for (const text of ["حلللي ملفات الـstyle", "بص على الـnavbar", "اقرأ الـhero section", "إيه اللي مسؤول عن الـfooter؟", "Analyze the style files", "Look at the navbar", "Read the hero section", "What controls the footer?"]) test(`bounded concept request: ${text}`, () => {
  const decision = resolveConversationIntent(text, base());
  assert.equal(decision.route, "INSPECTION"); assert.equal(decision.reason, "workspace-concept-evidence-required");
  assert.ok(decision.inspectionInstruction?.includes("authorized discovery/search")); assert.equal(decision.reference, undefined);
  assert.doesNotMatch(decision.inspectionInstruction!, /index\.html|src\//);
});
test("Arabic articles/diacritics normalize only bounded concepts", () => {
  for (const text of ["طيب عدّل الـnavbar", "طيب عدل الnavbar", "عدّل navbar"]) assert.equal(normalizeWorkspaceLanguage(text), "عدل navbar");
  assert.equal(normalizeWorkspaceLanguage("اقرأ المشروع"), "اقرأ المشروع");
});
for (const text of ["طيب عدّل الـnavbar", "Modify the navbar", "طيب خلّيه أسود", "خليه أسود", "Make it black", "Change that to black", "عدل دي", "عدل ده"]) test(`unique certified target plans only: ${text}`, () => {
  const context = { ...base(), references: [reference()], recentConcepts: ["navbar" as const] };
  const decision = resolveConversationIntent(text, context);
  assert.equal(decision.route, "PLANNING"); assert.equal(decision.target?.runId, "source-run"); assert.equal(decision.reference?.relativePath, "src/Navbar.tsx");
});
test("one supported but uncertified candidate requires inspection", () => {
  const context = { ...base(), references: inspectionReferences("partial-run", view(false)) };
  const result = resolveConversationIntent("طيب عدّل الـnavbar", context);
  assert.equal(result.route, "INSPECTION"); assert.match(result.inspectionInstruction!, /src\/Navbar.tsx/);
  assert.match(result.inspectionInstruction!, /Do not modify any file or execute any write/);
});
test("zero modification candidates inspect; unsupported anaphora remains ambiguous", () => {
  assert.equal(resolveConversationIntent("طيب عدّل الـnavbar", base()).route, "INSPECTION");
  assert.equal(resolveConversationIntent("طيب خلّيه أسود", base()).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Read it", base()).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("طيب خليه أسود", { ...base(), recentConcepts: ["navbar"] }).route, "AMBIGUOUS");
});
test("bounded heading scope remains eligible for the existing structured inspection path", () => {
  const result = resolveConversationIntent("Read the hero heading", base());
  assert.match(result.inspectionInstruction!, /^Read and analyze hero heading/);
});

function heroView() {
  const v = view(true, "index.html", '<h1><span>intelligent</span> digital experiences.</h1>');
  v.understanding.understanding.facts[0].id = "hero-heading";
  v.understanding.understanding.facts.push({ id: "hero-anchor", text: '<section class="hero" id="home">', evidenceRef: "runtime:receipt-a" });
  v.understanding.understanding.inferences = [{ id: "hero-rendered", text: "The Hero heading belongs to the Hero section.", factIds: ["hero-heading", "hero-anchor"] }];
  return v;
}

test("explicit Hero heading/title resolves only the unique certified h1, retaining the anchor as context", () => {
  const refs = inspectionReferences("source-run", heroView());
  assert.equal(refs.length, 2);
  assert.equal(refs[0].targetKind, "HEADING");
  assert.equal(refs[1].targetKind, undefined);
  for (const text of ["Change the Hero heading to products", "Change the Hero title to products", 'غيّر Hero heading من "Building intelligent digital experiences." إلى "Building intelligent digital products."']) {
    const decision = resolveConversationIntent(text, { ...base(), references: refs });
    assert.equal(decision.route, "PLANNING");
    assert.equal(decision.reference?.factId, "hero-heading");
    assert.equal(decision.target?.runId, "source-run");
  }
  assert.equal(resolveConversationIntent("Read the Hero heading", { ...base(), references: refs }).reference?.factId, "hero-heading");
});

test("Hero section anchor alone cannot become a heading target", () => {
  const v = heroView();
  v.understanding.understanding.facts.shift();
  const refs = inspectionReferences("source-run", v);
  const decision = resolveConversationIntent("Change the Hero heading", { ...base(), references: refs });
  assert.equal(decision.route, "INSPECTION");
  assert.equal(decision.reference, undefined);
  assert.equal(decision.reason, "workspace-concept-evidence-required");
});

test("multiple certified Hero headings stay ambiguous even in the same file and receipt", () => {
  const v = heroView();
  v.understanding.understanding.facts.push({ id: "second-heading", text: '<h1 class="hero-title">Second heading</h1>', evidenceRef: "runtime:receipt-a" });
  const refs = inspectionReferences("source-run", v);
  const headings = refs.filter(r => r.targetKind === "HEADING");
  assert.equal(headings.length, 2);
  assert.equal(headings[0].relativePath, headings[1].relativePath);
  assert.equal(headings[0].evidenceId, headings[1].evidenceId);
  assert.notEqual(headings[0].factDigest, headings[1].factDigest);
  assert.equal(resolveConversationIntent("Change the Hero heading", { ...base(), references: refs }).route, "AMBIGUOUS");
});

test("non-heading Hero references keep existing element ambiguity and anchor resolution", () => {
  const refs = inspectionReferences("source-run", heroView());
  assert.equal(resolveConversationIntent("Read the Hero section", { ...base(), references: refs }).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Change the Hero", { ...base(), references: refs }).route, "AMBIGUOUS");
  const decision = resolveConversationIntent("Read the Hero section", { ...base(), references: [refs[1]] });
  assert.equal(decision.reference?.factId, "hero-anchor");
  assert.equal(decision.route, "INSPECTION");
});

test("heading specificity never bypasses certification, truncation or saved binding checks", () => {
  for (const mutate of [(v: any) => { v.state = "UNDERSTANDING"; }, (v: any) => { v.evidence[0].truncated = true; }]) {
    const v = heroView(); mutate(v);
    const refs = inspectionReferences("source-run", v);
    assert.ok(refs.every(r => r.targetKind === undefined));
    assert.equal(resolveConversationIntent("Change the Hero heading", { ...base(), references: refs }).route, "INSPECTION");
  }
  for (const changed of [{ bindingVersion: 41 }, { workspaceId: "other" }, { runtimeId: "other" }, { runtimeFingerprint: "b".repeat(64) }]) {
    const refs = inspectionReferences("source-run", heroView()).map(r => ({ ...r, ...changed }));
    assert.equal(resolveConversationIntent("Change the Hero heading", { ...base(), references: refs }).route, "UNAVAILABLE");
  }
});

test("partial markup, descriptive h1 prose and multiple h1 elements in one fact are not heading targets", () => {
  for (const text of ['<h1 class="hero">', 'The Hero uses <h1>Heading</h1>', '<h1 class="hero">One</h1><h1>Two</h1>', '<!-- <h1 class="hero">Comment</h1> -->']) {
    const v = heroView(); v.understanding.understanding.facts[0].text = text;
    assert.ok(inspectionReferences("source-run", v).every(r => r.targetKind === undefined));
  }
});
test("multiple element/file candidates remain ambiguous, including anaphora", () => {
  const refs = [reference(), { ...reference(), relativePath: "src/MobileNavbar.tsx", factId: "mobile" }];
  for (const text of ["بص على الـnavbar", "طيب عدّل الـnavbar", "طيب خلّيه أسود"]) assert.equal(resolveConversationIntent(text, { ...base(), references: refs, recentConcepts: ["navbar"] }).route, "AMBIGUOUS");
});
for (const changed of [{ bindingVersion: 41 }, { workspaceId: "other" }, { runtimeId: "other" }, { runtimeFingerprint: "b".repeat(64) }]) test(`changed binding rejects reuse: ${Object.keys(changed)[0]}`, () => {
  const result = resolveConversationIntent("طيب عدّل الـnavbar", { ...base(), references: [{ ...reference(), ...changed }] });
  assert.equal(result.route, "UNAVAILABLE"); assert.equal(result.reason, "workspace-reference-binding-changed");
});
test("unverified receipt, unread listing, truncated source and unsupported prose never certify a target", () => {
  const v = view(); v.evidence[0].verificationState = "UNVERIFIED"; assert.deepEqual(inspectionReferences("run", v), []);
  const listing = view(); listing.understanding.evidence[0].read = false;
  assert.equal(inspectionReferences("run", listing)[0].certified, false);
  const truncated = view(); truncated.evidence[0].truncated = true;
  assert.equal(inspectionReferences("run", truncated)[0].certified, false);
  const generic = view(true, "index.html", "<h1>Hello</h1>");
  assert.deepEqual(inspectionReferences("run", generic), []);
});
test("bounded reference overflow cannot silently choose a target", () => {
  const refs = Array.from({ length: REFERENCE_LIMIT + 1 }, (_, i) => ({ ...reference(), relativePath: `${i}.tsx` }));
  assert.equal(resolveConversationIntent("بص على navbar", { ...base(), references: refs }).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("Hello", { ...base(), references: refs, referencesTruncated: true }).route, "CONVERSATION");
  assert.equal(resolveConversationIntent("طيب عدّل navbar", { ...base(), references: [reference()], truncated: true }).route, "AMBIGUOUS");
});
for (const text of ["I like this style", "What is a navbar?", "Tell me about the hero in this movie", "The footer looks nice", "Hi", "تمام", "Do not modify the navbar"]) test(`ordinary/negative conversation unaffected: ${text}`, () => {
  assert.equal(naturalWorkspaceRequest(text), null);
  if (!text.startsWith("Do not")) assert.equal(resolveConversationIntent(text, base()).route, "CONVERSATION");
});

function fixture() {
  const messages: any[] = [], runs: any[] = [], calls: any[] = [], queries: any[] = [];
  const claims: any = { sub: "owner", role: "PM", organizationId: "org" };
  const binding: any = { ...workspace, version: 40, projectId: "project-a", userId: "owner", organizationId: "org" };
  const conversation: any = { id: "conversation-a", userId: "owner", projectId: "project-a", project: { organizationId: "org" }, metadata: { modeContext: { version: 1, mode: "CHAT", organizationId: "org", workspace } } };
  let inspection: any = null;
  const db: any = { $queryRawUnsafe: async () => [],
    conversation: { findUnique: async () => conversation, update: async () => conversation },
    conversationMessage: { findMany: async (query: any) => { queries.push(query); return [...messages].reverse().filter(m => m.senderType === "user").slice(0, query.take); },
      findUnique: async ({ where }: any) => messages.find(m => m.id === where.id), create: async ({ data }: any) => { const m = { ...data, createdAt: new Date() }; messages.push(m); return m; },
      update: async ({ where, data }: any) => Object.assign(messages.find(m => m.id === where.id), data) },
    agentRun: { findMany: async () => inspection ? [{ id: "source-run", status: inspection.state === "COMPLETED" ? "COMPLETED" : "RUNNING", createdAt: new Date() }] : [],
      findUnique: async () => ({ id: "planning-run", status: "PLANNING", conversationId: conversation.id, userId: "owner", projectId: "project-a" }) } };
  db.$transaction = async (fn: any) => fn(db);
  const agents: any = { getRun: async () => ({ inspection }), createRunTx: async (_tx: any, _claims: any, input: any) => { runs.push(input); return { id: "inspection-run", status: "QUEUED" }; },
    scheduleRunExecution: () => {}, planFromConversation: async (...args: any[]) => { calls.push(args); return { runId: "planning-run" }; },
    executePlan: () => assert.fail("Must not execute"), executeExactProposal: () => assert.fail("Must not execute"),
    requestExactApproval: () => assert.fail("Must not approve"), issueExactPermit: () => assert.fail("Must not issue permit") };
  const service = () => new ConversationService(db, agents, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { getActiveBinding: async () => binding } as any);
  return { service, messages, runs, calls, queries, claims, setInspection: (v: any) => { inspection = v; } };
}
test("same-conversation inspection → certified navbar → reload → anaphora planning; no direct authorization or dispatch", async () => {
  const h = fixture();
  const first: any = await h.service().postMessage("conversation-a", h.claims, { content: "بص على الـnavbar", metadata: { clientMessageId: "inspect-a" } });
  assert.equal(first.conversationId, "conversation-a"); assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].conversationId, "conversation-a"); assert.match(h.runs[0].instruction, /Read and analyze navbar/);
  assert.equal(h.messages[0].content, "بص على الـnavbar");
  h.setInspection(view());
  const second: any = await h.service().postMessage("conversation-a", h.claims, { content: "طيب خلّيه أسود", metadata: { clientMessageId: "plan-a" } });
  assert.equal(second.conversationId, "conversation-a"); assert.equal(h.calls.length, 1); assert.equal(h.runs.length, 1);
  assert.equal(h.calls[0][4], "source-run"); assert.match(h.calls[0][2], /src\/Navbar.tsx/); assert.match(h.calls[0][2], /خلّيه أسود/);
  const interpreted = new AgentUnderstandingService().understand({ userId: "owner", projectId: "project-a", conversationId: "conversation-a", instruction: h.calls[0][2], userRole: "PM", availableCapabilities: [], workspaceAvailable: true });
  assert.ok(interpreted.userIntent.includes("MODIFY")); assert.ok(interpreted.userIntent.includes("PLAN"));
  for (const query of h.queries) assert.ok(query.take <= 20);
});
test("uncertified modification persists the original message and starts only read-only prerequisite inspection", async () => {
  const h = fixture(); h.setInspection(view(false));
  await h.service().postMessage("conversation-a", h.claims, { content: "طيب عدّل الـnavbar" });
  assert.equal(h.calls.length, 0); assert.equal(h.runs.length, 1);
  assert.match(h.runs[0].instruction, /Do not modify any file or execute any write/);
  assert.equal(h.messages[0].content, "طيب عدّل الـnavbar");
});

test("historical conversation routing keeps saved binding instead of current project binding", async () => {
  const h = fixture(); h.setInspection(view());
  const service: any = h.service();
  service.runtimeWorkspaces = { getActiveBinding: () => assert.fail("Active project binding must not become routing context") };
  const conversation = { id: "conversation-a", userId: "owner", projectId: "project-a", metadata: { modeContext: { version: 1, mode: "CHAT", organizationId: "org", workspace } } };
  const before = structuredClone(conversation);
  const summary = await service.workflowSummary(conversation, h.claims, "بص على الـnavbar");
  assert.deepEqual(summary.workspace, workspace);
  assert.equal(summary.references[0].bindingVersion, 40);
  assert.deepEqual(conversation, before);
});

test("unbound conversation does not inherit the project's current routing workspace", async () => {
  const h = fixture(); const service: any = h.service();
  const summary = await service.workflowSummary({ id: "conversation-a", projectId: "project-a", metadata: { modeContext: { version: 1, mode: "CHAT", organizationId: "org", workspace: null } } }, h.claims);
  assert.equal(summary.workspace, null);
});
