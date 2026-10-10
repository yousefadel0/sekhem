import type { ApiErrorDto, ApiMetaDto, AuditEventDto, BlockerSummaryDto, SeverityDto, TaskDto } from "./dto";
import type { ApprovalSummaryDto } from "./dto";

export interface WriteActionResponseDto<T> {
  data: T;
  auditEvent: AuditEventDto;
  meta: ApiMetaDto;
  errors: ApiErrorDto[];
}

export interface WriteActionResult<T> {
  data: T;
  auditEvent: AuditEventDto;
}

export interface AuthenticatedAuditActor {
  displayName: string;
  role: string;
}

export interface WriteAuditEventInput {
  projectId?: string;
  action: string;
  actor: string;
  actorType: "user" | "assistant" | "system";
  target: string;
  module: string;
  details: string;
  riskLevel: "low" | "medium" | "high";
}

export interface StartInitiativeRequestDto {
  actorName: string;
  actorRole: string;
  reason?: string;
}

export interface InitiativeHandoffRequestDto {
  actorName: string;
  actorRole: string;
  reason?: string;
}

export interface InitiativeHandoffDraftDto {
  initiativeId: string;
  status: "DRAFT_REQUESTED";
  nextGate: "HUMAN_REVIEW_REQUIRED";
  createdAsDraftOnly: true;
  autoApply: false;
  githubWrite: false;
  deployment: false;
  auditEventId: string;
}

export interface SelectExecutionPathRequestDto {
  actorName: string;
  actorRole: string;
  approvalId?: string;
  reason?: string;
}

export interface UpdateTaskStatusRequestDto {
  actorName: string;
  actorRole: string;
  status: TaskDto["status"];
  lane?: TaskDto["lane"];
  reason?: string;
}

export interface CreateApprovalRequestDto {
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  module: string;
  priority: ApprovalSummaryDto["priority"];
  type: ApprovalSummaryDto["type"];
  requestedBy: string;
  requestedRole?: string;
  approverRole?: string;
  dueAt?: string;
}

export interface ApprovalDecisionRequestDto {
  actorName: string;
  actorRole: string;
  decision: "approved" | "rejected" | "changes_requested";
  note?: string;
}

export interface CreateBlockerRequestDto {
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  type: BlockerSummaryDto["type"];
  severity: SeverityDto;
  cause: string;
  owner: string;
  evidence: string;
  suggestedAction: string;
  nextStep: string;
  rollbackOption: string;
  maxAssistantFixAttempts?: number;
  humanReviewRequiredAfterAttempts?: boolean;
}
