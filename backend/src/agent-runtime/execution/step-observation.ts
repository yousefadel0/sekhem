import type { RuntimeExecution } from "../../trusted-runtime/runtime.contract";
import type { ExactPlanAction } from "./plan-execution-state";
import { toolDigest } from "../tools/tool-contract";

/** A receipt observation is not model prose or new execution authority. */
export interface StepObservation {
  version: 1;
  id: string;
  stepId: string;
  action: ExactPlanAction["tool"];
  receiptId: string;
  executionStatus: RuntimeExecution["state"];
  verificationStatus: RuntimeExecution["verificationState"];
  evidenceRefs: string[];
  outcome: "VERIFIED" | "FAILED" | "UNCERTAIN";
  uncertainty: "NONE" | "SCOPE_MISMATCH" | "READ_BACK_MISMATCH" | "VERIFICATION_NOT_CONFIRMED" | "EXECUTION_FAILED";
  next: "CONTINUE" | "STOP";
  testResult?: "PASS" | "FAILED" | "UNCERTAIN";
}

/** Called only from authoritative receipt settlement, after existing scope/hash checks. */
export function observeStep(action: ExactPlanAction, receipt: RuntimeExecution, scopeMatches: boolean, matchesResult: boolean): StepObservation {
  const uncertainty: StepObservation["uncertainty"] = !scopeMatches ? "SCOPE_MISMATCH" : !matchesResult ? "READ_BACK_MISMATCH" :
    receipt.state === "FAILED" || receipt.verificationState === "FAILED" ? "EXECUTION_FAILED" :
    receipt.state !== "SUCCEEDED" || receipt.verificationState !== "VERIFIED" || receipt.cancellationState !== "NONE"
      ? "VERIFICATION_NOT_CONFIRMED" : "NONE";
  const outcome = uncertainty === "NONE" ? "VERIFIED" :
    ["EXECUTION_FAILED", "READ_BACK_MISMATCH"].includes(uncertainty) ? "FAILED" : "UNCERTAIN";
  return { version: 1, id: `step_observation_${toolDigest([receipt.attribution.agentRunId, action.stepId, receipt.attribution.executionId])}`,
    stepId: action.stepId, action: action.tool, receiptId: receipt.attribution.executionId,
    executionStatus: receipt.state, verificationStatus: receipt.verificationState,
    evidenceRefs: [`runtime:${receipt.attribution.executionId}`], outcome, uncertainty,
    next: outcome === "VERIFIED" ? "CONTINUE" : "STOP",
    ...(action.tool === "filesystem.read" && action.expectedAfterHash ? {
      testResult: outcome === "VERIFIED" ? "PASS" as const : outcome === "FAILED" ? "FAILED" as const : "UNCERTAIN" as const
    } : {}) };
}
