import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { AuditService } from "../../audit/audit.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { isRecord, toolDigest, toolSubject, type ToolApprovalBinding, type ToolApprovalStatus, type ToolBlockCode } from "./tool-contract";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../../trusted-runtime/runtime-identity.service";
import { WorkspaceStoreService } from "../../workspace-intelligence/workspace-store.service";
import { readCoverageTx } from "../../trusted-runtime/workspace-read-coverage";
import { TaskConsentService } from "./task-consent.service";

export const TOOL_APPROVAL_TTL_MS = 15 * 60 * 1000;
export interface ToolApprovalEvaluation {
  status: "NO_APPROVAL_REQUIRED" | "APPROVAL_REQUIRED" | "BLOCKED";
  approvalId?: string;
  code?: ToolBlockCode;
  created?: boolean;
}
export function approvalBinding(value: unknown): ToolApprovalBinding | undefined {
  if (!isRecord(value) || value.kind !== "TOOL_AUTHORIZATION" || value.version !== 1 || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint)) return;
  return value as unknown as ToolApprovalBinding;
}
@Injectable()
export class ToolApprovalService {
  constructor(
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}
  async evaluate(db: any, binding: ToolApprovalBinding, required: boolean, suppliedId?: string, session?: import("./task-consent.service").ConsentSession): Promise<ToolApprovalEvaluation> {
    const consent = binding.taskConsent;
    if (consent) {
      const action = binding.actionBinding;
      if (!action || binding.requestedBy !== action.userId) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
      const ledger = new RuntimeLedgerService(db), policies = new TaskConsentService(ledger, new RuntimeIdentityService(ledger), this.resources);
      // The exact input comes from the immutable policy, matched to the already validated request digest.
      const record = await ledger.read<any>(db, "TASK_CONSENT", consent.policyId);
      const allowed = record?.payload.actions.filter((a: any) => a.stepId === binding.planStepId && a.tool === binding.toolId && toolDigest(a.input) === action.inputDigest);
      if (allowed?.length !== 1) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
      await policies.checkTx(db, consent, { userId: action.userId, organizationId: action.organizationId, projectId: action.projectId,
        conversationId: action.conversationId, planId: binding.planId, planVersion: binding.planVersion, session }, allowed[0]);
    }
    const coverage = binding.workspaceRead;
    if (coverage) {
      // Coverage is checked against current durable authority, never accepted as a boolean bypass.
      const identity = new RuntimeIdentityService(new RuntimeLedgerService(db));
      const c = coverage.consent, action = binding.actionBinding;
      if (coverage.kind !== "WORKSPACE_READ_GRANT" || binding.requestedBy !== c.userId || !action || action.userId !== c.userId || action.organizationId !== c.organizationId ||
        action.projectId !== c.projectId || action.workspaceBindingId !== c.workspaceId || action.workspaceBindingVersion !== String(c.bindingVersion) || binding.scope.workspaceId !== c.workspaceId) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
      const grant = await identity.activeGrant(db, c.runtimeId, c.projectId, coverage.grantVersion, true);
      await new WorkspaceStoreService(db).assertInspectionBindingTx(db, c);
      for (const path of binding.scope.paths) {
        const current = await readCoverageTx(identity.ledger, db, grant, c, binding.toolId, path);
        if (!current || toolDigest(current) !== toolDigest(coverage)) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
      }
      const reviewer = await identity.actor(db, c.approvedBy, c.organizationId, c.projectId);
      await new ResourceAuthorizationService(db).assertAuthorized(toolSubject(reviewer), "APPROVE", { resourceType: "Approval", id: grant.grantId, projectId: c.projectId, organizationId: c.organizationId, requiredRole: "Technical Reviewer" });
    }
    const id = `toolapproval_${toolDigest([binding.runId, binding.requestId])}`;
    if (suppliedId && suppliedId !== id) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
    let row = await db.agentApproval.findUnique({ where: { id } });
    let created = false;
    if (!row && suppliedId) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
    if (!row && !required) return { status: "NO_APPROVAL_REQUIRED" };
    if (!row) {
      // Run-level transaction serialization in AgentRuntime prevents duplicate
      // requests; upsert also makes standalone authorization idempotent.
      row = await db.agentApproval.upsert({ where: { id }, update: {}, create: {
        id, agentRunId: binding.runId, approvalType: "TOOL_AUTHORIZATION", status: coverage || consent ? "APPROVED" : "PENDING",
        requestedBy: binding.requestedBy, requiredRole: "Technical Reviewer",
        revisedPlan: binding, dueAt: new Date(Math.min(Date.now() + TOOL_APPROVAL_TTL_MS, coverage && !coverage.lifecycle && coverage.consent.expiresAt !== null ? Date.parse(coverage.consent.expiresAt) : Infinity, consent ? Date.parse(consent.expiresAt) : Infinity)),
        ...(coverage ? { decision: "APPROVED", decidedBy: coverage.consent.approvedBy, decidedAt: new Date(coverage.consent.approvedAt) } : {}),
        ...(consent ? { decision: "APPROVED", decidedBy: consent.consentedBy, decidedAt: new Date() } : {}),
        notes: consent ? `Consent inherited from explicit ${consent.scope === "SESSION" ? "session" : "task"} policy; no new human action decision is asserted.` : coverage ? "Authorized by Workspace Read Grant. This per-operation record inherits the recorded human consent; no new human decision is asserted." : "Approval applies only to the bound tool request. Execution remains unavailable."
      } });
      created = true;
    }
    const stored = approvalBinding(row.revisedPlan);
    if (row.agentRunId !== binding.runId || row.approvalType !== "TOOL_AUTHORIZATION" || row.requestedBy !== binding.requestedBy ||
      !stored || toolDigest(stored) !== toolDigest(binding)) return { status: "BLOCKED", code: "APPROVAL_INVALID" };
    const expiry = row.dueAt && new Date(row.dueAt).getTime();
    if (!expiry || !Number.isFinite(expiry) || expiry <= Date.now() || row.status === "EXPIRED") {
      await db.agentApproval.updateMany({ where: { id, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "EXPIRED", decision: "EXPIRED", decidedAt: new Date() } });
      return { status: "BLOCKED", approvalId: id, code: "APPROVAL_EXPIRED" };
    }
    if (row.status === "APPROVED" && row.decision === "APPROVED" && row.decidedBy && row.decidedAt) return { status: "NO_APPROVAL_REQUIRED", approvalId: id };
    if (row.status !== "PENDING") return { status: "BLOCKED", approvalId: id, code: "APPROVAL_INVALID" };
    return { status: "APPROVAL_REQUIRED", approvalId: id, created };
  }
  /** Called only inside the runtime's transaction; identity is from AuthService. */
  async decide(db: any, runId: string, id: string, claims: SessionClaims, decision: unknown, fingerprint: unknown): Promise<ToolApprovalStatus> {
    if (!["APPROVED", "DENIED", "CANCELLED"].includes(String(decision)) || typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new BadRequestException("INVALID_APPROVAL_DECISION");
    const row = await db.agentApproval.findUnique({ where: { id } });
    if (!row || row.agentRunId !== runId || row.approvalType !== "TOOL_AUTHORIZATION") throw new NotFoundException("Tool approval not found");
    const run = await db.agentRun.findUnique({ where: { id: runId }, include: { project: true, plans: { orderBy: { version: "desc" }, take: 1 } } });
    if (!run?.project) throw new NotFoundException("Approval scope not found");
    const subject = toolSubject(claims);
    await this.resources.assertAuthorized(subject, "APPROVE", { resourceType: "Approval", id, projectId: run.projectId,
      organizationId: run.project.organizationId ?? undefined, requiredRole: "Technical Reviewer" });
    const binding = approvalBinding(row.revisedPlan);
    const plan = run.plans?.[0];
    if (!binding || binding.fingerprint !== fingerprint || binding.planId !== plan?.id || binding.planVersion !== plan?.version || binding.planDigest !== toolDigest(plan.steps)) throw new BadRequestException("APPROVAL_INVALID");
    if (!["AWAITING_APPROVAL", "RUNNING", "COMPLETED"].includes(run.status)) throw new BadRequestException("RUN_NOT_ACTIVE");
    const expiry = row.dueAt && new Date(row.dueAt).getTime();
    const expired = !expiry || !Number.isFinite(expiry) || expiry <= Date.now();
    const target = expired ? "EXPIRED" : decision as ToolApprovalStatus;
    if (row.status !== "PENDING") {
      if (row.status === target && row.decidedBy === claims.sub) return target;
      throw new BadRequestException("APPROVAL_ALREADY_DECIDED");
    }
    const updated = await db.agentApproval.updateMany({ where: { id, status: "PENDING" }, data: { status: target, decision: target, decidedBy: claims.sub, decidedAt: new Date() } });
    if (updated.count !== 1) throw new BadRequestException("APPROVAL_ALREADY_DECIDED");
    const eventType = target === "APPROVED" ? "APPROVAL_GRANTED" : target === "EXPIRED" ? "APPROVAL_EXPIRED" : target === "CANCELLED" ? "APPROVAL_CANCELLED" : "APPROVAL_DENIED";
    const metadata = { approvalId: id, requestId: binding.requestId, toolId: binding.toolId, planStepId: binding.planStepId, risk: binding.risk, status: target };
    await db.agentRunEvent.create({ data: { agentRunId: runId, eventType, actor: claims.sub, payload: metadata } });
    await this.audit.recordWithClaimsTx(db, claims, { action: eventType, resourceType: "AgentRun", resourceId: runId, details: metadata });
    // Grant records a decision only. Reauthorization must still check permissions,
    // current plan, scope and expiry; no scheduler or executor is called here.
    return target;
  }
}
