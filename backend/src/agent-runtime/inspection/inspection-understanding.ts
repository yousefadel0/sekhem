import { RECOMMENDATION_REJECTION_REASONS } from "../../conversation/recommendation.contract";
import { BadRequestException } from "@nestjs/common";
import { evidenceReceipt } from "../understanding/agent-presentation";
import { PLANNING_LIMITS, validateUnderstandingProposal, type AgentUnderstandingProposal, type StringPredicateDiagnostic } from "../understanding/agent-planning.contract";
import { INSPECTION_RESOURCE_LIMITS, isBroadWorkspaceReview, type AgentContext, type AgentUnderstanding, type UnderstandingGroundingDiagnostic } from "../understanding/agent-understanding.types";
import type { InspectionUnderstanding } from "./inspection.types";
import { groundingMessage } from "./inspection-grounding";
import { factComparison, inferenceSupport, MISMATCH_CLASSES } from "./grounding-comparison-diagnostic";

import { admittedShapeDiagnostic, type InspectionShapeDiagnostic } from "./inspection-shape-diagnostic";
import { WORKSPACE_TARGET_REJECTION_REASONS } from "../../workspace-intelligence/workspace-runtime.contract";

export const INSPECTION_TARGET_REASONS = [...WORKSPACE_TARGET_REJECTION_REASONS, "MISSING_TARGET", "FILE_REQUIRED", "SENSITIVE_PATH", "EXCLUDED_PATH", "EMPTY_TARGET_REQUIRED"] as const;
export type ValidationIssue = { code: string; path: string; stringPredicate?: StringPredicateDiagnostic; targetReason?: typeof INSPECTION_TARGET_REASONS[number]; recommendationReason?: typeof RECOMMENDATION_REJECTION_REASONS[number]; structure?: InspectionShapeDiagnostic; groundingDiagnostic?: UnderstandingGroundingDiagnostic };
export interface InspectionValidationDiagnostic { code: string; issues: ValidationIssue[] }
const CATEGORIES = ["INVALID_JSON", "INVALID_SHAPE", "INVALID_ENUM", "INVALID_FIELD", "INVALID_FACT_REFERENCE", "NON_VERBATIM_FACT", "EVIDENCE_REFERENCE_MISMATCH", "INVALID_INFERENCE_REFERENCE", "INVALID_TARGET", "INVALID_CONSTRAINT", "OTHER_CONTRACT_VIOLATION"] as const;
function category(code: string, detail?: UnderstandingGroundingDiagnostic): string {
  if ((CATEGORIES as readonly string[]).includes(code)) return code;
  if (code === "UNSUPPORTED_FACT" && detail && "evidenceReferenceAdmitted" in detail)
    return !detail.evidenceReferenceAdmitted ? "INVALID_FACT_REFERENCE" : detail.comparison?.classification === "EVIDENCE_UNAVAILABLE" ? "EVIDENCE_REFERENCE_MISMATCH" : "NON_VERBATIM_FACT";
  if (code === "UNSUPPORTED_INFERENCE") return "INVALID_INFERENCE_REFERENCE";
  if (["UNKNOWN_EVIDENCE", "EVIDENCE_OUTSIDE_SCOPE"].includes(code)) return "EVIDENCE_REFERENCE_MISMATCH";
  if (code.startsWith("CONSTRAINT")) return "INVALID_CONSTRAINT";
  if (["SCHEMA_OBJECT", "SCHEMA_ARRAY", "ADDITIONAL_PROPERTY"].includes(code)) return "INVALID_SHAPE";
  if (code === "SCHEMA_STRING") return "INVALID_FIELD";
  return "OTHER_CONTRACT_VIOLATION";
}
const validationDiagnostics = new WeakMap<Error, InspectionValidationDiagnostic>();

/** Bounded request markers only; source markup never proves browser appearance. */
export function requestsRenderedAppearance(objective: string): boolean {
  return /\bwhat\s+(?:does|would)\b[^.!?\n]*\blook\s+like\b|\b(?:render(?:ed|ing)?|browser|visual|screenshot|appearance|looks?\s+like)\b|(?:المظهر|بصري|بصرية|لقطة\s*(?:شاشة|للشاشة)|متصفح|شكل\s*(?:الصفحة|الموقع)|(?:الصفحة|الموقع)\s*شكل(?:ه|ها))/i.test(objective);
}

export function inspectionValidationError(issues: ReadonlyArray<ValidationIssue>, error = new BadRequestException("INVALID_MODEL_PROPOSAL")): BadRequestException {
  validationDiagnostics.set(error, { code: "INVALID_MODEL_PROPOSAL", issues: issues.slice(0, PLANNING_LIMITS.issues)
    .filter(issue => /^[A-Z][A-Z0-9_]{0,63}$/.test(issue.code) && issue.path.length <= 128 && /^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(issue.path))
    .map(({ code, path, stringPredicate, targetReason, recommendationReason, structure, groundingDiagnostic: detail }) => {
      const predicate = code === "SCHEMA_STRING" && stringPredicate && ["BLANK", "MAX_LENGTH"].includes(stringPredicate.reason) &&
        Number.isSafeInteger(stringPredicate.characterCount) && stringPredicate.characterCount >= 0 && stringPredicate.characterCount <= PLANNING_LIMITS.responseChars &&
        Number.isSafeInteger(stringPredicate.maxLength) && stringPredicate.maxLength > 0 && stringPredicate.maxLength <= PLANNING_LIMITS.text &&
        typeof stringPredicate.countTruncated === "boolean" ? { reason: stringPredicate.reason, characterCount: stringPredicate.characterCount,
          countTruncated: stringPredicate.countTruncated, maxLength: stringPredicate.maxLength } : undefined;
      // Copy only known booleans, not arbitrary properties on an exception/issue.
      const groundingDiagnostic = code === "UNSUPPORTED_FACT" && detail && "evidenceReferenceAdmitted" in detail &&
        typeof detail.evidenceReferenceAdmitted === "boolean" && typeof detail.exactSubstringMatch === "boolean"
        ? { evidenceReferenceAdmitted: detail.evidenceReferenceAdmitted, exactSubstringMatch: detail.exactSubstringMatch,
          ...(detail.comparison && MISMATCH_CLASSES.includes(detail.comparison.classification) &&
            Number.isSafeInteger(detail.comparison.factLength) && detail.comparison.factLength >= 0 && detail.comparison.factLength <= PLANNING_LIMITS.text &&
            /^[a-f0-9]{64}$/.test(detail.comparison.factFingerprint) &&
            ((detail.comparison.sourceLength === null && detail.comparison.sourceFingerprint === null) ||
              (Number.isSafeInteger(detail.comparison.sourceLength) && detail.comparison.sourceLength! >= 0 && detail.comparison.sourceLength! <= 24_000 &&
                /^[a-f0-9]{64}$/.test(detail.comparison.sourceFingerprint!))) ? { comparison: {
              classification: detail.comparison.classification, factLength: detail.comparison.factLength,
              factFingerprint: detail.comparison.factFingerprint, sourceLength: detail.comparison.sourceLength,
              sourceFingerprint: detail.comparison.sourceFingerprint } } : {}) }
        : code === "UNSUPPORTED_INFERENCE" && detail && "factIdsValid" in detail && typeof detail.factIdsValid === "boolean"
          ? { factIdsValid: detail.factIdsValid,
            ...(detail.support && typeof detail.support.empty === "boolean" &&
              [detail.support.accepted, detail.support.rejected, detail.support.nonexistent].every(n => Number.isSafeInteger(n) && n >= 0 && n <= PLANNING_LIMITS.items) ?
              { support: { accepted: detail.support.accepted, rejected: detail.support.rejected,
                nonexistent: detail.support.nonexistent, empty: detail.support.empty } } : {}) } : undefined;
      return { code, path, category: category(code, groundingDiagnostic), ...(predicate ? { stringPredicate: predicate } : {}), ...(recommendationReason && (RECOMMENDATION_REJECTION_REASONS as readonly string[]).includes(recommendationReason) ? { recommendationReason } : {}), ...(targetReason && (INSPECTION_TARGET_REASONS as readonly string[]).includes(targetReason) ? { targetReason } : {}), ...(admittedShapeDiagnostic(structure) ? { structure: admittedShapeDiagnostic(structure) } : {}), ...(groundingDiagnostic ? { groundingDiagnostic } : {}) };
    }) });
  return error;
}

/** Only server-generated codes, bounded schema paths and check booleans; never model values or exception bodies. */
export function inspectionValidationDiagnostic(error: unknown): InspectionValidationDiagnostic | undefined {
  if (!(error instanceof BadRequestException)) return undefined;
  const diagnostic = validationDiagnostics.get(error);
  if (diagnostic) return diagnostic;
  if (["INSPECTION_SOURCE_READ_REQUIRED", "INSUFFICIENT_EVIDENCE"].includes(error.message)) return { code: error.message, issues: [] };
  return undefined;
}

/** Grounding and presentation only. GLM supplies all analysis and next-file choices. */
export function inspectUnderstanding(context: AgentContext, base: AgentUnderstanding, proposal: AgentUnderstandingProposal,
  visible: ReadonlyMap<string, string>, sequence: number, final: boolean, boundedStructuredInspection = false, generalReview = false): InspectionUnderstanding {
  const sourceOnly = boundedStructuredInspection && context.operationClass === "READ" &&
    !context.userIntent.some(i => ["PLAN", "TEST", "VERIFY", "MODIFY", "EXECUTE"].includes(i)) &&
    !requestsRenderedAppearance(context.objective);
  const checked = validateUnderstandingProposal(base, proposal, visible, sourceOnly, sourceOnly && generalReview);
  if (checked.issues.length) {
    if (!boundedStructuredInspection) throw inspectionValidationError(checked.issues);
    const accepted = new Set(checked.understanding.facts.map(f => f.id));
    const issues = checked.issues.map(issue => {
      const factIndex = /^\$\.facts\[(\d+)\]$/.exec(issue.path), inferenceIndex = /^\$\.inferences\[(\d+)\]$/.exec(issue.path);
      if (issue.code === "UNSUPPORTED_FACT" && factIndex && issue.groundingDiagnostic && "evidenceReferenceAdmitted" in issue.groundingDiagnostic) {
        const fact = proposal.facts[Number(factIndex[1])];
        return { ...issue, groundingDiagnostic: { ...issue.groundingDiagnostic,
          comparison: factComparison(fact.text, visible.get(fact.evidenceRef), issue.groundingDiagnostic.evidenceReferenceAdmitted) } };
      }
      if (issue.code === "UNSUPPORTED_INFERENCE" && inferenceIndex && issue.groundingDiagnostic && "factIdsValid" in issue.groundingDiagnostic) {
        return { ...issue, groundingDiagnostic: { ...issue.groundingDiagnostic,
          support: inferenceSupport(proposal.inferences[Number(inferenceIndex[1])].factIds, proposal, accepted) } };
      }
      return issue;
    });
    throw inspectionValidationError(issues);
  }
  const evidence = evidenceReceipt(context, INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_SOURCES), u = checked.understanding;
  const requiresSource = isBroadWorkspaceReview(context.objective) || context.userIntent.some(i =>
    ["INSPECT", "UNDERSTAND", "EXPLAIN", "COMPARE", "DEBUG", "MODIFY", "PLAN", "SECURITY_REVIEW", "RESEARCH"].includes(i));
  const sourceFacts = u.facts.filter(f => context.evidence.some(e => e.provenance === f.evidenceRef &&
    e.runtimeReference && e.metadata.operation === "filesystem.read" && e.status === "COLLECTED"));
  // A quoted pathname/search hit proves an observation, not understanding of source.
  if (final && requiresSource && !sourceFacts.length) throw new BadRequestException("INSPECTION_SOURCE_READ_REQUIRED");
  if (final && !u.facts.length) throw new BadRequestException("INSUFFICIENT_EVIDENCE");
  const partial = u.readiness !== "UNDERSTANDING_READY" || context.truncated ||
    context.operationClass !== "READ" || context.userIntent.some(i => ["PLAN", "TEST", "VERIFY"].includes(i));
  if (context.truncated) u.confidence = "LOW";
  return { version: 1, sequence, understanding: u, evidence,
    status: final ? partial ? "PARTIAL" : "GROUNDED" : "INTERMEDIATE", observedAt: new Date().toISOString() };
}

/** Previous findings are advisory DATA; never a replacement for current visible evidence. */
export function checkpointContext(checkpoint: InspectionUnderstanding | undefined, remainingEvidenceBudget: number) {
  if (!checkpoint) return null;
  const u = checkpoint.understanding;
  const value = { kind: "UNTRUSTED_PRIOR_FINDINGS", sequence: checkpoint.sequence,
    facts: u.facts.map(({ id, text, evidenceRef }) => ({ id, text, evidenceRef })),
    inferences: u.inferences, hypotheses: u.hypotheses, unknowns: u.unknowns };
  // Share the existing evidence-character allowance; never grow a summary transcript.
  return JSON.stringify(value).length <= remainingEvidenceBudget ? value : null;
}

export function understandingMessage(checkpoint: InspectionUnderstanding, final: boolean): string {
  const u = checkpoint.understanding, sources = new Map(checkpoint.evidence.map(e => [e.id, e]));
  return [final ? checkpoint.status === "GROUNDED" ? "Project understanding — inspected scope" : "Project understanding — incomplete" : "Understanding progress — observed findings",
    "Inspected scope:", ...checkpoint.evidence.map(e => `- ${e.label}: ${e.read ? "source read" : "listing/search observation"}${e.truncated ? " (truncated)" : ""}${!e.selected ? " (not selected for model context)" : ""}`),
    "Observed (exact source excerpts):", ...u.facts.map(f => `- [${f.id}] ${f.text}\n  Source: ${sources.get(f.evidenceRef)?.label ?? f.evidenceRef} (${f.evidenceRef})`),
    "Inferred (not certified facts):", ...u.inferences.map(i => `- ${i.text} [${i.factIds.join(", ")}]. Uncertainty: ${i.uncertainty}`),
    "Unknown / missing information:", ...(u.unknowns.length ? u.unknowns.map(q => `- ${q.description} ${q.whyNeeded}`) : ["- No additional gaps reported by the model within the inspected scope."]),
    ...u.hypotheses.map(h => `- Unverified hypothesis: ${h.text}. ${h.uncertainty}`),
    ...(checkpoint.grounding ? [groundingMessage(checkpoint.grounding), ...checkpoint.grounding.claims.filter(c => c.status === "UNGROUNDED").map(c => `Uncertified note: ${c.text}`)] : []),
    ...(u.intent.some(i => ["MODIFY", "EXECUTE", "PLAN", "TEST", "VERIFY"].includes(i)) ? ["The requested planning, changes or verification remain outstanding; understanding does not complete that work."] : []),
    ...(checkpoint.evidence.some(e => e.truncated) ? ["Some evidence was truncated. This is not a complete analysis of those files."] : []),
    "Only the recorded observations are covered. Unread files and later workspace changes are not verified.",
    final ? "This is an understanding report, not an approved implementation plan. No modifications or verification commands were executed." : "Analysis is continuing. These findings do not approve or execute a plan."].join("\n");
}
