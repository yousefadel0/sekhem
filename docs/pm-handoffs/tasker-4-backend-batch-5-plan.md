# Tasker 4 — Backend Batch 5 Plan

## Batch 5 — Minimal Write Actions + Approval/Audit

Status: Planning only.

Prepared after Backend Batch 4 was merged into `feature/ux-navigation-polish`.

Batch 4 merge SHA:

```text
03bb12d2ef0374ff3a7b4ad47a84e0471767fce7
```

Do not implement Batch 5 until PM explicitly says:

```text
Start Batch 5 implementation
```

---

## 1. Batch 5 Goal

Introduce a small set of safe write actions for the Product Application backend while preserving human approval rules and creating an audit event for every write.

Batch 5 is not automation execution. It is not AI execution. It is not deployment. It is not source-control integration.

The goal is to make the product minimally interactive in local/dev only:

- Start Initiative
- Select Execution Path
- Update Task Status
- Create Approval Request
- Approve / Reject Approval
- Create Blocker
- Create Audit Event for every write

---

## 2. Strict Scope

Allowed after PM implementation approval:

- Add DTO validation for the approved write actions.
- Add write endpoints for the approved actions only.
- Persist writes through the Batch 4 repository/data access layer.
- Use local/dev Prisma/PostgreSQL only if configured and approved for dev validation.
- Keep memory fallback behavior where needed for safe local execution.
- Create audit events for every write action.
- Add tests for validation, success paths, rejection paths, and audit creation.
- Update backend README and handoff.

Forbidden:

- No production DB.
- No production writes.
- No real AI execution.
- No n8n execution.
- No source-control writes.
- No GitHub/GitLab integration.
- No OpenHands.
- No deployment.
- No secrets.
- No Batch 6 work.
- No destructive migrations or resets.
- No automatic release/deploy behavior.
- No bypass of human approval rules.

---

## 3. Planned Write Endpoints

Base path remains:

```text
/api
```

### 3.1 Start Initiative

```http
POST /api/initiatives/:slug/start
```

Purpose:
Move an initiative from `recommended` to `in_progress`.

Body DTO:

```ts
interface StartInitiativeRequestDto {
  actorName: string;
  actorRole: string;
  reason?: string;
}
```

Response DTO:

```ts
interface WriteActionResponseDto<T> {
  data: T;
  auditEvent: AuditEventDto;
  meta: ApiMetaDto;
  errors: ApiErrorDto[];
}
```

Audit event:

```text
initiative_started
```

Rules:

- Initiative must exist.
- Initiative must be in a startable state, usually `recommended` or `pending_approval` if PM approves.
- Action must not create code, run workflow, or trigger external systems.

---

### 3.2 Select Execution Path

```http
POST /api/initiatives/:slug/execution-paths/:pathId/select
```

Purpose:
Mark one execution path as selected for an initiative.

Body DTO:

```ts
interface SelectExecutionPathRequestDto {
  actorName: string;
  actorRole: string;
  approvalId?: string;
  reason?: string;
}
```

Audit event:

```text
execution_path_selected
```

Human approval rule:

- If the execution path requires approval, the request must reference an approved approval record.
- If no approved approval exists, backend returns a validation error and may create no mutation except optional denied audit if PM approves.

Rules:

- Initiative must exist.
- Execution path must belong to the initiative.
- Only one execution path can be selected at a time.
- No workflow execution starts in Batch 5.

---

### 3.3 Update Task Status

```http
PATCH /api/tasks/:id/status
```

Purpose:
Move a task across allowed status/lane states.

Body DTO:

```ts
interface UpdateTaskStatusRequestDto {
  actorName: string;
  actorRole: string;
  status: "todo" | "in_progress" | "review" | "done" | "blocked";
  lane?: "backlog" | "analysis" | "design" | "approved" | "in_progress" | "testing" | "blocked" | "done";
  reason?: string;
}
```

Audit event:

```text
task_status_updated
```

Rules:

- Task must exist.
- Status must be an allowed value.
- Lane must be compatible with status if lane is provided.
- Updating to `done` should not approve release or deploy anything.

---

### 3.4 Create Approval Request

```http
POST /api/approvals
```

Purpose:
Create a human approval request for a controlled action.

Body DTO:

```ts
interface CreateApprovalRequestDto {
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  module: string;
  priority: "low" | "medium" | "high" | "critical";
  type: "release" | "security" | "merge" | "deployment" | "exception" | "access" | "program_workspace" | "execution_path";
  requestedBy: string;
  requestedRole?: string;
  approverRole?: string;
  dueAt?: string;
}
```

Audit event:

```text
approval_requested
```

Rules:

- Project must exist.
- Initiative must exist if `initiativeSlug` is provided.
- Initial approval status is `pending`.
- Creating an approval does not execute the requested action.

---

### 3.5 Approve / Reject Approval

```http
POST /api/approvals/:id/decision
```

Purpose:
Record a human approval decision.

Body DTO:

```ts
interface ApprovalDecisionRequestDto {
  actorName: string;
  actorRole: string;
  decision: "approved" | "rejected" | "changes_requested";
  note?: string;
}
```

Audit events:

```text
approval_approved
approval_rejected
approval_changes_requested
```

Rules:

- Approval must exist.
- Approval must be pending.
- Decision must be one of the allowed values.
- Approval decision does not trigger deployment, source-control write, AI execution, or n8n execution.

---

### 3.6 Create Blocker

```http
POST /api/blockers
```

Purpose:
Create a blocker manually in the Failure / Blocker Center.

Body DTO:

```ts
interface CreateBlockerRequestDto {
  projectId: string;
  initiativeSlug?: string;
  title: string;
  description: string;
  type: "code" | "security" | "lab" | "approval" | "dependency" | "design" | "support";
  severity: "low" | "medium" | "high" | "critical";
  cause: string;
  owner: string;
  evidence: string;
  suggestedAction: string;
  nextStep: string;
  rollbackOption: string;
  maxAssistantFixAttempts?: number;
  humanReviewRequiredAfterAttempts?: boolean;
}
```

Audit event:

```text
blocker_created
```

Rules:

- Project must exist.
- Initiative must exist if `initiativeSlug` is provided.
- Initial blocker status is `open`.
- Creating a blocker does not trigger workflow or AI repair.

---

## 4. DTO Validation Plan

Batch 5 should use `class-validator` / `class-transformer` only if already compatible with the Nest setup, or use lightweight manual validators if dependency growth should be avoided.

Recommendation:

```text
Prefer DTO classes + ValidationPipe if low-risk.
```

Validation requirements:

- Required strings must not be empty.
- Enums must reject unknown values.
- IDs/slugs must be treated as path values, not trusted blindly.
- Optional dates must parse as valid ISO dates.
- Request body must not allow unknown write action fields if strict validation is enabled.

Potential setup:

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true
}));
```

If adding global validation risks breaking existing read-only endpoints, scope validation to write DTOs only.

---

## 5. Audit Event Plan

Every successful write must create one audit event in the same local transaction/unit of work where possible.

Audit event fields:

```ts
interface WriteAuditEventInput {
  projectId?: string;
  initiativeId?: string;
  action: string;
  actor: string;
  actorType: "user" | "assistant" | "system";
  target: string;
  module: string;
  details: string;
  riskLevel: "low" | "medium" | "high";
  sourceType: "manual" | "backend_aggregate";
}
```

Required actions:

- `initiative_started`
- `execution_path_selected`
- `task_status_updated`
- `approval_requested`
- `approval_approved`
- `approval_rejected`
- `approval_changes_requested`
- `blocker_created`

Audit rules:

- No write action is considered successful unless the audit event is created.
- Audit event creation failure should fail the whole write action in DB-backed mode.
- In memory mode, mutation and audit update should happen together in the same repository method.
- Do not write audit events to external systems.

---

## 6. Human Approval Rules

Batch 5 introduces approval recording only, not automated enforcement across all future systems.

Rules to enforce now:

1. Selecting an execution path that requires approval must require an approved approval reference.
2. Approving/rejecting approval must be a human actor action.
3. Release/deployment/source-control actions remain unavailable.
4. Approval does not automatically trigger any external execution.
5. Security or high-risk approval types should remain visible through existing read APIs.

Actor rules:

- `actorName` required.
- `actorRole` required.
- For decision endpoints, `actorRole` must not be `assistant`.
- PM may define exact RBAC later. Batch 5 should not implement full Auth/RBAC.

---

## 7. Repository / Runtime Assumptions

Batch 4 introduced Prisma foundation and memory runtime default.

Batch 5 should support safe local/dev behavior:

Preferred runtime plan:

```text
SEKHEM_DATA_SOURCE=memory remains default.
```

Implementation options:

### Option A — Memory write repository first

- Mutations affect in-process memory only.
- Tests are deterministic.
- No DB required.
- Prisma write implementation deferred.

This is safest if local/dev DB is not guaranteed.

### Option B — Prisma-backed writes for local/dev

- Only if PM-approved local PostgreSQL is available.
- Must not touch production DB.
- Must create audit events transactionally.
- Must keep API response shapes unchanged.

Recommendation:

```text
Start Batch 5 with memory write repository + audit tests, then add Prisma-backed writes only after PM confirms local DB availability.
```

---

## 8. API Compatibility Requirements

Existing read endpoints must remain unchanged:

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

Frontend Batch 3 fallback behavior must remain intact.

No existing UI should break if write endpoints are unused.

---

## 9. Test Plan

Required tests after implementation:

- Existing smoke tests still pass.
- Existing service tests still pass.
- Start Initiative success + audit event.
- Select Execution Path with approval success + audit event.
- Select Execution Path without required approval fails safely.
- Update Task Status success + audit event.
- Create Approval Request success + audit event.
- Approve Approval success + audit event.
- Reject Approval success + audit event.
- Create Blocker success + audit event.
- Invalid DTO values return normalized errors.
- No write endpoint triggers external systems.

Validation commands:

```bash
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma:validate
pnpm prisma:generate
```

Do not run production DB commands.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Write endpoints mutate seed data unpredictably | Tests flaky | Use repository factory/reset per test or isolated memory state |
| Approval logic becomes fake RBAC | Scope creep | Use actor fields only; defer real Auth/RBAC |
| Execution path selection implies workflow start | Product risk | Explicitly no workflow execution |
| Approval decision implies deployment/source-control action | Critical risk | Decision records only; no external side effects |
| Prisma writes require DB unavailable in local dev | Batch blocked | Keep memory runtime default |
| DTO validation changes read endpoints | Regression | Scope validation to write DTOs or test existing reads |
| Audit event missing on write | Governance failure | Tests must assert audit event count/content |

---

## 11. Suggested Compact Codex Task for Batch 5

Use only after PM explicitly says: `Start Batch 5 implementation`.

```text
Codex — Implement Backend Batch 5: Minimal Write Actions + Approval/Audit

Base branch:
feature/ux-navigation-polish

Create branch:
feature/backend-batch-5-write-approval-audit

Scope:
Minimal local/dev write actions only. Every write must create an audit event. No external side effects.

Allowed endpoints:
POST /api/initiatives/:slug/start
POST /api/initiatives/:slug/execution-paths/:pathId/select
PATCH /api/tasks/:id/status
POST /api/approvals
POST /api/approvals/:id/decision
POST /api/blockers

Allowed:
- Add write DTOs and validation.
- Add write service/repository methods.
- Use memory runtime as default.
- Add audit event creation for every write.
- Add tests for success/failure/audit behavior.
- Preserve all existing read endpoints and response shapes.
- Update backend README.
- Append Batch 5 implementation update to tasker-4-backend-contract.md.

Forbidden:
- No production DB.
- No production writes.
- No real AI execution.
- No n8n execution.
- No source-control writes.
- No GitHub/GitLab integration.
- No OpenHands.
- No deployment.
- No secrets.
- No Batch 6 work.
- No destructive migrations/reset.

Implementation rules:
- Existing GET endpoints must remain unchanged.
- Every successful write returns updated data and audit event.
- Every successful write appends an AuditEvent.
- Execution path selection requiring approval must require an approved approval.
- Approval decision records decision only; it triggers no external action.
- Create blocker creates blocker only; it triggers no AI/workflow repair.
- Keep memory runtime default unless PM separately approves local DB-backed writes.

Validation:
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma:validate
pnpm prisma:generate

Final report:
- Branch
- Files changed
- Endpoints implemented
- DTOs added
- Audit events covered
- Validation PASS/FAIL
- DB/runtime status
- Forbidden scope confirmation
- Ready for TASKER QA: YES/NO
```

---

## 12. Current Decision

Batch 5 is planned only.

No write endpoints have been created.
No approval/audit write behavior has been implemented.
No production DB or external system has been touched.

Wait for explicit PM instruction:

```text
Start Batch 5 implementation
```
