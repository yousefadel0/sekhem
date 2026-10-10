import assert from "node:assert/strict";
import { test } from "node:test";
import { runPhase, runActivity, workflowNeedsRefresh } from "../lib/sekhem-agent";
import { reconcileConversationSnapshot, snapshotDeliveryFailure, submissionActivity } from "../lib/conversation-restoration";
import { SSE_EVENT_TYPES, subscribeToAgentRunEvents } from "../hooks/useAgentRunEvents";

const now = 2000;
const base = (extra: any = {}): any => ({ id: "run", conversationId: "conv", projectId: "project", title: "Read", agentName: "SEKHEM",
  status: "RUNNING", createdAt: "2026-10-01", updatedAt: "2026-10-01", planVersion: 1, ...extra });
const workflow = (extra: any = {}): any => ({ observedAt: now, proposal: { id: "proposal", version: 1, digest: "digest", revision: 1, state: "READY" }, ...extra });
const snapshot = (runs: any[], messages: any[] = []): any => ({ id: "conv", projectId: "project", messages, agentRuns: runs });

test("terminal durable failure and cancellation outrank stale inner progress after reload", () => {
  for (const status of ["FAILED", "CANCELLED"]) {
    for (const inner of [
      { inspection: { state: "UNDERSTANDING" } },
      { inspection: { state: "AWAITING_APPROVAL" } },
      { execution: { status: "RUNNING", phase: "EXECUTING" } },
      { workflowPause: { state: "PAUSED" } },
    ]) assert.equal(runPhase(JSON.parse(JSON.stringify(base({ ...inner, status })))), status);
  }
  assert.equal(runPhase(base({ status: "FAILED", execution: { phase: "OUTCOME_UNKNOWN" } })), "OUTCOME_UNKNOWN");
});

test("all phases are derived from saved records, with queued/paused/cancelled/unknown preserved", () => {
  const cases: [any, string][] = [
    [base({ status: "QUEUED" }), "QUEUED"], [base({ status: "PAUSED" }), "PAUSED"], [base({ status: "CANCELLED" }), "CANCELLED"],
    [base({ status: "PLANNING" }), "PLANNING"], [base({ status: "FAILED" }), "FAILED"],
    [base({ status: "FAILED", outcome: "BLOCKED" }), "BLOCKED"],
    [base({ inspection: { state: "UNDERSTANDING" } }), "UNDERSTANDING"],
    [base({ inspection: { state: "EXECUTING" } }), "INSPECTING"],
    [base({ inspection: { state: "VERIFYING" } }), "INSPECTING"],
    [base({ workflow: workflow() }), "PROPOSAL_READY"],
    [base({ workflow: workflow({ approval: { state: "PENDING", deadline: new Date(3000).toISOString(), actionable: true } }) }), "WAITING_FOR_APPROVAL"],
    [base({ execution: { status: "RUNNING", phase: "EXECUTING" } }), "EXECUTING"],
    [base({ execution: { status: "RUNNING", phase: "VERIFYING" } }), "VERIFYING"],
    [base({ execution: { status: "FAILED", reason: "OUTCOME_UNKNOWN" } }), "OUTCOME_UNKNOWN"],
    [base({ inspection: { state: "COMPLETED", objectiveGrounded: true, understanding: { status: "GROUNDED", understanding: { readiness: "UNDERSTANDING_READY" } } } }), "COMPLETED"],
  ];
  for (const [run, expected] of cases) assert.equal(runPhase(run, now), expected);
  assert.doesNotMatch(runActivity(base({ inspection: { state: "EXECUTING" } })), /Applying|Executing/);
});

test("PLAN_READY is not PROPOSAL_READY and coarse completion is not certification", () => {
  assert.equal(runPhase(base({ status: "COMPLETED", outcome: "PLAN_READY" })), "PLAN_READY");
  assert.equal(runPhase(base({ status: "COMPLETED" })), "BLOCKED");
  assert.doesNotMatch(runActivity(base({ status: "COMPLETED" })), /^Completed$/);
  assert.equal(runPhase(base({ inspection: { state: "COMPLETED", objectiveGrounded: true } })), "BLOCKED");
  const execution = { status: "COMPLETED", completedSteps: 2, totalSteps: 2, receipts: [] };
  assert.equal(runPhase(base({ execution })), "BLOCKED");
  execution.receipts = [{ runtimeReference: { verificationState: "VERIFIED" } }] as any;
  assert.equal(runPhase(base({ execution })), "COMPLETED");
});

test("expired/stale approvals block and are never inferred from the proposal", () => {
  for (const state of ["STALE", "EXPIRED", "DENIED"]) assert.equal(runPhase(base({ workflow: workflow({ approval: { state, deadline: new Date(3000).toISOString() } }) }), now), "BLOCKED");
  assert.equal(runPhase(base({ workflow: workflow({ approval: { state: "PENDING", actionable: true, deadline: new Date(1000).toISOString() } }) }), now), "BLOCKED");
});

test("isolated workflows and outstanding submissions can keep read-only polling alive", () => {
  assert.equal(workflowNeedsRefresh(base({ status: "COMPLETED", workflow: workflow() }), now), true);
  assert.equal(workflowNeedsRefresh(base({ status: "COMPLETED", workflow: workflow({ approval: { state: "EXPIRED", deadline: new Date(1000).toISOString() } }) }), now), false);
});

test("submission progress belongs to its persisted message, never another selected run", () => {
  const first = base({ id: "first", status: "PLANNING" }), second = base({ id: "second", status: "RUNNING", inspection: { state: "EXECUTING" } });
  const s = snapshot([first, second], [{ id: "saved", senderType: "user", metadata: { clientMessageId: "client", agentRunId: "first" }, content: "change" }]);
  assert.equal(submissionActivity(s, { id: "client", content: "change" }), "Planning");
  assert.match(submissionActivity(s, { id: "unknown", content: "hello" }), /Request pending/);
  assert.match(submissionActivity(undefined, { id: "client", content: "change" }), /saved update/);
});

test("exact-stage SSE is a refresh signal with no dispatch, reconnect is read-only", () => {
  let events = 0; const listeners = new Map<string, any>();
  class Source { addEventListener(t: string, cb: any) { listeners.set(t, cb); } removeEventListener(t: string) { listeners.delete(t); } close() {} }
  const options = { runId: "run", EventSourceClass: Source, onEvent: () => events++, onError: () => {}, onLoadingChange: () => {} };
  let stop = subscribeToAgentRunEvents(options);
  for (const type of ["EXACT_PROPOSAL_READY", "EXACT_PROPOSAL_APPROVAL_REQUESTED", "EXACT_PROPOSAL_APPROVED", "EXACT_EXECUTION_PERMIT_CREATED"]) {
    assert.ok(SSE_EVENT_TYPES.includes(type)); listeners.get(type)({ data: JSON.stringify({ id: type, agentRunId: "run", eventType: type }) });
  }
  stop(); stop = subscribeToAgentRunEvents(options); stop(); assert.equal(events, 4);
});

test("reload/delivery failure preserves saved data and older isolated revisions cannot overwrite it", () => {
  const current = snapshot([base({ workflow: workflow({ approval: { generation: 3 }, permit: { generation: 2 } }) })]);
  const failed = snapshotDeliveryFailure(current);
  assert.equal(failed.snapshot, current); assert.equal(failed.stale, true);
  const older = snapshot([base({ workflow: { ...workflow({ approval: { generation: 1 } }), observedAt: 1000 } })]);
  const restored = reconcileConversationSnapshot(current, older);
  assert.equal(restored.agentRuns[0].workflow?.approval?.generation, 3);
  assert.equal(reconcileConversationSnapshot(undefined, current).agentRuns[0].workflow?.permit?.generation, 2);
});
