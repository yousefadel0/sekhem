import { changeWorkflowPauseTx } from "../src/agent-runtime/workflow-pause";
import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { ConversationService } from "../src/conversation/conversation.service";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { generateConversationPlan, certifiedConversationContext, preparePlanHandoff, generatePersistedPlan } from "../src/agent-runtime/understanding/persisted-planning";
import { AgentPlanExecutionService } from "../src/agent-runtime/execution/agent-plan-execution.service";
import { createHash } from "node:crypto";
import { RUNTIME_TOOLS } from "../src/trusted-runtime/runtime.contract";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { executionRecord } from "../src/agent-runtime/execution/plan-execution-state";
import { ExactProposalService } from "../src/agent-runtime/execution/exact-proposal.service";
import { ExactProposalApprovalService } from "../src/agent-runtime/execution/exact-proposal-approval.service";
import { ExactProposalPermitService } from "../src/agent-runtime/execution/exact-proposal-permit.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";

const objective = "Modify auth.ts to add a function comment. Acceptance: the comment describes authentication and the function behavior remains unchanged.";
const source = "export function authenticate() {}";

function proposal(input: any) {
  const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
  const scope = data.scope.find((s: any) => s.reference === "auth.ts");
  const ref = scope.evidenceRefs[0];
  const step = {
    id: "change",
    type: "IMPLEMENT",
    purpose: "PROPOSE_CHANGE",
    description: "Add a descriptive comment to the authenticate function in auth.ts.",
    verificationDescription: "The comment describes the function and its behavior remains unchanged.",
    evidenceRefs: [ref],
    missingInformationIds: [],
    dependencies: [],
    scopeRefs: [scope.id],
    verificationCriterionIds: data.successCriteria.map((c: any) => c.id),
    effect: "WRITE",
    dependencyStatus: "KNOWN"
  };
  return {
    constraintIds: data.constraints.map((c: any) => c.id),
    facts: [{ id: "auth", text: source, evidenceRef: ref }],
    inferences: [],
    hypotheses: [],
    unknowns: [],
    steps: [
      step,
      {
        ...step,
        id: "verify",
        type: "VERIFY",
        purpose: "CHECK_OUTCOME",
        effect: "READ_ONLY",
        dependencies: ["change"],
        description: "Review the changed function and compare its behavior with the verified source.",
        verificationDescription: "The comment is present and the function body remains unchanged."
      }
    ]
  };
}

export async function executionFixture(withArtifact = false) {
  const h = await inspectionHarness();

  // Bind workspace to conversation-a as Normal Chat
  const convSvc = new ConversationService(
    h.db,
    { inspectionView: (id: string, claims: any) => h.service.view(id, claims) } as any,
    undefined,
    undefined,
    undefined,
    undefined,
    h.contexts,
    new ExecutionModeDetectorService(),
    undefined,
    undefined,
    h.store
  );
  const mode = await convSvc.createConversation(h.claims.sub, { projectId: "project-a", title: "Source", mode: "CHAT" }, h.claims);
  await h.db.conversation.update({ where: { id: "conversation-a" }, data: { metadata: { modeContext: mode.modeContext } } });

  // Complete inspection to certified ground state deterministically
  h.responses.push(h.inspect("filesystem.read", "auth.ts"));
  await h.service.advance(h.run.id);
  await h.approve();
  await h.complete((await h.request("poll")).execution, source);
  await h.service.advance(h.run.id);
  const ref = (await h.state()).references[0];
  h.responses.push((input: any) =>
    JSON.stringify({
      decision: "REPORT",
      tool: "none",
      relativePath: "",
      query: "",
      purpose: "Explain observed source",
      report: {
        constraintIds: JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).planningContract.constraints.map((c: any) => c.id),
        facts: [{ id: "auth", text: source, evidenceRef: `runtime:${ref.receiptId}` }],
        inferences: [],
        hypotheses: [],
        unknowns: []
      }
    })
  );
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "COMPLETED");

  await convSvc.postMessage("conversation-a", h.claims, { content: objective, metadata: { clientMessageId: "planning-transfer" } });

  // Grant filesystem.write to the device as well
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", [...RUNTIME_TOOLS]);
  const currentGrant = await h.identity.activeGrant(h.db, h.device.runtimeId, "project-a");
  await h.control.workspaceReadConsent(h.claims, h.binding, { expectedGrantVersion: currentGrant.version, durationMinutes: 60 });

  const calls: any[] = [];
  const gateway: any = {
    requestStructuredReasoning: async (input: any) => {
      calls.push(input);
      if (input.name === "sekhem_exact_change") return JSON.stringify({ stepId: "change", search: source,
        replacement: "// Authenticates the caller; function behavior is unchanged.\n" + source });
      const output = proposal(input);
      if (withArtifact) {
        const change = output.steps[0];
        output.steps.unshift({ ...change, id: "artifact", type: "PROPOSE", effect: "READ_ONLY",
          description: "Prepare the exact comment change for review.", dependencies: [] });
        change.dependencies = ["artifact"];
      }
      return JSON.stringify(output);
    }
  };

  const dependencies = { inspections: h.service, contexts: h.contexts, understanding: new AgentUnderstandingService(), gateway };
  const resources = new ResourceAuthorizationService(h.db);
  const exactApprovals = new ExactProposalApprovalService(h.ledger, h.service, h.evidence, h.identity, resources,
    { recordWithClaimsTx: async () => {} } as any);
  const exactPermits = new ExactProposalPermitService(h.ledger, exactApprovals, h.evidence, h.identity, resources);

  // Setup AgentPlanExecutionService
  const planExecution = new AgentPlanExecutionService(
    h.db,
    h.ledger,
    h.identity,
    h.control,
    h.control.authorization,
    h.control.approvals,
    h.registry,
    h.service,
    h.contexts,
    h.executions,
    gateway,
    h.evidence,
    exactPermits
  );

  // Wire planExecution into executions
  (h.executions as any).planExecution = planExecution;

  const agents: any = {
    planFromConversation: (id: string, claims: any, text: string, requestId: string) =>
      generateConversationPlan(dependencies, claims, id, text, requestId),
    preparePlanHandoff: (id: string, claims: any, text: string, requestId: string) =>
      preparePlanHandoff(dependencies, claims, id, text, requestId),
    executePlan: (id: string, claims: any, text: string, requestId: string) =>
      planExecution.executePlan(id, claims, text, requestId),
    certifiedConversationContext: (id: string, claims: any, text: string) =>
      certifiedConversationContext(dependencies, claims, id, text)
  };

  const conversations = new ConversationService(
    h.db,
    agents,
    undefined,
    undefined,
    undefined,
    undefined,
    h.contexts,
    new ExecutionModeDetectorService(),
    undefined,
    undefined,
    h.store
  );

  const exactProposals = new ExactProposalService(h.ledger, h.service, gateway, h.evidence);
  const executionBodies = new Map<string, any>();
  const post = async (content: string, clientMessageId: string): Promise<any> => {
    if (content !== "Execute the plan") return conversations.postMessage("conversation-a", h.claims, { content, metadata: { clientMessageId } });
    let saved = executionBodies.get(clientMessageId);
    if (!saved) {
      const runId = `planning_run_${toolDigest([h.claims.sub, "conversation-a"])}`;
      const run = await h.db.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
      const plan = run.plans[0];
      try {
        const exact = await exactProposals.continuePlan("conversation-a", h.claims, { planId: plan.id, planVersion: plan.version,
          planDigest: plan.steps[0].parameters.engineeringPlan.digest, requestId: `${clientMessageId}-proposal` });
        const base = { planId: plan.id, proposalVersion: exact.version, proposalDigest: exact.digest };
        const pending = await exactApprovals.request("conversation-a", exact.proposalId, h.claims, { ...base, requestId: `${clientMessageId}-approval` });
        const approved = await exactApprovals.decide("conversation-a", exact.proposalId, h.claims,
          { ...base, approvalId: pending.approvalId, fingerprint: pending.binding.fingerprint, decision: "APPROVED" });
        const permit = await exactPermits.issue("conversation-a", exact.proposalId, h.claims,
          { ...base, approvalId: approved.approvalId, requestId: `${clientMessageId}-permit` });
        saved = { proposalId: exact.proposalId, body: { ...base, approvalId: approved.approvalId, permitId: permit.permitId,
          permitGeneration: permit.generation, permitRequestId: permit.requestId, requestId: clientMessageId } };
        executionBodies.set(clientMessageId, saved);
      } catch (e: any) { return { metadata: { status: "BLOCKED", reason: e.message } }; }
    }
    return planExecution.executeExactProposal("conversation-a", saved.proposalId, h.claims, saved.body);
  };
  return { ...h, conversations, planExecution, agents, calls, post, exactProposals };
}

test("persisted PROPOSE artifact and exact proposal reach existing execution gates without artifact runtime receipts", async () => {
  const h = await executionFixture(true);
  const planned = await h.post("اعمللي plan", "artifact-plan");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === planned.agentRunId);
  assert.equal(plan.status, "PLAN_READY");
  await assert.rejects(h.planExecution.executePlan("conversation-a", h.claims, "Execute the plan", "no-proposal"), /EXACT_PROPOSAL_REQUIRED/);
  assert.equal(await executionRecord(h.db, planned.agentRunId), null);
  const exact = await h.exactProposals.prepare("conversation-a", h.claims, {
    planId: plan.id, planVersion: plan.version, planDigest: plan.steps[0].parameters.engineeringPlan.digest, requestId: "artifact-proposal"
  });
  assert.equal(exact.status, "EXACT_PROPOSAL_READY");
  assert.equal(exact.authorization, "NOT_GRANTED");
  assert.equal(await executionRecord(h.db, planned.agentRunId), null);
  await assert.rejects(h.planExecution.executePlan("conversation-a", h.claims, "Execute the plan", "artifact-execution"), /EXACT_PERMIT_REQUIRED/);
  assert.equal(await executionRecord(h.db, planned.agentRunId), null);
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId), null);
  assert.equal((await h.request("poll")).execution, null);
});

test("plan without PROPOSE artifact cannot use legacy execution without Exact Proposal and exact permit", async () => {
  const h = await executionFixture(false);
  const planned = await h.post("اعمللي plan", "mandatory-exact-plan");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === planned.agentRunId);
  assert.equal(plan.steps[0].parameters.planning.plan.steps.some((s: any) => s.type === "PROPOSE"), false);
  await assert.rejects(h.planExecution.executePlan("conversation-a", h.claims, "Execute the plan", "legacy-no-exact"), /EXACT_PROPOSAL_REQUIRED/);
  await h.exactProposals.prepare("conversation-a", h.claims, { planId: plan.id, planVersion: plan.version,
    planDigest: plan.steps[0].parameters.engineeringPlan.digest, requestId: "mandatory-exact-proposal" });
  await assert.rejects(h.planExecution.executePlan("conversation-a", h.claims, "Execute the plan", "legacy-no-permit"), /EXACT_PERMIT_REQUIRED/);
  assert.equal(await executionRecord(h.db, planned.agentRunId), null);
  assert.equal((await h.request("poll")).execution, null);
});

test("PLAN_READY -> EXECUTE -> HUMAN APPROVAL -> RUNTIME -> VERIFY -> CONTINUE -> FINAL REPORT", async () => {
  const h = await executionFixture();

  // 1. Generate plan from conversation
  const planResponse = await h.post("اعمللي plan", "req-plan-1");
  assert.equal(planResponse.conversationId, "conversation-a");
  const run = h.tables.agentRun.get(planResponse.agentRunId);
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === run.id);
  assert.equal(plan.status, "PLAN_READY");

  // 2. User executes the plan: "Execute the plan"
  const execResponse = await h.post("Execute the plan", "req-exec-1");
  assert.equal(execResponse.conversationId, "conversation-a");
  assert.ok(execResponse.content.includes("Proposed change in auth.ts"));
  assert.ok(execResponse.content.includes("Human approval required before execution can proceed on your computer"));
  assert.ok(execResponse.metadata.approvalId);
  assert.ok(execResponse.metadata.approvalFingerprint);

  // Verify AgentRun transitioned to AWAITING_APPROVAL
  const activeRun = await h.db.agentRun.findUnique({ where: { id: run.id } });
  assert.equal(activeRun.status, "AWAITING_APPROVAL");
  assert.equal(activeRun.currentStepIndex, 0);

  // Verify Proposal in Ledger
  const proposalRec = await h.ledger.read<any>(h.db, "RUNTIME_PROPOSAL", run.id);
  assert.ok(proposalRec);
  assert.equal(proposalRec.payload.state, "AWAITING_APPROVAL");
  assert.equal(proposalRec.payload.toolId, "filesystem.write");
  assert.equal(proposalRec.payload.validatedInput.content, "// Authenticates the caller; function behavior is unchanged.\n" + source);
  assert.equal(proposalRec.payload.validatedInput.expectedSha256, createHash("sha256").update(source).digest("hex"));

  // Verify poll before approval returns nothing
  const preApprovalPoll = await h.request("poll");
  assert.equal(preApprovalPoll.execution, null);

  // 3. Human Approval: approve Step 0
  const approvedProposal = await h.control.approve(
    h.claims,
    run.id,
    execResponse.metadata.approvalFingerprint,
    "APPROVED"
  );
  assert.equal(approvedProposal.state, "APPROVED");

  // 4. Runtime Polls and receives dispatched execution
  const pollResult = await h.request("poll");
  assert.ok(pollResult.execution);
  const execution = pollResult.execution;
  assert.equal(execution.attribution.tool, "filesystem.write");
  assert.equal(execution.attribution.planStepId, "change");

  // Verify permit consumption event in ledger
  const permit = await h.ledger.read(h.db, "RUNTIME_PERMIT_CONSUMPTION", execution.attribution.executionIntentId);
  assert.ok(permit);

  // 5. Runtime reports started & result (SUCCEEDED + VERIFIED)
  const started = await h.request("started", {
    executionId: execution.attribution.executionId,
    operationDigest: execution.attribution.operationDigest
  });
  assert.equal(started.execute, true);

  const newContent = String(execution.attribution.validatedInput.content);
  const sha256 = createHash("sha256").update(newContent, "utf8").digest("hex");
  const now = new Date().toISOString();

  await h.request("result", {
    executionId: execution.attribution.executionId,
    operationDigest: execution.attribution.operationDigest,
    state: "SUCCEEDED",
    startedAt: now,
    finishedAt: now,
    durationMs: 15,
    pid: 1234,
    exitCode: 0,
    stdout: "written",
    stderr: "",
    error: null,
    truncated: false,
    result: { path: execution.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(newContent) },
    verificationState: "VERIFIED",
    verificationResult: { exists: true, sha256 }
  });

  // Verify Step 0 marked COMPLETED and advanced to Step 1
  const runAfterStep0 = await h.db.agentRun.findUnique({ where: { id: run.id } });
  assert.equal(runAfterStep0.currentStepIndex, 1);
  assert.equal(runAfterStep0.progressPercent, 50);

  // Step 1 is filesystem.read with workspace read coverage -> Auto-approved!
  // It is routed to approved, so next poll retrieves Step 1 execution!
  const pollStep1 = await h.request("poll");
  assert.ok(pollStep1.execution);
  const exec1 = pollStep1.execution;
  assert.equal(exec1.attribution.tool, "filesystem.read");
  assert.equal(exec1.attribution.planStepId, "verify");

  // 6. Complete Step 1 (SUCCEEDED + VERIFIED)
  await h.request("started", {
    executionId: exec1.attribution.executionId,
    operationDigest: exec1.attribution.operationDigest
  });

  const now1 = new Date().toISOString();
  await h.request("result", {
    executionId: exec1.attribution.executionId,
    operationDigest: exec1.attribution.operationDigest,
    state: "SUCCEEDED",
    startedAt: now1,
    finishedAt: now1,
    durationMs: 8,
    pid: null,
    exitCode: null,
    stdout: newContent,
    stderr: "",
    error: null,
    truncated: false,
    result: { path: exec1.attribution.validatedInput.path, bytesRead: Buffer.byteLength(newContent), size: Buffer.byteLength(newContent) },
    verificationState: "VERIFIED",
    verificationResult: { observed: true }
  });

  // 7. Verification: all steps done!
  const finalRun = await h.db.agentRun.findUnique({ where: { id: run.id } });
  assert.equal(finalRun.status, "COMPLETED");
  assert.equal(finalRun.progressPercent, 100);
  assert.equal(finalRun.currentStepIndex, 2);

  // Reload through the existing persisted execution view; observations are server receipts only.
  const observed = await h.planExecution.view(run.id, h.claims);
  assert.equal(observed!.observations!.length, 2);
  assert.ok(observed!.observations!.every(o => o.outcome === "VERIFIED" && o.next === "CONTINUE"));
  const beforeReplay = await executionRecord(h.db, run.id);
  const savedReceipt = await h.ledger.read<any>(h.db, "RUNTIME_EXECUTION", exec1.attribution.executionIntentId);
  await assert.rejects(h.ledger.transaction(tx => h.planExecution.recordReceiptTx(tx, run.id, exec1.attribution,
    { ...savedReceipt!.payload, modelOutput: "success" })), /EXECUTION_RECEIPT_NOT_AUTHORITATIVE/);
  await h.ledger.transaction(tx => h.planExecution.recordReceiptTx(tx, run.id, exec1.attribution, savedReceipt!.payload));
  await h.planExecution.advancePending();
  assert.equal((await executionRecord(h.db, run.id))!.revision, beforeReplay!.revision);
  assert.equal((await h.planExecution.view(run.id, h.claims))!.observations!.length, 2);

  const finalPlan = await h.db.agentPlan.findUnique({ where: { id: plan.id } });
  assert.equal(finalPlan.status, "PLAN_READY", "execution does not mutate engineering intent");
  assert.deepEqual(finalPlan.steps, plan.steps);

  // Check final report in the SAME conversation
  const messages = await h.db.conversationMessage.findMany({
    where: { conversationId: "conversation-a" },
    orderBy: { createdAt: "asc" }
  });

  const finalReport = messages.find((m: any) => m.metadata?.planExecutionReport && m.metadata?.outcome === "COMPLETED");
  assert.ok(finalReport, "Final report message should be created in the same conversation");
  assert.ok(finalReport.content.includes("Execution completed"));
  assert.ok(finalReport.content.includes("Verification: PASS"));
  assert.ok(finalReport.content.includes("Before:"));
  assert.ok(finalReport.content.includes("After:"));
});

test("Execution stops and reports STOP / REPLAN when verification fails", async () => {
  const h = await executionFixture();

  // 1. Generate plan
  const planResponse = await h.post("اعمللي plan", "req-plan-fail");
  const run = h.tables.agentRun.get(planResponse.agentRunId);

  // 2. User executes plan
  const execResponse = await h.post("Execute the plan", "req-exec-fail");

  // 3. Human approves Step 0
  await h.control.approve(h.claims, run.id, execResponse.metadata.approvalFingerprint, "APPROVED");

  // 4. Runtime polls
  const pollResult = await h.request("poll");
  const execution = pollResult.execution;

  // 5. Runtime reports failure
  await h.request("started", {
    executionId: execution.attribution.executionId,
    operationDigest: execution.attribution.operationDigest
  });

  const now = new Date().toISOString();
  await h.request("result", {
    executionId: execution.attribution.executionId,
    operationDigest: execution.attribution.operationDigest,
    state: "FAILED",
    startedAt: now,
    finishedAt: now,
    durationMs: 5,
    pid: 1234,
    exitCode: 1,
    stdout: "",
    stderr: "EACCES: permission denied",
    error: "EACCES: permission denied",
    truncated: false,
    result: { error: "Permission denied" },
    verificationState: "FAILED",
    verificationResult: { exists: false }
  });

  // Verify run is marked FAILED
  const failedRun = await h.db.agentRun.findUnique({ where: { id: run.id } });
  assert.equal(failedRun.status, "FAILED");
  assert.equal(failedRun.failureReason, "EACCES: permission denied");

  // Check Stop / Replan message in the same conversation
  const messages = await h.db.conversationMessage.findMany({
    where: { conversationId: "conversation-a" }
  });
  const failureReport = messages.find((m: any) => m.metadata?.planExecutionReport && m.metadata?.outcome === "FAILED");
  assert.ok(failureReport, "Failure report message must be present in conversation");
  assert.ok(failureReport.content.includes("Execution stopped"));
  assert.ok(failureReport.content.includes("receipt is retained"));
  assert.ok(failureReport.content.includes("will not be repeated automatically"));

  // Verify poll returns null (no next step dispatched)
  const pollAfterFail = await h.request("poll");
  assert.equal(pollAfterFail.execution, null);
});

test("missing exact proposal fails closed and leaves the original plan unchanged", async () => {
  const h = await executionFixture();
  const planned = await h.post("اعمللي plan", "blocked-plan");
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === planned.agentRunId);
  const digest = toolDigest(plan.steps);
  (h.exactProposals as any).gateway = undefined;
  const response = await h.post("Execute the plan", "blocked-exec");
  assert.equal(response.metadata.status, "BLOCKED");
  assert.equal(response.metadata.reason, "EXACT_PROPOSAL_PROVIDER_UNAVAILABLE");
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId), null);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal(toolDigest((await h.db.agentPlan.findUnique({ where: { id: plan.id } })).steps), digest);
});

test("duplicate execution request preserves plan identity and the exact pending proposal", async () => {
  const h = await executionFixture();
  const planned = await h.post("اعمللي plan", "duplicate-plan");
  const before = structuredClone([...h.tables.agentPlan.values()].find(p => p.agentRunId === planned.agentRunId));
  const first = await h.post("Execute the plan", "duplicate-exec");
  const second = await h.post("Execute the plan", "duplicate-exec");
  assert.equal(first.id, second.id);
  assert.equal(first.metadata.approvalFingerprint, second.metadata.approvalFingerprint);
  assert.deepEqual((await h.db.agentPlan.findUnique({ where: { id: before.id } })).steps, before.steps);
  assert.equal(h.calls.filter(c => c.name === "sekhem_exact_change").length, 1);
});

test("an ambiguous or nonexistent source replacement produces no executable proposal", async () => {
  const h = await executionFixture();
  const planned = await h.post("اعمللي plan", "invalid-plan");
  (h.exactProposals as any).gateway = { requestStructuredReasoning: async () => JSON.stringify({ stepId: "change", search: "not in the file", replacement: "wrong" }) };
  const response = await h.post("Execute the plan", "invalid-exec");
  assert.equal(response.metadata.status, "BLOCKED");
  assert.equal(response.metadata.reason, "EXACT_CHANGE_AMBIGUOUS");
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId), null);
});

async function startedWrite(h: Awaited<ReturnType<typeof executionFixture>>, suffix: string) {
  const planned = await h.post("اعمللي plan", `plan-${suffix}`);
  const response = await h.post("Execute the plan", `exec-${suffix}`);
  await h.control.approve(h.claims, planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  const e = (await h.request("poll")).execution;
  assert.ok(e);
  await h.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
  const now = new Date().toISOString();
  const body = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest, state: "SUCCEEDED", startedAt: now, finishedAt: now,
    durationMs: 1, pid: null, exitCode: null, stdout: "", stderr: "", error: null, truncated: false, result: {}, verificationState: "VERIFIED",
    verificationResult: { exists: true, sha256: createHash("sha256").update(String(e.attribution.validatedInput.content)).digest("hex") } };
  return { planned, e, body };
}

test("execution approval, dispatch and cancellation are projected without changing plan identity", async () => {
  const h = await executionFixture(), planned = await h.post("اعمللي plan", "plan-view");
  const response = await h.post("Execute the plan", "exec-view");
  const pending = await h.planExecution.view(planned.agentRunId, h.claims);
  assert.equal(pending?.status, "AWAITING_APPROVAL");
  await assert.rejects(h.post("اعمللي plan", "plan-during-execution"), /PLAN_EXECUTION_IN_PROGRESS/);
  await h.control.approve(h.claims, planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  assert.equal((await h.planExecution.view(planned.agentRunId, h.claims))?.phase, "WAITING_RUNTIME");
  const execution = (await h.request("poll")).execution;
  assert.equal((await h.planExecution.view(planned.agentRunId, h.claims))?.phase, "DISPATCHED");
  await h.control.cancel(h.claims, planned.agentRunId);
  const started = await h.request("started", { executionId: execution.attribution.executionId, operationDigest: execution.attribution.operationDigest });
  assert.equal(started.execute, false);
  assert.equal((await h.planExecution.view(planned.agentRunId, h.claims))?.status, "CANCELLED");
  const second = await h.post("اعمللي plan", "plan-after-cancel");
  assert.equal((await h.db.agentRun.findUnique({ where: { id: second.agentRunId } })).planVersion, 2);
  assert.equal((await h.planExecution.view(second.agentRunId, h.claims))?.status, "CANCELLED");
  await h.post("Execute the plan", "exec-second-version");
  assert.deepEqual((await executionRecord(h.db, second.agentRunId))?.payload.completed, {});
  assert.equal((await h.planExecution.view(second.agentRunId, h.claims, 1))?.status, "CANCELLED");
  await assert.rejects(h.planExecution.view(second.agentRunId, h.claims, 999), /EXECUTION_HISTORY_UNAVAILABLE/);
});

test("revocation between dispatch and start prevents the file mutation", async () => {
  const h = await executionFixture(), planned = await h.post("اعمللي plan", "plan-revoke");
  const response = await h.post("Execute the plan", "exec-revoke");
  await h.control.approve(h.claims, planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  const e = (await h.request("poll")).execution;
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: new Date() } });
  const started = await h.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
  assert.equal(started.execute, false);
  assert.equal((await executionRecord(h.db, planned.agentRunId))?.payload.status, "CANCELLED");
});

test("an older worker cannot receive a conditional write proposal", async () => {
  const h = await executionFixture(), planned = await h.post("اعمللي plan", "plan-old-worker");
  await h.request("connect", { workspaceReadProtocol: 1 });
  const response = await h.post("Execute the plan", "exec-old-worker");
  assert.equal(response.metadata.reason, "CONDITIONAL_WRITE_WORKER_UPGRADE_REQUIRED");
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId), null);
});

test("next-step authority failure cannot roll back a receipt or borrow another session", async () => {
  const h = await executionFixture();
  const { planned, e, body } = await startedWrite(h, "expired");
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: new Date() } });
  await h.db.userSession.create({ data: { id: "another-session", userId: h.claims.sub, revokedAt: null, expiresAt: new Date(Date.now() + 3600000) } });
  const accepted = await h.request("result", body);
  assert.equal(accepted.state, "SUCCEEDED");
  assert.ok(await h.ledger.read(h.db, "RUNTIME_RESULT", e.attribution.executionId));
  const progress = (await executionRecord(h.db, planned.agentRunId))!.payload;
  assert.equal(progress.status, "BLOCKED");
  assert.equal(progress.session.id, h.claims.sessionId);
  assert.ok(progress.completed.change);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal((await h.request("result", body)).duplicate, true);
});

test("cancellation after a write starts retains its success receipt but stops continuation", async () => {
  const h = await executionFixture(), { planned, e, body } = await startedWrite(h, "cancel-running");
  await h.control.cancel(h.claims, planned.agentRunId);
  assert.equal((await h.request("result", body)).state, "SUCCEEDED");
  assert.ok(await h.ledger.read(h.db, "RUNTIME_RESULT", e.attribution.executionId));
  const state = (await executionRecord(h.db, planned.agentRunId))!.payload;
  assert.equal(state.status, "CANCELLED"); assert.ok(state.completed.change); assert.equal(state.pendingReceiptId, null);
  assert.equal((await h.request("poll")).execution, null);
});

test("pending continuation recovers after receipt commit without replaying the write", async () => {
  const h = await executionFixture();
  const { planned, e, body } = await startedWrite(h, "recovery");
  const resume = h.planExecution.advancePending.bind(h.planExecution);
  h.planExecution.advancePending = async () => { throw new Error("simulated interruption after commit"); };
  assert.equal((await h.request("result", body)).state, "SUCCEEDED");
  assert.ok(await h.ledger.read(h.db, "RUNTIME_RESULT", e.attribution.executionId));
  assert.equal((await executionRecord(h.db, planned.agentRunId))!.payload.pendingReceiptId, e.attribution.executionId);
  h.planExecution.advancePending = resume;
  await resume(); await resume();
  const next = (await h.request("poll")).execution;
  assert.equal(next.attribution.tool, "filesystem.read");
  assert.notEqual(next.attribution.executionId, e.attribution.executionId);
});

test("read-back must match the approved result, not merely have a successful read receipt", async () => {
  const h = await executionFixture();
  const { planned, body } = await startedWrite(h, "readback");
  await h.request("result", body);
  const read = (await h.request("poll")).execution;
  await h.complete(read, source);
  const state = (await executionRecord(h.db, planned.agentRunId))!.payload;
  assert.equal(state.status, "FAILED");
  assert.equal(state.reason, "READ_BACK_MISMATCH");
  assert.equal([...h.tables.conversationMessage.values()].some(m => m.metadata?.planExecutionReport && m.metadata.outcome === "COMPLETED"), false);
});

test("explicit verification recovery uses fresh read authority without repeating the committed write", async () => {
  const h = await executionFixture(), { planned, e, body } = await startedWrite(h, "recover-read-only");
  await h.db.userSession.update({ where: { id: h.claims.sessionId }, data: { revokedAt: new Date() } });
  await h.request("result", body);
  const original = (await executionRecord(h.db, planned.agentRunId))!.payload;
  assert.equal(original.status, "BLOCKED");
  await assert.rejects(h.planExecution.recoverVerification("conversation-a", planned.agentRunId, h.claims, "expired-authority"));
  const claims = { ...h.claims, sessionId: "recovery-session" };
  await h.db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, revokedAt: null, expiresAt: new Date(claims.exp * 1000) } });
  const certified = h.service.certifiedPlanningSourceTx.bind(h.service);
  h.service.certifiedPlanningSourceTx = async (...args: any[]) => ({ ...await (certified as any)(...args), digest: "changed-source" });
  await assert.rejects(h.planExecution.recoverVerification("conversation-a", planned.agentRunId, claims, "changed-source-recovery"));
  h.service.certifiedPlanningSourceTx = certified;
  await h.planExecution.recoverVerification("conversation-a", planned.agentRunId, claims, "recover-read");
  await h.planExecution.recoverVerification("conversation-a", planned.agentRunId, claims, "recover-read");
  const state = (await executionRecord(h.db, planned.agentRunId))!.payload;
  assert.deepEqual(state.completed.change, original.completed.change);
  assert.deepEqual(state.session, original.session);
  assert.equal(state.verificationSession?.id, claims.sessionId);
  const next = (await h.request("poll")).execution;
  assert.equal(next.attribution.tool, "filesystem.read");
  assert.notEqual(next.attribution.executionId, e.attribution.executionId);
  await h.complete(next, String(e.attribution.validatedInput.content));
  assert.equal((await executionRecord(h.db, planned.agentRunId))!.payload.status, "COMPLETED");
});

test("unknown outcomes are review-only and cannot recover or replay writes", async () => {
  const h = await executionFixture(), { planned, e } = await startedWrite(h, "unknown-review");
  await h.request("connect", { conditionalWriteProtocol: 1, workspaceReadProtocol: 1 });
  const view = await h.planExecution.view(planned.agentRunId, h.claims);
  assert.equal(view?.recovery, "REVIEW_ONLY");
  await assert.rejects(h.planExecution.recoverVerification("conversation-a", planned.agentRunId, h.claims, "unknown-recovery"), /VERIFICATION_RECOVERY_NOT_ELIGIBLE/);
  assert.equal((await h.request("poll")).execution, null);
  assert.ok(await h.ledger.read(h.db, "RUNTIME_EXECUTION", e.attribution.executionIntentId));
});

test("interrupted preparation retains its reservation and requires explicit review", async () => {
  const h = await executionFixture(), planned = await h.post("اعمللي plan", "preparation-review");
  await h.post("Execute the plan", "prepare-interrupted");
  const record = (await executionRecord(h.db, planned.agentRunId))!;
  await h.ledger.transaction(tx => h.ledger.update(tx, record, { ...record.payload, status: "PREPARING", createdAt: new Date(Date.now() - 16 * 60000).toISOString() }, "preparing"));
  await h.planExecution.advancePending();
  const view = await h.planExecution.view(planned.agentRunId, h.claims);
  assert.equal(view?.reason, "EXECUTION_PREPARATION_INTERRUPTED");
  assert.equal(view?.recovery, "PREPARATION_REVIEW");
  assert.deepEqual((await executionRecord(h.db, planned.agentRunId))!.payload.session, record.payload.session);
});


test("cooperative pause after committed write retains receipt/consumed permit and resumes only read-back", async () => {
  const h = await executionFixture();
  const planned = await h.post("اعمللي plan", "pause-plan");
  const response = await h.post("Execute the plan", "pause-execute");
  await h.control.approve(h.claims, planned.agentRunId, response.metadata.approvalFingerprint, "APPROVED");
  const write = (await h.request("poll")).execution;
  await h.ledger.transaction(async tx => changeWorkflowPauseTx(h.ledger, tx,
    await tx.agentRun.findUnique({ where: { id: planned.agentRunId } }), h.claims.sub, false));
  assert.equal((await h.ledger.read<any>(h.db, "WORKFLOW_PAUSE", planned.agentRunId))!.payload.state, "PAUSE_REQUESTED");
  const content = write.attribution.validatedInput.content, sha256 = createHash("sha256").update(content).digest("hex");
  await h.complete(write, content, { result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) }, verificationResult: { exists: true, sha256 } });
  const committed = (await executionRecord(h.db, planned.agentRunId))!;
  assert.ok(committed.payload.completed.change); assert.ok(committed.payload.pendingReceiptId);
  assert.equal((await h.ledger.read<any>(h.db, "WORKFLOW_PAUSE", planned.agentRunId))!.payload.state, "PAUSED");
  assert.equal((await h.request("poll")).execution, null);
  const consumption = await h.ledger.read(h.db, "RUNTIME_PERMIT_CONSUMPTION", write.attribution.executionIntentId);
  await h.ledger.transaction(async tx => changeWorkflowPauseTx(h.ledger, tx,
    await tx.agentRun.findUnique({ where: { id: planned.agentRunId } }), h.claims.sub, true));
  await h.planExecution.advancePending();
  const read = (await h.request("poll")).execution;
  assert.equal(read.attribution.tool, "filesystem.read");
  assert.deepEqual(await h.ledger.read(h.db, "RUNTIME_PERMIT_CONSUMPTION", write.attribution.executionIntentId), consumption);
  await h.complete(read, content); await h.planExecution.advancePending();
  assert.equal((await executionRecord(h.db, planned.agentRunId))!.payload.status, "COMPLETED");
  assert.equal((await h.request("poll")).execution, null);
});

test("resuming approval-bound execution preserves its exact approval request", async () => {
  const h = await executionFixture(); const planned = await h.post("اعمللي plan", "paused-boundary-plan");
  const response = await h.post("Execute the plan", "paused-boundary-execution");
  const before = structuredClone(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId));
  const count = h.tables.agentApproval.size;
  for (const resume of [false, true]) await h.ledger.transaction(async tx => changeWorkflowPauseTx(h.ledger, tx,
    await tx.agentRun.findUnique({ where: { id: planned.agentRunId } }), h.claims.sub, resume));
  await h.planExecution.advancePending();
  assert.deepEqual(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", planned.agentRunId), before);
  assert.equal(h.tables.agentApproval.size, count); assert.equal((await h.request("poll")).execution, null);
  assert.equal(response.metadata.approvalId, before!.payload.approvalId);
});
