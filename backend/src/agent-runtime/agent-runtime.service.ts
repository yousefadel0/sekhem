import { AgentRunRecoveryService } from "./recovery/agent-run-recovery.service";
import { AgentContextProjectionService } from "./context-projection/agent-context-projection.service";
import { readAgentEventPage, resolveAgentEventCursor } from './agent-run-event-replay';
import { decideChange, changeReviewState, readChangeDecisionRevision } from "../conversation/change-selection";
import { recordWorkflowDecisionTx, type WorkflowDecision, workflowDecisionKey } from "./execution/workflow-decision";
import { changeWorkflowPauseTx, type WorkflowPause } from "./workflow-pause";
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { PrismaService } from "../data-access/prisma.service";
import { ConversationService } from "../conversation/conversation.service";
import { SkillRegistryService } from "./skills/skill-registry.service";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";
import { diagnosticFromError } from "../ai-gateway/provider-diagnostic";
import { fileReadOutcome } from "../file-intelligence/file-read-outcome";
import { AgentResultError, isAgentFailureOutcome, persistedRunOutcome, planningOutcome, type AgentOutcome } from "./agent-result";
import { MemoryService } from "./memory/memory.service";
import { AttachmentService, MAX_IMAGE_BASE64_BYTES } from "../attachment/attachment.service";
import { AgentUnderstandingService } from "./understanding/agent-understanding.service";
import { AgentContextBuilderService } from "./understanding/agent-context-builder.service";
import { AgentToolControlService } from "./tools/agent-tool-control.service";
import { AgentDecisionService } from "./tools/agent-decision.service";
import { AgentControlStoreService } from "./tools/agent-control-store.service";
import { RuntimeControlService } from "../trusted-runtime/runtime-control.service";
import { CONTROL_ARTIFACT, presentControl } from "./tools/agent-control.contract";
import type { TrustedToolWorkspace } from "./tools/tool-contract";
import { preferredReadSkillId } from "./understanding/agent-understanding.types";
import { evidenceReceipt, presentPlan, runtimeReadReceipt, type EvidenceReceipt } from "./understanding/agent-presentation";
import { WorkspaceRuntimeEvidenceService } from "../workspace-intelligence/workspace-runtime-evidence.service";
import { AgentInspectionService } from "./inspection/agent-inspection.service";
import { assertConversationBinding, conversationMode } from "../conversation/conversation-mode";
import { requestsWorkspace } from "./workspace-intent";
import { generatePersistedPlan, generateConversationPlan, certifiedConversationContext, preparePlanHandoff, isEngineeringPlanningRun } from "./understanding/persisted-planning";
import { AgentPlanExecutionService } from "./execution/agent-plan-execution.service";
import { ExactProposalService, exactContinuationRunTx } from "./execution/exact-proposal.service";
import { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import { prepareChangeSet } from "../conversation/change-set";
import { ExactProposalApprovalService } from "./execution/exact-proposal-approval.service";
import { ExactProposalPermitService } from "./execution/exact-proposal-permit.service";
import { approvePlanWorkflow } from "./execution/approved-plan-workflow";
import type { RuntimeEvidenceReference } from "../workspace-intelligence/workspace-runtime.contract";
import { ProjectAccessService } from "../auth/project-access.service";
import { WorkspaceBindingService, type WorkspaceBinding } from "../workspace-intelligence/workspace-binding.service";
import { ResourceAuthorizationService, type AuthSubject } from "../auth/resource-authz.service";
import { AuditService } from "../audit/audit.service";
import type { SessionClaims } from "../auth/auth.dto";
import type { AuthRoleDto } from "../auth/auth.dto";
import type {
  AgentPlanDto,
  AgentPlanStep,
  AgentRunDetailDto,
  AgentRunStatus,
  AgentRunSummaryDto,
  StartAgentRunDto,
  PauseRunDto,
  CancelRunDto,
  SteerRunDto
} from "./agent-run.dto";
import {
  persistableAiCallTrace,
  SkillExecutionFailedError,
  type SkillExecutionContext
} from "./skills/skill.interface";

/**
 * AgentRuntimeService
 *
 * Implements the core durable asynchronous Agent execution runtime:
 * 1. Persistent AgentRun creation with immediate return to HTTP callers.
 * 2. Background execution decoupled from HTTP socket and browser lifetimes.
 * 3. Step execution through SkillRegistryService.
 * 4. Comprehensive event, artifact, and status transition persistence.
 * 5. Server-derived tamper-resistant security auditing via AuditService.
 * 6. Mandatory authorization and safety gate enforcement via ResourceAuthorizationService.
 * 7. Safe startup recovery of unfinished runs.
 */
@Injectable()
export class AgentRuntimeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentRuntimeService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prisma: any | null = null;
  private readonly runningRunIds: Set<string> = new Set();
  private conversationService: ConversationService | null = null;

  constructor(
    @Inject(SkillRegistryService) private readonly skillRegistry: SkillRegistryService,
    @Inject(ResourceAuthorizationService) private readonly resourceAuthz: ResourceAuthorizationService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(PrismaService) prismaService?: PrismaService,
    @Optional() @Inject(forwardRef(() => ConversationService)) conversationService?: ConversationService,
    @Optional() @Inject(AiGatewayService) private readonly aiGateway?: AiGatewayService,
    @Optional() @Inject(MemoryService) private readonly memoryService?: MemoryService,
    @Optional() @Inject(AttachmentService) private readonly attachmentService?: AttachmentService,
    @Optional() @Inject(AgentUnderstandingService) private readonly understandingService?: AgentUnderstandingService,
    @Optional() @Inject(AgentContextBuilderService) private readonly contextBuilder?: AgentContextBuilderService,
    @Optional() @Inject(AgentToolControlService) private readonly toolControl?: AgentToolControlService,
    @Optional() @Inject(ProjectAccessService) private readonly projectAccess?: ProjectAccessService,
    @Optional() @Inject(WorkspaceBindingService) private readonly workspaceBindings?: WorkspaceBindingService,
    @Optional() @Inject(AgentDecisionService) private readonly decisions?: AgentDecisionService,
    @Optional() @Inject(AgentControlStoreService) private readonly controlStore?: AgentControlStoreService,
    @Optional() @Inject(RuntimeControlService) private readonly runtimeControl?: RuntimeControlService,
    @Optional() @Inject(WorkspaceRuntimeEvidenceService) private readonly runtimeEvidence?: WorkspaceRuntimeEvidenceService,
    @Optional() @Inject(AgentInspectionService) private readonly inspections?: AgentInspectionService,
    @Optional() @Inject(forwardRef(() => AgentPlanExecutionService)) private readonly planExecution?: AgentPlanExecutionService,
    @Optional() @Inject(ExactProposalService) private readonly exactProposals?: ExactProposalService,
    @Optional() @Inject(ExactProposalApprovalService) private readonly exactProposalApprovals?: ExactProposalApprovalService,
    @Optional() @Inject(ExactProposalPermitService) private readonly exactProposalPermits?: ExactProposalPermitService,
    @Optional() @Inject(AgentContextProjectionService) private readonly projection?: AgentContextProjectionService,
    @Optional() @Inject(AgentRunRecoveryService) private readonly recovery?: AgentRunRecoveryService
  ) {
    if (prismaService) {
      this.prisma = prismaService;
    }
    if (conversationService) {
      this.conversationService = conversationService;
    }
    this.inspections?.setPlanningContinuation?.((conversationId, claims, objective, requestId, sourceRunId) =>
      this.planFromConversation(conversationId, claims, objective, requestId, sourceRunId));
  }

  private getConversationService(): ConversationService | null {
    if (this.conversationService) {
      return this.conversationService;
    }
    if (this.prisma) {
      this.conversationService = new ConversationService(this.prisma);
      return this.conversationService;
    }
    return null;
  }

  private subjectFromClaims(claims: SessionClaims): AuthSubject {
    return {
      userId: claims.sub,
      email: claims.email,
      displayName: claims.displayName,
      role: claims.role,
      organizationId: claims.organizationId,
      isSystemAdmin: claims.role === "Admin"
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.decisions?.recover();
    await this.recoverUnfinishedRuns();
  }
  async generatePlan(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.inspections || !this.contextBuilder || !this.understandingService || !this.aiGateway) throw new ServiceUnavailableException("Planning unavailable");
    return generatePersistedPlan({ inspections: this.inspections, contexts: this.contextBuilder, understanding: this.understandingService, gateway: this.aiGateway }, claims, conversationId, body);
  }
  async planFromConversation(conversationId: string, claims: SessionClaims, instruction: string, requestId: string, sourceRunId?: string, continuationMessage?: string) {
    if (!this.inspections || !this.contextBuilder || !this.understandingService || !this.aiGateway) throw new ServiceUnavailableException("Planning unavailable");
    return generateConversationPlan({ inspections: this.inspections, contexts: this.contextBuilder, understanding: this.understandingService, gateway: this.aiGateway }, claims, conversationId, instruction, requestId, sourceRunId, continuationMessage);
  }
  async certifiedConversationContext(conversationId: string, claims: SessionClaims, instruction: string) {
    if (!this.inspections || !this.contextBuilder) return null;
    return certifiedConversationContext({ inspections: this.inspections, contexts: this.contextBuilder }, claims, conversationId, instruction);
  }
  async changeDecisionRevision(conversationId: string, claims: SessionClaims, setId: string, revision: number) {
    if (!this.inspections) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return readChangeDecisionRevision(this.inspections.ledger, conversationId, claims, setId, revision);
  }
  async decideChange(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.inspections) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return decideChange({ ledger: this.inspections.ledger, inspections: this.inspections }, conversationId, claims, body);
  }
  async changeReviewState(conversationId: string, claims: SessionClaims, set: any) {
    if (!this.inspections) return { available: false, reason: "CHANGE_SET_UNAVAILABLE" };
    return changeReviewState({ ledger: this.inspections.ledger, inspections: this.inspections }, conversationId, claims, set);
  }
  async prepareChangeSet(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.inspections || !this.contextBuilder) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return prepareChangeSet({ ledger: this.inspections.ledger, inspections: this.inspections,
      certified: this.certifiedConversationContext.bind(this) }, conversationId, claims, body);
  }
  async preparePlanHandoff(conversationId: string, claims: SessionClaims, instruction: string, requestId: string) {
    if (!this.inspections || !this.contextBuilder) throw new ServiceUnavailableException("Plan handoff unavailable");
    return preparePlanHandoff({ inspections: this.inspections, contexts: this.contextBuilder }, claims, conversationId, instruction, requestId);
  }
  async prepareExactProposal(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.exactProposals) throw new ServiceUnavailableException("Exact proposal preparation unavailable");
    return this.exactProposals.prepare(conversationId, claims, body);
  }
  async decidePlanWorkflow(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.runtimeControl) throw new ServiceUnavailableException("WORKFLOW_CONTROL_UNAVAILABLE");
    const b = body as any, plan = await this.requirePrisma().agentPlan.findUnique({ where: { id: b?.planId ?? "" } });
    if (!plan) throw new NotFoundException("PLAN_READY_REQUIRED");
    await this.getRun(plan.agentRunId, claims);
    return this.runtimeControl.ledger.transaction(async tx => {
      const run = await tx.agentRun.findUnique({ where: { id: plan.agentRunId } });
      await this.runtimeControl!.identity.actor(tx, claims.sub, claims.organizationId!, run.projectId,
        { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      return recordWorkflowDecisionTx(this.runtimeControl!.ledger, tx, conversationId, claims.sub, body);
    });
  }
  async approvePlanWorkflow(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.runtimeControl || !this.exactProposals || !this.exactProposalApprovals || !this.exactProposalPermits || !this.planExecution)
      throw new ServiceUnavailableException("WORKFLOW_EXECUTION_UNAVAILABLE");
    return approvePlanWorkflow({ ledger: this.runtimeControl.ledger, proposals: this.exactProposals,
      approvals: this.exactProposalApprovals, permits: this.exactProposalPermits, executor: this.planExecution,
      control: this.runtimeControl }, conversationId, claims, body);
  }
  async continueExactProposal(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.exactProposals) throw new ServiceUnavailableException("Exact proposal preparation unavailable");
    return this.exactProposals.continuePlan(conversationId, claims, body);
  }
  async exactProposalApproval(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, deciding: boolean) {
    if (!this.exactProposalApprovals) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return deciding ? this.exactProposalApprovals.decide(conversationId, proposalId, claims, body) :
      this.exactProposalApprovals.request(conversationId, proposalId, claims, body);
  }
  async issueExactProposalPermit(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!this.exactProposalPermits) throw new ServiceUnavailableException("EXACT_PERMIT_UNAVAILABLE");
    return this.exactProposalPermits.issue(conversationId, proposalId, claims, body);
  }
  async executeExactProposal(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!this.planExecution) throw new ServiceUnavailableException("EXACT_EXECUTION_UNAVAILABLE");
    return this.planExecution.executeExactProposal(conversationId, proposalId, claims, body);
  }
  async taskConsent(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, approve = false, scope: "TASK" | "SESSION" = "TASK") {
    if (!this.exactProposalApprovals) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return approve ? this.exactProposalApprovals.requestTaskApproval(conversationId, proposalId, claims, body) : this.exactProposalApprovals.taskConsent(conversationId, proposalId, claims, body, scope);
  }
  async readTaskConsent(conversationId: string, policyId: string, claims: SessionClaims, revoke = false) {
    if (!this.exactProposalApprovals) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return this.exactProposalApprovals.readTaskConsent(conversationId, policyId, claims, revoke);
  }
  async recoverExecutionVerification(conversationId: string, runId: string, claims: SessionClaims, requestId: string) {
    if (!this.planExecution) throw new ServiceUnavailableException("EXACT_EXECUTION_UNAVAILABLE");
    return this.planExecution.recoverVerification(conversationId, runId, claims, requestId);
  }
  async executePlan(conversationId: string, claims: SessionClaims, instruction: string, requestId: string) {
    if (this.planExecution) {
      return this.planExecution.executePlan(conversationId, claims, instruction, requestId);
    }
    return this.preparePlanHandoff(conversationId, claims, instruction, requestId);
  }

  /** Explicit server-side control-plane entry point; no autonomous decision loop. */
  async applyDecision(runId: string, claims: SessionClaims, proposal: unknown, workspace?: TrustedToolWorkspace) {
    if (!this.toolControl) throw new ServiceUnavailableException("Tool control plane unavailable");
    return this.toolControl.applyDecision(runId, claims, proposal, workspace);
  }

  async decideToolApproval(runId: string, approvalId: string, claims: SessionClaims, body: unknown) {
    if (!this.toolControl) throw new ServiceUnavailableException("Tool control plane unavailable");
    return this.toolControl.decideApproval(runId, approvalId, claims, body);
  }

  async decideAction(runId: string, cookie: string | undefined, body: unknown) {
    if (!this.decisions) throw new ServiceUnavailableException("Decision control plane unavailable");
    return this.decisions.decide(runId, cookie, body);
  }

  async approveAction(runId: string, approvalId: string, cookie: string | undefined, body: unknown) {
    if (!this.decisions) throw new ServiceUnavailableException("Decision control plane unavailable");
    return this.decisions.approve(runId, approvalId, cookie, body);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requirePrisma(): any {
    if (!this.prisma) {
      throw new ServiceUnavailableException("Database service is unavailable in this environment");
    }
    return this.prisma;
  }

  // ---------------------------------------------------------------------------
  // 1. Create Agent Run
  // ---------------------------------------------------------------------------

  async createRun(claims: SessionClaims, dto: StartAgentRunDto): Promise<AgentRunSummaryDto> {
    const db = this.requirePrisma();

    // Perform the entire creation within a transaction
    const runSummary = await db.$transaction(async (tx: any) => {
      return await this.createRunTx(tx, claims, dto);
    });

    // Schedule background execution only after successful commit
    this.scheduleRunExecution(runSummary.id, claims, dto.instruction.trim());

    return runSummary;
  }

  /**
   * Transaction-aware creation of an AgentRun.
   * Must be called inside an existing Prisma transaction using the provided `tx` client.
   * Does not schedule background execution.
   */
  async createRunTx(tx: any, claims: SessionClaims, dto: StartAgentRunDto, originatingMessageId?: string, planningObjective?: string): Promise<AgentRunSummaryDto> {
    if (!dto.projectId?.trim()) {
      throw new BadRequestException("projectId is required");
    }
    if (!dto.instruction?.trim()) {
      throw new BadRequestException("instruction is required");
    }
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const title = dto.title?.trim() || `Task: ${dto.instruction.trim().slice(0, 60)}`;
    if (this.projectAccess) await this.projectAccess.assert(claims, dto.projectId.trim(), "CREATE");

    // Authorize run creation under project and organization
    await this.resourceAuthz.assertAuthorized(
      this.subjectFromClaims(claims),
      "CREATE",
      {
        resourceType: "AgentRun",
        id: runId,
        projectId: dto.projectId.trim(),
        organizationId: claims.organizationId,
        userId: claims.sub
      }
    );

    let conversationId = dto.conversationId?.trim();
    let runtimeEvidence: RuntimeEvidenceReference[] | undefined;
    if (dto.runtimeEvidence !== undefined) {
      if (!conversationId || !this.runtimeEvidence) throw new BadRequestException("Runtime evidence requires its existing Conversation and admission service");
      runtimeEvidence = await this.runtimeEvidence.validateReferences(claims, dto.projectId.trim(), conversationId, dto.runtimeEvidence);
    }
    let workspaceBinding: WorkspaceBinding | null = null;
    let conversationMetadata: Record<string, unknown> = {};

    if (conversationId) {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) throw new NotFoundException(`Conversation '${conversationId}' not found`);
      if (conv.userId !== claims.sub || conv.projectId !== dto.projectId.trim()) {
        throw new ForbiddenException("Conversation does not belong to this actor and project");
      }
      conversationMetadata = conv.metadata ?? {};
      if (conversationMode(conv) === "AUTOMATION") throw new BadRequestException("AUTOMATION_NOT_ENABLED");
    } else {
      // Create a backing conversation to satisfy durable foreign key constraint
      const newConvId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const createdConv = await tx.conversation.create({
        data: {
          id: newConvId,
          projectId: dto.projectId.trim(),
          userId: claims.sub,
          title: dto.title?.trim() || `Agent: ${dto.instruction.trim().slice(0, 50)}`,
          status: "active",
          metadata: { autoCreatedForAgentRun: true }
        }
      });
      conversationId = createdConv.id as string;
    }
    const inspectionBinding = this.inspections ? await this.inspections.bindingTx(tx, claims, dto.projectId.trim()) : null;
    if (conversationMetadata.modeContext && inspectionBinding) assertConversationBinding({ userId: claims.sub, projectId: dto.projectId.trim(), metadata: conversationMetadata }, inspectionBinding);
    if (this.inspections && !inspectionBinding && (requestsWorkspace(dto.instruction) || runtimeEvidence?.length)) {
      throw new BadRequestException("WORKSPACE_BINDING_REQUIRED: connect and verify a Trusted Runtime workspace before inspection");
    }
    if (this.workspaceBindings && !inspectionBinding) {
      try {
        const previous = conversationMetadata.workspaceBinding as WorkspaceBinding | undefined;
        workspaceBinding = (await this.workspaceBindings.resolve(claims, dto.projectId.trim(), previous?.version)).binding;
        await tx.conversation.update({ where: { id: conversationId }, data: { metadata: { ...conversationMetadata, workspaceBinding } } });
      } catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
    }

    const now = new Date();

    const run = await tx.agentRun.create({
      data: {
        id: runId,
        conversationId,
        projectId: dto.projectId.trim(),
        userId: claims.sub,
        agentName: "SekhemEngineer",
        title,
        status: "QUEUED",
        planVersion: 1,
        currentStepIndex: 0,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now
      }
    });

    // Record audit event using transaction client
    await this.auditService.recordWithClaimsTx(tx, claims, {
      action: "AGENT_RUN_CREATE",
      resourceType: "AgentRun",
      resourceId: runId,
      details: {
        projectId: dto.projectId.trim(),
        title,
        conversationId
      }
    });

    // Record initial lifecycle event using transaction client
    await this.recordEventTx(tx, runId, "STATUS_CHANGE", {
      previousStatus: null,
      newStatus: "QUEUED",
      reason: "Agent run queued for analysis and planning"
    });
    if (inspectionBinding && this.inspections) {
      await this.inspections.initializeTx(tx, run, claims, inspectionBinding, dto.instruction.trim(), dto.attachmentIds, runtimeEvidence, originatingMessageId, planningObjective);
      return this.mapRunSummary(run);
    }

    // Persist only structured understanding metadata through the existing event
    // stream. The full in-memory context is never a chain-of-thought record.
    const availableCapabilityIds = this.skillRegistry.getAvailableSkills(claims.role).map((skill) => skill.id);
    const understanding = this.understandingService?.understand({
      userId: claims.sub,
      projectId: dto.projectId.trim(),
      conversationId,
      agentRunId: runId,
      instruction: dto.instruction.trim(),
      attachmentIds: dto.attachmentIds,
      runtimeEvidence,
      hasMemoryContext: Boolean(this.memoryService),
      hasConversationHistory: true,
      workspaceAvailable: availableCapabilityIds.includes("workspace_reader"),
      repositoryAvailable: availableCapabilityIds.includes("repo_snapshot_reader"),
      availableCapabilities: availableCapabilityIds
    });
    const planningOnly = Boolean(runtimeEvidence?.length || (understanding && this.understandingService?.requiresPlanning(understanding)));
    if (understanding) {
      await this.recordEventTx(tx, runId, "UNDERSTANDING_STARTED", {
        intents: understanding.userIntent,
        operationClass: understanding.operationClass
      });
      await this.recordEventTx(tx, runId, "CONTEXT_RESOLVED", {
        selectedCapabilities: understanding.selectedCapabilities,
        missingContext: understanding.missingContext,
        warnings: understanding.warnings,
        attachmentCount: understanding.attachmentContext.attachmentIds.length,
        workspaceRequired: understanding.workspaceContext.required
      });
      await this.recordEventTx(tx, runId, "CAPABILITY_SELECTED", {
        capabilities: understanding.selectedCapabilities,
        operationClass: understanding.operationClass
      });
      if (!planningOnly) await this.recordEventTx(tx, runId, "PLAN_CREATED", {
        plannedStepCount: understanding.plan.length,
        plan: understanding.plan,
        verification: understanding.verificationState.strategy,
        verificationRequired: understanding.verificationState.required
      });
      if (understanding.verificationState.required) {
        await this.recordEventTx(tx, runId, "VERIFICATION_REQUIRED", {
          strategy: understanding.verificationState.strategy,
          selectedCapabilities: understanding.selectedCapabilities
        });
      }
    }

    // Generate and persist initial execution plan using transaction client
    await this.createInitialPlan(
      tx,
      runId,
      claims.role,
      dto.instruction.trim(),
      conversationId,
      dto.attachmentIds,
      understanding?.selectedCapabilities ?? [],
      planningOnly,
      workspaceBinding,
      originatingMessageId,
      runtimeEvidence
    );

    return this.mapRunSummary(run);
  }

  /**
   * Schedule background asynchronous execution after transaction commit.
   */
  public scheduleRunExecution(runId: string, claims: SessionClaims, instruction: string): void {
    setImmediate(() => {
      void this.executeRun(runId, claims, instruction).catch(() => this.logger.error("Run advancement unavailable; durable recovery will reconcile without replaying operations"));
    });
  }

  /**
   * Dedicated conversational path for normal chat.
   * Routes user message and conversation history directly through existing AiGatewayService
   * to the real configured model (GLM-5.2-Abliterated) without creating background task execution runs.
   */
  public async executeChat(
    claims: SessionClaims,
    input: {
      conversationId: string;
      instruction: string;
      history?: Array<{ role: string; content: string }>;
      historicalMemory?: import("./memory/historical-memory").HistoricalMemoryContext;
      imageAttachmentIds?: string[];
    }
  ): Promise<{ answer: string; modelId: string | null; providerId: string | null; diagnostic?: import("../ai-gateway/provider-diagnostic").ProviderDiagnostic; contextBudget?: import("../ai-gateway/assistant-context-budget").ContextBudgetMetadata }> {
    if (!input.instruction || !input.instruction.trim()) {
      throw new BadRequestException("instruction is required");
    }

    const aiGateway = this.aiGateway || this.skillRegistry?.getAiGateway?.();
    if (!aiGateway) {
      throw new ServiceUnavailableException("AI Gateway is unavailable");
    }

    let memoryContext: string | null = null;
    if (this.memoryService && claims?.sub) {
      try {
        memoryContext = await this.memoryService.buildMemoryContext(claims.sub);
      } catch (memErr) {
        this.logger.warn(`Failed to build memory context: ${(memErr as Error).message}`);
      }
    }

    // Ephemeral server-side image loading for multimodal invocation only
    const images: string[] = [];
    if (this.attachmentService && input.imageAttachmentIds && input.imageAttachmentIds.length > 0) {
      for (const attId of input.imageAttachmentIds) {
        try {
          const file = await this.attachmentService.getAttachmentBuffer(claims.sub, attId);
          if (file && file.mimeType.startsWith("image/")) {
            // Guard: reject images that would produce an oversized base64 payload
            // base64 overhead ≈ 4/3x raw size; we use 4 MB raw → ~5.3 MB encoded
            if (file.buffer.length > MAX_IMAGE_BASE64_BYTES) {
              this.logger.warn(
                `Skipping image attachment [id=${attId}]: ` +
                `raw size ${(file.buffer.length / (1024 * 1024)).toFixed(1)} MB exceeds ` +
                `the ${MAX_IMAGE_BASE64_BYTES / (1024 * 1024)} MB server-side conversion limit`
              );
              continue;
            }
            images.push(`data:${file.mimeType};base64,${file.buffer.toString("base64")}`);
          }
        } catch (err) {
          this.logger.warn(`Failed to load image attachment [id=${attId}]: ${(err as Error).message}`);
        }
      }
    }

    const request = {
      question: input.instruction,
      requestedBy: claims.sub,
      history: input.history,
      ...(memoryContext ? { memoryContext } : {}),
      ...(input.historicalMemory ? { historicalMemory: input.historicalMemory } : {}),
      ...(images.length > 0 ? { images } : {})
    };
    const result = await aiGateway.askAssistant(request);

    if (result.status === "POLICY_BLOCKED") {
      throw new BadRequestException("Message blocked by security policy");
    }

    if (result.status !== "REAL_PROVIDER" || typeof result.answer !== "string" || !result.answer.trim()) {
      const classification = result.httpClassification || "UNAVAILABLE";
      const error = new ServiceUnavailableException(`AI Provider unavailable: ${classification}`);
      if (result.diagnostic) Object.assign(error, { providerDiagnostic: result.diagnostic });
      throw error;
    }

    return {
      answer: result.answer.trim(),
      modelId: result.modelId || "GLM-5.2-Abliterated",
      providerId: result.providerId,
      ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
      ...(result.contextBudget ? { contextBudget: result.contextBudget } : {})
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Initial Plan Generation
  // ---------------------------------------------------------------------------

  private async createInitialPlan(
    tx: any,
    agentRunId: string,
    userRole: AuthRoleDto,
    instruction: string,
    conversationId?: string,
    attachmentIds?: string[],
    selectedCapabilities: string[] = [],
    planningOnly = false,
    workspaceBinding?: WorkspaceBinding | null,
    originatingMessageId?: string,
    runtimeEvidence?: RuntimeEvidenceReference[]
  ): Promise<AgentPlanDto> {
    const availableSkills = this.skillRegistry.getAvailableSkills(userRole);
    if (availableSkills.length === 0) {
      throw new ForbiddenException(`No skills available for role '${userRole}'`);
    }

    const availableIds = availableSkills.map((skill) => skill.id);
    const aligned = preferredReadSkillId(selectedCapabilities.filter((id) => availableIds.includes(id)));
    const lower = instruction.toLowerCase();
    let selectedSkillId = aligned ?? "memo_generator";

    if (!aligned) {
      if (Array.isArray(attachmentIds) && attachmentIds.length > 0 && conversationId) {
        selectedSkillId = "attachment_reader";
      } else if (lower.includes("snapshot") || lower.includes("repo") || lower.includes("git")) {
        selectedSkillId = "repo_snapshot_reader";
      } else if (lower.includes("security") || lower.includes("finding") || lower.includes("vulnerability")) {
        selectedSkillId = "security_finding_analyzer";
      } else if (lower.includes("blocker") || lower.includes("rollback")) {
        selectedSkillId = "blocker_investigator";
      } else if (
        lower.includes("workspace") ||
        lower.includes("list files") ||
        lower.includes("project structure") ||
        lower.includes("inspect file") ||
        lower.includes("read file") ||
        lower.includes("search files")
      ) {
        selectedSkillId = "workspace_reader";
      }
    }

    // Ensure selected skill is available for user's role, otherwise fallback to first available
    let skill = availableSkills.find((s) => s.id === selectedSkillId);
    if (!skill) {
      skill = availableSkills[0];
    }

    const step: AgentPlanStep = planningOnly ? {
      index: 0, title: "Understand and plan", description: instruction, skillId: "", planningOnly: true,
      parameters: { conversationId, attachmentIds: attachmentIds ?? [] }, requiresApproval: false
    } : {
      index: 0,
      title: skill.name,
      description: instruction,
      skillId: skill.id,
      parameters: this.deriveParametersForSkill(skill.id, instruction, conversationId, attachmentIds),
      requiresApproval: skill.requiresApproval
    };

    if (this.workspaceBindings) step.parameters = { ...step.parameters, workspaceBinding: workspaceBinding ?? null };
    if (originatingMessageId) step.parameters = { ...step.parameters, originatingMessageId };
    if (runtimeEvidence) step.parameters = { ...step.parameters, runtimeEvidence };
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await tx.agentPlan.create({
      data: {
        id: planId,
        agentRunId,
        version: 1,
        summary: planningOnly ? "Engineering understanding and planning; no execution." : `Execute ${skill.name} for: ${instruction.slice(0, 80)}`,
        steps: [step],
        requiresApproval: planningOnly ? false : skill.requiresApproval,
        status: planningOnly ? "PLANNING" : "ACTIVE",
        createdAt: now
      }
    });

    return {
      id: planId,
      agentRunId,
      version: 1,
      summary: planningOnly ? "Engineering understanding and planning; no execution." : `Execute ${skill.name} for: ${instruction.slice(0, 80)}`,
      steps: [step],
      requiresApproval: planningOnly ? false : skill.requiresApproval,
      status: planningOnly ? "PLANNING" : "ACTIVE",
      reviewedBy: null,
      reviewNotes: null,
      createdAt: now
    };
  }

  private deriveParametersForSkill(
    skillId: string,
    instruction: string,
    conversationId?: string,
    attachmentIds?: string[]
  ): Record<string, unknown> {
    switch (skillId) {
      case "memo_generator":
        return { topic: instruction, context: "Auto-planned execution" };
      case "repo_snapshot_reader":
        return { repositoryConnectionId: "default", ref: "main" };
      case "security_finding_analyzer":
        return { findings: [], policyThreshold: "high" };
      case "blocker_investigator":
        return { blockers: [] };
      case "workspace_reader":
        return { operation: "auto", instruction };
      case "attachment_reader":
        return {
          conversationId,
          attachmentIds: Array.isArray(attachmentIds) ? attachmentIds.filter((id) => typeof id === "string").slice(0, 5) : []
        };
      default:
        return { instruction };
    }
  }

  /** Extract only explicit, bounded attachment references from the persisted plan. */
  private attachmentIdsFromPlan(steps: AgentPlanStep[]): string[] {
    return [...new Set(steps.flatMap((step) => {
      const ids = step.parameters?.attachmentIds;
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
    }))].slice(0, 5);
  }

  // ---------------------------------------------------------------------------
  // 3. Background Asynchronous Step Runner
  // ---------------------------------------------------------------------------

  async executeRun(runId: string, claims: SessionClaims, _rootInstruction?: string): Promise<void> {
    const db = this.requirePrisma();
    if (isEngineeringPlanningRun(runId)) return; // Explicit planning endpoint only; no replay or skill dispatch.
    if (this.inspections && await this.inspections.has(runId)) { await this.inspections.advance(runId); return; }

    // Prevent duplicate in-process execution of the same run
    if (this.runningRunIds.has(runId)) {
      return;
    }
    this.runningRunIds.add(runId);

    try {
      // 1. Reload run state from persistence
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const run = await db.agentRun.findUnique({
        where: { id: runId },
        include: { plans: { orderBy: { version: "desc" }, take: 1 } }
      });

      if (!run) return;

      // Do not re-execute finished, paused, or approval-blocked runs
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (["COMPLETED", "FAILED", "CANCELLED", "PAUSED", "AWAITING_APPROVAL"].includes(run.status as string)) {
        return;
      }

      // Verify execution authorization under project
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await this.resourceAuthz.assertAuthorized(
        this.subjectFromClaims(claims),
        "EXECUTE",
        {
          resourceType: "AgentRun",
          id: runId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          projectId: run.projectId as string,
          organizationId: claims.organizationId,
          userId: run.userId as string
        }
      );

      // Transition to RUNNING
      if (await this.toolControl?.suspendRecoveredBoundary(runId, claims)) return;
      const startTime = new Date();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await db.agentRun.update({
        where: { id: runId, status: { in: ["QUEUED", "PLANNING", "RUNNING"] } },
        data: {
          status: "RUNNING",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          startedAt: run.startedAt ?? startTime,
          updatedAt: startTime
        }
      });

      await this.recordEvent(runId, "STATUS_CHANGE", {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        previousStatus: run.status,
        newStatus: "RUNNING"
      });

      await this.auditService.recordWithClaims(claims, {
        action: "AGENT_RUN_START",
        resourceType: "AgentRun",
        resourceId: runId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        details: { projectId: run.projectId, startedAt: startTime }
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const plan = run.plans?.[0];
      if (!plan) {
        throw new Error("No execution plan found for agent run");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const rawSteps = plan.steps;
      const steps: AgentPlanStep[] = Array.isArray(rawSteps)
        ? (rawSteps as AgentPlanStep[])
        : JSON.parse(rawSteps as string);

      if (steps.length === 0) {
        throw new Error("Execution plan has no steps");
      }

      const planningOnly = steps.some(step => step.planningOnly === true);
      if (planningOnly && (steps.length !== 1 || steps[0].skillId !== "")) {
        throw new Error("Planning work items cannot contain executable skills");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const startIndex = (run.currentStepIndex as number) || 0;
      let collectedMemoContent: string | null = null;
      let outcome: AgentOutcome = "COMPLETED";
      const availableCapabilityIds = this.skillRegistry.getAvailableSkills(claims.role).map((skill) => skill.id);
      const groundedContext = this.contextBuilder
        ? await this.contextBuilder.build({
          userId: claims.sub,
          projectId: run.projectId as string,
          conversationId: run.conversationId as string,
          agentRunId: runId,
          workspaceVersion: (steps[0]?.parameters?.workspaceBinding as WorkspaceBinding | undefined)?.version ??
            (steps[0]?.parameters && "workspaceBinding" in steps[0].parameters ? "UNBOUND" : undefined),
          instruction: planningOnly ? steps[0].description : _rootInstruction ?? run.title as string,
          attachmentIds: this.attachmentIdsFromPlan(steps),
          runtimeEvidence: steps[0]?.parameters?.runtimeEvidence as RuntimeEvidenceReference[] | undefined,
          sessionClaims: claims,
          hasMemoryContext: Boolean(this.memoryService),
          hasConversationHistory: true,
          repositoryAvailable: availableCapabilityIds.includes("repo_snapshot_reader"),
          availableCapabilities: availableCapabilityIds,
          userRole: claims.role,
          organizationId: claims.organizationId
        })
        : undefined;
      // Serialization finalizes truncation metadata before the content-free audit is recorded.
      const visibleEvidence = new Map<string, string>();
      const groundedPrompt = groundedContext ? this.contextBuilder!.toReasoningPrompt(groundedContext, visibleEvidence) : undefined;
      if (groundedContext) {
        steps[0].parameters = { ...steps[0].parameters,
          evidenceReceipt: evidenceReceipt(groundedContext), contextWarnings: groundedContext.warnings.slice(0, 12) };
        await db.agentPlan.update({ where: { id: plan.id }, data: { steps } });
        const evidenceAudit = this.contextBuilder!.evidenceAuditPayload(groundedContext);
        await this.recordEvent(runId, "EVIDENCE_COLLECTED", evidenceAudit);
        await this.auditService.recordWithClaims(claims, {
          action: "AGENT_EVIDENCE_COLLECT",
          resourceType: "AgentRun",
          resourceId: runId,
          details: evidenceAudit
        });
      }

      if (planningOnly) {
        if (!groundedContext || !groundedPrompt || !this.understandingService) throw new Error("Planning context is unavailable");
        const planning = await this.understandingService.createPlan(groundedContext, groundedPrompt, visibleEvidence,
          this.aiGateway || this.skillRegistry.getAiGateway());
        if (!planning) throw new Error("Engineering planning contract is unavailable");
        outcome = planningOutcome(planning);
        const fresh = await db.agentRun.findUnique({ where: { id: runId } });
        if (!fresh || ["PAUSED", "CANCELLED", "AWAITING_APPROVAL"].includes(fresh.status)) return;
        // Reuse AgentPlan.steps JSON. The result is data on a non-dispatchable work item.
        // Never convert proposed IMPLEMENT/VERIFY steps to skill IDs or executable parameters.
        await db.agentPlan.update({ where: { id: plan.id }, data: {
          steps: [{ ...steps[0], parameters: { ...steps[0].parameters, planning, outcome } }],
          summary: "Engineering understanding and proposed plan; execution not authorized.", status: planning.plan.readiness
        } });
        const metadata = {
          outcome,
          providerDiagnostics: groundedContext.providerDiagnostics ?? [],
          phase: 4, understandingReadiness: planning.understanding.readiness, planReadiness: planning.plan.readiness,
          confidence: planning.understanding.confidence, factCount: planning.understanding.facts.length,
          unknownCount: planning.understanding.unknowns.length, stepCount: planning.plan.steps.length,
          validation: planning.plan.validation, authorization: planning.plan.authorization
        };
        if (outcome === "PLAN_READY") {
          await this.recordEvent(runId, "UNDERSTANDING_COMPLETED", metadata);
          await this.recordEvent(runId, "PLAN_CREATED", { phase: 4, stepCount: planning.plan.steps.length, outcome });
        }
        await this.recordEvent(runId, "PLAN_VALIDATED", metadata);
        await this.auditService.recordWithClaims(claims, { action: "AGENT_PLAN_VALIDATE", resourceType: "AgentRun", resourceId: runId, details: metadata });
        // Persist the decision stage before terminal SSE/restoration can observe completion.
        if (outcome === "PLAN_READY") await this.decisions?.planReady(runId);
        collectedMemoContent = [
          `Result: ${outcome}.`,
          `Understanding: ${planning.understanding.readiness}. Plan: ${planning.plan.readiness}.`,
          "Proposed work only. No plan step was executed; authorization is not granted.",
          ...(outcome === "PLAN_READY" && groundedContext.evidence.some(item => item.runtimeReference) ? [
            ...planning.understanding.facts.map(fact => `Observed (${fact.evidenceRef}): ${fact.text}`),
            ...planning.understanding.inferences.map(item => `Inference (${item.factIds.join(", ")}): ${item.text} Uncertainty: ${item.uncertainty}`),
            ...planning.understanding.hypotheses.map(item => `Hypothesis: ${item.text} Uncertainty: ${item.uncertainty}`)
          ] : []),
          ...planning.plan.steps.map(step => `[${step.status}] ${step.type}: ${step.purpose}`),
          ...(!isAgentFailureOutcome(outcome) ? planning.plan.missingInformation.filter(item => item.state === "UNKNOWN").map(item => `Needs information: ${item.description}`) : []),
          ...planning.plan.validation.issues.map(issue => `Validation: ${issue.code}`)
        ].join("\n");
      }

      for (let i = startIndex; !planningOnly && i < steps.length; i++) {
        const step = steps[i];

        // Check if run was paused or cancelled in persistence between steps
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const freshRun = await db.agentRun.findUnique({ where: { id: runId } });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!freshRun || ["PAUSED", "CANCELLED", "AWAITING_APPROVAL"].includes(freshRun.status as string)) {
          return;
        }

        const skill = this.skillRegistry.getSkill(step.skillId, claims.role);

        // Enforce approval gate before step execution
        if (skill.requiresApproval || step.requiresApproval) {
          const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await db.agentApproval.create({
            data: {
              id: approvalId,
              agentRunId: runId,
              approvalType: "SKILL_EXECUTION",
              status: "PENDING",
              requestedBy: claims.sub,
              requiredRole: skill.riskLevel === "high" ? "Technical Reviewer" : "PM",
              notes: `Execution of skill '${skill.name}' requires operator approval.`
            }
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await db.agentRun.update({
            where: { id: runId },
            data: {
              status: "AWAITING_APPROVAL",
              updatedAt: new Date()
            }
          });

          await this.recordEvent(runId, "STATUS_CHANGE", {
            previousStatus: "RUNNING",
            newStatus: "AWAITING_APPROVAL",
            stepIndex: i,
            approvalId
          }, i);

          return; // Stop step execution until approval decision is recorded
        }

        // Record TOOL_CALL event
        await this.recordEvent(runId, "TOOL_CALL", {
          stepIndex: i,
          skillId: skill.id,
          parameters: step.parameters ?? {}
        }, i);

        // Execute Skill
        const context: SkillExecutionContext = {
          agentRunId: runId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          projectId: run.projectId as string,
          userId: claims.sub,
          userRole: claims.role,
          stepIndex: i,
          instruction: step.description,
          context: { ...step.parameters, organizationId: claims.organizationId,
            workspaceVersion: (step.parameters?.workspaceBinding as WorkspaceBinding | undefined)?.version ?? (this.workspaceBindings ? "UNBOUND" : undefined) }
        };

        const result = await skill.execute(context);

        if (!result.success) {
          throw new SkillExecutionFailedError(
            result.summary || `Skill '${skill.name}' reported failure`,
            result.aiCall,
            result.failureCode
          );
        }

        // Record TOOL_RESULT event
        await this.recordEvent(runId, "TOOL_RESULT", {
          stepIndex: i,
          skillId: skill.id,
          summary: result.summary,
          output: result.output,
          ...(result.aiCall ? { aiCall: persistableAiCallTrace(result.aiCall) } : {})
        }, i);

        // Attachment reader output is intentionally metadata-only. Persist a
        // corresponding audit record so attachment reads are traceable without
        // storing normalized document text in an AgentRun event or audit entry.
        if (skill.id === "attachment_reader" && result.output && typeof result.output === "object") {
          const attachmentOutput = result.output as { attachments?: unknown[] };
          const attachmentIds = Array.isArray(attachmentOutput.attachments)
            ? attachmentOutput.attachments
              .filter((item): item is { attachmentId?: unknown; fileName?: unknown; truncated?: unknown } => Boolean(item && typeof item === "object"))
              .map((item) => ({
                attachmentId: typeof item.attachmentId === "string" ? item.attachmentId : "unknown",
                fileName: typeof item.fileName === "string" ? item.fileName : "unknown",
                truncated: item.truncated === true
              }))
            : [];
          await this.auditService.recordWithClaims(claims, {
            action: "AGENT_ATTACHMENT_READ",
            resourceType: "ConversationAttachment",
            resourceId: runId,
            result: "SUCCESS",
            details: { agentRunId: runId, conversationId: run.conversationId, attachments: attachmentIds }
          });
        }

        // Capture real memoContent if generated by skill for conversation assistant message
        if (
          result.success &&
          result.output &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          typeof (result.output as any).memoContent === "string" &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          (result.output as any).memoContent.trim().length > 0
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          collectedMemoContent = (result.output as any).memoContent.trim();
        }

        // Persist returned artifacts
        if (result.artifacts && result.artifacts.length > 0) {
          for (const art of result.artifacts) {
            const artifactId = `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            await db.agentArtifact.create({
              data: {
                id: artifactId,
                agentRunId: runId,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                projectId: run.projectId as string,
                title: art.title,
                artifactType: art.artifactType,
                content: art.content,
                summary: art.summary ?? null,
                isCustomerSafe: art.isCustomerSafe ?? true,
                version: 1,
                metadata: {},
                createdAt: new Date()
              }
            });
          }
        }

        // Advance step index & calculate progress percentage
        const nextIndex = i + 1;
        const progressPercent = Math.round((nextIndex / steps.length) * 100);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.agentRun.update({
          where: { id: runId },
          data: {
            currentStepIndex: nextIndex,
            progressPercent,
            updatedAt: new Date()
          }
        });

        await this.recordEvent(runId, "PROGRESS", {
          currentStepIndex: nextIndex,
          totalSteps: steps.length,
          progressPercent
        }, nextIndex);

        // ---- NEW: Consume any pending steering for the NEXT step ----
        await this.consumePendingSteering(runId, claims, nextIndex, steps);
      }

      if (!planningOnly && groundedContext?.evidence.some((item) => item.status === "COLLECTED")) {
        const aiGateway = this.aiGateway || this.skillRegistry.getAiGateway();
        const response = await aiGateway.askAssistant({
          question: groundedPrompt + (this.projection ? "\n" + this.projection.toModelContext(await this.projection.build(runId)) : ""),
          requestedBy: claims.sub
        });
        if (response.status !== "REAL_PROVIDER" || !response.answer?.trim()) {
          const error = new AgentResultError(response.status === "POLICY_BLOCKED" ? "BLOCKED" :
            response.finishReason === "length" ? "OUTPUT_TRUNCATED" : response.httpClassification === "INVALID_SCHEMA" ? "INVALID_STRUCTURED_OUTPUT" : "PROVIDER_FAILED");
          if (response.diagnostic) Object.assign(error, { providerDiagnostic: response.diagnostic });
          throw error;
        }
        collectedMemoContent = response.answer.trim();
        await this.recordEvent(runId, "UNDERSTANDING_COMPLETED", {
          grounded: true,
          evidenceCount: groundedContext.evidence.length,
          providerId: response.providerId ?? null,
          modelId: response.modelId ?? null,
          ...(response.diagnostic ? { diagnostic: response.diagnostic } : {}),
          ...(response.contextBudget ? { contextBudget: response.contextBudget } : {})
        });
      }

      // Lifecycle completion does not imply a ready plan. Persist the exact result.
      const failed = isAgentFailureOutcome(outcome);
      const finalStatus = failed ? "FAILED" : "COMPLETED";
      const completeTime = new Date();
      const beforeFinish = await db.agentRun.findUnique({ where: { id: runId } });
      if (!beforeFinish || beforeFinish.status !== "RUNNING") return;
      // Persist the message before exposing a terminal status, including on reload.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (collectedMemoContent && run.conversationId) {
        const convService = this.getConversationService();
        if (convService) {
          await convService.createAssistantMessage(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            run.conversationId as string,
            runId,
            collectedMemoContent,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            run.agentName as string,
            outcome
          );
        }
      }

      // The predicate prevents a late result from overwriting pause/cancellation.
      const finished = await db.agentRun.update({
        where: { id: runId, status: "RUNNING" },
        data: {
          status: finalStatus,
          failureReason: failed ? outcome : null,
          progressPercent: planningOnly && outcome !== "PLAN_READY" ? beforeFinish.progressPercent : 100,
          ...(planningOnly && outcome === "PLAN_READY" ? { currentStepIndex: steps.length } : {}),
          completedAt: completeTime, updatedAt: completeTime
        }
      });
      if (failed) await this.recordEvent(runId, "ERROR", { outcome, failureReason: outcome });

      await this.recordEvent(runId, "STATUS_CHANGE", {
        previousStatus: "RUNNING",
        newStatus: finished.status,
        outcome,
        completedAt: completeTime
      });

      await this.auditService.recordWithClaims(claims, {
        action: failed ? "AGENT_RUN_FAIL" : "AGENT_RUN_COMPLETE",
        resourceType: "AgentRun",
        resourceId: runId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        details: { projectId: run.projectId, completedAt: completeTime, totalSteps: steps.length, outcome }
      });
    } catch (error: unknown) {
      const diagnostic = diagnosticFromError(error);
      const failureReason = error instanceof AgentResultError ? error.outcome :
        error instanceof UnauthorizedException || fileReadOutcome(error) === "DENIED" ? "BLOCKED" :
        error instanceof SkillExecutionFailedError && error.failureCode ? error.failureCode :
        diagnostic?.finishReason === "length" ? "OUTPUT_TRUNCATED" :
        diagnostic || (error instanceof SkillExecutionFailedError && error.aiCall?.kind === "PROVIDER_CALL_FAILED") ? "PROVIDER_FAILED" : "FAILED";
      const failedAiCall =
        error instanceof SkillExecutionFailedError && error.aiCall
          ? persistableAiCallTrace(error.aiCall)
          : undefined;

      // Mark FAILED
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const failedRun = await db.agentRun.update({
        where: { id: runId, status: { in: ["QUEUED", "PLANNING", "RUNNING"] } },
        data: {
          status: "FAILED",
          failureReason,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      }).catch(() => null);
      if (!failedRun) return;

      await this.recordEvent(runId, "ERROR", {
        failureReason,
        outcome: failureReason,
        ...(diagnosticFromError(error) ? { diagnostic: diagnosticFromError(error) } : {}),
        ...(failedAiCall ? { aiCall: failedAiCall } : {})
      }).catch(() => { });

      await this.recordEvent(runId, "STATUS_CHANGE", {
        previousStatus: "RUNNING",
        newStatus: "FAILED",
        outcome: failureReason,
        failureReason
      }).catch(() => { });

      await this.auditService.recordWithClaims(claims, {
        action: "AGENT_RUN_FAIL",
        resourceType: "AgentRun",
        resourceId: runId,
        details: { failureReason }
      }).catch(() => { });
    } finally {
      this.runningRunIds.delete(runId);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Control Operations: pause, resume, cancel
  // ---------------------------------------------------------------------------

  /**
   * Pause a RUNNING AgentRun.
   */
  private async boundedPause(runId: string, claims: SessionClaims, resume: boolean, request: PauseRunDto) {
    if (!this.runtimeControl) return null;
    const ledger = this.runtimeControl.ledger;
    const bounded = await ledger.transaction(async tx => !!await ledger.read(tx, "AGENT_INSPECTION", runId) || !!await ledger.read(tx, "PLAN_EXECUTION", runId));
    if (!bounded) return null;
    await this.getRun(runId, claims);
    await ledger.transaction(async tx => {
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      await this.runtimeControl!.identity.actor(tx, claims.sub, claims.organizationId!, run.projectId,
        { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      await this.resourceAuthz.assertAuthorized(this.subjectFromClaims(claims), "UPDATE", {
        resourceType: "AgentRun", id: runId, projectId: run.projectId, userId: run.userId, organizationId: claims.organizationId });
      await changeWorkflowPauseTx(ledger, tx, run, claims.sub, resume, request);
    });
    return this.mapRunSummary(await this.requirePrisma().agentRun.findUnique({ where: { id: runId } }));
  }
  async pauseRun(runId: string, claims: SessionClaims, dto: PauseRunDto): Promise<AgentRunSummaryDto> {
    const bounded = await this.boundedPause(runId, claims, false, dto); if (bounded) return bounded;
    if (this.inspections && await this.inspections.has(runId)) { await this.inspections.view(runId, claims); throw new BadRequestException("Cancel this bounded inspection to stop it; approvals already pause each operation."); }
    const db = this.requirePrisma();

    const now = new Date();

    const updatedRun = await db.$transaction(async (tx: any) => {
      const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { project: true } });
      if (!run) {
        throw new NotFoundException(`Agent run '${runId}' not found`);
      }
      await this.resourceAuthz.assertAuthorized(this.subjectFromClaims(claims), "UPDATE", {
        resourceType: "AgentRun", id: runId, projectId: run.projectId, userId: run.userId,
        organizationId: run.project?.organizationId ?? undefined
      });
      if (run.status === "PAUSED") {
        if (this.controlStore) {
          await this.controlStore.lock(tx, run);
          await this.controlStore.invalidate(tx, run, "RUN_PAUSED", claims);
        }
        return run;
      }
      const controlActive = this.controlStore ? !!await this.controlStore.read(tx, runId) : false;
      if (["FAILED", "CANCELLED"].includes(run.status as string) || (run.status === "COMPLETED" && !controlActive)) {
        throw new BadRequestException(`Cannot pause a ${run.status} run`);
      }
      const updateResult = await tx.agentRun.updateMany({
        where: { id: runId, status: { in: controlActive ? ["RUNNING", "AWAITING_APPROVAL", "COMPLETED"] : ["RUNNING"] } },
        data: { status: "PAUSED", pausedAt: now, updatedAt: now }
      });
      if (updateResult.count === 0) {
        throw new BadRequestException(`Pause not allowed from status ${run.status}`);
      }
      await this.controlStore?.invalidate(tx, run, "RUN_PAUSED", claims);
      await this.auditService.recordWithClaimsTx(tx, claims, {
        action: "AGENT_RUN_PAUSE",
        resourceType: "AgentRun",
        resourceId: runId,
        details: { reason: dto.reason ?? null }
      });
      return await tx.agentRun.findUnique({ where: { id: runId } });
    });

    if (updatedRun.status === "PAUSED") {
      await this.recordEvent(runId, "STATUS_CHANGE", {
        previousStatus: "RUNNING",
        newStatus: "PAUSED",
        reason: dto.reason ?? null
      });
    }

    return this.mapRunSummary(updatedRun);
  }

  /**
   * Resume a PAUSED AgentRun.
   */
  async resumeRun(runId: string, claims: SessionClaims, request: PauseRunDto = {}): Promise<AgentRunSummaryDto> {
    const bounded = await this.boundedPause(runId, claims, true, request); if (bounded) return bounded;
    if (isEngineeringPlanningRun(runId)) { await this.getRun(runId, claims); throw new BadRequestException("Generate a new immutable plan version explicitly; planning is never replayed."); }
    if (this.inspections && await this.inspections.has(runId)) { await this.inspections.view(runId, claims); throw new BadRequestException("Inspection operations are never replayed. Start a new request after resolving the recorded failure."); }
    const db = this.requirePrisma();

    const now = new Date();

    const updatedRun = await db.$transaction(async (tx: any) => {
      const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { project: true } });
      if (!run) {
        throw new NotFoundException(`Agent run '${runId}' not found`);
      }
      await this.resourceAuthz.assertAuthorized(this.subjectFromClaims(claims), "UPDATE", {
        resourceType: "AgentRun", id: runId, projectId: run.projectId, userId: run.userId,
        organizationId: run.project?.organizationId ?? undefined
      });
      if (run.status === "RUNNING") {
        return run;
      }
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status as string)) {
        throw new BadRequestException(`Cannot resume a ${run.status} run`);
      }
      const updateResult = await tx.agentRun.updateMany({
        where: { id: runId, status: "PAUSED" },
        data: { status: "RUNNING", pausedAt: null, updatedAt: now }
      });
      if (updateResult.count === 0) {
        throw new BadRequestException(`Resume not allowed from status ${run.status}`);
      }
      await this.auditService.recordWithClaimsTx(tx, claims, {
        action: "AGENT_RUN_RESUME",
        resourceType: "AgentRun",
        resourceId: runId,
        details: {}
      });
      return await tx.agentRun.findUnique({ where: { id: runId } });
    });

    if (updatedRun.status === "RUNNING") {
      await this.recordEvent(runId, "STATUS_CHANGE", {
        previousStatus: "PAUSED",
        newStatus: "RUNNING"
      });
    }

    return this.mapRunSummary(updatedRun);
  }

  /**
   * Cancel a non‑terminal AgentRun.
   */
  async cancelRun(runId: string, claims: SessionClaims, dto: CancelRunDto): Promise<AgentRunSummaryDto> {
    const db = this.requirePrisma();
    if (this.inspections && await this.inspections.has(runId)) { await this.inspections.cancel(runId, claims); return this.mapRunSummary(await db.agentRun.findUnique({ where: { id: runId } })); }
    if (this.runtimeControl && await this.runtimeControl.cancel(claims, runId, true)) return this.mapRunSummary(await db.agentRun.findUnique({ where: { id: runId } }));

    const now = new Date();
    const allowedSources = ["QUEUED", "PLANNING", "RUNNING", "PAUSED", "AWAITING_APPROVAL"];

    const updatedRun = await db.$transaction(async (tx: any) => {
      const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { project: true } });
      if (!run) {
        throw new NotFoundException(`Agent run '${runId}' not found`);
      }
      await this.resourceAuthz.assertAuthorized(this.subjectFromClaims(claims), "CANCEL", {
        resourceType: "AgentRun", id: runId, projectId: run.projectId, userId: run.userId,
        organizationId: run.project?.organizationId ?? undefined
      });
      if (run.status === "CANCELLED") {
        return run;
      }
      const controlActive = this.controlStore ? !!await this.controlStore.read(tx, runId) : false;
      if (run.status === "FAILED" || (run.status === "COMPLETED" && !controlActive)) {
        throw new BadRequestException(`Cannot cancel a ${run.status} run`);
      }
      const updateResult = await tx.agentRun.updateMany({
        where: { id: runId, status: { in: controlActive ? [...allowedSources, "COMPLETED"] : allowedSources } },
        data: { status: "CANCELLED", cancellationReason: dto.reason ?? null, updatedAt: now }
      });
      if (updateResult.count === 0) {
        throw new BadRequestException(`Cancel not allowed from status ${run.status}`);
      }
      await this.toolControl?.cancelPending(tx, runId, claims);
      await this.auditService.recordWithClaimsTx(tx, claims, {
        action: "AGENT_RUN_CANCEL",
        resourceType: "AgentRun",
        resourceId: runId,
        details: { reason: dto.reason ?? null }
      });
      return await tx.agentRun.findUnique({ where: { id: runId } });
    });

    if (updatedRun.status === "CANCELLED") {
      await this.recordEvent(runId, "STATUS_CHANGE", {
        previousStatus: updatedRun.status,
        newStatus: "CANCELLED",
        reason: dto.reason ?? null
      });
    }

    return this.mapRunSummary(updatedRun);
  }

  // ---------------------------------------------------------------------------
  // 4. Lifecycle Event Persistence
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 6. Realtime Event Streaming Helpers
  // ---------------------------------------------------------------------------

  /**
   * Verify that the caller has READ permission on the specified AgentRun.
   * Reuses the same authorization logic as getAgentRun.
   */
  async authorizeRunRead(runId: string, claims: SessionClaims): Promise<void> {
    const db = this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const run = await db.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, projectId: true, userId: true },
    });

    if (!run) {
      throw new NotFoundException(`Agent run '${runId}' not found`);
    }

    if (this.projectAccess) await this.projectAccess.assert(claims, run.projectId);
    await this.resourceAuthz.assertAuthorized(
      this.subjectFromClaims(claims),
      "READ",
      {
        resourceType: "AgentRun",
        id: run.id as string,
        projectId: run.projectId as string,
        userId: run.userId as string,
        organizationId: claims.organizationId,
      },
    );
  }

  async recoverRunSnapshot(runId: string, claims: SessionClaims, cursor = 0, limit = 128) {
    await this.authorizeRunRead(runId, claims);
    if (!this.recovery) throw new ServiceUnavailableException("AGENT_RUN_RECOVERY_UNAVAILABLE");
    return this.recovery.snapshot(runId, cursor, limit);
  }

  async replayEvents(runId: string, claims: SessionClaims, cursor = 0, limit = 128) {
    await this.authorizeRunRead(runId, claims);
    return readAgentEventPage(this.requirePrisma(), runId, cursor, limit);
  }

  /** Transport frames are projections of persisted sequence pages, never authority. */
  createEventObservable(
    runId: string, claims: SessionClaims, lastEventId?: string,
    options?: { pollIntervalMs?: number; keepaliveIntervalMs?: number },
  ): Observable<MessageEvent> {
    const db = this.requirePrisma();
    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const idleThreshold = Math.max(1, Math.round((options?.keepaliveIntervalMs ?? 10000) / pollIntervalMs));
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false, polling = false, initialized = false, cursor = 0, idle = 0;
      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          if (!initialized) {
            cursor = await resolveAgentEventCursor(db, runId, lastEventId);
            initialized = true;
          }
          const page = await readAgentEventPage(db, runId, cursor);
          for (const event of page.events) {
            if (closed) return;
            cursor = event.seq;
            subscriber.next({ id: `${runId}:${event.seq}`, type: event.eventType, data: event });
          }
          if (page.events.length) idle = 0;
          else if (++idle >= idleThreshold) {
            subscriber.next({ type: 'ping', data: { authoritative: false, timestamp: new Date().toISOString() } });
            idle = 0;
          }
          if (page.replayComplete && !closed) {
            subscriber.next({ type: 'stream-drained', data: { authoritative: false, runId,
              cursor: page.nextCursor, terminalWatermark: page.terminalWatermark, status: page.status } });
            subscriber.complete();
          }
        } catch (error) { subscriber.error(error); }
        finally { polling = false; }
      };
      const interval = setInterval(() => { void poll(); }, pollIntervalMs);
      void poll();
      return () => { closed = true; clearInterval(interval); };
    });
  }

  private async recordEvent(
    agentRunId: string,
    eventType: string,
    payload: any,
    stepIndex?: number,
    actor: string = 'system',
  ): Promise<void> {
    const db = this.requirePrisma();
    const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await db.agentRunEvent.create({
      data: {
        id,
        agentRunId,
        stepIndex: stepIndex ?? null,
        eventType,
        actor,
        payload,
        timestamp: new Date()
      }
    });
  }

  /**
   * Transaction-aware event recording.
   * Uses the provided Prisma transaction client instead of the root client.
   */
  private async recordEventTx(
    tx: any,
    agentRunId: string,
    eventType: string,
    payload: any,
    stepIndex?: number,
    actor: string = 'system',
  ): Promise<void> {
    const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await tx.agentRunEvent.create({
      data: {
        id,
        agentRunId,
        stepIndex: stepIndex ?? null,
        eventType,
        actor,
        payload,
        timestamp: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Query Run Detail
  // ---------------------------------------------------------------------------

  async getRun(id: string, claims: SessionClaims): Promise<AgentRunDetailDto> {
    const db = this.requirePrisma();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    let run = await db.agentRun.findUnique({
      where: { id },
      include: {
        plans: { orderBy: { version: "desc" } },
        approvals: { where: { status: "PENDING" } },
        artifacts: { where: { artifactType: CONTROL_ARTIFACT } }
      }
    });

    if (!run) {
      throw new NotFoundException(`Agent run '${id}' not found`);
    }

    if (this.projectAccess) await this.projectAccess.assert(claims, run.projectId);
    // Authorize read access
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await this.resourceAuthz.assertAuthorized(
      this.subjectFromClaims(claims),
      "READ",
      {
        resourceType: "AgentRun",
        id: run.id as string,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        projectId: run.projectId as string,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        userId: run.userId as string,
        organizationId: claims.organizationId
      }
    );
    run = await exactContinuationRunTx(new RuntimeLedgerService(db), db, run);
    const savedExecution = await this.planExecution?.view(id, claims) ?? null;
    const execution = savedExecution?.planVersion === run.planVersion ? savedExecution : null;
    const inspection = await this.inspections?.view(id, claims) ?? null;
    const pauseRecord = await this.runtimeControl?.ledger.read<WorkflowPause>(db, "WORKFLOW_PAUSE", id);
    const runtimeAction = id.startsWith("rtrun_") ? await this.runtimeControl?.snapshot(claims, id) : null;
    const runtimeActionReceipt = runtimeAction?.execution ? {
      id: runtimeAction.execution.attribution.executionId, state: runtimeAction.execution.state,
      verificationState: runtimeAction.execution.verificationState,
      target: String(runtimeAction.execution.attribution.validatedInput.path ?? "")
    } : null;
    const presentation = presentPlan(run.plans?.[0]?.steps);
    if (execution?.receipts?.length) {
      presentation.evidence = [...presentation.evidence, ...execution.receipts];
    }
    const standaloneRead = runtimeReadReceipt(runtimeAction);
    if (standaloneRead && !presentation.evidence.some(e => e.id === standaloneRead.id)) presentation.evidence.push(standaloneRead);
    const projectedEvidence = new Set(presentation.evidence.flatMap(item => [
      item.id, item.runtimeReference?.receiptId, item.runtimeReference?.operationId
    ].filter((value): value is string => Boolean(value))));
    for (const reference of inspection?.evidence ?? []) {
      if (reference.verificationState !== "VERIFIED") continue;
      const operation = inspection?.operations.find(item => item.request.operationId === reference.operationId);
      if (operation && (operation.verification !== "VERIFIED" || operation.evidence?.receiptId !== reference.receiptId)) continue;
      const keys = [`runtime:${reference.receiptId}`, reference.receiptId, reference.operationId];
      if (keys.some(key => projectedEvidence.has(key))) continue;
      const tool = operation?.action.tool;
      const truncated = reference.truncated || operation?.state === "TRUNCATED";
      const receipt: EvidenceReceipt = {
        id: `runtime:${reference.receiptId}`,
        sourceType: "workspace",
        ...(tool ? { operation: tool } : {}),
        runtimeReference: reference,
        label: reference.relativePath,
        relativePath: reference.relativePath,
        outcome: truncated ? "TRUNCATED" : tool === "filesystem.read" ? "READ" : tool ? "SCANNED" : "VERIFIED",
        discovered: true,
        read: tool === "filesystem.read",
        selected: false,
        usedInAnswer: "UNKNOWN",
        truncated,
        selectionReason: "Verified runtime observation recorded by this inspection."
      };
      presentation.evidence.push(receipt);
      for (const key of keys) projectedEvidence.add(key);
    }

    return {
      ...this.mapRunSummary(run),
      inspection,
      execution,
      workflowDecision: run.plans?.[0] ? (await this.runtimeControl?.ledger.read<WorkflowDecision>(db, "WORKFLOW_DECISION", workflowDecisionKey(claims.sub, run.conversationId, run.plans[0].id)))?.payload ?? null : null,
      workflowPause: pauseRecord ? { ...pauseRecord.payload, revision: pauseRecord.revision } : null,
      runtimeActionReceipt,
      presentation,
      control: presentControl(run.artifacts ?? [], run),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      plans: (run.plans ?? []).map((p: any) => ({
        id: p.id,
        agentRunId: p.agentRunId,
        version: p.version,
        summary: p.summary,
        steps: Array.isArray(p.steps) ? p.steps : JSON.parse(p.steps as string),
        requiresApproval: p.requiresApproval,
        status: p.status,
        reviewedBy: p.reviewedBy,
        reviewNotes: p.reviewNotes,
        createdAt: p.createdAt
      })),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      pendingApprovals: (run.approvals ?? []).map((a: any) => ({
        id: a.id,
        agentRunId: a.agentRunId,
        approvalType: a.approvalType,
        status: a.status,
        requestedBy: a.requestedBy,
        requiredRole: a.requiredRole,
        decidedBy: a.decidedBy,
        decision: a.decision,
        notes: a.notes,
        revisedPlan: a.revisedPlan ? (typeof a.revisedPlan === "string" ? JSON.parse(a.revisedPlan) : a.revisedPlan) : null,
        dueAt: a.dueAt,
        createdAt: a.createdAt,
        decidedAt: a.decidedAt
      }))
    };
  }

  async inspectionView(id: string, claims: SessionClaims) { return await this.inspections?.view(id, claims) ?? null; }
  async executionView(id: string, claims: SessionClaims, planVersion?: number) { return await this.planExecution?.view(id, claims, planVersion) ?? null; }

  async continueInspectionConversation(conversationId: string, claims: SessionClaims, content: string, clientId?: unknown, attachmentIds: string[] = []) {
    if (!this.inspections) return null;
    const candidates = await this.requirePrisma().agentRun.findMany({ where: { conversationId, userId: claims.sub,
      status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 20 });
    const active = [];
    for (const run of candidates) {
      const view = await this.inspections.view(run.id, claims);
      if (view && !["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(view.state)) active.push(run);
    }
    if (active.length !== 1) return null; // Never guess between independent runs.
    const result = await this.inspections.message(active[0].id, claims, conversationId, content, clientId, attachmentIds);
    if (!result.duplicate) this.scheduleRunExecution(active[0].id, claims, content);
    return result;
  }

  /**
   * Lists agent runs visible to the authenticated subject.
   * Admin visibility is organization-scoped via Project.organizationId.
   * Non-admin visibility uses the existing AgentRun database scope filter.
   */
  async listRuns(claims: SessionClaims): Promise<AgentRunSummaryDto[]> {
    const db = this.requirePrisma();
    const subject = this.subjectFromClaims(claims);
    const projectIds = this.projectAccess ? await this.projectAccess.visibleIds(claims) : undefined;
    const orgConstraint = claims.organizationId
      ? { project: { organizationId: claims.organizationId } }
      : {};

    const where = {
        AND: [
          await this.resourceAuthz.buildDatabaseScopeFilter(subject, "AgentRun", "READ"),
          orgConstraint
        ]
      };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const runs = await db.agentRun.findMany({
      where: projectIds ? { AND: [where, { projectId: { in: projectIds } }] } : where,
      orderBy: { updatedAt: "desc" },
      include: { plans: { orderBy: { version: "desc" }, take: 1, select: { steps: true } } },
      take: 50
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (runs ?? []).map((run: unknown) => this.mapRunSummary(run));
  }

  // ---------------------------------------------------------------------------
  // 6. Startup Recovery of Unfinished Runs
  // ---------------------------------------------------------------------------

  async recoverUnfinishedRuns(): Promise<{ recoveredCount: number }> {
    if (!this.prisma || !this.recovery) {
      return { recoveredCount: 0 };
    }

    try {
      // Find runs that were left unfinished before application restart
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const unfinishedRuns = await this.prisma.agentRun.findMany({
        where: {
          status: { in: ["QUEUED", "PLANNING", "RUNNING"] },
          NOT: { id: { startsWith: "rtrun_" } }
        }
      });

      let recovered = 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      for (const run of unfinishedRuns ?? []) {
        if (isEngineeringPlanningRun(run.id)) {
          // Runtime receipts and pending continuation recover through their own durable ledger.
          if (await this.planExecution?.isPlanRunTx(this.prisma, run.id, run.planVersion)) continue;
          if (await this.recovery.parkInterrupted(run.id, true)) recovered++;
          continue; // Interrupted generation requires a new explicit version; never call GLM on restoration.
        }
        if (this.inspections && await this.inspections.has(run.id)) continue;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (this.runningRunIds.has(run.id as string)) continue;

        // Never recreate session authority or redispatch physical work on process restoration.
        if (await this.recovery.parkInterrupted(run.id)) recovered++;
      }
      return { recoveredCount: recovered };
    } catch {
      return { recoveredCount: 0 };
    }
  }

  async steerRun(runId: string, claims: SessionClaims, dto: SteerRunDto): Promise<AgentRunSummaryDto> {
    if (isEngineeringPlanningRun(runId)) { await this.getRun(runId, claims); throw new BadRequestException("Generate a new immutable plan version to revise engineering intent"); }
    if (this.inspections && await this.inspections.has(runId)) { await this.inspections.view(runId, claims); throw new BadRequestException("Cancel the current inspection before changing its bound objective."); }
    const db = this.requirePrisma();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const run = await db.agentRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    await this.resourceAuthz.assertAuthorized(
      this.subjectFromClaims(claims),
      "UPDATE",
      {
        resourceType: "AgentRun",
        id: runId,
        organizationId: claims.organizationId,
        userId: run.userId,
      },
    );

    if (run.status !== "RUNNING") {
      throw new BadRequestException(`Steering is only allowed for RUNNING runs (current status: ${run.status})`);
    }

    // Record STEERING_SUBMITTED and audit atomically
    await db.$transaction(async (tx: any) => {
      if (this.controlStore && await this.controlStore.read(tx, runId)) {
        const current = await tx.agentRun.findUnique({ where: { id: runId } });
        await this.controlStore.lock(tx, current);
        await this.controlStore.invalidate(tx, current, "REQUEST_CHANGED", claims);
      }
      await tx.agentRunEvent.create({
        data: {
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentRunId: runId,
          eventType: "STEERING_SUBMITTED",
          actor: "user",
          payload: {
            instruction: dto.instruction,
            consumed: false,
          },
          timestamp: new Date(),
        },
      });

      await this.auditService.recordWithClaimsTx(tx, claims, {
        action: "AGENT_RUN_STEER",
        resourceType: "AgentRun",
        resourceId: runId,
        details: { instruction: dto.instruction },
      });
    });

    // No state change on the run itself; return fresh summary
    const refreshed = await db.agentRun.findUnique({ where: { id: runId } });
    return this.mapRunSummary(refreshed);
  }

  /**
   * Consume at most one pending steering instruction for the step that is about to run.
   * This method is called after a step finishes (checkpoint) and before the next step execution.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async consumePendingSteering(runId: string, _claims: SessionClaims, nextStepIndex: number, steps: AgentPlanStep[]) {
    const db = this.requirePrisma();
    // If there is no next step, nothing to steer.
    if (nextStepIndex >= steps.length) return;

    await db.$transaction(async (tx: any) => {
      // Find the oldest unconsumed steering event
      const pending = await tx.agentRunEvent.findFirst({
        where: {
          agentRunId: runId,
          eventType: "STEERING_SUBMITTED",
          payload: { path: ["consumed"], equals: false },
        },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      });
      if (!pending) return; // nothing to consume

      // Claim the event (optimistic claim)
      const claim = await tx.agentRunEvent.updateMany({
        where: {
          id: pending.id,
          payload: { path: ["consumed"], equals: false },
        },
        data: {
          payload: { ...pending.payload, consumed: true },
        },
      });
      if (claim.count === 0) return; // another worker claimed it

      // Apply steering to the next step's parameters
      const step = steps[nextStepIndex];
      const existing = (step.parameters?.steeringInstructions as string[]) ?? [];
      const instruction = pending.payload.instruction as string;
      step.parameters = {
        ...(step.parameters ?? {}),
        steeringInstructions: [...existing, instruction],
      };

      // Persist the updated plan steps (latest plan version)
      const plan = await tx.agentPlan.findFirst({
        where: { agentRunId: runId },
        orderBy: { version: "desc" },
      });
      if (plan) {
        await tx.agentPlan.update({
          where: { id: plan.id },
          data: { steps },
        });
      }

      // Record STEERING_CONSUMED event (immutable audit trail)
      await tx.agentRunEvent.create({
        data: {
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentRunId: runId,
          eventType: "STEERING_CONSUMED",
          actor: "system",
          payload: {
            originalEventId: pending.id,
            instruction,
          },
          timestamp: new Date(),
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRunSummary(run: any): AgentRunSummaryDto {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      id: run.id as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      conversationId: run.conversationId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      projectId: run.projectId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      userId: run.userId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      agentName: run.agentName as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      title: run.title as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      status: run.status as AgentRunStatus,
      outcome: persistedRunOutcome(run),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      planVersion: run.planVersion as number,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      currentStepIndex: run.currentStepIndex as number,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      progressPercent: run.progressPercent as number,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      pausedAt: run.pausedAt as Date | null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      startedAt: run.startedAt as Date | null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      completedAt: run.completedAt as Date | null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      failureReason: run.failureReason as string | null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      cancellationReason: run.cancellationReason as string | null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      createdAt: run.createdAt as Date,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      updatedAt: run.updatedAt as Date
    };
  }
}
