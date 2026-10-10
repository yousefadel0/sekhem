import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import type { RuntimeExecution } from "../trusted-runtime/runtime.contract";
import { toolDigest, validToolId } from "./tools/tool-contract";

/** Scheduling control only. Never replaces an approval, session, grant or permit. */
export interface WorkflowPause {
  revision?: number; runId: string; conversationId: string; userId: string; projectId: string;
  state: "RUNNING" | "PAUSE_REQUESTED" | "PAUSED";
  resumeStatus: string; requestedAt: string; requestedBy: string;
}
export async function pauseInFlightTx(ledger: RuntimeLedgerService, tx: any, runId: string) {
  const preparation = await ledger.read<any>(tx, "PLAN_EXECUTION", runId);
  if (preparation?.payload.status === "PREPARING") return true;
  const inspection = await ledger.read<any>(tx, "AGENT_INSPECTION", runId);
  if (inspection?.payload.modelAttempt) return true;
  const proposal = await ledger.read<any>(tx, "RUNTIME_PROPOSAL", inspection?.payload.current ? [runId, inspection.payload.current.planVersion] : runId);
  if (!proposal) return false;
  const execution = await ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", `rtintent_${toolDigest([proposal.payload.proposalId, proposal.payload.proposalDigest])}`);
  // Already dispatched atomic operations may finish; their receipt is never lost.
  return !!execution && ["DISPATCHED", "RUNNING"].includes(execution.payload.state);
}
export async function workflowPauseGateTx(ledger: RuntimeLedgerService, tx: any, runId: string): Promise<boolean> {
  const row = await ledger.read<WorkflowPause>(tx, "WORKFLOW_PAUSE", runId);
  if (!row || row.payload.state === "RUNNING") return false;
  const run = await tx.agentRun.findUnique({ where: { id: runId } });
  const inspection = await ledger.read<any>(tx, "AGENT_INSPECTION", runId);
  const pendingPlanning = inspection?.payload.planningContinuation && !inspection.payload.planningContinuation.result && !inspection.payload.planningContinuation.blocked;
  if (!run || ["FAILED", "CANCELLED"].includes(run.status) || run.status === "COMPLETED" && !pendingPlanning) return true;
  if (row.payload.state === "PAUSE_REQUESTED" && !await pauseInFlightTx(ledger, tx, runId)) {
    await ledger.update(tx, row, { ...row.payload, state: "PAUSED", resumeStatus: run.status });
    await tx.agentRun.update({ where: { id: runId }, data: { status: "PAUSED", pausedAt: new Date(), updatedAt: new Date() } });
    await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType: "WORKFLOW_PAUSED", payload: { status: "PAUSED", boundary: run.status } } });
  }
  return true;
}
export async function changeWorkflowPauseTx(ledger: RuntimeLedgerService, tx: any, run: any, userId: string, resume: boolean, request?: { requestId?: string; expectedRevision?: number }) {
  if (run.userId !== userId) throw new ForbiddenException("WORKFLOW_OWNER_MISMATCH");
  const inspection = await ledger.read<any>(tx, "AGENT_INSPECTION", run.id);
  const pendingPlanning = inspection?.payload.planningContinuation && !inspection.payload.planningContinuation.result && !inspection.payload.planningContinuation.blocked;
  if (["FAILED", "CANCELLED"].includes(run.status) || run.status === "COMPLETED" && !pendingPlanning) throw new ConflictException("WORKFLOW_TERMINAL");
  const row = await ledger.read<WorkflowPause>(tx, "WORKFLOW_PAUSE", run.id);
  if (request) {
    if (!validToolId(request.requestId) || !Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0) throw new BadRequestException("WORKFLOW_CONTROL_REQUEST_INVALID");
    const key = [run.id, userId, request.requestId], digest = toolDigest({ resume, expectedRevision: request.expectedRevision });
    const prior = await ledger.read<{ digest: string }>(tx, "WORKFLOW_PAUSE_REQUEST", key);
    if (prior) { if (prior.payload.digest !== digest) throw new ConflictException("WORKFLOW_CONTROL_REPLAY_CONFLICT"); return; }
    if ((row?.revision ?? 0) !== request.expectedRevision) throw new ConflictException("WORKFLOW_CONTROL_CHANGED");
    await ledger.create(tx, "WORKFLOW_PAUSE_REQUEST", key, { digest, runId: run.id, userId });
  }
  if (resume) {
    if (!row || row.payload.state === "RUNNING") return;
    if (row.payload.state === "PAUSE_REQUESTED") throw new ConflictException("WORKFLOW_PAUSE_PENDING");
    await ledger.update(tx, row, { ...row.payload, state: "RUNNING" });
    await tx.agentRun.update({ where: { id: run.id }, data: { status: row.payload.resumeStatus, pausedAt: null, updatedAt: new Date() } });
    await tx.agentRunEvent.create({ data: { agentRunId: run.id, eventType: "WORKFLOW_RESUMED", payload: { status: row.payload.resumeStatus } } });
    return;
  }
  if (row && row.payload.state !== "RUNNING") return;
  const payload: WorkflowPause = { runId: run.id, conversationId: run.conversationId, userId, projectId: run.projectId,
    state: "PAUSE_REQUESTED", resumeStatus: run.status, requestedAt: new Date().toISOString(), requestedBy: userId };
  if (row) await ledger.update(tx, row, payload); else await ledger.create(tx, "WORKFLOW_PAUSE", run.id, payload, { immutable: false });
  await tx.agentRunEvent.create({ data: { agentRunId: run.id, eventType: "WORKFLOW_PAUSE_REQUESTED", payload: { status: "PAUSE_REQUESTED" } } });
  await tx.agentRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
  await workflowPauseGateTx(ledger, tx, run.id);
}
