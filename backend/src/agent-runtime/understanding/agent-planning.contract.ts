import {
  AGENT_UNDERSTANDING_LIMITS as LIMITS, evidenceIdentity,
  type AgentContext, type AgentConstraint, type AgentUnderstanding, type AgentPlanningResult,
  type AgentInformationRequirement, type AgentPlannedStep, type PlanningStringDiagnostic, type UnderstandingGroundingDiagnostic
} from "./agent-understanding.types";
import { arabicHeroRequest, heroConstrainedResult, isHeroPreservationClause, resolveHeroTextChange } from "./hero-title-constraint";
import { packageVersionSource, resolvePackageVersionChange } from "./package-version-constraint";

/** Reuse the six-step/five-source context bounds; short claims avoid copying evidence. */
export const PLANNING_LIMITS = Object.freeze({
  items: LIMITS.MAX_PLAN_STEPS,
  refs: LIMITS.MAX_EVIDENCE_ITEMS,
  text: 512,
  responseChars: LIMITS.MAX_MODEL_EVIDENCE_CHARS,
  issues: LIMITS.MAX_PLAN_STEPS * 2,
  depth: 12
});

type Schema = { type: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false;
  items?: Schema; maxItems?: number; minLength?: number; maxLength?: number; enum?: readonly string[]; pattern?: string };
const text = (max: number = PLANNING_LIMITS.text): Schema => ({ type: "string", minLength: 1, maxLength: max });
const id = (): Schema => ({ ...text(64), pattern: "^[a-z][a-z0-9_-]*$" });
const enumeration = (values: string[]): Schema => ({ ...text(64), enum: values });
const list = (items: Schema, maxItems: number = PLANNING_LIMITS.items): Schema => ({ type: "array", items, maxItems });
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const refs = () => list(text(), PLANNING_LIMITS.refs);
const informationGapSchema = object({ id: id(), description: text(), whyNeeded: text(), severity: enumeration(["LOW", "MEDIUM", "HIGH"]) });
const inspectionGapSchema = { ...informationGapSchema, properties: { ...informationGapSchema.properties,
  evidenceCategory: enumeration(["REQUIRED_INFORMATION", "OPTIONAL_VISUAL", "OPTIONAL_CONTEXT"]) } };

/** Provider schema and deterministic validator share the same bounded contract. */
export const AGENT_UNDERSTANDING_SCHEMA = object({
  constraintIds: list(text()),
  facts: list(object({ id: id(), text: text(), evidenceRef: text() })),
  inferences: list(object({ id: id(), text: text(), factIds: list(id()), uncertainty: text() })),
  hypotheses: list(object({ id: id(), text: text(), evidenceRefs: refs(), uncertainty: text() })),
  unknowns: list(inspectionGapSchema)
});
export const AGENT_PLANNING_SCHEMA = object({
  ...AGENT_UNDERSTANDING_SCHEMA.properties!,
  // Planning keeps its existing required-information/classification contract.
  unknowns: list(informationGapSchema),
  steps: list(object({
    id: id(), type: enumeration(["INSPECT", "ANALYZE", "PROPOSE", "IMPLEMENT", "VERIFY"]),
    purpose: enumeration(["UNDERSTAND", "RESOLVE_GAPS", "PROPOSE_CHANGE", "CHECK_OUTCOME"]),
    evidenceRefs: refs(), missingInformationIds: list(text()), dependencies: list(id()), scopeRefs: refs(),
    verificationCriterionIds: list(text()), effect: enumeration(["READ_ONLY", "WRITE", "EXECUTE", "DESTRUCTIVE"]),
    dependencyStatus: enumeration(["KNOWN", "UNKNOWN"])
  }))
});
// Understanding and legacy planning retain their original contracts.
const stepSchema = { ...AGENT_PLANNING_SCHEMA.properties!.steps.items!, properties: {
  ...AGENT_PLANNING_SCHEMA.properties!.steps.items!.properties, description: text(), verificationDescription: text()
} };
export const AGENT_ENGINEERING_PLAN_SCHEMA = { ...AGENT_PLANNING_SCHEMA, properties: {
  ...AGENT_PLANNING_SCHEMA.properties,
  unknowns: list(object({ ...AGENT_PLANNING_SCHEMA.properties!.unknowns.items!.properties,
    classification: enumeration(["REQUIRED_FOR_PLAN", "LIMITATION", "FUTURE_EXECUTION_PREREQUISITE"]) })),
  steps: { ...AGENT_PLANNING_SCHEMA.properties!.steps,
    items: { ...stepSchema, required: Object.keys(stepSchema.properties!) } }
} };

export interface AgentPlanningProposal {
  constraintIds: string[];
  facts: Array<{ id: string; text: string; evidenceRef: string }>;
  inferences: AgentUnderstanding["inferences"];
  hypotheses: AgentUnderstanding["hypotheses"];
  unknowns: Array<Omit<AgentInformationRequirement, "state"> & {
    classification?: "REQUIRED_FOR_PLAN" | "LIMITATION" | "FUTURE_EXECUTION_PREREQUISITE"
  }>;
  steps: Array<{ id: string; type: AgentPlannedStep["type"]; purpose: string; evidenceRefs: string[];
    description?: string; verificationDescription?: string;
    missingInformationIds: string[]; dependencies: string[]; scopeRefs: string[];
    verificationCriterionIds: string[]; effect: AgentPlannedStep["effect"]; dependencyStatus: "KNOWN" | "UNKNOWN" }>;
}
/** Findings are not steps, a plan, or execution authority. */
export type AgentUnderstandingProposal = Omit<AgentPlanningProposal, "steps">;

export type StringPredicateDiagnostic = { reason: "BLANK" | "MAX_LENGTH"; characterCount: number; countTruncated: boolean; maxLength: number };
type Issue = { code: string; path: string; stringPredicate?: StringPredicateDiagnostic; stringDiagnostic?: PlanningStringDiagnostic; groundingDiagnostic?: UnderstandingGroundingDiagnostic };
function add(issues: Issue[], code: string, path = "$", stringDiagnostic?: PlanningStringDiagnostic, groundingDiagnostic?: UnderstandingGroundingDiagnostic) {
  if (issues.length < PLANNING_LIMITS.issues && !issues.some(i => i.code === code && i.path === path)) issues.push({ code, path, ...(stringDiagnostic ? { stringDiagnostic } : {}), ...(groundingDiagnostic ? { groundingDiagnostic } : {}) });
}
function unknown(id: string, description: string, whyNeeded: string): AgentInformationRequirement {
  return { id, state: "UNKNOWN", description, whyNeeded, severity: "HIGH" };
}

export function planningRequired(context: AgentContext): boolean {
  if (context.userIntent.every(intent => intent === "CHAT" || intent === "CONVERSE")) return false;
  return context.workspaceContext.required || context.repositoryContext.required ||
    context.userIntent.some(i => ["PLAN", "MODIFY", "EXECUTE", "DEBUG", "VERIFY", "TEST", "SECURITY_REVIEW", "RESEARCH", "INITIATIVE"].includes(i));
}

/** Only direct prohibitions suppress intent terms. Coordinated/conditional requests
 * remain visible so an ambiguous or separately positive action still fails closed. */
export function positiveIntentText(instruction: string): string {
  return instruction.replace(/\bdo not execute anything(?=\.(?:\s|$)|[\n;!?]|$)/gi, " ")
    .replace(/\bdo not (?:create a modification plan or proposal|modify any file or execute any write)(?=\.(?:\s|$)|[\n;!?]|$)/gi, " ").replace(
    /\b(?:(?:do not|don't|never)\s+(?:create|make|generate|prepare|produce|write|modify|change|edit|implement|fix)\b|without\s+(?:creating|making|generating|preparing|producing|writing|modifying|changing|editing|implementing|fixing)\b|no\s+(?:writes?|changes|modifications?|plans?|proposals?|roadmaps?)\b)[\s\S]*?(?=\.(?:\s|$)|[\n,;!?]|\b(?:and|but|or|then|instead|if|unless|except)\b|$)/gi,
    " "
  );
}

/** Recognize the bounded inspection-only clause without dropping unknown qualifiers. */
function readOnlyBoundary(quote: string): boolean {
  const prefix = /^read[ -]only(?:\s+only)?(?:$|:\s*)/i.exec(quote);
  if (!prefix) return false;
  const remainder = quote.slice(prefix[0].length);
  if (!remainder) return true;
  const restrictions = remainder.split(/,?\s+and\s+(?=do not\b|don't\b|never\b)/i);
  return restrictions.every(part => /^(?:do not|don't|never)\s+(?:(?:write|modify|change|edit)(?:\s+(?:any\s+)?files?)?|(?:create|make|generate|prepare|produce)\s+(?:(?:a|an|any|the)\s+)?(?:(?:modification|implementation)\s+)?(?:plan|proposal)(?:\s+or\s+(?:plan|proposal))?)$/i.test(part));
}

/** Request-only interpretation. Unsupported natural-language constraints block readiness. */
export function interpretContext(context: AgentContext, visibleEvidence: ReadonlyMap<string, string>): AgentUnderstanding {
  const usable = context.evidence.filter(e => e.status === "COLLECTED" && visibleEvidence.get(evidenceIdentity(e))?.trim());
  const evidenceRefs = usable.map(evidenceIdentity);
  const constraints: AgentConstraint[] = [{ id: "runtime-planning-only", source: "RUNTIME", rule: "PLANNING_ONLY",
    description: "Plans describe intended work only. Scope, confidence and readiness grant no execution authorization." }];
  const unknowns: AgentInformationRequirement[] = [];
  const heroChange = resolveHeroTextChange(context, visibleEvidence);
  const packageChange = resolvePackageVersionChange(context, visibleEvidence);
  if (packageChange) {
    constraints.push({ id: "package-version-only", source: "USER", rule: "PACKAGE_VERSION_ONLY",
      requestQuote: context.objective, requestQuotes: [context.objective, packageChange.preservation],
      description: `Change only package.json version from ${JSON.stringify(packageChange.before)} to ${JSON.stringify(packageChange.after)}; preserve all other content, order and formatting.`,
      packageVersionChange: { relativePath: packageChange.relativePath, before: packageChange.before, after: packageChange.after,
        evidenceRef: packageChange.evidenceRef, sourceSha256: packageChange.sourceSha256, versionExcerpt: packageChange.versionExcerpt } });
    constraints.push({ id: "package-review-before-write", source: "USER", rule: "PLANNING_ONLY",
      requestQuote: packageChange.approval, description: packageChange.approval });
  }
  // Preserve clauses exactly. We do not infer constraints from evidence or ask a model to redefine them.
  // A period inside a filename/version is not a sentence boundary. Preserve
  // the requested target verbatim; unsupported constraints still fail closed.
  const clauses = context.objective.split(/[\n;!?]+|\.(?=\s|$)/).map(s => s.trim()).filter(Boolean);
  const explicit = clauses.filter(s => /\b(do not|don't|never|must|only|read[ -]only|without|preserve|keep|avoid|no\s+(?:writes?|execution|changes|deletion))\b/i.test(s));
  const arabic = arabicHeroRequest(context.objective);
  // Any trailing restriction on this bounded command must be interpreted, not dropped.
  if (arabic?.restriction) explicit.push(arabic.restriction);
  const explicitPlanStop = /^Prepare the engineering plan only and stop after persisted PLAN_READY$/i;
  const boundedHeroPlanStop = (quote: string) => !!heroChange && /^Prepare the engineering plan only and STOP at PLAN_READY$/i.test(quote);
  const planningStageOnly = context.userIntent.includes("PLAN") && clauses.some(s => /^Planning(?: and exact proposal)? only$/i.test(s) || explicitPlanStop.test(s) || boundedHeroPlanStop(s));
  const boundedSourceRead = context.operationClass === "READ" && !context.userIntent.some(i => ["PLAN", "TEST", "VERIFY"].includes(i)) &&
    /^(?:read(?: and analy[sz]e)?|analy[sz]e|inspect)\s+`?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,10}`?(?=$|[\s.,;])/i.test(context.objective.trim());
  for (const quote of explicit) {
    let rule: AgentConstraint["rule"] = "UNRESOLVED";
    const understandingOnly = /^Complete grounded understanding only$/i.test(quote);
    const noPlan = /^Do not create a modification plan or proposal$/i.test(quote);
    const noWriteOrExecute = /^Do not modify any file or execute any write$/i.test(quote);
    if (understandingOnly || noPlan || noWriteOrExecute) rule = "NO_WRITE";
    if (/^(do not|don't|never)\s+(write|modify|change|edit)(\s+(any\s+)?files?)?$/i.test(quote) || /^no writes?$/i.test(quote) || readOnlyBoundary(quote)) rule = "NO_WRITE";
    if (/^(do not|don't|never)\s+(execute|run)(\s+(any\s+)?(commands?|code))?$|^no execution$/i.test(quote)) rule = "NO_EXECUTE";
    if (/^(do not|don't|never)\s+delete(\s+(any\s+)?files?)?$|^no deletion$/i.test(quote)) rule = "NO_DESTRUCTIVE";
    if (/^Planning(?: and exact proposal)? only$/i.test(quote) || /^Do not (?:request or perform approval|create an Execution Permit)$/i.test(quote)) rule = "PLANNING_ONLY";
    if (/^Do not redo inspection$/i.test(quote) && context.certifiedSourceReuse) rule = "CERTIFIED_SOURCE_REUSE";
    if (/^Do not execute anything$/i.test(quote)) rule = "NO_EXECUTE";
    // These exact source-only clauses impose a read-only boundary, never authority.
    // Their factual restrictions remain enforced by admitted-source/reference and
    // exact-substring validation; retain their original quotes for acknowledgment.
    if (boundedSourceRead && /^(?:Use the file itself as the only source|Do not modify anything|Do not create a proposal|Do not infer anything that is not present in the file)$/i.test(quote)) rule = "NO_WRITE";
    if (/^Do not write the workspace$/i.test(quote)) rule = planningStageOnly ? "PLANNING_ONLY" : "NO_WRITE";
    // These bounded controls restrict the current planning stage, not the
    // proposed future work. Retain each quote; this never satisfies a future gate.
    if (planningStageOnly && (explicitPlanStop.test(quote) || /^Do not (?:create a proposal|request approval|issue an execution permit|execute or modify any file)$/i.test(quote))) rule = "PLANNING_ONLY";
    if (planningStageOnly && heroChange && (boundedHeroPlanStop(quote) || /^Do not (?:approve|write or modify the workspace)$/i.test(quote))) rule = "PLANNING_ONLY";
    // This exact prohibition limits the current planning step; it grants no authority.
    if (context.userIntent.includes("PLAN") && /^Do not create a proposal, request approval, issue a permit, or modify any file yet$/i.test(quote)) rule = "PLANNING_ONLY";
    if (heroChange && isHeroPreservationClause(quote, heroChange)) rule = "HERO_TITLE_TEXT_ONLY";
    constraints.push({ id: `user-constraint-${constraints.length}`, source: "USER", description: quote, requestQuote: quote, rule,
      ...(rule === "HERO_TITLE_TEXT_ONLY" ? { textChange: heroChange } : {}) });
    if (understandingOnly || noWriteOrExecute) constraints.push({ id: `user-constraint-${constraints.length}`, source: "USER",
      description: quote, requestQuote: quote, rule: "NO_EXECUTE" });
  }
  if (heroChange && !constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY")) constraints.push({
    id: "hero-title-text-only", source: "USER", rule: "HERO_TITLE_TEXT_ONLY", requestQuote: context.objective,
    description: "Change only the identified Hero title text in index.html; preserve markup, CSS, encoding and every other byte.", textChange: heroChange
  });
  // Normalize only known equivalent rules; retain every request clause and never merge unknowns.
  for (let index = constraints.length - 1; index > 0; index--) {
    if (!context.userIntent.includes("PLAN")) break;
    const item = constraints[index];
    if (item.rule === "UNRESOLVED" || item.source !== "USER") continue;
    const previous = constraints.slice(0, index).find(c => c.source === "USER" && c.rule === item.rule && JSON.stringify(c.textChange) === JSON.stringify(item.textChange));
    if (!previous) continue;
    previous.requestQuotes = [...(previous.requestQuotes ?? [previous.requestQuote!]), ...(item.requestQuotes ?? [item.requestQuote!])];
    constraints.splice(index, 1);
  }
  if (constraints.length > PLANNING_LIMITS.items || constraints.some(c => c.rule === "UNRESOLVED" || c.description.length > PLANNING_LIMITS.text || c.requestQuotes?.some(q => q.length > PLANNING_LIMITS.text)) || explicit.length > 32) {
    unknowns.push(unknown("constraint-interpretation", "Clarify the effect and target of the explicit request constraints.", "A plan cannot certify compliance with constraints that have not been resolved deterministically."));
  }
  if ((context.workspaceContext.required || context.repositoryContext.required) && !context.projectId) {
    unknowns.push(unknown("target-project", "Identify the intended project or repository.", "The requested engineering scope has not been bound to a project."));
  }
  const primary = usable.filter(e => ["workspace", "repository", "gitlab"].includes(e.sourceType));
  if ((context.workspaceContext.required || context.repositoryContext.required) && primary.length === 0) {
    unknowns.push(unknown("source-evidence", "Inspect the relevant source through the existing authorized evidence reader.", "Workspace or repository claims require collected source evidence; memory and prior answers are insufficient."));
  }
  if (context.repositoryContext.required && primary.length > 0 && !primary.some(e => e.sourceType === "repository" || e.sourceType === "gitlab")) {
    unknowns.push(unknown("repository-evidence", "Collect the requested repository through its authorized connection.", "Local workspace evidence does not establish the requested repository binding or revision."));
  }
  if (context.attachmentContext.required && !usable.some(e => e.sourceType === "attachment")) {
    unknowns.push(unknown("attachment-evidence", "Supply an accessible attachment with extractable content.", "The requested attachment has not supplied usable evidence."));
  }
  // One bounded acceptance section only. Preserve its request provenance; never
  // choose between competing sections or silently trim overflowing criteria.
  const acceptanceLines = context.objective.split(/\r?\n/);
  const headings = acceptanceLines.flatMap((line, index) => /^(acceptance|success criteria|success|expected outcome):/i.test(line.trim()) ? [index] : []);
  let acceptance = clauses.find(s => /^(acceptance|success criteria|success|expected outcome):\s*\S/i.test(s));
  let invalidAcceptance = headings.length > 1 || clauses.filter(s => /^(acceptance|success criteria|success|expected outcome):/i.test(s)).length > 1;
  if (headings.length === 1 && /^(acceptance|success criteria|success|expected outcome):\s*$/i.test(acceptanceLines[headings[0]].trim())) {
    const content: string[] = [];
    for (const line of acceptanceLines.slice(headings[0] + 1)) {
      const trimmed = line.trim();
      if (!trimmed) { if (content.length) break; else continue; }
      if (/^[A-Za-z][A-Za-z ]*:\s*$/.test(trimmed)) break;
      if (/^(?:[-*]|\d+[.)])\s*$/.test(trimmed)) { invalidAcceptance = true; break; }
      content.push(trimmed);
    }
    acceptance = `${acceptanceLines[headings[0]].trim()}\n${content.join("\n")}`;
    invalidAcceptance ||= !content.length || content.length > PLANNING_LIMITS.items || acceptance.length > PLANNING_LIMITS.text;
  }
  invalidAcceptance ||= !!acceptance && acceptance.length > PLANNING_LIMITS.text;
  const successCriteria: AgentUnderstanding["successCriteria"] = [{ id: "grounding", source: "RUNTIME",
    description: "Every factual source claim has a collected evidence reference; interpretations and uncertainty remain labeled." }];
  if (invalidAcceptance) {
    acceptance = undefined;
    unknowns.push(unknown("success-criteria", "Specify one bounded, nonempty acceptance section.", "Ambiguous or overflowing acceptance criteria cannot certify the requested outcome."));
  } else if (acceptance && acceptance.length <= PLANNING_LIMITS.text) {
    successCriteria.push({ id: "requested-outcome", source: "USER", description: acceptance, requestQuote: acceptance });
  } else if (heroChange) {
    successCriteria.push({ id: "requested-outcome", source: "USER", description: `Hero title changes from ${JSON.stringify(heroChange.before)} to ${JSON.stringify(heroChange.after)} in index.html.` });
  } else if (packageChange) {
    successCriteria.push({ id: "requested-outcome", source: "USER", requestQuote: context.objective,
      description: `Only the package.json version value changes from ${JSON.stringify(packageChange.before)} to ${JSON.stringify(packageChange.after)}.` });
  } else if (context.operationClass !== "READ") {
    unknowns.push(unknown("success-criteria", "Specify the observable result and verification criteria for the requested change or execution.", "An implementation plan needs explicit acceptance criteria; 'fix the bug' alone is insufficient."));
  }
  if (heroChange) successCriteria.push({ id: "hero-text-only", source: "RUNTIME",
    description: "Exactly one index.html text-node change, preserving all other bytes. Require a fresh preimage check, explicit approval, verified write and dependent Runtime read-back matching the exact approved content." });
  if (packageChange) successCriteria.push({ id: "package-version-only", source: "USER", requestQuote: packageChange.preservation,
    description: "Preserve all other package.json content, property order and formatting; verify the requested version value and preservation through authorized read-back after approved execution." });
  if (usable.length === 0 && unknowns.length === 0) unknowns.push(unknown("source-evidence", "Provide relevant evidence for the proposed work.", "Engineering planning requires grounded information."));
  return {
    intent: [...context.userIntent], objective: context.objective,
    scope: [
      ...(context.projectId ? [{ id: "project", kind: "PROJECT" as const, reference: context.projectId, evidenceRefs: [] }] : []),
      ...usable.map((e, i) => ({ id: `scope-${i + 1}`, kind: "EVIDENCE" as const, reference: e.relativePath ?? e.sourceId, evidenceRefs: [evidenceIdentity(e)] }))
    ],
    constraints, expectedOutcome: { description: acceptance ?? "A grounded understanding and proposed plan for the stated request, with unresolved information explicit.", source: acceptance ? "USER" : "RUNTIME" },
    successCriteria, facts: [], inferences: [], hypotheses: [], unknowns, evidenceRefs,
    evidenceGaps: unknowns.filter(u => u.id.includes("evidence") || u.id === "target-project").map(u => ({ requirementId: u.id, evidenceRefs: [] })),
    confidence: "LOW", readiness: readiness(unknowns)
  };
}

function readiness(unknowns: AgentInformationRequirement[]): AgentUnderstanding["readiness"] {
  const unresolved = unknowns.filter(u => u.state === "UNKNOWN");
  if (unresolved.some(u => u.id === "target-project")) return "INSUFFICIENT_CONTEXT";
  if (unresolved.some(u => u.id.includes("evidence"))) return "NEEDS_EVIDENCE";
  return unresolved.length ? "NEEDS_CLARIFICATION" : "UNDERSTANDING_READY";
}

/** No prose/fence recovery. Bound text and nesting before JSON allocation/validation. */
export function parsePlanningProposal(raw: string, concrete = false): { proposal?: AgentPlanningProposal; issues: Issue[] } {
  return parseProposal(raw, concrete ? AGENT_ENGINEERING_PLAN_SCHEMA : AGENT_PLANNING_SCHEMA) as { proposal?: AgentPlanningProposal; issues: Issue[] };
}
export function parseUnderstandingProposal(raw: string): { proposal?: AgentUnderstandingProposal; issues: Issue[] } {
  return parseProposal(raw, AGENT_UNDERSTANDING_SCHEMA) as { proposal?: AgentUnderstandingProposal; issues: Issue[] };
}
function parseProposal(raw: string, schema: Schema): { proposal?: unknown; issues: Issue[] } {
  const issues: Issue[] = [];
  if (typeof raw !== "string" || raw.length > PLANNING_LIMITS.responseChars) return { issues: [{ code: "OUTPUT_BOUND", path: "$" }] };
  let depth = 0, quoted = false, escaped = false;
  for (const c of raw) {
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") { if (++depth > PLANNING_LIMITS.depth) return { issues: [{ code: "OUTPUT_DEPTH", path: "$" }] }; }
    else if (c === "}" || c === "]") depth--;
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { issues: [{ code: "INVALID_JSON", path: "$" }] }; }
  validateSchema(value, schema, "$", issues, schema === AGENT_ENGINEERING_PLAN_SCHEMA, schema === AGENT_UNDERSTANDING_SCHEMA);
  return issues.length ? { issues } : { proposal: value, issues };
}

function validateSchema(value: unknown, schema: Schema, path: string, issues: Issue[], diagnoseStrings = false, diagnoseReportStrings = false): void {
  if (issues.length >= PLANNING_LIMITS.issues) return;
  if (schema.type === "string") {
    if (typeof value !== "string" || !value.trim() || value.length > schema.maxLength! ||
      (schema.enum && !schema.enum.includes(value)) || (schema.pattern && !new RegExp(schema.pattern).test(value))) add(issues, "SCHEMA_STRING", path, diagnoseStrings ? {
        presence: value === undefined ? "missing" : "present",
        valueKind: value === null ? "null" : Array.isArray(value) ? "array" : typeof value as PlanningStringDiagnostic["valueKind"],
        ...(typeof value === "string" ? { trimmedEmpty: !value.trim(), characterCount: value.length } : {})
      } : undefined);
    const issue = issues.find(i => i.path === path && i.code === "SCHEMA_STRING");
    if (diagnoseReportStrings && issue && typeof value === "string" && (!value.trim() || value.length > schema.maxLength!)) {
      issue.stringPredicate = { reason: !value.trim() ? "BLANK" : "MAX_LENGTH", characterCount: Math.min(value.length, PLANNING_LIMITS.responseChars),
        countTruncated: value.length > PLANNING_LIMITS.responseChars, maxLength: schema.maxLength! };
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > schema.maxItems!) { add(issues, "SCHEMA_ARRAY", path); return; }
    value.forEach((v, i) => validateSchema(v, schema.items!, `${path}[${i}]`, issues, diagnoseStrings, diagnoseReportStrings));
  } else {
    if (!value || typeof value !== "object" || Array.isArray(value)) { add(issues, "SCHEMA_OBJECT", path); return; }
    const record = value as Record<string, unknown>;
    // Do not reflect attacker-controlled property names into event diagnostics.
    if (Object.keys(record).some(k => !Object.prototype.hasOwnProperty.call(schema.properties, k))) add(issues, "ADDITIONAL_PROPERTY", path);
    for (const [key, child] of Object.entries(schema.properties!)) {
      if (record[key] === undefined && !schema.required?.includes(key)) continue;
      validateSchema(record[key], child, `${path}.${key}`, issues, diagnoseStrings, diagnoseReportStrings);
    }
  }
}

export function notReady(understanding: AgentUnderstanding, code: string): AgentPlanningResult {
  const u: AgentUnderstanding = code === "NEEDS_INFORMATION" ? understanding : { ...understanding,
    readiness: "INSUFFICIENT_CONTEXT", confidence: "LOW", unknowns: [...understanding.unknowns,
      unknown("planning-output", "Obtain a complete, valid structured planning proposal.", "The reasoning proposal could not be verified; no fallback plan was fabricated.")].slice(0, PLANNING_LIMITS.items) };
  return result(u, [], [{ code, path: "$" }]);
}

/** Untrusted model JSON enters here only after bounded schema validation. */
function groundedUnderstanding(base: AgentUnderstanding, proposal: AgentUnderstandingProposal,
  visibleEvidence: ReadonlyMap<string, string>, stepIds: Array<{ id: string }> = []) {
  const u: AgentUnderstanding = { ...base, facts: [], inferences: [], hypotheses: [], unknowns: [...base.unknowns] };
  const issues: Issue[] = [];
  if (!u.objective.trim()) add(issues, "OBJECTIVE_REQUIRED");
  if (u.constraints.some(c => c.rule === "UNRESOLVED" || c.source === "INFERRED")) add(issues, "CONSTRAINT_UNRESOLVED");
  const ids = new Set<string>(u.unknowns.map(item => item.id));
  for (const group of [proposal.facts, proposal.inferences, proposal.hypotheses, proposal.unknowns, stepIds]) {
    for (const item of group) { if (ids.has(item.id)) add(issues, "DUPLICATE_ID"); ids.add(item.id); }
  }
  if (proposal.constraintIds.length !== u.constraints.length || new Set(proposal.constraintIds).size !== proposal.constraintIds.length ||
      u.constraints.some(c => !proposal.constraintIds.includes(c.id))) add(issues, "CONSTRAINTS_NOT_ACKNOWLEDGED");
  const evidence = new Set(u.evidenceRefs);
  for (const [index, fact] of proposal.facts.entries()) {
    const body = visibleEvidence.get(fact.evidenceRef);
    const start = body?.indexOf(fact.text) ?? -1;
    if (!evidence.has(fact.evidenceRef) || start < 0) add(issues, "UNSUPPORTED_FACT", `$.facts[${index}]`, undefined,
      { evidenceReferenceAdmitted: evidence.has(fact.evidenceRef), exactSubstringMatch: start >= 0 });
    else u.facts.push({ ...fact, kind: "SOURCE_EXCERPT", start, end: start + fact.text.length });
  }
  const factIds = new Set(u.facts.map(f => f.id));
  for (const [index, inference] of proposal.inferences.entries()) {
    if (!inference.factIds.length || inference.factIds.some(id => !factIds.has(id))) add(issues, "UNSUPPORTED_INFERENCE", `$.inferences[${index}]`, undefined,
      { factIdsValid: false });
    else u.inferences.push(inference);
  }
  for (const [index, hypothesis] of proposal.hypotheses.entries()) {
    if (hypothesis.evidenceRefs.some(ref => !evidence.has(ref))) add(issues, "UNKNOWN_EVIDENCE", `$.hypotheses[${index}]`);
    else u.hypotheses.push(hypothesis);
  }
  if (u.unknowns.length + proposal.unknowns.length > PLANNING_LIMITS.items) add(issues, "INFORMATION_BOUND");
  for (const item of proposal.unknowns.slice(0, Math.max(0, PLANNING_LIMITS.items - u.unknowns.length))) {
    u.unknowns.push({ ...item, state: "UNKNOWN" });
  }
  if (!u.facts.length && !u.unknowns.some(i => i.id === "source-evidence")) {
    add(issues, "FACT_REQUIRED");
  }
  return { understanding: u, issues };
}

/** Same excerpt/provenance validator as planning; unknowns do not invent a plan. */
export function validateUnderstandingProposal(base: AgentUnderstanding, proposal: AgentUnderstandingProposal,
  visibleEvidence: ReadonlyMap<string, string>, sourceOnlyInspection = false, generalReview = false) {
  const issues: Issue[] = [];
  validateSchema(proposal, AGENT_UNDERSTANDING_SCHEMA, "$", issues);
  if (issues.length) return { understanding: { ...base, facts: [], inferences: [], hypotheses: [] }, issues };
  const checked = groundedUnderstanding(base, proposal, visibleEvidence);
  const u = checked.understanding;
  // Optional appearance uncertainty stays UNKNOWN; it is not source evidence and
  // cannot block a bounded source-only inspection. Server-required gaps remain required.
  u.readiness = readiness(u.unknowns.filter(item => !(((sourceOnlyInspection && item.evidenceCategory === "OPTIONAL_VISUAL") ||
    (generalReview && item.evidenceCategory === "OPTIONAL_CONTEXT" && item.severity === "LOW")) &&
    !base.unknowns.some(required => required.id === item.id))));
  if (checked.issues.length) u.readiness = "NEEDS_EVIDENCE";
  u.confidence = checked.issues.length || u.readiness !== "UNDERSTANDING_READY" ? "LOW" :
    u.inferences.length || u.hypotheses.length || !u.evidenceRefs.every(ref => u.facts.some(f => f.evidenceRef === ref)) ? "MEDIUM" : "HIGH";
  return checked;
}

export function validatePlanningProposal(base: AgentUnderstanding, proposal: AgentPlanningProposal,
  visibleEvidence: ReadonlyMap<string, string>, concrete = false): AgentPlanningResult {
  const schemaIssues: Issue[] = [];
  validateSchema(proposal, concrete ? AGENT_ENGINEERING_PLAN_SCHEMA : AGENT_PLANNING_SCHEMA, "$", schemaIssues);
  if (schemaIssues.length) {
    const failure = notReady(base, "INVALID_PROPOSAL");
    failure.plan.validation.issues = schemaIssues;
    return failure;
  }
  const { understanding: u, issues } = groundedUnderstanding(base, proposal, visibleEvidence, proposal.steps);
  const evidence = new Set(u.evidenceRefs);
  if (!proposal.steps.length) add(issues, "STEPS_REQUIRED");
  const steps: AgentPlannedStep[] = [];
  const stepIds = new Set(proposal.steps.map(s => s.id));
  const missingIds = new Set(u.unknowns.map(i => i.id));
  const scopeIds = new Set(u.scope.map(s => s.id));
  const criteriaIds = new Set(u.successCriteria.map(c => c.id));
  const heroConstraints = u.constraints.filter(c => c.rule === "HERO_TITLE_TEXT_ONLY");
  const packageConstraints = u.constraints.filter(c => c.rule === "PACKAGE_VERSION_ONLY");
  for (const constraint of packageConstraints) {
    const change = constraint.packageVersionChange, body = change && visibleEvidence.get(change.evidenceRef);
    if (!change || body === undefined || packageVersionSource(body, change.before) !== change.versionExcerpt ||
      !u.facts.some(f => f.evidenceRef === change.evidenceRef && f.text.includes(change.versionExcerpt))) add(issues, "PACKAGE_VERSION_SOURCE_REQUIRED");
    const writes = proposal.steps.filter(s => s.type === "IMPLEMENT" && s.effect === "WRITE");
    if (writes.length !== 1 || !proposal.steps.some(s => s.type === "VERIFY" && s.effect === "READ_ONLY" &&
      s.dependencies.includes(writes[0]?.id) && s.verificationCriterionIds.includes("package-version-only"))) add(issues, "PACKAGE_VERSION_VERIFICATION_REQUIRED");
  }
  for (const constraint of heroConstraints) {
    const change = constraint.textChange, body = change && visibleEvidence.get(change.evidenceRef);
    if (!change || body === undefined || !heroConstrainedResult(body, change) ||
      !u.facts.some(f => f.evidenceRef === change.evidenceRef && f.text.includes(change.titleExcerpt))) add(issues, "HERO_SOURCE_REQUIRED");
    const writes = proposal.steps.filter(s => s.type === "IMPLEMENT" && s.effect === "WRITE");
    if (writes.length !== 1 || !proposal.steps.some(s => s.type === "VERIFY" && s.effect === "READ_ONLY" &&
      s.dependencies.includes(writes[0]?.id) && s.verificationCriterionIds.includes("hero-text-only"))) add(issues, "HERO_VERIFICATION_REQUIRED");
  }
  for (const [index, s] of proposal.steps.entries()) {
    const p = `$.steps[${index}]`;
    for (const constraint of packageConstraints) {
      const change = constraint.packageVersionChange;
      if (!change || s.scopeRefs.some(id => !u.scope.some(scope => scope.id === id && scope.kind === "EVIDENCE" &&
        scope.reference === change.relativePath && scope.evidenceRefs.includes(change.evidenceRef))) ||
        !s.evidenceRefs.includes(change.evidenceRef) || s.evidenceRefs.some(ref => ref !== change.evidenceRef) ||
        ["EXECUTE", "DESTRUCTIVE"].includes(s.effect) || (s.effect === "WRITE" && s.type !== "IMPLEMENT") ||
        (["IMPLEMENT", "VERIFY"].includes(s.type) && !s.verificationCriterionIds.includes("package-version-only"))) add(issues, "PACKAGE_VERSION_SCOPE_VIOLATION", p);
    }
    for (const constraint of heroConstraints) {
      const change = constraint.textChange;
      if (!change || s.scopeRefs.some(id => !u.scope.some(scope => scope.id === id && scope.kind === "EVIDENCE" &&
          scope.reference === change.relativePath && scope.evidenceRefs.includes(change.evidenceRef))) ||
        !s.evidenceRefs.includes(change.evidenceRef) || s.evidenceRefs.some(ref => ref !== change.evidenceRef) ||
        ["EXECUTE", "DESTRUCTIVE"].includes(s.effect) || (s.effect === "WRITE" && s.type !== "IMPLEMENT") ||
        (["IMPLEMENT", "VERIFY"].includes(s.type) && !s.verificationCriterionIds.includes("hero-text-only"))) add(issues, "HERO_SCOPE_VIOLATION", p);
    }
    if (s.dependencies.some(id => !stepIds.has(id))) add(issues, "INVALID_DEPENDENCY", p);
    if (new Set(s.dependencies).size !== s.dependencies.length) add(issues, "DUPLICATE_DEPENDENCY", p);
    if (s.evidenceRefs.some(ref => !evidence.has(ref))) add(issues, "UNKNOWN_EVIDENCE", p);
    if (!s.evidenceRefs.length && !s.missingInformationIds.length) add(issues, "UNGROUNDED_STEP", p);
    if (s.missingInformationIds.some(id => !missingIds.has(id))) add(issues, "UNKNOWN_INFORMATION", p);
    if (!s.scopeRefs.length || s.scopeRefs.some(id => !scopeIds.has(id))) add(issues, "INVALID_SCOPE", p);
    if (s.evidenceRefs.some(ref => !u.scope.some(scope => s.scopeRefs.includes(scope.id) && scope.evidenceRefs.includes(ref)))) add(issues, "EVIDENCE_OUTSIDE_SCOPE", p);
    if (s.verificationCriterionIds.some(id => !criteriaIds.has(id))) add(issues, "INVALID_CRITERION", p);
    if (s.type === "IMPLEMENT" && (!s.verificationCriterionIds.includes("requested-outcome") || s.effect === "READ_ONLY")) add(issues, "IMPLEMENTATION_VERIFICATION_REQUIRED", p);
    if (s.type !== "IMPLEMENT" && s.type !== "VERIFY" && s.effect !== "READ_ONLY") add(issues, "INCONSISTENT_EFFECT", p);
    const purposes: Record<AgentPlannedStep["type"], string[]> = { INSPECT: ["UNDERSTAND", "RESOLVE_GAPS"], ANALYZE: ["UNDERSTAND", "RESOLVE_GAPS"], PROPOSE: ["PROPOSE_CHANGE"], IMPLEMENT: ["PROPOSE_CHANGE"], VERIFY: ["CHECK_OUTCOME"] };
    if (!purposes[s.type].includes(s.purpose)) add(issues, "INCONSISTENT_PURPOSE", p);
    if (s.dependencyStatus === "UNKNOWN") {
      add(issues, "DEPENDENCIES_UNRESOLVED", p);
      if (u.unknowns.length < PLANNING_LIMITS.items) u.unknowns.push(unknown(`dependencies-${s.id}`,
        "Establish the prerequisites for the proposed step.", "Execution ordering cannot be inferred from unresolved dependencies."));
    }
    if (s.type === "IMPLEMENT" && !u.intent.some(i => i === "MODIFY" || i === "PLAN")) add(issues, "ACTION_OUTSIDE_REQUEST", p);
    if (s.effect === "EXECUTE" && !u.intent.some(i => ["EXECUTE", "VERIFY", "TEST", "MODIFY", "PLAN"].includes(i))) add(issues, "ACTION_OUTSIDE_REQUEST", p);
    if (s.effect === "DESTRUCTIVE") add(issues, "DESTRUCTIVE_ACTION_REQUIRES_SEPARATE_REVIEW", p);
    if (u.constraints.some(c => (c.rule === "NO_WRITE" && ["WRITE", "DESTRUCTIVE"].includes(s.effect)) ||
        (c.rule === "NO_EXECUTE" && s.effect === "EXECUTE") || (c.rule === "NO_DESTRUCTIVE" && s.effect === "DESTRUCTIVE"))) add(issues, "CONSTRAINT_VIOLATION", p);
    // Controlled action/purpose vocabulary prevents prose from hiding executed/destructive actions.
    const purposeText: Record<string, string> = { UNDERSTAND: "Interpret the referenced evidence for the stated request.",
      RESOLVE_GAPS: "Identify the information needed to resolve evidence gaps.", PROPOSE_CHANGE: "Describe a proposed change against the stated objective and constraints.",
      CHECK_OUTCOME: "Describe verification against the stated success criteria." };
    // Descriptions never become executable input, capability IDs, or authority.
    for (const description of [s.description, s.verificationDescription]) if (description !== undefined &&
      /[\r\n\x00-\x1f]|```|\$\(|&&|\|\||(?:^|\s)(?:powershell|pwsh|cmd\.exe|bash|sh)\s+[-/]/i.test(description)) add(issues, "EXECUTABLE_DESCRIPTION", p);
    steps.push({ id: s.id, type: s.type, objective: s.description ?? purposeText[s.purpose], purpose: purposeText[s.purpose],
      input: {}, expectedResult: s.verificationDescription ?? u.expectedOutcome.description, dependencies: [...s.dependencies], status: "PLANNED",
      requiredEvidence: [...s.evidenceRefs], missingInformationIds: [...s.missingInformationIds], scopeRefs: [...s.scopeRefs],
      effect: s.effect, risk: s.effect === "DESTRUCTIVE" ? "HIGH" : s.effect === "READ_ONLY" ? "LOW" : "MEDIUM",
      verificationRequired: s.type === "IMPLEMENT" || s.type === "VERIFY", verification: { status: "PLANNED", criterionIds: [...s.verificationCriterionIds] } });
  }
  // Stable topological order. Never accept an unknown edge or a cycle, including self edges.
  const ordered: AgentPlannedStep[] = [], done = new Set<string>();
  while (ordered.length < steps.length) {
    const next = steps.find(s => !done.has(s.id) && s.dependencies.every(id => done.has(id)));
    if (!next) { add(issues, "DEPENDENCY_CYCLE_OR_INVALID"); break; }
    ordered.push(next); done.add(next.id);
  }
  if (!u.successCriteria.length) {
    add(issues, "SUCCESS_CRITERIA_REQUIRED");
    if (u.unknowns.length < PLANNING_LIMITS.items && !u.unknowns.some(i => i.id === "success-criteria")) {
      u.unknowns.push(unknown("success-criteria", "Specify observable acceptance criteria.", "Verification cannot be planned without success criteria."));
    }
  }
  u.readiness = readiness(u.unknowns);
  if (issues.some(i => ["UNSUPPORTED_FACT", "UNSUPPORTED_INFERENCE", "FACT_REQUIRED"].includes(i.code))) u.readiness = "NEEDS_EVIDENCE";
  // Qualitative coverage only: HIGH requires grounded facts, no open requirements, and no hypotheses.
  u.confidence = issues.length || u.readiness !== "UNDERSTANDING_READY" ? "LOW" :
    u.inferences.length || u.hypotheses.length || !u.evidenceRefs.every(ref => u.facts.some(f => f.evidenceRef === ref)) ? "MEDIUM" : "HIGH";
  return result(u, issues.length ? steps : ordered, issues);
}

function result(u: AgentUnderstanding, steps: AgentPlannedStep[], issues: Issue[]): AgentPlanningResult {
  const ready = !issues.length && u.readiness === "UNDERSTANDING_READY" && steps.length > 0;
  return { version: 1, understanding: u, plan: {
    objective: u.objective, assumptions: u.hypotheses.map(h => ({ id: h.id, description: h.text, status: "UNVERIFIED" })),
    constraints: u.constraints, steps: steps.map(step => ({ ...step, status: ready ? "PLANNED" : "BLOCKED" })), missingInformation: u.unknowns,
    stopConditions: ["Execution authorization is outside Phase 4.", "Stop when required evidence, constraints or acceptance criteria are unresolved.", "Revalidate when the request or evidence changes."],
    successCriteria: u.successCriteria, readiness: ready ? "PLAN_READY" : "PLAN_NOT_READY", authorization: "NOT_GRANTED",
    validation: { valid: issues.length === 0, issues }
  } };
}
