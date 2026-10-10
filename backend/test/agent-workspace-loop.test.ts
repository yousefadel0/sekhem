import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";

test("one AgentRun: model inspection → approval → runtime → verified evidence → next inspection → grounded report", async () => {
  const h = await inspectionHarness(), before = h.tables.agentRun.size;
  h.responses.push(h.inspect()); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.request("poll")).execution, null);
  await h.approve(); const a = (await h.request("poll")).execution; assert.ok(a);
  assert.equal(a.attribution.agentRunId, h.run.id); await h.complete(a); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal((await h.state()).references.length, 1);
  assert.notEqual(h.tables.agentRun.get(h.run.id).status, "COMPLETED");
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); await h.approve();
  const b = (await h.request("poll")).execution; assert.ok(b); assert.notEqual(a.attribution.executionId, b.attribution.executionId);
  assert.equal(b.attribution.agentRunId, h.run.id); await h.complete(b); await h.service.advance(h.run.id);
  const ref = (await h.state()).references[1];
  h.responses.push(input => {
    const data = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).planningContract;
    const evidenceRef = `runtime:${ref.receiptId}`;
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report authentication evidence", report: {
      constraintIds: data.constraints.map((c: any) => c.id), facts: [{ id: "fact-auth", text: "export function authenticate() {}", evidenceRef }],
      inferences: [{ id: "inference-auth", text: "Authentication has an entry point in session.ts.", factIds: ["fact-auth"], uncertainty: "Only the inspected implementation is covered." }], hypotheses: [], unknowns: []
    } });
  });
  await h.service.advance(h.run.id);
  const completed = await h.state();
  assert.equal(completed.state, "COMPLETED", JSON.stringify({ code: completed.code, diagnostic: completed.failureDiagnostic })); assert.equal(completed.iterations, 2);
  assert.equal(h.tables.agentRun.size, before); assert.equal(h.tables.conversation.size, 1);
  const report = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport);
  assert.match(report.content, /session.ts/); assert.match(report.content, /runtime:/);
  assert.match(report.content, /Observed \(exact source excerpts\):/);
  assert.match(report.content, /Inferred \(not certified facts\):/);
  assert.equal(h.calls.length, 3); assert.equal((await h.request("poll")).execution, null);
});
