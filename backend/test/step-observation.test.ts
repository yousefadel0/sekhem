import assert from "node:assert/strict";
import { test } from "node:test";
import { observeStep } from "../src/agent-runtime/execution/step-observation";
import type { RuntimeExecution } from "../src/trusted-runtime/runtime.contract";

const action = { stepId: "verify", tool: "filesystem.read" as const, input: {}, relativePath: "index.html" };
const receipt = { attribution: { agentRunId: "run", executionId: "receipt" }, state: "SUCCEEDED",
  verificationState: "VERIFIED", cancellationState: "NONE", result: { stdout: "PRIVATE_SOURCE" } } as RuntimeExecution;
test("verified receipt allows continuation without including source content", () => {
  const o = observeStep(action, receipt, true, true);
  assert.equal(o.outcome, "VERIFIED"); assert.equal(o.next, "CONTINUE");
  assert.deepEqual(o.evidenceRefs, ["runtime:receipt"]);
  assert.ok(!JSON.stringify(o).includes("PRIVATE_SOURCE"));
});
test("failed execution stops with bounded diagnostic", () => {
  const o = observeStep(action, { ...receipt, state: "FAILED", verificationState: "FAILED" }, true, true);
  assert.equal(o.outcome, "FAILED"); assert.equal(o.next, "STOP");
  assert.equal(o.uncertainty, "EXECUTION_FAILED");
});
test("uncertain verification stops safely", () => {
  const o = observeStep(action, { ...receipt, verificationState: "NOT_VERIFIED" }, true, true);
  assert.equal(o.outcome, "UNCERTAIN"); assert.equal(o.next, "STOP");
});
test("model prose cannot override receipt or read-back mismatch", () => {
  const o = observeStep(action, { ...receipt, state: "FAILED", modelOutput: "VERIFIED success" } as RuntimeExecution, true, true);
  assert.equal(o.next, "STOP"); assert.ok(!JSON.stringify(o).includes("modelOutput"));
  assert.equal(observeStep(action, receipt, true, false).uncertainty, "READ_BACK_MISMATCH");
  assert.equal(observeStep(action, receipt, false, true).outcome, "UNCERTAIN");
});
test("same receipt observation has deterministic replay identity", () => {
  assert.deepEqual(observeStep(action, receipt, true, true), observeStep(action, structuredClone(receipt), true, true));
});
