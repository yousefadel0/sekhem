# Current PM Operating Rules

Issue ID: PROD-CURRENT-STATUS
Owner: PM War Room
Self-refresh: PASS

## Canonical bot memory entrypoint

The canonical bot memory entrypoint is:

```text
docs/pm-handoffs/current-status.md
```

No PM assistant, tasker, QA reviewer, bot, Codex session, GitHub connector task, or operator-command workflow should start from any other PM handoff file unless `current-status.md` explicitly points to it through the Governance Index.

Purpose:

- keep bot memory synchronized across conversations;
- avoid stale Stage 2 or vertical-slice context overriding current production execution;
- make every bot know the current verified state, open gaps, next active task, and mandatory update rule;
- keep `production readiness` claims blocked until final gates pass.

## Active handoff first

Every PM assistant, tasker, QA reviewer, or bot must read this file first:

```text
docs/pm-handoffs/current-status.md
```

Purpose:

- remember the project history quickly;
- distinguish the old vertical-slice/module roadmap from the current production board;
- know the current verified state;
- know the next active task;
- update the handoff after each task so the next bot can continue without context loss.

## Trackers

### Old Master Action Plan — vertical slice / module roadmap

Old tracker:

```text
https://docs.google.com/spreadsheets/d/1JHX9CYf4NxUj7OkSKIvClCMWzIx7wRR0nCQomdzTXto/edit
```

Meaning:

```text
This was the 13-module vertical slice / module roadmap.
It is useful historical context, but it is not the live production board.
```

### Current Production Board — live execution board

Current live tracker:

```text
https://docs.google.com/spreadsheets/d/1DA-B5g1ifzy8xZCQKAHNgPEDsUel-_8AGK_KQ0pDhSU/edit
```

Meaning:

```text
This is the active production runtime release board.
All PROD tasks must be updated here.
```

## Mandatory update rule

After every task is completed, blocked, or materially changed, the tasker/bot must update:

1. the live Google Sheet `production plan` row;
2. `docs/pm-handoffs/current-status.md`.

The current-status update must include:

```text
Task ID:
Decision: PASS / FIX / BLOCKED
What changed:
Evidence:
Forbidden actions check:
Remaining gaps:
Next task:
Production readiness claim: YES/NO
```

No task may be marked `Done` without Notes/Evidence in the production board.

## Current execution gate

Current active production status:

```text
WAVE 1 VERIFIED — WAVE 2 EXECUTION OPEN / PRODUCTION READINESS NO
```

Immediate next track:

```text
PROD-03.008-B — Recover/Revalidate 1802 n8n E2E Workflow in Current Runtime
```

Important correction:

```text
Do not describe PROD-03.008-B as creating the first n8n workflow from scratch.
Old Phase 1 Issue 1802 was CLOSED/PASS historically.
The current task is to recover/revalidate that 1802 workflow/callback path in the current runtime.
```

## Anti-Branching Rule

Do not create side tasks unless there is a real blocker, safety risk, dependency, or explicit PM approval.

## UI/UX Change Control

No customer-facing UI/UX change without:

- Issue ID
- Change Request
- before/after
- customer impact
- PM approval

Unapproved design drift is FIX REQUIRED.

## Task Reports

Every task report must explain:

- what the customer sees
- what the customer understands
- what is not yet claimed
- what was updated in `current-status.md`

## Ownership

PM: business direction and approval.
Tasker 0: architecture.
Tasker 1: UI/UX and customer language.
Tasker 2: frontend.
Tasker 4: backend and PostgreSQL.
Tasker 5: n8n and automation.
QA: review only.

## Safety Boundaries

Unless explicitly approved:

- no production deployment
- no public trigger
- no scheduled trigger
- no AI provider call
- no GitHub write from product runtime
- no auto-apply
- no direct DB write from n8n
- no destructive DB action
- no secrets in prompts, logs, docs, UI, or outputs
- no internal IPs or internal/vendor labels in customer-facing UI
- no full production claim

## n8n Confidence Gate

PM War Room may only say that the workflow is fully working in the current runtime after current evidence proves:

- workflow exists or prior 1802 workflow is recovered/recreated from documented evidence
- workflow runs end-to-end without manual patching
- current execution evidence is captured
- `executionId` is captured if available from n8n/runtime
- backend callback result is accepted
- persistence/evidence result is visible in approved workflow-runs endpoint
- sanitized execution summary exists
- controlled failure test exists or previous validation is explicitly referenced and revalidated
- no public trigger
- no scheduled trigger
- no credentials printed
- no direct DB write from n8n
- no GitHub write

Old Issue 1802 historical PASS is valid context, but not enough by itself for current production-runtime PASS.

## AI Patch Assistant Gate

AI code generation is not production-active until a controlled workspace has:

- request draft
- generated or preview draft/diff view
- approve
- reject
- stop
- no auto-apply
- no GitHub write
- no deployment
- audit trail
- persistence behavior verified after restart

Current Wave 1 evidence proves controlled draft/artifact/audit behavior. It does not prove real AI-generated code diff, real provider activation, repo write, deployment, or production readiness.

## Merge Rule

No merge without QA PASS and explicit PM approval.
After merge, report merge SHA and update:

1. the live production board;
2. `docs/pm-handoffs/current-status.md`.
