# SEKHEM Product Documentation Index

Issue ID: PROD-DOCS-001
Owner: Tasker 0 / PM War Room
Status: Active product-docs index / Production readiness NO

## Purpose

This file is the entrypoint for `docs/product`.

Use it to decide which product documents are active, which are production references, and which are legacy/archive references.

This file does not replace:

1. `docs/pm-handoffs/current-status.md`
2. Google Sheet `production plan`
3. `docs/pm-handoffs/production-runtime-release-directive.md`
4. `docs/pm-handoffs/full-product-parallel-execution-model.md`

The live production state remains in `current-status.md` and the Google Sheet.

## Rules for bots and taskers

1. For project status, read `docs/pm-handoffs/current-status.md` first.
2. For product-doc selection, read this file before reading other `docs/product/*` files.
3. Do not treat `stage-2-*`, `internal-mvp-*`, or demo files as active production status.
4. Use legacy files only as historical evidence or background.
5. Do not claim production readiness from any product doc unless final production gate and PM Go/No-Go are recorded.

## Active Product Docs

These files may be used for current product understanding, with the notes below.

| File | Purpose | Status | Action |
| --- | --- | --- | --- |
| `docs/product/production-plan.md` | PROD-01 through PROD-08 production plan, acceptance criteria, safety gates | Active, but live execution is the Google Sheet | Keep; reconcile with `Full Product Tracks` when planning |
| `docs/product/product-application-journey.md` | Customer-facing journey from R&D Radar to Release Factory | Active product narrative, Phase 1 oriented | Keep; update later to reflect production runtime and Full Product Tracks |
| `docs/product/route-map.md` | Product route map / route inventory | Active reference, may lag implementation | Keep; refresh after UI route changes |
| `docs/product/screen-map.md` | Product screen map / screen inventory | Active reference, may lag implementation | Keep; refresh after UI/UX production changes |

## Production Reference Docs

These files contain useful production context, but they are not the live state.

| File | Purpose | Status | Action |
| --- | --- | --- | --- |
| `docs/product/issue-1503-backend-production-readiness-gap-analysis.md` | Backend production readiness gap analysis | Reference | Keep; summarize active gaps in `current-status.md` only |
| `docs/product/issue-1504-staging-to-production-deployment-plan.md` | Staging-to-production deployment planning | Reference for PROD-08 | Keep; refresh before deployment/UAT work |
| `docs/product/issue-1507-production-track-readiness-summary.md` | Earlier production-track readiness summary | Reference | Keep; do not use as live status |
| `docs/product/issue-1960-ai-gateway-controlled-architecture.md` | AI Gateway controlled architecture | Reference for AI Gateway / PROD-05 / FP AI docs | Keep; align with FP-05, FP-06, FP-08, FP-09, FP-10 |
| `docs/product/backend-api-freeze.md` | MVP backend API inventory and limitation reference | MVP reference only | Keep; do not treat as current production API contract |
| `docs/product/stage-2-ci-branch-protection-plan.md` | CI/branch protection planning | Reference | Keep as QA/security background |
| `docs/product/stage-2-restore-readiness-plan.md` | Restore readiness planning | Reference for PROD-08 / FP-25 | Keep; refresh before restore validation |
| `docs/product/stage-2-monitoring-backup-scheduling-plan.md` | Monitoring/backup scheduling plan | Reference for PROD-08 / FP-25 | Keep; merge key rules into active operations docs later |
| `docs/product/stage-2-monitoring-backup-implementation-runbook.md` | Monitoring/backup implementation runbook | Operational reference | Keep; validate before runtime use |
| `docs/product/stage-2-packaging-guardrail-pnpm-plan.md` | pnpm/build guardrail | Build reference | Keep as build safety reference |
| `docs/product/stage-2-post-reboot-resilience-hardening-runbook.md` | Post-reboot resilience runbook | Operational reference | Keep; validate before runtime use |
| `docs/product/stage-2-rd-radar-source-allowlist-controlled-collection-plan.md` | R&D Radar source allowlist controlled collection | Source connector reference | Merge useful rules into PROD-04 / FP-03 docs later |
| `docs/product/stage-2-workflow-architecture.md` | Stage 2 workflow architecture | Workflow reference | Merge useful rules into PROD-03 docs later |

## Legacy / Archive Docs

These files are historical. They must not override current production instructions.

| File | Reason | Action |
| --- | --- | --- |
| `docs/product/internal-mvp-closure-report.md` | Internal MVP closure, not production runtime status | Archive/reference only |
| `docs/product/final-demo-script.md` | Demo script, not production readiness evidence | Archive/demo only |
| `docs/product/stage-2-online-runtime-brief.md` | Stage 2 runtime brief, superseded by production runtime handoffs | Archive/reference only |
| `docs/product/stage-2-backend-runtime-plan.md` | Stage 2 backend plan, superseded by PROD-01/PROD-02/PROD-03 planning | Archive after extracting reusable runtime constraints |
| `docs/product/stage-2-batch-9-operational-workflow-skeleton-plan.md` | Historical workflow skeleton plan | Archive after extracting lessons |
| `docs/product/stage-2-batch-11-rd-collector-controlled-plan.md` | Historical Batch 11 collector plan | Archive after merging source rules |
| `docs/product/stage-2-batch-11b-rd-collector-limited-source-plan.md` | Historical limited-source plan | Archive after merging source rules |
| `docs/product/stage-2-batch-11c-rd-collector-one-page-execution-plan.md` | Historical one-page execution plan | Archive |
| `docs/product/stage-2-batch-11e-rd-collector-three-url-controlled-plan.md` | Historical three-url plan | Archive |
| `docs/product/stage-2-batch-11f-human-review-evidence-scoring-plan.md` | Historical evidence scoring plan | Merge useful scoring rules into FP-16 / FP-14 later |
| `docs/product/stage-2-batch-11g-candidate-initiative-proposal-rules-plan.md` | Historical candidate proposal rules | Merge useful rules into R&D-to-orchestrator docs later |
| `docs/product/stage-2-batch-11h-pm-approval-workflow-rules-plan.md` | Historical PM approval workflow rules | Merge useful approval rules into active gate docs later |

## Cleanup policy

Do not delete legacy product docs yet.

Use this sequence:

1. Add/maintain this index.
2. Mark documents as Active, Production Reference, or Legacy/Archive.
3. Extract reusable rules from legacy docs into the active governance or FP/PROD docs.
4. Only after extraction, optionally move legacy docs into an archive folder in a separate docs-only task.

## Current product-docs assessment

Decision:

```text
FIX — classification added; no product runtime gap closed.
```

Assessment:

```text
The folder has high-value product knowledge but mixed freshness.
It is not safe as a direct bot entrypoint without this index.
Active product docs exist, but many Stage 2 and MVP files are historical.
```

Forbidden actions check:

```text
PASS — docs-only classification; no code, DB, runtime, deployment, AI provider activation, secrets, or production readiness claim.
```

Production readiness claim:

```text
NO
```
