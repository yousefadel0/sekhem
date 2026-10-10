import { PLANNING_LIMITS } from "./agent-planning.contract";
import type { AgentPlanningResult } from "./agent-understanding.types";

// Only bounded requirement text enters this diagnostic. Never pass prompts, source
// bodies, provider responses or exceptions. Withhold suspicious fields as a whole.
function safeText(value: string, limit: number = PLANNING_LIMITS.text): string {
  if (typeof value !== "string" || value.length > limit || /[\x00-\x1f]|```|https?:\/\/|\bBearer\s|-----BEGIN|\beyJ[\w-]+\.|\b(?:sk-|ghp_|github_pat_|AKIA)[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:password|secret|token|api[-_ ]?key|authorization|cookie)\s*[=:]|[A-Za-z0-9_+/=-]{48,}/i.test(value)) return "[redacted]";
  return value;
}

/** Projection of the strict result, not a second readiness/resolution mechanism. */
export function planningReadinessDiagnostic(result: AgentPlanningResult, contextIds: string[], modelIds: string[], evaluated: boolean) {
  const missingIds = new Set(result.plan.missingInformation.map(item => item.id));
  const retained = [...result.plan.missingInformation,
    ...(result.planningInformation ?? []).filter(item => !missingIds.has(item.id))];
  const requirements = retained.slice(0, PLANNING_LIMITS.items).map(item => ({
    id: safeText(item.id, 64), description: safeText(item.description), whyNeeded: safeText(item.whyNeeded),
    status: item.state, severity: item.severity,
    classification: result.planningInformation?.find(info => info.id === item.id)?.classification ?? "REQUIRED_FOR_PLAN" as const,
    source: contextIds.includes(item.id) ? "REQUEST_CONTEXT" as const : modelIds.includes(item.id) ? "MODEL" as const : "PLANNING_VALIDATION" as const,
    affectedStepIds: result.plan.steps.filter(step => step.missingInformationIds.includes(item.id)).slice(0, PLANNING_LIMITS.items).map(step => safeText(step.id, 64)),
    blocking: item.state === "UNKNOWN" && missingIds.has(item.id),
    // No resolution certificate exists in this contract. Never infer satisfaction
    // from an evidence ID, similar prose, severity or the absence of step links.
    resolvedByExistingEvidence: item.state === "UNKNOWN" ? false : null
  }));
  const groundingFailed = result.plan.validation.issues.some(issue => ["UNSUPPORTED_FACT", "UNSUPPORTED_INFERENCE", "UNKNOWN_EVIDENCE", "FACT_REQUIRED", "UNGROUNDED_STEP", "EVIDENCE_OUTSIDE_SCOPE"].includes(issue.code));
  return {
    version: 1 as const, readiness: result.plan.readiness,
    understandingReadiness: result.understanding.readiness,
    blockingRequirementIds: requirements.filter(item => item.blocking).map(item => item.id), requirements,
    validator: { valid: result.plan.validation.valid,
      issues: result.plan.validation.issues.slice(0, PLANNING_LIMITS.issues).map(issue => ({ code: safeText(issue.code, 64), path: safeText(issue.path, 128),
        ...(issue.stringDiagnostic ? { stringDiagnostic: { presence: issue.stringDiagnostic.presence, valueKind: issue.stringDiagnostic.valueKind,
          ...(issue.stringDiagnostic.trimmedEmpty !== undefined ? { trimmedEmpty: issue.stringDiagnostic.trimmedEmpty } : {}),
          ...(issue.stringDiagnostic.characterCount !== undefined ? { characterCount: issue.stringDiagnostic.characterCount } : {}) } } : {}) })) },
    groundingStatus: !evaluated ? "NOT_EVALUATED" as const : groundingFailed ? "REJECTED" as const :
      result.understanding.facts.length ? "VERIFIED_SOURCE_EXCERPTS" as const : "NO_VERIFIED_FACTS" as const
  };
}
export type PlanningReadinessDiagnostic = ReturnType<typeof planningReadinessDiagnostic>;
