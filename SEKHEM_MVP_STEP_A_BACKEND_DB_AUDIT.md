# SEKHEM — MVP DAY
## STEP A: BACKEND & DATABASE ACTIVATION AUDIT
### FORENSIC REPORT: READ-ONLY INSPECTION

- **Audit Date**: September 14, 2026
- **Workspace**: `sekhem-product-application-main`
- **Execution Mode**: STRICTLY READ-ONLY / FORENSIC INSPECTION
- **Status Classification**:
  - 🟢 **VERIFIED**: Fully implemented, backed by source code & tests.
  - 🟡 **PARTIAL**: Implemented in part or in memory, but requires wiring or activation.
  - 🔴 **MISSING**: Not present in source code or schema.
  - ⚠️ **BLOCKED**: Implementation exists but blocked by environment/database availability.
  - ❓ **UNKNOWN**: Insufficient code or data to establish fact.

---

## 1. Executive Summary

This forensic audit establishes the empirical baseline of the Sekhem production backend, database schema, authentication, authorization, agent runtime, and frontend contracts prior to MVP activation.

### Key Audit Findings:
1. **Source Code & Architecture Integrity**: The repository contains a production-grade NestJS backend (`sekhem-product-api`) and a Next.js 16 frontend (`sekhem-product-application`). All modules compile cleanly with zero TypeScript errors across both roots.
2. **Test Baseline**: 100% test pass rate.
   - **Backend**: **383 passed, 0 failed** across 62 suites (40 test files in `backend/test`).
   - **Frontend**: **12 passed, 0 failed** across 3 suites (route access, auth client, SSE lifecycle).
3. **Database Architecture**: The Prisma schema defines **62 models** and **3 enums**. All multi-user, multi-tenant, session, chat, and agent runtime persistence models were formally created in migration `20260906000000_add_agentic_multiuser_platform`.
4. **PostgreSQL Runtime Connectivity**: **UNREACHABLE (ECONNREFUSED)**.
   - In the current inspection environment, PostgreSQL is not running on `127.0.0.1:5432`.
   - No `.env` file exists in the repository root or `backend/` directory.
   - `DATABASE_URL` is unset in the process environment.
   - **Zero fake accounts were created**. Per strict instructions, account inspection stopped at database unreachability.
5. **Authentication & Authorization**: High-assurance implementation.
   - Self-describing memory-hard `scrypt:v1` password hashing with random salt and constant-time `timingSafeEqual`.
   - Decoupled HMAC-SHA256 JWT sessions; raw JWT is **never persisted** in the database (only one-way SHA-256 `tokenHash` is saved in `UserSession`).
   - Dual-tier RBAC (`Admin`, `PM`, `Technical Reviewer`, `Security Reviewer`, `Viewer`) + tenant isolation (`Organization`) + live durable DB lookups for `ProjectMember` and `GroupMember`.
   - Session revocation: Suspended users or logout immediately revokes active sessions via `User.sessionRevokedAt` and `UserSession.revokedAt`.
6. **Chat → Agent Runtime Pipeline**:
   - Transactional decoupling: `POST /api/conversations/:id/messages` creates `ConversationMessage`, updates conversation timestamp, and creates durable `AgentRun` atomically within a single Prisma transaction.
   - Execution is asynchronously scheduled via `setImmediate` **only after transaction commit**.
   - Event timeline streaming via SSE (`GET /api/agent-runs/:id/events`) using Option A keyset pagination `(timestamp, id)` and standard `Last-Event-ID` replay.
   - Durable steering and pause/resume checkpoints are implemented and DB-backed.
   - Startup recovery (`onApplicationBootstrap`) automatically scans and recovers unfinished runs.
7. **Frontend ↔ Backend Contract Gaps**: Four actionable gaps identified:
   - Gap 1: Frontend (`app/agent/page.tsx`) calls `GET /api/agent-runs` (list), but `AgentRuntimeController` only implements `GET /api/agent-runs/:id`.
   - Gap 2: `AgentRuntimeService.cancelRun` exists in service logic, but no HTTP route is registered in `AgentRuntimeController`.
   - Gap 3: `app/agent/page.tsx` calls `POST /approvals/:id/decision`, which currently routes to legacy product `Approval` rather than the `AgentApproval` model.
   - Gap 4: Frontend API client (`lib/sekhem-api.ts`) defaults to same-origin relative paths on localhost without a default Next.js proxy route to NestJS (port 3001).

---

## 2. Repository Map

```
sekhem-product-application-main/
├── app/                                # Next.js 16 App Router (Frontend)
│   ├── agent/page.tsx                  # Agent Runs, timeline SSE, approvals, steering UI
│   ├── demo/                           # Demo & Operational product views (25 subroutes)
│   │   ├── admin-settings/page.tsx     # Admin configuration UI
│   │   ├── agent-war-room/page.tsx     # Multi-agent coordination view
│   │   ├── ai-patch-assistant/page.tsx # AI Patch Draft management
│   │   ├── initiatives/                # Core Initiatives views & creation
│   │   ├── rd-radar/page.tsx           # R&D Radar signal & evidence review
│   │   └── ...                         # Other operational module views
│   ├── login/page.tsx                  # Secure authentication form
│   ├── layout.tsx                      # Root HTML layout & ThemeProvider
│   └── page.tsx                        # Root landing redirect
├── backend/                            # NestJS 10 Application (Backend API)
│   ├── prisma/
│   │   ├── migrations/                 # 6 additive migrations
│   │   │   ├── 20260101000000_baseline_core_schema/
│   │   │   ├── 20260520112500_add_rd_radar_persistence/
│   │   │   ├── 20260609000000_add_workflow_runtime_persistence/
│   │   │   ├── 20260815190000_add_rd_radar_v1_local_llm/
│   │   │   ├── 20260829153000_add_provider_structured_output_dialect/
│   │   │   └── 20260906000000_add_agentic_multiuser_platform/
│   │   ├── schema.prisma               # Authoritative Prisma Schema (62 models)
│   │   └── seed.ts                     # Database seed script
│   ├── src/
│   │   ├── admin/                      # AdminController, AdminService (Users, Orgs, Groups, Members)
│   │   ├── agent-runtime/              # AgentRuntimeModule, Controller, EventsController (SSE), Service
│   │   │   └── skills/                 # SkillRegistryService, built-in skills
│   │   ├── ai-gateway/                 # AI Gateway, LLM provider adapters (vLLM, OpenAI, llama.cpp)
│   │   ├── audit/                      # AuditService (structured security & activity logging)
│   │   ├── auth/                       # AuthController, AuthService, AuthzGuard, ResourceAuthorizationService
│   │   ├── common/                     # ApiExceptionFilter, ApiResponse envelope, decorators
│   │   ├── conversation/               # ConversationController, ConversationService (Chat + AgentRun trigger)
│   │   ├── data/                       # In-memory seed fixtures (used in test/memory mode)
│   │   ├── data-access/                # DataAccessModule, PrismaService, Product repositories
│   │   ├── rag/                        # RagController, RagService
│   │   ├── repository-source/          # Git repository connectors (Local, GitHub, GitLab)
│   │   ├── app.module.ts               # Root NestJS Module importing all controllers & providers
│   │   ├── main.ts                     # HTTP bootstrap on 127.0.0.1:3001 with ValidationPipe & RuntimeConfig
│   │   ├── product.controller.ts       # Core product endpoints (Projects, Modules, Initiatives, Approvals)
│   │   ├── product-write.service.ts    # Durable product mutation service
│   │   ├── rd-radar.controller.ts      # R&D Radar & evidence endpoints
│   │   └── runtime-config.service.ts   # Strict environment invariant enforcer
│   ├── test/                           # 40 backend test suites (383 test cases)
│   └── package.json                    # Backend dependencies (NestJS, Prisma, Express, RxJS)
├── components/                         # Reusable UI components & Sekhem panels
├── hooks/                              # Custom React hooks (e.g. useAgentRunEvents)
├── lib/                                # Frontend API, Auth, and utility libraries
│   ├── sekhem-api.ts                   # Fetch/Mutation client with credential management
│   ├── sekhem-auth.ts                  # Client authentication & session helpers
│   ├── sekhem-route-access.ts          # Frontend RBAC & operational route guard rules
│   └── sekhem-data.ts                  # Static client-side fallbacks
├── test/                               # Root test suite (12 frontend tests)
└── package.json                        # Root Next.js configuration & scripts
```

---

## 3. Database Forensic Audit

The Prisma schema (`backend/prisma/schema.prisma`) and migration history were inspected.

### 3.1 Model Inventory (62 Models, 3 Enums)

| Subsystem | Models Present | Status |
|---|---|---|
| **Tenancy & Organizations** | `Organization`, `OrganizationMember` | 🟢 VERIFIED |
| **Identity & Authentication** | `User`, `UserSession`, `Role`, `Permission`, `UserRole`, `RolePermission` | 🟢 VERIFIED |
| **Groups & Access Scopes** | `Group`, `GroupMember` | 🟢 VERIFIED |
| **Projects & Memberships** | `Project`, `ProjectMember` | 🟢 VERIFIED |
| **Conversations (Chat)** | `Conversation`, `ConversationMessage` | 🟢 VERIFIED |
| **Agent Runtime** | `AgentRun`, `AgentPlan`, `AgentRunEvent`, `AgentApproval`, `AgentArtifact`, `AgentAuditRecord` | 🟢 VERIFIED |
| **Core Product & Architecture**| `Module`, `LockedModule`, `Task`, `ExecutionPath`, `TechnicalMemo`, `CodeDraftWorkspace`, `SandboxedArtifact`, `Blocker` | 🟢 VERIFIED |
| **Security & Governance** | `SecurityGate`, `SecurityCheck`, `SecurityFinding`, `Approval`, `AuditEvent`, `ActivityEvent` | 🟢 VERIFIED |
| **Release Management** | `ReleaseCandidate`, `ReleaseArtifact`, `ReleaseApprovalChecklistItem`, `RollbackPlan` | 🟢 VERIFIED |
| **R&D Radar & Evidence** | `EvidenceSource`, `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview`, `CandidateInitiative`, `PMDecision`, `RDSignal`, `RDRadarAnalysisRun`, `WorkflowRunSummary`, `GitHubIntegrationStatus` | 🟢 VERIFIED |
| **AI Gateway & Config** | `AiProviderConfiguration`, `AiModelConfiguration`, `RepositoryConnection`, `ConfigurationAuditEvent` | 🟢 VERIFIED |
| **Workflow Automation** | `WorkflowRun`, `WorkflowCallback`, `WorkflowRunState`, `WorkflowCallbackIdempotency` | 🟢 VERIFIED |
| **Knowledge & Support** | `KnowledgeDocument`, `SupportRequest`, `SupportArticle`, `RepositoryPreview`, `WorkflowPreview`, `InfrastructureNode`, `ServiceStatus` | 🟢 VERIFIED |

### 3.2 Enums
- `enum RiskLevel { low, medium, high, critical }`
- `enum Priority { low, medium, high, critical }`
- `enum SourceType { seed, manual, workflow, ai, backend_aggregate }`

### 3.3 Core Relations & Constraints Review
- **Organization Isolation**: `Organization` has cascade relations to `OrganizationMember`. `User.organizationId` references `Organization(id)`. `Project.organizationId` references `Organization(id)`. `Group.organizationId` references `Organization(id)`.
- **User Sessions**: `UserSession` enforces unique `tokenHash` with index on `[revokedAt, expiresAt]`. Foreign key to `User(id)` with `onDelete: Cascade`.
- **Project Members**: `ProjectMember` enforces composite unique key `@@unique([projectId, userId])`.
- **Group Members**: `GroupMember` enforces composite unique key `@@unique([groupId, userId])`.
- **Conversation Hierarchy**: `Conversation` belongs to `Project(id)` and `User(id)`. `ConversationMessage` belongs to `Conversation(id)` with `onDelete: Cascade`.
- **AgentRun Integrity**: `AgentRun` references `Conversation(id)`, `Project(id)`, and `User(id)` with cascade deletes. `AgentPlan`, `AgentRunEvent`, `AgentApproval`, `AgentArtifact`, and `AgentAuditRecord` strictly link back to `AgentRun(id)` with cascade deletes.
- **Unique Constraints**:
  - `User.email` (`@unique`)
  - `Organization.slug` (`@unique`)
  - `Group.slug` (`@unique`)
  - `Project.slug` (`@unique`)
  - `Module.slug`, `Module.key` (`@unique`)
  - `Initiative.slug` (`@unique`)
  - `CandidateInitiative.candidateId` (`@unique`)
  - `EvidenceSourceV2.url` (`@unique`)

### 3.4 Findings:
- **A. Reusable Models**: All 62 models are defined and ready. No destructive migrations are needed.
- **B. MVP Concepts with Full Persistence**: Identity, Roles, Organizations, Groups, Projects, Memberships, Sessions, Audit Events, Conversations, Messages, Agent Runs, Plans, Events, Approvals, Artifacts, Evidence Items, Candidate Initiatives.
- **C. Missing Concepts**: None blocking MVP. `AgentArtifact` does not have a direct foreign key to `CandidateInitiative`, but links to `Project` and `AgentRun`, which is architecturally correct.
- **D. Partially Implemented**: Dual representation of initiatives (`Initiative` in Product core vs `CandidateInitiative` in R&D Radar) and dual representation of approvals (`Approval` in Product core vs `AgentApproval` in Agent Runtime).
- **E. Relations/Constraints Affecting MVP**:
  - `Conversation.projectId` is non-nullable. A chat conversation cannot be created without a valid `Project` record in the database.
  - `AgentRun.projectId` and `AgentRun.conversationId` are non-nullable. Agent runs must always belong to both a Project and a Conversation.

---

## 4. Real Database Connection Audit

### Runtime Inspection Results:
| Parameter / Check | Expected Production Value | Actual Current Runtime Status | Status Label |
|---|---|---|---|
| **DATABASE_URL** | Valid PostgreSQL URI | Not configured (`undefined`) | ⚠️ BLOCKED |
| **.env / backend/.env** | Environment file | File does not exist | ⚠️ BLOCKED |
| **Port 5432 Reachability** | Open TCP listener | `ECONNREFUSED` (PostgreSQL not running locally) | ⚠️ BLOCKED |
| **PrismaService Injection** | Global Singleton | Bound in `DataAccessModule` (`@Global()`) | 🟢 VERIFIED |
| **Runtime Mode (`SEKHEM_RUNTIME_MODE`)** | `postgres_read` | Defaults to `memory` when unset | 🟡 PARTIAL |
| **Database Write Mode (`SEKHEM_DB_WRITE_MODE`)** | `rd_radar_only` / configured | Defaults to `none` when unset | 🟡 PARTIAL |
| **Silent Fallback Guard** | Explicit exception in production | Enforced in `AuthService` (`NODE_ENV === 'production'` blocks fallback) | 🟢 VERIFIED |
| **Runtime Safety Asserter** | Strict invariant check | `RuntimeConfigService.assertSafe()` verified in `main.ts` | 🟢 VERIFIED |

### Analysis of Storage Fallback:
- When `SEKHEM_RUNTIME_MODE` is `"memory"` (the default when no env is passed), `ProductService` uses `MemoryProductReadRepository`, `ProductWriteService` writes to memory arrays, and `AuthService` allows staging env-var login **only** if `NODE_ENV !== "production"`.
- In `AgentRuntimeService` and `AdminService`, if `prisma` is null or database is unavailable, operations fail fast with `ServiceUnavailableException("Database service is unavailable in this environment")` or `NotFoundException`. They **do not** silently fall back to memory.

---

## 5. Existing Account Inventory

Per Section 4 of the instructions:
> *"If the database is NOT reachable: STOP database inspection at that point and clearly report: exact reason, whether configuration exists, what is missing, what command/environment requirement is needed, whether anything was changed. Do NOT fabricate accounts or database state."*

### Database Unreachability Report:
1. **Exact Reason**: TCP connection attempt to `127.0.0.1:5432` failed with `ECONNREFUSED`. No PostgreSQL service is active on the local machine.
2. **Configuration Status**: Neither `backend/.env` nor `.env` exists in the filesystem. `process.env.DATABASE_URL` is undefined.
3. **What is Missing**:
   - Running PostgreSQL 15+ database instance.
   - `DATABASE_URL` connection string in `backend/.env`.
   - `SEKHEM_AUTH_SESSION_SECRET` (at least 32 characters).
   - Applied schema migrations (`prisma db push` or `prisma migrate deploy`).
4. **Environment Requirement**:
   ```bash
   # Required environment variables in backend/.env:
   DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>?schema=public"
   SEKHEM_RUNTIME_MODE="postgres_read"
   SEKHEM_DATA_SOURCE="postgres_read"
   SEKHEM_AUTH_DB_MODE="true"
   SEKHEM_AUTH_SESSION_SECRET="<minimum-32-character-cryptographic-random-secret>"
   SEKHEM_CORS_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
   ```
5. **State Changes**: **None**. Database state was not mutated, no fake data was seeded, and no accounts were fabricated.

---

## 6. Authentication Audit

**Source Verification**: `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/authz.guard.ts`.

### 6.1 Authentication Lifecycle

```text
1. Client POST /api/auth/login with { email, password }
   ↓
2. AuthController.login() captures IP and User-Agent
   ↓
3. AuthService.login() validates inputs:
   - Checks non-empty email and password strings
   ↓
4. DB Mode Branch:
   - Queries prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { roles: { include: { role: true } } } })
   - Rejects if user not found (401 "Invalid credentials")
   - Rejects if user.status !== "active" (401 "Account is suspended or deactivated")
   - Rejects if user.passwordHash is null (401 "Invalid credentials")
   ↓
5. Scrypt Verification:
   - AuthService.verifyScryptPassword(password, user.passwordHash)
   - Parses "scrypt:v1:N=16384:r=8:p=1:<salt>:<hash>"
   - Computes derived key using scrypt with constant memory parameters
   - Performs constant-time timingSafeEqual comparison
   ↓
6. Session & JWT Minting:
   - Generates randomUUID() for sessionId
   - Sets expiresAt = now + 28800 (8 hours)
   - Signs HMAC-SHA256 JWT containing { sub, sessionId, email, displayName, role, organizationId, iat, exp }
   ↓
7. Durable Session Persistence:
   - Computes one-way sha256(rawJwt) -> tokenHash
   - Creates UserSession record in DB: { id: sessionId, userId, tokenHash, ipAddress, userAgent, expiresAt }
   - Raw JWT is never written to disk or database
   ↓
8. Cookie Response:
   - Sets Set-Cookie: sekhem_session=<rawJwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800
   - Returns { authenticated: true, user: { id, email, displayName, role, organizationId, sessionId }, expiresAt }
```

### 6.2 Session Validation & Revocation
- **Durable Validation (`AuthService.validateDurableSession`)**:
  1. Decodes and verifies HMAC-SHA256 signature against `SEKHEM_AUTH_SESSION_SECRET`.
  2. Confirms token expiration (`exp > now`).
  3. Queries PostgreSQL `User` record to ensure `status === "active"`.
  4. Checks `User.sessionRevokedAt`: if token was issued before revocation timestamp, throws `401 Unauthorized`.
  5. Hashes incoming token (`sha256`) and looks up `UserSession`: if `revokedAt` is populated or `expiresAt` has passed, throws `401 Unauthorized`.
- **Logout (`POST /api/auth/logout`)**:
  - Locates `UserSession` by `tokenHash` and sets `revokedAt = new Date()`.
  - Sets response cookie `sekhem_session=` with `Max-Age=0`.

---

## 7. Authorization & Tenancy Model

**Source Verification**: `backend/src/auth/resource-authz.service.ts`, `backend/src/auth/authz.guard.ts`.

### 7.1 Role Hierarchy & Capabilities

| System Role | Capabilities | System Scope | Project Scope |
|---|---|---|---|
| **Admin** | Full organization control, user provisioning, role assignment, configuration | Organization-wide | All projects in Org |
| **PM** | Project management, start initiatives, steer agents, cancel runs, review approvals | Organization / Assigned Projects | Full Project Control |
| **Technical Reviewer**| Technical reviews, code review, steering, technical approvals | Assigned Projects | Reviewer / Approver |
| **Security Reviewer** | Security reviews, gate compliance approvals | Assigned Projects | Security Gate Reviewer |
| **Viewer** | Read-only inspection of permitted project data | Assigned Projects | Read-only |

### 7.2 Safety Invariant Gates
1. **Absolute Organization Boundary**: In `ResourceAuthorizationService.authorize()`, if both subject and resource have an `organizationId`, they must match. Cross-tenant access is blocked even for Admins.
2. **Admin Safety Gate**: Even an Admin cannot execute dangerous operations (`isDangerousOperation === true` or `requiresApproval === true`) directly. Approvals must go through formal review records.
3. **User Privacy Boundary**: Resources marked `visibility === "PRIVATE"` can only be accessed or mutated by their creator/owner.
4. **Project Isolation**: Non-admin users cannot read or mutate project resources unless a corresponding `ProjectMember` record exists in PostgreSQL.

---

## 8. MVP Admin Capability Matrix

| Admin Capability | Status | Implementation File / Endpoint / Method | Notes |
|---|---|---|---|
| **View Users / Accounts** | 🟢 VERIFIED | `AdminController.listUsers` (`GET /api/admin/users`) | Filterable by `organizationId`; masks password hashes |
| **Provision Users** | 🟢 VERIFIED | `AdminController.createUser` (`POST /api/admin/users`) | Hashes password with `scrypt:v1`, creates `User` & `UserRole`, emits audit event |
| **Activate / Deactivate Users** | 🟢 VERIFIED | `AdminController.updateUser` (`PATCH /api/admin/users/:id`) | Setting `status="suspended"` immediately revokes all active sessions |
| **Assign Roles** | 🟢 VERIFIED | `AdminService.createUser`, `updateUser` | Associates role in `UserRole` table |
| **Assign Organization** | 🟢 VERIFIED | `AdminService.createUser`, `updateUser` | Sets `organizationId` foreign key |
| **Manage Group Membership** | 🟢 VERIFIED | `AdminController.addGroupMember`, `removeGroupMember` | Mutates `GroupMember` table with audit logging |
| **Manage Project Membership**| 🟢 VERIFIED | `AdminController.addProjectMember`, `removeProjectMember` | Mutates `ProjectMember` table with audit logging |
| **Inspect AgentRuns** | 🟡 PARTIAL | `AgentRuntimeController.getAgentRun` (`GET /api/agent-runs/:id`) | Detail view exists; `GET /api/agent-runs` list route missing |
| **Inspect Activity / Audit** | 🟢 VERIFIED | `ProductController.listAuditEvents` (`GET /api/audit-events`) | Filtered by project / list query |
| **Inspect Governance / Approvals**| 🟢 VERIFIED| `ProductController.listApprovals` (`GET /api/approvals`) | Full approval list & decision inspection |
| **Inspect Artifacts** | 🟢 VERIFIED | `AiPatchController.listArtifacts`, `AgentArtifact` model | Read and detail endpoints active |
| **Inspect R&D / Evidence** | 🟢 VERIFIED | `RDRadarController.evidence`, `candidates`, `pmDecisions` | Multi-view R&D radar endpoints |

---

## 9. User Capability Matrix

| User Capability | Status | Implementation File / Endpoint / Method | Notes |
|---|---|---|---|
| **Login using Provisioned Account**| 🟢 VERIFIED | `AuthController.login` (`POST /api/auth/login`) | Scrypt authentication against `User` table |
| **Access Permitted Scope Only** | 🟢 VERIFIED | `AuthzGuard`, `ResourceAuthorizationService` | Enforces project/group membership checks |
| **Use Chat** | 🟢 VERIFIED | `ConversationController` (`GET/POST /api/conversations`) | Durable message persistence in `ConversationMessage` |
| **Create AgentRun via Chat** | 🟢 VERIFIED | `ConversationService.postMessage` (`triggerAgent: true`) | Transactional creation & background scheduling |
| **Inspect Own / Permitted Runs** | 🟢 VERIFIED | `AgentRuntimeController.getAgentRun` (`GET /api/agent-runs/:id`) | Enforces project membership read check |
| **Pause AgentRun** | 🟢 VERIFIED | `AgentRuntimeController.pauseRun` (`POST /api/agent-runs/:id/pause`)| Transactional state change to `PAUSED` |
| **Resume AgentRun** | 🟢 VERIFIED | `AgentRuntimeController.resumeRun` (`POST /api/agent-runs/:id/resume`)| Transactional state change to `RUNNING` |
| **Cancel AgentRun** | 🟡 PARTIAL | `AgentRuntimeService.cancelRun` | Service logic verified; HTTP route missing in controller |
| **Steer AgentRun** | 🟢 VERIFIED | `AgentRuntimeController.steerRun` (`POST /api/agent-runs/:id/steer`)| Appends `STEERING_SUBMITTED` event for next checkpoint |
| **Receive Realtime Events** | 🟢 VERIFIED | `AgentRuntimeEventsController.streamEvents` (SSE) | SSE stream with `Last-Event-ID` keyset replay |
| **Inspect Artifacts & Evidence** | 🟢 VERIFIED | `GET /api/agent-runs/:id` | Returns populated artifacts and pending approvals |
| **Use Built-in Skills** | 🟢 VERIFIED | `SkillRegistryService` (`backend/src/agent-runtime/skills`) | Code draft, repo read, test runner, security check |

---

## 10. Chat → Agent Runtime Verification

The end-to-end pipeline was audited across `ConversationController`, `ConversationService`, and `AgentRuntimeService`:

```
User Prompt in Chat
   ↓
POST /api/conversations/:id/messages { content: "...", triggerAgent: true }
   ↓
ConversationService.postMessage()
   - Verifies user ownership and organization boundary
   - Begins Prisma Transaction ($transaction):
       1. Creates ConversationMessage record
       2. Updates Conversation.updatedAt
       3. Calls AgentRuntimeService.createRunTx(tx):
          - Validates Project membership
          - Creates AgentRun record (status: "QUEUED", progressPercent: 0)
          - Generates initial plan via createInitialPlan()
          - Creates AgentPlan record (version: 1, status: "PLANNING")
          - Creates initial AgentRunEvent (eventType: "RUN_STARTED")
   - Transaction Commits Atomically to PostgreSQL
   ↓
HTTP Response Returned Immediately:
   { data: { message: {...}, agentRun: { id, title, status: "QUEUED", ... } } }
   (Socket closed, client is not blocked)
   ↓
Asynchronous Execution Begins:
   setImmediate(() => agentRuntimeService.executeRun(runId, ...))
   ↓
Step Execution Loop:
   - Updates AgentRun.status to "RUNNING"
   - Emits and persists AgentRunEvent records (stepIndex, eventType, payload)
   - Checks and consumes durable steering via consumePendingSteering()
   - Executes built-in skills via SkillRegistryService
   - Persists artifacts via AgentArtifact table
   - Checks for mandatory approval gates (transitions to "WAITING_APPROVAL" if required)
   - On completion: updates status to "COMPLETED", progressPercent: 100
   ↓
Realtime Streaming (SSE):
   GET /api/agent-runs/:id/events (Headers: Last-Event-ID)
   - Authenticated via session cookie
   - Polls PostgreSQL agentRunEvent using keyset pagination:
     ORDER BY timestamp ASC, id ASC WHERE (timestamp, id) > cursor
   - Emits MessageEvent to browser SSE listener
```

### Invariant Checks:
- **Chat does not own Agent lifetime**: Verified. Chat HTTP request returns in milliseconds. Execution occurs independently.
- **Durable Persistence**: All state transitions (`QUEUED`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`) are committed to PostgreSQL.
- **Crash Recovery**: `AgentRuntimeService.onApplicationBootstrap()` queries runs with status `["QUEUED", "PLANNING", "RUNNING"]` on startup and re-enqueues them automatically.

---

## 11. R&D / Evidence Status

- **Models**: `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview`, `CandidateInitiative`, `PMDecision`, `RDRadarAnalysisRun`.
- **Lifecycle Support**:
  1. Trigger Analysis: `POST /api/rd-radar/analysis-runs` (initiates local LLM analysis).
  2. Collect Evidence: `POST /api/rd-radar/evidence/collect-preview` and `POST /api/rd-radar/real-input-preview`.
  3. Review Evidence: `POST /api/rd-radar/evidence-reviews` (Technical/Security Reviewer marks items as approved).
  4. Candidate Creation: `POST /api/rd-radar/candidates` creates `CandidateInitiative` records.
  5. PM Decision Gate: `POST /api/rd-radar/pm-decisions` records formal human decisions (`APPROVED`, `REJECTED`, `NOT_NOW`) with conditions and rationale.
- **Provider Adapters**: Verified adapters for `vllm_openai_compatible`, `llama.cpp`, and OpenAI dry-run transports.

---

## 12. Initiatives Status

- **Core Model**: `Initiative` (Prisma model with project link, risk level, execution paths, tasks, blockers, and audit events).
- **Existing Endpoints in `ProductController`**:
  - `GET /api/initiatives`: Lists initiatives with pagination and filtering.
  - `GET /api/initiatives/:slug`: Returns detailed initiative data with module link.
  - `POST /api/initiatives/:slug/start`: Transitions initiative to `in_progress` with audit event.
  - `POST /api/initiatives/:initiativeId/handoff`: Requests draft-only handoff.
  - `POST /api/initiatives/:slug/execution-paths/:pathId/select`: Selects approved path.
  - `GET /api/initiatives/:slug/tasks`: Returns tasks grouped by status lanes.
  - `PATCH /api/tasks/:id/status`: Updates individual task status.
- **Status for MVP**: 🟢 VERIFIED. Both read and write paths are implemented with PostgreSQL persistence when in `postgres_read` mode.

---

## 13. Complete API Inventory

| Subsystem | Method | Route | Required Roles | Persistence | MVP Status |
|---|---|---|---|---|---|
| **AUTH** | `POST` | `/api/auth/login` | Public | `User`, `UserSession` | 🟢 Usable |
| **AUTH** | `GET` | `/api/auth/session` | Authenticated | `UserSession` (Durable) | 🟢 Usable |
| **AUTH** | `POST` | `/api/auth/logout` | Authenticated | `UserSession.revokedAt` | 🟢 Usable |
| **ADMIN** | `GET` | `/api/admin/organizations` | `Admin` | `Organization` | 🟢 Usable |
| **ADMIN** | `POST` | `/api/admin/organizations` | `Admin` | `Organization`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `GET` | `/api/admin/users` | `Admin` | `User`, `UserRole` | 🟢 Usable |
| **ADMIN** | `POST` | `/api/admin/users` | `Admin` | `User`, `UserRole`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `PATCH`| `/api/admin/users/:id` | `Admin` | `User`, `UserSession` revoke | 🟢 Usable |
| **ADMIN** | `GET` | `/api/admin/groups` | `Admin` | `Group`, `GroupMember` | 🟢 Usable |
| **ADMIN** | `POST` | `/api/admin/groups` | `Admin` | `Group`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `POST` | `/api/admin/groups/:id/members` | `Admin` | `GroupMember`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `DELETE`| `/api/admin/groups/:id/members/:userId` | `Admin` | `GroupMember`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `GET` | `/api/admin/projects/:projectId/members` | `Admin` | `ProjectMember` | 🟢 Usable |
| **ADMIN** | `POST` | `/api/admin/projects/:projectId/members` | `Admin` | `ProjectMember`, `AuditEvent` | 🟢 Usable |
| **ADMIN** | `DELETE`| `/api/admin/projects/:projectId/members/:userId` | `Admin` | `ProjectMember`, `AuditEvent` | 🟢 Usable |
| **CHAT** | `POST` | `/api/conversations` | All Authenticated | `Conversation` | 🟢 Usable |
| **CHAT** | `GET` | `/api/conversations` | All Authenticated | `Conversation` | 🟢 Usable |
| **CHAT** | `GET` | `/api/conversations/:id` | Conversation Owner | `Conversation`, `ConversationMessage`, `AgentRun` | 🟢 Usable |
| **CHAT** | `POST` | `/api/conversations/:id/messages` | Conversation Owner | `ConversationMessage`, `AgentRun`, `AgentPlan` | 🟢 Usable |
| **AGENT** | `POST` | `/api/agent-runs` | `Admin`, `PM`, `Technical Reviewer` | `AgentRun`, `AgentPlan`, `AgentRunEvent` | 🟢 Usable |
| **AGENT** | `GET` | `/api/agent-runs/:id` | Project Member / Admin | `AgentRun`, `AgentPlan`, `AgentApproval` | 🟢 Usable |
| **AGENT** | `GET` | `/api/agent-runs` *(List)* | Project Member / Admin | Missing in controller | 🔴 Missing |
| **AGENT** | `POST` | `/api/agent-runs/:id/pause` | Run Initiator / PM / Admin | `AgentRun`, `AgentRunEvent` | 🟢 Usable |
| **AGENT** | `POST` | `/api/agent-runs/:id/resume`| Run Initiator / PM / Admin | `AgentRun`, `AgentRunEvent` | 🟢 Usable |
| **AGENT** | `POST` | `/api/agent-runs/:id/cancel`| Run Initiator / PM / Admin | In Service, not in Controller | 🟡 Partial |
| **AGENT** | `POST` | `/api/agent-runs/:id/steer` | Run Initiator / PM / Tech Reviewer | `AgentRunEvent`, `AgentPlan` | 🟢 Usable |
| **AGENT SSE**| `GET` | `/api/agent-runs/:id/events` | Project Member / Admin | `AgentRunEvent` keyset stream | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/health` | Public | None | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/health/db-readiness`| Public | `SELECT 1` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/projects` | All Authenticated | `Project` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/projects/:id/dashboard` | All Authenticated | `Project`, `Module`, `Initiative` aggregate | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/modules` | All Authenticated | `Module` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/modules/:slug` | All Authenticated | `Module`, `LockedModule` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/initiatives` | All Authenticated | `Initiative` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/initiatives/:slug` | All Authenticated | `Initiative` | 🟢 Usable |
| **PRODUCT** | `POST` | `/api/initiatives/:slug/start` | `Admin`, `PM` | `Initiative`, `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `POST` | `/api/initiatives/:initiativeId/handoff` | `Admin`, `PM` | `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `POST` | `/api/initiatives/:slug/execution-paths/:pathId/select` | `Admin`, `PM` | `Initiative`, `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/initiatives/:slug/tasks` | All Authenticated | `Task` | 🟢 Usable |
| **PRODUCT** | `PATCH`| `/api/tasks/:id/status` | `Admin`, `PM` | `Task`, `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/approvals` | All Authenticated | `Approval` | 🟢 Usable |
| **PRODUCT** | `POST` | `/api/approvals` | `Admin`, `PM`, Reviewers | `Approval`, `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `POST` | `/api/approvals/:id/decision`| `Admin`, `PM` | `Approval`, `AuditEvent` | 🟢 Usable |
| **PRODUCT** | `GET` | `/api/audit-events` | `Admin`, `PM` | `AuditEvent` | 🟢 Usable |
| **R&D RADAR**| `POST`| `/api/rd-radar/analysis-runs` | `Admin`, `PM` | `RDRadarAnalysisRun` | 🟢 Usable |
| **R&D RADAR**| `GET` | `/api/rd-radar/analysis-runs` | All Authenticated | `RDRadarAnalysisRun` | 🟢 Usable |
| **R&D RADAR**| `GET` | `/api/rd-radar/evidence` | All Authenticated | `EvidenceSourceV2`, `EvidenceItem` | 🟢 Usable |
| **R&D RADAR**| `POST`| `/api/rd-radar/candidates` | `Admin`, `PM` | `CandidateInitiative` | 🟢 Usable |
| **R&D RADAR**| `GET` | `/api/rd-radar/candidates` | All Authenticated | `CandidateInitiative` | 🟢 Usable |
| **R&D RADAR**| `POST`| `/api/rd-radar/pm-decisions` | `Admin`, `PM` | `PMDecision` | 🟢 Usable |
| **AI GATEWAY**| `GET` | `/api/ai-gateway/providers` | `Admin`, `PM` | `AiProviderConfiguration` | 🟢 Usable |
| **AI GATEWAY**| `POST`| `/api/ai-gateway/providers` | `Admin` | `AiProviderConfiguration` | 🟢 Usable |
| **AI GATEWAY**| `GET` | `/api/ai-gateway/models` | `Admin`, `PM` | `AiModelConfiguration` | 🟢 Usable |
| **AI PATCH** | `POST` | `/api/ai-patch/drafts` | `Admin`, `PM`, Tech Reviewer | In-memory draft / Artifacts | 🟡 Partial |

---

## 14. Frontend ↔ Backend Contract Gaps

1. **Gap 1: Missing `GET /api/agent-runs` List Endpoint**:
   - In `app/agent/page.tsx` (line 17), the UI executes `fetchSekhemApi<AgentRunSummaryDto[]>('/agent-runs')`.
   - `AgentRuntimeController` only defines `@Get(':id')`.
   - **Resolution Required**: Add `@Get()` to `AgentRuntimeController` returning runs scoped to the user's projects.
2. **Gap 2: Missing Cancel Route on `AgentRuntimeController`**:
   - `AgentRuntimeService.cancelRun(runId, claims, dto)` is fully implemented and tested.
   - `AgentRuntimeController` exposes `/pause`, `/resume`, `/steer`, but omitted `@Post(':id/cancel')`.
   - **Resolution Required**: Expose `@Post(':id/cancel')` in `AgentRuntimeController`.
3. **Gap 3: Dual Approvals API Discrepancy**:
   - `app/agent/page.tsx` handles agent approvals via `POST /approvals/:id/decision`.
   - In the backend, `/api/approvals/:id/decision` is in `ProductController` and updates the legacy `Approval` table, while the Agent Runtime creates `AgentApproval` records.
   - **Resolution Required**: Provide a dedicated route `@Post(':id/approvals/:approvalId/decision')` in `AgentRuntimeController` or route the decision based on approval model ID.
4. **Gap 4: API Base URL & Port Routing**:
   - In `lib/sekhem-api.ts`, when running on localhost without `NEXT_PUBLIC_SEKHEM_API_BASE_URL`, it returns `""` (same origin).
   - If the Next.js dev server runs on port 3000 and the NestJS backend runs on port 3001, requests to `/api/...` on port 3000 will 404 unless a rewrite rule in `next.config.mjs` proxies `/api/:path*` to `http://127.0.0.1:3001/api/:path*` or `NEXT_PUBLIC_SEKHEM_API_BASE_URL="http://127.0.0.1:3001"` is configured.

---

## 15. Test Baseline

### Verification Executed:
1. **Backend TypeScript Typecheck**:
   - Command: `cmd /c "pnpm --prefix backend typecheck"` (`tsc -p tsconfig.json --noEmit`)
   - **Result**: **0 errors (Exit code 0)**.
2. **Frontend TypeScript Typecheck**:
   - Command: `cmd /c "pnpm typecheck"` (`tsc -p tsconfig.json --noEmit`)
   - **Result**: **0 errors (Exit code 0)**.
3. **Frontend Test Suite**:
   - Command: `cmd /c "pnpm test"` (`node --import tsx --test test/*.test.ts`)
   - **Result**: **12 passed, 0 failed, 3 suites (Exit code 0)**.
4. **Backend Test Suite**:
   - Command: `cmd /c "pnpm --prefix backend test"` (`tsx --test --test-concurrency=1 test/*.test.ts`)
   - **Result**: **383 passed, 0 failed, 62 suites (Exit code 0, duration: 42.78s)**.

---

## 16. Git State & Change Safety

- **Git Status**: The directory is **not a git repository** (`fatal: not a git repository`). It appears to be an unversioned working tree extracted from an archive.
- **Source Modifications**: **Zero source files were modified**.
- **Created Files**:
  - Scratch script `extract_endpoints.js` in `<appDataDir>/brain/<conversation-id>/scratch/` (temporary utility).
  - This audit document: `SEKHEM_MVP_STEP_A_BACKEND_DB_AUDIT.md`.
- **User Work Preservation**: All existing user files, code, tests, and documentation remain completely untouched.

---

## 17. Blocking Issues

| # | Blocking Issue | Severity | Impact | Resolution Required |
|---|---|---|---|---|
| **B1** | PostgreSQL not running (`ECONNREFUSED`) | ⚠️ CRITICAL | Blocks DB connection & multi-user persistence | Start PostgreSQL service on `127.0.0.1:5432` or provide remote connection URI |
| **B2** | Missing `backend/.env` configuration | ⚠️ CRITICAL | Backend cannot connect to DB or verify JWT secret | Populate `backend/.env` with `DATABASE_URL` and `SEKHEM_AUTH_SESSION_SECRET` |
| **B3** | Unapplied migrations on target database | ⚠️ HIGH | Database tables not yet created in PostgreSQL | Run `prisma db push` or `prisma migrate deploy` |
| **B4** | Zero accounts in database | ⚠️ HIGH | Cannot log in until initial Admin is provisioned | Execute provisioning script to seed the initial root Admin user |

---

## 18. MVP Readiness Matrix

| Area | Status | Readiness Assessment |
|---|---|---|
| **Database Schema** | 🟢 VERIFIED | All 62 models are fully defined; latest migration includes multi-user & agent runtime |
| **Authentication Core** | 🟢 VERIFIED | Scrypt hashing, decoupled HMAC-SHA256 JWT, SHA-256 session token hashing |
| **Authorization & RBAC** | 🟢 VERIFIED | Tenancy boundaries, live durable project/group membership checks |
| **Admin Control Plane** | 🟢 VERIFIED | User provisioning, role assignment, org management, member management fully coded |
| **User Control Plane** | 🟢 VERIFIED | Chat, message posting, project scoping, event streaming fully coded |
| **Agent Runtime** | 🟢 VERIFIED | Asynchronous execution, plans, events, artifacts, steering, startup recovery |
| **SSE Realtime Streaming** | 🟢 VERIFIED | Keyset pagination with `Last-Event-ID` total ordering recovery |
| **R&D / Evidence Subsystem** | 🟢 VERIFIED | Evidence items, analysis runs, PM decisions, dialect adapters |
| **PostgreSQL Runtime** | ⚠️ BLOCKED | PostgreSQL instance offline / unconfigured in current local shell |
| **Initial Admin Account** | ⚠️ BLOCKED | Blocked pending PostgreSQL activation & provisioning |
| **Frontend Wiring Gaps** | 🟡 PARTIAL | 4 identified contract gaps (`GET /agent-runs`, cancel route, approval endpoint, proxy) |

---

## 19. Exact Recommended Next Step

### Step B: Database & Environment Activation
1. **Provide / Start PostgreSQL**: Ensure PostgreSQL 15+ is running and reachable on port 5432 (or configure a remote PostgreSQL URL).
2. **Create `backend/.env`**:
   Configure `DATABASE_URL`, `SEKHEM_RUNTIME_MODE="postgres_read"`, `SEKHEM_DATA_SOURCE="postgres_read"`, `SEKHEM_AUTH_DB_MODE="true"`, and a strong `SEKHEM_AUTH_SESSION_SECRET`.
3. **Deploy Schema**: Run `pnpm --prefix backend prisma:generate` and `pnpm --prefix backend db:push` (or `migrate deploy`) to apply the 6 additive migrations without dropping tables.
4. **Provision Initial Root Admin User**: Run a read-only check to verify the database connection, then execute an admin provisioning script to create the initial root `Admin` account with `scrypt:v1` password hashing.
5. **Wire the 4 Contract Gaps**:
   - Add `GET /api/agent-runs` list route in `AgentRuntimeController`.
   - Add `POST /api/agent-runs/:id/cancel` route in `AgentRuntimeController`.
   - Connect Agent Approval decision handler.
   - Configure Next.js rewrite proxy or API base URL in frontend.

---
*End of Forensic Report. Antigravity is halted in read-only mode awaiting user approval.*
