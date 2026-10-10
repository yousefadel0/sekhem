# SEKHEM — PROD-03.001 Workflow Callback Contract

## Issue

`PROD-03.001` — Freeze backend workflow callback contracts

## Status

Contract frozen for implementation planning.

This document is documentation-only. It does not enable workflow execution, schedules, public triggers, deployment, restart, DB writes, source crawling, or AI provider activation.

## Purpose

Define the backend workflow callback contract that future workflow execution tasks must use.

The backend remains the source of truth for workflow run state, validation, audit, blocker creation, and customer-safe responses.

## Contract Decision

Approved endpoint direction:

```text
POST /api/workflows/callbacks
```

This is a generic backend workflow callback endpoint for controlled manual/internal workflow execution.

It must not be exposed as a public unauthenticated webhook.

## Execution Mode for Next Task

For `PROD-03.002`, execution is manual/internal-only.

Forbidden for `PROD-03.002` unless separately approved by PM:

- public trigger;
- uncontrolled schedule;
- automatic workflow execution;
- external broad crawling;
- deployment;
- restart;
- AI provider activation;
- GitHub write from product runtime.

## Caller Rules

Allowed callers:

- approved backend-controlled/manual operator path;
- approved internal workflow runner path after PM approval;
- no public unauthenticated caller.

Authentication and authorization:

- callback must be protected by backend-approved authentication or internal trust boundary;
- backend must validate all payload fields;
- caller identity must be auditable;
- backend does not trust workflow-supplied status blindly.

## Backend Source-of-Truth Rule

The backend is the only source of truth for:

- workflow run existence;
- allowed state transitions;
- final run status;
- persisted evidence references;
- blocker creation;
- audit events;
- customer-visible summaries.

Workflow tools may report results, but the backend decides whether to accept, reject, persist, or convert the callback to a blocker.

## Callback Payload

Minimum request body:

```json
{
  "workflowRunId": "string",
  "issueId": "PROD-xx.xxx",
  "taskId": "optional string",
  "step": "string",
  "status": "queued | running | succeeded | failed | blocked | cancelled | timed_out",
  "resultSummary": "string",
  "evidence": [
    {
      "type": "log | file | url | test | artifact | note",
      "label": "string",
      "value": "string"
    }
  ],
  "error": {
    "code": "optional string",
    "message": "customer-safe string",
    "details": "optional sanitized string"
  },
  "blocker": {
    "reason": "optional customer-safe string",
    "owner": "optional role/person",
    "severity": "low | medium | high | critical",
    "pmDecisionNeeded": "optional string"
  },
  "idempotencyKey": "string",
  "occurredAt": "ISO-8601 timestamp"
}
```

## Required Fields

Required:

- `workflowRunId`
- `issueId`
- `step`
- `status`
- `idempotencyKey`
- `occurredAt`

Required depending on status:

- `resultSummary` for `succeeded`;
- `error.message` for `failed` or `timed_out`;
- `blocker.reason`, `blocker.owner`, and `blocker.pmDecisionNeeded` for `blocked`.

## Allowed Statuses

```text
queued
running
succeeded
failed
blocked
cancelled
timed_out
```

No other statuses are accepted.

## State Transition Rules

Allowed basic transitions:

```text
queued -> running
running -> succeeded
running -> failed
running -> blocked
running -> cancelled
running -> timed_out
failed -> blocked
failed -> running only through explicit retry policy
blocked -> running only after PM/owner unblock decision
```

Terminal states:

```text
succeeded
cancelled
```

`failed`, `blocked`, and `timed_out` are not final production success states.

Invalid transitions must return customer-safe rejection and must not mutate state.

## Idempotency

The backend must require `idempotencyKey`.

Duplicate callback behavior:

- same `workflowRunId` + same `idempotencyKey` + same payload hash: return accepted duplicate / no-op;
- same `workflowRunId` + same `idempotencyKey` + different payload hash: reject as idempotency conflict;
- missing `idempotencyKey`: reject validation.

## Validation Failure Behavior

Validation failures must:

- return customer-safe error messages;
- not expose stack traces;
- not expose secrets, tokens, cookies, env values, internal IPs, or raw provider errors;
- not mutate workflow state;
- create audit/blocker only if the backend explicitly defines safe validation-failure tracking later.

## Retry and Timeout Expectations

Retry policy must be bounded.

Contract-level rule:

- no infinite retry;
- retry count must be recorded or derivable;
- timeout must create `timed_out` or `blocked` state;
- repeated timeout must route to blocker handling.

Detailed retry limits are finalized in `PROD-03.004`.

## Audit Expectations

Accepted callbacks must create or update audit evidence sufficient to answer:

- who or what reported the callback;
- which workflow run changed;
- previous status;
- new status;
- accepted/rejected decision;
- timestamp;
- sanitized summary.

Audit must not store secrets or raw unsafe provider payloads.

## Blocker Expectations

If callback status is `blocked`, backend must require:

- blocker reason;
- owner;
- severity;
- PM decision needed.

Blocker content must be customer-safe.

Failure-to-blocker routing is implemented in later PROD-03 tasks, but this contract reserves the required fields.

## Customer-Safe Output Rules

Responses must not expose:

- stack traces;
- raw exceptions;
- secrets;
- environment values;
- tokens;
- cookies;
- connection strings;
- internal IPs;
- raw vendor/provider labels unless approved for customer display.

## Response Contract

Success response:

```json
{
  "accepted": true,
  "workflowRunId": "string",
  "status": "string",
  "duplicate": false
}
```

Duplicate no-op response:

```json
{
  "accepted": true,
  "workflowRunId": "string",
  "status": "string",
  "duplicate": true
}
```

Validation rejection:

```json
{
  "accepted": false,
  "code": "VALIDATION_ERROR",
  "message": "Callback payload is invalid."
}
```

Idempotency conflict:

```json
{
  "accepted": false,
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "Callback was already submitted with different content."
}
```

Invalid transition:

```json
{
  "accepted": false,
  "code": "INVALID_TRANSITION",
  "message": "Workflow state transition is not allowed."
}
```

## Explicit Non-Scope

This contract does not implement:

- backend route code;
- workflow execution;
- workflow schedules;
- public webhooks;
- DB migration;
- artifact storage;
- AI provider calls;
- source connector crawling;
- deployment;
- restart;
- runtime smoke;
- production readiness claim.

## Acceptance Criteria Mapping

Production plan acceptance:

```text
Contract documented and accepted.
```

Satisfied by this file once PM, Tasker 5, Tasker 4, and QA accept the contract.

## Safety Gate Mapping

Production plan safety gate:

```text
Backend is source of truth.
```

Satisfied by the contract rule that backend owns validation, state transition, persistence decision, audit, and blocker handling.

## PM Decisions Recorded

PM-approved decisions:

1. Contract path: `docs/pm-handoffs/prod-03-001-workflow-callback-contract.md`.
2. Endpoint direction: `POST /api/workflows/callbacks`.
3. `PROD-03.002` starts manual/internal-only.
4. No public trigger.
5. No uncontrolled schedule.
6. Backend remains source of truth.
7. Tasker 4 backend review required before implementation.
8. Docs-only GitHub patch approved for `PROD-03.001`.

## Next Task Guidance

`PROD-03.002` may use this contract to implement controlled manual workflow execution only after QA accepts `PROD-03.001` and PM starts the next task.
