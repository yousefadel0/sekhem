# SEKHEM — FP-05 Execution Orchestrator Contract

## Package

`FP-05` — Execution Orchestrator Contract

## Owner

Tasker 5

Tasker 5 is the single accountable owner for this planning/contract package.

Tasker 5 owns:

- workflow contracts;
- callback payload shape;
- n8n coordination planning;
- workflow factory planning;
- AI Gateway planning;
- Execution Orchestrator planning contracts.

Tasker 5 does not override Tasker 4 backend/API/PostgreSQL authority.

## Status

Contract freeze / planning artifact.

No runtime execution is enabled by this file.

## Purpose

This document freezes the Execution Orchestrator contract for SEKHEM full-product parallel execution.

It defines the approved contract path from R&D Radar signal to controlled task execution without allowing direct model/tool execution.

The Execution Orchestrator exists to turn approved product/runtime signals into governed, reviewed, evidence-backed work packages.

## Golden Rule

Parallel execution where safe.

Strict dependency where required.

Single owner for accountability.

No shortcut around safety gates.

## Explicit Forbidden Path

The following path is forbidden:

```text
R&D Radar -> Aider / OpenHands / model / coding tool -> code
```

R&D Radar findings must never directly call a coding tool, model, patcher, repository writer, deployment process, n8n execution, or production runtime action.

## Approved Execution Path

The approved path is:

```text
R&D Radar
-> Execution Orchestrator
-> Risk Classification
-> Task Contract
-> Tool Routing Decision
-> Quality Runner / Reviewer Loop
-> Security Gate
-> Human Approval
-> Controlled implementation only if separately approved
```

The Execution Orchestrator may prepare draft contracts, recommended paths, risk labels, blocker states, and evidence requirements.

It must not execute code changes by itself.

## Lifecycle

### 1. Signal Intake

Input may come from approved SEKHEM sources such as:

- R&D Radar candidate;
- approved source connector finding;
- PM-created initiative;
- QA blocker;
- security finding;
- manual PM task request.

The intake must include a source reference and customer-safe summary.

### 2. Eligibility Check

The orchestrator checks whether the signal is eligible for execution planning.

Required checks:

- source is approved;
- no secrets included;
- no raw logs or raw HTML required;
- no public trigger implied;
- no direct tool execution requested;
- owner can be identified;
- package or task ID can be assigned;
- dependency and safety gates can be identified.

If eligibility fails, the result is `BLOCKED`.

### 3. Risk Classification

Every executable task must receive a risk class before any tool routing.

Approved classes:

| Class | Meaning | Examples |
| --- | --- | --- |
| Class A | Safe docs, tests, UI text | docs, test-only updates, customer wording |
| Class B | Controlled app/API/UI/report work | bounded backend endpoint, UI wiring, report generator |
| Class C | Security-sensitive work | auth, RBAC, approval, audit, secrets handling logic |
| Class D | DB, architecture, release logic | schema, persistence, release factory, rollback logic |
| Class E | Hardware/NOS/live-device path | SONiC/NOS lab, device configs, live hardware |

Risk class must be rules-based.

AI may suggest a class, but AI is not the authority.

Downgrades require approval.

### 4. Task Contract Creation

No code-generating or file-changing work may proceed without a Task Contract.

The Task Contract is the execution boundary.

### 5. Tool Routing Decision

After the Task Contract and risk class are approved, the Tool Router may select an allowed execution path.

Tool routing must fail closed when the contract is missing, incomplete, or unsafe.

### 6. Draft Execution / Review Loop

Allowed outputs before human approval:

- draft plan;
- draft diff proposal;
- test profile proposal;
- security review checklist;
- blocker recommendation;
- release evidence requirement.

The orchestrator must not apply changes automatically.

### 7. Quality and Security Gates

Execution output must pass the required gates before acceptance.

Required evidence depends on risk class and task type.

### 8. Human Approval

Human approval is mandatory before:

- applying a code change;
- merging;
- enabling runtime behavior;
- activating AI provider;
- public trigger exposure;
- DB write/migration;
- deployment/restart;
- production cutover.

## AI Request Contract

The AI Request Contract defines allowed draft-only AI planning requests.

### Required Fields

```yaml
action_id: string
source_initiative_id: string
request_type: enum
requested_by: string
owner: string
objective: string
input_summary: string
source_refs: array
risk_class: Class A | Class B | Class C | Class D | Class E
allowed_output_type: enum
forbidden_outputs: array
redaction_required: boolean
citations_required: boolean
human_review_required: true
provider_activation_allowed: false
budget_limit_ref: string | null
stop_conditions: array
evidence_required: array
```

### Allowed Request Types

```text
summarize_signal
propose_task_contract
classify_risk
propose_tool_route
review_draft_contract
prepare_blocker_summary
prepare_evidence_checklist
```

### Forbidden Request Types

```text
generate_and_apply_code
commit_code
open_pull_request
merge_branch
deploy_release
execute_shell_command
call_provider_without_pm_approval
crawl_unapproved_source
read_or_print_secrets
```

### AI Request Rules

- AI output is draft-only.
- AI must not be treated as approval authority.
- AI must not call tools directly.
- AI must not receive secrets, tokens, cookies, full env values, credentials, raw logs, raw HTML, or connection strings.
- AI must not activate a real provider unless PM explicitly approves the provider activation task.
- AI must cite source references when producing recommendations.

## Execution Path Contract

The Execution Path Contract describes how a signal becomes an executable task.

### Required Fields

```yaml
execution_path_id: string
source_initiative_id: string
package_id: string
track_id: string
owner: string
current_state: enum
next_gate: enum
hard_dependencies: array
can_run_in_parallel_with: array
risk_class: Class A | Class B | Class C | Class D | Class E
task_contract_required: true
tool_router_required: true
quality_runner_required: boolean
security_gate_required: boolean
human_approval_required: true
```

### States

```text
intake_received
eligibility_check_passed
risk_classified
task_contract_drafted
task_contract_approved
tool_route_selected
draft_output_created
review_requested
quality_check_passed
security_gate_passed
human_approved
blocked
rejected
closed
```

### Rules

- `task_contract_approved` is required before any file-changing work.
- `tool_route_selected` is required before any tool execution.
- `quality_check_passed` is required before acceptance where tests are required.
- `security_gate_passed` is required for Class C/D/E and release-sensitive work.
- `human_approved` is required before merge, deployment, public exposure, provider activation, DB writes, or production claim.

## Task Contract Minimum Fields

Any work package that changes files or generates code must include at minimum:

```yaml
task_id: string
package_id: string
source_initiative_id: string
objective: string
owner: string
risk_class: Class A | Class B | Class C | Class D | Class E
allowed_tools: array
allowed_files: array
forbidden_files: array
max_changed_files: integer
acceptance_criteria: array
required_tests: array
required_reviewers: array
approvals_required: array
stop_conditions: array
output_schema: object
evidence_required: array
rollback_or_disable_plan_required: boolean
```

If any required field is missing, execution result must be:

```text
BLOCKED
```

## Tool Router Contract

The Tool Router decides which execution route is allowed after Task Contract approval.

### Tool Router Input

```yaml
task_contract_id: string
risk_class: Class A | Class B | Class C | Class D | Class E
requested_tool: string
allowed_tools: array
requested_files: array
allowed_files: array
forbidden_files: array
requires_runtime_access: boolean
requires_db_access: boolean
requires_provider_access: boolean
requires_network_or_public_trigger: boolean
requires_deployment_or_restart: boolean
```

### Tool Router Output

```yaml
route_decision: allow | block | require_pm_approval | require_tasker4_gate | require_security_gate
allowed_tool: string | null
reason: string
reviewers_required: array
evidence_required: array
forbidden_actions_check: PASS | FAIL
```

### Default Routing Rules

- Docs-only work may route to GitHub connector or manual doc patch.
- Tests/lint/build may route to Quality Runner when an approved test profile exists.
- Backend/API/DB work requires Tasker 4 gate.
- Security-sensitive work requires Security Reviewer gate.
- AI provider activation requires PM approval.
- Aider/OpenHands may not execute directly from R&D Radar.
- OpenHands is escalation only inside sandbox when approved.
- Missing Task Contract means `block`.
- Unauthorized files mean `block`.
- Public trigger, schedule, DB write, deployment, restart, or provider activation without approval means `require_pm_approval` or `block`.

## Reviewer Loop Contract

Reviewer Loop ensures draft outputs do not bypass quality gates.

### Reviewer Input

```yaml
review_id: string
task_contract_id: string
draft_output_ref: string
changed_files: array
diff_ref: string | null
test_evidence_ref: string | null
security_evidence_ref: string | null
risk_class: Class A | Class B | Class C | Class D | Class E
reviewer_role: PM | QA | Tasker4 | Tasker5 | SecurityReviewer | HumanReviewer
```

### Reviewer Output

```yaml
review_decision: PASS | FIX | BLOCKED
review_notes: string
required_fixes: array
blocker_result: object | null
evidence_refs: array
human_approval_required: boolean
```

### Reviewer Rules

- Reviewers inspect evidence; they do not bypass tests or safety gates.
- AI reviewer output is advisory only.
- Human approval is required for all state-changing work.
- QA PASS cannot override PM approval required for production cutover, provider activation, DB migration/write, public exposure, or deployment.

## Review State Contract

### States

```text
draft_created
review_requested
review_in_progress
fix_required
blocked
qa_passed
pm_approval_required
approved_for_merge
closed
```

### Rules

- `qa_passed` means technical acceptance only.
- `pm_approval_required` remains required when PM-owned gates exist.
- `approved_for_merge` requires the applicable PM/QA protocol.
- `closed` requires board update and evidence.

## Blocker Result Contract

Any blocked execution path must return a structured blocker.

### Required Fields

```yaml
blocker_id: string
package_id: string
task_id: string | null
owner: string
blocking_owner: string | null
risk_class: Class A | Class B | Class C | Class D | Class E | null
reason: string
customer_safe_summary: string
pm_decision_needed: string | null
next_action: string
forbidden_action_risk: boolean
evidence_refs: array
created_at: string
```

### Blocker Rules

- Blocker reason must be specific.
- Owner must be named.
- Next action must be actionable.
- Customer-facing text must be sanitized.
- Blockers must not include secrets, raw logs, stack traces, internal IPs, tokens, cookies, credentials, full env values, connection strings, or raw provider output.

## Evidence Requirements

Every execution path must specify evidence required before completion.

Minimum evidence set:

```text
Task Contract
Risk Class
Changed files or no-change statement
Diff or no-diff statement
Test report or test-not-required reason
Security scan/gate result where required
Reviewer notes
Approval refs
Blocker refs if applicable
Release refs if applicable
Forbidden actions check
Board update reference
```

## Stop Conditions

Execution must stop and return `BLOCKED` when any of the following occurs:

- missing Task Contract;
- missing risk class;
- missing owner;
- missing allowed files list for file-changing work;
- requested files outside allowed scope;
- requested tool not in allowed tools;
- direct R&D Radar to Aider/OpenHands/model/code path requested;
- AI provider activation requested without PM approval;
- public trigger requested without PM approval;
- schedule requested without PM approval;
- DB write, migration, reset, seed, or `db push` requested without PM and Tasker 4 approval;
- backend/API/PostgreSQL change requested outside Tasker 4 authority;
- deployment or restart requested without PM approval;
- secrets/env/token/cookie/credential printing required;
- release requested without evidence;
- Class C without security reviewer where required;
- Class D without design approval and rollback/disable plan;
- Class E live hardware/NOS action without lab approval.

## Draft-Only and Human Approval Enforcement

All Execution Orchestrator outputs are draft-only until reviewed and approved by the required human gate.

The orchestrator may recommend:

- task contracts;
- risk classes;
- tool routes;
- reviewer loops;
- blocker results;
- evidence requirements.

The orchestrator must not:

- apply code;
- run Aider/OpenHands;
- call AI provider;
- execute n8n workflow;
- trigger public webhook;
- schedule automation;
- write to DB;
- deploy or restart;
- claim production readiness.

Human approval is required before any action changes repository, runtime, DB, public exposure, provider state, release state, or production status.

## Backend and Tasker 4 Gate

Tasker 4 remains the backend/API/PostgreSQL authority.

Execution Orchestrator contracts may define intended backend requirements, but must not implement backend behavior or override Tasker 4 gates.

Backend persistence, API enforcement, Tool Router backend integration, Task Contract backend storage, and Quality Runner backend integration require Tasker 4 ownership or approval.

## FP-05 Acceptance Criteria

FP-05 is complete when:

- AI Request Contract is defined;
- Execution Path Contract is defined;
- Task Contract minimum fields are defined;
- Risk Classification requirement is defined;
- Tool Router Contract is defined;
- Reviewer Loop Contract is defined;
- Review State Contract is defined;
- Blocker Result Contract is defined;
- Evidence requirements are defined;
- forbidden direct execution path is explicitly blocked;
- all outputs are draft-only;
- human approval is mandatory;
- no runtime execution occurred;
- board row has Notes / Evidence.

## Forbidden Actions Check

Confirmed by this document:

- no AI provider activation;
- no Aider/OpenHands execution;
- no direct R&D Radar to coding tool;
- no workflow live execution;
- no DB write;
- no backend override of Tasker 4 authority;
- no deployment/restart;
- no secrets/env/token/cookie print;
- no production claim.
