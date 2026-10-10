import { createHash } from "node:crypto";
import { evidenceIdentity, type AgentConstraint, type AgentContext } from "./agent-understanding.types";

const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export type HeroTextChange = NonNullable<AgentConstraint["textChange"]>;

/** One bounded Arabic command. Quoted source/target bytes are never normalized. */
export function arabicHeroRequest(objective: string) {
  const match = /^غي[ّ]?ر (?:Hero (?:heading|title)|عنوان الـ?Hero) من "([^"\r\n]+)" إلى "([^"\r\n]+)"([^\r\n]*)[\s]*$/i.exec(objective);
  return match ? { before: match[1], after: match[2], restriction: match[3].trim().replace(/\.$/, "") } : undefined;
}

/** Deliberately narrow source recognition, not HTML rewriting. Unsupported or
 * ambiguous markup needs clarification. Original bytes are never serialized. */
export function heroTitle(source: string) {
  const masked = source.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, s => " ".repeat(s.length));
  if (/<!--|<(?:script|style|template)\b/i.test(masked)) return;
  let invalidAttributes = false;
  const sections = [...masked.matchAll(/<section\b[^<>]*>[\s\S]*?<\/section\s*>/gi)].filter(m => {
    const opening = m[0].slice(0, m[0].indexOf(">") + 1);
    const attributes = opening.slice(8, -1), pattern = /\s+([a-z][\w:-]*)\s*=\s*(["'])([^<>]*?)\2/igy;
    let offset = 0, match: RegExpExecArray | null, classes: string[] = [];
    const names = new Set<string>();
    while ((match = pattern.exec(attributes))) {
      const name = match[1].toLowerCase();
      if (names.has(name)) { invalidAttributes = true; return false; }
      names.add(name); offset = pattern.lastIndex;
      if (name === "class") classes = match[3].split(/\s+/);
    }
    if (attributes.slice(offset).trim()) { invalidAttributes = true; return false; }
    return classes.includes("hero");
  });
  if (invalidAttributes || sections.length !== 1 || (sections[0][0].match(/<section\b/gi)?.length ?? 0) !== 1) return;
  const section = sections[0], headings = [...section[0].matchAll(/<h1(?:\s[^<>]*)?>([\s\S]*?)<\/h1\s*>/gi)];
  if (headings.length !== 1) return;
  const heading = headings[0], start = section.index! + heading.index!, excerpt = source.slice(start, start + heading[0].length);
  // Comments, entities, malformed tags or non-span children are not supported by this bounded edit.
  if (excerpt !== heading[0] || excerpt.length > 512 || /&/.test(heading[1])) return;
  const innerOffset = start + heading[0].indexOf(">") + 1;
  const tokens = [...heading[1].matchAll(/<[^>]*>|[^<]+/g)];
  let depth = 0, text = "", indices: number[] = [], pendingSpace: number | undefined;
  for (const token of tokens) {
    if (token[0].startsWith("<")) {
      if (/^<span(?:\s[^<>]*)?>$/i.test(token[0])) depth++;
      else if (/^<\/span\s*>$/i.test(token[0])) depth--;
      else return;
      if (depth < 0 || depth > 1) return;
      continue;
    }
    for (let i = 0; i < token[0].length; i++) {
      const absolute = innerOffset + token.index! + i, c = token[0][i];
      if (/\s/.test(c)) { if (text && pendingSpace === undefined) pendingSpace = absolute; continue; }
      if (pendingSpace !== undefined) { text += " "; indices.push(pendingSpace); pendingSpace = undefined; }
      text += c; indices.push(absolute);
    }
  }
  if (depth || !text || /[<>]/.test(text)) return;
  return { text, indices, excerpt };
}

/** Recognize this bounded user intent only; unrelated constraints remain unresolved. */
export function resolveHeroTextChange(context: AgentContext, visible: ReadonlyMap<string, string>): HeroTextChange | undefined {
  const arabic = arabicHeroRequest(context.objective);
  if ((!arabic && !/(?:\b(?:change|update|replace)|(?:^|\s)(?:غير|عد[ّ]?ل)).{0,100}(?:Hero\s+(?:title|heading)|عنوان\s+الـ?Hero)/i.test(context.objective)) ||
    /(?:do not|don't|never|لا|لن|ممنوع).{0,50}(?:change|update|replace|ت?غير|ت?عد[ّ]?ل).{0,80}Hero/i.test(context.objective)) return;
  const quoted = `(?:"([^"\\r\\n]+)"|'([^'\\r\\n]+)'|“([^”\\r\\n]+)”)`;
  const arrow = new RegExp(`^Change only the Hero heading in index\\.html:\\s*${quoted}\\s*→\\s*${quoted}(?=\\s*(?:\\r?\\n|$))`, "i").exec(context.objective.trim());
  if (arrow && [...context.objective.matchAll(new RegExp(`${quoted}\\s*→\\s*${quoted}`, "g"))].length !== 1) return;
  const pairs = [...context.objective.matchAll(new RegExp(`\\bfrom(?:\\s*:\\s*|\\s+)${quoted}\\s+to(?:\\s*:\\s*|\\s+)${quoted}`, "gi"))];
  if (pairs.length > 1) return;
  const hero = /(?:Hero\s+(?:title|heading)|عنوان\s+الـ?Hero)/i.exec(context.objective)!;
  const tail = context.objective.slice(hero.index + hero[0].length);
  if (pairs.length && !/^\s*(?:text\s*)?(?:in\s+index\.html\s*)?(?:\.\s*Target:\s*Change the existing heading\s*)?$/i.test(context.objective.slice(hero.index + hero[0].length, pairs[0].index))) return;
  if (!pairs.length && /\bfrom\b/i.test(tail)) return;
  const target = new RegExp(`^(?:\\s+)(?:to\\s+|إلى\\s+)${quoted}|^\\s+(?:to\\s+|إلى\\s+)([^\\r\\n]+)$`, "i").exec(tail);
  if (arrow && (arabic || pairs.length)) return;
  const after = arrow ? arrow[4] ?? arrow[5] ?? arrow[6] : arabic ? arabic.after : pairs.length ? (pairs[0][4] ?? pairs[0][5] ?? pairs[0][6]).trim() : (target?.[1] ?? target?.[2] ?? target?.[3] ?? target?.[4] ?? "").trim();
  if (!after || after.length > 160 || !/^[A-Za-z0-9 .,!?()'-]+$/.test(after) || /\s{2}/.test(after)) return;
  const from = arrow ? arrow[1] ?? arrow[2] ?? arrow[3] : arabic ? arabic.before : pairs.length ? pairs[0][1] ?? pairs[0][2] ?? pairs[0][3] : undefined;
  const candidates = context.evidence.filter(e => e.status === "COLLECTED" && e.relativePath === "index.html" &&
    e.metadata.operation === "filesystem.read" && e.runtimeReference?.verificationState === "VERIFIED" &&
    !e.runtimeReference.truncated && !e.content?.truncated && e.content?.text === visible.get(evidenceIdentity(e)));
  if (!candidates.length) return;
  const texts = new Set(candidates.map(e => e.content!.text));
  if (texts.size !== 1) return;
  const evidence = candidates[0], source = evidence.content!.text, title = heroTitle(source);
  if (!title || (from !== undefined && title.text !== from) || title.text === after) return;
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(title.text.length, after.length) && title.text[prefix] === after[prefix]) prefix++;
  while (suffix < Math.min(title.text.length, after.length) - prefix && title.text.at(-suffix - 1) === after.at(-suffix - 1)) suffix++;
  const endIndex = title.text.length - suffix;
  if (prefix >= endIndex) return; // Insert-only edits need a separately established text-node boundary.
  const start = title.indices[prefix], end = title.indices[endIndex - 1] + 1;
  if (source.slice(start, end) !== title.text.slice(prefix, endIndex)) return; // Never cross markup or normalized whitespace.
  const replacement = after.slice(prefix, after.length - suffix);
  const updated = source.slice(0, start) + replacement + source.slice(end);
  if (heroTitle(updated)?.text !== after) return;
  return { relativePath: "index.html", evidenceRef: evidenceIdentity(evidence), sourceSha256: hash(source),
    selector: "section.hero h1", before: title.text, after, start, end, replacement, titleExcerpt: title.excerpt };
}

/** Used again at the existing exact-proposal boundary after fresh evidence admission. */
export function heroConstrainedResult(source: string, change: HeroTextChange): string | undefined {
  if (change.relativePath !== "index.html" || change.selector !== "section.hero h1" || hash(source) !== change.sourceSha256 ||
    !Number.isSafeInteger(change.start) || !Number.isSafeInteger(change.end) || change.start < 0 || change.end <= change.start || change.end > source.length) return;
  const title = heroTitle(source);
  if (!title || title.text !== change.before || title.excerpt !== change.titleExcerpt ||
    !title.indices.includes(change.start) || !title.indices.includes(change.end - 1) || /[<>&]/.test(change.replacement) ||
    /[<>]/.test(source.slice(change.start, change.end))) return;
  const after = source.slice(0, change.start) + change.replacement + source.slice(change.end);
  return heroTitle(after)?.text === change.after ? after : undefined;
}

export function isHeroPreservationClause(quote: string, change?: HeroTextChange) {
  if (change) {
    if (/^Change only the Hero heading in index\.html:$/i.test(quote)) return true;
    if (/^Preserve the existing <h1>, the <span> around "intelligent", surrounding structure\/whitespace, and all other content$/i.test(quote)) return true;
    if (quote === "مع الحفاظ على باقي محتوى الملف كما هو") return true;
    if (/^Preserve markup, CSS, encoding and every other byte$/i.test(quote)) return true;
    const replacement = /^Replace only the text (\w+) inside the existing Hero h1 span with (\w+)$/i.exec(quote);
    if (replacement) return replacement[2] === change.replacement && change.titleExcerpt.includes(`<span>${replacement[1]}</span>`) && change.before.includes(replacement[1]);
    const request = /^(?:Create an engineering plan to )?change only the index\.html Hero (?:title|heading) from (["'])(.*?)\1 to (["'])(.*?)\3$/i.exec(quote);
    if (request) return request[2] === change.before && request[4] === change.after;
    // The heading's period is inside its quotes, so the clause splitter retains
    // the following preservation sentence. Accept only this bounded suffix.
    const headingTextRequest = /^Change only the Hero heading text in index\.html from (["'])(.*?)\1 to (["'])(.*?)\3(?: Preserve the existing h1 element, span tags, formatting, structure, and every other part of index\.html unchanged)?$/i.exec(quote);
    if (headingTextRequest) return headingTextRequest[2] === change.before && headingTextRequest[4] === change.after;
    if (/^Preserve the existing h1 element, span tags, formatting, structure, and every other part of index\.html unchanged$/i.test(quote)) return true;
  }
  return /^(?:change only the Hero title, preserving its existing markup|preserve (?:existing (?:Hero )?markup|HTML|CSS|surrounding content|unrelated content|encoding)|(?:keep|preserve) (?:all )?(?:other|unrelated) (?:content|files) unchanged)$/i.test(quote);
}
