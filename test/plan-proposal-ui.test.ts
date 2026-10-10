import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CompactPlanCard, CompactProposalCard, AgentRunCard } from "../components/chat/agent-run-card"
import { reconcileConversationSnapshot, snapshotDeliveryFailure } from "../lib/conversation-restoration"
import { runPhase } from "../lib/sekhem-agent"
const identity: any = { planId: "plan", planVersion: 4, digest: "digest", sourceRunId: "source", understandingSequence: 1, workspace: { workspaceId: "workspace", bindingVersion: 40 }, evidenceReferences: [] }
const planning: any = { understanding: { constraints: [{ id: "preserve", description: "Preserve markup" }] }, plan: { readiness: "PLAN_READY", validation: { valid: true }, steps: [{ id: "change", objective: "Change Hero text", effect: "WRITE" }], successCriteria: [{ id: "verify", description: "Verify exact heading" }] } }
const proposal: any = { id: "proposal", version: 1, digest: "digest", revision: 1, state: "READY", changes: [{ path: "index.html", before: "<span>simple</span>", after: "<span>intelligent</span>" }] }
test("compact plan shows change/preservation/verification and proposal-only Proceed", () => {
  const html = renderToStaticMarkup(React.createElement(CompactPlanCard, { planning, identity, onProceed: () => {} }));
  for (const text of ["What changes", "What is preserved", "Verification", "Change Hero text", "Preserve markup", "Verify exact heading", "Proceed", "prepares the exact proposal only"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Execution unavailable|Allow once/);
  assert.match(renderToStaticMarkup(React.createElement(CompactPlanCard, { planning, identity, onProceed: () => {}, disabled: true })), /disabled/);
});
test("compact proposal renders exact before/after identity/readiness with separate next approval", () => {
  const html = renderToStaticMarkup(React.createElement(CompactProposalCard, { proposal }));
  for (const text of ["Before", "After", "simple", "intelligent", "Version 1", "Ready for review", "Preservation", "request human approval separately"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<button|Allow once/);
});
test("PLAN_READY is not proposal readiness; reload restores exact proposal without commands", () => {
  const run: any = { id: "run", status: "COMPLETED", outcome: "PLAN_READY", planVersion: 4, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
  assert.equal(runPhase(run), "PLAN_READY");
  const snapshot: any = { id: "conversation", projectId: "project", messages: [], agentRuns: [{ ...run, workflow: { observedAt: 2, proposal } }] };
  const restored = reconcileConversationSnapshot(undefined, structuredClone(snapshot));
  assert.equal(runPhase(restored.agentRuns[0]), "PROPOSAL_READY");
  const older = structuredClone(snapshot); older.agentRuns[0].workflow.observedAt = 1; older.agentRuns[0].workflow.proposal.state = "STALE";
  assert.equal(reconcileConversationSnapshot(restored, older).agentRuns[0].workflow?.proposal.state, "READY");
  assert.equal(snapshotDeliveryFailure(restored).snapshot, restored);
});
test("ordinary run cards do not acquire a Proceed control", () => {
  const html = renderToStaticMarkup(React.createElement(AgentRunCard, { run: { id: "chat", status: "COMPLETED", title: "Hello" } as any, onSelect: () => {} }));
  assert.doesNotMatch(html, />Proceed<|Modification plan|Exact modification proposal/);
});
