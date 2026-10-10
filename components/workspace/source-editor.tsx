"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { CodeEditor } from "./code-editor"
import { sourceSaveNotice } from "@/lib/source-save-notice"
import { documentChanges, editableSource, editorLanguage, revertChange } from "@/lib/editor-document"

export const EditorLocation = createContext<{ path: string; line: number } | undefined>(undefined)
export const EditorProposals = createContext<Array<{ path: string; before: string; after: string }> | undefined>(undefined)
export const EditorSavedRuns = createContext<Array<{ id: string; title: string; createdAt: string }>>([])

/** Escaped React text spans, never source HTML. Highlighting cannot alter source bytes. */
export function sourceTokens(line: string) {
  return line.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$|#[^\r\n]*$|\b(?:const|let|var|return|import|from|export|function|class|if|else|true|false|null|async|await)\b|\b\d+(?:\.\d+)?\b)/g)
    .filter(Boolean).map(text => ({ text, kind: /^["']/.test(text) ? "string" : /^(\/\/|#)/.test(text) ? "comment" : /^\d/.test(text) ? "number" : /^(const|let|var|return|import|from|export|function|class|if|else|true|false|null|async|await)$/.test(text) ? "keyword" : "plain" }))
}
export function SourceEditor({ path, text, truncated = false, onDirty, onSave, savedContent }: { savedContent?: string; path: string; text: string; truncated?: boolean; onDirty?: (dirty: boolean) => void; onSave?: (original: string, draft: string) => Promise<void> }) {
  const [original, setOriginal] = useState(text), [draft, setDraft] = useState(text), [side, setSide] = useState(false), [raw, setRaw] = useState(false)
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [cursor, setCursor] = useState([1, 1])
  const [command, setCommand] = useState<{ id: number; action: "find" | "next" | "previous" }>()
  const location = useContext(EditorLocation), proposals = useContext(EditorProposals)?.filter(p => p.path === path) ?? []
  const dirty = draft !== original, stale = text !== original, restricted = editableSource(path, original, truncated)
  const changes = documentChanges(original, draft)
  useEffect(() => { if (!dirty && text !== original) { setOriginal(text); setDraft(text) } }, [text, dirty, original])
  useEffect(() => { if (savedContent !== undefined && text === savedContent && draft === savedContent) { setOriginal(text); setNotice("PERSISTED VERIFIED RESULT · Authorized read-back matched") } }, [savedContent, text, draft])
  useEffect(() => { onDirty?.(dirty) }, [dirty])
  useEffect(() => { if (!dirty) return; const stop = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }; window.addEventListener("beforeunload", stop); return () => window.removeEventListener("beforeunload", stop) }, [dirty])
  async function save() {
    if (busy || !dirty || restricted) return
    if (stale) { setNotice("Workspace source changed. Compare and discard/rebase explicitly before proposing a save."); return }
    if (!onSave) { setNotice("Governed save unavailable for this source. No workspace write occurred."); return }
    setBusy(true)
    try { await onSave(original, draft); setNotice("Exact proposal prepared. Review and human approval required; draft is not saved.") }
    catch (error) { setNotice(sourceSaveNotice(error)) }
    finally { setBusy(false) }
  }
  return <section className="ide-source" aria-label={`Source editor ${path}`}>
    <div className="ide-breadcrumbs">{path.replaceAll("\\", " › ").replaceAll("/", " › ")}{dirty && <span aria-label="Unsaved local draft"> ●</span>}</div>
    {!onSave && <p className="ide-draft-note">READ-ONLY workspace access · Local drafts cannot be saved to this source.</p>}
    <div className="ide-editor-toolbar"><span>{restricted ?? (dirty ? "LOCAL DRAFT · Unsaved changes" : "VERIFIED WORKSPACE SOURCE · Editable local buffer")}</span>
      <button type="button" disabled={!dirty || busy || !!restricted || stale} onClick={() => void save()}>{busy ? "Preparing…" : "Save / Review · Ctrl+S"}</button>
      <button type="button" disabled={!dirty} onClick={() => { setDraft(text); setOriginal(text); setNotice("Local changes discarded. Workspace unchanged.") }}>Discard all local changes</button>
      <button type="button" aria-pressed={side} onClick={() => setSide(value => !value)}>{side ? "Inline diff" : "Side-by-side diff"}</button>
      <button type="button" onClick={() => setCommand({ id: Date.now(), action: "find" })}>Find / Replace · Ctrl+F</button>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(draft); setNotice("Copied") } catch { setNotice("Clipboard unavailable") } }}>Copy</button>
    </div>
    {stale && <p role="alert">A newer verified source exists. Local draft retained; no silent merge. Discard to load the newer source.</p>}
    {!!proposals.length && <details><summary>{dirty ? "LOCAL DRAFT + AGENT PROPOSAL · Conflict review required" : "PROPOSED CHANGE · Not applied"}</summary>{proposals.map((p, i) => <CodeEditor key={i} path={path} original={p.before} value={p.after} readOnly sideBySide={true} onChange={() => {}} onSave={() => {}} onCursor={() => {}} />)}<p>Exact proposal excerpts, not a replacement for verified source or your local draft. Use the existing approval surface to decide.</p></details>}
    {restricted && <><button type="button" onClick={() => setRaw(v => !v)}>Open Raw</button><p>Read-only observation. Copy or use the file’s Ask Agent control; incomplete content cannot be saved.</p></>}
    {restricted ? raw && <pre className="ide-source-scroll">{original}</pre> : <><div hidden={side}><CodeEditor path={path} original={original} value={draft} readOnly={false} sideBySide={false} line={location?.path === path ? location.line : undefined} onChange={value => { setDraft(value); setNotice("") }} onSave={() => void save()} onCursor={(line, col) => setCursor([line, col])} command={command} /></div>{side && <><p>Before: verified source · After: local draft · Read-only comparison</p><CodeEditor path={path} original={original} value={draft} readOnly sideBySide onChange={() => {}} onSave={() => void save()} onCursor={(line, col) => setCursor([line, col])} command={command} /></>}</>}
    <div className="ide-editor-toolbar"><span>Ln {cursor[0]}, Col {cursor[1]} · {editorLanguage(path)} · {changes.length} changed region(s)</span><button type="button" disabled={!changes.length} onClick={() => setCommand({ id: Date.now(), action: "previous" })}>Previous change</button><button type="button" disabled={!changes.length} onClick={() => setCommand({ id: Date.now(), action: "next" })}>Next change</button></div>
    {!!changes.length && <details><summary>Changed regions / revert</summary>{changes.map((c, i) => <div key={`${c.fromA}:${c.fromB}`}><span>{c.kind} · draft line {draft.slice(0, c.fromB).split("\n").length}</span><button type="button" onClick={() => setDraft(revertChange(original, draft, i))}>Revert change {i + 1}</button></div>)}</details>}
    <p className="ide-draft-note">Local buffers are not persisted files. Reload discards unsaved drafts after confirmation. Save prepares a governed proposal; approval and verified read-back remain separate.</p>
    {notice && <p role="status">{notice}</p>}
  </section>
}
