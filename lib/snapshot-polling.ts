/** Read-only UI snapshot recovery. Never retries commands, approvals or mutations. */
export function snapshotFailure(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string } | null
  const code = e?.code ?? "NETWORK", message = e?.message ?? "Snapshot unavailable"
  const integrity = /WORKSPACE_STORE_CORRUPT|RUNTIME_LEDGER_CORRUPT/.test(`${code} ${message}`)
  const status = integrity ? "INTEGRITY_ERROR" : e?.status === 401 ? "AUTHENTICATION_REQUIRED"
    : e?.status === 403 ? "UNAUTHORIZED" : /BINDING|WORKSPACE_CHANGED/.test(code) ? "STALE"
    : /GRANT.*EXPIRED/.test(code) ? "EXPIRED_GRANT" : /OFFLINE/.test(code) ? "OFFLINE" : "UNAVAILABLE"
  const temporary = !integrity && (e?.status === undefined || e.status === 0 || [408, 429, 500, 502, 503, 504].includes(e.status))
  return { status, temporary, message: integrity ? "Workspace or Runtime integrity check failed. Access is blocked; administrator review is required." : message }
}

type Timer = ReturnType<typeof setTimeout>
/** A failed GET is not an uncertain message submission. Keep denial recovery separate. */
export function conversationSnapshotError(error: unknown, stopped: boolean): string {
  const status = (error as { status?: number } | null)?.status
  if (status === 401) return "Your session is unavailable. Please sign in again."
  if (status === 403 || status === 404) return "This conversation is unavailable to your account. Choose one of your conversations."
  return `${snapshotFailure(error).message}${stopped ? " Automatic refresh paused. Refresh to try again." : " Retrying temporarily."}`
}
export function createSnapshotPoller(options: {
  read: () => Promise<boolean | void>
  onError: (error: unknown, stopped: boolean) => void
  intervalMs: number
  schedule?: (fn: () => void, ms: number) => Timer
  cancel?: (timer: Timer) => void
}) {
  let timer: Timer | undefined, pending: Promise<void> | null = null, followup: Promise<void> | null = null, stopped = false, paused = false, failures = 0
  const cancel = options.cancel ?? clearTimeout, schedule = options.schedule ?? setTimeout
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined }
  const poll = (): Promise<void> => {
    if (stopped || paused) return Promise.resolve()
    if (pending) return pending
    clear()
    pending = (async () => {
      let delay: number | null = null
      try {
        const again = await Promise.resolve().then(options.read)
        failures = 0
        if (again !== false) delay = options.intervalMs
      } catch (error) {
        failures++
        const retry = snapshotFailure(error).temporary && failures < 3
        paused = !retry
        if (!stopped) options.onError(error, !retry)
        if (retry) delay = Math.min(60000, options.intervalMs * 2 ** failures)
      } finally {
        pending = null
        if (!stopped && delay !== null) timer = schedule(() => { void poll() }, delay)
      }
    })()
    return pending
  }
  return {
    // Explicit user refresh restarts recovery. Automatic attempts never reset the failure count.
    refresh: (request?: { afterPending?: boolean }) => {
      failures = 0; paused = false
      // A command response must reconcile with a read begun after its commit.
      // Reusing a pre-commit read can erase the reply and stop terminal polling.
      if (request?.afterPending && pending) {
        if (!followup) followup = pending.then(() => {
          followup = null; failures = 0; paused = false
          return poll()
        })
        return followup
      }
      return poll()
    },
    check: poll,
    stop: () => { stopped = true; clear() },
  }
}
