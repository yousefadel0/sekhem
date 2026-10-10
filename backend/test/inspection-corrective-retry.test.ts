import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";

async function listed() {
  const h = await inspectionHarness();
  h.responses.push(h.inspect()); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  return h;
}
test("one corrective model turn converts a promised read into an approval-gated proposal", async () => {
  const h = await listed();
  h.responses.push("I'll read auth.ts next."); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal((await h.request("poll")).execution, null);
  h.responses.push(input => { assert.match(JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).correction, /valid sekhem-action/); return h.inspect("filesystem.read", "auth.ts"); });
  await h.newService().advance(h.run.id);
  assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.state()).current?.action.tool, "filesystem.read");
  assert.equal((await h.request("poll")).execution, null);
});
test("repeated prose stops after two corrective turns without fabricating an action", async () => {
  const h = await listed();
  for (let i = 0; i < 3; i++) { h.responses.push("هقرأ auth.ts بعد كده."); await h.service.advance(h.run.id); }
  assert.equal((await h.state()).state, "PARTIAL");
  assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
  assert.equal((await h.request("poll")).execution, null);
  assert.equal((await h.state()).operations.length, 1);
  const count = h.calls.length; await h.service.advance(h.run.id); assert.equal(h.calls.length, count);
});
