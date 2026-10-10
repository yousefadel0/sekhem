import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { ConversationService } from "../src/conversation/conversation.service";
import type { EvidenceReceipt } from "../src/agent-runtime/understanding/agent-presentation";
import type { RuntimeEvidenceReference } from "../src/workspace-intelligence/workspace-runtime.contract";

function runtimeReference(overrides: Partial<RuntimeEvidenceReference> = {}): RuntimeEvidenceReference {
  return {
    requestId: "inspection-request",
    workspaceId: "workspace-live",
    bindingVersion: 39,
    runtimeId: "runtime-live",
    runtimeFingerprint: "fingerprint-live",
    relativePath: "index.html",
    projectId: "project-live",
    organizationId: "org-live",
    userId: "user-live",
    conversationId: "conversation-live",
    operationId: "operation-live",
    receiptId: "receipt-live",
    observationTime: "2026-10-01T11:20:45.273Z",
    contentIdentity: { status: "UNAVAILABLE" },
    truncated: true,
    encoding: "utf-8-decoded",
    sourceType: "runtime-workspace",
    verificationState: "VERIFIED",
    ...overrides
  };
}

function receipt(id: string, reference?: RuntimeEvidenceReference): EvidenceReceipt {
  return {
    id,
    sourceType: "workspace",
    ...(reference ? { runtimeReference: reference, operation: "filesystem.read" } : {}),
    label: reference?.relativePath ?? id,
    ...(reference ? { relativePath: reference.relativePath } : {}),
    outcome: "READ",
    discovered: true,
    read: true,
    selected: true,
    usedInAnswer: "UNKNOWN",
    truncated: false,
    selectionReason: "Existing plan evidence."
  };
}

test("conversation snapshot includes verified truncated inspection evidence in the embedded AgentRun", async () => {
  const inspected = runtimeReference();
  const duplicate = runtimeReference({ receiptId: "receipt-duplicate", operationId: "operation-duplicate", relativePath: "already-read.ts", truncated: false });
  const unverified = runtimeReference({ receiptId: "receipt-unverified", operationId: "operation-unverified", relativePath: "unverified.ts", verificationState: "UNVERIFIED" as any });
  const mismatched = runtimeReference({ receiptId: "receipt-mismatched", operationId: "operation-mismatched", relativePath: "mismatched.ts" });
  const planOnly = receipt("plan-only");
  const planDuplicate = receipt("plan-duplicate", duplicate);
  const executionOnly = receipt("execution-only", runtimeReference({ receiptId: "execution-receipt", operationId: "execution-operation", relativePath: "executed.ts", truncated: false }));
  const inspection: any = {
    evidence: [inspected, duplicate, unverified, mismatched],
    operations: [
      { request: { operationId: inspected.operationId }, action: { tool: "filesystem.read", relativePath: "index.html" }, state: "TRUNCATED", verification: "VERIFIED", evidence: inspected },
      { request: { operationId: duplicate.operationId }, action: { tool: "filesystem.read", relativePath: "already-read.ts" }, state: "VERIFIED", verification: "VERIFIED", evidence: duplicate },
      { request: { operationId: unverified.operationId }, action: { tool: "filesystem.read", relativePath: "unverified.ts" }, state: "TRUNCATED", verification: "UNVERIFIED", evidence: unverified },
      { request: { operationId: mismatched.operationId }, action: { tool: "filesystem.read", relativePath: "mismatched.ts" }, state: "TRUNCATED", verification: "VERIFIED", evidence: { ...mismatched, receiptId: "different-receipt" } }
    ]
  };
  const run: any = {
    id: "run-live", conversationId: "conversation-live", projectId: "project-live", userId: "user-live", agentName: "Agent", title: "Analyze index.html",
    status: "RUNNING", planVersion: 1, currentStepIndex: 0, progressPercent: 0, pausedAt: null, startedAt: null, completedAt: null,
    failureReason: null, cancellationReason: null, createdAt: new Date(), updatedAt: new Date(),
    plans: [{ id: "plan-live", agentRunId: "run-live", version: 1, summary: "Inspection", steps: [{ parameters: { inspectionLoop: true, evidenceReceipt: [planOnly, planDuplicate] } }] }],
    approvals: [], artifacts: [], events: []
  };
  const claims: any = { sub: "user-live", organizationId: "org-live", sessionId: "session-live", exp: 2_000_000_000 };
  const runtime: any = Object.create(AgentRuntimeService.prototype);
  Object.assign(runtime, {
    prisma: { agentRun: { findUnique: async () => run } },
    resourceAuthz: { assertAuthorized: async () => undefined },
    planExecution: { view: async () => ({ planVersion: run.planVersion, receipts: [executionOnly] }) },
    inspections: { view: async () => inspection }
  });
  const conversation = {
    id: "conversation-live", projectId: "project-live", userId: "user-live", title: "Live inspection", status: "ACTIVE", metadata: {},
    createdAt: new Date(), updatedAt: new Date(), _count: { messages: 0 }, messages: [], attachments: [],
    agentRuns: [{ ...run, events: [], artifacts: [], approvals: [] }]
  };
  const service = new ConversationService({ conversation: { findUnique: async () => conversation } } as any, runtime);

  const detail = await service.getConversation("conversation-live", "user-live", claims);
  const evidence = detail.agentRuns[0].presentation.evidence as EvidenceReceipt[];
  const projected = evidence.find(item => item.runtimeReference?.receiptId === inspected.receiptId);

  assert.ok(projected);
  assert.equal(projected.operation, "filesystem.read");
  assert.equal(projected.relativePath, "index.html");
  assert.equal(projected.runtimeReference?.operationId, inspected.operationId);
  assert.equal(projected.runtimeReference?.workspaceId, inspected.workspaceId);
  assert.equal(projected.runtimeReference?.bindingVersion, inspected.bindingVersion);
  assert.equal(projected.runtimeReference?.verificationState, "VERIFIED");
  assert.equal(projected.outcome, "TRUNCATED");
  assert.equal(projected.truncated, true);
  assert.ok(evidence.some(item => item.id === "plan-only"));
  assert.ok(evidence.some(item => item.id === "execution-only"));
  assert.equal(evidence.filter(item => item.runtimeReference?.receiptId === duplicate.receiptId).length, 1);
  assert.equal(evidence.some(item => item.runtimeReference?.receiptId === unverified.receiptId), false);
  assert.equal(evidence.some(item => item.runtimeReference?.receiptId === mismatched.receiptId), false);
});

for (const state of ["RUNNING", "PAUSE_REQUESTED", "PAUSED"] as const) test(`conversation reload retains authoritative ${state} control reference without starting work`, async () => {
  const now = new Date(), run: any = { id: "run-paused", conversationId: "conversation-paused", projectId: "project", userId: "user",
    status: state === "PAUSED" ? "PAUSED" : "RUNNING", planVersion: 1, createdAt: now, updatedAt: now, plans: [], approvals: [], artifacts: [], events: [] };
  const conversation: any = { id: run.conversationId, projectId: run.projectId, userId: run.userId, title: "Review", status: "ACTIVE", metadata: {}, createdAt: now, updatedAt: now,
    messages: [], attachments: [], agentRuns: [run] };
  const workflowPause = { runId: run.id, conversationId: run.conversationId, state, revision: 3, resumeStatus: "AWAITING_APPROVAL" };
  const runtime: any = { getRun: async (id: string) => { assert.equal(id, run.id); return { ...run, workflowPause, workflowDecision: null, inspection: { state: "APPROVED" } }; } };
  const db: any = { conversation: { findUnique: async () => conversation } };
  const service = new ConversationService(db, runtime);
  const claims: any = { sub: run.userId, organizationId: "org" };
  for (let i = 0; i < 2; i++) {
    const snapshot = await service.getConversation(run.conversationId, run.userId, claims);
    assert.deepEqual(snapshot.agentRuns[0].workflowPause, workflowPause);
    assert.equal(snapshot.agentRuns[0].status, run.status);
    assert.equal(snapshot.agentRuns[0].workflowDecision, null);
  }
});
for (const decision of ["REJECT", "SKIP"] as const) test(`conversation reload retains persisted ${decision} without authority`, async () => {
  const now = new Date(), run: any = { id: "run-decision", conversationId: "conversation-decision", projectId: "project", userId: "user", status: "COMPLETED", planVersion: 1,
    createdAt: now, updatedAt: now, plans: [], approvals: [], artifacts: [], events: [] };
  const conv: any = { id: run.conversationId, projectId: run.projectId, userId: run.userId, metadata: {}, createdAt: now, updatedAt: now, messages: [], attachments: [], agentRuns: [run] };
  const saved = { decision, planId: "immutable-plan", planVersion: 1, canContinue: false };
  const service = new ConversationService({ conversation: { findUnique: async () => conv } } as any,
    { getRun: async () => ({ ...run, workflowDecision: saved, workflowPause: null }) } as any);
  assert.deepEqual((await service.getConversation(conv.id, run.userId, { sub: "user", organizationId: "org" } as any)).agentRuns[0].workflowDecision, saved);
});
