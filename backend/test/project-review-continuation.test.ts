import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { inspectionLimit, presentInspection, parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";

const context: ConversationWorkflowSummary = { workspace: { workspaceId: "w", bindingVersion: 1, runtimeId: "r", runtimeFingerprint: "f" },
  activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [] };

for (const prompt of [
  "افحص مشروع OMNIROUTE_TEST قراءة فقط. اقرأ README.md وpackage.json وsrc/App.tsx ثم قدم خطة تطوير. لا تعدل ملفات.",
  "حلل محتوى المشروع المرتبط بهذه المحادثة قراءة فقط. راجع الخدمات والحالة والتنقل وأعطني خطة من ثلاث مراحل.",
  "Review this project read-only: package.json, src/App.tsx and src/services/api.ts. Give me a development plan."
]) test("compound read-only review preserves its complete scope without a planning prerequisite", () => {
  const result = resolveConversationIntent(prompt, context);
  assert.equal(result.route, "INSPECTION"); assert.equal(result.inspectionInstruction, prompt);
  assert.equal(result.inspectionPlanningObjective, undefined);
});

test("compound review cannot admit an outside path or turn mutation into a review", () => {
  assert.equal(resolveConversationIntent("Review this project read-only: ../../outside.json and package.json", context).route, "UNAVAILABLE");
  assert.equal(resolveConversationIntent("عدّل package.json", context).route, "PLANNING");
  const scoped = resolveConversationIntent("Read and analyze index.html from the current workspace. Do not modify anything.", context);
  assert.notEqual(scoped.reason, "project-content-prerequisite");
});

test("server-owned inspection budget supports a multi-file task and remains finite", () => {
  assert.equal(inspectionLimit(undefined), 24); assert.equal(inspectionLimit("32"), 32);
  for (const value of ["0", "65", "Infinity", "-1"]) assert.throws(() => inspectionLimit(value));
});

test("more than five verified reads remain admitted through independently checked batches", async () => {
  const h = await inspectionHarness();
  for (let index = 0; index < 7; index++) {
    h.responses.push(h.inspect("filesystem.read", `source-${index}.ts`));
    await h.service.advance(h.run.id); await h.approve();
    const execution = (await h.request("poll")).execution; assert.ok(execution);
    await h.complete(execution, `export const source${index} = ${index};`); await h.service.advance(h.run.id);
    assert.equal((await h.state()).operations.length, index + 1);
  }
  const state = await h.state();
  assert.equal(state.references.length, 7); assert.equal(state.state, "NEEDS_MORE_EVIDENCE");
  const modelState = JSON.parse(h.calls.at(-1).question.split("[INSPECTION STATE]\n")[1]);
  assert.equal(modelState.sourceCitations.length, 6);
  assert.ok(modelState.sourceCitations.every((source: any) => source.receipt.verification === "VERIFIED"));
});

test("exhaustion publishes an honest partial result instead of asking for task clarification", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    row.payload.maxIterations = 1; await h.ledger.update(tx, row, row.payload, "active"); });
  h.responses.push(h.inspect("filesystem.read", "first.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  h.responses.push(h.inspect("filesystem.read", "second.ts")); await h.service.advance(h.run.id);
  const state = await h.state(); assert.equal(state.state, "PARTIAL"); assert.equal(state.code, "ITERATION_LIMIT_REACHED");
  assert.equal(state.operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  const report = [...h.tables.conversationMessage.values()].find(message => message.metadata?.code === "ITERATION_LIMIT_REACHED");
  assert.match(report.content, /first.ts/); assert.match(report.content, /second.ts/);
  assert.match(report.content, /not a request to clarify/); assert.equal(report.metadata.outcome, "NEEDS_EVIDENCE");
});

test("a promised read without a machine action gets bounded correction without tool dispatch", async () => {
  const h = await inspectionHarness();
  for (let attempt = 0; attempt < 3; attempt++) {
    h.responses.push("I will read the next source."); await h.service.advance(h.run.id);
  }
  const state = await h.state(); assert.equal(state.correctiveAttempts, 2);
  assert.equal(state.state, "AWAITING_INPUT"); assert.equal(state.operations.length, 0);
  assert.equal(h.calls.length, 3); assert.equal((await h.request("poll")).execution, null);
});

test("timing projection identifies only the active model request and drops settled or stale timing", async () => {
  const h = await inspectionHarness(), state = await h.state();
  state.modelAttempt = { id: "model-a", expiresAt: 9000 };
  state.reasoningRequest = { modelAttemptId: "model-a", requestId: "request-a", startedAt: 1000, deadlineAt: 5000, attempts: 1 };
  assert.deepEqual(presentInspection(state).reasoning, { startedAt: 1000, deadlineAt: 5000, attempts: 1 });
  state.reasoningRequest.terminalReason = "RESPONSE_RECEIVED"; assert.equal(presentInspection(state).reasoning, undefined);
  delete state.reasoningRequest.terminalReason; state.modelAttempt.id = "model-b";
  assert.equal(presentInspection(state).reasoning, undefined);
});

test("a structured stop retains the bounded model reason without treating it as evidence", async () => {
  const h = await inspectionHarness();
  const decision = parseInspectionDecision(JSON.stringify({ decision: "STOP", tool: "none", relativePath: "", query: "",
    purpose: "The requested source is unavailable", report: null, recommendation: null }), h.binding, true);
  assert.deepEqual(decision, { decision: "STOP", reason: "The requested source is unavailable" });
});
