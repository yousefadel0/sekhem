import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { aiPatchDrafts } from "../src/ai-patch-memory";
import { AiPatchService } from "../src/ai-patch.service";

const validPayload = {
  title: "Draft validation helper for SONiC reboot logs",
  requestedBy: "pm",
  targetArea: "validation_tools",
  intent: "Create a draft-only helper proposal for reviewing cold reboot log patterns.",
  constraints: ["No file apply", "No GitHub write", "No deployment"],
  safetyNotes: ["Human review required before any code change."]
};

const validArtifact = {
  artifactType: "CODE_DIFF_PREVIEW" as const,
  filePath: "backend/src/validation/reboot-log-helper.ts",
  title: "Draft reboot log validation helper",
  summary: "Review-only helper preview for cold reboot log patterns.",
  contentPreview: "export function summarizeRebootLog(): string { return \"review-only\"; }",
  diffPreview: "+ export function summarizeRebootLog(): string { return \"review-only\"; }",
  riskLevel: "low" as const,
  reviewNotes: "Review the proposal only. Do not apply files."
};
const artifactCreator = "artifact-reviewer";

describe("AiPatchService draft-only workspace", () => {
  beforeEach(() => {
    aiPatchDrafts.length = 0;
  });

  it("stores and reads a draft in memory only", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    assert.equal(aiPatchDrafts.length, 1);
    assert.equal(service.getDraft(draft.draftId), draft);
    assert.equal(draft.status, "DRAFT_REQUESTED");
    assert.equal(draft.createdAsDraftOnly, true);
    assert.equal(draft.autoApply, false);
    assert.equal(draft.githubWrite, false);
    assert.equal(draft.deployment, false);
    assert.equal(draft.nextGate, "HUMAN_REVIEW_REQUIRED");
    assert.equal(draft.statusHistory.length, 1);
    assert.equal(draft.statusHistory[0]?.status, "DRAFT_REQUESTED");
    assert.deepEqual(draft.artifacts, []);
  });

  it("creates, lists, and reads review-only artifacts without advancing status", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);
    const artifact = service.createArtifact(draft.draftId, validArtifact, artifactCreator);

    assert.match(artifact.artifactId, /^ai-patch-artifact-/);
    assert.equal(artifact.applyAllowed, false);
    assert.equal(artifact.githubWrite, false);
    assert.equal(artifact.deployment, false);
    assert.equal(artifact.createdAsDraftOnly, true);
    assert.equal(artifact.createdBy, artifactCreator);
    assert.equal(draft.status, "DRAFT_REQUESTED");
    assert.deepEqual(service.listArtifacts(draft.draftId), [artifact]);
    assert.equal(service.getArtifact(draft.draftId, artifact.artifactId), artifact);
  });

  it("returns a consolidated read-only audit timeline from existing draft data", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    service.createArtifact(draft.draftId, validArtifact, artifactCreator);
    service.updateDraftStatus(draft.draftId, {
      status: "DRAFT_PREPARED",
      changedBy: "backend-reviewer",
      reason: "Draft outline prepared for review.",
      reviewNotes: "No code was generated or applied."
    });
    service.updateDraftStatus(draft.draftId, {
      status: "REVIEW_REQUIRED",
      changedBy: "backend-reviewer",
      reason: "Draft outline is ready for human review.",
      reviewNotes: "Human decision is required."
    });
    service.approveDraft(draft.draftId, {
      changedBy: "pm",
      reason: "Approve the reviewed draft record only.",
      reviewNotes: "Approval does not apply artifacts."
    });

    const audit = service.getAudit(draft.draftId);
    assert.deepEqual(
      audit.auditEvents.map((event) => event.eventType),
      ["DRAFT_REQUESTED", "ARTIFACT_CREATED", "STATUS_CHANGED", "STATUS_CHANGED", "APPROVED"]
    );
    assert.equal(audit.draftId, draft.draftId);
    assert.equal(audit.currentStatus, "APPROVED");
    assert.equal(audit.createdAsDraftOnly, true);
    assert.equal(audit.autoApply, false);
    assert.equal(audit.githubWrite, false);
    assert.equal(audit.deployment, false);
    assert.equal(audit.auditEvents[0]?.actor, "pm");
    assert.equal(audit.auditEvents[1]?.reason, "Review-only artifact recorded.");
    assert.equal(audit.auditEvents[1]?.actor, artifactCreator);
    assert.equal(audit.auditEvents[1]?.artifactId, draft.artifacts[0]?.artifactId);
    assert.equal(audit.auditEvents[2]?.actor, "backend-reviewer");
    assert.equal(audit.auditEvents[2]?.statusBefore, "DRAFT_REQUESTED");
    assert.equal(audit.auditEvents[2]?.statusAfter, "DRAFT_PREPARED");
    assert.equal(audit.auditEvents[4]?.reason, "Approve the reviewed draft record only.");
    for (const event of audit.auditEvents) {
      assert.match(event.auditEventId, /^ai-patch-/);
      assert.equal(event.draftId, draft.draftId);
      assert.equal(typeof event.createdAt, "string");
      assert.equal(typeof event.reviewNotes, "string");
      assert.deepEqual(event.safetyFlags, {
        createdAsDraftOnly: true,
        autoApply: false,
        applyAllowed: false,
        githubWrite: false,
        deployment: false
      });
    }
    assert.deepEqual(
      audit.auditEvents.map((event) => event.createdAt),
      audit.auditEvents.map((event) => event.createdAt).sort()
    );
  });

  it("returns dedicated approval audit events for reject and stop", () => {
    const service = new AiPatchService();
    const rejectedDraft = service.createDraft(validPayload);
    service.updateDraftStatus(rejectedDraft.draftId, {
      status: "DRAFT_PREPARED",
      changedBy: "backend-reviewer",
      reason: "Prepare draft.",
      reviewNotes: "Draft-only state transition."
    });
    service.updateDraftStatus(rejectedDraft.draftId, {
      status: "REVIEW_REQUIRED",
      changedBy: "backend-reviewer",
      reason: "Request review.",
      reviewNotes: "Human review required."
    });
    service.rejectDraft(rejectedDraft.draftId, {
      changedBy: "pm",
      reason: "Reject reviewed draft.",
      reviewNotes: "No further action."
    });

    const stoppedDraft = service.createDraft(validPayload);
    service.stopDraft(stoppedDraft.draftId, {
      changedBy: "pm",
      reason: "Stop draft review.",
      reviewNotes: "No further action."
    });

    assert.equal(service.getAudit(rejectedDraft.draftId).auditEvents.at(-1)?.eventType, "REJECTED");
    assert.equal(service.getAudit(stoppedDraft.draftId).auditEvents.at(-1)?.eventType, "STOPPED");
  });

  it("rejects unsafe artifact paths and recursive sensitive fields", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    for (const filePath of [
      "/etc/passwd",
      "C:\\system32\\config.txt",
      "../outside.ts",
      "backend/../outside.ts",
      ".env.local",
      "config/secrets.json",
      "config/credentials.json",
      "keys/id_rsa",
      "node_modules/package/index.js",
      "vendor/package/file.ts",
      "storage/private/file.ts"
    ]) {
      assert.throws(() => service.createArtifact(draft.draftId, { ...validArtifact, filePath }, artifactCreator), BadRequestException);
    }

    assert.throws(
      () => service.createArtifact(draft.draftId, { ...validArtifact, metadata: { privateKey: "not-accepted" } } as never, artifactCreator),
      BadRequestException
    );
    assert.equal(draft.artifacts.length, 0);
  });

  it("rejects artifact creation for every terminal draft status", () => {
    const service = new AiPatchService();

    for (const terminalStatus of ["APPROVED", "REJECTED", "STOPPED"] as const) {
      const draft = service.createDraft(validPayload);
      if (terminalStatus !== "STOPPED") {
        service.updateDraftStatus(draft.draftId, {
          status: "DRAFT_PREPARED",
          changedBy: "backend-reviewer",
          reason: "Prepare draft.",
          reviewNotes: "Draft-only state transition."
        });
        service.updateDraftStatus(draft.draftId, {
          status: "REVIEW_REQUIRED",
          changedBy: "backend-reviewer",
          reason: "Request review.",
          reviewNotes: "Human review required."
        });
      }
      service.updateDraftStatus(draft.draftId, {
        status: terminalStatus,
        changedBy: "pm",
        reason: "Set terminal status before artifact creation.",
        reviewNotes: "No further action."
      });

      assert.throws(() => service.createArtifact(draft.draftId, validArtifact, artifactCreator), BadRequestException);
      assert.deepEqual(draft.artifacts, []);
    }
  });

  it("throws NotFoundException for an unknown artifact", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    assert.throws(() => service.getArtifact(draft.draftId, "missing-artifact"), NotFoundException);
  });

  it("moves through safe review states and records status history", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    service.updateDraftStatus(draft.draftId, {
      status: "DRAFT_PREPARED",
      changedBy: "backend-reviewer",
      reason: "Draft outline prepared for review.",
      reviewNotes: "No code was generated or applied."
    });
    service.updateDraftStatus(draft.draftId, {
      status: "REVIEW_REQUIRED",
      changedBy: "backend-reviewer",
      reason: "Draft outline is ready for human review.",
      reviewNotes: "Human decision is required."
    });
    const approved = service.updateDraftStatus(draft.draftId, {
      status: "APPROVED",
      changedBy: "pm",
      reason: "Draft request approved as a reviewed record only.",
      reviewNotes: "Approval does not apply code."
    });

    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.nextGate, null);
    assert.equal(approved.statusHistory.length, 4);
    assert.deepEqual(
      approved.statusHistory.map((item) => item.status),
      ["DRAFT_REQUESTED", "DRAFT_PREPARED", "REVIEW_REQUIRED", "APPROVED"]
    );
    assert.equal(approved.statusHistory[3]?.changedBy, "pm");
    assert.equal(approved.statusHistory[3]?.reason, "Draft request approved as a reviewed record only.");
    assert.equal(typeof approved.statusHistory[3]?.changedAt, "string");
  });

  it("uses dedicated approval actions without applying review-only artifacts", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);
    const artifact = service.createArtifact(draft.draftId, validArtifact, artifactCreator);

    service.updateDraftStatus(draft.draftId, {
      status: "DRAFT_PREPARED",
      changedBy: "backend-reviewer",
      reason: "Draft outline prepared for review.",
      reviewNotes: "No code was generated or applied."
    });
    service.updateDraftStatus(draft.draftId, {
      status: "REVIEW_REQUIRED",
      changedBy: "backend-reviewer",
      reason: "Draft outline is ready for human review.",
      reviewNotes: "Human decision is required."
    });
    const approved = service.approveDraft(draft.draftId, {
      changedBy: "pm",
      reason: "Approve the reviewed draft record only.",
      reviewNotes: "Approval does not apply artifacts."
    });

    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.nextGate, null);
    assert.equal(approved.createdAsDraftOnly, true);
    assert.equal(approved.autoApply, false);
    assert.equal(approved.githubWrite, false);
    assert.equal(approved.deployment, false);
    assert.equal(approved.artifacts[0], artifact);
    assert.equal(artifact.applyAllowed, false);
    assert.equal(artifact.githubWrite, false);
    assert.equal(artifact.deployment, false);
    assert.equal(approved.statusHistory.at(-1)?.status, "APPROVED");
    assert.equal(approved.statusHistory.at(-1)?.changedBy, "pm");
    assert.equal(approved.statusHistory.at(-1)?.reason, "Approve the reviewed draft record only.");
  });

  it("enforces dedicated approve and reject review gates", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    assert.throws(
      () => service.approveDraft(draft.draftId, { changedBy: "pm", reason: "Skip review.", reviewNotes: "Not accepted." }),
      BadRequestException
    );
    assert.throws(
      () => service.rejectDraft(draft.draftId, { changedBy: "pm", reason: "Skip review.", reviewNotes: "Not accepted." }),
      BadRequestException
    );

    service.updateDraftStatus(draft.draftId, {
      status: "DRAFT_PREPARED",
      changedBy: "backend-reviewer",
      reason: "Prepare draft.",
      reviewNotes: "Draft-only state transition."
    });
    service.updateDraftStatus(draft.draftId, {
      status: "REVIEW_REQUIRED",
      changedBy: "backend-reviewer",
      reason: "Request review.",
      reviewNotes: "Human review required."
    });
    const rejected = service.rejectDraft(draft.draftId, {
      changedBy: "pm",
      reason: "Reject reviewed draft.",
      reviewNotes: "No further action."
    });

    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.nextGate, null);
    assert.equal(rejected.statusHistory.at(-1)?.status, "REJECTED");
  });

  it("allows dedicated stop from non-terminal states and locks every gate action after every terminal status", () => {
    const service = new AiPatchService();

    for (const transitions of [[], ["DRAFT_PREPARED"], ["DRAFT_PREPARED", "REVIEW_REQUIRED"]] as const) {
      const draft = service.createDraft(validPayload);
      for (const status of transitions) {
        service.updateDraftStatus(draft.draftId, {
          status,
          changedBy: "backend-reviewer",
          reason: `Move draft to ${status}.`,
          reviewNotes: "Draft-only state transition."
        });
      }
      const stopped = service.stopDraft(draft.draftId, {
        changedBy: "pm",
        reason: "Stop draft review.",
        reviewNotes: "No further action."
      });
      assert.equal(stopped.status, "STOPPED");
      assert.equal(stopped.nextGate, null);
    }

    for (const terminalStatus of ["APPROVED", "REJECTED", "STOPPED"] as const) {
      const draft = service.createDraft(validPayload);
      if (terminalStatus === "STOPPED") {
        service.stopDraft(draft.draftId, { changedBy: "pm", reason: "Stop draft.", reviewNotes: "No further action." });
      } else {
        service.updateDraftStatus(draft.draftId, {
          status: "DRAFT_PREPARED",
          changedBy: "backend-reviewer",
          reason: "Prepare draft.",
          reviewNotes: "Draft-only state transition."
        });
        service.updateDraftStatus(draft.draftId, {
          status: "REVIEW_REQUIRED",
          changedBy: "backend-reviewer",
          reason: "Request review.",
          reviewNotes: "Human review required."
        });
        const action = terminalStatus === "APPROVED" ? service.approveDraft.bind(service) : service.rejectDraft.bind(service);
        action(draft.draftId, { changedBy: "pm", reason: `Set ${terminalStatus}.`, reviewNotes: "Human review completed." });
      }
      for (const action of [service.approveDraft.bind(service), service.rejectDraft.bind(service), service.stopDraft.bind(service)]) {
        assert.throws(() => action(draft.draftId, { changedBy: "pm", reason: "Try terminal transition.", reviewNotes: "Not accepted." }), BadRequestException);
      }
    }
  });

  it("rejects invalid dedicated approval gate request fields", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    for (const body of [
      { changedBy: "", reason: "Stop.", reviewNotes: "Rejected." },
      { changedBy: "pm", reason: "", reviewNotes: "Rejected." },
      { changedBy: "pm", reason: "Stop.", reviewNotes: "" },
      { changedBy: "pm", reason: "Stop.", reviewNotes: "Rejected.", secrets: "not-accepted" }
    ]) {
      assert.throws(() => service.stopDraft(draft.draftId, body), BadRequestException);
    }
    assert.equal(draft.status, "DRAFT_REQUESTED");
  });

  it("rejects invalid transitions and locks terminal states", () => {
    const service = new AiPatchService();
    const draft = service.createDraft(validPayload);

    assert.throws(
      () =>
        service.updateDraftStatus(draft.draftId, {
          status: "APPROVED",
          changedBy: "pm",
          reason: "Skip required review steps.",
          reviewNotes: "Not accepted."
        }),
      BadRequestException
    );

    service.updateDraftStatus(draft.draftId, {
      status: "STOPPED",
      changedBy: "pm",
      reason: "Stop this draft request.",
      reviewNotes: "No further review is required."
    });

    assert.throws(
      () =>
        service.updateDraftStatus(draft.draftId, {
          status: "DRAFT_PREPARED",
          changedBy: "pm",
          reason: "Try to reopen stopped draft.",
          reviewNotes: "Not accepted."
        }),
      BadRequestException
    );
    assert.equal(draft.status, "STOPPED");
    assert.equal(draft.nextGate, null);
  });

  it("allows STOPPED from every non-terminal state and locks every terminal state", () => {
    const service = new AiPatchService();
    const stopFrom = (statuses: ("DRAFT_PREPARED" | "REVIEW_REQUIRED")[]): void => {
      const draft = service.createDraft(validPayload);
      for (const status of statuses) {
        service.updateDraftStatus(draft.draftId, {
          status,
          changedBy: "backend-reviewer",
          reason: `Move draft to ${status}.`,
          reviewNotes: "Draft-only state transition."
        });
      }
      service.updateDraftStatus(draft.draftId, {
        status: "STOPPED",
        changedBy: "pm",
        reason: "Stop draft review.",
        reviewNotes: "No further action."
      });
      assert.equal(draft.status, "STOPPED");
    };

    stopFrom([]);
    stopFrom(["DRAFT_PREPARED"]);
    stopFrom(["DRAFT_PREPARED", "REVIEW_REQUIRED"]);

    for (const status of ["APPROVED", "REJECTED"] as const) {
      const draft = service.createDraft(validPayload);
      service.updateDraftStatus(draft.draftId, {
        status: "DRAFT_PREPARED",
        changedBy: "backend-reviewer",
        reason: "Prepare draft.",
        reviewNotes: "Draft-only state transition."
      });
      service.updateDraftStatus(draft.draftId, {
        status: "REVIEW_REQUIRED",
        changedBy: "backend-reviewer",
        reason: "Request review.",
        reviewNotes: "Human review required."
      });
      service.updateDraftStatus(draft.draftId, {
        status,
        changedBy: "pm",
        reason: `Set terminal status ${status}.`,
        reviewNotes: "Human review completed."
      });

      assert.throws(
        () =>
          service.updateDraftStatus(draft.draftId, {
            status: "STOPPED",
            changedBy: "pm",
            reason: "Try to change terminal draft.",
            reviewNotes: "Not accepted."
          }),
        BadRequestException
      );
    }
  });

  it("throws NotFoundException for an unknown draft", () => {
    assert.throws(() => new AiPatchService().getDraft("missing-draft"), NotFoundException);
    assert.throws(() => new AiPatchService().getAudit("missing-draft"), NotFoundException);
  });

  it("has no persistence, provider, source-control, workflow, or filesystem delegates", () => {
    const service = new AiPatchService() as unknown as Record<string, unknown>;

    for (const field of ["prismaClient", "github", "workflow", "n8n", "aiProvider", "filesystem", "fileApply"]) {
      assert.equal(field in service, false);
    }
  });

  it("rejects forbidden fields before creating a record", () => {
    const service = new AiPatchService();

    assert.throws(() => service.createDraft({ ...validPayload, autoApply: true } as never));
    assert.throws(() => service.createDraft({ ...validPayload, githubWrite: true } as never));
    assert.throws(() => service.createDraft({ ...validPayload, deployment: true } as never));
    assert.equal(aiPatchDrafts.length, 0);
  });
});
