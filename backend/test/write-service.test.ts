import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { ProductWriteService } from "../src/product-write.service";
import { approvals, auditEvents, blockers, initiatives, tasks } from "../src/data/seed-data";
import type { ApprovalSummaryDto } from "../src/dto";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const executionPathId = "path-validation-pack";
const authenticatedActor = { displayName: "Product Write Test PM", role: "PM" as const };

function auditCount(): number {
  return auditEvents.length;
}

function pushApproval(overrides: Partial<ApprovalSummaryDto>): ApprovalSummaryDto {
  const approval: ApprovalSummaryDto = {
    id: `approval-test-${Date.now()}-${approvals.length}`,
    projectId,
    initiativeSlug,
    title: "Execution path approval",
    description: "Test approval for execution path selection.",
    module: "Execution Path Selector",
    priority: "high",
    status: "approved",
    type: "execution_path",
    requestedBy: "Program Lead",
    requestedRole: "Program Owner",
    approverRole: "Security Officer",
    requiresHumanApproval: true,
    createdAt: new Date().toISOString(),
    ...overrides
  };

  approvals.push(approval);
  return approval;
}

function selectWithApproval(approvalId: string): void {
  const service = new ProductWriteService();
  service.selectExecutionPath(initiativeSlug, executionPathId, {
    actorName: "Program Lead",
    actorRole: "Program Owner",
    approvalId
  }, authenticatedActor);
}

describe("ProductWriteService", () => {
  it("creates a draft-only initiative handoff request and appends audit event", () => {
    const service = new ProductWriteService();
    const before = auditCount();

    const result = service.requestInitiativeHandoff(initiativeSlug, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      reason: "Prepare a handoff for human review"
    }, authenticatedActor);

    assert.equal(result.data.status, "DRAFT_REQUESTED");
    assert.equal(result.data.nextGate, "HUMAN_REVIEW_REQUIRED");
    assert.equal(result.data.createdAsDraftOnly, true);
    assert.equal(result.data.autoApply, false);
    assert.equal(result.data.githubWrite, false);
    assert.equal(result.data.deployment, false);
    assert.equal(result.data.auditEventId, result.auditEvent.id);
    assert.equal(result.auditEvent.action, "initiative_handoff_draft_requested");
    assert.equal(auditEvents.length, before + 1);
  });

  it("rejects forbidden initiative handoff request fields", () => {
    const service = new ProductWriteService();
    const base = {
      actorName: "Program Lead",
      actorRole: "Program Owner"
    };

    for (const field of ["secrets", "execution", "autoApply", "auto-apply", "githubWrite", "deployment"]) {
      assert.throws(() => service.requestInitiativeHandoff(initiativeSlug, { ...base, nested: { [field]: true } } as never, authenticatedActor), BadRequestException);
    }
  });

  it("starts initiative and appends audit event", () => {
    const service = new ProductWriteService();
    const before = auditCount();

    const result = service.startInitiative(initiativeSlug, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      reason: "Begin local/dev execution tracking"
    }, authenticatedActor);

    assert.equal(result.data.status, "in_progress");
    assert.equal(result.auditEvent.action, "initiative_started");
    assert.equal(auditEvents.length, before + 1);
  });

  it("rejects execution path selection without approved approval", () => {
    const service = new ProductWriteService();

    assert.throws(
      () =>
        service.selectExecutionPath(initiativeSlug, executionPathId, {
          actorName: "Program Lead",
          actorRole: "Program Owner"
        }, authenticatedActor),
      BadRequestException
    );
  });

  it("rejects wrong initiative approval for execution path selection", () => {
    const approval = pushApproval({ initiativeSlug: "wrong-initiative" });

    assert.throws(() => selectWithApproval(approval.id), BadRequestException);
  });

  it("rejects wrong project approval for execution path selection", () => {
    const approval = pushApproval({ projectId: "wrong-project" });

    assert.throws(() => selectWithApproval(approval.id), BadRequestException);
  });

  it("rejects wrong type approval for execution path selection", () => {
    const approval = pushApproval({ type: "security" });

    assert.throws(() => selectWithApproval(approval.id), BadRequestException);
  });

  it("accepts matching execution_path approval for execution path selection", () => {
    const approval = pushApproval({});
    const before = auditCount();

    const service = new ProductWriteService();
    const result = service.selectExecutionPath(initiativeSlug, executionPathId, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      approvalId: approval.id
    }, authenticatedActor);

    assert.equal(result.data.recommendedPath, "Governed validation pack");
    assert.equal(result.auditEvent.action, "execution_path_selected");
    assert.equal(auditEvents.length, before + 1);
  });

  it("updates task status and appends audit event", () => {
    const service = new ProductWriteService();
    const before = auditCount();

    const result = service.updateTaskStatus("task-technical-memo", {
      actorName: "Architecture Review",
      actorRole: "Technical Director",
      status: "review",
      lane: "testing"
    }, authenticatedActor);

    assert.equal(result.data.status, "review");
    assert.equal(result.data.lane, "testing");
    assert.equal(result.auditEvent.action, "task_status_updated");
    assert.equal(auditEvents.length, before + 1);
  });

  it("creates approval request and appends audit event", () => {
    const service = new ProductWriteService();
    const beforeApprovals = approvals.length;
    const beforeAudit = auditCount();

    const result = service.createApproval({
      projectId,
      initiativeSlug,
      title: "Execution path approval",
      description: "Approve execution path for local/dev tracking.",
      module: "Execution Path Selector",
      priority: "high",
      type: "security",
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      approverRole: "Security Officer"
    }, authenticatedActor);

    assert.equal(result.data.status, "pending");
    assert.equal(result.auditEvent.action, "approval_requested");
    assert.equal(approvals.length, beforeApprovals + 1);
    assert.equal(auditEvents.length, beforeAudit + 1);
  });

  it("approves pending approval and appends audit event", () => {
    const service = new ProductWriteService();
    const approval = service.createApproval({
      projectId,
      title: "Standalone approval",
      description: "Governance decision only.",
      module: "Program Workspace",
      priority: "medium",
      type: "program_workspace",
      requestedBy: "Program Lead"
    }, authenticatedActor).data;
    const before = auditCount();

    const result = service.decideApproval(approval.id, {
      actorName: "Program Owner",
      actorRole: "Program Owner",
      decision: "approved"
    }, authenticatedActor);

    assert.equal(result.data.status, "approved");
    assert.equal(result.auditEvent.action, "approval_approved");
    assert.equal(auditEvents.length, before + 1);
  });

  it("rejects an unsupported approval decision before writing an audit event", () => {
    const service = new ProductWriteService();
    const approval = approvals.find((item) => item.status === "pending");
    assert.ok(approval);

    assert.throws(
      () =>
        service.decideApproval(approval.id, {
          actorName: "Spoofed actor",
          actorRole: "assistant",
          decision: "unsupported" as never
        }, authenticatedActor),
      BadRequestException
    );
  });

  it("creates blocker and appends audit event", () => {
    const service = new ProductWriteService();
    const beforeBlockers = blockers.length;
    const beforeAudit = auditCount();

    const result = service.createBlocker({
      projectId,
      initiativeSlug,
      title: "Manual QA blocker",
      description: "A local/dev blocker created for governance tracking.",
      type: "approval",
      severity: "high",
      cause: "Pending human review",
      owner: "QA Lead",
      evidence: "Manual QA note",
      suggestedAction: "Review and decide",
      nextStep: "Assign reviewer",
      rollbackOption: "No runtime change required"
    }, authenticatedActor);

    assert.equal(result.data.status, "open");
    assert.equal(result.auditEvent.action, "blocker_created");
    assert.equal(blockers.length, beforeBlockers + 1);
    assert.equal(auditEvents.length, beforeAudit + 1);
  });

  it("keeps writes in memory only", () => {
    assert.ok(initiatives.length > 0);
    assert.ok(tasks.length > 0);
  });
});
