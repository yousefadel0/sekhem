import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runActivity, type AgentRunSummary, type PlanningResult } from "../lib/sekhem-agent";
import { isTerminalEvent } from "../hooks/useAgentRunEvents";

describe("P1-A truthful Agent result presentation", () => {
  const cases = [
    ["PLAN_READY", "COMPLETED", "Plan ready · Completed"], ["NEEDS_USER_INPUT", "COMPLETED", "Needs user input"],
    ["NEEDS_EVIDENCE", "COMPLETED", "Needs evidence"], ["PROVIDER_FAILED", "FAILED", "Provider failed"],
    ["OUTPUT_TRUNCATED", "FAILED", "Output truncated"], ["INVALID_STRUCTURED_OUTPUT", "FAILED", "Invalid structured output"],
    ["FAILED", "FAILED", "Failed"], ["BLOCKED", "FAILED", "Blocked"], ["CANCELLED", "CANCELLED", "Cancelled"], ["PAUSED", "PAUSED", "Paused"]
  ] as const;
  for (const [outcome, status, label] of cases) {
    it(`renders the persisted ${outcome} result truthfully after reload`, () => {
      const run = JSON.parse(JSON.stringify({ id: "run", status, outcome })) as AgentRunSummary;
      assert.equal(runActivity(run), label);
      assert.doesNotMatch(runActivity(run), /Analysis completed/);
      assert.equal(isTerminalEvent({ eventType: "STATUS_CHANGE", payload: { newStatus: status, outcome } } as never), status !== "PAUSED");
    });
  }
  it("does not infer user clarification or success from legacy PLAN_NOT_READY", () => {
    const legacy = { plan: { readiness: "PLAN_NOT_READY", validation: { valid: false, issues: [{ code: "STRUCTURED_OUTPUT_UNAVAILABLE", path: "$" }] } } } as PlanningResult;
    assert.equal(runActivity({ status: "COMPLETED" } as AgentRunSummary, undefined, legacy), "Planning incomplete");
  });
  it("pause and cancellation take precedence over stale planning success", () => {
    const plan = { plan: { readiness: "PLAN_READY", validation: { valid: true, issues: [] } } } as unknown as PlanningResult;
    assert.equal(runActivity({ status: "CANCELLED", outcome: "PLAN_READY" } as unknown as AgentRunSummary, undefined, plan), "Cancelled");
    assert.equal(runActivity({ status: "PAUSED", outcome: "PLAN_READY" } as unknown as AgentRunSummary, undefined, plan), "Paused");
  });
  it("shows actual runtime completion separately from planning completion", () => {
    const plan = { plan: { readiness: "PLAN_READY", validation: { valid: true, issues: [] } } } as unknown as PlanningResult;
    assert.equal(runActivity({ id: "rtrun_exact", status: "COMPLETED", outcome: "COMPLETED" } as AgentRunSummary, undefined, plan), "Completion recorded · Inspect execution receipt");
    const verified = { id: "rtrun_exact", status: "COMPLETED", outcome: "COMPLETED", execution: {
      status: "COMPLETED", totalSteps: 1, completedSteps: 1,
      receipts: [{ runtimeReference: { verificationState: "VERIFIED" } }]
    } } as unknown as AgentRunSummary;
    assert.equal(runActivity(verified, undefined, plan), "Change verified");
    const unverified = structuredClone(verified);
    // Deliberately malformed persisted receipt must not be presented as verified success.
    Object.assign(unverified.execution!.receipts![0]!.runtimeReference!, { verificationState: "UNVERIFIED" });
    assert.equal(runActivity(unverified, undefined, plan), "Verification incomplete · Review saved details");
    assert.equal(runActivity({ id: "rtrun_exact", status: "RUNNING" } as AgentRunSummary), "Executing");
    assert.equal(runActivity({ id: "rtrun_exact", status: "FAILED", outcome: "FAILED" } as AgentRunSummary, undefined, plan), "Failed");
  });
});
