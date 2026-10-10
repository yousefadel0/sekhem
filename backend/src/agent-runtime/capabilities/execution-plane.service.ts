import { Injectable, Optional, Inject } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { WorkspacePathService } from "../../workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../../workspace-intelligence/security/workspace-security.service";
import { ExecutionExecutorRegistry } from "./execution-executor.registry";
import { ExecutionPolicyService } from "./execution-policy.service";
import type {
  ExecutionApprovalState,
  ExecutionContext,
  ExecutionPolicyDecision,
  ExecutionRequest,
  ExecutionResult
} from "./execution-plane.types";

/**
 * Deny-by-default foundation. This service is the only future route to an
 * executor, and its policy gate runs before executor resolution/invocation.
 */
@Injectable()
export class ExecutionPlaneService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cancelled = new Set<string>();

  constructor(
    private readonly policy: ExecutionPolicyService,
    private readonly executors: ExecutionExecutorRegistry,
    private readonly authorization: ResourceAuthorizationService,
    private readonly paths: WorkspacePathService,
    private readonly workspaceSecurity: WorkspaceSecurityService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService
  ) {}

  async request(request: ExecutionRequest): Promise<ExecutionResult> {
    const started = Date.now();
    let decision: ExecutionPolicyDecision;
    try {
      this.validateWorkspaceScope(request);
      await this.validateDurableScope(request);
      await this.authorization.assertAuthorized(request.subject, "EXECUTE", {
        resourceType: "AgentRun",
        id: request.agentRunId,
        projectId: request.projectId,
        organizationId: request.subject.organizationId,
        userId: request.subject.userId
      });
      decision = this.policy.evaluate(request);
    } catch (error) {
      decision = this.policy.evaluate(request);
      const result = this.blocked(request, decision, Date.now() - started, this.workspaceErrorCode(error) ?? "EXECUTION_ACCESS_DENIED");
      await this.record(request, "EXECUTION_BLOCKED", result);
      return result;
    }

    await this.record(request, "EXECUTION_REQUESTED", this.metadataOnlyResult(request, decision, "QUEUED", Date.now() - started));
    const approvalState = await this.resolveApprovalState(request, decision);
    if (!decision.allowed || approvalState !== "APPROVED") {
      const errorCode = !decision.allowed ? decision.reason : approvalState === "REJECTED" ? "EXECUTION_APPROVAL_REJECTED" : "EXECUTION_APPROVAL_REQUIRED";
      const result = this.blocked(
        request,
        decision,
        Date.now() - started,
        errorCode,
        decision.allowed && approvalState === "APPROVAL_REQUIRED"
      );
      await this.record(request, result.status === "AWAITING_APPROVAL" ? "EXECUTION_APPROVAL_REQUIRED" : "EXECUTION_BLOCKED", result);
      return result;
    }

    // Kept for future capability activation. With 5D-A policy this branch is unreachable.
    const executor = this.executors.resolve(request.capability);
    if (!executor) {
      const result = this.blocked(request, decision, Date.now() - started, "EXECUTION_EXECUTOR_UNAVAILABLE");
      await this.record(request, "EXECUTION_BLOCKED", result);
      return result;
    }
    const context: ExecutionContext = {
      request,
      policy: decision,
      approvalState,
      limits: decision.limits,
      workspace: decision.workspaceScope,
      isCancellationRequested: () => this.cancelled.has(request.executionId)
    };
    await this.record(request, "EXECUTION_STARTED", this.metadataOnlyResult(request, decision, "RUNNING", Date.now() - started));
    const result = await executor.execute(context);
    await this.record(request, result.status === "CANCELLED" ? "EXECUTION_CANCELLED" : result.status === "SUCCEEDED" ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED", result);
    return result;
  }

  /** Future executors can observe cancellation; 5D-A never terminates a process. */
  async cancel(executionId: string): Promise<{ executionId: string; status: "CANCELLED" }> {
    this.cancelled.add(executionId);
    return { executionId, status: "CANCELLED" };
  }

  private validateWorkspaceScope(request: ExecutionRequest): void {
    if (!request.workspace?.trustedRoot || !request.workspace?.workspaceId) throw new Error("EXECUTION_WORKSPACE_SCOPE_REQUIRED");
    const relativePath = this.paths.normalizeRelativePath(request.workspace.relativePath);
    const candidate = this.workspaceSecurity.resolveInsideRoot(request.workspace.trustedRoot, relativePath);
    if (this.workspaceSecurity.isEscapingSymlink(request.workspace.trustedRoot, candidate)) throw new Error("EXECUTION_WORKSPACE_SYMLINK_ESCAPE");
    const segments = relativePath.split("/");
    if (segments.some((segment) => this.workspaceSecurity.isForbiddenDirectoryName(segment))) throw new Error("EXECUTION_WORKSPACE_FORBIDDEN_PATH");
    if (this.workspaceSecurity.isSensitiveFile(this.paths.fileNameOf(relativePath))) throw new Error("EXECUTION_WORKSPACE_SENSITIVE_PATH");
  }

  /** If durable state is available, bind request identifiers to the persisted AgentRun. */
  private async validateDurableScope(request: ExecutionRequest): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentRun = (this.prisma as any)?.agentRun;
    if (!agentRun || typeof agentRun.findUnique !== "function") return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const run = await agentRun.findUnique({
      where: { id: request.agentRunId },
      select: { id: true, projectId: true, conversationId: true, userId: true }
    });
    if (!run || run.projectId !== request.projectId || run.conversationId !== request.conversationId || run.userId !== request.subject.userId) {
      throw new Error("EXECUTION_SCOPE_MISMATCH");
    }
  }

  private async resolveApprovalState(request: ExecutionRequest, decision: ExecutionPolicyDecision): Promise<ExecutionApprovalState> {
    if (!decision.requiresApproval) return "NO_APPROVAL";
    if (!request.approvalId || !this.prisma) return "APPROVAL_REQUIRED";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const approval = await this.prisma.agentApproval.findUnique({ where: { id: request.approvalId } }).catch(() => null);
    if (!approval || approval.agentRunId !== request.agentRunId) return "APPROVAL_REQUIRED";
    if (approval.decision === "REJECTED" || approval.status === "REJECTED") return "REJECTED";
    return approval.decision === "APPROVED" || approval.status === "APPROVED" ? "APPROVED" : "APPROVAL_REQUIRED";
  }

  private blocked(request: ExecutionRequest, policy: ExecutionPolicyDecision, durationMs: number, errorCode: string, awaitingApproval = false): ExecutionResult {
    return {
      ...this.metadataOnlyResult(request, policy, awaitingApproval ? "AWAITING_APPROVAL" : "BLOCKED", durationMs),
      errorCode,
      sanitizedError: this.safeMessage(errorCode)
    };
  }

  private metadataOnlyResult(request: ExecutionRequest, policy: ExecutionPolicyDecision, status: ExecutionResult["status"], durationMs: number): ExecutionResult {
    return {
      executionId: request.executionId,
      status,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs,
      timedOut: false,
      cancelled: false,
      truncated: false,
      artifacts: [],
      policy: { capability: policy.capability, policyVersion: policy.policyVersion, requiresApproval: policy.requiresApproval }
    };
  }

  private async record(request: ExecutionRequest, eventType: string, result: ExecutionResult): Promise<void> {
    if (!this.prisma) return;
    const details = {
      executionId: request.executionId,
      capability: request.capability,
      policyVersion: result.policy.policyVersion,
      policyRequiresApproval: result.policy.requiresApproval,
      workspaceId: request.workspace.workspaceId,
      relativePath: request.workspace.relativePath,
      status: result.status,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      truncated: result.truncated,
      errorCode: result.errorCode
    };
    const id = `ev_exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Existing AgentRun event stream; no output, command, trusted root, metadata, or secrets are persisted.
    // A partial Prisma test/durable binding may only provide AgentRun lookup; audit
    // delegates are optional in that narrow case and must never mask a block.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.prisma as any;
    if (db.agentRunEvent?.create) {
      await db.agentRunEvent.create({ data: { id, agentRunId: request.agentRunId, eventType, actor: "execution-plane", payload: details, timestamp: new Date() } }).catch(() => {});
    }
    if (db.agentAuditRecord?.create) {
      await db.agentAuditRecord.create({ data: { id: `audit_exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, agentRunId: request.agentRunId, projectId: request.projectId, eventType, actor: request.subject.userId, actorRole: request.subject.role, details, timestamp: new Date() } }).catch(() => {});
    }
  }

  private workspaceErrorCode(error: unknown): string | undefined {
    if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
    if (error instanceof Error && error.message.startsWith("EXECUTION_")) return error.message;
    return undefined;
  }

  private safeMessage(code: string): string {
    const messages: Record<string, string> = {
      EXECUTION_NOT_ENABLED: "This execution capability is not enabled.",
      EXECUTION_CAPABILITY_UNKNOWN: "This execution capability is not recognized.",
      EXECUTION_APPROVAL_REQUIRED: "Execution requires an approved authorization.",
      EXECUTION_APPROVAL_REJECTED: "Execution approval was rejected.",
      EXECUTION_ACCESS_DENIED: "You are not authorized to request execution.",
      EXECUTION_WORKSPACE_SCOPE_REQUIRED: "A valid workspace scope is required."
    };
    return messages[code] ?? "The execution request was blocked by policy.";
  }
}
