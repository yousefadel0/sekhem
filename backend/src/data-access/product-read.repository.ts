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
  SecurityGateDetailDto
} from "../dto";

export const PRODUCT_READ_REPOSITORY = Symbol("PRODUCT_READ_REPOSITORY");

export interface ProductReadRepository {
  listProjects(projectIds?: string[]): Promise<ProjectSummaryDto[]> | ProjectSummaryDto[];
  getDashboard(id: string): Promise<ProjectDashboardDto> | ProjectDashboardDto;
  listModules(): Promise<ModuleSummaryDto[]> | ModuleSummaryDto[];
  getModule(slug: string): Promise<ModuleDetailDto> | ModuleDetailDto;
  listInitiatives(query: ListQuery): Promise<InitiativeSummaryDto[]> | InitiativeSummaryDto[];
  getInitiative(slug: string): Promise<InitiativeDetailDto> | InitiativeDetailDto;
  getInitiativeTasks(slug: string): Promise<InitiativeTasksResponseDto> | InitiativeTasksResponseDto;
  getInitiativeActivity(slug: string): Promise<ActivityEventDto[]> | ActivityEventDto[];
  getInitiativeBlockers(slug: string): Promise<InitiativeBlockersResponseDto> | InitiativeBlockersResponseDto;
  listApprovals(query: ListQuery): Promise<ApprovalSummaryDto[]> | ApprovalSummaryDto[];
  getSecurityGate(id: string): Promise<SecurityGateDetailDto> | SecurityGateDetailDto;
  listReleaseCandidates(query: ListQuery): Promise<ReleaseCandidateSummaryDto[]> | ReleaseCandidateSummaryDto[];
  getReleaseCandidate(id: string): Promise<ReleaseCandidateDetailDto> | ReleaseCandidateDetailDto;
  listBlockers(query: ListQuery): Promise<BlockerSummaryDto[]> | BlockerSummaryDto[];
  listAuditEvents(query: ListQuery): Promise<AuditEventDto[]> | AuditEventDto[];
}
