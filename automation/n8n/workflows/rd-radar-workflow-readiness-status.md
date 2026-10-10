# R&D Radar Workflow Readiness Status

Issue ID: 1502
Owner: Tasker 5

## Purpose

This document defines the controlled workflow readiness/status contract for the R&D Radar workflow summary.

It is documentation-only. It does not execute a workflow, change backend APIs, change frontend code, write to a database, call an AI provider, activate a public trigger, activate a scheduled trigger, or create credentials.

## Current Controlled Workflow Readiness

Current status: PASS for controlled workflow callback readiness.

Confirmed current runtime/design facts:

- Workflow name: `SEKHEM Production Track - R&D Radar WorkflowRunSummary Contract`
- Workflow ID: `prodTrackRdRadar0520112154`
- Workflow active state: `false`
- Trigger type: manual/internal only
- Backend callback path: `POST /api/rd-radar/workflow-runs`
- Runtime callback result: HTTP `202`
- `accepted=true`
- `persistence=false`
- Candidate ID: `candidate-csf-guided-risk-assessment-001`
- Next gate: `PM_REVIEW_REQUIRED`
- GitHub readiness: `read-only/demo-safe`

## Customer-Safe Status Fields

Customer-facing UI and backend summaries should use these labels and fields. They must not show the automation vendor/tool name, internal IPs, private backend URLs, credentials, raw logs, stack traces, raw output, full headers, or execution internals.

```json
{
  "workflowSummary": "Controlled workflow callback validated",
  "latestControlledWorkflowStatus": "validated",
  "dataView": "Live data",
  "lastControlledRunStatus": "PASS",
  "callbackStatus": {
    "label": "Backend response",
    "httpStatus": 202,
    "accepted": true,
    "persistence": false
  },
  "readinessStatus": {
    "label": "Readiness Check",
    "state": "ready_for_pm_review",
    "nextGate": "PM_REVIEW_REQUIRED",
    "runtimeVerificationRequired": true
  },
  "candidateId": "candidate-csf-guided-risk-assessment-001",
  "githubReadiness": "read-only/demo-safe"
}
```

### Field Meanings

- Workflow Summary: short customer-safe summary of the automation outcome.
- Latest controlled workflow status: whether the latest controlled run is validated, unavailable, pending, or failed.
- Live data / Sample view: whether the UI is showing backend data or a fixture fallback.
- Last controlled run status: sanitized PASS / FIX / BLOCKED style status for the latest controlled run.
- Callback status: backend callback response summary only, including HTTP status, accepted flag, and persistence flag.
- Readiness status: whether the candidate remains ready for PM review, requires runtime verification, or needs follow-up.

## Approved Status Values

### latestControlledWorkflowStatus

Allowed values:

- `validated`
- `pending`
- `unavailable`
- `failed`

### dataView

Allowed customer-facing values:

- `Live data`
- `Sample view`

Use `Live data` only when the backend summary API is reachable and returns a valid sanitized summary. Use `Sample view` when fixture fallback is used.

### lastControlledRunStatus

Allowed values:

- `PASS`
- `FIX`
- `BLOCKED`
- `NOT_RUN`

### callbackStatus.persistence

Current value:

```json
false
```

Customer-facing label:

```text
Persistence: disabled
```

Do not change this to true without Tasker 4 coordination and a separate approved backend/PostgreSQL issue.

### readinessStatus.state

Allowed values:

- `ready_for_pm_review`
- `runtime_verification_required`
- `more_evidence_required`
- `domain_expert_review_required`
- `blocked`

## Sanitized Callback Boundary

The automation workflow may send sanitized workflow summary data only through the backend callback boundary:

```text
POST /api/rd-radar/workflow-runs
```

The runtime URL must be provided by server environment configuration, not committed to the repository and not shown in customer UI.

The automation workflow must not:

- write directly to PostgreSQL or any product database.
- call frontend routes.
- call public API endpoints.
- include credentials, tokens, auth headers, raw logs, raw output, stack traces, raw source content, raw HTML, or full response headers.
- create initiatives, create tasks, or perform product GitHub write actions.

Backend-owned summary APIs may later expose sanitized read-only state for the frontend, but backend API/schema implementation belongs to Tasker 4 and must be handled in a separate coordinated issue.

## Customer-Facing Meaning

The customer should see a screen, badge, or panel named with customer-safe language such as:

- `Workflow Summary`
- `Readiness Check`
- `Live data`
- `Sample view`

What the customer sees:

- the workflow callback was validated.
- the backend accepted the callback.
- persistence is disabled unless a later approved backend persistence issue changes it.
- the candidate remains a draft/review object.
- the next gate is PM review.
- GitHub readiness is read-only/demo-safe.

What is intentionally hidden:

- automation vendor/tool name.
- internal workflow execution IDs unless a future admin-only view is approved.
- internal IPs and private URLs.
- credentials, secrets, tokens, auth headers, or environment values.
- raw logs, raw output, stack traces, full response headers, raw source content, or raw HTML.
- implementation details that imply production deployment, task creation, initiative creation, DB writes, GitHub writes, or AI provider calls.

## Forbidden Actions Check

Confirmed forbidden actions remain disallowed:

- no workflow execution in this documentation task.
- no public trigger.
- no scheduled trigger.
- no AI provider call.
- no credentials in repo/docs/logs.
- no direct DB write from automation/manual workflow.
- no GitHub write from product workflow.
- no production claim.
- no backend schema/API implementation.
- no frontend implementation.
- no real initiative creation.
- no task creation.

## Implementation Decision

This task is documentation-only.

No runtime implementation is needed in Issue 1502 because:

- the controlled callback has already been validated.
- the workflow export is already versioned.
- the current gap is status/readiness wording and contract clarity.
- backend summary API changes must be coordinated with Tasker 4 in a separate issue.
- frontend presentation changes must be coordinated with Tasker 2 in a separate issue.
