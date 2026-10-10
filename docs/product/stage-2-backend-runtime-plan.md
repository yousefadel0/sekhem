# Stage 2 Backend Runtime Readiness Plan — Online Runtime Activation

## Status

Documentation only. Stage 2 is planned as online runtime activation, not air-gap deployment.

This plan does not implement code, credentials, database connection, migrations, n8n, AI providers, secrets, or deployment.

## Current Baseline

The current backend is an internal MVP foundation with memory/local runtime by default, frozen read APIs, local/dev memory-only write actions, automation/AI contract placeholders, Prisma/PostgreSQL schema foundation, and normalized response/error wrappers.

Stage 2 must preserve the frozen API surface while enabling selected online runtime boundaries gradually.

## Backend Environment Variables

### Core Runtime

| Variable | Purpose | Rule |
|---|---|---|
| `NODE_ENV` | runtime environment | required |
| `PORT` | backend port | local default only |
| `SEKHEM_ENVIRONMENT` | local/staging/production | required before activation |
| `SEKHEM_RUNTIME_MODE` | runtime selector | fail closed |
| `SEKHEM_DATA_SOURCE` | memory/postgres | memory default |
| `SEKHEM_PUBLIC_API_BASE_URL` | backend public URL | staging/prod only |

### PostgreSQL / Prisma

| Variable | Purpose | Rule |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | never committed |
| `SEKHEM_DB_MIGRATIONS_ALLOWED` | migration guard | false default |
| `SEKHEM_DB_SEED_ALLOWED` | seed guard | false default |
| `SEKHEM_DB_WRITE_MODE` | none/local/staging | none default |
| `PRISMA_LOG_LEVEL` | Prisma logging | local/staging only |

### n8n / Workflow Runtime

| Variable | Purpose | Rule |
|---|---|---|
| `SEKHEM_WORKFLOW_MODE` | contract_only/dry_run/enabled | contract_only default |
| `SEKHEM_WORKFLOW_BASE_URL` | workflow runtime URL | staging only after approval |
| `SEKHEM_WORKFLOW_CALLBACK_SECRET_REF` | callback secret reference | no secret values in repo |
| `SEKHEM_WORKFLOW_TIMEOUT_MS` | adapter timeout | required before enabled mode |
| `SEKHEM_WORKFLOW_MAX_RETRIES` | retry cap | required before enabled mode |

### AI Gateway

| Variable | Purpose | Rule |
|---|---|---|
| `SEKHEM_AI_GATEWAY_MODE` | contract_only/dry_run/enabled | contract_only default |
| `SEKHEM_AI_GATEWAY_BASE_URL` | gateway URL | required only when enabled |
| `SEKHEM_AI_PROVIDER_POLICY` | routing policy | no provider secret |
| `SEKHEM_AI_TIMEOUT_MS` | gateway timeout | required before enabled mode |
| `SEKHEM_AI_MAX_TOKENS_POLICY` | usage policy reference | no secret |

### Audit / Security

| Variable | Purpose | Rule |
|---|---|---|
| `SEKHEM_AUDIT_MODE` | memory/postgres/dual_write | postgres after DB activation only |
| `SEKHEM_AUDIT_RETENTION_DAYS` | retention policy | required before staging |
| `SEKHEM_REQUEST_ID_HEADER` | correlation header | required before online runtime |
| `SEKHEM_ALLOW_EXTERNAL_ADAPTERS` | global kill switch | false default |

## PostgreSQL Activation Checklist

Pre-activation:

- Confirm target environment.
- Confirm database owner and access model.
- Confirm backup and rollback method.
- Confirm schema review.
- Confirm migration review.
- Confirm seed strategy.
- Confirm no production `DATABASE_URL` is committed.
- Confirm memory mode still works.

Local activation:

- Use disposable local PostgreSQL first.
- Run Prisma validate/generate.
- Generate migration only after approval.
- Apply migration locally only.
- Run seed dry-run before seed apply.
- Compare memory vs PostgreSQL read responses.

Staging activation:

- Use separate staging database.
- Snapshot before migration.
- Apply reviewed migration only.
- Enable read repository first.
- Run route contract tests.
- Enable one write pilot only after read mode passes.

Production activation is out of scope and requires a separate PM-approved production readiness plan.

## Prisma Runtime Activation Plan

Activation sequence:

1. Schema validation.
2. Prisma Client generation.
3. Local migration generation.
4. Local migration apply.
5. Local seed dry-run.
6. Local seed apply.
7. Prisma read repository.
8. Read contract comparison tests.
9. One low-risk write repository pilot.
10. Transactional audit validation.
11. Staging readiness review.

Rules:

- Services must not call Prisma directly.
- Repositories map Prisma records to frozen DTOs.
- Memory repository remains fallback.
- `db push` is forbidden for staging/production.
- No migration or seed command runs without explicit approval.

## Seed Strategy

Seed goals:

- Stable baseline records for internal MVP/staging.
- Route compatibility with current frontend.
- No duplicate records.

Seed rules:

- Idempotent upserts only.
- Explicit mapping functions only.
- No DTO spreading into Prisma inputs.
- Environment-gated execution.
- No production seed writes.
- Dry-run before apply.
- Summary logs only.
- No secrets in logs.

Seed groups:

1. Project/program baseline.
2. Modules and locked modules.
3. Initiatives.
4. Execution paths.
5. Tasks.
6. Approvals.
7. Security gates/findings.
8. Blockers.
9. Release candidates.
10. Audit seed events.

## Backup / Rollback

Before staging DB change:

- Snapshot database.
- Export schema version.
- Export migration history.
- Confirm restore command.
- Confirm owner approval.

Rollback levels:

| Level | Action |
|---|---|
| Config | switch runtime mode back to memory |
| App | redeploy previous backend build |
| DB | restore pre-change snapshot |
| Migration | reviewed down/compensating migration |
| Seed | remove seed batch by controlled key |

Hard rule: if audit writes or approval gates differ from memory behavior, stop activation and return to memory mode.

## API Endpoints Needed by n8n

n8n must integrate through backend-owned endpoints only.

| Endpoint | Purpose |
|---|---|
| `POST /api/workflows/events` | workflow event intake |
| `GET /api/workflows/runs` | list workflow runs |
| `GET /api/workflows/runs/:id` | read run status |
| `POST /api/workflows/runs/:id/callback` | future controlled status callback |
| `POST /api/system/events` | workflow/system status event |
| `GET /api/initiatives/:slug` | initiative context |
| `GET /api/initiatives/:slug/tasks` | task context |
| `GET /api/blockers` | blocker context |
| `POST /api/blockers` | blocker creation on workflow failure |
| `GET /api/audit-events` | audit visibility |

Rules:

- n8n must not write directly to PostgreSQL.
- n8n must not bypass approvals.
- n8n must not call frontend routes.
- n8n must use idempotency keys.
- callbacks require approved auth/secret handling later.

## R&D Collector Ingestion Endpoint Needs

R&D Collector runs in the online automation/runtime environment for now.

Needed backend contracts:

| Endpoint | Purpose |
|---|---|
| `POST /api/rd/signals/ingest` | ingest R&D signals |
| `GET /api/rd/signals` | list signals |
| `GET /api/rd/signals/:id` | inspect signal |
| `POST /api/rd/signals/:id/promote` | promote signal to initiative candidate |
| `POST /api/system/events` | collector status/failure |
| `POST /api/blockers` | blocker for unsafe/incomplete ingestion |

Ingestion rules:

- include source metadata, confidence score, and dedupe key.
- deduplicate by source plus hash/key.
- do not auto-start initiatives.
- human review required before execution approval.
- unsafe ingestion creates blocker/system event, not silent success.

## AI Gateway Runtime Boundary

AI Gateway remains behind backend contracts.

Lifecycle:

1. accept request.
2. store request and source refs.
3. validate.
4. queue.
5. process through adapter only when enabled.
6. store draft.
7. require human review.
8. audit every status change.

Rules:

- Frontend never calls AI provider directly.
- Backend never stores provider secret values.
- Provider choice is policy-driven.
- AI output is not final automatically.
- failures create audit events.
- material failures may create blockers.
- customer UI must not expose provider/vendor names unless PM approves.

## Audit Logging Requirements

Audit must cover:

- runtime mode changes.
- DB activation/deactivation.
- migration attempts.
- seed attempts.
- write actions.
- approval decisions.
- execution path selections.
- workflow intake/dispatch/callbacks.
- R&D signal ingestion.
- AI memo requests/status changes.
- system events.
- blocker creation.
- security gate exceptions.

Minimum audit fields:

- id, timestamp, actor, actor type.
- project id and initiative slug when relevant.
- action, target, module, source type, risk level.
- request/correlation id.
- before/after summary when relevant.

## Auth/RBAC Deferred or Phase Plan

Auth/RBAC remains deferred, but it must be planned before staging writes or real adapters.

Recommended sequence:

1. Role and permission matrix.
2. Auth/RBAC design.
3. Route protection middleware.
4. Write permission enforcement.
5. Approval decision permission enforcement.
6. Workflow callback authentication.
7. AI memo permission enforcement.
8. Auth event audit.

Minimum roles:

- Program Owner.
- Technical Lead.
- Security Reviewer.
- Release Manager.
- Operator.
- Viewer.
- System Adapter.

## Safe Production / Staging Separation

| Environment | Runtime rule |
|---|---|
| local | memory or disposable local PostgreSQL |
| preview | frontend preview only; no shared writes unless approved |
| staging | controlled DB/runtime activation after approval |
| production | separate plan only |

Separation rules:

- separate databases, secrets, workflow credentials, and AI policies per environment.
- no production DB access from preview.
- no staging callbacks to production API.
- feature flags fail closed.
- kill switch disables external adapters.
- documentation-only changes cannot activate runtime.

## Recommended Implementation Batches After Approval

1. Runtime Configuration Guardrails.
2. PostgreSQL Local Activation.
3. Prisma Read Repository.
4. Idempotent Seed Pipeline.
5. n8n Contract Adapter Dry-run.
6. R&D Collector Ingestion Contracts.
7. AI Gateway Dry-run Runtime.
8. Auth/RBAC Planning and Guardrails.
9. Staging Readiness Review.

## Final Recommendation

Start with:

```text
Stage 2 Batch 1 — Runtime Configuration Guardrails
```

Do not start with DB writes, migrations, n8n execution, AI provider calls, or deployment.
