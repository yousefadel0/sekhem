export type RDRadarScoreKey = "relevance" | "reliability" | "freshness" | "businessApplicability";

export type RDRadarEvidenceScores = Record<RDRadarScoreKey, number>;

export type RDRadarEvidenceItemDto = {
  id: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  sourceType: string;
  sanitizedFinding: string;
  collectionStatus: string;
  reviewerDecision: string;
  scores: RDRadarEvidenceScores;
  collectedAt: string;
};

export type RDRadarReviewSummaryDto = {
  averageScores: RDRadarEvidenceScores;
  overallDecision: string;
  evidenceWasSanitized: boolean;
  rawPageContentIncluded: boolean;
  aiGeneratedConclusion: boolean;
};

export type RDRadarCandidateDto = {
  candidateId: string;
  title: string;
  status: string;
  problemStatement: string;
  evidenceSummary: string;
  expectedBusinessValue: string;
  uncertaintyRisks: string[];
  requiredAdditionalEvidence: string[];
  nextGate: string;
  requiresPMApproval: boolean;
  runtimeVerificationRequired: boolean;
  createdAsDraftOnly: boolean;
  createdAt: string;
};

export type RDRadarPMDecisionDto = {
  id: string;
  candidateId: string;
  decision: string;
  decisionReason: string;
  approvedScopeIfAny: string | null;
  nextGate: string;
  runtimeVerificationRequired: boolean;
  createdAt: string;
};

export type CreateCandidateInitiativeResponseDto = {
  accepted: true;
  persistence: boolean;
  candidate: RDRadarCandidateDto;
};

export type CreatePMDecisionResponseDto = {
  accepted: true;
  persistence: boolean;
  decision: RDRadarPMDecisionDto;
};

export type RDRadarStatusDto = {
  radarStatus: string;
  persistenceMode: "fixture" | "prisma";
  evidenceCount: number;
  candidateCount: number;
  workflowRunCount: number;
  githubIntegrationStatus: string;
  nextGate: string;
  forbiddenActionsObserved: boolean;
};

export type RDRadarGithubStatusDto = {
  status: "ready" | "pending" | "unavailable";
  mode: "read_only";
  repository: {
    configured: boolean;
    readOnly: true;
  };
  checks: {
    name: string;
    status: "ready" | "pending" | "unavailable";
    message: string;
  }[];
  lastCheckedAt: string | null;
};

export type RDRadarGithubSonicRepo =
  | "sonic-net/sonic-buildimage"
  | "sonic-net/sonic-swss"
  | "sonic-net/sonic-sairedis"
  | "sonic-net/sonic-mgmt"
  | "sonic-net/sonic-platform-common";

export type RDRadarGithubSonicApprovedRepoDto = {
  repo: RDRadarGithubSonicRepo;
  repoUrl: string;
  riskArea: string;
};

export type RDRadarGithubSonicEvidenceSourceDto = {
  sourceSystem: "github";
  collectionMode: "read_only";
  repo: "sonic-net/sonic-buildimage";
  repoUrl: "https://github.com/sonic-net/sonic-buildimage";
  approvedRepos: RDRadarGithubSonicApprovedRepoDto[];
  signalType: "PR";
  maxItems: 25;
  persistence: false;
};

export type RDRadarGithubSonicTechnicalDomain =
  | "build_image"
  | "swss_orchagent"
  | "sai_syncd"
  | "management_testing"
  | "platform_abstraction"
  | "reliability"
  | "security";

export type RDRadarGithubSonicRiskArea =
  | "build_stability"
  | "control_plane_behavior"
  | "sai_adapter_dependency"
  | "validation_coverage"
  | "platform_driver_assumption"
  | "reboot_health"
  | "configuration_drift";

export type RDRadarGithubSonicRepositorySignalDto = {
  id: string;
  repo: RDRadarGithubSonicRepo;
  title: string;
  url: string;
  authorLogin: string;
  createdAt: string | null;
  updatedAt: string | null;
  labels: string[];
  sanitizedSummary: string;
  technicalDomain: RDRadarGithubSonicTechnicalDomain;
  riskArea: RDRadarGithubSonicRiskArea;
  priorityScore: number;
  evidenceStrength: "low" | "moderate" | "high";
  customerSafeSummary: string;
  whyItMatters: string;
};

export type RDRadarGithubSonicDraftRecommendationDto = {
  candidateId: string;
  title: string;
  evidenceSource: string;
  recommendedPath: string;
  nextGate: "PM_REVIEW_REQUIRED";
  humanApprovalRequired: true;
  createdAsDraftOnly: true;
};

export type RDRadarGithubSonicPreviewResponseDto = {
  githubEvidenceSource: RDRadarGithubSonicEvidenceSourceDto;
  repositorySignals: RDRadarGithubSonicRepositorySignalDto[];
  draftRecommendations: RDRadarGithubSonicDraftRecommendationDto[];
  classificationSummary: {
    byTechnicalDomain: Record<RDRadarGithubSonicTechnicalDomain, number>;
    byRiskArea: Record<RDRadarGithubSonicRiskArea, number>;
    topRisks: RDRadarGithubSonicRepositorySignalDto[];
  };
};

export type RDRadarWorkflowRunSummaryDto = {
  id: string;
  workflowName: string;
  workflowId: string | null;
  executionId: string | null;
  correlationId?: string | null;
  workflowStatus: string;
  evidenceCount: number;
  reviewStatus: string;
  candidateId: string;
  nextGate: string;
  runtimeVerificationRequired: boolean;
  forbiddenActionsObserved: boolean;
  workflowActive: boolean;
  triggerType: string;
  createdAt: string;
};

export type RDRadarWorkflowStatus = "PASS" | "FAIL" | "ABORTED";

export type RDRadarNextGate =
  | "PM_REVIEW_REQUIRED"
  | "SECURITY_REVIEW_REQUIRED"
  | "RUNTIME_VERIFICATION_REQUIRED"
  | "NO_ACTION_REQUIRED";

export type CreateWorkflowRunSummaryRequestDto = {
  workflowStatus: RDRadarWorkflowStatus;
  evidenceCount: number;
  reviewStatus: RDRadarWorkflowStatus;
  candidateId: string;
  nextGate: RDRadarNextGate;
  runtimeVerificationRequired: boolean;
  forbiddenActionsObserved: boolean;
  source: string;
  workflowId?: string;
  executionId?: string;
  correlationId?: string;
  executedAt?: string;
  receivedAt?: string;
};

export type CreateWorkflowRunSummaryResponseDto = {
  accepted: true;
  persistence: boolean;
  summary: RDRadarWorkflowRunSummaryDto;
};

export type CollectPreviewRequestDto = {
  sourceUrls?: string[];
};

export type RDRadarRealInputRequestDto = {
  inputText: string;
  sourceUrl?: string;
  category: string;
  submittedBy: string;
  purpose: string;
};

export type RDRadarRealInputEvidenceItemDto = {
  id: string;
  title: string;
  sourceUrl: string;
  sanitizedFinding: string;
  relevanceScore: number;
  riskLevel: "low" | "medium" | "high";
  businessValue: "low" | "medium" | "high";
};

export type RDRadarRealInputRecommendedInitiativeDto = {
  candidateId: string;
  title: string;
  recommendedPath: string;
  expectedBusinessValue: string;
  riskLevel: "low" | "medium" | "high";
  humanApprovalRequired: true;
  nextGate: "PM_REVIEW_REQUIRED";
  createdAsDraftOnly: true;
};

export type RDRadarRealInputResponseDto = {
  accepted: true;
  persistence: boolean;
  evidenceItems: RDRadarRealInputEvidenceItemDto[];
  recommendedInitiative: RDRadarRealInputRecommendedInitiativeDto;
};

export type CreateEvidenceReviewRequestDto = {
  evidenceItemId: string;
  relevance: number;
  reliability: number;
  freshness: number;
  businessApplicability: number;
  reviewerDecision: string;
  reviewerRole?: string;
  notes?: string;
};

export type CreateRDRadarEvidenceReviewRequestDto = {
  candidateId: string;
  evidenceId?: string;
  sourceId?: string;
  relevanceScore: number;
  credibilityScore: number;
  riskScore: number;
  reviewerDecision: string;
  reviewerNotes?: string;
};

export type RDRadarEvidenceReviewDto = {
  id: string;
  candidateId: string | null;
  evidenceId: string;
  sourceId: string | null;
  relevanceScore: number;
  credibilityScore: number;
  riskScore: number;
  reviewerDecision: string;
  reviewerNotes: string | null;
  createdAt: string;
};

export type CreateRDRadarEvidenceReviewResponseDto = {
  accepted: true;
  persistence: boolean;
  review: RDRadarEvidenceReviewDto;
};

export type CreateCandidateInitiativeRequestDto = {
  candidateId: string;
  title: string;
  problemStatement: string;
  evidenceSummary: string;
  expectedBusinessValue: string;
  uncertaintyRisks?: string[];
  requiredAdditionalEvidence?: string[];
  nextGate?: string;
};

export type CreatePMDecisionRequestDto = {
  candidateId: string;
  decision: string;
  decisionReason: string;
  approvedScopeIfAny?: string;
  nextGate: string;
};

export type RDRadarEvidenceResponseDto = {
  evidence: RDRadarEvidenceItemDto[];
  reviewSummary: RDRadarReviewSummaryDto;
};
