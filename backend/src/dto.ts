export interface ApiMetaDto {
  requestId?: string;
  timestamp: string;
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface ApiErrorDto {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponseDto<T> {
  data: T;
  meta: ApiMetaDto;
  errors: ApiErrorDto[];
}

export type SourceTypeDto = "seed" | "manual" | "workflow" | "ai" | "backend_aggregate";
export type SeverityDto = "low" | "medium" | "high" | "critical";
export type RiskLevelDto = "low" | "medium" | "high" | "critical";
export type ApprovalStatusDto = "pending" | "approved" | "rejected" | "changes_requested" | "cancelled";

export interface HealthDto {
  status: "ok" | "degraded" | "down";
  service: "sekhem-product-api";
  version: string;
  environment: "development" | "test" | "staging" | "production";
  uptimeSeconds?: number;
}

export interface DbReadinessDto {
  status: "ok" | "degraded" | "unavailable";
  db: "ready" | "not_ready";
  runtimeMode: "postgres_read" | "memory" | "unknown";
  dataSource: "postgres_read" | "fallback" | "unknown";
  component: "postgres";
  checkedAt: string;
}

export interface ProjectSummaryDto {
  id: string;
  slug: string;
  name: string;
  customerFacingName: string;
  description?: string;
  status: "active" | "planning" | "evaluation" | "draft" | "archived";
  phase: "phase_1_activation" | "limited_preview" | "advanced_package" | "locked_add_on" | "development";
  platform: "SONiC" | "OpenWiFi" | "OpenLAN" | "SDN Controller" | "OpenConfig/gNMI" | "Other" | "personal";
  activeModulesCount: number;
  recommendedInitiativesCount: number;
  pendingApprovalsCount: number;
  openBlockersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSummaryDto {
  id: string;
  slug: string;
  key: string;
  name: string;
  customerFacingName: string;
  category: "core" | "intelligence" | "execution" | "assurance" | "expansion" | "support";
  description: string;
  phase: "phase_1_activation" | "limited_preview" | "advanced_package" | "locked_add_on";
  status: "enabled" | "limited_preview" | "locked" | "request_activation";
  isLocked: boolean;
  lockReason?: string;
  route?: string;
  order: number;
}

export interface InitiativeSummaryDto {
  id: string;
  slug: string;
  projectId: string;
  title: string;
  name: string;
  description: string;
  status: "recommended" | "in_progress" | "pending_approval" | "completed" | "blocked" | "archived";
  category: "validation" | "automation" | "telemetry" | "governance" | "integration";
  businessValue: "low" | "medium" | "high";
  technicalRisk: RiskLevelDto;
  recommendedPath: string;
  evidenceSources: number;
  taskCount: number;
  completedTaskCount: number;
  openBlockerCount: number;
  pendingApprovalCount: number;
  tags: string[];
  humanApprovalRequired: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface ApprovalSummaryDto {
  id: string;
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  module: string;
  priority: "low" | "medium" | "high" | "critical";
  status: ApprovalStatusDto;
  type: "release" | "security" | "merge" | "deployment" | "exception" | "access" | "program_workspace" | "execution_path";
  requestedBy: string;
  requestedRole?: string;
  approverRole?: string;
  requiresHumanApproval: boolean;
  createdAt: string;
  dueAt?: string;
}

export interface BlockerSummaryDto {
  id: string;
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  type: "code" | "security" | "lab" | "approval" | "dependency" | "design" | "support";
  severity: SeverityDto;
  status: "open" | "investigating" | "pending_escalation" | "pending_human" | "resolved";
  cause: string;
  owner: string;
  evidence: string;
  suggestedAction: string;
  nextStep: string;
  rollbackOption: string;
  maxAssistantFixAttempts: number;
  humanReviewRequiredAfterAttempts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEventDto {
  id: string;
  projectId?: string;
  initiativeSlug?: string;
  type: "signal" | "evidence" | "recommendation" | "path_selection" | "memo" | "task" | "code" | "security" | "approval" | "blocker" | "release" | "support";
  title: string;
  description: string;
  actor: string;
  actorType: "system" | "assistant" | "user";
  status: "completed" | "pending" | "in_progress" | "blocked";
  sourceType: SourceTypeDto;
  createdAt: string;
}

export interface TaskDto {
  id: string;
  initiativeSlug: string;
  title: string;
  description?: string;
  lane: "backlog" | "analysis" | "design" | "approved" | "in_progress" | "testing" | "blocked" | "done";
  status: "todo" | "in_progress" | "review" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  assignee: string;
  ownerRole?: string;
  dueDate?: string;
  sourceType: SourceTypeDto;
  createdAt: string;
  updatedAt: string;
}

export interface InitiativeTasksResponseDto {
  initiativeSlug: string;
  lanes: {
    key: TaskDto["lane"];
    label: string;
    tasks: TaskDto[];
  }[];
}

export interface InitiativeBlockersResponseDto {
  initiativeSlug: string;
  blockers: BlockerSummaryDto[];
}

export interface EvidenceSourceDto {
  id: string;
  initiativeSlug: string;
  type: "community_signal" | "security_advisory" | "roadmap_gap" | "customer_request" | "compliance_requirement" | "manual_note";
  title: string;
  source: string;
  relevance: "low" | "medium" | "high";
  summary: string;
  sourceType: SourceTypeDto;
  createdAt: string;
}

export interface ExecutionPathDto {
  id: string;
  initiativeSlug: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "very_high";
  status: "enabled" | "limited_preview" | "locked_add_on" | "locked_advanced";
  requiresApproval: boolean;
  estimatedDuration: string;
  deliverables: string[];
}

export interface TechnicalMemoDto {
  id: string;
  initiativeSlug: string;
  generatedAt: string;
  generatedBy: string;
  status: "draft" | "review" | "approved";
  sections: { title: string; content: string }[];
}

export interface SandboxedArtifactDto {
  id: string;
  workspaceId: string;
  fileName: string;
  artifactType: "reference_topology" | "config_template" | "test_cases" | "log_validator" | "technical_note";
  status: "draft" | "ready_for_review" | "blocked";
}

export interface CodeDraftWorkspaceDto {
  id: string;
  initiativeSlug: string;
  name: string;
  status: "not_started" | "draft" | "pending_review" | "blocked" | "approved";
  badges: string[];
  artifacts: SandboxedArtifactDto[];
  humanApprovalRequired: boolean;
}

export interface SecurityGateSummaryDto {
  id: string;
  projectId: string;
  initiativeSlug?: string;
  title: string;
  status: "not_started" | "running" | "passed" | "blocked" | "failed" | "exception_requested";
  riskLevel: RiskLevelDto;
  summary: string;
  lastCheckedAt?: string;
}

export interface SecurityCheckDto {
  id: string;
  securityGateId: string;
  title: string;
  checkType: "dependency" | "policy" | "secret" | "license" | "configuration" | "manual_review";
  status: "not_run" | "passed" | "warning" | "failed" | "blocked";
  severity: SeverityDto;
  evidence?: string;
}

export interface SecurityFindingDto {
  id: string;
  securityGateId: string;
  title: string;
  description: string;
  severity: SeverityDto;
  status: "open" | "accepted_risk" | "resolved" | "false_positive";
  recommendation: string;
  owner: string;
}

export interface SecurityGateDetailDto extends SecurityGateSummaryDto {
  checks: SecurityCheckDto[];
  findings: SecurityFindingDto[];
}

export interface ReleaseCandidateSummaryDto {
  id: string;
  projectId: string;
  initiativeSlug?: string;
  version: string;
  title: string;
  description: string;
  status: "draft" | "review" | "security_review" | "approval_pending" | "approved" | "blocked" | "released";
  securityScore: number;
  testsPassed: number;
  testsTotal: number;
  changeCount: number;
  blockingIssues: number;
  artifactCount: number;
  createdAt: string;
}

export interface ReleaseArtifactDto {
  id: string;
  releaseCandidateId: string;
  artifactType: "release_note" | "validation_report" | "security_report" | "deployment_manifest" | "rollback_plan";
  fileName: string;
  status: "placeholder" | "available" | "blocked";
  checksum?: string;
}

export interface ReleaseApprovalChecklistItemDto {
  id: string;
  releaseCandidateId: string;
  title: string;
  status: "pending" | "passed" | "failed" | "waived";
  requiredRole: string;
}

export interface RollbackPlanDto {
  id: string;
  releaseCandidateId: string;
  title: string;
  summary: string;
  status: "draft" | "approved" | "not_required";
}

export interface ReleaseCandidateDetailDto extends ReleaseCandidateSummaryDto {
  artifacts: ReleaseArtifactDto[];
  approvalChecklist: ReleaseApprovalChecklistItemDto[];
  rollbackPlan: RollbackPlanDto | null;
}

export interface RDSignalDto {
  id: string;
  title: string;
  type: "trend" | "community" | "competitor" | "vulnerability" | "opportunity";
  source: string;
  priority: "low" | "medium" | "high" | "critical";
  summary: string;
  impact: string;
  actionRecommended: string;
  processed: boolean;
  tags: string[];
  createdAt: string;
}

export interface InfrastructureNodeDto {
  id: string;
  name: string;
  type: "api" | "database" | "worker" | "storage" | "gateway";
  status: "healthy" | "warning" | "critical" | "offline";
  region: string;
  uptime: number;
  cpu: number;
  memory: number;
  disk: number;
}

export interface ServiceStatusDto {
  id: string;
  nodeId?: string;
  name: string;
  status: "operational" | "degraded" | "down" | "maintenance";
  latencyMs?: number;
  lastCheckedAt: string;
}

export interface ProjectDashboardDto {
  project: ProjectSummaryDto;
  kpis: {
    pendingApprovals: number;
    criticalApprovals: number;
    activeAssistants: number;
    activeWorkflows: number;
    releaseCandidates: number;
    healthyInfrastructureNodes: number;
    totalInfrastructureNodes: number;
  };
  modules: ModuleSummaryDto[];
  recommendedInitiatives: InitiativeSummaryDto[];
  approvals: ApprovalSummaryDto[];
  blockers: BlockerSummaryDto[];
  releaseCandidates: ReleaseCandidateSummaryDto[];
  rdSignals: RDSignalDto[];
  infrastructure: InfrastructureNodeDto[];
  services: ServiceStatusDto[];
  recentActivity: ActivityEventDto[];
}

export interface ModuleDetailDto extends ModuleSummaryDto {
  capabilities: string[];
  humanApprovalRequired: boolean;
  relatedInitiatives: InitiativeSummaryDto[];
  relatedApprovals: ApprovalSummaryDto[];
  relatedBlockers: BlockerSummaryDto[];
  relatedActivity: ActivityEventDto[];
}

export interface InitiativeDetailDto extends InitiativeSummaryDto {
  overview: {
    summary: string;
    businessCase: string;
    technicalScope: string;
    targetOutcome: string;
  };
  evidence: EvidenceSourceDto[];
  executionPaths: ExecutionPathDto[];
  tasks: TaskDto[];
  activity: ActivityEventDto[];
  blockers: BlockerSummaryDto[];
  technicalMemo: TechnicalMemoDto | null;
  codeDraftWorkspace: CodeDraftWorkspaceDto | null;
  securityGate: SecurityGateDetailDto | null;
  releaseCandidate: ReleaseCandidateDetailDto | null;
}

export interface AuditEventDto {
  id: string;
  projectId?: string;
  timestamp: string;
  action: string;
  actor: string;
  actorType: "user" | "assistant" | "system";
  target: string;
  module: string;
  details: string;
  riskLevel: "low" | "medium" | "high";
  sourceType: SourceTypeDto;
}

export interface ListQuery {
  projectId?: string;
  initiativeSlug?: string;
  status?: string;
  category?: string;
  riskLevel?: string;
  priority?: string;
  severity?: string;
  type?: string;
  module?: string;
  page?: string;
  pageSize?: string;
}
