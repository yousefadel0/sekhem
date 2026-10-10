import assert from "node:assert/strict";
import { test } from "node:test";
import { executionFixture } from "./agent-plan-execution.test";
import { ExactProposalApprovalService } from "../src/agent-runtime/execution/exact-proposal-approval.service";
import { ExactProposalPermitService } from "../src/agent-runtime/execution/exact-proposal-permit.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { executionRecord, exactExecutionReservationTx } from "../src/agent-runtime/execution/plan-execution-state";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";

async function fixture() {
  const h = await executionFixture(true);
  const planned = await h.post("Create a plan", "permit-backed-plan");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === planned.agentRunId)!;
  const proposal = await h.exactProposals.prepare("conversation-a", h.claims, {
    planId: plan.id, planVersion: plan.version, planDigest: plan.steps[0].parameters.engineeringPlan.digest, requestId: "exact-proposal"
  });
  const resources = new ResourceAuthorizationService(h.db);
  const approvals = new ExactProposalApprovalService(h.ledger, h.service, h.evidence, h.identity, resources,
    { recordWithClaimsTx: async () => {} } as any);
  const approvalBody = { planId: plan.id, proposalVersion: proposal.version, proposalDigest: proposal.digest };
  const approval = await approvals.request("conversation-a", proposal.proposalId, h.claims, { ...approvalBody, requestId: "approval" });
  await approvals.decide("conversation-a", proposal.proposalId, h.claims, {
    ...approvalBody, approvalId: approval.approvalId, fingerprint: approval.binding.fingerprint, decision: "APPROVED"
  });
  const permits = new ExactProposalPermitService(h.ledger, approvals, h.evidence, h.identity, resources);
  (h.planExecution as any).exactPermits = permits;
  const permitBody = { ...approvalBody, approvalId: approval.approvalId, requestId: "permit-request" };
  const permit = await permits.issue("conversation-a", proposal.proposalId, h.claims, permitBody);
  const body = { ...approvalBody, approvalId: approval.approvalId, permitId: permit.permitId,
    permitGeneration: permit.generation, permitRequestId: permit.requestId, requestId: "execution-request" };
  const execute = () => h.planExecution.executeExactProposal("conversation-a", proposal.proposalId, h.claims, body);
  return { ...h, planned, plan, proposal, approval, permits, permitBody, permit, body, execute };
}

test("production entry atomically links one reservation and execution; replay cannot dispatch twice", async () => {
  const f = await fixture();
  const result = await f.execute();
  assert.equal(result.metadata.status, "AWAITING_APPROVAL", result.metadata.reason); // Existing runtime tool gate remains authoritative.
  const record = (await executionRecord(f.db, f.planned.agentRunId))!;
  const state = record.payload;
  assert.equal(state.exactPermit!.permitId, f.permit.permitId);
  assert.equal(state.exactPermit!.binding.approvalId, f.approval.approvalId);
  assert.equal(await exactExecutionReservationTx(f.db, state), true);
  const reservation = await f.ledger.read<any>(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId);
  assert.equal(reservation!.payload.executionIntentId, state.requestId);
  assert.equal((await f.execute()).conversationId, result.conversationId);
  assert.deepEqual((await executionRecord(f.db, f.planned.agentRunId))!.payload, state);
  await assert.rejects(f.ledger.transaction(tx => f.permits.consumeTx(tx, "conversation-a", f.proposal.proposalId, f.claims, f.permitBody, "second")), /EXACT_PERMIT_CONSUMED/);
  assert.equal((await f.request("poll")).execution, null);
  assert.deepEqual(state.completed, {});
  assert.equal([...f.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED").length, 1);
  assert.equal((await f.ledger.read<any>(f.db, "RUNTIME_PROPOSAL", f.planned.agentRunId))!.payload.grantVersion, f.permit.binding.grantVersion);
});

for (const change of ["expiry", "grant", "source", "workspace", "plan", "proposal", "runtime", "generation", "capability", "session"]) {
  test(`changed ${change} rejects before execution reservation or runtime operation`, async () => {
    const f = await fixture();
    if (change === "expiry") {
      const row = [...f.tables.auditEvent.values()].find(r => r.metadata?.payload?.permitId === f.permit.permitId && r.metadata?.payload?.kind === "EXACT_EXECUTION_PERMIT")!;
      const p = row.metadata.payload; p.expiresAt = new Date(Date.now() - 1).toISOString(); const { digest, ...base } = p; p.digest = toolDigest(base);
    }
    if (change === "grant" || change === "capability") await f.identity.grant(f.claims, f.device.runtimeId, "project-a",
      change === "grant" ? ["filesystem.list", "filesystem.read", "filesystem.search", "filesystem.write"] : ["filesystem.read"]);
    if (change === "source" || change === "workspace") {
      const original = f.service.certifiedPlanningSourceTx.bind(f.service);
      f.service.certifiedPlanningSourceTx = async (...args: any[]) => { const s = await (original as any)(...args);
        if (change === "source") s.digest = "changed"; else s.binding.version++; return s; };
    }
    if (change === "plan") f.tables.agentPlan.get(f.plan.id).version++;
    if (change === "proposal") f.body.proposalDigest = "a".repeat(64);
    if (change === "runtime") await f.request("connect", { workspaceReadProtocol: 1, conditionalWriteProtocol: 1 });
    if (change === "generation") f.body.permitGeneration++;
    if (change === "session") f.claims.iat++;
    await assert.rejects(f.execute());
    assert.equal(await executionRecord(f.db, f.planned.agentRunId), null);
    assert.equal(await f.ledger.read(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId), null);
    assert.equal(await f.ledger.read(f.db, "RUNTIME_PROPOSAL", f.planned.agentRunId), null);
    assert.equal((await f.request("poll")).execution, null);
  });
}

test("concurrent production consumption has one winner under the existing transactional lock", async () => {
  const f = await fixture();
  const second = { ...f.body, requestId: "other-execution" };
  // Same execution request replay is harmless; a second intent cannot reserve the permit.
  const results = await Promise.allSettled([f.execute(), f.planExecution.executeExactProposal("conversation-a", f.proposal.proposalId, f.claims, second)]);
  const consumption = await f.ledger.read<any>(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId);
  assert.ok(consumption?.immutable);
  assert.equal([...f.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED").length, 1);
  assert.equal(results.filter(r => r.status === "fulfilled").length >= 1, true);
  assert.equal((await f.request("poll")).execution, null);
});

test("immutable reservation is required for receipt linkage; fabricated presentation cannot authorize", async () => {
  const f = await fixture(); await f.execute();
  const s = (await executionRecord(f.db, f.planned.agentRunId))!.payload;
  assert.equal(await exactExecutionReservationTx(f.db, { ...s, exactPermit: { ...s.exactPermit!, digest: "fake" } }), false);
  assert.equal(await exactExecutionReservationTx(f.db, { ...s, exactPermit: undefined }), false);
  assert.equal(await f.ledger.read(f.db, "RUNTIME_RECEIPT", f.planned.agentRunId), null);
});


test("signed fixture runtime receipt retains the proposal approval permit consumption execution chain", async () => {
  const f = await fixture(), response = await f.execute();
  await f.control.approve(f.claims, f.planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  const write = (await f.request("poll")).execution;
  assert.equal(write.attribution.tool, "filesystem.write");
  assert.equal(write.attribution.grantVersion, f.permit.binding.grantVersion);
  const content = String(write.attribution.validatedInput.content);
  const now = new Date().toISOString();
  assert.equal((await f.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })).execute, true);
  const { createHash } = await import("node:crypto");
  await f.request("result", {
    executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0,
    stdout: "written", stderr: "", error: null, truncated: false,
    result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) },
    verificationState: "VERIFIED", verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") }
  });
  const s = (await executionRecord(f.db, f.planned.agentRunId))!.payload;
  assert.equal(s.completed.change.receiptId, write.attribution.executionId);
  assert.equal(s.exactPermit!.binding.approvalId, f.approval.approvalId);
  assert.equal(await exactExecutionReservationTx(f.db, s), true);
  const completed = [...f.tables.agentRunEvent.values()].find(e => e.eventType === "STEP_COMPLETED" && e.payload.receiptId === write.attribution.executionId);
  assert.equal(completed.payload.exactPermit.permitId, f.permit.permitId);
  const next = (await f.request("poll")).execution;
  assert.equal(next.attribution.tool, "filesystem.read");
  await f.complete(next, content);
  assert.equal((await executionRecord(f.db, f.planned.agentRunId))!.payload.status, "COMPLETED");
  assert.equal((await f.request("poll")).execution, null);
  await f.execute();
  assert.equal((await f.request("poll")).execution, null);
});

test("reservation rolls back atomically when execution-intent persistence fails", async () => {
  const f = await fixture();
  const original = f.db.agentRunEvent.create;
  f.db.agentRunEvent.create = async (input: any) => {
    if (input.data.eventType === "PLAN_EXECUTION_REQUESTED") throw new Error("PERSISTENCE_FAILURE");
    return original(input);
  };
  await assert.rejects(f.execute(), /PERSISTENCE_FAILURE/);
  assert.equal(await f.ledger.read(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId), null);
  assert.equal(await executionRecord(f.db, f.planned.agentRunId), null);
  assert.equal(await f.ledger.read(f.db, "RUNTIME_PROPOSAL", f.planned.agentRunId), null);
});

test("captured grant revision remains mandatory between reservation and dispatch", async () => {
  const f = await fixture(), response = await f.execute();
  await f.identity.grant(f.claims, f.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search", "filesystem.write"]);
  await assert.rejects(f.control.approve(f.claims, f.planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED"), /RUNTIME_GRANT_INVALID/);
  assert.equal((await f.request("poll")).execution, null);
});

test("read-back recovery keeps the consumed isolated permit immutable while revalidating current read authority", async () => {
  const f = await fixture(), response = await f.execute();
  await f.control.approve(f.claims, f.planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  const write = (await f.request("poll")).execution;
  await f.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest });
  await f.db.userSession.update({ where: { id: f.claims.sessionId }, data: { revokedAt: new Date() } });
  const now = new Date().toISOString(), content = String(write.attribution.validatedInput.content);
  const { createHash } = await import("node:crypto");
  await f.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "", stderr: "", error: null, truncated: false,
    result: {}, verificationState: "VERIFIED", verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") } });
  const before = (await executionRecord(f.db, f.planned.agentRunId))!.payload;
  assert.equal(before.status, "BLOCKED");
  const consumption = await f.ledger.read(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId);
  const claims = { ...f.claims, sessionId: "verification-new-session" };
  await f.db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, expiresAt: new Date(claims.exp * 1000), revokedAt: null } });
  await f.identity.grant(claims, f.device.runtimeId, "project-a", ["filesystem.read", "filesystem.list", "filesystem.search"]);
  const grant = await f.identity.activeGrant(f.db, f.device.runtimeId, "project-a");
  await f.control.workspaceReadConsent(claims, f.binding, { expectedGrantVersion: grant.version, durationMinutes: 60 });
  await f.planExecution.recoverVerification("conversation-a", f.planned.agentRunId, claims, "readback-recover");
  assert.deepEqual((await executionRecord(f.db, f.planned.agentRunId))!.payload.exactPermit, before.exactPermit);
  assert.deepEqual(await f.ledger.read(f.db, "EXACT_PERMIT_CONSUMPTION", f.permit.permitId), consumption);
  const read = (await f.request("poll")).execution;
  assert.equal(read.attribution.tool, "filesystem.read");
  await f.complete(read, content);
  assert.equal((await executionRecord(f.db, f.planned.agentRunId))!.payload.status, "COMPLETED");
  assert.equal((await f.request("poll")).execution, null);
});
