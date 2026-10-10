import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { workspaceFileReferences } from "../src/agent-runtime/workspace-intent";
import { RecommendationService, materiallyDifferent } from "../src/conversation/recommendation.service";
import { recommendationResponse, recommendationPlanningObjective, parseRecommendation, recommendationMessage, assertRecommendationPreservation } from "../src/conversation/recommendation.contract";
import { ConversationService } from "../src/conversation/conversation.service";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";
import { generateConversationPlan, certifiedConversationContext } from "../src/agent-runtime/understanding/persisted-planning";
import { decideChange, changeReviewState } from "../src/conversation/change-selection";
import { prepareChangeSet } from "../src/conversation/change-set";
const workflow = (): ConversationWorkflowSummary => ({ activeInspections: [], certifiedUnderstanding: null, latestPlan: null, pendingApprovals: [], execution: null,
  workspace: { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" }, workspaceFiles: ["index.html"] });
const liveAdvisory = "طيب لو أنا عايز أحسن المشروع ده، إيه أكتر حاجات شايف إنها محتاجة تحسين؟";
test("live project recommendation outranks cached visibility and requests bounded inspection without certified evidence", () => {
  const c = workflow(), before = structuredClone(c);
  const d = resolveConversationIntent(liveAdvisory, c);
  assert.equal(d.route, "INSPECTION"); assert.equal(d.reason, "project-recommendation-prerequisite");
  assert.match(d.inspectionInstruction!, /^Review the currently bound workspace project and recommend improvements/);
  assert.equal(d.inspectionPlanningObjective, undefined); assert.deepEqual(c, before);
  assert.equal(resolveConversationIntent(liveAdvisory, { ...c, workspace: null }).route, "UNAVAILABLE");
});
test("live recommendation uses certified same-conversation source rather than rereading", () => {
  const d = resolveConversationIntent(liveAdvisory, { ...workflow(), certifiedUnderstanding: { runId: "current", sequence: 2 } });
  assert.equal(d.route, "UNDERSTANDING"); assert.equal(d.reason, "certified-project-recommendation"); assert.equal(d.target?.runId, "current");
  assert.equal(resolveConversationIntent("شايف المشروع؟", workflow()).route, "WORKSPACE");
});
for (const text of ["راجعلي الـindex وقولي رأيك", "حلل الـindex", "بص على الملف ده وقولي نطوره إزاي"])
  test(`natural review resolves only the unique authorized target: ${text}`, () => {
    const d = resolveConversationIntent(text, workflow()); assert.equal(d.route, "INSPECTION"); assert.match(d.inspectionInstruction!, /^Read and analyze index.html/);
    assert.equal(d.inspectionPlanningObjective, undefined);
  });
test("real ambiguity and truncated listing clarify without guessing", () => {
  for (const changes of [{ workspaceFiles: ["index.html", "index.ts"] }, { workspaceFilesTruncated: true }, { workspaceFiles: [] }])
    assert.equal(resolveConversationIntent("راجعلي الـindex وقولي رأيك", { ...workflow(), ...changes }).route, "AMBIGUOUS");
});
test("explicit file is preferred; compound review prose is not a second target; real paths remain valid", () => {
  assert.equal(resolveConversationIntent("Review other.html", workflow()).route, "INSPECTION");
  assert.deepEqual(workspaceFileReferences("Review index.html, identify main sections/components."), ["index.html"]);
  for (const path of ['"sections/components"', "src/sections/components", "sections/components"])
    assert.ok(workspaceFileReferences(`Read ${path}`).includes(path.replace(/"/g, "")));
});
test("architecture read controls do not create a modification or execution requirement", () => {
  const u = new AgentUnderstandingService().understand({ userId: "u", instruction: "اشرحلي المشروع بشكل هندسي. لا تعدّل أي ملف ولا تنفّذ أوامر.", availableCapabilities: ["workspace_reader"] });
  assert.equal(u.operationClass, "READ"); assert.ok(!u.userIntent.includes("MODIFY")); assert.ok(!u.userIntent.includes("EXECUTE"));
});
const a = { title: "Hero copy", objective: 'Change only the Hero title in index.html from "Building intelligent digital experiences." to "Building intelligent digital products." Preserve existing markup and all other bytes.', changeKind: "TEXT" as const, preservation: "SPECIFIED" as const };
const b = { title: "Accessible project navigation", objective: "Add a keyboard accessible skip navigation link before the project sections with explicit focus styling and descriptive accessible labels.", changeKind: "ADDITION" as const, preservation: "SPECIFIED" as const };
test("rejection is never acceptance or approval; explicit recommendation acceptance is bounded", () => {
  assert.equal(recommendationResponse("لا، مش عاجبني. اعمل اقتراح أحسن."), "REJECT");
  assert.equal(recommendationResponse("Accept the second recommendation"), "ACCEPT");
  for (const t of ["approve", "نفذ", "تمام", "موافق على الاقتراح الأول", "اعتمد الاقتراح واحذف الملفات", "I reject an idea from another conversation"]) assert.equal(recommendationResponse(t), null);
});
test("materially different recommendation required; renamed/reworded identical objective rejected", () => {
  assert.equal(materiallyDifferent(a, b), true); assert.equal(materiallyDifferent(a, { ...a, title: "Better copy" }), false);
});
test("redesign leaves preservation explicitly unknown rather than inventing it", () => {
  const r = parseRecommendation({ ...b, changeKind: "REDESIGN", preservation: "UNSPECIFIED" });
  assert.match(recommendationMessage(r), /Unknown: specify which existing functions/);
  assert.throws(() => parseRecommendation({ ...r, approval: true }), /INVALID/);
});

async function groundedReview() {
  const h = await inspectionHarness(), objective = "Review index.html and give an engineering opinion and concrete improvement recommendation.";
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "review-run" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, objective));
  h.responses.push(h.inspectStructured("filesystem.read", "index.html")); await h.service.advance(run.id);
  const state = () => h.ledger.transaction(async tx => (await h.ledger.read<any>(tx, "AGENT_INSPECTION", run.id))!.payload);
  let s = await state(); await h.service.approve(run.id, h.claims, { planVersion: s.current.planVersion, fingerprint: s.current.fingerprint, decision: "APPROVED" });
  await h.complete((await h.request("poll")).execution, '<section class="hero"><h1>Building <span>intelligent</span> digital experiences.</h1></section>');
  await h.service.advance(run.id); s = await state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId, sessionClaims: h.claims,
    projectId: run.projectId, conversationId: run.conversationId, agentRunId: run.id, instruction: objective, runtimeEvidence: s.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible); const base = interpretContext(context, visible);
  const report = { constraintIds: base.constraints.map(c => c.id), facts: [{ id: "hero", text: visible.get(base.evidenceRefs[0])!, evidenceRef: base.evidenceRefs[0] }],
    inferences: [{ id: "meaning", text: "A static Hero introduction.", factIds: ["hero"], uncertainty: "Source-linked interpretation, not a proven behavior." }],
    hypotheses: [{ id: "security-review", text: "Review deployment CSP configuration before hosting.", evidenceRefs: base.evidenceRefs, uncertainty: "Recommendation, not a proven vulnerability or observed server configuration." }], unknowns: [] };
  return { ...h, run, state, report };
}
test("complete read → structured grounded review; observed/inferred/recommendation remain distinct and persisted", async () => {
  const h = await groundedReview();
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Ground review", report: h.report, recommendation: a }));
  await h.service.advance(h.run.id);
  const s = await h.state(); assert.equal(s.state, "COMPLETED"); assert.equal(s.understanding.status, "GROUNDED");
  assert.equal(s.operations.length, 1); assert.equal(s.references[0].truncated, false);
  const messages = [...h.tables.conversationMessage.values()]; const saved = messages.find(m => m.inspectionReport || m.metadata?.inspectionReport);
  assert.match(saved.content, /Observed/); assert.match(saved.content, /Inferred/); assert.match(saved.content, /Recommendations/);
  assert.equal(saved.metadata.recommendation.sourceRunId, h.run.id);
  assert.ok(h.calls.every(c => c.structured)); assert.ok(h.calls.every(c => c.history.length === 0));
  assert.match(h.calls.at(-1).systemInstruction, /never proven vulnerabilities/);
});
test("unsupported security fact or invalid supporting IDs still fail certification", async () => {
  const h = await groundedReview();
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: { ...h.report,
    facts: [{ ...h.report.facts[0], text: "The project has an exploitable XSS vulnerability." }] }, recommendation: a }));
  await h.service.advance(h.run.id); assert.equal((await h.state()).state, "PARTIAL");
  assert.equal((await h.request("poll")).execution, null);
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
});
test("recommendation metadata cannot bypass strict inspection report parsing", async () => {
  const h = await groundedReview();
  assert.throws(() => parseInspectionDecision(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review",
    report: { ...h.report, inferences: [{ ...h.report.inferences[0], factIds: ["missing"] }] }, recommendation: { ...a, approved: true } }), h.binding));
});

function discussion() {
  const rows: any[] = [], calls: any[] = [], claims: any = { sub: "owner", organizationId: "org", role: "PM" };
  const conv: any = { id: "b", userId: "owner", projectId: "project", project: { organizationId: "org" }, metadata: { modeContext: { mode: "CHAT", version: 1, organizationId: "org", workspace: workflow().workspace } } };
  const recommendation = { ...a, sourceRunId: "source", sourceSequence: 1, ...workflow().workspace };
  rows.push({ id: "recommendation-a", conversationId: "b", senderType: "assistant", content: "A", metadata: { recommendation }, createdAt: new Date() });
  const model: any = {
    findUnique: async ({ where }: any) => rows.find(r => r.id === where.id),
    findFirst: async ({ where }: any) => [...rows].reverse().find(r => r.conversationId === where.conversationId && r.senderType === where.senderType &&
      (where.AND ? where.AND.every((c: any) => r.metadata?.[c.metadata.path[0]] === c.metadata.equals) : where.metadata.path[0] === "recommendation" ? !!r.metadata?.recommendation : r.metadata?.[where.metadata.path[0]] === where.metadata.equals)),
    create: async ({ data }: any) => { assert.ok(!rows.some(r => r.id === data.id)); const r = { ...data, createdAt: new Date() }; rows.push(r); return r; },
    upsert: async ({ where, create }: any) => rows.find(r => r.id === where.id) ?? model.create({ data: create }) };
  const db: any = { conversationMessage: model, conversation: { findUnique: async () => conv, update: async () => conv }, $queryRawUnsafe: async () => [] };
  db.$transaction = async (fn: any) => fn(db);
  const gateway: any = { requestStructuredReasoning: async (input: any) => { calls.push(input); return JSON.stringify(b); } };
  const rec = new RecommendationService(db, gateway), plans: any[] = [];
  const agents: any = { certifiedConversationContext: async () => ({ source: { sourceRunId: "source", checkpoint: { sequence: 1, understanding: { facts: [], inferences: [] } } } }),
    planFromConversation: async (...args: any[]) => { if (!plans.some(p => p.request === args[3])) plans.push({ request: args[3], objective: args[2], source: args[4] }); return { planId: "persisted-plan", version: 1, status: "PLAN_READY" }; } };
  const service = new ConversationService(db, agents, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, rec);
  (service as any).workflowSummary = async () => workflow();
  return { service, rec, rows, calls, plans, claims, agents, conv };
}

const liveRecommendationObjective = "Propose a bounded improvement pass that keeps the existing single-file structure and layout intact while strengthening accessibility (skip link, nav labeling, contrast verification) and replacing sample content (placeholder project image blocks and hello@example.com) with real assets and contact details. This is an objective proposal only; no execution authority is granted.";
function certifiedAdvisory(h: ReturnType<typeof discussion>) {
  const binding = { ...workflow().workspace, version: 41, organizationId: "org", userId: "owner", projectId: "project" };
  Reflect.set(h.service, "runtimeWorkspaces", { getActiveBinding: async () => binding });
  const source = { sourceRunId: "source", sourceConversationId: "b", digest: "source-digest", binding,
    checkpoint: { sequence: 1, understanding: { facts: [{ id: "f", text: "certified excerpt", evidenceRef: "e" }], inferences: [], unknowns: [] } } };
  h.agents.certifiedConversationContext = async () => ({ source });
  (h.service as any).workflowSummary = async () => ({ ...workflow(), certifiedUnderstanding: { runId: "source", sequence: 1 } });
  return source;
}
test("certified advisory persists and replays without reads, runs, permits, plans or another model call", async () => {
  const h = discussion(); certifiedAdvisory(h);
  const dto = { content: liveAdvisory, metadata: { clientMessageId: "advisory" } };
  const reply = await h.service.postMessage("b", h.claims, dto), count = h.rows.length;
  assert.equal(reply.metadata.recommendation.sourceRunId, "source"); assert.equal(reply.metadata.recommendation.bindingVersion, 41);
  assert.equal(reply.metadata.recommendation.runtimeId, "runtime"); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].history, []); assert.equal(JSON.parse(h.calls[0].question).observed[0].evidenceRef, "e");
  assert.equal((await h.service.postMessage("b", h.claims, dto)).id, reply.id);
  assert.equal(h.calls.length, 1); assert.equal(h.rows.length, count); assert.equal(h.plans.length, 0);
});
test("advisory publication fails closed if certified source changes during reasoning", async () => {
  const h = discussion(), source = certifiedAdvisory(h); let calls = 0;
  h.agents.certifiedConversationContext = async () => ({ source: { ...source, digest: ++calls >= 3 ? "changed" : source.digest } });
  await assert.rejects(() => h.service.postMessage("b", h.claims, { content: liveAdvisory, metadata: { clientMessageId: "source-change" } }), /UNDERSTANDING_CHANGED/);
  assert.equal(h.rows.filter(r => r.id.endsWith("_reply") && r.metadata?.recommendationRequestId).length, 0);
  assert.equal(h.plans.length, 0);
});
test("failed rejection has one durable terminal notice; reload/replay never calls provider again", async () => {
  const h = discussion(); let calls = 0;
  const gateway = Reflect.get(h.rec, "gateway") as { requestStructuredReasoning: () => Promise<string> };
  gateway.requestStructuredReasoning = async () => { calls++; throw new Error("private upstream response body"); };
  const dto = { content: "لأ، الاقتراح ده مش عاجبني. اعمل اقتراح أحسن.", metadata: { clientMessageId: "failed-rejection" } };
  await assert.rejects(() => h.service.postMessage("b", h.claims, dto), /private upstream response body/);
  assert.equal(h.rows.filter(r => r.metadata?.recommendationResponse === "REJECT").length, 1);
  assert.equal(h.rows.filter(r => r.metadata?.submissionFailure).length, 1);
  const saved = h.rows.find(r => r.metadata?.submissionFailure);
  assert.match(saved.content, /رمز التشخيص: REQUEST_FAILED/); assert.match(saved.content, /لم يُعَد إرسال الطلب تلقائيًا/); assert.doesNotMatch(saved.content, /private upstream/);
  const count = h.rows.length; const replay = await h.service.postMessage("b", h.claims, dto);
  assert.equal(replay.id, saved.id); assert.equal(h.rows.length, count); assert.equal(calls, 1);
  assert.equal(h.plans.length, 0);
});
const contractFor = (objective: string) => interpretContext(new AgentUnderstandingService().understand({
  userId: "u", instruction: objective, availableCapabilities: ["workspace_reader"] }), new Map());

test("exact live recommendation authority framing is excluded at acceptance without mutating persisted prose", async () => {
  const h = discussion(); h.rows[0].metadata.recommendation.objective = liveRecommendationObjective;
  await h.service.postMessage("b", h.claims, { content: "Accept the current recommendation", metadata: { clientMessageId: "live-framing" } });
  assert.equal(h.plans.length, 1);
  assert.equal(h.plans[0].objective, liveRecommendationObjective.slice(0, liveRecommendationObjective.indexOf(". This is an objective proposal only")));
  assert.equal(h.rows[0].metadata.recommendation.objective, liveRecommendationObjective);
  const u = contractFor(h.plans[0].objective);
  assert.ok(!u.constraints.some(c => c.source === "USER" && /objective proposal only|no execution authority/.test(c.description)));
  assert.ok(!u.unknowns.some(q => q.id === "constraint-interpretation"));
  assert.equal(h.rows.filter(r => r.metadata?.recommendationResponse === "ACCEPT").length, 1);
});

test("genuine unsupported restriction survives recommendation boundary and remains blocking", () => {
  const restriction = "Do not alter undocumented external synchronization behavior";
  const objective = recommendationPlanningObjective({ ...a, objective: `${b.objective} ${restriction}. This is an objective proposal only; no execution authority is granted.` });
  assert.ok(objective.includes(restriction));
  const u = contractFor(objective);
  assert.ok(u.constraints.some(c => c.source === "USER" && c.rule === "UNRESOLVED" && c.requestQuote === restriction));
  assert.ok(u.unknowns.some(q => q.id === "constraint-interpretation" && q.state === "UNKNOWN"));
  assert.equal(u.readiness, "NEEDS_CLARIFICATION");
});

test("framing projection does not change direct user constraints, quoted content or unknown disclaimers", () => {
  assert.ok(contractFor("no execution authority is granted").constraints.some(c => c.source === "USER" && c.rule === "UNRESOLVED"));
  for (const objective of [a.objective, 'Change the title to "no execution authority is granted".', `${b.objective} Never infer permission from this operation.`])
    assert.equal(recommendationPlanningObjective({ ...a, objective }), objective);
  assert.throws(() => recommendationPlanningObjective({ ...a, objective: "This is an objective proposal only; no execution authority is granted." }), /PLANNING_OBJECTIVE_REQUIRED/);
});
test("rejection retains A, persists different B, reload/replay does not duplicate", async () => {
  const h = discussion(), body = { content: "لا، مش عاجبني. اعمل اقتراح أحسن.", metadata: { clientMessageId: "reject-1" } };
  const result: any = await h.service.postMessage("b", h.claims, body); await h.service.postMessage("b", h.claims, body);
  assert.equal(h.calls.length, 1); assert.equal(h.plans.length, 0); assert.equal(h.rows[0].content, "A");
  assert.equal(result.content.includes(b.title), true); assert.equal(h.rows.filter(r => r.metadata?.recommendation).length, 2);
});
test("acceptance of persisted B enters planning only; replay forwards same request and source", async () => {
  const h = discussion(); await h.service.postMessage("b", h.claims, { content: "لا، مش عاجبني", metadata: { clientMessageId: "reject" } });
  const body = { content: "Accept the second recommendation", metadata: { clientMessageId: "accept" } };
  const result: any = await h.service.postMessage("b", h.claims, body); await h.service.postMessage("b", h.claims, body);
  const accepted = h.rows.filter(r => r.metadata?.recommendationResponse === "ACCEPT");
  assert.equal(accepted.length, 1); assert.equal(accepted[0].metadata.planningOnly, true);
  assert.equal(accepted[0].metadata.recommendationId, h.rows.find(r => r.metadata?.recommendation?.generation === 2)!.id);
  assert.equal(h.plans.length, 1); assert.equal(h.plans[0].objective, b.objective); assert.equal(h.plans[0].source, "source");
  assert.match(result.content, /Saved engineering plan persisted-plan/);
});
test("recommendations cannot cross conversation, binding or missing source", async () => {
  for (const key of ["conversation", "binding", "source"]) {
    const h = discussion(); if (key === "conversation") h.rows[0].conversationId = "a";
    if (key === "binding") h.rows[0].metadata.recommendation.bindingVersion = 40;
    if (key === "source") h.agents.certifiedConversationContext = async () => null;
    await h.service.postMessage("b", h.claims, { content: "Accept the current recommendation", metadata: { clientMessageId: "accept" } });
    assert.equal(h.plans.length, 0); assert.equal(h.calls.length, 0);
  }
});
test("unspecified redesign preservation asks clarification before planning", async () => {
  const h = discussion(); Object.assign(h.rows[0].metadata.recommendation, { changeKind: "REDESIGN", preservation: "UNSPECIFIED" });
  const result: any = await h.service.postMessage("b", h.claims, { content: "Accept the current recommendation", metadata: { clientMessageId: "accept" } });
  assert.match(result.content, /Which existing functions/); assert.equal(h.plans.length, 0);
});

test("explicit second recommendation cannot select first or third generation", async () => {
  for (const generation of [1, 3]) {
    const h = discussion(); h.rows[0].metadata.recommendation.generation = generation;
    await h.service.postMessage("b", h.claims, { content: "Accept the second recommendation", metadata: { clientMessageId: "accept-second" } });
    assert.equal(h.plans.length, 0);
  }
});

test("model cannot invent redesign preservation; ordinary redesign asks before planning", async () => {
  assert.throws(() => assertRecommendationPreservation({ ...b, changeKind: "REDESIGN" }, "Review index.html"), /PRESERVATION_UNSPECIFIED/);
  const h = discussion();
  const result: any = await h.service.postMessage("b", h.claims, { content: "Redesign index.html", metadata: { clientMessageId: "redesign" } });
  assert.match(result.content, /Which existing functions/); assert.equal(h.plans.length, 0); assert.equal(h.calls.length, 0);
});

test("invalid references and inference IDs block certification independently", async () => {
  for (const branch of ["reference", "inference"]) {
    const h = await groundedReview();
    const report = branch === "reference" ? { ...h.report, facts: [{ ...h.report.facts[0], evidenceRef: "unadmitted" }] } :
      { ...h.report, inferences: [{ ...h.report.inferences[0], factIds: ["rejected-or-missing"] }] };
    h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report, recommendation: a }));
    await h.service.advance(h.run.id);
    assert.equal((await h.state()).state, "PARTIAL");
    assert.equal((await h.request("poll")).execution, null);
    assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
  }
});

test("failed replacement cannot fall back to rejected recommendation or replay the model", async () => {
  const h = discussion(); h.calls.length = 0;
  // Same objective is not a materially different recommendation.
  const rec = new RecommendationService((h.rec as any).db, { requestStructuredReasoning: async () => { h.calls.push("call"); return JSON.stringify(a); } } as any);
  const body = "لا، مش عاجبني", source = { checkpoint: { understanding: { facts: [], inferences: [] } } };
  await assert.rejects(rec.reject(h.conv, h.claims, body, "failed", h.rows[0], source), /NOT_DIFFERENT/);
  await assert.rejects(rec.reject(h.conv, h.claims, body, "failed", h.rows[0], source), /PENDING_OR_FAILED/);
  await h.service.postMessage("b", h.claims, { content: "Accept the current recommendation", metadata: { clientMessageId: "accept-rejected" } });
  assert.equal(h.calls.length, 1); assert.equal(h.plans.length, 0);
});
test("accepted certified recommendation with authority framing → persisted PLAN_READY; replay creates no second revision", async () => {
  const h = await groundedReview();
  const recommendation = { ...a, objective: 'Change the Hero title in index.html from "Building intelligent digital experiences." to "Building intelligent digital products."\nAcceptance: exact target index.html; change only the Hero title, preserving its existing markup; preserve CSS; preserve encoding. This is an objective proposal only; no execution authority is granted.' };
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Review", report: h.report, recommendation }));
  await h.service.advance(h.run.id);
  const saved = [...h.tables.conversationMessage.values()].find(m => m.metadata?.recommendation);
  const sourceText = h.report.facts[0].text; let calls = 0;
  const gateway: any = { requestStructuredReasoning: async (input: any) => {
    calls++; const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
    const refs = data.evidenceRefs, scopes = data.heroAllowedScopes[0].scopeRefs;
    return JSON.stringify({ constraintIds: data.requiredConstraintIds, facts: [{ id: "hero", text: sourceText, evidenceRef: refs[0] }], inferences: [], hypotheses: [], unknowns: [], steps: [
      { id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", dependencies: [], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [], verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Change only Hero text.", verificationDescription: "Authorized read-back and exact diff." },
      { id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", dependencies: ["change"], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [], verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Compare preserved bytes.", verificationDescription: "Authorized read-back and exact diff." }] });
  } };
  const deps = { inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway };
  const agents: any = { certifiedConversationContext: (c: string, claims: any, instruction: string) => certifiedConversationContext(deps, claims, c, instruction),
    planFromConversation: (c: string, claims: any, instruction: string, request: string, source: string) => generateConversationPlan(deps, claims, c, instruction, request, source) };
  agents.prepareChangeSet = (c: string, claims: any, body: any) => prepareChangeSet({ ledger: h.ledger, inspections: h.service, certified: agents.certifiedConversationContext }, c, claims, body);
  const recommendations: any = { latest: async () => saved, rejected: async () => false, accept: async () => { await h.db.conversationMessage.upsert({ where: { id: "accept-decision" }, create: { id: "accept-decision", conversationId: h.run.conversationId, senderId: h.claims.sub, senderType: "user", metadata: { recommendationResponse: "ACCEPT", recommendationId: saved.id, recommendationGeneration: saved.metadata.recommendation.generation } }, update: {} }); } };
  const service = new ConversationService(h.db, agents, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, recommendations);
  (service as any).workflowSummary = async () => ({ ...workflow(), workspace: { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version, runtimeId: h.binding.runtimeId, runtimeFingerprint: h.binding.runtimeFingerprint } });
  const before = h.tables.auditEvent.size, body = { content: "Accept the current recommendation", metadata: { clientMessageId: "accept-persisted" } };
  const first: any = await service.postMessage(h.run.conversationId, h.claims, body); await service.postMessage(h.run.conversationId, h.claims, body);
  const plans = [...h.tables.agentPlan.values()].filter(p => p.id.startsWith("engineering_plan_"));
  assert.equal(plans.length, 1); assert.equal(plans[0].status, "PLAN_READY"); assert.match(first.content, /PLAN_READY/); assert.equal(calls, 1);
  assert.equal(saved.metadata.recommendation.objective, recommendation.objective);
  const planning = plans[0].steps[0].parameters.planning;
  assert.ok(!planning.plan.constraints.some((c: any) => c.rule === "UNRESOLVED"));
  assert.ok(!planning.plan.objective.includes("no execution authority is granted"));
  assert.equal(planning.plan.authorization, "NOT_GRANTED");
  const reviews = [...h.tables.conversationMessage.values()].filter(m => m.metadata?.changeSet);
  assert.equal(reviews.length, 1); assert.equal(reviews[0].metadata.changeSet.changes[0].type, "MODIFIED");
  assert.equal(reviews[0].metadata.changeSet.source.runId, h.run.id);
  assert.equal(reviews[0].metadata.changeSet.plan.id, plans[0].id);
  assert.equal(reviews[0].metadata.changeSet.executionEnabled, false);
  assert.equal(h.tables.auditEvent.size, before + 1); // one immutable review; no execution authority
  const set = reviews[0].metadata.changeSet, reviewDeps = { ledger: h.ledger, inspections: h.service };
  const selected = await decideChange(reviewDeps, h.run.conversationId, h.claims, { changeSetId: set.id, changeSetVersion: set.version,
    changeSetDigest: set.digest, changeId: set.changes[0].id, decision: "KEEP", expectedRevision: 0, requestId: "keep-certified" });
  assert.equal(selected.revision, 1);
  const restored = await changeReviewState(reviewDeps, h.run.conversationId, h.claims, set);
  assert.equal(restored.available, true); assert.equal(restored.selectedChanges![0].id, set.changes[0].id);
  assert.equal((await h.state()).operations.length, 1); // existing certified read, no automatic reread

  assert.equal((await h.request("poll")).execution, null);
});


test("source-only review retains future preservation and visual unknowns without blocking certified readiness", async () => {
  const h = await groundedReview();
  h.report.unknowns.push(...[
    { id: "unk-user-preservation", description: "Future redesign preservation is unspecified", whyNeeded: "Confirm before a future concrete redesign", severity: "LOW", evidenceCategory: "OPTIONAL_CONTEXT" },
    { id: "unk-rendered-appearance", description: "Browser appearance not observed", whyNeeded: "Supplementary to this source-only review", severity: "LOW", evidenceCategory: "OPTIONAL_VISUAL" }
  ] as never[]);
  const recommendation = { ...a, changeKind: "REDESIGN", preservation: "UNSPECIFIED" };
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Review", report: h.report, recommendation }));
  await h.service.advance(h.run.id);
  const s = await h.state();
  assert.equal(s.understanding.status, "GROUNDED");
  assert.equal(s.understanding.understanding.readiness, "UNDERSTANDING_READY");
  assert.ok(s.understanding.understanding.unknowns.every((u: any) => u.state === "UNKNOWN"));
  const saved = [...h.tables.conversationMessage.values()].find(m => m.metadata?.recommendation);
  assert.equal(saved.metadata.recommendation.preservation, "UNSPECIFIED");
  assert.equal(s.operations.length, 1);
  assert.match(h.calls.at(-1).systemInstruction, /future concrete redesign\/modification are OPTIONAL_CONTEXT with LOW severity/);
  assert.match(h.calls.at(-1).systemInstruction, /current operation requests a concrete redesign\/modification\/change.*REQUIRED_INFORMATION and blocking/);
  // Inspection readiness does not satisfy the later concrete redesign gate.
  const d = discussion();
  Object.assign(d.rows[0].metadata.recommendation, { changeKind: "REDESIGN", preservation: "UNSPECIFIED" });
  const result: any = await d.service.postMessage("b", d.claims, { content: "Accept the current recommendation", metadata: { clientMessageId: "preservation-required" } });
  assert.match(result.content, /Which existing functions/);
  assert.equal(d.plans.length, 0);
});

for (const gap of ["current-preservation", "requested-source-evidence"]) test(`current required ${gap} still blocks review readiness`, async () => {
  const h = await groundedReview();
  h.report.unknowns.push({ id: gap, description: "Information required for the current request is missing", whyNeeded: "Cannot satisfy current scope without this information", severity: "LOW", evidenceCategory: "REQUIRED_INFORMATION" } as never);
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: h.report, recommendation: a }));
  await h.service.advance(h.run.id);
  const s = await h.state();
  assert.equal(s.understanding.status, "PARTIAL");
  assert.equal(s.understanding.understanding.readiness, gap === "requested-source-evidence" ? "NEEDS_EVIDENCE" : "NEEDS_CLARIFICATION");
  assert.equal(s.understanding.understanding.unknowns[0].state, "UNKNOWN");
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.recommendation));
});

for (const category of ["OPTIONAL_CONTEXT", "REQUIRED_INFORMATION"] as const) test(`general review certification preserves ${category} UNKNOWN with contextual readiness`, async () => {
  const h = await groundedReview();
  h.report.unknowns.push({ id: "unk-assets-links", description: "Project links not inspected", whyNeeded: "Additional review context", severity: "LOW", evidenceCategory: category } as never);
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review", report: h.report, recommendation: a }));
  await h.service.advance(h.run.id); const s = await h.state();
  assert.equal(s.understanding.understanding.unknowns[0].state, "UNKNOWN");
  assert.equal(s.understanding.status, category === "OPTIONAL_CONTEXT" ? "GROUNDED" : "PARTIAL");
  assert.equal(s.operations.length, 1); assert.equal(s.references[0].truncated, false);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.recommendation).length, category === "OPTIONAL_CONTEXT" ? 1 : 0);
  assert.match(h.calls.at(-1).systemInstruction, /Never classify missing requested facts/);
});
