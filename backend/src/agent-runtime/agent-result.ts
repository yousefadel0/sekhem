import type { AgentPlanningResult } from "./understanding/agent-understanding.types";

/** Result of an attempt, separate from the existing run lifecycle and plan schema. */
export type AgentFailureOutcome = "PROVIDER_FAILED" | "OUTPUT_TRUNCATED" | "INVALID_STRUCTURED_OUTPUT" | "FAILED" | "BLOCKED";
export type AgentOutcome = AgentFailureOutcome | "PLAN_READY" | "NEEDS_USER_INPUT" | "NEEDS_EVIDENCE" | "COMPLETED" | "CANCELLED" | "PAUSED";
export const isAgentFailureOutcome = (value: unknown): value is AgentFailureOutcome =>
  typeof value === "string" && ["PROVIDER_FAILED", "OUTPUT_TRUNCATED", "INVALID_STRUCTURED_OUTPUT", "FAILED", "BLOCKED"].includes(value);

export class AgentResultError extends Error {
  constructor(readonly outcome: AgentFailureOutcome) { super(outcome); }
}

export function planningOutcome(result: AgentPlanningResult): AgentOutcome {
  const issues = result.plan.validation.issues;
  const failure = issues.find(issue => isAgentFailureOutcome(issue.code));
  if (failure) return failure.code as AgentFailureOutcome;
  // Old records lost the exact cause. Do not invent a clarification requirement.
  if (issues.some(issue => issue.code === "STRUCTURED_OUTPUT_UNAVAILABLE")) return "FAILED";
  if (issues.some(issue => issue.code !== "NEEDS_INFORMATION")) return "INVALID_STRUCTURED_OUTPUT";
  if (result.plan.readiness === "PLAN_READY" && result.plan.validation.valid && result.plan.steps.length > 0) return "PLAN_READY";
  if (result.understanding.readiness === "NEEDS_EVIDENCE") return "NEEDS_EVIDENCE";
  if (["NEEDS_CLARIFICATION", "INSUFFICIENT_CONTEXT"].includes(result.understanding.readiness)) return "NEEDS_USER_INPUT";
  return "INVALID_STRUCTURED_OUTPUT";
}

/** Derived from persisted fields for detail, list and Conversation reloads alike. */
export function persistedRunOutcome(run: { status: string; failureReason?: string | null; plans?: Array<{ steps: unknown }> }): AgentOutcome | null {
  if (run.status === "CANCELLED" || run.status === "PAUSED") return run.status;
  if (run.status === "FAILED") return isAgentFailureOutcome(run.failureReason) ? run.failureReason : "FAILED";
  if (run.status !== "COMPLETED") return null;
  try {
    const value = run.plans?.[0]?.steps;
    const steps = typeof value === "string" ? JSON.parse(value) : value;
    const work = Array.isArray(steps) ? steps[0] : undefined;
    // Runtime-created runs become COMPLETED only after their durable receipt is
    // verified. Their exact user plan is no longer the final run outcome.
    if (work?.parameters?.runtimeAction === true || work?.parameters?.inspectionLoop === true) return "COMPLETED";
    if (work?.parameters?.planning) return planningOutcome(work.parameters.planning);
    return work?.planningOnly ? "FAILED" : "COMPLETED";
  } catch { return "FAILED"; }
}
