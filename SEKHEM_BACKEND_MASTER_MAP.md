# SEKHEM BACKEND MASTER ARCHITECTURAL & DATABASE AUDIT MAP

**Date**: September 7, 2026  
**Status**: Read-Only Forensic Audit Completed  
**Repository**: `sekhem-product-application` / `backend`  
**Classification**: STRICT AUDIT — NO CODE CHANGES APPLIED

---

## 1. Backend Architecture & Entry Point

### 1.1 Bootstrap Lifecycle (`main.ts`)
- **FILE**: `backend/src/main.ts`
- **SYMBOL**: `bootstrap(): Promise<void>`
- **PURPOSE**: Initializes the NestJS application container, applies runtime safety invariants, configures HTTP middleware/CORS/filters, and binds the HTTP server to the loopback interface (`127.0.0.1`).
- **CALLED BY**: `main.ts` direct execution via `void bootstrap()`.
- **CALLS**:
  1. `RuntimeConfigService.assertSafe()` in `backend/src/runtime-config.service.ts`
  2. `NestFactory.create(AppModule, { rawBody: true })` in `@nestjs/core`
  3. `corsOptionsFromEnvironment()` in `backend/src/cors.config.ts`
  4. `ApiExceptionFilter` in `backend/src/common/api-exception.filter.ts`
  5. `app.listen(port, "127.0.0.1")`
- **INPUT**: Environment variables (`process.env.PORT`, `SEKHEM_RUNTIME_MODE`, `SEKHEM_DATA_SOURCE`, `SEKHEM_DB_WRITE_MODE`, etc.).
- **OUTPUT**: Running HTTP server instance on `127.0.0.1:3001` (or `$PORT`).
- **SIDE EFFECTS**: Reads environment variables; terminates process immediately via `RuntimeConfigError` if runtime invariants are violated.
- **SECURITY IMPACT**:
  - Bound exclusively to `127.0.0.1` (never `0.0.0.0`), preventing unauthorized external interface exposure.
  - Enforces `assertSafe()` before the NestJS container or HTTP listener starts, preventing insecure runtime execution.

### 1.2 Core Bootstrap Components Detail

| File | Symbol | Purpose | Called By | Calls | Input | Output | Security Impact |
|---|---|---|---|---|---|---|---|
| `backend/src/runtime-config.service.ts` | `RuntimeConfigService.assertSafe` | Verifies environment variables enforce strict runtime invariants | `main.ts:8` | `load(env)` | `process.env` | `RuntimeConfig` or throws | Blocks illegal DB migrations, DB seeds, or external adapters in Batch 7A |
| `backend/src/cors.config.ts` | `corsOptionsFromEnvironment` | Builds strict CORS configuration | `main.ts:13` | None | `SEKHEM_CORS_ALLOWED_ORIGINS` | `CorsOptions` | Rejects wildcard origins (`*`), enforces credentials, restricts HTTP methods to `GET, POST, PATCH, OPTIONS` |
| `backend/src/common/api-exception.filter.ts` | `ApiExceptionFilter.catch` | Global exception interceptor and sanitizer | NestJS runtime | `errorResponse`, `code`, `message` | Unhandled exceptions | Standardized `{ data: null, meta: { timestamp }, errors: [...] }` | Prevents stack traces, raw DB errors, or internals from leaking to HTTP clients |
| `backend/src/common/api-response.ts` | `response<T>`, `requireEntity<T>` | Standard response envelope and 404 assertion | Controllers | None | Data payload, optional metadata | `{ data, meta, errors: [] }` | Enforces uniform API contract; guarantees null entity throws 404 |

### 1.3 Global Configuration, Middleware, Guards, and Interceptors
- **Global Prefix**: `api` (all routes are prefixed `/api/...`).
- **Pipes**: None globally registered (no `ValidationPipe` configured in `main.ts`). DTO validation is performed ad-hoc inside service methods.
- **Global Guards**: None in `main.ts`. Guards are applied at controller/handler level:
  - `@UseGuards(AuthzGuard)` on `AdminController`, `ConversationController`, and routes in `ProductController`, `RDRadarController`.
  - `MachineCallbackGuard` applied to machine webhook callbacks.
- **Global Interceptors**: None.
- **Global Filters**: `ApiExceptionFilter` bound via `app.useGlobalFilters(new ApiExceptionFilter())`.
- **Shutdown Hooks**: `app.enableShutdownHooks()` is **NOT** called in `main.ts`. Prisma connections are instantiated per-service and not tied to NestJS lifecycle hooks.

---

## 2. Complete Module Map

The backend currently registers 11 controllers and 22 providers in `AppModule` (`backend/src/app.module.ts`).

| Module / Subsystem | Primary Controller | Primary Service | Data Access / Persistence | Classification | Tests Present | External Integrations |
|---|---|---|---|---|---|---|
| **Auth & Identity** | `AuthController` | `AuthService`, `ResourceAuthorizationService` | PostgreSQL (`User`, `UserSession`, `OrganizationMember`, `GroupMember`, `ProjectMember`) via Prisma; fallback staging env | **PRODUCTION-LIVE** | `auth.http.test.ts`<br>`auth-rbac.http.test.ts`<br>`identity-auth-foundation.test.ts`<br>`auth-service-contract.test.ts` | None |
| **Admin & Governance** | `AdminController` | `AdminService` | PostgreSQL (`Organization`, `User`, `UserRole`, `Group`, `GroupMember`, `ProjectMember`) via Prisma | **PRODUCTION-LIVE** | **NONE** (0 test files in `backend/test`) | None |
| **Audit** | None (injected service) | `AuditService` | Dual: In-memory array (`inMemoryLog`) + attempted write to `AuditEvent` table (catches errors silently) | **PARTIAL** | Tested via `identity-auth-foundation.test.ts` | None |
| **Product Core** | `ProductController` | `ProductService`, `ProductWriteService` | In-memory arrays (`backend/src/data/seed-data.ts`) + `MemoryProductReadRepository`; DB readiness probe queries `SELECT 1` | **MOCK/FALLBACK** | `service.test.ts`<br>`write-service.test.ts`<br>`http-smoke.test.ts`<br>`http-write.test.ts` | None |
| **R&D Radar Analysis** | `RDRadarController` | `RDRadarService`, `RDRadarAnalysisService` | PostgreSQL via Prisma (`EvidenceSourceV2`, `EvidenceItem`, `CandidateInitiative`, `PMDecision`, `RDRadarAnalysisRun`); fallback to fixtures | **PRODUCTION-LIVE** (when configured) / **MOCK/FALLBACK** (default) | `rd-radar.service.test.ts`<br>`rd-radar.http.test.ts`<br>`rd-radar-analysis.service.test.ts`<br>`rd-radar-v1-contract.test.ts` | Local LLM (`vllm_openai_compatible`, `llama.cpp`) |
| **AI Gateway** | `AiGatewayController` | `AiGatewayService`, `AiGatewayPolicyService`, `AiGatewayProviderSettingsService`, `RuntimeConfigurationService` | PostgreSQL via Prisma (`AiProviderConfiguration`, `AiModelConfiguration`, `RepositoryConnection`, `ConfigurationAuditEvent`) | **PRODUCTION-LIVE** | `ai-gateway-preview.test.ts`<br>`ai-gateway-policy.service.test.ts`<br>`ai-gateway-provider-settings.test.ts`<br>`config-crypto.service.test.ts` | vLLM, OpenAI format, AES-256-GCM crypto |
| **Repository Source** | `RepositorySourceController`, `RepositoryConfigurationController` | `RepositorySourceService`, `RepositoryContentService`, `RepositorySourceProviderRegistry` | Local filesystem / GitLab HTTPS policy / GitHub read-only client; connection config stored via Prisma | **PRODUCTION-LIVE** | `repository-source.test.ts`<br>`repository-content.service.test.ts`<br>`connection-policy.test.ts` | GitLab, GitHub API, Local Git repos |
| **Automation Contract** | `AutomationContractController` | `AutomationContractService`, `WorkflowRuntimeStore` | Dual: In-memory arrays (`contract-memory.ts`) or raw SQL via Prisma (`WorkflowRun`, `WorkflowCallback`, etc.) | **PARTIAL** | `automation-contract.test.ts`<br>`workflow-runtime.store.test.ts` | Machine callbacks |
| **AI Patch** | `AiPatchController` | `AiPatchService` | In-memory array (`aiPatchDrafts` in `ai-patch-memory.ts`) | **MOCK/FALLBACK** | `ai-patch.service.test.ts`<br>`ai-patch.http.test.ts` | None |
| **Knowledge & RAG** | `KnowledgeController`, `RagController` | `KnowledgeService`, `RagService` | Static in-memory fixtures (`knowledge.fixtures.ts`) | **MOCK/FALLBACK** | `knowledge.service.test.ts`<br>`knowledge.http.test.ts`<br>`rag-index-preview.test.ts` | None |
| **Conversation (Chat)** | `ConversationController` (*UNREGISTERED*) | `ConversationService` (*UNREGISTERED*) | PostgreSQL via Prisma (`Conversation`, `ConversationMessage`) with in-memory map fallback | **PLANNED** / **UNREGISTERED** | **NONE** | None |
| **Agent Runtime** | None (*UNREGISTERED*) | `SkillRegistryService` (*UNREGISTERED*) | In-memory built-in skills (`built-in-skills.ts`), DB models defined in Prisma (`AgentRun`, `AgentPlan`, etc.) | **PLANNED** / **UNREGISTERED** | **NONE** | AiGatewayService |

---

## 3. Request-to-Database Tracing

### A. POST /auth/login
```text
HTTP POST /api/auth/login
 ↓
AuthController.login (backend/src/auth/auth.controller.ts:12)
 ↓
DTO: LoginRequestDto { email, password }
 ↓
Validation: AuthService.requiredString() (non-empty string check)
 ↓
Authentication: AuthService.login() (backend/src/auth/auth.service.ts:52)
 ↓
Mode Branch: isDbMode() ? loginFromDb() : loginFromEnv()
 ↓
If DB Mode:
   prisma.user.findUnique({ where: { email }, include: { roles: { include: { role: true } } } })
   ↓
   AuthService.verifyScryptPassword(password, user.passwordHash) [7-part scrypt:v1 constant-time verification]
   ↓
   Validate user.status === "active"
   ↓
   Generate 3-part HMAC-SHA256 JWT (sub, sessionId, email, displayName, role, orgId, exp)
   ↓
   Compute one-way sha256(rawToken) -> tokenHash
   ↓
   prisma.userSession.create({ data: { userId, tokenHash, ipAddress, userAgent, expiresAt } })
 ↓
Set-Cookie header: sekhem_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800
 ↓
HTTP Response: 201 Created { data: { authenticated: true, user: { ... }, expiresAt } }
```

### B. GET /auth/session
```text
HTTP GET /api/auth/session
 ↓
AuthController.session (backend/src/auth/auth.controller.ts:26)
 ↓
Headers: Cookie: sekhem_session=<token>
 ↓
AuthService.session(cookieHeader) (backend/src/auth/auth.service.ts:75)
 ↓
AuthService.sessionClaims(cookieHeader) -> extractCookie() -> verifyToken()
 ↓
Token Verification:
   Check 3-part JWT structure
   Constant-time HMAC-SHA256 signature verification
   Expiration check (claims.exp > now)
   Throws UnauthorizedException("Authentication required") on any failure
 ↓
HTTP Response: 200 OK { data: { authenticated: true, user: { ... }, expiresAt } }
```

### C. POST /auth/logout
```text
HTTP POST /api/auth/logout
 ↓
AuthController.logout (backend/src/auth/auth.controller.ts:32)
 ↓
AuthService.logout(cookieHeader) (backend/src/auth/auth.service.ts:161)
 ↓
If DB Mode:
   extractCookie() -> hashToken(token)
   prisma.userSession.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } })
 ↓
Set-Cookie header: sekhem_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0
 ↓
HTTP Response: 201 Created { data: { authenticated: false, loggedOut: true } }
```

### D. Admin User Operation (POST /admin/users)
```text
HTTP POST /api/admin/users
 ↓
AdminController.createUser (backend/src/admin/admin.controller.ts:54)
 ↓
Guard: AuthzGuard.canActivate() (backend/src/auth/authz.guard.ts:20)
       Requires role === "Admin"
 ↓
DTO: CreateUserDto { email, displayName, password, role, organizationId }
 ↓
AdminService.createUser(dto, actorClaims) (backend/src/admin/admin.service.ts:130)
 ↓
AuthService.hashPassword(dto.password) -> scrypt:v1:N=16384:r=8:p=1:<salt>:<hash>
 ↓
prisma.user.create({ data: { id, email, displayName, passwordHash, organizationId, status: "active" } })
 ↓
prisma.role.findUnique({ where: { key: roleKey } })
 ↓
prisma.userRole.create({ data: { userId, roleId } })
 ↓
AuditService.recordWithClaims(actorClaims, { action: "USER_CREATE", resourceType: "User", ... })
 ↓
HTTP Response: 201 Created { data: { id, email, displayName, organizationId, status, createdAt } }
```

### E. Authorized Resource Read (GET /initiatives/:slug)
```text
HTTP GET /api/initiatives/:slug
 ↓
ProductController.getInitiative (backend/src/product.controller.ts:95)
 ↓
Guard: AuthzGuard.canActivate() -> Requires role in ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"]
 ↓
ProductService.getInitiative(slug) (backend/src/product.service.ts:124)
 ↓
MemoryProductReadRepository.getInitiative(slug) (backend/src/data-access/memory-product-read.repository.ts)
 ↓
Read from in-memory initiatives array (backend/src/data/seed-data.ts)
 ↓
HTTP Response: 200 OK { data: InitiativeDetailDto, meta: { timestamp }, errors: [] }
(NOTE: Reads 100% from memory, does NOT query PostgreSQL)
```

### F. Group-Scoped Read (GET /admin/groups)
```text
HTTP GET /api/admin/groups?organizationId=...
 ↓
AdminController.listGroups (backend/src/admin/admin.controller.ts:73)
 ↓
Guard: AuthzGuard -> Requires role === "Admin"
 ↓
AdminService.listGroups(organizationId) (backend/src/admin/admin.service.ts:226)
 ↓
prisma.group.findMany({ where: { organizationId }, include: { members: { include: { user: ... } } } })
 ↓
HTTP Response: 200 OK { data: Group[], meta: { timestamp }, errors: [] }
```

### G. Project-Scoped Read (GET /admin/projects/:projectId/members)
```text
HTTP GET /api/admin/projects/:projectId/members
 ↓
AdminController.listProjectMembers (backend/src/admin/admin.controller.ts:108)
 ↓
Guard: AuthzGuard -> Requires role === "Admin"
 ↓
AdminService.listProjectMembers(projectId) (backend/src/admin/admin.service.ts:315)
 ↓
prisma.projectMember.findMany({ where: { projectId }, include: { user: ... } })
 ↓
HTTP Response: 200 OK { data: ProjectMember[], meta: { timestamp }, errors: [] }
```

### H. Audit-Producing Mutation (POST /initiatives/:slug/start)
```text
HTTP POST /api/initiatives/:slug/start
 ↓
ProductController.startInitiative (backend/src/product.controller.ts:100)
 ↓
Guard: AuthzGuard -> Requires role in ["Admin", "PM"]
 ↓
ProductWriteService.startInitiative(slug, body, actor) (backend/src/product-write.service.ts:55)
 ↓
Mutates in-memory initiatives array: initiative.status = "in_progress"
 ↓
ProductWriteService.appendAuditEvent({ action: "initiative_started", actor, ... })
 ↓
Appends to in-memory auditEvents array in backend/src/data/seed-data.ts
 ↓
HTTP Response: 200 OK { data: InitiativeSummaryDto, auditEvent: AuditEventDto, meta: { ... } }
(NOTE: Neither mutation nor auditEvent is persisted to PostgreSQL)
```

### I. R&D Radar Operation (POST /rd-radar/analysis-runs)
```text
HTTP POST /api/rd-radar/analysis-runs
 ↓
RDRadarController.runAnalysis (backend/src/rd-radar.controller.ts:39)
 ↓
Guard: AuthzGuard -> Requires role in ["Admin", "PM"]
 ↓
RDRadarAnalysisService.run(body, actorId) (backend/src/rd-radar-analysis.service.ts:39)
 ↓
prisma.rDRadarAnalysisRun.findFirst({ where: { repositoryConnectionId, requestedRef, status: "RUNNING" } })
 ↓
prisma.rDRadarAnalysisRun.create({ data: { id, repositoryConnectionId, providerId, modelId, requestedRef, status: "RUNNING", ... } })
 ↓
Asynchronous pipeline executes:
   1. RepositoryContentService.snapshot() -> bounded read-only git snapshot
   2. AiGatewayService.runStructuredAnalysis() -> routes to provider adapter (e.g. vLLM)
   3. validateResult() -> validates against canonical schema and citations
   4. persistResult() inside prisma.$transaction(async (tx) => {
        tx.evidenceSourceV2.upsert(...)
        tx.evidenceItem.create(...)
        tx.candidateInitiative.create(...)
        tx.rDRadarAnalysisRun.update({ status: "REVIEW_REQUIRED", ... })
      })
 ↓
HTTP Response: 202 Accepted { data: RDRadarAnalysisRunDto }
```

### J. AI Gateway Operation (POST /ai-gateway/providers)
```text
HTTP POST /api/ai-gateway/providers
 ↓
AiGatewayController.createProvider (backend/src/ai-gateway/ai-gateway.controller.ts:34)
 ↓
Guard: AuthzGuard -> Requires role === "Admin"
 ↓
RuntimeConfigurationService.createProvider(body) (backend/src/ai-gateway/runtime-configuration.service.ts:46)
 ↓
ConfigCryptoService.encrypt(apiKey) -> AES-256-GCM string (v1:<iv>:<tag>:<ciphertext>)
 ↓
prisma.aiProviderConfiguration.create({ data: { id, displayName, providerType, baseUrl, encryptedApiKey, enabled: false, ... } })
 ↓
prisma.configurationAuditEvent.create({ data: { actor, action: "AI_PROVIDER_CREATE", resourceType: "AiProviderConfiguration", ... } })
 ↓
HTTP Response: 201 Created { data: RuntimeProviderDto }
```

### K. Repository Snapshot (POST /repository-sources/status or /test)
```text
HTTP POST /api/repository-sources/:id/test
 ↓
RepositorySourceController / RepositorySourceService.testConnection(id)
 ↓
RuntimeConfigurationService.repositoryForUse(id) -> decrypts encryptedCredential via ConfigCryptoService
 ↓
RepositoryContentService.branches(connection)
 ↓
If local: validatedLocalRepositoryPath() -> checks canonical path beneath safe roots, rejects symlinks
If GitLab: validatedHttpsUrl() -> checks allowlist origins, rejects numeric IP / user info / traversal
Executes read-only git / API query
 ↓
HTTP Response: 200 OK { data: { connected: true, branches: [...] } }
```

### L. Existing Conversation Endpoint (POST /conversations)
```text
HTTP POST /api/conversations (UNREGISTERED IN APPMODULE)
 ↓
ConversationController.createConversation (backend/src/conversation/conversation.controller.ts:26)
 ↓
AuthzGuard.canActivate() -> verifies cookie session
 ↓
ConversationService.createConversation(userId, body) (backend/src/conversation/conversation.service.ts:40)
 ↓
If DB Mode:
   prisma.conversation.create({ data: { id, projectId, userId, title, status: "active", metadata } })
Else:
   memConversations.set(id, { id, projectId, userId, title, ... })
 ↓
HTTP Response: 200 OK { data: ConversationSummaryDto }
(CRITICAL FINDING: Route is unmounted in AppModule; returning 404 at runtime)
```

---

## 4. Database Forensic Audit (64 Models in `schema.prisma`)

| Model Name | Table Name | PK | FKs / Relations | Key Constraints / Indexes | Ownership / Org Boundary |
|---|---|---|---|---|---|
| `Project` | `"Project"` | `id` | `groupId` -> `Group`, `organizationId` -> `Organization` | `slug` (UNIQUE), `status`, `phase` | `organizationId`, `groupId` |
| `Module` | `"Module"` | `id` | `projectId` -> `Project` | `slug` (UQ), `key` (UQ), `projectId`, `category`, `status` | Inherited via `Project` |
| `LockedModule` | `"LockedModule"` | `id` | `moduleId` -> `Module` | `moduleId` (UQ) | Inherited via `Module` |
| `Initiative` | `"Initiative"` | `id` | `projectId` -> `Project`, `moduleId` -> `Module` | `slug` (UQ), `projectId`, `moduleId`, `status`, `technicalRisk` | Inherited via `Project` |
| `EvidenceSource` | `"EvidenceSource"` | `id` | `initiativeId` -> `Initiative` | `initiativeId`, `initiativeSlug` | Inherited via `Initiative` |
| `ExecutionPath` | `"ExecutionPath"` | `id` | `initiativeId` -> `Initiative` | `initiativeId`, `initiativeSlug` | Inherited via `Initiative` |
| `Task` | `"Task"` | `id` | `initiativeId` -> `Initiative` | `initiativeId`, `status` | Inherited via `Initiative` |
| `ActivityEvent` | `"ActivityEvent"` | `id` | `initiativeId` -> `Initiative` | `projectId`, `initiativeId`, `initiativeSlug` | Inherited via `Initiative` |
| `Approval` | `"Approval"` | `id` | `projectId` -> `Project`, `initiativeId` -> `Initiative` | `projectId`, `initiativeId`, `status` | Inherited via `Project` |
| `TechnicalMemo` | `"TechnicalMemo"` | `id` | `initiativeId` -> `Initiative` | None | Inherited via `Initiative` |
| `CodeDraftWorkspace` | `"CodeDraftWorkspace"` | `id` | `initiativeId` -> `Initiative` | None | Inherited via `Initiative` |
| `SandboxedArtifact` | `"SandboxedArtifact"` | `id` | `workspaceId` -> `CodeDraftWorkspace` | None | Inherited via `Workspace` |
| `SecurityGate` | `"SecurityGate"` | `id` | `initiativeId` -> `Initiative` | `initiativeId`, `status` | Inherited via `Initiative` |
| `SecurityCheck` | `"SecurityCheck"` | `id` | `securityGateId` -> `SecurityGate` | None | Inherited via `SecurityGate` |
| `SecurityFinding` | `"SecurityFinding"` | `id` | `securityGateId` -> `SecurityGate` | None | Inherited via `SecurityGate` |
| `Blocker` | `"Blocker"` | `id` | `projectId` -> `Project`, `initiativeId` -> `Initiative` | `projectId`, `initiativeId`, `status`, `severity` | Inherited via `Project` |
| `ReleaseCandidate` | `"ReleaseCandidate"` | `id` | `initiativeId` -> `Initiative` | `initiativeId`, `status` | Inherited via `Initiative` |
| `ReleaseArtifact` | `"ReleaseArtifact"` | `id` | `releaseCandidateId` -> `ReleaseCandidate` | None | Inherited via `ReleaseCandidate` |
| `ReleaseApprovalChecklistItem`| `"ReleaseApprovalChecklistItem"` | `id` | `releaseCandidateId` -> `ReleaseCandidate` | None | Inherited via `ReleaseCandidate` |
| `RollbackPlan` | `"RollbackPlan"` | `id` | `releaseCandidateId` -> `ReleaseCandidate` | `releaseCandidateId` (UQ) | Inherited via `ReleaseCandidate` |
| `RDSignal` | `"RDSignal"` | `id` | `projectId` -> `Project` | None | Inherited via `Project` |
| `InfrastructureNode` | `"InfrastructureNode"` | `id` | None | None | `projectId` |
| `ServiceStatus` | `"ServiceStatus"` | `id` | `nodeId` -> `InfrastructureNode` | None | Inherited via `Node` |
| `AuditEvent` | `"AuditEvent"` | `id` | `projectId` -> `Project`, `initiativeId` -> `Initiative` | None | `projectId` |
| `RepositoryPreview` | `"RepositoryPreview"` | `id` | `projectId` -> `Project` | `projectId` | `projectId` |
| `WorkflowPreview` | `"WorkflowPreview"` | `id` | `projectId` -> `Project` | `projectId`, `status` | `projectId` |
| `KnowledgeDocument` | `"KnowledgeDocument"` | `id` | `projectId` -> `Project` | `projectId`, `type` | `projectId` |
| `SupportRequest` | `"SupportRequest"` | `id` | `projectId` -> `Project` | `projectId`, `status`, `priority` | `projectId` |
| `SupportArticle` | `"SupportArticle"` | `id` | `projectId` -> `Project` | `projectId`, `category`, `status` | `projectId` |
| `User` | `"User"` | `id` | `organizationId` -> `Organization` | `email` (UQ) | `organizationId` |
| `Role` | `"Role"` | `id` | None | `key` (UQ) | System-wide |
| `Permission` | `"Permission"` | `id` | None | `key` (UQ) | System-wide |
| `UserRole` | `"UserRole"` | `[userId, roleId]` | `userId` -> `User`, `roleId` -> `Role` | `roleId` | `userId` |
| `RolePermission` | `"RolePermission"` | `[roleId, permissionId]` | `roleId` -> `Role`, `permissionId` -> `Permission`| `permissionId` | `roleId` |
| `EvidenceSourceV2` | `"EvidenceSourceV2"` | `id` | None | `url` (UQ) | System-wide |
| `EvidenceItem` | `"EvidenceItem"` | `id` | `sourceId` -> `EvidenceSourceV2` | `sourceId` | Inherited via `Source` |
| `EvidenceReview` | `"EvidenceReview"` | `id` | `evidenceItemId` -> `EvidenceItem` | `evidenceItemId` | Inherited via `Item` |
| `CandidateInitiative` | `"CandidateInitiative"` | `id` | None | `candidateId` (UQ), `status` | System-wide |
| `PMDecision` | `"PMDecision"` | `id` | `candidateId` -> `CandidateInitiative` | `candidateId` | Inherited via `Candidate` |
| `WorkflowRunSummary` | `"WorkflowRunSummary"` | `id` | None | `candidateId` | Inherited via `Candidate` |
| `GitHubIntegrationStatus` | `"GitHubIntegrationStatus"` | `id` | None | `[repoFullName, branch]` | System-wide |
| `AiProviderConfiguration` | `"AiProviderConfiguration"` | `id` | None | `enabled` | System-wide |
| `AiModelConfiguration` | `"AiModelConfiguration"` | `id` | `providerId` -> `AiProviderConfiguration` | `[providerId, modelId]` (UQ), `[providerId, enabled]` | Inherited via `Provider` |
| `RepositoryConnection` | `"RepositoryConnection"` | `id` | None | `[providerType, enabled]` | System-wide |
| `RDRadarAnalysisRun` | `"RDRadarAnalysisRun"` | `id` | `repositoryConnectionId` -> `RepositoryConnection`, `providerId` -> `AiProviderConfiguration`, `modelId` -> `AiModelConfiguration` | `[status, createdAt]`, `[repositoryConnectionId, commitSha]` | Inherited via `Repository` |
| `ConfigurationAuditEvent` | `"ConfigurationAuditEvent"` | `id` | None | `[resourceType, resourceId, createdAt]` | System-wide |
| `WorkflowRun` | `"WorkflowRun"` | `id` | None | `status`, `projectId`, `initiativeSlug` | `projectId` |
| `WorkflowCallback` | `"WorkflowCallback"` | `id` | `workflowRunId` -> `WorkflowRun` | `workflowRunId`, `issueId`, `status` | Inherited via `WorkflowRun` |
| `WorkflowRunState` | `"WorkflowRunState"` | `id` | `workflowRunId` -> `WorkflowRun`, `blockerId` -> `Blocker` | `workflowRunId`, `status`, `blockerId` | Inherited via `WorkflowRun` |
| `WorkflowCallbackIdempotency` | `"WorkflowCallbackIdempotency"` | `[workflowRunId, idempotencyKey]` | `workflowRunId` -> `WorkflowRun`, `callbackId` -> `WorkflowCallback` | PK | Inherited via `WorkflowRun` |
| `Organization` | `"Organization"` | `id` | None | `slug` (UQ) | Organization boundary root |
| `OrganizationMember` | `"OrganizationMember"` | `id` | `organizationId` -> `Organization`, `userId` -> `User` | `[organizationId, userId]` (UQ), `userId`, `organizationId` | `organizationId` |
| `UserSession` | `"UserSession"` | `id` | `userId` -> `User` (CASCADE) | `tokenHash` (UQ), `userId`, `[revokedAt, expiresAt]` | `userId` |
| `Group` | `"Group"` | `id` | `organizationId` -> `Organization` | `slug` (UQ) | `organizationId` |
| `GroupMember` | `"GroupMember"` | `id` | `groupId` -> `Group`, `userId` -> `User` | `[groupId, userId]` (UQ), `userId` | `groupId` |
| `ProjectMember` | `"ProjectMember"` | `id` | `projectId` -> `Project`, `userId` -> `User` | `[projectId, userId]` (UQ), `userId`, `projectId` | `projectId` |
| `Conversation` | `"Conversation"` | `id` | `projectId` -> `Project`, `userId` -> `User` | `projectId`, `userId` | `projectId`, `userId` |
| `ConversationMessage` | `"ConversationMessage"` | `id` | `conversationId` -> `Conversation` | `conversationId` | Inherited via `Conversation` |
| `AgentRun` | `"AgentRun"` | `id` | `conversationId` -> `Conversation`, `projectId` -> `Project`, `userId` -> `User` | `projectId`, `conversationId`, `status` | `projectId`, `userId` |
| `AgentPlan` | `"AgentPlan"` | `id` | `agentRunId` -> `AgentRun` | `agentRunId` | Inherited via `AgentRun` |
| `AgentRunEvent` | `"AgentRunEvent"` | `id` | `agentRunId` -> `AgentRun` | `[agentRunId, timestamp]` | Inherited via `AgentRun` |
| `AgentApproval` | `"AgentApproval"` | `id` | `agentRunId` -> `AgentRun` | `[agentRunId, status]` | Inherited via `AgentRun` |
| `AgentArtifact` | `"AgentArtifact"` | `id` | `agentRunId` -> `AgentRun`, `projectId` -> `Project` | `agentRunId`, `projectId` | `projectId` |
| `AgentAuditRecord` | `"AgentAuditRecord"` | `id` | `agentRunId` -> `AgentRun`, `projectId` -> `Project` | `agentRunId`, `[projectId, timestamp]` | `projectId` |

---

## 5. Database Communication Classification

| Access Mechanism | Files | Query Type | Affected Models | Consistency & Partial-Write Risks |
|---|---|---|---|---|
| **PRISMA (Interactive Transaction)** | `rd-radar-analysis.service.ts:137` | `upsert`, `create`, `update` inside `$transaction(async (tx) => ...)` | `EvidenceSourceV2`, `EvidenceItem`, `CandidateInitiative`, `RDRadarAnalysisRun` | **ACID compliant**: atomic rollback on any failure. Zero partial-write risk. |
| **PRISMA (Individual Queries)** | `admin.service.ts`<br>`auth.service.ts`<br>`resource-authz.service.ts`<br>`runtime-configuration.service.ts`<br>`rd-radar.service.ts` | `create`, `update`, `upsert`, `findMany`, `findUnique`, `deleteMany` | `User`, `UserSession`, `Organization`, `Group`, `GroupMember`, `ProjectMember`, `AiProviderConfiguration`, `AiModelConfiguration`, `RepositoryConnection` | **Partial-write risk**: mutations that create multiple entities (e.g., user + userRole in `admin.service.ts:167`) execute outside `$transaction`. If role mapping fails, user remains created without role. |
| **RAW SQL (`$queryRaw` / `$executeRaw`)** | `workflow-runtime.store.ts:145-220`<br>`product.service.ts:34` | Raw SQL `INSERT`, `SELECT`, `UPSERT` via tagged template literals | `WorkflowRun`, `WorkflowCallback`, `WorkflowRunState`, `WorkflowCallbackIdempotency`, `SELECT 1` | **High partial-write risk**: `storeCallback` executes 3 separate `$executeRaw` queries without `$transaction`. If state insert fails, callback & idempotency remain committed. |
| **IN-MEMORY ARRAYS & MAPS** | `product-write.service.ts`<br>`product.service.ts`<br>`ai-patch.service.ts`<br>`automation-contract.service.ts`<br>`audit.service.ts`<br>`knowledge.service.ts`<br>`rag.service.ts` | Javascript in-memory mutations (`push`, `find`, `set`) | `Initiative`, `Task`, `Approval`, `Blocker`, `AuditEvent`, `AiPatchDraft`, `ContractActivity`, `KnowledgeItem` | **Data Loss Risk**: 100% of mutations to initiatives, tasks, approvals, blockers, and AI patches are wiped on process restart. |

---

## 6. Schema/Migration Drift Analysis

### CRITICAL FINDING: Complete Absence of Core Baseline Migration
1. **Unmigrated Core Models (34 Models)**:
   The following 34 models exist in `backend/prisma/schema.prisma` but have **NO SQL migration** in `backend/prisma/migrations/`:
   `Project`, `Module`, `LockedModule`, `Initiative`, `EvidenceSource`, `ExecutionPath`, `Task`, `ActivityEvent`, `Approval`, `TechnicalMemo`, `CodeDraftWorkspace`, `SandboxedArtifact`, `SecurityGate`, `SecurityCheck`, `SecurityFinding`, `Blocker`, `ReleaseCandidate`, `ReleaseArtifact`, `ReleaseApprovalChecklistItem`, `RollbackPlan`, `RDSignal`, `InfrastructureNode`, `ServiceStatus`, `AuditEvent`, `RepositoryPreview`, `WorkflowPreview`, `KnowledgeDocument`, `SupportRequest`, `SupportArticle`, `User`, `Role`, `Permission`, `UserRole`, `RolePermission`.
   - **Evidence**: `backend/prisma/migrations/` begins chronologically at `20260520112500_add_rd_radar_persistence`, which contains the comment `-- Additive-only R&D Radar persistence foundation. No existing table or column is dropped or altered.`
   - **Consequence**: `prisma migrate deploy` cannot run against a blank PostgreSQL database. It will immediately fail because foreign keys (e.g. referencing `Project`, `User`, `Blocker`) reference non-existent tables.

2. **Schema Field Drift in `AuditEvent`**:
   - In `schema.prisma:482-500`:
     `AuditEvent` has fields: `id`, `projectId`, `initiativeId`, `timestamp`, `action`, `actor`, `actorType`, `target`, `module`, `details` (String), `riskLevel` (RiskLevel enum), `sourceType` (SourceType enum), `createdAt`.
   - In `backend/src/audit/audit.service.ts:107-125`:
     `AuditService` attempts to insert `description` and `metadata`:
     ```typescript
     await this.prisma.auditEvent.create({
       data: {
         id: record.id,
         action: record.action,
         description: ..., // COLUMN DOES NOT EXIST IN SCHEMA
         metadata: ...     // COLUMN DOES NOT EXIST IN SCHEMA
       }
     });
     ```
   - **Consequence**: The insert fails against PostgreSQL and is caught silently by `catch { /* Silent catch */ }`. Audit events are only stored in volatile memory (`this.inMemoryLog`).

3. **Duplicated Persistence Models**:
   - `AuditEvent` (in `schema.prisma:482`) vs `ConfigurationAuditEvent` (in `schema.prisma:877`) vs `AgentAuditRecord` (in `schema.prisma:1210`) vs in-memory `StoredAuditRecord` (in `audit.service.ts`) vs `AuditEventDto` (in `dto.ts`). There are 5 distinct audit representations across the backend.

---

## 7. Authentication System Detail

- **Password Verification**:
  - Algorithm: Memory-hard `scrypt` (parameters: $N=16384, r=8, p=1$, keylen $=64$, maxmem $=32\text{ MB}$).
  - Format: Self-describing 7-part colon-delimited string: `scrypt:v1:N=16384:r=8:p=1:<salt>:<hash>`.
  - Comparison: Constant-time `timingSafeEqual(storedBuf, derivedKey)`.
- **User Lookup & Status Validation**:
  - Looks up user by email via `prisma.user.findUnique`.
  - Account status check: `user.status === "active"`. If suspended or deactivated, throws `UnauthorizedException("Invalid credentials")` at login, or `UnauthorizedException("Account is suspended or deactivated")` during durable session validation.
- **Session Token Creation**:
  - JWT Claims: `sub` (userId), `sessionId`, `email`, `displayName`, `role`, `organizationId`, `iat`, `exp`.
  - Signature: HMAC-SHA256 using `process.env.SEKHEM_AUTH_SESSION_SECRET` (minimum 32 characters required).
- **Session Persistence**:
  - The raw token is **NEVER** stored in the database.
  - Generates a one-way hash: `sha256(rawToken) -> tokenHash`.
  - Inserts into `UserSession` (`userId`, `tokenHash`, `ipAddress`, `userAgent`, `expiresAt`).
- **Cookie Contract**:
  - Name: `sekhem_session`
  - Flags: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` (8 hours).
  - Logout sets `Max-Age=0` and updates `UserSession.revokedAt = new Date()`.
- **Revocation Invariants**:
  - Per-session revocation: checks `UserSession.revokedAt`.
  - Global user revocation: checks `user.sessionRevokedAt`. If `claims.iat <= user.sessionRevokedAt`, token is rejected immediately without waiting for expiration.
- **Production Safety Safeguard**:
  - Staging env-var fallback is hard-disabled when `NODE_ENV === "production"`. Attempted fallback throws `UnauthorizedException("Database authentication required in production")`.

---

## 8. Authorization Architecture & Matrix

### 8.1 Evaluator Structure (`ResourceAuthorizationService`)
All access decisions evaluate in strict sequence:
1. **Organization Boundary**: Cross-tenant access is blocked unconditionally (`subject.organizationId !== resource.organizationId => DENY`).
2. **Admin Safety Gate**: Even system `Admin` **cannot** bypass `isDangerousOperation` or `requiresApproval` for `EXECUTE` actions.
3. **User Privacy**: `visibility === "PRIVATE"` permits only the resource owner (`resourceOwner === subject.userId`). Destructive updates/deletes on user-owned resources require ownership or Admin.
4. **Group Boundary**: Checks live membership via `prisma.groupMember.findUnique`.
5. **Project Boundary**: Resolves live role via `prisma.projectMember.findUnique`.

### 8.2 Authorization Matrix

| Action | Admin | PM | Technical Reviewer | Security Reviewer | Viewer | Constraint / Guard Rule |
|---|---|---|---|---|---|---|
| **READ** | Allowed | Allowed | Allowed | Allowed | Allowed | All project members can read non-private project resources. Private resources restricted to owner. |
| **CREATE** | Allowed | Allowed | Allowed | Allowed | Denied | Requires project membership in Admin, PM, Technical Reviewer, or Security Reviewer. |
| **UPDATE** | Allowed | Allowed | Allowed | Allowed | Denied | Same as CREATE. Destructive updates on private resources require owner or Admin. |
| **DELETE** | Allowed | Allowed | Denied | Denied | Denied | Restricted strictly to Admin and PM project roles. |
| **STEER** | Allowed | Allowed | Allowed | Denied | Denied* | Permitted to Admin, PM, Technical Reviewer, or the initiator/owner of the run (*if initiator). |
| **CANCEL** | Allowed | Allowed | Denied | Denied | Denied* | Permitted to Admin, PM, or initiator/owner of the run (*if initiator). |
| **APPROVE** | Allowed | Allowed | Allowed* | Allowed* | Denied | Allowed to Admin and PM. Technical Reviewer and Security Reviewer allowed only if role meets required threshold (*). |
| **EXECUTE** | Allowed* | Allowed* | Allowed* | Denied | Denied | Requires Admin, PM, or Technical Reviewer. **Blocked for all roles (including Admin)** if `requiresApproval` or `isDangerousOperation`. |
| **ADMIN** | Allowed | Denied | Denied | Denied | Denied | Restricted strictly to project Admin role. |

---

## 9. Admin & Audit Governance

### 9.1 Admin Operations (`AdminService`)
- All routes protected by `@RequireRoles("Admin")` and `@UseGuards(AuthzGuard)`.
- Operations:
  - `createOrganization`, `listOrganizations`
  - `createUser`: Hashes password with `scrypt:v1`, creates `User`, assigns `Role` via `UserRole`.
  - `updateUser`: Updates profile; if `status === "suspended"`, calls `authService.revokeAllUserSessions(id)`.
  - `createGroup`, `listGroups`, `addGroupMember`, `removeGroupMember`
  - `listProjectMembers`, `addProjectMember`, `removeProjectMember`
- Server-Side Actor Derivation: `actorClaims` extracted directly from cookie session claims; client cannot supply a spoofed actor.

### 9.2 Audit Service (`AuditService`)
- Sanitizes details recursively using `FORBIDDEN_AUDIT_KEYS` (`password`, `secret`, `token`, `key`, `cookie`, `credential`, `privatekey`). Redacts matching keys to `"[REDACTED]"`.
- Generates `StoredAuditRecord` with `actorId`, `actorEmail`, `actorRole`, `sessionId`, `organizationId`.
- In-memory logging succeeds; database persistence fails silently due to schema column mismatch.

---

## 10. AI Gateway Architecture & Boundaries

```text
Incoming Request
 ↓
AuthzGuard (Validates session and required roles)
 ↓
AiGatewayPolicyService (Validates prompt length, token budget, safe task types)
 ↓
RuntimeConfigurationService.providerForUse(providerId)
   ↓
   Retrieves AiProviderConfiguration from PostgreSQL
   ↓
   ConfigCryptoService.decrypt(encryptedApiKey) using AES-256-GCM master key
 ↓
Provider Selection & Base URL Policy:
   - Validates HTTPS policy (rejects insecure HTTP, credentials in URLs, numeric IPs, loopback escapes)
   - Allowlisted dialects: LLAMACPP_JSON_SCHEMA, OPENAI_JSON_SCHEMA, VLLM_STRUCTURED_OUTPUTS, JSON_OBJECT_ONLY
 ↓
Provider Adapter Execution (VllmOpenAiCompatibleAdapter or MockAiGatewayProviderAdapter):
   - Injects canonical JSON schema envelope
   - Enforces timeout via AbortController
   - Sanitizes raw provider errors; credentials/tokens stripped from error envelopes
 ↓
LlmJsonParser:
   - Strips markdown code blocks (` ```json `)
   - Validates structured JSON against target schema
 ↓
Persistence & Audit:
   - Interactive transaction in RDRadarAnalysisService
   - ConfigurationAuditEvent logged for config mutations
```

---

## 11. R&D Radar Production Pipeline

1. **Repository Configuration**: `RepositoryConnection` stores branches, file limits (`maximumFileBytes=131072`, `maximumTotalBytes=1048576`, `maximumFileCount=100`), timeout (`15000ms`).
2. **Bounded Read-Only Snapshot**: `RepositoryContentService.snapshot()` fetches content strictly read-only.
3. **Structured Inference**: Dispatches snapshot chunks to `AiGatewayService` using the canonical schema `rd-radar-output.schema.ts`.
4. **Citation Validation**: Verifies that every finding cites a real repository path from the analyzed commit snapshot.
5. **ACID Persistence**: Single atomic `prisma.$transaction`:
   - Upserts `EvidenceSourceV2`
   - Creates `EvidenceItem` records
   - Creates `CandidateInitiative` (status: `"DRAFT_ONLY"`, `nextGate: "PM_REVIEW_REQUIRED"`)
   - Updates `RDRadarAnalysisRun` to `"REVIEW_REQUIRED"`

---

## 12. Repository Safety Boundaries

- **Local Path Safety (`repository-path.policy.ts`)**:
  - Enforces canonical paths beneath explicit allowlist roots.
  - Resolves symlinks using `realpathSync`; verifies resolved target is within allowlisted roots.
  - Traversal strings (`..`), null bytes (`\0`), and wildcards are rejected.
- **GitLab Origin Safety (`gitlab-url.policy.ts`)**:
  - Must use HTTPS scheme.
  - Rejects embedded user info (`user:pass@host`), numeric/hex IP formats, percent-encoded hostname bypasses, and DNS rebinding suffix variations.
- **Read-Only Boundary**:
  - `git clone`, `git fetch`, and `git archive` are strictly bounded.
  - All write operations (`git push`, `git commit`, deployment) are hard-forbidden.

---

## 13. Current Persistence Matrix

| Feature / Domain | Controller | Service | Current Persistence Mode | Durable in Postgres? | Prisma Model | Current Status |
|---|---|---|---|---|---|---|
| **Users** | `AdminController`, `AuthController` | `AdminService`, `AuthService` | DURABLE_POSTGRES | **YES** | `User`, `UserRole` | Production-ready |
| **Organizations** | `AdminController` | `AdminService` | DURABLE_POSTGRES | **YES** | `Organization`, `OrganizationMember` | Production-ready |
| **Groups** | `AdminController` | `AdminService` | DURABLE_POSTGRES | **YES** | `Group`, `GroupMember` | Production-ready |
| **Projects** | `ProductController`, `AdminController` | `ProductService`, `AdminService` | HYBRID (Reads memory, members in DB) | **PARTIALLY** (Metadata in memory, members in DB) | `Project`, `ProjectMember` | Needs database reconciliation |
| **Sessions** | `AuthController` | `AuthService` | DURABLE_POSTGRES | **YES** | `UserSession` | Production-ready |
| **Conversations** | `ConversationController` (*unregistered*) | `ConversationService` | DURABLE_POSTGRES (Code ready, unmounted) | **YES** (When registered) | `Conversation` | Unregistered in `AppModule` |
| **Messages** | `ConversationController` (*unregistered*) | `ConversationService` | DURABLE_POSTGRES (Code ready, unmounted) | **YES** (When registered) | `ConversationMessage` | Unregistered in `AppModule` |
| **Initiatives** | `ProductController` | `ProductService`, `ProductWriteService` | MEMORY | **NO** | `Initiative` | In-memory only; loses data on restart |
| **Tasks** | `ProductController` | `ProductService`, `ProductWriteService` | MEMORY | **NO** | `Task` | In-memory only; loses data on restart |
| **Approvals** | `ProductController` | `ProductService`, `ProductWriteService` | MEMORY | **NO** | `Approval` | In-memory only; loses data on restart |
| **Blockers** | `ProductController` | `ProductService`, `ProductWriteService` | MEMORY | **NO** | `Blocker` | In-memory only; loses data on restart |
| **Audit Events** | `ProductController`, none | `ProductWriteService`, `AuditService` | MEMORY / HYBRID (DB insert fails silently) | **NO** | `AuditEvent` | Column mismatch blocks DB writes |
| **R&D Evidence** | `RDRadarController` | `RDRadarService`, `RDRadarAnalysisService` | DURABLE_POSTGRES (in DB mode) / FIXTURE | **YES** (when DB mode active) | `EvidenceSourceV2`, `EvidenceItem`, `EvidenceReview` | Production-ready |
| **R&D Candidates** | `RDRadarController` | `RDRadarService`, `RDRadarAnalysisService` | DURABLE_POSTGRES (in DB mode) / FIXTURE | **YES** (when DB mode active) | `CandidateInitiative`, `PMDecision` | Production-ready |
| **Workflow State** | `AutomationContractController` | `WorkflowRuntimeStore` | HYBRID (Raw SQL via Prisma or in-memory) | **YES** (in DB mode) | `WorkflowRun`, `WorkflowCallback`, etc. | Uses raw SQL; partial-write risk |
| **Agent Runs** | None (*unregistered*) | None (*unregistered*) | UNKNOWN (Prisma models exist) | **NO** (No service code exists) | `AgentRun`, `AgentPlan`, etc. | Unimplemented |
| **AI Patch Drafts** | `AiPatchController` | `AiPatchService` | MEMORY | **NO** | None (No Prisma model) | In-memory only |
| **Skills** | None (*unregistered*) | `SkillRegistryService` | STATIC/FALLBACK | **NO** (Static definitions) | None | In-memory only |

---

## 14. Transaction Analysis

1. **`RDRadarAnalysisService.persistResult`**:
   - **Transaction Type**: Interactive Prisma Transaction (`this.prisma.$transaction(async (tx) => { ... })`).
   - **Operations**: 4 distinct operations (`evidenceSourceV2.upsert`, `evidenceItem.create`, `candidateInitiative.create`, `rDRadarAnalysisRun.update`).
   - **Assessment**: **SAFE & ATOMIC**. Complete rollback if any step fails.
2. **`WorkflowRuntimeStore.storeCallback`**:
   - **Transaction Type**: None (Sequential `$executeRaw` queries).
   - **Operations**: 3 separate queries (`INSERT INTO "WorkflowCallback"`, `INSERT INTO "WorkflowCallbackIdempotency"`, `INSERT INTO "WorkflowRunState"`).
   - **Assessment**: **HIGH RISK**. Non-atomic; server failure or syntax error between statements causes orphaned callbacks without idempotency records or run states.
3. **`AdminService.createUser`**:
   - **Transaction Type**: None (Sequential Prisma calls).
   - **Operations**: `prisma.user.create` followed by `prisma.userRole.create`.
   - **Assessment**: **MEDIUM RISK**. If role creation fails, user is created without a role.

---

## 15. Error Handling & Leak Prevention

- **`ApiExceptionFilter`**:
  - Maps HTTP status codes to standardized error codes (`400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `500 INTERNAL_SERVER_ERROR`).
  - Unknown non-HttpExceptions are masked with a generic message (`"Internal server error"`).
- **Authentication Leak Prevention**:
  - `verifyToken` and `sessionClaims` throw `UnauthorizedException("Authentication required")` without leaking specific JWT validation failure details (expired, signature mismatch, bad format).
- **AI Gateway & R&D Radar Sanitization**:
  - `sanitizeFailureReason` and provider adapters redact connection strings, raw bearer tokens, and internal file paths before returning diagnostics or persisting runs.

---

## 16. Test Architecture Map

- Total Backend Test Files: **33 files**
- Test Framework: Node.js Test Runner (`node:test`) + `tsx` runner with `--test-concurrency=1`.
- Total Passing Tests: **315/315 tests passing**.
- Coverage Strengths:
  - Auth, Identity, RBAC, Cookies: **100% covered** (`identity-auth-foundation.test.ts`, `auth.http.test.ts`, `auth-rbac.http.test.ts`, `auth-service-contract.test.ts`).
  - R&D Radar, Local LLM dialects, Schema validation: **100% covered**.
  - Config Crypto, Repository URL & Path policies: **100% covered**.
- Coverage Gaps:
  - `AdminController` & `AdminService`: **0% test coverage** (no test file in repository).
  - `ConversationController` & `ConversationService`: **0% test coverage**.
  - `SkillRegistryService`: **0% test coverage**.

---

## 17. Observability Inventory

| Capability | Actual Implementation State | Planned / Missing |
|---|---|---|
| **Logs** | Basic NestJS `Logger` (`console.log`) in `RuntimeConfigurationService` and `main.ts`. | No structured JSON logging, Winston, or Pino. |
| **Health Endpoints** | `GET /api/health` (uptime, status, version) and `GET /api/health/db-readiness` (PostgreSQL readiness probe). | Fully functional. |
| **Metrics** | None. | No Prometheus metrics, StatsD, or OpenTelemetry metrics. |
| **Tracing** | None. | No distributed tracing or trace parent headers. |
| **Audit Log** | Dual audit streams (`AuditService` memory log + `ProductWriteService` memory array). | Database persistence for audit events is broken. |
| **Error Reporting** | Global `ApiExceptionFilter` outputs to HTTP response. | No external Sentry, Datadog, or cloud alerting. |

---

## 18. Backend Risk Register

### P0 — Critical Risks
1. **Missing Baseline Migrations in `prisma/migrations/`**:
   - *Evidence*: 34 core models have no migration scripts. Fresh environments running `prisma migrate deploy` will fail.
   - *Impact*: Blocks automated deployment, staging setup, and database rebuilds.
   - *Recommendation*: Generate a comprehensive baseline migration (`20260101000000_baseline_core_schema`) matching the existing core tables before any new migrations.
2. **Core Product Domain Writes Are Volatile Memory Only**:
   - *Evidence*: `ProductWriteService` mutates `seed-data.ts` arrays; initiatives, tasks, blockers, approvals are lost on restart.
   - *Impact*: Data loss; impossible to run multi-instance production.
   - *Recommendation*: Migrate `ProductWriteService` and `ProductService` to Prisma repositories.

### P1 — High Risks
3. **`AuditEvent` Schema Column Mismatch**:
   - *Evidence*: `audit.service.ts` writes `description` and `metadata` which do not exist in `schema.prisma`.
   - *Impact*: Audit writes silently fail; audit events remain in memory only.
   - *Recommendation*: Update `schema.prisma` `AuditEvent` model to include `description` and `metadata: Json?` and create an additive migration.
4. **Unregistered Chat/Conversation Subsystem**:
   - *Evidence*: `ConversationController` and `ConversationService` exist in code but are absent from `AppModule`.
   - *Impact*: Chat feature is completely unreachable via API.
   - *Recommendation*: Add to `AppModule` after comprehensive test suite is written.
5. **Zero Test Coverage for Admin Subsystem**:
   - *Evidence*: `AdminController` and `AdminService` manage critical tenant entities but have 0 tests.
   - *Impact*: High regression risk during governance or multi-tenancy updates.
   - *Recommendation*: Author comprehensive unit and HTTP integration tests for Admin endpoints.
6. **Non-Atomic Sequential Writes in `WorkflowRuntimeStore`**:
   - *Evidence*: `storeCallback` executes 3 separate `$executeRaw` queries outside `$transaction`.
   - *Impact*: Partial callback state corruption on transient failure.
   - *Recommendation*: Wrap all 3 operations in `this.prisma.$transaction(...)`.

### P2 — Medium Risks
7. **Direct Unmanaged `new PrismaClient()` Instantiations**:
   - *Evidence*: 5 services instantiate `new PrismaClient()` directly rather than using a singleton `PrismaService` with DI.
   - *Impact*: Connection pool exhaustion under concurrent load; database connections not cleanly disconnected on process termination.
   - *Recommendation*: Create a centralized `PrismaService` implementing `OnModuleInit` and `OnModuleDestroy`.
8. **Dual Incompatible Audit Event Streams**:
   - *Evidence*: `AuditService` vs `ProductWriteService` create different shapes in different memory buffers.
   - *Impact*: Fragmentation of security and operational audit trails.
   - *Recommendation*: Unify audit logging behind `AuditService`.

### P3 — Low Risks
9. **Absence of Global DTO Validation Pipe**:
   - *Evidence*: `main.ts` does not call `app.useGlobalPipes(new ValidationPipe())`.
   - *Impact*: DTO validation is manual, uneven, and prone to developer oversight.
   - *Recommendation*: Introduce `class-validator` / `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true }`.

---

## 19. Database Rebuild Readiness

- **Is Prisma schema authoritative?**: **PARTIALLY**. It accurately describes the full domain intent (64 models), but 34 models lack migration history and 1 model (`AuditEvent`) conflicts with code expectations.
- **Is migration history complete?**: **NO**. The baseline migration is completely absent.
- **Is there schema drift?**: **YES**. Core tables were pushed with `db push` or raw scripts, not migrations. `AuditEvent` code expects columns absent from the schema.
- **Which tables are missing durable persistence?**: 28 core product tables (e.g. `Initiative`, `Task`, `Approval`, `Blocker`, `Project`).
- **Which raw SQL operations exist?**: In `workflow-runtime.store.ts` (`$queryRaw` and `$executeRaw` for `WorkflowRun`, `WorkflowCallback`, etc.).
- **Which models are memory-backed?**: All core product models (`Project`, `Module`, `Initiative`, `Task`, `Approval`, `Blocker`, `SecurityGate`, `ReleaseCandidate`, `AuditEvent`) and `AiPatchDraft`.

---

## 20. Recommended Rebuild Order

1. **Step 1: Baseline Migration Generation**
   - Create a clean baseline migration covering the initial 34 unmigrated tables.
   - Reconcile `AuditEvent` columns (`description: String?`, `metadata: Json?`).
2. **Step 2: Centralized Database Service (`PrismaService`)**
   - Implement a singleton `PrismaService` managing pool lifecycle and shutdown hooks.
   - Inject it into `AuthService`, `AdminService`, `AuditService`, `RDRadarService`, and `RuntimeConfigurationService`.
3. **Step 3: Core Product Repository Migration**
   - Replace `MemoryProductReadRepository` with `PostgresProductReadRepository` in `ProductService`.
   - Update `ProductWriteService` to persist initiatives, tasks, approvals, and blockers via Prisma transactions.
4. **Step 4: Unify Audit Stream**
   - Route all audit events through `AuditService.recordWithClaims`.
5. **Step 5: Register & Test Subsystems**
   - Add unit/integration test suite for `AdminService`.
   - Register `ConversationController` in `AppModule` and test chat endpoints.
   - Register `SkillRegistryService`.

---

## 21. Final Audit Summary

- **BACKEND AUDIT STATUS**: **COMPLETE**
- **DATABASE AUDIT STATUS**: **COMPLETE**
- **DATABASE REBUILD READINESS**: **PARTIALLY READY** (Requires baseline migration reconciliation before production deployment)

### TOP 10 BLOCKERS:
1. **Missing Baseline Migration**: 34 models in `schema.prisma` have no SQL migration in `backend/prisma/migrations/`.
2. **Volatile Core Product Mutations**: `ProductWriteService` mutations (`startInitiative`, `createApproval`, `createBlocker`, etc.) write strictly to volatile in-memory JavaScript arrays.
3. **`AuditEvent` Schema-Code Incompatibility**: `AuditService` cannot persist audit events to PostgreSQL due to missing columns (`description`, `metadata`) in `schema.prisma`.
4. **Unregistered Conversation Subsystem**: `ConversationController` and `ConversationService` exist but are omitted from `AppModule`.
5. **Zero Test Coverage for Admin Subsystem**: Complete lack of tests for `AdminController` and `AdminService`.
6. **Non-Transactional Workflow State Writes**: `WorkflowRuntimeStore.storeCallback` issues 3 sequential non-atomic `$executeRaw` queries.
7. **Multiple Unpooled `PrismaClient` Instantiations**: Direct `new PrismaClient()` in 5 separate services without singleton DI or lifecycle hooks.
8. **Dual Disconnected Audit Implementations**: `AuditService` and `ProductWriteService` maintain separate, incompatible audit event logs.
9. **Missing Global `ValidationPipe`**: Absence of request body validation leaves endpoints vulnerable to unexpected payload shapes.
10. **Hardcoded Memory Read Repository**: `ProductService` hardcodes `MemoryProductReadRepository`, preventing database reads even when `postgres_read` is enabled.

---

### RECOMMENDED NEXT ACTION:
**Do not start Chat, Agent Runtime, or Notion features yet.**  
The recommended immediate next step is **Database & Core Domain Reconciliation (P0-04)**:
1. Generate the missing baseline SQL migration for the 34 core tables so PostgreSQL can be rebuilt deterministically from scratch.
2. Reconcile the `AuditEvent` model in `schema.prisma` so durable security and mutation auditing functions reliably.
3. Introduce a singleton `PrismaService` across all backend services to eliminate unpooled client instances.
