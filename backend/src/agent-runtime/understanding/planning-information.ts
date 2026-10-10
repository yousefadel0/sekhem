import type { AgentPlanningProposal } from "./agent-planning.contract";

/** Classify only schema-checked engineering proposals. This never resolves an
 * unknown or grants authority. Step prerequisites cannot be labelled away.
 * LIMITATION != REQUIRED_FOR_PLAN and FUTURE_EXECUTION_PREREQUISITE != CURRENT_PLANNING_BLOCKER.
 * A step mentioning a limitation in prose does not make it a prerequisite.
 * An unknown becomes REQUIRED_FOR_PLAN only when genuinely required by a step via missingInformationIds. */
export function classifyPlanningInformation(proposal: AgentPlanningProposal) {
  return proposal.unknowns.map(item => {
    const affectedStepIds = proposal.steps.filter(step => step.missingInformationIds.includes(item.id)).map(step => step.id);
    const declaredClassification = item.classification ?? "REQUIRED_FOR_PLAN";
    const classification = affectedStepIds.length ? "REQUIRED_FOR_PLAN" as const : declaredClassification;
    return {
      ...item, state: "UNKNOWN" as const, declaredClassification, classification,
      affectedStepIds, blocking: classification === "REQUIRED_FOR_PLAN"
    };
  });
}
export type PlanningInformation = ReturnType<typeof classifyPlanningInformation>[number];
