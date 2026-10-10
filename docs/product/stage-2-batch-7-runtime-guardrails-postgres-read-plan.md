# Stage 2 Batch 7 Plan — Runtime Configuration Guardrails + Controlled PostgreSQL Read Activation

## Status

Plan only. Do not implement yet.

Batch 6 is closed. This Batch 7 plan prepares the next controlled backend step: runtime configuration guardrails and PostgreSQL read-only activation planning.

No runtime change is approved by this document.

## Current Batch 1–6 Runtime State

Backend foundation completed through Stage 2 Batch 6:

- Batch 1: backend skeleton and read-only API foundation.
- Batch 2: backend QA hardening.
- Batch 3: frontend read-only backend integration with mock fallback.
- Batch 4: Prisma/PostgreSQL schema foundation.
- Batch 5: memory-only write approval/audit endpoints.
- Batch 6: private backend runtime deployment on `sekhem-app-01`.

Current runtime state:

- Branch deployed: `main`.
- Clean redeploy commit: `25e377d48fd5e538d276c7207b6c008f5d7ba89b`.
- Runtime method: `systemd` service named `sekhem-backend`.
- Backend install path: `/opt/sekhem/app/repo/backend`.
- Runtime env file: `/etc/sekhem/backend.env` with `600 root:root` permissions.
- Private backend URL: `http://100.74.93.25:8080/api/health`.
- Public API exposure: none.
- Frontend cutover: none.

## Backend Private Runtime Status

The backend is running privately on `sekhem-app-01`.

Private access path:

```text
Admin Windows / Tailscale -> 100.74.93.25:8080 -> private Nginx -> 127.0.0.1:3001 -> NestJS backend
```

Current confirmed state:

- `sekhem-backend` service is enabled and active.
- Private Nginx listener is on `100.74.93.25:8080`.
- UFW allows the private backend port from admin Tailscale IP `100.89.249.75` only.
- Health check returns `200 OK` from Windows admin through Tailscale.

## Current Memory Mode

Current backend runtime mode remains memory/local:

```text
SEKHEM_RUNTIME_MODE=memory
SEKHEM_DATA_SOURCE=memory
SEKHEM_WORKFLOW_MODE=contract_only
SEKHEM_AI_GATEWAY_MODE=contract_only
SEKHEM_ALLOW_EXTERNAL_ADAPTERS=false
SEKHEM_AUDIT_MODE=memory
```

Memory mode remains the safe fallback and rollback target.

## Target PostgreSQL Read-only Activation Concept

Batch 7 should prepare controlled PostgreSQL read-only activation only.

Target concept:

- Keep API response contracts frozen.
- Add explicit runtime guardrails before PostgreSQL is enabled.
- Use PostgreSQL for read repository only after schema and data readiness checks pass.
- Keep all writes in memory or blocked until a later approved batch.
- Preserve memory mode as immediate rollback.

Read-only means:

- No Prisma-backed writes.
- No migrations during activation execution unless separately approved.
- No `db:push`.
- No `db:seed`.
- No DB reset.
- No destructive commands.

## Required Environment Variables

Required before implementation:

| Variable | Purpose | Required value / rule |
|---|---|---|
| `SEKHEM_ENVIRONMENT` | environment marker | `local`, `staging`, or `production` |
| `SEKHEM_RUNTIME_MODE` | runtime mode | fail closed; current `memory` |
| `SEKHEM_DATA_SOURCE` | repository source | `memory` or `postgres_read` |
| `DATABASE_URL` | PostgreSQL connection | server secret only; never in repo/docs/logs |
| `SEKHEM_DB_WRITE_MODE` | write guard | `none` for Batch 7 |
| `SEKHEM_DB_MIGRATIONS_ALLOWED` | migration guard | `false` for Batch 7 |
| `SEKHEM_DB_SEED_ALLOWED` | seed guard | `false` unless separate seed batch approved |
| `SEKHEM_AUDIT_MODE` | audit sink | `memory` or `postgres_read` visibility only |
| `SEKHEM_ALLOW_EXTERNAL_ADAPTERS` | external runtime kill switch | `false` |
| `SEKHEM_REQUEST_ID_HEADER` | correlation header | define before staging |

Fail-closed rule:

If `SEKHEM_DATA_SOURCE=postgres_read` is set without a valid approved `DATABASE_URL`, backend startup must fail clearly or fall back only if explicitly configured by PM.

## Required Prisma / Runtime Checks

Before enabling PostgreSQL read mode:

1. Confirm `npx prisma validate` passes with approved server-local `DATABASE_URL` present.
2. Confirm `npx prisma generate` passes.
3. Confirm Prisma schema matches frozen API DTO requirements.
4. Confirm backend can still start in memory mode.
5. Confirm no Prisma write path is active.
6. Confirm no migrations run during read activation.
7. Confirm no seed command runs during read activation.
8. Confirm logs do not print `DATABASE_URL` or credentials.

## Schema Readiness Checks

Schema readiness must verify that PostgreSQL can represent current read DTOs for:

- Projects / programs.
- Modules and locked modules.
- Initiatives.
- Execution paths.
- Tasks.
- Activity events.
- Approvals.
- Security gates/checks/findings.
- Blockers.
- Release candidates/artifacts/checklists.
- Audit events.
- Workflow run placeholders.
- AI memo placeholders.
- System events.

Read mapping must be explicit. Services must not return raw Prisma models directly.

## Migration Policy

Batch 7 plan does not authorize migrations.

Migration policy for later implementation:

- No migration without reviewed migration file.
- No destructive migration without rollback plan.
- No `db push` for staging or production.
- No reset outside disposable local DB.
- No migration against production in Batch 7.
- Migration execution requires a separate PM approval.

## Read-only Activation Path

Recommended controlled path:

1. Keep current memory mode active.
2. Add runtime config validation.
3. Add repository mode interface if not already isolated.
4. Add Prisma read repository behind the same read interface.
5. Add DTO mappers from Prisma records to frozen response shapes.
6. Add tests comparing memory response shape with Prisma read response shape.
7. Enable `postgres_read` locally first.
8. Enable `postgres_read` on staging/private runtime only after QA approval.
9. Keep all writes disabled or memory-only.
10. Keep public API exposure disabled.

## Rollback Path Back to Memory Mode

Rollback trigger examples:

- PostgreSQL read fails.
- Response shape differs from frozen DTOs.
- Health check fails.
- Audit/approval visibility differs from memory baseline.
- Query latency is unacceptable.
- Any write path becomes active unexpectedly.

Rollback steps:

1. Set `SEKHEM_DATA_SOURCE=memory`.
2. Restart `sekhem-backend`.
3. Confirm local health: `http://127.0.0.1:3001/api/health`.
4. Confirm private health: `http://100.74.93.25:8080/api/health`.
5. Confirm route smoke tests.
6. Leave PostgreSQL untouched.
7. Record audit/system event if runtime logging exists.

## Validation Checklist

Before QA approval of implementation:

- Backend starts in memory mode.
- Backend starts in planned `postgres_read` mode in approved environment.
- `GET /api/health` passes locally.
- `GET /api/health` passes through private Tailscale Nginx.
- All read endpoint smoke tests pass.
- Existing write endpoint tests remain memory-only or explicitly blocked from DB writes.
- Automation/AI contract endpoint tests remain placeholder-only.
- Prisma validate/generate pass.
- No migration command executed.
- No seed command executed.
- No DB reset executed.
- No public API exposed.
- No frontend cutover performed.
- No secrets printed.

## QA Gate

QA must verify:

- Runtime configuration guards fail closed.
- PostgreSQL read mode cannot accidentally enable writes.
- Memory rollback works.
- Frozen API response wrappers remain unchanged.
- Error wrappers remain normalized.
- Private-only network posture remains unchanged.
- UFW/private access remains restricted.
- No forbidden commands were executed.

QA decision options:

```text
APPROVED FOR STAGE 2 BATCH 7 IMPLEMENTATION
NOT APPROVED — FIX PLAN
```

## Explicit Forbidden Actions

Forbidden in Batch 7 plan and implementation unless PM separately approves:

- No migrations.
- No `db:push`.
- No `db:seed`.
- No DB reset.
- No Prisma-backed writes.
- No R&D Collector execution.
- No real n8n production workflow.
- No AI provider connection.
- No public API exposure.
- No frontend cutover.
- No production data access.
- No secrets in repo/docs/logs.
- No Tailscale Funnel.
- No Exit Node.
- No Subnet Router.
- No router port forwarding.

## Recommended Next Step

Do not implement until QA and PM approve this plan.

After approval, the first implementation task should be:

```text
Stage 2 Batch 7A — Runtime Configuration Guardrails only
```

PostgreSQL read activation should follow only after guardrails pass QA.
