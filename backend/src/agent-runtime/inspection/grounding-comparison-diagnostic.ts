import { createHash } from "node:crypto";
import type { AgentUnderstandingProposal } from "../understanding/agent-planning.contract";

export const MISMATCH_CLASSES = ["REFERENCE_NOT_ADMITTED", "EVIDENCE_UNAVAILABLE", "LINE_ENDINGS_ONLY", "WHITESPACE_ONLY", "UNICODE_NORMALIZATION_ONLY", "HTML_ENTITY_DECODING_ONLY", "NON_VERBATIM"] as const;
export type FactComparisonDiagnostic = {
  classification: typeof MISMATCH_CLASSES[number];
  factLength: number; factFingerprint: string;
  sourceLength: number | null; sourceFingerprint: string | null;
};
export type InferenceSupportDiagnostic = { accepted: number; rejected: number; nonexistent: number; empty: boolean };
const fingerprint = (text: string) => createHash("sha256").update(text, "utf16le").digest("hex");

/** Diagnostic comparisons only. These transformations never feed admission or repair model values. */
export function factComparison(text: string, source: string | undefined, admitted: boolean): FactComparisonDiagnostic {
  const match = (transform: (s: string) => string) => source !== undefined && transform(source).includes(transform(text));
  const entities = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, e => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": "\u00a0" }[e]!));
  const classification = !admitted ? "REFERENCE_NOT_ADMITTED" : source === undefined ? "EVIDENCE_UNAVAILABLE" :
    match(s => s.replace(/\r\n?/g, "\n")) ? "LINE_ENDINGS_ONLY" :
    match(s => s.replace(/\s+/g, " ").trim()) ? "WHITESPACE_ONLY" :
    match(s => s.normalize("NFC")) ? "UNICODE_NORMALIZATION_ONLY" :
    match(entities) ? "HTML_ENTITY_DECODING_ONLY" : "NON_VERBATIM";
  return { classification, factLength: text.length, factFingerprint: fingerprint(text),
    sourceLength: source?.length ?? null, sourceFingerprint: source === undefined ? null : fingerprint(source) };
}

export function inferenceSupport(ids: string[], proposal: AgentUnderstandingProposal, accepted: ReadonlySet<string>): InferenceSupportDiagnostic {
  const declared = new Set(proposal.facts.map(f => f.id));
  return { accepted: ids.filter(id => accepted.has(id)).length,
    rejected: ids.filter(id => !accepted.has(id) && declared.has(id)).length,
    nonexistent: ids.filter(id => !declared.has(id) && !accepted.has(id)).length, empty: ids.length === 0 };
}
