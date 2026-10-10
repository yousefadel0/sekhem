import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CompactPlanCard, CompactProposalCard } from "../components/chat/agent-run-card"

const planning: any = { understanding: { objective: "Change package version", scope: [{ id: "scope", reference: "package.json" }], constraints: [{ id: "preserve", description: "Preserve every other byte" }] }, plan: { readiness: "PLAN_READY", validation: { valid: true }, steps: [
  { id: "write", type: "IMPLEMENT", effect: "WRITE", objective: "Replace only version", expectedResult: "Version is 0.1.2", risk: "LOW" },
  { id: "verify", type: "VERIFY", effect: "READ_ONLY", objective: "Authorized read-back and hash comparison" }
], successCriteria: [] } }
const identity: any = { planId: "saved-plan", planVersion: 3, digest: "private-digest", sourceRunId: "source", understandingSequence: 1, workspace: { workspaceId: "ws", bindingVersion: 44 }, evidenceReferences: [] }
const proposal: any = { id: "saved-proposal", planId: "saved-plan", version: 1, digest: "proposal-digest", state: "READY", changes: [{ path: "package.json", before: '"version": "0.1.1"', after: '"version": "0.1.2"' }] }

test("saved plan exposes scope, outcome, verification and recorded risk with separate actions", () => {
  let calls = 0
  const props = { planning, identity, onProceed: () => calls++, onReview: () => {}, onAsk: () => {} }
  const html = renderToStaticMarkup(<CompactPlanCard {...props} />)
  for (const label of ["What SEKHEM understood", "Files / scope", "package.json", "What changes", "Version is 0.1.2", "Authorized read-back", "Preserve every other byte", "LOW", "Proceed", "Review", "Ask a question"]) assert.ok(html.includes(label), label)
  assert.equal(calls, 0)
  assert.ok(html.indexOf("<details") < html.indexOf("private-digest"))
  assert.match(html, /Proceed prepares the exact proposal only/)
  assert.equal(renderToStaticMarkup(<CompactPlanCard {...props} planning={structuredClone(planning)} />), html)
})

test("not-ready and stale plans cannot offer an enabled preparation action", () => {
  const notReady = structuredClone(planning); notReady.plan.readiness = "PLAN_NOT_READY"
  assert.doesNotMatch(renderToStaticMarkup(<CompactPlanCard planning={notReady} identity={identity} onProceed={() => {}} />), />Proceed</)
  assert.match(renderToStaticMarkup(<CompactPlanCard planning={planning} identity={identity} disabled onProceed={() => {}} />), /disabled=""/)
})

test("exact excerpts survive reload and Proceed is a disclosure, never approval", () => {
  const props = { proposal, planning, approvalControls: <button>Approve this action</button>, onReview: () => {}, onAsk: () => {} }
  const html = renderToStaticMarkup(<CompactProposalCard {...props} />)
  assert.match(html, />Before</); assert.match(html, /After · proposed/)
  assert.match(html, /0\.1\.1/); assert.match(html, /0\.1\.2/)
  assert.match(html, /<summary[^>]*>Proceed<\/summary>/)
  assert.match(html, /No approval or execution is submitted/)
  assert.doesNotMatch(html, /<details[^>]*\bopen/)
  assert.equal(renderToStaticMarkup(<CompactProposalCard {...props} proposal={structuredClone(proposal)} />), html)
})

test("missing preview or risk is not fabricated; stale proposal remains explicit", () => {
  const unknown = structuredClone(planning); delete unknown.plan.steps[0].risk
  const html = renderToStaticMarkup(<CompactProposalCard proposal={{ ...proposal, state: "STALE", changes: undefined }} planning={unknown} />)
  assert.match(html, /Stale · Revalidation required/)
  assert.match(html, /Exact change preview unavailable/)
  assert.doesNotMatch(html, /Recorded step risk|0\.1\.1|>Proceed</)
})
