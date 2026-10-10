# Tasker 4 — Backend Batch 4 Plan

## Batch 4 — Prisma / PostgreSQL Foundation

Status: Original plan plus implementation status. Backend Batch 4 implementation has started and the Prisma/PostgreSQL foundation is complete for TASKER QA review.

Prepared after Backend Batch 3 was merged into `feature/ux-navigation-polish`.

Batch 3 merge SHA:

```text
350af032e56a14b5ddbe90a72d62fed9ba9871d0
```

PM has explicitly approved Backend Batch 4 implementation.

```text
Start Batch 4 implementation
```

---

## 1. Batch 4 Goal

Move the backend from in-memory seed services toward a local/dev PostgreSQL-ready persistence foundation while preserving the existing read-only API contract.

Batch 4 should introduce Prisma and PostgreSQL structure safely, without production access and without changing frontend behavior.

Primary goals:

- Add Prisma schema draft.
- Add local/dev PostgreSQL structure.
- Add seed script for current Product Application demo data.
- Add repository/data access layer behind existing services.
- Preserve existing API response shapes.
- Keep all existing GET endpoints stable.
- Keep frontend mock fallback behavior from Batch 3 intact.

---

## 2. Strict Scope

Allowed in Batch 4 after PM implementation approval:

- Add Prisma packages inside `/backend`.
- Add `/backend/prisma/schema.prisma`.
- Add `/backend/prisma/seed.ts`.
- Add placeholder `DATABASE_URL` only to `/backend/.env.example`.
- Add local/dev PostgreSQL documentation.
- Add repository/data-access layer that can support Prisma later.
- Keep read-only REST endpoints.
- Keep existing API response wrappers and DTO shapes.
- Add tests that verify API output shape remains compatible with Batch 1/2/3.

Forbidden in Batch 4:

- No production database.
- No production credentials.
- No real secrets.
- No destructive migrations.
- No write endpoints.
- No Auth.js / Keycloak.
- No n8n.
- No AI/RAG.
- No GitHub/GitLab source-control integrations.
- No OpenHands.
- No deployment logic.
- No frontend redesign.
- No removal of frontend mock fallback.
- No Batch 5 approval/audit write actions.
- No Batch 6 automation/AI contracts.

---

## 3. Recommended Batch 4 Strategy

Use a staged persistence foundation rather than switching all runtime reads to DB immediately.

Recommended safe path:

```text
Step 1: Add Prisma schema and seed script.
Step 2: Add repository/data access abstraction.
Step 3: Keep current in-memory seed service as runtime default.
Step 4: Add optional local Prisma-backed read path behind config only if stable.
Step 5: Preserve all API DTOs and response shapes.
```

Reason:

- Batch 3 frontend now consumes backend APIs with fallback.
- API shape stability is more important than immediate DB runtime.
- Prisma schema should support current API contract, not force a DTO rewrite.
- Local DB wiring can be introduced safely without touching production.

Recommended runtime default for Batch 4:

```text
SEKHEM_DATA_SOURCE=memory
```

Optional local-only switch after tests:

```text
SEKHEM_DATA_SOURCE=prisma
```

If this switch adds complexity or risk, defer runtime Prisma switching and deliver only schema + seed + repository layer in Batch 4.

---

## 4. Prisma Schema Draft Scope

Initial Prisma entities should map to the current Product Application journey and existing backend DTOs.

Core entities:

- Project
- Module
- LockedModule
- Initiative
- EvidenceSource
- ExecutionPath
- Task
- ActivityEvent
- Approval
- TechnicalMemo
- CodeDraftWorkspace
- SandboxedArtifact
- SecurityGate
- SecurityCheck
- SecurityFinding
- Blocker
- ReleaseCandidate
- ReleaseArtifact
- ReleaseApprovalChecklistItem
- RollbackPlan
- RDSignal
- RepositoryPreview
- WorkflowPreview
- KnowledgeDocument
- InfrastructureNode
- ServiceStatus
- SupportRequest
- SupportArticle
- AuditEvent

User/RBAC entities should be included only if low risk and clearly marked as foundation-only:

- User
- Role
- Permission
- UserRole
- RolePermission

Do not implement Auth or permission enforcement in Batch 4.

---

## 5. Schema Design Rules

Prisma schema should follow these rules:

- Use stable string IDs or UUID defaults consistently.
- Keep `slug` fields indexed where frontend/API routes depend on slugs.
- Add indexes for common lookups:
  - projectId
  - initiativeId
  - initiativeSlug where denormalized
  - moduleId
  - slug
  - status
  - priority
  - riskLevel
  - createdAt
- Use enums only where values are stable.
- Use `Json` fields sparingly for metadata, not as a substitute for core relations.
- Prefer explicit relations for core Product Application journey entities.
- Include `createdAt` and `updatedAt` on mutable entities.
- Keep audit events append-oriented.
- Do not model production-only infrastructure assumptions yet.

---

## 6. Local / Dev PostgreSQL Structure

Batch 4 should document local/dev DB setup without requiring production credentials.

Allowed `.env.example` placeholders:

```text
DATABASE_URL=postgresql://sekhem_user:sekhem_password@localhost:5432/sekhem_product_dev?schema=public
SEKHEM_DATA_SOURCE=memory
```

Notes:

- Placeholder values only.
- No real secrets.
- No production URL.
- No shared cloud DB.

Optional Docker/local DB file should be PM-approved before adding.

Recommendation:

```text
Do not add docker-compose unless PM confirms local PostgreSQL should be containerized in Batch 4.
```

---

## 7. Seed Script Plan

Seed script should load current demo journey data into the Prisma model.

Seed content must match current UI/backend journey:

- Community SONiC Sovereign Program
- Core Platform
- R&D Radar
- AI CTO / Repo Intelligence
- Release Factory / Security Gate
- Locked Advanced Modules
- EVPN BGP Validation Pack
- Evidence items
- Execution paths
- Technical Memo placeholder
- Kanban tasks
- Activity events
- Approvals
- Code Draft Workspace placeholder
- Sandboxed artifacts
- Security Gate
- Security checks
- Security findings
- Blockers
- Release Candidate
- Release artifacts
- Release checklist
- Rollback plan
- R&D signals
- Repository preview placeholder
- Workflow preview placeholder
- Knowledge documents placeholder
- Infrastructure/service status placeholder
- Support placeholder
- Audit events

Seed script must be idempotent if possible.

Preferred approach:

```text
upsert by stable id/slug
```

---

## 8. Repository / Data Access Layer Plan

Introduce a small data access layer to protect controllers/services from direct Prisma coupling.

Suggested structure after PM approval:

```text
backend/src/data-access/
  product-read.repository.ts
  memory-product-read.repository.ts
  prisma-product-read.repository.ts
  product-read.repository.types.ts
```

Repository contract should support current read operations:

- listProjects
- getProjectDashboard
- listModules
- getModuleBySlug
- listInitiatives
- getInitiativeBySlug
- getInitiativeTasks
- getInitiativeActivity
- getInitiativeBlockers
- listApprovals
- getSecurityGateById
- listReleaseCandidates
- getReleaseCandidateById
- listBlockers
- listAuditEvents

Runtime default should remain memory unless PM approves DB-backed runtime in the same batch.

---

## 9. API Compatibility Requirements

Batch 4 must not break existing frontend integration.

Required compatibility checks:

- Existing endpoint paths remain unchanged.
- Existing response wrapper remains unchanged.
- Existing DTO field names remain stable.
- Existing seed IDs and slugs remain stable.
- Existing frontend fallback remains untouched.
- Existing smoke tests continue to pass.
- Batch 3 frontend build/lint must still pass.

Approved endpoints to preserve:

```text
GET /api/health
GET /api/projects
GET /api/projects/:id/dashboard
GET /api/modules
GET /api/modules/:slug
GET /api/initiatives
GET /api/initiatives/:slug
GET /api/initiatives/:slug/tasks
GET /api/initiatives/:slug/activity
GET /api/initiatives/:slug/blockers
GET /api/approvals
GET /api/security-gates/:id
GET /api/release-candidates
GET /api/release-candidates/:id
GET /api/blockers
GET /api/audit-events
```

---

## 10. Testing Plan

Batch 4 should extend existing tests but not replace them.

Required tests after implementation:

- Existing Backend Batch 2 smoke tests still pass.
- Existing service tests still pass.
- Seed script can run locally without external services beyond local/dev PostgreSQL if DB mode is included.
- Prisma schema validates.
- Prisma generate passes.
- API response shape remains stable.

Recommended validation commands:

```bash
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
```

If Prisma is added:

```bash
pnpm prisma validate
pnpm prisma generate
```

If local DB is available and PM approves DB validation:

```bash
pnpm prisma db push
pnpm prisma db seed
```

Do not run destructive migration commands.

---

## 11. Package / Script Plan

Potential backend scripts after PM approval:

```json
{
  "prisma:validate": "prisma validate",
  "prisma:generate": "prisma generate",
  "db:push": "prisma db push",
  "db:seed": "tsx prisma/seed.ts"
}
```

Do not add scripts that target production.

Do not add destructive reset scripts unless PM explicitly approves.

---

## 12. Handoff Requirements for Batch 4 Implementation

When PM later authorizes implementation, the implementation branch should update:

```text
docs/pm-handoffs/tasker-4-backend-contract.md
```

Append only. Do not replace existing contract sections.

Required handoff update:

- Branch name
- Files changed
- Prisma schema added or not
- Local/dev PostgreSQL approach
- Seed script status
- Repository/data access layer status
- Whether runtime remains memory or supports Prisma switch
- Validation commands and PASS/FAIL
- Explicit forbidden scope not touched
- Open questions for Batch 5

---

## 13. Suggested Compact Codex Task for Batch 4

Use this only after PM explicitly says: `Start Batch 4 implementation`.

```text
Codex — Implement Backend Batch 4: Prisma / PostgreSQL Foundation

Base branch:
feature/ux-navigation-polish

Create branch:
feature/backend-batch-4-prisma-postgres

Scope:
Prisma/PostgreSQL foundation only. Preserve existing read-only API response shapes.

Allowed:
- Add Prisma to /backend.
- Add backend/prisma/schema.prisma.
- Add backend/prisma/seed.ts using current seed data.
- Add backend/.env.example DATABASE_URL placeholder only.
- Add repository/data access abstraction.
- Keep existing in-memory seed runtime as default unless DB mode is low risk.
- Add Prisma validate/generate scripts.
- Update backend README with local/dev DB instructions.
- Update docs/pm-handoffs/tasker-4-backend-contract.md by appending Batch 4 implementation status only.

Forbidden:
- No production DB.
- No real secrets.
- No destructive migrations.
- No write endpoints.
- No Auth.js/Keycloak.
- No n8n.
- No AI/RAG.
- No Git/GitHub/GitLab/OpenHands integration.
- No deployment logic.
- No frontend redesign.
- No removal of mock fallback.
- No Batch 5 or Batch 6 work.

Implementation rules:
- Preserve all existing API endpoints and DTO response shapes.
- Keep all existing backend smoke/service tests passing.
- If Prisma-backed runtime is added, guard it behind SEKHEM_DATA_SOURCE=prisma and keep memory as default.
- Use placeholder local/dev DATABASE_URL only.
- Do not run or add destructive migration/reset scripts.

Validation:
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma validate
pnpm prisma generate

If local/dev DB validation is approved and available:
pnpm prisma db push
pnpm run db:seed

Final report:
- Branch
- Files changed
- Prisma schema status
- Seed status
- Runtime data source default
- Validation PASS/FAIL
- Forbidden scope confirmation
- Ready for TASKER QA: YES/NO
```

---

## 14. Implementation Status

Batch 4 implementation has started and the foundation work is complete for QA review.

Implemented:

- Prisma dependencies and scripts were added under `/backend`.
- `backend/prisma/schema.prisma` was added and validates.
- Foundation-only models were added for the current Product Application journey, including locked modules, preview entities, support entities, and user/RBAC foundation entities.
- `backend/prisma/seed.ts` exists as a safe placeholder. Full DTO-to-Prisma seed mapping is deferred until PM-approved local DB validation.
- Repository/data-access interfaces were added.
- `MemoryProductReadRepository` remains the runtime default.
- Existing read-only API routes and response shapes remain unchanged.
- No migrations, destructive DB commands, production DB access, write endpoints, Auth.js/Keycloak, n8n, AI/RAG, Git/GitLab/OpenHands integration, deployment logic, or frontend redesign were added.

Deferred:

- Prisma-backed runtime repository.
- Full idempotent seed data mapping.
- Local/dev DB push and seed validation.
- Auth/RBAC enforcement.
- Write endpoints and approval/audit persistence workflows.

Validation command set for QA:

```text
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma:validate
pnpm prisma:generate
```
