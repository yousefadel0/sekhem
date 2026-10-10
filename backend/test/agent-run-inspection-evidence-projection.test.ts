import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import type { EvidenceReceipt } from "../src/agent-runtime/understanding/agent-presentation";
import type { RuntimeEvidenceReference } from "../src/workspace-intelligence/workspace-runtime.contract";

function runtimeReference(overrides: Partial<RuntimeEvidenceReference> = {}): RuntimeEvidenceReference {
  return {
    requestId: "inspection-request",
    workspaceId: "workspace-a",
    bindingVersion: 39,
    runtimeId: "runtime-a",
    runtimeFingerprint: "fingerprint-a",
    relativePath: "index.html",
    projectId: "project-a",
    organizationId: "org-a",
    userId: "user-a",
    conversationId: "conversation-a",
    operationId: "operation-a",
    receiptId: "receipt-a",
    observationTime: "2026-10-01T10:57:02.939Z",
    contentIdentity: { status: "UNAVAILABLE" },
    truncated: true,
    encoding: "utf-8-decoded",
    sourceType: "runtime-workspace",
    verificationState: "VERIFIED",
    ...overrides
  };
}

const presentationEvidence = (id: string, reference?: RuntimeEvidenceReference): EvidenceReceipt => ({
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
});

test("getRun projects verified truncated inspection evidence without losing or duplicating existing evidence", async () => {
  const verifiedTruncated = runtimeReference();
  const duplicate = runtimeReference({ requestId: "request-duplicate", operationId: "operation-duplicate", receiptId: "receipt-duplicate", relativePath: "already-read.ts", truncated: false });
  const unverified = runtimeReference({ requestId: "request-unverified", operationId: "operation-unverified", receiptId: "receipt-unverified", relativePath: "unverified.ts", verificationState: "UNVERIFIED" as any });
  const planOnly = presentationEvidence("plan-only");
  const planDuplicate = presentationEvidence("plan-duplicate", duplicate);
  const executionOnly = presentationEvidence("execution-only", runtimeReference({ requestId: "execution-request", operationId: "execution-operation", receiptId: "execution-receipt", relativePath: "executed.ts", truncated: false }));
  const inspection: any = {
    evidence: [verifiedTruncated, duplicate, unverified],
    operations: [
      { request: { operationId: verifiedTruncated.operationId }, action: { tool: "filesystem.read", relativePath: "index.html" }, state: "TRUNCATED", verification: "VERIFIED", evidence: verifiedTruncated },
      { request: { operationId: duplicate.operationId }, action: { tool: "filesystem.read", relativePath: "already-read.ts" }, state: "VERIFIED", verification: "VERIFIED", evidence: duplicate },
      { request: { operationId: unverified.operationId }, action: { tool: "filesystem.read", relativePath: "unverified.ts" }, state: "VERIFIED", verification: "UNVERIFIED", evidence: unverified }
    ]
  };
  const run: any = {
    id: "run-a", conversationId: "conversation-a", projectId: "project-a", userId: "user-a", agentName: "Agent", title: "Inspect index.html",
    status: "RUNNING", planVersion: 1, currentStepIndex: 0, progressPercent: 0, pausedAt: null, startedAt: null, completedAt: null,
    failureReason: null, cancellationReason: null, createdAt: new Date(), updatedAt: new Date(),
    plans: [{ id: "plan-a", agentRunId: "run-a", version: 1, summary: "Inspection", steps: [{ parameters: { inspectionLoop: true, evidenceReceipt: [planOnly, planDuplicate] } }] }],
    approvals: [], artifacts: []
  };
  const claims: any = { sub: "user-a", organizationId: "org-a", sessionId: "session-a", exp: 2_000_000_000 };
  const service: any = Object.create(AgentRuntimeService.prototype);
  Object.assign(service, {
    prisma: { agentRun: { findUnique: async () => run } },
    resourceAuthz: { assertAuthorized: async () => undefined },
    planExecution: { view: async () => ({ planVersion: 1, receipts: [executionOnly] }) },
    inspections: { view: async () => inspection }
  });

  const result = await service.getRun("run-a", claims);
  const evidence = result.presentation.evidence as EvidenceReceipt[];
  const projected = evidence.find(item => item.runtimeReference?.receiptId === verifiedTruncated.receiptId);

  assert.ok(projected);
  assert.equal(projected.operation, "filesystem.read");
  assert.equal(projected.relativePath, "index.html");
  assert.equal(projected.runtimeReference?.operationId, verifiedTruncated.operationId);
  assert.equal(projected.runtimeReference?.workspaceId, verifiedTruncated.workspaceId);
  assert.equal(projected.runtimeReference?.bindingVersion, verifiedTruncated.bindingVersion);
  assert.equal(projected.runtimeReference?.verificationState, "VERIFIED");
  assert.equal(projected.truncated, true);
  assert.ok(evidence.some(item => item.id === "plan-only"));
  assert.ok(evidence.some(item => item.id === "execution-only"));
  assert.equal(evidence.filter(item => item.runtimeReference?.receiptId === duplicate.receiptId).length, 1);
  assert.equal(evidence.some(item => item.runtimeReference?.receiptId === unverified.receiptId), false);
  service.planExecution.view = async () => ({ planVersion: 2, receipts: [executionOnly] });
  const mismatched = await service.getRun("run-a", claims);
  assert.equal(mismatched.presentation.evidence.some((item: EvidenceReceipt) => item.id === "execution-only"), false);
});
