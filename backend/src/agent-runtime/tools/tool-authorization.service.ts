import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import { assertConversationTool } from "../../conversation/conversation-mode";
import { AuditService } from "../../audit/audit.service";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { AGENT_UNDERSTANDING_LIMITS, type AgentPlanningResult } from "../understanding/agent-understanding.types";
import { ToolRegistryService } from "./tool-registry.service";
import { ToolPermissionService } from "./tool-permission.service";
import { ToolScopeService } from "./tool-scope.service";
import { ToolRiskService } from "./tool-risk.service";
import { ToolApprovalService } from "./tool-approval.service";
import { executionRecord, planStepSatisfied, authorizedPlanExecution, type PlanExecutionState } from "../execution/plan-execution-state";
import { boundedToolJson, isRecord, matchesToolSchema, toolDigest, toolSubject, validToolId,
  type AgentTool, type AuthorizationDecision, type ToolBlockCode, type ToolRequest, type ToolScope, type TrustedToolWorkspace } from "./tool-contract";

export interface ToolAuthorizationOptions { approvalId?: string; forceApproval?: boolean; actionBinding?: import("./tool-contract").ToolActionBinding; workspaceRead?: import("../../trusted-runtime/runtime.contract").WorkspaceReadCoverage }
export function blockedTool(code: NonNullable<AuthorizationDecision["code"]>): AuthorizationDecision { return { status: "BLOCKED", code, executionAllowed: false }; }

/** The sole Phase 5B gate. No provider, skill, executor or runtime transport dependency. */
@Injectable()
export class ToolAuthorizationService {
  constructor(
    @Inject(ToolRegistryService) private readonly registry: ToolRegistryService,
    @Inject(ToolScopeService) private readonly scopes: ToolScopeService,
    @Inject(ToolPermissionService) private readonly permissions: ToolPermissionService,
    @Inject(ToolRiskService) private readonly risks: ToolRiskService,
    @Inject(ToolApprovalService) private readonly approvals: ToolApprovalService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService
  ) {}
  async authorize(runId: string, proposal: unknown, claims: SessionClaims, workspace?: TrustedToolWorkspace,
    options: ToolAuthorizationOptions = {}, transaction?: any): Promise<AuthorizationDecision> {
    const db = transaction ?? this.prisma;
    if (!db) return blockedTool("POLICY_BLOCKED");
    if (!transaction) return db.$transaction((tx: any) => this.authorize(runId, proposal, claims, workspace, options, tx));
    if (!validToolId(runId)) {
      await this.auditEarlyDenial(db, claims, runId, proposal, "INVALID_RUN_ID");
      return blockedTool("POLICY_BLOCKED");
    }
    const run = await db.agentRun.findUnique({ where: { id: runId }, include: { project: true, plans: { orderBy: { version: "desc" }, take: 1 } } });
    if (!run?.project || run.userId !== claims.sub) {
      await this.auditEarlyDenial(db, claims, runId, proposal, "RESOURCE_ACCESS_DENIED");
      return blockedTool("PERMISSION_DENIED");
    }
    if (!await this.resources.authorize(toolSubject(claims), "READ", {
      resourceType: "AgentRun", id: runId, projectId: run.projectId, organizationId: run.project.organizationId ?? undefined, userId: run.userId
    }, db)) {
      await this.auditEarlyDenial(db, claims, runId, proposal, "RESOURCE_ACCESS_DENIED");
      return blockedTool("PERMISSION_DENIED");
    }
    // Match the ledger's lock order before touching the run for policy-backed
    // reservations. Revocation and admission serialize across backend workers.
    if (db.auditEvent?.findUnique && (await executionRecord(db, runId))?.payload.exactPermit?.binding.taskConsent)
      await db.$executeRawUnsafe("SELECT pg_advisory_xact_lock(1936026472, 1953657905)");
    const locked = await db.agentRun.updateMany({ where: { id: runId, status: run.status, planVersion: run.planVersion, updatedAt: run.updatedAt }, data: { updatedAt: new Date() } });
    if (locked.count !== 1) {
      await this.auditEarlyDenial(db, claims, runId, proposal, "RUN_NOT_ACTIVE");
      return blockedTool("RUN_NOT_ACTIVE");
    }
    const decision = await this.evaluate(db, run, proposal, claims, workspace, options);
    const metadata = { phase: "5B", status: decision.status, code: decision.code ?? null, executionAllowed: false,
      ...(decision.request ? { requestId: decision.request.id, toolId: decision.request.toolId, toolVersion: decision.request.toolVersion,
        planId: decision.request.planId, planVersion: decision.request.planVersion,
        planStepId: decision.request.planStepId, workspaceId: decision.request.scope.workspaceId, risk: decision.request.risk } : {}),
      ...(decision.approvalId ? { approvalId: decision.approvalId } : {}) };
    await db.agentRunEvent.create({ data: { agentRunId: runId, eventType: "TOOL_REQUESTED", actor: claims.sub, payload: { ...metadata, status: "PROPOSED" } } });
    await db.agentRunEvent.create({ data: { agentRunId: runId, eventType: "TOOL_AUTHORIZATION_CHECKED", actor: claims.sub, payload: metadata } });
    if (decision.status !== "AUTHORIZED") await db.agentRunEvent.create({ data: { agentRunId: runId,
      eventType: decision.status === "BLOCKED" ? "TOOL_BLOCKED" : "APPROVAL_REQUESTED", actor: claims.sub, payload: metadata } });
    await this.audit.recordWithClaimsTx(db, claims, { action: "TOOL_AUTHORIZATION_CHECKED", resourceType: "AgentRun", resourceId: runId,
      result: decision.status === "BLOCKED" ? "DENIED" : "SUCCESS", details: metadata });
    return decision;
  }
  /** No stored owner/project/workspace details or run events before access is established. */
  async auditEarlyDenial(db: any, claims: SessionClaims, runId: unknown, proposal: unknown,
    reason: "RESOURCE_ACCESS_DENIED" | "INVALID_RUN_ID" | "RUN_NOT_ACTIVE"): Promise<void> {
    const requestId = boundedToolJson(proposal) && isRecord(proposal) && validToolId(proposal.id) ? proposal.id : undefined;
    await this.audit.recordWithClaimsTx(db, claims, { action: "TOOL_AUTHORIZATION_CHECKED", resourceType: "AgentRun",
      resourceId: validToolId(runId) ? runId : "unresolved-agent-run", result: "DENIED",
      details: { phase: "5B", status: "BLOCKED", code: reason === "RESOURCE_ACCESS_DENIED" ? "PERMISSION_DENIED" : reason,
        reason, executionAllowed: false, ...(requestId ? { requestId } : {}) } });
  }
  private async evaluate(db: any, run: any, proposal: unknown, claims: SessionClaims, workspace: TrustedToolWorkspace | undefined, options: ToolAuthorizationOptions): Promise<AuthorizationDecision> {
    // Bounded decoding is a prerequisite to safely identifying a tool, not an
    // authorization stage. Once identifiable, resolution precedes input checks.
    if (!boundedToolJson(proposal) || !isRecord(proposal)) return blockedTool("INVALID_INPUT");
    if (!validToolId(proposal.toolId) || !validToolId(proposal.toolVersion)) return blockedTool("INVALID_INPUT");
    let tool: AgentTool;
    try { tool = this.registry.resolve(proposal.toolId, proposal.toolVersion); } catch { return blockedTool("INVALID_TOOL"); }
    if (!this.validInput(proposal, tool, run.id)) return blockedTool("INVALID_INPUT");
    const conversation = await db.conversation?.findUnique({ where: { id: run.conversationId } });
    if (!conversation || conversation.userId !== run.userId || conversation.projectId !== run.projectId) return blockedTool("PERMISSION_DENIED");
    try { assertConversationTool(conversation, tool.id); } catch { return blockedTool("POLICY_BLOCKED"); }
    const execution = await authorizedPlanExecution(db, run, proposal);
    if (execution === null) return blockedTool("POLICY_BLOCKED");
    const input = proposal.input as Record<string, unknown>, scope = proposal.scope as unknown as ToolScope;
    const permissions = await this.permissions.check(toolSubject(claims), tool.requiredPermissions, workspace, scope,
      run.project.organizationId ?? undefined, run.projectId, db);
    if (permissions.some(p => !p.allowed)) return { ...blockedTool(workspace ? "PERMISSION_DENIED" : "INSUFFICIENT_SCOPE"), permissions };
    const scoped = this.scopes.validate(tool, input, scope, run.projectId, workspace);
    if (!scoped.allowed) return blockedTool(scoped.code);
    permissions.forEach(permission => { permission.scope = scoped.scope; });
    const risk = this.risks.classify(tool);
    const planned = this.validatePlan(run, proposal, tool, execution);
    if ("code" in planned) return blockedTool(planned.code);
    const { plan, step } = planned;
    const action = options.actionBinding;
    if (action && (action.userId !== run.userId || action.userId !== claims.sub || action.projectId !== run.projectId ||
      action.organizationId !== run.project.organizationId || action.conversationId !== run.conversationId ||
      action.workspaceBindingId !== scoped.scope.workspaceId || action.planDigest !== toolDigest(plan.steps) ||
      action.inputDigest !== toolDigest(input) || action.scopeDigest !== toolDigest(scoped.scope))) return blockedTool("INVALID_PLAN_STEP");
    const requiresApproval = tool.approvalRequirement === "REQUIRED" || options.forceApproval === true || !!options.approvalId;
    const request: ToolRequest = { id: proposal.id as string, toolId: tool.id, toolVersion: tool.version,
      input: structuredClone(input), purpose: proposal.purpose as string, scope: scoped.scope, requestedBy: "AGENT", runId: run.id,
      planId: plan.id, planVersion: plan.version, planStepId: step.id, risk, requiresApproval };
    const planDigest = toolDigest(plan.steps);
    const operation = omitFields(request, ["requiresApproval"]);
    const taskConsent = execution?.exactPermit?.binding.taskConsent;
    const binding = { kind: "TOOL_AUTHORIZATION" as const, version: 1 as const,
      ...(taskConsent ? { taskConsent } : {}),
      fingerprint: toolDigest({ operation, actorId: claims.sub, planDigest, workspace: scoped.workspace, pathBindingHash: scoped.pathBindingHash, policy: "phase5b-v2",
        ...(taskConsent ? { taskConsent } : {}),
        ...(options.actionBinding ? { actionBinding: options.actionBinding } : {}), ...(options.workspaceRead ? { workspaceRead: options.workspaceRead } : {}) }),
      requestId: request.id, toolId: tool.id, toolVersion: tool.version, runId: run.id, planId: plan.id, planVersion: plan.version,
      planDigest, planStepId: step.id, risk, scope: scoped.scope, requestedBy: claims.sub,
      ...(options.actionBinding ? { actionBinding: options.actionBinding } : {}), ...(options.workspaceRead ? { workspaceRead: options.workspaceRead } : {}) };
    const approval = await this.approvals.evaluate(db, binding, requiresApproval, options.approvalId,
      { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    request.requiresApproval = requiresApproval || !!approval.approvalId;
    return { status: approval.status === "NO_APPROVAL_REQUIRED" ? "AUTHORIZED" : approval.status, code: approval.code,
      request, permissions, approvalId: approval.approvalId, executionAllowed: false };
  }
  private validInput(proposal: Record<string, unknown>, tool: AgentTool, runId: string): boolean {
    const keys = ["id", "toolId", "toolVersion", "input", "purpose", "scope", "requestedBy", "runId", "planId", "planVersion", "planStepId", "risk", "requiresApproval"];
    if (Object.keys(proposal).some(k => !keys.includes(k)) || ![proposal.id, proposal.toolId, proposal.toolVersion, proposal.runId, proposal.planId, proposal.planStepId].every(validToolId) ||
      !Number.isSafeInteger(proposal.planVersion) || (proposal.planVersion as number) < 1 ||
      proposal.requestedBy !== "AGENT" || proposal.runId !== runId || typeof proposal.purpose !== "string" || !proposal.purpose.trim() || proposal.purpose.length > 512 ||
      !isRecord(proposal.input) || !isRecord(proposal.scope) || Object.keys(proposal.scope).some(k => !["workspaceId", "paths"].includes(k)) ||
      !validToolId(proposal.scope.workspaceId) || !Array.isArray(proposal.scope.paths) || !proposal.scope.paths.length || proposal.scope.paths.length > 32 ||
      proposal.scope.paths.some(p => typeof p !== "string") || (proposal.risk !== undefined && !["LOW", "MEDIUM", "HIGH"].includes(String(proposal.risk))) ||
      (proposal.requiresApproval !== undefined && typeof proposal.requiresApproval !== "boolean")) return false;
    return matchesToolSchema(proposal.input, tool.inputSchema);
  }
  private validatePlan(run: any, proposal: Record<string, unknown>, tool: AgentTool, executionState?: PlanExecutionState):
    { code: ToolBlockCode } | { plan: any; step: AgentPlanningResult["plan"]["steps"][number] } {
    if (!["RUNNING", "COMPLETED", "AWAITING_APPROVAL"].includes(run.status)) return { code: "RUN_NOT_ACTIVE" };
    const plan = run.plans?.[0];
    const work = Array.isArray(plan?.steps) && plan.steps.length === 1 ? plan.steps[0] : undefined;
    const planning = work?.planningOnly === true && work.skillId === "" ? work.parameters?.planning as AgentPlanningResult | undefined : undefined;
    const step = Array.isArray(planning?.plan?.steps) ? planning.plan.steps.find(s => s?.id === proposal.planStepId) : undefined;
    if (!plan || plan.agentRunId !== run.id || plan.id !== proposal.planId || plan.version !== proposal.planVersion ||
      plan.version !== run.planVersion || plan.status !== "PLAN_READY" || planning?.version !== 1 || planning.plan?.readiness !== "PLAN_READY" ||
      !planning.plan.validation?.valid || !Array.isArray(planning.plan.constraints) || planning.understanding?.readiness !== "UNDERSTANDING_READY" || !step || step.status !== "PLANNED") return { code: "INVALID_PLAN_STEP" };
    const progress = executionState ? planning.plan.steps.map(s => executionState.completed[s.id]
      ? { ...s, status: "COMPLETED", verification: { status: "VERIFIED" } } : s) : planning.plan.steps;
    const artifacts = new Set<string>(executionState ? planning.plan.steps.filter(s =>
      s.type === "PROPOSE" && s.effect === "READ_ONLY" && executionState.artifacts?.some(a => a.stepId === s.id) &&
      planStepSatisfied(executionState, s.id)).map(s => s.id) : []);
    if (!this.prerequisitesSatisfied(progress, step.id, artifacts)) return { code: "DEPENDENCY_NOT_SATISFIED" };
    const mutation = tool.requiredPermissions.some(p => !["filesystem.read", "git.read"].includes(p));
    const destructive = tool.requiredPermissions.includes("filesystem.delete");
    const execution = tool.category === "TERMINAL";
    const rules = planning.plan.constraints.map(c => c.rule);
    if (rules.includes("UNRESOLVED") || (mutation && rules.includes("NO_WRITE")) || (execution && rules.includes("NO_EXECUTE")) ||
      (destructive && rules.includes("NO_DESTRUCTIVE")) || (mutation && step.effect === "READ_ONLY") || (execution && step.effect !== "EXECUTE") ||
      (destructive && step.effect !== "DESTRUCTIVE" && tool.id !== "filesystem.move") ||
      (mutation && !execution && !["WRITE", "DESTRUCTIVE"].includes(step.effect))) return { code: "POLICY_BLOCKED" };
    return { plan, step };
  }
  private prerequisitesSatisfied(steps: unknown[], selectedId: string, artifacts = new Set<string>()): boolean {
    if (steps.length > AGENT_UNDERSTANDING_LIMITS.MAX_PLAN_STEPS) return false;
    const byId = new Map<string, Record<string, unknown>>();
    for (const step of steps) {
      if (!isRecord(step) || !validToolId(step.id) || byId.has(step.id) || !Array.isArray(step.dependencies) ||
        step.dependencies.length > AGENT_UNDERSTANDING_LIMITS.MAX_PLAN_STEPS || step.dependencies.some(id => !validToolId(id)) ||
        new Set(step.dependencies).size !== step.dependencies.length) return false;
      byId.set(step.id, step);
    }
    const visiting = new Set<string>(), done = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (done.has(id)) return true;
      const step = byId.get(id);
      if (!step) return false;
      // Consume only explicit trusted persisted completion. Phase 4 emits
      // PLANNED/BLOCKED; this service never upgrades those states or fabricates
      // completion from a run, an approval, or an authorization result.
      if (id !== selectedId && !artifacts.has(id) && (step.status !== "COMPLETED" ||
        (step.verificationRequired !== false && (step.verificationRequired !== true || !isRecord(step.verification) || step.verification.status !== "VERIFIED")))) return false;
      visiting.add(id);
      if (!(step.dependencies as string[]).every(visit)) return false;
      visiting.delete(id); done.add(id); return true;
    };
    return visit(selectedId);
  }
}
import { omitFields } from "../../common/omit-fields";
