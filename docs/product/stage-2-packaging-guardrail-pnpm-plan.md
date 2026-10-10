# Stage 2 Packaging Guardrail — pnpm v11 Ignored-Builds Plan

## Status

Plan only. Do not implement from this document.

## Source of Truth Reviewed

This plan follows the latest `main` version of:

- `docs/pm-handoffs/stage-2-tasker-instructions.md`

Current Stage 2 instructions identify this task as the active Tasker 4 candidate:

- Stage 2 Packaging Guardrail — fix official pnpm v11 ignored-builds approval policy.

## Context

Backend runtime validation has repeatedly required an `npm` fallback because `pnpm install` on the server is blocked by pnpm v11 ignored-builds policy.

Observed blocker:

```text
ERR_PNPM_IGNORED_BUILDS
Ignored build scripts: @nestjs/core, @prisma/client, @prisma/engines, esbuild, prisma
```

Current backend runtime is otherwise healthy:

- Backend service is private.
- Backend process binds to `127.0.0.1:3001`.
- Private Nginx listener is `100.74.93.25:8080`.
- Runtime mode remains memory/private.

The goal is to make backend validation use the official repo-supported pnpm path without falling back to npm.

## Files Inspected

- `backend/package.json`
- `backend/pnpm-lock.yaml`
- root `pnpm-workspace.yaml`
- `backend/pnpm-workspace.yaml`

## Current Packaging State

### Backend package

`backend/package.json` contains backend validation scripts:

- `build`
- `lint`
- `test`
- `prisma:validate`
- `prisma:generate`

It also contains dependencies that require approved build scripts under pnpm v11:

- `@nestjs/core`
- `@prisma/client`
- `@prisma/engines`
- `esbuild`
- `prisma`

### Backend lockfile

`backend/pnpm-lock.yaml` is a backend-local pnpm lockfile with lockfile version `9.0`.

### Root workspace config

Root `pnpm-workspace.yaml` currently contains:

```yaml
allowBuilds:
  sharp: false
  unrs-resolver: false
```

This does not approve backend-required build scripts.

### Backend workspace config

`backend/pnpm-workspace.yaml` currently contains only:

```yaml
packages:
  - "."
```

This does not define pnpm v11 approved build dependencies for the backend package.

## Root Cause

The repo does not yet define the pnpm v11 build-script approval policy needed by the backend package.

Manual attempts to place approval settings temporarily on the server were not reliable because the validation path must be official and committed to the repo.

The correct fix should be repository-level and deterministic.

## Proposed Safe Repo-Level Fix

Recommended implementation should be a small packaging-only PR that updates backend pnpm configuration to explicitly approve only the exact backend dependencies that currently need build scripts.

Preferred target file:

- `backend/pnpm-workspace.yaml`

Recommended content:

```yaml
packages:
  - "."

onlyBuiltDependencies:
  - "@nestjs/core"
  - "@prisma/client"
  - "@prisma/engines"
  - "esbuild"
  - "prisma"
```

Rationale:

- Backend validation is run from `backend/`.
- `backend/` already has its own `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- The fix stays scoped to backend packaging.
- It avoids changing frontend/root workspace behavior.
- It avoids dependency upgrades.
- It avoids granting broad build-script permission.

## Alternative Considered

Update root `pnpm-workspace.yaml` instead.

Not preferred for the first implementation because:

- It may affect frontend/root package behavior.
- Current backend validation is executed from `backend/`.
- The backend has a local workspace file already.
- A backend-local fix is narrower and safer.

## Validation Path After Implementation

Validation should be run from a clean backend install state.

Required worktree validation:

```bash
cd backend
rm -rf node_modules
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma:validate
pnpm prisma:generate
```

Expected result:

- `pnpm install` passes without `ERR_PNPM_IGNORED_BUILDS`.
- `pnpm run build` passes.
- `pnpm run lint` passes.
- `pnpm run test` passes.
- `pnpm prisma:validate` passes.
- `pnpm prisma:generate` passes.

Server validation is not required for the plan PR.

## QA Gate

QA should verify:

- Plan is documentation-only.
- Proposed implementation is backend packaging-only.
- No dependency upgrade is proposed.
- No runtime deployment is proposed.
- No service restart is proposed.
- No DB action is proposed.
- No migration is proposed.
- No frontend cutover is proposed.
- No secrets are added.

QA decision options:

```text
APPROVED FOR PM IMPLEMENTATION REVIEW
NOT APPROVED — FIX PLAN
```

## Forbidden Actions

This plan does not authorize:

- dependency upgrade unless separately justified and PM-approved
- runtime deployment
- service restart
- DB action
- migration
- `db:push`
- `db:seed`
- DB reset
- frontend cutover
- production access
- secrets in repo/docs/logs
- n8n workflow execution
- R&D Collector execution
- AI provider connection
- public API exposure
- OpenHands execution

## Recommended Next Batch

After QA/PM approval, create a small implementation PR:

```text
Stage 2 Packaging Guardrail Implementation — backend pnpm v11 approved build dependencies
```

Implementation scope should be limited to:

- `backend/pnpm-workspace.yaml`
- optional docs note only if QA requires it

No runtime deployment should happen until the implementation PR is merged and PM separately asks for server validation.
