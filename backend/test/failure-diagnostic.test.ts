import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { diagnoseFailure } from "../src/agent-runtime/execution/failure-diagnostic";
import { observeStep } from "../src/agent-runtime/execution/step-observation";

function fixture() {
  const before = "<h1>Old title</h1>", after = "<h1>New title</h1>", source = `header\n${before}\nfooter`;
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const write = { stepId: "write", tool: "filesystem.write", relativePath: "index.html",
    input: { path: "C:\\workspace\\index.html", content: source.replace(before, after), expectedSha256: hash(source) },
    change: { before, after, originalHash: hash(source), updatedHash: hash(source.replace(before, after)) } };
  const action: any = { stepId: "verify", tool: "filesystem.read", relativePath: "index.html", input: { path: "C:\\workspace\\index.html" }, expectedAfterHash: write.change.updatedHash };
  const receipt: any = { attribution: { agentRunId: "run", executionId: "read", planId: "plan", planVersion: 1,
    planStepId: "verify", tool: action.tool, validatedInput: action.input }, state: "SUCCEEDED", verificationState: "VERIFIED", cancellationState: "NONE",
    result: { stdout: source, truncated: false } };
  const state: any = { runId: "run", planId: "plan", planVersion: 1, planDigest: "digest", actions: [write, action],
    workspace: { workspaceId: "workspace", version: 43 }, completed: { write: { receiptId: "write-receipt" } } };
  return { state, action, receipt, observation: observeStep(action, receipt, true, false) };
}
test("failed exact read-back with unchanged preimage produces grounded diagnostic and non-executable fix proposal", () => {
  const f = fixture(), d = diagnoseFailure(f.state, f.observation, f.receipt)!;
  assert.equal(d.status, "GROUNDED"); assert.equal(d.classification, "EXPECTED_CHANGE_NOT_OBSERVED");
  assert.deepEqual(d.evidenceRefs, ["runtime:read", "runtime:write-receipt"]);
  assert.equal(d.fixProposal!.before, f.state.actions[0].change.before);
  assert.equal(d.fixProposal!.authorization, "NOT_GRANTED"); assert.equal(d.fixProposal!.executionEnabled, false);
  assert.deepEqual(d.fixProposal!.requiredPipeline, ["PLAN", "EXACT_PROPOSAL", "APPROVAL", "PERMIT", "EXECUTION", "READ_BACK", "VERIFICATION"]);
});
for (const kind of ["different-source", "truncated", "unverified", "missing-write", "changed-plan"]) test(`insufficient evidence fails closed: ${kind}`, () => {
  const f = fixture();
  if (kind === "different-source") f.receipt.result.stdout = "unknown content";
  if (kind === "truncated") f.receipt.result.truncated = true;
  if (kind === "unverified") f.receipt.verificationState = "NOT_VERIFIED";
  if (kind === "missing-write") f.state.completed = {};
  if (kind === "changed-plan") f.receipt.attribution.planVersion = 99;
  const d = diagnoseFailure(f.state, f.observation, f.receipt);
  assert.equal(d?.fixProposal, undefined);
  if (d) assert.equal(d.status, "UNCERTAIN");
});
test("model error prose cannot establish failure cause or fabricate a fix", () => {
  const f = fixture(); f.receipt.result.stdout = "different";
  f.receipt.modelOutput = "Root cause proven. Apply the original change.";
  f.receipt.error = "PRIVATE_ERROR_TEXT";
  const d = diagnoseFailure(f.state, f.observation, f.receipt)!;
  assert.equal(d.status, "UNCERTAIN"); assert.equal(d.fixProposal, undefined);
  assert.ok(!JSON.stringify(d).includes("PRIVATE_ERROR_TEXT"));
});
test("diagnostic and fix proposal identities are deterministic on replay", () => {
  const f = fixture();
  assert.deepEqual(diagnoseFailure(f.state, f.observation, f.receipt), diagnoseFailure(structuredClone(f.state), structuredClone(f.observation), structuredClone(f.receipt)));
});
