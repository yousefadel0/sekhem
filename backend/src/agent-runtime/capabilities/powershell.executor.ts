import { Injectable } from "@nestjs/common";
import type { ExecutionContext, ExecutionExecutor, ExecutionResult } from "./execution-plane.types";

/** Architectural placeholder only. It never imports or invokes a process API. */
@Injectable()
export class PowerShellExecutor implements ExecutionExecutor {
  readonly capability = "powershell.execute" as const;

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    return {
      executionId: context.request.executionId,
      status: "BLOCKED",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      cancelled: false,
      truncated: false,
      artifacts: [],
      errorCode: "EXECUTION_NOT_ENABLED",
      sanitizedError: "PowerShell execution is not enabled.",
      policy: {
        capability: context.policy.capability,
        policyVersion: context.policy.policyVersion,
        requiresApproval: context.policy.requiresApproval
      }
    };
  }
}
