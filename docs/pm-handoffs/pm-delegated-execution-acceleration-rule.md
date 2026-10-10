# SEKHEM — PM Delegated Execution Acceleration Rule

## Purpose

This rule reduces PM waiting loops during SEKHEM Production Runtime Release execution while keeping production safety intact.

Taskers, QA, and Infra must not escalate routine validation housekeeping to PM when the action is clearly inside the approved task scope and does not change runtime state.

## Mandatory Read Before Commands

Before any Tasker, QA owner, Infra owner, Operator, Codex session, or GitHub connector patch proposes or runs commands, they must read and acknowledge the current PM handoff and production source files, including this file.

Minimum mandatory files:

1. `docs/pm-handoffs/production-runtime-release-directive.md`
2. `docs/pm-handoffs/production-execution-operating-model.md`
3. `docs/pm-handoffs/production-runtime-access-pack.md`
4. `docs/pm-handoffs/pm-qa-closure-protocol.md`
5. `docs/pm-handoffs/pm-delegated-execution-acceleration-rule.md`
6. `docs/product/production-plan.md`

If a task has extra task-specific source docs, those must be read too.

## Delegated Decisions Allowed Without Additional PM Approval

The following actions are allowed without another PM approval when they are already inside the current approved task scope:

1. Recreate an isolated validation worktree.
2. Remove a dirty isolated validation worktree.
3. Install dependencies inside an isolated worktree only when a lockfile exists.
4. Approve package build scripts inside an isolated worktree only when needed for test execution.
5. Rerun already approved lint, build, or test commands.
6. Retry a failed validation command after fixing the isolated validation environment only.
7. Patch legacy tests inside approved task files when validation proves implementation behavior changed correctly and no scope expansion is needed.
8. Report concise `PASS / FIX / BLOCKED` after validation.

## Conditions

Delegated decisions are allowed only if all conditions below remain true:

- The current task ID does not change.
- The action stays inside the approved task scope.
- The main runtime repo is not mutated.
- No production or staging runtime state is changed outside the approved validation environment.
- No DB action occurs.
- No migration, reset, seed, or `db push` occurs.
- No deployment occurs.
- No restart occurs.
- No public exposure changes.
- No secrets, environment values, tokens, cookies, keys, credentials, or connection strings are printed.
- No frontend/backend scope expansion occurs.
- No production-readiness claim is made.
- No next task is started automatically.

## Must Escalate to PM

Escalate to PM only when at least one of the following is true:

1. The action touches the main runtime repo.
2. A broader baseline or unrelated files would be included.
3. A schema, Prisma, or migration change is needed.
4. A DB write, reset, seed, or `db push` is needed.
5. A deployment or restart is needed.
6. Environment provisioning or secrets handling is needed.
7. The task scope must expand.
8. A security, product, RBAC, workflow, AI Gateway, source connector, or release behavior decision is required.
9. A new task must be started.
10. Any forbidden action might be required.

## QA Reporting Format

QA and Taskers must use the shortest useful format:

```text
Decision: PASS / FIX / BLOCKED
Issue ID:
One-line reason:
Evidence:
Forbidden actions check:
Next action:
```

Long reports should be used only when a real PM decision is required or a blocker has material risk.

## Operational Rule

If a patch is ready and the only blocker is validation environment setup inside an isolated worktree, Tasker/Infra should fix the isolated validation environment and rerun approved tests without asking PM again.

Examples of delegated validation housekeeping:

- dependency install inside isolated worktree when lockfile exists;
- approving package build scripts inside isolated worktree for test execution;
- recreating a dirty isolated worktree;
- rerunning the same approved test commands;
- updating legacy tests to pass authenticated actor/context when the production implementation already changed correctly inside approved scope.

## Current PROD-02.005 Example

For `PROD-02.005`, if validation is running in an isolated backend worktree and dependency installation requires package build scripts, Tasker/Infra may approve those package build scripts inside the isolated worktree only and rerun the approved validation tests.

If tests fail only because legacy tests do not pass the new authenticated actor context, Tasker may patch the relevant legacy test file inside the approved task scope without escalating to PM.

They must not mutate `/opt/sekhem/app/repo`, deploy, restart, touch DB, print secrets, or start `PROD-02.006`.

## Supersession

This rule supersedes older overly cautious behavior where Taskers escalated routine isolated validation housekeeping to PM.

It does not supersede production safety gates, forbidden-action rules, QA acceptance, or PM authority over scope, deployment, real AI activation, DB changes, public exposure, and final go/no-go decisions.
