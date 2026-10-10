import assert from "node:assert/strict"
import { test } from "node:test"
import { createDirectoryDiscovery, createDirectoryLoader, isCurrentDirectoryObservation } from "../lib/directory-loading"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DirectoryObservation, RuntimeDirectory } from "../components/workspace/workspace-runtime"
import { readFileSync } from "node:fs"

test("directory refresh uses its own request rather than invalidating the entire tree", () => {
  const source = readFileSync("components/workspace/workspace-runtime.tsx", "utf8")
  const directoryButton = source.split("\n").find(line => line.includes("<DirectoryObservation view={view}"))!
  assert.match(directoryButton, /refresh=\{\(\) => void request\(\)\}/)
  assert.doesNotMatch(directoryButton, /refreshTree/)
  assert.match(source, /requestWorkspaceOperation\(binding, path === "".*await ensureConversation\(binding\), path\)/)
})

test("refresh cannot discover children from the previous scope or observation", () => {
  assert.equal(isCurrentDirectoryObservation("refresh:2", "refresh:1", "old", "old"), false)
  assert.equal(isCurrentDirectoryObservation("refresh:2", "refresh:2", "new", "old"), false)
  assert.equal(isCurrentDirectoryObservation("refresh:2", null, undefined, "old"), false)
  assert.equal(isCurrentDirectoryObservation("refresh:2", "refresh:2", "new", "new"), true)
})

test("Explorer has no manual Load directory surface", () => {
  const html = renderToStaticMarkup(createElement(RuntimeDirectory, { binding: { workspaceId: "workspace", version: 1, projectId: "project", status: "READY" } as any, path: ".agents", readAuthorized: true, ensureConversation: async () => "conversation", onOpen: () => {}, onChanged: async () => {} }))
  assert.match(html, /Loading…/); assert.doesNotMatch(html, /Load directory|approval required/)
})

test("directory success and refresh remain disclosed rather than repeated status cards", () => {
  const html = renderToStaticMarkup(createElement(DirectoryObservation, { view: { state: "READY", operation: { operationId: "saved" } } as any, available: true, refresh: () => {}, refreshDisabled: false }))
  assert.match(html, /<details[^>]*><summary/)
  assert.doesNotMatch(html, /<details[^>]* open/)
  assert.match(html, /Directory details/)
  assert.match(html, /Refresh directory/)
  assert.ok(html.indexOf("<details") < html.indexOf("Refresh directory"))
})

test("loading and denied directories remain compact and truthful outside details", () => {
  const props = { available: true, refresh: () => {}, refreshDisabled: true }
  const loading = renderToStaticMarkup(createElement(DirectoryObservation, { ...props, view: { state: "EXECUTING" } as any }))
  assert.match(loading.split("<details")[0], /role="status".*Loading…/)
  const denied = renderToStaticMarkup(createElement(DirectoryObservation, { ...props, view: { state: "DENIED", message: "Access denied" } as any }))
  assert.match(denied.split("<details")[0], /role="alert".*Access denied/)
})

test("verified receipt history remains available only within directory disclosure", () => {
  const html = renderToStaticMarkup(createElement(DirectoryObservation, { view: { state: "READY", receipt: { observedAt: "2026-10-09T00:00:00Z", bindingVersion: 45 } } as any, available: true, refresh: () => {}, refreshDisabled: false }))
  assert.doesNotMatch(html.split("<details")[0], /Verified observation|Binding v45/)
  assert.match(html, /Verified observation/)
  assert.match(html, /Binding v45/)
  assert.match(html, /This observation is historical/)
})

test("missing saved directory automatically requests once for concurrent consumers", async () => {
  const load = createDirectoryLoader<string>(); let reads = 0, requests = 0
  const read = async () => { reads++; return null }, request = async () => { requests++; return "verified" }
  const a = load("workspace:v1:src/nested", read, request), b = load("workspace:v1:src/nested", read, request)
  assert.deepEqual(await Promise.all([a.promise, b.promise]), ["verified", "verified"])
  assert.equal(reads, 1); assert.equal(requests, 1)
})
test("saved empty directory is reused; later refresh can obtain changed contents", async () => {
  const load = createDirectoryLoader<string[]>(); let requests = 0
  assert.deepEqual(await load("path", async () => [], async () => { requests++; return ["unexpected"] }).promise, [])
  assert.deepEqual(await load("path", async () => ["new-file"], async () => []).promise, ["new-file"])
  assert.equal(requests, 0)
})
test("cancelled discovery never initiates a runtime request", async () => {
  const load = createDirectoryLoader<string>(); let requests = 0
  const work = load("path", async () => null, async () => { requests++; return "bad" }); work.cancel(); work.cancel()
  assert.equal(await work.promise, null); assert.equal(requests, 0)
})
test("one cancelled subscriber does not cancel another; errors do not automatically retry", async () => {
  const load = createDirectoryLoader<string>(); let calls = 0
  const read = async () => { calls++; throw new Error("DENIED") }
  const a = load("path", read, async () => "bad"), b = load("path", read, async () => "bad")
  a.cancel(); await assert.rejects(a.promise, /DENIED/); await assert.rejects(b.promise, /DENIED/); assert.equal(calls, 1)
  assert.equal(await load("path", async () => "verified", async () => "bad").promise, "verified")
})

test("automatic discovery reserves each directory once and stops at its global bound", () => {
  const discovery = createDirectoryDiscovery(2, 1)
  assert.equal(discovery.reserve(""), true)
  assert.equal(discovery.reserve("src"), true)
  assert.equal(discovery.reserve("src"), true)
  assert.equal(discovery.reserve("docs"), false)
  discovery.dispose()
})

test("automatic discovery coalesces same-path work and isolates subscriber cancellation", async () => {
  const discovery = createDirectoryDiscovery(4, 1); let requests = 0; let finish!: (value: string) => void
  const gate = new Promise<string>(resolve => { finish = resolve })
  const a = discovery.schedule("src", async () => { requests++; return gate })
  const b = discovery.schedule("src", async () => { requests++; return "duplicate" })
  a.cancel(); finish("verified")
  assert.equal(await a.promise, null); assert.equal(await b.promise, "verified"); assert.equal(requests, 1)
  discovery.dispose()
})

test("automatic discovery never exceeds its concurrent listing bound", async () => {
  const discovery = createDirectoryDiscovery(8, 2); let running = 0, peak = 0, started = 0, queued = 0; const releases: Array<() => void> = []
  const task = () => discovery.schedule(String(queued++), async () => {
    started++; running++; peak = Math.max(peak, running)
    await new Promise<void>(resolve => releases.push(resolve))
    running--; return "verified"
  })
  const a = task(), b = task(), c = task()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(started, 2); assert.equal(peak, 2)
  releases.splice(0).forEach(release => release())
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(started, 3); releases.splice(0).forEach(release => release())
  assert.deepEqual(await Promise.all([a.promise, b.promise, c.promise]), ["verified", "verified", "verified"])
  discovery.dispose()
})

test("cancelled scheduled mounts do not poison a replacement request for the same path", async () => {
  const discovery = createDirectoryDiscovery(4, 1); let requests = 0
  const cancelled = discovery.schedule(".agents", async active => { if (!active()) return null; requests++; return "stale" })
  cancelled.cancel()
  const current = discovery.schedule(".agents", async active => { if (!active()) return null; requests++; return "verified" })
  assert.equal(await cancelled.promise, null)
  assert.equal(await current.promise, "verified")
  assert.equal(requests, 1)
  discovery.dispose()
})

test("disposed tree scheduler cannot publish stale work into a fresh lifecycle", async () => {
  const oldDiscovery = createDirectoryDiscovery(4, 1)
  assert.equal(oldDiscovery.reserve(""), true)
  let releaseOld!: () => void, oldCalls = 0
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve })
  const oldWork = oldDiscovery.schedule("root", async active => {
    oldCalls++
    await oldGate
    return active() ? "stale" : null
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(oldCalls, 1)

  oldDiscovery.dispose()
  oldWork.cancel()
  const freshDiscovery = createDirectoryDiscovery(4, 1)
  assert.equal(freshDiscovery.reserve(""), true)
  const freshWork = freshDiscovery.schedule("root", async () => "current")
  assert.equal(await freshWork.promise, "current")
  releaseOld()
  assert.equal(await oldWork.promise, null)
  freshDiscovery.dispose()
})

test("bounded recursive metadata discovery reaches nested folders without expansion and refresh replaces entries", async () => {
  let tree: Record<string, string[]> = { "": ["src", "docs"], src: ["src/ui"], "src/ui": [], docs: [] }
  const discover = async () => {
    const scheduler = createDirectoryDiscovery(64, 2), calls: string[] = [], observed: Record<string, string[]> = {}
    const visit = async (path: string): Promise<void> => {
      if (!scheduler.reserve(path)) return
      const result = await scheduler.schedule(path, async () => { calls.push(path); return [...tree[path]] }).promise
      if (!result) return
      observed[path] = result
      await Promise.all(result.map(visit))
    }
    await visit(""); scheduler.dispose(); return { calls, observed }
  }
  const first = await discover()
  assert.deepEqual(new Set(first.calls), new Set(["", "src", "src/ui", "docs"]))
  assert.deepEqual(first.observed["src/ui"], [])
  tree = { "": ["src"], src: ["src/new"], "src/new": [] }
  const refreshed = await discover()
  assert.deepEqual(refreshed.observed, { "": ["src"], src: ["src/new"], "src/new": [] })
  assert.equal(refreshed.calls.length, new Set(refreshed.calls).size)
})

test("large automatic discovery cannot schedule beyond its admitted directory budget", async () => {
  const discovery = createDirectoryDiscovery(3, 1), calls: string[] = []
  const work = Array.from({ length: 1000 }, (_, i) => String(i)).filter(path => discovery.reserve(path))
    .map(path => discovery.schedule(path, async () => { calls.push(path); return [] }).promise)
  await Promise.all(work); assert.deepEqual(calls, ["0", "1", "2"]); discovery.dispose()
})
