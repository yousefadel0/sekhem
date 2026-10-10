-- SEKHEM Baseline Core Schema Migration
-- Migration: 20260101000000_baseline_core_schema
-- Author: Sekhem Database Architecture Reconciliation Gate
-- Purpose: Establishes the 34 core models, enums, relationships, and indexes missing from initial migrations.

-- 1. Create Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RiskLevel') THEN
    CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Priority') THEN
    CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SourceType') THEN
    CREATE TYPE "SourceType" AS ENUM ('seed', 'manual', 'workflow', 'ai', 'backend_aggregate');
  END IF;
END $$;

-- Model: InfrastructureNode
CREATE TABLE IF NOT EXISTS "InfrastructureNode" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "uptime" DOUBLE PRECISION NOT NULL,
  "cpu" INTEGER NOT NULL,
  "memory" INTEGER NOT NULL,
  "disk" INTEGER NOT NULL
);

-- Model: ServiceStatus
CREATE TABLE IF NOT EXISTS "ServiceStatus" (
  "id" TEXT PRIMARY KEY,
  "nodeId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceStatus_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "InfrastructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Model: User
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  "initials" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Model: Role
CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Model: Permission
CREATE TABLE IF NOT EXISTS "Permission" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Model: UserRole
CREATE TABLE IF NOT EXISTS "UserRole" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");

-- Model: RolePermission
CREATE TABLE IF NOT EXISTS "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- Model: Project
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "customerFacingName" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_phase_idx" ON "Project"("phase");

-- Model: Module
CREATE TABLE IF NOT EXISTS "Module" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "slug" TEXT NOT NULL UNIQUE,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "customerFacingName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "lockReason" TEXT,
  "route" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Module_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Module_projectId_idx" ON "Module"("projectId");
CREATE INDEX IF NOT EXISTS "Module_category_idx" ON "Module"("category");
CREATE INDEX IF NOT EXISTS "Module_status_idx" ON "Module"("status");

-- Model: LockedModule
CREATE TABLE IF NOT EXISTS "LockedModule" (
  "id" TEXT PRIMARY KEY,
  "moduleId" TEXT NOT NULL UNIQUE,
  "activationLabel" TEXT,
  "requirements" JSONB,
  "estimatedActivationTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LockedModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: Initiative
CREATE TABLE IF NOT EXISTS "Initiative" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "moduleId" TEXT,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "businessValue" TEXT NOT NULL,
  "technicalRisk" "RiskLevel" NOT NULL,
  "recommendedPath" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "humanApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  "overview" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Initiative_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Initiative_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Initiative_projectId_idx" ON "Initiative"("projectId");
CREATE INDEX IF NOT EXISTS "Initiative_moduleId_idx" ON "Initiative"("moduleId");
CREATE INDEX IF NOT EXISTS "Initiative_status_idx" ON "Initiative"("status");
CREATE INDEX IF NOT EXISTS "Initiative_technicalRisk_idx" ON "Initiative"("technicalRisk");

-- Model: EvidenceSource
CREATE TABLE IF NOT EXISTS "EvidenceSource" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL,
  "initiativeSlug" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "relevance" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceSource_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EvidenceSource_initiativeId_idx" ON "EvidenceSource"("initiativeId");
CREATE INDEX IF NOT EXISTS "EvidenceSource_initiativeSlug_idx" ON "EvidenceSource"("initiativeSlug");

-- Model: ExecutionPath
CREATE TABLE IF NOT EXISTS "ExecutionPath" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL,
  "initiativeSlug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "estimatedDuration" TEXT NOT NULL,
  "deliverables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutionPath_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ExecutionPath_initiativeId_idx" ON "ExecutionPath"("initiativeId");
CREATE INDEX IF NOT EXISTS "ExecutionPath_initiativeSlug_idx" ON "ExecutionPath"("initiativeSlug");

-- Model: Task
CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL,
  "initiativeSlug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "lane" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "priority" "Priority" NOT NULL,
  "assignee" TEXT NOT NULL,
  "ownerRole" TEXT,
  "dueDate" TIMESTAMP(3),
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Task_initiativeId_idx" ON "Task"("initiativeId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");

-- Model: ActivityEvent
CREATE TABLE IF NOT EXISTS "ActivityEvent" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "initiativeId" TEXT,
  "initiativeSlug" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ActivityEvent_projectId_idx" ON "ActivityEvent"("projectId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_initiativeId_idx" ON "ActivityEvent"("initiativeId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_initiativeSlug_idx" ON "ActivityEvent"("initiativeSlug");

-- Model: Approval
CREATE TABLE IF NOT EXISTS "Approval" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT,
  "initiativeSlug" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "priority" "Priority" NOT NULL,
  "status" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "requestedRole" TEXT,
  "approverRole" TEXT,
  "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Approval_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Approval_projectId_idx" ON "Approval"("projectId");
CREATE INDEX IF NOT EXISTS "Approval_initiativeId_idx" ON "Approval"("initiativeId");
CREATE INDEX IF NOT EXISTS "Approval_status_idx" ON "Approval"("status");

-- Model: TechnicalMemo
CREATE TABLE IF NOT EXISTS "TechnicalMemo" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL,
  "initiativeSlug" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "generatedBy" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sections" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TechnicalMemo_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: CodeDraftWorkspace
CREATE TABLE IF NOT EXISTS "CodeDraftWorkspace" (
  "id" TEXT PRIMARY KEY,
  "initiativeId" TEXT NOT NULL,
  "initiativeSlug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "humanApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodeDraftWorkspace_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: SandboxedArtifact
CREATE TABLE IF NOT EXISTS "SandboxedArtifact" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SandboxedArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "CodeDraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: SecurityGate
CREATE TABLE IF NOT EXISTS "SecurityGate" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT,
  "initiativeSlug" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "riskLevel" "RiskLevel" NOT NULL,
  "summary" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityGate_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SecurityGate_initiativeId_idx" ON "SecurityGate"("initiativeId");
CREATE INDEX IF NOT EXISTS "SecurityGate_status_idx" ON "SecurityGate"("status");

-- Model: SecurityCheck
CREATE TABLE IF NOT EXISTS "SecurityCheck" (
  "id" TEXT PRIMARY KEY,
  "securityGateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "checkType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "severity" "RiskLevel" NOT NULL,
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityCheck_securityGateId_fkey" FOREIGN KEY ("securityGateId") REFERENCES "SecurityGate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: SecurityFinding
CREATE TABLE IF NOT EXISTS "SecurityFinding" (
  "id" TEXT PRIMARY KEY,
  "securityGateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "RiskLevel" NOT NULL,
  "status" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityFinding_securityGateId_fkey" FOREIGN KEY ("securityGateId") REFERENCES "SecurityGate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: Blocker
CREATE TABLE IF NOT EXISTS "Blocker" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT,
  "initiativeSlug" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" "RiskLevel" NOT NULL,
  "status" TEXT NOT NULL,
  "cause" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "suggestedAction" TEXT NOT NULL,
  "nextStep" TEXT NOT NULL,
  "rollbackOption" TEXT NOT NULL,
  "maxAssistantFixAttempts" INTEGER NOT NULL DEFAULT 0,
  "humanReviewRequiredAfterAttempts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Blocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Blocker_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Blocker_projectId_idx" ON "Blocker"("projectId");
CREATE INDEX IF NOT EXISTS "Blocker_initiativeId_idx" ON "Blocker"("initiativeId");
CREATE INDEX IF NOT EXISTS "Blocker_status_idx" ON "Blocker"("status");
CREATE INDEX IF NOT EXISTS "Blocker_severity_idx" ON "Blocker"("severity");

-- Model: ReleaseCandidate
CREATE TABLE IF NOT EXISTS "ReleaseCandidate" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "initiativeId" TEXT,
  "initiativeSlug" TEXT,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "securityScore" INTEGER NOT NULL,
  "testsPassed" INTEGER NOT NULL,
  "testsTotal" INTEGER NOT NULL,
  "changeCount" INTEGER NOT NULL,
  "blockingIssues" INTEGER NOT NULL,
  "artifactCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseCandidate_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ReleaseCandidate_initiativeId_idx" ON "ReleaseCandidate"("initiativeId");
CREATE INDEX IF NOT EXISTS "ReleaseCandidate_status_idx" ON "ReleaseCandidate"("status");

-- Model: ReleaseArtifact
CREATE TABLE IF NOT EXISTS "ReleaseArtifact" (
  "id" TEXT PRIMARY KEY,
  "releaseCandidateId" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "checksum" TEXT,
  CONSTRAINT "ReleaseArtifact_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: ReleaseApprovalChecklistItem
CREATE TABLE IF NOT EXISTS "ReleaseApprovalChecklistItem" (
  "id" TEXT PRIMARY KEY,
  "releaseCandidateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requiredRole" TEXT NOT NULL,
  CONSTRAINT "ReleaseApprovalChecklistItem_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: RollbackPlan
CREATE TABLE IF NOT EXISTS "RollbackPlan" (
  "id" TEXT PRIMARY KEY,
  "releaseCandidateId" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  CONSTRAINT "RollbackPlan_releaseCandidateId_fkey" FOREIGN KEY ("releaseCandidateId") REFERENCES "ReleaseCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: RDSignal
CREATE TABLE IF NOT EXISTS "RDSignal" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "priority" "Priority" NOT NULL,
  "summary" TEXT NOT NULL,
  "impact" TEXT NOT NULL,
  "actionRecommended" TEXT NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RDSignal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Model: AuditEvent
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "initiativeId" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'user',
  "target" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "details" TEXT,
  "description" TEXT,
  "metadata" JSONB
);

-- Model: RepositoryPreview
CREATE TABLE IF NOT EXISTS "RepositoryPreview" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "language" TEXT,
  "healthScore" INTEGER,
  "openItems" INTEGER NOT NULL DEFAULT 0,
  "highRiskItems" INTEGER NOT NULL DEFAULT 0,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RepositoryPreview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RepositoryPreview_projectId_idx" ON "RepositoryPreview"("projectId");

-- Model: WorkflowPreview
CREATE TABLE IF NOT EXISTS "WorkflowPreview" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trigger" TEXT,
  "stepSummary" JSONB,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowPreview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WorkflowPreview_projectId_idx" ON "WorkflowPreview"("projectId");
CREATE INDEX IF NOT EXISTS "WorkflowPreview_status_idx" ON "WorkflowPreview"("status");

-- Model: KnowledgeDocument
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_projectId_idx" ON "KnowledgeDocument"("projectId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_type_idx" ON "KnowledgeDocument"("type");

-- Model: SupportRequest
CREATE TABLE IF NOT EXISTS "SupportRequest" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "priority" "Priority" NOT NULL,
  "requester" TEXT,
  "owner" TEXT,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportRequest_projectId_idx" ON "SupportRequest"("projectId");
CREATE INDEX IF NOT EXISTS "SupportRequest_status_idx" ON "SupportRequest"("status");
CREATE INDEX IF NOT EXISTS "SupportRequest_priority_idx" ON "SupportRequest"("priority");

-- Model: SupportArticle
CREATE TABLE IF NOT EXISTS "SupportArticle" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportArticle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportArticle_projectId_idx" ON "SupportArticle"("projectId");
CREATE INDEX IF NOT EXISTS "SupportArticle_category_idx" ON "SupportArticle"("category");
CREATE INDEX IF NOT EXISTS "SupportArticle_status_idx" ON "SupportArticle"("status");

-- Column Reconciliation for Existing Migrated Tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AiProviderConfiguration') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AiProviderConfiguration' AND column_name = 'structuredOutputVerifiedAt') THEN
      ALTER TABLE "AiProviderConfiguration" ADD COLUMN "structuredOutputVerifiedAt" TIMESTAMP(3);
    END IF;
  END IF;
END $$;
