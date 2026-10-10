import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import { AuthService } from "../../auth/auth.service";
import { ProjectAccessService } from "../../auth/project-access.service";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import type { SessionClaims, AuthRoleDto } from "../../auth/auth.dto";
import { WorkspaceBindingService } from "../../workspace-intelligence/workspace-binding.service";
import { ToolRegistryService } from "./tool-registry.service";
import { ToolApprovalService } from "./tool-approval.service";
import { AgentToolControlService } from "./agent-tool-control.service";
import { AgentControlStoreService } from "./agent-control-store.service";
import { isRecord, toolDigest, toolSubject, type ToolActionBinding, type TrustedToolWorkspace } from "./tool-contract";
import { CONTROL_ARTIFACT, CONTROL_POLICY, INTENT_TTL_MS, ControlValidationError, actionRequest, deriveAction, persistedPlanning, validateAction, type ActionProposal, type ControlSnapshot } from "./agent-control.contract";

/** Orchestrates data and canonical Phase 5B gates. No provider, process, or executor dependency. */
@Injectable()
export class AgentDecisionService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProjectAccessService) private readonly projects: ProjectAccessService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService,
    @Inject(WorkspaceBindingService) private readonly bindings: WorkspaceBindingService,
    @Inject(ToolRegistryService) private readonly registry: ToolRegistryService,
    @Inject(AgentToolControlService) private readonly control: AgentToolControlService,
    @Inject(ToolApprovalService) private readonly approvals: ToolApprovalService,
    @Inject(AgentControlStoreService) private readonly store: AgentControlStoreService) {}

  /** Called after the validated plan commits, before terminal planning status is visible. */
  async planReady(runId: string) {
    return this.db.$transaction(async (tx: any) => {
      const run = await this.load(tx, runId);
      if (!["RUNNING", "COMPLETED"].includes(run.status)) return;
      await this.store.lock(tx, run);
      if (await this.store.read(tx, runId)) return;
      return this.stage(tx, run);
    });
  }
  private async stage(tx: any, run: any): Promise<ControlSnapshot> {
    persistedPlanning(run);
    const state: ControlSnapshot = { version: 1, revision: 0, runId: run.id, state: "PLAN_READY", code: "PLAN_READY", executionPerformed: false };
    await this.store.save(tx, run, state, "PLAN_READY", "PLAN_READY", "PLAN_READY");
    await this.store.save(tx, run, state, "DECIDING", "DECISION_STARTED", "DECISION_STARTED");
    try {
      state.proposal = deriveAction(run, this.registry, new Date().toISOString());
      state.request = actionRequest(state.proposal);
      await this.store.save(tx, run, state, "ACTION_PROPOSED", "AUTHENTICATED_REVALIDATION_REQUIRED", "ACTION_PROPOSED");
    } catch (error) {
      if (!(error instanceof ControlValidationError)) throw error;
      await this.store.save(tx, run, state, "NEEDS_USER_INPUT", error.message, "EXECUTION_BLOCKED");
    }
    return state;
  }
  async decide(runId: string, cookie: string | undefined, body: unknown) {
    const claims = await this.auth.validateDurableSession(cookie);
    if (!isRecord(body) || Object.keys(body).some(k => !["proposalDigest", "requestApproval"].includes(k)) ||
      (body.proposalDigest !== undefined && (typeof body.proposalDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.proposalDigest))) ||
      (body.requestApproval !== undefined && body.requestApproval !== true)) throw new BadRequestException("INVALID_CONTROL_DECISION");
    return this.db.$transaction(async (tx: any) => {
      const run = await this.loadAuthorized(tx, runId, claims, true);
      await this.store.lock(tx, run);
      let state = await this.store.read(tx, runId);
      // Staging is visible before planning's terminal receipt. Do not interrupt its message commit.
      if (run.status === "RUNNING" && !state?.intent) throw new BadRequestException("PLANNING_COMPLETION_REQUIRED");
      if (!state && !["RUNNING", "COMPLETED"].includes(run.status)) throw new BadRequestException("RUN_NOT_ACTIVE");
      state ??= await this.stage(tx, run);
      if (body.proposalDigest !== undefined && body.proposalDigest !== state.proposal?.proposalDigest) return this.block(tx, run, state, "ACTION_BINDING_CHANGED", claims);
      if (!state.proposal || !state.request) return state;
      // A settled intent is reconciled, never reissued or revived.
      if (state.intent) return this.reconcile(tx, run, state, claims);
      if (!["ACTION_PROPOSED", "AWAITING_APPROVAL", "APPROVED"].includes(state.state)) return this.block(tx, run, state, "CONTROL_STATE_NOT_ACTIVE", claims);
      if (!["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(run.status)) return this.block(tx, run, state, "RUN_NOT_ACTIVE", claims);
      return this.authorize(tx, run, state, cookie, claims, body.requestApproval === true);
    });
  }
  async approve(runId: string, approvalId: string, cookie: string | undefined, body: unknown) {
    const claims = await this.auth.validateDurableSession(cookie);
    if (!isRecord(body) || Object.keys(body).some(k => !["decision", "fingerprint"].includes(k))) throw new BadRequestException("INVALID_APPROVAL_DECISION");
    return this.db.$transaction(async (tx: any) => {
      const run = await this.loadAuthorized(tx, runId, claims, false);
      await this.store.lock(tx, run);
      const state = await this.store.read(tx, runId);
      if (!state) return { approvalId, status: await this.approvals.decide(tx, runId, approvalId, claims, body.decision, body.fingerprint), executionPerformed: false };
      if (!state.proposal || state.approvalId !== approvalId || state.approvalFingerprint !== body.fingerprint) throw new BadRequestException("APPROVAL_INVALID");
      if (state.intent) return state;
      if (state.state !== "AWAITING_APPROVAL") return this.block(tx, run, state, "CONTROL_STATE_NOT_ACTIVE", claims);
      try { await this.currentWorkspace(run, state.proposal, claims); }
      catch (error) { return this.validationFailure(tx, run, state, claims, error); }
      const status = await this.approvals.decide(tx, runId, approvalId, claims, body.decision, body.fingerprint);
      if (status !== "APPROVED") return this.block(tx, run, state, status === "EXPIRED" ? "APPROVAL_EXPIRED" : "APPROVAL_DENIED", claims);
      await this.store.save(tx, run, state, "APPROVED", "APPROVED", "APPROVED", claims);
      // A reviewer may approve; only the run owner may request its handoff.
      if (claims.sub !== run.userId) return state;
      return this.authorize(tx, run, state, cookie, claims, true);
    });
  }
  private async authorize(tx: any, run: any, state: ControlSnapshot, cookie: string | undefined, claims: SessionClaims, forceApproval: boolean) {
    await this.store.save(tx, run, state, "REVALIDATING", "REVALIDATION_STARTED", "REVALIDATION_STARTED", claims);
    try {
      // Fresh identity even after approval/transaction waits. No retained cookies or synthetic claims.
      const fresh = await this.auth.validateDurableSession(cookie);
      if (fresh.sub !== run.userId || fresh.sessionId !== claims.sessionId) throw new ForbiddenException("RUN_ACTOR_MISMATCH");
      await this.projects.assert(fresh, run.projectId, "EXECUTE");
      run = await this.load(tx, run.id);
      if (!["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(run.status)) throw new ControlValidationError("RUN_NOT_ACTIVE");
      const workspace = await this.currentWorkspace(run, state.proposal!, fresh);
      if (toolDigest(state.request) !== toolDigest(actionRequest(state.proposal!))) throw new ControlValidationError("INPUT_BINDING_CHANGED");
      if (state.approvalId) await this.assertReviewer(tx, run, state.approvalId, fresh);
      await this.store.save(tx, run, state, "AUTHORIZATION_PENDING", "AUTHORIZATION_PENDING", "AUTHORIZATION_PENDING", fresh);
      const result = await this.control.authorizeActionTx(tx, run.id, fresh, state.request, workspace,
        { approvalId: state.approvalId, forceApproval, actionBinding: this.binding(state.proposal!) });
      await this.store.save(tx, run, state, "AUTHORIZATION_PENDING", result.code ?? result.status, "AUTHORIZATION_EVALUATED", fresh);
      if (result.status === "BLOCKED") return this.block(tx, run, state, result.code ?? "POLICY_BLOCKED", fresh);
      if (result.approvalId) {
        state.approvalId = result.approvalId;
        const approval = await tx.agentApproval.findUnique({ where: { id: result.approvalId } });
        state.approvalFingerprint = approval?.revisedPlan?.fingerprint;
      }
      if (result.status === "APPROVAL_REQUIRED") {
        await tx.agentRun.update({ where: { id: run.id }, data: { status: "AWAITING_APPROVAL", failureReason: null, updatedAt: new Date() } });
        await this.store.save(tx, run, state, "AWAITING_APPROVAL", "APPROVAL_REQUIRED", "APPROVAL_REQUESTED", fresh);
        return state;
      }
      // The canonical request must still describe exactly the staged operation.
      const authorized = omitFields(result.request!, ["requiresApproval"]);
      const staged = omitFields(state.request!, ["requiresApproval"]);
      if (toolDigest(authorized) !== toolDigest(staged)) throw new ControlValidationError("ACTION_BINDING_CHANGED");
      const latest = await this.load(tx, run.id);
      if (!["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(latest.status)) throw new ControlValidationError("RUN_NOT_ACTIVE");
      validateAction(latest, state.proposal!, this.registry);
      const p = state.proposal!, key = toolDigest({ runId: run.id, proposalDigest: p.proposalDigest, requestId: state.request!.id, policy: CONTROL_POLICY });
      const now = Date.now();
      const approval = state.approvalId ? await tx.agentApproval.findUnique({ where: { id: state.approvalId } }) : null;
      const expiry = Math.min(now + INTENT_TTL_MS, fresh.exp * 1000, approval ? new Date(approval.dueAt).getTime() : Infinity);
      if (!Number.isFinite(expiry) || expiry <= now) throw new ControlValidationError("INTENT_EXPIRED");
      const authorizationReference = `authorization_${key}`;
      // PK uniqueness also protects against a corrupted/deleted control snapshot creating another intent.
      if (await tx.agentRunEvent.findUnique({ where: { id: `intent_${key}` } })) throw new ControlValidationError("INTENT_ALREADY_RECORDED");
      await tx.agentRunEvent.create({ data: { id: authorizationReference, agentRunId: run.id, eventType: "AUTHORIZATION_EVALUATED", actor: fresh.sub,
        payload: { phase: "0A", proposalDigest: p.proposalDigest, status: "AUTHORIZED", executionAllowed: false } } });
      state.intent = { intentId: `intent_${key}`, requestId: state.request!.id, runId: run.id, planId: p.planId, planVersion: p.planVersion,
        planStepId: p.planStepId, actionProposalId: p.proposalId, toolRequestId: state.request!.id, projectId: run.projectId,
        userId: run.userId, conversationId: run.conversationId, workspaceBindingId: p.workspaceBindingId, workspaceBindingVersion: p.workspaceBindingVersion,
        organizationId: p.organizationId, authorizingSessionId: fresh.sessionId, policyVersion: CONTROL_POLICY,
        runtimeId: null, authorizationReference, approvalReference: state.approvalId ?? null, proposalDigest: p.proposalDigest,
        inputDigest: p.inputDigest, scopeDigest: p.scopeDigest, status: "BOUNDARY_BLOCKED", issuedAt: new Date(now).toISOString(), expiresAt: new Date(expiry).toISOString(),
        idempotencyKey: key, executionAllowed: false, dispatchable: false };
      await tx.agentRunEvent.create({ data: { id: state.intent.intentId, agentRunId: run.id, eventType: "EXECUTION_INTENT_CREATED", actor: fresh.sub,
        payload: { phase: "0A", intentId: state.intent.intentId, proposalDigest: p.proposalDigest, executionAllowed: false, runtimeId: null } } });
      await this.store.save(tx, run, state, "EXECUTION_INTENT_CREATED", "EXECUTION_INTENT_CREATED", "CONTROL_STATE_CHANGED", fresh);
      await tx.agentRun.update({ where: { id: run.id }, data: { status: "PAUSED", failureReason: "EXECUTION_BOUNDARY_NOT_IMPLEMENTED", pausedAt: new Date(), updatedAt: new Date() } });
      await this.store.save(tx, run, state, "EXECUTION_BLOCKED", "EXECUTION_BOUNDARY_NOT_IMPLEMENTED", "EXECUTION_BLOCKED", fresh);
      return state;
    } catch (error) { return this.validationFailure(tx, run, state, claims, error); }
  }
  private async currentWorkspace(run: any, proposal: ActionProposal, claims: SessionClaims): Promise<TrustedToolWorkspace> {
    validateAction(run, proposal, this.registry);
    let bound;
    try { bound = await this.bindings.resolve(claims, run.projectId, proposal.workspaceBindingVersion); }
    catch (error) {
      const status = (error as { getStatus?: () => number })?.getStatus?.();
      if (status === 409 || status === 503) throw new ControlValidationError("WORKSPACE_BINDING_CHANGED");
      throw error;
    }
    if (bound.binding.id !== proposal.workspaceBindingId || bound.binding.projectId !== proposal.projectId || bound.binding.mode !== "READ_ONLY") throw new ControlValidationError("WORKSPACE_BINDING_CHANGED");
    return { workspaceId: bound.binding.id, projectId: run.projectId, trustedRoot: bound.context.trustedRoot,
      authorizedRoots: bound.context.authorizedRoots, allowedPaths: proposal.scope.paths, permissions: ["filesystem.read"] };
  }
  private binding(p: ActionProposal): ToolActionBinding {
    return { userId: p.userId, projectId: p.projectId, organizationId: p.organizationId, conversationId: p.conversationId,
      workspaceBindingId: p.workspaceBindingId, workspaceBindingVersion: p.workspaceBindingVersion, proposalDigest: p.proposalDigest,
      planDigest: p.planDigest, inputDigest: p.inputDigest, scopeDigest: p.scopeDigest, verificationDigest: p.verificationDigest, policyVersion: p.policyVersion };
  }
  private async assertReviewer(tx: any, run: any, approvalId: string, owner: SessionClaims) {
    const row = await tx.agentApproval.findUnique({ where: { id: approvalId } });
    if (row?.status !== "APPROVED") return; // The canonical approval gate handles pending/expiry/denial.
    if (row.decidedBy === owner.sub) {
      await this.resources.assertAuthorized(toolSubject(owner), "APPROVE", { resourceType: "Approval", id: row.id, projectId: run.projectId, organizationId: run.project.organizationId, requiredRole: "Technical Reviewer" });
      return;
    }
    const user = await tx.user.findUnique({ where: { id: row.decidedBy }, include: { roles: { include: { role: true } } } });
    const role = user?.roles?.[0]?.role?.key as AuthRoleDto;
    if (!user || !["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"].includes(role)) throw new ControlValidationError("APPROVER_AUTHORITY_CHANGED");
    const subject = { sub: user.id, email: user.email, displayName: user.displayName, role, organizationId: user.organizationId };
    await this.projects.assert(subject, run.projectId);
    await this.resources.assertAuthorized(toolSubject(subject), "APPROVE", { resourceType: "Approval", id: row.id, projectId: run.projectId, organizationId: run.project.organizationId, requiredRole: "Technical Reviewer" });
  }
  private async reconcile(tx: any, run: any, state: ControlSnapshot, claims: SessionClaims) {
    if (state.intent!.status !== "BOUNDARY_BLOCKED") return state;
    if (Date.parse(state.intent!.expiresAt) <= Date.now()) {
      state.intent!.status = "EXPIRED";
      return this.block(tx, run, state, "INTENT_EXPIRED", claims);
    }
    try { await this.currentWorkspace(run, state.proposal!, claims); }
    catch (error) { state.intent!.status = "INVALIDATED"; return this.validationFailure(tx, run, state, claims, error); }
    if (run.status === "CANCELLED") { state.intent!.status = "CANCELLED"; return this.block(tx, run, state, "RUN_CANCELLED", claims); }
    // Reconciliation returns the same non-dispatchable receipt, never a fresh authorization.
    return state;
  }
  private async load(tx: any, runId: string) {
    const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { project: true, plans: { orderBy: { version: "desc" }, take: 1 } } });
    if (!run?.project) throw new NotFoundException("Agent run not found");
    return run;
  }
  private async loadAuthorized(tx: any, runId: string, claims: SessionClaims, owner: boolean) {
    const run = await this.load(tx, runId);
    await this.projects.assert(claims, run.projectId);
    if (owner && run.userId !== claims.sub) throw new ForbiddenException("RUN_ACTOR_MISMATCH");
    return run;
  }
  private async block(tx: any, run: any, state: ControlSnapshot, code: string, claims: SessionClaims) {
    if (state.intent?.status === "BOUNDARY_BLOCKED") state.intent.status = "INVALIDATED";
    if (["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(run.status)) await tx.agentRun.update({ where: { id: run.id },
      data: { status: "PAUSED", failureReason: code, pausedAt: new Date(), updatedAt: new Date() } });
    await this.store.save(tx, run, state, "EXECUTION_BLOCKED", code, "REVALIDATION_FAILED", claims);
    return state;
  }
  private validationFailure(tx: any, run: any, state: ControlSnapshot, claims: SessionClaims, error: unknown) {
    if (error instanceof ControlValidationError) return this.block(tx, run, state, error.message, claims);
    // Auth/session/database errors roll back the transaction and remain denials/errors, never approvals.
    throw error;
  }
  /** Restart only suspends existing control records. No synthetic identity enters decide(). */
  async recover() {
    const rows = await this.db.agentArtifact.findMany({ where: { artifactType: CONTROL_ARTIFACT }, select: { agentRunId: true } });
    for (const row of rows) await this.db.$transaction(async (tx: any) => {
      const run = await this.load(tx, row.agentRunId);
      await this.store.lock(tx, run);
      await this.store.invalidate(tx, run, "CONTROL_PLANE_REAUTHORIZATION_REQUIRED");
      if (["QUEUED", "PLANNING", "RUNNING"].includes(run.status)) await tx.agentRun.update({ where: { id: run.id }, data: { status: "PAUSED", failureReason: "CONTROL_PLANE_REAUTHORIZATION_REQUIRED", pausedAt: new Date() } });
    });
  }
}
import { omitFields } from "../../common/omit-fields";
