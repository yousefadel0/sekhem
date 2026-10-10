import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import type { ProductReadRepository } from "./product-read.repository";
import type {
  ActivityEventDto,
  ApprovalSummaryDto,
  AuditEventDto,
  BlockerSummaryDto,
  InitiativeBlockersResponseDto,
  InitiativeDetailDto,
  InitiativeSummaryDto,
  InitiativeTasksResponseDto,
  ListQuery,
  ModuleDetailDto,
  ModuleSummaryDto,
  ProjectDashboardDto,
  ProjectSummaryDto,
  ReleaseCandidateDetailDto,
  ReleaseCandidateSummaryDto,
  SecurityGateDetailDto,
  TaskDto
} from "../dto";
import {
  mapActivityEvent,
  mapApprovalSummary,
  mapAuditEvent,
  mapBlockerSummary,
  mapCodeDraftWorkspace,
  mapEvidenceSource,
  mapExecutionPath,
  mapInfrastructureNode,
  mapInitiativeSummary,
  mapModuleSummary,
  mapProjectSummary,
  mapRDSignal,
  mapReleaseCandidateDetail,
  mapReleaseCandidateSummary,
  mapSecurityGateDetail,
  mapServiceStatus,
  mapTask,
  mapTechnicalMemo
} from "./product-mappers";

/**
 * PostgresProductReadRepository
 *
 * PostgreSQL-backed durable implementation of ProductReadRepository using PrismaService.
 * Selected when SEKHEM_RUNTIME_MODE === "postgres_read" and SEKHEM_DATA_SOURCE === "postgres_read".
 */
@Injectable()
export class PostgresProductReadRepository implements ProductReadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listProjects(projectIds?: string[]): Promise<ProjectSummaryDto[]> {
    const rows = await this.prisma.project.findMany({
      ...(projectIds ? { where: { id: { in: projectIds } } } : {}),
      include: {
        modules: { select: { status: true } },
        initiatives: { select: { status: true } },
        approvals: { select: { status: true } },
        blockers: { select: { status: true } }
      },
      orderBy: { name: "asc" }
    });

    return rows.map((p) => mapProjectSummary(p));
  }

  async getDashboard(id: string): Promise<ProjectDashboardDto> {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id }, { slug: id }]
      },
      include: {
        modules: { select: { status: true } },
        initiatives: { select: { status: true } },
        approvals: { select: { status: true } },
        blockers: { select: { status: true } }
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${id}`);
    }

    const [modules, initiatives, approvals, blockers, releaseCandidates, rdSignals, infrastructure, services, activities] =
      await Promise.all([
        this.prisma.module.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } }),
        this.prisma.initiative.findMany({
          where: { projectId: project.id },
          include: {
            evidence: { select: { id: true } },
            tasks: { select: { status: true } },
            blockers: { select: { status: true } },
            approvals: { select: { status: true } }
          }
        }),
        this.prisma.approval.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
        this.prisma.blocker.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
        this.prisma.releaseCandidate.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
        this.prisma.rDSignal.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
        this.prisma.infrastructureNode.findMany({ where: { projectId: project.id } }),
        this.prisma.serviceStatus.findMany(),
        this.prisma.activityEvent.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 10 })
      ]);

    const projectSummary = mapProjectSummary(project);

    return {
      project: projectSummary,
      kpis: {
        pendingApprovals: approvals.filter((a) => a.status === "pending").length,
        criticalApprovals: approvals.filter((a) => a.priority === "critical").length,
        activeAssistants: 0,
        activeWorkflows: 0,
        releaseCandidates: releaseCandidates.length,
        healthyInfrastructureNodes: infrastructure.filter((n) => n.status === "healthy").length,
        totalInfrastructureNodes: infrastructure.length
      },
      modules: modules.map((m) => mapModuleSummary(m)),
      recommendedInitiatives: initiatives.map((i) => mapInitiativeSummary(i)),
      approvals: approvals.map((a) => mapApprovalSummary(a)),
      blockers: blockers.map((b) => mapBlockerSummary(b)),
      releaseCandidates: releaseCandidates.map((r) => mapReleaseCandidateSummary(r)),
      rdSignals: rdSignals.map((s) => mapRDSignal(s)),
      infrastructure: infrastructure.map((n) => mapInfrastructureNode(n)),
      services: services.map((s) => mapServiceStatus(s)),
      recentActivity: activities.map((a) => mapActivityEvent(a))
    };
  }

  async listModules(): Promise<ModuleSummaryDto[]> {
    const modules = await this.prisma.module.findMany({
      orderBy: { order: "asc" }
    });

    return modules.map((m) => mapModuleSummary(m));
  }

  async getModule(slug: string): Promise<ModuleDetailDto> {
    const mod = await this.prisma.module.findFirst({
      where: {
        OR: [{ slug }, { key: slug }]
      },
      include: {
        initiatives: {
          include: {
            evidence: { select: { id: true } },
            tasks: { select: { status: true } },
            blockers: { select: { status: true } },
            approvals: { select: { status: true } }
          }
        }
      }
    });

    if (!mod) {
      throw new NotFoundException(`Module not found: ${slug}`);
    }

    const initiativeIds = mod.initiatives.map((i) => i.id);

    const [approvals, blockers, activities] = await Promise.all([
      this.prisma.approval.findMany({
        where: {
          OR: [
            { module: mod.name },
            { module: mod.customerFacingName },
            { module: mod.slug }
          ]
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.blocker.findMany({
        where: initiativeIds.length > 0 ? { initiativeId: { in: initiativeIds } } : undefined,
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.activityEvent.findMany({
        where: initiativeIds.length > 0 ? { initiativeId: { in: initiativeIds } } : undefined,
        orderBy: { createdAt: "desc" }
      })
    ]);

    const summary = mapModuleSummary(mod);

    return {
      ...summary,
      capabilities: mod.capabilities,
      humanApprovalRequired: mod.initiatives.some((i) => i.humanApprovalRequired),
      relatedInitiatives: mod.initiatives.map((i) => mapInitiativeSummary(i)),
      relatedApprovals: approvals.map((a) => mapApprovalSummary(a)),
      relatedBlockers: blockers.map((b) => mapBlockerSummary(b)),
      relatedActivity: activities.map((a) => mapActivityEvent(a))
    };
  }

  async listInitiatives(query: ListQuery): Promise<InitiativeSummaryDto[]> {
    const rows = await this.prisma.initiative.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: {
        evidence: { select: { id: true } },
        tasks: { select: { status: true } },
        blockers: { select: { status: true } },
        approvals: { select: { status: true } }
      },
      orderBy: { updatedAt: "desc" }
    });

    return rows.map((i) => mapInitiativeSummary(i));
  }

  async getInitiative(slug: string): Promise<InitiativeDetailDto> {
    const initiative = await this.prisma.initiative.findFirst({
      where: {
        OR: [{ slug }, { id: slug }]
      },
      include: {
        evidence: true,
        executionPaths: true,
        tasks: true,
        activityEvents: { orderBy: { createdAt: "desc" } },
        blockers: true,
        approvals: true,
        technicalMemos: { orderBy: { createdAt: "desc" }, take: 1 },
        workspaces: {
          include: { artifacts: true },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        securityGates: {
          include: { checks: true, findings: true },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        releaseCandidates: {
          include: { artifacts: true, approvalChecklist: true, rollbackPlan: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!initiative) {
      throw new NotFoundException(`Initiative not found: ${slug}`);
    }

    const summary = mapInitiativeSummary(initiative);

    let overview = {
      summary: initiative.description,
      businessCase: `Governance and validation for ${initiative.title}.`,
      technicalScope: initiative.description,
      targetOutcome: `Completion of ${initiative.title} milestones and gates.`
    };

    if (initiative.overview && typeof initiative.overview === "object") {
      const ov = initiative.overview as Record<string, unknown>;
      overview = {
        summary: typeof ov.summary === "string" ? ov.summary : overview.summary,
        businessCase: typeof ov.businessCase === "string" ? ov.businessCase : overview.businessCase,
        technicalScope: typeof ov.technicalScope === "string" ? ov.technicalScope : overview.technicalScope,
        targetOutcome: typeof ov.targetOutcome === "string" ? ov.targetOutcome : overview.targetOutcome
      };
    }

    const memo = initiative.technicalMemos[0] ? mapTechnicalMemo(initiative.technicalMemos[0]) : null;
    const workspace = initiative.workspaces[0] ? mapCodeDraftWorkspace(initiative.workspaces[0]) : null;
    const gate = initiative.securityGates[0] ? mapSecurityGateDetail(initiative.securityGates[0]) : null;
    const candidate = initiative.releaseCandidates[0] ? mapReleaseCandidateDetail(initiative.releaseCandidates[0]) : null;

    return {
      ...summary,
      overview,
      evidence: initiative.evidence.map((e) => mapEvidenceSource(e)),
      executionPaths: initiative.executionPaths.map((ep) => mapExecutionPath(ep)),
      tasks: initiative.tasks.map((t) => mapTask(t)),
      activity: initiative.activityEvents.map((a) => mapActivityEvent(a)),
      blockers: initiative.blockers.map((b) => mapBlockerSummary(b)),
      technicalMemo: memo,
      codeDraftWorkspace: workspace,
      securityGate: gate,
      releaseCandidate: candidate
    };
  }

  async getInitiativeTasks(slug: string): Promise<InitiativeTasksResponseDto> {
    const tasks = await this.prisma.task.findMany({
      where: { initiativeSlug: slug },
      orderBy: { createdAt: "asc" }
    });

    const mappedTasks = tasks.map((t) => mapTask(t));
    const lanes: TaskDto["lane"][] = ["backlog", "analysis", "design", "approved", "in_progress", "testing", "blocked", "done"];

    return {
      initiativeSlug: slug,
      lanes: lanes.map((lane) => ({
        key: lane,
        label: this.label(lane),
        tasks: mappedTasks.filter((t) => t.lane === lane)
      }))
    };
  }

  async getInitiativeActivity(slug: string): Promise<ActivityEventDto[]> {
    const activities = await this.prisma.activityEvent.findMany({
      where: { initiativeSlug: slug },
      orderBy: { createdAt: "desc" }
    });

    return activities.map((a) => mapActivityEvent(a));
  }

  async getInitiativeBlockers(slug: string): Promise<InitiativeBlockersResponseDto> {
    const blockers = await this.prisma.blocker.findMany({
      where: { initiativeSlug: slug },
      orderBy: { createdAt: "desc" }
    });

    return {
      initiativeSlug: slug,
      blockers: blockers.map((b) => mapBlockerSummary(b))
    };
  }

  async listApprovals(query: ListQuery): Promise<ApprovalSummaryDto[]> {
    const approvals = await this.prisma.approval.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" }
    });

    return approvals.map((a) => mapApprovalSummary(a));
  }

  async getSecurityGate(id: string): Promise<SecurityGateDetailDto> {
    const gate = await this.prisma.securityGate.findUnique({
      where: { id },
      include: {
        checks: true,
        findings: true
      }
    });

    if (!gate) {
      throw new NotFoundException(`Security gate not found: ${id}`);
    }

    return mapSecurityGateDetail(gate);
  }

  async listReleaseCandidates(query: ListQuery): Promise<ReleaseCandidateSummaryDto[]> {
    const candidates = await this.prisma.releaseCandidate.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" }
    });

    return candidates.map((r) => mapReleaseCandidateSummary(r));
  }

  async getReleaseCandidate(id: string): Promise<ReleaseCandidateDetailDto> {
    const rc = await this.prisma.releaseCandidate.findUnique({
      where: { id },
      include: {
        artifacts: true,
        approvalChecklist: true,
        rollbackPlan: true
      }
    });

    if (!rc) {
      throw new NotFoundException(`Release candidate not found: ${id}`);
    }

    return mapReleaseCandidateDetail(rc);
  }

  async listBlockers(query: ListQuery): Promise<BlockerSummaryDto[]> {
    const blockers = await this.prisma.blocker.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" }
    });

    return blockers.map((b) => mapBlockerSummary(b));
  }

  async listAuditEvents(query: ListQuery): Promise<AuditEventDto[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: { module: { notIn: ["SEKHEM_TRUSTED_RUNTIME_V1", "SEKHEM_WORKSPACE_V1"] } },
      orderBy: { timestamp: "desc" },
      take: query.pageSize ? Number(query.pageSize) : 50
    });

    return events.map((e) => mapAuditEvent(e));
  }

  private label(value: string): string {
    return value
      .split("_")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  }
}
