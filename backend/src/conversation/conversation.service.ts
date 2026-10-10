import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import { AgentRuntimeService } from "../agent-runtime/agent-runtime.service";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { assertConversationBinding, conversationMode, modeContext, parseConversationMode, protectedConversationMetadata, transferredConversation, type ConversationModeContext } from "./conversation-mode";
import { persistedRunOutcome, type AgentOutcome } from "../agent-runtime/agent-result";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { MemoryService } from "../agent-runtime/memory/memory.service";
import { HistoricalMemoryService } from "../agent-runtime/memory/historical-memory.service";
import { AttachmentService } from "../attachment/attachment.service";
import { AttachmentCapabilityService } from "../agent-runtime/capabilities/attachment-capability.service";
import { AgentContextBuilderService } from "../agent-runtime/understanding/agent-context-builder.service";
import { ExecutionModeDetectorService } from "../agent-runtime/execution-mode-detector.service";
import { ASSISTANT_CONTEXT_LIMITS } from "../ai-gateway/assistant-context-budget";
import { assertHistoricalSource, boundedHistoricalMessages, historicalSourceId, historicalReference, historicalMessagesUnchanged, historicalPrompt, type HistoricalContextReference, type HistoricalContextView } from "./historical-context";
import { ProjectAccessService } from "../auth/project-access.service";
import { WorkspaceBindingService } from "../workspace-intelligence/workspace-binding.service";
import { WorkspaceStoreService } from "../workspace-intelligence/workspace-store.service";
import { WorkspaceRuntimeService } from "../workspace-intelligence/workspace-runtime.service";
import { RuntimeControlService } from "../trusted-runtime/runtime-control.service";
import { requestsWorkspace } from "../agent-runtime/workspace-intent";
import { inspectionReferences, naturalWorkspaceRequest, REFERENCE_LIMIT } from "./workspace-reference";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "./conversation-intent-resolver";
import { planningInspectionInstruction } from "./conversation-prerequisite";
import { persistSubmissionFailure, submissionFailureId } from "./submission-failure";
import { RecommendationService } from "./recommendation.service";
import { recommendationResponse, recommendationPlanningObjective, unresolvedRedesignPreservation } from "./recommendation.contract";
import { requestsExactProposal, requestsPlanHandoff, declaresPlanningReadiness } from "./conversation-intent";
import { evidenceReceipt, presentPlan, type EvidenceReceipt } from "../agent-runtime/understanding/agent-presentation";
import { CONTROL_ARTIFACT, presentControl } from "../agent-runtime/tools/agent-control.contract";
import type { Prisma } from "@prisma/client";
import type { WorkspaceBinding } from "../workspace-intelligence/workspace-binding.service";
import type { AgentContextTruncation } from "../agent-runtime/understanding/agent-understanding.types";
import { FileIntelligenceError } from "../file-intelligence/file-intelligence.errors";
import { diagnosticFromError } from "../ai-gateway/provider-diagnostic";
import { projectDownstreamWorkflow } from "./workflow-presentation";
import type { SessionClaims } from "../auth/auth.dto";
import type { AgentRunSummaryDto } from "../agent-runtime/agent-run.dto";
import type {
  ConversationDetailDto,
  ConversationMessageDto,
  ConversationSummaryDto,
  CreateConversationDto,
  UpdateConversationDto,
  PostMessageDto,
  PostMessageResponseDto,
  TriggerAgentMessageResponseDto
} from "./conversation.dto";

/**
 * ConversationService
 *
 * Provides transactional chat and agent-orchestration persistence.
 * Normal messages and triggered agent runs execute within a single Prisma transaction,
 * ensuring ConversationMessage, updatedAt timestamp, and AgentRun state persist atomically.
 * Background agent execution is strictly scheduled only after successful transaction commit.
 */
@Injectable()
export class ConversationService {
  async changeDecisionRevision(id: string, claims: SessionClaims, setId: string, revision: number) {
    await this.getConversation(id, claims.sub, claims);
    if (!this.agentRuntimeService?.changeDecisionRevision) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return this.agentRuntimeService.changeDecisionRevision(id, claims, setId, revision);
  }
  async decideChange(id: string, claims: SessionClaims, body: unknown) {
    await this.getConversation(id, claims.sub, claims);
    if (!this.agentRuntimeService?.decideChange) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return this.agentRuntimeService.decideChange(id, claims, body);
  }
  async prepareChangeSet(id: string, claims: SessionClaims, body: unknown) {
    await this.getConversation(id, claims.sub, claims);
    if (!this.agentRuntimeService?.prepareChangeSet) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
    return this.agentRuntimeService.prepareChangeSet(id, claims, body);
  }
  private readonly logger = new Logger(ConversationService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prisma: any | null = null;

  constructor(
    @Optional() @Inject(PrismaService) prismaService?: PrismaService,
    @Optional() @Inject(forwardRef(() => AgentRuntimeService)) private readonly agentRuntimeService?: AgentRuntimeService,
    @Optional() @Inject(ResourceAuthorizationService) private readonly resourceAuthz?: ResourceAuthorizationService,
    @Optional() @Inject(MemoryService) private readonly memoryService?: MemoryService,
    @Optional() @Inject(AttachmentService) private readonly attachmentService?: AttachmentService,
    @Optional() @Inject(AttachmentCapabilityService) private readonly attachmentCapabilities?: AttachmentCapabilityService,
    @Optional() @Inject(AgentContextBuilderService) private readonly contextBuilder?: AgentContextBuilderService,
    @Optional() @Inject(ExecutionModeDetectorService) private readonly executionModeDetector?: ExecutionModeDetectorService,
    @Optional() @Inject(ProjectAccessService) private readonly projectAccess?: ProjectAccessService,
    @Optional() @Inject(WorkspaceBindingService) private readonly workspaceBindings?: WorkspaceBindingService,
    @Optional() @Inject(WorkspaceStoreService) private readonly runtimeWorkspaces?: WorkspaceStoreService,
    @Optional() @Inject(WorkspaceRuntimeService) private readonly workspaceRuntime?: WorkspaceRuntimeService,
    @Optional() @Inject(HistoricalMemoryService) private readonly historicalMemory?: HistoricalMemoryService,
    @Optional() @Inject(RecommendationService) private readonly recommendations?: RecommendationService,
    @Optional() @Inject(RuntimeControlService) private readonly runtimeControl?: RuntimeControlService
  ) {
    if (prismaService) {
      this.prisma = prismaService;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requirePrisma(): any {
    if (!this.prisma) {
      throw new ServiceUnavailableException("Database service is unavailable in this environment");
    }
    return this.prisma;
  }

  // ---------------------------------------------------------------------------
  // Create conversation
  // ---------------------------------------------------------------------------

  async createConversation(userId: string, dto: CreateConversationDto, claims?: SessionClaims): Promise<ConversationSummaryDto> {
    if (!dto.projectId || !dto.title?.trim()) {
      throw new BadRequestException("projectId and title are required");
    }

    const db = this.requirePrisma();
    if (this.projectAccess) {
      if (!claims) throw new ForbiddenException("Authenticated project context is required");
      await this.projectAccess.assert(claims, dto.projectId, "CREATE");
    }
    const mode = parseConversationMode(dto.mode ?? "CHAT");
    if (mode === "AGENT") throw new BadRequestException("AGENT_SOURCE_REQUIRED: open Agent from its source Chat");
    const metadata: Record<string, any> = { approvalMode: "MANUAL", ...protectedConversationMetadata(dto.metadata) };
    const binding = claims && this.runtimeWorkspaces ? await this.runtimeWorkspaces.getActiveBinding(userId, dto.projectId, claims.organizationId!) : null;
    metadata.modeContext = { version: 1, mode, organizationId: claims?.organizationId ?? "", workspace: binding ? {
      workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint
    } : null } satisfies ConversationModeContext;
    delete metadata.workspaceBinding;
    delete metadata.runtimeWorkspace;
    if (this.workspaceBindings && claims) {
      const reference = await this.workspaceBindings.runtimeReference?.(claims, dto.projectId);
      if (reference) metadata.runtimeWorkspace = reference;
      try { metadata.workspaceBinding = (await this.workspaceBindings.resolve(claims, dto.projectId)).binding; }
      catch (error) { if (!(error instanceof ServiceUnavailableException)) throw error; }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const conv = await db.conversation.create({
      data: {
        id: this.newId("conv"),
        projectId: dto.projectId,
        userId,
        title: dto.title.trim(),
        status: "active",
        metadata
      }
    });
    return this.mapConvSummary(conv);
  }

  // ---------------------------------------------------------------------------
  // List conversations for a user+project
  // ---------------------------------------------------------------------------

  async listConversations(userId: string, projectId?: string, claims?: SessionClaims): Promise<ConversationSummaryDto[]> {
    const db = this.requirePrisma();
    const ids = this.projectAccess && claims ? await this.projectAccess.visibleIds(claims) : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const convs = await db.conversation.findMany({
      where: {
        userId,
        ...(ids ? { project: { id: { in: ids } } } : {}),
        ...(projectId && { projectId }),
        status: "active"
      },
      include: {
        _count: { select: { messages: true } }
      },
      orderBy: { updatedAt: "desc" as const }
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return convs.map((c: any) => this.mapConvSummary(c));
  }

  // ---------------------------------------------------------------------------
  // Get conversation detail
  // ---------------------------------------------------------------------------

  async getConversation(id: string, userId: string, claims?: SessionClaims): Promise<ConversationDetailDto> {
    const db = this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const conv = await db.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        attachments: {
          where: { userId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, conversationId: true, userId: true, fileName: true, mimeType: true, fileSize: true,
            category: true, hasExtractedText: true, isScanned: true, createdAt: true }
        },
        agentRuns: {
          select: {
            id: true,
            conversationId: true,
            projectId: true,
            agentName: true,
            title: true,
            status: true,
            planVersion: true,
            failureReason: true,
            plans: { orderBy: { version: "desc" as const }, take: 1, select: { id: true, version: true, steps: true } },
            // Activity details project only bounded safe payload fields; raw payloads stay server-side.
            events: { orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 100,
              select: { id: true, agentRunId: true, eventType: true, timestamp: true, payload: true } },
            artifacts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: { id: true, agentRunId: true, projectId: true, title: true, artifactType: true, summary: true, version: true, createdAt: true, metadata: true } },
            approvals: { where: { status: "PENDING" },
              select: { id: true, approvalType: true, status: true, requiredRole: true, dueAt: true } },
            progressPercent: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        }
      } satisfies Prisma.ConversationInclude
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (conv.userId !== userId) throw new NotFoundException("Conversation not found");
    if (this.projectAccess && claims) await this.projectAccess.assert(claims, conv.projectId);
    const detail = this.mapConvDetail(conv);
    for (const message of detail.messages) {
      if (message.metadata?.changeSet) message.metadata.changeReviewState = claims && this.agentRuntimeService?.changeReviewState
        ? await this.agentRuntimeService.changeReviewState(id, claims, message.metadata.changeSet)
        : { available: false, reason: "CHANGE_SET_UNAVAILABLE" };
    }
    if (claims && conv.metadata?.historicalContext) {
      const historical = await this.resolveHistoricalContext(conv, claims);
      detail.metadata = { ...detail.metadata, historicalContextView: historical.view };
    }
    if (claims && this.agentRuntimeService?.getRun) {
      for (const run of detail.agentRuns) {
        const projected = await this.agentRuntimeService.getRun(run.id, claims);
        run.presentation = projected.presentation ?? run.presentation;
        run.inspection = projected.inspection;
        run.execution = projected.execution;
        run.workflowPause = projected.workflowPause;
        run.workflowDecision = projected.workflowDecision;
      }
    } else if (claims && this.agentRuntimeService?.inspectionView) {
      for (const run of detail.agentRuns) run.inspection = await this.agentRuntimeService.inspectionView(run.id, claims);
      if (this.agentRuntimeService.executionView) {
        for (const run of detail.agentRuns) run.execution = await this.agentRuntimeService.executionView(run.id, claims);
      }
    }
    for (const run of detail.agentRuns) {
      const saved = conv.agentRuns.find((item: any) => item.id === run.id);
      const request = [...conv.messages].reverse().find((m: any) => m.senderType === "user" && m.metadata?.agentRunId === run.id &&
        (m.metadata.planVersion === undefined || m.metadata.planVersion === run.planVersion));
      if (request && run.presentation) run.presentation.originatingMessageId = request.id;
      run.workflow = await projectDownstreamWorkflow(db, saved, conv, Date.now(), claims);
      run.pendingApprovals = run.pendingApprovals.filter(a =>
        a.dueAt && +new Date(a.dueAt) > Date.now() && (a.approvalType !== "EXACT_PROPOSAL" ||
          (run.workflow?.approval?.id === a.id && run.workflow.approval.actionable)));
    }
    return detail;
  }

  // ---------------------------------------------------------------------------
  // Update conversation (title / metadata / group)
  // ---------------------------------------------------------------------------

  private async historicalSource(current: any, claims: SessionClaims, sourceId: string) {
    const source = await this.requirePrisma().conversation.findUnique({ where: { id: sourceId }, include: { project: true } });
    assertHistoricalSource(current, source, claims);
    if (!this.projectAccess) throw new ServiceUnavailableException("HISTORICAL_CONTEXT_AUTHORIZATION_UNAVAILABLE");
    await this.projectAccess.assert(claims, current.projectId);
    if (modeContext(current)?.workspace) {
      const active = await this.runtimeWorkspaces?.getActiveBinding(claims.sub, current.projectId, claims.organizationId!);
      assertConversationBinding(current, active);
      const access = await this.workspaceRuntime?.context(claims, current.projectId);
      if (access?.availability !== "READY" || !access.readCapabilities.includes("filesystem.read")) throw new ForbiddenException("HISTORICAL_CONTEXT_ACCESS_UNAVAILABLE");
    } else if (current.metadata?.workspaceBinding) {
      await this.workspaceBindings?.resolve(claims, current.projectId, current.metadata.workspaceBinding.version);
      if (!this.workspaceBindings) throw new ServiceUnavailableException("HISTORICAL_CONTEXT_AUTHORIZATION_UNAVAILABLE");
    } else if (current.metadata?.runtimeWorkspace) {
      // Legacy conversations cannot supply a runtime identity from a presentation reference.
      throw new ConflictException("HISTORICAL_CONTEXT_WORKSPACE_CHANGED");
    }
    return source;
  }

  private async historicalMessages(sourceId: string) {
    const rows = await this.requirePrisma().conversationMessage.findMany({ where: { conversationId: sourceId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: ASSISTANT_CONTEXT_LIMITS.historyMessages,
      select: { id: true, senderType: true, content: true, metadata: true } });
    return boundedHistoricalMessages(rows);
  }

  private async resolveHistoricalContext(current: any, claims: SessionClaims): Promise<{ view: HistoricalContextView; prompt: string }> {
    const reference = current.metadata.historicalContext as HistoricalContextReference;
    const unavailable = (code: string) => ({ view: { state: "UNAVAILABLE" as const, sourceConversationId: reference.sourceConversationId, messageCount: 0, code },
      prompt: "\n[Historical context unavailable. Do not infer or invent the missing source history. Continue using only this conversation's available context.]" });
    try {
      const source = await this.historicalSource(current, claims, reference.sourceConversationId);
      const messages = await this.historicalMessages(source.id);
      if (!historicalMessagesUnchanged(reference, source, messages)) return unavailable("HISTORICAL_CONTEXT_SOURCE_CHANGED");
      return { view: { state: "READY", sourceConversationId: source.id, sourceTitle: source.title, messageCount: messages.length }, prompt: historicalPrompt(source.id, messages) };
    } catch { return unavailable("HISTORICAL_CONTEXT_UNAVAILABLE"); }
  }

  async selectHistoricalContext(id: string, claims: SessionClaims, body: unknown): Promise<HistoricalContextView> {
    const sourceId = historicalSourceId(body), db = this.requirePrisma();
    return db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', id);
      const current = await tx.conversation.findUnique({ where: { id }, include: { project: true } });
      const source = await this.historicalSource(current, claims, sourceId);
      let messages: ReturnType<typeof boundedHistoricalMessages> = [], unavailable = false;
      try { messages = await this.historicalMessages(sourceId); } catch { unavailable = true; }
      const reference = historicalReference(source, messages);
      await tx.conversation.update({ where: { id }, data: { metadata: { ...(current.metadata ?? {}), historicalContext: reference } } });
      return { state: unavailable ? "UNAVAILABLE" : "READY", sourceConversationId: sourceId, sourceTitle: source.title, messageCount: messages.length,
        ...(unavailable ? { code: "HISTORICAL_CONTEXT_UNAVAILABLE" } : {}) };
    });
  }

  async updateConversation(
    id: string,
    userId: string,
    dto: UpdateConversationDto
  ): Promise<ConversationSummaryDto> {
    const db = this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const conv = await db.conversation.findUnique({ where: { id } });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException("Conversation not found");
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      const trimmed = dto.title.trim();
      if (!trimmed) throw new BadRequestException("title cannot be empty");
      data.title = trimmed;
    }
    if (dto.metadata !== undefined) {
      const metadata = { ...(conv.metadata ?? {}), ...protectedConversationMetadata(dto.metadata) };
      delete metadata.workspaceBinding;
      delete metadata.runtimeWorkspace;
      if (conv.metadata?.runtimeWorkspace) metadata.runtimeWorkspace = conv.metadata.runtimeWorkspace;
      if (conv.metadata?.workspaceBinding) metadata.workspaceBinding = conv.metadata.workspaceBinding;
      data.metadata = metadata;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const updated = await db.conversation.update({
      where: { id },
      data
    });
    return this.mapConvSummary(updated);
  }

  // ---------------------------------------------------------------------------
  // Delete conversation (ownership-enforced cascade deletion)
  // ---------------------------------------------------------------------------

  async deleteConversation(
    id: string,
    userId: string
  ): Promise<{ deleted: boolean; id: string }> {
    const db = this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const conv = await db.conversation.findUnique({ where: { id } });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException("Conversation not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await db.$transaction(async (tx: any) => {
      await this.historicalMemory?.markSourceDeletedTx(tx, userId, id);
      await tx.conversation.delete({ where: { id } });
    });
    return { deleted: true, id };
  }

  // ---------------------------------------------------------------------------
  // Post a message (single atomic transaction with optional AgentRun)
  // ---------------------------------------------------------------------------

  async postMessage(
    conversationId: string,
    claimsOrUserId: SessionClaims | string,
    dto: PostMessageDto
  ): Promise<PostMessageResponseDto> {
    const rawIds = Array.isArray(dto.attachmentIds) ? dto.attachmentIds :
      Array.isArray(dto.metadata?.attachmentIds) ? dto.metadata.attachmentIds : [];
    const attachmentIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
    const instruction = dto.content?.trim() || (attachmentIds.length ? "Inspect the attached files." : "");
    if (!instruction) throw new BadRequestException("content or attachments are required");
    if (attachmentIds.length > 5) throw new BadRequestException("A message can reference at most 5 attachments");
    if (attachmentIds.length && !this.attachmentService) throw new ServiceUnavailableException("Attachment service is unavailable");

    const claims: SessionClaims = typeof claimsOrUserId === "string"
      ? {
        sub: claimsOrUserId,
        sessionId: `sess-${Date.now()}`,
        email: `${claimsOrUserId}@sekhem.test`,
        displayName: claimsOrUserId,
        role: "PM",
        exp: Math.floor(Date.now() / 1000) + 3600
      }
      : claimsOrUserId;

    const userId = claims.sub;
    const db = this.requirePrisma();

    if (dto.runtimeEvidence !== undefined && (dto.chat === true || dto.metadata?.chat === true || dto.triggerAgent !== true)) throw new BadRequestException("Runtime evidence requires an explicit Agent request");
    // Verify conversation existence and ownership
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existingConv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { project: true }
    });

    if (!existingConv || existingConv.userId !== userId) {
      throw new NotFoundException("Conversation not found");
    }
    if (this.projectAccess) await this.projectAccess.assert(claims, existingConv.projectId, "UPDATE");

    // Cross-organization isolation
    if (
      claims.organizationId &&
      existingConv.project?.organizationId &&
      claims.organizationId !== existingConv.project.organizationId
    ) {
      throw new ForbiddenException("Cross-organization conversation access is forbidden");
    }

    // Enforce project membership authorization
    if (this.resourceAuthz && existingConv.projectId) {
      await this.resourceAuthz.assertAuthorized(
        {
          userId: claims.sub,
          email: claims.email,
          displayName: claims.displayName,
          role: claims.role,
          organizationId: claims.organizationId,
          isSystemAdmin: claims.role === "Admin"
        },
        "UPDATE",
        {
          resourceType: "Conversation",
          id: conversationId,
          projectId: existingConv.projectId,
          organizationId: claims.organizationId,
          userId: existingConv.userId
        }
      );
    }

    const mode = conversationMode(existingConv);
    if (modeContext(existingConv)?.source) await transferredConversation(db, existingConv);
    if (dto.senderType && dto.senderType !== "user") throw new BadRequestException("MESSAGE_SENDER_INVALID");
    if (dto.metadata && ["agentConversationId", "transfer", "modeContext", "agentRunId", "planHandoff", "planHandoffId", "certifiedUnderstanding", "planningRequest", "planningReport", "planId", "planVersion", "planDigest", "recommendation", "recommendationId", "recommendationResponse", "changeSet", "changeReviewState", "changeSelection"].some(key => key in dto.metadata!)) throw new BadRequestException("MESSAGE_METADATA_SERVER_OWNED");
    const outcomeRequestId = dto.metadata?.clientMessageId ?? this.newId("request");
    if (typeof outcomeRequestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(outcomeRequestId)) throw new BadRequestException("CLIENT_MESSAGE_ID_INVALID");
    const failedSubmission = await db.conversationMessage.findUnique({ where: { id: submissionFailureId(conversationId, userId, outcomeRequestId) } });
    if (failedSubmission) {
      if (failedSubmission.metadata?.requestDigest !== toolDigest(instruction)) throw new ConflictException("MESSAGE_CONFLICT");
      return this.mapMessage(failedSubmission);
    }
    let acceptedMessageId: string | undefined;
    try {
    const workflow = await this.workflowSummary(existingConv, claims, instruction);
    if (unresolvedRedesignPreservation(instruction)) return this.saveModeNotice(existingConv, claims, instruction, dto,
      /[\u0600-\u06ff]/.test(instruction)
        ? "نقدر نقترح تصميم أصلي جديد. إيه الوظائف أو المحتوى اللي لازم يفضل، وإيه اللي ممكن نستبدله؟ ده قرار تصميم غير محسوم؛ مفيش خطة أو موافقة أو تنفيذ."
        : "We can propose an original redesign. Which existing functions/content must remain, and what may be replaced? Preservation is unresolved; no plan, approval or execution was created.");
    const response = recommendationResponse(instruction);
    if (response) {
      const prior = await this.recommendations?.latest(conversationId);
      const selected = (prior?.metadata as any)?.recommendation;
      const binding = workflow.workspace;
      if (!selected || !binding || selected.workspaceId !== binding.workspaceId || selected.bindingVersion !== binding.bindingVersion ||
        selected.runtimeId !== binding.runtimeId || selected.runtimeFingerprint !== binding.runtimeFingerprint)
        return this.saveModeNotice(existingConv, claims, instruction, dto, "Which current recommendation do you mean? No operation was started.");
      const planningObjective = recommendationPlanningObjective(selected);
      const certified = await this.agentRuntimeService?.certifiedConversationContext?.(conversationId, claims, planningObjective);
      if (!certified || certified.source.sourceRunId !== selected.sourceRunId || certified.source.checkpoint.sequence !== selected.sourceSequence)
        return this.saveModeNotice(existingConv, claims, instruction, dto, "The recommendation's certified source is no longer available. No operation was started.");
      const requestId = dto.metadata?.clientMessageId ?? this.newId("recommendation-request");
      if (typeof requestId !== "string") throw new BadRequestException("RECOMMENDATION_REQUEST_INVALID");
      if (response === "REJECT") return this.mapMessage(await this.recommendations!.reject(existingConv, claims, instruction, requestId, prior, certified.source));
      if (/(?:\bsecond\b|الثاني)/i.test(instruction) && selected.generation !== 2)
        return this.saveModeNotice(existingConv, claims, instruction, dto, "The current recommendation is not the second recommendation. Specify the recommendation you want to plan. No operation was started.");
      if (await this.recommendations!.rejected(conversationId, prior!.id))
        return this.saveModeNotice(existingConv, claims, instruction, dto, "That recommendation was rejected. Select a different current recommendation before planning. No operation was started.");
      if (selected.changeKind === "REDESIGN" && selected.preservation === "UNSPECIFIED")
        return this.saveModeNotice(existingConv, claims, instruction, dto, "Which existing functions and content should the redesign preserve? Planning needs that decision. No approval or execution occurred.");
      await this.recommendations!.accept(existingConv, claims, instruction, requestId, prior);
      const plan = await this.agentRuntimeService!.planFromConversation(conversationId, claims, planningObjective, requestId, selected.sourceRunId);
      let review = "";
      if (plan.status === "PLAN_READY") {
        try {
          if (!this.agentRuntimeService?.prepareChangeSet) throw new ServiceUnavailableException("CHANGE_SET_UNAVAILABLE");
          await this.agentRuntimeService.prepareChangeSet(conversationId, claims, { planId: plan.planId, planVersion: plan.version, planDigest: plan.digest });
          review = " The grounded Change Review is saved in this conversation.";
        } catch (error) {
          if (!(error instanceof ConflictException || error instanceof ServiceUnavailableException)) throw error;
          review = ` Change Review unavailable: ${error.message}. Exact certified before/after content and current accepted recommendation binding are required. No ChangeSet was created.`;
        }
      }
      return this.saveModeNotice(existingConv, claims, instruction, dto,
        `Accepted recommendation: ${selected.title}. Saved engineering plan ${plan.planId} · Version ${plan.version} · ${plan.status}.${review} Review its exact scope before explicit execution approval. No approval, permit or execution was created.`);
    }
    const decision = resolveConversationIntent(instruction, workflow, {
      triggerAgent: dto.triggerAgent, transferToAgent: dto.transferToAgent, runtimeEvidence: dto.runtimeEvidence !== undefined, automation: mode === "AUTOMATION" });
    if (decision.reason === "workspace-relative-scope-required") return this.saveModeNotice(existingConv, claims, instruction, dto,
      "INSPECTION_SCOPE_DENIED: use a workspace-relative target. Absolute or traversal paths cannot be dispatched by workspace inspection. No operation was started.");
    if (dto.runtimeEvidence !== undefined && decision.route !== "INSPECTION") throw new BadRequestException("Runtime evidence requires an inspection route");
    if (dto.terminalAction !== undefined || decision.route === "TERMINAL_PROPOSAL") {
      const command = dto.terminalAction;
      if (command !== undefined && (!command || typeof command !== "object" || Array.isArray(command) ||
        Object.keys(command).sort().join(",") !== "args,executable,timeoutMs" || mode === "AUTOMATION" || dto.runtimeEvidence !== undefined))
        throw new BadRequestException("TERMINAL_INPUT_INVALID");
      if (attachmentIds.length || !workflow.workspace || !this.workspaceRuntime || !this.runtimeControl) throw new BadRequestException("TERMINAL_PROPOSAL_UNAVAILABLE");
      const binding = await this.workspaceRuntime.getBinding(claims, existingConv.projectId, workflow.workspace.workspaceId, workflow.workspace.bindingVersion);
      assertConversationBinding(existingConv, binding);
      if (binding.status !== "READY") throw new ConflictException("VERIFIED_WORKSPACE_REQUIRED");
      const proposed = await this.runtimeControl.propose(claims, {
        conversationId, projectId: existingConv.projectId, runtimeId: binding.runtimeId, tool: "terminal.execute",
        input: { ...(command ?? { executable: "node", args: ["--version"], timeoutMs: 30000 }), cwd: binding.rootPath },
        purpose: instruction, requestId: outcomeRequestId
      }, undefined, binding);
      return { conversationId, messageId: `rtmsg_${toolDigest(proposed.runId)}`, agentRunId: proposed.runId, status: "AWAITING_APPROVAL" };
    }
    let shouldTrigger = decision.route === "INSPECTION";
    let shouldChat = decision.route === "CONVERSATION" || decision.route === "UNDERSTANDING";
    if (decision?.route === "AMBIGUOUS" || decision?.route === "UNAVAILABLE") {
      if (decision.reason.includes("workspace-reference") || decision.reason === "source-backed-reference-required") return this.saveModeNotice(existingConv, claims, instruction, dto,
        decision.reason === "workspace-reference-binding-changed"
          ? "The saved source belongs to a different workspace binding. Inspect the current workspace before reusing it. No operation was started."
          : "Specify which source file or element you mean. The available source references do not identify one unique target. No operation was started.");
      if (decision.reason === "workspace-binding-required") return this.saveModeNotice(existingConv, claims, instruction, dto, "Choose the workspace to inspect first. No operation was started.");
      if (decision.reason === "planning-continuation-information-invalid") return this.saveModeNotice(existingConv, claims, instruction, dto,
        "The supplied planning information is invalid or ambiguous. Specify one index.html Hero heading change using quoted before and after text, supported preservation constraints, and explicit acceptance criteria. No operation was started.");
      return this.saveModeNotice(existingConv, claims, instruction, dto, decision.route === "AMBIGUOUS"
        ? "More than one workflow matches. Specify the inspection or approval you mean. No operation was started."
        : decision.reason === "automation-not-enabled" ? "Automation scheduling and triggers are not enabled. No operation was started." : "No eligible saved workflow is available for this continuation. No operation was started.");
    }
    if (decision.route === "EXACT_PROPOSAL") {
      if (attachmentIds.length || !decision.target?.planId || !this.agentRuntimeService?.continueExactProposal) throw new BadRequestException("EXACT_PROPOSAL_UNAVAILABLE");
      const proposal = await this.agentRuntimeService.continueExactProposal(conversationId, claims, {
        planId: decision.target.planId, planVersion: decision.target.planVersion, planDigest: decision.target.digest,
        requestId: dto.metadata?.clientMessageId ?? this.newId("proposal-request")
      });
      return this.saveModeNotice(existingConv, claims, instruction, dto,
        `Exact proposal ready: ${proposal.proposalId} · Version ${proposal.version}. Review the exact change before requesting human approval. No approval, permit or execution was created.`);
    }
    if (decision?.route === "APPROVAL_GUIDANCE") {
      if (decision.reason === "plan-execution-controls-required") return this.saveModeNotice(existingConv, claims, instruction, dto,
        "Review the saved plan and use Approve for this execution, or Approve for Me for its bounded eligible steps. This message did not approve or execute anything.");
      return this.saveModeNotice(existingConv, claims, instruction, dto, `Review the exact action for run ${decision.target!.runId}${decision.target?.approvalId ? `, approval ${decision.target.approvalId}` : ""} and use its approval controls. This message does not grant approval or start execution.`);
    }
    if (decision?.reason === "persisted-workflow-state" && decision.target) {
      if (!this.agentRuntimeService?.getRun) return this.saveModeNotice(existingConv, claims, instruction, dto, "The saved workflow details are unavailable. No operation was started.");
      const run = await this.agentRuntimeService.getRun(decision.target.runId, claims);
      if (run.conversationId !== conversationId || run.projectId !== existingConv.projectId) throw new ForbiddenException("WORKFLOW_CONVERSATION_MISMATCH");
      const receipts = run.execution?.receipts ?? [];
      const content = `Saved workflow ${run.id}: ${run.execution?.status ?? run.status}.\n${run.execution?.phase ? `Phase: ${run.execution.phase}.\n` : ""}${receipts.length ? "Execution receipts: " + receipts.slice(0, 5).map(r => r.runtimeReference?.receiptId ?? r.id).join(", ") : "No execution receipt is available in the saved workflow."}\nThis message did not approve or execute an operation.`;
      return this.saveModeNotice(existingConv, claims, instruction, dto, content);
    }
    if (decision.route === "WORKSPACE") {
      if (!this.runtimeWorkspaces) throw new ServiceUnavailableException("Workspace metadata unavailable");
      const visibility = this.workspaceRuntime ? await this.workspaceRuntime.context(claims, existingConv.projectId)
        : await this.runtimeWorkspaces.visibility(userId, existingConv.projectId, claims.organizationId!);
      const { binding, listing } = visibility;
      if (modeContext(existingConv)?.workspace) assertConversationBinding(existingConv, binding);
      const arabic = /[\u0600-\u06ff]/.test(instruction);
      const names = listing?.entries.slice(0, 20).map(e => e.name).join(", ");
      const content = !binding ? (arabic ? "مفيش مجلد مشروع مربوط حاليًا. اختار مجلد المشروع الأول." : "No project folder is selected. Select a workspace folder first.")
        : arabic ? `المجلد المختار: ${binding.displayName}\n${binding.rootPath}\n${listing ? `آخر قائمة موثقة من التحقق من المجلد (${listing.observedAt}): ${names || "المجلد فارغ"}${listing.truncated || listing.entries.length > 20 ? " — القائمة المعروضة جزئية" : ""}.` : "مفيش قائمة ملفات موثقة متاحة للمجلد ده لسه."}\nالرد ده مبني على بيانات الربط المحفوظة؛ السؤال ده ما بدأش قراءة محتوى الملفات أو فحص جديد.`
        : `Selected folder: ${binding.displayName}\n${binding.rootPath}\n${listing ? `Last verified folder listing (${listing.observedAt}): ${names || "empty folder"}${listing.truncated || listing.entries.length > 20 ? " — partial listing" : ""}.` : "No verified file listing is available yet."}\nThis uses saved workspace metadata. This question did not start a file-content read or a new inspection.`;
      const availabilityNames: Record<string, string> = arabic
        ? { READY: "متصل؛ كل عملية تخضع لفحص الصلاحيات", EXPIRED_GRANT: "إذن القراءة انتهى؛ البيانات المعروضة ملاحظة محفوظة", OFFLINE: "الجهاز غير متصل؛ البيانات المعروضة ملاحظة محفوظة", REVOKED: "تم إلغاء وصول الجهاز", UNAUTHORIZED: "الوصول غير متاح", STALE: "ربط المجلد تغير", VERIFYING: "التحقق من المجلد لم يكتمل", DIRECTORY_MISSING: "المجلد غير متاح", UNBOUND: "لم يتم اختيار مجلد" }
        : { READY: "Connected; each operation still requires current authorization", EXPIRED_GRANT: "Read access expired; this is a saved observation", OFFLINE: "Computer offline; this is a saved observation", REVOKED: "Runtime access revoked", UNAUTHORIZED: "Access unavailable", STALE: "Workspace binding changed", VERIFYING: "Folder verification incomplete", DIRECTORY_MISSING: "Folder unavailable", UNBOUND: "No folder selected" };
      const availability = "availability" in visibility ? `\n${availabilityNames[String(visibility.availability)] ?? (arabic ? "حالة الوصول غير متاحة" : "Access status unavailable")}.` : "";
      return this.saveModeNotice(existingConv, claims, instruction, dto, content + availability);
    }
    if (decision.route === "PLANNING" && (decision.reason === "compatibility-handoff" || !this.agentRuntimeService?.planFromConversation)) {
      if (mode === "CHAT" || decision.reason === "compatibility-handoff" || (!modeContext(existingConv)?.source && !this.agentRuntimeService?.planFromConversation)) return this.transferToAgent(existingConv, claims, instruction, dto, attachmentIds);
      return this.saveModeNotice(existingConv, claims, instruction, dto, "Planning is unavailable. No operation was started.");
    }
    if (decision.route === "PLANNING" || decision.route === "PLAN_EXECUTION") {
      if (attachmentIds.length || dto.runtimeEvidence !== undefined) throw new BadRequestException("PLANNING_REQUIRES_CERTIFIED_CONTEXT");
      const requestId = dto.metadata?.clientMessageId ?? this.newId("plan-request");
      if (typeof requestId !== "string") throw new BadRequestException("PLANNING_REQUEST_INVALID");
      if (decision.route === "PLAN_EXECUTION") {
        if (this.agentRuntimeService?.executePlan) {
          return this.mapMessage(await this.agentRuntimeService.executePlan(conversationId, claims, instruction, requestId));
        }
        if (!this.agentRuntimeService?.preparePlanHandoff) throw new ServiceUnavailableException("Plan handoff unavailable");
        return this.mapMessage(await this.agentRuntimeService.preparePlanHandoff(conversationId, claims, instruction, requestId));
      }
      if (!this.agentRuntimeService?.planFromConversation) throw new ServiceUnavailableException("Planning unavailable");
      let plan;
      try { plan = decision.reference
        ? await this.agentRuntimeService.planFromConversation(conversationId, claims,
          `Create an engineering plan to modify only the resolved ${decision.reference.concept} source target.\nOriginal request: ${instruction}\nResolved source target (context, not authorization): ` + JSON.stringify({ concept: decision.reference.concept, path: decision.reference.relativePath, evidenceId: decision.reference.evidenceId, factId: decision.reference.factId }), requestId, decision.reference.runId)
        : await this.agentRuntimeService.planFromConversation(conversationId, claims, decision.planningInstruction ?? instruction, requestId,
          decision.reason === "pending-planning-information" ? decision.target?.runId : undefined,
          ...(decision.planningContinuationMessage ? [decision.planningContinuationMessage] : [])); }
      catch (error) {
        if (!(error instanceof ConflictException) || !error.message.startsWith("CERTIFIED_UNDERSTANDING_REQUIRED:")) throw error;
        // A new engineering turn owns its inspection prerequisite. A stale
        // continuation must still fail closed instead of silently rereading.
        if (decision.reason === "pending-planning-information" || decision.reference) throw error;
        if (!workflow.workspace) return this.saveModeNotice(existingConv, claims, instruction, dto, "Choose the workspace to inspect first. No operation was started.");
        decision.inspectionPlanningObjective = decision.planningInstruction ?? instruction;
        decision.inspectionInstruction = planningInspectionInstruction(decision.inspectionPlanningObjective);
        shouldTrigger = true; shouldChat = false;
      }
      if (plan) {
        const run = await db.agentRun.findUnique({ where: { id: plan.runId } });
        return { conversationId, messageId: `planning_attempt_${toolDigest([conversationId, requestId])}_message`, agentRunId: plan.runId, status: run.status };
      }
    }
    if (modeContext(existingConv)?.workspace) {
      const binding = await this.runtimeWorkspaces?.getActiveBinding(userId, existingConv.projectId, claims.organizationId!);
      assertConversationBinding(existingConv, binding);
    }

    // Auxiliary memory extraction & persistence (safe failure isolation: never blocks chat)
    if (this.memoryService && claims.sub && dto.content) {
      try {
        const candidates = this.memoryService.extractCandidates(instruction);
        for (const candidate of candidates) {
          await this.memoryService.upsertMemory(claims.sub, candidate, conversationId);
        }
      } catch (memErr) {
        this.logger.warn(`Auxiliary memory processing failed: ${(memErr as Error).message}`);
      }
    }

    // Attachment validation & categorization (strict user and conversation ownership)
    // Resolve ownership here. Reading itself happens once through the shared,
    // bounded Agent Context builder when reasoning is requested.
    if (attachmentIds.length > 0 && this.attachmentService) {
      for (const attId of attachmentIds) {
        const att = await this.attachmentService.getAttachment(userId, attId);
        if (att.conversationId !== conversationId) {
          throw new ForbiddenException(`Attachment ${attId} does not belong to this conversation`);
        }
      }
    }

    // A follow-up in the same Chat continues its one active inspection. Explicit
    // Chat mode and explicit evidence submissions retain their existing routing.
    if (decision.route === "INSPECTION_CONTINUATION") {
      const continued = await this.agentRuntimeService?.continueInspectionConversation?.(conversationId, claims, instruction, dto.metadata?.clientMessageId, attachmentIds);
      if (continued) return continued;
      if (decision?.route === "INSPECTION_CONTINUATION") return this.saveModeNotice(existingConv, claims, instruction, dto, "The inspection is no longer uniquely available. Refresh its saved state. No operation was started.");
    }

    const certified = decision.route === "UNDERSTANDING" && !attachmentIds.length && dto.runtimeEvidence === undefined
      ? await this.agentRuntimeService?.certifiedConversationContext?.(conversationId, claims, instruction) : null;
    if (certified) { shouldTrigger = false; shouldChat = true; }
    if (decision.reason === "certified-project-recommendation") {
      if (!certified || !this.recommendations) return this.saveModeNotice(existingConv, claims, instruction, dto,
        "Current certified source evidence is unavailable. Review the current workspace before requesting a grounded recommendation. No operation was started.");
      return this.mapMessage(await this.recommendations.suggest(existingConv, claims, instruction, outcomeRequestId,
        () => this.agentRuntimeService!.certifiedConversationContext(conversationId, claims, instruction)));
    }

    let agentContextPrompt: string | undefined;
    let contextTruncation: AgentContextTruncation | undefined;
    let receipt: EvidenceReceipt[] = [];
    let workspaceBinding: WorkspaceBinding | undefined;
    const workspaceVisibility = shouldChat && modeContext(existingConv)?.workspace && this.runtimeWorkspaces
      ? this.workspaceRuntime ? await this.workspaceRuntime.context(claims, existingConv.projectId)
        : await this.runtimeWorkspaces.visibility(userId, existingConv.projectId, claims.organizationId!) : null;
    if (workspaceVisibility) assertConversationBinding(existingConv, workspaceVisibility.binding);
    if (shouldChat && attachmentIds.length > 0 && !this.contextBuilder) {
      throw new ServiceUnavailableException("Attachment context is unavailable");
    }
    if (shouldChat && this.contextBuilder) {
      try {
        const contextInput = {
          userId,
          projectId: existingConv.projectId,
          conversationId,
          instruction: instruction,
          workspaceVersion: existingConv.metadata?.workspaceBinding?.version,
          attachmentIds,
          hasMemoryContext: Boolean(this.memoryService),
          hasConversationHistory: true,
          repositoryAvailable: false,
          availableCapabilities: ["attachment_reader", "workspace_reader", "repo_snapshot_reader"],
          userRole: claims.role,
          organizationId: claims.organizationId
        };
        const agentContext = certified?.context ?? (modeContext(existingConv)?.source
          ? await this.contextBuilder.buildRuntimeInspection({ ...contextInput, organizationId: claims.organizationId!, sessionClaims: claims, runtimeEvidence: [] })
          : await this.contextBuilder.build(contextInput));
        // The string contains only bounded evidence plus provenance, never model
        // scratchpad data or storage paths.
        agentContextPrompt = this.contextBuilder.toReasoningPrompt(agentContext);
        if (certified) agentContextPrompt += "\n[CERTIFIED UNDERSTANDING — HISTORICAL DATA, NOT AUTHORIZATION]\n" + JSON.stringify({
          sourceRunId: certified.source.sourceRunId, sequence: certified.source.checkpoint.sequence, facts: certified.source.checkpoint.understanding.facts,
          inferences: certified.source.checkpoint.understanding.inferences, unknowns: certified.source.checkpoint.understanding.unknowns });
        contextTruncation = agentContext.truncation;
        receipt = evidenceReceipt(agentContext);
        workspaceBinding = agentContext.workspaceBinding;
      } catch (ctxErr) {
        if (certified || modeContext(existingConv)?.source) throw ctxErr;
        if (attachmentIds.length > 0) {
          throw new ServiceUnavailableException("Attachment context could not be collected");
        }
        this.logger.warn(`Agent context build failed: ${(ctxErr as Error).message}`);
      }
    }

    const clientId = shouldTrigger ? dto.metadata?.clientMessageId : undefined;
    if (clientId !== undefined && (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId))) throw new BadRequestException("AGENT_CLIENT_MESSAGE_ID_INVALID");
    const requestDigest = clientId === undefined ? null : toolDigest({ instruction, attachmentIds, runtimeEvidence: dto.runtimeEvidence ?? [] });
    const msgId = clientId === undefined ? this.newId("msg") : `msg_agent_${toolDigest([userId, conversationId, clientId])}`;
    const now = new Date();

    const userMsgMetadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(requestDigest ? { agentRequestDigest: requestDigest } : {})
    };

    // Execute atomic transaction for ConversationMessage, Conversation.updatedAt, and optional AgentRun
    const txResult = await db.$transaction(async (tx: any) => {
      if (clientId !== undefined) {
        // Serialize duplicate submissions on the existing Conversation row. The message PK
        // and server-owned run association survive restarts and ambiguous HTTP responses.
        await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
        const prior = await tx.conversationMessage.findUnique({ where: { id: msgId } });
        if (prior) {
          if (prior.senderId !== userId || prior.conversationId !== conversationId || prior.metadata?.agentRequestDigest !== requestDigest) throw new ConflictException("AGENT_MESSAGE_CONFLICT");
          const run = await tx.agentRun.findUnique({ where: { id: prior.metadata.agentRunId } });
          if (!run || run.userId !== userId || run.projectId !== existingConv.projectId || run.conversationId !== conversationId) throw new ConflictException("AGENT_MESSAGE_RUN_CONFLICT");
          return { msg: prior, agentRunSummary: run, duplicate: true };
        }
      }
      // 1. Create ConversationMessage
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const msg = await tx.conversationMessage.create({
        data: {
          id: msgId,
          conversationId,
          senderId: userId,
          senderType: dto.senderType ?? "user",
          content: instruction,
          metadata: userMsgMetadata
        }
      });

      // 2. Update Conversation updatedAt timestamp
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: now, ...(workspaceBinding ? { metadata: { ...(existingConv.metadata ?? {}), workspaceBinding } } : {}) }
      });

      // 3. If triggerAgent === true, create AgentRun within this SAME transaction
      let agentRunSummary: AgentRunSummaryDto | null = null;
      if (shouldTrigger) {
        if (!this.agentRuntimeService) {
          throw new ServiceUnavailableException("AgentRuntimeService is unavailable in this environment");
        }
        agentRunSummary = await this.agentRuntimeService.createRunTx(tx, claims, {
          projectId: existingConv.projectId,
          instruction: decision.inspectionInstruction ?? instruction,
          conversationId,
          attachmentIds,
          runtimeEvidence: dto.runtimeEvidence,
          title: `Agent: ${instruction.slice(0, 50)}`
        }, msgId, decision.inspectionPlanningObjective);
        if (clientId !== undefined) await tx.conversationMessage.update({ where: { id: msgId }, data: { metadata: { ...userMsgMetadata, agentRunId: agentRunSummary.id } } });
      }

      return { msg, agentRunSummary, duplicate: false };
    });

    acceptedMessageId = txResult.msg.id as string;
    // Derived account history is advisory and comes only from committed sources.
    await this.historicalMemory?.deriveCommitted(conversationId, userId);

    // 4. Background scheduling happens ONLY after successful transaction commit
    if (shouldTrigger && txResult.agentRunSummary && this.agentRuntimeService) {
      if (!txResult.duplicate) this.agentRuntimeService.scheduleRunExecution(
        txResult.agentRunSummary.id,
        claims,
        instruction
      );

      const triggerResponse: TriggerAgentMessageResponseDto = {
        conversationId,
        messageId: txResult.msg.id as string,
        agentRunId: txResult.agentRunSummary.id,
        status: txResult.agentRunSummary.status
      };
      return triggerResponse;
    }

    // 5. Dedicated conversational chat path: route directly to SEKHEM Agent and return real assistant response
    if (shouldChat) {
      if (!this.agentRuntimeService) {
        throw new ServiceUnavailableException("AgentRuntimeService is unavailable in this environment");
      }

      let history: Array<{ role: string; content: string }> = [];
      let instructionToSend = instruction;
      const historical = existingConv.metadata?.historicalContext ? await this.resolveHistoricalContext(existingConv, claims) : null;
      const accountHistory = await this.historicalMemory?.retrieve(claims, instruction, async () => {
        if (!this.projectAccess) throw new Error("HISTORICAL_MEMORY_ACCESS_UNAVAILABLE");
        return this.projectAccess.visibleIds(claims);
      });
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        let previousMessages = await db.conversationMessage.findMany({
          where: {
            conversationId,
            id: { not: msgId }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: ASSISTANT_CONTEXT_LIMITS.historyMessages
        });

        if (this.runtimeWorkspaces) previousMessages = await this.runtimeWorkspaces.modelMessages(previousMessages);
        const transferred = await transferredConversation(db, existingConv);
        if (transferred) {
          const sourceMessages = await db.conversationMessage.findMany({ where: { conversationId: transferred.parent.id,
            id: { in: [...transferred.source.contextMessageIds, transferred.source.messageId] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: ASSISTANT_CONTEXT_LIMITS.historyMessages });
          previousMessages = [...previousMessages, ...(this.runtimeWorkspaces ? await this.runtimeWorkspaces.modelMessages(sourceMessages) : sourceMessages)].slice(0, ASSISTANT_CONTEXT_LIMITS.historyMessages);
        }
        if (Array.isArray(previousMessages)) {
          const rawItems = previousMessages
            .slice().reverse()
            .filter((m: any) => m && typeof m.content === "string" && m.content.trim())
            .map((m: any) => ({
              role: m.senderType === "assistant" ? "assistant" : "user",
              content: m.metadata?.modeNotice === true && /^(?:المجلد المختار: |Selected folder: )/.test(m.content)
                ? "Workspace metadata was shown in Details. It is not file-content evidence; current availability is supplied separately."
                : m.content.trim()
            }));

          // 1. Coalesce consecutive messages with the same role to preserve real content safely
          const coalesced: Array<{ role: string; content: string }> = [];
          for (const item of rawItems) {
            const last = coalesced[coalesced.length - 1];
            if (last && last.role === item.role) {
              if (last.content === item.content) {
                // Identical consecutive message: avoid duplication
              } else if (!last.content.includes(item.content)) {
                last.content = `${last.content}\n${item.content}`;
              }
            } else {
              coalesced.push({ role: item.role, content: item.content });
            }
          }

          // 2. Handle trailing user message to avoid duplicate questions and user-user runs
          if (!agentContextPrompt && coalesced.length > 0 && coalesced[coalesced.length - 1].role === "user") {
            const trailingUser = coalesced.pop()!;
            if (trailingUser.content === instructionToSend) {
              // Trailing message is already represented by current instruction
            } else if (!instructionToSend.includes(trailingUser.content)) {
              // Unanswered previous user content: merge with current instruction to preserve real context safely
              instructionToSend = `${trailingUser.content}\n${instructionToSend}`;
            }
          }

          history = coalesced;
        }
      } catch {
        // Retain empty history if retrieval fails
      }

      // Evidence now reaches the model through one structured Agent Context
      // contract shared with durable agent runs.
      if (agentContextPrompt) {
        instructionToSend = agentContextPrompt;
      }
      if (workspaceVisibility?.binding) {
        // Connection semantics belong in model prose context; binding identifiers
        // remain in durable message metadata for Details.
        instructionToSend += "\n[WORKSPACE VISIBILITY — not source contents or authorization]\n" +
          ("availability" in workspaceVisibility && workspaceVisibility.availability === "READY"
            ? "The selected workspace is connected. " : "The selected workspace connection is not confirmed. ") +
          "This connection observation did not read any file contents. " +
          "Never assert file contents, errors, architecture, quality or activity recency from filenames, directory entries or timestamps. If no certified file evidence is supplied, say what remains uninspected; do not invent a review. Keep technical metadata in Details, not the conversational answer. Distinguish observed source facts, uncertain inferences, recommendations and unknowns.";
      }

      const chatRes = await this.agentRuntimeService.executeChat(claims, {
        conversationId,
        instruction: instructionToSend + (historical?.prompt ?? ""),
        ...(accountHistory ? { historicalMemory: accountHistory } : {}),
        history
      }).catch(async error => {
        const diagnostic = diagnosticFromError(error);
        if (diagnostic) {
          await db.conversationMessage.update({ where: { id: msgId }, data: { metadata: { ...userMsgMetadata, diagnostic } } })
            .catch(() => this.logger.warn("Failed to retain provider diagnostic metadata"));
        }
        throw error;
      });

      if (certified) {
        const fresh = await this.agentRuntimeService.certifiedConversationContext(conversationId, claims, instruction);
        if (!fresh || fresh.source.sourceRunId !== certified.source.sourceRunId || fresh.source.digest !== certified.source.digest) throw new ConflictException("UNDERSTANDING_CHANGED");
      }
      const assistantMsgId = this.newId("msg_asst");
      const asstNow = new Date();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const assistantMsg = await db.conversationMessage.create({
        data: {
          id: assistantMsgId,
          conversationId,
          senderId: "SekhemEngineer",
          senderType: "assistant",
          content: declaresPlanningReadiness(chatRes.answer)
            ? "Planning readiness must come from a validated, persisted engineering plan. This conversational response did not create or update a plan. Supply the pending planning information through the planning continuation. No operation was started."
            : chatRes.answer,
          metadata: {
            source: "sekhem_chat",
            ...(accountHistory ? { accountHistoricalMemory: { state: accountHistory.state, items: accountHistory.items.map(item => ({ id: item.id, revision: item.revision, sourceConversationId: item.sourceConversationId, sourceMessageId: item.sourceMessageId, sourceDigest: item.sourceDigest })) } } : {}),
            ...(historical ? { historicalContext: { sourceConversationId: historical.view.sourceConversationId, state: historical.view.state } } : {}),
            evidenceReceipt: receipt,
            ...(certified ? { certifiedUnderstanding: { sourceRunId: certified.source.sourceRunId, sequence: certified.source.checkpoint.sequence, digest: certified.source.digest } } : {}),
            ...(workspaceBinding ? { workspaceBinding } : {}),
            modelId: chatRes.modelId || "GLM-5.2-Abliterated",
            providerId: chatRes.providerId,
            ...(chatRes.diagnostic ? { diagnostic: chatRes.diagnostic } : {}),
            ...(chatRes.contextBudget ? { contextBudget: chatRes.contextBudget } : {}),
            ...(contextTruncation ? { contextTruncation } : {})
          },
          createdAt: asstNow
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (db.conversation && typeof db.conversation.update === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: asstNow }
        }).catch(() => { });
      }

      return this.mapMessage(assistantMsg);
    }

    return this.mapMessage(txResult.msg);
    } catch (error) {
      // A stale bound conversation rejects admission before accepting a submission.
      if (error instanceof ConflictException && error.message === "CONVERSATION_WORKSPACE_CHANGED") throw error;
      await persistSubmissionFailure(db, existingConv, userId, outcomeRequestId, instruction, error, acceptedMessageId);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Create assistant message from agent execution (Idempotent single path)
  // ---------------------------------------------------------------------------

  async createAssistantMessage(
    conversationId: string,
    agentRunId: string,
    content: string,
    agentName = "SekhemEngineer",
    outcome?: AgentOutcome
  ): Promise<ConversationMessageDto> {
    if (!conversationId?.trim()) {
      throw new BadRequestException("conversationId is required");
    }
    if (!agentRunId?.trim()) {
      throw new BadRequestException("agentRunId is required");
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      throw new BadRequestException("content is required");
    }

    const db = this.requirePrisma();
    const deterministicId = `msg_agent_${agentRunId.trim()}`;

    // 1. Idempotency check: verify whether a message with this deterministic ID already exists
    if (db.conversationMessage) {
      if (typeof db.conversationMessage.findUnique === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const existing = await db.conversationMessage.findUnique({
          where: { id: deterministicId }
        }).catch(() => null);
        if (existing) {
          return this.mapMessage(existing);
        }
      }

      if (typeof db.conversationMessage.findFirst === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const existing = await db.conversationMessage.findFirst({
          where: { id: deterministicId }
        }).catch(() => null);
        if (existing) {
          return this.mapMessage(existing);
        }
      }

      // In-memory test mock compatibility (findMany filter)
      if (typeof db.conversationMessage.findMany === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const existingList = await db.conversationMessage.findMany({
          where: { conversationId: conversationId.trim() }
        }).catch(() => []);
        if (Array.isArray(existingList)) {
          const matched = existingList.find(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (m: any) => m.id === deterministicId || m.metadata?.agentRunId === agentRunId.trim()
          );
          if (matched) {
            return this.mapMessage(matched);
          }
        }
      }

      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const created = await db.conversationMessage.create({
        data: {
          id: deterministicId,
          conversationId: conversationId.trim(),
          senderId: agentName || "assistant",
          senderType: "assistant",
          content: content.trim(),
          metadata: {
            agentRunId: agentRunId.trim(),
            agentName: agentName || "SekhemEngineer",
            source: "agent_execution",
            ...(outcome ? { outcome } : {})
          },
          createdAt: now
        }
      });

      // Update Conversation updatedAt
      if (db.conversation && typeof db.conversation.update === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.conversation.update({
          where: { id: conversationId.trim() },
          data: { updatedAt: now }
        }).catch(() => { });
      }

      return this.mapMessage(created);
    }

    throw new ServiceUnavailableException("Database conversationMessage delegate is unavailable");
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  async generatePlan(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("Planning unavailable");
    return this.agentRuntimeService.generatePlan(conversationId, claims, body);
  }
  async prepareExactProposal(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("Exact proposal preparation unavailable");
    return this.agentRuntimeService.prepareExactProposal(conversationId, claims, body);
  }
  async decidePlanWorkflow(conversationId: string, claims: SessionClaims, body: unknown) {
    await this.getConversation(conversationId, claims.sub, claims);
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("WORKFLOW_CONTROL_UNAVAILABLE");
    return this.agentRuntimeService.decidePlanWorkflow(conversationId, claims, body);
  }
  async approvePlanWorkflow(conversationId: string, claims: SessionClaims, body: unknown) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("WORKFLOW_EXECUTION_UNAVAILABLE");
    return this.agentRuntimeService.approvePlanWorkflow(conversationId, claims, body);
  }
  async exactProposalApproval(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, deciding: boolean) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return this.agentRuntimeService.exactProposalApproval(conversationId, proposalId, claims, body, deciding);
  }
  async executeExactProposal(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_EXECUTION_UNAVAILABLE");
    return this.agentRuntimeService.executeExactProposal(conversationId, proposalId, claims, body);
  }
  async taskConsent(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, approve = false, scope: "TASK" | "SESSION" = "TASK") {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return this.agentRuntimeService.taskConsent(conversationId, proposalId, claims, body, approve, scope);
  }
  async readTaskConsent(conversationId: string, policyId: string, claims: SessionClaims, revoke = false) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_APPROVAL_UNAVAILABLE");
    return this.agentRuntimeService.readTaskConsent(conversationId, policyId, claims, revoke);
  }
  async recoverExecutionVerification(conversationId: string, runId: string, claims: SessionClaims, requestId: string) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_EXECUTION_UNAVAILABLE");
    await this.getConversation(conversationId, claims.sub, claims);
    return this.agentRuntimeService.recoverExecutionVerification(conversationId, runId, claims, requestId);
  }
  async reviewExecution(conversationId: string, runId: string, claims: SessionClaims, planVersion?: number) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_EXECUTION_UNAVAILABLE");
    await this.getConversation(conversationId, claims.sub, claims);
    const run = await this.agentRuntimeService.getRun(runId, claims);
    if (run.conversationId !== conversationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
    return this.agentRuntimeService.executionView(runId, claims, planVersion);
  }
  async issueExactProposalPermit(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!this.agentRuntimeService) throw new ServiceUnavailableException("EXACT_PERMIT_UNAVAILABLE");
    return this.agentRuntimeService.issueExactProposalPermit(conversationId, proposalId, claims, body);
  }

  private async workflowSummary(conversation: any, claims: SessionClaims, instruction = ""): Promise<ConversationWorkflowSummary> {
    // Routing uses the saved conversation coordinates; admission still checks current authority.
    const saved = modeContext(conversation);
    const reference = conversation.metadata?.runtimeWorkspace;
    const legacy = !saved && reference ? await this.runtimeWorkspaces?.getBinding(reference.workspaceId) : null;
    const binding = saved?.workspace ?? (legacy && legacy.version === reference.bindingVersion && legacy.userId === claims.sub &&
      legacy.projectId === conversation.projectId && legacy.organizationId === claims.organizationId ? { ...legacy, bindingVersion: legacy.version } : null);
    const summary: ConversationWorkflowSummary = { activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null,
      pendingApprovals: [], workflows: [], eligiblePlans: [], references: [], recentConcepts: [], workspace: binding ? { workspaceId: binding.workspaceId, bindingVersion: binding.bindingVersion, runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint } : null };
    const db = this.requirePrisma();
    if (!db.agentRun?.findMany) return summary;
    if (summary.workspace && this.runtimeWorkspaces?.visibility) {
      const visibility = await this.runtimeWorkspaces.visibility(claims.sub, conversation.projectId, claims.organizationId!);
      if (visibility.binding?.workspaceId === summary.workspace.workspaceId && visibility.binding.version === summary.workspace.bindingVersion &&
        visibility.binding.runtimeId === summary.workspace.runtimeId && visibility.binding.runtimeFingerprint === summary.workspace.runtimeFingerprint && visibility.listing) {
        summary.workspaceFiles = visibility.listing.entries.filter(e => e.type === "file").map(e => e.name);
        summary.workspaceFilesTruncated = visibility.listing.truncated;
      }
    }
    const scope = { conversationId: conversation.id, userId: claims.sub, projectId: conversation.projectId };
    const options = { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, createdAt: true } };
    const [current, historical, latestPlan, approvals] = await Promise.all([
      db.agentRun.findMany({ ...options, where: { ...scope, status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] } }, take: 21 }),
      db.agentRun.findMany({ ...options, where: { ...scope, status: "COMPLETED" }, take: 20 }),
      db.agentRun.findMany({ ...options, where: { ...scope, id: { startsWith: "planning_run_" } }, take: 21 }),
      db.agentApproval?.findMany ? db.agentApproval.findMany({ where: { status: "PENDING", agentRun: scope }, orderBy: { createdAt: "desc" }, take: 41, select: { id: true, agentRunId: true } }) : []
    ]);
    summary.truncated = current.length > 20 || approvals.length > 40 || latestPlan.length > 20;
    summary.pendingApprovals = approvals.slice(0, 40).map((a: any) => ({ runId: a.agentRunId, approvalId: a.id }));
    const pendingRuns = summary.pendingApprovals.length ? await db.agentRun.findMany({ ...options, where: { ...scope, id: { in: [...new Set(summary.pendingApprovals.map(a => a.runId))] } }, take: 40 }) : [];
    const runs: any[] = [...new Map([...latestPlan, ...current.slice(0, 20), ...pendingRuns, ...historical].map((r: any) => [r.id, r])).values()];
    const recent = db.conversationMessage?.findMany ? await db.conversationMessage.findMany({ where: { conversationId: conversation.id, senderType: "user", senderId: claims.sub },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: ASSISTANT_CONTEXT_LIMITS.historyMessages, select: { content: true } }) : [];
    for (const message of recent) {
      const request = typeof message.content === "string" ? naturalWorkspaceRequest(message.content, true) : null;
      if (request?.concepts.length) { summary.recentConcepts = request.concepts; break; }
      if (typeof message.content === "string" && requestsWorkspace(message.content)) break;
    }
    const requestConcepts = naturalWorkspaceRequest(instruction)?.concepts;
    const referenceConcepts = requestConcepts?.length ? requestConcepts : summary.recentConcepts;
    const referenceKeys = new Set<string>();
    const ordered = [...runs].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    for (const row of ordered) {
      const run = this.agentRuntimeService?.getRun ? await this.agentRuntimeService.getRun(row.id, claims) : null;
      const inspection = run?.inspection ?? await this.agentRuntimeService?.inspectionView?.(row.id, claims);
      if (inspection && inspection.evidence.length > REFERENCE_LIMIT) summary.referencesTruncated = true;
      const workspaceMatches = inspection && summary.workspace && inspection.workspace.workspaceId === summary.workspace.workspaceId && inspection.workspace.bindingVersion === summary.workspace.bindingVersion && inspection.workspace.runtimeId === summary.workspace.runtimeId;
      if (workspaceMatches && !["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(inspection.state)) summary.activeInspections.push({ runId: row.id, state: inspection.state });
      if (inspection) for (const reference of inspectionReferences(row.id, inspection)) {
        if (!referenceConcepts?.includes(reference.concept)) continue;
        const key = JSON.stringify([reference.workspaceId, reference.bindingVersion, reference.runtimeFingerprint, reference.concept, reference.relativePath, reference.factDigest ?? null]);
        if (!referenceKeys.has(key)) {
          referenceKeys.add(key);
          if (summary.references!.length < REFERENCE_LIMIT) summary.references!.push(reference);
          else summary.referencesTruncated = true;
        }
      }
      const checkpoint = inspection?.understanding;
      if (!summary.certifiedUnderstanding && workspaceMatches && inspection.state === "COMPLETED" && checkpoint?.status === "GROUNDED" && checkpoint.understanding.readiness === "UNDERSTANDING_READY" && checkpoint.grounding?.complete !== false) summary.certifiedUnderstanding = { runId: row.id, sequence: checkpoint.sequence };
      const plan = run?.presentation?.engineeringPlan;
      if (plan || run?.execution || row.status === "AWAITING_APPROVAL") summary.workflows!.push({ runId: row.id, ...(plan ? { planId: plan.planId } : {}) });
      if (plan && run?.presentation?.planning?.plan.readiness === "PLAN_READY" && run.presentation.planning.plan.validation?.valid === true && !run.execution && summary.workspace &&
        plan.workspace.workspaceId === summary.workspace.workspaceId && plan.workspace.bindingVersion === summary.workspace.bindingVersion &&
        plan.workspace.runtimeId === summary.workspace.runtimeId && plan.workspace.runtimeFingerprint === summary.workspace.runtimeFingerprint) {
        const workflow = await projectDownstreamWorkflow(db, { ...row, planVersion: plan.planVersion, plans: [{ id: plan.planId, steps: [{ parameters: { engineeringPlan: plan } }] }] }, conversation);
        if (!workflow || workflow.proposal.state === "READY") summary.eligiblePlans!.push({ runId: row.id, planId: plan.planId, planVersion: plan.planVersion, digest: plan.digest, ...(workflow ? { proposalId: workflow.proposal.id } : {}) });
      }
      if (!summary.latestPlan && plan) {
        summary.latestPlan = { runId: row.id, planId: plan.planId, readiness: run!.presentation!.planning?.plan.readiness ?? "PLAN_NOT_READY" };
        const information = run?.presentation?.planning?.readinessDiagnostic?.requirements ?? [];
        const pendingInformation = information.filter(i => i.source === "REQUEST_CONTEXT" && i.classification === "REQUIRED_FOR_PLAN" && i.status === "UNKNOWN" && i.blocking);
        if (!run?.execution && summary.latestPlan.readiness === "PLAN_NOT_READY" && summary.workspace &&
          plan.workspace.workspaceId === summary.workspace.workspaceId && plan.workspace.bindingVersion === summary.workspace.bindingVersion &&
          plan.workspace.runtimeId === summary.workspace.runtimeId && plan.workspace.runtimeFingerprint === summary.workspace.runtimeFingerprint &&
          pendingInformation.length > 0) {
          const persisted = await db.agentPlan.findUnique({ where: { id: plan.planId } });
          if (persisted?.agentRunId === row.id && persisted.version === plan.planVersion && typeof persisted.summary === "string" && persisted.summary.length <= 3000 &&
            typeof plan.sourceRunId === "string") summary.pendingPlanning = [{ runId: row.id, sourceRunId: plan.sourceRunId, objective: persisted.summary,
              missingInformationIds: pendingInformation.map(i => i.id) }];
        }
      }
      if (!summary.execution && run?.execution) summary.execution = { runId: row.id, status: run.execution.status };
      for (const approval of run?.pendingApprovals ?? []) summary.pendingApprovals.push({ runId: row.id, approvalId: approval.id });
      if (row.status === "AWAITING_APPROVAL" && !summary.pendingApprovals.some(a => a.runId === row.id)) summary.pendingApprovals.push({ runId: row.id });
    }
    // Explicit proposal preparation may reference an immutable READY revision
    // hidden by a later NOT_READY revision. This is routing context only: the
    // proposal service independently enforces current-version/source admission.
    if ((requestsExactProposal(instruction) || requestsPlanHandoff(instruction) && /^نف/.test(instruction.trim())) && summary.workspace && db.agentPlan?.findMany && this.agentRuntimeService?.getRun) {
      const ready = await db.agentPlan.findMany({ where: { status: "PLAN_READY", agentRun: scope },
        orderBy: [{ createdAt: "desc" }, { version: "desc" }, { id: "desc" }], take: 21 });
      if (ready.length > 20) summary.truncated = true;
      for (const savedPlan of ready.slice(0, 20)) {
        const identity = savedPlan.steps?.[0]?.parameters?.engineeringPlan;
        const result = savedPlan.steps?.[0]?.parameters?.planning;
        if (!identity || identity.planId !== savedPlan.id || identity.planVersion !== savedPlan.version ||
          result?.plan?.readiness !== "PLAN_READY" || result.plan.validation?.valid !== true ||
          toolDigest(identity.workspace) !== toolDigest(summary.workspace)) continue;
        const run = await this.agentRuntimeService?.getRun(savedPlan.agentRunId, claims);
        if (!run || run.conversationId !== conversation.id || run.projectId !== conversation.projectId || run.execution) continue;
        const workflow = await projectDownstreamWorkflow(db, { id: run.id, planVersion: savedPlan.version, plans: [savedPlan] }, conversation);
        if (workflow && workflow.proposal.state !== "READY") continue;
        if (!summary.eligiblePlans!.some(p => p.planId === savedPlan.id)) summary.eligiblePlans!.push({ runId: run.id,
          planId: savedPlan.id, planVersion: savedPlan.version, digest: identity.digest, ...(workflow ? { proposalId: workflow.proposal.id } : {}) });
      }
    }
    if (summary.eligiblePlans!.length > 20) summary.truncated = true;
    summary.eligiblePlans = summary.eligiblePlans!.slice(0, 20);
    // Overflow is explicit routing uncertainty, never invented workflow references.

    if (summary.pendingApprovals.length > 40) summary.truncated = true;
    summary.pendingApprovals = [...new Map(summary.pendingApprovals.map(a => [a.approvalId ?? a.runId, a])).values()].slice(0, 40);
    return summary;
  }

  private async saveModeNotice(conversation: any, claims: SessionClaims, instruction: string, dto: PostMessageDto, content: string) {
    const clientId = dto.metadata?.clientMessageId ?? this.newId("request");
    if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) throw new BadRequestException("CLIENT_MESSAGE_ID_INVALID");
    return this.requirePrisma().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
      const id = `mode_message_${toolDigest([conversation.id, claims.sub, clientId])}`;
      const previous = await tx.conversationMessage.findUnique({ where: { id } });
      if (previous && previous.content !== instruction) throw new ConflictException("MESSAGE_CONFLICT");
      if (!previous) await tx.conversationMessage.create({ data: { id, conversationId: conversation.id, senderId: claims.sub, senderType: "user", content: instruction, metadata: { clientMessageId: clientId } } });
      const reply = await tx.conversationMessage.upsert({ where: { id: `${id}_reply` }, create: { id: `${id}_reply`, conversationId: conversation.id, senderId: "agent", senderType: "assistant", content, metadata: { modeNotice: true, executionStarted: false } }, update: {} });
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      return this.mapMessage(reply);
    });
  }

  private async transferToAgent(conversation: any, claims: SessionClaims, instruction: string, dto: PostMessageDto, attachmentIds: string[]) {
    if (this.projectAccess) await this.projectAccess.assert(claims, conversation.projectId, "CREATE");
    for (const id of attachmentIds) {
      const attachment = await this.attachmentService!.getAttachment(claims.sub, id);
      if (attachment.conversationId !== conversation.id) throw new ForbiddenException("ATTACHMENT_CONVERSATION_MISMATCH");
    }
    const clientId = dto.metadata?.clientMessageId ?? this.newId("transfer");
    if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) throw new BadRequestException("CLIENT_MESSAGE_ID_INVALID");
    const messageId = `transfer_msg_${toolDigest([claims.sub, conversation.id, clientId])}`;
    // Compatibility response field: new handoffs retain the original conversation.
    const agentConversationId = conversation.id;
    // Only authoritative inspection views contribute references; caller metadata never supplies evidence.
    const runs = await this.requirePrisma().agentRun.findMany({ where: { conversationId: conversation.id, userId: claims.sub, projectId: conversation.projectId }, orderBy: { createdAt: "desc" }, take: 10 });
    const evidence = new Map<string, import("../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference>();
    for (const run of runs) {
      const view = await this.agentRuntimeService?.inspectionView(run.id, claims);
      for (const ref of view?.evidence ?? []) if (ref.verificationState === "VERIFIED" && ref.conversationId === conversation.id && !evidence.has(ref.receiptId)) evidence.set(ref.receiptId, ref);
    }
    const sourceMessages = await this.requirePrisma().conversationMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 50 });
    for (const msg of sourceMessages) {
      const receipts = msg.metadata?.evidenceReceipt;
      if (Array.isArray(receipts)) {
        for (const receipt of receipts) {
          const ref = receipt.runtimeReference;
          if (ref && ref.verificationState === "VERIFIED" && ref.conversationId === conversation.id && !evidence.has(ref.receiptId)) evidence.set(ref.receiptId, ref);
        }
      }
    }
    const active = await this.runtimeWorkspaces?.getActiveBinding(claims.sub, conversation.projectId, claims.organizationId!);
    if (!active || active.status !== "READY") throw new ConflictException("VERIFIED_WORKSPACE_REQUIRED");
    assertConversationBinding(conversation, active);
    const admittedReferences = [...evidence.values()].filter(ref => ref.workspaceId === active.workspaceId && ref.bindingVersion === active.version && ref.runtimeId === active.runtimeId && ref.runtimeFingerprint === active.runtimeFingerprint).slice(0, 5);
      let receipts: EvidenceReceipt[] = [];
      if (admittedReferences.length) {
        if (!this.contextBuilder) throw new ServiceUnavailableException("Workspace evidence admission unavailable");
        const admitted = await this.contextBuilder.buildRuntimeInspection({ userId: claims.sub, userRole: claims.role,
          organizationId: claims.organizationId!, sessionClaims: claims, projectId: conversation.projectId,
          conversationId: conversation.id, instruction, runtimeEvidence: admittedReferences, availableCapabilities: ["workspace_reader"] });
        receipts = evidenceReceipt(admitted);
      }
    return this.requirePrisma().$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
      const current = await tx.conversation.findUnique({ where: { id: conversation.id } });
      if (!current || current.userId !== claims.sub || current.projectId !== conversation.projectId || !["CHAT", "AGENT"].includes(conversationMode(current))) throw new ConflictException("TRANSFER_SOURCE_CHANGED");
      const previous = await tx.conversationMessage.findUnique({ where: { id: messageId } });
      if (previous) {
        if (previous.content !== instruction || toolDigest(previous.metadata?.attachmentIds ?? []) !== toolDigest(attachmentIds)) throw new ConflictException("TRANSFER_MESSAGE_CONFLICT");
        // Idempotent retries of historical transfers retain their original target.
        const targetId = previous.metadata?.agentConversationId;
        if (targetId !== current.id) {
          const child = await tx.conversation.findUnique({ where: { id: targetId } });
          if (!child) throw new ConflictException("TRANSFER_TARGET_MISSING");
          await transferredConversation(tx, child);
          return { kind: "AGENT_TRANSFER" as const, conversationId: current.id, messageId, agentConversationId: targetId as string };
        }
        return { kind: "AGENT_TRANSFER" as const, conversationId: current.id, messageId, agentConversationId };
      }
      const binding = await this.runtimeWorkspaces?.activeBindingTx(tx, claims.sub, current.projectId, claims.organizationId!);
      if (!binding || binding.status !== "READY") throw new ConflictException("VERIFIED_WORKSPACE_REQUIRED");
      if (modeContext(current)?.workspace) assertConversationBinding(current, binding);
      await this.runtimeWorkspaces!.assertInspectionBindingTx(tx, { ...binding, bindingVersion: binding.version });
      const context: ConversationModeContext = { version: 1, mode: "AGENT", organizationId: claims.organizationId!,
        ...(modeContext(current)?.source ? { source: modeContext(current)!.source } : {}), workspace: {
        workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint } };
      if (binding.workspaceId !== active.workspaceId || binding.version !== active.version || binding.runtimeId !== active.runtimeId || binding.runtimeFingerprint !== active.runtimeFingerprint) throw new ConflictException("CONVERSATION_WORKSPACE_CHANGED");
      await tx.conversationMessage.create({ data: { id: messageId, conversationId: current.id, senderId: claims.sub, senderType: "user", content: instruction,
        metadata: { clientMessageId: clientId, agentConversationId, attachmentIds } } });
      await tx.conversationMessage.create({ data: { id: `${messageId}_source_notice`, conversationId: current.id, senderId: "agent", senderType: "assistant",
        content: "Workspace work is available in this conversation with its verified context. Review the exact proposal before approving changes. Current runtime access and execution authorization are checked separately. No execution has started.",
        metadata: { handoffContext: true, evidenceReceipt: receipts, executionStarted: false } } });
      await tx.conversation.update({ where: { id: current.id }, data: { updatedAt: new Date(), metadata: { ...current.metadata, modeContext: context } } });
      return { kind: "AGENT_TRANSFER" as const, conversationId: current.id, messageId, agentConversationId };
    });
  }

  private attachmentReadNotice(fileName: string, error: unknown): string {
    const code = error instanceof FileIntelligenceError ? error.code :
      error && typeof error === "object" && "getStatus" in error && typeof (error as { getStatus?: unknown }).getStatus === "function"
        ? (error as { getStatus(): number }).getStatus() === 404 ? "ATTACHMENT_NOT_FOUND" : "ATTACHMENT_ACCESS_DENIED"
        : "FILE_EXTRACTION_FAILED";
    const explanation: Record<string, string> = {
      UNSUPPORTED_FILE_FORMAT: "The content is not supported for reading. Bounded text source and supported text PDFs can be read; binary formats cannot.",
      IMAGE_INTELLIGENCE_NOT_AVAILABLE: "Image OCR/vision is not available in the deterministic file-reading pipeline.",
      SCANNED_DOCUMENT_OCR_REQUIRED: "This PDF appears to require OCR, which is not available.",
      ATTACHMENT_NOT_FOUND: "The attachment is no longer available.",
      ATTACHMENT_ACCESS_DENIED: "This attachment is not available in this conversation.",
      FILE_EXTRACTION_FAILED: "The attachment could not be safely extracted."
    };
    return `[Attachment Notice: "${fileName}" (${code}): ${explanation[code] ?? "The attachment could not be read."}]`;
  }

  /**
   * Bounded, safe projection of an AgentRunEvent payload for Activity Details.
   * Only whitelisted diagnostic/identifier fields survive; raw payloads, prompts,
   * tool outputs and any credential-like values never reach the snapshot.
   */
  private static activityDetail(payload: unknown): Record<string, string> | undefined {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
    const source = payload as Record<string, unknown>;
    const code = (value: unknown): string | null =>
      typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.trim()) ? value.trim() : null;
    const id = (value: unknown): string | null =>
      typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
    const detail: Record<string, string> = {};
    const status = code(source.status) ?? code(source.newStatus) ?? code(source.state);
    if (status) detail.status = status;
    const reason = code(source.failureReason) ?? code(source.reason);
    if (reason) detail.reason = reason;
    const diagnostic = code(source.code) ?? code(source.outcome) ??
      (Array.isArray(source.codes) && source.codes.length && source.codes.every(c => typeof c === "string") ?
        source.codes.slice(0, 6).map(c => String(c).slice(0, 60)).join(", ") : null);
    if (diagnostic) detail.diagnostic = diagnostic;
    const receipt = id(source.receiptId) ?? id(source.executionId) ?? id(source.operationId);
    if (receipt) detail.receipt = receipt;
    const approval = id(source.approvalId);
    if (approval) detail.approval = approval;
    const intent = id(source.intentId) ?? id(source.proposalId);
    if (intent) detail.reference = intent;
    return Object.keys(detail).length ? detail : undefined;
  }

  private static activityEntry(e: { id: string; agentRunId: string; eventType: string; timestamp: Date }) {
    const details = ["THOUGHT", "LOG", "TOOL_CALL", "TOOL_RESULT", "EXECUTION_OUTPUT"].includes(e.eventType)
      ? undefined : ConversationService.activityDetail((e as { payload?: unknown }).payload);
    return { id: e.id, agentRunId: e.agentRunId, eventType: e.eventType, timestamp: e.timestamp,
      ...(details ? { details } : {}) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapConvSummary(c: any): ConversationSummaryDto {
    return {
      mode: conversationMode(c),
      modeContext: modeContext(c),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      id: c.id as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      projectId: c.projectId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      userId: c.userId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      title: c.title as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      status: c.status as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      messageCount: c._count?.messages ?? c.messages?.length ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      createdAt: c.createdAt as Date,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      updatedAt: c.updatedAt as Date
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapConvDetail(c: any): ConversationDetailDto {
    return {
      ...this.mapConvSummary(c),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      messages: (c.messages ?? []).map((m: any) => ({
        ...this.mapMessage(m),
        attachments: (c.attachments ?? []).filter((a: any) => a.conversationId === c.id && a.userId === c.userId &&
          Array.isArray(m.metadata?.attachmentIds) && m.metadata.attachmentIds.includes(a.id)).map((a: any) => ({
          id: a.id, conversationId: a.conversationId, userId: a.userId, fileName: a.fileName, mimeType: a.mimeType,
          fileSize: a.fileSize, category: a.category, hasExtractedText: a.hasExtractedText, isScanned: a.isScanned,
          createdAt: new Date(a.createdAt).toISOString()
        }))
      })),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      agentRuns: (c.agentRuns ?? []).filter((r: any) => r.projectId === c.projectId && r.conversationId === c.id).map((r: any) => ({
        id: r.id as string,
        conversationId: r.conversationId as string,
        projectId: r.projectId as string,
        agentName: r.agentName as string,
        title: r.title as string,
        status: r.status as string,
        outcome: persistedRunOutcome(r),
        planVersion: r.planVersion as number,
        progressPercent: r.progressPercent as number,
        startedAt: r.startedAt as Date | null,
        completedAt: r.completedAt as Date | null,
        createdAt: r.createdAt as Date,
        updatedAt: r.updatedAt as Date,
        failureReason: r.failureReason ?? null,
        presentation: presentPlan(r.plans?.[0]?.steps),
        control: presentControl(r.artifacts ?? [], r),
        activity: (r.events ?? []).map((e: any) => ConversationService.activityEntry(e))
          .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.id.localeCompare(b.id)),
        artifacts: (r.artifacts ?? []).filter((a: any) => a.projectId === c.projectId && a.artifactType !== CONTROL_ARTIFACT).map((a: any) => ({
          id: a.id, title: a.title, artifactType: a.artifactType, summary: a.summary, version: a.version, createdAt: a.createdAt
        })),
        pendingApprovals: (r.approvals ?? []).map((a: any) => ({
          id: a.id, approvalType: a.approvalType, status: a.status, requiredRole: a.requiredRole, dueAt: a.dueAt
        }))
      })),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      metadata: (c.metadata ?? {}) as Record<string, unknown>
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapMessage(m: any): ConversationMessageDto {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      id: m.id as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      conversationId: m.conversationId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      senderId: m.senderId as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      senderType: m.senderType as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      content: m.content as string,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      metadata: (m.metadata ?? {}) as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      createdAt: m.createdAt as Date
    };
  }
}
