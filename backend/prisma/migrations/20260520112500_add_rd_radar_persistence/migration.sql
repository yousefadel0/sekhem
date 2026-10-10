-- Additive-only R&D Radar persistence foundation.
-- No destructive changes. No existing table or column is dropped or altered.

CREATE TABLE IF NOT EXISTS "EvidenceSourceV2" (
  "id" TEXT PRIMARY KEY,
  "url" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "lastCollectedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EvidenceItem" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL REFERENCES "EvidenceSourceV2"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sanitizedFinding" TEXT NOT NULL,
  "collectionStatus" TEXT NOT NULL DEFAULT 'EVIDENCE_COLLECTED',
  "reviewerDecision" TEXT,
  "collectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EvidenceReview" (
  "id" TEXT PRIMARY KEY,
  "evidenceItemId" TEXT NOT NULL REFERENCES "EvidenceItem"("id") ON DELETE RESTRICT,
  "relevance" INTEGER NOT NULL,
  "reliability" INTEGER NOT NULL,
  "freshness" INTEGER NOT NULL,
  "businessApplicability" INTEGER NOT NULL,
  "reviewerDecision" TEXT NOT NULL,
  "reviewerRole" TEXT NOT NULL DEFAULT 'pm_reviewer',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceReview_score_bounds" CHECK (
    "relevance" BETWEEN 1 AND 5 AND
    "reliability" BETWEEN 1 AND 5 AND
    "freshness" BETWEEN 1 AND 5 AND
    "businessApplicability" BETWEEN 1 AND 5
  )
);

CREATE TABLE IF NOT EXISTS "CandidateInitiative" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT_ONLY',
  "problemStatement" TEXT NOT NULL,
  "evidenceSummary" TEXT NOT NULL,
  "expectedBusinessValue" TEXT NOT NULL,
  "nextGate" TEXT NOT NULL DEFAULT 'PM_REVIEW_REQUIRED',
  "requiresPMApproval" BOOLEAN NOT NULL DEFAULT TRUE,
  "runtimeVerificationRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAsDraftOnly" BOOLEAN NOT NULL DEFAULT TRUE,
  "requiredAdditionalEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "uncertaintyRisks" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PMDecision" (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL REFERENCES "CandidateInitiative"("candidateId") ON DELETE RESTRICT,
  "decision" TEXT NOT NULL,
  "decisionReason" TEXT NOT NULL,
  "approvedScopeIfAny" TEXT,
  "nextGate" TEXT NOT NULL,
  "runtimeVerificationRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WorkflowRunSummary" (
  "id" TEXT PRIMARY KEY,
  "workflowName" TEXT NOT NULL,
  "workflowId" TEXT,
  "executionId" TEXT,
  "workflowStatus" TEXT NOT NULL,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "reviewStatus" TEXT NOT NULL,
  "candidateId" TEXT,
  "nextGate" TEXT NOT NULL,
  "runtimeVerificationRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "forbiddenActionsObserved" BOOLEAN NOT NULL DEFAULT FALSE,
  "sanitizedOutput" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "workflowActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "triggerType" TEXT NOT NULL DEFAULT 'manual/internal only',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GitHubIntegrationStatus" (
  "id" TEXT PRIMARY KEY,
  "repoFullName" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "integrationStatus" TEXT NOT NULL DEFAULT 'read-only/demo-safe',
  "requiredCheckName" TEXT NOT NULL DEFAULT 'Backend CI / install-build-lint-test-prisma',
  "latestCheckStatus" TEXT,
  "branchProtectionStatus" TEXT NOT NULL DEFAULT 'manual_policy_active_until_github_team_or_enterprise_upgrade',
  "writeActionsExecuted" BOOLEAN NOT NULL DEFAULT FALSE,
  "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EvidenceItem_sourceId_idx" ON "EvidenceItem"("sourceId");
CREATE INDEX IF NOT EXISTS "EvidenceReview_evidenceItemId_idx" ON "EvidenceReview"("evidenceItemId");
CREATE INDEX IF NOT EXISTS "CandidateInitiative_status_idx" ON "CandidateInitiative"("status");
CREATE INDEX IF NOT EXISTS "PMDecision_candidateId_idx" ON "PMDecision"("candidateId");
CREATE INDEX IF NOT EXISTS "WorkflowRunSummary_candidateId_idx" ON "WorkflowRunSummary"("candidateId");
CREATE INDEX IF NOT EXISTS "GitHubIntegrationStatus_repo_branch_idx" ON "GitHubIntegrationStatus"("repoFullName", "branch");
