import type { AuthRoleDto } from "../../auth/auth.dto";

/** Capabilities are deliberately declared separately from executor implementations. */
export const RESERVED_EXECUTION_CAPABILITIES = ["powershell.execute", "file.modify", "gitlab.mutate"] as const;
export type ExecutionCapability = (typeof RESERVED_EXECUTION_CAPABILITIES)[number];
export type ExecutionStatus = "QUEUED" | "BLOCKED" | "AWAITING_APPROVAL" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED";
export type ExecutionApprovalState = "NO_APPROVAL" | "APPROVAL_REQUIRED" | "APPROVED" | "REJECTED";

export interface ExecutionLimits {
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  artifactLimitBytes: number;
  commandLimitChars: number;
  concurrentExecutionsPerScope: number;
}

/** This scope is server-created; trustedRoot is never returned or logged. */
export interface ExecutionWorkspaceScope {
  workspaceId: string;
  trustedRoot: string;
  relativePath: string;
}

export interface ExecutionSubject {
  userId: string;
  email: string;
  displayName: string;
  role: AuthRoleDto;
  organizationId?: string;
  isSystemAdmin: boolean;
}

/** Structured future request payload; it is never passed to a shell in 5D-A. */
export interface ExecutionOperation {
  kind: "powershell" | "file-modification" | "gitlab-mutation";
  command?: string;
  arguments?: string[];
}

export interface ExecutionRequest {
  executionId: string;
  subject: ExecutionSubject;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  capability: string;
  workspace: ExecutionWorkspaceScope;
  operation: ExecutionOperation;
  timeoutMs?: number;
  stdoutLimitBytes?: number;
  stderrLimitBytes?: number;
  approvalId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPolicyDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  capability: string;
  limits: ExecutionLimits;
  workspaceScope: { workspaceId: string; relativePath: string };
  policyVersion: string;
}

export interface ExecutionContext {
  request: ExecutionRequest;
  policy: ExecutionPolicyDecision;
  approvalState: ExecutionApprovalState;
  limits: ExecutionLimits;
  workspace: { workspaceId: string; relativePath: string };
  isCancellationRequested: () => boolean;
}

export interface ExecutionArtifactDescriptor {
  title: string;
  artifactType: string;
  truncated: boolean;
  sizeBytes: number;
}

export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  artifacts: ExecutionArtifactDescriptor[];
  errorCode?: string;
  sanitizedError?: string;
  policy: Pick<ExecutionPolicyDecision, "capability" | "policyVersion" | "requiresApproval">;
}

export interface ExecutionExecutor {
  readonly capability: ExecutionCapability;
  execute(context: ExecutionContext): Promise<ExecutionResult>;
  cancel?(executionId: string): Promise<void>;
}

export class ExecutionNotEnabledError extends Error {
  readonly code = "EXECUTION_NOT_ENABLED";
  constructor(capability: string) {
    super(`${capability} is not enabled in the current execution plane.`);
    this.name = "ExecutionNotEnabledError";
  }
}

/** Compatibility alias for the 5C contract. */
export class ExecutionNotImplementedError extends ExecutionNotEnabledError {
  constructor() { super("powershell.execute"); }
}
