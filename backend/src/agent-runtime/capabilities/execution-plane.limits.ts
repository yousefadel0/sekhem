import type { ExecutionLimits, ExecutionRequest } from "./execution-plane.types";

/** Server-side ceilings. Request values can only be reduced, never raised. */
export const EXECUTION_PLANE_LIMITS: ExecutionLimits = {
  timeoutMs: 30_000,
  stdoutLimitBytes: 64 * 1024,
  stderrLimitBytes: 32 * 1024,
  artifactLimitBytes: 128 * 1024,
  commandLimitChars: 4_096,
  concurrentExecutionsPerScope: 1
};

export function boundedExecutionLimits(request: Pick<ExecutionRequest, "timeoutMs" | "stdoutLimitBytes" | "stderrLimitBytes">): ExecutionLimits {
  return {
    ...EXECUTION_PLANE_LIMITS,
    timeoutMs: boundedPositive(request.timeoutMs, EXECUTION_PLANE_LIMITS.timeoutMs),
    stdoutLimitBytes: boundedPositive(request.stdoutLimitBytes, EXECUTION_PLANE_LIMITS.stdoutLimitBytes),
    stderrLimitBytes: boundedPositive(request.stderrLimitBytes, EXECUTION_PLANE_LIMITS.stderrLimitBytes)
  };
}

/**
 * Shared future-executor output boundary. It operates on bytes, returns safe
 * UTF-8 text, and makes truncation explicit rather than leaking unbounded output
 * into an AgentRun event, audit record, artifact, or model context.
 */
export function boundedExecutionOutput(value: Buffer | string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  if (buffer.length <= maxBytes) return { text: buffer.toString("utf8"), truncated: false };
  return { text: buffer.subarray(0, Math.max(0, maxBytes)).toString("utf8"), truncated: true };
}

function boundedPositive(value: number | undefined, maximum: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return maximum;
  return Math.min(Math.floor(value), maximum);
}
