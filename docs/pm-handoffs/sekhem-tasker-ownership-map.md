# SEKHEM Tasker Ownership Map

## Purpose

This file is the ownership source of truth for active SEKHEM execution.

Every tasker must read this file before starting a task and must state the relevant Issue ID and owner in the first report.

## Mandatory Issue ID Rule

Every task, report, handoff, QA review, PR, and merge request must include an Issue ID.

Format:

```text
Issue ID: <existing Jira issue id>
Task: <task title>
Owner: <tasker>
Status: PASS / FIX / BLOCKED / WAITING
```

If the task is new and not in the Jira table, use:

```text
Issue ID: NEW / NOT IN JIRA TABLE
Reason: <why it is new>
Recommended Jira parent: <epic id if known>
```

No task should proceed without identifying whether it is mapped to an existing Jira Issue ID or is new.

## Current Ownership Map

### PM / Doctor Amr

Owns:

- final business direction
- priority calls
- scope approval
- merge approval
- DB/public/AI/GitHub-write approval
- customer demo decision

### Tasker 0 — System Architecture Mapper

Owns:

- current system architecture map
- component map
- ownership map
- dependency map
- API and workflow contract overview
- architecture diagrams

Rules:

- documentation/mapping only
- no code changes
- no runtime changes
- no DB action
- no n8n execution
- must not block implementation unless a real architecture conflict exists

### Tasker 1 — UI/UX Owner

Owns:

- customer journey
- screen layout
- visual hierarchy
- product language
- demo flow
- UI/UX review
- customer-facing clarity

Rules:

- does not own frontend code implementation unless PM explicitly assigns it
- does not change backend
- does not change DB/runtime
- provides UI/UX notes to Tasker 2
- checks that customer UI has no internal jargon, no internal IPs, no secrets, no raw logs, no stack traces, no customer-facing n8n/internal vendor label, and no false production claim

### Tasker 2 — Frontend Implementation Owner

Owns:

- frontend code
- route/page implementation
- API client wiring
- live backend vs fixture fallback indicators
- UI state handling
- frontend lint/build validation
- frontend PRs

Consumes:

- backend API contracts from Tasker 4
- workflow output/callback contracts from Tasker 5
- UI/UX guidance from Tasker 1

Rules:

- must not invent conflicting backend endpoints
- must not expose internal IPs, secrets, raw logs, stack traces, or customer-facing n8n/internal vendor labels
- fixture fallback is allowed only as fallback
- must clearly show live backend vs fallback state when relevant

### Tasker 4 — Backend/PostgreSQL Owner

Owns:

- backend APIs
- Prisma schema
- additive migrations
- PostgreSQL persistence
- runtime backend readiness
- backend validation/tests
- GitHub read-only backend status API when backend-facing

Rules:

- destructive DB changes require PM approval
- DB migration/write execution requires PM approval
- no db:push/db:seed/DB reset unless explicitly approved
- no secrets printed

### Tasker 5 — Automation/n8n Owner

Owns:

- n8n workflow runtime
- workflow contracts
- callback payload shape
- workflow factory
- AI Gateway planning
- automation helper coordination

Rules:

- no public trigger without PM approval
- no scheduled trigger without PM approval
- no AI provider call without PM approval
- no GitHub write without PM approval
- no direct DB writes from n8n unless explicitly approved
- does not override Tasker 4 backend/DB authority
- does not override Tasker 2 frontend implementation authority

### QA — Fast Review Owner

Owns:

- fast PASS / FIX / BLOCKED review
- scope check
- forbidden-action check
- merge readiness check

Rules:

- no long governance reports unless there is a real blocker
- blockers only unless non-blocking note is important

## Coordination Rules

- UI/UX decisions: Tasker 1.
- Frontend implementation: Tasker 2.
- Backend/API/DB contract: Tasker 4.
- n8n workflow/payload contract: Tasker 5.
- Architecture map: Tasker 0.
- Final business decision: PM.

If there is a conflict:

```text
Issue ID: <id or NEW>
Conflict: <short description>
Owners involved: <Tasker X / Tasker Y>
Proposed fix: <one line>
Needs PM decision: yes
```

Do not open documentation loops. PM decides quickly.

## Current Active Issue Ownership

- Issue ID 1103 — Tasker 4 — Enable postgres_read and rd_radar_only guardrails.
- Issue ID 1104 — Tasker 4 — Smoke test persisted R&D Radar writes.
- Issue ID 1105 — Tasker 2 — Verify frontend reads persisted data.
- Issue ID 1106 — QA — DB activation and rollback check.
- Issue ID 1005 — PM + Tasker 1 — Customer demo script and screen order.
- Issue ID 1301 — Tasker 5 — Workflow factory template.
- Issue ID 1701 — Tasker 0 — Current system architecture map.

## Reminder for Every New Task

The first line must include:

```text
Issue ID: <id>
Owner: <Tasker>
Self-refresh: PASS
```

Taskers must read:

- `docs/pm-handoffs/stage-2-tasker-instructions.md`
- `docs/pm-handoffs/stage-2-production-acceleration-directive.md`
- `docs/pm-handoffs/sekhem-tasker-ownership-map.md`

Latest `main` files win over old chat context.
