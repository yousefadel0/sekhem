import { diff } from "@codemirror/merge"

export function editorLanguage(path: string) {
  const ext = path.split(".").at(-1)?.toLowerCase()
  return ({ ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", mjs: "JavaScript", cjs: "JavaScript", json: "JSON", css: "CSS", html: "HTML", md: "Markdown", yaml: "YAML", yml: "YAML", xml: "XML", svg: "XML", env: "Environment" } as Record<string, string>)[ext ?? ""] ?? "Text"
}
export function editorReference(value: string) {
  const match = /^(.+?):(?:L)?([1-9]\d{0,6})(?:-L?\d+)?$/.exec(value)
  if (!match || /^[\\/]|:|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(match[1])) return null
  return { path: match[1], line: Number(match[2]) }
}
export function outputFileReferences(text: string) {
  return [...new Set(text.slice(0, 32768).split(/\r?\n/).flatMap(line => {
    const ref = /^\s*([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+:[1-9]\d{0,6})(?::\d+)?(?:\s|$)/.exec(line)?.[1]
    return ref && editorReference(ref) ? [ref] : []
  }))].slice(0, 20)
}
export function editableSource(path: string, text: string, truncated = false) {
  if (truncated) return "TRUNCATED / NON-EDITABLE"
  if (text.includes("\0")) return "BINARY / NON-EDITABLE"
  if (/\r(?!\n)/.test(text) || (text.includes("\r\n") && /(?<!\r)\n/.test(text))) return "MIXED LINE ENDINGS / RAW ONLY — preserve original bytes"
  if (new TextEncoder().encode(text).length > 131072 || text.split(/\r?\n/).some(l => l.length > 20000)) return "LARGE / NON-EDITABLE"
  if (/\.tsbuildinfo$/i.test(path)) return "GENERATED / NON-EDITABLE"
  return null
}
/** Exact character ranges; reverting never guesses or merges unrelated content. */
export function documentChanges(before: string, after: string) {
  return diff(before, after).map(c => ({ ...c, kind: c.fromA === c.toA ? "added" : c.fromB === c.toB ? "deleted" : "modified" }))
}
export function revertChange(before: string, after: string, index: number) {
  const c = documentChanges(before, after)[index]
  return c ? after.slice(0, c.fromB) + before.slice(c.fromA, c.toA) + after.slice(c.toB) : after
}
