import { normalizeWorkspaceLanguage } from "./workspace-reference";

/** Explicit content understanding, including the bound-project pronoun. Not mutation intent. */
export function projectContentAnalysisRequest(value: string): boolean {
  if (value.length > 4000) return false;
  const text = normalizeWorkspaceLanguage(value);
  // Read-only project reviews may include many paths and advisory development
  // steps. They are inspection intent, not a request to execute those steps.
  if (/^(?:افحص|حلل|راجع|اقر[اأ])\s+(?:محتوى\s+|ملفات\s+|كود\s+)?(?:المشروع|مشروع)(?:\s|$)|^(?:inspect|review|analy[sz]e|read(?:\s+and\s+analy[sz]e)?)\s+(?:(?:this|the|my|bound|current)\s+)?(?:project|workspace)\b/i.test(text) &&
    /(?:قراءة\s*فقط|لا\s*تعد[ّ]?ل|بدون\s*تعديل|read[ -]only|do not (?:modify|edit))/i.test(text)) return true;
  return /^(?:اقر[اأ]ه\s*و\s*قولي\s+خطة\s+تطويره|اقر[اأ]\s+المشروع\s*و\s*حلله|اقر[اأ]\s+الكود\s*و\s*قولي\s+[اأ]طور\s+[اإ]يه)[؟?!.\s]*$/.test(text)
    || /^(?:analy[sz]e|read)\s+(?:(?:the|this|my)\s+)?project\s+and\s+give\s+me\s+a\s+development\s+plan[?!.\s]*$/i.test(text);
}

/** Only the advisory inspection scope is interpreted; the original request remains model-visible and durable. */
export function projectContentInspectionScope(value: string): string {
  return /خطة|[اأ]طور|development\s+plan/i.test(value)
    ? "Review the currently bound workspace project and recommend evidence-grounded development improvements."
    : "Review and analyze the currently bound workspace project.";
}

/** Bounded routing only. A saved listing identifies a target, never read authority. */
export function naturalReview(text: string): boolean {
  return /^(?:راجع(?:لي)?|حلل(?:لي)?|بص\s+على|review|analy[sz]e|inspect|read)\s+/i.test(text.trim()) &&
    /(?:^|\s)(?:الـ|ال)?index(?=$|[\s،.,!?؟])|\b(?:this|that|the)\s+file\b|الملف(?:\s|$)/i.test(text);
}
export function reviewTarget(text: string, files: readonly string[], truncated = false): string | null {
  if (truncated) return null;
  const unique = [...new Set(files)];
  if (/(?:^|\s)(?:الـ|ال)?index(?=$|[\s،.,!?؟])/i.test(text)) {
    const matches = unique.filter(f => /(?:^|\/)index\.[a-z0-9]+$/i.test(f));
    return matches.length === 1 ? matches[0] : null;
  }
  return unique.length === 1 ? unique[0] : null;
}
/** Bounded advisory project request; never an instruction to perform improvements. */
export function projectRecommendationRequest(text: string): boolean {
  return /^(?:طيب\s+)?لو أنا عايز أحسن المشروع ده،?\s*إيه أكتر حاجات شايف إنها محتاجة تحسين[؟?]?\s*$/.test(text.trim());
}
