"use client"
import { useEffect, useRef, useState } from "react"
import { basicSetup, EditorView } from "codemirror"
import { EditorState, type Extension } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { indentWithTab } from "@codemirror/commands"
import { openSearchPanel } from "@codemirror/search"
import { unifiedMergeView, MergeView, goToNextChunk, goToPreviousChunk } from "@codemirror/merge"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { markdown } from "@codemirror/lang-markdown"
import { yaml } from "@codemirror/lang-yaml"
import { xml } from "@codemirror/lang-xml"
import { editorLineEndingExtensions } from "@/lib/editor-line-endings"

function language(path: string) {
  const ext = path.split(".").at(-1)?.toLowerCase()
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext ?? "")) return javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "tsx" || ext === "jsx" })
  return ({ json, css, html, md: markdown, yaml, yml: yaml, xml, svg: xml } as Record<string, () => Extension>)[ext ?? ""]?.() ?? []
}
const theme = EditorView.theme({ "&": { backgroundColor: "#1f1f1f", color: "#d4d4d4", height: "100%", fontSize: "13px" }, ".cm-scroller": { overflow: "auto", fontFamily: "Consolas, monospace" }, ".cm-gutters": { backgroundColor: "#181818", color: "#858585", border: "none" }, ".cm-content": { caretColor: "#fff" }, "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#264f78" }, ".cm-panels": { backgroundColor: "#252526", color: "#ddd" } }, { dark: true })
export function CodeEditor({ path, original, value, readOnly, sideBySide, line, onChange, onSave, onCursor, command }: {
  path: string; original: string; value: string; readOnly: boolean; sideBySide: boolean; line?: number
  onChange: (value: string) => void; onSave: () => void; onCursor: (line: number, column: number) => void
  command?: { id: number; action: "find" | "next" | "previous" }
}) {
  const parent = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null)
  const [ready, setReady] = useState(false)
  const callbacks = useRef({ onChange, onSave, onCursor }); callbacks.current = { onChange, onSave, onCursor }
  // Preserve the editor state (including undo history) while merely hiding a tab.
  useEffect(() => {
    const extensions = [basicSetup, theme, language(path), ...editorLineEndingExtensions(original),
      EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      keymap.of([{ key: "Mod-s", run: () => { callbacks.current.onSave(); return true } }, indentWithTab]),
      EditorView.updateListener.of(update => {
        if (update.docChanged) callbacks.current.onChange(update.state.sliceDoc())
        if (update.selectionSet || update.docChanged) { const pos = update.state.selection.main.head, l = update.state.doc.lineAt(pos); callbacks.current.onCursor(l.number, pos - l.from + 1) }
      }), EditorView.contentAttributes.of({ "aria-label": `Code editor ${path}`, spellcheck: "false" })]
    let merge: MergeView | undefined
    const configured = sideBySide ? extensions : [...extensions, unifiedMergeView({ original, gutter: true, highlightChanges: true, mergeControls: false })]
    if (sideBySide) { merge = new MergeView({ parent: parent.current!, a: { doc: original, extensions: [basicSetup, theme, language(path), EditorState.readOnly.of(true), EditorView.editable.of(false)] }, b: { doc: value, extensions }, gutter: true, highlightChanges: true }); view.current = merge.b }
    else view.current = new EditorView({ parent: parent.current!, doc: value, extensions: configured })
    setReady(true)
    return () => { if (merge) merge.destroy(); else view.current?.destroy(); view.current = null }
  }, [path, original, readOnly, sideBySide])
  useEffect(() => { const v = view.current; if (v && v.state.sliceDoc() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } }) }, [value])
  useEffect(() => { const v = view.current; if (v && line && line <= v.state.doc.lines) { const pos = v.state.doc.line(line).from; v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) }); v.focus() } }, [line, original])
  useEffect(() => { const v = view.current; if (!v || !command || !parent.current?.getClientRects().length) return; if (command.action === "find") openSearchPanel(v); else if (command.action === "next") goToNextChunk(v); else goToPreviousChunk(v); v.focus() }, [command])
  return <>{!ready && <pre aria-label={`Source preview ${path}`}>{value}</pre>}<div ref={parent} className="ide-codemirror" data-source-path={path} data-line={line} data-editable={!readOnly} /></>
}
