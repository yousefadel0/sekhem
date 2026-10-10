-- SEKHEM 5D-0.3: durable, versioned agent initiative runtime.
-- Additive only: dashboard Initiative records remain unchanged.

CREATE TYPE "AgentInitiativeStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "AgentInitiativeVersionStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "AgentInitiativeTaskStatus" AS ENUM ('TODO', 'READY', 'RUNNING', 'PAUSED', 'BLOCKED', 'FAILED', 'VERIFIED', 'DONE', 'CANCELED');

CREATE TABLE "AgentInitiative" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "conversationId" TEXT,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "problem" TEXT,
  "scope" JSONB NOT NULL DEFAULT '{}',
  "constraints" JSONB NOT NULL DEFAULT '[]',
  "status" "AgentInitiativeStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersionId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentInitiative_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentInitiative_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentInitiativeVersion" (
  "id" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AgentInitiativeVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "architecture" JSONB,
  "plan" JSONB,
  "risks" JSONB NOT NULL DEFAULT '[]',
  "dependencies" JSONB NOT NULL DEFAULT '[]',
  "successCriteria" JSONB NOT NULL DEFAULT '[]',
  "decisionSummary" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentInitiativeVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentInitiativeVersion_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "AgentInitiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentInitiativePlan" (
  "id" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "steps" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentInitiativePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentInitiativePlan_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "AgentInitiative"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentInitiativePlan_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AgentInitiativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentInitiativeTask" (
  "id" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "planId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "AgentInitiativeTaskStatus" NOT NULL DEFAULT 'TODO',
  "position" INTEGER NOT NULL DEFAULT 0,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "agentRunId" TEXT,
  "artifacts" JSONB NOT NULL DEFAULT '[]',
  "verification" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentInitiativeTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentInitiativeTask_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "AgentInitiative"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentInitiativeTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AgentInitiativePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AgentInitiativeDecision" (
  "id" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "notes" TEXT,
  "decidedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentInitiativeDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentInitiativeDecision_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "AgentInitiative"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentInitiativeDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AgentInitiativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentInitiativeVersion_initiativeId_version_key" ON "AgentInitiativeVersion"("initiativeId", "version");
CREATE INDEX "AgentInitiative_projectId_updatedAt_idx" ON "AgentInitiative"("projectId", "updatedAt");
CREATE INDEX "AgentInitiative_createdBy_idx" ON "AgentInitiative"("createdBy");
CREATE INDEX "AgentInitiative_status_idx" ON "AgentInitiative"("status");
CREATE INDEX "AgentInitiativeVersion_initiativeId_status_idx" ON "AgentInitiativeVersion"("initiativeId", "status");
CREATE INDEX "AgentInitiativePlan_initiativeId_createdAt_idx" ON "AgentInitiativePlan"("initiativeId", "createdAt");
CREATE INDEX "AgentInitiativePlan_versionId_idx" ON "AgentInitiativePlan"("versionId");
CREATE INDEX "AgentInitiativeTask_initiativeId_status_idx" ON "AgentInitiativeTask"("initiativeId", "status");
CREATE INDEX "AgentInitiativeTask_planId_idx" ON "AgentInitiativeTask"("planId");
CREATE INDEX "AgentInitiativeDecision_initiativeId_createdAt_idx" ON "AgentInitiativeDecision"("initiativeId", "createdAt");
CREATE INDEX "AgentInitiativeDecision_versionId_idx" ON "AgentInitiativeDecision"("versionId");
