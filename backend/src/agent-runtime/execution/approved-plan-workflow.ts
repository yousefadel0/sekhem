import { workflowPauseGateTx } from "../workflow-pause";
import { assertWorkflowDecisionTx } from "./workflow-decision";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type { SessionClaims } from "../../auth/auth.dto";
import type { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import type { RuntimeControlService } from "../../trusted-runtime/runtime-control.service";
import type { ExactProposalService } from "./exact-proposal.service";
import type { ExactProposalApprovalService } from "./exact-proposal-approval.service";
import type { ExactProposalPermitService } from "./exact-proposal-permit.service";
import type { AgentPlanExecutionService } from "./agent-plan-execution.service";
import { executionRecord } from "./plan-execution-state";
import { isRecord, toolDigest, validToolId } from "../tools/tool-contract";

/** Explicit human entry point only. Existing services own every authorization boundary. */
export async function approvePlanWorkflow(services: {
  ledger: RuntimeLedgerService; proposals: ExactProposalService; approvals: ExactProposalApprovalService;
  permits: ExactProposalPermitService; executor: AgentPlanExecutionService; control: RuntimeControlService;
}, conversationId: string, claims: SessionClaims, body: unknown) {
  if (!isRecord(body) || Object.keys(body).sort().join(",") !== "mode,planDigest,planId,planVersion,requestId" ||
    !["ACTION", "TASK"].includes(String(body.mode)) || !validToolId(body.requestId) || !validToolId(body.planId) ||
    !Number.isSafeInteger(body.planVersion) || Number(body.planVersion) < 1 ||
    typeof body.planDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.planDigest)) throw new BadRequestException("WORKFLOW_APPROVAL_REQUEST_INVALID");
  const { ledger, proposals, approvals, permits, executor, control } = services;
  await ledger.transaction(tx => assertWorkflowDecisionTx(ledger, tx, claims.sub, conversationId, String(body.planId)));
  const token = toolDigest([claims.sub, conversationId, body.requestId]);
  const ids = { approval: `wfapproval_${token}`, consent: `wfconsent_${token}`, permit: `wfpermit_${token}`, execution: `wfexecute_${token}` };
  const proposal = await proposals.continuePlan(conversationId, claims, {
    planId: body.planId, planVersion: body.planVersion, planDigest: body.planDigest, requestId: `wfproposal_${token}`
  });
  // The existing executor owns the current planning run. Historical proposal
  // continuations remain readable but cannot be silently retargeted for writes.
  if (proposal.continuationRunId) throw new ConflictException("WORKFLOW_HISTORICAL_EXECUTION_UNAVAILABLE");
  // This bounded slice can explicitly approve one modification, or delegate the
  // existing conservative TASK policy. Commands/external effects are never delegated.
  if (body.mode === "ACTION" && proposal.actions.filter(a => a.tool !== "filesystem.read").length !== 1)
    throw new ConflictException("WORKFLOW_EXPLICIT_ACTION_REQUIRED");
  const runId = proposal.continuationRunId ?? `planning_run_${toolDigest([claims.sub, conversationId])}`;
  const replay = await ledger.transaction(async tx => {
    await assertWorkflowDecisionTx(ledger, tx, claims.sub, conversationId, String(body.planId));
    if (await workflowPauseGateTx(ledger, tx, runId)) throw new ConflictException("WORKFLOW_PAUSED");
    const id = `workflow_approval_${token}`, payload = { requestDigest: toolDigest(body), planId: proposal.planId,
      proposalId: proposal.proposalId, proposalDigest: proposal.digest, mode: body.mode, sessionId: claims.sessionId };
    const old = await tx.agentRunEvent.findUnique({ where: { id } });
    if (old && toolDigest(old.payload) !== toolDigest(payload)) throw new ConflictException("WORKFLOW_APPROVAL_REPLAY_CONFLICT");
    if (!old) await tx.agentRunEvent.create({ data: { id, agentRunId: runId, eventType: "WORKFLOW_HUMAN_APPROVAL_REQUESTED", actor: claims.sub, payload } });
    const state = (await executionRecord(tx, runId))?.payload;
    // Never resubmit a write, reset a permit, or silently renew consent on replay.
    return state?.planId === proposal.planId;
  });
  if (replay) return executor.view(runId, claims);
  const base = { planId: proposal.planId, proposalVersion: proposal.version, proposalDigest: proposal.digest };
  let approved;
  if (body.mode === "TASK") {
    const consent = await approvals.currentTaskConsent(conversationId, proposal.proposalId, claims, base) ?? await approvals.taskConsent(conversationId, proposal.proposalId, claims,
      { ...base, requestId: ids.consent, durationSeconds: 900 }, "TASK");
    approved = await approvals.requestTaskApproval(conversationId, proposal.proposalId, claims,
      { ...base, requestId: ids.approval, consent });
  } else {
    approved = await approvals.currentExactApproval(conversationId, proposal.proposalId, claims, base);
    if (!approved) {
      const pending = await approvals.request(conversationId, proposal.proposalId, claims, { ...base, requestId: ids.approval });
      approved = await approvals.decide(conversationId, proposal.proposalId, claims,
        { ...base, approvalId: pending.approvalId, fingerprint: pending.binding.fingerprint, decision: "APPROVED" });
    }
  }
  if (approved.status !== "APPROVED") throw new ConflictException("WORKFLOW_APPROVAL_REQUIRED");
  const permitBody = { ...base, approvalId: approved.approvalId, requestId: ids.permit };
  const permit = await permits.issue(conversationId, proposal.proposalId, claims, permitBody);
  const result = await executor.executeExactProposal(conversationId, proposal.proposalId, claims, {
    ...base, approvalId: approved.approvalId, permitId: permit.permitId, permitGeneration: permit.generation,
    permitRequestId: permit.requestId, requestId: ids.execution
  });
  if (body.mode === "ACTION" && result.metadata?.status === "AWAITING_APPROVAL") {
    // Record the same explicit human decision at the existing exact tool gate.
    // The tool input must be identical to the reviewed immutable proposal.
    await ledger.transaction(async tx => {
      await approvals.approvedTx(tx, conversationId, proposal.proposalId, claims, permitBody);
      const runtime = (await ledger.read<any>(tx, "RUNTIME_PROPOSAL", runId))?.payload;
      if (!runtime || runtime.planId !== proposal.planId || runtime.planVersion !== proposal.planVersion ||
        !proposal.actions.some(a => a.stepId === runtime.planStepId && a.tool === runtime.toolId && toolDigest(a.input) === toolDigest(runtime.validatedInput)) ||
        runtime.approvalFingerprint !== result.metadata.approvalFingerprint) throw new ConflictException("WORKFLOW_ACTION_CHANGED");
    });
    await control.approve(claims, runId, result.metadata.approvalFingerprint, "APPROVED");
  }
  return executor.view(runId, claims);
}
