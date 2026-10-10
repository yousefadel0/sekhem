# SEKHEM Database Target Schema & Persistence Reconciliation Specification

**Document Version**: 1.0.0 (Phase B Persistence Reconciliation)  
**Status**: Canonical Target Schema & Migration Baseline Contract  
**Prisma Version**: 6.19.0  
**Database Engine**: PostgreSQL 15+  
**Reconciliation Scope**: 64 Prisma Models across 5 Existing Migrations and Missing Baseline Core

---

## 1. Executive Summary & Persistence Architecture

Sekhem Product Application is architected around a unified persistence tier hosted on PostgreSQL, accessed through a singleton NestJS service (`PrismaService`) extending `PrismaClient` with lifecycle hooks.

Historically, feature work introduced 5 sequential migrations:
1. `20260520112500_add_rd_radar_persistence` (R&D Radar items & candidate initiatives)
2. `20260609000000_add_workflow_runtime_persistence` (Workflow execution & idempotent callbacks)
3. `20260815190000_add_rd_radar_v1_local_llm` (R&D local model configurations)
4. `20260829153000_add_provider_structured_output_dialect` (AI provider configurations & dialect tests)
5. `20260906000000_add_agentic_multiuser_platform` (Multi-user RBAC, sessions, orgs, agent runs)

However, the core platform schema (comprising 34 models including `Project`, `Module`, `Initiative`, `Task`, `Approval`, `Blocker`, `SecurityGate`, `ReleaseCandidate`, `AuditEvent`, and core identity tables) was initially operated in in-memory mode and lacked an initial SQL migration. Migration `20260906000000` executed `ALTER TABLE "User"` and `ALTER TABLE "Project"` under the assumption that these tables had already been created.

This document establishes the canonical target schema, provides a complete 64-model audit matrix, maps all relationships and raw SQL queries, and specifies the missing baseline migration.

---

## 2. 64-Model Reconciliation Matrix

Every Prisma model defined in `backend/prisma/schema.prisma` is classified below into one of three statuses:
- **`MIGRATED`**: Table definition and all scalar columns are fully covered in existing migrations.
- **`PARTIAL`**: Table was altered or created, but lacks base creation or is missing newer columns from `schema.prisma`.
- **`MISSING`**: Table has zero SQL statements in any existing migration in `backend/prisma/migrations`.

| # | Model Name | Status | Existing Migration / Gap Analysis | Domain Domain / Area |
| :---: | :--- | :---: | :--- | :--- |
| 1 | **Project** | **PARTIAL** | Altered in `20260906000000` (`groupId`, `organizationId`). Base table missing. | Core Product Platform |
| 2 | **Module** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 3 | **LockedModule** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 4 | **Initiative** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 5 | **EvidenceSource** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 6 | **ExecutionPath** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 7 | **Task** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 8 | **ActivityEvent** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 9 | **Approval** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 10 | **TechnicalMemo** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 11 | **CodeDraftWorkspace** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 12 | **SandboxedArtifact** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 13 | **SecurityGate** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 14 | **SecurityCheck** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 15 | **SecurityFinding** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 16 | **Blocker** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 17 | **ReleaseCandidate** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 18 | **ReleaseArtifact** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 19 | **ReleaseApprovalChecklistItem** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 20 | **RollbackPlan** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 21 | **RDSignal** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 22 | **InfrastructureNode** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 23 | **ServiceStatus** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 24 | **AuditEvent** | **MISSING** | No CREATE TABLE in any migration. | Audit & Compliance |
| 25 | **RepositoryPreview** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 26 | **WorkflowPreview** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 27 | **KnowledgeDocument** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 28 | **SupportRequest** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 29 | **SupportArticle** | **MISSING** | No CREATE TABLE in any migration. | Core Product Platform |
| 30 | **User** | **PARTIAL** | Altered in `20260906000000` (6 columns). Base table missing. | Identity & RBAC |
| 31 | **Role** | **MISSING** | No CREATE TABLE in any migration. | Identity & RBAC |
| 32 | **Permission** | **MISSING** | No CREATE TABLE in any migration. | Identity & RBAC |
| 33 | **UserRole** | **MISSING** | No CREATE TABLE in any migration. | Identity & RBAC |
| 34 | **RolePermission** | **MISSING** | No CREATE TABLE in any migration. | Identity & RBAC |
| 35 | **EvidenceSourceV2** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 36 | **EvidenceItem** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 37 | **EvidenceReview** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 38 | **CandidateInitiative** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 39 | **PMDecision** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 40 | **WorkflowRunSummary** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 41 | **GitHubIntegrationStatus** | **MIGRATED** | Created in `20260520112500_add_rd_radar_persistence`. | R&D Radar |
| 42 | **WorkflowRun** | **MIGRATED** | Created in `20260609000000_add_workflow_runtime_persistence`. | Workflow Runtime |
| 43 | **WorkflowCallback** | **MIGRATED** | Created in `20260609000000_add_workflow_runtime_persistence`. | Workflow Runtime |
| 44 | **WorkflowRunState** | **MIGRATED** | Created in `20260609000000_add_workflow_runtime_persistence`. | Workflow Runtime |
| 45 | **WorkflowCallbackIdempotency** | **MIGRATED** | Created in `20260609000000_add_workflow_runtime_persistence`. | Workflow Runtime |
| 46 | **AiProviderConfiguration** | **PARTIAL** | Created in `20260829153000`. Missing `structuredOutputVerifiedAt`. | AI Gateway & Radar |
| 47 | **AiModelConfiguration** | **MIGRATED** | Created in `20260829153000_add_provider_structured_output_dialect`. | AI Gateway & Radar |
| 48 | **RepositoryConnection** | **MIGRATED** | Created in `20260829153000_add_provider_structured_output_dialect`. | AI Gateway & Radar |
| 49 | **RDRadarAnalysisRun** | **MIGRATED** | Created in `20260829153000_add_provider_structured_output_dialect`. | AI Gateway & Radar |
| 50 | **ConfigurationAuditEvent** | **MIGRATED** | Created in `20260829153000_add_provider_structured_output_dialect`. | AI Gateway & Radar |
| 51 | **Organization** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 52 | **OrganizationMember** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 53 | **UserSession** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 54 | **Group** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 55 | **GroupMember** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 56 | **ProjectMember** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Multiuser Platform |
| 57 | **Conversation** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Conversation Subsystem |
| 58 | **ConversationMessage** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Conversation Subsystem |
| 59 | **AgentRun** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |
| 60 | **AgentPlan** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |
| 61 | **AgentRunEvent** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |
| 62 | **AgentApproval** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |
| 63 | **AgentArtifact** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |
| 64 | **AgentAuditRecord** | **MIGRATED** | Created in `20260906000000_add_agentic_multiuser_platform`. | Agent Runtime |

**Summary**:
- **Fully Migrated**: 29 models
- **Partial**: 3 models (`Project`, `User`, `AiProviderConfiguration`)
- **Missing**: 32 models
- **Total Models**: 64

---

## 3. Database Types & Enums

The core schema defines 3 PostgreSQL ENUM types that must precede table creation:

```sql
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "SourceType" AS ENUM ('seed', 'manual', 'workflow', 'ai', 'backend_aggregate');
```

---

## 4. Foreign Key Topology & Dependency Graph

To ensure clean execution without circular foreign-key violations during database provisioning, tables must be created in topological order:

1. **Layer 0 (Enums & Independent Tables)**:
   - Types: `RiskLevel`, `Priority`, `SourceType`
   - Independent Tables: `InfrastructureNode`
2. **Layer 1 (Identity & Base RBAC)**:
   - `User`
   - `Role`
   - `Permission`
   - `UserRole` (depends on `User`, `Role`)
   - `RolePermission` (depends on `Role`, `Permission`)
3. **Layer 2 (Core Workspace Containers)**:
   - `Project` (references `Group`, `Organization`, but nullable foreign keys allow creation)
   - `ServiceStatus` (depends on `InfrastructureNode`)
4. **Layer 3 (Modules & Core Functional Entities)**:
   - `Module` (depends on `Project`)
   - `LockedModule` (depends on `Module`)
   - `Initiative` (depends on `Project`, `Module`)
   - `RDSignal` (depends on `Project`)
   - `RepositoryPreview` (depends on `Project`)
   - `WorkflowPreview` (depends on `Project`)
   - `KnowledgeDocument` (depends on `Project`)
   - `SupportRequest` (depends on `Project`)
   - `SupportArticle` (depends on `Project`)
5. **Layer 4 (Initiative Leaf Artifacts & Gates)**:
   - `EvidenceSource` (depends on `Initiative`)
   - `ExecutionPath` (depends on `Initiative`)
   - `Task` (depends on `Initiative`)
   - `ActivityEvent` (depends on `Initiative`)
   - `Approval` (depends on `Project`, `Initiative`)
   - `TechnicalMemo` (depends on `Initiative`)
   - `CodeDraftWorkspace` (depends on `Initiative`)
   - `SecurityGate` (depends on `Initiative`)
   - `Blocker` (depends on `Project`, `Initiative`)
   - `ReleaseCandidate` (depends on `Initiative`)
   - `AuditEvent` (depends on `Project`, `Initiative`)
6. **Layer 5 (Sub-leaf Artifacts)**:
   - `SandboxedArtifact` (depends on `CodeDraftWorkspace`)
   - `SecurityCheck` (depends on `SecurityGate`)
   - `SecurityFinding` (depends on `SecurityGate`)
   - `ReleaseArtifact` (depends on `ReleaseCandidate`)
   - `ReleaseApprovalChecklistItem` (depends on `ReleaseCandidate`)
   - `RollbackPlan` (depends on `ReleaseCandidate`)

---

## 5. Raw SQL Inventory & Verification

The codebase contains 9 raw SQL statements. All are verified compatible with this target schema:

| File | Line | Method | Query Summary | Table References | Compatibility Status |
| :--- | :---: | :---: | :--- | :--- | :--- |
| `backend/src/product.service.ts` | 53 | `$queryRaw` | `SELECT 1` | None | Compatible (Readiness probe) |
| `backend/src/workflow-runtime.store.ts` | 125 | `$executeRaw` | `INSERT INTO "WorkflowRun" ... ON CONFLICT ("id") DO UPDATE` | `WorkflowRun` | Compatible (Parameterized) |
| `backend/src/workflow-runtime.store.ts` | 146 | `$queryRaw` | `SELECT ... FROM "WorkflowRun" ORDER BY "createdAt" DESC` | `WorkflowRun` | Compatible (Parameterized) |
| `backend/src/workflow-runtime.store.ts` | 156 | `$queryRaw` | `SELECT ... FROM "WorkflowRun" WHERE "id" = ${id} LIMIT 1` | `WorkflowRun` | Compatible (Parameterized) |
| `backend/src/workflow-runtime.store.ts` | 167 | `$queryRaw` | `SELECT ... FROM "WorkflowCallback" WHERE "workflowRunId" = ${id}` | `WorkflowCallback` | Compatible (Parameterized) |
| `backend/src/workflow-runtime.store.ts` | 179 | `$queryRaw` | `SELECT ... FROM "WorkflowCallbackIdempotency" JOIN ...` | `WorkflowCallbackIdempotency`, `WorkflowCallback` | Compatible (Parameterized) |
| `backend/src/workflow-runtime.store.ts` | 202 | `$executeRaw` | `INSERT INTO "WorkflowCallback" ...` | `WorkflowCallback` | Compatible (Atomic `$transaction`) |
| `backend/src/workflow-runtime.store.ts` | 210 | `$executeRaw` | `INSERT INTO "WorkflowCallbackIdempotency" ...` | `WorkflowCallbackIdempotency` | Compatible (Atomic `$transaction`) |
| `backend/src/workflow-runtime.store.ts` | 218 | `$executeRaw` | `INSERT INTO "WorkflowRunState" ...` | `WorkflowRunState` | Compatible (Atomic `$transaction`) |
| `backend/src/workflow-runtime.store.ts` | 226 | `$executeRaw` | `UPDATE "WorkflowRun" SET "status" = ...` | `WorkflowRun` | Compatible (Atomic `$transaction`) |

---

## 6. Production Persistence Mapping

### Write Path
- **Service**: `ProductWriteService` (`backend/src/product-write.service.ts`)
- **Runtime Check**: Evaluates `isDbMode`. When `SEKHEM_RUNTIME_MODE === "postgres_read"` or `SEKHEM_AUTH_DB_MODE === "true"`, all operations execute via `PrismaService` inside atomic `prisma.$transaction(...)`.
- **Target Tables**: `Initiative`, `Task`, `Approval`, `Blocker`, `AuditEvent`.
- **Atomicity**: Either business entity mutation AND audit event commit together, or neither commits.

### Read Path
- **Service**: `ProductService` (`backend/src/product.service.ts`)
- **Repository Resolution**: Selects `PostgresProductReadRepository` (`backend/src/data-access/postgres-product-read.repository.ts`) when in `postgres_read` mode, with fail-closed Proxy if Prisma is unconfigured.
- **Domain Mappers**: `product-mappers.ts` provides strict type translation from raw Prisma entities to validated API DTOs.

### Audit Logging
- **Service**: `AuditService` (`backend/src/audit/audit.service.ts`)
- **Dual API**:
  - `recordWithClaimsTx(tx, claims, input)`: Atomically logs to `tx.auditEvent.create` inside an active business transaction.
  - `recordWithClaims(claims, input)`: Standard standalone audit event logging.
- **Sanitization**: Recursive secret scrubber redacts credentials, passwords, private keys, and session cookies.

---

## 7. Explicit Authoritative In-Memory State Boundaries

The following state intentionally resides in memory rather than PostgreSQL tables:
1. **AI Patch Drafts**: `AiPatchService` (`backend/src/ai-patch.service.ts`) manages draft life cycle via `aiPatchDrafts` in `backend/src/ai-patch-memory.ts`.
2. **Automation Contract Placeholders**: `contractActivity`, `memoRequests`, and `recordedSystemEvents` in `backend/src/contract-memory.ts`.
3. **Local Dev / In-Memory Mode**: When running with `SEKHEM_RUNTIME_MODE="memory"`, all reads and writes operate on in-memory arrays in `src/data/seed-data.ts`.

---

## 8. Migration Baseline Specification

To reconcile the 34 missing/partial models, a new baseline migration file `20260101000000_baseline_core_schema/migration.sql` is authored. It contains:
- `CREATE TYPE` for `RiskLevel`, `Priority`, `SourceType`
- `CREATE TABLE IF NOT EXISTS` for all 34 core tables
- All primary keys, foreign key constraints, unique constraints, and indexes
- Column reconciliation for `AiProviderConfiguration.structuredOutputVerifiedAt`
