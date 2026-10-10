import type {
  ActivityEventDto,
  ApprovalStatusDto,
  ApprovalSummaryDto,
  AuditEventDto,
  BlockerSummaryDto,
  CodeDraftWorkspaceDto,
  EvidenceSourceDto,
  ExecutionPathDto,
  InfrastructureNodeDto,
  InitiativeSummaryDto,
  ModuleSummaryDto,
  ProjectSummaryDto,
  RDSignalDto,
  ReleaseApprovalChecklistItemDto,
  ReleaseArtifactDto,
  ReleaseCandidateDetailDto,
  ReleaseCandidateSummaryDto,
  RiskLevelDto,
  RollbackPlanDto,
  SandboxedArtifactDto,
  SecurityCheckDto,
  SecurityFindingDto,
  SecurityGateDetailDto,
  ServiceStatusDto,
  SeverityDto,
  SourceTypeDto,
  TaskDto,
  TechnicalMemoDto
} from "../dto";

// ============================================================================
// Enum Sets & Validation Helpers (Strict, No Silent Coercion)
// ============================================================================

const VALID_SOURCE_TYPES = new Set<SourceTypeDto>([
  "seed",
  "manual",
  "workflow",
  "ai",
  "backend_aggregate"
]);

export function mapSourceType(val: unknown): SourceTypeDto {
  if (typeof val === "string" && VALID_SOURCE_TYPES.has(val as SourceTypeDto)) {
    return val as SourceTypeDto;
  }
  throw new Error(`Invalid SourceType: ${String(val)}`);
}

const VALID_SEVERITIES = new Set<SeverityDto>(["low", "medium", "high", "critical"]);

export function mapSeverity(val: unknown): SeverityDto {
  if (typeof val === "string" && VALID_SEVERITIES.has(val as SeverityDto)) {
    return val as SeverityDto;
  }
  throw new Error(`Invalid Severity: ${String(val)}`);
}

const VALID_RISK_LEVELS = new Set<RiskLevelDto>(["low", "medium", "high", "critical"]);

export function mapRiskLevel(val: unknown): RiskLevelDto {
  if (typeof val === "string" && VALID_RISK_LEVELS.has(val as RiskLevelDto)) {
    return val as RiskLevelDto;
  }
  throw new Error(`Invalid RiskLevel: ${String(val)}`);
}

// ActivityEvent
const VALID_ACTIVITY_TYPES = new Set<ActivityEventDto["type"]>([
  "signal",
  "evidence",
  "recommendation",
  "path_selection",
  "memo",
  "task",
  "code",
  "security",
  "approval",
  "blocker",
  "release",
  "support"
]);

export function mapActivityType(val: unknown): ActivityEventDto["type"] {
  if (typeof val === "string" && VALID_ACTIVITY_TYPES.has(val as ActivityEventDto["type"])) {
    return val as ActivityEventDto["type"];
  }
  throw new Error(`Invalid ActivityEvent type: ${String(val)}`);
}

const VALID_ACTIVITY_ACTOR_TYPES = new Set<ActivityEventDto["actorType"]>([
  "system",
  "assistant",
  "user"
]);

export function mapActivityActorType(val: unknown): ActivityEventDto["actorType"] {
  if (typeof val === "string" && VALID_ACTIVITY_ACTOR_TYPES.has(val as ActivityEventDto["actorType"])) {
    return val as ActivityEventDto["actorType"];
  }
  throw new Error(`Invalid ActivityEvent actorType: ${String(val)}`);
}

const VALID_ACTIVITY_STATUSES = new Set<ActivityEventDto["status"]>([
  "completed",
  "pending",
  "in_progress",
  "blocked"
]);

export function mapActivityStatus(val: unknown): ActivityEventDto["status"] {
  if (typeof val === "string" && VALID_ACTIVITY_STATUSES.has(val as ActivityEventDto["status"])) {
    return val as ActivityEventDto["status"];
  }
  throw new Error(`Invalid ActivityEvent status: ${String(val)}`);
}

// AuditEvent
const VALID_AUDIT_ACTOR_TYPES = new Set<AuditEventDto["actorType"]>([
  "user",
  "assistant",
  "system"
]);

export function mapAuditActorType(val: unknown): AuditEventDto["actorType"] {
  if (typeof val === "string" && VALID_AUDIT_ACTOR_TYPES.has(val as AuditEventDto["actorType"])) {
    return val as AuditEventDto["actorType"];
  }
  throw new Error(`Invalid AuditEvent actorType: ${String(val)}`);
}

const VALID_AUDIT_RISK_LEVELS = new Set<AuditEventDto["riskLevel"]>(["low", "medium", "high"]);

export function mapAuditRiskLevel(val: unknown): AuditEventDto["riskLevel"] {
  if (val === null || val === undefined) {
    return "low";
  }
  if (typeof val === "string" && VALID_AUDIT_RISK_LEVELS.has(val as AuditEventDto["riskLevel"])) {
    return val as AuditEventDto["riskLevel"];
  }
  throw new Error(`Invalid AuditEvent riskLevel: ${String(val)}`);
}

// Project
const VALID_PROJECT_STATUSES = new Set<ProjectSummaryDto["status"]>([
  "active",
  "planning",
  "evaluation",
  "draft",
  "archived"
]);

export function mapProjectStatus(val: unknown): ProjectSummaryDto["status"] {
  if (typeof val === "string" && VALID_PROJECT_STATUSES.has(val as ProjectSummaryDto["status"])) {
    return val as ProjectSummaryDto["status"];
  }
  throw new Error(`Invalid Project status: ${String(val)}`);
}

const VALID_PROJECT_PHASES = new Set<ProjectSummaryDto["phase"]>([
  "development",
  "phase_1_activation",
  "limited_preview",
  "advanced_package",
  "locked_add_on"
]);

export function mapProjectPhase(val: unknown): ProjectSummaryDto["phase"] {
  if (typeof val === "string" && VALID_PROJECT_PHASES.has(val as ProjectSummaryDto["phase"])) {
    return val as ProjectSummaryDto["phase"];
  }
  throw new Error(`Invalid Project phase: ${String(val)}`);
}

const VALID_PROJECT_PLATFORMS = new Set<ProjectSummaryDto["platform"]>([
  "personal",
  "SONiC",
  "OpenWiFi",
  "OpenLAN",
  "SDN Controller",
  "OpenConfig/gNMI",
  "Other"
]);

export function mapProjectPlatform(val: unknown): ProjectSummaryDto["platform"] {
  if (typeof val === "string" && VALID_PROJECT_PLATFORMS.has(val as ProjectSummaryDto["platform"])) {
    return val as ProjectSummaryDto["platform"];
  }
  throw new Error(`Invalid Project platform: ${String(val)}`);
}

// Module
const VALID_MODULE_CATEGORIES = new Set<ModuleSummaryDto["category"]>([
  "core",
  "intelligence",
  "execution",
  "assurance",
  "expansion",
  "support"
]);

export function mapModuleCategory(val: unknown): ModuleSummaryDto["category"] {
  if (typeof val === "string" && VALID_MODULE_CATEGORIES.has(val as ModuleSummaryDto["category"])) {
    return val as ModuleSummaryDto["category"];
  }
  throw new Error(`Invalid Module category: ${String(val)}`);
}

const VALID_MODULE_PHASES = new Set<ModuleSummaryDto["phase"]>([
  "phase_1_activation",
  "limited_preview",
  "advanced_package",
  "locked_add_on"
]);

export function mapModulePhase(val: unknown): ModuleSummaryDto["phase"] {
  if (typeof val === "string" && VALID_MODULE_PHASES.has(val as ModuleSummaryDto["phase"])) {
    return val as ModuleSummaryDto["phase"];
  }
  throw new Error(`Invalid Module phase: ${String(val)}`);
}

const VALID_MODULE_STATUSES = new Set<ModuleSummaryDto["status"]>([
  "enabled",
  "limited_preview",
  "locked",
  "request_activation"
]);

export function mapModuleStatus(val: unknown): ModuleSummaryDto["status"] {
  if (typeof val === "string" && VALID_MODULE_STATUSES.has(val as ModuleSummaryDto["status"])) {
    return val as ModuleSummaryDto["status"];
  }
  throw new Error(`Invalid Module status: ${String(val)}`);
}

// Initiative
const VALID_INITIATIVE_STATUSES = new Set<InitiativeSummaryDto["status"]>([
  "recommended",
  "in_progress",
  "pending_approval",
  "completed",
  "blocked",
  "archived"
]);

export function mapInitiativeStatus(val: unknown): InitiativeSummaryDto["status"] {
  if (typeof val === "string" && VALID_INITIATIVE_STATUSES.has(val as InitiativeSummaryDto["status"])) {
    return val as InitiativeSummaryDto["status"];
  }
  throw new Error(`Invalid Initiative status: ${String(val)}`);
}

const VALID_INITIATIVE_CATEGORIES = new Set<InitiativeSummaryDto["category"]>([
  "validation",
  "automation",
  "telemetry",
  "governance",
  "integration"
]);

export function mapInitiativeCategory(val: unknown): InitiativeSummaryDto["category"] {
  if (typeof val === "string" && VALID_INITIATIVE_CATEGORIES.has(val as InitiativeSummaryDto["category"])) {
    return val as InitiativeSummaryDto["category"];
  }
  throw new Error(`Invalid Initiative category: ${String(val)}`);
}

const VALID_BUSINESS_VALUES = new Set<InitiativeSummaryDto["businessValue"]>([
  "low",
  "medium",
  "high"
]);

export function mapBusinessValue(val: unknown): InitiativeSummaryDto["businessValue"] {
  if (typeof val === "string" && VALID_BUSINESS_VALUES.has(val as InitiativeSummaryDto["businessValue"])) {
    return val as InitiativeSummaryDto["businessValue"];
  }
  throw new Error(`Invalid BusinessValue: ${String(val)}`);
}

// Approval
const VALID_APPROVAL_STATUSES = new Set<ApprovalStatusDto>([
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "cancelled"
]);

export function mapApprovalStatus(val: unknown): ApprovalStatusDto {
  if (typeof val === "string" && VALID_APPROVAL_STATUSES.has(val as ApprovalStatusDto)) {
    return val as ApprovalStatusDto;
  }
  throw new Error(`Invalid Approval status: ${String(val)}`);
}

const VALID_APPROVAL_TYPES = new Set<ApprovalSummaryDto["type"]>([
  "release",
  "security",
  "merge",
  "deployment",
  "exception",
  "access",
  "program_workspace",
  "execution_path"
]);

export function mapApprovalType(val: unknown): ApprovalSummaryDto["type"] {
  if (typeof val === "string" && VALID_APPROVAL_TYPES.has(val as ApprovalSummaryDto["type"])) {
    return val as ApprovalSummaryDto["type"];
  }
  throw new Error(`Invalid Approval type: ${String(val)}`);
}

// Blocker
const VALID_BLOCKER_TYPES = new Set<BlockerSummaryDto["type"]>([
  "code",
  "security",
  "lab",
  "approval",
  "dependency",
  "design",
  "support"
]);

export function mapBlockerType(val: unknown): BlockerSummaryDto["type"] {
  if (typeof val === "string" && VALID_BLOCKER_TYPES.has(val as BlockerSummaryDto["type"])) {
    return val as BlockerSummaryDto["type"];
  }
  throw new Error(`Invalid Blocker type: ${String(val)}`);
}

const VALID_BLOCKER_STATUSES = new Set<BlockerSummaryDto["status"]>([
  "open",
  "investigating",
  "pending_escalation",
  "pending_human",
  "resolved"
]);

export function mapBlockerStatus(val: unknown): BlockerSummaryDto["status"] {
  if (typeof val === "string" && VALID_BLOCKER_STATUSES.has(val as BlockerSummaryDto["status"])) {
    return val as BlockerSummaryDto["status"];
  }
  throw new Error(`Invalid Blocker status: ${String(val)}`);
}

// Task
const VALID_TASK_LANES = new Set<TaskDto["lane"]>([
  "backlog",
  "analysis",
  "design",
  "approved",
  "in_progress",
  "testing",
  "blocked",
  "done"
]);

export function mapTaskLane(val: unknown): TaskDto["lane"] {
  if (typeof val === "string" && VALID_TASK_LANES.has(val as TaskDto["lane"])) {
    return val as TaskDto["lane"];
  }
  throw new Error(`Invalid Task lane: ${String(val)}`);
}

const VALID_TASK_STATUSES = new Set<TaskDto["status"]>([
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked"
]);

export function mapTaskStatus(val: unknown): TaskDto["status"] {
  if (typeof val === "string" && VALID_TASK_STATUSES.has(val as TaskDto["status"])) {
    return val as TaskDto["status"];
  }
  throw new Error(`Invalid Task status: ${String(val)}`);
}

// Security Gate
const VALID_SECURITY_GATE_STATUSES = new Set<SecurityGateDetailDto["status"]>([
  "not_started",
  "running",
  "passed",
  "blocked",
  "failed",
  "exception_requested"
]);

export function mapSecurityGateStatus(val: unknown): SecurityGateDetailDto["status"] {
  if (typeof val === "string" && VALID_SECURITY_GATE_STATUSES.has(val as SecurityGateDetailDto["status"])) {
    return val as SecurityGateDetailDto["status"];
  }
  throw new Error(`Invalid SecurityGate status: ${String(val)}`);
}

const VALID_SECURITY_CHECK_TYPES = new Set<SecurityCheckDto["checkType"]>([
  "dependency",
  "policy",
  "secret",
  "license",
  "configuration",
  "manual_review"
]);

export function mapSecurityCheckType(val: unknown): SecurityCheckDto["checkType"] {
  if (typeof val === "string" && VALID_SECURITY_CHECK_TYPES.has(val as SecurityCheckDto["checkType"])) {
    return val as SecurityCheckDto["checkType"];
  }
  throw new Error(`Invalid SecurityCheck checkType: ${String(val)}`);
}

const VALID_SECURITY_CHECK_STATUSES = new Set<SecurityCheckDto["status"]>([
  "not_run",
  "passed",
  "warning",
  "failed",
  "blocked"
]);

export function mapSecurityCheckStatus(val: unknown): SecurityCheckDto["status"] {
  if (typeof val === "string" && VALID_SECURITY_CHECK_STATUSES.has(val as SecurityCheckDto["status"])) {
    return val as SecurityCheckDto["status"];
  }
  throw new Error(`Invalid SecurityCheck status: ${String(val)}`);
}

const VALID_SECURITY_FINDING_STATUSES = new Set<SecurityFindingDto["status"]>([
  "open",
  "accepted_risk",
  "resolved",
  "false_positive"
]);

export function mapSecurityFindingStatus(val: unknown): SecurityFindingDto["status"] {
  if (typeof val === "string" && VALID_SECURITY_FINDING_STATUSES.has(val as SecurityFindingDto["status"])) {
    return val as SecurityFindingDto["status"];
  }
  throw new Error(`Invalid SecurityFinding status: ${String(val)}`);
}

// Release Candidate
const VALID_RELEASE_CANDIDATE_STATUSES = new Set<ReleaseCandidateSummaryDto["status"]>([
  "draft",
  "review",
  "security_review",
  "approval_pending",
  "approved",
  "blocked",
  "released"
]);

export function mapReleaseCandidateStatus(val: unknown): ReleaseCandidateSummaryDto["status"] {
  if (typeof val === "string" && VALID_RELEASE_CANDIDATE_STATUSES.has(val as ReleaseCandidateSummaryDto["status"])) {
    return val as ReleaseCandidateSummaryDto["status"];
  }
  throw new Error(`Invalid ReleaseCandidate status: ${String(val)}`);
}

const VALID_RELEASE_ARTIFACT_TYPES = new Set<ReleaseArtifactDto["artifactType"]>([
  "release_note",
  "validation_report",
  "security_report",
  "deployment_manifest",
  "rollback_plan"
]);

export function mapReleaseArtifactType(val: unknown): ReleaseArtifactDto["artifactType"] {
  if (typeof val === "string" && VALID_RELEASE_ARTIFACT_TYPES.has(val as ReleaseArtifactDto["artifactType"])) {
    return val as ReleaseArtifactDto["artifactType"];
  }
  throw new Error(`Invalid ReleaseArtifact artifactType: ${String(val)}`);
}

const VALID_RELEASE_ARTIFACT_STATUSES = new Set<ReleaseArtifactDto["status"]>([
  "placeholder",
  "available",
  "blocked"
]);

export function mapReleaseArtifactStatus(val: unknown): ReleaseArtifactDto["status"] {
  if (typeof val === "string" && VALID_RELEASE_ARTIFACT_STATUSES.has(val as ReleaseArtifactDto["status"])) {
    return val as ReleaseArtifactDto["status"];
  }
  throw new Error(`Invalid ReleaseArtifact status: ${String(val)}`);
}

const VALID_RELEASE_APPROVAL_CHECKLIST_STATUSES = new Set<ReleaseApprovalChecklistItemDto["status"]>([
  "pending",
  "passed",
  "failed",
  "waived"
]);

export function mapReleaseApprovalChecklistStatus(val: unknown): ReleaseApprovalChecklistItemDto["status"] {
  if (typeof val === "string" && VALID_RELEASE_APPROVAL_CHECKLIST_STATUSES.has(val as ReleaseApprovalChecklistItemDto["status"])) {
    return val as ReleaseApprovalChecklistItemDto["status"];
  }
  throw new Error(`Invalid ReleaseApprovalChecklistItem status: ${String(val)}`);
}

const VALID_ROLLBACK_PLAN_STATUSES = new Set<RollbackPlanDto["status"]>([
  "draft",
  "approved",
  "not_required"
]);

export function mapRollbackPlanStatus(val: unknown): RollbackPlanDto["status"] {
  if (typeof val === "string" && VALID_ROLLBACK_PLAN_STATUSES.has(val as RollbackPlanDto["status"])) {
    return val as RollbackPlanDto["status"];
  }
  throw new Error(`Invalid RollbackPlan status: ${String(val)}`);
}

// Evidence & Execution Path
const VALID_EVIDENCE_TYPES = new Set<EvidenceSourceDto["type"]>([
  "community_signal",
  "security_advisory",
  "roadmap_gap",
  "customer_request",
  "compliance_requirement",
  "manual_note"
]);

export function mapEvidenceType(val: unknown): EvidenceSourceDto["type"] {
  if (typeof val === "string" && VALID_EVIDENCE_TYPES.has(val as EvidenceSourceDto["type"])) {
    return val as EvidenceSourceDto["type"];
  }
  throw new Error(`Invalid EvidenceSource type: ${String(val)}`);
}

const VALID_EVIDENCE_RELEVANCES = new Set<EvidenceSourceDto["relevance"]>(["low", "medium", "high"]);

export function mapEvidenceRelevance(val: unknown): EvidenceSourceDto["relevance"] {
  if (typeof val === "string" && VALID_EVIDENCE_RELEVANCES.has(val as EvidenceSourceDto["relevance"])) {
    return val as EvidenceSourceDto["relevance"];
  }
  throw new Error(`Invalid EvidenceSource relevance: ${String(val)}`);
}

const VALID_EXECUTION_PATH_RISK_LEVELS = new Set<ExecutionPathDto["riskLevel"]>([
  "low",
  "medium",
  "high",
  "very_high"
]);

export function mapExecutionPathRiskLevel(val: unknown): ExecutionPathDto["riskLevel"] {
  if (typeof val === "string" && VALID_EXECUTION_PATH_RISK_LEVELS.has(val as ExecutionPathDto["riskLevel"])) {
    return val as ExecutionPathDto["riskLevel"];
  }
  throw new Error(`Invalid ExecutionPath riskLevel: ${String(val)}`);
}

const VALID_EXECUTION_PATH_STATUSES = new Set<ExecutionPathDto["status"]>([
  "enabled",
  "limited_preview",
  "locked_add_on",
  "locked_advanced"
]);

export function mapExecutionPathStatus(val: unknown): ExecutionPathDto["status"] {
  if (typeof val === "string" && VALID_EXECUTION_PATH_STATUSES.has(val as ExecutionPathDto["status"])) {
    return val as ExecutionPathDto["status"];
  }
  throw new Error(`Invalid ExecutionPath status: ${String(val)}`);
}

// TechnicalMemo & CodeDraftWorkspace
const VALID_TECHNICAL_MEMO_STATUSES = new Set<TechnicalMemoDto["status"]>([
  "draft",
  "review",
  "approved"
]);

export function mapTechnicalMemoStatus(val: unknown): TechnicalMemoDto["status"] {
  if (typeof val === "string" && VALID_TECHNICAL_MEMO_STATUSES.has(val as TechnicalMemoDto["status"])) {
    return val as TechnicalMemoDto["status"];
  }
  throw new Error(`Invalid TechnicalMemo status: ${String(val)}`);
}

const VALID_CODE_DRAFT_WORKSPACE_STATUSES = new Set<CodeDraftWorkspaceDto["status"]>([
  "not_started",
  "draft",
  "pending_review",
  "blocked",
  "approved"
]);

export function mapCodeDraftWorkspaceStatus(val: unknown): CodeDraftWorkspaceDto["status"] {
  if (typeof val === "string" && VALID_CODE_DRAFT_WORKSPACE_STATUSES.has(val as CodeDraftWorkspaceDto["status"])) {
    return val as CodeDraftWorkspaceDto["status"];
  }
  throw new Error(`Invalid CodeDraftWorkspace status: ${String(val)}`);
}

const VALID_SANDBOXED_ARTIFACT_TYPES = new Set<SandboxedArtifactDto["artifactType"]>([
  "reference_topology",
  "config_template",
  "test_cases",
  "log_validator",
  "technical_note"
]);

export function mapSandboxedArtifactType(val: unknown): SandboxedArtifactDto["artifactType"] {
  if (typeof val === "string" && VALID_SANDBOXED_ARTIFACT_TYPES.has(val as SandboxedArtifactDto["artifactType"])) {
    return val as SandboxedArtifactDto["artifactType"];
  }
  throw new Error(`Invalid SandboxedArtifact artifactType: ${String(val)}`);
}

const VALID_SANDBOXED_ARTIFACT_STATUSES = new Set<SandboxedArtifactDto["status"]>([
  "draft",
  "ready_for_review",
  "blocked"
]);

export function mapSandboxedArtifactStatus(val: unknown): SandboxedArtifactDto["status"] {
  if (typeof val === "string" && VALID_SANDBOXED_ARTIFACT_STATUSES.has(val as SandboxedArtifactDto["status"])) {
    return val as SandboxedArtifactDto["status"];
  }
  throw new Error(`Invalid SandboxedArtifact status: ${String(val)}`);
}

// RDSignal & Infrastructure
const VALID_RD_SIGNAL_TYPES = new Set<RDSignalDto["type"]>([
  "trend",
  "community",
  "competitor",
  "vulnerability",
  "opportunity"
]);

export function mapRDSignalType(val: unknown): RDSignalDto["type"] {
  if (typeof val === "string" && VALID_RD_SIGNAL_TYPES.has(val as RDSignalDto["type"])) {
    return val as RDSignalDto["type"];
  }
  throw new Error(`Invalid RDSignal type: ${String(val)}`);
}

const VALID_INFRASTRUCTURE_NODE_TYPES = new Set<InfrastructureNodeDto["type"]>([
  "api",
  "database",
  "worker",
  "storage",
  "gateway"
]);

export function mapInfrastructureNodeType(val: unknown): InfrastructureNodeDto["type"] {
  if (typeof val === "string" && VALID_INFRASTRUCTURE_NODE_TYPES.has(val as InfrastructureNodeDto["type"])) {
    return val as InfrastructureNodeDto["type"];
  }
  throw new Error(`Invalid InfrastructureNode type: ${String(val)}`);
}

const VALID_INFRASTRUCTURE_NODE_STATUSES = new Set<InfrastructureNodeDto["status"]>([
  "healthy",
  "warning",
  "critical",
  "offline"
]);

export function mapInfrastructureNodeStatus(val: unknown): InfrastructureNodeDto["status"] {
  if (typeof val === "string" && VALID_INFRASTRUCTURE_NODE_STATUSES.has(val as InfrastructureNodeDto["status"])) {
    return val as InfrastructureNodeDto["status"];
  }
  throw new Error(`Invalid InfrastructureNode status: ${String(val)}`);
}

const VALID_SERVICE_STATUSES = new Set<ServiceStatusDto["status"]>([
  "operational",
  "degraded",
  "down",
  "maintenance"
]);

export function mapServiceStatusStatus(val: unknown): ServiceStatusDto["status"] {
  if (typeof val === "string" && VALID_SERVICE_STATUSES.has(val as ServiceStatusDto["status"])) {
    return val as ServiceStatusDto["status"];
  }
  throw new Error(`Invalid ServiceStatus status: ${String(val)}`);
}

// ============================================================================
// Entity Mappers
// ============================================================================

export interface RawProjectSummaryInput {
  id: string;
  slug: string;
  name: string;
  customerFacingName: string;
  description?: string | null;
  status: string;
  phase: string;
  platform: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  modules?: { status: string }[];
  initiatives?: { status: string }[];
  approvals?: { status: string }[];
  blockers?: { status: string }[];
  _count?: {
    modules?: number;
    initiatives?: number;
    approvals?: number;
    blockers?: number;
  };
}

export function mapProjectSummary(p: RawProjectSummaryInput): ProjectSummaryDto {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    customerFacingName: p.customerFacingName,
    description: p.description ?? undefined,
    status: mapProjectStatus(p.status),
    phase: mapProjectPhase(p.phase),
    platform: mapProjectPlatform(p.platform),
    activeModulesCount: p.modules ? p.modules.filter((m) => m.status === "enabled").length : (p._count?.modules ?? 0),
    recommendedInitiativesCount: p.initiatives ? p.initiatives.filter((i) => i.status === "recommended").length : (p._count?.initiatives ?? 0),
    pendingApprovalsCount: p.approvals ? p.approvals.filter((a) => a.status === "pending").length : (p._count?.approvals ?? 0),
    openBlockersCount: p.blockers ? p.blockers.filter((b) => b.status === "open").length : (p._count?.blockers ?? 0),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt)
  };
}

export interface RawModuleInput {
  id: string;
  slug: string;
  key: string;
  name: string;
  customerFacingName: string;
  category: string;
  description: string;
  phase: string;
  status: string;
  isLocked: boolean;
  lockReason?: string | null;
  route?: string | null;
  order: number;
}

export function mapModuleSummary(m: RawModuleInput): ModuleSummaryDto {
  return {
    id: m.id,
    slug: m.slug,
    key: m.key,
    name: m.name,
    customerFacingName: m.customerFacingName,
    category: mapModuleCategory(m.category),
    description: m.description,
    phase: mapModulePhase(m.phase),
    status: mapModuleStatus(m.status),
    isLocked: m.isLocked,
    lockReason: m.lockReason ?? undefined,
    route: m.route ?? undefined,
    order: m.order
  };
}

export interface RawInitiativeInput {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  name: string;
  description: string;
  status: string;
  category: string;
  businessValue: string;
  technicalRisk: string;
  recommendedPath: string;
  tags?: string[] | null;
  humanApprovalRequired: boolean;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  evidence?: unknown[];
  tasks?: { status: string }[];
  blockers?: { status: string }[];
  approvals?: { status: string }[];
  _count?: {
    evidence?: number;
    tasks?: number;
    blockers?: number;
    approvals?: number;
  };
}

export function mapInitiativeSummary(row: RawInitiativeInput): InitiativeSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    projectId: row.projectId,
    title: row.title,
    name: row.name,
    description: row.description,
    status: mapInitiativeStatus(row.status),
    category: mapInitiativeCategory(row.category),
    businessValue: mapBusinessValue(row.businessValue),
    technicalRisk: mapRiskLevel(row.technicalRisk),
    recommendedPath: row.recommendedPath,
    evidenceSources: row.evidence ? row.evidence.length : (row._count?.evidence ?? 0),
    taskCount: row.tasks ? row.tasks.length : (row._count?.tasks ?? 0),
    completedTaskCount: row.tasks ? row.tasks.filter((t) => t.status === "done").length : 0,
    openBlockerCount: row.blockers ? row.blockers.filter((b) => b.status === "open").length : 0,
    pendingApprovalCount: row.approvals ? row.approvals.filter((a) => a.status === "pending").length : 0,
    tags: row.tags ?? [],
    humanApprovalRequired: row.humanApprovalRequired,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    lastActivityAt: row.lastActivityAt instanceof Date ? row.lastActivityAt.toISOString() : String(row.lastActivityAt)
  };
}

export interface RawTaskInput {
  id: string;
  initiativeSlug: string;
  title: string;
  description?: string | null;
  lane: string;
  status: string;
  priority: string;
  assignee: string;
  ownerRole?: string | null;
  dueDate?: Date | string | null;
  sourceType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function mapTask(t: RawTaskInput): TaskDto {
  return {
    id: t.id,
    initiativeSlug: t.initiativeSlug,
    title: t.title,
    description: t.description ?? undefined,
    lane: mapTaskLane(t.lane),
    status: mapTaskStatus(t.status),
    priority: mapSeverity(t.priority),
    assignee: t.assignee,
    ownerRole: t.ownerRole ?? undefined,
    dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : (t.dueDate ? String(t.dueDate) : undefined),
    sourceType: mapSourceType(t.sourceType),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt)
  };
}

export interface RawApprovalInput {
  id: string;
  projectId: string;
  initiativeSlug?: string | null;
  title: string;
  description: string;
  module: string;
  priority: string;
  status: string;
  type: string;
  requestedBy: string;
  requestedRole?: string | null;
  approverRole?: string | null;
  requiresHumanApproval: boolean;
  createdAt: Date | string;
  dueAt?: Date | string | null;
}

export function mapApprovalSummary(a: RawApprovalInput): ApprovalSummaryDto {
  return {
    id: a.id,
    projectId: a.projectId,
    initiativeSlug: a.initiativeSlug ?? undefined,
    title: a.title,
    description: a.description,
    module: a.module,
    priority: mapSeverity(a.priority),
    status: mapApprovalStatus(a.status),
    type: mapApprovalType(a.type),
    requestedBy: a.requestedBy,
    requestedRole: a.requestedRole ?? undefined,
    approverRole: a.approverRole ?? undefined,
    requiresHumanApproval: a.requiresHumanApproval,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    dueAt: a.dueAt instanceof Date ? a.dueAt.toISOString() : (a.dueAt ? String(a.dueAt) : undefined)
  };
}

export interface RawBlockerInput {
  id: string;
  projectId: string;
  initiativeSlug?: string | null;
  title: string;
  description: string;
  type: string;
  severity: string;
  status: string;
  cause: string;
  owner: string;
  evidence: string;
  suggestedAction: string;
  nextStep: string;
  rollbackOption: string;
  maxAssistantFixAttempts: number;
  humanReviewRequiredAfterAttempts: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function mapBlockerSummary(b: RawBlockerInput): BlockerSummaryDto {
  return {
    id: b.id,
    projectId: b.projectId,
    initiativeSlug: b.initiativeSlug ?? undefined,
    title: b.title,
    description: b.description,
    type: mapBlockerType(b.type),
    severity: mapSeverity(b.severity),
    status: mapBlockerStatus(b.status),
    cause: b.cause,
    owner: b.owner,
    evidence: b.evidence,
    suggestedAction: b.suggestedAction,
    nextStep: b.nextStep,
    rollbackOption: b.rollbackOption,
    maxAssistantFixAttempts: b.maxAssistantFixAttempts,
    humanReviewRequiredAfterAttempts: b.humanReviewRequiredAfterAttempts,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : String(b.updatedAt)
  };
}

export interface RawActivityEventInput {
  id: string;
  projectId?: string | null;
  initiativeSlug?: string | null;
  type: string;
  title: string;
  description: string;
  actor: string;
  actorType: string;
  status: string;
  sourceType: string;
  createdAt: Date | string;
}

export function mapActivityEvent(a: RawActivityEventInput): ActivityEventDto {
  return {
    id: a.id,
    projectId: a.projectId ?? undefined,
    initiativeSlug: a.initiativeSlug ?? undefined,
    type: mapActivityType(a.type),
    title: a.title,
    description: a.description,
    actor: a.actor,
    actorType: mapActivityActorType(a.actorType),
    status: mapActivityStatus(a.status),
    sourceType: mapSourceType(a.sourceType),
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt)
  };
}

export interface RawAuditEventInput {
  id: string;
  projectId?: string | null;
  timestamp?: Date | string | null;
  createdAt?: Date | string | null;
  action: string;
  actor: string;
  actorType: string;
  target: string;
  module: string;
  details?: string | null;
  description?: string | null;
  riskLevel?: string | null;
  sourceType?: string | null;
}

export function mapAuditEvent(e: RawAuditEventInput): AuditEventDto {
  const ts = e.timestamp ?? e.createdAt ?? new Date();
  return {
    id: e.id,
    projectId: e.projectId ?? undefined,
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
    action: e.action,
    actor: e.actor,
    actorType: mapAuditActorType(e.actorType),
    target: e.target,
    module: e.module,
    details: e.details ?? e.description ?? "",
    riskLevel: mapAuditRiskLevel(e.riskLevel),
    sourceType: mapSourceType(e.sourceType ?? "manual")
  };
}

export interface RawEvidenceInput {
  id: string;
  initiativeSlug: string;
  type: string;
  title: string;
  source: string;
  relevance: string;
  summary: string;
  sourceType: string;
  createdAt: Date | string;
}

export function mapEvidenceSource(e: RawEvidenceInput): EvidenceSourceDto {
  return {
    id: e.id,
    initiativeSlug: e.initiativeSlug,
    type: mapEvidenceType(e.type),
    title: e.title,
    source: e.source,
    relevance: mapEvidenceRelevance(e.relevance),
    summary: e.summary,
    sourceType: mapSourceType(e.sourceType),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt)
  };
}

export interface RawExecutionPathInput {
  id: string;
  initiativeSlug: string;
  name: string;
  description: string;
  riskLevel: string;
  status: string;
  requiresApproval: boolean;
  estimatedDuration: string;
  deliverables?: string[] | null;
}

export function mapExecutionPath(ep: RawExecutionPathInput): ExecutionPathDto {
  return {
    id: ep.id,
    initiativeSlug: ep.initiativeSlug,
    name: ep.name,
    description: ep.description,
    riskLevel: mapExecutionPathRiskLevel(ep.riskLevel),
    status: mapExecutionPathStatus(ep.status),
    requiresApproval: ep.requiresApproval,
    estimatedDuration: ep.estimatedDuration,
    deliverables: ep.deliverables ?? []
  };
}

export interface RawSecurityGateInput {
  id: string;
  projectId: string;
  initiativeSlug?: string | null;
  title: string;
  status: string;
  riskLevel: string;
  summary: string;
  lastCheckedAt?: Date | string | null;
  createdAt?: Date | string;
  checks?: {
    id: string;
    securityGateId?: string;
    title: string;
    checkType: string;
    status: string;
    severity: string;
    evidence?: string | null;
  }[];
  findings?: {
    id: string;
    securityGateId?: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    recommendation: string;
    owner: string;
  }[];
}

export function mapSecurityGateDetail(g: RawSecurityGateInput): SecurityGateDetailDto {
  return {
    id: g.id,
    projectId: g.projectId,
    initiativeSlug: g.initiativeSlug ?? undefined,
    title: g.title,
    status: mapSecurityGateStatus(g.status),
    riskLevel: mapRiskLevel(g.riskLevel),
    summary: g.summary,
    lastCheckedAt: g.lastCheckedAt instanceof Date ? g.lastCheckedAt.toISOString() : (g.lastCheckedAt ? String(g.lastCheckedAt) : (g.createdAt instanceof Date ? g.createdAt.toISOString() : undefined)),
    checks: (g.checks ?? []).map((c) => ({
      id: c.id,
      securityGateId: c.securityGateId ?? g.id,
      title: c.title,
      checkType: mapSecurityCheckType(c.checkType),
      status: mapSecurityCheckStatus(c.status),
      severity: mapSeverity(c.severity),
      evidence: c.evidence ?? undefined
    })),
    findings: (g.findings ?? []).map((f) => ({
      id: f.id,
      securityGateId: f.securityGateId ?? g.id,
      title: f.title,
      description: f.description,
      severity: mapSeverity(f.severity),
      status: mapSecurityFindingStatus(f.status),
      recommendation: f.recommendation,
      owner: f.owner
    }))
  };
}

export interface RawReleaseCandidateSummaryInput {
  id: string;
  projectId: string;
  initiativeSlug?: string | null;
  version: string;
  title: string;
  description: string;
  status: string;
  securityScore: number;
  testsPassed: number;
  testsTotal: number;
  changeCount: number;
  blockingIssues: number;
  artifactCount: number;
  createdAt: Date | string;
}

export function mapReleaseCandidateSummary(rc: RawReleaseCandidateSummaryInput): ReleaseCandidateSummaryDto {
  return {
    id: rc.id,
    projectId: rc.projectId,
    initiativeSlug: rc.initiativeSlug ?? undefined,
    version: rc.version,
    title: rc.title,
    description: rc.description,
    status: mapReleaseCandidateStatus(rc.status),
    securityScore: rc.securityScore,
    testsPassed: rc.testsPassed,
    testsTotal: rc.testsTotal,
    changeCount: rc.changeCount,
    blockingIssues: rc.blockingIssues,
    artifactCount: rc.artifactCount,
    createdAt: rc.createdAt instanceof Date ? rc.createdAt.toISOString() : String(rc.createdAt)
  };
}

export interface RawReleaseCandidateDetailInput extends RawReleaseCandidateSummaryInput {
  artifacts?: {
    id: string;
    releaseCandidateId?: string;
    artifactType: string;
    fileName: string;
    status: string;
    checksum?: string | null;
  }[];
  approvalChecklist?: {
    id: string;
    releaseCandidateId?: string;
    title: string;
    status: string;
    requiredRole: string;
  }[];
  rollbackPlan?: {
    id: string;
    releaseCandidateId?: string;
    title: string;
    summary: string;
    status: string;
  } | null;
}

export function mapReleaseCandidateDetail(rc: RawReleaseCandidateDetailInput): ReleaseCandidateDetailDto {
  const summary = mapReleaseCandidateSummary(rc);
  return {
    ...summary,
    artifacts: (rc.artifacts ?? []).map((a) => ({
      id: a.id,
      releaseCandidateId: a.releaseCandidateId ?? rc.id,
      artifactType: mapReleaseArtifactType(a.artifactType),
      fileName: a.fileName,
      status: mapReleaseArtifactStatus(a.status),
      checksum: a.checksum ?? undefined
    })),
    approvalChecklist: (rc.approvalChecklist ?? []).map((c) => ({
      id: c.id,
      releaseCandidateId: c.releaseCandidateId ?? rc.id,
      title: c.title,
      status: mapReleaseApprovalChecklistStatus(c.status),
      requiredRole: c.requiredRole
    })),
    rollbackPlan: rc.rollbackPlan
      ? {
          id: rc.rollbackPlan.id,
          releaseCandidateId: rc.rollbackPlan.releaseCandidateId ?? rc.id,
          title: rc.rollbackPlan.title,
          summary: rc.rollbackPlan.summary,
          status: mapRollbackPlanStatus(rc.rollbackPlan.status)
        }
      : null
  };
}

export interface RawTechnicalMemoInput {
  id: string;
  initiativeSlug: string;
  generatedAt: Date | string;
  generatedBy: string;
  status: string;
  sections: unknown;
}

export function mapTechnicalMemo(m: RawTechnicalMemoInput): TechnicalMemoDto {
  let parsedSections: { title: string; content: string }[] = [];
  if (Array.isArray(m.sections)) {
    parsedSections = m.sections as { title: string; content: string }[];
  } else if (typeof m.sections === "string") {
    try {
      parsedSections = JSON.parse(m.sections) as { title: string; content: string }[];
    } catch {
      parsedSections = [];
    }
  }

  return {
    id: m.id,
    initiativeSlug: m.initiativeSlug,
    generatedAt: m.generatedAt instanceof Date ? m.generatedAt.toISOString() : String(m.generatedAt),
    generatedBy: m.generatedBy,
    status: mapTechnicalMemoStatus(m.status),
    sections: parsedSections
  };
}

export interface RawCodeDraftWorkspaceInput {
  id: string;
  initiativeSlug: string;
  name: string;
  status: string;
  badges?: string[] | null;
  humanApprovalRequired: boolean;
  artifacts?: {
    id: string;
    workspaceId: string;
    fileName: string;
    artifactType: string;
    status: string;
  }[];
}

export function mapCodeDraftWorkspace(w: RawCodeDraftWorkspaceInput): CodeDraftWorkspaceDto {
  return {
    id: w.id,
    initiativeSlug: w.initiativeSlug,
    name: w.name,
    status: mapCodeDraftWorkspaceStatus(w.status),
    badges: w.badges ?? [],
    humanApprovalRequired: w.humanApprovalRequired,
    artifacts: (w.artifacts ?? []).map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      fileName: a.fileName,
      artifactType: mapSandboxedArtifactType(a.artifactType),
      status: mapSandboxedArtifactStatus(a.status)
    }))
  };
}

export interface RawRDSignalInput {
  id: string;
  title: string;
  type: string;
  source: string;
  priority: string;
  summary: string;
  impact: string;
  actionRecommended: string;
  processed: boolean;
  tags?: string[] | null;
  createdAt: Date | string;
}

export function mapRDSignal(s: RawRDSignalInput): RDSignalDto {
  return {
    id: s.id,
    title: s.title,
    type: mapRDSignalType(s.type),
    source: s.source,
    priority: mapSeverity(s.priority),
    summary: s.summary,
    impact: s.impact,
    actionRecommended: s.actionRecommended,
    processed: s.processed,
    tags: s.tags ?? [],
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt)
  };
}

export interface RawInfrastructureNodeInput {
  id: string;
  name: string;
  type: string;
  status: string;
  region: string;
  uptime: number;
  cpu: number;
  memory: number;
  disk: number;
}

export function mapInfrastructureNode(n: RawInfrastructureNodeInput): InfrastructureNodeDto {
  return {
    id: n.id,
    name: n.name,
    type: mapInfrastructureNodeType(n.type),
    status: mapInfrastructureNodeStatus(n.status),
    region: n.region,
    uptime: n.uptime,
    cpu: n.cpu,
    memory: n.memory,
    disk: n.disk
  };
}

export interface RawServiceStatusInput {
  id: string;
  nodeId?: string | null;
  name: string;
  status: string;
  latencyMs?: number | null;
  lastCheckedAt: Date | string;
}

export function mapServiceStatus(s: RawServiceStatusInput): ServiceStatusDto {
  return {
    id: s.id,
    nodeId: s.nodeId ?? undefined,
    name: s.name,
    status: mapServiceStatusStatus(s.status),
    latencyMs: s.latencyMs ?? undefined,
    lastCheckedAt: s.lastCheckedAt instanceof Date ? s.lastCheckedAt.toISOString() : String(s.lastCheckedAt)
  };
}
