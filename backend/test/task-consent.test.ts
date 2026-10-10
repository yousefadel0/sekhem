import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as heroFixture } from "./exact-proposal-stage.test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { TaskConsentService } from "../src/agent-runtime/tools/task-consent.service";
import { ExactProposalService } from "../src/agent-runtime/execution/exact-proposal.service";
import { ExactProposalApprovalService } from "../src/agent-runtime/execution/exact-proposal-approval.service";
import { ExactProposalPermitService } from "../src/agent-runtime/execution/exact-proposal-permit.service";
import { AgentPlanExecutionService } from "../src/agent-runtime/execution/agent-plan-execution.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { executionRecord } from "../src/agent-runtime/execution/plan-execution-state";
import { RUNTIME_TOOLS } from "../src/trusted-runtime/runtime.contract";
import { createHash } from "node:crypto";

// Fixture evidence/model output only; the production consent, authorization,
// permit, execution reservation and signed protocol gates are unmodified.
export async function fixture(durationSeconds = 300, scope: "TASK" | "SESSION" = "TASK", skipConsent = false) {
  const h = await inspectionHarness(), f = heroFixture();
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", [...RUNTIME_TOOLS]);
  const grant = await h.identity.activeGrant(h.db, h.device.runtimeId, "project-a");
  await h.control.workspaceReadConsent(h.claims, h.binding, { expectedGrantVersion: grant.version, durationMinutes: 60 });
  const workspace = { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version,
    runtimeId: h.device.runtimeId, runtimeFingerprint: h.binding.runtimeFingerprint };
  Object.assign(f.fresh, { conversation: { projectId: "project-a" }, sourceConversationId: "conversation-a", binding: { ...h.binding } });
  const identity = f.plan.steps[0].parameters.engineeringPlan;
  Object.assign(identity, { workspace, sourceConversationId: "conversation-a" });
  f.result.version = 1; f.result.understanding.readiness = "UNDERSTANDING_READY";
  // Represent an admitted PLAN_READY fixture: its source-backed Hero contract
  // already carries the exact change, without an unresolved duplicate request.
  f.result.plan.constraints = f.result.plan.constraints.filter((c: any) => c.rule !== "UNRESOLVED");
  for (const s of f.result.plan.steps) Object.assign(s, { status: "PLANNED", purpose: "PROPOSE_CHANGE",
    objective: s.objective ?? "Review the heading", verificationRequired: true, verification: { status: "PENDING", description: "Compare exact heading and preserve other bytes" } });
  Object.assign(f.plan.steps[0], { planningOnly: true, skillId: "", name: "Plan" });
  const { digest: _, ...base } = identity;
  identity.digest = toolDigest({ ...base, summary: f.plan.summary, result: f.result });
  Object.assign(f.run, { id: `planning_run_${toolDigest([h.claims.sub, "conversation-a"])}`, userId: h.claims.sub, projectId: "project-a", conversationId: "conversation-a", status: "COMPLETED", outcome: "PLAN_READY" });
  f.plan.agentRunId = f.run.id;
  await h.db.agentRun.create({ data: f.run }); await h.db.agentPlan.create({ data: f.plan });
  const inspections: any = { certifiedPlanningSourceTx: async () => f.fresh };
  const evidence: any = (f.service as any).evidence;
  const proposals = new ExactProposalService(h.ledger, inspections, f.gateway, evidence);
  const p = await proposals.prepare("conversation-a", h.claims, { ...f.body, planDigest: identity.digest });
  const resources = new ResourceAuthorizationService(h.db);
  const approvals = new ExactProposalApprovalService(h.ledger, inspections, evidence, h.identity, resources, { recordWithClaimsTx: async () => {} } as any);
  const policies = new TaskConsentService(h.ledger, h.identity, resources);
  const approvalBody = { planId: p.planId, proposalVersion: p.version, proposalDigest: p.digest };
  const body = { ...approvalBody, requestId: "task-consent-request", durationSeconds };
  const create = () => approvals.taskConsent("conversation-a", p.proposalId, h.claims, body, scope);
  const ref = skipConsent ? undefined! : await create();
  const approve = () => approvals.requestTaskApproval("conversation-a", p.proposalId, h.claims, { ...approvalBody, requestId: "task-approval", ...(scope === "SESSION" ? { consent: ref } : {}) });
  const permits = new ExactProposalPermitService(h.ledger, approvals, evidence, h.identity, resources);
  const executor = new AgentPlanExecutionService(h.db, h.ledger, h.identity, h.control, (h.control as any).authorization,
    (h.control as any).approvals, h.registry, inspections, h.contexts, h.executions, f.gateway, evidence, permits);
  (h.executions as any).planExecution = executor;
  const match = () => h.ledger.transaction(tx => scope === "SESSION" ? policies.selectTx(tx, p, h.claims, ref) : policies.matchTx(tx, p));
  const revoke = () => approvals.readTaskConsent("conversation-a", ref.policyId, h.claims, true);
  const issue = async () => {
    const approval = await approve();
    const permitBody = { ...approvalBody, approvalId: approval.approvalId, requestId: "task-permit" };
    const permit = await permits.issue("conversation-a", p.proposalId, h.claims, permitBody);
    const executionBody = { ...approvalBody, approvalId: approval.approvalId, permitId: permit.permitId,
      permitGeneration: permit.generation, permitRequestId: permit.requestId, requestId: "task-execution" };
    return { approval, permit, permitBody, executionBody, execute: () => executor.executeExactProposal("conversation-a", p.proposalId, h.claims, executionBody) };
  };
  return { ...h, f, p, policies, approvals, permits, executor, body, approvalBody, ref, create, approve, match, revoke, issue };
}

test("task consent is immutable, bounded, uniquely matched, replayable and reload-readable without downstream side effects", async () => {
  const h = await fixture();
  assert.deepEqual(await h.match(), h.ref); assert.deepEqual(await h.create(), h.ref);
  const record = await h.ledger.read<any>(h.db, "TASK_CONSENT", h.ref.policyId);
  assert.equal(record!.immutable, true); assert.equal(record!.payload.executionEnabled, false);
  assert.equal(record!.payload.actions.length, 2); assert.equal(record!.payload.planDigest, h.p.planDigest);
  assert.equal((await h.approvals.readTaskConsent("conversation-a", h.ref.policyId, h.claims)).status, "ACTIVE");
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.agentRunId === h.f.run.id).length, 0);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "EXACT_PERMIT_HEAD", [h.claims.sub, "conversation-a", h.p.proposalId]), null);
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", h.f.run.id), null);
  await assert.rejects(h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "another" }), /TASK_CONSENT_ALREADY_EXISTS/);
  await assert.rejects(h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, durationSeconds: 901 }), /TASK_CONSENT_REQUEST_INVALID/);
  await assert.rejects(h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, scope: "ALL" }), /TASK_CONSENT_REQUEST_INVALID/);
});

for (const field of ["userId", "organizationId", "projectId", "conversationId", "planId", "planVersion", "planDigest", "sourceDigest", "workspace"]) {
  test(`task consent rejects changed ${field}`, async () => {
    const h = await fixture(), context = { ...h.p, [field]: field === "workspace" ? { ...h.p.workspace, bindingVersion: 999 } : "changed" };
    await assert.rejects(h.ledger.transaction(tx => h.policies.checkTx(tx, h.ref, context)), /TASK_CONSENT_SCOPE_CHANGED/);
  });
}

test("unknown policy and ambiguous duplicate actions fail closed", async () => {
  const h = await fixture();
  await assert.rejects(h.ledger.transaction(tx => h.policies.checkTx(tx, { ...h.ref, policyId: "unknown" }, h.p)), /TASK_CONSENT_CHANGED/);
  await assert.rejects(h.ledger.transaction(tx => h.policies.matchTx(tx, { ...h.p, actions: [h.p.actions[0], h.p.actions[0]] })), /TASK_CONSENT_AMBIGUOUS_ACTIONS/);
  await assert.rejects(h.ledger.transaction(tx => h.policies.matchTx(tx, { ...h.p, actions: [] })), /TASK_CONSENT_AMBIGUOUS_ACTIONS/);
  await h.revoke();
  await assert.rejects(h.ledger.transaction(tx => h.policies.createTx(tx, h.claims,
    { ...h.p, actions: [h.p.actions[0], h.p.actions[0]] }, h.f.plan, h.binding.rootPath, "duplicate", 60)), /TASK_CONSENT_AMBIGUOUS_ACTIONS/);
});

test("policy cannot expand exact input or capabilities; critical and unknown tools are never covered", async () => {
  const h = await fixture();
  await assert.rejects(h.ledger.transaction(tx => h.policies.checkTx(tx, h.ref, h.p,
    { ...h.p.actions[0], input: { ...h.p.actions[0].input, content: "other" } })), /TASK_CONSENT_ACTION_DENIED/);
  for (const tool of ["filesystem.delete", "terminal.execute", "browser.open", "git.write", "package.install", "unknown"]) {
    assert.equal(await h.ledger.transaction(tx => h.policies.matchTx(tx, { ...h.p, actions: [{ ...h.p.actions[0], tool }] })), undefined);
  }
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.read"]);
  await assert.rejects(h.match(), /TASK_CONSENT_CAPABILITY_DENIED/);
});

test("only source-validated text writes are eligible; ordinary or security-sensitive writes remain explicit", async () => {
  const h = await fixture(), plan = structuredClone(h.f.plan);
  plan.steps[0].parameters.planning.plan.constraints = [];
  assert.equal((h.policies as any).eligible(h.p.actions[0], plan, h.binding.rootPath), false);
  assert.equal((h.policies as any).eligible({ ...h.p.actions[0], relativePath: "security.html" }, h.f.plan, h.binding.rootPath), false);
  assert.equal((h.policies as any).eligible({ ...h.p.actions[0], input: { ...h.p.actions[0].input, content: "<script>other</script>" } }, h.f.plan, h.binding.rootPath), false);
});

test("current grant revocation and runtime identity revocation still block consent matching", async () => {
  const h = await fixture(); await h.identity.revokeGrant(h.claims, h.device.runtimeId, "project-a");
  await assert.rejects(h.match(), /RUNTIME_GRANT_INVALID/);
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", [...RUNTIME_TOOLS]);
  await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED");
  await assert.rejects(h.match(), /RUNTIME_GRANT_IDENTITY_INVALID/);
});

test("task-derived approval replay retains policy provenance and creates no permit or execution", async () => {
  const h = await fixture(), a = await h.approve(), b = await h.approve();
  assert.equal(a.status, "APPROVED"); assert.equal(a.approvalId, b.approvalId);
  assert.deepEqual((a.binding as any).taskConsent, h.ref);
  assert.deepEqual((h.tables.agentApproval.get(a.approvalId).revisedPlan as any).taskConsent, h.ref);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", h.f.run.id), null);
  assert.equal((await h.request("poll")).execution, null);
});

test("revocation is idempotent, preserves immutable generation and blocks approval admission", async () => {
  const h = await fixture(), before = await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId);
  assert.deepEqual(await h.revoke(), await h.revoke());
  assert.deepEqual(await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId), before);
  await assert.rejects(h.approve(), /TASK_CONSENT_REVOKED/);
  assert.equal((await h.approvals.readTaskConsent("conversation-a", h.ref.policyId, h.claims)).status, "REVOKED");
});

test("current reviewer authorization loss blocks delegated consent", async () => {
  const h = await fixture(); h.tables.user.get(h.claims.sub).roles = [{ role: { key: "Viewer" } }];
  await assert.rejects(h.match());
});

test("new explicit consent generation retains old policy and approval provenance", async () => {
  const h = await fixture(), first = await h.approve();
  const oldPolicy = await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId);
  const oldApproval = structuredClone(h.tables.agentApproval.get(first.approvalId));
  await h.revoke();
  const next = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "renew-consent" });
  assert.equal(next.generation, 2); assert.notEqual(next.policyId, h.ref.policyId);
  const a = await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "renew-approval" });
  assert.equal(a.generation, 2); assert.equal(a.status, "APPROVED"); assert.deepEqual((a.binding as any).taskConsent, next);
  assert.deepEqual(await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId), oldPolicy);
  assert.deepEqual(h.tables.agentApproval.get(first.approvalId), oldApproval);
  assert.equal((await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "renew-approval" })).approvalId, a.approvalId);
});

test("ordinary action approval still requires an explicit decision, not policy existence", async () => {
  const h = await fixture();
  const a = await h.approvals.request("conversation-a", h.p.proposalId, h.claims, h.approvalBody);
  assert.equal(a.status, "PENDING"); assert.equal((a.binding as any).taskConsent, undefined);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  const original = structuredClone(h.tables.agentApproval.get(a.approvalId));
  const inherited = await h.approve();
  assert.equal(inherited.generation, 2); assert.equal(inherited.status, "APPROVED");
  assert.deepEqual(h.tables.agentApproval.get(a.approvalId), original);
  assert.deepEqual((inherited.binding as any).taskConsent, h.ref);
});

test("expired unused permit renewal captures newly validated consent provenance; replay stays exact", async () => {
  const h = await fixture(), first = await h.issue(), realNow = Date.now;
  const old = await h.ledger.read(h.db, "EXACT_EXECUTION_PERMIT", [h.claims.sub, "conversation-a", h.p.proposalId]);
  try {
    Date.now = () => Date.parse(first.permit.expiresAt) + 1;
    await h.revoke();
    const policy = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "second-consent" });
    const approval = await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "second-approval" });
    const body = { ...h.approvalBody, approvalId: approval.approvalId, requestId: "second-permit" };
    const permit = await h.permits.issue("conversation-a", h.p.proposalId, h.claims, body);
    assert.equal(permit.generation, 2); assert.deepEqual(permit.binding.taskConsent, policy);
    assert.equal((await h.permits.issue("conversation-a", h.p.proposalId, h.claims, body)).permitId, permit.permitId);
    assert.deepEqual(await h.ledger.read(h.db, "EXACT_EXECUTION_PERMIT", [h.claims.sub, "conversation-a", h.p.proposalId]), old);
    assert.equal(await executionRecord(h.db, h.f.run.id), null);
  } finally { Date.now = realNow; }
});

test("a committed signed fixture receipt survives subsequent revocation without redispatch", async () => {
  const h = await fixture(), issued = await h.issue();
  const result = await issued.execute(); assert.equal(result.metadata.status, "RUNNING");
  const write = (await h.request("poll")).execution; assert.ok(write);
  assert.equal(write.attribution.tool, "filesystem.write");
  const content = String(write.attribution.validatedInput.content), hash = createHash("sha256").update(content).digest("hex");
  assert.equal((await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })).execute, true);
  // Simulate revocation after the worker has committed the operation but before
  // its signed receipt reaches the backend. Do not invalidate committed evidence.
  await h.revoke();
  const now = new Date().toISOString();
  await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest,
    state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "written", stderr: "", error: null, truncated: false,
    result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) },
    verificationState: "VERIFIED", verificationResult: { exists: true, sha256: hash } });
  const state = (await executionRecord(h.db, h.f.run.id))!.payload;
  assert.equal(state.completed.change.receiptId, write.attribution.executionId);
  assert.deepEqual(state.exactPermit!.binding.taskConsent, h.ref);
  assert.equal((await h.request("poll")).execution, null);
  assert.ok(h.tables.auditEvent.get(write.attribution.executionId));
  await h.executor.advancePending();
  assert.equal((await h.request("poll")).execution, null);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.agentRunId === h.f.run.id && e.eventType === "EXECUTION_DISPATCHED").length, 1);
});

for (const mode of ["expired", "revoked"]) for (const stage of ["admission", "permit", "consumption", "dispatch", "start"]) {
  test(`${mode} task consent fails before ${stage}, with no write receipt`, async () => {
    const h = await fixture(mode === "expired" && ["dispatch", "start"].includes(stage) ? 1 : 300);
    let issued: Awaited<ReturnType<typeof h.issue>> | undefined, write: any;
    if (stage !== "admission") await h.approve();
    if (["consumption", "dispatch", "start"].includes(stage)) issued = await h.issue();
    if (["dispatch", "start"].includes(stage)) {
      const result = await issued!.execute(); assert.equal(result.metadata.status, "RUNNING", JSON.stringify(result.metadata));
    }
    if (stage === "start") write = (await h.request("poll")).execution;
    const realNow = Date.now;
    try {
      if (mode === "revoked") await h.revoke();
      else if (["dispatch", "start"].includes(stage)) await new Promise(r => setTimeout(r, Math.max(0, Date.parse(h.ref.expiresAt) - Date.now() + 10)));
      else Date.now = () => Date.parse(h.ref.expiresAt) + 1;
      if (stage === "admission") await assert.rejects(h.approve(), /TASK_CONSENT_EXPIRED|TASK_CONSENT_REVOKED/);
      if (stage === "permit") {
        const a = [...h.tables.agentApproval.values()].find(x => x.agentRunId === h.f.run.id && x.approvalType === "EXACT_PROPOSAL")!;
        await assert.rejects(h.permits.issue("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, approvalId: a.id, requestId: "blocked" }), /TASK_CONSENT_EXPIRED|TASK_CONSENT_REVOKED/);
      }
      if (stage === "consumption") await assert.rejects(issued!.execute(), /TASK_CONSENT_EXPIRED|TASK_CONSENT_REVOKED/);
      if (stage === "dispatch") {
        const result = await h.request("poll"); assert.equal(result.execution, null);
      }
      if (stage === "start") {
        assert.ok(write, "eligible task must reach the runtime dispatch fixture");
        const result = await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest });
        assert.equal(result.execute, false);
      }
      assert.equal(await h.ledger.read(h.db, "RUNTIME_RECEIPT", h.f.run.id), null);
    } finally { Date.now = realNow; }
  });
}

test("concurrent revoke/admit serializes: revoked policy cannot admit subsequent work", async () => {
  const h = await fixture();
  const results = await Promise.allSettled([h.revoke(), h.match()]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
  await assert.rejects(h.match(), /TASK_CONSENT_REVOKED/);
});

test("admission before a concurrent revocation may finish but cannot authorize later work", async () => {
  const h = await fixture(), results = await Promise.allSettled([h.match(), h.revoke()]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "fulfilled");
  await assert.rejects(h.approve(), /TASK_CONSENT_REVOKED/);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
});

test("delegated consent still requires a separately issued one-use permit and immutable execution reservation", async () => {
  const h = await fixture(), issued = await h.issue();
  assert.deepEqual(issued.permit.binding.taskConsent, h.ref);
  const persisted = await h.ledger.read<any>(h.db, "EXACT_EXECUTION_PERMIT", [h.claims.sub, "conversation-a", h.p.proposalId]);
  assert.deepEqual(persisted!.payload.binding.taskConsent, h.ref);
  assert.equal((await h.permits.issue("conversation-a", h.p.proposalId, h.claims, issued.permitBody)).permitId, issued.permit.permitId);
  await issued.execute();
  const record = await executionRecord(h.db, h.f.run.id);
  assert.ok(record?.payload.exactPermit); assert.equal(record!.payload.exactPermit!.permitId, issued.permit.permitId);
  await assert.rejects(h.ledger.transaction(tx => h.permits.consumeTx(tx, "conversation-a", h.p.proposalId, h.claims,
    issued.permitBody, "duplicate", { permitId: issued.permit.permitId, generation: issued.permit.generation })), /EXACT_PERMIT_CONSUMED/);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.eventType === "PLAN_EXECUTION_REQUESTED" && e.agentRunId === h.f.run.id).length, 1);
});
