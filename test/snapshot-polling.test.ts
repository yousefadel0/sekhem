import assert from "node:assert/strict"
import { test } from "node:test"
import { createSnapshotPoller, snapshotFailure, conversationSnapshotError } from "../lib/snapshot-polling"

test("denied and missing conversations do not suggest retrying or uncertain submission", () => {
  for (const status of [401, 403, 404]) {
    const text = conversationSnapshotError({ status, message: "Conversation not found" }, true);
    assert.doesNotMatch(text, /Refresh to try again|Checking saved progress|resubmitted/);
    assert.match(text, /sign in|unavailable/);
  }
  assert.match(conversationSnapshotError({ status: 503, message: "Unavailable" }, true), /Refresh to try again/);
});
import { subscribeToAgentRunEvents } from "../hooks/useAgentRunEvents"

function clock() {
  const jobs = new Map<number, { fn: () => void; ms: number }>(); let serial = 0
  return { jobs, schedule: (fn: () => void, ms: number) => { jobs.set(++serial, { fn, ms }); return serial as unknown as ReturnType<typeof setTimeout> },
    cancel: (id: ReturnType<typeof setTimeout>) => { jobs.delete(id as unknown as number) },
    fire: () => { const [id, job] = [...jobs][0]; jobs.delete(id); job.fn() } }
}
for (const error of [{ status: 401 }, { status: 403 }, { status: 409, code: "WORKSPACE_BINDING_STALE" },
  { status: 503, code: "RUNTIME_LEDGER_CORRUPT" }, { status: 503, code: "WORKSPACE_STORE_CORRUPT" }, { status: 503, code: "INTERNAL_SERVER_ERROR", message: "WORKSPACE_STORE_CORRUPT" }]) {
  test(`permanent snapshot failure pauses until explicit recovery: ${JSON.stringify(error)}`, async () => {
    const timer = clock(); let requests = 0, stopped = false
    const p = createSnapshotPoller({ ...timer, intervalMs: 100, read: async () => { requests++; throw error }, onError: (_, value) => { stopped = value } })
    await p.refresh(); await p.check(); await p.check()
    assert.equal(requests, 1); assert.equal(timer.jobs.size, 0); assert.equal(stopped, true)
    await p.refresh(); assert.equal(requests, 2); p.stop()
  })
}
test("temporary transport failures back off and stop after three failed reads; explicit recovery can succeed", async () => {
  const timer = clock(); let requests = 0, healthy = false; const stopped: boolean[] = []
  const p = createSnapshotPoller({ ...timer, intervalMs: 100, read: async () => { requests++; if (!healthy) throw { status: 503 }; return false }, onError: (_, value) => stopped.push(value) })
  await p.refresh(); assert.equal([...timer.jobs.values()][0].ms, 200)
  timer.fire(); await p.check(); assert.equal([...timer.jobs.values()][0].ms, 400)
  timer.fire(); await p.check(); assert.equal(requests, 3); assert.equal(timer.jobs.size, 0)
  assert.deepEqual(stopped, [false, false, true]); await p.check(); assert.equal(requests, 3)
  healthy = true; await p.refresh(); assert.equal(requests, 4); assert.equal(timer.jobs.size, 0)
})
test("temporary failure followed by success restores ordinary polling, terminal observations stop it", async () => {
  const timer = clock(); let n = 0
  const p = createSnapshotPoller({ ...timer, intervalMs: 100, read: async () => { n++; if (n === 1) throw { status: 0 }; return n === 2 }, onError: () => {} })
  await p.refresh(); timer.fire(); await p.check(); assert.equal([...timer.jobs.values()][0].ms, 100)
  timer.fire(); await p.check(); assert.equal(n, 3); assert.equal(timer.jobs.size, 0)
})
test("concurrent refreshes share one read; unmount prevents a pending request from scheduling another", async () => {
  const timer = clock(); let requests = 0; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const p = createSnapshotPoller({ ...timer, intervalMs: 100, read: async () => { requests++; await pending }, onError: () => assert.fail() })
  const a = p.refresh(), b = p.refresh(); await Promise.resolve(); assert.equal(requests, 1)
  p.stop(); release(); await Promise.all([a, b]); assert.equal(timer.jobs.size, 0)
  await p.refresh(); assert.equal(requests, 1)
})
test("error categories distinguish integrity, stale binding, authentication and temporary transport", () => {
  assert.equal(snapshotFailure({ status: 503, code: "WORKSPACE_STORE_CORRUPT" }).status, "INTEGRITY_ERROR")
  assert.equal(snapshotFailure({ status: 401 }).status, "AUTHENTICATION_REQUIRED")
  assert.equal(snapshotFailure({ status: 409, code: "WORKSPACE_BINDING_STALE" }).status, "STALE")
  assert.equal(snapshotFailure({ status: 409, code: "RUNTIME_GRANT_EXPIRED" }).status, "EXPIRED_GRANT")
  assert.equal(snapshotFailure({ status: 503 }).temporary, true)
})

test("post-response refresh reads committed terminal reply after an in-flight pre-commit snapshot", async () => {
  const timer = clock(); let reads = 0, committed = false, displayed: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const p = createSnapshotPoller({ ...timer, intervalMs: 100, onError: () => assert.fail(), read: async () => {
    const messages = committed ? ["No eligible saved workflow. No operation started."] : []
    if (++reads === 1) await gate
    displayed = messages
    return false // No AgentRun was dispatched, so normal terminal polling ends.
  } })
  const first = p.refresh(); await Promise.resolve(); await Promise.resolve()
  committed = true
  const refresh = p.refresh({ afterPending: true }), duplicate = p.refresh({ afterPending: true })
  release(); await Promise.all([first, refresh, duplicate])
  assert.equal(reads, 2); assert.equal(displayed.length, 1); assert.equal(timer.jobs.size, 0)
  p.stop()
})

test("conversation switch stops queued reconciliation without another read or redispatch", async () => {
  const timer = clock(); let reads = 0; let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const p = createSnapshotPoller({ ...timer, intervalMs: 100, onError: () => assert.fail(), read: async () => { reads++; await gate; return false } })
  const first = p.refresh(); await Promise.resolve(); await Promise.resolve()
  const refresh = p.refresh({ afterPending: true })
  p.stop(); release(); await Promise.all([first, refresh])
  assert.equal(reads, 1); assert.equal(timer.jobs.size, 0)
})
test("SSE permits temporary reconnection but closes after three consecutive failures", () => {
  const errors: string[] = []
  class Events {
    static instance: Events
    listeners = new Map<string, (e: unknown) => void>(); closed = false
    constructor() { Events.instance = this }
    addEventListener(name: string, fn: (e: unknown) => void) { this.listeners.set(name, fn) }
    removeEventListener(name: string) { this.listeners.delete(name) }
    close() { this.closed = true }
  }
  const stop = subscribeToAgentRunEvents({ runId: "run-one", EventSourceClass: Events, onEvent: () => {}, onLoadingChange: () => {}, onError: error => errors.push(error.message) })
  const source = Events.instance
  source.listeners.get("error")!({}); source.listeners.get("error")!({}); assert.equal(source.closed, false)
  source.listeners.get("error")!({}); assert.equal(source.closed, true); assert.match(errors.at(-1)!, /paused/)
  stop()
})
