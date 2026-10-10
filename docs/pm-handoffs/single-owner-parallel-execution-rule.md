# SEKHEM — Single Owner Parallel Execution Rule

## Purpose

This rule updates the SEKHEM production execution model so work can move in parallel without losing accountability.

The PM must not manage SEKHEM as one sequential epic list, and must not assign shared ownership inside a single work package.

## Primary Board

The main daily execution board is:

```text
Full Product Tracks
```

Supporting tabs:

```text
Tasks = detailed historical task log
Compressed Tasks = first administrative compression
Full Product Tracks = current full-program execution board
Implementation Rules = execution and governance rules
```

## Accountability Rule

Each work package must have exactly one accountable owner.

```text
One Work Package = One Owner = One accountable delivery
```

Do not use shared owner values such as:

```text
Tasker 4 + Tasker 5
Tasker 2 + Tasker 1
Tasker 4 + QA
```

If another role is needed, record it as a hard dependency, quality gate, safety gate, acceptance condition, or reviewer requirement — not as co-owner.

## Meaning of Owner

The owner is responsible for final delivery of the work package.

The owner must:

- understand the scope;
- execute or coordinate within their authorized scope;
- report evidence;
- identify blockers;
- return PASS / FIX / BLOCKED from their side;
- remain accountable for delivery.

Other taskers may contribute as dependency owners, reviewers, or gate owners, but they are not co-owners of the work package.

## Parallel Execution Rule

The PM must start every work package where:

```text
Can Start Now? = YES
```

as long as no hard dependency blocks it.

The PM must not wait for a full epic to finish before starting another epic.

Run tracks in parallel:

1. Runtime + Workflow
2. R&D Sources
3. AI Execution Core
4. Quality + Security
5. Evidence + Release
6. UI/UX
7. Hardware/NOS Lab Path
8. Deployment + UAT

## Dependency Rule

If a work package says:

```text
Can Start Now? = NO
```

then it must not start until the dependency in:

```text
Hard Dependency / Must Finish First
```

is complete.

## Role Ownership Guide

### Tasker 0

Owns architecture, system maps, dependency maps, component diagrams. No code, runtime, DB, or n8n execution.

### Tasker 1

Owns UI/UX direction, customer journey, screen layout, product language, and customer-facing clarity. Not frontend implementation owner.

### Tasker 2

Owns frontend implementation, routes/pages, API client wiring, UI states, frontend lint/build, console UI, review UI, validation center UI, and release factory UI.

### Tasker 4

Owns backend API, PostgreSQL, Prisma, backend validation, security backend, evidence backend, Tool Router backend enforcement, Task Contract backend, and Quality Runner backend integration.

Tasker 4 is the backend/Codex-work owner.

### Tasker 5

Owns automation, n8n, workflow runtime, workflow contracts, callback payload shape, workflow factory, AI Gateway planning, and Execution Orchestrator planning contracts.

Tasker 5 must not override Tasker 4 in backend or PostgreSQL.

### QA

Owns quality gates, validation, PASS/FIX/BLOCKED reviews, UAT, and evidence review. QA does not own implementation unless PM explicitly assigns it.

### PM

Owns business scope, final approval, production Go/No-Go, cutover approval, exception approval, and customer decisions.

## Safety Rules That Do Not Change

Parallel execution does not bypass safety gates.

The following remain forbidden unless explicitly approved:

- direct R&D Radar to Aider/OpenHands execution;
- task execution without Task Contract;
- tool routing without Risk Class;
- UI-only enforcement;
- release without evidence;
- production cutover without PM approval;
- Class E live hardware/NOS action without lab approval;
- backend/API invention by frontend;
- automation payload change without workflow owner alignment;
- backend persistence change outside Tasker 4 ownership.

## PM Daily Operating Rule

At the start of each execution cycle, the PM must:

1. Open `Full Product Tracks`.
2. Filter packages with `Can Start Now? = YES` and `Status = Not Started`.
3. Assign each package to its single owner.
4. Review packages with `Can Start Now? = NO` and track their hard dependency.
5. When dependency closes, start the next package immediately.
6. Record blockers with owner, cause, evidence, next step, and PM decision need.

## Golden Rule

```text
Parallel execution where safe.
Strict dependency where required.
Single owner for accountability.
No shortcut around safety gates.
```
