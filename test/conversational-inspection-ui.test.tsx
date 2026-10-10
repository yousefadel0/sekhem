import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentRunCard } from "../components/chat/agent-run-card"
import { WorkflowPauseControls } from "../components/chat/workflow-pause-controls"
import { AgentInspectionCard } from "../components/workspace/agent-inspection-card"
test("read-only inspection controls and grounding diagnostics are collapsed without hiding required approval", () => {
  const run: any = { id: "r", status: "PAUSED", inspection: { state: "AWAITING_INPUT", workspace: { name: "Fixture" }, operations: [], executionVerified: 0, understanding: { sequence: 1, status: "INTERMEDIATE", grounding: { claims: [{ status: "UNGROUNDED", reason: "CITED_DETAIL_NOT_IN_EXCERPT" }] } } } }
  const html = renderToStaticMarkup(createElement(AgentInspectionCard, { run }))
  assert.match(html, /^<details[^>]*><summary>Agent Activity/); assert.match(html, /<details><summary>Grounding diagnostics/)
  assert.doesNotMatch(html, /<details[^>]*open/)
  const card = renderToStaticMarkup(createElement(AgentRunCard, { run, onSelect: () => {} }))
  assert.match(card, /waiting for your clarification/)
  assert.doesNotMatch(card, /analysis continues/)
})
test("verified standalone source is compact, counted, and keeps details expandable", () => {
  const run: any = { id: "rtrun_read", title: "Read", status: "COMPLETED", planVersion: 1, pendingApprovals: [], runtimeActionReceipt: { id: "receipt", state: "SUCCEEDED", verificationState: "VERIFIED" } }
  const detail = { ...run, presentation: { evidence: [{ id: "runtime:receipt", operation: "filesystem.read", label: "README.md", read: true, truncated: false }], planning: null } }
  const html = renderToStaticMarkup(createElement(AgentRunCard, { run, detail, onSelect: () => {} }))
  assert.match(html, /README.md · Verified source read/); assert.match(html, /1 sources read/); assert.match(html, /<details>/)
  assert.doesNotMatch(html, /0 sources read|Approve|Permit|Planning only/)
})
test("missing read evidence is never invented from a generic verified receipt", () => {
  const run: any = { id: "rtrun_other", title: "Action", status: "COMPLETED", planVersion: 1, pendingApprovals: [], runtimeActionReceipt: { id: "r", state: "SUCCEEDED", verificationState: "VERIFIED" } }
  const html = renderToStaticMarkup(createElement(AgentRunCard, { run, detail: { ...run, presentation: { evidence: [], planning: null } }, onSelect: () => {} }))
  assert.doesNotMatch(html, /0 sources read|Verified source read/)
})
test("missing pause reference allows refresh only and cannot fabricate resume authority", () => {
  const run: any = { id: "run", status: "PAUSED", inspection: { state: "AWAITING_INPUT" } }
  const html = renderToStaticMarkup(createElement(WorkflowPauseControls, { run, onChanged: async () => {} }))
  assert.match(html, /Review the last response and diagnostics/); assert.match(html, /Refresh saved status/)
  assert.doesNotMatch(html, />Resume</)
})
