import type { InspectionGrounding, CitationSource } from "./inspection-grounding";
import type { InspectionAction, InspectionOperation } from "./inspection.types";
import { excludedFromWorkspaceDiscovery, workspaceFileCategory } from "../../workspace-intelligence/workspace-discovery.policy";
import type { InspectionUnderstanding } from "./inspection.types";
import type { Recommendation } from "../../conversation/recommendation.contract";
import { PLANNING_LIMITS } from "../understanding/agent-planning.contract";

/** Render certified report fields only. The complete checkpoint/provenance stays in existing Details state. */
export function contentAnalysisMessage(checkpoint: InspectionUnderstanding, recommendation: Recommendation | undefined, objective: string): string {
  const arabic = /[\u0600-\u06ff]/.test(objective), u = checkpoint.understanding;
  const sections = [arabic ? "## ما قرأته في المشروع" : "## Observed in the project",
    ...u.facts.map(f => {
      const source = checkpoint.evidence.find(e => e.id === f.evidenceRef);
      return `- [${f.id}] ${f.text}` + (source ? `\n${arabic ? "المصدر" : "Source"}: ${source.label}` : "");
    })];
  if (u.inferences.length) sections.push(arabic ? "\n## فهمي للمشروع — استنتاجات" : "\n## Inferred understanding",
    ...u.inferences.map(i => `- ${i.text} (${i.uncertainty}) [${i.factIds.join(", ")}]`));
  if (recommendation) sections.push(arabic ? "\n## خطة التطوير المقترحة" : "\n## Proposed development recommendations", recommendation.title, recommendation.objective);
  if (u.hypotheses.length || u.unknowns.length) sections.push(arabic ? "\n## ما يحتاج مزيدًا من الفحص" : "\n## Unknown / needs further inspection",
    ...u.hypotheses.map(h => `- ${h.text} (${h.uncertainty})`), ...u.unknowns.map(q => `- ${q.description} ${q.whyNeeded}`));
  sections.push(arabic ? "\nالاستنتاجات والتوصيات ليست حقائق مثبتة. النطاق يقتصر على المصادر المقروءة؛ الملفات الأخرى لم تُفحص." : "\nInferences and recommendations are not verified facts. Scope is limited to the sources read; other files remain uninspected.",
    `Sources · ${checkpoint.evidence.filter(e => e.read).length}`);
  return sections.join("\n\n");
}

/** Response organization only: never supplies facts, authorizes changes or certifies completion. */
export const STRUCTURED_REVIEW_DELIVERY_INSTRUCTION = "For a structured project review, fulfil every requested deliverable and its requested count/order in currentInspectionScope. Do not reduce a requested multi-issue review to one or two findings. Number prioritized findings in report.inferences, linking each to supporting factIds and retaining uncertainty. Put proposed fixes and the requested roadmap in recommendation.objective, using numbered phase headings and a concise purpose/verification criterion for each requested phase. One recommendation envelope may contain multiple phases; it does not mean one phase. Keep the objective within its existing 1024-character limit by shortening prose, never by silently dropping requested phases. Do not invent extra defects to meet a count: explicitly state insufficient supported findings when necessary. A source-only review does not require live execution unless the current scope asks for it; unperformed live checks remain unknown outside that stage, never claimed as performed. Avoid duplicating source excerpts or repeating caveats in every field. ";

/** General project review chooses its own sources, but cannot wander through generated/hidden trees. */
export function contentAnalysisActionIssue(action: InspectionAction): string | undefined {
  const parts = action.relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some(part => part.startsWith(".") || excludedFromWorkspaceDiscovery(part))
    ? "INSPECTION_RELEVANT_SOURCE_REQUIRED" : undefined;
}

/** Narrow overview intent only; never an authorization or evidence decision. */
export function projectOverview(question: string, operationClass: string) {
  return operationClass === "READ" && /^(?:تمام\s+)?(?:what is this project about|explain (?:this |the )?project|understand this project|المشروع ده بيتكلم عن ايه|المشروع ده بيتكلم عن إيه|اشرحلي المشروع|اقرأ المشروع ده وافهم هو عبارة عن إيه، وقولي إيه أهم الأجزاء والوظائف اللي فيه)[?؟.!\s]*$/i.test(question.trim());
}
export const OVERVIEW_INSTRUCTION = "For this project-purpose question, prefer README.md after bounded discovery. Start with a targeted README.md read, or at most one non-recursive root listing to locate project documentation. Never list a child directory or perform a recursive search for an overview. Do not inspect hidden directories, dependencies, pnpm stores, generated output, build artifacts or caches. Once its current verified excerpts support the requested purpose and main parts, answer now with current citations and no action block. Do not inspect configuration files merely because they exist. If README lacks a required answer, identify the specific gap and request at most one additional targeted source: package.json or an equivalent manifest for a required stack question, relevant config, architecture documentation or a specific source entrypoint. Do not repeat completed reads. Missing evidence stays unknown; never claim sufficiency from a listing.";

/** Relevance/admission only; never supplies evidence, permission or a replacement model action. */
export function overviewActionIssue(action: InspectionAction, operations: InspectionOperation[], sources: CitationSource[]): string | undefined {
  const path = action.relativePath.replace(/\\/g, "/");
  const reads = operations.filter(o => o.action.tool === "filesystem.read");
  if (action.tool === "filesystem.list") {
    return path === "" && operations.length === 0 ? undefined : "INSPECTION_OVERVIEW_TARGET_REQUIRED";
  }
  if (action.tool !== "filesystem.read" || path.split("/").some(part => part.startsWith(".") || excludedFromWorkspaceDiscovery(part)))
    return "INSPECTION_OVERVIEW_TARGET_REQUIRED";
  if (reads.some(o => o.action.relativePath.toLowerCase() === path.toLowerCase())) return "INSPECTION_OVERVIEW_TARGET_REQUIRED";
  if (!reads.length) {
    // A verified listing may establish that README is absent; it never proves file contents.
    const listing = sources.find(s => s.operation === "filesystem.list" && s.path === "." && !s.reference.truncated);
    let files: string[] | undefined;
    try {
      const observed = listing && JSON.parse(listing.body);
      if (observed?.operation === "filesystem.list" && observed.path === "" && Array.isArray(observed.entries))
        files = observed.entries.filter((e: { type: string; path: string }) => e.type === "file").map((e: { path: string }) => e.path.toLowerCase());
    } catch { /* Incomplete listings cannot establish absence. */ }
    const readmeAbsent = !!files && !files.includes("readme.md");
    return path.toLowerCase() === "readme.md" || readmeAbsent && files!.includes(path.toLowerCase()) && workspaceFileCategory(path) === "manifest"
      ? undefined : "INSPECTION_OVERVIEW_README_REQUIRED";
  }
  return ["docs", "manifest", "config", "source"].includes(workspaceFileCategory(path))
    ? undefined : "INSPECTION_OVERVIEW_TARGET_REQUIRED";
}

/** Model-facing contract only. Certification remains exclusively in the unchanged validator. */
export const FINDING_EXCERPT_INSTRUCTION = `Build the answer anchor-by-anchor: copy a CURRENT anchor citation unchanged, then emit one paragraph of at most ${PLANNING_LIMITS.text} characters with that citation. The selected excerpt must also be at most ${PLANNING_LIMITS.text} characters. Never expand or merge ranges to cover a table, import block or whole Routes block. Split findings across independently cited bounded paragraphs. Do not emit an uncited table or bold pseudo-heading; use ## for presentation headings. If bounded excerpts cannot support the full requested answer, state the remaining gap as Uncertain: rather than claiming complete coverage. ` + "Construct each factual finding from ONE current sourceCitations anchor only. First select its exact citation and the exact contiguous excerpt at excerpt.slice(anchor.start, anchor.end); then write one short finding supported entirely by that excerpt. Do not compose the claim first and attach a convenient citation afterwards. " +
  "Every factual detail must be present in that selected excerpt. Do not add facts from memory, prior conversation, prior findings, filenames, nearby uncited lines, or model knowledge. A filename identifies a source; it does not prove its contents. Do not combine details from separate excerpts into one finding or cite one excerpt for details in another. Separate them into individually supported findings, or omit the unnecessary detail. " +
  "Copy quoted source text, identifiers, versions and evidence references verbatim, preserving whitespace. Do not put a translation or paraphrase inside quotation marks as if it occurred in the source. Natural-language explanations remain source-linked interpretations, not verified quotations. Omit every detail absent from the selected excerpt. Never fabricate a path, handle, range or reference. " +
  "For a small question without an explicit requested count, prefer one or two small, fully supported findings. For a requested review, preserve its required breadth and deliverables using separately supported findings. Do not add a duplicate concluding summary or historical tool/terminal results. Before returning, compare each detail against that finding's single excerpt; remove unsupported details, never repair the citation by guessing. " +
  "If the remaining supported findings cannot answer the current question, state insufficient evidence using a separate 'Uncertain:' paragraph describing the specific missing information. If another source is needed and the existing read allowance remains, include exactly one existing sekhem-action for that targeted read. Do not claim final completion, invent a new response schema, exceed the read ceiling, or ask for execution approval for a consent-covered read. If the allowance is exhausted, stop with the gap explicit.";

/** Hide rejected model claims, not the fact that the answer is incomplete. Detailed diagnostics remain durable. */
export function conversationalFindings(text: string, grounding: InspectionGrounding, objective: string) {
  const paragraphs = text.split(/\n\s*\n|\n(?=[-*] )/).map(p => p.trim()).filter(p => p && !/^#{1,6} [^\n]+$/.test(p));
  const supported = paragraphs.filter((_, index) => grounding.claims[index]?.status === "SOURCE_EXCERPT" || grounding.claims[index]?.status === "EVIDENCE_LINKED_INFERENCE" || grounding.claims[index]?.optional && grounding.claims[index]?.reason === "MODEL_UNCERTAINTY");
  if (!grounding.complete) supported.push(/[\u0600-\u06ff]/.test(objective)
    ? "لسه فيه معلومات مش متأكد منها من المصادر المقروءة، فمش هاعرضها كحقائق. تفاصيل التحقق متاحة في تفاصيل النشاط."
    : "Some requested information is not supported by the sources read so far. I have left those claims out; verification details are available in Activity details.");
  return supported.join("\n\n");
}
