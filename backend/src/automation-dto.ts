import type { ApiErrorDto, ApiMetaDto, AuditEventDto } from "./dto";

export type WorkflowEventTypeDto =
  | "initiative.started"
  | "execution_path.selected"
  | "memo.requested"
  | "task.status_changed"
  | "security_gate.review_requested"
  | "blocker.created"
  | "release_candidate.created"
  | "system.event_recorded";

export type WorkflowCallbackStatusDto =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled"
  | "timed_out";

export type WorkflowRunStatusDto = WorkflowCallbackStatusDto | "accepted" | "placeholder_recorded";
export type AiMemoStatusDto = "queued" | "accepted" | "placeholder_recorded" | "blocked";
export type SystemEventSeverityDto = "low" | "medium" | "high";

export type WorkflowCallbackEvidenceTypeDto = "log" | "file" | "url" | "test" | "artifact" | "note";
export type WorkflowCallbackBlockerSeverityDto = "low" | "medium" | "high" | "critical";

export interface ContractActionResponseDto<T> {
  data: T;
  auditEvent: AuditEventDto;
  activityEvent: ContractActivityEventDto;
  meta: ApiMetaDto;
  errors: ApiErrorDto[];
}

export interface ContractReadResponseDto<T> {
  data: T;
  meta: ApiMetaDto;
  errors: ApiErrorDto[];
}

export interface ContractActivityEventDto {
  id: string;
  projectId?: string;
  initiativeSlug?: string;
  type: "workflow" | "ai_memo" | "system" | "blocker" | "ai_gateway";
  title: string;
  description: string;
  sourceType: "manual" | "system";
  status: "accepted" | "queued" | "placeholder_recorded" | "blocked";
  createdAt: string;
}

export interface WorkflowEventRequestDto {
  eventType: WorkflowEventTypeDto;
  projectId: string;
  initiativeSlug?: string;
  requestedBy: string;
  requestedRole: string;
  payload?: Record<string, unknown>;
  reason?: string;
}

export interface WorkflowRunDto {
  id: string;
  eventType: WorkflowEventTypeDto;
  status: WorkflowRunStatusDto;
  projectId: string;
  initiativeSlug?: string;
  requestedBy: string;
  requestedRole: string;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export interface WorkflowCallbackEvidenceDto {
  type: WorkflowCallbackEvidenceTypeDto;
  label: string;
  value: string;
}

export interface WorkflowCallbackErrorDto {
  code?: string;
  message: string;
  details?: string;
}

export interface WorkflowCallbackBlockerDto {
  reason: string;
  owner: string;
  severity: WorkflowCallbackBlockerSeverityDto;
  pmDecisionNeeded: string;
}

export interface WorkflowCallbackRequestDto {
  workflowRunId: string;
  issueId: string;
  taskId?: string;
  step: string;
  status: WorkflowCallbackStatusDto;
  resultSummary?: string;
  evidence?: WorkflowCallbackEvidenceDto[];
  error?: WorkflowCallbackErrorDto;
  blocker?: WorkflowCallbackBlockerDto;
  idempotencyKey: string;
  occurredAt: string;
}

export interface WorkflowCallbackStoredDto extends WorkflowCallbackRequestDto {
  payloadHash: string;
  acceptedAt: string;
}

export interface WorkflowCallbackResponseDto {
  accepted: boolean;
  workflowRunId?: string;
  status?: WorkflowCallbackStatusDto | "rejected";
  duplicate?: boolean;
  code?: "VALIDATION_ERROR" | "IDEMPOTENCY_CONFLICT" | "INVALID_TRANSITION";
  message?: string;
}

export interface AiMemoRequestDto {
  projectId: string;
  initiativeSlug: string;
  memoType: "technical_memo" | "risk_note" | "release_note";
  requestedBy: string;
  requestedRole: string;
  promptSummary: string;
  sourceRefs?: string[];
}

export interface AiMemoPlaceholderDto {
  id: string;
  projectId: string;
  initiativeSlug: string;
  memoType: AiMemoRequestDto["memoType"];
  status: AiMemoStatusDto;
  requestedBy: string;
  requestedRole: string;
  promptSummary: string;
  sourceRefs: string[];
  createdAt: string;
  updatedAt: string;
  note: string;
}

export interface SystemEventRequestDto {
  eventType: string;
  projectId?: string;
  initiativeSlug?: string;
  severity: SystemEventSeverityDto;
  actor: string;
  source: "backend" | "frontend" | "operator" | "system";
  summary: string;
  details?: Record<string, unknown>;
}

export interface SystemEventDto {
  id: string;
  eventType: string;
  projectId?: string;
  initiativeSlug?: string;
  severity: SystemEventRequestDto["severity"];
  actor: string;
  source: SystemEventRequestDto["source"];
  summary: string;
  createdAt: string;
  note: string;
}
