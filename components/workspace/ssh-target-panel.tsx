"use client"
import { useEffect, useRef, useState } from "react"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"

type Target = { id: string; version: number; configuration: { host: string; port: number; username: string; status: string }; validation?: { status: string } | null }
export function SshTargetPanel({ projectId }: { projectId: string }) {
  const [targets, setTargets] = useState<Target[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const pending = useRef(false), sequence = useRef(0)
  const base = `/projects/${encodeURIComponent(projectId)}/ssh-targets`
  const reload = async () => {
    const attempt = ++sequence.current
    try { const next = await fetchSekhemApi<Target[]>(base, { throwOnError: true }); if (attempt === sequence.current) setTargets(next ?? []) }
    catch (reason) { if (attempt === sequence.current) setError(reason instanceof Error ? reason.message : "SSH targets unavailable") }
  }
  useEffect(() => { void reload(); return () => { sequence.current++ } }, [projectId])
  async function act(work: () => Promise<unknown>) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try { await work(); await reload() } catch (reason) { setError(reason instanceof Error ? reason.message : "SSH request failed") }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="space-y-3"><h3>SSH servers</h3>
    <p>Register your server and verify its identity and connection. Command execution is not enabled by this connection test.</p>
    <form className="grid gap-2" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget)
      void act(() => postSekhemApi(base, { targetId: null, expectedVersion: 0, requestId: crypto.randomUUID(), acknowledgement: "PIN_HOST_IDENTITY",
        configuration: { host: String(data.get("host")), port: Number(data.get("port")), username: String(data.get("username")), hostFingerprint: String(data.get("fingerprint")), credentialRef: String(data.get("credential")), status: "REGISTERED" } }, { throwOnError: true }))
    }}>
      <input name="host" aria-label="SSH host" placeholder="Server hostname or address" required disabled={busy} />
      <input name="port" aria-label="SSH port" type="number" min={1} max={65535} defaultValue={22} required disabled={busy} />
      <input name="username" aria-label="SSH username" placeholder="SSH username" required disabled={busy} />
      <input name="fingerprint" aria-label="SSH host fingerprint" placeholder="Verified host fingerprint: SHA256:…" required disabled={busy} />
      <input name="credential" aria-label="SSH credential reference" placeholder="Configured credential reference (not the private key)" required disabled={busy} />
      <button className="technical-button" type="submit" disabled={busy}>Register server</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {targets.map(target => <div key={target.id}><strong>{target.configuration.username}@{target.configuration.host}:{target.configuration.port}</strong>
      <p>Connection: {target.validation?.status ?? "NOT VERIFIED"}</p>
      <button className="technical-button" disabled={busy || target.configuration.status !== "REGISTERED"} onClick={() => void act(() => postSekhemApi(`${base}/${encodeURIComponent(target.id)}/connection-validations`, { expectedVersion: target.version, requestId: crypto.randomUUID(), acknowledgement: "VALIDATE_CONNECTION_ONLY" }, { throwOnError: true }))}>Test connection</button>
    </div>)}
  </section>
}
