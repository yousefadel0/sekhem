# Backend API Freeze — Internal MVP Foundation

## Status

Backend Batch 7 freezes the internal MVP backend API surface for the Sekhem Product Application.

This document is the final backend API inventory and limitation reference for the current internal MVP foundation.

## Final Backend Scope

Included:

- Read-only product journey APIs.
- Memory-only write actions for local/dev approval and audit workflows.
- Automation and AI Gateway contract placeholder APIs.
- Prisma/PostgreSQL schema foundation for future persistence work.
- In-memory runtime remains the default runtime.
- Normalized success/error response wrappers.
- Smoke/unit coverage for read, write, and contract endpoints.

Not included:

- Production database runtime.
- Prisma-backed write runtime.
- Migrations.
- Database push/reset operations.
- Production seed writes.
- Auth.js or Keycloak.
- Real workflow runtime execution.
- Real AI provider execution.
- RAG/vector search runtime.
- Source-control runtime writes.
- OpenHands execution.
- Secrets.
- Deployment logic.

## Runtime Mode

Current runtime mode:

```text
Memory/local runtime only
```

The backend may contain Prisma schema and generation support, but the API runtime remains memory-backed for this MVP foundation.

## API Base Path

```text
/api
```

## Success Response Wrapper

Read endpoints return:

```ts
{
  data: unknown,
  meta: {
    timestamp: string,
    total?: number,
    page?: number,
    pageSize?: number
  },
  errors: []
}
```

Write and contract endpoints return:

```ts
{
  data: unknown,
  auditEvent: unknown,
  activityEvent?: unknown,
  meta: {
    timestamp: string
  },
  errors: []
}
```

## Error Response Wrapper

Errors return normalized API responses:

```ts
{
  data: null,
  meta: {
    timestamp: string
  },
  errors: [
    {
      code: string,
      message: string
    }
  ]
}
```

## Final Route Inventory

### Health

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health check |

### Product Read APIs

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/projects` | List projects/programs |
| GET | `/api/projects/:id/dashboard` | Project dashboard aggregate |
| GET | `/api/modules` | List modules and locked modules |
| GET | `/api/modules/:slug` | Module detail |
| GET | `/api/initiatives` | List initiatives |
| GET | `/api/initiatives/:slug` | Initiative detail |
| GET | `/api/initiatives/:slug/tasks` | Initiative task lanes |
| GET | `/api/initiatives/:slug/activity` | Initiative activity |
| GET | `/api/initiatives/:slug/blockers` | Initiative blockers |
| GET | `/api/approvals` | Approval list |
| GET | `/api/security-gates/:id` | Security gate detail |
| GET | `/api/release-candidates` | Release candidate list |
| GET | `/api/release-candidates/:id` | Release candidate detail |
| GET | `/api/blockers` | Blocker center list |
| GET | `/api/audit-events` | Audit event list |

### Memory-only Write APIs

These endpoints are local/dev memory-only actions. They append audit events and do not write to PostgreSQL.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/initiatives/:slug/start` | Start a seeded initiative |
| POST | `/api/initiatives/:slug/execution-paths/:pathId/select` | Select execution path with matching approval gating |
| PATCH | `/api/tasks/:id/status` | Update task status/lane |
| POST | `/api/approvals` | Create approval request |
| POST | `/api/approvals/:id/decision` | Record human approval decision |
| POST | `/api/blockers` | Create blocker |

### Automation / AI Contract Placeholder APIs

These endpoints create local placeholder records only. They do not execute external systems.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/workflows/events` | Accept workflow event and create local workflow run placeholder |
| GET | `/api/workflows/runs` | List local workflow run placeholders |
| GET | `/api/workflows/runs/:id` | Read local workflow run placeholder |
| POST | `/api/ai/memos/request` | Accept AI memo request placeholder |
| GET | `/api/ai/memos/:id` | Read AI memo request placeholder |
| POST | `/api/system/events` | Record local system event placeholder |

## Approval and Audit Rules

- Every memory-only write action returns and records an audit event.
- Execution path selection requires a matching approved `execution_path` approval for the same project and initiative.
- Approval decisions require a human actor role.
- Every accepted workflow event, AI memo request, and system event returns audit/activity linkage.
- Invalid write or contract requests return normalized error responses.

## What Is Intentionally Not Production-ready

- Runtime persistence is not enabled.
- Writes are memory-only and reset with process lifecycle.
- No authentication or authorization enforcement exists.
- No workflow executor is connected.
- No AI provider is connected.
- No vector/RAG runtime exists.
- No source-control write integration exists.
- No deployment or production operations exist.
- No secrets should be stored in this backend package.

## Next Phase After Internal MVP

Recommended next phase should be separately approved and may include:

1. Auth/RBAC enforcement.
2. Safe local PostgreSQL runtime activation.
3. Repository persistence behind the existing service contracts.
4. Idempotent seed mapping.
5. Write persistence review.
6. Workflow runtime adapter design.
7. AI Gateway adapter design.
8. Production readiness and security review.

No next-phase work should begin from Batch 7 without explicit PM approval.

## Preview Deployment Author Note

This documentation-only update was added to retrigger the PR preview with the authorized project account after the previous preview was blocked by an old local Git author identity.

This change does not alter the frozen backend API surface, runtime behavior, endpoint list, validation status, or Batch 7 scope.
