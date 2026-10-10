import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../data-access/prisma.service";
import { ResourceAuthorizationService, type AuthSubject } from "../../auth/resource-authz.service";
import type { SessionClaims } from "../../auth/auth.dto";
import {
  AGENT_INITIATIVE_TASK_STATUSES,
  type AgentInitiativePlanStepInput,
  type CreateAgentInitiativeDto,
  type CreateAgentInitiativeVersionDto,
  type UpdateAgentInitiativeTaskDto
} from "./agent-initiative.dto";

const MAX_PLAN_STEPS = 6;
const MAX_LIST_ITEMS = 12;

/** Durable, human-controlled initiative aggregate. It stores state, not CoT. */
@Injectable()
export class AgentInitiativeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResourceAuthorizationService) private readonly authz: ResourceAuthorizationService
  ) {}

  async create(claims: SessionClaims, dto: CreateAgentInitiativeDto) {
    this.requireText(dto.projectId, "projectId");
    this.requireText(dto.title, "title");
    this.requireText(dto.objective, "objective");
    await this.authorize(claims, "CREATE", dto.projectId, `new:${dto.title}`);
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException("Project not found");
    const steps = this.planSteps(dto.plan);
    const state = dto.propose === true ? "PROPOSED" : "DRAFT";
    const initiativeId = `agent_init_${randomUUID()}`;
    const versionId = `agent_init_ver_${randomUUID()}`;
    const planId = `agent_init_plan_${randomUUID()}`;
    return this.prisma.$transaction(async (tx: any) => {
      const initiative = await tx.agentInitiative.create({
        data: {
          id: initiativeId,
          projectId: dto.projectId,
          workspaceId: this.optionalText(dto.workspaceId),
          conversationId: this.optionalText(dto.conversationId),
          title: dto.title.trim().slice(0, 240),
          objective: dto.objective.trim().slice(0, 4000),
          problem: this.optionalText(dto.problem),
          scope: this.object(dto.scope),
          constraints: this.strings(dto.constraints),
          status: state,
          currentVersionId: versionId,
          createdBy: claims.sub
        }
      });
      const version = await tx.agentInitiativeVersion.create({
        data: {
          id: versionId,
          initiativeId,
          version: 1,
          status: state,
          evidence: this.evidence(dto.evidence),
          architecture: dto.architecture ? this.object(dto.architecture) : undefined,
          plan: steps,
          risks: this.strings(dto.risks),
          dependencies: this.strings(dto.dependencies),
          successCriteria: this.strings(dto.successCriteria),
          createdBy: claims.sub
        }
      });
      const plan = await tx.agentInitiativePlan.create({
        data: { id: planId, initiativeId, versionId, summary: `Version 1 plan for ${initiative.title}`, steps, status: state }
      });
      if (steps.length > 0) {
        await tx.agentInitiativeTask.createMany({
          data: steps.map((step, position) => ({
            id: `agent_init_task_${randomUUID()}`,
            initiativeId,
            planId,
            title: step.title,
            description: step.description ?? null,
            position,
            evidence: this.strings(step.evidence)
          }))
        });
      }
      await this.audit(tx, dto.projectId, initiativeId, claims.sub, "AGENT_INITIATIVE_CREATED", { version: 1, status: state, evidenceCount: this.evidence(dto.evidence).length });
      return { initiative, version, plan, tasks: await tx.agentInitiativeTask.findMany({ where: { planId }, orderBy: { position: "asc" } }) };
    });
  }

  async createVersion(claims: SessionClaims, initiativeId: string, dto: CreateAgentInitiativeVersionDto) {
    const initiative = await this.getAuthorized(claims, initiativeId, "UPDATE");
    const material = Object.values(dto).some((value) => value !== undefined);
    if (!material) throw new BadRequestException("A version must contain a material state change");
    const latest = await this.prisma.agentInitiativeVersion.findFirst({ where: { initiativeId }, orderBy: { version: "desc" } });
    if (!latest) throw new NotFoundException("Initiative version not found");
    const versionId = `agent_init_ver_${randomUUID()}`;
    const planId = `agent_init_plan_${randomUUID()}`;
    const steps = dto.plan === undefined ? this.planSteps(latest.plan) : this.planSteps(dto.plan);
    return this.prisma.$transaction(async (tx: any) => {
      const version = await tx.agentInitiativeVersion.create({
        data: {
          id: versionId,
          initiativeId,
          version: latest.version + 1,
          status: "DRAFT",
          evidence: dto.evidence === undefined ? latest.evidence : this.evidence(dto.evidence),
          architecture: dto.architecture === undefined ? latest.architecture : this.object(dto.architecture),
          plan: steps,
          risks: dto.risks === undefined ? latest.risks : this.strings(dto.risks),
          dependencies: dto.dependencies === undefined ? latest.dependencies : this.strings(dto.dependencies),
          successCriteria: dto.successCriteria === undefined ? latest.successCriteria : this.strings(dto.successCriteria),
          decisionSummary: this.optionalText(dto.decisionSummary),
          createdBy: claims.sub
        }
      });
      const plan = await tx.agentInitiativePlan.create({ data: { id: planId, initiativeId, versionId, summary: `Version ${version.version} plan for ${initiative.title}`, steps, status: "DRAFT" } });
      if (steps.length > 0) await tx.agentInitiativeTask.createMany({ data: steps.map((step, position) => ({ id: `agent_init_task_${randomUUID()}`, initiativeId, planId, title: step.title, description: step.description ?? null, position, evidence: this.strings(step.evidence) })) });
      await this.audit(tx, initiative.projectId, initiativeId, claims.sub, "AGENT_INITIATIVE_VERSION_CREATED", { version: version.version, basedOn: latest.version });
      return { version, plan, tasks: await tx.agentInitiativeTask.findMany({ where: { planId }, orderBy: { position: "asc" } }) };
    });
  }

  async decide(claims: SessionClaims, initiativeId: string, versionNumber: number, decision: "APPROVE" | "REJECT", notes?: string) {
    const initiative = await this.getAuthorized(claims, initiativeId, "APPROVE");
    const version = await this.prisma.agentInitiativeVersion.findUnique({ where: { initiativeId_version: { initiativeId, version: versionNumber } } });
    if (!version) throw new NotFoundException("Initiative version not found");
    if (!["DRAFT", "PROPOSED"].includes(version.status)) throw new BadRequestException("Only a draft or proposed version can be decided");
    const nextStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    return this.prisma.$transaction(async (tx: any) => {
      const updatedVersion = await tx.agentInitiativeVersion.update({ where: { id: version.id }, data: { status: nextStatus, decisionSummary: this.optionalText(notes) ?? version.decisionSummary } });
      const updatedInitiative = await tx.agentInitiative.update({ where: { id: initiativeId }, data: decision === "APPROVE" ? { status: "APPROVED", currentVersionId: version.id } : { status: "REJECTED" } });
      const recorded = await tx.agentInitiativeDecision.create({ data: { id: `agent_init_decision_${randomUUID()}`, initiativeId, versionId: version.id, decision, notes: this.optionalText(notes), decidedBy: claims.sub } });
      await this.audit(tx, initiative.projectId, initiativeId, claims.sub, `AGENT_INITIATIVE_${decision}D`, { version: version.version, decision });
      return { initiative: updatedInitiative, version: updatedVersion, decision: recorded };
    });
  }

  async resolve(claims: SessionClaims, projectId: string, reference: string) {
    this.requireText(projectId, "projectId"); this.requireText(reference, "reference");
    await this.authorize(claims, "READ", projectId, reference);
    const rows = await this.prisma.agentInitiative.findMany({
      where: { projectId, OR: [{ id: reference }, { title: { contains: reference.trim(), mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" }, take: 10
    });
    if (rows.length === 0) throw new NotFoundException("Agent initiative not found");
    return rows;
  }

  async getVersion(claims: SessionClaims, initiativeId: string, versionNumber: number) {
    await this.getAuthorized(claims, initiativeId, "READ");
    const version = await this.prisma.agentInitiativeVersion.findUnique({
      where: { initiativeId_version: { initiativeId, version: versionNumber } },
      include: { plans: { orderBy: { createdAt: "desc" } }, decisions: { orderBy: { createdAt: "desc" } } }
    });
    if (!version) throw new NotFoundException("Initiative version not found");
    return version;
  }

  /** Selects an already-approved immutable version as the resume target. */
  async selectApprovedVersion(claims: SessionClaims, initiativeId: string, versionNumber: number, notes?: string) {
    const initiative = await this.getAuthorized(claims, initiativeId, "UPDATE");
    const version = await this.prisma.agentInitiativeVersion.findUnique({ where: { initiativeId_version: { initiativeId, version: versionNumber } } });
    if (!version) throw new NotFoundException("Initiative version not found");
    if (version.status !== "APPROVED") throw new BadRequestException("Only an approved version can become the current resume target");
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.agentInitiative.update({ where: { id: initiativeId }, data: { currentVersionId: version.id, status: "APPROVED" } });
      const decision = await tx.agentInitiativeDecision.create({ data: { id: `agent_init_decision_${randomUUID()}`, initiativeId, versionId: version.id, decision: "SELECT_VERSION", notes: this.optionalText(notes), decidedBy: claims.sub } });
      await this.audit(tx, initiative.projectId, initiativeId, claims.sub, "AGENT_INITIATIVE_VERSION_SELECTED", { version: version.version });
      return { initiative: updated, version, decision };
    });
  }

  /** Explicit lifecycle transitions; approval/rejection always go through decide(). */
  async transition(claims: SessionClaims, initiativeId: string, status: string, notes?: string) {
    const initiative = await this.getAuthorized(claims, initiativeId, "UPDATE");
    const allowed: Record<string, readonly string[]> = {
      DRAFT: ["PROPOSED", "SUPERSEDED"],
      PROPOSED: ["SUPERSEDED"],
      APPROVED: ["ACTIVE", "PAUSED", "BLOCKED", "COMPLETED", "SUPERSEDED"],
      ACTIVE: ["PAUSED", "BLOCKED", "COMPLETED", "SUPERSEDED"],
      PAUSED: ["ACTIVE", "BLOCKED", "COMPLETED", "SUPERSEDED"],
      BLOCKED: ["ACTIVE", "PAUSED", "COMPLETED", "SUPERSEDED"],
      REJECTED: ["SUPERSEDED"],
      COMPLETED: ["SUPERSEDED"],
      SUPERSEDED: []
    };
    if (!allowed[initiative.status]?.includes(status)) throw new BadRequestException(`Transition from ${initiative.status} to ${status} is not permitted`);
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.agentInitiative.update({ where: { id: initiativeId }, data: { status } });
      const versionId = initiative.currentVersionId;
      if (status === "PROPOSED" && versionId) {
        await tx.agentInitiativeVersion.update({ where: { id: versionId }, data: { status: "PROPOSED" } });
      }
      if (versionId) await tx.agentInitiativeDecision.create({ data: { id: `agent_init_decision_${randomUUID()}`, initiativeId, versionId, decision: `TRANSITION_${status}`, notes: this.optionalText(notes), decidedBy: claims.sub } });
      await this.audit(tx, initiative.projectId, initiativeId, claims.sub, "AGENT_INITIATIVE_TRANSITION", { from: initiative.status, to: status });
      return updated;
    });
  }

  async get(claims: SessionClaims, initiativeId: string) {
    const initiative = await this.getAuthorized(claims, initiativeId, "READ");
    return this.prisma.agentInitiative.findUnique({ where: { id: initiative.id }, include: { versions: { orderBy: { version: "desc" } }, plans: { orderBy: { createdAt: "desc" } }, tasks: { orderBy: { position: "asc" } }, decisions: { orderBy: { createdAt: "desc" } } } });
  }

  async resume(claims: SessionClaims, initiativeId: string) {
    const initiative = await this.getAuthorized(claims, initiativeId, "READ");
    const full = await this.prisma.agentInitiative.findUnique({ where: { id: initiative.id }, include: { versions: { orderBy: { version: "desc" } }, plans: { orderBy: { createdAt: "desc" } }, tasks: { orderBy: { position: "asc" } }, decisions: { orderBy: { createdAt: "desc" } } } });
    if (!full) throw new NotFoundException("Agent initiative not found");
    const approved = full.versions.find((version: any) => version.id === full.currentVersionId && version.status === "APPROVED") ?? full.versions.find((version: any) => version.status === "APPROVED");
    if (!approved) throw new BadRequestException("An approved initiative version is required before resume");
    const plan = full.plans.find((item: any) => item.versionId === approved.id) ?? null;
    const openTasks = full.tasks.filter((task: any) => task.planId === plan?.id && !["DONE", "VERIFIED", "CANCELED"].includes(task.status));
    const agentRunIds = openTasks.map((task: any) => task.agentRunId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    const runs = agentRunIds.length > 0 ? await this.prisma.agentRun.findMany({ where: { id: { in: agentRunIds }, projectId: initiative.projectId } }) : [];
    return { initiative: full, version: approved, plan, openTasks, evidence: approved.evidence, decisions: full.decisions, runs };
  }

  async updateTask(claims: SessionClaims, taskId: string, dto: UpdateAgentInitiativeTaskDto) {
    if (!AGENT_INITIATIVE_TASK_STATUSES.includes(dto.status)) throw new BadRequestException("Invalid initiative task status");
    const task = await this.prisma.agentInitiativeTask.findUnique({ where: { id: taskId }, include: { initiative: true } });
    if (!task) throw new NotFoundException("Initiative task not found");
    await this.authorize(claims, "UPDATE", task.initiative.projectId, task.initiativeId);
    return this.prisma.agentInitiativeTask.update({ where: { id: taskId }, data: { status: dto.status, verification: dto.verification ? this.object(dto.verification) as any : undefined } });
  }

  private async getAuthorized(claims: SessionClaims, initiativeId: string, action: "READ" | "UPDATE" | "APPROVE") {
    const initiative = await this.prisma.agentInitiative.findUnique({ where: { id: initiativeId } });
    if (!initiative) throw new NotFoundException("Agent initiative not found");
    await this.authorize(claims, action, initiative.projectId, initiativeId, initiative.createdBy);
    return initiative;
  }

  private async authorize(claims: SessionClaims, action: "READ" | "CREATE" | "UPDATE" | "APPROVE", projectId: string, id: string, ownerId?: string) {
    const subject: AuthSubject = { userId: claims.sub, email: claims.email, displayName: claims.displayName, role: claims.role, organizationId: claims.organizationId, isSystemAdmin: claims.role === "Admin" };
    await this.authz.assertAuthorized(subject, action, { resourceType: "Initiative", id, projectId, organizationId: claims.organizationId, ownerId });
  }

  private planSteps(value: unknown): AgentInitiativePlanStepInput[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new BadRequestException("plan must be an array");
    return value.slice(0, MAX_PLAN_STEPS).map((item, index) => {
      if (!item || typeof item !== "object" || typeof (item as any).title !== "string" || !(item as any).title.trim()) throw new BadRequestException(`plan[${index}].title is required`);
      const source = item as AgentInitiativePlanStepInput;
      return { title: source.title.trim().slice(0, 500), description: this.optionalText(source.description), evidence: this.strings(source.evidence) };
    });
  }
  private strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_LIST_ITEMS).map((item) => item.trim().slice(0, 1000)) : []; }
  private evidence(value: unknown) { return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && typeof (item as any).provenance === "string").slice(0, MAX_LIST_ITEMS).map((item: any) => ({ provenance: item.provenance.slice(0, 1000), sourceType: typeof item.sourceType === "string" ? item.sourceType.slice(0, 100) : "unknown", reference: typeof item.reference === "string" ? item.reference.slice(0, 1000) : undefined, warnings: this.strings(item.warnings), truncated: item.truncated === true })) : []; }
  private object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 4000) : undefined; }
  private requireText(value: unknown, field: string): asserts value is string { if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} is required`); }
  private async audit(tx: any, projectId: string, initiativeId: string, actor: string, action: string, metadata: Record<string, unknown>) { await tx.auditEvent.create({ data: { id: `audit_${randomUUID()}`, projectId, action, actor, actorType: "user", target: initiativeId, module: "Agent Initiative Runtime", details: action, description: action, metadata, sourceType: "ai" } }); }
}
