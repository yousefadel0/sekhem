import { Injectable } from "@nestjs/common";
import { requireEntity } from "../common/api-response";
import {
  activityEvents,
  approvals,
  auditEvents,
  blockers,
  buildInitiativeDetail,
  infrastructure,
  initiatives,
  moduleSummaries,
  modules,
  projects,
  rdSignals,
  releaseCandidates,
  releaseSummaries,
  securityGates,
  services,
  tasks
} from "../data/seed-data";
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
import type { ProductReadRepository } from "./product-read.repository";

@Injectable()
export class MemoryProductReadRepository implements ProductReadRepository {
  listProjects(projectIds?: string[]): ProjectSummaryDto[] {
    return projectIds ? projects.filter(project => projectIds.includes(project.id)) : projects;
  }

  getDashboard(id: string): ProjectDashboardDto {
    const project = requireEntity(projects.find((item) => item.id === id || item.slug === id), "Project");
    const projectInitiatives = initiatives.filter((item) => item.projectId === project.id);
    const projectApprovals = approvals.filter((item) => item.projectId === project.id);
    const projectBlockers = blockers.filter((item) => item.projectId === project.id);
    const projectReleaseCandidates = releaseSummaries().filter((item) => item.projectId === project.id);

    return {
      project,
      kpis: {
        pendingApprovals: projectApprovals.filter((item) => item.status === "pending").length,
        criticalApprovals: projectApprovals.filter((item) => item.priority === "critical").length,
        activeAssistants: 0,
        activeWorkflows: 0,
        releaseCandidates: projectReleaseCandidates.length,
        healthyInfrastructureNodes: infrastructure.filter((item) => item.status === "healthy").length,
        totalInfrastructureNodes: infrastructure.length
      },
      modules: moduleSummaries(),
      recommendedInitiatives: projectInitiatives,
      approvals: projectApprovals,
      blockers: projectBlockers,
      releaseCandidates: projectReleaseCandidates,
      rdSignals,
      infrastructure,
      services,
      recentActivity: activityEvents.filter((item) => item.projectId === project.id)
    };
  }

  listModules(): ModuleSummaryDto[] {
    return moduleSummaries();
  }

  getModule(slug: string): ModuleDetailDto {
    const module = requireEntity(modules.find((item) => item.slug === slug || item.id === slug), "Module");

    return {
      ...module,
      relatedInitiatives: initiatives.filter((item) => item.slug === "evpn-bgp-validation-pack"),
      relatedApprovals: approvals,
      relatedBlockers: blockers,
      relatedActivity: activityEvents
    };
  }

  listInitiatives(query: ListQuery): InitiativeSummaryDto[] {
    return this.filterByQuery(initiatives, query, {
      riskLevel: "technicalRisk"
    });
  }

  getInitiative(slug: string): InitiativeDetailDto {
    const initiative = requireEntity(initiatives.find((item) => item.slug === slug || item.id === slug), "Initiative");
    return buildInitiativeDetail(initiative);
  }

  getInitiativeTasks(slug: string): InitiativeTasksResponseDto {
    this.getInitiative(slug);
    const initiativeTasks = tasks.filter((task) => task.initiativeSlug === slug);
    const lanes: TaskDto["lane"][] = ["backlog", "analysis", "design", "approved", "in_progress", "testing", "blocked", "done"];

    return {
      initiativeSlug: slug,
      lanes: lanes.map((lane) => ({
        key: lane,
        label: this.label(lane),
        tasks: initiativeTasks.filter((task) => task.lane === lane)
      }))
    };
  }

  getInitiativeActivity(slug: string): ActivityEventDto[] {
    this.getInitiative(slug);
    return activityEvents.filter((event) => event.initiativeSlug === slug);
  }

  getInitiativeBlockers(slug: string): InitiativeBlockersResponseDto {
    this.getInitiative(slug);

    return {
      initiativeSlug: slug,
      blockers: blockers.filter((blocker) => blocker.initiativeSlug === slug)
    };
  }

  listApprovals(query: ListQuery): ApprovalSummaryDto[] {
    return this.filterByQuery(approvals, query);
  }

  getSecurityGate(id: string): SecurityGateDetailDto {
    return requireEntity(securityGates.find((item) => item.id === id), "Security Gate");
  }

  listReleaseCandidates(query: ListQuery): ReleaseCandidateSummaryDto[] {
    return this.filterByQuery(releaseSummaries(), query);
  }

  getReleaseCandidate(id: string): ReleaseCandidateDetailDto {
    return requireEntity(releaseCandidates.find((item) => item.id === id), "Release Candidate");
  }

  listBlockers(query: ListQuery): BlockerSummaryDto[] {
    return this.filterByQuery(blockers, query);
  }

  listAuditEvents(query: ListQuery): AuditEventDto[] {
    return this.filterByQuery(auditEvents, query);
  }

  private filterByQuery<T extends object>(items: T[], query: ListQuery, aliases: Partial<Record<keyof ListQuery, keyof T>> = {}): T[] {
    const filterKeys = ["projectId", "initiativeSlug", "status", "category", "riskLevel", "priority", "severity", "type", "module"] as const;

    return filterKeys.reduce<T[]>((current, key) => {
      const value = query[key];
      if (!value) {
        return current;
      }

      const field = (aliases[key] ?? key) as keyof T;
      return current.filter((item) => String(item[field]) === value);
    }, items);
  }

  private label(value: string): string {
    return value
      .split("_")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  }
}
