# Stage 2 Batch 11 — R&D Collector Controlled Plan

## Purpose

This document defines the Stage 2 Batch 11 plan for a controlled R&D Collector workflow.

The goal is to prepare a safe workflow design before any real R&D Collector execution. This is planning only. It does not create, activate, or execute a real R&D Collector workflow.

## Context

Stage 2 is operating in online runtime mode. Air-gap is deferred to a later enterprise mode.

Closed prerequisites include:

- n8n private runtime readiness.
- Backend ↔ n8n private integration.
- manual/internal operational workflow skeleton.
- n8n Governance Pack.
- Backend CI implementation and observation.

Real execution remains forbidden until a separate PM-approved execution batch.

## Scope

Plan only.

This plan defines a controlled manual/internal R&D Collector workflow design that can later be implemented in phases after PM approval.

## Explicit Non-Scope

This plan does not authorize:

- R&D Collector execution.
- real web crawling.
- external credentials.
- AI provider connection.
- PostgreSQL activation.
- Prisma-backed reads or writes.
- migrations.
- `db:push`.
- `db:seed`.
- DB reset.
- source-control writes.
- public API exposure.
- frontend cutover.
- production workflow activation.
- scheduled workflow activation.
- public webhook trigger.
- secrets in docs, logs, workflow exports, or reports.

---

# Workflow Purpose

The controlled R&D Collector workflow is intended to prepare a safe collection pipeline for future R&D Radar evidence gathering.

Future purpose after approval:

- accept an approved internal research request.
- validate allowed source definitions.
- collect limited evidence from approved sources.
- normalize collected evidence into a reviewable structure.
- produce a sanitized evidence object for human review.
- block initiative creation until explicit approval.
- block AI enrichment until a later approved AI gate.
- block persistence until a later approved database/storage gate.

In Batch 11 planning, this remains a design only.

---

# Workflow Type and Trigger

## Workflow Name

```text
SEKHEM Batch 11 - R&D Collector Controlled Workflow
```

## Trigger Type

Manual/internal trigger only.

Allowed trigger in first implementation:

```text
Manual Trigger
```

Forbidden triggers:

- schedule trigger.
- public webhook trigger.
- polling trigger.
- external queue trigger.
- customer-facing trigger.
- production event trigger.

## Activation Rule

The workflow must be inactive by default.

Activation requires:

- export review.
- QA approval.
- PM approval.
- separate execution batch.

---

# Input Format

The future manual/internal workflow should accept a mock or approved internal request shaped like:

```json
{
  "requestId": "rdc-2026-05-19-0001",
  "mode": "mock-only",
  "requestedBy": {
    "type": "internal-operator",
    "id": "redacted"
  },
  "researchTopic": "example technology topic",
  "collectionPurpose": "evidence-preparation-for-human-review",
  "constraints": {
    "realWebCrawlingAllowed": false,
    "externalCredentialsAllowed": false,
    "aiEnrichmentAllowed": false,
    "databaseWritesAllowed": false,
    "sourceControlWritesAllowed": false,
    "initiativeCreationAllowed": false,
    "publicExposureAllowed": false
  },
  "approvedSources": [],
  "limits": {
    "maxSources": 0,
    "maxPagesPerSource": 0,
    "maxExecutionSeconds": 0
  }
}
```

## Input Validation Rules

The workflow must reject input when:

- `requestId` is missing.
- `mode` is not approved for the current phase.
- any forbidden constraint is set to true without PM approval.
- source list contains unapproved source domains.
- limits are missing or exceed approved boundaries.
- requested output would require persistence before storage approval.
- request attempts to create initiatives, tasks, code drafts, releases, or external notifications.

---

# Approved Data Sources Concept

## Phase A — Mock-Only Sources

Approved source concept:

- no internet calls.
- mock source objects only.
- static internal sample payloads.
- no external credentials.
- no crawling.
- no persistence.

Example mock source object:

```json
{
  "sourceId": "mock-source-001",
  "sourceType": "mock-static",
  "sourceName": "Mock Vendor Research Note",
  "url": null,
  "trusted": true,
  "contentHash": "mock-only"
}
```

## Phase B — Controlled Limited Source

Requires separate PM-approved execution batch.

Controlled source rules:

- allowlist only.
- exact source domains or URLs approved in the batch.
- strict max source count.
- strict max pages per source.
- strict timeout.
- no login-protected sources unless credentials are separately approved.
- no scraping of disallowed content.
- respect robots/rate limits where applicable.
- no persistent storage unless separately approved.

## Phase C — AI Enrichment Later

Requires separate PM-approved AI gate.

Before approval:

- no AI provider connection.
- no AI credentials.
- no external model calls.
- no automatic decisions.

## Phase D — Persistent Storage Later

Requires separate PM-approved database/storage gate.

Before approval:

- no PostgreSQL activation.
- no Prisma-backed writes.
- no migrations.
- no persistent evidence storage.

---

# Backend Endpoint Needs

Batch 11 planning does not implement backend endpoints.

Future backend endpoint candidates may include:

```text
POST /api/internal/rd-collector/requests/validate
POST /api/internal/rd-collector/evidence/preview
POST /api/internal/rd-collector/evidence/submit-for-review
```

These are placeholders only and require separate backend PM approval before implementation.

## Backend Endpoint Requirements

Future endpoints must:

- remain private/internal only.
- require backend-controlled authorization.
- validate request constraints.
- reject forbidden actions by default.
- avoid direct public exposure.
- not call AI providers unless AI gate is approved.
- not write to database unless storage gate is approved.
- return sanitized responses.
- emit audit events only after backend audit persistence is approved.

## Safe Existing Endpoint for Connectivity

The only currently approved safe backend endpoint for private connectivity verification remains:

```text
GET http://100.74.93.25:8080/api/health
```

This endpoint can be used only for health validation, not as real collector execution.

---

# Output Format

## Phase A Mock-Only Output

```json
{
  "ok": true,
  "requestId": "rdc-2026-05-19-0001",
  "mode": "mock-only",
  "workflow": "SEKHEM Batch 11 - R&D Collector Controlled Workflow",
  "status": "PASS",
  "collector": {
    "realWebCrawlingExecuted": false,
    "externalCredentialsUsed": false,
    "aiEnrichmentExecuted": false,
    "databaseWritesExecuted": false,
    "sourceControlWritesExecuted": false,
    "initiativeCreated": false,
    "publicExposureCreated": false
  },
  "evidencePreview": [
    {
      "evidenceId": "mock-evidence-001",
      "sourceId": "mock-source-001",
      "title": "Mock evidence item",
      "summary": "Static mock evidence for workflow-shape validation only.",
      "confidence": "not-assessed",
      "requiresHumanReview": true
    }
  ]
}
```

## Failure Output

```json
{
  "ok": false,
  "requestId": "rdc-2026-05-19-0001",
  "mode": "mock-only",
  "status": "FAIL",
  "error": {
    "code": "RD_COLLECTOR_VALIDATION_FAILED",
    "message": "Request failed controlled R&D Collector validation. Review sanitized output."
  }
}
```

No stack traces, tokens, credentials, raw auth headers, `.env` values, customer-sensitive data, or provider response bodies may be included.

---

# Evidence Object Structure

A future evidence object should use a review-first structure:

```json
{
  "evidenceId": "evidence-uuid-or-mock-id",
  "requestId": "rdc-2026-05-19-0001",
  "source": {
    "sourceId": "source-id",
    "sourceType": "mock-static-or-approved-web-source",
    "sourceName": "source display name",
    "url": "redacted-or-approved-url",
    "retrievedAt": "2026-05-19T00:00:00.000Z"
  },
  "content": {
    "title": "short title",
    "summary": "sanitized summary",
    "keyClaims": [],
    "rawContentStored": false
  },
  "governance": {
    "phase": "Phase A mock-only",
    "requiresHumanReview": true,
    "aiGenerated": false,
    "persisted": false,
    "approvedForInitiativeCreation": false
  },
  "safety": {
    "externalCredentialsUsed": false,
    "aiProviderUsed": false,
    "databaseWriteExecuted": false,
    "sourceControlWriteExecuted": false
  }
}
```

Evidence is not a business decision. Evidence must remain reviewable and must not automatically create initiatives or tasks without a separate approval gate.

---

# Validation Rules

## Workflow Shape Validation

Future implementation must validate:

- workflow exists.
- workflow is inactive by default.
- trigger is manual/internal only.
- no schedule trigger.
- no public webhook trigger.
- no external credentials.
- no forbidden nodes.
- no source-control write nodes.
- no database write nodes.
- no AI provider nodes.
- no release/deployment nodes.
- no notification nodes.

## Request Validation

Future workflow must validate:

- request ID exists.
- mode is allowed for the current phase.
- approved sources are empty in Phase A.
- limits match phase boundary.
- no forbidden constraint flag is true.
- no persistence requested.
- no AI enrichment requested.
- no source-control write requested.

## Output Validation

Future workflow must validate:

- output includes `mode`.
- output includes collector safety flags.
- output includes evidence preview only.
- output confirms human review required.
- output confirms no persistence.
- output confirms no AI provider used.
- output confirms no source-control write.
- output contains no secrets, tokens, auth headers, stack traces, or raw credentials.

---

# Forbidden Nodes

Forbidden by default:

- schedule trigger.
- public webhook trigger.
- AI provider nodes.
- external LLM nodes.
- database write nodes.
- PostgreSQL mutation nodes.
- Prisma execution nodes.
- source-control write nodes.
- Git push/commit/merge nodes.
- deployment/release nodes.
- shell command nodes that mutate runtime.
- Docker control nodes.
- Kubernetes control nodes.
- notification nodes.
- third-party SaaS integration nodes.
- credential-management nodes.
- file deletion or cleanup nodes.
- backup deletion or retention cleanup nodes.
- restore execution nodes.

Allowed in Phase A planning/implementation only if PM later approves implementation:

- Manual Trigger.
- Function/Code node for mock payload shaping and validation.
- Set/Edit Fields node.
- IF/Switch node.
- HTTP Request node only to approved private backend health endpoint for connectivity validation.

---

# Failure Handling

Failure must be fail-closed.

Failure classes:

- invalid trigger detected.
- workflow active before approval.
- forbidden node detected.
- forbidden constraint flag set to true.
- unapproved source requested.
- attempt to call external source in Phase A.
- credential attached without approval.
- AI provider path detected.
- database write path detected.
- source-control write path detected.
- public exposure detected.
- output contains secret-like material.

Failure behavior:

1. Stop execution.
2. Do not call downstream collector nodes.
3. Do not persist data.
4. Do not call AI.
5. Do not write source control.
6. Do not create initiatives or tasks.
7. Return sanitized failure output.
8. Preserve review evidence if approved.
9. Request fix plan.

---

# Audit and Reporting Requirement

Batch 11 plan does not write real audit events.

Future implementation must produce sanitized report output containing:

- workflow name.
- workflow ID.
- execution ID if available.
- active/inactive status.
- trigger type.
- mode.
- phase.
- approved source count.
- evidence preview count.
- safety flags.
- forbidden action confirmation.
- pass/fail status.

Audit-style object example:

```json
{
  "eventType": "rd_collector.controlled_run.reviewed",
  "scope": "stage-2-batch-11",
  "phase": "Phase A mock-only",
  "mode": "mock-only",
  "status": "PASS",
  "realWebCrawlingExecuted": false,
  "aiProviderUsed": false,
  "databaseWriteExecuted": false,
  "sourceControlWriteExecuted": false,
  "requiresHumanReview": true
}
```

This object is output-only until backend audit persistence is separately approved.

---

# Rollout Phases

## Phase A — Mock-Only

Purpose:

- prove workflow shape.
- prove validation gates.
- prove evidence object shape.
- prove reporting format.

Rules:

- manual/internal only.
- inactive by default.
- no real web crawling.
- no external credentials.
- no AI.
- no database writes.
- no source-control writes.
- mock evidence only.

Exit criteria:

- workflow export reviewed.
- QA confirms no forbidden nodes.
- manual execution report is sanitized.
- evidence preview object is valid.

## Phase B — Controlled Limited Source

Requires separate PM-approved execution batch.

Purpose:

- test one or more approved limited sources.

Rules:

- allowlisted source only.
- strict rate/time/source limits.
- no credentials unless separately approved.
- no AI enrichment.
- no persistent storage unless separately approved.
- human review required.

Exit criteria:

- source evidence reviewed.
- no disallowed crawling.
- no persistence unless approved.
- QA approves limited source behavior.

## Phase C — AI Enrichment Later

Requires separate PM-approved AI gate.

Purpose:

- summarize, classify, or tag evidence after collection.

Rules:

- AI Gateway or provider boundary must be approved.
- credentials must be approved.
- prompt/data logging policy must be approved.
- cost budget must be approved.
- AI output cannot auto-create initiatives.
- human review remains required.

Exit criteria:

- AI output reviewed.
- hallucination/unsupported-claim handling defined.
- cost and logging evidence reviewed.

## Phase D — Persistent Storage Later

Requires separate PM-approved database/storage gate.

Purpose:

- store reviewed evidence and metadata.

Rules:

- database access must be approved.
- schema must be reviewed.
- migrations require separate approval.
- no direct write to production data outside backend-approved endpoint.
- retention policy must be defined.

Exit criteria:

- storage validation passed.
- rollback path confirmed.
- audit trail confirmed.

---

# QA Gate

QA should verify:

- plan only.
- no execution authorized.
- workflow purpose is clear.
- trigger type is manual/internal only.
- no schedule/public trigger.
- input format is explicit.
- approved data sources concept is phased.
- backend endpoint needs are placeholders only.
- output format is explicit.
- evidence object structure is review-first.
- validation rules are clear.
- forbidden nodes are explicit.
- failure handling is fail-closed.
- audit/reporting is output-only.
- rollout phases A-D are separated.
- no R&D Collector execution.
- no real web crawling.
- no external credentials.
- no AI provider.
- no PostgreSQL activation.
- no Prisma-backed writes.
- no migrations.
- no source-control writes.
- no public API.
- no frontend cutover.
- no production workflow activation.
- no secrets in docs.

Required QA decision:

- `APPROVED FOR PM IMPLEMENTATION REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this plan does not approve execution. A separate PM-approved implementation or execution batch is required before any real workflow creation, R&D Collector execution, source access, AI connection, credential use, database/storage activation, source-control write, public exposure, or frontend change.
