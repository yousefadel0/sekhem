import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { checkpointContext } from "../src/agent-runtime/inspection/inspection-understanding";
import { AGENT_PLANNING_SCHEMA, AGENT_UNDERSTANDING_SCHEMA, parsePlanningProposal, parseUnderstandingProposal } from "../src/agent-runtime/understanding/agent-planning.contract";

type Harness = Awaited<ReturnType<typeof inspectionHarness>>;
async function observe(h: Harness, path = "auth.ts", text = "export function authenticate() {}", tool = "filesystem.read", override = {}) {
  h.responses.push(h.inspect(tool, path, tool === "filesystem.search" ? "authenticate" : ""));
  await h.service.advance(h.run.id); await h.approve();
  const execution = (await h.request("poll")).execution; assert.ok(execution);
  await h.complete(execution, text, override); await h.service.advance(h.run.id);
  return (await h.state()).references.at(-1)!;
}
function findings(input: any, facts: Array<{ id: string; text: string; evidenceRef: string }>, unknowns: any[] = []) {
  const data = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).planningContract;
  return { constraintIds: data.constraints.map((c: any) => c.id), facts,
    inferences: facts.length ? [{ id: "relationship", text: "The inspected source defines the observed authentication entry point.",
      factIds: facts.map(f => f.id), uncertainty: "Only these observed excerpts are covered." }] : [], hypotheses: [], unknowns };
}
function report(input: any, facts: Parameters<typeof findings>[1], unknowns: any[] = []) {
  return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Explain observed source", report: findings(input, facts, unknowns) });
}
const fact = (receiptId: string, text = "export function authenticate() {}", id = "fact-auth") => ({ id, text, evidenceRef: `runtime:${receiptId}` });

test("understanding is a strict bounded contract without plan steps or execution authority", () => {
  assert.equal(AGENT_UNDERSTANDING_SCHEMA.additionalProperties, false);
  assert.ok(!AGENT_UNDERSTANDING_SCHEMA.required!.includes("steps"));
  assert.ok(AGENT_PLANNING_SCHEMA.required!.includes("steps"));
  const v = { constraintIds: [], facts: [], inferences: [], hypotheses: [], unknowns: [] };
  assert.ok(parseUnderstandingProposal(JSON.stringify(v)).proposal);
  assert.equal(parsePlanningProposal(JSON.stringify(v)).proposal, undefined);
  for (const extra of [{ authorization: "APPROVED" }, { steps: [] }, { runtimeId: "forged" }, { workspace: "other" }]) {
    assert.equal(parseUnderstandingProposal(JSON.stringify({ ...v, ...extra })).proposal, undefined);
  }
  assert.equal(parseUnderstandingProposal(JSON.stringify({ ...v, facts: Array(7).fill({ id: "fact", text: "x", evidenceRef: "r" }) })).proposal, undefined);
  assert.equal(parseUnderstandingProposal(" ".repeat(24001)).proposal, undefined);
  assert.equal(parseUnderstandingProposal("{".repeat(13)).proposal, undefined);
});

test("source understanding completes in the same Chat without inventing PLAN_READY", async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  h.responses.push(input => {
    assert.equal(input.schema, undefined);
    assert.match(input.systemInstruction, /do not produce a second JSON grounding record/);
    assert.match(input.systemInstruction, /not an implementation plan/);
    return report(input, [fact(ref.receiptId)]);
  });
  await h.service.advance(h.run.id);
  const s = await h.state(), view = await h.service.view(h.run.id, h.claims);
  assert.equal(s.state, "COMPLETED"); assert.equal(view?.objectiveGrounded, true);
  assert.equal(s.planning, null); assert.equal(s.understanding?.status, "GROUNDED");
  const latest = [...h.tables.agentPlan.values()].filter(p => p.agentRunId === h.run.id).sort((a, b) => b.version - a.version)[0];
  assert.equal(latest.status, "PLAN_NOT_READY"); assert.equal(latest.steps[0].parameters.planning, null);
  assert.deepEqual(s.understanding!.evidence[0].runtimeReference, ref);
  const messages = [...h.tables.conversationMessage.values()].filter(m => m.metadata?.inspectionReport);
  assert.equal(messages.length, 1); assert.equal(messages[0].conversationId, h.run.conversationId);
  assert.match(messages[0].content, /Project understanding — inspected scope/);
  assert.match(messages[0].content, /auth.ts/); assert.match(messages[0].content, /not an approved implementation plan/);
  assert.equal((await h.request("poll")).execution, null);
});

for (const tool of ["filesystem.list", "filesystem.search"]) test(`${tool} alone cannot complete project understanding`, async () => {
  const h = await inspectionHarness(), ref = await observe(h, "", "export function authenticate() {}", tool);
  h.responses.push(input => report(input, [fact(ref.receiptId, tool === "filesystem.list" ? "session.ts" : "export function authenticate() {}")]));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL");
  assert.equal((await h.service.view(h.run.id, h.claims))?.objectiveGrounded, false);
  assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
  assert.equal((await h.request("poll")).execution, null);
});

test("a read receipt cannot launder a report grounded only in a listing", async () => {
  const h = await inspectionHarness(), listing = await observe(h, "", "", "filesystem.list");
  await observe(h);
  h.responses.push(input => report(input, [fact(listing.receiptId, "session.ts")]));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL");
  assert.equal((await h.request("poll")).execution, null);
});

test("bounded intermediate understanding survives restart, supports cross-file findings, and never dispatches without approval", async () => {
  const h = await inspectionHarness(), a = await observe(h, "auth.ts", 'import { validateSession } from "./session";');
  h.responses.push(input => JSON.stringify({ decision: "INSPECT", tool: "filesystem.read", relativePath: "session.ts", query: "", purpose: "Read the dependency",
    report: findings(input, [fact(a.receiptId, 'import { validateSession } from "./session";', "fact-import")],
      [{ id: "missing-session", description: "Session validation implementation is not read yet.", whyNeeded: "Trace the dependency.", severity: "HIGH" }]) }));
  await Promise.all([h.service.advance(h.run.id), h.newService().advance(h.run.id)]);
  const saved = (await h.state()).understanding!;
  assert.equal(saved.sequence, 1); assert.equal(saved.status, "INTERMEDIATE");
  assert.equal((await h.request("poll")).execution, null);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.inspectionUnderstanding).length, 1);
  const resumed = h.newService(); await resumed.advance(h.run.id);
  assert.deepEqual((await h.state()).understanding, saved);
  await h.approve(); const execution = (await h.request("poll")).execution;
  assert.equal(execution.attribution.agentRunId, h.run.id);
  await h.complete(execution, "export function validateSession() { return false; }"); await resumed.advance(h.run.id);
  const b = (await h.state()).references.at(-1)!;
  h.responses.push(input => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    assert.equal(state.priorFindings.kind, "UNTRUSTED_PRIOR_FINDINGS");
    const result = JSON.parse(report(input, [fact(a.receiptId, 'import { validateSession } from "./session";', "fact-import"), fact(b.receiptId, "return false;", "fact-session")]));
    result.report.inferences[0].text = "The observed auth import points to the inspected session function, which returns false.";
    return JSON.stringify(result);
  });
  await resumed.advance(h.run.id);
  const s = await h.state(); assert.equal(s.state, "COMPLETED"); assert.equal(s.iterations, 2);
  assert.equal(s.understanding!.sequence, 2); assert.equal(s.understanding!.understanding.facts.length, 2);
  assert.equal(s.understanding!.understanding.unknowns.length, 0);
  const final = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport);
  assert.match(final.content, /auth.ts/); assert.match(final.content, /session.ts/);
  assert.ok([...h.tables.conversationMessage.values()].filter(m => m.metadata?.inspectionUnderstanding || m.metadata?.inspectionReport).every(m => m.conversationId === h.run.conversationId));
  assert.equal(checkpointContext(saved, 0), null);
  const bounded = checkpointContext(saved, 24000); assert.ok(bounded);
  assert.equal(checkpointContext(saved, JSON.stringify(bounded).length - 1), null);
});

for (const defect of ["invented-excerpt", "invented-receipt", "invented-fact-id", "missing-constraints", "duplicate-fact", "authority"]) test(`invalid ${defect} checkpoint is not evidence and cannot authorize the independent read`, async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  h.responses.push(input => {
    const v: any = findings(input, [fact(ref.receiptId)]);
    if (defect === "invented-excerpt") v.facts[0].text = "I inspected all project files.";
    if (defect === "invented-receipt") v.facts[0].evidenceRef = "runtime:never-observed";
    if (defect === "invented-fact-id") v.inferences[0].factIds = ["not-a-fact"];
    if (defect === "missing-constraints") v.constraintIds = [];
    if (defect === "duplicate-fact") v.facts.push(v.facts[0]);
    if (defect === "authority") v.authorization = "APPROVED";
    return JSON.stringify({ decision: "INSPECT", tool: "filesystem.read", relativePath: "session.ts", query: "", purpose: "Inspect", report: v });
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.state()).iterations, 2); assert.equal((await h.request("poll")).execution, null);
  assert.equal((await h.state()).understanding, undefined);
});

test("unknowns produce a truthful partial Chat report without marking the run completed", async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  h.responses.push(input => report(input, [fact(ref.receiptId)], [{ id: "missing-router", description: "The request router was not inspected.", whyNeeded: "The call chain remains unknown.", severity: "HIGH" }]));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL"); assert.equal((await h.state()).understanding?.status, "PARTIAL");
  assert.equal((await h.service.view(h.run.id, h.claims))?.objectiveGrounded, false);
  assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport);
  assert.match(message.content, /incomplete/); assert.match(message.content, /router was not inspected/);
  const calls = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, calls);
});

test("truncated source remains partial even when the model reports no unknowns", async () => {
  const h = await inspectionHarness(), ref = await observe(h, "auth.ts", "export function authenticate() {}", "filesystem.read", { truncated: true });
  h.responses.push(input => report(input, [fact(ref.receiptId)])); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL");
  assert.equal((await h.state()).understanding!.evidence[0].truncated, true);
});

test("finish_reason length rejects even a parseable understanding response", async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  h.responses.push(input => { input.onDiagnostic({ finishReason: "length" }); return report(input, [fact(ref.receiptId)]); });
  await h.service.advance(h.run.id); assert.equal((await h.state()).code, "OUTPUT_TRUNCATED");
  assert.equal((await h.state()).understanding, undefined);
});

test("understanding cannot complete a request to implement or verify work", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    row.payload.objective = "Implement authentication in this project. Acceptance: authentication tests pass.";
    await h.ledger.update(tx, row, row.payload, "active"); });
  const ref = await observe(h); h.responses.push(input => report(input, [fact(ref.receiptId)]));
  await h.service.advance(h.run.id); assert.equal((await h.state()).state, "PARTIAL");
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport);
  assert.match(message.content, /remain outstanding/); assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
});

test("cancelled model work cannot save late intermediate findings or a next proposal", async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  h.responses.push(async input => { entered(); await gate; return report(input, [fact(ref.receiptId)]); });
  const pending = h.service.advance(h.run.id); await waiting; await h.service.cancel(h.run.id, h.claims); release(); await pending;
  assert.equal((await h.state()).state, "CANCELLED"); assert.equal((await h.state()).understanding, undefined);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.inspectionReport).length, 1);
});

test("operation budget exhaustion retains previous findings but never claims full understanding", async () => {
  const h = await inspectionHarness(), ref = await observe(h);
  h.responses.push(input => JSON.stringify({ decision: "INSPECT", tool: "filesystem.read", relativePath: "session.ts", query: "", purpose: "Trace the dependency", report: findings(input, [fact(ref.receiptId)]) }));
  await h.service.advance(h.run.id); await h.approve(); await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!; row.payload.maxIterations = 2; await h.ledger.update(tx, row, row.payload, "active"); });
  h.responses.push(h.inspect("filesystem.read", "router.ts")); await h.service.advance(h.run.id);
  assert.equal((await h.state()).code, "ITERATION_LIMIT_REACHED"); assert.equal((await h.state()).iterations, 2);
  assert.equal((await h.state()).understanding?.status, "PARTIAL");
  const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport);
  assert.match(message.content, /incomplete/); assert.match(message.content, /auth.ts/);
  assert.equal((await h.request("poll")).execution, null);
});
