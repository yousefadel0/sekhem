import { toolDigest } from "../tools/tool-contract";
import { evidenceIdentity, type AgentContext, type AgentUnderstanding } from "../understanding/agent-understanding.types";
import { PLANNING_LIMITS, type AgentUnderstandingProposal } from "../understanding/agent-planning.contract";
import type { RuntimeEvidenceReference, WorkspaceBinding } from "../../workspace-intelligence/workspace-runtime.contract";

export interface GroundingClaim {
  text: string;
  status: "SOURCE_EXCERPT" | "EVIDENCE_LINKED_INFERENCE" | "UNGROUNDED";
  optional: boolean;
  reason?: string;
  /** Internal diagnostics only: rejected citations never become certified sources. Finding text remains in text. */
  rejectionDiagnostic?: {
    code: string;
    citationsTruncated: boolean;
    citations: Array<{
      token: string; evidenceRef: string; sourceId: string; receiptId: string; relativePath: string;
      lineStart: number; lineEnd: number; start: number; end: number;
      excerpt: string; excerptLength: number; excerptDigest: string; excerptTruncated: boolean;
    }>;
  };
  sources: Array<{ evidenceRef: string; relativePath: string; lineStart: number; lineEnd: number; start: number; end: number;
    excerpt: string; visibleTextDigest: string; runtimeReference: RuntimeEvidenceReference }>;
}
export interface InspectionGrounding { version: 1; claims: GroundingClaim[]; complete: boolean }
export interface CitationSource { token: string; path: string; body: string; operation: string; evidenceRef: string; reference: RuntimeEvidenceReference }

/** Only freshly admitted Runtime observations are eligible. Model text never supplies coordinates or identity. */
export function citationSources(context: AgentContext, visible: ReadonlyMap<string, string>, binding: WorkspaceBinding): CitationSource[] {
  return context.evidence.flatMap(e => {
    const r = e.runtimeReference, body = visible.get(evidenceIdentity(e));
    if (!r || e.status !== "COLLECTED" || !["filesystem.read", "filesystem.list", "filesystem.search"].includes(String(e.metadata.operation)) || !body?.trim() ||
      e.provenance !== `runtime:${r.receiptId}` || e.relativePath !== r.relativePath || e.sourceId !== r.operationId ||
      r.verificationState !== "VERIFIED" || r.sourceType !== "runtime-workspace" || r.encoding !== "utf-8-decoded" ||
      toolDigest(e.metadata.runtimeEvidence) !== toolDigest(r) || !e.content?.text.startsWith(body) ||
      r.workspaceId !== binding.workspaceId || r.bindingVersion !== binding.version || r.runtimeId !== binding.runtimeId ||
      r.runtimeFingerprint !== binding.runtimeFingerprint || r.userId !== context.userId || r.projectId !== context.projectId ||
      r.organizationId !== binding.organizationId || (r.conversationId !== context.conversationId && r.conversationId !== context.transferredEvidenceConversationId) ||
      toolDigest(r.contentIdentity) !== toolDigest({ status: "UNAVAILABLE" })) return [];
    return [{ token: `S${toolDigest({ reference: r, body }).slice(0, 16)}`, path: r.relativePath || ".", body, operation: String(e.metadata.operation), evidenceRef: e.provenance, reference: r }];
  });
}

/** Handles are tied to receipt + visible content, never reused ordinal numbers from conversation history. */
export function citationCatalog(sources: CitationSource[]) {
  return sources.map(s => {
    const end = s.body.length <= PLANNING_LIMITS.text ? s.body.trimEnd().split("\n").length : 1;
    // Bounded navigation hints use actual source offsets, never guessed line numbers.
    // They are observations, not a semantic outline or a replacement evidence body.
    const anchors = [...s.body.matchAll(/<title\b[^>]*>[\s\S]*?<\/title\s*>|<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]\s*>|<section\b[^>]*>/gi)]
      .filter(m => m[0].length <= PLANNING_LIMITS.text).slice(0, PLANNING_LIMITS.items).flatMap(m => {
        const first = s.body.slice(0, m.index).split("\n").length, last = first + m[0].split("\n").length - 1;
        const excerpt = s.body.split("\n").slice(first - 1, last).join("\n");
        return excerpt.length <= PLANNING_LIMITS.text ? [{ citation: `[${s.path}:L${first}-L${last}](evidence:${s.token})`, excerpt }] : [];
      });
    // Non-HTML sources need the same exact-copy interface. Pack contiguous whole
    // lines from the admitted visible body; never paraphrase, normalize or splice
    // fragments. These are bounded navigation hints, not whole-file coverage.
    if (!anchors.length) {
      const lines = s.body.split("\n");
      let first = 0;
      while (first < lines.length && anchors.length < PLANNING_LIMITS.items) {
        if (lines[first].length > PLANNING_LIMITS.text) { first++; continue; }
        let last = first, excerpt = lines[first];
        while (last + 1 < lines.length && excerpt.length + 1 + lines[last + 1].length <= PLANNING_LIMITS.text) {
          excerpt += "\n" + lines[++last];
        }
        if (excerpt.trim()) anchors.push({ citation: `[${s.path}:L${first + 1}-L${last + 1}](evidence:${s.token})`, excerpt });
        first = last + 1;
      }
    }
    return { path: s.path, operation: s.operation, lines: s.body.split("\n").length,
      citation: `[${s.path}:L1${end > 1 ? `-L${end}` : ""}](evidence:${s.token})`, ...(anchors.length ? { anchors } : {}) };
  });
}

/** A citation certifies an exact excerpt relationship, not semantic truth of an arbitrary paraphrase. */
export function groundInspectionConversation(text: string, sources: CitationSource[], base: AgentUnderstanding) {
  const proposal: AgentUnderstandingProposal = { constraintIds: base.constraints.map(c => c.id), facts: [], inferences: [], hypotheses: [], unknowns: [] };
  const claims: GroundingClaim[] = [];
  const factsByExcerpt = new Map<string, string>();
  const excerptIdentity = (source: GroundingClaim["sources"][number]) => toolDigest({
    reference: source.runtimeReference, visibleTextDigest: source.visibleTextDigest, start: source.start, end: source.end
  });
  const link = /\[([^\]\r\n]+):L([1-9]\d*)(?:-L?([1-9]\d*))?\]\(evidence:(S[0-9a-f]{16})\)/g;
  // Headings are presentation, not claims. Uncertain notes are explicitly outside certified scope.
  // A heading can be directly adjacent to a finding without a blank line.
  // Remove only standalone Markdown heading lines; keep every substantive claim.
  const body = text.split("\n").filter(line => !/^\s{0,3}#{1,6}\s+[^\n]+$/.test(line)).join("\n");
  const paragraphs = body.split(/\n\s*\n|\n(?=[-*] )/).map(p => p.trim()).filter(Boolean);
  let bounded = text.length <= PLANNING_LIMITS.responseChars;
  for (const paragraph of paragraphs) {
    if (claims.length >= PLANNING_LIMITS.items) { bounded = false; break; }
    const citations = [...paragraph.matchAll(link)];
    const natural = paragraph.replace(link, "").replace(/^[*-] /, "").trim();
    const optional = /^(?:\*\*)?Uncertain:(?:\*\*)?\s/i.test(natural);
    const claim: GroundingClaim = { text: natural.slice(0, PLANNING_LIMITS.text), status: "UNGROUNDED", optional, sources: [] };
    const diagnosticCitations: NonNullable<GroundingClaim["rejectionDiagnostic"]>["citations"] = [];
    const observedOperations = new Set<string>();
    const retainRejection = () => {
      claim.rejectionDiagnostic = { code: claim.reason!, citationsTruncated: citations.length > PLANNING_LIMITS.items,
        citations: diagnosticCitations };
    };
    claims.push(claim);
    if (!natural || natural.length > PLANNING_LIMITS.text) { claim.reason = "CLAIM_BOUND"; bounded = false; continue; }
    if (optional) { claim.reason = "MODEL_UNCERTAINTY"; continue; }
    if (!citations.length) { claim.reason = "MISSING_EVIDENCE_REFERENCE"; retainRejection(); continue; }
    if (paragraph.replace(link, "").includes("evidence:")) { claim.reason = "INVALID_CITATION"; continue; }
    for (const citation of citations) {
      const source = sources.find(s => s.token === citation[4]), first = Number(citation[2]), last = Number(citation[3] ?? citation[2]);
      if (!source || source.path !== citation[1]) { claim.reason = "EVIDENCE_REFERENCE_MISMATCH"; break; }
      const lines = source.body.split("\n");
      if (!Number.isSafeInteger(last) || last < first || last > lines.length) { claim.reason = "EXCERPT_RANGE_INVALID"; break; }
      const start = lines.slice(0, first - 1).reduce((n, line) => n + line.length + 1, 0);
      const excerpt = lines.slice(first - 1, last).join("\n");
      const diagnostic = { token: source.token, evidenceRef: source.evidenceRef, sourceId: source.reference.operationId,
        receiptId: source.reference.receiptId, relativePath: source.reference.relativePath,
        lineStart: first, lineEnd: last, start, end: start + excerpt.length,
        excerpt: excerpt.slice(0, PLANNING_LIMITS.text), excerptLength: excerpt.length,
        excerptDigest: toolDigest(excerpt), excerptTruncated: excerpt.length > PLANNING_LIMITS.text };
      if (diagnosticCitations.length < PLANNING_LIMITS.items) diagnosticCitations.push(diagnostic);
      if (!excerpt.trim() || excerpt.length > PLANNING_LIMITS.text) {
        // Keep the offending range even when earlier citations filled the diagnostic bound.
        if (citations.length > PLANNING_LIMITS.items) diagnosticCitations[diagnosticCitations.length - 1] = diagnostic;
        claim.reason = "EXCERPT_BOUND"; retainRejection(); break;
      }
      claim.sources.push({ evidenceRef: source.evidenceRef, relativePath: source.reference.relativePath, lineStart: first, lineEnd: last, start,
        end: start + excerpt.length, excerpt, visibleTextDigest: toolDigest(source.body), runtimeReference: source.reference });
      if (["filesystem.read", "filesystem.list", "filesystem.search"].includes(source.operation)) {
        observedOperations.add(source.operation);
      }
    }
    if (claim.reason) { claim.sources = []; continue; }
    // A synthesis may cite the same exact observation again; the strict fact bound counts distinct excerpts.
    claim.sources = [...new Map(claim.sources.map(s => [excerptIdentity(s), s])).values()];
    const exact = claim.sources.length === 1 && natural === claim.sources[0].excerpt;
    if (!exact && claim.sources.some(s => !/[\p{L}\p{N}_]/u.test(s.excerpt))) {
      claim.reason = "EXCERPT_NO_CONTENT"; claim.sources = []; continue;
    }
    // A valid receipt/range is not support for a quoted title, identifier or code
    // absent from that range. This is literal consistency, not semantic entailment.
    const details = [...natural.matchAll(/`([^`\n]+)`|"([^"\n]+)"|“([^”\n]+)”|\(#[A-Za-z][\w-]*\)/g)]
      .map(m => m[1] ?? m[2] ?? m[3] ?? m[0].slice(1, -1));
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    if (!exact && details.some(detail => !claim.sources.some(s => {
      const plain = normalize(s.excerpt.replace(/<[^>]*>/g, ""));
      return s.excerpt.includes(detail) || plain.includes(normalize(detail)) ||
        detail === s.relativePath || observedOperations.has(detail) || (/^#[A-Za-z][\w-]*$/.test(detail) &&
          new RegExp(`\\bid\\s*=\\s*["']${detail.slice(1)}["']`).test(s.excerpt));
    }))) { claim.reason = "CITED_DETAIL_NOT_IN_EXCERPT"; retainRejection(); claim.sources = []; continue; }
    const newFacts = claim.sources.filter(s => !factsByExcerpt.has(excerptIdentity(s)));
    if (proposal.facts.length + newFacts.length > PLANNING_LIMITS.items) { claim.reason = "EXCERPT_BOUND"; retainRejection(); claim.sources = []; bounded = false; continue; }
    const factIds = claim.sources.map(s => {
      const key = excerptIdentity(s), existing = factsByExcerpt.get(key);
      if (existing) return existing;
      const id = `citation-${proposal.facts.length + 1}`;
      factsByExcerpt.set(key, id);
      proposal.facts.push({ id, text: s.excerpt, evidenceRef: s.evidenceRef }); return id;
    });
    claim.status = exact ? "SOURCE_EXCERPT" : "EVIDENCE_LINKED_INFERENCE";
    if (claim.status === "EVIDENCE_LINKED_INFERENCE") proposal.inferences.push({ id: `finding-${claims.length}`, text: natural, factIds,
      uncertainty: "Model interpretation linked to verified source excerpts; semantic correctness is not mechanically proven. Only the cited observed scope is covered." });
  }
  const complete = bounded && proposal.facts.length > 0 && claims.every(c => c.status !== "UNGROUNDED" || c.optional);
  return { proposal, grounding: { version: 1 as const, claims, complete } };
}

export function groundingMessage(g: InspectionGrounding): string {
  return ["SEKHEM evidence check — inspected scope only:", ...g.claims.map((c, i) =>
    `- Finding ${i + 1}: ${c.status === "SOURCE_EXCERPT" ? "verified exact source excerpt" : c.status === "EVIDENCE_LINKED_INFERENCE" ? "source-linked model interpretation (not a verified fact)" : "ungrounded / uncertain"}${c.reason ? ` (${c.reason})` : ""}${c.sources.length ? ` — ${c.sources.map(s => `${s.relativePath || "."}:L${s.lineStart}-L${s.lineEnd}`).join(", ")}` : ""}.`),
    "Only the referenced excerpts are verified. Other claims, unread files, and semantic interpretations are not certified as facts."].join("\n");
}
