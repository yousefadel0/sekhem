import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { inspectionLimit } from "../src/agent-runtime/inspection/inspection.contract";

type H = Awaited<ReturnType<typeof inspectionHarness>>;
async function ready() { const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id); return h; }
async function change(h: H, kind: any, key: unknown, edit: (value: any) => void) {
  await h.ledger.transaction(async tx => { const row = kind === "RUNTIME_DEVICE" ? await h.identity.device(tx, String(key)) : (await h.ledger.read<any>(tx, kind, key))!; edit(row.payload); await h.ledger.update(tx, row, row.payload); });
}
async function conversationOnly(h: H, expected: "PARTIAL" | "AWAITING_INPUT" = "PARTIAL") {
  await h.service.advance(h.run.id);
  const state = await h.state();
  // Invalid output is terminal PARTIAL; it does not ask the user to clarify a clear task.
  assert.equal(state.state, expected);
  if (expected === "PARTIAL") {
    assert.equal(state.code, "INSPECTION_OUTPUT_INCOMPLETE");
    assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
  } else assert.equal(h.tables.agentRun.get(h.run.id).status, "PAUSED");
  assert.equal((await h.request("poll")).execution, null);
  assert.equal(state.understanding, undefined);
  assert.equal(state.current, null);
  const calls = h.calls.length;
  await h.service.advance(h.run.id);
  assert.equal(h.calls.length, calls);
}
async function failed(h: H, code?: string) { await h.service.advance(h.run.id); const s = await h.state(); assert.equal(s.state, "FAILED"); if (code) assert.equal(s.code, code); assert.equal(s.references.length, 0); }

for (const [name, extra] of Object.entries({ authorization: { approved: true }, workspace: { workspaceId: "other" }, runtime: { runtimeId: "other" }, project: { projectId: "other" }, limit: { maxIterations: 999 } })) {
  test(`model cannot assign ${name} authority`, async () => { const h = await inspectionHarness(); h.responses.push(JSON.stringify({ ...JSON.parse(h.inspect()), ...extra })); await conversationOnly(h); assert.equal((await h.state()).iterations, 0); assert.equal((await h.request("poll")).execution, null); });
}
for (const tool of ["filesystem.write", "filesystem.create", "filesystem.delete", "filesystem.copy", "filesystem.move", "terminal.execute"]) {
  test(`model cannot propose ${tool}`, async () => { const h = await inspectionHarness(); h.responses.push(h.inspect(tool, "session.ts")); await conversationOnly(h); });
}
for (const path of ["../outside.ts", "C:\\other\\session.ts", ".env", "node_modules/index.ts"]) {
  test(`model cannot expand inspection to ${path}`, async () => {
    const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", path));
    if (path === "../outside.ts" || path === "C:\\other\\session.ts") {
      await failed(h, "INSPECTION_SCOPE_DENIED");
      assert.equal((await h.request("poll")).execution, null);
      assert.equal((await h.state()).understanding, undefined);
    } else await conversationOnly(h);
    assert.equal((await h.state()).iterations, 0);
  });
}
test("no approval means no permit or dispatch; changed approval fingerprint is denied", async () => {
  const h = await ready(), s = await h.state(); assert.equal((await h.request("poll")).execution, null);
  await assert.rejects(h.service.approve(h.run.id, h.claims, { planVersion: s.current!.planVersion, fingerprint: "0".repeat(64), decision: "APPROVED" }));
  assert.equal((await h.request("poll")).execution, null);
});
test("denial leaves the conversation open without dispatch", async () => {
  const h = await ready(), c = (await h.state()).current!;
  await h.service.approve(h.run.id, h.claims, { planVersion: c.planVersion, fingerprint: c.fingerprint, decision: "DENIED" });
  const state = await h.state();
  assert.equal(state.state, "AWAITING_INPUT");
  assert.equal(state.current, null);
  assert.equal(state.operations[0].state, "REJECTED");
  assert.equal(h.tables.agentRun.get(h.run.id).status, "PAUSED");
  assert.equal((await h.request("poll")).execution, null);
});
for (const mutation of ["target", "plan", "stale-version"]) {
  test(`${mutation} change after approval cannot dispatch`, async () => {
    const h = await ready(); await h.approve(); const c = (await h.state()).current!;
    if (mutation === "target") await change(h, "RUNTIME_PROPOSAL", [h.run.id, c.planVersion], p => { p.validatedInput.path = "D:\\Fixture\\other.ts"; });
    if (mutation === "plan") [...h.tables.agentPlan.values()].find(p => p.agentRunId === h.run.id && p.version === c.planVersion).steps[0].description = "changed";
    if (mutation === "stale-version") h.tables.agentRun.get(h.run.id).planVersion++;
    assert.equal((await h.request("poll")).execution, null); await failed(h);
  });
}
for (const mutation of ["revoked", "disabled", "identity", "binding-revoked", "binding-replaced", "offline", "expired-approval", "expired-session", "revoked-grant"]) {
  test(`${mutation} fails closed before dispatch`, async () => {
    const h = await ready(); await h.approve();
    if (["revoked", "disabled"].includes(mutation)) await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, mutation === "revoked" ? "REVOKED" : "DISABLED");
    if (mutation === "identity") await change(h, "RUNTIME_DEVICE", h.device.runtimeId, d => { d.fingerprint = "0".repeat(64); });
    if (mutation === "offline") await change(h, "RUNTIME_DEVICE", h.device.runtimeId, d => { d.lastSeenAt = "2000-01-01T00:00:00Z"; });
    if (mutation === "binding-revoked") await h.store.updateBinding(h.binding.workspaceId, h.binding.revision, { status: "REVOKED" });
    if (mutation === "binding-replaced") await h.runtime.createBinding(h.claims, "project-a", { runtimeId: h.device.runtimeId, rootPath: "D:\\Elsewhere", displayName: "Replacement", requestId: "new" });
    if (mutation === "expired-approval") h.tables.agentApproval.get((await h.state()).current!.approvalId).dueAt = new Date(0);
    if (mutation === "expired-session") h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(0);
    if (mutation === "revoked-grant") await h.identity.revokeGrant(h.claims, h.device.runtimeId, "project-a");
    await failed(h); assert.equal((await h.state()).operations[0].verification, undefined);
  });
}
test("workspace change between dispatch and start cannot execute", async () => {
  const h = await ready(); await h.approve(); const e = (await h.request("poll")).execution;
  await h.store.updateBinding(h.binding.workspaceId, h.binding.revision, { status: "REVOKED" });
  const ack = await h.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
  assert.equal(ack.execute, false); await failed(h);
});
for (const mutation of ["unverified", "wrong-path", "failed"]) {
  test(`${mutation} runtime observation cannot become evidence`, async () => {
    const h = await ready(); await h.approve(); const e = (await h.request("poll")).execution;
    await h.complete(e, "export function authenticate() {}", mutation === "unverified" ? { verificationState: "NOT_VERIFIED" } : mutation === "failed" ? { state: "FAILED", verificationState: "FAILED", error: "READ_FAILED" } : { result: { path: "D:\\Elsewhere\\session.ts", bytesRead: 32, size: 32 } });
    await failed(h); assert.equal((await h.state()).references.length, 0);
  });
}
test("runtime result cannot be attributed to another operation", async () => {
  const h = await ready(); await h.approve(); const e = (await h.request("poll")).execution;
  await assert.rejects(h.request("started", { executionId: e.attribution.executionId, operationDigest: "0".repeat(64) }), /ATTRIBUTION/);
  assert.equal((await h.state()).references.length, 0);
});
test("iteration bound cannot be bypassed; observed operation alone does not complete objective", async () => {
  const h = await inspectionHarness(); await change(h, "AGENT_INSPECTION", h.run.id, s => { s.maxIterations = 1; });
  h.responses.push(h.inspect()); await h.service.advance(h.run.id); await h.approve(); await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  h.responses.push(h.inspect("filesystem.read", "session.ts")); await h.service.advance(h.run.id);
  const s = await h.state(); assert.equal(s.code, "ITERATION_LIMIT_REACHED"); assert.equal(s.iterations, 1); assert.equal(s.operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  for (const value of ["0", "65", "-1", "NaN", "1.5"]) assert.throws(() => inspectionLimit(value));
  assert.equal(inspectionLimit("4"), 4);
});
test("concurrent advancement, approvals and polls converge on one proposal/permit", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect()); await Promise.all([h.service.advance(h.run.id), h.newService().advance(h.run.id)]);
  assert.equal(h.calls.length, 1); await Promise.all([h.approve(), h.approve()]);
  const polls = await Promise.all([h.request("poll"), h.request("poll")]); assert.equal(polls.filter(p => p.execution).length, 1);
  assert.equal((await h.state()).iterations, 1);
});
test("durable waiting approval and receipt survive service restart without replay", async () => {
  const h = await ready(), c = (await h.state()).current!; const restart = h.newService(); await restart.reconcile();
  assert.equal((await h.state()).current!.proposalId, c.proposalId); assert.equal(h.calls.length, 1);
  await restart.approve(h.run.id, h.claims, { planVersion: c.planVersion, fingerprint: c.fingerprint, decision: "APPROVED" });
  const e = (await h.request("poll")).execution; await h.complete(e);
  await h.newService().reconcile(); assert.equal((await h.state()).references.length, 1); assert.equal((await h.request("poll")).execution, null);
});
test("uncertain dispatch remains OUTCOME_UNKNOWN after reconnect; no automatic filesystem retry", async () => {
  const h = await ready(); await h.approve(); await h.request("poll"); await h.request("connect"); await h.newService().advance(h.run.id);
  assert.equal((await h.state()).code, "OUTCOME_UNKNOWN"); assert.equal((await h.state()).references.length, 0); assert.equal((await h.request("poll")).execution, null);
});
test("cancel before approval persists and cannot dispatch", async () => {
  const h = await ready(); await h.service.cancel(h.run.id, h.claims); await h.newService().reconcile();
  assert.equal((await h.state()).state, "CANCELLED"); assert.equal((await h.request("poll")).execution, null); await assert.rejects(h.approve());
});
test("cancel during model work prevents late proposal creation", async () => {
  const h = await inspectionHarness(); let release!: (value: string) => void, entered!: () => void;
  const started = new Promise<void>(r => { entered = r; }); h.responses.push(() => { entered(); return new Promise(r => { release = r; }); });
  const advancing = h.service.advance(h.run.id); await started; await h.service.cancel(h.run.id, h.claims); release(h.inspect()); await advancing;
  assert.equal((await h.state()).state, "CANCELLED"); assert.equal((await h.state()).iterations, 0);
});
test("expired model lease fails after restart instead of replaying model/action", async () => {
  const h = await inspectionHarness(); await change(h, "AGENT_INSPECTION", h.run.id, s => { s.modelAttempt = { id: "interrupted", expiresAt: 0 }; });
  await h.newService().advance(h.run.id); assert.equal((await h.state()).code, "MODEL_INTERRUPTED"); assert.equal(h.calls.length, 0);
});
test("truncated output remains OUTPUT_TRUNCATED and PLAN_NOT_READY without proposal", async () => {
  const h = await inspectionHarness(); h.responses.push(input => { input.onDiagnostic({ finishReason: "length" }); throw new Error("structured output unavailable"); });
  await failed(h, "OUTPUT_TRUNCATED"); assert.equal((await h.state()).iterations, 0);
  const report = [...h.tables.conversationMessage.values()].find(m => m.metadata?.inspectionReport); assert.match(report.content, /PLAN_NOT_READY/);
});
test("malformed output is never executable", async () => {
  const h = await inspectionHarness(); h.responses.push('{"decision":"INSPECT"'); await conversationOnly(h, "AWAITING_INPUT");
});
test("model STOP preserves insufficient evidence instead of fabricating completion", async () => {
  const h = await inspectionHarness(); h.responses.push(JSON.stringify({ decision: "STOP", tool: "none", relativePath: "", query: "", purpose: "Need missing information", report: null }));
  await conversationOnly(h, "AWAITING_INPUT");
});
test("answer-shaped output cannot satisfy the grounded planning report", async () => {
  const h = await inspectionHarness(); h.responses.push(JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report", report: { answer: "Authentication is verified" } }));
  await conversationOnly(h);
});
test("cancellation after start remains cancelled even if a late signed success arrives", async () => {
  const h = await ready(); await h.approve(); const e = (await h.request("poll")).execution;
  await h.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
  await h.service.cancel(h.run.id, h.claims); assert.equal((await h.state()).current!.state, "CANCELLATION_REQUESTED");
  const now = new Date().toISOString(), text = "export function authenticate() {}";
  await h.request("result", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest, state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: null,
    stdout: text, stderr: "", error: null, truncated: false, result: { path: e.attribution.validatedInput.path, bytesRead: Buffer.byteLength(text), size: Buffer.byteLength(text) }, verificationState: "VERIFIED", verificationResult: { observed: true } });
  await h.newService().advance(h.run.id); assert.equal((await h.state()).state, "CANCELLED"); assert.equal(h.tables.agentRun.get(h.run.id).status, "CANCELLED"); assert.equal((await h.state()).references.length, 0);
});
test("search admission preserves matched excerpts and receipt provenance", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.search", "", "authenticate")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id); const s = await h.state();
  assert.equal(s.references[0].verificationState, "VERIFIED"); const admitted = await h.evidence.admit(h.claims, s.projectId, s.conversationId, s.references[0]);
  assert.equal(admitted.operation?.tool, "filesystem.search"); assert.match(admitted.file.text, /session.ts/); assert.match(admitted.file.text, /authenticate/);
  await assert.rejects(h.evidence.admit(h.claims, s.projectId, s.conversationId, { ...s.references[0], receiptId: "other" }), /MISMATCH/);
});
