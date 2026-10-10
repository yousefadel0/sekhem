import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AgentControlStoreService } from "./agent-control-store.service";
import { PrismaService } from "../../data-access/prisma.service";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { AuditService } from "../../audit/audit.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { ToolAuthorizationService, blockedTool, type ToolAuthorizationOptions } from "./tool-authorization.service";
import { ToolApprovalService } from "./tool-approval.service";
import { boundedToolJson, isRecord, toolSubject, validToolId, type AgentDecision, type AuthorizationDecision, type TrustedToolWorkspace } from "./tool-contract";

/** Durable control-plane seam; deliberately has no skill/executor dependency. */
@Injectable()
export class AgentToolControlService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ToolAuthorizationService) private readonly authorization: ToolAuthorizationService,
    @Inject(ToolApprovalService) private readonly approvals: ToolApprovalService,
    @Optional() @Inject(AgentControlStoreService) private readonly controlStore?: AgentControlStoreService
  ) {}
  /** Same canonical gate, composed inside the decision service's run transaction. */
  async authorizeActionTx(tx: any, runId: string, claims: SessionClaims, request: unknown, workspace: TrustedToolWorkspace, options: ToolAuthorizationOptions) {
    const loaded = await this.loadAuthorizedRun(tx, runId, claims, "EXECUTE", request);
    if (loaded.error) throw loaded.error;
    return this.authorization.authorize(runId, request, claims, workspace, options, tx);
  }
  async applyDecision(runId: string, claims: SessionClaims, value: unknown, workspace?: TrustedToolWorkspace) {
    if (!boundedToolJson(value) || !isRecord(value) || !["EXECUTE_TOOL", "REQUEST_APPROVAL", "ASK_USER", "REPLAN", "VERIFY", "COMPLETE", "STOP"].includes(String(value.type)) ||
      Object.keys(value).some(k => !["type", "toolRequest", "approvalId"].includes(k)) || (value.approvalId !== undefined && !validToolId(value.approvalId))) throw new BadRequestException("INVALID_AGENT_DECISION");
    const decision = value as unknown as AgentDecision;
    const outcome = await this.prisma.$transaction(async (tx: any) => {
      const loaded = await this.loadAuthorizedRun(tx, runId, claims, "EXECUTE", value.toolRequest);
      if (loaded.error) return { error: loaded.error };
      const run = loaded.run;
      const active = ["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(run.status);
      const toolDecision = decision.type === "EXECUTE_TOOL" || decision.type === "REQUEST_APPROVAL";
      if (!active && !toolDecision) return { authorization: blockedTool("RUN_NOT_ACTIVE"), executionBoundaryReached: false, executionPerformed: false };
      // This conditional write holds the run row for the transaction. Cancellation,
      // pause and concurrent decisions cannot be overwritten after authorization.
      const locked = await tx.agentRun.updateMany({ where: { id: runId, status: run.status, planVersion: run.planVersion, updatedAt: run.updatedAt }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new BadRequestException("RUN_STATE_CHANGED");
      let authorization: AuthorizationDecision | undefined;
      let status = "PAUSED", code: string = decision.type;
      if (decision.type === "EXECUTE_TOOL" || decision.type === "REQUEST_APPROVAL") {
        authorization = await this.authorization.authorize(runId, decision.toolRequest, claims, workspace,
          { approvalId: decision.approvalId, forceApproval: decision.type === "REQUEST_APPROVAL" }, tx);
        if (!active || authorization.code === "RUN_NOT_ACTIVE") return { authorization, executionBoundaryReached: false, executionPerformed: false };
        status = authorization.status === "APPROVAL_REQUIRED" ? "AWAITING_APPROVAL" : "PAUSED";
        code = authorization.status === "AUTHORIZED" ? "EXECUTION_BOUNDARY_NOT_IMPLEMENTED" : authorization.code ?? "APPROVAL_REQUIRED";
      } else if (decision.type === "STOP") {
        status = "CANCELLED";
        await this.cancelPending(tx, runId, claims);
      } else if (decision.type === "COMPLETE") {
        // Completion describes the control-plane job, never verification/execution.
        const pending = await tx.agentApproval.count({ where: { agentRunId: runId, approvalType: "TOOL_AUTHORIZATION", status: "PENDING" } });
        if (pending) throw new BadRequestException("APPROVAL_PENDING");
        status = "COMPLETED";
      }
      const metadata = { phase: "5B", decision: decision.type, previousStatus: run.status, newStatus: status, code, executionPerformed: false };
      await tx.agentRun.update({ where: { id: runId }, data: { status, failureReason: status === "PAUSED" ? code : null,
        pausedAt: status === "PAUSED" ? new Date() : null, completedAt: status === "COMPLETED" ? new Date() : null, updatedAt: new Date() } });
      await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType: "STATUS_CHANGE", actor: claims.sub, payload: metadata } });
      await this.audit.recordWithClaimsTx(tx, claims, { action: "AGENT_CONTROL_DECISION", resourceType: "AgentRun", resourceId: runId, details: metadata });
      return { authorization, runStatus: status, executionBoundaryReached: authorization?.status === "AUTHORIZED", executionPerformed: false };
    });
    // Commit the bounded denial audit before preserving the existing API error.
    // Throwing inside the transaction would roll that audit record back.
    if ("error" in outcome) throw outcome.error;
    return outcome;
  }
  async decideApproval(runId: string, approvalId: string, claims: SessionClaims, body: unknown) {
    if (!isRecord(body) || Object.keys(body).some(k => !["decision", "fingerprint"].includes(k))) throw new BadRequestException("INVALID_APPROVAL_DECISION");
    return this.prisma.$transaction(async (tx: any) => {
      // Use the same run lock ordering as tool proposals/cancellation.
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      if (!run) throw new NotFoundException("Agent run not found");
      const locked = await tx.agentRun.updateMany({ where: { id: runId, status: run.status, updatedAt: run.updatedAt }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new BadRequestException("RUN_STATE_CHANGED");
      const status = await this.approvals.decide(tx, runId, approvalId, claims, body.decision, body.fingerprint);
      return { approvalId, status, executionPerformed: false };
    });
  }
  async cancelPending(tx: any, runId: string, claims: SessionClaims): Promise<void> {
    const run = this.controlStore ? await tx.agentRun.findUnique({ where: { id: runId } }) : null;
    if (run) await this.controlStore!.invalidate(tx, run, "RUN_CANCELLED", claims);
    const result = await tx.agentApproval.updateMany({ where: { agentRunId: runId, approvalType: "TOOL_AUTHORIZATION", status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED", decision: "CANCELLED", decidedBy: claims.sub, decidedAt: new Date() } });
    if (result.count) {
      const metadata = { phase: "5B", count: result.count, status: "CANCELLED" };
      await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType: "APPROVAL_CANCELLED", actor: claims.sub, payload: metadata } });
      await this.audit.recordWithClaimsTx(tx, claims, { action: "APPROVAL_CANCELLED", resourceType: "AgentRun", resourceId: runId, details: metadata });
    }
  }
  async suspendRecoveredBoundary(runId: string, claims: SessionClaims): Promise<boolean> {
    const db: any = this.prisma;
    const prior = await db.agentRunEvent.findFirst({ where: { agentRunId: runId, eventType: "TOOL_AUTHORIZATION_CHECKED" }, select: { id: true } });
    const state = this.controlStore ? await this.controlStore.read(db, runId) : undefined;
    if (!prior && !state) return false;
    await db.$transaction(async (tx: any) => {
      const result = await tx.agentRun.updateMany({ where: { id: runId, status: { in: ["QUEUED", "PLANNING", "RUNNING"] } },
        data: { status: "PAUSED", pausedAt: new Date(), failureReason: "CONTROL_PLANE_REAUTHORIZATION_REQUIRED", updatedAt: new Date() } });
      if (result.count) await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType: "STATUS_CHANGE", actor: claims.sub,
        payload: { phase: "5B", newStatus: "PAUSED", code: "CONTROL_PLANE_REAUTHORIZATION_REQUIRED", executionPerformed: false } } });
      if (result.count && state) {
        const run = await tx.agentRun.findUnique({ where: { id: runId } });
        await this.controlStore!.invalidate(tx, run, "CONTROL_PLANE_REAUTHORIZATION_REQUIRED");
      }
    });
    return true;
  }
  private async loadAuthorizedRun(db: any, runId: string, claims: SessionClaims, action: "EXECUTE", proposal: unknown): Promise<{ run?: any; error?: Error }> {
    const run = validToolId(runId) ? await db.agentRun.findUnique({ where: { id: runId }, include: { project: true } }) : undefined;
    let error: Error | undefined;
    if (!run?.project) error = new NotFoundException("Agent run not found");
    else if (run.userId !== claims.sub) error = new BadRequestException("RUN_ACTOR_MISMATCH");
    else {
      try {
        await this.resources.assertAuthorized(toolSubject(claims), action, { resourceType: "AgentRun", id: runId, projectId: run.projectId,
          organizationId: run.project.organizationId ?? undefined, userId: run.userId });
      } catch (denied) {
        if (!(denied instanceof ForbiddenException)) throw denied;
        error = denied;
      }
    }
    if (error) {
      await this.authorization.auditEarlyDenial(db, claims, runId, proposal, validToolId(runId) ? "RESOURCE_ACCESS_DENIED" : "INVALID_RUN_ID");
      return { error };
    }
    return { run };
  }
}
