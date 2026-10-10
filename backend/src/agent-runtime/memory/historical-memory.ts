import { createHash } from "node:crypto";

export const HISTORY_LIMITS = Object.freeze({ items: 5, characters: 8_000, sourceCharacters: 4_000, aliases: 8, summary: 768 });
export type HistoricalScope = "USER_GLOBAL" | "PROJECT" | "WORKSPACE";
export type HistoricalCategory = "STATEMENT" | "DECISION" | "RECORDED_OUTCOME";
export interface HistoricalMemoryView {
  id: string; revision: number; scope: HistoricalScope; projectId: string | null;
  workspaceId: string | null; bindingVersion: number | null; entity: string; aliases: string[];
  summary: string; category: HistoricalCategory; sourceEventAt: string;
  sourceConversationId: string; sourceMessageId: string; sourceDigest: string;
  sourceRevision: string; extractorVersion: string; derivedAt: string; sourceDeleted: boolean;
}
export interface HistoricalMemoryContext {
  state: "READY" | "AMBIGUOUS" | "NO_RESULT" | "UNAVAILABLE" | "FORGOTTEN";
  items: HistoricalMemoryView[];
  code?: "HISTORICAL_MEMORY_UNAVAILABLE";
}
export function historyDigest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function normalizeHistory(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0640]/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/\s+/g, " ").trim();
}
/** Bounded recall/forget language only. This parser never routes workspace actions. */
export function historicalRequest(text: string, now = new Date()) {
  if (text.length > HISTORY_LIMITS.sourceCharacters) return null;
  const normalized = normalizeHistory(text);
  const forget = /^(?:forget (?:history|everything)|انسي التاريخ)$/.test(normalized);
  const prefix = /^(?:remember|recall|do you remember|what did we (?:do|discuss)|where (?:did we leave off|are we)|فاكر|تفتكر|احنا وصلنا لفين|وصلنا لفين|انسي|forget)(?=\s|$)\s*/;
  if (!forget && !prefix.test(normalized)) return null;
  const subject = forget ? "" : normalized.replace(prefix, "").replace(/^(?:في|in|about)\s+/, "")
    .replace(/(?:^|\s)(?:اللي عملناه|ما فعلناه|last|ago|من|اسبوعين|two weeks|week|weeks|a week|اسبوع|the history of|history of)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  if (subject.length > 128) return null;
  const dated = /اسبوعين|أسبوعين|two weeks/i.test(text) ? 14 : /اسبوع|أسبوع|last week|a week/i.test(text) ? 7 : 0;
  const before = dated ? new Date(now.getTime() - (dated - 3) * 86_400_000) : null;
  const after = dated ? new Date(now.getTime() - (dated + 3) * 86_400_000) : null;
  return { subject, forget: forget || /^(?:forget|انسى|انسي)\s/.test(normalized), after, before };
}

const STOP = new Set(["read", "analyze", "please", "what", "change", "building", "create", "inspect", "hello", "hi", "the", "i", "we", "plan", "index", "html", "css", "hero", "navbar", "footer", "style", "sekhem", "http", "https"]);
/** Deliberately lossy derivation: retain topics/action classes, never a copy of chat prose. */
export function deriveHistoricalStatement(content: string): { entity: string; aliases: string[]; category: HistoricalCategory; summary: string; personal: boolean } | null {
  if (!content.trim() || content.length > HISTORY_LIMITS.sourceCharacters || historicalRequest(content)) return null;
  const personal = content.match(/^(?:my interest is|اهتمامي هو|اهتمامي)\s+([\p{L}\p{N}_-]{2,64})[.!؟]?$/iu);
  const explicit = content.match(/(?:project|مشروع|موضوع|عن)\s+["'«]?([\p{L}\p{N}_-]{2,64})/iu);
  const named = content.match(/\b[A-Z][A-Za-z0-9_-]{2,63}\b/g)?.find(word => !STOP.has(word.toLowerCase()));
  const entity = personal?.[1] ?? explicit?.[1] ?? named;
  if (!entity || STOP.has(entity.toLowerCase())) return null;
  const text = normalizeHistory(content);
  const category: HistoricalCategory = /\b(?:decided|agreed|decision)\b|قررنا|اتفقنا|قرار/.test(text) &&
    !/\b(?:not|never|didn t)\b|لم|مش|ما اتفقنا|ما قررنا/.test(text) ? "DECISION" : "STATEMENT";
  const action = /\b(?:completed|finished|done|built)\b|خلصنا|انتهينا|عملنا/.test(text) ? "reported progress"
    : /\b(?:change|modify|implement|build)\b|عدل|عدّل|خليه|تنفيذ/.test(text) ? "requested changes"
    : /\b(?:read|analyze|inspect)\b|حلل|اقرا|افحص/.test(text) ? "discussed analysis" : "discussed the topic";
  const topics = ["navbar", "hero", "footer", "style", "authentication", "database", "payment", "ecommerce", "design"].filter(topic => text.includes(topic));
  const summary = personal ? `User recorded ${entity} as a personal interest. This is historical user-provided context.`
    : `${category === "DECISION" ? "User recorded a decision" : "User " + action} about ${entity}${topics.length ? "; topics: " + topics.join(", ") : ""}. This is historical user context, not verified completion or current workspace state.`;
  // Only aliases explicitly written alongside the subject are admitted.
  const alias = content.match(new RegExp("(?:" + entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\s*\\(([^)]+)\\)", "u"))?.[1];
  const aliases = [normalizeHistory(entity), ...(alias && /^[\p{L}\p{N}\s_-]{2,64}$/u.test(alias) ? [normalizeHistory(alias)] : [])];
  return { entity: normalizeHistory(entity), aliases, category, summary, personal: !!personal };
}

export function boundHistoricalResults(rows: any[], subject: string): HistoricalMemoryContext {
  const groups = new Set(rows.map(row => JSON.stringify([row.projectId, row.workspaceId, row.entity])));
  if (subject && (groups.size > 1 || rows.some(row => Number(row.matchGroups) > 1))) return { state: "AMBIGUOUS", items: [] };
  const items: HistoricalMemoryView[] = [];
  for (const row of rows) {
    if (items.length === HISTORY_LIMITS.items) break;
    const item: HistoricalMemoryView = { id: row.id, revision: row.revision, scope: row.scope, projectId: row.projectId,
      workspaceId: row.workspaceId, bindingVersion: row.bindingVersion, entity: row.entity, aliases: row.aliases,
      summary: row.summary, category: row.category, sourceEventAt: new Date(row.sourceEventAt).toISOString(),
      sourceConversationId: row.sourceConversationId, sourceMessageId: row.sourceMessageId, sourceDigest: row.sourceDigest,
      sourceRevision: row.sourceRevision, extractorVersion: row.extractorVersion, derivedAt: new Date(row.derivedAt).toISOString(), sourceDeleted: row.sourceDeleted };
    if (JSON.stringify([...items, item]).length > HISTORY_LIMITS.characters) break;
    items.push(item);
  }
  return { state: items.length ? "READY" : "NO_RESULT", items };
}
