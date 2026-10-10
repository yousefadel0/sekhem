import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ExecutionRecoveryNotice } from "../components/chat/agent-run-card"
import { recoverExecutionVerification } from "../lib/sekhem-conversation"

for (const recovery of ["REVIEW_ONLY", "PREPARATION_REVIEW", "VERIFICATION_ONLY"] as const) {
  test(`recovery ${recovery} restores truthfully and never auto-dispatches`, () => {
    const execution: any = { runId: "run", recovery }
    const html = renderToStaticMarkup(createElement(ExecutionRecoveryNotice, { execution, conversationId: "conversation", stale: true, onReview() {} }))
    assert.match(html, /Review saved execution/)
    if (recovery === "VERIFICATION_ONLY") { assert.match(html, /disabled/); assert.match(html, /write will not be repeated/); }
    else { assert.doesNotMatch(html, /Recover verification only/); assert.match(html, /will not restart automatically|no write will be retried automatically/); }
  })
}
test("explicit recovery submits only the verification endpoint, not approval permit or execution", async t => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { location: { hostname: "localhost", protocol: "http:" } };
  t.after(() => { if (originalWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = originalWindow; });
  const calls: string[] = []
  t.mock.method(globalThis, "fetch", async (url: unknown, options: any) => {
    calls.push(String(url)); assert.equal(options.method, "POST"); assert.deepEqual(JSON.parse(options.body), { requestId: "read-recovery" })
    return new Response(JSON.stringify({ data: {}, errors: [] }), { status: 200, headers: { "content-type": "application/json" } })
  })
  await recoverExecutionVerification("conversation", "run", "read-recovery")
  assert.equal(calls.length, 1); assert.match(calls[0], /executions\/run\/recover-verification$/)
  assert.doesNotMatch(calls[0], /permit|approval|exact-proposals/)
})
