export type AiPatchDraftStatus =
  | "DRAFT_REQUESTED"
  | "DRAFT_PREPARED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "STOPPED";

export type AiPatchNextGate = "HUMAN_REVIEW_REQUIRED" | null;

export type AiPatchArtifactType = "DOCUMENT" | "CONFIG_TEMPLATE" | "TEST_CASE" | "CODE_DIFF_PREVIEW";

export type AiPatchArtifactRiskLevel = "low" | "medium" | "high";

export type AiPatchArtifactRequestDto = {
  artifactType: AiPatchArtifactType;
  filePath: string;
  title: string;
  summary: string;
  contentPreview: string;
  diffPreview: string;
  riskLevel: AiPatchArtifactRiskLevel;
  reviewNotes: string;
};

export type AiPatchArtifactDto = AiPatchArtifactRequestDto & {
  artifactId: string;
  createdBy: string;
  applyAllowed: false;
  githubWrite: false;
  deployment: false;
  createdAsDraftOnly: true;
  createdAt: string;
};

export type AiPatchAuditEventType =
  | "DRAFT_REQUESTED"
  | "STATUS_CHANGED"
  | "ARTIFACT_CREATED"
  | "APPROVED"
  | "REJECTED"
  | "STOPPED";

export type AiPatchAuditSafetyFlagsDto = {
  createdAsDraftOnly: true;
  autoApply: false;
  applyAllowed: false;
  githubWrite: false;
  deployment: false;
};

export type AiPatchAuditEventDto = {
  auditEventId: string;
  draftId: string;
  eventType: AiPatchAuditEventType;
  actor: string;
  reason: string;
  reviewNotes: string;
  artifactId?: string;
  statusBefore?: AiPatchDraftStatus;
  statusAfter?: AiPatchDraftStatus;
  createdAt: string;
  safetyFlags: AiPatchAuditSafetyFlagsDto;
};

export type AiPatchAuditResponseDto = {
  draftId: string;
  currentStatus: AiPatchDraftStatus;
  auditEvents: AiPatchAuditEventDto[];
  createdAsDraftOnly: true;
  autoApply: false;
  githubWrite: false;
  deployment: false;
};

export type AiPatchDraftStatusRequestDto = {
  status: AiPatchDraftStatus;
  changedBy: string;
  reason: string;
  reviewNotes: string;
};

export type AiPatchApprovalGateRequestDto = {
  changedBy: string;
  reason: string;
  reviewNotes: string;
};

export type AiPatchDraftStatusHistoryDto = {
  status: AiPatchDraftStatus;
  changedBy: string;
  reason: string;
  reviewNotes: string;
  changedAt: string;
};

export type AiPatchDraftRequestDto = {
  title: string;
  requestedBy: string;
  targetArea: string;
  intent: string;
  constraints: string[];
  safetyNotes: string[];
};

export type AiPatchDraftDto = AiPatchDraftRequestDto & {
  draftId: string;
  status: AiPatchDraftStatus;
  createdAsDraftOnly: true;
  autoApply: false;
  githubWrite: false;
  deployment: false;
  nextGate: AiPatchNextGate;
  reviewNotes: string;
  statusHistory: AiPatchDraftStatusHistoryDto[];
  artifacts: AiPatchArtifactDto[];
  createdAt: string;
  updatedAt: string;
  customerSafeNote: string;
};
