"use client"
import { useRef, useState } from "react"
import { postSekhemApi } from "@/lib/sekhem-api"

export function PersonalProjectForm({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  return <form className="flex flex-wrap gap-2" onSubmit={async event => {
    event.preventDefault()
    if (pending.current || !name.trim()) return
    pending.current = true; setBusy(true); setError(null)
    try {
      const project = await postSekhemApi<{ id: string }, { name: string }>("/projects/personal", { name: name.trim() }, { throwOnError: true })
      if (!project?.id) throw new Error("Project creation did not return an identity")
      setName(""); await onCreated(project.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Project creation failed") }
    finally { pending.current = false; setBusy(false) }
  }}>
    <input className="technical-input" aria-label="Personal project name" placeholder="Name your personal project" required maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
    <button className="technical-button" type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "New personal project"}</button>
    <p className="panel-caption">Private to your account. After creation, connect your computer and choose a folder.</p>
    {error && <p role="alert">{error}</p>}
  </form>
}
