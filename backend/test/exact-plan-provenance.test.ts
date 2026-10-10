import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./exact-proposal-stage.test";
import { exactPlanRunTx, exactContinuationRunTx, validateExactPlan } from "../src/agent-runtime/execution/exact-proposal.service";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { executionFixture } from "./agent-plan-execution.test";
import { projectDownstreamWorkflow } from "../src/conversation/workflow-presentation";

function historical() {
  const f = fixture();
  f.plan.version = 2; f.plan.steps[0].parameters.engineeringPlan.planVersion = 2;
  const { digest, ...base } = f.plan.steps[0].parameters.engineeringPlan;
  f.plan.steps[0].parameters.engineeringPlan.digest = toolDigest({ ...base, summary: f.plan.summary, result: f.result });
  f.body.planVersion = 2; f.body.planDigest = f.plan.steps[0].parameters.engineeringPlan.digest;
  f.run.planVersion = 3; f.run.status = "FAILED";
  const runs = new Map([[f.run.id, f.run]]), original = structuredClone(f.run), plan = structuredClone(f.plan);
  let creates = 0;
  f.tx.agentRun.findUnique = async (q: any) => runs.get(q.where.id) ?? null;
  f.tx.agentRun.create = async (q: any) => { assert.ok(!runs.has(q.data.id)); creates++; runs.set(q.data.id, structuredClone(q.data)); return runs.get(q.data.id); };
  const create = f.ledger.create;
  f.ledger.create = async (tx: any, type: string, key: any, payload: any, options: any) => {
    if (type !== "EXACT_PLAN_CONTINUATION") return create(tx, type, key, payload, options);
    assert.equal(options.immutable, true);
    const record = { immutable: true, payload: structuredClone(payload) }; f.records.set(JSON.stringify([type, key]), record); return record;
  };
  f.tx.agentRunEvent.findUnique = async (q: any) => f.events.find(e => e.id === q.where.id) ?? null;
  return { ...f, runs, original, originalPlan: plan, creates: () => creates };
}
test("historical READY plan gets one real pinned continuation without mutating its plan or original run", async () => {
  const f = historical(), p = await f.service.continuePlan("conversation", f.claims, f.body);
  const run = f.runs.get(p.continuationRunId!);
  assert.ok(run); assert.equal(run.planVersion, 2); assert.equal(p.planId, f.plan.id); assert.equal(p.planDigest, f.body.planDigest);
  const relation = [...f.records.values()].find(r => r.payload.originalRunId === f.run.id)!;
  assert.equal(relation.immutable, true); assert.equal(relation.payload.sourceRunId, f.fresh.sourceRunId);
  assert.deepEqual(relation.payload.workspace, f.plan.steps[0].parameters.engineeringPlan.workspace);
  assert.deepEqual(f.run, f.original); assert.deepEqual(f.plan, f.originalPlan);
  validateExactPlan(run, f.plan, f.fresh, f.claims, "conversation");
  assert.equal(f.creates(), 1); assert.equal(f.calls().modelCalls, 1);
  assert.deepEqual(await f.service.continuePlan("conversation", f.claims, { ...f.body, requestId: "replay" }), p);
  assert.equal(f.creates(), 1); assert.equal(f.calls().modelCalls, 1);
  const view = await exactContinuationRunTx(f.ledger, f.tx, run);
  assert.equal(view.plans[0].id, f.plan.id);
  assert.ok(f.events.every(e => !/APPROVAL|PERMIT|EXECUTION/.test(e.eventType)));
  assert.equal(f.events.find(e => e.eventType === "EXACT_PROPOSAL_READY")!.agentRunId, run.id);
});
for (const kind of ["run-version", "run-owner", "plan-digest", "plan-owner", "source", "workspace", "record", "event"] as const)
  test(`changed ${kind} continuation provenance fails closed`, async () => {
    const f = historical(), p = await f.service.continuePlan("conversation", f.claims, f.body), run = f.runs.get(p.continuationRunId!)!;
    if (kind === "run-version") run.planVersion++;
    if (kind === "run-owner") run.userId = "other";
    if (kind === "plan-digest") f.plan.steps[0].parameters.engineeringPlan.digest = "forged";
    if (kind === "plan-owner") f.plan.agentRunId = "missing";
    if (kind === "source") f.fresh.digest = "changed";
    if (kind === "workspace") f.fresh.binding.version++;
    if (kind === "record") [...f.records.values()].find(r => r.payload.originalRunId)!.payload.planVersion++;
    if (kind === "event") f.events.find(e => e.eventType === "PLAN_CONTINUATION_CREATED")!.payload.sourceDigest = "forged";
    if (kind === "event") await assert.rejects(exactContinuationRunTx(f.ledger, f.tx, run), /PLAN_RUN_PROVENANCE_CHANGED/);
    else await assert.rejects(f.service.continuePlan("conversation", f.claims, f.body), /PLAN_RUN_PROVENANCE_CHANGED|PLAN_SOURCE_CHANGED|PLAN_READY_REQUIRED/);
    assert.equal(f.creates(), 1); assert.equal(f.calls().modelCalls, 1);
  });
test("historical NOT_READY and foreign producer cannot obtain a pinned continuation", async () => {
  const f = historical(); f.plan.status = "PLAN_NOT_READY";
  await assert.rejects(exactPlanRunTx(f.ledger, f.tx, f.plan, f.claims, "conversation", true), /PLAN_READY_REQUIRED/);
  assert.equal(f.creates(), 0);
  f.plan.status = "PLAN_READY"; f.run.conversationId = "other";
  await assert.rejects(exactPlanRunTx(f.ledger, f.tx, f.plan, f.claims, "conversation", true), /PLAN_RUN_PROVENANCE_CHANGED/);
  assert.equal(f.creates(), 0);
});

test("real ledger preserves READY v2 behind NOT_READY v3 and restores its continuation proposal on reload", async () => {
  const h = await executionFixture(true);
  await h.post("Create a plan", "version-one");
  const ready = await h.post("Create a plan", "version-two");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === ready.agentRunId && p.version === 2)!;
  assert.equal(plan.status, "PLAN_READY");
  const original = structuredClone(plan), gateway = (h.planExecution as any).gateway, reason = gateway.requestStructuredReasoning;
  gateway.requestStructuredReasoning = async (input: any) => {
    const value = JSON.parse(await reason(input));
    value.unknowns = [{ id: "success-criteria", description: "Supply success criteria", whyNeeded: "Required for this plan", severity: "LOW", classification: "REQUIRED_FOR_PLAN" }];
    return JSON.stringify(value);
  };
  await h.post("Create a plan", "version-three");
  gateway.requestStructuredReasoning = reason;
  assert.equal([...h.tables.agentPlan.values()].find(p => p.agentRunId === ready.agentRunId && p.version === 3)!.status, "PLAN_NOT_READY");
  const producer = structuredClone(h.tables.agentRun.get(ready.agentRunId));
  const body = { planId: plan.id, planVersion: 2, planDigest: plan.steps[0].parameters.engineeringPlan.digest, requestId: "historical-proposal" };
  const p = await h.exactProposals.continuePlan("conversation-a", h.claims, body);
  assert.ok(p.continuationRunId); assert.equal(p.planVersion, 2);
  const pinned = h.tables.agentRun.get(p.continuationRunId!);
  const restored = await exactContinuationRunTx(h.ledger, h.db, pinned);
  assert.equal(restored.plans[0].id, plan.id); validateExactPlan(restored, plan, await h.service.certifiedPlanningSourceTx(h.db, h.claims, "conversation-a"), h.claims, "conversation-a");
  const conversation = h.tables.conversation.get("conversation-a");
  const view = await projectDownstreamWorkflow(h.db, pinned, conversation, Date.now(), h.claims);
  assert.equal(view?.proposal.state, "READY"); assert.equal(view?.proposal.id, p.proposalId);
  assert.equal(view?.approval, undefined); assert.equal(view?.permit, undefined);
  assert.deepEqual(await h.exactProposals.continuePlan("conversation-a", h.claims, body), p);
  assert.deepEqual(h.tables.agentPlan.get(plan.id), original); assert.deepEqual(h.tables.agentRun.get(ready.agentRunId), producer);
  assert.equal((await h.request("poll")).execution, null);
  assert.ok(![...h.tables.auditEvent.values()].some(row => ["PLAN_EXECUTION", "EXACT_EXECUTION_PERMIT", "EXACT_PERMIT_CONSUMPTION"].includes(row.metadata?.recordType)));
});
