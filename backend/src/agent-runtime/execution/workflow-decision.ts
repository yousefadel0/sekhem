import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { toolDigest, validToolId, isRecord } from "../tools/tool-contract";
export interface WorkflowDecision {
  conversationId: string; userId: string; planId: string; planVersion: number; planDigest: string;
  decision: "REJECT" | "SKIP"; requestId: string; recordedAt: string;
  canContinue: false; reason: string;
}
export const workflowDecisionKey = (userId: string, conversationId: string, planId: string) => [userId, conversationId, planId];
export async function recordWorkflowDecisionTx(ledger: RuntimeLedgerService, tx: any, conversationId: string, userId: string, body: unknown) {
  if (!isRecord(body) || Object.keys(body).sort().join(",") !== "decision,planDigest,planId,planVersion,requestId" ||
    !["REJECT", "SKIP"].includes(String(body.decision)) || !validToolId(body.requestId) || !validToolId(body.planId) ||
    !Number.isSafeInteger(body.planVersion) || typeof body.planDigest !== "string") throw new BadRequestException("WORKFLOW_DECISION_INVALID");
  const plan = await tx.agentPlan.findUnique({ where: { id: body.planId } });
  const run = plan && await tx.agentRun.findUnique({ where: { id: plan.agentRunId } });
  if (!run || run.userId !== userId || run.conversationId !== conversationId) throw new ForbiddenException("WORKFLOW_OWNER_MISMATCH");
  const identity = plan.steps?.[0]?.parameters?.engineeringPlan;
  if (plan.status !== "PLAN_READY" || plan.version !== body.planVersion || identity?.digest !== body.planDigest)
    throw new ConflictException("PLAN_SOURCE_CHANGED");
  const key = workflowDecisionKey(userId, conversationId, plan.id), old = await ledger.read<WorkflowDecision>(tx, "WORKFLOW_DECISION", key);
  if (old) {
    if (old.payload.requestId !== body.requestId || old.payload.decision !== body.decision || old.payload.planDigest !== body.planDigest) throw new ConflictException("WORKFLOW_DECISION_ALREADY_RECORDED");
    return old.payload;
  }
  if (await ledger.read(tx, "PLAN_EXECUTION", run.id)) throw new ConflictException("WORKFLOW_ALREADY_ADMITTED");
  // The existing exact plan contract has no optional/skippable step. Never infer
  // permission to skip from a model description or silently drop verification.
  const payload: WorkflowDecision = { conversationId, userId, planId: plan.id, planVersion: plan.version, planDigest: body.planDigest,
    requestId: String(body.requestId), decision: body.decision as "REJECT" | "SKIP", recordedAt: new Date().toISOString(), canContinue: false,
    reason: body.decision === "SKIP" ? "REQUIRED_PLAN_STEP_CANNOT_BE_SKIPPED" : "USER_REJECTED_WORKFLOW" };
  await ledger.create(tx, "WORKFLOW_DECISION", key, payload);
  await tx.agentRunEvent.create({ data: { id: `workflow_decision_${toolDigest(key)}`, agentRunId: run.id, actor: userId,
    eventType: body.decision === "SKIP" ? "WORKFLOW_SKIPPED" : "WORKFLOW_REJECTED", payload } });
  await tx.conversationMessage.create({ data: { id: `workflow_decision_message_${toolDigest(key)}`, conversationId, senderId: "agent", senderType: "assistant",
    content: body.decision === "SKIP" ? "Skipped. This required step was not executed. The saved plan cannot continue without it; supply a new planning decision explicitly." : "Rejected. This plan will not execute. Continue the conversation explicitly to revise its scope.",
    metadata: { agentRunId: run.id, workflowDecision: payload } } });
  return payload;
}
export async function assertWorkflowDecisionTx(ledger: RuntimeLedgerService, tx: any, userId: string, conversationId: string, planId: string) {
  const row = await ledger.read<WorkflowDecision>(tx, "WORKFLOW_DECISION", workflowDecisionKey(userId, conversationId, planId));
  if (row) throw new ConflictException(row.payload.reason);
}
