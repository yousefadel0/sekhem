# Stage 2 — Production Acceleration Directive

## PM Decision

Move from demo-only work to a production-track vertical slice.

Speed is now a first-class requirement. Safety remains mandatory, but task scopes should be wider and execution should be parallel.

## Objective

Build a real product foundation where these pieces work together:

- Frontend UI
- Backend API
- PostgreSQL persistence
- n8n workflow runtime
- AI Gateway planning and later controlled activation
- GitHub readiness/status layer

This is not disposable mockup work. Demo-safe fixtures may exist only as fallback while production-track integrations are built.

## Operating Rule

Taskers have permission to work inside their assigned scope without asking PM for every file.

Stop only for true blockers: destructive DB changes, public exposure, credentials handling, AI activation, GitHub write actions, production deployment, or scope expansion.

## Mandatory Self-Refresh Rule

Before starting any task, every tasker must read the latest `main` versions of:

- `docs/pm-handoffs/stage-2-tasker-instructions.md`
- `docs/pm-handoffs/stage-2-production-acceleration-directive.md`
- `docs/pm-handoffs/sekhem-tasker-ownership-map.md`

The tasker must state in the first report:

```text
Issue ID: <id>
Owner: <tasker>
Self-refresh: PASS
Read stage-2-tasker-instructions.md: yes
Read stage-2-production-acceleration-directive.md: yes
Read sekhem-tasker-ownership-map.md: yes
```

If old chat context conflicts with these files, the latest `main` files win. If the handoff files conflict with each other, `sekhem-tasker-ownership-map.md` wins for ownership.

Do not ask PM to restate context already present in these files.

## Mandatory Issue ID Rule

Every task, report, handoff, QA review, PR, and merge request must include an Issue ID.

If the task is new and not in the Jira table, use:

```text
Issue ID: NEW / NOT IN JIRA TABLE
Reason: <why it is new>
Recommended Jira parent: <epic id if known>
```

No task proceeds without an Issue ID or explicit NEW / NOT IN JIRA TABLE marker.

## Correct Tasker Ownership Map

Use this ownership map to avoid role confusion.

### PM / Doctor Amr

Owns final business direction, scope approval, merge approval, production approval, and customer demo decision.

### Tasker 0 — System Architecture Mapper

Owns system architecture mapping, component maps, dependency maps, API/workflow contract overview, and diagrams.

Rules:

- documentation/mapping only
- no code changes
- no runtime changes
- no DB action
- no n8n execution
- must not block implementation unless a real architecture conflict exists

### Tasker 1 — UI/UX Owner

Tasker 1 owns UI/UX direction and customer-facing experience, not frontend code implementation unless PM explicitly assigns it.

Responsibilities:

- customer journey
- screen layout
- visual hierarchy
- product language
- demo flow
- UI/UX review
- customer-facing clarity

Tasker 1 provides UI/UX guidance to Tasker 2.

Tasker 1 must check that customer UI has no internal jargon, internal IPs, secrets, raw logs, stack traces, customer-facing n8n/internal vendor labels, or false production claims.

### Tasker 2 — Frontend Implementation Owner

Tasker 2 owns frontend implementation.

Responsibilities:

- frontend code
- route/page implementation
- API client wiring
- live backend vs fixture fallback indicators
- UI state handling
- frontend lint/build validation
- frontend PRs

Tasker 2 consumes:

- backend API contracts from Tasker 4
- workflow output/callback contracts from Tasker 5
- UI/UX guidance from Tasker 1

Tasker 2 must not invent conflicting backend endpoints and must not expose internal IPs, secrets, raw logs, stack traces, production claims, or customer-facing n8n/internal vendor labels.

### Tasker 4 — Backend/PostgreSQL Owner

Tasker 4 owns backend engineering and PostgreSQL persistence.

Responsibilities:

- backend API implementation
- Prisma schema and additive migrations
- backend validation and tests
- runtime backend readiness
- PostgreSQL-backed R&D Radar vertical slice
- GitHub read-only backend status API when backend-facing

Tasker 4 is the authority for backend Codex work.

### Tasker 5 — Automation/n8n Owner

Tasker 5 owns automation, n8n workflow runtime, workflow contracts, workflow factory, callback payload shape, and AI Gateway planning.

Tasker 5 must not override Tasker 4 on backend architecture or PostgreSQL persistence.

Tasker 5 must not override Tasker 2 on frontend implementation, but may coordinate with Tasker 2 when workflow output needs UI representation.

### Automation Codex / n8n Helper

Automation Codex is a helper execution agent under Tasker 5.

Responsibilities:

- n8n workflow implementation
- sanitized workflow output
- manual/internal workflow state
- backend callback contract

Automation Codex must not perform backend DB writes directly and must not create GitHub writes unless PM explicitly approves.

### QA

QA reviews outputs in fast production acceleration mode.

QA must not expand scope or slow the war room with long governance essays unless there is a real blocker.

## Coordination Rules

- UI/UX decisions: Tasker 1.
- Frontend implementation: Tasker 2.
- Backend API and DB contract: Tasker 4.
- n8n output/callback payload: Tasker 5.
- System map: Tasker 0.
- Final business decision: PM.

No helper agent should create conflicting backend endpoints without Tasker 4 alignment.
No helper agent should change automation workflow payloads without Tasker 5 alignment.
No frontend implementation should proceed against an invented API contract.

If there is a conflict, report:

```text
Issue ID: <id or NEW>
Conflict: <short description>
Owners involved: <Tasker X / Tasker Y>
Proposed fix: <one line>
Needs PM decision: yes
```

Do not open documentation loops. PM decides quickly.

## Current Vertical Slice Status

Latest QA decision:

```text
PASS — APPROVED FOR VERTICAL SLICE DEMO
```

Accepted demo path:

- Frontend route opens.
- Local loopback contract endpoint works.
- `POST /api/rd-radar/workflow-runs` returns HTTP `202`.
- Payload validation works.
- n8n `WorkflowRunSummary` contract matches accepted payload.
- GitHub readiness remains read-only/demo-safe.
- No forbidden actions were reported.

Customer-facing status labels for demo/fallback mode:

```text
Workflow callback: validated
Persistence: disabled
Mode: local contract shim
```

Current blockers:

- None for the approved vertical slice demo.

Non-blocking production follow-ups:

- PostgreSQL-backed runtime activation is in progress through Issue 1103 and Issue 1104.
- Tasker 2 will verify frontend persisted data through Issue 1105 after Tasker 4 reports persistence=true and read-back PASS.

## Immediate Direction

### Backend / PostgreSQL

Owner: Tasker 4.

Current priority:

- Issue ID 1103 — Enable `postgres_read` and `rd_radar_only` guardrails.
- Issue ID 1104 — Smoke test persisted R&D Radar writes.

### Frontend Implementation

Owner: Tasker 2.

Current priority:

- Issue ID 1105 — Verify frontend reads persisted data after Issue 1103 and Issue 1104 PASS.

Tasker 2 must keep UI customer-safe:

- no internal IPs
- no secrets
- no raw logs
- no stack traces
- no production claim unless PM approves
- no customer-facing n8n/internal vendor label

### UI/UX

Owner: Tasker 1.

Current priority:

- Issue ID 1005 — Customer demo script and screen order.
- UI/UX review support for Tasker 2 when needed.

### Automation / n8n

Owner: Tasker 5.

Current priority:

- Stand by unless backend/frontend needs payload shape change.
- Issue ID 1301 — Workflow factory template after the PostgreSQL-backed slice is confirmed or if Tasker 4 is blocked.

### QA

Owner: QA.

Current priority:

- Issue ID 1106 — Fast DB activation and rollback check after 1103, 1104, and 1105 reports.

## Parallel Work Tracks

### Track A — Backend and PostgreSQL

Owner: Tasker 4.

Goal: create persistent R&D Radar core.

Allowed now:

- Prisma schema design
- additive migrations only
- backend read/write APIs
- safe validation and tests

Forbidden without separate PM approval:

- destructive migrations
- DB reset
- public exposure
- unrelated data changes
- secrets in repo or logs

### Track B — n8n Workflow Runtime

Owner: Tasker 5.

Goal: controlled workflow that can send sanitized workflow summary to backend.

Current status:

- PASS.
- Runtime callback validated.
- Workflow export/versioning merged.

Forbidden without separate PM approval:

- public trigger
- scheduled trigger
- broad crawling
- raw HTML storage
- uncontrolled retries

### Track C — Frontend Production UI

Owner: Tasker 2.

UI/UX reviewer: Tasker 1.

Goal: production-quality UI wired to backend APIs.

Required UI:

- R&D Radar dashboard
- Evidence cards/table
- Review scoring panel
- Candidate initiative detail
- PM decision gate
- Workflow runs panel
- GitHub readiness/status panel

Rules:

- fixture fallback is allowed only as fallback
- UI must distinguish live backend data from fallback data
- no internal IPs, raw logs, secrets, or stack traces in customer UI
- no customer-facing n8n/internal vendor label

### Track D — GitHub Readiness

Owner: Tasker 4 for backend API status layer, Tasker 2 for UI display, Tasker 5 only if workflow-facing status is needed.

Goal: read-only GitHub status layer first.

Allowed now:

- repo/branch/CI status display
- backend CI check status label
- no write actions

Forbidden without separate PM approval:

- create issue
- create branch
- create PR
- commit
- merge
- force push

### Track E — AI Gateway

Owner: Tasker 5 planning, Tasker 4 backend implementation when activated, Tasker 2 for UI display after approval.

Goal: prepare controlled AI Gateway integration path.

Forbidden without separate PM approval:

- real provider call
- secret use
- automated decisions
- auto initiative or task creation

## QA Mode

Use short production acceleration QA:

```text
Decision: PASS / FIX / BLOCKED
Checked:
- scope
- DB migration safety
- API works
- UI works
- workflow works
- no forbidden actions
Blockers only.
```

## Deferred Unless Blocking

- extra governance docs
- GitHub Team upgrade
- branch protection enforcement
- restore testing
- backup scheduling
- ESXi validation
- Docker image pinning
- internal document polishing

## Success Milestone

A production-track vertical slice:

- frontend reads backend API
- backend reads/writes PostgreSQL safely
- n8n runs controlled manual workflow
- workflow summary is visible in UI
- candidate initiative draft is stored/retrieved
- PM decision gate is visible
- GitHub readiness is visible read-only

## Final Rule

The product vertical slice wins unless there is a real safety blocker.
