# Stage 2 GitHub CI / Branch Protection Hardening Plan

## Status

Plan only. No implementation is approved by this document.

## Source of Truth Reviewed

Before creating this plan, Tasker 4 read the latest `main` version of:

- `docs/pm-handoffs/stage-2-tasker-instructions.md`

Current Stage 2 instructions identify GitHub CI / Branch Protection Hardening as the next Tasker 4 quality-gate plan before runtime expansion.

## Goal

Prepare a safe GitHub CI and branch protection hardening plan before any real runtime expansion.

The goal is to make every backend/frontend change pass predictable automated checks before merge, prevent direct pushes to `main`, and create a review gate that blocks accidental runtime, database, secret, or deployment changes.

## Scope

This document defines a plan only.

No GitHub Actions workflow is added here.
No branch protection setting is changed here.
No deployment or runtime change is performed here.

## Current Repository Context

The repository contains:

- Product frontend application.
- Backend package under `backend/`.
- Backend pnpm packaging guardrail already closed.
- Backend validation via pnpm is now expected to work without npm fallback.
- Vercel production/preview behavior exists for frontend deployment checks.

## Required Backend Checks

Backend CI should run from `backend/` and use pnpm only.

Required backend checks:

```bash
cd backend
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm prisma:validate
pnpm prisma:generate
```

Expected backend CI behavior:

- Fail if install fails.
- Fail if TypeScript build fails.
- Fail if lint fails.
- Fail if any test fails.
- Fail if Prisma schema validation fails.
- Fail if Prisma client generation fails.
- Do not run migrations.
- Do not run `db:push`.
- Do not run `db:seed`.
- Do not connect to production database.
- Use a dummy/non-secret `DATABASE_URL` only where Prisma validation/generation requires one.

Recommended backend CI job name:

```text
backend-ci
```

Recommended required status checks under branch protection:

```text
backend-ci / install-build-lint-test-prisma
```

## Frontend Checks

Frontend checks should run only if the repository root has the required package scripts and lockfile behavior confirmed.

Suggested frontend check discovery before implementation:

```bash
pnpm install
pnpm run build
pnpm run lint
```

If root scripts differ, the implementation task must inspect root `package.json` and use only existing validated scripts.

Recommended frontend CI job name:

```text
frontend-ci
```

Recommended frontend gate:

- Build must pass.
- Lint must pass where configured.
- No backend runtime or DB action should be performed by frontend CI.

## Secret Scanning Plan

Enable or enforce secret scanning as a repository quality gate where GitHub plan/permissions allow it.

Recommended controls:

- GitHub Secret Scanning enabled.
- Push protection enabled if available.
- Block PRs that introduce obvious credential files or secret-like values.
- Add PR template checklist requiring confirmation that no secrets are included.
- Require manual reviewer attention for any changes touching:
  - `.env*`
  - deployment scripts
  - workflow files
  - server runbooks
  - credential/config documentation

Forbidden:

- No secrets in repo.
- No secrets in docs.
- No secrets in CI logs.
- No secrets in screenshots.
- No production credentials in GitHub Actions variables/secrets until a separate PM-approved task.

## Dependency Review Plan

Add dependency review as a CI/security gate where supported.

Recommended approach:

- Use GitHub dependency review for pull requests.
- Fail PR if a dependency introduces a critical or high severity vulnerability unless PM explicitly approves a documented exception.
- Flag unexpected dependency additions.
- Require QA/PM review for dependency version changes.

Initial policy:

- No dependency upgrades in CI hardening implementation unless separately approved.
- CI implementation should only validate current dependency graph.

## PR Template Forbidden Scope Checklist

Add a pull request template in a later implementation batch.

Recommended PR template checklist:

```text
Forbidden scope checklist:
- [ ] No production deployment
- [ ] No public API exposure
- [ ] No frontend cutover unless explicitly approved
- [ ] No PostgreSQL runtime activation unless explicitly approved
- [ ] No Prisma-backed writes unless explicitly approved
- [ ] No migrations unless explicitly approved
- [ ] No db:push
- [ ] No db:seed
- [ ] No DB reset
- [ ] No restore execution on live runtime
- [ ] No n8n production workflow activation unless explicitly approved
- [ ] No R&D Collector execution unless explicitly approved
- [ ] No AI provider connection unless explicitly approved
- [ ] No source-control runtime writes
- [ ] No OpenHands execution
- [ ] No secrets in repo/docs/logs/screenshots
```

Recommended additional PR template fields:

- Scope summary.
- Files changed.
- Validation commands run.
- Runtime impact: none / planned / approved.
- DB impact: none / planned / approved.
- Deployment impact: none / planned / approved.
- Rollback plan.
- QA decision required.

## No Direct Push to Main Policy

Branch protection should prohibit direct pushes to `main`.

Recommended policy:

- Require pull request before merging.
- Require status checks to pass before merge.
- Require branch to be up to date before merge.
- Dismiss stale approvals when new commits are pushed.
- Restrict who can bypass protection.
- Disable force pushes to `main`.
- Disable deletions of `main`.
- Require linear history only if the team decides it will not conflict with current merge workflow.

## Required Review Policy

Recommended review policy:

- At least 1 approving review for documentation-only changes.
- At least 1 approving review plus TASKER QA review for backend/runtime/CI changes.
- At least PM approval for deployment, DB, restore, production access, public exposure, or secret-management changes.
- Dismiss stale approvals after new commits.
- Require conversation resolution before merge.

## CODEOWNERS Later Plan

CODEOWNERS should be planned after CI basics are stable.

Recommended future ownership areas:

```text
/backend/                  Tasker 4 / Backend owner
/.github/                  PM / Repo admin / Tasker 4
/docs/product/             PM / Relevant tasker / TASKER QA
/docs/pm-handoffs/         PM / TASKER QA
/frontend or app paths     Frontend/UI owner
```

CODEOWNERS implementation should be a separate PR after the team confirms exact GitHub usernames or teams.

## Vercel / GitHub Status Checks

Vercel checks should remain part of frontend merge confidence.

Recommended policy:

- Keep Vercel preview/deployment checks visible on PRs touching frontend/root app files.
- Do not require Vercel for backend-only documentation or backend-only validation unless the current repo/Vercel setup makes that practical.
- If Vercel status check names are stable, add them to branch protection after observing successful runs.
- If Vercel check names are unstable, document them first and avoid blocking merges until stable.

Recommended GitHub required checks after implementation stabilizes:

```text
backend-ci / install-build-lint-test-prisma
frontend-ci / build-lint
secret-scan
Dependency Review
Vercel Preview / Deployment check where applicable
```

## Merge Gate Recommendation

Recommended phased merge gate:

### Phase 1 — Observe CI

- Add CI workflows.
- Do not enable required branch protection yet.
- Let several PRs run checks.
- Confirm check names are stable.
- Confirm no false failures.

### Phase 2 — Soft Enforcement

- Require backend checks for backend changes.
- Require frontend checks for frontend changes.
- Require PR template checklist.
- Require review.

### Phase 3 — Hard Enforcement

- Enforce required status checks on `main`.
- Require PR review before merge.
- Disable direct pushes and force pushes.
- Enable required conversation resolution.
- Enable stale approval dismissal.

## Rollback / Disable Approach if CI Breaks

If CI blocks legitimate work due to workflow failure or false positive:

1. Do not bypass branch protection unless PM explicitly approves.
2. Open a short-lived CI fix branch.
3. Temporarily disable only the broken check from required checks if PM approves.
4. Keep other checks active.
5. Fix workflow issue in PR.
6. Re-enable required check after validation.
7. Document the incident and resolution.

If a workflow itself is broken:

- Revert the workflow PR if needed.
- Keep branch protection conservative until checks stabilize.
- Avoid deleting security checks without PM approval.

## QA Review Gate

TASKER QA should verify:

- This PR is documentation-only.
- No `.github/workflows` files are added.
- No branch protection setting is changed.
- No deployment is performed.
- No secrets are added.
- Backend checks match the approved backend validation commands.
- Frontend checks are conditional on current root script inspection.
- PR template checklist contains forbidden scope controls.
- Branch protection plan includes no direct push to main.
- Required review policy is explicit.
- CODEOWNERS is deferred to later.
- Vercel/GitHub status check plan is phased and safe.
- Rollback/disable approach is defined.

QA decision options:

```text
APPROVED FOR PM IMPLEMENTATION REVIEW
NOT APPROVED — FIX PLAN
```

## Forbidden Actions

This plan does not authorize:

- branch protection change
- GitHub Actions implementation
- CI workflow execution change
- deployment
- secrets
- runtime change
- production access
- PostgreSQL runtime activation
- Prisma-backed writes
- migrations
- `db:push`
- `db:seed`
- DB reset
- restore execution
- backup scheduling implementation
- R&D Collector execution
- AI provider connection
- public API exposure
- frontend cutover
- source-control runtime writes
- OpenHands execution

## Recommended Next Implementation Batch

After QA and PM approval, create a separate implementation PR for:

```text
Stage 2 GitHub CI Hardening Implementation — backend CI only first
```

Suggested first implementation scope:

- Add `.github/workflows/backend-ci.yml` only.
- Run backend pnpm validation only.
- Do not change branch protection yet.
- Observe check names and stability.

Branch protection should be implemented only after CI workflow checks are stable and PM approves enforcement.
