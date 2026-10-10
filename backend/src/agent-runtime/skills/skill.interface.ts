import type { AuthRoleDto } from "../../auth/auth.dto";
import type { AgentFailureOutcome } from "../agent-result";

export type SkillCategory = "intelligence" | "documentation" | "analysis" | "validation";
export type SkillRiskLevel = "low" | "medium" | "high";

export interface SkillExecutionContext {
  /** ID of the AgentRun this skill executes within */
  agentRunId: string;
  /** The project the agent run belongs to */
  projectId: string;
  /** Authenticated user who initiated the run */
  userId: string;
  /** User's system-wide role */
  userRole: AuthRoleDto;
  /** Step index in the current plan */
  stepIndex: number;
  /** Sanitized agent instruction for this step */
  instruction: string;
  /** Any extra context the runtime wants to pass (e.g. previous step outputs) */
  context?: Record<string, unknown>;
}

export interface AgentAiCallTrace {
  kind: "REAL_PROVIDER_CALL" | "PROVIDER_CALL_FAILED";
  providerId: string | null;
  modelId: string | null;
  correlationId: string | null;
  providerCallExecuted: boolean;
}

/** Thrown when a skill reports failure so the runtime can persist AI call metadata on ERROR. */
export class SkillExecutionFailedError extends Error {
  constructor(
    message: string,
    readonly aiCall?: AgentAiCallTrace,
    readonly failureCode?: AgentFailureOutcome
  ) {
    super(message);
    this.name = "SkillExecutionFailedError";
  }
}

/**
 * Whitelist-only AI call metadata for AgentRunEvent.payload.
 * Never copies credentials, headers, prompts, or other gateway fields.
 */
export function persistableAiCallTrace(trace: AgentAiCallTrace): AgentAiCallTrace {
  const providerId = typeof trace.providerId === "string" && trace.providerId.length > 0 ? trace.providerId : null;
  const modelId = typeof trace.modelId === "string" && trace.modelId.length > 0 ? trace.modelId : null;
  const correlationId =
    typeof trace.correlationId === "string" && trace.correlationId.length > 0 ? trace.correlationId : null;
  const providerCallExecuted = trace.kind === "REAL_PROVIDER_CALL" && trace.providerCallExecuted === true;
  return {
    kind: providerCallExecuted ? "REAL_PROVIDER_CALL" : "PROVIDER_CALL_FAILED",
    providerId,
    modelId,
    correlationId,
    providerCallExecuted
  };
}

export interface SkillExecutionResult {
  success: boolean;
  failureCode?: AgentFailureOutcome;
  output: unknown;
  /** Optional human-readable summary for the agent plan event log */
  summary?: string;
  /** Traceability for a real AI Gateway provider call, if this skill invoked one */
  aiCall?: AgentAiCallTrace;
  /** Any artifacts produced that should be saved as AgentArtifact records */
  artifacts?: Array<{
    title: string;
    artifactType: string;
    content: string;
    summary?: string;
    isCustomerSafe?: boolean;
  }>;
}

/**
 * SkillDefinition — the interface every built-in and custom skill MUST implement.
 *
 * Non-Negotiable Constraints:
 *  - isReadOnly: true  → skill MUST NOT perform git write, push, commit, or production deployment
 *  - requiresApproval: true → agent runtime MUST pause and create an AgentApproval before executing
 *  - All model inference MUST route through AiGatewayService, never direct provider calls
 */
export interface SkillDefinition {
  /** Unique stable identifier, e.g. "repo_snapshot_reader" */
  readonly id: string;
  /** Human-readable name shown in agent plan steps */
  readonly name: string;
  /** Category for capability grouping */
  readonly category: SkillCategory;
  /** Risk level: determines whether approval is needed */
  readonly riskLevel: SkillRiskLevel;
  /**
   * If true, the agent runtime MUST obtain an AgentApproval decision BEFORE executing this skill.
   * Skills with riskLevel "high" MUST set this to true.
   */
  readonly requiresApproval: boolean;
  /**
   * MUST be true for all built-in skills. A false value here would allow git writes or deployments,
   * which violates core architectural constraints and is therefore FORBIDDEN.
   */
  readonly isReadOnly: boolean;
  /** Minimum roles permitted to use this skill */
  readonly requiredRoles: readonly AuthRoleDto[];
  /** JSON schema describing the expected shape of SkillExecutionContext.context */
  readonly parametersSchema: Record<string, unknown>;
  /** Execute the skill and return a structured result */
  execute(input: SkillExecutionContext): Promise<SkillExecutionResult>;
}
