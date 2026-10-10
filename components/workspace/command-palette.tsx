"use client"
import { useEffect, useRef, useState } from "react"

export function parseQuickOpen(value: string) {
  const match = /^(.+?)(?::([1-9]\d{0,6}))?$/.exec(value.trim())
  if (!match || /^[\\/]|:|(?:^|[\\/])\.\.(?:[\\/]|$)|[\x00-\x1f]/.test(match[1])) return null
  return { path: match[1], line: match[2] ? Number(match[2]) : undefined }
}
export function CommandPalette({ actions, onOpenFile }: { actions: { name: string; run: () => void }[]; onOpenFile: (path: string, line?: number) => void }) {
  const [open, setOpen] = useState(false), [files, setFiles] = useState(false), [query, setQuery] = useState(""), [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const filtered = actions.filter(action => action.name.toLowerCase().includes(query.toLowerCase()))
  function close() { setOpen(false); previousFocus.current?.focus() }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); previousFocus.current = document.activeElement as HTMLElement; setOpen(true); setFiles(!e.shiftKey); setQuery(""); setSelected(0) } }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key)
  }, [])
  useEffect(() => { if (open) input.current?.focus() }, [open, files])
  function run() {
    if (files) { const path = parseQuickOpen(query); if (!path) return; close(); onOpenFile(path.path, path.line) }
    else if (filtered[selected]) { const action = filtered[selected]; close(); action.run() }
  }
  return <><button type="button" className="ide-palette-trigger" onClick={() => { previousFocus.current = document.activeElement as HTMLElement; setOpen(true); setFiles(false); setQuery("") }}>Commands <kbd>Ctrl+Shift+P</kbd></button>
    {open && <div className="ide-palette-backdrop" onClick={close}><section role="dialog" aria-modal="true" aria-label={files ? "Open workspace file" : "Command palette"} className="ide-palette" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); close() }
      if (e.key === "Tab") {
        const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)')]
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus() }
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSelected(i => Math.max(0, Math.min(filtered.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))) }
      if (e.key === "Enter" && e.target === input.current) { e.preventDefault(); run() }
    }}><input ref={input} aria-label={files ? "Workspace-relative file path" : "Find command"} placeholder={files ? "package.json:3 — workspace-relative path" : "> Search commands"} value={query} onChange={e => { setQuery(e.target.value); setSelected(0) }} />
      {files ? <><p>Opens through the existing authorized read path. Optional :line.</p><button type="button" disabled={!parseQuickOpen(query)} onClick={run}>Open file</button></> : <div role="listbox" aria-label="Available commands">{filtered.map((action, i) => <button key={action.name} role="option" aria-selected={selected === i} onClick={() => { close(); action.run() }}>{action.name}</button>)}{!filtered.length && <p>No matching commands</p>}</div>}
      <button type="button" onClick={() => { setFiles(value => !value); setQuery("") }}>{files ? "Commands" : "Open File"}</button><button type="button" onClick={close}>Close</button>
    </section></div>}
  </>
}
