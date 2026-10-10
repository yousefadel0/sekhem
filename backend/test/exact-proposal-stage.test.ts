import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExactProposalService, validateExactProposal } from "../src/agent-runtime/execution/exact-proposal.service";
import { authorizedPlanExecution, planStepSatisfied } from "../src/agent-runtime/execution/plan-execution-state";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { ConversationController } from "../src/conversation/conversation.controller";
import { AgentPlanExecutionService } from "../src/agent-runtime/execution/agent-plan-execution.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";

const source = '<section class="hero">\r\n<h1>Building <span>simple</span> digital experiences.</h1>\r\n<p>simple elsewhere</p>\r\n</section>';
export function fixture() {
  const claims: any = { sub: "user", organizationId: "org" };
  const reference: any = { receiptId: "receipt", observationTime: new Date().toISOString(), truncated: false, relativePath: "index.html", verificationState: "VERIFIED" };
  const context = new AgentUnderstandingService().understand({ userId: "user", projectId: "project", instruction: "Change only the Hero title in index.html from 'Building simple digital experiences.' to 'Building intelligent digital experiences.'. Planning only.", workspaceAvailable: true, availableCapabilities: [] });
  context.evidence = [{ status: "COLLECTED", sourceType: "workspace", sourceId: "read", provenance: "runtime:receipt", relativePath: "index.html", metadata: { operation: "filesystem.read" }, warnings: [], runtimeReference: reference,
    content: { text: source, truncated: false, detectedMime: "text/html", extractorId: "text" } }];
  const base = interpretContext(context, new Map([["runtime:receipt", source]]));
  const steps: any[] = [
    { id: "artifact", type: "PROPOSE", effect: "READ_ONLY", dependencies: [], scopeRefs: ["scope-1"] },
    { id: "change", type: "IMPLEMENT", effect: "WRITE", dependencies: ["artifact"], scopeRefs: ["scope-1"], objective: "Replace simple inside the span" },
    { id: "verify", type: "VERIFY", effect: "READ_ONLY", dependencies: ["change"], scopeRefs: ["scope-1"] }
  ];
  const result: any = { understanding: base, plan: { readiness: "PLAN_READY", validation: { valid: true }, steps, constraints: base.constraints, objective: context.objective, successCriteria: [] } };
  const workspace = { workspaceId: "workspace", bindingVersion: 40, runtimeId: "runtime", runtimeFingerprint: "fingerprint" };
  const fresh: any = { conversation: { projectId: "project" }, sourceConversationId: "conversation", sourceRunId: "source-run", digest: "checkpoint-digest", checkpoint: { sequence: 1 }, references: [reference], binding: { ...workspace, version: 40, rootPath: "C:\\golden" } };
  const identity: any = { version: 1, planId: "plan", planVersion: 4, executionEnabled: false, sourceRunId: fresh.sourceRunId, sourceConversationId: "conversation", understandingDigest: fresh.digest, understandingSequence: 1, workspace, evidenceReferences: fresh.references };
  identity.digest = toolDigest({ ...identity, summary: "summary", result });
  const plan: any = { id: "plan", agentRunId: "run", version: 4, status: "PLAN_READY", summary: "summary", steps: [{ parameters: { engineeringPlan: identity, planning: result } }] };
  const run: any = { id: "run", conversationId: "conversation", userId: "user", projectId: "project", planVersion: 4 };
  const records = new Map(), events: any[] = [], messages: any[] = [];
  let modelCalls = 0, sourceCalls = 0, rejectEvidence = false;
  const tx: any = { agentPlan: { findUnique: async () => plan }, agentRun: { findUnique: async () => run },
    agentRunEvent: { create: async (v: any) => events.push(v.data) }, conversationMessage: { create: async (v: any) => messages.push(v.data) }, conversation: { update: async () => {} }, auditEvent: { findUnique: async () => null } };
  const ledger: any = { transaction: async (fn: any) => fn(tx), read: async (_: any, type: string, key: any) => records.get(JSON.stringify([type, key])),
    create: async (_: any, type: string, key: any, payload: any, options: any) => {
      assert.equal(type, "EXACT_PROPOSAL"); assert.equal(options.immutable, true);
      const record = { payload: structuredClone(payload), immutable: true }; records.set(JSON.stringify([type, key]), record); return record;
    } };
  const inspections: any = { certifiedPlanningSourceTx: async () => { sourceCalls++; return fresh; } };
  const gateway: any = { requestStructuredReasoning: async () => { modelCalls++; return JSON.stringify({ stepId: "change", search: "<span>simple</span>", replacement: "<span>intelligent</span>" }); } };
  const evidence: any = { admit: async () => { if (rejectEvidence) throw new Error("EVIDENCE_REJECTED"); return { operation: { tool: "filesystem.read" }, reference, file: { text: source } }; } };
  const service = new ExactProposalService(ledger, inspections, gateway, evidence);
  const body = { planId: "plan", planVersion: 4, planDigest: identity.digest, requestId: "request" };
  return { service, claims, body, plan, fresh, run, result, records, events, messages, tx, ledger, gateway, inspections,
    calls: () => ({ modelCalls, sourceCalls }), rejectEvidence: () => { rejectEvidence = true; } };
}

test("isolated proposal persists immutable exact change, artifact and provenance with no execution authority", async () => {
  const f = fixture(), proposal = await f.service.prepare("conversation", f.claims, f.body);
  assert.equal(proposal.status, "EXACT_PROPOSAL_READY");
  assert.equal(proposal.planVersion, 4); assert.equal(proposal.planDigest, f.body.planDigest);
  assert.equal(proposal.workspace.bindingVersion, 40); assert.equal(proposal.sourceRunId, "source-run");
  assert.equal(proposal.sourceSequence, 1); assert.equal(proposal.conversationId, "conversation");
  const { digest, ...base } = proposal;
  assert.equal(digest, toolDigest(base));
});

test("proposal preserves unrelated bytes and dependencies, never invents artifact receipts", async () => {
  const f = fixture(), p = await f.service.prepare("conversation", f.claims, f.body);
  assert.deepEqual(p.artifacts, [{ stepId: "artifact", artifactId: p.proposalId, dependencies: [] }]);
  assert.deepEqual(p.actions.map(a => a.stepId), ["change", "verify"]);
  assert.equal(p.actions[0].input.content, source.replace("<span>simple</span>", "<span>intelligent</span>"));
  assert.equal(p.actions[1].expectedAfterHash, p.actions[0].expectedAfterHash);
  assert.equal(p.authorization, "NOT_GRANTED"); assert.equal(p.executionEnabled, false);
  assert.equal(f.run.status, undefined); assert.equal(f.events[0].eventType, "EXACT_PROPOSAL_READY");
  assert.equal(f.records.size, 1); assert.equal(f.messages[0].conversationId, "conversation");
  assert.equal(await authorizedPlanExecution(f.tx, { ...f.run, plans: [f.plan] }, {}), null);
  const state: any = { completed: {}, artifacts: p.artifacts, proposalId: p.proposalId };
  assert.equal(planStepSatisfied(state, "artifact"), true); assert.equal(planStepSatisfied(state, "change"), false);
  assert.deepEqual(state.completed, {});
  assert.equal(planStepSatisfied({ ...state, proposalId: "wrong" }, "artifact"), false);
});

test("same idempotent request reuses immutable proposal without model generation", async () => {
  const f = fixture(), a = await f.service.prepare("conversation", f.claims, f.body), b = await f.service.prepare("conversation", f.claims, f.body);
  assert.deepEqual(a, b); assert.equal(f.calls().modelCalls, 1); assert.equal(f.messages.length, 1);
  await assert.rejects(f.service.prepare("conversation", f.claims, { ...f.body, requestId: "different" }), /EXACT_PROPOSAL_REQUEST_CONFLICT/);
});

test("downstream execution recognizes proposal artifact before entering unchanged runtime gates", async () => {
  const f = fixture(), p = await f.service.prepare("conversation", f.claims, f.body);
  const service: any = Object.create(AgentPlanExecutionService.prototype);
  const gate = new Error("existing runtime gate reached");
  service.ledger = f.ledger;
  service.registry = { resolve: () => { throw gate; } };
  const state: any = { completed: {}, actions: p.actions, artifacts: p.artifacts, proposalId: p.proposalId };
  await assert.rejects(service.executeNextStepTx({}, f.claims, f.run, f.plan, f.result, f.fresh, { payload: state }), e => e === gate);
  assert.deepEqual(state.completed, {});
  const dependent: any = { ...state, artifacts: [{ stepId: "artifact", artifactId: p.proposalId, dependencies: ["read"] }] };
  assert.equal(planStepSatisfied(dependent, "artifact"), false);
  dependent.completed.read = { receiptId: "real-read" };
  assert.equal(planStepSatisfied(dependent, "artifact"), true);
});

for (const kind of ["plan", "source", "binding", "evidence"]) test(`changed ${kind} fails closed before publication`, async () => {
  const f = fixture();
  f.gateway.requestStructuredReasoning = async () => {
    if (kind === "plan") f.plan.version++;
    if (kind === "source") f.fresh.digest = "changed";
    if (kind === "binding") f.fresh.binding.version++;
    if (kind === "evidence") f.rejectEvidence();
    return JSON.stringify({ stepId: "change", search: "<span>simple</span>", replacement: "<span>intelligent</span>" });
  };
  await assert.rejects(f.service.prepare("conversation", f.claims, f.body));
  assert.equal(f.records.size, 0); assert.equal(f.events.length, 0);
});

test("proposal-only controller authenticates and delegates to the distinct entry point", async () => {
  const calls: any[] = [];
  const controller = new ConversationController({ prepareExactProposal: async (...args: any[]) => { calls.push(args); return { status: "EXACT_PROPOSAL_READY" }; } } as any,
    { validateDurableSession: async () => ({ sub: "user" }) } as any);
  await controller.prepareExactProposal("conversation", "cookie", {});
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "conversation");
});
