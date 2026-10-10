import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { changeWorkflowPauseTx } from "../src/agent-runtime/workflow-pause";
import { recordWorkflowDecisionTx, assertWorkflowDecisionTx } from "../src/agent-runtime/execution/workflow-decision";
import { protectedConversationMetadata } from "../src/conversation/conversation-mode";
const control = (h: any, resume = false, request?: any, user = h.claims.sub) => h.ledger.transaction(async (tx: any) =>
  changeWorkflowPauseTx(h.ledger, tx, await tx.agentRun.findUnique({ where: { id: h.run.id } }), user, resume, request));
const head = (h: any) => h.ledger.transaction((tx: any) => h.ledger.read(tx, "WORKFLOW_PAUSE", h.run.id));

test("approval preference is bounded metadata and cannot grant any authority", () => {
  for (const approvalMode of ["MANUAL", "TASK"]) assert.deepEqual(protectedConversationMetadata({ approvalMode }), { approvalMode });
  for (const approvalMode of ["ALL", "SESSION", true]) assert.throws(() => protectedConversationMetadata({ approvalMode }), /INVALID/);
});
test("pause before inspection persists and prevents model/read; resume keeps the saved workflow", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "auth.ts"));
  await control(h); await h.service.advance(h.run.id);
  assert.equal((await head(h)).payload.state, "PAUSED"); assert.equal(h.calls.length, 0);
  assert.equal((await h.request("poll")).execution, null);
  await control(h, true); await h.service.advance(h.run.id);
  assert.equal(h.calls.length, 1); assert.equal((await h.state()).state, "AWAITING_APPROVAL");
});
test("pause/resume at approval boundary preserves the original request", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id);
  const original = (await h.state()).current;
  await control(h); await control(h, true); await h.service.advance(h.run.id);
  assert.deepEqual((await h.state()).current, original); assert.equal(h.calls.length, 1);
});
test("approved but unstarted read is not dispatched while paused", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id); await h.approve();
  await control(h); assert.equal((await h.request("poll")).execution, null);
  await control(h, true); assert.ok((await h.request("poll")).execution);
});
test("dispatched atomic read keeps its receipt; pause acknowledges afterward without rereading", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id); await h.approve();
  const execution = (await h.request("poll")).execution; await control(h);
  assert.equal((await head(h)).payload.state, "PAUSE_REQUESTED");
  await assert.rejects(control(h, true), /PAUSE_PENDING/);
  await h.complete(execution, "export const answer = 42;"); await h.service.advance(h.run.id);
  assert.equal((await head(h)).payload.state, "PAUSED");
  const s = await h.state(); assert.equal(s.operations.length, 1);
  assert.equal((await h.request("poll")).execution, null);
  await control(h, true); await h.service.advance(h.run.id);
  assert.equal((await h.state()).references.length, 1); assert.equal((await h.state()).operations.length, 1);
  assert.equal((await h.request("poll")).execution, null);
});
test("control replay is immutable and cannot undo a later pause", async () => {
  const h = await inspectionHarness(); const p = { requestId: "pause-one", expectedRevision: 0 };
  await control(h, false, p); await control(h, false, p);
  const r = { requestId: "resume-one", expectedRevision: (await head(h)).revision };
  await control(h, true, r);
  await control(h, false, { requestId: "pause-two", expectedRevision: (await head(h)).revision });
  await control(h, true, r); assert.equal((await head(h)).payload.state, "PAUSED");
  await assert.rejects(control(h, true, { ...r, requestId: "stale-new-request" }), /CONTROL_CHANGED/);
});
test("different owner cannot pause or resume", async () => {
  const h = await inspectionHarness(); await assert.rejects(control(h, false, undefined, "other-user"), /OWNER_MISMATCH/);
  assert.equal(await head(h), null);
});
for (const decision of ["REJECT", "SKIP"] as const) test(`${decision} is persisted separately, replay-safe, and never executes a required plan`, async () => {
  const h = await inspectionHarness(), plan = { id: "engineering_plan_test", agentRunId: h.run.id, version: 2, status: "PLAN_READY",
    steps: [{ parameters: { engineeringPlan: { digest: "d".repeat(64) } } }] };
  await h.db.agentPlan.create({ data: plan });
  const body = { decision, planId: plan.id, planVersion: 2, planDigest: "d".repeat(64), requestId: "decision-one" };
  const decide = (b: any = body) => h.ledger.transaction(tx => recordWorkflowDecisionTx(h.ledger, tx, h.run.conversationId, h.claims.sub, b));
  const saved = await decide(); assert.deepEqual(await decide(), saved); assert.equal(saved.decision, decision); assert.equal(saved.canContinue, false);
  await assert.rejects(h.ledger.transaction(tx => assertWorkflowDecisionTx(h.ledger, tx, h.claims.sub, h.run.conversationId, plan.id)), /REJECTED|CANNOT_BE_SKIPPED/);
  await assert.rejects(decide({ ...body, requestId: "another", decision: decision === "SKIP" ? "REJECT" : "SKIP" }), /ALREADY_RECORDED/);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.workflowDecision).length, 1);
});
for (const decision of ["REJECTED", "SKIPPED"] as const) test(`inspection ${decision} stops without model continuation or runtime dispatch`, async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id);
  const c = (await h.state()).current!;
  await h.service.approve(h.run.id, h.claims, { planVersion: c.planVersion, fingerprint: c.fingerprint, decision: decision === "REJECTED" ? "DENIED" : decision });
  await h.service.advance(h.run.id); const s = await h.state();
  assert.equal(s.state, "AWAITING_INPUT"); assert.equal(s.operations[0].state, decision);
  assert.equal(h.calls.length, 1); assert.equal((await h.request("poll")).execution, null);
});
