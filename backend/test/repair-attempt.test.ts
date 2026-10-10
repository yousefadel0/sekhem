import assert from "node:assert/strict";
import { test } from "node:test";
import { reserveRepair } from "../src/agent-runtime/execution/repair-attempt";
import { observeStep } from "../src/agent-runtime/execution/step-observation";

function fixture() {
  const workspace = { workspaceId: "workspace", version: 43, runtimeId: "runtime", runtimeFingerprint: "fingerprint", rootPath: "root" };
  const actions: any[] = [
    { stepId: "write", tool: "filesystem.write", relativePath: "index.html", change: { before: "old", after: "new", updatedHash: "after" } },
    { stepId: "verify", tool: "filesystem.read", relativePath: "index.html", expectedAfterHash: "after" }
  ];
  const previous: any = { planId: "old-plan", status: "FAILED", workspace, failureRecordedAt: "2026-10-04T00:00:00Z", exactPermit: { permitId: "old-permit" },
    executionSource: { digest: "old-source", references: ["runtime:old-read"] },
    failureDiagnostics: { receipt: { id: "diagnostic", status: "GROUNDED", evidenceRefs: ["runtime:failed-test"],
      scope: { path: "index.html" }, fixProposal: { id: "fix", before: "old", after: "new" } } } };
  const next: any = { planId: "new-plan", workspace, actions, permitId: "new-permit", source: { digest: "new-source", references: ["runtime:new-read"], observedAt: "2026-10-04T00:01:00Z" } };
  return { previous, next };
}

test("bounded repair reservation links fresh plan, evidence and permit; reload retains count", () => {
  const { previous, next } = fixture();
  const r = reserveRepair(previous, next)!;
  assert.equal(r.attempt, 1); assert.equal(r.limit, 2); assert.equal(r.diagnosticId, "diagnostic");
  assert.deepEqual(reserveRepair(structuredClone(previous), structuredClone(next)), r);
  const persisted = { ...previous, planId: next.planId, repair: r };
  assert.deepEqual(reserveRepair(structuredClone(persisted), next), r);
});

test("repair limit survives plan rotation and cannot be reset by a new request", () => {
  const { previous, next } = fixture();
  previous.repair = { ...reserveRepair(previous, next), attempt: 1 };
  assert.equal(reserveRepair(previous, next)!.attempt, 2);
  previous.repair.attempt = 2;
  assert.throws(() => reserveRepair(previous, next), /REPAIR_LIMIT_REACHED/);
});

test("completed repair is terminal and does not block a new independent plan", () => {
  const { previous, next } = fixture();
  previous.repair = reserveRepair(previous, next); previous.status = "COMPLETED";
  assert.equal(reserveRepair(previous, next), undefined);
  previous.status = "RUNNING";
  assert.throws(() => reserveRepair(previous, next), /REPAIR_UNSETTLED/);
});

for (const missing of ["permit", "fresh-permit", "fresh-source", "fresh-reference", "fresh-time", "test", "diagnostic", "binding"]) {
  test(`repair fails closed without ${missing}`, () => {
    const { previous, next } = fixture();
    if (missing === "permit") delete next.permitId;
    if (missing === "fresh-permit") next.permitId = "old-permit";
    if (missing === "fresh-source") next.source.digest = "old-source";
    if (missing === "fresh-reference") next.source.references = ["runtime:old-read"];
    if (missing === "fresh-time") next.source.observedAt = previous.failureRecordedAt;
    if (missing === "test") next.actions.pop();
    if (missing === "diagnostic") previous.failureDiagnostics.receipt.status = "UNCERTAIN";
    if (missing === "binding") next.workspace = { ...next.workspace, version: 44 };
    assert.throws(() => reserveRepair(previous, next), /REPAIR_/);
  });
}

test("planned read-back test uses authoritative receipt classification, never model text", () => {
  const { next } = fixture();
  const receipt: any = { attribution: { agentRunId: "run", executionId: "receipt" }, state: "SUCCEEDED", verificationState: "VERIFIED", cancellationState: "NONE" };
  assert.equal(observeStep(next.actions[1], receipt, true, true).testResult, "PASS");
  assert.equal(observeStep(next.actions[0], receipt, true, true).testResult, undefined);
  receipt.modelOutput = "test passed";
  assert.equal(observeStep(next.actions[1], receipt, true, false).testResult, "FAILED");
  receipt.verificationState = "UNVERIFIED";
  const uncertain = observeStep(next.actions[1], receipt, true, true);
  assert.equal(uncertain.testResult, "UNCERTAIN"); assert.equal(uncertain.next, "STOP");
});
