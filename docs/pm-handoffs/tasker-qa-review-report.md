# TASKER QA Review Report

## 1. Files Reviewed

Reviewed repository `sekhemaifactory-creator/sekhem-product-application` for PR #20 on branch `feature/stage-2-batch-7-runtime-guardrails-postgres-read-plan`.

PR reviewed:
- PR #20 — Stage 2 Batch 7 runtime guardrails and PostgreSQL read plan
- Head SHA: `6934c6b24204df407a2400d360166c60ddaafc16`

Primary file reviewed:
- `docs/product/stage-2-batch-7-runtime-guardrails-postgres-read-plan.md`

## 2. Source Access Status

GitHub source access is working.

PR source is readable.

This review is not blocked by repository access.

## 3. Review Summary

APPROVED FOR STAGE 2 BATCH 7 IMPLEMENTATION

PR #20 is a plan-only package for Runtime Configuration Guardrails + Controlled PostgreSQL Read Activation. The plan correctly preserves current private backend memory mode, defines fail-closed runtime guardrails, stages PostgreSQL read-only activation, forbids unapproved migrations/destructive DB actions, and keeps rollback to memory mode explicit.

Approval is for PM-controlled Batch 7 implementation planning only. It does not approve PostgreSQL runtime activation, migrations, writes, R&D Collector execution, real n8n production workflows, AI provider connection, public API exposure, or frontend cutover.

## 4. PR Scope Review

PASS.

The PR adds one documentation file only:
- `docs/product/stage-2-batch-7-runtime-guardrails-postgres-read-plan.md`

No backend code, frontend code, Prisma files, migrations, deployment scripts, environment files, credentials, or service configs were changed.

No implementation happened.

## 5. Current Runtime State Review

PASS.

The plan correctly records the current Stage 2 Batch 1–6 state:
- Backend deployed from `main`.
- Clean redeploy commit is `25e377d48fd5e538d276c7207b6c008f5d7ba89b`.
- Runtime method is `systemd` service `sekhem-backend`.
- Backend path is `/opt/sekhem/app/repo/backend`.
- Runtime env file is `/etc/sekhem/backend.env` with `600 root:root` permissions.
- Private backend URL is `http://100.74.93.25:8080/api/health`.
- Public API exposure is none.
- Frontend cutover is none.

## 6. Memory Mode Preservation Review

PASS.

The plan preserves current memory/local mode as the default and rollback target:
- `SEKHEM_RUNTIME_MODE=memory`
- `SEKHEM_DATA_SOURCE=memory`
- `SEKHEM_WORKFLOW_MODE=contract_only`
- `SEKHEM_AI_GATEWAY_MODE=contract_only`
- `SEKHEM_ALLOW_EXTERNAL_ADAPTERS=false`
- `SEKHEM_AUDIT_MODE=memory`

The rollback path explicitly switches back to `SEKHEM_DATA_SOURCE=memory` and validates local/private health.

## 7. PostgreSQL Read-only Activation Concept Review

PASS.

The PostgreSQL concept is safe because it is read-only and staged:
- API response contracts remain frozen.
- Runtime guardrails come first.
- PostgreSQL read repository is enabled only after schema/data readiness checks.
- Writes remain memory-only or blocked until later approval.
- Memory mode remains immediate rollback.

The plan explicitly defines read-only as no Prisma-backed writes, no migrations during activation unless separately approved, no `db:push`, no `db:seed`, no DB reset, and no destructive commands.

## 8. Environment Variables / Guardrails Review

PASS.

The required environment variables are documented:
- `SEKHEM_ENVIRONMENT`
- `SEKHEM_RUNTIME_MODE`
- `SEKHEM_DATA_SOURCE`
- `DATABASE_URL`
- `SEKHEM_DB_WRITE_MODE`
- `SEKHEM_DB_MIGRATIONS_ALLOWED`
- `SEKHEM_DB_SEED_ALLOWED`
- `SEKHEM_AUDIT_MODE`
- `SEKHEM_ALLOW_EXTERNAL_ADAPTERS`
- `SEKHEM_REQUEST_ID_HEADER`

The fail-closed rule is explicit: `postgres_read` must not run without approved server-local `DATABASE_URL` handling.

## 9. Prisma / Runtime / Schema Checks Review

PASS.

The plan defines required checks before enabling PostgreSQL read mode:
- Prisma validate/generate.
- Schema compatibility with frozen DTOs.
- Memory mode still starts.
- No Prisma write path active.
- No migrations run.
- No seed command run.
- Logs must not print credentials.

Schema readiness covers projects, modules, locked modules, initiatives, execution paths, tasks, activity events, approvals, security gates/checks/findings, blockers, release candidates/artifacts/checklists, audit events, workflow placeholders, AI memo placeholders, and system events.

It also requires explicit read mapping and forbids returning raw Prisma models directly.

## 10. Migration Policy Review

PASS.

The migration policy is strict and safe:
- Batch 7 plan does not authorize migrations.
- No migration without reviewed migration file.
- No destructive migration without rollback plan.
- No `db push` for staging or production.
- No reset outside disposable local DB.
- No production migration in Batch 7.
- Migration execution requires separate PM approval.

## 11. Validation / QA Gate Review

PASS.

The validation checklist covers:
- memory startup
- planned `postgres_read` startup in approved environment
- local health
- private Tailscale/Nginx health
- read endpoint smoke tests
- write tests remain memory-only or blocked from DB writes
- automation/AI tests remain placeholder-only
- Prisma validate/generate
- no migration/seed/reset
- no public API
- no frontend cutover
- no secrets printed

The QA gate verifies fail-closed config, no accidental writes, rollback to memory, frozen response wrappers, normalized errors, private network posture, UFW restriction, and no forbidden commands.

## 12. Forbidden Scope Review

PASS.

The plan explicitly forbids:
- migrations
- `db:push`
- `db:seed`
- DB reset
- Prisma-backed writes
- R&D Collector execution
- real n8n production workflow
- AI provider connection
- public API exposure
- frontend cutover
- production data access
- secrets in repo/docs/logs
- Tailscale Funnel
- Exit Node
- Subnet Router
- router port forwarding

## 13. Non-Blocking Watch Items

1. The plan recommends splitting first implementation into `Stage 2 Batch 7A — Runtime Configuration Guardrails only`. This is the right sequence and should be enforced by PM.
2. `postgres_read` should not be enabled on the private server until guardrails and tests are merged and QA-reviewed.
3. `DATABASE_URL` must remain server-local only and must not appear in logs/handoffs.
4. Any seed/data preparation should be a separate approved task.

## 14. Final QA Decision

APPROVED FOR STAGE 2 BATCH 7 IMPLEMENTATION

Recommended first implementation scope:

```text
Stage 2 Batch 7A — Runtime Configuration Guardrails only
```

Do not start with PostgreSQL read activation until guardrails pass QA.

This approval does not authorize:
- migrations
- `db:push`
- `db:seed`
- DB reset
- Prisma-backed writes
- R&D Collector execution
- real n8n production workflow
- AI provider connection
- public API exposure
- frontend cutover
- production data access
- secrets in repo/docs/logs
