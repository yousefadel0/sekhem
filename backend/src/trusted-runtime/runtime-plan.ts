import type { AgentPlanningResult } from "../agent-runtime/understanding/agent-understanding.types";
import type { RuntimeProposal, RuntimeTool } from "./runtime.contract";

/** Explicit user-authored action plan. No model text is parsed into commands,
 * no evidence is invented, and this plan grants no execution authority. */
export function exactRuntimePlan(projectId: string, tool: RuntimeTool, input: Record<string, unknown>, purpose: string, risk: RuntimeProposal["risk"]): AgentPlanningResult {
  const effect: RuntimeProposal["effect"] = tool === "terminal.execute" ? "EXECUTE" : tool === "filesystem.delete" ? "DESTRUCTIVE" : ["filesystem.read", "filesystem.list", "filesystem.search"].includes(tool) ? "READ_ONLY" : "WRITE";
  const criteria = [{ id: "runtime_result", description: "The authenticated runtime reports the exact operation and deterministic verification succeeds.", source: "RUNTIME" as const }];
  return { version: 1, understanding: { intent: ["PLAN", effect === "READ_ONLY" ? "INSPECT" : effect === "EXECUTE" ? "EXECUTE" : "MODIFY"], objective: purpose,
    scope: [{ id: "project", kind: "PROJECT", reference: projectId, evidenceRefs: [] }], constraints: [], expectedOutcome: { description: purpose, source: "USER" }, successCriteria: criteria,
    facts: [], inferences: [], hypotheses: [], unknowns: [], evidenceRefs: [], evidenceGaps: [], confidence: "HIGH", readiness: "UNDERSTANDING_READY" },
    plan: { objective: purpose, assumptions: [], constraints: [], steps: [{ id: "exact_action", objective: purpose, capability: tool, input, expectedResult: criteria[0].description,
      dependencies: [], status: "PLANNED", verificationRequired: true, type: effect === "READ_ONLY" ? "INSPECT" : "IMPLEMENT", purpose, requiredEvidence: [], missingInformationIds: [],
      scopeRefs: ["project"], effect, risk, verification: { status: "PLANNED", criterionIds: ["runtime_result"] } }], missingInformation: [],
      stopConditions: ["Missing current human approval", "Changed plan, input, runtime, grant or authorization", "Uncertain execution outcome"], successCriteria: criteria,
      readiness: "PLAN_READY", authorization: "NOT_GRANTED", validation: { valid: true, issues: [] } } };
}
