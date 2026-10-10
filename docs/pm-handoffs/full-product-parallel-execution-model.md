# SEKHEM — Full Product Parallel Execution Model

## Purpose

SEKHEM production execution must not run as a slow sequential chain where one full epic must finish before the next epic starts.

The approved execution model is now:

```text
Full Product Parallel Tracks
```

This means each owner may start any work package when its hard dependency is already satisfied. Work packages must not wait for unrelated epics to finish.

The goal is to accelerate the full product safely, not to create a partial demo.

## Primary Execution Board

The PM must use the Google Sheet tab:

```text
Full Product Tracks
```

as the main execution board for full-program delivery.

The older tabs remain useful, but their meaning is different:

```text
Tasks = detailed historical task log
Compressed Tasks = first administrative compression
Full Product Tracks = final execution board for the full product
```

## Parallel Tracks

The PM should run these tracks in parallel whenever dependencies allow:

1. Track 1 — Runtime + Workflow
2. Track 2 — R&D Sources
3. Track 3 — AI Execution Core
4. Track 4 — Quality + Security
5. Track 5 — Evidence + Release
6. Track 6 — UI/UX
7. Track 7 — Hardware/NOS Lab Path
8. Track 8 — Deployment + UAT

Do not wait for a whole track to finish unless another work package has a hard dependency on it.

## PM Start Rules

Before starting any work package, the PM must check these columns in `Full Product Tracks`:

```text
Can Start Now?
Hard Dependency / Must Finish First
Can Run In Parallel With
```

If:

```text
Can Start Now? = YES
```

then assign the work package immediately to the relevant owner.

If:

```text
Can Start Now? = NO
```

then do not start it until the dependency listed in:

```text
Hard Dependency / Must Finish First
```

is completed.

## Immediate Start Packages

The following packages may start immediately if the board still marks them as startable:

```text
FP-01 — Workflow Runtime + Persistence
FP-02 — Runtime Controls + Blocker Center
FP-03 — R&D Source Allowlist + Connector Runtime
FP-05 — Execution Orchestrator Contract
FP-12 — Security Policy + Scans
FP-14 — Quality Matrix + Test Profiles
FP-16 — Evidence Platform
FP-21 — Hardware/NOS Lab Architecture
FP-24 — Operations Console UI Shell
```

## Hard Dependency Examples

The following examples are fixed dependency rules:

```text
FP-07 — Task Contract + Risk Classification
must not start before:
FP-06 — AI Request Policy + Redaction
```

```text
FP-08 — Tool Router + Sandbox
must not start before:
FP-07 — Task Contract + Risk Classification
```

```text
FP-10 — Controlled Draft Generation
must not start before:
FP-09 — Model/Provider Adapter
FP-15 — Quality Runner Runtime
```

```text
FP-26 — Full WF0-WF9 UAT
must not start before:
FP-10 — Controlled Draft Generation
FP-13 — Risk-Class Security Enforcement
FP-15 — Quality Runner Runtime
FP-18 — Release Factory Core
FP-22 — Lab Evidence Workflow
FP-25 — Backup / Restore / Monitoring
```

```text
FP-30 — Production Cutover
must not start before:
FP-29 — Production Go/No-Go
```

## Required Execution Path

There must be no direct execution from R&D Radar to AI coding tools.

Forbidden path:

```text
R&D Radar -> coding tool / model -> code
```

Approved path:

```text
R&D Radar
-> Execution Orchestrator
-> Risk Classification
-> Task Contract
-> Tool Router
-> Quality Runner
-> Reviewer
-> Security Gate
-> Human Approval
```

## Task Contract Required Rule

Any work package that generates code or changes files must have a Task Contract.

The contract must include at minimum:

```text
task_id
source_initiative_id
objective
risk_class
allowed_tools
allowed_files
forbidden_files
max_changed_files
acceptance_criteria
required_tests
required_reviewers
approvals_required
stop_conditions
output_schema
```

If a required field is missing, execution must be:

```text
BLOCKED
```

## Risk Classification Required Rule

No tool execution may occur before assigning a risk class.

Approved classes:

```text
Class A = safe docs, tests, UI text
Class B = controlled app, API, UI, report work
Class C = security-sensitive work
Class D = DB, architecture, release logic
Class E = hardware, NOS, live devices
```

The classification must be rules-based. AI may suggest a class, but AI must not be the authority.

Examples:

```text
auth, RBAC, approval, audit = Class C
DB migration, architecture, release logic = Class D
live hardware, NOS, device commands = Class E
```

Downgrades require approval.

## Class E Hardware/NOS Locked Execution Rule

Class E is not a failure and not a weakness.

Because SEKHEM targets SONiC/NOS and infrastructure engineering, the Hardware/NOS path must start early at the planning and validation level.

Allowed in early phase:

```text
architecture docs
lab model
manual or simulated lab evidence
read-only validation profiles
config template validation
```

Forbidden without explicit approval:

```text
live device commands
NOS changes
production network access
config push
hardware execution without rollback and expert review
```

Live hardware execution requires:

```text
Lab Approval
Device Inventory
Isolated Lab
Rollback Plan
Expert Reviewer
Evidence Capture
```

## Backend Enforcement Before UI Rule

UI may start early using mock/live hybrid when the board allows it.

However:

```text
UI is not the control layer.
Backend enforcement is the control layer.
```

Any security, policy, routing, approval, or blocking behavior implemented only in UI is not acceptable.

Backend enforcement must exist before final acceptance.

## AI Tool Routing Rule

Aider may be the default tool only for scoped edits.

OpenHands is escalation only inside sandbox.

Reviewers read diffs, test results, and evidence. Reviewers do not bypass tests or gates.

No AI coding tool may run directly from R&D Radar.

## Quality Runner Rule

Quality Runner is a controlled CPU-based executor for tests and quality tools.

It is not an AI model and does not require GPU.

Quality Runner must:

```text
receive an approved test profile
run server-side allowlisted test templates
prevent arbitrary command execution
store results and evidence
return PASS / FIX / BLOCKED
```

Tools prove. AI explains. Security Gate decides. Human approves.

## Security Gate Rule

Security Gate must enforce policy and return decision state, not just display scan results.

Security Gate may block for:

```text
Class C without Security Reviewer
Class D without design approval, rollback, or dry-run
Class E without Lab Approval
failed secrets scan
unapproved live hardware/NOS path
missing required evidence
unauthorized file changes
```

## Evidence Required Before Release Rule

No release package may be accepted without evidence.

Required evidence includes:

```text
Task Contract
Risk Class
Diff
Changed files
Test reports
Security scans
Reviewer notes
Approvals
Blockers
Release refs
SHA256
```

## Definition of Done

A work package is not complete unless:

1. The requested work was actually done.
2. Evidence is attached or recorded.
3. Required gates passed.
4. Dependencies are not broken.
5. The result is recorded in the execution board.
6. Any blocker has a reason, owner, and next action.

For PROD-05 and PROD-09 specifically, negative tests are mandatory.

The following scenarios must be proven:

```text
Missing Task Contract -> BLOCKED
Invalid Risk Class -> BLOCKED
Class C without reviewer -> BLOCKED
Class D without approval/rollback -> BLOCKED
Class E live path without approval -> BLOCKED
Unauthorized file change -> BLOCKED
Failed test -> creates blocker
Quality Runner report -> stored as evidence
Reviewer output -> stored but does not override gates
Release without required evidence -> BLOCKED
```

## Recommended Execution Waves

### Start Immediately

```text
FP-01
FP-02
FP-03
FP-05
FP-12
FP-14
FP-16
FP-21
FP-24
```

### After First Wave

```text
FP-04
FP-06
FP-07
FP-13
FP-15
FP-17
FP-22
```

### After Core Execution

```text
FP-08
FP-09
FP-10
FP-11
FP-18
FP-19
FP-20
FP-23
```

### End Program

```text
FP-25
FP-26
FP-27
FP-28
FP-29
FP-30
```

## PM Golden Rule

Do not manage SEKHEM as one sequential task list.

Manage SEKHEM as eight parallel tracks.

```text
Parallel execution where safe.
Strict dependency where required.
No shortcut around safety gates.
```
