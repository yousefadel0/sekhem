import type { AuthRoleDto } from "../auth/auth.dto";
import type { ToolApprovalBinding } from "./tools/tool-contract";

// ---------------------------------------------------------------------------
// Agent Run Lifecycle DTOs
// ---------------------------------------------------------------------------

export interface StartAgentRunDto {
  runtimeEvidence?: import("../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference[];
  conversationId?: string;
  projectId: string;
  instruction: string;
  title?: string;
  /** Conversation-scoped attachment identifiers; never storage keys or paths. */
  attachmentIds?: string[];
}

export interface AgentRunSummaryDto {
  execution?: import("./execution/plan-execution-state").PlanExecutionView | null;
  id: string;
  conversationId: string;
  projectId: string;
  userId: string;
  agentName: string;
  title: string;
  status: AgentRunStatus;
  outcome?: import("./agent-result").AgentOutcome | null;
  planVersion: number;
  currentStepIndex: number;
  progressPercent: number;
  pausedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunDetailDto extends AgentRunSummaryDto {
  runtimeActionReceipt?: { id: string; state: string; verificationState: string; target: string } | null;
  workflowDecision?: import("./execution/workflow-decision").WorkflowDecision | null;
  workflowPause?: import("./workflow-pause").WorkflowPause | null;
  inspection?: import("./inspection/inspection.types").InspectionView | null;
  control?: import("./tools/agent-control.contract").ControlSnapshot | null;
  presentation?: import("./understanding/agent-presentation").AgentPresentation;
  plans: AgentPlanDto[];
  pendingApprovals: AgentApprovalDto[];
}

// ---------------------------------------------------------------------------
// Agent Plan DTOs
// ---------------------------------------------------------------------------

export interface AgentPlanStep {
  /** Server-created planning work item, never dispatched to the skill registry. */
  planningOnly?: true;
  index: number;
  title: string;
  description: string;
  skillId: string;
  parameters?: Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface AgentPlanDto {
  id: string;
  agentRunId: string;
  version: number;
  summary: string;
  steps: AgentPlanStep[];
  requiresApproval: boolean;
  status: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Agent Run Event DTOs
// ---------------------------------------------------------------------------

export type AgentRunEventType =
  | "INSPECTION_STATE_CHANGED"
  | "UNDERSTANDING_CHECKPOINT"
  | "PLAN_READY" | "DECISION_STARTED" | "ACTION_PROPOSED" | "AUTHORIZATION_PENDING" | "AUTHORIZATION_EVALUATED"
  | "APPROVED" | "REVALIDATION_STARTED" | "REVALIDATION_FAILED" | "EXECUTION_INTENT_CREATED" | "CONTROL_STATE_CHANGED"
  | "THOUGHT"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "STATUS_CHANGE"
  | "ERROR"
  | "LOG"
  | "PROGRESS"
  | "STEERING_SUBMITTED"
  | "STEERING_CONSUMED"
  | "EXECUTION_REQUESTED"
  | "EXECUTION_BLOCKED"
  | "EXECUTION_APPROVAL_REQUIRED"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELLED"
  | "UNDERSTANDING_STARTED"
  | "CONTEXT_RESOLVED"
  | "EVIDENCE_REQUESTED"
  | "EVIDENCE_COLLECTED"
  | "PLAN_CREATED"
  | "PLAN_VALIDATED"
  | "TOOL_REQUESTED"
  | "TOOL_AUTHORIZATION_CHECKED"
  | "TOOL_BLOCKED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_DENIED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_CANCELLED"
  | "CAPABILITY_SELECTED"
  | "VERIFICATION_REQUIRED"
  | "PLAN_EXECUTION_REQUESTED"
  | "PLAN_EXECUTION_BLOCKED"
  | "PLAN_EXECUTION_COMPLETED"
  | "PLAN_EXECUTION_FAILED"
  | "PLAN_EXECUTION_CANCELLED"
  | "WORKFLOW_PAUSE_REQUESTED"
  | "WORKFLOW_PAUSED"
  | "WORKFLOW_RESUMED"
  | "WORKFLOW_REJECTED"
  | "WORKFLOW_SKIPPED"
  | "STEP_COMPLETED"
  | "UNDERSTANDING_COMPLETED";

export interface AgentRunEventDto {
  id: string;
  agentRunId: string;
  stepIndex: number | null;
  eventType: AgentRunEventType;
  actor: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Agent Approval DTOs
// ---------------------------------------------------------------------------

export type ApprovalDecision = "APPROVED" | "REJECTED" | "MODIFIED";

export interface AgentApprovalDto {
  id: string;
  agentRunId: string;
  approvalType: string;
  status: string;
  requestedBy: string;
  requiredRole: AuthRoleDto;
  decidedBy: string | null;
  decision: string | null;
  notes: string | null;
  revisedPlan: AgentPlanStep[] | ToolApprovalBinding | null;
  dueAt: Date | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface DecideApprovalDto {
  decision: ApprovalDecision;
  notes?: string;
  /** If decision = MODIFIED, provide the revised plan steps */
  revisedPlan?: AgentPlanStep[];
}

// ---------------------------------------------------------------------------
// Agent Artifact DTOs
// ---------------------------------------------------------------------------

export interface AgentArtifactDto {
  id: string;
  agentRunId: string;
  projectId: string;
  title: string;
  artifactType: string;
  content: string;
  summary: string | null;
  isCustomerSafe: boolean;
  version: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Control DTOs
// ---------------------------------------------------------------------------

export interface PauseRunDto {
  requestId?: string; expectedRevision?: number;
  reason?: string;
}

export interface CancelRunDto {
  reason?: string;
}

export interface SendFeedbackDto {
  instruction: string;
}

// ---------------------------------------------------------------
// Steering DTO
// ---------------------------------------------------------------
export interface SteerRunDto {
  instruction: string;
}

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

export type AgentRunStatus =
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
