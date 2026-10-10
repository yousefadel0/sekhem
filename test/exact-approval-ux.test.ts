import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ExactProposalApprovalCard } from "../components/chat/exact-proposal-approval-card"
import { approveExactAction, approvalPresentation } from "../lib/exact-proposal-approval"
import { reconcileConversationSnapshot } from "../lib/conversation-restoration"
const view = (): any => ({ observedAt: 1, proposal: { id: "proposal-secret-id", planId: "plan", version: 1, digest: "a".repeat(64), revision: 1, state: "READY", changes: [{ path: "index.html", before: "simple", after: "intelligent" }], verification: ["Read-back and expected content hash comparison"] } })
const row = (state: string): any => ({ id: "approval-secret-id", generation: 2, revision: 1, state, deadline: "2099-01-01T00:00:00Z", actionable: state === "PENDING", fingerprint: "b".repeat(64) })
test("approval review labels exact before and after with bounded responsive code panes", () => {
  const html = renderToStaticMarkup(React.createElement(ExactProposalApprovalCard, { conversationId: "conversation", workflow: view() }))
  assert.match(html, /Review this exact change/)
  assert.match(html, />Before</); assert.match(html, />After</)
  assert.match(html, /sm:grid-cols-2/); assert.match(html, /max-h-48 overflow-auto/)
  assert.equal((html.match(/<pre dir="ltr"/g) || []).length, 2)
})
test("terminal approval outcomes never retain a ready-to-change headline", () => {
  for (const state of ["APPROVED", "DENIED", "CANCELLED", "EXPIRED", "STALE", "INVALID"]) {
    const w = view(); w.approval = row(state)
    const html = renderToStaticMarkup(React.createElement(ExactProposalApprovalCard, { conversationId: "conversation", workflow: w }))
    assert.doesNotMatch(html, /Ready to make this change|<h4>Review this exact change/)
  }
})
for (const [state, label] of [["PENDING", "Waiting for your approval"], ["APPROVED", "Approved · Execution is a separate stage"], ["DENIED", "Approval declined"], ["CANCELLED", "Approval cancelled"], ["EXPIRED", "Approval expired"], ["STALE", "Approval no longer valid"], ["INVALID", "Approval no longer valid"]]) test(`approval card: ${state}`, () => {
  const w = view(); w.approval = row(state);
  const html = renderToStaticMarkup(React.createElement(ExactProposalApprovalCard, { conversationId: "conversation", workflow: w }));
  assert.ok(html.includes(label)); assert.ok(html.includes("index.html")); assert.ok(html.includes("simple")); assert.ok(html.includes("intelligent"));
  if (["APPROVED", "DENIED", "CANCELLED", "STALE", "INVALID"].includes(state)) assert.doesNotMatch(html, /<button/);
  if (state === "EXPIRED") assert.match(html, /Renew and approve this action/);
  const primary = html.replace(/<details[\s\S]*?<\/details>/g, "");
  assert.doesNotMatch(primary, /secret-id|aaaaaaa|bbbbbbb|filesystem\.|runtimeFingerprint|Approve for (?:all|this task|this session)/);
});
test("stale snapshot disables approval; expired pending deadline never submits its old fingerprint", () => {
  const w = view(); w.approval = row("PENDING");
  const html = renderToStaticMarkup(React.createElement(ExactProposalApprovalCard, { conversationId: "conversation", workflow: w, stale: true }));
  assert.match(html, /disabled/); assert.match(html, /Showing saved state/);
  w.approval.deadline = "2000-01-01"; assert.equal(approvalPresentation(w).state, "EXPIRED");
});
test("reload uses persisted current-generation fingerprint without creating another request", async () => {
  const w = view(); w.approval = row("PENDING");
  const run: any = { id: "run", status: "COMPLETED", createdAt: "2026-10-01", planVersion: 4, workflow: w };
  const snapshot: any = { id: "conversation", projectId: "project", messages: [], agentRuns: [run] };
  const restored = reconcileConversationSnapshot(undefined, structuredClone(snapshot)); let count = 0;
  await approveExactAction("conversation", restored.agentRuns[0].workflow!, "request", false, async (url, body) => { count++; assert.ok(url.endsWith("/decision")); assert.equal(body.fingerprint, w.approval.fingerprint); assert.equal(body.approvalId, w.approval.id); return { status: "APPROVED", approvalId: body.approvalId, generation: 2 }; });
  assert.equal(count, 1);
});
test("invalid/stale/context-change and unsupported scope states cannot authorize", async () => {
  const w = view(); let calls = 0; const post = async () => { calls++; return {}; };
  await assert.rejects(approveExactAction("conversation", w, "id", true, post)); assert.equal(calls, 0);
  for (const state of ["STALE", "INVALID", "DENIED", "CANCELLED", "APPROVED", "TASK", "SESSION", "ALL"]) { w.approval = row(state); await assert.rejects(approveExactAction("conversation", w, "id", false, post)); }
  assert.equal(calls, 0); w.approval = row("PENDING");
  await assert.rejects(approveExactAction("conversation", w, "id", false, post, () => false)); assert.equal(calls, 0);
});

test("missing review preview or consumed permit disables new approval", async () => {
  const w = view(); w.proposal.changes = [];
  assert.equal(approvalPresentation(w).canApprove, false);
  w.proposal.changes = [{ path: "index.html", before: "simple", after: "intelligent" }]; w.permit = { state: "CONSUMED" };
  assert.equal(approvalPresentation(w).canApprove, false);
  await assert.rejects(approveExactAction("conversation", w, "id", false, async () => { throw new Error("must not send"); }));
});
test("snapshot becoming stale between request and decision stops submission", async () => {
  const w = view(); let valid = true, count = 0;
  await assert.rejects(approveExactAction("conversation", w, "id", false, async () => { count++; valid = false; return { approvalId: "approval", generation: 1, status: "PENDING", dueAt: "2099-01-01", binding: { proposalId: w.proposal.id, proposalDigest: w.proposal.digest, proposalVersion: 1, planId: "plan", fingerprint: "b".repeat(64) } }; }, () => valid), /APPROVAL_CONTEXT_CHANGED/);
  assert.equal(count, 1);
});
