import type { InspectionView } from "../agent-runtime/inspection/inspection.types";
import { workspaceFileReferences } from "../agent-runtime/workspace-intent";
import { toolDigest } from "../agent-runtime/tools/tool-contract";

export const REFERENCE_LIMIT = 5;
export type WorkspaceConcept = "navbar" | "hero" | "footer" | "style";
export interface WorkspaceReference {
  runId: string; concept: WorkspaceConcept; relativePath: string; evidenceId: string; factId?: string; factDigest?: string;
  workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string;
  certified: boolean;
  targetKind?: "HEADING";
}
export function normalizeWorkspaceLanguage(value: string): string {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").toLowerCase()
    .replace(/(?:^|\s)ال(?=(?:navbar|hero|footer|style|css)\b)/g, " ")
    .replace(/^(?:طيب|طب|please|now)\s+/, "").trim();
}
export function workspaceConcepts(value: string): WorkspaceConcept[] {
  const text = normalizeWorkspaceLanguage(value);
  return (["navbar", "hero", "footer", "style"] as const).filter(c => new RegExp("\\b" + (c === "style" ? "(?:styles?|css)" : c) + "\\b").test(text));
}
/** Explicit bound-root discovery, not an unresolved source-element pronoun. */
export function requestsProjectUnderstanding(value: string): boolean {
  if (value.length > 4000 || workspaceFileReferences(value).length) return false;
  return /^(?:(?:اقر[اأ]|افهم|راجع|حلل|افحص)\s+(?:المشروع|مساحة العمل)(?=\s|[،.!؟]|$)|(?:read|understand|review|inspect|analy[sz]e)\s+(?:(?:this|the|my)\s+)?(?:project|workspace|repository)(?=\s|[,.!?]|$))/i.test(normalizeWorkspaceLanguage(value));
}
export function naturalWorkspaceRequest(value: string, includeExplicitFiles = false): { concepts: WorkspaceConcept[]; modification: boolean; anaphora: boolean } | null {
  const text = normalizeWorkspaceLanguage(value);
  if (value.length > 4000 || (!includeExplicitFiles && workspaceFileReferences(value).length)) return null;
  const concepts = workspaceConcepts(text);
  const modification = /^(?:عدل|غير|modify|edit|change)\s+/.test(text) || /^(?:خليه|خليها|make\s+(?:it|that))\s+/.test(text);
  const reading = /^(?:حلل(?:لي)?|اقرأ|اقرا|بص على|افحص|read|inspect|analy[sz]e|look at|search|find|what (?:implements|controls|handles|is responsible for)|which (?:file|component))\s+/.test(text) ||
    /^(?:ايه|إيه)\s+اللي\s+مسؤول\s+عن\s+/.test(text);
  const anaphora = /(?:^|\s)(?:it|that|خليه|خليها|دي|ده)(?=\s|$)/.test(text);
  return (modification || reading) && (concepts.length || anaphora) ? { concepts, modification, anaphora } : null;
}
/** Derived only from existing receipt/checkpoint snapshots, never history prose or caller metadata. */
export function inspectionReferences(runId: string, view: InspectionView): WorkspaceReference[] {
  const checkpoint = view.understanding;
  const certified = view.state === "COMPLETED" && checkpoint?.status === "GROUNDED" && checkpoint.understanding.readiness === "UNDERSTANDING_READY" && checkpoint.grounding?.complete !== false;
  const result: WorkspaceReference[] = [];
  for (const ref of view.evidence.slice(0, REFERENCE_LIMIT)) {
    if (ref.verificationState !== "VERIFIED") continue;
    const facts = checkpoint?.understanding.facts.filter(f => checkpoint.evidence.some(e => e.read && e.runtimeReference?.receiptId === ref.receiptId && (f.evidenceRef === e.id || f.evidenceRef === "runtime:" + ref.receiptId))) ?? [];
    for (const concept of ["navbar", "hero", "footer", "style"] as const) {
      const supported = facts.filter(f => workspaceConcepts(f.text).includes(concept) ||
        (concept === "navbar" && /<nav(?:\s|>)/i.test(f.text)) || (concept === "footer" && /<footer(?:\s|>)/i.test(f.text)) ||
        (concept === "style" && /<style(?:\s|>)/i.test(f.text)) ||
        (certified && checkpoint!.understanding.inferences.some(i => i.factIds.includes(f.id) && workspaceConcepts(i.text).includes(concept))));
      if (!supported.length && !workspaceConcepts(ref.relativePath).includes(concept)) continue;
      for (const fact of supported.length ? supported : [undefined]) result.push({
        runId, concept, relativePath: ref.relativePath, evidenceId: ref.receiptId, ...(fact ? { factId: fact.id, factDigest: toolDigest(fact.text) } : {}),
        workspaceId: ref.workspaceId, bindingVersion: ref.bindingVersion, runtimeId: ref.runtimeId, runtimeFingerprint: ref.runtimeFingerprint,
        certified: Boolean(certified && fact && !ref.truncated),
        // A complete source h1 fact identifies a heading; section anchors and prose do not.
        ...(concept === "hero" && certified && fact && !ref.truncated &&
          /^\s*<h1(?:\s[^<>]*)?>[\s\S]*?<\/h1\s*>\s*$/i.test(fact.text) &&
          (fact.text.match(/<\/?h1(?=\s|>)/gi)?.length === 2) ? { targetKind: "HEADING" as const } : {})
      });
    }
  }
  return result;
}
