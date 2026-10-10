import { createHash } from "node:crypto";
import { evidenceIdentity, type AgentContext } from "./agent-understanding.types";

/** Bounded package-version request forms; no free-form outcome inference. */
export function packageVersionRequest(objective: string) {
  const version = "([0-9]+\\.[0-9]+\\.[0-9]+)";
  const quoted = new RegExp(`^عد[ّ]?ل فقط قيمة version في package\\.json من "${version}" إلى "${version}"\\. (حافظ على كل المحتوى الآخر وترتيب وتنسيق الملف)\\. (اعرض التغيير للمراجعة وانتظر موافقتي قبل أي تعديل)\\.$`).exec(objective);
  const original = new RegExp(`^غي[ّ]?ر version في package\\.json من ${version} إلى ${version} (مع الحفاظ على باقي الملف كما هو)، (راجع التغيير واستنى موافقتي)\\.?$`).exec(objective);
  const operand = `(?:"[0-9]+\\.[0-9]+\\.[0-9]+"|[0-9]+\\.[0-9]+\\.[0-9]+)`;
  const review = new RegExp(`^(غي[ّ]?ر version في package\\.json من (${operand}) إلى (${operand}))، (اعرض التغيير واستنى موافقتي)\\.$`).exec(objective)
    ?? new RegExp(`^(Change version in package\\.json from (${operand}) to (${operand})), (show the change and wait for my approval)\\.$`, "i").exec(objective);
  // The requested field scope is the preservation quote for this shorter form:
  // changing version does not request edits to any other field or formatting.
  const match = quoted ?? original ?? (review && [review[0], review[2].replace(/^"|"$/g, ""), review[3].replace(/^"|"$/g, ""), review[1], review[4]]);
  if (!match || match[1].length > 32 || match[2].length > 32 || match[1] === match[2]) return;
  return { before: match[1], after: match[2], preservation: match[3], approval: match[4] };
}

/** Complete admitted source only. Duplicate/escaped version keys fail closed. */
export function packageVersionSource(source: string, before: string): string | undefined {
  try {
    const value = JSON.parse(source);
    if (!value || Array.isArray(value) || typeof value !== "object" || value.version !== before) return;
    const keys = [...source.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)]
      .filter(match => JSON.parse(`"${match[1]}"`) === "version");
    if (keys.length !== 1 || keys[0][1] !== "version") return;
    const field = /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/.exec(source);
    if (!field || field[1] !== before || field[0].length > 512) return;
    return field[0];
  } catch { return; }
}

export function resolvePackageVersionChange(context: AgentContext, visible: ReadonlyMap<string, string>) {
  const request = packageVersionRequest(context.objective);
  if (!request || !context.userIntent.some(intent => intent === "MODIFY" || intent === "PLAN")) return;
  const candidates = context.evidence.filter(e => e.sourceType === "workspace" && e.status === "COLLECTED" &&
    e.relativePath === "package.json" && e.metadata.operation === "filesystem.read" &&
    e.runtimeReference?.verificationState === "VERIFIED" && e.runtimeReference.truncated === false &&
    e.content?.truncated === false && typeof e.content.text === "string" && e.content.text.length > 0 &&
    e.content.text === visible.get(evidenceIdentity(e)));
  if (!candidates.length || new Set(candidates.map(e => e.content!.text)).size !== 1) return;
  const evidence = candidates[0], source = evidence.content!.text;
  const versionExcerpt = packageVersionSource(source, request.before);
  if (!versionExcerpt) return;
  return { ...request, relativePath: "package.json" as const, evidenceRef: evidenceIdentity(evidence), versionExcerpt,
    sourceSha256: createHash("sha256").update(source, "utf8").digest("hex") };
}
