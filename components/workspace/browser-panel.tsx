"use client"
import { useEffect, useRef, useState } from "react"
import { postSekhemApi } from "@/lib/sekhem-api"
type Observation = { id: string; url: string; title: string; text: string; screenshot: string; truncated: boolean; closed?: boolean; elements: Array<{ id: string; label: string; kind: string }> }
export function BrowserPanel({ projectId, conversationId, onSource }: { projectId: string; conversationId?: string | null; onSource: () => Promise<void> }) {
  const [url, setUrl] = useState(""), [elementId, setElementId] = useState(""), [value, setValue] = useState(""), [view, setView] = useState<Observation | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const base = `/projects/${encodeURIComponent(projectId)}/browser`
  const liveView = useRef<Observation | null>(null), mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; const id = liveView.current?.id; if (id) void postSekhemApi(`${base}/${id}/actions`, { action: "CLOSE" }) }
  }, [base])
  const action = async (kind: "OPEN" | "READ" | "SNAPSHOT" | "CLICK" | "FILL" | "NAVIGATE" | "CLOSE") => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const next = await postSekhemApi<Observation, Record<string, unknown>>(kind === "OPEN" ? base : `${base}/${view!.id}/actions`, kind === "OPEN" ? { url, ...(conversationId ? { conversationId } : {}) } : { action: kind, ...(kind === "NAVIGATE" ? { url } : {}), ...(["CLICK", "FILL"].includes(kind) ? { elementId } : {}), ...(kind === "FILL" ? { value } : {}) }, { throwOnError: true })
      if (!next) throw new Error("Browser result unavailable")
      if (!mounted.current) { if (!next.closed) await postSekhemApi(`${base}/${next.id}/actions`, { action: "CLOSE" }); return }
      liveView.current = next.closed ? null : next
      setView(next.closed ? null : next); setValue(""); setElementId("")
      if (kind === "READ" && conversationId) await onSource()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Browser action failed. Check the current page before retrying.") }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="space-y-3"><h3>Links & browser</h3>
    <p>Private browser session. Open a public web page, interact with it, or add its visible text to this conversation as a source.</p>
    <input type="url" aria-label="Web page URL" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} disabled={busy} />
    <button className="technical-button" disabled={busy || !url || !!view} onClick={() => void action("OPEN")}>Open browser</button>
    {view && <><p>{view.title} · {view.url}</p><img alt="Current private browser page" src={`data:image/jpeg;base64,${view.screenshot}`} style={{ width: "100%" }} />
      <button className="technical-button" disabled={busy || !url} onClick={() => void action("NAVIGATE")}>Navigate</button>
      <button className="technical-button" disabled={busy} onClick={() => void action("SNAPSHOT")}>Refresh page view</button>
      <select aria-label="Page element" value={elementId} disabled={busy} onChange={event => setElementId(event.target.value)}><option value="">Choose a button or field</option>{view.elements.map(element => <option key={element.id} value={element.id}>{element.label} · {element.kind}</option>)}</select>
      <input type="password" aria-label="Text to enter in browser" placeholder="Text to enter (never recorded in action logs)" value={value} onChange={event => setValue(event.target.value)} disabled={busy} autoComplete="off" />
      <button className="technical-button" disabled={busy || !elementId} onClick={() => void action("FILL")}>Enter text</button>
      <button className="technical-button" disabled={busy || !elementId} onClick={() => void action("CLICK")}>Click element</button>
      <button className="technical-button" disabled={busy || !conversationId} onClick={() => void action("READ")}>Add page source to chat</button>
      <button className="technical-button" disabled={busy} onClick={() => void action("CLOSE")}>Close browser</button>
      {view.truncated && <p>Page source is partial.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
