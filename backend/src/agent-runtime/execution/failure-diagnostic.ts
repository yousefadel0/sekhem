import { createHash } from "node:crypto";
import type { RuntimeExecution } from "../../trusted-runtime/runtime.contract";
import type { PlanExecutionState } from "./plan-execution-state";
import type { StepObservation } from "./step-observation";
import { toolDigest } from "../tools/tool-contract";

export interface FailureDiagnostic {
  version: 1; id: string; observationId: string; stepId: string; action: StepObservation["action"];
  classification: "EXPECTED_CHANGE_NOT_OBSERVED" | "READ_BACK_MISMATCH" | "EXECUTION_FAILURE_CAUSE_UNKNOWN";
  status: "GROUNDED" | "UNCERTAIN"; confidence: "HIGH" | "UNKNOWN";
  uncertainty: "NONE" | "CAUSE_OR_SAFE_CORRECTION_NOT_ESTABLISHED";
  scope: { workspaceId: string; bindingVersion: number; path: string };
  sourcePlan: { id: string; version: number; digest: string };
  evidenceRefs: string[];
  fixProposal?: { id: string; kind: "REPLAN_ORIGINAL_BOUNDED_CHANGE"; objective: string;
    before: string; after: string; authorization: "NOT_GRANTED"; executionEnabled: false;
    requiredPipeline: readonly ["PLAN", "EXACT_PROPOSAL", "APPROVAL", "PERMIT", "EXECUTION", "READ_BACK", "VERIFICATION"] };
}

/** Internal receipt-settlement projection. No provider calls, dispatch or authority. */
export function diagnoseFailure(s: PlanExecutionState, o: StepObservation, receipt: RuntimeExecution): FailureDiagnostic | undefined {
  if (o.outcome !== "FAILED") return undefined;
  const action = s.actions.find(a => a.stepId === o.stepId);
  if (!action || receipt.attribution.executionId !== o.receiptId || receipt.attribution.agentRunId !== s.runId ||
      receipt.attribution.planId !== s.planId || receipt.attribution.planVersion !== s.planVersion ||
      receipt.attribution.planStepId !== action.stepId || receipt.attribution.tool !== action.tool ||
      toolDigest(receipt.attribution.validatedInput) !== toolDigest(action.input)) return undefined;
  const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
  const write = s.actions.filter(a => a.tool === "filesystem.write" && a.relativePath === action.relativePath);
  const w = write.length === 1 ? write[0] : undefined;
  const result = receipt.result;
  // Only the precise unchanged preimage case supports a bounded corrective proposal.
  // A mismatch alone never establishes its cause or authorizes a replacement.
  const grounded = o.uncertainty === "READ_BACK_MISMATCH" && action.tool === "filesystem.read" &&
    receipt.state === "SUCCEEDED" && receipt.verificationState === "VERIFIED" && result?.truncated === false &&
    typeof result.stdout === "string" && !!w?.change && !!s.completed[w.stepId] &&
    w.change.before.length > 0 && w.change.before.length + w.change.after.length <= 8192 &&
    hash(result.stdout) === w.change.originalHash && result.stdout.includes(w.change.before) &&
    typeof w.input.content === "string" && hash(w.input.content) === w.change.updatedHash &&
    w.input.expectedSha256 === w.change.originalHash && action.expectedAfterHash === w.change.updatedHash &&
    result.stdout.split(w.change.before).length === 2 &&
    result.stdout.replace(w.change.before, w.change.after) === w.input.content;
  const id = `failure_diagnostic_${toolDigest([s.runId, o.id])}`;
  return { version: 1, id, observationId: o.id, stepId: action.stepId, action: action.tool,
    classification: grounded ? "EXPECTED_CHANGE_NOT_OBSERVED" : o.uncertainty === "READ_BACK_MISMATCH" ? "READ_BACK_MISMATCH" : "EXECUTION_FAILURE_CAUSE_UNKNOWN",
    status: grounded ? "GROUNDED" : "UNCERTAIN", confidence: grounded ? "HIGH" : "UNKNOWN",
    uncertainty: grounded ? "NONE" : "CAUSE_OR_SAFE_CORRECTION_NOT_ESTABLISHED",
    scope: { workspaceId: s.workspace.workspaceId, bindingVersion: s.workspace.version, path: action.relativePath },
    sourcePlan: { id: s.planId, version: s.planVersion, digest: s.planDigest },
    evidenceRefs: [...o.evidenceRefs, ...(grounded ? [`runtime:${s.completed[w!.stepId].receiptId}`] : [])],
    ...(grounded ? { fixProposal: { id: `fix_proposal_${toolDigest([id, w!.change])}`, kind: "REPLAN_ORIGINAL_BOUNDED_CHANGE" as const,
      objective: `Review a fresh plan to apply only the original bounded change in ${action.relativePath}; preserve all other content. Fresh source certification and the existing exact proposal, approval and permit stages are required.`,
      before: w!.change!.before, after: w!.change!.after, authorization: "NOT_GRANTED" as const, executionEnabled: false as const,
      requiredPipeline: ["PLAN", "EXACT_PROPOSAL", "APPROVAL", "PERMIT", "EXECUTION", "READ_BACK", "VERIFICATION"] as const } } : {}) };
}
