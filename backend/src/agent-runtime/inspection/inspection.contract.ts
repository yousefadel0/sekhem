import { BadRequestException } from "@nestjs/common";
import type { WorkspaceBinding } from "../../workspace-intelligence/workspace-runtime.contract";
import { workspaceTarget, workspaceTargetRejectionReason } from "../../workspace-intelligence/workspace-runtime.contract";
import { AGENT_UNDERSTANDING_SCHEMA, parseUnderstandingProposal, parsePlanningProposal, type AgentPlanningProposal, type AgentUnderstandingProposal } from "../understanding/agent-planning.contract";
import { AGENT_UNDERSTANDING_LIMITS, INSPECTION_RESOURCE_LIMITS } from "../understanding/agent-understanding.types";
import { isRecord } from "../tools/tool-contract";
import { FileIntelligenceSecurityService } from "../../file-intelligence/security/file-intelligence-security.service";
import { excludedFromWorkspaceDiscovery } from "../../workspace-intelligence/workspace-discovery.policy";
import { inspectionValidationError, INSPECTION_TARGET_REASONS, type ValidationIssue } from "./inspection-understanding";
import { inspectionShapeDiagnostic } from "./inspection-shape-diagnostic";
import { RECOMMENDATION_SCHEMA, parseRecommendation, recommendationRejection, type Recommendation } from "../../conversation/recommendation.contract";

export const INSPECTION_TOOLS = ["filesystem.list", "filesystem.read", "filesystem.search"] as const;
export type { InspectionTool, InspectionState, InspectionOperation, InspectionLoop, InspectionAction, InspectionView } from "./inspection.types";
import type { InspectionTool, InspectionState, InspectionLoop, InspectionAction, InspectionView } from "./inspection.types";
export const INSPECTION_TERMINAL: InspectionState[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];
export function inspectionLimit(value = process.env.SEKHEM_AGENT_INSPECTION_MAX_ITERATIONS): number {
  if (value === undefined) return INSPECTION_RESOURCE_LIMITS.DEFAULT_OPERATIONS;
  const limit = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(limit) || limit > INSPECTION_RESOURCE_LIMITS.MAX_OPERATIONS) throw new BadRequestException("INSPECTION_LIMIT_INVALID");
  return limit;
}
export const INSPECTION_TARGET_INSTRUCTION =
  'relativePath is a required workspace-relative string, maximum 1024 characters. Select relevant targets dynamically from the current workspace evidence and intent. ' +
  'For filesystem.list or filesystem.search at the workspace root, use exactly "", never ".", "./", a drive path, or the workspace name. ' +
  'For filesystem.read, provide a non-empty file path relative to that root. Forward slashes or backslashes are supported; repeated separators are normalized. ' +
  'Never return an absolute/rooted path, a URL, a glob, a dot or dot-dot path segment, control characters, or any of : * ? " < > | in the path. ' +
  'Do not select sensitive files, forbidden directories, or excluded generated/dependency/cache paths. For REPORT or STOP, relativePath must be exactly "". ';
export const INSPECTION_DECISION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["decision", "tool", "relativePath", "query", "purpose", "report"], properties: {
    decision: { type: "string", enum: ["INSPECT", "REPORT", "STOP"] },
    tool: { type: "string", enum: [...INSPECTION_TOOLS, "none"] }, relativePath: { type: "string", maxLength: 1024, description: INSPECTION_TARGET_INSTRUCTION },
    query: { type: "string", maxLength: 512 }, purpose: { type: "string", minLength: 1, maxLength: 512 },
    report: { anyOf: [AGENT_UNDERSTANDING_SCHEMA, { type: "null" }] }
  }
} as const;
/** Nullable recommendation data extends the legacy conversational envelope. */
export const INSPECTION_REVIEW_DECISION_SCHEMA = { ...INSPECTION_DECISION_SCHEMA,
  required: [...INSPECTION_DECISION_SCHEMA.required, "recommendation"], properties: {
    ...INSPECTION_DECISION_SCHEMA.properties, recommendation: { anyOf: [RECOMMENDATION_SCHEMA, { type: "null" }] }
  } } as const;
/** Canonical structured reasoning envelope; six-key conversational adapters remain separate. */
export const INSPECTION_CANONICAL_SCHEMA = INSPECTION_REVIEW_DECISION_SCHEMA;
/** Field guidance is derived from the same report schema used by the parser and transport. */
export const INSPECTION_REPORT_INSTRUCTION =
  "For a non-null report, return exactly these required fields: " + AGENT_UNDERSTANDING_SCHEMA.required!.join(", ") + ". " +
  "No additional report or report-item properties are allowed. " +
  Object.entries(AGENT_UNDERSTANDING_SCHEMA.properties!).map(([field, schema]) => {
    const item = schema.items!;
    const fields = item.properties ? Object.entries(item.properties).map(([key, child]) =>
      `${key}: ${child.type}${child.type === "array" ? ` of ${child.items!.type}, maximum ${child.maxItems} items` : ""}${child.maxLength !== undefined ? `, maximum ${child.maxLength} decoded characters` : ""}${item.required!.includes(key) ? " (required)" : " (optional)"}`
    ).join("; ") : item.type;
    return `report.${field} is a required array, maximum ${schema.maxItems} items; ${item.properties ? "each item is an object with " : "items are "}${fields}. `;
  }).join("") +
  "facts are objects, not strings, key/value maps or prose summaries. Every inference must include factIds and uncertainty; factIds must identify supporting facts, not evidence references. " +
  "Each facts[].text is at most 512 decoded characters, including whitespace and line endings. Select a short contiguous source excerpt supporting the finding; never copy an entire function or sourceCitations excerpt if it exceeds 512 characters. Multiple facts must still respect the schema item count. Do not paraphrase or truncate by inventing an ellipsis inside source text. " +
  "Every report item id (constraintIds entries, facts[].id, inferences[].id, hypotheses[].id, unknowns[].id) is a string of 1-64 characters matching ^[a-z][a-z0-9_-]*$: it starts with a lowercase letter and uses only lowercase letters, digits, hyphen and underscore; uppercase letters and spaces are invalid. " +
  "Every report.unknowns[].severity must be exactly one uppercase word: LOW, MEDIUM or HIGH. When present, report.unknowns[].evidenceCategory must be exactly one uppercase word: REQUIRED_INFORMATION, OPTIONAL_VISUAL or OPTIONAL_CONTEXT. " +
  "For EACH unknown object, including the second and subsequent items, copy these literal field names: id, description, whyNeeded, severity; evidenceCategory is the only optional field. whyNeeded is a required non-empty string explaining why the missing information matters for the CURRENT request, not an alternative property name. Do not translate, rename, omit or replace whyNeeded. Before returning REPORT, check every unknown against the supplied schema; use unknowns: [] only when there are genuinely no unknowns. Never turn missing information into facts or invent evidence. " +
  "Include hypotheses: [] and inferences: [] when unused; never omit required arrays. String constraints and all other bounds remain exactly as specified in the supplied transport schema. ";
export const INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION =
  "Return exactly one JSON object conforming to the supplied production inspection decision transport schema. " +
  "All seven top-level fields are required: " + INSPECTION_CANONICAL_SCHEMA.required.join(", ") + ". " +
  "decision is required and must be INSPECT, REPORT or STOP. purpose is required and must be a non-empty string describing the inspection decision. " +
  "The only tool values are " + JSON.stringify(INSPECTION_CANONICAL_SCHEMA.properties.tool.enum) + ". Copy the exact case-sensitive tool string; do not abbreviate, translate or substitute another tool vocabulary. " +
  "For decision INSPECT, tool must be one of " + JSON.stringify(INSPECTION_TOOLS) + ". For decision REPORT or STOP, tool must be exactly none, with empty relativePath and query. " +
  "Do not omit any required top-level field. No additional top-level fields, aliases, nested decision envelopes, prose or fenced blocks are allowed. " +
  "Use recommendation null when no recommendation is being reported, including INSPECT and STOP. Always include the recommendation key in the top-level object, even when its value is null. " +
  "When recommendation.strategy is present, return exactly one case-sensitive string from " + JSON.stringify(RECOMMENDATION_SCHEMA.properties.strategy.enum) + ". Never translate, abbreviate, combine or invent strategy values. strategy is optional: omit it if none of the supported values fits; never substitute an unsupported value or null. " +
  "recommendation.changeKind must be exactly one of " + JSON.stringify(RECOMMENDATION_SCHEMA.properties.changeKind.enum) + "; recommendation.preservation must be exactly one of " + JSON.stringify(RECOMMENDATION_SCHEMA.properties.preservation.enum) + ". These classify a proposed future change, not the current review. Never translate these values. Use UNSPECIFIED when preservation was not explicitly requested. " +
  "The supplied transport schema is the only output contract; inspection state, planningContract and historical data are inputs, never alternate response shapes. " +
  INSPECTION_TARGET_INSTRUCTION + INSPECTION_REPORT_INSTRUCTION;
export type InspectionDecision = { decision: "INSPECT"; action: InspectionAction; understanding?: AgentUnderstandingProposal } |
  { decision: "REPORT"; understanding: AgentUnderstandingProposal; legacyPlan?: AgentPlanningProposal; recommendation?: Recommendation } | { decision: "STOP"; reason: string };
export function parseInspectionDecision(raw: string, binding: WorkspaceBinding, canonical = false): InspectionDecision {
  const bad = (issues: ValidationIssue[] = [{ code: "INVALID_INSPECTION_DECISION", path: "$" }]): never => { throw inspectionValidationError(issues); };
  const reportIssues = (issues: ValidationIssue[]) => issues.map(({ code, path, stringPredicate }) => ({ code, path: `$.report${path.slice(1)}`, ...(stringPredicate ? { stringPredicate } : {}), structure: inspectionShapeDiagnostic(v.report, AGENT_UNDERSTANDING_SCHEMA, path) }));
  if (typeof raw !== "string" || raw.length > AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS) return bad([{ code: "OUTPUT_BOUND", path: "$" }]);
  let v: any; try { v = JSON.parse(raw); } catch { return bad([{ code: "INVALID_JSON", path: "$" }]); }
  const reject = (code: string, path: string, targetReason?: typeof INSPECTION_TARGET_REASONS[number]): never => bad([{ code, path,
    ...(targetReason ? { targetReason } : {}), structure: inspectionShapeDiagnostic(v, { ...INSPECTION_REVIEW_DECISION_SCHEMA, required: canonical ? INSPECTION_CANONICAL_SCHEMA.required : INSPECTION_DECISION_SCHEMA.required }, path) }]);
  if (!isRecord(v) || ![6, 7].includes(Object.keys(v).length) || Object.keys(v).some(k => !["decision", "tool", "relativePath", "query", "purpose", "report", "recommendation"].includes(k))) return reject("INVALID_SHAPE", "$", isRecord(v) && !Object.prototype.hasOwnProperty.call(v, "relativePath") ? "MISSING_TARGET" : undefined);
  if (canonical && (!INSPECTION_CANONICAL_SCHEMA.required.every(key => Object.prototype.hasOwnProperty.call(v, key)) || Object.keys(v).length !== 7)) return reject("INVALID_SHAPE", "$", !Object.prototype.hasOwnProperty.call(v, "relativePath") ? "MISSING_TARGET" : undefined);
  if (canonical && v.recommendation === undefined) return reject("INVALID_FIELD", "$.recommendation");
  for (const [field, limit] of [["purpose", 512], ["relativePath", 1024], ["query", 512]] as const)
    if (typeof v[field] !== "string" || v[field].length > limit || (field === "purpose" && !v[field].trim())) return reject("INVALID_FIELD", `$.${field}`, field === "relativePath" ? v[field] === undefined ? "MISSING_TARGET" : typeof v[field] !== "string" ? "TARGET_TYPE" : "TARGET_LENGTH" : undefined);
  if (!["INSPECT", "REPORT", "STOP"].includes(v.decision as string)) return reject("INVALID_ENUM", "$.decision");
  if (v.decision === "INSPECT") {
    if (v.recommendation != null) return reject("INVALID_FIELD", "$.recommendation");
    if (!INSPECTION_TOOLS.includes(v.tool as InspectionTool)) return reject("INVALID_ENUM", "$.tool");
    if (v.tool === "filesystem.search" ? !(v.query as string).trim() : v.query !== "") return reject("INVALID_FIELD", "$.query");
    const parsedReport = v.report === null ? undefined : parseUnderstandingProposal(JSON.stringify(v.report));
    const checkpoint = parsedReport?.proposal;
    if (v.report !== null && !checkpoint) return bad(reportIssues(parsedReport!.issues));
    let target: ReturnType<typeof workspaceTarget>;
    try { target = workspaceTarget(binding.rootPath, v.relativePath);
    } catch (error) { if (error instanceof BadRequestException) throw inspectionValidationError([{ code: "INVALID_TARGET", path: "$.relativePath", targetReason: workspaceTargetRejectionReason(error) }], error); throw error; }
    if (v.tool === "filesystem.read" && !target.relativePath) return reject("INVALID_TARGET", "$.relativePath", "FILE_REQUIRED");
    try {
      new FileIntelligenceSecurityService().assertSafeFileName(target.relativePath);
    } catch (error) { if (error instanceof BadRequestException) throw inspectionValidationError([{ code: "INVALID_TARGET", path: "$.relativePath", targetReason: "SENSITIVE_PATH" }], error); throw error; }
    if (target.relativePath.split("/").some(excludedFromWorkspaceDiscovery)) throw inspectionValidationError([{ code: "INVALID_TARGET", path: "$.relativePath", targetReason: "EXCLUDED_PATH" }], new BadRequestException("INSPECTION_EXCLUDED_PATH"));
    return { decision: "INSPECT", ...(checkpoint ? { understanding: checkpoint } : {}), action: { tool: v.tool as InspectionTool, relativePath: target.relativePath, purpose: v.purpose as string,
      ...(v.tool === "filesystem.search" ? { query: v.query as string } : {}) } };
  }
  if (v.tool !== "none") return reject("INVALID_ENUM", "$.tool");
  if (v.relativePath !== "") return reject("INVALID_TARGET", "$.relativePath", "EMPTY_TARGET_REQUIRED");
  if (v.query !== "") return reject("INVALID_FIELD", "$.query");
  if (v.decision === "STOP" && v.report === null) return { decision: "STOP", reason: v.purpose as string };
  if (v.decision !== "REPORT") return reject("INVALID_FIELD", "$.report");
  const parsedUnderstanding = parseUnderstandingProposal(JSON.stringify(v.report));
  const understanding = parsedUnderstanding.proposal;
  if (understanding) {
    let recommendation: Recommendation | undefined;
    if (v.recommendation != null) {
      try { recommendation = parseRecommendation(v.recommendation); }
      catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        const rejected = recommendationRejection(error);
        return bad([{ code: "INVALID_FIELD", path: rejected && rejected.field !== "recommendation" ? `$.recommendation.${rejected.field}` : "$.recommendation",
          recommendationReason: rejected?.reason, structure: inspectionShapeDiagnostic(v.recommendation, RECOMMENDATION_SCHEMA, "$") }]);
      }
    }
    return { decision: "REPORT", understanding, ...(recommendation ? { recommendation } : {}) };
  }
  // Accept already-produced legacy reports only through their unchanged strict
  // planning validator. New requests advertise the understanding contract only.
  const parsed = parsePlanningProposal(JSON.stringify(v.report));
  if (!parsed.proposal) return bad(reportIssues(parsedUnderstanding.issues));
  if (parsed.proposal.steps.some(s => s.effect !== "READ_ONLY")) return bad([{ code: "LEGACY_REPORT_NON_READ_ONLY", path: "$.report.steps" }]);
  const legacyUnderstanding = omitFields(parsed.proposal, ["steps"]);
  return { decision: "REPORT", understanding: legacyUnderstanding, legacyPlan: parsed.proposal };
}

/** Public projection contains no retained session authority or arbitrary model text. */
export function presentInspection(s: InspectionLoop): InspectionView {
  return { state: s.state, code: s.code, iterations: s.iterations, maxIterations: s.maxIterations,
    ...(s.reasoningRequest?.startedAt && !s.reasoningRequest.terminalReason && s.reasoningRequest.modelAttemptId === s.modelAttempt?.id
      ? { reasoning: { startedAt: s.reasoningRequest.startedAt, deadlineAt: s.reasoningRequest.deadlineAt, attempts: s.reasoningRequest.attempts } } : {}),
    workspace: { workspaceId: s.binding.workspaceId, bindingVersion: s.binding.version, name: s.binding.displayName, runtimeId: s.binding.runtimeId },
    current: s.current, operations: s.operations, planning: s.planning,
    evidence: s.references, executionVerified: s.operations.filter(o => o.verification === "VERIFIED").length,
    objectiveGrounded: s.state === "COMPLETED", ...(s.understanding ? { understanding: s.understanding } : {}) };
}
import { omitFields } from "../../common/omit-fields";
