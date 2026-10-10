import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AiPatchApprovalGateRequestDto,
  AiPatchAuditEventDto,
  AiPatchAuditEventType,
  AiPatchAuditResponseDto,
  AiPatchArtifactDto,
  AiPatchArtifactRequestDto,
  AiPatchArtifactRiskLevel,
  AiPatchArtifactType,
  AiPatchDraftDto,
  AiPatchDraftRequestDto,
  AiPatchDraftStatus,
  AiPatchDraftStatusRequestDto
} from "./ai-patch-dto";
import { aiPatchDrafts } from "./ai-patch-memory";

const DRAFT_STATUSES: AiPatchDraftStatus[] = ["DRAFT_REQUESTED", "DRAFT_PREPARED", "REVIEW_REQUIRED", "APPROVED", "REJECTED", "STOPPED"];
const TERMINAL_STATUSES = new Set<AiPatchDraftStatus>(["APPROVED", "REJECTED", "STOPPED"]);
const ALLOWED_TRANSITIONS: Partial<Record<AiPatchDraftStatus, AiPatchDraftStatus[]>> = {
  DRAFT_REQUESTED: ["DRAFT_PREPARED", "STOPPED"],
  DRAFT_PREPARED: ["REVIEW_REQUIRED", "STOPPED"],
  REVIEW_REQUIRED: ["APPROVED", "REJECTED", "STOPPED"]
};
const ARTIFACT_TYPES: AiPatchArtifactType[] = ["DOCUMENT", "CONFIG_TEMPLATE", "TEST_CASE", "CODE_DIFF_PREVIEW"];
const ARTIFACT_RISK_LEVELS: AiPatchArtifactRiskLevel[] = ["low", "medium", "high"];
const UNSAFE_PATH_SEGMENTS = new Set([
  ".env",
  "credentials",
  "etc",
  "node_modules",
  "private_keys",
  "private-keys",
  "privatekeys",
  "proc",
  "root",
  "secrets",
  "storage",
  "sys",
  "system32",
  "vendor",
  "windows"
]);
const UNSAFE_PATH_FRAGMENTS = [".env", "credential", "id_dsa", "id_ed25519", "id_rsa", "private-key", "private_key", "privatekey", "secret"];
const FORBIDDEN_FIELDS = new Set([
  "rawHtml",
  "rawContent",
  "fullHeaders",
  "secrets",
  "token",
  "authorization",
  "autoApply",
  "applyAllowed",
  "githubWrite",
  "deployment",
  "branchName",
  "commitMessage",
  "filePatch",
  "diff",
  "patch",
  "apply",
  "execute",
  "tokens",
  "privateKey",
  "password"
]);

@Injectable()
export class AiPatchService {
  createDraft(body: AiPatchDraftRequestDto): AiPatchDraftDto {
    const request = this.validateDraftRequest(body);
    const now = new Date().toISOString();
    const draft: AiPatchDraftDto = {
      ...request,
      draftId: `ai-patch-draft-${Date.now()}-${aiPatchDrafts.length + 1}`,
      status: "DRAFT_REQUESTED",
      createdAsDraftOnly: true,
      autoApply: false,
      githubWrite: false,
      deployment: false,
      nextGate: "HUMAN_REVIEW_REQUIRED",
      reviewNotes: "",
      statusHistory: [
        {
          status: "DRAFT_REQUESTED",
          changedBy: request.requestedBy,
          reason: "Draft request recorded.",
          reviewNotes: "",
          changedAt: now
        }
      ],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
      customerSafeNote: "Draft request recorded only. No AI provider, GitHub write, file apply, or deployment was executed."
    };

    aiPatchDrafts.push(draft);
    return draft;
  }

  createArtifact(draftId: string, body: AiPatchArtifactRequestDto, createdBy: string): AiPatchArtifactDto {
    const draft = this.getDraft(draftId);
    if (TERMINAL_STATUSES.has(draft.status)) {
      throw new BadRequestException("Artifacts cannot be added to a terminal AI Patch draft");
    }

    const request = this.validateArtifactRequest(body);
    const artifact: AiPatchArtifactDto = {
      ...request,
      artifactId: `ai-patch-artifact-${Date.now()}-${draft.artifacts.length + 1}`,
      createdBy: this.requireString(createdBy, "createdBy"),
      applyAllowed: false,
      githubWrite: false,
      deployment: false,
      createdAsDraftOnly: true,
      createdAt: new Date().toISOString()
    };
    draft.artifacts.push(artifact);
    return artifact;
  }

  listArtifacts(draftId: string): AiPatchArtifactDto[] {
    return [...this.getDraft(draftId).artifacts];
  }

  getArtifact(draftId: string, artifactId: string): AiPatchArtifactDto {
    const artifact = this.getDraft(draftId).artifacts.find((item) => item.artifactId === artifactId);
    if (!artifact) {
      throw new NotFoundException("AI Patch artifact not found");
    }

    return artifact;
  }

  getAudit(draftId: string): AiPatchAuditResponseDto {
    const draft = this.getDraft(draftId);
    const createdEvent = draft.statusHistory[0];
    const events: AiPatchAuditEventDto[] = [
      {
        auditEventId: `${draft.draftId}-audit-draft-requested`,
        draftId: draft.draftId,
        eventType: "DRAFT_REQUESTED",
        actor: createdEvent?.changedBy ?? draft.requestedBy,
        reason: createdEvent?.reason ?? "Draft request recorded.",
        reviewNotes: createdEvent?.reviewNotes ?? "",
        statusAfter: "DRAFT_REQUESTED",
        createdAt: draft.createdAt,
        safetyFlags: this.auditSafetyFlags()
      }
    ];

    for (const artifact of draft.artifacts) {
      events.push({
        auditEventId: `${artifact.artifactId}-audit-created`,
        draftId: draft.draftId,
        eventType: "ARTIFACT_CREATED",
        actor: artifact.createdBy,
        reason: "Review-only artifact recorded.",
        reviewNotes: artifact.reviewNotes,
        artifactId: artifact.artifactId,
        createdAt: artifact.createdAt,
        safetyFlags: this.auditSafetyFlags()
      });
    }

    for (const [index, history] of draft.statusHistory.slice(1).entries()) {
      events.push({
        auditEventId: `${draft.draftId}-audit-status-${index + 1}`,
        draftId: draft.draftId,
        eventType: this.auditEventTypeForStatus(history.status),
        actor: history.changedBy,
        reason: history.reason,
        reviewNotes: history.reviewNotes,
        statusBefore: draft.statusHistory[index]?.status,
        statusAfter: history.status,
        createdAt: history.changedAt,
        safetyFlags: this.auditSafetyFlags()
      });
    }

    return {
      draftId: draft.draftId,
      currentStatus: draft.status,
      auditEvents: events.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      createdAsDraftOnly: true,
      autoApply: false,
      githubWrite: false,
      deployment: false
    };
  }

  updateDraftStatus(draftId: string, body: AiPatchDraftStatusRequestDto): AiPatchDraftDto {
    const draft = this.getDraft(draftId);
    const request = this.validateStatusRequest(body);

    if (TERMINAL_STATUSES.has(draft.status) || !ALLOWED_TRANSITIONS[draft.status]?.includes(request.status)) {
      throw new BadRequestException(`Draft status cannot move from ${draft.status} to ${request.status}`);
    }

    const now = new Date().toISOString();
    draft.status = request.status;
    draft.reviewNotes = request.reviewNotes;
    draft.nextGate = TERMINAL_STATUSES.has(request.status) ? null : "HUMAN_REVIEW_REQUIRED";
    draft.updatedAt = now;
    draft.statusHistory.push({
      status: request.status,
      changedBy: request.changedBy,
      reason: request.reason,
      reviewNotes: request.reviewNotes,
      changedAt: now
    });

    return draft;
  }

  approveDraft(draftId: string, body: AiPatchApprovalGateRequestDto): AiPatchDraftDto {
    return this.applyApprovalGateAction(draftId, "APPROVED", body);
  }

  rejectDraft(draftId: string, body: AiPatchApprovalGateRequestDto): AiPatchDraftDto {
    return this.applyApprovalGateAction(draftId, "REJECTED", body);
  }

  stopDraft(draftId: string, body: AiPatchApprovalGateRequestDto): AiPatchDraftDto {
    return this.applyApprovalGateAction(draftId, "STOPPED", body);
  }

  getDraft(draftId: string): AiPatchDraftDto {
    const draft = aiPatchDrafts.find((item) => item.draftId === draftId);
    if (!draft) {
      throw new NotFoundException("AI Patch draft not found");
    }

    return draft;
  }

  private validateDraftRequest(value: unknown): AiPatchDraftRequestDto {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    this.rejectForbiddenFields(value);

    return {
      title: this.requireString(value.title, "title"),
      requestedBy: this.requireString(value.requestedBy, "requestedBy"),
      targetArea: this.requireString(value.targetArea, "targetArea"),
      intent: this.requireString(value.intent, "intent"),
      constraints: this.requireStringArray(value.constraints, "constraints"),
      safetyNotes: this.requireStringArray(value.safetyNotes, "safetyNotes")
    };
  }

  private auditEventTypeForStatus(status: AiPatchDraftStatus): AiPatchAuditEventType {
    const approvalEventTypes: Partial<Record<AiPatchDraftStatus, AiPatchAuditEventType>> = {
      APPROVED: "APPROVED",
      REJECTED: "REJECTED",
      STOPPED: "STOPPED"
    };
    return approvalEventTypes[status] ?? "STATUS_CHANGED";
  }

  private auditSafetyFlags(): AiPatchAuditEventDto["safetyFlags"] {
    return {
      createdAsDraftOnly: true,
      autoApply: false,
      applyAllowed: false,
      githubWrite: false,
      deployment: false
    };
  }

  private applyApprovalGateAction(draftId: string, status: "APPROVED" | "REJECTED" | "STOPPED", body: AiPatchApprovalGateRequestDto): AiPatchDraftDto {
    const request = this.validateApprovalGateRequest(body);
    return this.updateDraftStatus(draftId, { status, ...request });
  }

  private validateApprovalGateRequest(value: unknown): AiPatchApprovalGateRequestDto {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    this.rejectForbiddenFields(value);
    return {
      changedBy: this.requireString(value.changedBy, "changedBy"),
      reason: this.requireString(value.reason, "reason"),
      reviewNotes: this.requireString(value.reviewNotes, "reviewNotes")
    };
  }

  private validateStatusRequest(value: unknown): AiPatchDraftStatusRequestDto {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    this.rejectForbiddenFields(value);
    const status = this.requireString(value.status, "status");
    if (!DRAFT_STATUSES.includes(status as AiPatchDraftStatus)) {
      throw new BadRequestException("status must be a supported AI Patch draft status");
    }

    return {
      status: status as AiPatchDraftStatus,
      changedBy: this.requireString(value.changedBy, "changedBy"),
      reason: this.requireString(value.reason, "reason"),
      reviewNotes: this.requireString(value.reviewNotes, "reviewNotes")
    };
  }

  private validateArtifactRequest(value: unknown): AiPatchArtifactRequestDto {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    this.rejectForbiddenFields(value);
    const artifactType = this.requireString(value.artifactType, "artifactType");
    const riskLevel = this.requireString(value.riskLevel, "riskLevel");
    if (!ARTIFACT_TYPES.includes(artifactType as AiPatchArtifactType)) {
      throw new BadRequestException("artifactType must be a supported AI Patch artifact type");
    }
    if (!ARTIFACT_RISK_LEVELS.includes(riskLevel as AiPatchArtifactRiskLevel)) {
      throw new BadRequestException("riskLevel must be low, medium, or high");
    }

    return {
      artifactType: artifactType as AiPatchArtifactType,
      filePath: this.requireSafeFilePath(value.filePath),
      title: this.requireString(value.title, "title"),
      summary: this.requireString(value.summary, "summary"),
      contentPreview: this.requireString(value.contentPreview, "contentPreview"),
      diffPreview: this.requireString(value.diffPreview, "diffPreview"),
      riskLevel: riskLevel as AiPatchArtifactRiskLevel,
      reviewNotes: this.requireString(value.reviewNotes, "reviewNotes")
    };
  }

  private requireSafeFilePath(value: unknown): string {
    const filePath = this.requireString(value, "filePath");
    const normalizedPath = filePath.replace(/\\/g, "/");
    const segments = normalizedPath.toLowerCase().split("/");

    if (
      normalizedPath.startsWith("/") ||
      normalizedPath.startsWith("//") ||
      /^[a-zA-Z]:\//.test(normalizedPath) ||
      segments.includes("..") ||
      segments.some((segment) => UNSAFE_PATH_SEGMENTS.has(segment)) ||
      UNSAFE_PATH_FRAGMENTS.some((fragment) => normalizedPath.toLowerCase().includes(fragment))
    ) {
      throw new BadRequestException("filePath must be a safe relative review-only path");
    }

    return normalizedPath;
  }

  private rejectForbiddenFields(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.rejectForbiddenFields(item);
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    for (const [field, nestedValue] of Object.entries(value)) {
      if (FORBIDDEN_FIELDS.has(field)) {
        throw new BadRequestException(`${field} is not accepted on AI Patch draft requests`);
      }
      this.rejectForbiddenFields(nestedValue);
    }
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }

    return value.trim();
  }

  private requireStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      throw new BadRequestException(`${field} must be an array of non-empty strings`);
    }

    return value.map((item) => item.trim());
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
