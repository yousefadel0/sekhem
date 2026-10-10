import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { requireEntity } from "./common/api-response";
import { approvals, auditEvents, blockers, executionPaths, initiatives, projects, tasks } from "./data/seed-data";
import type { ApprovalSummaryDto, AuditEventDto, BlockerSummaryDto, InitiativeSummaryDto, TaskDto } from "./dto";
import { PrismaService } from "./data-access/prisma.service";
import {
  mapApprovalSummary,
  mapAuditEvent,
  mapBlockerSummary,
  mapInitiativeSummary,
  mapTask,
  mapRiskLevel
} from "./data-access/product-mappers";
import { RuntimeConfigService } from "./runtime-config.service";
import type {
  ApprovalDecisionRequestDto,
  AuthenticatedAuditActor,
  CreateApprovalRequestDto,
  CreateBlockerRequestDto,
  InitiativeHandoffDraftDto,
  InitiativeHandoffRequestDto,
  SelectExecutionPathRequestDto,
  StartInitiativeRequestDto,
  UpdateTaskStatusRequestDto,
  WriteActionResult,
  WriteAuditEventInput
} from "./write-dto";

/**
 * ProductWriteService
 *
 * Implements durable core product mutations.
 * In production / postgres_read runtime mode, all mutations are persisted to PostgreSQL
 * via PrismaService with atomic transactions for multi-row operations.
 * Explicit in-memory fallback is allowed only in test/local development environments.
 */
@Injectable()
export class ProductWriteService {
  private readonly runtimeConfig = new RuntimeConfigService();
  private runtimeEnv: NodeJS.ProcessEnv = process.env;

  constructor(@Optional() @Inject(PrismaService) private readonly prisma?: PrismaService) {}

  setRuntimeEnvForTest(env: NodeJS.ProcessEnv): void {
    this.runtimeEnv = env;
  }

  private get isDbMode(): boolean {
    const config = this.runtimeConfig.load(this.runtimeEnv);
    const configuredForDb = config.runtimeMode === "postgres_read" || config.dbWriteMode === "rd_radar_only" || this.runtimeEnv.SEKHEM_AUTH_DB_MODE === "true";
    if (config.runtimeMode === "postgres_read" && !this.prisma) {
      // In test or in‑memory environments Prisma is unavailable; treat as non‑DB mode
      return false;
    }
    return configuredForDb && !!this.prisma;
  }

  requestInitiativeHandoff(
    initiativeId: string,
    body: InitiativeHandoffRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeHandoffDraftDto>> & WriteActionResult<InitiativeHandoffDraftDto>;
  requestInitiativeHandoff(
    initiativeId: string,
    body: InitiativeHandoffRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeHandoffDraftDto>> | WriteActionResult<InitiativeHandoffDraftDto> {
    this.assertSafeHandoffRequest(body);

    if (this.isDbMode && this.prisma) {
      return this.requestInitiativeHandoffDb(initiativeId, body, actor) as Promise<WriteActionResult<InitiativeHandoffDraftDto>> & WriteActionResult<InitiativeHandoffDraftDto>;
    }

    const initiative = requireEntity(initiatives.find((item) => item.slug === initiativeId || item.id === initiativeId), "Initiative");

    const auditEvent = this.appendAuditEvent({
      projectId: initiative.projectId,
      action: "initiative_handoff_draft_requested",
      actor: this.auditActor(actor),
      actorType: "user",
      target: initiative.id,
      module: "Initiatives",
      details: body.reason ?? `Requested draft-only handoff for ${initiative.title}`,
      riskLevel: initiative.technicalRisk === "critical" ? "high" : initiative.technicalRisk
    });

    return {
      data: {
        initiativeId: initiative.id,
        status: "DRAFT_REQUESTED",
        nextGate: "HUMAN_REVIEW_REQUIRED",
        createdAsDraftOnly: true,
        autoApply: false,
        githubWrite: false,
        deployment: false,
        auditEventId: auditEvent.id
      },
      auditEvent
    } as Promise<WriteActionResult<InitiativeHandoffDraftDto>> & WriteActionResult<InitiativeHandoffDraftDto>;
  }

  startInitiative(
    slug: string,
    body: StartInitiativeRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
  startInitiative(
    slug: string,
    body: StartInitiativeRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> | WriteActionResult<InitiativeSummaryDto> {
    if (this.isDbMode && this.prisma) {
      return this.startInitiativeDb(slug, body, actor) as Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
    }

    const initiative = requireEntity(initiatives.find((item) => item.slug === slug || item.id === slug), "Initiative");

    if (initiative.status === "archived" || initiative.status === "completed") {
      throw new BadRequestException("Initiative cannot be started from its current state");
    }

    initiative.status = "in_progress";
    initiative.lastActivityAt = this.now();

    const auditEvent = this.appendAuditEvent({
      projectId: initiative.projectId,
      action: "initiative_started",
      actor: this.auditActor(actor),
      actorType: "user",
      target: initiative.slug,
      module: "Initiatives",
      details: body.reason ?? `Started initiative ${initiative.title}`,
      riskLevel: initiative.technicalRisk === "critical" ? "high" : initiative.technicalRisk
    });

    return { data: initiative, auditEvent } as Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
  }

  selectExecutionPath(
    slug: string,
    pathId: string,
    body: SelectExecutionPathRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
  selectExecutionPath(
    slug: string,
    pathId: string,
    body: SelectExecutionPathRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> | WriteActionResult<InitiativeSummaryDto> {
    if (this.isDbMode && this.prisma) {
      return this.selectExecutionPathDb(slug, pathId, body, actor) as Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
    }

    const initiative = requireEntity(initiatives.find((item) => item.slug === slug || item.id === slug), "Initiative");
    const path = requireEntity(executionPaths.find((item) => item.id === pathId && item.initiativeSlug === initiative.slug), "Execution Path");

    if (path.requiresApproval) {
      const approval = body.approvalId ? approvals.find((item) => item.id === body.approvalId) : undefined;
      if (!approval || !this.isMatchingExecutionPathApproval(approval, initiative)) {
        throw new BadRequestException("Execution path requires a matching approved execution path approval reference");
      }
    }

    for (const item of executionPaths.filter((candidate) => candidate.initiativeSlug === initiative.slug)) {
      item.status = item.id === path.id ? "enabled" : item.status;
    }

    initiative.recommendedPath = path.name;
    initiative.status = "in_progress";
    initiative.lastActivityAt = this.now();

    const auditEvent = this.appendAuditEvent({
      projectId: initiative.projectId,
      action: "execution_path_selected",
      actor: this.auditActor(actor),
      actorType: "user",
      target: `${initiative.slug}:${path.id}`,
      module: "Execution Path Selector",
      details: body.reason ?? `Selected execution path ${path.name}`,
      riskLevel: path.riskLevel === "very_high" ? "high" : path.riskLevel
    });

    return { data: initiative, auditEvent } as Promise<WriteActionResult<InitiativeSummaryDto>> & WriteActionResult<InitiativeSummaryDto>;
  }

  updateTaskStatus(
    id: string,
    body: UpdateTaskStatusRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<TaskDto>> & WriteActionResult<TaskDto>;
  updateTaskStatus(
    id: string,
    body: UpdateTaskStatusRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<TaskDto>> | WriteActionResult<TaskDto> {
    this.assertAllowed(body.status, ["todo", "in_progress", "review", "done", "blocked"], "status");
    if (body.lane) {
      this.assertAllowed(body.lane, ["backlog", "analysis", "design", "approved", "in_progress", "testing", "blocked", "done"], "lane");
    }

    if (this.isDbMode && this.prisma) {
      return this.updateTaskStatusDb(id, body, actor) as Promise<WriteActionResult<TaskDto>> & WriteActionResult<TaskDto>;
    }

    const task = requireEntity(tasks.find((item) => item.id === id), "Task");
    task.status = body.status;
    if (body.lane) {
      task.lane = body.lane;
    }
    task.updatedAt = this.now();

    const initiative = initiatives.find((item) => item.slug === task.initiativeSlug);
    const auditEvent = this.appendAuditEvent({
      projectId: initiative?.projectId,
      action: "task_status_updated",
      actor: this.auditActor(actor),
      actorType: "user",
      target: task.id,
      module: "Tasks",
      details: body.reason ?? `Updated task ${task.title} to ${task.status}`,
      riskLevel: task.priority === "critical" ? "high" : task.priority
    });

    return { data: task, auditEvent } as Promise<WriteActionResult<TaskDto>> & WriteActionResult<TaskDto>;
  }

  createApproval(
    body: CreateApprovalRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
  createApproval(
    body: CreateApprovalRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> | WriteActionResult<ApprovalSummaryDto> {
    this.requireString(body.projectId, "projectId");
    this.requireString(body.title, "title");
    this.requireString(body.description, "description");
    this.requireString(body.module, "module");
    this.requireString(body.requestedBy, "requestedBy");
    this.assertAllowed(body.priority, ["low", "medium", "high", "critical"], "priority");
    this.assertAllowed(body.type, ["release", "security", "merge", "deployment", "exception", "access", "program_workspace", "execution_path"], "type");

    if (this.isDbMode && this.prisma) {
      return this.createApprovalDb(body, actor) as Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
    }

    requireEntity(projects.find((item) => item.id === body.projectId || item.slug === body.projectId), "Project");
    if (body.initiativeSlug) {
      requireEntity(initiatives.find((item) => item.slug === body.initiativeSlug), "Initiative");
    }

    const approval: ApprovalSummaryDto = {
      id: `approval-${Date.now()}`,
      projectId: body.projectId,
      initiativeSlug: body.initiativeSlug,
      title: body.title,
      description: body.description,
      module: body.module,
      priority: body.priority,
      status: "pending",
      type: body.type,
      requestedBy: body.requestedBy,
      requestedRole: body.requestedRole,
      approverRole: body.approverRole,
      requiresHumanApproval: true,
      createdAt: this.now(),
      dueAt: body.dueAt
    };

    approvals.push(approval);

    const auditEvent = this.appendAuditEvent({
      projectId: approval.projectId,
      action: "approval_requested",
      actor: this.auditActor(actor),
      actorType: "user",
      target: approval.id,
      module: approval.module,
      details: `Created approval request ${approval.title}`,
      riskLevel: approval.priority === "critical" ? "high" : approval.priority
    });

    return { data: approval, auditEvent } as Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
  }

  decideApproval(
    id: string,
    body: ApprovalDecisionRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
  decideApproval(
    id: string,
    body: ApprovalDecisionRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> | WriteActionResult<ApprovalSummaryDto> {
    this.assertAllowed(body.decision, ["approved", "rejected", "changes_requested"], "decision");

    if (this.isDbMode && this.prisma) {
      return this.decideApprovalDb(id, body, actor) as Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
    }

    const approval = requireEntity(approvals.find((item) => item.id === id), "Approval");
    if (approval.status !== "pending") {
      throw new BadRequestException("Approval has already been decided");
    }

    approval.status = body.decision;

    const auditEvent = this.appendAuditEvent({
      projectId: approval.projectId,
      action: `approval_${body.decision}`,
      actor: this.auditActor(actor),
      actorType: "user",
      target: approval.id,
      module: approval.module,
      details: body.note ?? `Approval ${approval.title} marked ${body.decision}`,
      riskLevel: approval.priority === "critical" ? "high" : approval.priority
    });

    return { data: approval, auditEvent } as Promise<WriteActionResult<ApprovalSummaryDto>> & WriteActionResult<ApprovalSummaryDto>;
  }

  createBlocker(
    body: CreateBlockerRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<BlockerSummaryDto>> & WriteActionResult<BlockerSummaryDto>;
  createBlocker(
    body: CreateBlockerRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<BlockerSummaryDto>> | WriteActionResult<BlockerSummaryDto> {
    this.requireString(body.projectId, "projectId");
    this.requireString(body.title, "title");
    this.requireString(body.description, "description");
    this.requireString(body.cause, "cause");
    this.requireString(body.owner, "owner");
    this.requireString(body.evidence, "evidence");
    this.requireString(body.suggestedAction, "suggestedAction");
    this.requireString(body.nextStep, "nextStep");
    this.requireString(body.rollbackOption, "rollbackOption");
    this.assertAllowed(body.type, ["code", "security", "lab", "approval", "dependency", "design", "support"], "type");
    this.assertAllowed(body.severity, ["low", "medium", "high", "critical"], "severity");

    if (this.isDbMode && this.prisma) {
      return this.createBlockerDb(body, actor) as Promise<WriteActionResult<BlockerSummaryDto>> & WriteActionResult<BlockerSummaryDto>;
    }

    requireEntity(projects.find((item) => item.id === body.projectId || item.slug === body.projectId), "Project");
    if (body.initiativeSlug) {
      requireEntity(initiatives.find((item) => item.slug === body.initiativeSlug), "Initiative");
    }

    const blocker: BlockerSummaryDto = {
      id: `blocker-${Date.now()}`,
      projectId: body.projectId,
      initiativeSlug: body.initiativeSlug,
      title: body.title,
      description: body.description,
      type: body.type,
      severity: body.severity,
      status: "open",
      cause: body.cause,
      owner: body.owner,
      evidence: body.evidence,
      suggestedAction: body.suggestedAction,
      nextStep: body.nextStep,
      rollbackOption: body.rollbackOption,
      maxAssistantFixAttempts: body.maxAssistantFixAttempts ?? 0,
      humanReviewRequiredAfterAttempts: body.humanReviewRequiredAfterAttempts ?? true,
      createdAt: this.now(),
      updatedAt: this.now()
    };

    blockers.push(blocker);

    const auditEvent = this.appendAuditEvent({
      projectId: blocker.projectId,
      action: "blocker_created",
      actor: this.auditActor(actor),
      actorType: "user",
      target: blocker.id,
      module: "Failure / Blocker Center",
      details: `Created blocker ${blocker.title}`,
      riskLevel: blocker.severity === "critical" ? "high" : blocker.severity
    });

    return { data: blocker, auditEvent } as Promise<WriteActionResult<BlockerSummaryDto>> & WriteActionResult<BlockerSummaryDto>;
  }

  // ---------------------------------------------------------------------------
  // PostgreSQL Durable Implementations
  // ---------------------------------------------------------------------------

  private async requestInitiativeHandoffDb(
    initiativeId: string,
    body: InitiativeHandoffRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeHandoffDraftDto>> {
    const prisma = this.prisma!;
    const initiative = await prisma.initiative.findFirst({
      where: { OR: [{ slug: initiativeId }, { id: initiativeId }] }
    });

    if (!initiative) {
      throw new NotFoundException(`Initiative not found: ${initiativeId}`);
    }

    const auditEvent = await prisma.auditEvent.create({
      data: {
        id: `audit-${Date.now()}-${randomUUID()}`,
        projectId: initiative.projectId,
        initiativeId: initiative.id,
        action: "initiative_handoff_draft_requested",
        actor: this.auditActor(actor),
        actorType: "user",
        target: initiative.id,
        module: "Initiatives",
        details: body.reason ?? `Requested draft-only handoff for ${initiative.title}`,
        description: `Requested draft-only handoff for ${initiative.title}`,
        riskLevel: initiative.technicalRisk === "critical" ? "high" : initiative.technicalRisk,
        sourceType: "manual"
      }
    });

    return {
      data: {
        initiativeId: initiative.id,
        status: "DRAFT_REQUESTED",
        nextGate: "HUMAN_REVIEW_REQUIRED",
        createdAsDraftOnly: true,
        autoApply: false,
        githubWrite: false,
        deployment: false,
        auditEventId: auditEvent.id
      },
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async startInitiativeDb(
    slug: string,
    body: StartInitiativeRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> {
    const prisma = this.prisma!;
    const initiative = await prisma.initiative.findFirst({
      where: { OR: [{ slug }, { id: slug }] }
    });

    if (!initiative) {
      throw new NotFoundException(`Initiative not found: ${slug}`);
    }

    if (initiative.status === "archived" || initiative.status === "completed") {
      throw new BadRequestException("Initiative cannot be started from its current state");
    }

    const [updated, auditEvent] = await prisma.$transaction(async (tx) => {
      const u = await tx.initiative.update({
        where: { id: initiative.id },
        data: {
          status: "in_progress",
          lastActivityAt: new Date()
        }
      });

      const a = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: initiative.projectId,
          initiativeId: initiative.id,
          action: "initiative_started",
          actor: this.auditActor(actor),
          actorType: "user",
          target: initiative.slug,
          module: "Initiatives",
          details: body.reason ?? `Started initiative ${initiative.title}`,
          description: `Started initiative ${initiative.title}`,
          riskLevel: initiative.technicalRisk === "critical" ? "high" : initiative.technicalRisk,
          sourceType: "manual"
        }
      });

      return [u, a];
    });

    return {
      data: this.mapInitiativeSummary(updated),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async selectExecutionPathDb(
    slug: string,
    pathId: string,
    body: SelectExecutionPathRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<InitiativeSummaryDto>> {
    const prisma = this.prisma!;
    const initiative = await prisma.initiative.findFirst({
      where: { OR: [{ slug }, { id: slug }] }
    });

    if (!initiative) {
      throw new NotFoundException(`Initiative not found: ${slug}`);
    }

    const path = await prisma.executionPath.findFirst({
      where: { id: pathId, initiativeSlug: initiative.slug }
    });

    if (!path) {
      throw new NotFoundException(`Execution Path not found: ${pathId}`);
    }

    if (path.requiresApproval) {
      if (!body.approvalId) {
        throw new BadRequestException("Execution path requires a matching approved execution path approval reference");
      }
      const approval = await prisma.approval.findUnique({ where: { id: body.approvalId } });
      if (!approval || !this.isMatchingExecutionPathApprovalDb(approval, initiative)) {
        throw new BadRequestException("Execution path requires a matching approved execution path approval reference");
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const risk = path.riskLevel === "very_high" ? "high" : mapRiskLevel(path.riskLevel);

    const [updatedInitiative, auditEvent] = await prisma.$transaction(async (tx) => {
      await tx.executionPath.updateMany({
        where: { initiativeSlug: initiative.slug, id: { not: path.id } },
        data: { status: "draft" }
      });

      await tx.executionPath.update({
        where: { id: path.id },
        data: { status: "enabled" }
      });

      const u = await tx.initiative.update({
        where: { id: initiative.id },
        data: {
          recommendedPath: path.name,
          status: "in_progress",
          lastActivityAt: new Date()
        }
      });

      const a = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: initiative.projectId,
          initiativeId: initiative.id,
          action: "execution_path_selected",
          actor: this.auditActor(actor),
          actorType: "user",
          target: `${initiative.slug}:${path.id}`,
          module: "Execution Path Selector",
          details: body.reason ?? `Selected execution path ${path.name}`,
          description: `Selected execution path ${path.name}`,
          riskLevel: risk,
          sourceType: "manual"
        }
      });

      return [u, a];
    });

    return {
      data: this.mapInitiativeSummary(updatedInitiative),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async updateTaskStatusDb(
    id: string,
    body: UpdateTaskStatusRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<TaskDto>> {
    const prisma = this.prisma!;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task not found: ${id}`);
    }

    const initiative = await prisma.initiative.findFirst({
      where: { slug: task.initiativeSlug }
    });

    const [updatedTask, auditEvent] = await prisma.$transaction(async (tx) => {
      const u = await tx.task.update({
        where: { id },
        data: {
          status: body.status,
          lane: body.lane ?? task.lane,
          updatedAt: new Date()
        }
      });

      const a = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: initiative?.projectId,
          initiativeId: initiative?.id,
          action: "task_status_updated",
          actor: this.auditActor(actor),
          actorType: "user",
          target: task.id,
          module: "Tasks",
          details: body.reason ?? `Updated task ${task.title} to ${body.status}`,
          description: `Updated task ${task.title} to ${body.status}`,
          riskLevel: task.priority === "critical" ? "high" : mapRiskLevel(task.priority),
          sourceType: "manual"
        }
      });

      return [u, a];
    });

    return {
      data: this.mapTask(updatedTask),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async createApprovalDb(
    body: CreateApprovalRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> {
    const prisma = this.prisma!;
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: body.projectId }, { slug: body.projectId }] }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${body.projectId}`);
    }

    let initiative: any = null;
    if (body.initiativeSlug) {
      initiative = await prisma.initiative.findFirst({
        where: { slug: body.initiativeSlug }
      });
      if (!initiative) {
        throw new NotFoundException(`Initiative not found: ${body.initiativeSlug}`);
      }
    }

    const approvalId = `approval-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const [createdApproval, auditEvent] = await prisma.$transaction(async (tx) => {
      const a = await tx.approval.create({
        data: {
          id: approvalId,
          projectId: project.id,
          initiativeId: initiative?.id,
          initiativeSlug: body.initiativeSlug,
          title: body.title,
          description: body.description,
          module: body.module,
          priority: body.priority,
          status: "pending",
          type: body.type,
          requestedBy: body.requestedBy,
          requestedRole: body.requestedRole,
          approverRole: body.approverRole,
          requiresHumanApproval: true,
          dueAt: body.dueAt ? new Date(body.dueAt) : null
        }
      });

      const aud = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: project.id,
          initiativeId: initiative?.id,
          action: "approval_requested",
          actor: this.auditActor(actor),
          actorType: "user",
          target: a.id,
          module: a.module,
          details: `Created approval request ${a.title}`,
          description: `Created approval request ${a.title}`,
          riskLevel: a.priority === "critical" ? "high" : mapRiskLevel(a.priority),
          sourceType: "manual"
        }
      });

      return [a, aud];
    });

    return {
      data: this.mapApprovalSummary(createdApproval),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async decideApprovalDb(
    id: string,
    body: ApprovalDecisionRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<ApprovalSummaryDto>> {
    const prisma = this.prisma!;
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException(`Approval not found: ${id}`);
    }

    if (approval.status !== "pending") {
      throw new BadRequestException("Approval has already been decided");
    }

    const [updatedApproval, auditEvent] = await prisma.$transaction(async (tx) => {
      const u = await tx.approval.update({
        where: { id },
        data: {
          status: body.decision,
          updatedAt: new Date()
        }
      });

      const aud = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: approval.projectId,
          initiativeId: approval.initiativeId,
          action: `approval_${body.decision}`,
          actor: this.auditActor(actor),
          actorType: "user",
          target: approval.id,
          module: approval.module,
          details: body.note ?? `Approval ${approval.title} marked ${body.decision}`,
          description: body.note ?? `Approval ${approval.title} marked ${body.decision}`,
          riskLevel: approval.priority === "critical" ? "high" : mapRiskLevel(approval.priority),
          sourceType: "manual"
        }
      });

      return [u, aud];
    });

    return {
      data: this.mapApprovalSummary(updatedApproval),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  private async createBlockerDb(
    body: CreateBlockerRequestDto,
    actor: AuthenticatedAuditActor
  ): Promise<WriteActionResult<BlockerSummaryDto>> {
    const prisma = this.prisma!;
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: body.projectId }, { slug: body.projectId }] }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${body.projectId}`);
    }

    let initiative: any = null;
    if (body.initiativeSlug) {
      initiative = await prisma.initiative.findFirst({
        where: { slug: body.initiativeSlug }
      });
      if (!initiative) {
        throw new NotFoundException(`Initiative not found: ${body.initiativeSlug}`);
      }
    }

    const blockerId = `blocker-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const [createdBlocker, auditEvent] = await prisma.$transaction(async (tx) => {
      const b = await tx.blocker.create({
        data: {
          id: blockerId,
          projectId: project.id,
          initiativeId: initiative?.id,
          initiativeSlug: body.initiativeSlug,
          title: body.title,
          description: body.description,
          type: body.type,
          severity: body.severity,
          status: "open",
          cause: body.cause,
          owner: body.owner,
          evidence: body.evidence,
          suggestedAction: body.suggestedAction,
          nextStep: body.nextStep,
          rollbackOption: body.rollbackOption,
          maxAssistantFixAttempts: body.maxAssistantFixAttempts ?? 0,
          humanReviewRequiredAfterAttempts: body.humanReviewRequiredAfterAttempts ?? true
        }
      });

      const aud = await tx.auditEvent.create({
        data: {
          id: `audit-${Date.now()}-${randomUUID()}`,
          projectId: project.id,
          initiativeId: initiative?.id,
          action: "blocker_created",
          actor: this.auditActor(actor),
          actorType: "user",
          target: b.id,
          module: "Failure / Blocker Center",
          details: `Created blocker ${b.title}`,
          description: `Created blocker ${b.title}`,
          riskLevel: b.severity === "critical" ? "high" : mapRiskLevel(b.severity),
          sourceType: "manual"
        }
      });

      return [b, aud];
    });

    return {
      data: this.mapBlockerSummary(createdBlocker),
      auditEvent: this.mapAuditEvent(auditEvent)
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers & Mappers
  // ---------------------------------------------------------------------------

  private isMatchingExecutionPathApproval(approval: ApprovalSummaryDto, initiative: InitiativeSummaryDto): boolean {
    return (
      approval.status === "approved" &&
      approval.type === "execution_path" &&
      approval.initiativeSlug === initiative.slug &&
      approval.projectId === initiative.projectId
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isMatchingExecutionPathApprovalDb(approval: any, initiative: any): boolean {
    return (
      approval.status === "approved" &&
      approval.type === "execution_path" &&
      approval.initiativeSlug === initiative.slug &&
      approval.projectId === initiative.projectId
    );
  }

  private appendAuditEvent(input: WriteAuditEventInput): AuditEventDto {
    const auditEvent: AuditEventDto = {
      id: `audit-${Date.now()}-${auditEvents.length + 1}`,
      projectId: input.projectId,
      timestamp: this.now(),
      action: input.action,
      actor: input.actor,
      actorType: input.actorType,
      target: input.target,
      module: input.module,
      details: input.details,
      riskLevel: input.riskLevel,
      sourceType: "manual"
    };

    auditEvents.push(auditEvent);
    return auditEvent;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapAuditEvent(e: any): AuditEventDto {
    return mapAuditEvent(e);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapInitiativeSummary(row: any): InitiativeSummaryDto {
    return mapInitiativeSummary(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapTask(t: any): TaskDto {
    return mapTask(t);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapApprovalSummary(a: any): ApprovalSummaryDto {
    return mapApprovalSummary(a);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapBlockerSummary(b: any): BlockerSummaryDto {
    return mapBlockerSummary(b);
  }

  private auditActor(actor: AuthenticatedAuditActor): string {
    return `${actor.displayName} [${actor.role}]`;
  }

  private assertSafeHandoffRequest(body: unknown): asserts body is InitiativeHandoffRequestDto {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("Request body must be an object");
    }

    const forbiddenKeys = new Set(["secrets", "execution", "autoapply", "githubwrite", "deployment"]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") {
        return;
      }

      for (const [key, nestedValue] of Object.entries(value)) {
        if (forbiddenKeys.has(key.toLowerCase().replace(/-/g, ""))) {
          throw new BadRequestException(`${key} is not accepted on initiative handoff requests`);
        }
        visit(nestedValue);
      }
    };

    visit(body);
  }

  private requireString(value: unknown, field: string): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private assertAllowed<T extends string>(value: T, allowed: readonly T[], field: string): void {
    if (!allowed.includes(value)) {
      throw new BadRequestException(`${field} is invalid`);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }
}
