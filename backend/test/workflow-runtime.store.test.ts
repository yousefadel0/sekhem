import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AutomationContractService } from "../src/automation-contract.service";
import { InProcessWorkflowRuntimeStore } from "../src/workflow-runtime.store";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";

function validCallback(workflowRunId: string, status = "running", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = `${Date.now()}-${Math.random()}`;
  return {
    workflowRunId,
    issueId: "PROD-03.002",
    taskId: "PROD-03.002",
    step: `fp01-${status}`,
    status,
    resultSummary: status === "succeeded" ? "Workflow completed safely." : "Workflow state stored safely.",
    evidence: [
      {
        type: "test",
        label: "FP-01 workflow persistence test",
        value: "backend/test/workflow-runtime.store.test.ts"
      }
    ],
    idempotencyKey: `FP-01:${workflowRunId}:${suffix}:${status}`,
    occurredAt: new Date().toISOString(),
    ...overrides
  };
}

function serviceWithStore(store = new InProcessWorkflowRuntimeStore()): AutomationContractService {
  const service = new AutomationContractService();
  service.setWorkflowRuntimeStoreForTest(store);
  return service;
}

describe("FP-01 workflow runtime persistence store", () => {
  it("creates a workflow run and reads it back through the runtime store", async () => {
    const service = serviceWithStore();

    const created = await service.recordWorkflowEvent({
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Tasker 4",
      requestedRole: "backend_owner",
      reason: "FP-01 persistence test"
    });

    const runId = created.data.id;
    const readBack = await service.getWorkflowRun(runId);
    const listed = await service.listWorkflowRuns();

    assert.equal(readBack.id, runId);
    assert.equal(readBack.status, "queued");
    assert.equal(listed.some((item) => item.id === runId), true);
    assert.doesNotMatch(readBack.note, /memory-only/i);
  });

  it("stores workflow state transitions and reads the latest persisted state", async () => {
    const store = new InProcessWorkflowRuntimeStore();
    const service = serviceWithStore(store);

    const created = await service.recordWorkflowEvent({
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Tasker 4",
      requestedRole: "backend_owner"
    });

    const running = await service.recordWorkflowCallback(validCallback(created.data.id, "running"));
    const succeeded = await service.recordWorkflowCallback(validCallback(created.data.id, "succeeded"));
    const readBack = await service.getWorkflowRun(created.data.id);
    const latest = await store.getLatestCallback(created.data.id);

    assert.equal(running.accepted, true);
    assert.equal(succeeded.accepted, true);
    assert.equal(readBack.status, "succeeded");
    assert.equal(latest?.status, "succeeded");
    assert.equal(latest?.resultSummary, "Workflow completed safely.");
  });

  it("persists idempotency records and rejects reused keys with changed payload", async () => {
    const store = new InProcessWorkflowRuntimeStore();
    const service = serviceWithStore(store);
    const created = await service.recordWorkflowEvent({
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Tasker 4",
      requestedRole: "backend_owner"
    });

    const body = validCallback(created.data.id, "running");
    const first = await service.recordWorkflowCallback(body);
    const duplicate = await service.recordWorkflowCallback(body);
    const conflict = await service.recordWorkflowCallback({
      ...body,
      step: "fp01-changed-step"
    });

    assert.equal(first.accepted, true);
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(conflict.accepted, false);
    assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
  });

  it("stores failed workflow state safely with sanitized error details", async () => {
    const store = new InProcessWorkflowRuntimeStore();
    const service = serviceWithStore(store);
    const created = await service.recordWorkflowEvent({
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Tasker 4",
      requestedRole: "backend_owner"
    });

    await service.recordWorkflowCallback(validCallback(created.data.id, "running"));
    const failed = await service.recordWorkflowCallback(validCallback(created.data.id, "failed", {
      resultSummary: undefined,
      error: {
        code: "FP01_SAFE_FAILURE",
        message: "Workflow failed safely and remained customer-safe."
      }
    }));
    const readBack = await service.getWorkflowRun(created.data.id);
    const latest = await store.getLatestCallback(created.data.id);

    assert.equal(failed.accepted, true);
    assert.equal(readBack.status, "failed");
    assert.equal(latest?.status, "failed");
    assert.equal(latest?.error?.message, "Workflow failed safely and remained customer-safe.");
  });

  it("stores blocked workflow state with safe blocker metadata", async () => {
    const store = new InProcessWorkflowRuntimeStore();
    const service = serviceWithStore(store);
    const created = await service.recordWorkflowEvent({
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Tasker 4",
      requestedRole: "backend_owner"
    });

    await service.recordWorkflowCallback(validCallback(created.data.id, "running"));
    const blocked = await service.recordWorkflowCallback(validCallback(created.data.id, "blocked", {
      resultSummary: undefined,
      blocker: {
        reason: "FP-01 test blocker requires PM decision.",
        owner: "Tasker 4",
        severity: "high",
        pmDecisionNeeded: "Review safe blocker routing."
      }
    }));
    const readBack = await service.getWorkflowRun(created.data.id);
    const latest = await store.getLatestCallback(created.data.id);

    assert.equal(blocked.accepted, true);
    assert.equal(readBack.status, "blocked");
    assert.equal(latest?.status, "blocked");
    assert.equal(latest?.blocker?.owner, "Tasker 4");
  });
});
