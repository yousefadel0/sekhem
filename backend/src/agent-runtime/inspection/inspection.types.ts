import type { WorkspaceBinding, RuntimeEvidenceReference, RuntimeEvidenceRequest } from "../../workspace-intelligence/workspace-runtime.contract";
import type { AgentPlanningResult, AgentUnderstanding } from "../understanding/agent-understanding.types";
import type { EvidenceReceipt } from "../understanding/agent-presentation";

export type InspectionTool = "filesystem.list" | "filesystem.read" | "filesystem.search";
export type InspectionState = "REQUESTED" | "UNDERSTANDING" | "INSPECTION_PLANNED" | "ACTION_PROPOSED" | "AUTHORIZATION_PENDING" |
  "AWAITING_APPROVAL" | "AWAITING_INPUT" | "APPROVED" | "REVALIDATING" | "EXECUTING" | "OBSERVING" | "VERIFYING" | "NEEDS_MORE_EVIDENCE" | "REPORTING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export interface InspectionUnderstanding {
  grounding?: import("./inspection-grounding").InspectionGrounding;
  version: 1; sequence: number; understanding: AgentUnderstanding;
  evidence: EvidenceReceipt[];
  status: "INTERMEDIATE" | "GROUNDED" | "PARTIAL";
  /** Observations at receipt time, not a guarantee of current workspace contents. */
  observedAt: string;
}
export interface InspectionAction { tool: InspectionTool; relativePath: string; query?: string; purpose: string }
export interface InspectionOperation {
  workspaceRead?: import("../../trusted-runtime/runtime.contract").WorkspaceReadCoverage;
  planVersion: number; request: RuntimeEvidenceRequest; action: InspectionAction; proposalId: string; approvalId: string;
  fingerprint: string; state: string; receiptId?: string; verification?: "VERIFIED"; evidence?: RuntimeEvidenceReference;
}
export interface InspectionLoop {
  /** Original user engineering intent, not evidence or execution authority.
   * The existing planning attempt owns reservation/idempotency and plan state. */
  planningContinuation?: { objective: string; originatingMessageId: string; requestId: string;
    result?: { runId: string; planId: string; version: number; status: string }; blocked?: boolean };
  correctiveAttempts?: number;
  /** Sanitized output feedback only; never evidence or operation authority. One retry per run. */
  reportCorrection?: { field: string; attempts: 1; pending?: boolean; issues?: Array<{ path: string; reason: string; maxLength?: number }> };
  reviewContinuation?: { attempts: number; gaps: string[] };
  pendingConversation?: boolean;
  /** Conversation context only; never authorization, a receipt, or grounded evidence. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  originatingMessageId?: string;
  version: 1; runId: string; conversationId: string; projectId: string; userId: string; organizationId: string;
  session: { id: string; issuedAt: number; expiresAt: number }; objective: string; binding: WorkspaceBinding;
  state: InspectionState; code: string; iterations: number; maxIterations: number; references: RuntimeEvidenceReference[];
  operations: InspectionOperation[]; current: InspectionOperation | null; attachmentIds: string[];
  modelAttempt: { id: string; expiresAt: number } | null; planning: AgentPlanningResult | null;
  reasoningRequest?: { modelAttemptId: string; requestId: string; startedAt?: number; deadlineAt: number; attempts: number;
    terminalReason?: import("../../ai-gateway/inspection-reasoning-retry").ReasoningTerminalReason };
  understanding?: InspectionUnderstanding;
}

export interface InspectionView {
  reasoning?: { startedAt: number; deadlineAt: number; attempts: number };
  state: InspectionState; code: string; iterations: number; maxIterations: number;
  workspace: { workspaceId: string; bindingVersion: number; name: string; runtimeId: string };
  current: InspectionOperation | null; operations: InspectionOperation[]; planning: AgentPlanningResult | null;
  evidence: RuntimeEvidenceReference[]; executionVerified: number; objectiveGrounded: boolean;
  understanding?: InspectionUnderstanding;
}
