export const AGENT_INITIATIVE_STATUSES = ["DRAFT", "PROPOSED", "APPROVED", "ACTIVE", "PAUSED", "BLOCKED", "COMPLETED", "REJECTED", "SUPERSEDED"] as const;
export const AGENT_INITIATIVE_TASK_STATUSES = ["TODO", "READY", "RUNNING", "PAUSED", "BLOCKED", "FAILED", "VERIFIED", "DONE", "CANCELED"] as const;

export interface AgentInitiativePlanStepInput {
  title: string;
  description?: string;
  evidence?: string[];
}

export interface CreateAgentInitiativeDto {
  projectId: string;
  workspaceId?: string;
  conversationId?: string;
  title: string;
  objective: string;
  problem?: string;
  scope?: Record<string, unknown>;
  constraints?: string[];
  /** Provenance/metadata only; extracted contents never become initiative state. */
  evidence?: Array<{ provenance: string; sourceType: string; reference?: string; warnings?: string[]; truncated?: boolean }>;
  architecture?: Record<string, unknown>;
  plan?: AgentInitiativePlanStepInput[];
  risks?: string[];
  dependencies?: string[];
  successCriteria?: string[];
  propose?: boolean;
}

export interface CreateAgentInitiativeVersionDto {
  architecture?: Record<string, unknown>;
  plan?: AgentInitiativePlanStepInput[];
  evidence?: Array<{ provenance: string; sourceType: string; reference?: string; warnings?: string[]; truncated?: boolean }>;
  risks?: string[];
  dependencies?: string[];
  successCriteria?: string[];
  decisionSummary?: string;
}

export interface DecideAgentInitiativeVersionDto {
  notes?: string;
}

export interface UpdateAgentInitiativeTaskDto {
  status: (typeof AGENT_INITIATIVE_TASK_STATUSES)[number];
  verification?: Record<string, unknown>;
}

export interface TransitionAgentInitiativeDto {
  status: (typeof AGENT_INITIATIVE_STATUSES)[number];
  notes?: string;
}
