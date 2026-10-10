import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { fixture } from "./task-consent.test";
import { approvePlanWorkflow } from "../src/agent-runtime/execution/approved-plan-workflow";
import { ExactProposalService } from "../src/agent-runtime/execution/exact-proposal.service";
import { executionRecord } from "../src/agent-runtime/execution/plan-execution-state";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { exactChangeDiff } from "../src/agent-runtime/execution/verified-change-diff";
import { readFileSync } from "node:fs";

async function setup(mode: "ACTION" | "TASK", existingConsent = true) {
  const h = await fixture(300, "TASK", !existingConsent);
  const services = { ledger: h.ledger, proposals: new ExactProposalService(h.ledger, (h.executor as any).inspections,
    h.f.gateway, (h.executor as any).evidence), approvals: h.approvals, permits: h.permits, executor: h.executor, control: h.control };
  const body = { planId: h.p.planId, planVersion: h.p.planVersion, planDigest: h.p.planDigest, mode, requestId: "explicit-workflow" };
  const approve = () => approvePlanWorkflow(services, "conversation-a", h.claims, body);
  return { ...h, services, body, approve };
}

async function savedExactApproval() {
  const h = await setup("ACTION", false);
  const first = await h.approvals.request("conversation-a", h.p.proposalId, h.claims,
    { ...h.approvalBody, requestId: "exact-approval-original" });
  h.tables.agentApproval.get(first.approvalId).dueAt = new Date(0);
  const renewed = await h.approvals.request("conversation-a", h.p.proposalId, h.claims,
    { ...h.approvalBody, requestId: "exact-approval-renewed" });
  await h.approvals.decide("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody,
    approvalId: renewed.approvalId, fingerprint: renewed.binding.fingerprint, decision: "APPROVED" });
  return { ...h, renewed };
}

test("execution reuses fresh persisted exact approval generation and request identity without a second approval request", async () => {
  const h = await savedExactApproval();
  const exactRows = () => [...h.tables.agentApproval].filter(([, row]) => row.approvalType === "EXACT_PROPOSAL");
  const rows = structuredClone(exactRows());
  const headKey = [h.claims.sub, "conversation-a", h.p.proposalId];
  const head = structuredClone(await h.ledger.read(h.db, "EXACT_APPROVAL_HEAD", headKey));
  const saved = await h.approvals.currentExactApproval("conversation-a", h.p.proposalId, h.claims, h.approvalBody);
  assert.equal(saved!.generation, 2);
  assert.equal(saved!.requestId, "exact-approval-renewed");
  assert.equal(saved!.binding.fingerprint, h.renewed.binding.fingerprint);
  h.approvals.request = async () => { throw new Error("SECOND_APPROVAL_REQUEST_FORBIDDEN"); };
  h.approvals.decide = async () => { throw new Error("SECOND_APPROVAL_DECISION_FORBIDDEN"); };
  assert.equal((await h.approve())?.status, "RUNNING");
  const state = (await executionRecord(h.db, h.f.run.id))!.payload;
  assert.equal(state.exactPermit!.binding.approvalId, h.renewed.approvalId);
  assert.equal(state.exactPermit!.binding.fingerprint, h.renewed.binding.fingerprint);
  assert.equal((await h.approve())?.status, "RUNNING");
  assert.deepEqual(exactRows(), rows);
  assert.deepEqual(await h.ledger.read(h.db, "EXACT_APPROVAL_HEAD", headKey), head);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED").length, 1);
});

for (const field of ["fingerprint", "generation", "requestId", "proposalDigest", "planDigest", "sourceDigest", "workspace", "expired", "pending", "denied"]) {
  test(`saved exact approval fails closed without requesting/deciding a replacement: ${field}`, async () => {
    const h = await savedExactApproval(), row = h.tables.agentApproval.get(h.renewed.approvalId);
    if (field === "expired") row.dueAt = new Date(0);
    else if (field === "pending" || field === "denied") row.status = field.toUpperCase();
    else if (field === "workspace") row.revisedPlan.workspace = { ...row.revisedPlan.workspace, bindingVersion: 99 };
    else row.revisedPlan[field] = field === "generation" ? 99 : "changed";
    h.approvals.request = async () => { throw new Error("SECOND_APPROVAL_REQUEST_FORBIDDEN"); };
    h.approvals.decide = async () => { throw new Error("SECOND_APPROVAL_DECISION_FORBIDDEN"); };
    await assert.rejects(h.approve(), /EXACT_APPROVAL_REQUIRED|APPROVAL_EXPIRED/);
    assert.equal(await executionRecord(h.db, h.f.run.id), null);
    assert.equal(await h.ledger.read(h.db, "EXACT_PERMIT_HEAD", [h.claims.sub, "conversation-a", h.p.proposalId]), null);
  });
}

test("Approve for Me creates and explicitly applies a fresh TASK policy before one-use permit admission", async () => {
  const h = await setup("TASK", false);
  assert.equal(await h.match(), undefined);
  const view = await h.approve(); assert.equal(view?.status, "RUNNING");
  const state = (await executionRecord(h.db, h.f.run.id))!.payload;
  const selected = state.exactPermit!.binding.taskConsent;
  assert.ok(selected?.policyId);
  const policy = await h.ledger.read<any>(h.db, "TASK_CONSENT", selected.policyId);
  assert.equal(policy!.immutable, true); assert.equal(policy!.payload.planId, h.p.planId);
  assert.equal((await h.match())?.policyId, selected.policyId);
});

// In-memory signed protocol fixtures exercise production authorization/receipt
// services. No real worker, source file, grant, or workspace is touched.
for (const mode of ["ACTION", "TASK"] as const) for (const repair of [false, true]) {
  test(`PLAN_READY -> ${mode} explicit approval -> ${repair ? "repair" : "write"} -> read-back -> verified diff/report; replay never writes twice`, async () => {
    const h = await setup(mode);
    const original = structuredClone(h.tables.agentPlan.get(h.f.plan.id));
    // An independently certified new plan/proposal follows a persisted grounded
    // failure. Prior execution authority is fixture history, never reused.
    const change = h.p.actions.find(a => a.change)!.change!;
    if (repair) {
      await h.ledger.create(h.db, "PLAN_EXECUTION", h.f.run.id, {
      requestId: "prior-request", lineageId: "prior-lineage", rootPlanId: "failed-original-plan", conversationId: "conversation-a",
      version: 1, runId: h.f.run.id, planId: "failed-original-plan", status: "FAILED",
      userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.f.run.projectId,
      workspace: h.f.fresh.binding, failureRecordedAt: new Date(0).toISOString(), exactPermit: { permitId: "consumed-old-permit" },
      executionSource: { digest: "prior-checkpoint", references: ["runtime:prior-source"] },
      failureDiagnostics: { failed: { id: "prior-diagnostic", status: "GROUNDED", evidenceRefs: ["runtime:prior-failed-read"],
        scope: { path: "index.html" }, fixProposal: { id: "prior-fix", before: change.before, after: change.after } } }
      }, { immutable: false, route: "settled" });
      await h.ledger.create(h.db, "EXECUTION_LINEAGE", "prior-lineage", {
        version: 1, id: "prior-lineage", userId: h.claims.sub, organizationId: h.claims.organizationId,
        projectId: h.f.run.projectId, rootPlanId: "failed-original-plan", attempts: 0, limit: 2,
        runId: h.f.run.id, planId: "failed-original-plan", requestId: "prior-request", terminal: false
      }, { immutable: false });
    }
    const view = await h.approve(); assert.equal(view?.status, "RUNNING");
    const state = (await executionRecord(h.db, h.f.run.id))!.payload;
    if (repair) { assert.equal(state.repair!.attempt, 1); assert.equal(state.repair!.previousPermitId, "consumed-old-permit"); }
    assert.equal(!!state.exactPermit?.binding.taskConsent, mode === "TASK");
    assert.equal(state.exactPermit!.binding.approvalState, "APPROVED");
    const write = (await h.request("poll")).execution; assert.equal(write.attribution.tool, "filesystem.write");
    const content = String(write.attribution.validatedInput.content), now = new Date().toISOString();
    assert.equal((await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })).execute, true);
    await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
      state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "written", stderr: "", error: null,
      truncated: false, result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) },
      verificationState: "VERIFIED", verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") } });
    const read = (await h.request("poll")).execution; assert.equal(read.attribution.tool, "filesystem.read");
    assert.notEqual(read.attribution.executionId, write.attribution.executionId);
    await h.complete(read, content);
    assert.equal((await h.approve())?.status, "COMPLETED");
    const restored = await h.executor.view(h.f.run.id, h.claims);
    if (repair) assert.equal(restored!.repair!.attempt, 1);
    assert.equal(restored!.observations!.find(o => o.stepId === read.attribution.planStepId)!.testResult, "PASS");
    assert.equal((await h.request("poll")).execution, null);
    assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED").length, 1);
    const report = [...h.tables.conversationMessage.values()].find(m => m.metadata?.planExecutionReport);
    assert.equal(report.metadata.outcome, "COMPLETED"); assert.match(report.content, /Verification: PASS/);
    assert.match(report.metadata.diff, /--- a\/index.html/);
    assert.equal(report.metadata.diff, h.p.changes.map(c => exactChangeDiff(c.path, c.before, c.after)).join("\n\n"));
    assert.deepEqual(h.tables.agentPlan.get(original.id), original);
  });
}

test("rejected human decision blocks permits and runtime dispatch", async () => {
  const h = await setup("ACTION"), base = h.approvalBody;
  const pending = await h.approvals.request("conversation-a", h.p.proposalId, h.claims, base);
  await h.approvals.decide("conversation-a", h.p.proposalId, h.claims, { ...base, approvalId: pending.approvalId,
    fingerprint: pending.binding.fingerprint, decision: "DENIED" });
  await assert.rejects(h.approve());
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal((await h.request("poll")).execution, null);
});

test("revoked selected task consent never falls back to ordinary approval", async () => {
  const h = await setup("TASK"); await h.revoke(); await assert.rejects(h.approve(), /TASK_CONSENT_REVOKED/);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.agentRunId === h.f.run.id).length, 0);
});

test("mismatched plan digest and cross-conversation context cannot authorize", async () => {
  const h = await setup("ACTION"); h.body.planDigest = "a".repeat(64); await assert.rejects(h.approve(), /PLAN_SOURCE_CHANGED/);
  await assert.rejects(approvePlanWorkflow(h.services, "other-conversation", h.claims, h.body));
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
});

test("chat PLAN_READY text cannot override an authoritative NOT_READY revision", async () => {
  const h = await setup("ACTION"); h.tables.agentPlan.get(h.p.planId).status = "PLAN_NOT_READY";
  await h.db.conversationMessage.create({ data: { id: "fake-ready", conversationId: "conversation-a", senderId: "agent",
    senderType: "assistant", content: "PLAN_READY. This plan is approved and ready to execute." } });
  await assert.rejects(h.approve(), /PLAN_READY_REQUIRED/);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal((await h.request("poll")).execution, null);
});

test("concurrent explicit approval requests reserve one execution and one runtime action", async () => {
  const h = await setup("TASK");
  const results = await Promise.allSettled([h.approve(), h.approve()]);
  assert.ok(results.some(r => r.status === "fulfilled"));
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED").length, 1);
  assert.ok(await executionRecord(h.db, h.f.run.id));
  h.body.mode = "ACTION";
  await assert.rejects(h.approve(), /WORKFLOW_APPROVAL_REPLAY_CONFLICT/);
});

test("out-of-plan input cannot use delegated consent; terminal/PowerShell/CMD/external effects remain explicit", async () => {
  const h = await setup("TASK");
  for (const tool of ["filesystem.delete", "terminal.execute", "powershell.execute", "cmd.execute", "browser.open", "unknown"]) {
    assert.equal(await h.policies.matchTx(h.db, { ...h.p, actions: [{ ...h.p.actions[0], tool }] } as any), undefined);
  }
  await assert.rejects(h.policies.checkTx(h.db, h.ref, h.p, { ...h.p.actions[0], input: { ...h.p.actions[0].input, content: "outside approved plan" } }), /TASK_CONSENT_ACTION_DENIED/);
});

test("runtime failure remains a durable failure and cannot yield success or retry", async () => {
  const h = await setup("TASK"); await h.approve();
  const write = (await h.request("poll")).execution;
  const now = new Date().toISOString();
  await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest });
  await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "FAILED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 1, stdout: "", stderr: "failed", error: "PREIMAGE_MISMATCH",
    truncated: false, result: {}, verificationState: "FAILED", verificationResult: {} });
  assert.equal((await h.approve())?.status, "FAILED"); assert.equal((await h.request("poll")).execution, null);
  const reports = [...h.tables.conversationMessage.values()].filter(m => m.metadata?.planExecutionReport);
  assert.equal(reports.length, 1); assert.equal(reports[0].metadata.outcome, "FAILED"); assert.doesNotMatch(reports[0].content, /Verification: PASS/);
});

test("successful write plus mismatched read-back cannot report verified completion", async () => {
  const h = await setup("TASK"); await h.approve();
  const write = (await h.request("poll")).execution;
  const content = String(write.attribution.validatedInput.content), now = new Date().toISOString();
  await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest });
  await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "written", stderr: "", error: null,
    truncated: false, result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) },
    verificationState: "VERIFIED", verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") } });
  const read = (await h.request("poll")).execution; await h.complete(read, "unexpected source");
  const view = await h.approve(); assert.equal(view?.status, "FAILED"); assert.equal(view?.reason, "READ_BACK_MISMATCH");
  assert.equal(view!.failureDiagnostics![0].status, "UNCERTAIN");
  assert.equal(view!.failureDiagnostics![0].fixProposal, undefined);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal((await executionRecord(h.db, h.f.run.id))!.payload.completed.change.receiptId, write.attribution.executionId);
});

test("grounded unchanged read-back persists a fix proposal; reload/replay cannot dispatch repair", async () => {
  const h = await setup("TASK"); await h.approve();
  const write = (await h.request("poll")).execution;
  const content = String(write.attribution.validatedInput.content), now = new Date().toISOString();
  await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest });
  await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "written", stderr: "", error: null,
    truncated: false, result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) },
    verificationState: "VERIFIED", verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") } });
  const state = (await executionRecord(h.db, h.f.run.id))!.payload;
  const change = state.actions.find(a => a.change)!.change!;
  const read = (await h.request("poll")).execution;
  await h.complete(read, content.replace(change.after, change.before));
  const view = await h.executor.view(h.f.run.id, h.claims);
  assert.equal(view!.status, "FAILED");
  assert.equal(view!.failureDiagnostics![0].status, "GROUNDED");
  assert.equal(view!.failureDiagnostics![0].fixProposal!.executionEnabled, false);
  const beforeReplay = await executionRecord(h.db, h.f.run.id);
  const r = await h.ledger.read<any>(h.db, "RUNTIME_EXECUTION", read.attribution.executionIntentId);
  await h.ledger.transaction(tx => h.executor.recordReceiptTx(tx, h.f.run.id, read.attribution, r!.payload));
  await h.executor.advancePending();
  assert.deepEqual((await h.executor.view(h.f.run.id, h.claims))!.failureDiagnostics, view!.failureDiagnostics);
  assert.equal((await executionRecord(h.db, h.f.run.id))!.revision, beforeReplay!.revision);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.eventType === "EXECUTION_FAILURE_DIAGNOSED").length, 1);
});

for (const fromChild of [false, true]) test(`transferred repair source from ${fromChild ? "child B after repair 1" : "parent A"} resolves the same server lineage`, async () => {
  const h = await setup("TASK"), issued = await h.issue();
  const change = h.p.actions.find(a => a.change)!.change!;
  const sourceRunId = fromChild ? h.f.run.id : "failed-other-conversation-run";
  const sourcePlanId = fromChild ? "failed-child-repair-plan" : "other-root-plan";
  const priorAttempts = fromChild ? 1 : 0;
  await h.ledger.create(h.db, "PLAN_EXECUTION", sourceRunId, {
    ...(fromChild ? { repair: { version: 1, rootPlanId: "other-root-plan", attempt: 1, limit: 2 } } : {}),
    requestId: "source-request", lineageId: "source-lineage", rootPlanId: "other-root-plan",
    version: 1, runId: sourceRunId, conversationId: fromChild ? "conversation-a" : "other-conversation", planId: sourcePlanId, status: "FAILED",
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.f.run.projectId,
    workspace: h.f.fresh.binding, failureRecordedAt: new Date(0).toISOString(), exactPermit: { permitId: "consumed-source-permit" },
    executionSource: { digest: "old-source", references: ["runtime:old-source"] },
    failureDiagnostics: { failure: { id: "source-diagnostic", status: "GROUNDED", evidenceRefs: ["runtime:failed-read"],
      scope: { path: "index.html" }, fixProposal: { id: "source-fix", before: change.before, after: change.after } } }
  }, { immutable: false });
  await h.ledger.create(h.db, "EXECUTION_LINEAGE", "source-lineage", {
    version: 1, id: "source-lineage", userId: h.claims.sub, organizationId: h.claims.organizationId,
    projectId: h.f.run.projectId, rootPlanId: "other-root-plan", attempts: priorAttempts, limit: 2,
    runId: sourceRunId, planId: sourcePlanId, requestId: "source-request", terminal: false
  }, { immutable: false });
  const body = { ...issued.executionBody, repairSourceRunId: sourceRunId };
  // The original transfer parent stays A even when the next failed source is B.
  const conversation = await h.db.conversation.findUnique({ where: { id: "conversation-a" } });
  const binding = h.f.fresh.binding;
  const context = { version: 1, mode: "AGENT", organizationId: h.claims.organizationId, workspace: {
    workspaceId: binding.workspaceId, bindingVersion: binding.version,
    runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint } };
  await h.db.conversation.create({ data: { ...conversation, id: "other-conversation", metadata: { modeContext: context } } });
  await h.db.conversationMessage.create({ data: { id: "repair-transfer-message", conversationId: "other-conversation",
    senderId: h.claims.sub, senderType: "user", content: "Continue the failed repair",
    metadata: { agentConversationId: "conversation-a" } } });
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: {
    ...conversation.metadata, modeContext: { ...context, mode: "AGENT", source: { conversationId: "other-conversation",
      messageId: "repair-transfer-message", contextMessageIds: [], evidence: [] } }
  } } });
  await assert.rejects(h.executor.executeExactProposal("conversation-a", h.p.proposalId, h.claims, { ...body, repairAttempts: 0 }), /EXACT_EXECUTION_REQUEST_INVALID/);
  await assert.rejects(h.executor.executeExactProposal("conversation-a", h.p.proposalId, h.claims,
    { ...body, repairSourceRunId: "missing-run" }), /REPAIR_LINEAGE_SCOPE_CHANGED/);
  await h.executor.executeExactProposal("conversation-a", h.p.proposalId, h.claims, body);
  const first = (await executionRecord(h.db, h.f.run.id))!;
  assert.equal(first.payload.repair!.attempt, priorAttempts + 1); assert.equal(first.payload.rootPlanId, "other-root-plan");
  assert.equal(first.payload.exactPermit!.binding.approvalId, issued.approval.approvalId);
  await h.executor.executeExactProposal("conversation-a", h.p.proposalId, h.claims, body);
  assert.equal((await executionRecord(h.db, h.f.run.id))!.revision, first.revision);
  const root = await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", first.payload.lineageId);
  assert.equal(root!.payload.attempts, priorAttempts + 1);
  const pin = await h.ledger.read<any>(h.db, "REPAIR_CONTINUATION", [h.claims.sub, "conversation-a", h.p.planId]);
  assert.equal(pin!.immutable, true); assert.equal(pin!.revision, 1);
  assert.equal(pin!.payload.rootExecutionLineageId, "source-lineage");
  assert.equal(pin!.payload.sourceExecutionRevision, 1);
});

test("transferred child with completed repair can admit an independent plan without consuming the old root budget", async () => {
  const h = await setup("TASK"), binding = h.f.fresh.binding;
  const conversation = await h.db.conversation.findUnique({ where: { id: "conversation-a" } });
  const context = { version: 1, mode: "AGENT", organizationId: h.claims.organizationId, workspace: {
    workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId,
    runtimeFingerprint: binding.runtimeFingerprint } };
  await h.db.conversation.create({ data: { ...conversation, id: "parent-A", metadata: { modeContext: context } } });
  await h.db.conversationMessage.create({ data: { id: "independent-transfer", conversationId: "parent-A", senderId: h.claims.sub,
    senderType: "user", content: "Context transfer", metadata: { agentConversationId: "conversation-a" } } });
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: { ...conversation.metadata,
    modeContext: { ...context, source: { conversationId: "parent-A", messageId: "independent-transfer", contextMessageIds: [], evidence: [] } } } } });
  await h.ledger.create(h.db, "PLAN_EXECUTION", h.f.run.id, {
    version: 1, runId: h.f.run.id, conversationId: "conversation-a", planId: "completed-repair", requestId: "completed-request",
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.f.run.projectId,
    workspace: binding, status: "COMPLETED", lineageId: "completed-root", rootPlanId: "old-root-plan",
    repair: { version: 1, rootPlanId: "old-root-plan", attempt: 2, limit: 2 }
  }, { immutable: false });
  const oldRoot = await h.ledger.create(h.db, "EXECUTION_LINEAGE", "completed-root", {
    version: 1, id: "completed-root", userId: h.claims.sub, organizationId: h.claims.organizationId,
    projectId: h.f.run.projectId, rootPlanId: "old-root-plan", attempts: 2, limit: 2,
    runId: h.f.run.id, planId: "completed-repair", requestId: "completed-request", terminal: true
  }, { immutable: false });
  assert.equal((await h.approve())?.status, "RUNNING");
  const first = (await executionRecord(h.db, h.f.run.id))!;
  assert.notEqual(first.payload.lineageId, "completed-root"); assert.equal(first.payload.repair, undefined);
  assert.equal(await h.ledger.read(h.db, "REPAIR_CONTINUATION", [h.claims.sub, "conversation-a", h.p.planId]), null);
  const newRoot = await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", first.payload.lineageId);
  assert.equal(newRoot!.payload.attempts, 0);
  await h.approve();
  assert.equal((await executionRecord(h.db, h.f.run.id))!.revision, first.revision);
  assert.deepEqual(await h.ledger.read(h.db, "EXECUTION_LINEAGE", "completed-root"), oldRoot);
  assert.deepEqual(await h.ledger.read(h.db, "EXECUTION_LINEAGE", first.payload.lineageId), newRoot);
});

test("actual local repair with missing lineage cannot become an independent root or consume its permit", async () => {
  const h = await setup("TASK"), issued = await h.issue();
  await h.ledger.create(h.db, "PLAN_EXECUTION", h.f.run.id, {
    version: 1, runId: h.f.run.id, conversationId: "conversation-a", planId: "failed-plan", status: "FAILED",
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.f.run.projectId,
    workspace: h.f.fresh.binding
  }, { immutable: false });
  await assert.rejects(issued.execute(), /REPAIR_LINEAGE_REQUIRED/);
  assert.equal(await h.ledger.read(h.db, "REPAIR_CONTINUATION", [h.claims.sub, "conversation-a", h.p.planId]), null);
  assert.equal(await h.ledger.read(h.db, "EXACT_PERMIT_CONSUMPTION", issued.permit.permitId), null);
});

test("نفّذ الخطة selects latest persisted READY within this conversation and asks for explicit controls", () => {
  const context: ConversationWorkflowSummary = { activeInspections: [], certifiedUnderstanding: null, latestPlan: null,
    execution: null, pendingApprovals: [], workspace: null, eligiblePlans: [
      { runId: "run", planId: "v1", planVersion: 1, digest: "old" }, { runId: "run", planId: "v2", planVersion: 2, digest: "new" }
    ] };
  const result = resolveConversationIntent("نفّذ الخطة", context);
  assert.equal(result.route, "APPROVAL_GUIDANCE"); assert.equal(result.target?.planId, "v2");
  assert.equal(resolveConversationIntent("نفّذ الخطة", { ...context, eligiblePlans: [] }).route, "UNAVAILABLE");
  assert.equal(resolveConversationIntent("نفّذ الخطة", { ...context, eligiblePlans: [...context.eligiblePlans!, { runId: "other", planId: "x", planVersion: 1, digest: "x" }] }).route, "AMBIGUOUS");
});

test("exact diff retains whitespace and reports only changed lines", () => {
  assert.equal(exactChangeDiff("index.html", "<h1>old</h1>\r\nuntouched", "<h1>new</h1>\r\nuntouched"),
    "--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<h1>old</h1>\r\n+<h1>new</h1>\r");
  assert.equal(exactChangeDiff("x", "same", "same"), "");
});

test("conversation execution UI is explicit, bounded and never auto-dispatches from a snapshot", () => {
  const source = readFileSync("../components/chat/plan-execution-approval.tsx", "utf8");
  assert.match(source, /"Approve for Me"/); assert.match(source, /"Approve"/);
  assert.match(source, /onClick=.*approve\(approvalMode === "TASK" \? "TASK" : "ACTION"\)/); assert.match(source, /disabled \|\| lock.current/);
  assert.match(source, /current.current === key/); assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /New or high-impact actions require fresh approval/);
});
