import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentRunPanel, ActivityPanel, FilePanel, RunStatusBadge } from "../components/workspace/agent-workspace"
import { RuntimeStatus } from "../components/workspace/sekhem-primitives"
import { ProjectChat } from "../components/workspace/project-chat"
import { SekhemShell } from "../components/workspace/sekhem-shell"
import { EvidenceList, PlanningView } from "../components/chat/agent-run-card"
import { runTimeline, runTone } from "../lib/workspace-presentation"
import type { AgentRunDetail, AgentActivity, PlanningResult, WorkspaceFile } from "../lib/sekhem-agent"

const render = (component: React.ElementType, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(component, props))
const noop = () => {}
const plan: PlanningResult = {
  understanding: { objective: "Inspect this project", scope: [{ id: "project", reference: "project-a" }], constraints: [{ id: "read", description: "Read only" }], unknowns: [], readiness: "UNDERSTANDING_READY", facts: [{ id: "f1", text: "Source excerpt", evidenceRef: "e1" }] },
  plan: { readiness: "PLAN_READY", authorization: "NOT_GRANTED", steps: [{ id: "s1", type: "INSPECT", objective: "Read source", purpose: "Review", status: "PLANNED", effect: "READ_ONLY", dependencies: [] }, { id: "s2", type: "ANALYZE", objective: "Compare findings", purpose: "Review", status: "PLANNED", effect: "READ_ONLY", dependencies: ["s1"] }], missingInformation: [], stopConditions: ["Stop if access is denied"], successCriteria: [{ id: "c1", description: "Ground findings in evidence" }], validation: { valid: true, issues: [] } }
}
const run: AgentRunDetail = {
  id: "run-a", conversationId: "conversation-a", projectId: "project-a", agentName: "SEKHEM", title: "Inspect the project", status: "COMPLETED", outcome: "PLAN_READY", progressPercent: 100,
  startedAt: "2026-09-22T10:00:00Z", completedAt: "2026-09-22T10:00:01Z", createdAt: "2026-09-22T10:00:00Z", failureReason: null, pendingApprovals: [],
  presentation: { workspace: null, evidence: [], warnings: [], planning: plan, executionAvailable: false, executionPerformed: false }
}
describe("SEKHEM workspace presentation", () => {
  it("the footer uses the recorded outcome and planning rather than raw completion status", () => {
    const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
    const footer = source.slice(source.indexOf("statusBar={<"), source.indexOf("statusBar={<") + 1500)
    assert.match(footer, /runActivity\(conversationAgent, conversationAgentDetail\?\.activity\?\.at\(-1\)\?\.eventType, conversationAgentDetail\?\.presentation\?\.planning\)/)
    assert.match(source, /conversationAgentRun\(runState.history, runState.details\)/)
    assert.doesNotMatch(footer, /Agent: \{runState.selectedRun\?\.status/)
  })
  it("conversation and details share one mounted composer across responsive surfaces", () => {
    for (const mobileSurface of ["workspace", "chat", "agent"]) for (const chatExpanded of [true, false]) {
      const html = render(SekhemShell, { header: "Header", navigation: "Navigation", explorer: "Files", workarea: "Plan details", chat: React.createElement("textarea", { defaultValue: "Draft stays here" }), collapsed: false, drawer: null, onDrawer: noop, mobileSurface, onSurface: noop, chatExpanded })
      assert.equal((html.match(/<textarea/g) ?? []).length, 1)
      assert.match(html, /unified-workspace/)
      assert.match(html, /Workspace navigation/); assert.match(html, />Workspace</); assert.match(html, />Chat</)
      assert.match(html, /Resize Explorer/); assert.match(html, /Resize Agent panel/)
      assert.doesNotMatch(html, /Agent workspace/)
    }
  })
  it("runtime plans point to execution receipts without stale execution-unavailable claims", () => {
    const html = render(PlanningView, { planning: plan, runtimeAction: true });
    assert.match(html, /runtime receipt/);
    assert.doesNotMatch(html, /Execution unavailable|No proposed step has been executed/);
  });
  const cases = [
    ["PLAN_READY", "COMPLETED", "Plan ready", "success"], ["NEEDS_USER_INPUT", "COMPLETED", "Needs user input", "warning"], ["NEEDS_EVIDENCE", "COMPLETED", "Needs evidence", "warning"],
    ["PROVIDER_FAILED", "FAILED", "Provider failed", "error"], ["OUTPUT_TRUNCATED", "FAILED", "Output truncated", "error"], ["INVALID_STRUCTURED_OUTPUT", "FAILED", "Invalid structured output", "error"],
    ["BLOCKED", "FAILED", "Blocked", "error"], ["FAILED", "FAILED", "Failed", "error"], ["CANCELLED", "CANCELLED", "Cancelled", "warning"], ["PAUSED", "PAUSED", "Paused", "warning"],
  ] as const
  for (const [outcome, status, label, tone] of cases) it(`retains ${outcome} in the actual run UI`, () => {
    const saved = { ...run, outcome, status }
    assert.equal(runTone(saved), tone)
    const html = render(AgentRunPanel, { run: saved, events: [], streamStatus: "CLOSED", onOpen: noop, onTab: noop, onPrompt: noop, loading: false })
    assert.ok(html.includes(label))
    assert.ok(html.includes("No execution record is attached to this run"))
    assert.doesNotMatch(html, /Local execution is unavailable|Workspace binding unavailable/)
    assert.match(html, /Workspace not recorded in this run/)
    assert.doesNotMatch(html, /Analysis completed|Execute plan|Runtime Connected/)
  })
  for (const status of ["QUEUED", "PLANNING", "RUNNING", "AWAITING_APPROVAL"] as const) it(`renders active ${status} without a completed result`, () => {
    const active = { ...run, status, outcome: null, presentation: undefined }
    assert.equal(runTimeline(active).at(-1)?.state, "pending")
    assert.equal(runTone(active), status === "AWAITING_APPROVAL" ? "warning" : "neutral")
    assert.doesNotMatch(render(RunStatusBadge, { run: active }), /Completed|Plan ready/)
  })
  it("does not invent inspection or planning from a RUNNING status or progress percentage", () => {
    const stages = runTimeline({ ...run, status: "RUNNING", outcome: null, presentation: undefined })
    assert.ok(stages.every(stage => stage.state === "pending"))
  })
  it("invalid understanding and plans remain attention states", () => {
    const invalid = { ...plan, understanding: { ...plan.understanding, readiness: "INSUFFICIENT_CONTEXT" }, plan: { ...plan.plan, readiness: "PLAN_NOT_READY", validation: { valid: false, issues: [{ code: "OUTPUT_TRUNCATED", path: "$" }] } } }
    const stages = runTimeline({ ...run, status: "FAILED", outcome: "OUTPUT_TRUNCATED", presentation: { ...run.presentation!, planning: invalid } })
    assert.equal(stages[0].state, "attention")
    assert.equal(stages[2].state, "attention")
    assert.equal(stages[3].state, "attention")
  })
  it("activity uses only supplied persisted event IDs and timestamps", () => {
    const events: AgentActivity[] = [{ id: "event1", agentRunId: run.id, eventType: "EVIDENCE_COLLECTED", timestamp: "2026-09-22T10:00:01Z" }]
    const html = render(ActivityPanel, { events, streamStatus: "DISCONNECTED" })
    assert.ok(html.includes("Evidence recorded")); assert.ok(html.includes("DISCONNECTED")); assert.match(html, /datetime="2026-09-22T10:00:01.000Z"/i)
    assert.doesNotMatch(html, /Found 7|Scanning workspace|Execution completed/)
  })
  it("empty activity never fabricates live entries", () => {
    const html = render(ActivityPanel, { events: [], streamStatus: "IDLE" })
    assert.match(html, /No saved activity yet/); assert.doesNotMatch(html, /<li/)
  })
  it("runtime component cannot imply a connection or expose an enabled folder picker", () => {
    const html = render(RuntimeStatus, {})
    assert.match(html, /No runtime bound/); assert.match(html, /Installation status unknown/)
    assert.doesNotMatch(html, /<button|Runtime Connected|D:\\/)
  })
  it("source view preserves HTML source as escaped text without executing it", () => {
    const file: WorkspaceFile = { binding: { id: "workspace", projectId: "project-a", name: "Source workspace", version: "v1", mode: "READ_ONLY", location: "BACKEND_HOST" }, path: "index.html", fileName: "index.html", mimeType: "text/html", language: "html", text: '<script>alert("source")</script>', status: "READ", warnings: [], scanned: false, truncated: false }
    const html = render(FilePanel, { file, status: "READ", error: null, onOpen: noop })
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/); assert.match(html, /READ-ONLY/)
  })
  it("source denial is shown without substituting another file", () => {
    const html = render(FilePanel, { file: null, status: "Unauthorized", error: "Sensitive file access denied", onOpen: noop })
    assert.match(html, /role="alert"/); assert.match(html, /Sensitive file access denied/); assert.doesNotMatch(html, /<pre/)
  })
  it("every evidence outcome and selection reason survives display", () => {
    const outcomes = ["READ", "DENIED", "NOT_FOUND", "UNSUPPORTED", "SCANNED", "TRUNCATED", "FAILED", "IMAGE_UNAVAILABLE"]
    const evidence = outcomes.map(outcome => ({ id: outcome, sourceType: "workspace", label: `<source-${outcome}>`, outcome, discovered: true, read: outcome === "READ", selected: false, usedInAnswer: "UNKNOWN", truncated: outcome === "TRUNCATED", selectionReason: `Reason ${outcome}` }))
    const html = render(EvidenceList, { evidence, onOpen: noop })
    for (const outcome of outcomes) { assert.ok(html.includes(outcome)); assert.ok(html.includes(`Reason ${outcome}`)) }
    assert.doesNotMatch(html, /<source-/)
  })
  it("planning displays existing dependencies, source facts and authorization", () => {
    const html = render(PlanningView, { planning: plan })
    for (const text of ["PLAN_READY", "NOT_GRANTED", "Dependencies", "s1", "Source excerpt", "Ground findings in evidence"]) assert.ok(html.includes(text))
    assert.match(html, /No proposed step has been executed/)
  })
  it("chat expansion has one message/composer subtree and never creates another conversation", () => {
    for (const expanded of [false, true]) {
      const html = render(ProjectChat, { expanded, onExpand: noop, onHistory: noop, onNew: noop, projectName: "Project A", conversationTitle: "Saved conversation", children: React.createElement("textarea", { "aria-label": "draft" }) })
      assert.equal((html.match(/<textarea/g) ?? []).length, 1); assert.match(html, /Saved conversation/)
      assert.ok(html.includes(expanded ? "Collapse chat" : "Expand chat"))
    }
  })
})
