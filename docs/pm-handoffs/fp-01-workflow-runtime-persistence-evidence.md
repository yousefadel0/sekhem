# FP-01 — Workflow Runtime + Persistence Evidence

## Package

- Package ID: FP-01
- Owner: Tasker 4
- Risk class: Class D
- PM decision: Approved with limits

## Scope Implemented

This patch replaces workflow contract runtime state writes/reads from direct in-memory arrays and Map access with a workflow runtime persistence store abstraction.

Implemented scope:

- Additive migration plan for `WorkflowRun`, `WorkflowRunState`, `WorkflowCallback`, and `WorkflowCallbackIdempotency`.
- Backend persistence store with PostgreSQL path when runtime flags allow persistence.
- In-process fallback store for local/test/dev modes only.
- Workflow event/callback controller methods converted to async.
- Workflow callback transitions and idempotency now read through the runtime store.
- Tests added for create/read-back, state transition storage, idempotency, failed state, and blocked state.

## Files Changed

- `backend/src/workflow-runtime.store.ts`
- `backend/src/automation-contract.service.ts`
- `backend/src/automation-contract.controller.ts`
- `backend/src/automation-dto.ts`
- `backend/test/workflow-runtime.store.test.ts`
- `backend/package.json`
- `backend/prisma/migrations/20260609000000_add_workflow_runtime_persistence/migration.sql`

## Migration Plan

Migration file added as a plan only:

```text
backend/prisma/migrations/20260609000000_add_workflow_runtime_persistence/migration.sql
```

The migration is additive only:

- creates new workflow runtime tables;
- creates indexes;
- creates foreign keys;
- does not drop, truncate, reset, rename, or delete any existing data.

## Migration Execution Status

```text
Migration executed: NO
DB action: NO
Runtime smoke: NOT_EXECUTED
Deployment: NO
Restart: NO
```

No `db push`, `db seed`, DB reset, live DB write, deployment, restart, runtime smoke, public trigger, schedule, or secret/env/token/cookie print was performed.

## Runtime Activation Behavior

The persistence store uses PostgreSQL only when runtime config is already in the approved guarded mode:

```text
runtimeMode = postgres_read
dataSource = postgres_read
dbWriteMode = rd_radar_only
```

Otherwise it uses an in-process fallback store for local/test/dev. This avoids activating DB writes in environments that are not explicitly configured for guarded persistence.

## Tests Added

```text
backend/test/workflow-runtime.store.test.ts
```

Coverage:

- workflow run created;
- workflow run read back;
- workflow state stored;
- latest workflow state read back;
- idempotency duplicate no-op;
- idempotency conflict rejection;
- failed workflow state stores safe error metadata;
- blocked workflow state stores safe blocker metadata.

## Rollback / Disable Note

Safe rollback before migration execution:

1. Revert the code patch files listed above.
2. Remove the migration plan file if not yet applied.
3. Keep runtime flags away from guarded write mode.
4. Do not run migration commands.

Safe disable after code deployment but before migration approval:

1. Keep `SEKHEM_DB_WRITE_MODE` out of `rd_radar_only`.
2. The backend will remain on in-process fallback for workflow runtime store.
3. No DB workflow runtime tables are used unless the guarded runtime flags activate the PostgreSQL store.

If the migration is later approved and applied, rollback must be a separate PM-approved DB rollback plan. No destructive rollback is included in this task.

## Forbidden Actions Check

PASS:

- No destructive DB migration.
- No DB reset.
- No `db push`.
- No seed.
- No migration execution.
- No live DB write.
- No deployment.
- No restart.
- No runtime smoke.
- No public trigger.
- No schedule.
- No secrets/env/token/cookie printed.
- No production claim.
