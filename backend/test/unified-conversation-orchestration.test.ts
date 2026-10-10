import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { planningInspectionInstruction } from "../src/conversation/conversation-prerequisite";
import { workspaceFileReferences } from "../src/agent-runtime/workspace-intent";
import { ConversationService } from "../src/conversation/conversation.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";
import { generateConversationPlan } from "../src/agent-runtime/understanding/persisted-planning";
import { inspectionHarness } from "./helpers/inspection-loop-harness";

const objective = 'Change the Hero title in index.html from "Building intelligent digital experiences." to "Building intelligent digital products."\nAcceptance: exact target index.html; change only the Hero title, preserving its existing markup; preserve CSS; preserve encoding.';
const source = '<section class="hero"><h1>Building <span>intelligent</span> digital experiences.</h1></section>';
const arrowLiveObjective = `Change only the Hero heading in index.html:
"Building intelligent digital experiences."
→
"Building intelligent digital products."

Preserve the existing <h1>, the <span> around "intelligent", surrounding structure/whitespace, and all other content.

Prepare the engineering plan only and STOP at PLAN_READY. Do not create a proposal. Do not approve. Do not issue an execution permit. Do not write or modify the workspace.`;
const liveObjective = `Change only the Hero heading text in index.html from "Building intelligent digital experiences." to "Building intelligent digital products." Preserve the existing h1 element, span tags, formatting, structure, and every other part of index.html unchanged.

Success criteria:
- The Hero heading exactly reads "Building intelligent digital products."
- The existing h1 structure and span tags remain unchanged.
- All other content in index.html remains unchanged.
- Verification requires exact before/after diff and read-back after a separately authorized execution.

Prepare the engineering plan only and stop after persisted PLAN_READY. Do not create a proposal. Do not request approval. Do not issue an execution permit. Do not execute or modify any file.`;
const base = (): ConversationWorkflowSummary => ({ activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [],
  workspace: { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" } });

for (const text of ["Hello", "إيه رأيك في المشروع؟"]) test(`ordinary conversation unchanged: ${text}`, () => {
  assert.equal(resolveConversationIntent(text, base()).route, "CONVERSATION");
});
for (const text of ["Read index.html", "إيه الموجود في index.html؟", "حلل ملفات الـstyle"]) test(`pure read has no planning continuation: ${text}`, () => {
  const d = resolveConversationIntent(text, base()); assert.equal(d.route, "INSPECTION"); assert.equal(d.inspectionPlanningObjective, undefined);
});
test("unresolved modification owns an automatic read prerequisite without authority", () => {
  const c = base(), before = structuredClone(c), d = resolveConversationIntent("عدّل الـnavbar", c);
  assert.equal(d.route, "INSPECTION"); assert.equal(d.inspectionPlanningObjective, "عدّل الـnavbar");
  assert.match(d.inspectionInstruction!, /Read and analyze navbar/); assert.deepEqual(c, before);
  assert.ok(!("approval" in d) && !("permit" in d));
  const read = planningInspectionInstruction(objective);
  const context = new AgentUnderstandingService().understand({ userId: "user", instruction: read, availableCapabilities: ["workspace_reader"], workspaceAvailable: true });
  assert.equal(context.operationClass, "READ"); assert.ok(!context.userIntent.includes("EXECUTE"));
  assert.throws(() => planningInspectionInstruction("Change index.html and other.html"), /AMBIGUOUS/);
});
test("certified modification uses planning and persisted binding; stale references fail closed", () => {
  const c = base(); c.references = [{ ...c.workspace!, runId: "grounded", concept: "navbar", relativePath: "actual.html", evidenceId: "source", certified: true }];
  assert.equal(resolveConversationIntent("عدّل الـnavbar", c).route, "PLANNING");
  c.references[0].bindingVersion = 40; assert.equal(resolveConversationIntent("عدّل الـnavbar", c).route, "UNAVAILABLE");
});
test("continuations and proposal routing remain bounded by persisted workflows", () => {
  const c = base(); assert.equal(resolveConversationIntent("نفّذ", c).route, "CONVERSATION");
  c.eligiblePlans = [{ runId: "planning", planId: "ready", planVersion: 2, digest: "digest" }];
  c.latestPlan = { runId: "planning", planId: "newer-not-ready", readiness: "PLAN_NOT_READY" };
  assert.equal(resolveConversationIntent("Create the exact proposal", c).target?.planId, "ready");
  assert.equal(resolveConversationIntent("كمّل", c).route, "EXACT_PROPOSAL");
  assert.equal(resolveConversationIntent("نفّذ", c).route, "UNDERSTANDING");
  c.pendingApprovals = [{ runId: "planning", approvalId: "approval" }];
  assert.equal(resolveConversationIntent("وافق", c).route, "APPROVAL_GUIDANCE");
  c.pendingPlanning = [{ runId: "planning", sourceRunId: "grounded", objective, missingInformationIds: ["success-criteria"] }];
  assert.equal(resolveConversationIntent("Acceptance criteria: Preserve all other content.", c).reason, "pending-planning-information");
});

test("production message entry schedules missing-grounding inspection in the same conversation", async () => {
  const h = await inspectionHarness(), service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  service.prisma = h.db; service.workflowSummary = async () => base();
  service.agentRuntimeService = {
    planFromConversation: async () => { throw new ConflictException("CERTIFIED_UNDERSTANDING_REQUIRED: missing"); },
    createRunTx: async (_tx: any, claims: any, dto: any, messageId: string, planningObjective: string) => {
      calls.push({ claims, dto, messageId, planningObjective });
      const run = await h.db.agentRun.create({ data: { ...h.run, id: "automatic-inspection", title: dto.title } });
      await h.service.initializeTx(h.db, run, claims, h.binding, dto.instruction, [], [], messageId, planningObjective); return run;
    }, scheduleRunExecution: (...args: any[]) => calls.push(args)
  };
  const result = await service.postMessage("conversation-a", h.claims, { content: objective, metadata: { clientMessageId: "turn" } });
  assert.equal(result.agentRunId, "automatic-inspection"); assert.equal(calls.length, 2);
  assert.equal(calls[0].planningObjective, objective); assert.equal(calls[0].dto.conversationId, "conversation-a");
  assert.equal(h.tables.conversationMessage.get(result.messageId).content, objective);
  const row: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  assert.equal(row.payload.planningContinuation.originatingMessageId, result.messageId);
  assert.equal(row.payload.planningContinuation.objective, objective);
  assert.equal(row.payload.operations.length, 0); assert.equal(row.payload.understanding, undefined);
});

const bulletLiveObjective = `Change only the Hero heading in index.html:
"Building intelligent digital experiences."
to
"Building intelligent digital products."

Preserve:
- existing <h1> structure
- existing <span> around "intelligent"
- surrounding structure/whitespace
- all other content

Prepare the engineering plan only and STOP at PLAN_READY. Do NOT create a proposal. Do NOT approve. Do NOT issue an execution permit. Do NOT write or modify the workspace.`;

test("exact persisted live bullet preservation routes the single-file modification to planning", () => {
  for (const instruction of [bulletLiveObjective, bulletLiveObjective.replace(/\n/g, "\r\n")]) {
    assert.deepEqual(workspaceFileReferences(instruction), ["index.html"]);
    const workflow = base(); workflow.activeInspections = [{ runId: "historical-paused-inspection" }];
    const decision = resolveConversationIntent(instruction, workflow, { triggerAgent: true });
    assert.equal(decision.route, "PLANNING");
    assert.equal(decision.reason, "engineering-intent-requires-certified-plan");
    assert.match(planningInspectionInstruction(instruction), /^Read and analyze index\.html\./);
  }
});

test("bullet prose exclusion retains quoted paths, real paths, and genuine multi-file ambiguity", () => {
  for (const target of ['"structure/whitespace"', "docs/structure/whitespace", "other.html"]) {
    const instruction = `${bulletLiveObjective}\nAlso read ${target}.`;
    assert.deepEqual(workspaceFileReferences(instruction), ["index.html", target.replace(/"/g, "")]);
    assert.throws(() => planningInspectionInstruction(instruction), /AMBIGUOUS/);
  }
  for (const phrase of ['surrounding "structure/whitespace"', "surrounding docs/structure/whitespace", "surrounding structure/whitespace outside this scope"]) {
    assert.equal(workspaceFileReferences(bulletLiveObjective.replace("surrounding structure/whitespace", phrase)).length, 2);
  }
  assert.ok(workspaceFileReferences("Read structure/whitespace").includes("structure/whitespace"));
  assert.ok(workspaceFileReferences("Preserve:\n- surrounding structure/whitespace\n- other files").includes("structure/whitespace"));
});

test("exact live multiline Hero request treats surrounding structure/whitespace as preservation and owns its read prerequisite", async () => {
  const instruction = `Change only the Hero heading in index.html:
"Building intelligent digital experiences."
→
"Building intelligent digital products."

Preserve the existing <h1>, the <span> around "intelligent", surrounding structure/whitespace, and all other content.

Prepare the engineering plan only and STOP at PLAN_READY. Do not create a proposal. Do not approve. Do not issue a permit. Do not write or modify the workspace.`;
  assert.deepEqual(workspaceFileReferences(instruction), ["index.html"]);
  const workflow = base();
  workflow.activeInspections = [{ runId: "historical-paused-inspection" }];
  assert.equal(resolveConversationIntent(instruction, workflow, { triggerAgent: true }).route, "PLANNING");
  const h = await inspectionHarness(), service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  service.prisma = h.db; service.workflowSummary = async () => workflow;
  service.agentRuntimeService = {
    planFromConversation: async (_c: string, _claims: any, original: string) => {
      assert.equal(original, instruction); throw new ConflictException("CERTIFIED_UNDERSTANDING_REQUIRED: missing");
    },
    createRunTx: async (tx: any, claims: any, dto: any, messageId: string, planningObjective: string) => {
      calls.push({ dto, planningObjective });
      const run = await tx.agentRun.create({ data: { ...h.run, id: "multiline-live-prerequisite", title: dto.title } });
      await h.service.initializeTx(tx, run, claims, h.binding, dto.instruction, [], [], messageId, planningObjective); return run;
    }, scheduleRunExecution: () => {}
  };
  const body = { content: instruction, triggerAgent: true, metadata: { clientMessageId: "multiline-live-turn" } };
  const result = await service.postMessage("conversation-a", h.claims, body);
  const row: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].dto.instruction, planningInspectionInstruction(instruction));
  assert.match(calls[0].dto.instruction, /^Read and analyze index\.html\./);
  const readContext = new AgentUnderstandingService().understand({ userId: "user", instruction: calls[0].dto.instruction, availableCapabilities: ["workspace_reader"], workspaceAvailable: true });
  assert.equal(readContext.operationClass, "READ");
  assert.equal(row.payload.state, "REQUESTED");
  assert.equal(row.payload.planningContinuation.objective, instruction);
  assert.equal(row.payload.planningContinuation.originatingMessageId, result.messageId);
  assert.equal((await service.postMessage("conversation-a", h.claims, body)).agentRunId, result.agentRunId);
  assert.equal(calls.length, 1);
  for (const path of ['"structure/whitespace"', "docs/structure/whitespace"]) {
    assert.ok(workspaceFileReferences(`Read ${path}`).includes(path.replace(/"/g, "")));
    assert.throws(() => planningInspectionInstruction(`${instruction}\nAlso read ${path}.`), /AMBIGUOUS/);
  }
});

for (const requestObjective of [liveObjective, arrowLiveObjective]) test(`exact live modification persists PLAN_READY and replay is idempotent: ${requestObjective === arrowLiveObjective ? "arrow without acceptance section" : "from/to with acceptance section"}`, async () => {
  const liveObjective = requestObjective;
  assert.deepEqual(workspaceFileReferences(liveObjective), ["index.html"]);
  assert.equal(resolveConversationIntent(liveObjective, base(), { triggerAgent: true }).route, "PLANNING");
  const h = await inspectionHarness(), service: any = Object.create(ConversationService.prototype), calls: any[] = [];
  service.prisma = h.db; service.workflowSummary = async () => base();
  service.agentRuntimeService = {
    planFromConversation: async (_c: string, _claims: any, instruction: string) => { assert.equal(instruction, liveObjective); throw new ConflictException("CERTIFIED_UNDERSTANDING_REQUIRED: missing"); },
    createRunTx: async (tx: any, claims: any, dto: any, messageId: string, planningObjective: string) => {
      calls.push({ dto, planningObjective });
      const run = await tx.agentRun.create({ data: { ...h.run, id: "live-automatic-inspection", title: dto.title } });
      await h.service.initializeTx(tx, run, claims, h.binding, dto.instruction, [], [], messageId, planningObjective); return run;
    }, scheduleRunExecution: () => {}
  };
  const body = { content: liveObjective, triggerAgent: true, metadata: { clientMessageId: "live-modification" } };
  const result = await service.postMessage("conversation-a", h.claims, body);
  const row: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  assert.equal(calls.length, 1); assert.equal(calls[0].planningObjective, liveObjective);
  assert.equal(calls[0].dto.instruction, planningInspectionInstruction(liveObjective));
  assert.match(calls[0].dto.instruction, /^Read and analyze index\.html\./);
  assert.equal(row.payload.planningContinuation.objective, liveObjective);
  assert.equal(row.payload.planningContinuation.originatingMessageId, result.messageId);
  assert.equal(row.payload.state, "REQUESTED");
  assert.equal((await service.postMessage("conversation-a", h.claims, body)).agentRunId, result.agentRunId);
  assert.equal(calls.length, 1); assert.equal(h.tables.agentRun.has("live-automatic-inspection"), true);
  // Continue the same production-created prerequisite; no user "continue" or
  // per-read decision is submitted when existing read consent covers the read.
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: grant.version, durationMinutes: 60 });
  h.responses.push(h.inspectStructured("filesystem.read", "index.html"));
  await h.service.advance(result.agentRunId);
  const current: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  assert.equal(current.payload.state, "APPROVED"); assert.equal(current.payload.operations.length, 1);
  const execution = (await h.request("poll")).execution;
  assert.equal(execution.attribution.tool, "filesystem.read");
  await h.complete(execution, source); await h.service.advance(result.agentRunId);
  const inspected: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: "project-a", conversationId: "conversation-a", agentRunId: result.agentRunId,
    instruction: calls[0].dto.instruction, runtimeEvidence: inspected.payload.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible);
  const contract = interpretContext(context, visible);
  const planningContext = { ...context, objective: liveObjective, userIntent: ["PLAN", "MODIFY"] as const, operationClass: "WRITE" as const };
  const planningContract = interpretContext({ ...planningContext, userIntent: [...planningContext.userIntent] }, visible);
  assert.equal(planningContract.readiness, "UNDERSTANDING_READY");
  assert.ok(planningContract.constraints.every(c => c.rule !== "UNRESOLVED"));
  const heroChange = planningContract.constraints.find(c => c.textChange)!.textChange!;
  assert.equal(heroChange.before, "Building intelligent digital experiences.");
  assert.equal(heroChange.after, "Building intelligent digital products.");
  assert.ok(planningContract.constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY" &&
    [c.requestQuote, ...(c.requestQuotes ?? [])].some(q => q?.startsWith("Preserve"))) || requestObjective !== arrowLiveObjective);
  assert.ok(planningContract.constraints.some(c => c.rule === "PLANNING_ONLY" && c.requestQuotes?.some(q => q.includes("Do not"))));
  assert.ok(planningContract.successCriteria.some(c => c.id === "requested-outcome"));
  assert.ok(planningContract.successCriteria.some(c => c.id === "hero-text-only"));
  if (requestObjective === arrowLiveObjective) {
    assert.ok(!/Acceptance:|Success criteria:/i.test(liveObjective));
    for (const variant of [liveObjective.replace(/\n/g, "\r\n"),
      liveObjective.replace('"Building intelligent digital experiences."\n→\n"Building intelligent digital products."',
        '"Building intelligent digital experiences." → "Building intelligent digital products."')]) {
      const resolved = interpretContext({ ...planningContext, userIntent: [...planningContext.userIntent], objective: variant }, visible);
      assert.equal(resolved.readiness, "UNDERSTANDING_READY");
      assert.equal(resolved.constraints.find(c => c.textChange)!.textChange!.after, "Building intelligent digital products.");
    }
    for (const invalid of [liveObjective + "\nPreserve authorization behavior.",
      liveObjective.replace('"Building intelligent digital experiences."', '"Building incorrect digital experiences."'),
      liveObjective.replace('"Building intelligent digital products."', '" Building intelligent digital products."'),
      liveObjective.replace('"Building intelligent digital products."', '"Building intelligent digital products."\n"Other" → "Target"')]) {
      const rejected = interpretContext({ ...planningContext, userIntent: [...planningContext.userIntent], objective: invalid }, visible);
      assert.equal(rejected.readiness, "NEEDS_CLARIFICATION");
      assert.ok(rejected.constraints.some(c => c.rule === "UNRESOLVED"));
    }
  }
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", recommendation: null,
    report: { constraintIds: contract.constraints.map(c => c.id), facts: [{ id: "heading", text: source, evidenceRef: contract.evidenceRefs[0] }], inferences: [], hypotheses: [], unknowns: [] } }));
  let planningCalls = 0;
  const gateway: any = { requestStructuredReasoning: async (input: any) => {
    planningCalls++; const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
    assert.equal(data.objective, liveObjective);
    const refs = data.evidenceRefs, scopes = data.heroAllowedScopes[0].scopeRefs;
    return JSON.stringify({ constraintIds: data.requiredConstraintIds, facts: [{ id: "heading", text: source, evidenceRef: refs[0] }], inferences: [], hypotheses: [], unknowns: [], steps: [{
      id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", dependencies: [], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [],
      verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Change only Hero text.", verificationDescription: "Authorized read-back and exact diff." }, {
      id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", dependencies: ["change"], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [],
      verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Read back and compare all preserved bytes.", verificationDescription: "Authorized read-back and exact diff." }] });
  } };
  let continuationCalls = 0;
  h.service.setPlanningContinuation((c, claims, intent, id, sourceRunId) => {
    continuationCalls++; assert.equal(intent, liveObjective); assert.equal(sourceRunId, result.agentRunId);
    return generateConversationPlan({ inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway }, claims, c, intent, id, sourceRunId);
  });
  await h.service.advance(result.agentRunId);
  const settled: any = await h.ledger.transaction(tx => h.ledger.read(tx, "AGENT_INSPECTION", result.agentRunId));
  assert.equal(settled.payload.understanding.status, "GROUNDED");
  assert.equal(settled.payload.understanding.understanding.readiness, "UNDERSTANDING_READY");
  // The original full prompt resolves through the deterministic contract;
  // readiness is reported only from the persisted validated revision.
  const saved = h.tables.agentPlan.get(settled.payload.planningContinuation.result.planId);
  assert.equal(saved.status, settled.payload.planningContinuation.result.status);
  assert.equal(saved.status, "PLAN_READY"); assert.match(saved.id, /^engineering_plan_/);
  assert.equal(continuationCalls, 1); assert.equal(planningCalls, 1);
  await h.service.advance(result.agentRunId); await h.service.reconcile();
  assert.equal(continuationCalls, 1); assert.equal(planningCalls, 1); assert.equal((await h.request("poll")).execution, null);
});

test("diff prose exclusion retains real, quoted and multiple source paths", () => {
  assert.deepEqual(workspaceFileReferences('Read "before/after"'), ["before/after"]);
  assert.deepEqual(workspaceFileReferences("Read docs/before/after diff"), ["docs/before/after"]);
  assert.deepEqual(workspaceFileReferences("Read before/after"), ["before/after"]);
  assert.deepEqual(workspaceFileReferences("Change index.html and other.html; verify before/after diff"), ["index.html", "other.html"]);
  assert.throws(() => planningInspectionInstruction("Change index.html and other.html; verify before/after diff"), /AMBIGUOUS/);
});

async function readForPlanning() {
  const h = await inspectionHarness(), run = await h.db.agentRun.create({ data: { ...h.run, id: "automatic-source" } });
  const instruction = planningInspectionInstruction(objective);
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, instruction, [], [], "original-message", objective));
  const state = () => h.ledger.transaction(async tx => (await h.ledger.read<any>(tx, "AGENT_INSPECTION", run.id))!.payload);
  h.responses.push(h.inspectStructured("filesystem.read", "index.html")); await h.service.advance(run.id);
  const pending = await state(); await h.service.approve(run.id, h.claims, { planVersion: pending.current.planVersion, fingerprint: pending.current.fingerprint, decision: "APPROVED" });
  await h.complete((await h.request("poll")).execution, source); await h.service.advance(run.id);
  const read = await state(), context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: run.projectId, conversationId: run.conversationId, agentRunId: run.id, instruction, runtimeEvidence: read.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible); const contract = interpretContext(context, visible);
  const report = { constraintIds: contract.constraints.map(c => c.id), facts: [{ id: "heading", text: source, evidenceRef: contract.evidenceRefs[0] }], inferences: [], hypotheses: [], unknowns: [] };
  return { ...h, run, state, report };
}
test("grounded inspection automatically persists a plan via existing admission, restart/replay does not reread or replan", async () => {
  const h = await readForPlanning(); let modelCalls = 0;
  const gateway: any = { requestStructuredReasoning: async (input: any) => {
    modelCalls++; const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
    assert.equal(data.objective, objective);
    const refs = data.evidenceRefs, scopes = data.heroAllowedScopes[0].scopeRefs;
    return JSON.stringify({ constraintIds: data.requiredConstraintIds, facts: [{ id: "heading", text: source, evidenceRef: refs[0] }], inferences: [], hypotheses: [], unknowns: [], steps: [{
      id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", dependencies: [], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [],
      verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Change only Hero text.", verificationDescription: "Authorized read-back and exact diff." }, {
      id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", dependencies: ["change"], evidenceRefs: refs, scopeRefs: scopes, missingInformationIds: [],
      verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Read back and compare all preserved bytes.", verificationDescription: "Authorized read-back and exact diff." }] });
  } };
  const handler = (c: string, claims: any, intent: string, id: string, sourceRunId: string) => generateConversationPlan({ inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway }, claims, c, intent, id, sourceRunId);
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", recommendation: null, report: h.report }));
  await h.service.advance(h.run.id);
  const pending = await h.state(); assert.equal(pending.understanding.status, "GROUNDED"); assert.equal(pending.planningContinuation.result, undefined);
  const restarted = h.newService(); restarted.setPlanningContinuation(handler);
  await Promise.all([restarted.advance(h.run.id), restarted.reconcile()]);
  const after = await h.state(); assert.equal(after.understanding.status, "GROUNDED");
  assert.equal(after.planningContinuation.result.status, "PLAN_READY", JSON.stringify(h.tables.agentPlan.get(after.planningContinuation.result.planId).steps[0].parameters.planning.readinessDiagnostic)); assert.equal(modelCalls, 1);
  const plan = h.tables.agentPlan.get(after.planningContinuation.result.planId); assert.equal(plan.status, "PLAN_READY");
  const identity = plan.steps[0].parameters.engineeringPlan;
  assert.equal(identity.sourceRunId, h.run.id); assert.equal(identity.workspace.workspaceId, h.binding.workspaceId);
  assert.equal(identity.workspace.bindingVersion, h.binding.version); assert.equal(identity.workspace.runtimeFingerprint, h.binding.runtimeFingerprint);
  const checkpoint = structuredClone(after.understanding);
  await Promise.all([restarted.advance(h.run.id), restarted.reconcile()]);
  assert.equal(modelCalls, 1); assert.deepEqual((await h.state()).understanding, checkpoint);
  assert.equal((await h.state()).operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  assert.ok([...h.tables.agentPlan.values()].every((p: any) => !p.steps?.[0]?.parameters?.exactProposal));
});
test("expired original durable session blocks handoff without rewriting grounded history or rereading", async () => {
  const h = await readForPlanning(); let calls = 0;
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", recommendation: null, report: h.report }));
  await h.service.advance(h.run.id); const before = structuredClone((await h.state()).understanding);
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: new Date() } });
  const restarted = h.newService(); restarted.setPlanningContinuation(async () => { calls++; throw new Error("must not plan"); });
  await restarted.advance(h.run.id);
  const after = await h.state(); assert.equal(calls, 0); assert.equal(after.planningContinuation.blocked, true);
  assert.deepEqual(after.understanding, before); assert.equal(after.operations.length, 1);
});
test("rejected grounding never starts planning despite admitted read and UI-like intent", async () => {
  const h = await readForPlanning(); let calls = 0; h.service.setPlanningContinuation(async () => { calls++; throw new Error("should never plan"); });
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", recommendation: null, report: { ...h.report, facts: [{ ...h.report.facts[0], text: "A paraphrase of the heading" }] } }));
  await h.service.advance(h.run.id); assert.equal(calls, 0); assert.equal((await h.state()).understanding, undefined);
  assert.equal((await h.state()).state, "PARTIAL"); assert.equal((await h.state()).operations.length, 1);
  assert.equal((await h.request("poll")).execution, null);
});
test("unpersisted planning result cannot become saved readiness", async () => {
  const h = await readForPlanning(); h.service.setPlanningContinuation(async () => ({ runId: "fiction", planId: "fiction", version: 1, status: "PLAN_READY" }));
  h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", recommendation: null, report: h.report }));
  await h.service.advance(h.run.id); const s = await h.state();
  assert.equal(s.understanding.status, "GROUNDED"); assert.equal(s.planningContinuation.result, undefined); assert.equal(s.planningContinuation.blocked, true);
});
