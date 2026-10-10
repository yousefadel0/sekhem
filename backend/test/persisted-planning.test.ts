import { AgentRunRecoveryService } from "../src/agent-runtime/recovery/agent-run-recovery.service";
import { AgentContextProjectionService } from "../src/agent-runtime/context-projection/agent-context-projection.service";
import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { ConversationService } from "../src/conversation/conversation.service";
import { ConversationController } from "../src/conversation/conversation.controller";
import { UnauthorizedException } from "@nestjs/common";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { generatePersistedPlan, generateConversationPlan, certifiedConversationContext, preparePlanHandoff } from "../src/agent-runtime/understanding/persisted-planning";
import { requestsConversationPlan, requestsPlanHandoff, requestsUnderstandingFollowup } from "../src/conversation/conversation-mode";
import { presentPlan } from "../src/agent-runtime/understanding/agent-presentation";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { resolveConversationIntent } from "../src/conversation/conversation-intent-resolver";

const objective = "Modify auth.ts to add a function comment. Acceptance: the comment describes authentication and the function behavior remains unchanged.";
const source = "export function authenticate() {}";
test("resolved planning pins and revalidates the selected certified source run", async () => {
  const h = await fixture();
  const result = await generateConversationPlan(h.dependencies, h.claims, "conversation-a", objective, "resolved-source-plan", h.run.id);
  const identity = h.tables.agentPlan.get(result.planId).steps[0].parameters.engineeringPlan;
  assert.equal(identity.sourceRunId, h.run.id);
  assert.equal(identity.sourceConversationId, "conversation-a");
  await assert.rejects(generateConversationPlan(h.dependencies, h.claims, "conversation-a", objective, "wrong-source", "missing-source-run"), /CERTIFIED_UNDERSTANDING_REQUIRED/);
  assert.equal((await h.request("poll")).execution, null);
});
test("valid but not-ready planning persists exact bounded blockers, origins, grounding and affected steps", async () => {
  const h = await fixture();
  h.gateway.requestStructuredReasoning = async (input: any) => {
    h.calls.push(input);
    const value: any = proposal(input);
    value.unknowns = [{ id: "target-gap", description: "Specify which function comment is requested.", whyNeeded: "The requested target is ambiguous.", severity: "LOW", classification: "REQUIRED_FOR_PLAN" }];
    value.steps[0].missingInformationIds = ["target-gap"];
    return JSON.stringify(value);
  };
  const result = await h.generate(), saved = h.tables.agentPlan.get(result.planId);
  const diagnostic = saved.steps[0].parameters.planning.readinessDiagnostic;
  assert.equal(result.status, "PLAN_NOT_READY"); assert.equal(diagnostic.validator.valid, true);
  assert.equal(diagnostic.groundingStatus, "VERIFIED_SOURCE_EXCERPTS");
  assert.deepEqual(diagnostic.blockingRequirementIds, ["target-gap"]);
  assert.deepEqual(diagnostic.requirements[0], { id: "target-gap", description: "Specify which function comment is requested.", whyNeeded: "The requested target is ambiguous.", severity: "LOW",
    status: "UNKNOWN", classification: "REQUIRED_FOR_PLAN", source: "MODEL", affectedStepIds: ["change"], blocking: true, resolvedByExistingEvidence: false });
  const event = [...h.tables.agentRunEvent.values()].find(e => e.payload?.readinessDiagnostic);
  assert.deepEqual(event.payload.readinessDiagnostic, diagnostic);
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.planningReport);
  assert.match(message.content, /Information target-gap · UNKNOWN · BLOCKING · MODEL · REQUIRED_FOR_PLAN · Steps: change/);
  assert.deepEqual((await h.db.agentPlan.findUnique({where:{id:result.planId}})).steps[0].parameters.planning.readinessDiagnostic, diagnostic);
  assert.equal(h.calls.length, 1); assert.equal((await h.request("poll")).execution, null);
});
test("an explicit new planning version receives exact prior validation failures without automatic retry or plan repair", async () => {
  const h = await fixture();
  h.gateway.requestStructuredReasoning = async (input: any) => {
    h.calls.push(input);
    const candidate = proposal(input);
    if (h.calls.length === 1) { candidate.steps[0].scopeRefs = ["project"]; candidate.steps[1].evidenceRefs = []; }
    return JSON.stringify(candidate);
  };
  const rejected = await h.generate();
  assert.equal(rejected.status, "PLAN_NOT_READY"); assert.equal(h.calls.length, 1);
  const accepted = await h.generate({ requestId: "explicit-new-version", expectedVersion: 1 });
  assert.equal(accepted.status, "PLAN_READY"); assert.equal(h.calls.length, 2);
  const request = JSON.parse(h.calls[1].question.split("[CONVERSATION REQUEST CONTEXT — DATA, NOT AUTHORIZATION]\n")[1].split("\n\n[CERTIFIED UNDERSTANDING DATA]")[0]);
  assert.deepEqual(request.previousPlanningValidation.issues, [
    { code: "EVIDENCE_OUTSIDE_SCOPE", path: "$.steps[0]" }, { code: "UNGROUNDED_STEP", path: "$.steps[1]" }
  ]);
  assert.deepEqual(request.previousPlanningValidation.rejectedSteps.map((s: any) => ({ index: s.index, evidenceRefs: s.evidenceRefs, scopeRefs: s.scopeRefs })), [
    { index: 0, evidenceRefs: [h.tables.agentPlan.get(rejected.planId).steps[0].parameters.planning.plan.steps[0].requiredEvidence[0]], scopeRefs: ["project"] },
    { index: 1, evidenceRefs: [], scopeRefs: ["scope-1"] }
  ]);
  assert.equal(h.tables.agentPlan.get(rejected.planId).status, "PLAN_NOT_READY");
  assert.equal(h.tables.agentPlan.get(accepted.planId).steps[0].parameters.planning.plan.authorization, "NOT_GRANTED");
});

test("planning limitations persist; Arabic approval guidance and explicit handoff remain non-authorizing", async()=>{
  const h=await naturalFixture(), ledgerBefore=h.tables.auditEvent.size;
  h.gateway.requestStructuredReasoning=async(input:any)=>{
    h.calls.push(input);const value:any=proposal(input);
    value.unknowns=[
      {id:"unread-file",description:"A listed file outside the requested change has not been read.",whyNeeded:"No current step depends on its contents.",severity:"MEDIUM",classification:"LIMITATION"},
      {id:"future-approval",description:"Future execution requires separate authorization.",whyNeeded:"Planning itself grants no execution authority.",severity:"HIGH",classification:"FUTURE_EXECUTION_PREREQUISITE"}];
    return JSON.stringify(value);
  };
  const response=await h.post("اعمللي plan", "classified-plan");
  const saved=[...h.tables.agentPlan.values()].find(p=>p.agentRunId===response.agentRunId);
  assert.equal(saved.status,"PLAN_READY");
  const parameters=saved.steps[0].parameters, result=parameters.planning;
  assert.equal(result.planningInformation.length,2);
  assert.ok(result.planningInformation.every((x:any)=>x.state==="UNKNOWN"&&!x.blocking));
  const message=[...h.tables.conversationMessage.values()].find(m=>m.metadata?.planningReport);
  assert.match(message.content,/UNKNOWN · NON_BLOCKING · MODEL · LIMITATION/);
  assert.match(message.content,/UNKNOWN · NON_BLOCKING · MODEL · FUTURE_EXECUTION_PREREQUISITE/);
  const before=structuredClone(saved);
  assert.deepEqual(await h.db.agentPlan.findUnique({where:{id:saved.id}}),before);
  assert.deepEqual(await h.post("اعمللي plan", "classified-plan"),response);
  assert.equal(h.calls.length,1);
  const guidance = await h.post("نفذ الخطة", "classified-guidance");
  assert.match(guidance.content, /use Approve for this execution/);
  assert.equal(guidance.metadata.executionStarted, false);
  assert.equal(guidance.metadata.planHandoff, undefined);
  // The distinct explicit handoff service still validates immutable provenance;
  // conversational execution wording now routes to human approval controls.
  const handoff=(await h.agents.preparePlanHandoff("conversation-a", h.claims, "نفذ الخطة", "classified-handoff")).metadata.planHandoff;
  assert.equal(handoff.status,"PREPARED_EXECUTION_DISABLED");
  assert.equal(handoff.planId,saved.id);
  assert.equal(handoff.planVersion,parameters.engineeringPlan.version);
  assert.equal(handoff.planDigest,parameters.engineeringPlan.digest);
  assert.equal(handoff.authorization,"NOT_GRANTED");
  assert.equal(h.tables.auditEvent.size,ledgerBefore);
  assert.equal((await h.request("poll")).execution,null);
});

test("planning HTTP entry point propagates durable session rejection before delegation", async () => {
  let calls = 0;
  const controller = new ConversationController({ generatePlan: () => { calls++; } } as any,
    { validateDurableSession: async () => { throw new UnauthorizedException("revoked"); } } as any);
  await assert.rejects(controller.generatePlan("conversation", "signed-but-revoked", { requestId: "a", expectedVersion: 0 }), UnauthorizedException);
  assert.equal(calls, 0);
});
async function fixture(certify = true) {
  const h = await inspectionHarness();
  const conversations = new ConversationService(h.db, { inspectionView: (id: string, claims: any) => h.service.view(id, claims) } as any,
    undefined, undefined, undefined, undefined, h.contexts, new ExecutionModeDetectorService(), undefined, undefined, h.store, h.runtime);
  const mode = await conversations.createConversation(h.claims.sub, { projectId: "project-a", title: "Source", mode: "CHAT" }, h.claims);
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: { modeContext: mode.modeContext } } });
  if (certify) {
    h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id); await h.approve();
    await h.complete((await h.request("poll")).execution, source); await h.service.advance(h.run.id);
    const ref = (await h.state()).references[0];
    h.responses.push(input => JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Explain observed source", report: {
      constraintIds: JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).planningContract.constraints.map((c: any) => c.id),
      facts: [{ id: "auth", text: source, evidenceRef: `runtime:${ref.receiptId}` }], inferences: [], hypotheses: [], unknowns: []
    } }));
    await h.service.advance(h.run.id); assert.equal((await h.state()).state, "COMPLETED");
  }
  const transfer: any = await conversations.postMessage("conversation-a", h.claims, { content: objective, metadata: { clientMessageId: "planning-transfer" } });
  assert.equal(transfer.kind, "AGENT_TRANSFER");
  const calls: any[] = [];
  const gateway: any = { requestStructuredReasoning: async (input: any) => { calls.push(input); return JSON.stringify(proposal(input)); } };
  const dependencies = { inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway };
  const generate = (body: any = { requestId: "attempt-1", expectedVersion: 0 }, claims = h.claims) => generatePersistedPlan(dependencies, claims, transfer.agentConversationId, { instruction: objective, ...body });
  return { ...h, conversations, transfer, gateway, calls, dependencies, generate };
}
function proposal(input: any) {
  const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
  const scope = data.scope.find((s: any) => s.reference === "auth.ts");
  const ref = scope.evidenceRefs[0];
  const step = { id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", description: "Add a descriptive comment to the authenticate function in auth.ts.",
    verificationDescription: "The comment describes the function and its behavior remains unchanged.", evidenceRefs: [ref], missingInformationIds: [], dependencies: [], scopeRefs: [scope.id],
    verificationCriterionIds: data.successCriteria.map((c: any) => c.id), effect: "WRITE", dependencyStatus: "KNOWN" };
  return { constraintIds: data.constraints.map((c: any) => c.id), facts: [{ id: "auth", text: source, evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [],
    steps: [step, { ...step, id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", dependencies: ["change"],
      description: "Review the changed function and compare its behavior with the verified source.", verificationDescription: "The comment is present and the function body remains unchanged." }] };
}

test("PLAN_NOT_READY acceptance answer publishes a new immutable planning version without another inspection", async () => {
  const h = await naturalFixture();
  h.gateway.requestStructuredReasoning = async (input: any) => {
    h.calls.push(input);
    const value: any = proposal(input);
    if (h.calls.length === 1) value.unknowns = [{ id: "success-criteria", description: "Supply success criteria.", whyNeeded: "Required to construct the plan.", severity: "LOW", classification: "REQUIRED_FOR_PLAN" }];
    return JSON.stringify(value);
  };
  const first = await h.post("Modify auth.ts to add a function comment.", "initial-plan");
  const old = [...h.tables.agentPlan.values()].find(p => p.agentRunId === first.agentRunId)!;
  assert.equal(old.status, "PLAN_NOT_READY");
  const original = structuredClone(old), checkpoint = structuredClone((await h.state()).understanding);
  // The projection admission is covered separately; use its bounded persisted inputs here.
  (h.conversations as any).workflowSummary = async () => ({ activeInspections: [], certifiedUnderstanding: { runId: h.run.id, sequence: 1 },
    latestPlan: { runId: first.agentRunId, planId: old.id, readiness: old.status }, execution: null, pendingApprovals: [], workspace: null,
    pendingPlanning: [{ runId: first.agentRunId, sourceRunId: h.run.id, objective: old.summary, missingInformationIds: ["success-criteria"] }] });
  const receipts = h.tables.auditEvent.size;
  await h.post("Acceptance: the comment describes authentication and the function behavior remains unchanged.", "answer-plan");
  const revised = [...h.tables.agentPlan.values()].find(p => p.agentRunId === first.agentRunId && p.version === old.version + 1)!;
  assert.equal(revised.status, "PLAN_READY", JSON.stringify(revised.steps[0].parameters.planning.readinessDiagnostic)); assert.equal(revised.steps[0].parameters.engineeringPlan.sourceRunId, h.run.id);
  assert.deepEqual(h.tables.agentPlan.get(old.id), original); assert.deepEqual((await h.state()).understanding, checkpoint);
  assert.equal(h.calls.length, 2); assert.equal(h.tables.auditEvent.size, receipts); assert.equal(h.chatCalls.length, 0);
  assert.equal((await h.request("poll")).execution, null);
});

async function naturalFixture(certify = true) {
  const h = await fixture(certify), chatCalls: any[] = [];
  // Use the production persisted read model, rather than supplying routing targets.
  // The old fixture omitted getRun and therefore could not expose eligiblePlans.
  const reader: any = Object.create(AgentRuntimeService.prototype);
  Object.assign(reader, { prisma: h.db, resourceAuthz: new ResourceAuthorizationService(h.db), inspections: h.service, runtimeControl: h.control });
  const agents: any = {
    getRun: (id: string, claims: any) => reader.getRun(id, claims),
    createRunTx: async (tx: any, claims: any, input: any, messageId: string, planningObjective: string) => {
      const run = await tx.agentRun.create({ data: { ...h.run, id: "prerequisite-inspection", status: "QUEUED", planVersion: 1 } });
      await h.service.initializeTx(tx, run, claims, h.binding, input.instruction, [], [], messageId, planningObjective);
      return run;
    },
    scheduleRunExecution: () => {},
    inspectionView: (id: string, claims: any) => h.service.view(id, claims),
    planFromConversation: (id: string, claims: any, text: string, requestId: string, sourceRunId?: string) => generateConversationPlan(h.dependencies, claims, id, text, requestId, sourceRunId),
    preparePlanHandoff: (id: string, claims: any, text: string, requestId: string) => preparePlanHandoff(h.dependencies, claims, id, text, requestId),
    certifiedConversationContext: (id: string, claims: any, text: string) => certifiedConversationContext(h.dependencies, claims, id, text),
    executeChat: async (_claims: any, input: any) => { chatCalls.push(input); return { answer: "The observed file defines authenticate; other files remain unknown." }; }
  };
  const conversations = new ConversationService(h.db, agents, undefined, undefined, undefined, undefined, h.contexts,
    new ExecutionModeDetectorService(), undefined, undefined, h.store);
  const post = (content: string, clientMessageId: string) => conversations.postMessage("conversation-a", h.claims, { content, metadata: { clientMessageId } }) as Promise<any>;
  return { ...h, conversations, agents, chatCalls, post };
}

test("natural planning stays in Normal Chat, uses certified context, and restores idempotently without a new GLM call", async () => {
  const h = await naturalFixture(), ledgerBefore = h.tables.auditEvent.size, conversationsBefore = h.tables.conversation.size;
  const first = await h.post("اعمللي plan", "natural-plan");
  assert.equal(first.conversationId, "conversation-a"); assert.equal(first.status, "COMPLETED", JSON.stringify([...h.tables.agentPlan.values()].filter(p => p.id.startsWith("engineering_plan_")).map(p => p.steps[0].parameters.planning.plan.validation))); assert.equal(h.calls.length, 1);
  const run = h.tables.agentRun.get(first.agentRunId), plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === run.id);
  assert.equal(plan.status, "PLAN_READY"); assert.equal(plan.steps[0].parameters.engineeringPlan.sourceRunId, h.run.id);
  assert.ok(h.calls[0].question.includes("CONVERSATION REQUEST CONTEXT"));
  assert.ok(h.calls[0].question.includes(objective));
  assert.equal(h.tables.conversation.size, conversationsBefore); assert.equal(h.tables.auditEvent.size, ledgerBefore);
  const original = structuredClone(plan);
  assert.deepEqual(await h.post("اعمللي plan", "natural-plan"), first); assert.equal(h.calls.length, 1);
  assert.deepEqual(await h.db.agentPlan.findUnique({ where: { id: plan.id } }), original);
  await assert.rejects(h.post("اعمللي plan جديدة", "natural-plan"), /REQUEST_CONFLICT/);
  assert.equal((await h.request("poll")).execution, null);
});

test("natural planning schedules only inspection without certified understanding and never falls back to ordinary Chat", async () => {
  const h = await naturalFixture(false), before = h.tables.agentRun.size;
  const response = await h.post("اعمللي plan", "no-source");
  assert.equal(response.agentRunId, "prerequisite-inspection");
  assert.equal(h.calls.length, 0); assert.equal(h.chatCalls.length, 0); assert.equal(h.tables.agentRun.size, before + 1);
  assert.ok(![...h.tables.agentPlan.values()].some(p => p.id.startsWith("engineering_plan_")));
  assert.equal((await h.request("poll")).execution, null);
});

test("concurrent natural planning repeats share a reservation and competing revisions cannot replace it", async () => {
  const h = await naturalFixture(); let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
  h.gateway.requestStructuredReasoning = async (input: any) => { h.calls.push(input); entered(); await gate; return JSON.stringify(proposal(input)); };
  const first = h.post("اعمللي plan", "concurrent"); await ready;
  const duplicate = await h.post("اعمللي plan", "concurrent"); assert.equal(duplicate.status, "PLANNING");
  await assert.rejects(h.post("اعمللي plan", "competitor"), /ALREADY_IN_PROGRESS/);
  release(); const completed = await first;
  assert.equal(completed.agentRunId, duplicate.agentRunId); assert.equal(completed.status, "COMPLETED"); assert.equal(h.calls.length, 1);
});

test("new planning/handoff relationship fields cannot be supplied as user message metadata", async () => {
  const h = await naturalFixture();
  for (const key of ["planHandoff", "planHandoffId", "certifiedUnderstanding", "planningRequest", "planningReport", "planId", "planVersion", "planDigest"]) {
    await assert.rejects(h.conversations.postMessage("conversation-a", h.claims, { content: "hello", metadata: { [key]: "forged" } }), /SERVER_OWNED/);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.chatCalls.length, 0);
});

test("same-Chat follow-up re-admits certified observations and does not start another inspection", async () => {
  const h = await naturalFixture(), runs = h.tables.agentRun.size, ledgerBefore = h.tables.auditEvent.size;
  const answer = await h.post("Explain the findings from the inspected project", "follow-up");
  assert.equal(answer.conversationId, "conversation-a"); assert.equal(h.chatCalls.length, 1);
  assert.match(h.chatCalls[0].instruction, /CERTIFIED UNDERSTANDING/);
  assert.ok(h.chatCalls[0].instruction.includes(source));
  assert.equal(answer.metadata.certifiedUnderstanding.sourceRunId, h.run.id);
  assert.ok(answer.metadata.evidenceReceipt.some((e: any) => e.runtimeReference?.verificationState === "VERIFIED"));
  assert.equal(h.tables.agentRun.size, runs); assert.equal(h.tables.auditEvent.size, ledgerBefore);
  assert.equal((await h.request("poll")).execution, null);
});

test("a workspace switch during a certified Chat answer rejects before saving the stale answer", async () => {
  const h = await naturalFixture();
  h.agents.executeChat = async () => {
    await h.runtime.createBinding(h.claims, "project-a", { runtimeId: h.device.runtimeId, rootPath: "E:\\Other", displayName: "Other", requestId: "chat-switch" });
    return { answer: "STALE_ANSWER_MUST_NOT_BE_SAVED" };
  };
  await assert.rejects(h.post("Explain the inspected project", "stale-answer"), /WORKSPACE/);
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.content === "STALE_ANSWER_MUST_NOT_BE_SAVED"));
});

test("Arabic execute-the-plan restores persisted approval guidance, replay creates no handoff or execution authority", async () => {
  const h = await naturalFixture(); await h.post("اعمللي plan", "ready-plan");
  const runs = h.tables.agentRun.size, ledgerBefore = h.tables.auditEvent.size, approvals = h.tables.agentApproval.size;
  const plan = [...h.tables.agentPlan.values()].find(p => p.id.startsWith("engineering_plan_"))!, original = structuredClone(plan);
  const summary = await (h.conversations as any).workflowSummary(h.tables.conversation.get("conversation-a"), h.claims, "نفذ الخطة");
  const decision = resolveConversationIntent("نفذ الخطة", summary);
  assert.equal(decision.route, "APPROVAL_GUIDANCE"); assert.equal(decision.reason, "plan-execution-controls-required");
  assert.equal(decision.target?.planId, plan.id); assert.equal(decision.target?.planVersion, plan.version);
  assert.equal(decision.target?.digest, plan.steps[0].parameters.engineeringPlan.digest);
  const reply = await h.post("نفذ الخطة", "handoff");
  assert.match(reply.content, /Approve for this execution/); assert.match(reply.content, /did not approve or execute/);
  assert.equal(reply.metadata.planHandoff, undefined); assert.equal(reply.metadata.executionStarted, false);
  assert.equal(reply.conversationId, "conversation-a");
  assert.deepEqual(await h.post("نفذ الخطة", "handoff"), reply);
  const persisted = h.tables.conversationMessage.get(reply.id)!;
  assert.equal(persisted.content, reply.content); assert.equal(persisted.metadata.executionStarted, false);
  assert.deepEqual(h.tables.agentPlan.get(plan.id), original);
  assert.ok(![...h.tables.agentRunEvent.values()].some(e => e.eventType === "PLAN_HANDOFF_PREPARED"));
  assert.equal(h.calls.length, 1); assert.equal(h.tables.agentRun.size, runs); assert.equal(h.tables.auditEvent.size, ledgerBefore);
  assert.equal(h.tables.agentApproval.size, approvals); assert.equal((await h.request("poll")).execution, null);
});

test("an incomplete read-model fixture cannot make a saved READY plan conversationally eligible", async () => {
  const h = await naturalFixture(); await h.post("اعمللي plan", "ready-plan");
  const conversation = h.tables.conversation.get("conversation-a"), read = h.agents.getRun;
  const before = await (h.conversations as any).workflowSummary(conversation, h.claims, "نفذ الخطة");
  assert.equal(resolveConversationIntent("نفذ الخطة", before).route, "APPROVAL_GUIDANCE");
  h.agents.getRun = undefined;
  const unavailable = await (h.conversations as any).workflowSummary(conversation, h.claims, "نفذ الخطة");
  assert.deepEqual(unavailable.eligiblePlans, []);
  assert.equal(resolveConversationIntent("نفذ الخطة", unavailable).route, "UNAVAILABLE");
  h.agents.getRun = read;
  const restored = await (h.conversations as any).workflowSummary(conversation, h.claims, "نفذ الخطة");
  assert.deepEqual(restored.eligiblePlans, before.eligiblePlans);
  assert.equal(resolveConversationIntent("Execute the plan", restored).route, "PLAN_EXECUTION");
});

for (const failure of ["missing-plan", "changed-digest", "changed-step", "stale-binding", "revoked-runtime", "new-plan-version"]) {
  test(`explicit handoff admission fails closed: ${failure}; Arabic guidance grants no authority`, async () => {
    const h = await naturalFixture();
    if (failure !== "missing-plan") await h.post("اعمللي plan", "ready-plan");
    const plan = [...h.tables.agentPlan.values()].find(p => p.id.startsWith("engineering_plan_"));
    if (failure === "changed-digest") plan.steps[0].parameters.engineeringPlan.digest = "forged";
    if (failure === "changed-step") plan.steps[0].parameters.planning.plan.steps[0].objective = "Changed after certification";
    if (failure === "stale-binding") await h.runtime.createBinding(h.claims, "project-a", { runtimeId: h.device.runtimeId, rootPath: "E:\\Other", displayName: "Other", requestId: "switch" });
    if (failure === "revoked-runtime") await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED");
    if (failure === "new-plan-version") {
      await h.agents.preparePlanHandoff("conversation-a", h.claims, "نفذ الخطة", "handoff");
      await h.post("اعمللي plan جديدة", "revision");
    }
    const authorityBefore = structuredClone([...h.tables.auditEvent]), approvalsBefore = h.tables.agentApproval.size, runsBefore = h.tables.agentRun.size;
    const reply = await h.post("نفذ الخطة", "guidance-only");
    assert.equal(reply.metadata.executionStarted, false); assert.equal(reply.metadata.planHandoff, undefined);
    if (failure === "missing-plan") assert.match(reply.content, /No eligible saved workflow/);
    // A project workspace switch does not rewrite this conversation's saved
    // binding. Guidance is informational; fresh source admission below must
    // still reject the mismatched active binding before preparing any handoff.
    if (failure === "new-plan-version") {
      const summary = await (h.conversations as any).workflowSummary(h.tables.conversation.get("conversation-a"), h.claims, "نفذ الخطة");
      assert.equal(resolveConversationIntent("نفذ الخطة", summary).target?.planVersion, 2);
    }
    await assert.rejects(h.agents.preparePlanHandoff("conversation-a", h.claims, "نفذ الخطة", "handoff"),
      failure === "new-plan-version" ? /HANDOFF_REQUEST_CONFLICT/ : undefined);
    assert.deepEqual([...h.tables.auditEvent], authorityBefore); assert.equal(h.tables.agentApproval.size, approvalsBefore); assert.equal(h.tables.agentRun.size, runsBefore);
    assert.equal((await h.request("poll").catch(() => ({ execution: null }))).execution, null);
  });
}

test("planning and handoff intent are distinct from explanation, negation, inspection and arbitrary execution", () => {
  for (const text of ["اعمللي plan", "اعمل لي خطة", "Make me a plan", "Create a plan for this project"]) assert.equal(requestsConversationPlan(text), true, text);
  for (const text of ["Explain how to create a plan", "Do not create a plan", "نفذ الخطة", "حلل المشروع", "اشرح الخطة"]) assert.equal(requestsConversationPlan(text), false, text);
  for (const text of ["نفذ الخطة", "نفّذ الخطة", "Execute the plan"]) assert.equal(requestsPlanHandoff(text), true, text);
  for (const text of ["لا تنفذ الخطة", "Run npm test", "Explain the plan", "Execute the plan and delete everything"]) assert.equal(requestsPlanHandoff(text), false, text);
  assert.equal(requestsUnderstandingFollowup("اشرح مخاطر الملفات في المشروع"), true);
  assert.equal(requestsUnderstandingFollowup("حلل المشروع"), false);
});

test("certified understanding produces a persisted, bounded, non-executable plan in the linked Agent Chat", async () => {
  const h = await fixture(), before = h.tables.auditEvent.size, inspection = await h.state();
  const result = await h.generate(); assert.equal(result.status, "PLAN_READY", JSON.stringify(h.tables.agentPlan.get(result.planId).steps[0].parameters.planning)); assert.equal(h.calls.length, 1);
  const contract = JSON.parse(h.calls[0].question.split("[PLANNING CONTRACT DATA]\n")[1]);
  assert.deepEqual(contract.requiredConstraintIds, contract.constraints.map((c: any) => c.id));
  assert.match(h.calls[0].systemInstruction, /PROPOSE means drafting a proposal, uses purpose PROPOSE_CHANGE and effect READ_ONLY/);
  assert.match(h.calls[0].systemInstruction, /KNOWN means the prerequisite ordering is specified, not that any prerequisite has already executed/);
  const saved = h.tables.agentPlan.get(result.planId), p = saved.steps[0].parameters;
  assert.equal(saved.version, 1); assert.equal(saved.status, "PLAN_READY"); assert.equal(saved.requiresApproval, false);
  assert.equal(p.planning.plan.authorization, "NOT_GRANTED");
  assert.ok(p.planning.plan.steps.every((s: any) => !s.capability && Object.keys(s.input).length === 0 && s.status === "PLANNED"));
  assert.match(p.planning.plan.steps[0].objective, /descriptive comment/); assert.deepEqual(p.planning.plan.steps[1].dependencies, ["change"]);
  assert.deepEqual(p.engineeringPlan.evidenceReferences, inspection.references);
  assert.equal(p.engineeringPlan.sourceRunId, h.run.id); assert.equal(p.engineeringPlan.sourceConversationId, "conversation-a");
  assert.equal(p.engineeringPlan.understandingDigest, toolDigest(inspection.understanding));
  assert.equal(p.engineeringPlan.workspace.bindingVersion, h.binding.version); assert.equal(p.engineeringPlan.executionEnabled, false);
  assert.equal(h.tables.agentRun.get(result.runId).conversationId, h.transfer.agentConversationId);
  assert.equal(h.tables.agentApproval.size, 2); // Root verification + original source read; no new approval.
  assert.equal(h.tables.auditEvent.size, before); assert.equal((await h.request("poll")).execution, null);
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.planDigest === result.digest);
  assert.equal(message.conversationId, h.transfer.agentConversationId); assert.match(message.content, /PLAN_READY/); assert.match(message.content, /No approval/);
  const display = presentPlan(saved.steps); assert.equal(display.engineeringPlan?.planId, result.planId); assert.equal(display.executionPerformed, false);
});

test("restoration/idempotent requests do not call GLM again; revisions publish new immutable versions", async () => {
  const h = await fixture(), a = await h.generate(), original = structuredClone(h.tables.agentPlan.get(a.planId));
  const restored = await h.db.agentPlan.findUnique({ where: { id: a.planId } });
  assert.deepEqual(restored, original); assert.deepEqual(await h.generate(), a); assert.equal(h.calls.length, 1);
  const b = await h.generate({ requestId: "attempt-2", expectedVersion: 1, instruction: objective + " Compare the observed function body." });
  assert.equal(b.status, "PLAN_READY"); assert.equal(b.version, 2); assert.notEqual(b.planId, a.planId);
  assert.deepEqual(h.tables.agentPlan.get(a.planId), original); assert.equal(h.tables.agentPlan.get(b.planId).steps[0].parameters.engineeringPlan.previousPlanId, a.planId);
  await assert.rejects(h.generate({ requestId: "stale-request", expectedVersion: 0 }), /VERSION_CHANGED/);
  await assert.rejects(h.generate({ requestId: "attempt-1", expectedVersion: 0, instruction: "changed request" }), /REQUEST_CONFLICT/);
  assert.equal(h.calls.length, 2);
});

test("incomplete understanding is rejected before any planning request or persistence", async () => {
  const h = await fixture(false), count = h.tables.agentRun.size;
  await assert.rejects(h.generate(), /CERTIFIED_UNDERSTANDING_REQUIRED/); assert.equal(h.calls.length, 0); assert.equal(h.tables.agentRun.size, count);
});

for (const invalid of ["user", "organization", "project", "binding", "runtime", "expired-grant", "revoked-grant", "receipt", "content-identity", "source-fact"]) {
  test(`planning rejects ${invalid} scope/evidence before model generation`, async () => {
    const h = await fixture(), child = h.tables.conversation.get(h.transfer.agentConversationId);
    if (invalid === "user") child.userId = "someone-else";
    if (invalid === "organization") child.metadata.modeContext.organizationId = "another-org";
    if (invalid === "project") child.projectId = "another-project";
    if (invalid === "binding") child.metadata.modeContext.workspace.bindingVersion += 1;
    if (invalid === "runtime") await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED");
    if (invalid === "revoked-grant") await h.identity.revokeGrant(h.claims, h.device.runtimeId, "project-a");
    if (invalid === "expired-grant") {
      await h.ledger.transaction(async tx => { const rows = await h.ledger.list<any>(tx, "RUNTIME_GRANT", h.claims.sub);
        for (const row of rows) { row.payload.expiresAt = new Date(0).toISOString(); await h.ledger.update(tx, row, row.payload, "active"); } });
    }
    if (["receipt", "content-identity", "source-fact"].includes(invalid)) await h.ledger.transaction(async tx => {
      const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
      if (invalid === "receipt") row.payload.understanding.evidence[0].runtimeReference.receiptId = "missing-receipt";
      if (invalid === "content-identity") row.payload.understanding.evidence[0].runtimeReference.observationTime = new Date(0).toISOString();
      if (invalid === "source-fact") row.payload.understanding.understanding.facts[0].text = "fabricated";
      await h.ledger.update(tx, row, row.payload, "done");
    });
    await assert.rejects(h.generate()); assert.equal(h.calls.length, 0);
    assert.ok(![...h.tables.agentPlan.values()].some(p => p.steps[0]?.parameters?.engineeringPlan));
  });
}

for (const extra of ["authorization", "approval", "runtimeId", "executionPermit", "workspace", "input"]) test(`model cannot inject ${extra} authority`, async () => {
  const h = await fixture(); h.gateway.requestStructuredReasoning = async (input: any) => JSON.stringify({ ...proposal(input), [extra]: "APPROVED" });
  const result = await h.generate(); assert.equal(result.status, "PLAN_NOT_READY");
  assert.equal(h.tables.agentRun.get(result.runId).status, "FAILED");
});

for (const bad of ["malformed", "truncated-json", "finish-length", "missing-description", "command-description", "oversized-description", "step-input", "unsupported-fact", "unknown-scope", "wrong-constraint", "proposal-write", "unresolved-order"]) test(`invalid ${bad} output cannot publish PLAN_READY`, async () => {
  const h = await fixture(); h.gateway.requestStructuredReasoning = async (input: any) => {
    const value: any = proposal(input);
    if (bad === "malformed") return "ordinary prose";
    if (bad === "truncated-json") return JSON.stringify(value).slice(0, -1);
    if (bad === "finish-length") input.onDiagnostic({ finishReason: "length" });
    if (bad === "missing-description") delete value.steps[0].description;
    if (bad === "command-description") value.steps[0].description = "powershell -Command Remove-Item auth.ts";
    if (bad === "oversized-description") value.steps[0].description = "x".repeat(513);
    if (bad === "step-input") value.steps[0].input = { command: "delete" };
    if (bad === "unsupported-fact") value.facts[0].text = "not inspected";
    if (bad === "unknown-scope") value.steps[0].scopeRefs = ["foreign-scope"];
    if (bad === "wrong-constraint") value.constraintIds = ["made-up-constraint"];
    if (bad === "proposal-write") value.steps[0].type = "PROPOSE";
    if (bad === "unresolved-order") value.steps[0].dependencyStatus = "UNKNOWN";
    return JSON.stringify(value);
  };
  const result = await h.generate(); assert.equal(result.status, "PLAN_NOT_READY"); assert.equal(h.tables.agentRun.get(result.runId).status, "FAILED");
  assert.equal((await h.request("poll")).execution, null);
});

test("concurrent duplicate generation uses one call; Runtime revocation during generation blocks publication", async () => {
  const h = await fixture(); let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(r => { entered = r; }), hold = new Promise<void>(r => { release = r; });
  h.gateway.requestStructuredReasoning = async (input: any) => { h.calls.push(input); entered(); await hold; return JSON.stringify(proposal(input)); };
  const pending = h.generate(); await ready;
  assert.equal((await h.generate()).status, "PLANNING");
  await assert.rejects(h.generate({ requestId: "another", expectedVersion: 1 }), /IN_PROGRESS/);
  await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED"); release(); await assert.rejects(pending);
  assert.equal(h.calls.length, 1); assert.ok(![...h.tables.agentPlan.values()].some(p => p.steps[0]?.parameters?.engineeringPlan));
});

test("startup recovery never schedules or replays interrupted checkpoint planning", async () => {
  const h = await fixture(); const id = "planning_run_interrupted";
  await h.db.agentRun.create({ data: { id, conversationId: h.transfer.agentConversationId, userId: h.claims.sub, projectId: "project-a", status: "PLANNING", planVersion: 1 } });
  // Production now injects fenced durable recovery; this legacy fixture supplies the same service.
  Object.assign(h.tables.agentRun.get(id), { currentStepIndex: 0, eventSeq: 0, eventTerminalSeq: null });
  const originalQuery = h.db.$queryRawUnsafe;
  h.db.$queryRawUnsafe = async (sql: string, ...args: any[]) => sql.includes('pg_try_advisory') ? [{ locked: true }] : originalQuery(sql, ...args);
  h.db.agentRunEvent.aggregate = async ({ where }: any) => {
    const seqs = [...h.tables.agentRunEvent.values()].filter(e => e.agentRunId === where.agentRunId).map(e => e.seq);
    return { _count: { seq: seqs.length }, _min: { seq: seqs.length ? Math.min(...seqs) : null }, _max: { seq: seqs.length ? Math.max(...seqs) : null } };
  };
  const append = h.db.agentRunEvent.create;
  h.db.agentRunEvent.create = async (arg: any) => {
    const run = h.tables.agentRun.get(arg.data.agentRunId);
    const seq = ++run.eventSeq;
    if (['FAILED', 'COMPLETED', 'CANCELLED'].includes(run.status)) run.eventTerminalSeq = seq;
    return append({ data: { ...arg.data, seq } });
  };
  const runtime: any = Object.create(AgentRuntimeService.prototype); runtime.prisma = h.db; runtime.runningRunIds = new Set(); runtime.inspections = h.service;
  runtime.recovery = new AgentRunRecoveryService(h.db, new AgentContextProjectionService(h.db));
  runtime.scheduleRunExecution = () => assert.fail("No recovery dispatch");
  await runtime.recoverUnfinishedRuns(); assert.equal(h.tables.agentRun.get(id).status, "FAILED");
  assert.equal(h.tables.agentRun.get(id).eventSeq, 1);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.agentRunId === id && e.eventType === "RECOVERY_REQUIRED").length, 1);
  await runtime.executeRun(id, h.claims); assert.equal(h.calls.length, 0);
});

test("planning persists redacted transport failure metadata without fabricating a plan", async () => {
  const h = await fixture();
  const diagnostic = { version: 1, correlationId: "diagnostic-test", providerId: "provider", providerType: "vllm_openai_compatible", modelId: "model",
    instructionVersion: "sekhem-assistant-v1", instructionFingerprint: "a".repeat(64), dialect: "LLAMACPP_JSON_SCHEMA",
    messageRoleCounts: { system: 1, user: 1, assistant: 0, tool: 0, other: 0 }, httpStatus: null, finishReason: null, refusalFieldPresent: null,
    refusalAttribution: "UNKNOWN", httpClassification: "TIMEOUT", failureStage: "REQUEST", failureCode: "CLIENT_DEADLINE",
    durationMs: 120001, configuredMaxOutputTokens: 8192, promptTokens: null, completionTokens: null };
  h.gateway.requestStructuredReasoning = async (input: any) => { input.onDiagnostic(diagnostic); throw new Error("private-response-and-credential"); };
  const result = await h.generate();
  assert.equal(result.status, "PLAN_NOT_READY");
  const event = [...h.tables.agentRunEvent.values()].find(e => e.payload?.providerDiagnostics?.length);
  assert.deepEqual(event.payload.providerDiagnostics, [diagnostic]);
  assert.equal(event.payload.outcome, "PROVIDER_FAILED");
  assert.doesNotMatch(JSON.stringify(event), /private-response-and-credential/);
  assert.equal((await h.request("poll")).execution, null);
});
