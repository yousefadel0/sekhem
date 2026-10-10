import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationAgentRun, evidenceDisplayStatus, runActivity } from "../lib/sekhem-agent";
test("a successful Explorer read cannot mask the failed conversation Agent", () => {
  const failed: any = { id: "run_review", status: "FAILED", createdAt: "2026-10-09T10:00:00Z", inspection: { state: "FAILED", operations: [{ action: { tool: "filesystem.read" }, verification: "VERIFIED" }] } };
  const read: any = { id: "rtrun_read", status: "COMPLETED", createdAt: "2026-10-09T11:00:00Z" };
  assert.equal(conversationAgentRun([read, failed], { run_review: failed }), failed);
  assert.equal(runActivity(failed), "Some sources read · Analysis stopped");
  assert.equal(conversationAgentRun([read], {}), undefined);
});
test("shortened model context does not imply that the Runtime file read was truncated", () => {
  const evidence: any = { truncated: true, outcome: "TRUNCATED", runtimeReference: { truncated: false } };
  assert.equal(evidenceDisplayStatus(evidence), "MODEL EXCERPT SHORTENED");
  evidence.runtimeReference.truncated = true; assert.equal(evidenceDisplayStatus(evidence), "TRUNCATED");
  delete evidence.runtimeReference; assert.equal(evidenceDisplayStatus(evidence), "TRUNCATED");
});
test("conversation status uses the latest primary run without mutating history", () => {
  const older: any = { id: "run_old", createdAt: "2026-10-09T10:00:00Z" }, latest: any = { id: "run_new", createdAt: "2026-10-09T11:00:00Z" };
  const history = [older, latest]; assert.equal(conversationAgentRun(history, {}), latest); assert.deepEqual(history, [older, latest]);
  assert.equal(runActivity({ status: "FAILED", inspection: { state: "FAILED", evidence: [], operations: [{ action: { tool: "filesystem.list" }, verification: "VERIFIED" }] } } as any), "Analysis stopped · No verified read completed");
});
