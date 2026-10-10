# SEKHEM DATABASE & CORE DOMAIN RECONCILIATION SPECIFICATION (P0-04 PHASE A)

**Document**: `SEKHEM_DATABASE_RECONCILIATION.md`  
**Status**: Authoritative Target Contract (Read-Only Specification)  
**Date**: September 7, 2026  
**Scope**: Complete database inventory, schema drift analysis, raw SQL audit, persistence reconciliation, and deterministic rebuild contract.

---

## 1. Actual Database Inventory

```text
DATABASE INTROSPECTION NOT AVAILABLE
```

### Evidence & Environment State:
- **Connection Test**: TCP probe to `localhost:5432` failed (`TcpTestSucceeded: False`). No local PostgreSQL engine is running on the default port.
- **Environment Variables**: `process.env.DATABASE_URL` is unset in the current process environment.
- **Configuration Files**: Only `backend/.env.example` exists, specifying `SEKHEM_DATA_SOURCE=memory` and `DATABASE_URL=postgresql://localhost:5432/sekhem_product_dev?schema=public`. No active `.env` file exists in the repository.
- **Deduction**: All subsequent analysis is grounded strictly in source code, Prisma schema definitions, and migration history.

---

## 2. Prisma Schema Inventory (`backend/prisma/schema.prisma`)

The Prisma schema defines **3 Enums** and **64 Models**, organized into 7 functional domains:

### 2.1 Enums
1. **`RiskLevel`**: `low`, `medium`, `high`, `critical`
2. **`Priority`**: `low`, `medium`, `high`, `critical`
3. **`SourceType`**: `seed`, `manual`, `workflow`, `ai`, `backend_aggregate`

### 2.2 Model Catalog (64 Models)

#### Domain A: Core Product & Operations (29 Models)
1. **`Project`**: PK: `id (String)`. Fields: `slug (UQ)`, `name`, `customerFacingName`, `description?`, `status`, `phase`, `platform`, `groupId?`, `organizationId?`, `createdAt`, `updatedAt`. FKs: `groupId -> Group`, `organizationId -> Organization`. Indexes: `[status]`, `[phase]`. Org Boundary: `organizationId`.
2. **`Module`**: PK: `id`. Fields: `projectId?`, `slug (UQ)`, `key (UQ)`, `name`, `customerFacingName`, `category`, `description`, `phase`, `status`, `isLocked`, `lockReason?`, `route?`, `order`, `capabilities (String[])`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Indexes: `[projectId]`, `[category]`, `[status]`.
3. **`LockedModule`**: PK: `id`. Fields: `moduleId (UQ)`, `activationLabel?`, `requirements (Json?)`, `estimatedActivationTime?`, `createdAt`, `updatedAt`. FK: `moduleId -> Module`.
4. **`Initiative`**: PK: `id`. Fields: `projectId`, `moduleId?`, `slug (UQ)`, `title`, `name`, `description`, `status`, `category`, `businessValue`, `technicalRisk (RiskLevel)`, `recommendedPath`, `tags`, `humanApprovalRequired`, `overview (Json?)`, `createdAt`, `lastActivityAt`, `updatedAt`. FKs: `projectId -> Project`, `moduleId -> Module`. Indexes: `[projectId]`, `[moduleId]`, `[status]`, `[technicalRisk]`.
5. **`EvidenceSource`**: PK: `id`. Fields: `initiativeId`, `initiativeSlug`, `type`, `title`, `source`, `relevance`, `summary`, `sourceType (SourceType)`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative`. Indexes: `[initiativeId]`, `[initiativeSlug]`.
6. **`ExecutionPath`**: PK: `id`. Fields: `initiativeId`, `initiativeSlug`, `name`, `description`, `riskLevel`, `status`, `requiresApproval`, `estimatedDuration`, `deliverables`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative`. Indexes: `[initiativeId]`, `[initiativeSlug]`.
7. **`Task`**: PK: `id`. Fields: `initiativeId`, `initiativeSlug`, `title`, `description?`, `lane`, `status`, `priority (Priority)`, `assignee`, `ownerRole?`, `dueDate?`, `sourceType`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative`. Indexes: `[initiativeId]`, `[status]`.
8. **`ActivityEvent`**: PK: `id`. Fields: `projectId?`, `initiativeId?`, `initiativeSlug?`, `type`, `title`, `description`, `actor`, `actorType`, `status`, `sourceType`, `createdAt`. FK: `initiativeId -> Initiative?`. Indexes: `[projectId]`, `[initiativeId]`, `[initiativeSlug]`.
9. **`Approval`**: PK: `id`. Fields: `projectId`, `initiativeId?`, `initiativeSlug?`, `title`, `description`, `module`, `priority`, `status`, `type`, `requestedBy`, `requestedRole?`, `approverRole?`, `requiresHumanApproval`, `createdAt`, `dueAt?`, `updatedAt`. FKs: `projectId -> Project`, `initiativeId -> Initiative?`. Indexes: `[projectId]`, `[initiativeId]`, `[status]`.
10. **`TechnicalMemo`**: PK: `id`. Fields: `initiativeId`, `initiativeSlug`, `generatedAt`, `generatedBy`, `status`, `sections (Json)`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative`.
11. **`CodeDraftWorkspace`**: PK: `id`. Fields: `initiativeId`, `initiativeSlug`, `name`, `status`, `badges`, `humanApprovalRequired`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative`.
12. **`SandboxedArtifact`**: PK: `id`. Fields: `workspaceId`, `fileName`, `artifactType`, `status`, `createdAt`, `updatedAt`. FK: `workspaceId -> CodeDraftWorkspace`.
13. **`SecurityGate`**: PK: `id`. Fields: `projectId`, `initiativeId?`, `initiativeSlug?`, `title`, `status`, `riskLevel (RiskLevel)`, `summary`, `lastCheckedAt?`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative?`. Indexes: `[initiativeId]`, `[status]`.
14. **`SecurityCheck`**: PK: `id`. Fields: `securityGateId`, `title`, `checkType`, `status`, `severity (RiskLevel)`, `evidence?`, `createdAt`, `updatedAt`. FK: `securityGateId -> SecurityGate`.
15. **`SecurityFinding`**: PK: `id`. Fields: `securityGateId`, `title`, `description`, `severity (RiskLevel)`, `status`, `recommendation`, `owner`, `createdAt`, `updatedAt`. FK: `securityGateId -> SecurityGate`.
16. **`Blocker`**: PK: `id`. Fields: `projectId`, `initiativeId?`, `initiativeSlug?`, `title`, `description`, `type`, `severity (RiskLevel)`, `status`, `cause`, `owner`, `evidence`, `suggestedAction`, `nextStep`, `rollbackOption`, `maxAssistantFixAttempts`, `humanReviewRequiredAfterAttempts`, `createdAt`, `updatedAt`. FKs: `projectId -> Project`, `initiativeId -> Initiative?`. Indexes: `[projectId]`, `[initiativeId]`, `[status]`, `[severity]`.
17. **`ReleaseCandidate`**: PK: `id`. Fields: `projectId`, `initiativeId?`, `initiativeSlug?`, `version`, `title`, `description`, `status`, `securityScore`, `testsPassed`, `testsTotal`, `changeCount`, `blockingIssues`, `artifactCount`, `createdAt`, `updatedAt`. FK: `initiativeId -> Initiative?`. Indexes: `[initiativeId]`, `[status]`.
18. **`ReleaseArtifact`**: PK: `id`. Fields: `releaseCandidateId`, `artifactType`, `fileName`, `status`, `checksum?`. FK: `releaseCandidateId -> ReleaseCandidate`.
19. **`ReleaseApprovalChecklistItem`**: PK: `id`. Fields: `releaseCandidateId`, `title`, `status`, `requiredRole`. FK: `releaseCandidateId -> ReleaseCandidate`.
20. **`RollbackPlan`**: PK: `id`. Fields: `releaseCandidateId (UQ)`, `title`, `summary`, `status`. FK: `releaseCandidateId -> ReleaseCandidate`.
21. **`RDSignal`**: PK: `id`. Fields: `projectId`, `title`, `type`, `source`, `priority`, `summary`, `impact`, `actionRecommended`, `processed`, `tags`, `createdAt`, `updatedAt`. FK: `projectId -> Project`.
22. **`InfrastructureNode`**: PK: `id`. Fields: `projectId`, `name`, `type`, `status`, `region`, `uptime`, `cpu`, `memory`, `disk`.
23. **`ServiceStatus`**: PK: `id`. Fields: `nodeId?`, `name`, `status`, `latencyMs?`, `lastCheckedAt`. FK: `nodeId -> InfrastructureNode?`.
24. **`AuditEvent`**: PK: `id`. Fields: `projectId?`, `initiativeId?`, `timestamp`, `action`, `actor`, `actorType`, `target`, `module`, `details (String)`, `riskLevel (RiskLevel)`, `sourceType (SourceType)`, `createdAt`. FKs: `projectId -> Project?`, `initiativeId -> Initiative?`.
25. **`RepositoryPreview`**: PK: `id`. Fields: `projectId`, `name`, `description`, `language?`, `healthScore?`, `openItems`, `highRiskItems`, `sourceType`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Index: `[projectId]`.
26. **`WorkflowPreview`**: PK: `id`. Fields: `projectId`, `name`, `status`, `trigger?`, `stepSummary (Json?)`, `sourceType`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Indexes: `[projectId]`, `[status]`.
27. **`KnowledgeDocument`**: PK: `id`. Fields: `projectId`, `title`, `summary`, `type`, `source?`, `tags`, `sourceType`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Indexes: `[projectId]`, `[type]`.
28. **`SupportRequest`**: PK: `id`. Fields: `projectId`, `title`, `description`, `status`, `priority`, `requester?`, `owner?`, `sourceType`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Indexes: `[projectId]`, `[status]`, `[priority]`.
29. **`SupportArticle`**: PK: `id`. Fields: `projectId`, `title`, `summary`, `category`, `status`, `tags`, `sourceType`, `createdAt`, `updatedAt`. FK: `projectId -> Project`. Indexes: `[projectId]`, `[category]`, `[status]`.

#### Domain B: Multi-User, Identity, Organization & Governance (11 Models)
30. **`User`**: PK: `id`. Fields: `displayName`, `initials?`, `email (UQ)`, `passwordHash?`, `organization?`, `organizationId?`, `title?`, `status ("active")`, `sessionRevokedAt?`, `tokenVersion (1)`, `createdAt`, `updatedAt`. FK: `organizationId -> Organization?`.
31. **`Role`**: PK: `id`. Fields: `key (UQ)`, `name`, `description?`, `createdAt`, `updatedAt`.
32. **`Permission`**: PK: `id`. Fields: `key (UQ)`, `name`, `description?`, `createdAt`, `updatedAt`.
33. **`UserRole`**: Composite PK: `[userId, roleId]`. FKs: `userId -> User`, `roleId -> Role`. Index: `[roleId]`.
34. **`RolePermission`**: Composite PK: `[roleId, permissionId]`. FKs: `roleId -> Role`, `permissionId -> Permission`. Index: `[permissionId]`.
35. **`Organization`**: PK: `id (cuid)`. Fields: `slug (UQ)`, `name`, `description?`, `createdAt`, `updatedAt`.
36. **`OrganizationMember`**: PK: `id (cuid)`. Fields: `organizationId`, `userId`, `role ("member")`, `createdAt`. FKs: `organizationId -> Organization (Cascade)`, `userId -> User (Cascade)`. Unique: `[organizationId, userId]`. Indexes: `[userId]`, `[organizationId]`.
37. **`UserSession`**: PK: `id (cuid)`. Fields: `userId`, `tokenHash (UQ)`, `ipAddress?`, `userAgent?`, `expiresAt`, `revokedAt?`, `createdAt`. FK: `userId -> User (Cascade)`. Indexes: `[userId]`, `[tokenHash]`, `[revokedAt, expiresAt]`.
38. **`Group`**: PK: `id (cuid)`. Fields: `organizationId?`, `slug (UQ)`, `name`, `description?`, `createdAt`, `updatedAt`. FK: `organizationId -> Organization?`.
39. **`GroupMember`**: PK: `id (cuid)`. Fields: `groupId`, `userId`, `role ("member")`, `createdAt`. FKs: `groupId -> Group (Cascade)`, `userId -> User (Cascade)`. Unique: `[groupId, userId]`. Index: `[userId]`.
40. **`ProjectMember`**: PK: `id (cuid)`. Fields: `projectId`, `userId`, `role ("Viewer")`, `createdAt`. FKs: `projectId -> Project (Cascade)`, `userId -> User (Cascade)`. Unique: `[projectId, userId]`. Indexes: `[userId]`, `[projectId]`.

#### Domain C: R&D Radar Analysis (7 Models)
41. **`EvidenceSourceV2`**: PK: `id`. Fields: `url (UQ)`, `title`, `sourceType`, `status ("approved")`, `lastCollectedAt?`, `createdAt`, `updatedAt`.
42. **`EvidenceItem`**: PK: `id`. Fields: `sourceId`, `title`, `sourceUrl`, `sanitizedFinding`, `collectionStatus ("EVIDENCE_COLLECTED")`, `reviewerDecision?`, `collectedAt`, `createdAt`, `updatedAt`. FK: `sourceId -> EvidenceSourceV2 (Restrict)`. Index: `[sourceId]`.
43. **`EvidenceReview`**: PK: `id`. Fields: `evidenceItemId`, `relevance`, `reliability`, `freshness`, `businessApplicability`, `reviewerDecision`, `reviewerRole ("pm_reviewer")`, `notes?`, `createdAt`. FK: `evidenceItemId -> EvidenceItem (Restrict)`. Index: `[evidenceItemId]`.
44. **`CandidateInitiative`**: PK: `id`. Fields: `candidateId (UQ)`, `title`, `status ("DRAFT_ONLY")`, `problemStatement`, `evidenceSummary`, `expectedBusinessValue`, `nextGate ("PM_REVIEW_REQUIRED")`, `requiresPMApproval`, `runtimeVerificationRequired`, `createdAsDraftOnly`, `requiredAdditionalEvidence (Json)`, `uncertaintyRisks (Json)`, `createdAt`, `updatedAt`. Index: `[status]`.
45. **`PMDecision`**: PK: `id`. Fields: `candidateId`, `decision`, `decisionReason`, `approvedScopeIfAny?`, `nextGate`, `runtimeVerificationRequired`, `createdAt`. FK: `candidateId -> CandidateInitiative (candidateId, Restrict)`. Index: `[candidateId]`.
46. **`WorkflowRunSummary`**: PK: `id`. Fields: `workflowName`, `workflowId?`, `executionId?`, `workflowStatus`, `evidenceCount`, `reviewStatus`, `candidateId?`, `nextGate`, `runtimeVerificationRequired`, `forbiddenActionsObserved`, `sanitizedOutput (Json)`, `workflowActive`, `triggerType`, `createdAt`. Index: `[candidateId]`.
47. **`GitHubIntegrationStatus`**: PK: `id`. Fields: `repoFullName`, `branch`, `integrationStatus`, `requiredCheckName`, `latestCheckStatus?`, `branchProtectionStatus`, `writeActionsExecuted`, `checkedAt`, `createdAt`, `updatedAt`. Index: `[repoFullName, branch]`.

#### Domain D: AI Gateway & Configuration (5 Models)
48. **`AiProviderConfiguration`**: PK: `id`. Fields: `displayName`, `providerType`, `baseUrl`, `encryptedApiKey?`, `enabled (false)`, `healthState ("untested")`, `defaultTimeoutMs (30000)`, `structuredOutputDialect?`, `structuredOutputVerifiedAt?`, `createdAt`, `updatedAt`. Index: `[enabled]`.
49. **`AiModelConfiguration`**: PK: `id`. Fields: `providerId`, `modelId`, `displayName`, `enabled (true)`, `defaultForProvider (false)`, `contextWindow`, `maxOutputTokens`, `supportedTasks (String[])`, `createdAt`, `updatedAt`. FK: `providerId -> AiProviderConfiguration (Restrict)`. Unique: `[providerId, modelId]`. Index: `[providerId, enabled]`.
50. **`RepositoryConnection`**: PK: `id`. Fields: `displayName`, `providerType`, `repositoryIdentifier`, `encryptedCredential?`, `defaultBranch`, `allowedBranches (String[])`, `includePaths (String[])`, `excludePaths (String[])`, `maximumFileBytes`, `maximumTotalBytes`, `maximumFileCount`, `timeoutMs`, `enabled (false)`, `createdAt`, `updatedAt`. Index: `[providerType, enabled]`.
51. **`RDRadarAnalysisRun`**: PK: `id`. Fields: `repositoryConnectionId`, `providerId`, `modelId`, `requestedRef`, `commitSha?`, `analysisPurpose`, `promptVersion`, `status ("RUNNING")`, `sanitizedFailureReason?`, `result (Json)`, `evidenceItemIds (String[])`, `candidateId?`, `cancellationRequested (false)`, `startedAt`, `completedAt?`, `createdAt`, `updatedAt`. FKs: `repositoryConnectionId -> RepositoryConnection`, `providerId -> AiProviderConfiguration`, `modelId -> AiModelConfiguration`. Indexes: `[status, createdAt]`, `[repositoryConnectionId, commitSha]`.
52. **`ConfigurationAuditEvent`**: PK: `id`. Fields: `actor`, `action`, `resourceType`, `resourceId`, `sanitizedDetails (Json)`, `createdAt`. Index: `[resourceType, resourceId, createdAt]`.

#### Domain E: Workflow Runtime Persistence (4 Models)
53. **`WorkflowRun`**: PK: `id`. Fields: `eventType`, `status`, `projectId`, `initiativeSlug?`, `requestedBy`, `requestedRole`, `note`, `createdAt`, `updatedAt`. Indexes: `[status]`, `[projectId]`, `[initiativeSlug]`.
54. **`WorkflowCallback`**: PK: `id`. Fields: `workflowRunId`, `issueId`, `taskId?`, `step`, `status`, `resultSummary?`, `evidence (Json)`, `error (Json?)`, `blocker (Json?)`, `idempotencyKey`, `occurredAt`, `payloadHash`, `acceptedAt`. FK: `workflowRunId -> WorkflowRun (Restrict)`. Indexes: `[workflowRunId]`, `[issueId]`, `[status]`.
55. **`WorkflowRunState`**: PK: `id`. Fields: `workflowRunId`, `status`, `step`, `resultSummary?`, `evidence (Json)`, `error (Json?)`, `blocker (Json?)`, `blockerId?`, `occurredAt`, `createdAt`. FKs: `workflowRunId -> WorkflowRun (Restrict)`, `blockerId -> Blocker? (SetNull)`. Indexes: `[workflowRunId]`, `[status]`, `[blockerId]`.
56. **`WorkflowCallbackIdempotency`**: Composite PK: `[workflowRunId, idempotencyKey]`. Fields: `workflowRunId`, `idempotencyKey`, `payloadHash`, `callbackId`, `createdAt`. FKs: `workflowRunId -> WorkflowRun (Restrict)`, `callbackId -> WorkflowCallback (Restrict)`.

#### Domain F: Conversation Subsystem (2 Models)
57. **`Conversation`**: PK: `id (cuid)`. Fields: `projectId`, `userId`, `title`, `status ("active")`, `metadata (Json)`, `createdAt`, `updatedAt`. FKs: `projectId -> Project (Cascade)`, `userId -> User (Cascade)`. Indexes: `[projectId]`, `[userId]`.
58. **`ConversationMessage`**: PK: `id (cuid)`. Fields: `conversationId`, `senderId`, `senderType`, `content`, `metadata (Json)`, `createdAt`. FK: `conversationId -> Conversation (Cascade)`. Index: `[conversationId]`.

#### Domain G: Agent Runtime Subsystem (6 Models)
59. **`AgentRun`**: PK: `id (cuid)`. Fields: `conversationId`, `projectId`, `userId`, `agentName ("SekhemEngineer")`, `title`, `status ("QUEUED")`, `planVersion (1)`, `currentStepIndex (0)`, `progressPercent (0)`, `pausedAt?`, `startedAt?`, `completedAt?`, `failureReason?`, `cancellationReason?`, `createdAt`, `updatedAt`. FKs: `conversationId -> Conversation (Cascade)`, `projectId -> Project (Cascade)`, `userId -> User (Cascade)`. Indexes: `[projectId]`, `[conversationId]`, `[status]`.
60. **`AgentPlan`**: PK: `id (cuid)`. Fields: `agentRunId`, `version (1)`, `summary`, `steps (Json)`, `requiresApproval (false)`, `status ("DRAFT")`, `reviewedBy?`, `reviewNotes?`, `createdAt`. FK: `agentRunId -> AgentRun (Cascade)`. Index: `[agentRunId]`.
61. **`AgentRunEvent`**: PK: `id (cuid)`. Fields: `agentRunId`, `stepIndex?`, `eventType`, `actor ("agent")`, `payload (Json)`, `timestamp`. FK: `agentRunId -> AgentRun (Cascade)`. Index: `[agentRunId, timestamp]`.
62. **`AgentApproval`**: PK: `id (cuid)`. Fields: `agentRunId`, `approvalType`, `status ("PENDING")`, `requestedBy`, `requiredRole ("Technical Reviewer")`, `decidedBy?`, `decision?`, `notes?`, `revisedPlan (Json?)`, `dueAt?`, `createdAt`, `decidedAt?`. FK: `agentRunId -> AgentRun (Cascade)`. Index: `[agentRunId, status]`.
63. **`AgentArtifact`**: PK: `id (cuid)`. Fields: `agentRunId`, `projectId`, `title`, `artifactType`, `content`, `summary?`, `isCustomerSafe (true)`, `version (1)`, `metadata (Json)`, `createdAt`. FKs: `agentRunId -> AgentRun (Cascade)`, `projectId -> Project (Cascade)`. Indexes: `[agentRunId]`, `[projectId]`.
64. **`AgentAuditRecord`**: PK: `id (cuid)`. Fields: `agentRunId`, `projectId`, `eventType`, `actor`, `actorRole?`, `details (Json)`, `timestamp`. FKs: `agentRunId -> AgentRun (Cascade)`, `projectId -> Project (Cascade)`. Indexes: `[agentRunId]`, `[projectId, timestamp]`.

---

## 3. Migration Inventory & Representation Analysis

### 3.1 Migration Scripts (`backend/prisma/migrations/`)
1. **`20260520112500_add_rd_radar_persistence`**:
   - Creates: `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview`, `CandidateInitiative`, `PMDecision`, `WorkflowRunSummary`, `GitHubIntegrationStatus`.
   - Assumptions: Explicit header: `-- Additive-only R&D Radar persistence foundation. No existing table or column is dropped or altered.` Assumes core schema already active.
2. **`20260609000000_add_workflow_runtime_persistence`**:
   - Creates: `WorkflowRun`, `WorkflowCallback`, `WorkflowRunState`, `WorkflowCallbackIdempotency`.
   - Conditional logic: Checks `IF to_regclass('"Blocker"') IS NOT NULL` before creating FK to `Blocker`.
   - Assumptions: Assumes `Blocker` table might or might not exist.
3. **`20260815190000_add_rd_radar_v1_local_llm`**:
   - Creates: `AiProviderConfiguration`, `AiModelConfiguration`, `RepositoryConnection`, `RDRadarAnalysisRun`, `ConfigurationAuditEvent`.
   - Assumptions: Standalone additive migration.
4. **`20260829153000_add_provider_structured_output_dialect`**:
   - Alters: `AiProviderConfiguration` (adds `structuredOutputDialect`, `structuredOutputVerifiedAt`).
   - Assumptions: Assumes `AiProviderConfiguration` exists.
5. **`20260906000000_add_agentic_multiuser_platform`**:
   - Alters: `User` (adds `passwordHash`, `organization`, `organizationId`, `status`, `sessionRevokedAt`, `tokenVersion`), `Project` (adds `groupId`, `organizationId`).
   - Creates: `Organization`, `OrganizationMember`, `UserSession`, `Group`, `GroupMember`, `ProjectMember`, `Conversation`, `ConversationMessage`, `AgentRun`, `AgentPlan`, `AgentRunEvent`, `AgentApproval`, `AgentArtifact`, `AgentAuditRecord`.
   - Assumptions: Assumes `User` and `Project` tables already exist!

### 3.2 Representation Classification

| Representation Status | Count | Models |
|---|---|---|
| **Fully Represented in Migrations** | **30** | `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview`, `CandidateInitiative`, `PMDecision`, `WorkflowRunSummary`, `GitHubIntegrationStatus`, `WorkflowRun`, `WorkflowCallback`, `WorkflowRunState`, `WorkflowCallbackIdempotency`, `AiProviderConfiguration`, `AiModelConfiguration`, `RepositoryConnection`, `RDRadarAnalysisRun`, `ConfigurationAuditEvent`, `Organization`, `OrganizationMember`, `UserSession`, `Group`, `GroupMember`, `ProjectMember`, `Conversation`, `ConversationMessage`, `AgentRun`, `AgentPlan`, `AgentRunEvent`, `AgentApproval`, `AgentArtifact`, `AgentAuditRecord` |
| **Partially Represented in Migrations** | **2** | `User` (only `ALTER TABLE` in `20260906000000`; initial `CREATE TABLE` missing), `Project` (only `ALTER TABLE` in `20260906000000`; initial `CREATE TABLE` missing) |
| **Not Represented at all in Migrations** | **32** | `Module`, `LockedModule`, `Initiative`, `EvidenceSource`, `ExecutionPath`, `Task`, `ActivityEvent`, `Approval`, `TechnicalMemo`, `CodeDraftWorkspace`, `SandboxedArtifact`, `SecurityGate`, `SecurityCheck`, `SecurityFinding`, `Blocker`, `ReleaseCandidate`, `ReleaseArtifact`, `ReleaseApprovalChecklistItem`, `RollbackPlan`, `RDSignal`, `InfrastructureNode`, `ServiceStatus`, `AuditEvent`, `RepositoryPreview`, `WorkflowPreview`, `KnowledgeDocument`, `SupportRequest`, `SupportArticle`, `Role`, `Permission`, `UserRole`, `RolePermission` |

---

## 4. Raw SQL Inventory

| File | Symbol | Target Table | SQL Operation | Purpose | Transactional? | Auth Scope | Schema Dependency |
|---|---|---|---|---|---|---|---|
| `backend/src/product.service.ts:34` | `defaultDbReadinessProbe` | None | `SELECT 1` | Database connection readiness probe | No | Public (`GET /api/health/db-readiness`) | None |
| `backend/src/workflow-runtime.store.ts:124` | `ensureRunForCallback` | `"WorkflowRun"` | `INSERT ... ON CONFLICT ("id") DO UPDATE SET ...` | Idempotent upsert of workflow run header | No | Machine Callback | Table `"WorkflowRun"` |
| `backend/src/workflow-runtime.store.ts:145` | `listRuns` | `"WorkflowRun"` | `SELECT ... FROM "WorkflowRun" ORDER BY "createdAt" DESC` | Retrieve all workflow runs | No | Internal / Viewer | Table `"WorkflowRun"` |
| `backend/src/workflow-runtime.store.ts:155` | `getRun` | `"WorkflowRun"` | `SELECT ... FROM "WorkflowRun" WHERE "id" = ${id} LIMIT 1` | Retrieve single workflow run by ID | No | Internal / Viewer | Table `"WorkflowRun"` |
| `backend/src/workflow-runtime.store.ts:166` | `getLatestCallback` | `"WorkflowCallback"` | `SELECT ... FROM "WorkflowCallback" WHERE "workflowRunId" = ${id} ORDER BY "acceptedAt" DESC LIMIT 1` | Read latest callback for run | No | Internal | Table `"WorkflowCallback"` |
| `backend/src/workflow-runtime.store.ts:178` | `getIdempotency` | `"WorkflowCallbackIdempotency"`, `"WorkflowCallback"` | `SELECT ... FROM "WorkflowCallbackIdempotency" idem JOIN "WorkflowCallback" callback ...` | Check idempotency key deduplication | No | Internal | Tables `"WorkflowCallbackIdempotency"`, `"WorkflowCallback"` |
| `backend/src/workflow-runtime.store.ts:200` | `storeCallback` (Step 1) | `"WorkflowCallback"` | `INSERT INTO "WorkflowCallback" (...) VALUES (...)` | Record callback payload | **NO** (Step 1 of 4 sequential non-atomic writes) | Machine Callback | Table `"WorkflowCallback"` |
| `backend/src/workflow-runtime.store.ts:208` | `storeCallback` (Step 2) | `"WorkflowCallbackIdempotency"` | `INSERT INTO "WorkflowCallbackIdempotency" (...) VALUES (...)` | Record callback idempotency key | **NO** (Step 2 of 4) | Machine Callback | Table `"WorkflowCallbackIdempotency"` |
| `backend/src/workflow-runtime.store.ts:216` | `storeCallback` (Step 3) | `"WorkflowRunState"` | `INSERT INTO "WorkflowRunState" (...) VALUES (...)` | Record run state transition | **NO** (Step 3 of 4) | Machine Callback | Table `"WorkflowRunState"` |
| `backend/src/workflow-runtime.store.ts:224` | `storeCallback` (Step 4) | `"WorkflowRun"` | `UPDATE "WorkflowRun" SET "status" = ${status}, "updatedAt" = ${acceptedAt} WHERE "id" = ${runId}` | Update parent run status | **NO** (Step 4 of 4) | Machine Callback | Table `"WorkflowRun"` |

---

## 5. Direct `new PrismaClient()` Inventory

| File & Line | Symbol | Reason for Direct Instantiation | Lifecycle & Cleanup | Connection Pool Impact |
|---|---|---|---|---|
| `backend/src/product.service.ts:31` | `defaultDbReadinessProbe` | Standalone health probe function | Created on every health request; closed in `finally` via `await prisma.$disconnect()`. | **High socket turnover**: Creates/destroys pool on every health probe. |
| `backend/src/workflow-runtime.store.ts:59` | `createWorkflowRuntimeStore` | Instantiates runtime persistence store in DB mode | Instantiated on factory call; lives for process duration; never disconnected. | Persistent pool; unmanaged shutdown. |
| `backend/src/rd-radar.service.ts:180` | `RDRadarService.prismaClient` | Direct service property for status, evidence, and decision queries | Instantiated on service instantiation; lives for process duration; never disconnected. | Persistent pool; unmanaged shutdown. |
| `backend/src/rd-radar-analysis.service.ts:27` | `RDRadarAnalysisService.prisma` | Direct service property for runs and interactive `$transaction` | Instantiated on service instantiation; lives for process duration; never disconnected. | Persistent pool; unmanaged shutdown. |
| `backend/src/ai-gateway/runtime-configuration.service.ts:34` | `RuntimeConfigurationService.prisma` | Direct service property for AI and repository connection CRUD | Instantiated on service instantiation; lives for process duration; never disconnected. | Persistent pool; unmanaged shutdown. |

> [!WARNING]
> **Dependency Injection Gap**: In `AuthService`, `AdminService`, `ResourceAuthorizationService`, `AuditService`, and `ConversationService`, `prisma` is declared as `private prisma: any | null = null` with a setter `setPrismaClient(client)`. In production runtime, `AppModule` **never injects a PrismaClient** into these services! Unless a centralized `PrismaService` is injected, their `this.prisma` remains `null`.

---

## 6. Persistence Matrix (Controller → Service → Repository → Persistence)

| Feature | Controller | Service | Repository / Data Access | Current Mode | Durable in Postgres? | Target Model |
|---|---|---|---|---|---|---|
| **Users** | `AdminController`<br>`AuthController` | `AdminService`<br>`AuthService` | Direct `this.prisma.user` (when set) | DURABLE_POSTGRES | **YES** (if client injected) | `User`, `UserRole` |
| **Organizations**| `AdminController` | `AdminService` | Direct `this.prisma.organization` | DURABLE_POSTGRES | **YES** (if client injected) | `Organization`, `OrganizationMember` |
| **Sessions** | `AuthController` | `AuthService` | Direct `this.prisma.userSession` | DURABLE_POSTGRES | **YES** (if client injected) | `UserSession` |
| **Groups** | `AdminController` | `AdminService` | Direct `this.prisma.group` | DURABLE_POSTGRES | **YES** (if client injected) | `Group`, `GroupMember` |
| **Projects** | `ProductController`<br>`AdminController` | `ProductService`<br>`AdminService` | `MemoryProductReadRepository`<br>`this.prisma.projectMember` | HYBRID (Reads memory, members in DB) | **PARTIALLY** | `Project`, `ProjectMember` |
| **Initiatives** | `ProductController` | `ProductService`<br>`ProductWriteService` | `MemoryProductReadRepository`<br>`seed-data.ts` arrays | MEMORY | **NO** | `Initiative`, `EvidenceSource`, `ExecutionPath` |
| **Tasks** | `ProductController` | `ProductService`<br>`ProductWriteService` | `MemoryProductReadRepository`<br>`seed-data.ts` arrays | MEMORY | **NO** | `Task` |
| **Approvals** | `ProductController` | `ProductService`<br>`ProductWriteService` | `MemoryProductReadRepository`<br>`seed-data.ts` arrays | MEMORY | **NO** | `Approval` |
| **Blockers** | `ProductController` | `ProductService`<br>`ProductWriteService` | `MemoryProductReadRepository`<br>`seed-data.ts` arrays | MEMORY | **NO** | `Blocker` |
| **Audit** | None<br>`ProductController` | `AuditService`<br>`ProductWriteService` | `inMemoryLog`<br>`seed-data.ts` arrays | MEMORY / HYBRID (DB writes fail silently) | **NO** | `AuditEvent` |
| **Conversations**| `ConversationController` (*unmounted*) | `ConversationService` | `this.prisma.conversation` | DURABLE_POSTGRES (Code ready; unmounted) | **YES** (When mounted) | `Conversation` |
| **Messages** | `ConversationController` (*unmounted*) | `ConversationService` | `this.prisma.conversationMessage` | DURABLE_POSTGRES (Code ready; unmounted) | **YES** (When mounted) | `ConversationMessage` |
| **R&D Evidence** | `RDRadarController` | `RDRadarService`<br>`RDRadarAnalysisService` | `this.prismaClient.evidenceItem`<br>or static fixtures | DURABLE_POSTGRES / FIXTURE | **YES** (in DB mode) | `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview` |
| **R&D Candidates**| `RDRadarController` | `RDRadarService`<br>`RDRadarAnalysisService` | `this.prismaClient.candidateInitiative`<br>or static fixtures | DURABLE_POSTGRES / FIXTURE | **YES** (in DB mode) | `CandidateInitiative`, `PMDecision` |
| **Workflow State**| `AutomationContractController`| `WorkflowRuntimeStore` | Raw SQL via `prisma` or `InProcessWorkflowRuntimeStore` | HYBRID | **YES** (in DB mode) | `WorkflowRun`, `WorkflowCallback`, etc. |
| **AI Patch State**| `AiPatchController` | `AiPatchService` | `aiPatchDrafts` in `ai-patch-memory.ts` | MEMORY | **NO** | None in `schema.prisma` |
| **Skills** | None (*unmounted*) | `SkillRegistryService` | Static definitions in `built-in-skills.ts` | STATIC/FALLBACK | **NO** | None |

---

## 7. Target Domain Model & Entity Boundaries

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           ORGANIZATION BOUNDARY                         │
│  Organization (id, slug, name)                                          │
│  ├── OrganizationMember (userId, role: owner | admin | member)          │
│  ├── Group (id, slug, name) ── GroupMember (userId, role)               │
│  └── User (id, email, passwordHash, status: active | suspended)         │
│       └── UserSession (tokenHash, expiresAt, revokedAt)                 │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                          PROJECT BOUNDARY                         │  │
│  │  Project (id, slug, name, groupId?, organizationId)               │  │
│  │  ├── ProjectMember (userId, role: Admin|PM|TechRev|SecRev|Viewer) │  │
│  │  ├── Module (slug, status, isLocked)                              │  │
│  │  │    └── LockedModule (activationLabel, requirements)            │  │
│  │  ├── Initiative (slug, status, technicalRisk)                     │  │
│  │  │    ├── Task (lane, status, priority, assignee)                 │  │
│  │  │    ├── EvidenceSource / ExecutionPath                          │  │
│  │  │    ├── SecurityGate ── SecurityCheck / SecurityFinding         │  │
│  │  │    ├── ReleaseCandidate ── ReleaseArtifact / RollbackPlan      │  │
│  │  │    └── Blocker (type, severity, cause, owner)                  │  │
│  │  ├── Approval (status, type, requestedBy, approverRole)           │  │
│  │  ├── AuditEvent (action, actor, target, description, metadata)    │  │
│  │  └── Conversation (title, status) ── ConversationMessage          │  │
│  │               └── AgentRun (status, planVersion)                  │  │
│  │                     ├── AgentPlan / AgentRunEvent                 │  │
│  │                     ├── AgentApproval / AgentArtifact             │  │
│  │                     └── AgentAuditRecord                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Identified Ambiguities in Source:
1. **`User.organization` vs `User.organizationId`**: `User` contains both a legacy raw string `organization: String?` and foreign key `organizationId: String?`. Target model must standardize on `organizationId -> Organization`.
2. **`Project.groupId` vs `Project.organizationId`**: Both are optional in `schema.prisma`. In multi-tenant architecture, `organizationId` must be mandatory for all non-template projects.
3. **AI Patch Model Missing**: `AiPatchService` manages complex entities (`AiPatchDraftDto`, artifacts, approval gates) but has zero models in `schema.prisma`.

---

## 8. Audit Reconciliation (Exact Root Cause & Fix)

### Current Discrepancies:
1. **Expected by Code (`AuditService:107-125`)**:
   - `description: string` (e.g. `"USER_CREATE on User:usr_123 (SUCCESS)"`)
   - `metadata: object` (`{ actorId, actorEmail, actorRole, sessionId, organizationId, details }`)
2. **Defined by `schema.prisma:482`**:
   - `details: String` (required)
   - `riskLevel: RiskLevel` (required enum)
   - `sourceType: SourceType` (required enum)
   - `description` and `metadata` DO NOT EXIST.
3. **Failure Mechanism**:
   Prisma validation rejects `description` and `metadata` as unknown properties and fails because required fields (`timestamp`, `details`, `riskLevel`, `sourceType`) are missing. The write is silently caught by `try ... catch` and discarded from PostgreSQL.

### Exact Minimum Reconciliation:
Update `schema.prisma` model `AuditEvent` to:
```prisma
model AuditEvent {
  id           String      @id
  projectId    String?
  initiativeId String?
  timestamp    DateTime    @default(now())
  action       String
  actor        String
  actorType    String      @default("user")
  target       String
  module       String
  details      String?
  description  String?
  metadata     Json?       @default("{}")
  riskLevel    RiskLevel?  @default(low)
  sourceType   SourceType  @default(manual)
  createdAt    DateTime    @default(now())

  project      Project?    @relation(fields: [projectId], references: [id])
  initiative   Initiative? @relation(fields: [initiativeId], references: [id])

  @@index([projectId])
  @@index([initiativeId])
  @@index([action])
  @@index([createdAt])
}
```

---

## 9. Product Persistence Reconciliation

### All In-Memory Operations to be Reconciled:
| Service Function | Current In-Memory Target | Proposed Durable Prisma Target |
|---|---|---|
| `startInitiative` | `initiatives` array in `seed-data.ts` | `prisma.initiative.update({ where: { slug }, data: { status, lastActivityAt } })` |
| `requestInitiativeHandoff` | Return draft, in-memory `auditEvents` | `prisma.auditEvent.create`, state stored in `Initiative` or new `InitiativeHandoff` |
| `selectExecutionPath` | `executionPaths` array in `seed-data.ts` | `prisma.executionPath.updateMany`, `prisma.initiative.update` |
| `updateTaskStatus` | `tasks` array in `seed-data.ts` | `prisma.task.update({ where: { id }, data: { status, updatedAt } })` |
| `createApproval` | `approvals` array in `seed-data.ts` | `prisma.approval.create({ data: { id, projectId, title, ... } })` |
| `decideApproval` | `approvals` array in `seed-data.ts` | `prisma.approval.update({ where: { id }, data: { status, updatedAt } })` |
| `createBlocker` | `blockers` array in `seed-data.ts` | `prisma.blocker.create({ data: { id, projectId, title, severity, ... } })` |
| `listProjects` / `getDashboard` | `MemoryProductReadRepository` | `PostgresProductReadRepository` querying `prisma.project`, `prisma.initiative` |

---

## 10. Conversation Subsystem Reconciliation

- **File Locations**: `backend/src/conversation/conversation.controller.ts`, `conversation.service.ts`, `conversation.dto.ts`.
- **Database Tables**: `"Conversation"` and `"ConversationMessage"` (already defined in `schema.prisma` lines 1070-1100 and created in migration `20260906000000`).
- **Authorization**: Controller uses `@UseGuards(AuthzGuard)` and derives user ID from `authService.session(cookieHeader).user.id`.
- **Why Unreachable**: Omitted from `controllers` and `providers` arrays in `backend/src/app.module.ts`.
- **Safe Mounting Requirements**:
  1. Add `ConversationController` to `AppModule.controllers`.
  2. Add `ConversationService` to `AppModule.providers`.
  3. Ensure `PrismaService` singleton is injected into `ConversationService`.
  4. Implement `test/conversation.http.test.ts` covering conversation creation, message posting, and user isolation.

---

## 11. Workflow Transaction Analysis (`workflow-runtime.store.ts`)

### Current Flaw in `storeCallback`:
```typescript
await this.prisma.$executeRaw`INSERT INTO "WorkflowCallback" ...`;
await this.prisma.$executeRaw`INSERT INTO "WorkflowCallbackIdempotency" ...`;
await this.prisma.$executeRaw`INSERT INTO "WorkflowRunState" ...`;
await this.prisma.$executeRaw`UPDATE "WorkflowRun" ...`;
```
- **Partial Commit Risk**: If Step 2 fails (e.g. duplicate idempotency key with different payload), Step 1 remains permanently committed. If Step 3 or 4 fails, callback is stored but run state is not updated.
- **Proposed Transaction Boundary**:
  Convert to Prisma query builder or wrap in interactive transaction:
  ```typescript
  await this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "WorkflowCallback" ...`;
    await tx.$executeRaw`INSERT INTO "WorkflowCallbackIdempotency" ...`;
    await tx.$executeRaw`INSERT INTO "WorkflowRunState" ...`;
    await tx.$executeRaw`UPDATE "WorkflowRun" ...`;
  });
  ```

---

## 12. Global Validation Analysis

- **Current Implementation**: Purely manual, method-by-method checks (`requiredString`, `assertSafeHandoffRequest`, `assertNoForbiddenFields`).
- **Vulnerabilities**:
  - `AdminController.createUser`: Accepts arbitrary unrecognized properties in request body.
  - `AdminController.updateUser`: Accepts arbitrary fields without schema validation.
  - `ProductController`: Ad-hoc manual loops traversing object keys.
- **Proposed Target**:
  Register global NestJS validation pipe in `main.ts`:
  ```typescript
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));
  ```

---

## 13. Target Database Rebuild Contract

```text
1. BLANK POSTGRESQL DATABASE
   ↓
2. MIGRATION 0: 20260101000000_baseline_core_schema (NEW REQUIRED)
   - Creates Enums: RiskLevel, Priority, SourceType
   - Creates initial 32 tables:
     Module, LockedModule, Initiative, EvidenceSource, ExecutionPath, Task,
     ActivityEvent, Approval, TechnicalMemo, CodeDraftWorkspace, SandboxedArtifact,
     SecurityGate, SecurityCheck, SecurityFinding, Blocker, ReleaseCandidate,
     ReleaseArtifact, ReleaseApprovalChecklistItem, RollbackPlan, RDSignal,
     InfrastructureNode, ServiceStatus, AuditEvent, RepositoryPreview,
     WorkflowPreview, KnowledgeDocument, SupportRequest, SupportArticle,
     Role, Permission, UserRole, RolePermission
   - Creates base tables: User (id, email, displayName), Project (id, slug, name, status, phase)
   ↓
3. MIGRATION 1: 20260520112500_add_rd_radar_persistence (EXISTING)
   - Creates EvidenceSourceV2, EvidenceItem, EvidenceReview, CandidateInitiative,
     PMDecision, WorkflowRunSummary, GitHubIntegrationStatus
   ↓
4. MIGRATION 2: 20260609000000_add_workflow_runtime_persistence (EXISTING)
   - Creates WorkflowRun, WorkflowCallback, WorkflowRunState, WorkflowCallbackIdempotency
   ↓
5. MIGRATION 3: 20260815190000_add_rd_radar_v1_local_llm (EXISTING)
   - Creates AiProviderConfiguration, AiModelConfiguration, RepositoryConnection,
     RDRadarAnalysisRun, ConfigurationAuditEvent
   ↓
6. MIGRATION 4: 20260829153000_add_provider_structured_output_dialect (EXISTING)
   - Adds structuredOutputDialect, structuredOutputVerifiedAt to AiProviderConfiguration
   ↓
7. MIGRATION 5: 20260906000000_add_agentic_multiuser_platform (EXISTING)
   - Alters User, Project
   - Creates Organization, OrganizationMember, UserSession, Group, GroupMember,
     ProjectMember, Conversation, ConversationMessage, AgentRun, AgentPlan,
     AgentRunEvent, AgentApproval, AgentArtifact, AgentAuditRecord
   ↓
8. MIGRATION 6: 20260907150000_reconcile_audit_event (NEW REQUIRED)
   - Adds description TEXT, metadata JSONB, makes details/riskLevel/sourceType nullable with defaults
   ↓
9. DATABASE SEED (OPTIONAL / APPROVED ONLY)
   - Seeds initial roles (Admin, PM, Technical Reviewer, Security Reviewer, Viewer)
   - Seeds initial permissions
   ↓
10. APPLICATION START WITH PRISMASERVICE SINGLETON
   - Connects to PostgreSQL, executes SELECT 1 readiness probe
   - Returns { status: "ok", db: "ready", runtimeMode: "postgres_read" }
```

---

## 14. Top 10 Blockers for Production Persistence

1. **Missing Baseline Migration**: 34 models cannot be deployed onto a clean database via `prisma migrate deploy`.
2. **Volatile Core Product Mutations**: `ProductWriteService` stores state in JavaScript memory arrays.
3. **`AuditEvent` Schema-Code Incompatibility**: Column mismatch prevents security audit persistence to PostgreSQL.
4. **Unregistered Conversation Subsystem**: `ConversationController` omitted from `AppModule`.
5. **Zero Test Coverage for Admin Subsystem**: No tests for `AdminController` or `AdminService`.
6. **Non-Transactional Raw SQL Writes**: `WorkflowRuntimeStore.storeCallback` lacks atomicity.
7. **Multiple Unpooled `new PrismaClient()` Instantiations**: 5 services bypass connection pooling.
8. **Null PrismaClient in Auth/Admin/Audit Services**: Injected `prisma` is `null` in production because no provider injects it.
9. **Dual Disconnected Audit Streams**: `AuditService` vs `ProductWriteService` audit logs are fragmented.
10. **Hardcoded Memory Read Repository**: `ProductService` hardcodes `new MemoryProductReadRepository()`.

---

## 15. Recommended Next Implementation Steps (Phase B)

1. **Step 1: Create Centralized `PrismaService`**:
   - Implement `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`.
   - Register it globally in `AppModule` and inject into `AuthService`, `AdminService`, `AuditService`, `ResourceAuthorizationService`, `ConversationService`, `RDRadarService`, and `RuntimeConfigurationService`.
2. **Step 2: Generate Baseline Migration**:
   - Create `20260101000000_baseline_core_schema` and reconcile `AuditEvent`.
3. **Step 3: Migrate Product Services to Durable Prisma Repositories**:
   - Implement `PostgresProductReadRepository` and update `ProductWriteService` to persist to PostgreSQL.
4. **Step 4: Mount and Test Conversation Subsystem**:
   - Add `ConversationController` and `ConversationService` to `AppModule`.
   - Author integration tests in `backend/test/conversation.http.test.ts`.
5. **Step 5: Author Admin Test Suite**:
   - Add comprehensive tests in `backend/test/admin.http.test.ts`.
