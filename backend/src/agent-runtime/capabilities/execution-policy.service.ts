import { Injectable } from "@nestjs/common";
import { boundedExecutionLimits } from "./execution-plane.limits";
import type { ExecutionPolicyDecision, ExecutionRequest } from "./execution-plane.types";

/** The sole policy decision point. 5D-A intentionally contains no allow rules. */
@Injectable()
export class ExecutionPolicyService {
  readonly policyVersion = "5d-a-deny-by-default";

  evaluate(request: ExecutionRequest): ExecutionPolicyDecision {
    const unsafe = request as Partial<ExecutionRequest>;
    const workspace = unsafe.workspace;
    const operation = unsafe.operation;
    const limits = boundedExecutionLimits(unsafe);
    const command = operation?.command ?? "";
    const argumentLength = operation?.arguments?.reduce((total, arg) => total + String(arg).length, 0) ?? 0;
    const malformed = !unsafe.capability || !unsafe.projectId || !unsafe.conversationId || !unsafe.agentRunId || !workspace?.workspaceId || !workspace.relativePath || !operation;
    const knownCapability = ["powershell.execute", "file.modify", "gitlab.mutate"].includes(unsafe.capability ?? "");
    const operationMatchesCapability = (unsafe.capability === "powershell.execute" && operation?.kind === "powershell") ||
      (unsafe.capability === "file.modify" && operation?.kind === "file-modification") ||
      (unsafe.capability === "gitlab.mutate" && operation?.kind === "gitlab-mutation");
    const reason = malformed ? "EXECUTION_REQUEST_INVALID"
      : !knownCapability ? "EXECUTION_CAPABILITY_UNKNOWN"
      : !operationMatchesCapability ? "EXECUTION_CAPABILITY_OPERATION_MISMATCH"
      : command.length + argumentLength > limits.commandLimitChars ? "EXECUTION_COMMAND_LIMIT_EXCEEDED"
      : /[\r\n;&|`]|\$\(|\$\{/.test(command) ? "EXECUTION_COMMAND_REJECTED"
      : "EXECUTION_NOT_ENABLED";
    return {
      allowed: false,
      reason,
      requiresApproval: knownCapability,
      capability: unsafe.capability ?? "unknown",
      limits,
      workspaceScope: { workspaceId: workspace?.workspaceId ?? "", relativePath: workspace?.relativePath ?? "" },
      policyVersion: this.policyVersion
    };
  }
}
