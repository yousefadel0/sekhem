# Stage 2 Batch 9 — Operational Workflow Skeleton Plan

## Purpose

This document defines the Stage 2 Batch 9 plan for an internal/manual n8n operational workflow skeleton.

Batch 9 is planning only. It does not execute n8n workflows, create production workflows, activate schedules, call real R&D Collector, call AI providers, activate PostgreSQL, run migrations, write to source control, deploy releases, expose public APIs, or cut over frontend behavior.

## Context

Stage 2 Batch 8 is closed.

The Backend ↔ n8n private integration test passed. n8n successfully called the private backend health endpoint:

```text
http://100.74.93.25:8080/api/health
```

The backend returned HTTP 200 and identified the service as:

```text
sekhem-product-api
```

Batch 9 builds on that private connectivity proof by defining the shape of a future operational workflow skeleton. It remains manual/internal and mock-only until a separate PM-approved implementation task.

## Goal

Prepare the shape of future operational workflows without running real business automation.

The workflow skeleton should prove:

- manual/internal trigger structure.
- backend endpoint interaction structure.
- request/response contract structure.
- audit-style event concept.
- failure handling model.
- validation checklist.
- rollback approach.
- QA gate.

## Scope

Planning only.

The target future workflow is one manual/internal n8n workflow skeleton. It should be safe to implement later as a non-production operational shape test.

## Allowed in This Plan

- design one manual/internal n8n workflow skeleton.
- define trigger.
- define backend endpoint interaction.
- define request/response format.
- define audit-style event concept.
- define failure handling.
- define validation checklist.
- define rollback.
- define QA gate.

## Forbidden in This Plan

- no workflow execution.
- no scheduled trigger.
- no public trigger.
- no production activation.
- no R&D Collector execution.
- no AI provider.
- no external credentials.
- no PostgreSQL activation.
- no Prisma-backed reads.
- no Prisma-backed writes.
- no migrations.
- no `db:push`.
- no `db:seed`.
- no DB reset.
- no source-control runtime writes.
- no release or deployment actions.
- no public API exposure.
- no frontend cutover.
- no secrets in docs or logs.

---

# Proposed Workflow Skeleton

## Workflow Name

```text
SEKHEM Batch 9 - Operational Workflow Skeleton
```

## Workflow Type

Manual/internal n8n workflow only.

The workflow must stay inactive by default and must not be scheduled, public, or production activated.

## Trigger

Manual trigger only.

Expected node concept:

```text
Manual Trigger
```

Forbidden triggers:

- schedule trigger.
- webhook trigger exposed publicly.
- production event trigger.
- polling trigger.
- external queue trigger.

## Proposed Node Shape

The future skeleton should contain only internal/mock-safe nodes:

1. Manual Trigger.
2. Build Mock Operational Event.
3. Validate Mock Event Payload.
4. Call Backend Private Health or Future Internal Contract Endpoint.
5. Validate Backend Response.
6. Build Audit-Style Event Object.
7. Build Final Skeleton Result.
8. Error Handler / Failure Result.

No external credentials or external service nodes are allowed.

## Future Backend Endpoint Interaction

### Safe default endpoint for first skeleton implementation

```text
GET http://100.74.93.25:8080/api/health
```

This endpoint was proven in Batch 8 and is safe for a skeleton-only runtime check.

### Future contract endpoint after backend approval

A later backend batch may create an internal workflow event contract endpoint such as:

```text
POST /api/internal/workflow-events/skeleton
```

This is not approved for implementation in Batch 9 planning. It is a future contract placeholder only.

## Backend Interaction Rules

The skeleton must:

- call backend through private runtime path only.
- use approved private backend address only.
- not call public frontend routes.
- not call public APIs.
- not mutate business state.
- not write to database.
- not create initiatives, tasks, blockers, releases, or code workspaces.
- not execute R&D Collector.
- not call AI Gateway or external AI providers.

---

# Request Format

## Mock Operational Event Payload

The skeleton can build a mock event object internally:

```json
{
  "eventId": "skel-2026-05-19-0001",
  "eventType": "operational.workflow.skeleton.test",
  "mode": "mock-only",
  "source": "n8n-manual-internal",
  "target": "sekhem-backend-private",
  "createdAt": "2026-05-19T00:00:00.000Z",
  "constraints": {
    "externalCallsAllowed": false,
    "aiCallsAllowed": false,
    "rdCollectorAllowed": false,
    "databaseWritesAllowed": false,
    "sourceControlWritesAllowed": false,
    "releaseActionsAllowed": false,
    "publicExposureAllowed": false
  },
  "payload": {
    "operation": "skeleton-shape-test",
    "expectedBackendService": "sekhem-product-api"
  }
}
```

The payload is generated inside the workflow for shape validation only. It must not be sent to any real production action endpoint unless a future backend contract is separately approved.

---

# Response Format

## Expected Skeleton Result

```json
{
  "ok": true,
  "eventType": "operational.workflow.skeleton.test",
  "mode": "mock-only",
  "backend": {
    "calledEndpoint": "http://100.74.93.25:8080/api/health",
    "httpStatus": 200,
    "service": "sekhem-product-api"
  },
  "safety": {
    "externalCallsExecuted": false,
    "aiCallsExecuted": false,
    "rdCollectorExecuted": false,
    "databaseWritesExecuted": false,
    "sourceControlWritesExecuted": false,
    "releaseActionsExecuted": false,
    "publicExposureCreated": false
  },
  "status": "PASS"
}
```

## Failure Result

```json
{
  "ok": false,
  "eventType": "operational.workflow.skeleton.test",
  "mode": "mock-only",
  "status": "FAIL",
  "error": {
    "code": "SKELETON_VALIDATION_FAILED",
    "message": "Skeleton validation failed. Review sanitized execution output."
  }
}
```

No stack traces, secrets, tokens, raw auth headers, or environment values may be included in output.

---

# Audit-Style Event Concept

Batch 9 planning does not write real audit events.

The skeleton should prepare an audit-style event object only, such as:

```json
{
  "eventType": "workflow.skeleton.executed",
  "scope": "stage-2-batch-9",
  "mode": "mock-only",
  "workflowName": "SEKHEM Batch 9 - Operational Workflow Skeleton",
  "backendService": "sekhem-product-api",
  "status": "PASS",
  "forbiddenActionsObserved": false
}
```

Future real audit persistence requires a separate backend-approved endpoint and PM-approved implementation batch.

## Audit-Style Event Rules

- Build audit-style object only.
- Do not persist to database.
- Do not send to external services.
- Do not send customer notifications.
- Do not include secrets or raw headers.
- Do not include stack traces.

---

# Failure Handling

## Failure Classes

The workflow skeleton should classify failures into:

- backend private endpoint unreachable.
- backend returned non-200 status.
- backend response missing `sekhem-product-api` service identity.
- payload validation failed.
- forbidden node detected during QA review.
- public trigger detected.
- workflow active when it should be inactive.
- external credential detected.
- unexpected execution error.

## Failure Behavior

On failure, the workflow skeleton should:

- stop execution.
- return sanitized failure result.
- avoid retries unless PM approves later.
- avoid downstream nodes after validation failure.
- avoid any business state mutation.
- avoid any external call.
- avoid any secret output.

---

# Validation Checklist

## Documentation Validation Now

- Plan file exists at `docs/product/stage-2-batch-9-operational-workflow-skeleton-plan.md`.
- Plan is documentation-only.
- No n8n workflow export is committed.
- No code files are changed.
- No credentials are included.
- No hardcoded secrets are included.
- No workflow execution is requested.
- No R&D Collector execution is requested.
- No AI provider connection is requested.
- No PostgreSQL activation is requested.
- No Prisma-backed reads/writes are requested.
- No migration or seed action is requested.
- No source-control runtime write is requested.
- No release/deployment action is requested.
- No public exposure is requested.

## Future Implementation Validation

Future Batch 9 implementation should prove:

1. Workflow exists.
2. Workflow is inactive by default.
3. Workflow uses manual trigger only.
4. No public trigger exists.
5. No schedule trigger exists.
6. No external credentials are attached.
7. No external service nodes exist.
8. Backend endpoint called over private IP only.
9. Backend response is HTTP 200.
10. Backend response service is `sekhem-product-api`.
11. Skeleton result returns PASS.
12. No R&D Collector execution occurred.
13. No AI provider connection occurred.
14. No PostgreSQL activation occurred.
15. No Prisma-backed reads/writes occurred.
16. No migrations occurred.
17. No source-control runtime writes occurred.
18. No release/deployment actions occurred.
19. No public API exposure occurred.
20. No frontend cutover occurred.
21. Logs and output contain no secrets, tokens, auth headers, env values, or stack traces.

---

# Rollback

## Current Plan Rollback

No runtime rollback is required because this is documentation only.

If the plan is rejected:

- update or replace this Markdown file only.
- do not change runtime.
- do not delete Batch 8 evidence.

## Future Implementation Rollback

If a future Batch 9 implementation is approved and fails:

1. Deactivate the skeleton workflow if it was activated by mistake.
2. Delete or disable only the Batch 9 skeleton workflow if PM approves cleanup.
3. Remove only Batch 9 test-only runtime variables if any were approved later.
4. Preserve execution evidence for QA unless PM approves cleanup.
5. Do not delete production data.
6. Do not delete system logs.
7. Do not remove security/audit evidence.
8. Do not roll back Batch 8 closure.
9. Do not roll back backend hardening.

---

# QA Gate

QA should review this plan for safety before implementation.

QA should confirm:

- Batch 9 is plan-only.
- scope is limited to operational workflow skeleton design.
- workflow is manual/internal only.
- no execution is included.
- no scheduled/public/production activation is included.
- no R&D Collector execution is included.
- no AI provider is included.
- no external credentials are included.
- no PostgreSQL activation is included.
- no Prisma-backed read/write is included.
- no migrations or seed actions are included.
- no source-control runtime write is included.
- no release/deployment action is included.
- no public API exposure or frontend cutover is included.
- validation and rollback are clear.

Required QA decision:

- `APPROVED FOR PM IMPLEMENTATION REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve implementation. Implementation requires a separate PM-approved Batch 9 execution task.
