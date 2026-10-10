# SEKHEM — FP-02 Runtime Controls + Blocker Center Contract

## Package

`FP-02` — Runtime Controls + Blocker Center

## Owner

Tasker 5

Tasker 5 is the single accountable owner for this automation/workflow control contract.

Tasker 5 owns runtime-control planning for workflow retry, timeout, failed-workflow routing, blocker result shape, and sanitized workflow error handling.

Tasker 5 does not override Tasker 4 backend/API/PostgreSQL authority.

## Status

Contract/control definition artifact.

No runtime execution is enabled by this file.

## Purpose

This document defines the FP-02 runtime controls and Blocker Center contract aligned with FP-05 Execution Orchestrator contracts.

It freezes the planning rules for:

- retry limits;
- timeout policy;
- failed workflow blocker routing;
- sanitized blocker result shape;
- no infinite retry;
- no unsafe/raw error exposure.

Backend persistence, API enforcement, DB storage, and production runtime implementation require Tasker 4 dependency/gate.

## Scope

Allowed scope for FP-02:

- workflow/automation control contract;
- retry and timeout policy definition;
- blocker routing rules;
- sanitized blocker result shape;
- evidence requirements;
- stop conditions;
- Tasker 4 backend dependency notes.

Out of scope:

- DB write;
- Prisma/schema change;
- backend API implementation;
- n8n live activation;
- public webhook/trigger;
- schedule activation;
- AI provider activation;
- Aider/OpenHands execution;
- deployment/restart;
- production claim.

## Relationship to FP-05

FP-05 defines the Execution Orchestrator contract.

FP-02 defines how orchestrated workflow execution is controlled when it encounters retries, timeouts, failures, and blockers.

FP-02 must obey FP-05 rules:

```text
R&D Radar
-> Execution Orchestrator
-> Risk Classification
-> Task Contract
-> Tool Routing Decision
-> Quality Runner / Reviewer Loop
-> Security Gate
-> Human Approval
```

The forbidden path remains blocked:

```text
R&D Radar -> Aider / OpenHands / model / coding tool -> code
```

## Runtime Control Lifecycle

### 1. Control Intake

A workflow control event may be created by:

- manual/internal workflow callback;
- Execution Orchestrator draft path;
- QA blocker;
- Security Gate blocker;
- Quality Runner failure result;
- PM/operator manual blocker entry.

The event must include:

```yaml
control_event_id: string
package_id: string
task_id: string | null
workflow_run_id: string | null
source: manual_callback | orchestrator | quality_runner | security_gate | qa | pm
owner: string
risk_class: Class A | Class B | Class C | Class D | Class E | null
status: running | failed | blocked | timed_out | cancelled | succeeded
customer_safe_summary: string
occurred_at: string
```

### 2. Control Evaluation

The control layer evaluates:

- whether retry is allowed;
- whether timeout has occurred;
- whether failure must become a blocker;
- whether evidence is sufficient;
- whether error content is sanitized;
- whether human/PM/Tasker 4 gate is required.

### 3. Control Decision

Allowed decisions:

```text
continue
retry_allowed
retry_denied
mark_timed_out
route_to_blocker
route_to_security_gate
require_pm_decision
require_tasker4_gate
close_succeeded
blocked
```

### 4. Evidence Recording Requirement

Control decisions must produce evidence refs or a no-evidence reason.

Persistence of evidence refs is a Tasker 4 backend dependency.

## Retry Policy

### Default Retry Limits

The default workflow retry policy is:

```yaml
max_attempts_total: 3
initial_attempt: 1
max_retries_after_initial: 2
retry_backoff_strategy: bounded_exponential
minimum_backoff_seconds: 30
maximum_backoff_seconds: 300
retry_jitter_required: true
retry_requires_same_task_contract: true
retry_requires_same_risk_class: true
retry_requires_same_allowed_files: true
retry_requires_same_tool_route: true
```

### Retry Eligibility

Retry is allowed only when all are true:

- task contract exists;
- risk class exists;
- current state is not terminal success;
- error is transient or operator-correctable;
- no forbidden action is required;
- retry stays inside the same allowed files/tools/scope;
- retry does not require DB write, migration, restart, deployment, public trigger, schedule, AI provider activation, or secrets handling without approval;
- retry count is below limit;
- evidence records the previous attempt result.

### Retry Denial

Retry must be denied and routed to blocker when:

- max attempts reached;
- failure reason is unknown and cannot be safely classified;
- repeated timeout occurs;
- unsafe/raw error content is present;
- requested retry changes scope;
- retry would touch unauthorized files;
- retry needs Tasker 4 backend/DB action without Tasker 4 gate;
- retry requires PM-owned approval not yet granted;
- retry would activate public trigger, schedule, provider, n8n live execution, DB write, deployment, or restart.

### No Infinite Retry Rule

Infinite retry is forbidden.

Every retry-capable control event must have:

```yaml
attempt_number: integer
max_attempts_total: integer
retry_reason: string
retry_allowed: boolean
next_retry_after: string | null
blocker_after_attempt: integer
```

If these fields are missing, the control result is:

```text
BLOCKED
```

## Timeout Policy

### Default Timeout Values

```yaml
workflow_callback_timeout_seconds: 120
tool_route_decision_timeout_seconds: 60
quality_runner_timeout_seconds: 600
reviewer_loop_timeout_hours: 24
pm_decision_timeout_hours: 48
```

These are contract defaults. Final backend/runtime enforcement is a Tasker 4 dependency where persistence/API behavior is needed.

### Timeout States

Allowed timeout states:

```text
pending_timeout_check
timed_out
blocked_after_timeout
recovered_after_timeout
```

### Timeout Routing

A timeout must route as follows:

| Timeout Type | First Timeout | Repeated Timeout |
| --- | --- | --- |
| Workflow callback | `timed_out` + retry eligibility check | blocker |
| Tool route decision | blocker | blocker |
| Quality Runner | `timed_out` + evidence required | blocker |
| Reviewer loop | PM/owner reminder state | blocker if release gate impacted |
| PM decision | waiting / PM-owned | no automatic bypass |

### Timeout Safety Rules

- Timeout must never auto-approve.
- Timeout must never auto-deploy.
- Timeout must never trigger public webhook/schedule.
- Timeout must never activate provider.
- Timeout must never bypass reviewer or PM gates.
- Timeout must produce customer-safe blocker text if blocking.

## Failed Workflow Blocker Routing

A failed workflow must route to Blocker Center when any of the following is true:

- final attempt failed;
- repeated timeout occurred;
- forbidden action requested;
- unsafe content detected;
- scope change required;
- backend/API/DB persistence dependency is required;
- Tasker 4 gate is required;
- PM approval required;
- security gate required;
- evidence missing;
- owner cannot continue safely.

### Routing Decision Shape

```yaml
routing_decision_id: string
workflow_run_id: string | null
package_id: string
task_id: string | null
source_state: failed | blocked | timed_out | cancelled
route_to: blocker_center | security_gate | tasker4_gate | pm_decision | qa_review
reason_code: string
customer_safe_summary: string
owner: string
blocking_owner: string | null
next_action: string
evidence_refs: array
created_at: string
```

## Sanitized Blocker Result Shape

Every blocker result must follow this shape:

```yaml
blocker_id: string
package_id: string
task_id: string | null
workflow_run_id: string | null
owner: string
blocking_owner: string | null
risk_class: Class A | Class B | Class C | Class D | Class E | null
severity: low | medium | high | critical
reason_code: string
customer_safe_summary: string
technical_summary_sanitized: string
pm_decision_needed: string | null
backend_dependency_needed: boolean
tasker4_gate_needed: boolean
security_gate_needed: boolean
retry_allowed: boolean
attempt_number: integer | null
max_attempts_total: integer | null
next_action: string
evidence_refs: array
created_at: string
```

### Required Blocker Fields

Required for every blocker:

- `blocker_id`
- `package_id`
- `owner`
- `severity`
- `reason_code`
- `customer_safe_summary`
- `next_action`
- `created_at`

If any required field is missing, result is invalid and must be returned as:

```text
BLOCKED_INVALID_BLOCKER_SHAPE
```

## Sanitization Rules

Blocker results, callback errors, control decisions, and customer-facing summaries must not include:

- stack traces;
- raw exceptions;
- raw logs;
- raw HTML;
- full HTTP headers;
- secrets;
- environment values;
- tokens;
- cookies;
- API keys;
- credentials;
- connection strings;
- internal IPs;
- private keys;
- provider raw output;
- unapproved vendor/internal labels in customer-visible text.

### Allowed Error Content

Allowed customer-safe error content:

```yaml
reason_code: string
customer_safe_summary: string
technical_summary_sanitized: string
owner: string
next_action: string
evidence_refs: array
```

### Unsafe Content Handling

If unsafe content is detected:

1. Do not store or echo unsafe content.
2. Replace with generic customer-safe reason.
3. Record `unsafe_content_detected = true` without including raw value.
4. Route to blocker if execution cannot continue safely.

## Blocker Center Contract

### Blocker Center Input

```yaml
blocker_source: workflow_runtime | execution_orchestrator | quality_runner | security_gate | qa | pm
package_id: string
task_id: string | null
workflow_run_id: string | null
owner: string
risk_class: Class A | Class B | Class C | Class D | Class E | null
severity: low | medium | high | critical
reason_code: string
customer_safe_summary: string
technical_summary_sanitized: string
pm_decision_needed: string | null
next_action: string
evidence_refs: array
```

### Blocker Center Output

```yaml
accepted: boolean
blocker_id: string
status: open | waiting_for_owner | waiting_for_pm | waiting_for_tasker4 | waiting_for_security | resolved | rejected
owner: string
blocking_owner: string | null
next_action: string
customer_safe_summary: string
evidence_refs: array
```

### Blocker Center Status Rules

- `open`: blocker accepted and awaiting routing.
- `waiting_for_owner`: current owner must fix or provide evidence.
- `waiting_for_pm`: PM decision required.
- `waiting_for_tasker4`: backend/API/DB dependency required.
- `waiting_for_security`: Security Gate or security reviewer required.
- `resolved`: blocker evidence accepted and path may continue.
- `rejected`: blocker shape invalid or unsafe.

## Backend Dependency / Tasker 4 Gate

Backend dependency is required when FP-02 moves from contract to implementation for:

- persisting retry attempts;
- persisting workflow state after restart;
- persisting blocker records;
- exposing Blocker Center APIs;
- enforcing backend state transitions;
- linking evidence refs to backend entities;
- API authorization/RBAC around blocker actions;
- DB-backed audit trail.

These items must route to Tasker 4 and must not be implemented by Tasker 5 without PM-approved backend scope.

## Evidence Requirements

FP-02 completion evidence must include:

- this contract file path;
- retry policy defined;
- timeout policy defined;
- blocker routing defined;
- sanitized blocker shape defined;
- no infinite retry rule;
- unsafe/raw error exposure rule;
- backend dependency statement;
- forbidden actions check;
- board update reference.

## Stop Conditions

Return `BLOCKED` if any FP-02 execution requires:

- public trigger;
- schedule;
- n8n live activation;
- AI provider activation;
- Aider/OpenHands execution;
- direct R&D Radar to coding tool;
- DB write;
- backend/API/PostgreSQL implementation outside Tasker 4 gate;
- deployment/restart;
- printing secrets/env/token/cookie/credentials;
- production claim.

## FP-02 Acceptance Criteria

FP-02 is complete when:

- retry limits are defined;
- timeout policy is defined;
- failed workflow blocker routing is defined;
- sanitized blocker result shape is defined;
- no infinite retry is enforced in contract;
- unsafe/raw error exposure is blocked;
- Tasker 4 backend dependency is explicitly identified;
- no forbidden action occurred;
- board row has Notes / Evidence.

## Forbidden Actions Check

Confirmed by this document:

- no public trigger;
- no schedule;
- no n8n live activation;
- no AI provider activation;
- no Aider/OpenHands execution;
- no direct R&D Radar to coding tool;
- no DB write;
- no backend override of Tasker 4;
- no deployment/restart;
- no secrets/env/token/cookie print;
- no production claim.
