import { BadRequestException } from "@nestjs/common";
export const RECOMMENDATION_STRATEGIES = ["CONTENT", "NAVIGATION", "ACCESSIBILITY", "VISUAL_LAYOUT", "PERFORMANCE", "SECURITY"] as const;
export interface Recommendation { strategy?: typeof RECOMMENDATION_STRATEGIES[number]; title: string; objective: string; changeKind: "REDESIGN" | "TEXT" | "ADDITION" | "REMOVAL"; preservation: "SPECIFIED" | "UNSPECIFIED" }
export const RECOMMENDATION_SCHEMA = { type: "object", additionalProperties: false,
  required: ["title", "objective", "changeKind", "preservation"], properties: {
    title: { type: "string", description: "Must contain non-whitespace text.", minLength: 1, maxLength: 128 }, objective: { type: "string", description: "Must contain non-whitespace text.", minLength: 1, maxLength: 1024 },
    strategy: { type: "string", enum: RECOMMENDATION_STRATEGIES },
    changeKind: { type: "string", enum: ["REDESIGN", "TEXT", "ADDITION", "REMOVAL"] },
    preservation: { type: "string", enum: ["SPECIFIED", "UNSPECIFIED"] }
  } } as const;
export const RECOMMENDATION_REJECTION_REASONS = ["OBJECT_REQUIRED", "KEYS_INVALID", "TEXT_TYPE", "TEXT_BLANK", "TEXT_TOO_LONG", "ENUM_INVALID"] as const;
export type RecommendationRejection = { field: "recommendation" | "title" | "objective" | "strategy" | "changeKind" | "preservation"; reason: typeof RECOMMENDATION_REJECTION_REASONS[number] };
const rejections = new WeakMap<Error, RecommendationRejection>();
export function recommendationRejection(error: unknown): RecommendationRejection | undefined { return error instanceof Error ? rejections.get(error) : undefined; }
export function parseRecommendation(value: unknown): Recommendation {
  const reject = (field: RecommendationRejection["field"], reason: RecommendationRejection["reason"]): never => {
    const error = new BadRequestException("RECOMMENDATION_INVALID"); rejections.set(error, { field, reason }); throw error;
  };
  const r = value as Recommendation;
  if (!r || typeof r !== "object") return reject("recommendation", "OBJECT_REQUIRED");
  if (!["changeKind,objective,preservation,title", "changeKind,objective,preservation,strategy,title"].includes(Object.keys(r).sort().join(","))) return reject("recommendation", "KEYS_INVALID");
  for (const [field, limit] of [["title", 128], ["objective", 1024]] as const) {
    if (typeof r[field] !== "string") return reject(field, "TEXT_TYPE");
    if (!r[field].trim()) return reject(field, "TEXT_BLANK");
    if (r[field].length > limit) return reject(field, "TEXT_TOO_LONG");
  }
  if (r.strategy !== undefined && !RECOMMENDATION_STRATEGIES.includes(r.strategy)) return reject("strategy", "ENUM_INVALID");
  if (!["REDESIGN", "TEXT", "ADDITION", "REMOVAL"].includes(r.changeKind)) return reject("changeKind", "ENUM_INVALID");
  if (!["SPECIFIED", "UNSPECIFIED"].includes(r.preservation)) return reject("preservation", "ENUM_INVALID");
  return { ...(r.strategy ? { strategy: r.strategy } : {}), title: r.title, objective: r.objective, changeKind: r.changeKind, preservation: r.preservation };
}
export function recommendationResponse(text: string): "REJECT" | "ACCEPT" | null {
  if (/^(?:(?:لا|لأ)،?\s*(?:الاقتراح ده )?(?:مش عاجبني|الاقتراح ده مش عاجبني)|reject (?:this|that|the) recommendation|not good enough)(?:[.!؟?\s]|$)/i.test(text.trim())) return "REJECT";
  if (/^تمام[،,]?\s*الاقتراح ده أحسن[.!؟?\s]*$/.test(text.trim())) return "ACCEPT";
  if (/^(?:(?:أقبل|اقبل|موافق على|اعتمد)\s+(?:الاقتراح(?: الثاني| الحالي| ده)?|التوصية(?: الثانية| الحالية)?)|(?:accept|use)\s+(?:the\s+)?(?:second|current|latest|this)\s+recommendation)[.!؟?\s]*$/i.test(text.trim())) return "ACCEPT";
  return null;
}
export function recommendationMessage(r: Recommendation): string {
  return `Recommendations (proposed, not facts or execution approval):\n${r.title}\n${r.objective}` +
    (r.changeKind === "REDESIGN" && r.preservation === "UNSPECIFIED" ? "\nUnknown: specify which existing functions/content must be preserved before planning." : "");
}
/** Accepted recommendation data is not a raw user instruction. Keep stored prose
 * intact, but exclude only bounded trailing authority framing from its planning
 * objective. Real restrictions, including unsupported ones, remain untouched. */
export function recommendationPlanningObjective(r: Recommendation): string {
  let objective = r.objective;
  const framing = /(?:^|[.;\r\n])\s*(?:This is an objective proposal only|no execution authority is granted)\s*\.?\s*$/i;
  for (let i = 0; i < 2; i++) {
    const next = objective.replace(framing, "").trimEnd();
    if (next === objective) break;
    objective = next;
  }
  if (!objective.trim()) throw new BadRequestException("RECOMMENDATION_PLANNING_OBJECTIVE_REQUIRED");
  return objective;
}
export function unresolvedRedesignPreservation(text: string): boolean {
  return /\bredesign\b|(?:أعيد|اعيد|إعادة|اعادة)\s+تصميم/i.test(text) &&
    !/\b(?:preserve|retain|remove|replace|discard|keep)\b|(?:الحفاظ|احتفظ|احذف|إزالة|ازالة|بدون\s+الحفاظ)/i.test(text);
}
export function assertRecommendationPreservation(r: Recommendation, currentRequest: string): void {
  if (r.changeKind === "REDESIGN" && r.preservation === "SPECIFIED" &&
    !/\b(?:preserve|retain|remove|replace|discard|keep)\b|(?:الحفاظ|احتفظ|احذف|إزالة|ازالة)/i.test(currentRequest))
    throw new BadRequestException("RECOMMENDATION_PRESERVATION_UNSPECIFIED");
}
