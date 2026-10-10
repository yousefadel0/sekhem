import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { ApprovalModeSelector } from "../components/chat/approval-mode-selector"
import { PlanExecutionApproval } from "../components/chat/plan-execution-approval"
import { WorkflowPauseControls } from "../components/chat/workflow-pause-controls"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"
import { runPhase, workflowControlState } from "../lib/sekhem-agent"
const plan: any = { planId: "private-plan", planVersion: 2, digest: "d".repeat(64) }
for (const mode of ["MANUAL", "TASK"] as const) test(`${mode} restores persisted selection and exact approval controls`, () => {
  const html = renderToStaticMarkup(<ApprovalModeSelector conversationId="c" mode={mode} />)
  assert.match(html, /role="combobox"/)
  assert.match(html, mode === "MANUAL" ? /Manual Approval/ : /Approve for Me/)
  assert.match(html, /explicit approval and current access are still required/)
  const controls = renderToStaticMarkup(<PlanExecutionApproval conversationId="c" plan={plan} approvalMode={mode} disabled={false} delegationEligible />)
  assert.match(controls, mode === "MANUAL" ? />Approve</ : />Approve for Me</)
  assert.match(controls, />Reject</); assert.match(controls, />Skip</)
  assert.match(controls, /Neither grants file access/); assert.doesNotMatch(controls, /private-plan|dddddddd/)
})
test("mode preference saves through conversation metadata only; never consent/permit/execution", () => {
  const source = readFileSync("components/chat/approval-mode-selector.tsx", "utf8")
  assert.match(source, /updateConversation\(id, \{ metadata: \{ approvalMode: next \}/)
  assert.doesNotMatch(source, /localStorage|postSekhemApi|approve-execution|task-consent|permits|executeExact/)
  assert.match(source, /origin.current === id/)
  assert.match(readFileSync("components/chat/command-composer.tsx", "utf8"), /<ApprovalModeSelector/)
})
test("stale snapshots disable every approval/decision control; delegation unavailable fails closed", () => {
  const html = renderToStaticMarkup(<PlanExecutionApproval conversationId="c" plan={plan} approvalMode="TASK" disabled delegationEligible={false} />)
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3)
  assert.match(html, /commands and unsupported effects require individual approval/)
})
const run = (extra: any = {}): any => ({ id: "run", status: "RUNNING", title: "Read", planVersion: 2, createdAt: "2026-10-04", updatedAt: "2026-10-04T12:00:00Z", inspection: { state: "EXECUTING" }, ...extra })
for (const state of ["RUNNING", "PAUSE_REQUESTED", "PAUSED"] as const) test(`${state} is reconstructed from persisted workflow controls`, () => {
  const saved = run({ status: state === "PAUSED" ? "PAUSED" : "RUNNING", workflowPause: { state, revision: 2, resumeStatus: "AWAITING_APPROVAL" } })
  const html = renderToStaticMarkup(<WorkflowPauseControls run={saved} />)
  assert.match(html, state === "PAUSED" ? />Resume</ : />Pause \/ Stop</)
  if (state === "PAUSE_REQUESTED") assert.match(html, /Pause requested.*finish safely/)
  if (state === "PAUSED") assert.match(html, /awaiting approval/)
  const phase = runPhase(saved)
  if (state !== "RUNNING") assert.equal(phase, state)
})
test("terminal workflow has no resume; stale controls cannot start work", () => {
  assert.equal(renderToStaticMarkup(<WorkflowPauseControls run={run({ status: "COMPLETED" })} />), "")
  assert.match(renderToStaticMarkup(<WorkflowPauseControls run={run()} stale />), /disabled=""/)
  const source = readFileSync("components/chat/workflow-pause-controls.tsx", "utf8")
  assert.match(source, /expectedRevision: run.workflowPause\?\.revision/)
  assert.doesNotMatch(source, /\/execute|\/permits|approve-execution|cancelRun|localStorage/)
})
test("older snapshot cannot erase pause, rejection or skip controls; conversation histories stay isolated", () => {
  const old = run({ workflowPause: { state: "PAUSED", revision: 3 }, workflowDecision: { decision: "SKIP" } })
  const snapshot: any = { id: "c", projectId: "p", messages: [], agentRuns: [old] }
  const incoming: any = { ...snapshot, agentRuns: [run({ workflowPause: { state: "RUNNING", revision: 2 } })] }
  assert.equal(reconcileConversationSnapshot(snapshot, incoming).agentRuns[0].workflowPause!.state, "PAUSED")
  assert.equal(reconcileConversationSnapshot(snapshot, { ...incoming, id: "other" }).agentRuns[0].workflowPause!.state, "RUNNING")
})
test("persisted approval, read-back and skip phases remain distinguishable", () => {
  assert.equal(runPhase(run({ execution: { status: "RUNNING", phase: "WAITING_RUNTIME", completedSteps: 0 } })), "APPROVED")
  assert.equal(runPhase(run({ execution: { status: "RUNNING", phase: "WAITING_RUNTIME", completedSteps: 1 } })), "READING_BACK")
  assert.equal(runPhase(run({ workflowDecision: { decision: "SKIP" } })), "SKIPPED")
})

test("live PAUSED coarse status cannot become active merely because its pause projection is missing", () => {
  const saved = run({ status: "PAUSED", inspection: { state: "APPROVED" } });
  assert.equal(workflowControlState(saved), "PAUSED"); assert.equal(runPhase(saved), "PAUSED");
  const html = renderToStaticMarkup(<WorkflowPauseControls run={saved} />);
  assert.match(html, />Resume</); assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /Workflow active|>Pause \/ Stop</);
});
test("reload projects the saved pause head into timeline and existing-run Resume controls", () => {
  const saved = run({ status: "PAUSED", execution: { status: "RUNNING", phase: "WAITING_RUNTIME", completedSteps: 1 }, workflowPause: { state: "PAUSED", revision: 3, resumeStatus: "RUNNING" } });
  const snapshot: any = { id: "c", projectId: "p", messages: [], agentRuns: [saved] };
  const restored = reconcileConversationSnapshot(undefined, JSON.parse(JSON.stringify(snapshot))).agentRuns[0];
  assert.equal(runPhase(restored), "PAUSED");
  const html = renderToStaticMarkup(<WorkflowPauseControls run={restored} />);
  assert.match(html, />Resume</); assert.doesNotMatch(html, /Workflow active|>Pause \/ Stop<|disabled=""/);
  const source = readFileSync("components/chat/workflow-pause-controls.tsx", "utf8");
  assert.match(source, /encodeURIComponent\(run.id\).*resume.*pause/);
  assert.doesNotMatch(source, /createRun|createConversation|\/execute|\/permits/);
});
test("pending pause forbids duplicate control and persists across reload", () => {
  const saved = run({ workflowPause: { state: "PAUSE_REQUESTED", revision: 2 } });
  const html = renderToStaticMarkup(<WorkflowPauseControls run={JSON.parse(JSON.stringify(saved))} />);
  assert.equal(runPhase(saved), "PAUSE_REQUESTED"); assert.match(html, /Pause requested/); assert.match(html, /disabled=""/);
});
test("approval boundary remains waiting, and failed/rejected/skipped workflows expose no active pause controls", () => {
  const waiting = run({ status: "AWAITING_APPROVAL", inspection: { state: "APPROVED" } });
  assert.equal(runPhase(waiting), "WAITING_FOR_APPROVAL");
  assert.match(renderToStaticMarkup(<WorkflowPauseControls run={waiting} />), /Awaiting approval/);
  for (const extra of [{ status: "FAILED" }, { status: "COMPLETED" }, { workflowDecision: { decision: "SKIP" } }, { workflowDecision: { decision: "REJECT" } }])
    assert.equal(renderToStaticMarkup(<WorkflowPauseControls run={run(extra)} />), "");
});
test("newer authoritative resume revision survives equal timestamp while old pause cannot regress it", () => {
  const paused = run({ status: "PAUSED", workflowPause: { state: "PAUSED", revision: 3 } });
  const resumed = run({ status: "RUNNING", workflowPause: { state: "RUNNING", revision: 4 } });
  const snapshot: any = { id: "c", projectId: "p", messages: [], agentRuns: [paused] };
  const current = reconcileConversationSnapshot(snapshot, { ...snapshot, agentRuns: [resumed] });
  assert.equal(current.agentRuns[0].status, "RUNNING");
  assert.equal(reconcileConversationSnapshot(current, snapshot).agentRuns[0].workflowPause!.state, "RUNNING");
});
