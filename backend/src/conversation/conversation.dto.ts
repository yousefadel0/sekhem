export interface CreateConversationDto {
  mode?: import("./conversation-mode").ConversationMode;
  projectId: string;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationDto {
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface PostMessageDto {
  /** Explicit command intent only; cwd and authority are resolved server-side. */
  terminalAction?: { executable: string; args: string[]; timeoutMs: number };
  transferToAgent?: boolean;
  runtimeEvidence?: import("../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference[];
  content: string;
  senderType?: "user" | "assistant" | "system";
  metadata?: Record<string, unknown>;
  triggerAgent?: boolean;
  chat?: boolean;
  attachmentIds?: string[];
}

export interface ConversationSummaryDto {
  mode?: import("./conversation-mode").ConversationMode;
  modeContext?: import("./conversation-mode").ConversationModeContext;
  id: string;
  projectId: string;
  userId: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
}

export interface ConversationDetailDto extends ConversationSummaryDto {
  messages: ConversationMessageDto[];
  agentRuns: ConversationAgentRunSummaryDto[];
  metadata: Record<string, unknown>;
}

export interface ConversationMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  attachments?: import("../attachment/attachment.dto").AttachmentDto[];
}

export interface ConversationAgentRunSummaryDto {
  workflowPause?: import("../agent-runtime/workflow-pause").WorkflowPause | null;
  workflowDecision?: import("../agent-runtime/execution/workflow-decision").WorkflowDecision | null;
  workflow?: import("./workflow-presentation.contract").DownstreamWorkflowView;
  execution?: import("../agent-runtime/execution/plan-execution-state").PlanExecutionView | null;
  planVersion?: number;
  inspection?: import("../agent-runtime/inspection/inspection.types").InspectionView | null;
  control?: import("../agent-runtime/tools/agent-control.contract").ControlSnapshot | null;
  id: string;
  conversationId: string;
  projectId: string;
  agentName: string;
  title: string;
  status: string;
  outcome?: import("../agent-runtime/agent-result").AgentOutcome | null;
  progressPercent: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  failureReason: string | null;
  presentation: import("../agent-runtime/understanding/agent-presentation").AgentPresentation;
  activity: Pick<import("../agent-runtime/agent-run.dto").AgentRunEventDto, "id" | "agentRunId" | "eventType" | "timestamp">[];
  artifacts: Pick<import("../agent-runtime/agent-run.dto").AgentArtifactDto, "id" | "title" | "artifactType" | "summary" | "version" | "createdAt">[];
  pendingApprovals: Pick<import("../agent-runtime/agent-run.dto").AgentApprovalDto, "id" | "approvalType" | "status" | "requiredRole" | "dueAt">[];
}

export interface TriggerAgentMessageResponseDto {
  conversationId: string;
  messageId: string;
  agentRunId: string;
  status: import("../agent-runtime/agent-run.dto").AgentRunStatus;
}

export interface ConversationTransferDto {
  kind: "AGENT_TRANSFER";
  conversationId: string;
  messageId: string;
  agentConversationId: string;
}
export type PostMessageResponseDto = ConversationMessageDto | TriggerAgentMessageResponseDto | ConversationTransferDto;
