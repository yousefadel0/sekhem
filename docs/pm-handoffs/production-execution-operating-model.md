# SEKHEM — Production Execution Operating Model

## Purpose

This operating model controls how production tasks are executed with minimum credit waste, minimum rework, and high quality.

It applies to all PROD tasks in the live production board.

Primary goals:

- Use the cheapest safe execution path first.
- Avoid unnecessary Codex usage.
- Avoid broad edits.
- Avoid repeated QA rework.
- Keep PM involved only for real risk decisions.
- Keep production quality high.
- Avoid unnecessary tasker chatter and repeated PM questions.

## Source of Truth

Current production source files:

- `docs/pm-handoffs/production-runtime-release-directive.md`
- `docs/pm-handoffs/production-runtime-access-pack.md`
- `docs/product/production-plan.md`
- `docs/pm-handoffs/production-execution-operating-model.md`
- Google Sheet: `production plan`

The Google Sheet remains the live execution board. Every task status change must be reflected in the sheet.

## Default Rule: No-Codex-First

Default execution path is **No-Codex-first**.

Before using Codex credits, each tasker must classify the task:

```text
Issue ID:
Can be completed by read-only inspection only: yes/no
Can be completed by safe copy-paste commands: yes/no
Can be completed through GitHub connector small patch: yes/no
Requires Codex implementation: yes/no
Risk level: Low / Medium / High
Recommended execution path:
PM approval needed: yes/no
```

Codex should be used only when implementation truly requires coding, repo-wide reasoning, complex tests, or risky integration.

Codex should not be used for:

- docs-only work.
- PM wording.
- source-pack edits.
- Google Sheet updates.
- basic diagnosis.
- simple search or file reading.
- simple test or lint execution.
- simple GitHub connector edits.

## Anti-Chatter Operator Command Mode

Taskers must not turn simple operator execution into repeated questioning.

When a task needs PM/operator to run a safe read-only check, the tasker must:

- read `production-runtime-access-pack.md` first.
- use every known value from the access pack.
- provide the smallest possible command block.
- use placeholders only for genuinely missing operator-local values.
- never ask for values already documented in the access pack.
- never ask broad questions such as server identity, repository location, backend location, environment name, or runtime paths when the access pack has those values.
- never ask PM to scan all `/docs`.
- never provide generic paths when documented paths exist.
- ask at most one short clarification set, only for missing operator-local access details such as SSH username, port, or key path.

Known runtime values for `sekhem-app-01` must be used from the access pack:

```text
Host/IP: 100.74.93.25
Main repo path: /opt/sekhem/app/repo
Backend path: /opt/sekhem/app/repo/backend
Backend env path: /etc/sekhem/backend.env
Backend health endpoint: documented private backend health endpoint in runtime access pack
```

If only SSH user, port, or key path are missing, the tasker must not respond with a long explanation. The tasker must give a ready operator command template using the known host/IP and documented paths, with placeholders only for the missing operator-local values.

If the tasker ignores the runtime access pack and returns generic placeholders or generic paths, QA/PM must return:

```text
Decision: FIX
Reason: Runtime Access Pack ignored. Use documented Tailscale IP and paths. Do not ask broad questions.
```

## Execution Path Order

Use this order before spending Codex credits:

1. Read-only diagnosis through project sources, GitHub connector, or safe server commands.
2. Safe copy-paste command block for PM/operator execution when no judgment is required.
3. GitHub connector for small scoped patches with clear diff.
4. Codex only for real implementation work.
5. QA reviews evidence and diff before PASS.

## Safe Copy-Paste Command Protocol

Taskers may give PM/operator copy-paste commands only when the command is safe, bounded, and does not require hidden judgment.

Every command block must include:

```text
Purpose:
Where to run:
Risk level:
Expected output:
Why this is safe:
Forbidden actions check:
Commands:
```

Allowed command categories without special PM approval:

- read-only diagnostics.
- current branch/status/diff checks.
- dependency and version checks.
- lint, test, or build commands that do not deploy.
- schema validation commands that do not write or migrate.
- health checks that do not expose secrets.

Forbidden in copy-paste blocks without explicit PM approval:

- destructive delete or broad cleanup.
- database reset.
- destructive migration.
- direct production database write.
- printing environment files, secrets, tokens, keys, cookies, or connection strings.
- pushing code, force-pushing, automatic PR, or automatic merge.
- production restart.
- deployment.
- public exposure.
- public webhook activation.
- AI provider activation.
- data-volume destructive command.

If a command can change state, the tasker must mark it Medium or High risk and explain why it is required.

## GitHub Connector Patch Protocol

GitHub connector work is allowed for low-risk small patches, docs updates, QA checklist updates, and isolated edits when the diff is clear.

Rules:

- Prefer docs, checklist, and instruction updates through GitHub connector instead of Codex.
- Keep patches small and scoped to the assigned task ID.
- List changed files before and after the patch.
- Do not modify unrelated files.
- Do not perform product-runtime GitHub writes.
- Do not use connector edits for destructive DB work, Auth/RBAC core, workflow runtime core, AI provider activation, security scanner core, artifact storage core, or deployment automation unless PM explicitly approves and QA reviews the diff.

## Batch Execution Protocol

Work should run in small batches to reduce repeated context loading and PM waiting time.

Batch rules:

- Each batch should contain 3 to 5 related tasks.
- Do not open a full epic at once.
- PM intervention is required only for High risk, BLOCKED decisions, scope changes, real AI activation, public exposure, DB migration/write risk, GitHub write risk, or deployment.
- Taskers must still report each task by task ID.
- Google Sheet rows must be updated per task, not only per batch.

Daily batch report format:

```text
Batch ID:
Tasks completed:
Tasks PASS:
Tasks FIX:
Tasks BLOCKED:
Credits used if known:
Files changed:
Risks:
PM decisions needed:
Next batch:
```

## First Production Batch

Recommended first batch:

```text
Batch ID: PROD-B1 — Production Foundation Lock
Tasks:
- PROD-01.001 Confirm approved database environment and runtime flags
- PROD-01.002 Validate current Prisma schema against production runtime needs
- PROD-02.001 Define roles and permission matrix
- PROD-03.001 Freeze backend workflow callback contracts
QA Review: Batch-level QA after each task row is updated
```

Expected behavior:

- This batch is diagnosis/contract-first, not risky implementation.
- PM should intervene only for BLOCKED or High risk.
- Each task still requires its own Google Sheet update and Notes / Evidence.
- QA must review evidence, scope, and forbidden-action checks.

Recommended budget target for PROD-B1:

- PROD-01.001: target 50 credits or less.
- PROD-01.002: target 75 credits or less.
- PROD-02.001: target 50 credits or less.
- PROD-03.001: target 75 credits or less.
- QA review: target 50 to 75 credits.
- Total PROD-B1 target: 300 to 350 credits if executed cleanly.

## Risk Levels

### Low Risk

May proceed without PM approval when inside scope:

- docs.
- read-only diagnosis.
- UI wording.
- small frontend display state.
- test, lint, or build execution.
- schema validation without writes.

### Medium Risk

May proceed if inside scope, non-destructive, and evidence is clear:

- small backend endpoint implementation.
- frontend API wiring.
- validation logic.
- workflow callback shape.
- non-destructive schema addition after approved plan.

### High Risk

Requires explicit PM approval before execution:

- DB migration apply.
- DB write mode change.
- DB reset.
- destructive or irreversible action.
- Auth/RBAC enforcement that can lock out users or bypass controls.
- real AI provider activation.
- public webhook/API exposure.
- production deployment or restart.
- secrets handling.
- GitHub write action from product runtime.
- automatic deployment.

## Definition of Done Templates

### Backend Task Done

Backend task is Done only when:

- changed files are listed.
- diff summary is provided.
- relevant tests, smoke checks, or API evidence are provided.
- no secrets are exposed.
- no destructive migration or DB reset happened.
- no unrelated files were changed without justification.
- Google Sheet row is updated with Notes / Evidence.

### Frontend Task Done

Frontend task is Done only when:

- changed route/component files are listed.
- lint/build evidence is provided when applicable.
- loading, empty, error, and permission states are handled when relevant.
- UI does not expose internal IPs, raw logs, stack traces, secrets, or false production claims.
- Google Sheet row is updated with Notes / Evidence.

### Workflow Task Done

Workflow task is Done only when:

- workflow contract or callback behavior is clear.
- callback payload is sanitized.
- no public trigger is enabled unless PM-approved.
- no schedule is enabled unless PM-approved.
- no raw unsafe content is stored.
- retry, timeout, and idempotency rules are addressed when relevant.
- Google Sheet row is updated with Notes / Evidence.

### QA Task Done

QA task is Done only when:

- diff and changed files were reviewed.
- evidence was reviewed.
- scope was checked against task ID.
- forbidden actions were checked.
- decision is PASS, FIX, or BLOCKED.
- useful improvements outside task scope are listed as BACKLOG / LATER, not blocking FIX.

## Rework Control Rules

The goal is high quality with minimum rework and credit waste.

Rules:

- Work only on the assigned task ID.
- Do not implement beyond the assigned task.
- Use plan-first for Medium or High risk work.
- Keep changed files minimal.
- One to three changed files is normal.
- Four to seven changed files requires clear justification.
- More than seven changed files requires explicit explanation in the report.
- More than twelve changed files should stop for PM/QA review unless the task explicitly requires it.
- Do not touch unrelated files.
- Do not refactor unless required for acceptance or safety.
- Stop when the task objective is met.
- Improvements outside the task scope must be logged as BACKLOG / LATER, not forced as FIX.

## Credit Control Rules

Taskers must protect credits.

Rules:

- Use no-Codex path first.
- Do not ask Codex to understand the whole epic when only one task is active.
- Do not send broad prompts such as `fix everything` or `complete the whole epic`.
- If a task is burning credits without converging, stop and return findings, blocker, and recommended next action.
- Codex should receive one bounded task ID at a time.
- Codex output must include changed files, diff summary, validation commands, and evidence.

Target credit budget by task type:

| Task type | Target budget |
| --- | ---: |
| diagnosis/docs | 25-50 credits |
| frontend small | 50-100 credits |
| backend small | 100-150 credits |
| DB/Auth medium | 150-250 credits |
| workflow/security medium | 150-250 credits |
| deployment/UAT | 100-200 credits |

If a task exceeds its target budget without converging, the tasker should stop and report:

```text
Stopped due to credit/time budget.
Current finding:
Blocker:
Recommended next action:
```

## QA PASS / FIX / BACKLOG Rules

QA must be strict but must not create unnecessary rework.

- PASS: task meets acceptance criteria, code/diff/evidence are reviewed, sheet row is updated, and no forbidden action occurred.
- FIX: a real issue inside the assigned task prevents acceptance and can be fixed by the owner.
- BLOCKED: PM decision, missing access, missing approval, risky action, or external blocker prevents safe progress.
- BACKLOG / LATER: useful improvement outside the task scope. It must not block PASS.

QA must not request broad refactors, naming improvements, extra dashboards, additional metrics, or architecture expansion as FIX unless required for acceptance or safety.

## Required Tasker Pre-Execution Report

Before executing Medium or High risk work, tasker must provide:

```text
Issue ID:
Owner:
Task scope:
Risk level:
Execution path: No-Codex / copy-paste / GitHub connector / Codex
Files to inspect:
Files expected to change:
Commands expected to run:
PM approval needed: yes/no
Forbidden actions acknowledged: yes
```

Low risk work may proceed directly if it stays inside scope and follows this operating model.

## Required Completion Report

Every completed task must report:

```text
Issue ID:
Owner:
Decision: PASS / FIX / BLOCKED
Execution path used:
Changed files:
Diff summary:
Commands run:
Validation evidence:
Google Sheet row updated: yes/no
Notes / Evidence text:
Backlog / later items:
Forbidden actions check: PASS / FAIL
Next task:
```

## Final Rule

The fastest path is not maximum automation. The fastest safe path is bounded execution, no-Codex-first diagnosis, small patches, strict QA, minimal chatter, and PM approval only for real risk.
