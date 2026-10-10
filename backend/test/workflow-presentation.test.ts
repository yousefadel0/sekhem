import assert from "node:assert/strict";
import { test } from "node:test";
import { projectDownstreamWorkflow } from "../src/conversation/workflow-presentation";
import { RuntimeLedgerService } from "../src/trusted-runtime/runtime-ledger.service";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { ConversationService } from "../src/conversation/conversation.service";

async function fixture(changes: any[] = []) {
  const rows = new Map<string, any>(); const approvals = new Map<string, any>();
  const db: any = { auditEvent: { findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
    create: async ({ data }: any) => { rows.set(data.id, structuredClone(data)); return data; } },
    agentApproval: { findUnique: async ({ where }: any) => approvals.get(where.id) ?? null } };
  const ledger = new RuntimeLedgerService(db), conversation = { id: "conversation", userId: "user", projectId: "project", metadata: { runtimeWorkspace: { workspaceId: "workspace", bindingVersion: 40 } } };
  const p: any = { version: 1, proposalId: "proposal", status: "EXACT_PROPOSAL_READY", conversationId: "conversation", userId: "user",
    projectId: "project", planId: "plan", planVersion: 4, planDigest: "a".repeat(64), sourceRunId: "source", sourceSequence: 1,
    sourceDigest: "b".repeat(64), evidenceReferences: [], changes, workspace: { workspaceId: "workspace", bindingVersion: 40, runtimeFingerprint: "secret-runtime" } };
  p.digest = toolDigest(p);
  await ledger.create(db, "EXACT_PROPOSAL", ["user", "conversation", "plan"], p, { immutable: true });
  const run = { id: "run", planVersion: 4, plans: [{ id: "plan", steps: [{ parameters: { engineeringPlan: { digest: p.planDigest } } }] }] };
  const key = ["user", "conversation", "proposal"];
  const approvalId = `exactapproval_${toolDigest([...key, 2])}`;
  await ledger.create(db, "EXACT_APPROVAL_HEAD", key, { generation: 2, approvalId, requestId: "request" });
  approvals.set(approvalId, { id: approvalId, agentRunId: "run", approvalType: "EXACT_PROPOSAL", status: "PENDING", dueAt: new Date(5000),
    revisedPlan: { proposalId: p.proposalId, proposalVersion: 1, proposalDigest: p.digest, planId: p.planId, planVersion: 4,
      planDigest: p.planDigest, conversationId: p.conversationId, workspace: p.workspace, sourceDigest: p.sourceDigest,
      sourceRunId: p.sourceRunId, sourceSequence: p.sourceSequence,
      sourceFingerprint: toolDigest({ workspace: p.workspace, sourceRunId: p.sourceRunId, sourceSequence: p.sourceSequence, sourceDigest: p.sourceDigest, evidenceReferences: [] }),
      raw: "raw-model-response", generation: 2, requestId: "request" } });
  const approvalBinding = approvals.get(approvalId).revisedPlan; approvalBinding.fingerprint = toolDigest(approvalBinding);
  await ledger.create(db, "EXACT_PERMIT_HEAD", key, { generation: 2, permitId: "permit", requestId: "permit-request" });
  await ledger.create(db, "EXACT_EXECUTION_PERMIT", [...key, 2], { permitId: "permit", expiresAt: new Date(4000).toISOString(),
    binding: { proposalDigest: p.digest, approvalId, generation: 2, sessionId: "secret-session" } });
  return { db, rows, approvals, ledger, conversation, run, approvalId, key };
}

test("projects only current safe identities/generations/deadlines and never mutates ledger/approval", async () => {
  const f = await fixture(), before = JSON.stringify([...f.rows, ...f.approvals]);
  const view = await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000);
  assert.equal(view?.proposal.state, "READY"); assert.equal(view?.approval?.generation, 2);
  assert.equal(view?.approval?.actionable, true); assert.equal(view?.permit?.state, "UNUSED");
  assert.doesNotMatch(JSON.stringify(view), /secret-session|secret-runtime|raw-model-response|evidenceReferences|revisedPlan/);
  assert.equal(JSON.stringify([...f.rows, ...f.approvals]), before);
});

test("expired approvals are not actionable and changed plan/workspace/source fails closed for presentation", async () => {
  const f = await fixture();
  assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 6000))?.approval?.actionable, false);
  assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 6000))?.approval?.state, "EXPIRED");
  f.approvals.get(f.approvalId).revisedPlan.sourceDigest = "changed";
  assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000))?.approval?.state, "STALE");
  f.conversation.metadata.runtimeWorkspace.bindingVersion = 41;
  assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000))?.proposal.state, "STALE");
});

test("permit consumption is projected from persisted consumption, never inferred from approval", async () => {
  const f = await fixture();
  await f.ledger.create(f.db, "EXACT_PERMIT_CONSUMPTION", "permit", { executionIntentId: "execution" });
  assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000))?.permit?.state, "CONSUMED");
});

test("activity never projects raw reasoning/tool output, including misleading whitelisted payload fields", () => {
  for (const eventType of ["THOUGHT", "TOOL_RESULT", "TOOL_CALL", "LOG", "EXECUTION_OUTPUT"]) {
    const entry = (ConversationService as any).activityEntry({ id: "event", agentRunId: "run", eventType, timestamp: new Date(),
      payload: { reason: "secret_reasoning", status: "raw_model", text: "raw-response", output: "tool-output" } });
    assert.equal(entry.details, undefined); assert.doesNotMatch(JSON.stringify(entry), /secret_reasoning|raw_model|raw-response|tool-output/);
  }
});

test("real conversation aggregate restores workflow, filters expired approval controls, and preserves message association without writes", async () => {
  const f = await fixture();
  const dueAt = new Date(Date.now() + 10000);
  f.approvals.get(f.approvalId).dueAt = dueAt;
  const saved: any = { ...f.run, conversationId: f.conversation.id, projectId: f.conversation.projectId,
    title: "Plan", agentName: "SEKHEM", status: "COMPLETED", createdAt: new Date(), updatedAt: new Date(),
    artifacts: [], events: [], approvals: [{ id: f.approvalId, approvalType: "EXACT_PROPOSAL", status: "PENDING", dueAt }] };
  const conv: any = { ...f.conversation, agentRuns: [saved], attachments: [],
    messages: [{ id: "request-message", senderType: "user", content: "Plan only", metadata: { agentRunId: "run", planVersion: 4 } }] };
  f.db.conversation = { findUnique: async () => conv };
  const before = JSON.stringify([...f.rows, ...f.approvals]);
  const service = new ConversationService(f.db);
  const detail = await service.getConversation(conv.id, conv.userId);
  assert.equal(detail.agentRuns[0].workflow?.approval?.id, f.approvalId);
  assert.equal(detail.agentRuns[0].pendingApprovals.length, 1);
  assert.equal(detail.agentRuns[0].presentation.originatingMessageId, "request-message");
  assert.equal(JSON.stringify([...f.rows, ...f.approvals]), before);
  f.approvals.get(f.approvalId).dueAt = new Date(0);
  const restored = await service.getConversation(conv.id, conv.userId);
  assert.equal(restored.agentRuns[0].workflow?.approval?.state, "EXPIRED");
  assert.equal(restored.agentRuns[0].pendingApprovals.length, 0);
});

test("proposal preview projects bounded reviewed changes, excluding hashes/raw fields and oversized content", async () => {
  const f = await fixture([{ path: "index.html", before: "<span>simple</span>", after: "<span>intelligent</span>", originalHash: "private-hash", raw: "raw-model-response" }]);
  const view = await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000);
  assert.deepEqual(view?.proposal.changes, [{ path: "index.html", before: "<span>simple</span>", after: "<span>intelligent</span>" }]);
  assert.doesNotMatch(JSON.stringify(view), /private-hash|raw-model-response/);
  const oversized = await fixture([{ path: "index.html", before: "x".repeat(8193), after: "short" }]);
  assert.deepEqual((await projectDownstreamWorkflow(oversized.db, oversized.run, oversized.conversation, 2000))?.proposal.changes, []);
});

test("current fingerprint and generation restore safely; invalid decision metadata fails closed", async () => {
  const f = await fixture(); const row = f.approvals.get(f.approvalId);
  const view = await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000);
  assert.equal(view?.approval?.fingerprint, row.revisedPlan.fingerprint); assert.equal(view?.approval?.generation, 2);
  row.revisedPlan.fingerprint = "invalid";
  const invalid = await projectDownstreamWorkflow(f.db, f.run, f.conversation, 2000);
  assert.equal(invalid?.approval?.state, "STALE"); assert.equal(invalid?.approval?.actionable, false); assert.equal(invalid?.approval?.fingerprint, undefined);
});
test("expired deadline does not turn rejected/cancelled decisions into renewable approval", async () => {
  for (const status of ["DENIED", "CANCELLED"]) {
    const f = await fixture(); f.approvals.get(f.approvalId).status = status;
    assert.equal((await projectDownstreamWorkflow(f.db, f.run, f.conversation, 6000))?.approval?.state, status);
  }
});
