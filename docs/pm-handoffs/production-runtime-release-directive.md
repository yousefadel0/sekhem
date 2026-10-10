# SEKHEM — Production Runtime Release Directive

## PM Decision

The target is now **Production-ready Sekhem Product Application**, not demo-only, internal MVP, or vertical-slice readiness.

Production means real runtime execution with safe persistence, authenticated access, controlled workflow execution, controlled AI Gateway, approved source connectors, security scanning, artifact storage, release governance, and explicit PM production approval.

Speed is mandatory. Safety is non-negotiable.

## Current Status Handoff

Every PM assistant, tasker, QA reviewer, or bot must read and maintain:

```text
docs/pm-handoffs/current-status.md
```

This file is the fast context handoff for the current production runtime track.

It records:

- the old vertical-slice/module roadmap link and interpretation;
- the current production board link and interpretation;
- current verified state;
- open gaps;
- immediate next task;
- mandatory update requirements after every task.

After every completed, blocked, or materially changed task, the owner must update:

1. the Google Sheet `production plan` task row;
2. `docs/pm-handoffs/current-status.md`.

No bot should start from old chat context alone.

## Production 100% Definition

Sekhem is not Production 100% until all items below work together in staging and are approved for production cutover:

1. Frontend reads live backend data by default.
2. Backend uses PostgreSQL persistence for approved write/read flows.
3. Auth/RBAC protects UI routes and backend APIs.
4. Workflow executor runs controlled approved workflows and writes only through backend-approved APIs.
5. R&D source connectors operate from an approved allowlist with rate limits and sanitized extraction.
6. AI Gateway produces controlled draft outputs with redaction, citations, audit metadata, budget caps, and human review gates.
7. Security Gate performs real checks: secrets, dependency/license, SBOM/status, policy, risk score, and approval/block state.
8. Artifact storage stores release evidence, SHA256, release notes, rollback plan, and approval checklist.
9. Release Package is generated from real evidence and cannot deploy automatically.
10. Final production deployment requires explicit PM approval.

## Live Production Sheet

The live production board is the Google Sheet named `production plan`:

```text
https://docs.google.com/spreadsheets/d/1DA-B5g1ifzy8xZCQKAHNgPEDsUel-_8AGK_KQ0pDhSU/edit
```

Sheet operating rules:

- The Google Sheet is the live execution board for PROD-01 through PROD-08.
- The `.md` files in the repository are the source-of-truth instruction references.
- Every task owner must update the relevant row in the `Tasks` tab when work starts, is blocked, or is completed.
- Every task owner must update `docs/pm-handoffs/current-status.md` after every completed, blocked, or materially changed task.
- When a task is completed, `Status` must be changed to `Done` immediately.
- `Done` status is intentionally highlighted in **red** to force PM/QA attention before final acceptance.
- No task may be marked `Done` without validation evidence in `Notes / Evidence`.
- Blocked tasks must include blocker reason, owner, and required PM decision in `Notes / Evidence`.
- QA must use `PASS / FIX / BLOCKED` and must not expand scope unless there is a real blocker.

## Execution Operating Model

All taskers must follow:

```text
docs/pm-handoffs/production-execution-operating-model.md
```

This operating model is mandatory before execution and controls:

- No-Codex-first execution.
- safe copy-paste command blocks.
- GitHub connector small-patch usage.
- batch execution.
- risk levels.
- credit control.
- rework control.
- QA PASS / FIX / BLOCKED / BACKLOG handling.

Runtime-aware taskers must also follow:

```text
docs/pm-handoffs/production-runtime-access-pack.md
```

This file is mandatory for backend, PostgreSQL, workflow, automation, infrastructure, QA runtime validation, and any task that needs server/IP/path/service context.

If task execution guidance conflicts, the order of authority is:

1. `production-runtime-release-directive.md`
2. `current-status.md`
3. `production-runtime-access-pack.md`
4. `production-execution-operating-model.md`
5. `production-plan.md`
6. older Stage 2 handoff files

## Non-Negotiable Stop Conditions

Stop and escalate to PM before any of the following:

- destructive DB migration.
- DB reset.
- public API exposure.
- credentials in repository, logs, screenshots, prompts, responses, or docs.
- real AI provider activation.
- GitHub write action from product runtime.
- automatic branch, commit, PR, merge, or force-push.
- automatic deployment.
- uncontrolled workflow schedules.
- broad crawling.
- production claim before final production gate.

## Mandatory Self-Refresh

Before starting any production-runtime task, every owner must read latest `main` versions of:

- `docs/pm-handoffs/current-status.md`
- `docs/pm-handoffs/stage-2-tasker-instructions.md`
- `docs/pm-handoffs/stage-2-production-acceleration-directive.md`
- `docs/pm-handoffs/sekhem-tasker-ownership-map.md`
- `docs/pm-handoffs/production-runtime-release-directive.md`
- `docs/pm-handoffs/production-runtime-access-pack.md`
- `docs/pm-handoffs/production-execution-operating-model.md`
- `docs/product/production-plan.md`

Runtime-aware taskers must not guess server IPs, Tailscale node names, repository paths, service names, database targets, or config locations. If the runtime access pack does not include required information, the task must be returned as `BLOCKED` with the missing fields listed.

First report must include:

```text
Issue ID: <id>
Owner: <tasker>
Self-refresh: PASS
Read current-status.md: yes
Read production-runtime-release-directive.md: yes
Read production-runtime-access-pack.md: yes
Read production-execution-operating-model.md: yes
Read production-plan.md: yes
Runtime access pack checked: yes/no/not applicable
Scope understood: yes
Forbidden actions acknowledged: yes
Execution path classified: yes/no
Production Sheet row updated: yes/no
Current-status.md updated: yes/no/not yet
```

If older chat context conflicts with these files, latest `main` wins. If ownership conflicts appear, `sekhem-tasker-ownership-map.md` wins.

## Board Structure

The production board has 8 epics:

| Epic ID | Epic | Primary Owner |
| --- | --- | --- |
| PROD-01 | DB Runtime | Tasker 4 |
| PROD-02 | Auth/RBAC | Tasker 4 + Tasker 2 |
| PROD-03 | Workflow Executor | Tasker 5 |
| PROD-04 | Source Connectors | Tasker 5 + Tasker 4 |
| PROD-05 | AI Gateway | Tasker 5 + Tasker 4 |
| PROD-06 | Security Gate | Tasker 4 + Tasker 5 |
| PROD-07 | Artifact Storage + Release Package | Tasker 4 + Tasker 5 |
| PROD-08 | Deployment + UAT | Infra + QA + PM |

## Execution Order

### Sprint 0 — Production Control Freeze

Goal: lock production checklist, environments, issue IDs, owner map, rollback rules, secrets policy, and final acceptance scenario.

### Sprint 1 — DB Runtime + Auth/RBAC

Goal: PostgreSQL persistence and real access control must work before broader runtime activation.

### Sprint 2 — Workflow Executor + Source Connectors

Goal: controlled manual workflow execution and approved-source collection through backend APIs only.

### Sprint 3 — AI Gateway Controlled Runtime

Goal: cited, redacted, reviewable AI draft outputs only. No autonomous actions.

### Sprint 4 — Security Gate + Artifact Storage + Release Package

Goal: real security checks, stored artifacts, SHA256, rollback plan, approval checklist, and WF9 real release package.

### Sprint 5 — Deployment Readiness + UAT + Production Cutover

Goal: staging validation, backup/restore, monitoring, full WF0-WF9 UAT, final go/no-go.

## Final Production Acceptance Scenario

Production cannot be claimed until this scenario passes:

```text
Source collected
→ imported into R&D Radar
→ initiative started
→ execution path approved
→ AI technical memo generated
→ tasks created
→ code draft workspace prepared
→ security gate completed
→ blocker handled if needed
→ release package generated
→ artifact SHA256 verified
→ final human approval recorded
```

## QA Strict Code Review Gate

QA is a production gate, not a rubber stamp.

Before `PASS`, QA must review the actual code change evidence, not only the tasker summary. QA must inspect:

- changed files list.
- code diff or patch summary.
- whether changed files match the approved task scope.
- whether unrelated files were modified.
- whether dangerous code was added: destructive migration, DB reset, public exposure, hardcoded secrets, provider keys, raw logs, internal IP leakage, GitHub write action, automatic deployment, or bypassed approval gate.
- whether tests, lint, build, smoke tests, API checks, or workflow execution evidence match the task type.
- whether rollback/disable plan exists for DB, auth, workflow, AI, security, artifact, or deployment changes.
- whether the Google Sheet row is updated with `Notes / Evidence` before PASS.
- whether `docs/pm-handoffs/current-status.md` is updated when task state changes.

QA must return `FIX` when implementation is wrong but fixable by the owner.

QA must return `BLOCKED` when PM decision, missing access, risky approval, missing evidence, or external blocker prevents safe progress.

QA must log useful improvements outside task scope as `BACKLOG / LATER`, not forced `FIX`.

QA must not approve based only on statements like `implemented`, `looks good`, or `tested locally` without concrete evidence.

## QA Format

```text
Decision: PASS / FIX / BLOCKED
Checked:
- Scope matches task ID
- Changed files reviewed
- Code diff reviewed
- Unrelated changes absent or justified
- DB persistence / migration safety
- Auth/RBAC behavior
- API behavior
- Frontend live data and permission states
- Workflow execution and callback safety
- AI Gateway safety
- Source connector safety
- Security Gate behavior
- Artifact storage and SHA256 behavior
- Release Package evidence
- Tests/lint/build/smoke evidence
- Rollback/disable plan where required
- Audit trail
- Production Sheet row updated with Notes / Evidence
- Current-status.md updated where required
- No forbidden actions
Evidence reviewed:
Fix required:
Backlog / later:
Blockers only:
```

## Final Rule

Production speed is required, but no shortcut is allowed around DB safety, access control, code review, runtime access accuracy, secrets, AI activation, workflow execution, source safety, security gate, artifact integrity, release evidence, production sheet traceability, current-status handoff updates, rework control, credit control, or final human approval.
