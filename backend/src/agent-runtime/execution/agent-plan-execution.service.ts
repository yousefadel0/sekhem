import { readExactProposal } from "../../conversation/change-selection";
import { assertWorkflowDecisionTx } from "./workflow-decision";
import { workflowPauseGateTx } from "../workflow-pause";
import { ExactProposalPermitService } from "./exact-proposal-permit.service";
import { exactChangeDiff } from "./verified-change-diff";
import { observeStep } from "./step-observation";
import { reserveLineageTx, completeLineageTx } from "./execution-lineage";
import { repairContinuationTx } from "./repair-continuation";
import { diagnoseFailure } from "./failure-diagnostic";
import { validateExactPlan, validateExactProposal, type ExactProposal } from "./exact-proposal.service";
import { exactExecutionReservationTx, planStepSatisfied, verificationOnlyEligible } from "./plan-execution-state";
import { BadRequestException, ConflictException, ForbiddenException, forwardRef, Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { AiGatewayService } from "../../ai-gateway/ai-gateway.service";
import { WorkspaceRuntimeEvidenceService } from "../../workspace-intelligence/workspace-runtime-evidence.service";
import { ToolAuthorizationService } from "../tools/tool-authorization.service";
import { ToolApprovalService } from "../tools/tool-approval.service";
import { ToolRegistryService } from "../tools/tool-registry.service";
import { toolDigest, toolSubject, validToolId } from "../tools/tool-contract";
import { RuntimeLedgerService, type RuntimeRecord } from "../../trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../../trusted-runtime/runtime-identity.service";
import { RuntimeControlService } from "../../trusted-runtime/runtime-control.service";
import { RuntimeExecutionService } from "../../trusted-runtime/runtime-execution.service";
import { readCoverageTx } from "../../trusted-runtime/workspace-read-coverage";
import {
  RUNTIME_LIMITS, runtimeBinding, runtimeError, runtimePaths, runtimeRequest,
  type RuntimeAttribution, type RuntimeExecution, type RuntimeProposal
} from "../../trusted-runtime/runtime.contract";
import { AgentInspectionService } from "../inspection/agent-inspection.service";
import { AgentContextBuilderService } from "../understanding/agent-context-builder.service";
import { conversationMode, modeContext, transferredConversation } from "../../conversation/conversation-mode";
import type { AgentPlanningResult } from "../understanding/agent-understanding.types";
import { sourceHash } from "./exact-plan-proposal";
import { executionRecord, type PlanExecutionState, type PlanExecutionView } from "./plan-execution-state";

/** Coordinates the existing plan, authorization and runtime; never turns prose into executable inputs. */
@Injectable()
export class AgentPlanExecutionService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RuntimeLedgerService) private readonly ledger: RuntimeLedgerService,
    @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(RuntimeControlService) private readonly control: RuntimeControlService,
    @Inject(ToolAuthorizationService) private readonly authorization: ToolAuthorizationService,
    @Inject(ToolApprovalService) private readonly approvals: ToolApprovalService,
    @Inject(ToolRegistryService) private readonly registry: ToolRegistryService,
    @Inject(AgentInspectionService) private readonly inspections: AgentInspectionService,
    @Inject(AgentContextBuilderService) private readonly contexts: AgentContextBuilderService,
    @Optional() @Inject(forwardRef(() => RuntimeExecutionService)) private readonly executions?: RuntimeExecutionService,
    @Optional() @Inject(AiGatewayService) private readonly gateway?: AiGatewayService,
    @Optional() @Inject(WorkspaceRuntimeEvidenceService) private readonly evidence?: WorkspaceRuntimeEvidenceService,
    @Optional() @Inject(ExactProposalPermitService) private readonly exactPermits?: ExactProposalPermitService
  ) { }

  async isPlanRunTx(tx: any, runId: string, planVersion?: number) {
    const record = await executionRecord(tx, runId);
    return !!record && (planVersion === undefined || record.payload.planVersion === planVersion);
  }

  private validatePlan(run: any, plan: any, fresh: any, claims: SessionClaims, conversationId: string) {
    return validateExactPlan(run, plan, fresh, claims, conversationId);
  }

  /** Explicit recovery only. Never consumes another permit or prepares a write. */
  async recoverVerification(conversationId: string, runId: string, claims: SessionClaims, requestId: string) {
    if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new BadRequestException("RECOVERY_REQUEST_INVALID");
    return this.ledger.transaction(async tx => {
      const record = await executionRecord(tx, runId);
      if (!record || record.payload.conversationId !== conversationId || record.payload.userId !== claims.sub ||
        record.payload.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      const s = record.payload;
      await this.identity.actor(tx, claims.sub, claims.organizationId!, s.projectId,
        { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      if (s.verificationRequestId === requestId) return this.messageTx(tx, s, `${s.requestId}_recovery_${requestId}`,
        "Verification recovery is already recorded. No write was repeated.", { verificationRecovery: true });
      if (!verificationOnlyEligible(s) || !(await exactExecutionReservationTx(tx, s))) throw new ConflictException("VERIFICATION_RECOVERY_NOT_ELIGIBLE");
      const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 }, project: true } });
      const plan = run?.plans?.[0];
      const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
      this.validatePlan(run, plan, fresh, claims, conversationId);
      if (plan.id !== s.planId || toolDigest(plan.steps) !== s.planDigest) throw new ConflictException("PLAN_SOURCE_CHANGED");
      const recovered = await this.ledger.update(tx, record, { ...s, verificationSession: { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp },
        verificationRequestId: requestId, status: "RUNNING", phase: "VERIFYING", reason: null }, "active");
      await tx.agentRun.update({ where: { id: runId }, data: { status: "RUNNING", failureReason: null, updatedAt: new Date() } });
      await this.control.event(tx, runId, "VERIFICATION_RECOVERY_REQUESTED", { requestId, planId: s.planId, planVersion: s.planVersion });
      return this.executeNextStepTx(tx, claims, run, plan, plan.steps[0].parameters.planning, fresh, recovered);
    });
  }

  async executeExactProposal(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("EXACT_EXECUTION_REQUEST_INVALID");
    const b = body as Record<string, any>;
    if (Object.keys(b).filter(k => k !== "repairSourceRunId").sort().join(",") !== "approvalId,permitGeneration,permitId,permitRequestId,planId,proposalDigest,proposalVersion,requestId" ||
      (b.repairSourceRunId !== undefined && !validToolId(b.repairSourceRunId)) ||
      ![proposalId, b.permitId, b.permitRequestId, b.requestId].every(validToolId) ||
      !Number.isSafeInteger(b.permitGeneration) || b.permitGeneration < 1 || b.permitGeneration > 10000)
      throw new BadRequestException("EXACT_EXECUTION_REQUEST_INVALID");
    return this.executePlan(conversationId, claims, "Execute the persisted exact proposal using its isolated permit.", b.requestId, {
      proposalId, permitId: b.permitId, generation: b.permitGeneration,
      ...(b.repairSourceRunId ? { repairSourceRunId: b.repairSourceRunId } : {}),
      body: { approvalId: b.approvalId, planId: b.planId, proposalDigest: b.proposalDigest,
        proposalVersion: b.proposalVersion, requestId: b.permitRequestId }
    });
  }

  async executePlan(conversationId: string, claims: SessionClaims, instruction: string, requestId: string, permitRequest?: { proposalId: string; permitId: string; generation: number; repairSourceRunId?: string; body: Record<string, any> }) {
    if (!validToolId(requestId) || !instruction.trim() || instruction.length > 4000) throw new BadRequestException("HANDOFF_REQUEST_INVALID");
    const runId = `planning_run_${toolDigest([claims.sub, conversationId])}`;
    const id = `plan_execution_${toolDigest([claims.sub, conversationId, requestId])}`;
    const reserved = await this.ledger.transaction(async tx => {
      const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
      const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 }, project: true } });
      const plan = run?.plans?.[0], result = this.validatePlan(run, plan, fresh, claims, conversationId);
      await assertWorkflowDecisionTx(this.ledger, tx, claims.sub, conversationId, plan.id);
      if (await workflowPauseGateTx(this.ledger, tx, runId)) throw new ConflictException("WORKFLOW_PAUSED");
      const exact = await readExactProposal(this.ledger, tx, claims.sub, conversationId, plan.id);
      if (exact) {
        validateExactProposal(exact.payload, plan, fresh, claims, conversationId);
      }
      if (!exact) throw new ConflictException("EXACT_PROPOSAL_REQUIRED");
      if (!permitRequest || !this.exactPermits) throw new ConflictException("EXACT_PERMIT_REQUIRED");
      if (permitRequest && (!exact || exact.payload.proposalId !== permitRequest.proposalId || plan.id !== permitRequest.body.planId))
        throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
      const requestDigest = toolDigest({ ...(permitRequest ? { permitRequest } : {}), instruction, planId: plan.id, version: plan.version, digest: plan.steps[0].parameters.engineeringPlan.digest });
      const prior = await tx.agentRunEvent.findUnique({ where: { id } });
      if (prior) {
        if (prior.payload.requestDigest !== requestDigest) throw new ConflictException("HANDOFF_REQUEST_CONFLICT");
        return {
          cached: await tx.conversationMessage.findUnique({ where: { id: `${id}_result` } }) ??
            { conversationId, content: "The exact change is still being prepared. No operation has executed.", metadata: { agentRunId: runId, executionPerformed: false } }
        };
      }
      const previous = await executionRecord(tx, runId);
      if (previous && previous.payload.planId === plan.id && !["BLOCKED", "FAILED", "CANCELLED"].includes(previous.payload.status)) {
        return {
          cached: await tx.conversationMessage.findUnique({ where: { id: `${previous.payload.requestId}_result` } }) ??
            { conversationId, content: "This plan already has an execution request. Review its current state.", metadata: { agentRunId: runId, executionPerformed: false } }
        };
      }
      if (previous && previous.payload.planId === plan.id && ["FAILED", "CANCELLED"].includes(previous.payload.status)) throw new ConflictException("REPLAN_REQUIRED");
      const observedTimes = fresh.references.map(ref => Date.parse(ref.observationTime));
      const executionSource = { digest: fresh.digest, references: fresh.references.map(ref => `runtime:${ref.receiptId}`),
        observedAt: observedTimes.length && observedTimes.every(Number.isFinite) ? new Date(Math.min(...observedTimes)).toISOString() : "" };
      const conversation = await tx.conversation.findUnique({ where: { id: conversationId } });
      // Transfer is context, never repair intent or execution authority.
      await transferredConversation(tx, conversation);
      const failedLocal = previous?.payload.status === "FAILED" ? previous.payload : undefined;
      const continuation = await repairContinuationTx(this.ledger, tx, {
        userId: claims.sub, organizationId: claims.organizationId!, projectId: run.projectId,
        conversationId, planId: plan.id, workspace: fresh.binding
      }, permitRequest.repairSourceRunId ?? failedLocal?.runId, !!failedLocal || !!permitRequest.repairSourceRunId);
      const parent = continuation?.source;
      if (continuation) {
        if (previous?.payload.status === "FAILED" && previous.payload.lineageId !== continuation.pin.rootExecutionLineageId)
          throw new ConflictException("REPAIR_CONTINUATION_CHANGED");
        if (previous && previous.payload.planId !== plan.id && !["COMPLETED", "FAILED", "CANCELLED"].includes(previous.payload.status))
          throw new ConflictException("REPAIR_UNSETTLED");
      }
      const { lineageId, rootPlanId, repair } = await reserveLineageTx(this.ledger, tx,
        continuation ? undefined : previous?.payload, parent, {
        planId: plan.id, workspace: fresh.binding, actions: exact.payload.actions, source: executionSource, permitId: permitRequest.permitId,
        runId, requestId: id, userId: claims.sub, organizationId: claims.organizationId!, projectId: run.projectId });
      // Reservation and execution intent commit together under the runtime ledger lock.
      const permit = permitRequest ? await this.exactPermits!.consumeTx(tx, conversationId, permitRequest.proposalId, claims,
        permitRequest.body, id, { permitId: permitRequest.permitId, generation: permitRequest.generation }) : undefined;
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (conversationMode(conv) === "CHAT") await tx.conversation.update({
        where: { id: conversationId }, data: {
          metadata: { ...conv.metadata, modeContext: { ...(modeContext(conv) ?? { version: 1, organizationId: claims.organizationId! }), mode: "AGENT" } }, updatedAt: new Date()
        }
      });
      const resume = previous && previous.payload.planId === plan.id ? previous.payload : undefined;
      const state: PlanExecutionState = {
        version: 1, runId, planId: plan.id, planVersion: plan.version, planDigest: toolDigest(plan.steps),
        conversationId, userId: claims.sub, organizationId: claims.organizationId!, projectId: run.projectId, requestId: id,
        session: { id: claims.sessionId!, issuedAt: claims.iat ?? 0, expiresAt: claims.exp! },
        workspace: fresh.binding, status: "PREPARING", actions: exact?.payload.actions ?? resume?.actions ?? [],
        executionSource, lineageId, rootPlanId, ...(repair ? { repair } : {}),
        ...(continuation ? { repairContinuation: continuation.pin } : {}),
        ...(exact ? { proposalId: exact.payload.proposalId, proposalDigest: exact.payload.digest, artifacts: exact.payload.artifacts } : {}),
        ...(permit ? { exactPermit: { permitId: permit.permitId, digest: permit.digest, generation: permit.generation ?? 1,
          executionIntentId: id, binding: permit.binding } } : {}),
        completed: resume?.completed ?? {}, createdAt: new Date().toISOString()
      };
      const record = previous ? await this.ledger.update(tx, previous, state, "preparing") :
        await this.ledger.create(tx, "PLAN_EXECUTION", runId, state, { immutable: false, route: "preparing" });
      await tx.conversationMessage.create({
        data: {
          id: `${id}_message`, conversationId, senderId: claims.sub, senderType: "user", content: instruction,
          metadata: { planExecutionId: id, clientMessageId: requestId }
        }
      });
      await tx.agentRunEvent.create({
        data: {
          id, agentRunId: runId, eventType: "PLAN_EXECUTION_REQUESTED", actor: claims.sub,
          payload: { planId: plan.id, planVersion: plan.version, requestDigest, revision: record.revision, ...(state.exactPermit ? { exactPermit: state.exactPermit } : {}) }
        }
      });
      await tx.agentRun.update({ where: { id: runId }, data: { status: "PLANNING", completedAt: null, failureReason: null, updatedAt: new Date() } });
      return { record, fresh, result };
    });
    if (reserved.cached) return reserved.cached;
    const { record, fresh, result } = reserved;
    if (!record || !fresh || !result) throw new ConflictException("EXECUTION_REQUEST_CHANGED");
    try {
      const actions = record.payload.actions;
      if (!actions.length) throw new ConflictException("EXACT_EXECUTABLE_INPUT_REQUIRED");
      return await this.ledger.transaction(async tx => {
        const current = await executionRecord(tx, runId);
        if (!current || current.revision !== record.revision) throw new ConflictException("EXECUTION_REQUEST_CHANGED");
        const latest = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
        const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 }, project: true } });
        const plan = run?.plans?.[0]; this.validatePlan(run, plan, latest, claims, conversationId);
        if (current.payload.proposalId) {
          const exact = await readExactProposal(this.ledger, tx, claims.sub, conversationId, plan.id);
          if (!exact || exact.payload.proposalId !== current.payload.proposalId || exact.payload.digest !== current.payload.proposalDigest ||
            toolDigest(exact.payload.actions) !== toolDigest(actions)) throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
          validateExactProposal(exact.payload, plan, latest, claims, conversationId);
        }
        if (current.payload.planDigest !== toolDigest(plan.steps)) throw new ConflictException("PLAN_SOURCE_CHANGED");
        const ready = await this.ledger.update<PlanExecutionState>(tx, current, { ...current.payload, actions, status: "RUNNING", phase: "READY" }, "pending");
        await tx.agentRun.update({ where: { id: runId }, data: { status: "RUNNING", updatedAt: new Date() } });
        return this.executeNextStepTx(tx, claims, run, plan, result, latest, ready);
      });
    } catch (error) {
      const code = this.safeCode(error);
      return this.ledger.transaction(async tx => {
        const current = await executionRecord(tx, runId);
        if (!current || current.payload.requestId !== id) throw error;
        return this.blockTx(tx, current, code);
      });
    }
  }

  private safeCode(error: unknown) {
    const message = (error as Error)?.message;
    return typeof message === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(message) ? message : "EXACT_PROPOSAL_UNAVAILABLE";
  }

  private async blockTx(tx: any, record: RuntimeRecord<PlanExecutionState>, reason: string) {
    const s = record.payload;
    await this.ledger.update(tx, record, { ...s, status: "BLOCKED", reason, pendingReceiptId: null }, "blocked");
    await tx.agentRun.update({ where: { id: s.runId }, data: { status: "PAUSED", failureReason: reason, updatedAt: new Date() } });
    await this.control.event(tx, s.runId, "PLAN_EXECUTION_BLOCKED", { planId: s.planId, planVersion: s.planVersion, reason });
    return this.messageTx(tx, s, `${s.requestId}_result`, `Execution is paused: ${reason}. No additional operation was dispatched. ` +
      (verificationOnlyEligible({ ...s, status: "BLOCKED" }) ? "The write receipt is retained. Renew read authorization and explicitly recover verification only; do not repeat the write." :
        "Review the saved reservation and failure stage. No unsafe work will restart automatically."), { status: "BLOCKED", reason, executionPerformed: Object.keys(s.completed).length > 0 });
  }

  private async messageTx(tx: any, s: PlanExecutionState, id: string, content: string, metadata: Record<string, unknown>) {
    const data = {
      conversationId: s.conversationId, senderId: "agent", senderType: "assistant", content,
      metadata: { agentRunId: s.runId, planExecution: true, planId: s.planId, planVersion: s.planVersion, ...metadata }
    };
    const message = await tx.conversationMessage.upsert({ where: { id }, create: { id, ...data }, update: data });
    await tx.conversation.update({ where: { id: s.conversationId }, data: { updatedAt: new Date() } });
    return message;
  }

  private async executeNextStepTx(tx: any, claims: SessionClaims, run: any, plan: any, result: AgentPlanningResult, fresh: any, record: RuntimeRecord<PlanExecutionState>) {
    if (await workflowPauseGateTx(this.ledger, tx, run.id)) return;
    const s = record.payload, steps = result.plan.steps, index = steps.findIndex(step => !planStepSatisfied(s, step.id));
    if (index < 0) return this.completeTx(tx, record, steps.length);
    const step = steps[index], action = s.actions.find(a => a.stepId === step.id);
    if (!action || !Object.keys(action.input).length) throw new ConflictException("EXACT_EXECUTABLE_INPUT_REQUIRED");
    if (step.dependencies.some(id => !planStepSatisfied(s, id))) throw new ConflictException("DEPENDENCY_NOT_SATISFIED");
    const tool = action.tool, validatedInput = action.input, toolDef = this.registry.resolve(tool, "2.0.0");
    const verificationRecovery = !!s.verificationSession;
    if (verificationRecovery && (tool !== "filesystem.read" || !action.expectedAfterHash)) throw new ConflictException("VERIFICATION_RECOVERY_READ_ONLY");
    const grant = await this.identity.activeGrant(tx, fresh.binding.runtimeId, run.projectId, verificationRecovery ? undefined : s.exactPermit?.binding.grantVersion);
    if (s.exactPermit) {
      if (!(await exactExecutionReservationTx(tx, s)) || s.exactPermit.binding.grantId !== grant.grantId ||
        (!verificationRecovery && s.exactPermit.binding.grantVersion !== grant.version)) throw new ConflictException("EXACT_PERMIT_CHANGED");
    }
    const device = (await this.identity.device(tx, fresh.binding.runtimeId)).payload;
    if (device.status !== "ACTIVE" || device.fingerprint !== fresh.binding.runtimeFingerprint) throw new ForbiddenException("RUNTIME_IDENTITY_MISMATCH");
    if (!verificationRecovery && s.exactPermit && device.connectionEpoch !== s.exactPermit.binding.connectionEpoch) throw new ConflictException("EXACT_PERMIT_CHANGED");
    if (!device.lastSeenAt || Date.parse(device.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) runtimeError("RUNTIME_OFFLINE");
    if (tool === "filesystem.write" && device.conditionalWriteProtocol !== 1) runtimeError("CONDITIONAL_WRITE_WORKER_UPGRADE_REQUIRED");
    if (grant.userId !== claims.sub || !grant.capabilities.includes(tool)) throw new ForbiddenException("RUNTIME_CAPABILITY_NOT_GRANTED");
    const coverage = step.effect === "READ_ONLY" ? await readCoverageTx(this.ledger, tx, grant, { ...fresh.binding, bindingVersion: fresh.binding.version }, tool, String(validatedInput.path)) : undefined;
    const targetId = coverage ? fresh.binding.workspaceId : grant.grantId, targetVersion = String(coverage ? fresh.binding.version : grant.version);
    const scope = { workspaceId: targetId, paths: runtimePaths(validatedInput) };
    const actor = await this.identity.actor(tx, claims.sub, claims.organizationId!, run.projectId,
      { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(actor), "EXECUTE", { resourceType: "Project", id: run.projectId, projectId: run.projectId, organizationId: claims.organizationId });
    const proposalId = `rtproposal_${toolDigest([run.id, plan.id, plan.version, step.id, validatedInput, ...(verificationRecovery ? [s.verificationRequestId] : [])])}`;
    const immutable = {
      runtimeId: device.runtimeId, grantId: grant.grantId, grantVersion: grant.version, connectionEpoch: device.connectionEpoch,
      ...(coverage ? {
        workspaceRead: coverage, workspaceOperation: {
          workspaceId: fresh.binding.workspaceId, bindingVersion: fresh.binding.version,
          rootPath: fresh.binding.rootPath, runtimeFingerprint: fresh.binding.runtimeFingerprint, operationId: proposalId
        }
      } : {}),
      userId: claims.sub, organizationId: claims.organizationId!, projectId: run.projectId, conversationId: run.conversationId,
      runId: run.id, planId: plan.id, planVersion: plan.version, planStepId: step.id, toolId: tool, toolVersion: "2.0.0" as const,
      validatedInput, purpose: step.purpose || step.objective, effect: step.effect, risk: toolDef.riskLevel, scope,
      planDigest: toolDigest(plan.steps), inputDigest: toolDigest(validatedInput), scopeDigest: toolDigest(scope), verificationDigest: toolDigest(step.verification),
      workspaceBindingId: targetId, workspaceBindingVersion: targetVersion, policyVersion: "trusted-runtime-v1" as const, createdAt: new Date().toISOString()
    };
    const proposal: RuntimeProposal = {
      ...immutable, proposalId, proposalDigest: toolDigest(immutable), preview: {
        available: true,
        description: action.change ? `${action.relativePath}\nBefore:\n${action.change.before}\nAfter:\n${action.change.after}` : `Read ${action.relativePath} and verify the approved result.`
      },
      approvalId: null, approvalFingerprint: null, state: coverage ? "APPROVED" : "AWAITING_APPROVAL",
      authorizingSessionId: claims.sessionId, authorizingIssuedAt: claims.iat ?? 0, authorizingExpiresAt: claims.exp
    };
    const decision = await this.authorization.authorize(run.id, runtimeRequest(proposal), actor, this.control.workspace(proposal, grant),
      { forceApproval: !coverage, actionBinding: runtimeBinding(proposal), ...(coverage ? { workspaceRead: coverage } : {}) }, tx);
    const consented = !!s.exactPermit?.binding.taskConsent && decision.status === "AUTHORIZED";
    const authorized = !!coverage || consented;
    if (decision.status !== (authorized ? "AUTHORIZED" : "APPROVAL_REQUIRED") || !decision.approvalId) runtimeError(decision.code ?? "RUNTIME_APPROVAL_REQUIRED");
    const approval = await tx.agentApproval.findUnique({ where: { id: decision.approvalId } });
    proposal.approvalId = approval.id; proposal.approvalFingerprint = approval.revisedPlan.fingerprint;
    proposal.state = authorized ? "APPROVED" : "AWAITING_APPROVAL";
    const prior = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", run.id);
    if (prior) await this.ledger.update(tx, prior, proposal, `${device.runtimeId}:${authorized ? "approved" : "pending"}`);
    else await this.ledger.create(tx, "RUNTIME_PROPOSAL", run.id, proposal, { immutable: false, route: `${device.runtimeId}:${authorized ? "approved" : "pending"}` });
    const status = authorized ? "RUNNING" : "AWAITING_APPROVAL";
    await this.ledger.update(tx, record, { ...s, status, phase: authorized ? "WAITING_RUNTIME" : "AWAITING_APPROVAL", pendingReceiptId: null, reason: null }, "active");
    await tx.agentRun.update({ where: { id: run.id }, data: { status, currentStepIndex: index, progressPercent: Math.round(Object.keys(s.completed).length / steps.length * 100), updatedAt: new Date() } });
    await this.control.event(tx, run.id, "ACTION_PROPOSED", { proposalId, planId: plan.id, planVersion: plan.version, planStepId: step.id, toolId: tool, requiresApproval: !authorized });
    return this.messageTx(tx, s, `${s.requestId}_result${index ? `_${step.id}` : ""}`,
      coverage ? `Ready to read ${action.relativePath} under your Workspace Read Grant. Waiting for the runtime.` : consented ?
        `The exact action in ${action.relativePath} has task consent and execution authorization. Waiting for the runtime.` :
        `Proposed change in ${action.relativePath}:\n\n${proposal.preview.description}\n\nHuman approval required before execution can proceed on your computer.`,
      { status, approvalId: proposal.approvalId, approvalFingerprint: proposal.approvalFingerprint, planStepId: step.id, executionPerformed: false });
  }

  /** Runs inside receipt settlement. No new authorization, source admission, or next-step dispatch occurs here. */
  async recordReceiptTx(tx: any, runId: string, attribution: RuntimeAttribution, finished: RuntimeExecution) {
    const record = await executionRecord(tx, runId);
    if (!record || record.payload.planId !== attribution.planId || record.payload.planVersion !== attribution.planVersion) return;
    const s = record.payload;
    if (!(await exactExecutionReservationTx(tx, s))) throw new ConflictException("EXACT_PERMIT_CHANGED");
    const action = s.actions.find(a => a.stepId === attribution.planStepId);
    // Observation input must be the committed runtime receipt, never a model result.
    const receipt = await this.ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", attribution.executionIntentId);
    if (!receipt || toolDigest(receipt.payload) !== toolDigest(finished) || toolDigest(receipt.payload.attribution) !== toolDigest(attribution))
      throw new ConflictException("EXECUTION_RECEIPT_NOT_AUTHORITATIVE");
    const scopeMatches = !!action && action.tool === attribution.tool && toolDigest(action.input) === toolDigest(attribution.validatedInput);
    const matchesResult = action?.tool !== "filesystem.read" || !action.expectedAfterHash ||
      (finished.result?.truncated === false && sourceHash(finished.result.stdout) === action.expectedAfterHash);
    const verified = scopeMatches && finished.state === "SUCCEEDED" && finished.verificationState === "VERIFIED" && matchesResult;
    if (action) {
      const observation = observeStep(action, receipt.payload, scopeMatches, matchesResult);
      if (s.observations?.[observation.receiptId]) return;
      s.observations = { ...s.observations, [observation.receiptId]: observation };
      await this.control.event(tx, runId, "STEP_OBSERVED", { ...observation });
      const diagnostic = diagnoseFailure(s, observation, receipt.payload);
      if (diagnostic) {
        s.failureDiagnostics = { ...s.failureDiagnostics, [observation.receiptId]: diagnostic };
        await this.control.event(tx, runId, "EXECUTION_FAILURE_DIAGNOSED", { ...diagnostic });
      }
    }
    if (!verified || !action) {
      const reason = !scopeMatches ? "EXECUTION_RECEIPT_SCOPE_CHANGED" : !matchesResult ? "READ_BACK_MISMATCH" : finished.error ?? "EXECUTION_STEP_FAILED";
      const status = finished.state === "CANCELLED" ? "CANCELLED" : "FAILED";
      await this.ledger.update(tx, record, { ...s, status, reason, failureRecordedAt: new Date().toISOString(), pendingReceiptId: null }, "settled");
      await tx.agentRun.update({ where: { id: runId }, data: { status, failureReason: reason, completedAt: new Date(), updatedAt: new Date() } });
      return this.messageTx(tx, s, `${s.requestId}_final_report`, `Execution stopped: ${reason}. The receipt is retained. Review the result before replanning; the operation will not be repeated automatically.`,
        { planExecutionReport: true, outcome: status, receiptId: attribution.executionId, executionPerformed: true,
          ...(s.failureDiagnostics?.[attribution.executionId] ? { failureDiagnostic: s.failureDiagnostics[attribution.executionId] } : {}) });
    }
    if (s.completed[action.stepId]) return;
    const completion = { receiptId: attribution.executionId, verifiedAt: finished.finishedAt ?? new Date().toISOString(), durationMs: finished.result?.durationMs ?? 0 };
    if (finished.cancellationState !== "NONE" || s.status === "CANCELLED") {
      await this.ledger.update(tx, record, { ...s, status: "CANCELLED", phase: "CANCELLED", completed: { ...s.completed, [action.stepId]: completion }, pendingReceiptId: null }, "settled");
      await tx.agentRun.update({ where: { id: runId }, data: { status: "CANCELLED", completedAt: new Date(), updatedAt: new Date() } });
      return this.messageTx(tx, s, `${s.requestId}_final_report`, "Execution cancelled. The current action finished before cancellation took effect; its verified receipt is retained. No subsequent step was started. Review the file before replanning.",
        { planExecutionReport: true, outcome: "CANCELLED", receiptId: attribution.executionId, executionPerformed: true });
    }
    await this.ledger.update(tx, record, { ...s, status: "RUNNING", phase: "VERIFYING", completed: { ...s.completed, [action.stepId]: completion }, pendingReceiptId: attribution.executionId }, "pending");
    await this.control.event(tx, runId, "STEP_COMPLETED", { planId: s.planId, planVersion: s.planVersion, planStepId: action.stepId, ...completion, ...(s.exactPermit ? { exactPermit: s.exactPermit } : {}), verification: "VERIFIED" });
  }

  /** Durable pending records survive a crash after receipt commit. This only prepares subsequent work. */
  async advancePending() {
    const preparing = await this.ledger.transaction(tx => this.ledger.list<PlanExecutionState>(tx, "PLAN_EXECUTION", "preparing", 16));
    for (const item of preparing) if (Date.parse(item.payload.createdAt) + 15 * 60 * 1000 < Date.now()) await this.ledger.transaction(async tx => {
      const current = await executionRecord(tx, item.payload.runId);
      if (current?.revision === item.revision) await this.blockTx(tx, current, "EXECUTION_PREPARATION_INTERRUPTED");
    });
    const pending = await this.ledger.transaction(tx => this.ledger.list<PlanExecutionState>(tx, "PLAN_EXECUTION", "pending", 16));
    for (const item of pending) {
      try { await this.ledger.transaction(tx => this.advanceTx(tx, item.payload.runId)); }
      catch (error) {
        await this.ledger.transaction(async tx => {
          const current = await executionRecord(tx, item.payload.runId);
          if (current?.payload.pendingReceiptId) await this.blockTx(tx, current, this.safeCode(error));
        });
      }
    }
  }

  async advanceTx(tx: any, runId: string) {
    const record = await executionRecord(tx, runId);
    if (!record || !record.payload.pendingReceiptId && record.payload.phase !== "READY") return;
    if (await workflowPauseGateTx(this.ledger, tx, runId)) return;
    const s = record.payload;
    if (s.pendingReceiptId && s.observations?.[s.pendingReceiptId]?.next === "STOP")
      return this.blockTx(tx, record, "STEP_OBSERVATION_REVALIDATION_REQUIRED");
    const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 }, project: true } });
    const plan = run?.plans?.[0], result: AgentPlanningResult = plan?.steps?.[0]?.parameters?.planning;
    if (!run || !plan || s.planId !== plan.id || s.planVersion !== plan.version || s.planDigest !== toolDigest(plan.steps)) throw new ConflictException("PLAN_SOURCE_CHANGED");
    if (run.status === "CANCELLED") return this.blockTx(tx, record, "USER_CANCELLED");
    if (result.plan.steps.every(step => planStepSatisfied(s, step.id))) return this.completeTx(tx, record, result.plan.steps.length);
    // Never replace an expired authorizing session with another session belonging to the user.
    const claims = await this.identity.actor(tx, s.userId, s.organizationId, s.projectId, s.verificationSession ?? s.session);
    const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, s.conversationId);
    this.validatePlan(run, plan, fresh, claims, s.conversationId);
    await tx.agentRun.update({ where: { id: runId }, data: { status: "RUNNING", updatedAt: new Date() } });
    return this.executeNextStepTx(tx, claims, run, plan, result, fresh, record);
  }

  private async completeTx(tx: any, record: RuntimeRecord<PlanExecutionState>, total: number) {
    const s = record.payload;
    await completeLineageTx(this.ledger, tx, s);
    await this.ledger.update(tx, record, { ...s, status: "COMPLETED", pendingReceiptId: null, reason: null }, "settled");
    await tx.agentRun.update({ where: { id: s.runId }, data: { status: "COMPLETED", progressPercent: 100, currentStepIndex: total, completedAt: new Date(), failureReason: null, updatedAt: new Date() } });
    await this.control.event(tx, s.runId, "PLAN_EXECUTION_COMPLETED", { planId: s.planId, planVersion: s.planVersion, totalSteps: total, outcome: "COMPLETED" });
    const changes = s.actions.filter(a => a.change).map(a => `${a.relativePath}\nBefore:\n${a.change!.before}\nAfter:\n${a.change!.after}`);
    const diff = s.actions.filter(a => a.change).map(a => exactChangeDiff(a.relativePath, a.change!.before, a.change!.after)).join("\n\n");
    return this.messageTx(tx, s, `${s.requestId}_final_report`,
      `Execution completed.\n\n${changes.join("\n\n")}\n\nVerification: PASS. The written content and the subsequent read match the approved change.\n` +
      `\nDiff:\n${diff}\n\n` + Object.entries(s.completed).map(([step, receipt]) => `${step}: ${receipt.receiptId}`).join("\n"),
      { planExecutionReport: true, outcome: "COMPLETED", executionPerformed: true, diff });
  }

  async view(runId: string, claims: SessionClaims, planVersion?: number): Promise<PlanExecutionView | null> {
    return this.ledger.transaction(async tx => {
      let record = await executionRecord(tx, runId); if (!record) return null;
      await this.identity.actor(tx, claims.sub, claims.organizationId!, record.payload.projectId);
      if (record.payload.userId !== claims.sub || record.payload.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      if (planVersion !== undefined && record.payload.planVersion !== planVersion) {
        const head = record;
        record = null;
        // Read retained immutable revisions, bounded independently of conversation history.
        for (let revision = head.revision; revision > Math.max(0, head.revision - 128); revision--) {
          const saved = await this.ledger.read<RuntimeRecord<PlanExecutionState>>(tx, "RUNTIME_REVISION", [head.recordId, revision]);
          if (saved?.payload.payload.planVersion === planVersion && ["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"].includes(saved.payload.payload.status)) { record = saved.payload; break; }
        }
        if (!record) throw new ConflictException("EXECUTION_HISTORY_UNAVAILABLE");
      }
      const s = record.payload;
      await this.identity.actor(tx, claims.sub, claims.organizationId!, s.projectId);
      if (s.userId !== claims.sub || s.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      // Historical execution identity is independent of the latest planning version.
      return {
        version: 1 as const, runId, planId: s.planId, planVersion: s.planVersion, revision: record.revision, status: s.status, phase: s.phase, reason: s.reason,
        completedSteps: Object.keys(s.completed).length, totalSteps: s.actions.length,
        observations: Object.values(s.observations ?? {}),
        failureDiagnostics: Object.values(s.failureDiagnostics ?? {}),
        ...(s.lineageId ? { lineageId: s.lineageId, rootPlanId: s.rootPlanId } : {}),
        ...(s.repair ? { repair: s.repair } : {}),
        recovery: s.reason === "OUTCOME_UNKNOWN" || s.phase === "OUTCOME_UNKNOWN" ? "REVIEW_ONLY" :
          verificationOnlyEligible(s) ? "VERIFICATION_ONLY" : s.reason === "EXECUTION_PREPARATION_INTERRUPTED" ? "PREPARATION_REVIEW" : undefined,
        changes: s.actions.flatMap(a => a.change ? [{ path: a.relativePath, ...a.change }] : []),
        receipts: s.actions.filter(a => a.tool === "filesystem.read" && s.completed[a.stepId]).map(a => ({
          id: s.completed[a.stepId].receiptId,
          sourceType: "workspace",
          label: a.relativePath,
          relativePath: a.relativePath,
          outcome: "VERIFIED",
          discovered: true,
          read: true,
          selected: true,
          usedInAnswer: "UNKNOWN" as const,
          truncated: false,
          selectionReason: "Execution phase read verification",
          runtimeReference: {
            workspaceId: s.workspace.workspaceId,
            bindingVersion: s.workspace.version,
            runtimeId: s.workspace.runtimeId,
            runtimeFingerprint: s.workspace.runtimeFingerprint,
            relativePath: a.relativePath,
            projectId: s.projectId,
            organizationId: s.organizationId,
            userId: s.userId,
            conversationId: s.conversationId,
            operationId: s.completed[a.stepId].receiptId,
            requestId: s.completed[a.stepId].receiptId,
            receiptId: s.completed[a.stepId].receiptId,
            verificationState: "VERIFIED" as const,
            observationTime: s.completed[a.stepId].verifiedAt,
            contentIdentity: { status: "UNAVAILABLE" as const },
            encoding: "utf-8-decoded" as const,
            sourceType: "runtime-workspace" as const,
            truncated: false
          }
        }))
      };
    });
  }
}
