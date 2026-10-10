# Stage 2 n8n Governance Pack

## Purpose

This document defines governance rules for n8n workflow review, approval, activation, execution evidence, and forbidden scope before any real n8n workflow is introduced in Sekhem Stage 2.

This is a plan-only governance pack. It does not execute workflows, create credentials, change runtime configuration, run R&D Collector, connect AI providers, activate PostgreSQL, expose public endpoints, or modify production behavior.

## Current Stage 2 Context

Stage 2 is online runtime with controlled activation. Air-gap is deferred to a later enterprise mode.

Closed runtime proof points include:

- n8n private runtime preparation and hardening.
- backend private runtime deployment.
- backend loopback bind hardening.
- Batch 8 private Backend ↔ n8n connectivity test.
- Batch 9 manual/internal operational workflow skeleton.
- monitoring and backup health scheduling gates.
- packaging guardrail closure.

The current quality gate plan requires this n8n Governance Pack before real n8n workflow activation.

## Scope

Plan only.

The governance pack defines:

- workflow review checklist.
- forbidden node policy.
- credentials approval policy.
- inactive-by-default rule.
- export review before activation.
- execution audit requirement.
- sanitized output policy.
- approval gates for R&D Collector, AI, and source-control writes.

## Explicit Non-Scope

This document does not authorize:

- workflow execution.
- credential creation.
- runtime change.
- R&D Collector execution.
- AI provider connection.
- PostgreSQL activation.
- Prisma-backed reads or writes.
- migrations.
- `db:push`.
- `db:seed`.
- DB reset.
- public API exposure.
- frontend cutover.
- production workflow activation.
- source-control runtime writes.
- release/deployment actions.

---

# Governance Principles

## 1. Backend-Controlled Automation

n8n must not become the business control plane.

Rules:

- Backend remains the system of record for business state.
- n8n may orchestrate only approved workflow steps.
- n8n must call backend-approved private endpoints only.
- n8n must not write directly to production data stores unless a future PM-approved batch explicitly authorizes it.
- n8n must not bypass approval gates.

## 2. Private Runtime Only

All Stage 2 n8n workflows must remain private.

Rules:

- n8n must remain reachable only through private/Tailscale path.
- public webhook triggers are forbidden unless a separate PM-approved public exposure batch exists.
- frontend must not call n8n directly.
- customer-facing UI must not expose internal workflow engine details.

## 3. Manual/Internal First

Every new workflow starts as manual/internal only.

Rules:

- inactive by default.
- manual trigger only for first validation.
- no schedule trigger in first version.
- no public trigger in first version.
- no production activation before QA and PM approval.

## 4. Mock-First and Fail-Closed

Real actions are introduced only after mock/skeleton validation.

Rules:

- workflows must fail closed when validation fails.
- forbidden action flags must default to false.
- missing approval must block execution.
- failure must produce sanitized output.

---

# Workflow Review Checklist

Every n8n workflow must pass this checklist before activation.

## Identity and Scope

- Workflow name is clear and includes stage/batch or approved operational scope.
- Workflow owner is identified.
- Workflow purpose is documented.
- Workflow is linked to an approved PM task or batch.
- Workflow has a rollback/disable method.
- Workflow has a validation checklist.

## Trigger Review

Allowed by default:

- Manual Trigger.

Requires separate PM approval:

- Schedule Trigger.
- Webhook Trigger.
- Queue/event trigger.
- Polling trigger.
- Any public or internet-facing trigger.

Forbidden until approved:

- public webhook.
- production event trigger.
- customer-facing trigger.
- uncontrolled polling.

## Node Review

Review must confirm:

- node list is exported and reviewed before activation.
- no forbidden node type exists.
- no hidden credential dependency exists.
- no external service node exists unless approved.
- no database write node exists unless approved.
- no source-control write node exists unless approved.
- no AI provider node exists unless approved.
- no release/deployment node exists unless approved.

## Data Review

Workflow must confirm:

- no secrets in node parameters.
- no raw auth headers in node parameters.
- no production credential values in exported JSON.
- no customer-sensitive data in logs unless approved and sanitized.
- no stack traces in final report.
- no environment values printed.

## Execution Review

Before QA sign-off, workflow must provide:

- workflow name.
- workflow ID.
- active/inactive status.
- trigger type.
- execution ID if available.
- sanitized execution result.
- backend/private endpoint called if applicable.
- HTTP result if applicable.
- forbidden action confirmation.

---

# Forbidden Node Policy

## Always Forbidden Unless PM Approves a Specific Batch

The following node categories are forbidden by default:

- AI provider nodes.
- external LLM nodes.
- public webhook trigger nodes.
- schedule trigger nodes.
- database write nodes.
- PostgreSQL mutation nodes.
- source-control write nodes.
- Git push/commit/merge nodes.
- deployment/release nodes.
- shell command nodes that mutate runtime.
- Docker control nodes.
- Kubernetes control nodes.
- email/SMS/customer notification nodes.
- third-party SaaS integration nodes.
- credential-management nodes.
- file deletion/cleanup nodes.
- backup deletion or retention cleanup nodes.
- restore execution nodes.

## Allowed Only in Manual/Internal Mock Workflows

These node categories may be allowed in planning/skeleton stages:

- Manual Trigger.
- Function/Code node for mock payload validation.
- HTTP Request node to approved private backend endpoint.
- Set/Edit Fields node for mock data shaping.
- IF/Switch node for local validation routing.

## HTTP Request Node Rules

HTTP Request node is allowed only when:

- target URL is approved.
- target is private backend/runtime endpoint.
- no credentials are embedded.
- no public API is called.
- no external SaaS is called.
- request does not mutate production state unless separately approved.

Approved safe baseline endpoint:

```text
http://100.74.93.25:8080/api/health
```

Any new endpoint must be approved before workflow use.

---

# Credentials Approval Policy

## Default Rule

No workflow may include credentials by default.

## Credential Approval Requirements

A credential may be added only when PM approves a specific batch containing:

- credential purpose.
- credential owner.
- service name.
- allowed scopes.
- environment.
- storage location.
- rotation policy.
- audit requirement.
- rollback/removal method.

## Credential Storage Rules

- no credentials in repository files.
- no credentials in workflow exports.
- no credentials in docs.
- no credentials in chat output.
- no credentials in logs.
- no raw auth headers in workflow JSON.
- no API keys in node parameters.

## Credential Review Before Activation

Before activation, QA must confirm:

- exported workflow has no credential values.
- credential references are approved if present.
- credential scope is minimal.
- no unused credentials are attached.
- no public trigger uses credentials incorrectly.

---

# Inactive-by-Default Rule

Every new n8n workflow must be imported or created as inactive.

Rules:

- `active=false` on import/export.
- workflow execution is manual only during validation.
- activation requires explicit QA approval and PM approval.
- scheduled activation requires a separate scheduling approval.
- public trigger activation requires a separate public exposure approval.

Activation without approval is a blocker.

---

# Export Review Before Activation

No workflow may be activated until its export has been reviewed.

Export review must verify:

- workflow ID and name.
- active status.
- node types.
- trigger types.
- credentials references.
- endpoint URLs.
- no secrets.
- no forbidden nodes.
- no public exposure.
- no schedule trigger unless approved.
- no source-control write path unless approved.
- no AI provider path unless approved.
- no R&D Collector execution path unless approved.

The reviewed export should be treated as activation evidence.

---

# Execution Audit Requirement

Every executed workflow must produce sanitized execution evidence.

Minimum execution report:

- workflow name.
- workflow ID.
- execution ID if available.
- trigger type.
- active/inactive state.
- endpoint called.
- result status.
- safety flags.
- forbidden action confirmation.
- failure summary if applicable.

Workflow output should include audit-style metadata when appropriate:

```json
{
  "eventType": "workflow.execution.reviewed",
  "mode": "manual-internal",
  "status": "PASS",
  "forbiddenActionsObserved": false
}
```

This audit-style object is not real persistence unless a backend audit endpoint is separately approved.

---

# Sanitized Output Policy

Workflow output, QA reports, and PM reports must not include:

- secrets.
- tokens.
- API keys.
- auth headers.
- `.env` values.
- raw credentials.
- stack traces.
- customer-sensitive data.
- database dumps.
- private keys.
- session cookies.
- provider response bodies containing sensitive data.

Allowed sanitized output:

- HTTP status code.
- service name.
- workflow ID.
- execution ID if available.
- boolean safety flags.
- high-level error code.
- pass/fail status.
- private IP endpoint only when already approved as part of Stage 2 runtime facts.

---

# Approval Gates

## R&D Collector Gate

R&D Collector execution requires separate PM approval.

Before approval:

- no collector execution.
- no internet source crawling.
- no external source credentials.
- no automatic initiative creation.
- no scheduled collection.

Approval must define:

- allowed sources.
- rate limits.
- source trust policy.
- dedupe policy.
- output destination.
- review gate.
- rollback/disable method.

## AI Gate

AI provider connection requires separate PM approval.

Before approval:

- no AI provider credentials.
- no external model calls.
- no customer prompt data sent externally.
- no AI-generated decisions used as final state.

Approval must define:

- provider or gateway boundary.
- credential storage.
- model routing policy.
- prompt logging policy.
- cost/budget limits.
- human review gate.
- failure behavior.

## Source-Control Write Gate

Source-control runtime writes require separate PM approval.

Before approval:

- no git commit.
- no git push.
- no branch creation by n8n.
- no pull request creation by n8n.
- no merge.
- no source-control token.

Approval must define:

- repository.
- allowed branch pattern.
- allowed file scope.
- token scope.
- PR/review policy.
- rollback path.
- audit trail.

## Database Gate

Database runtime access requires separate PM approval.

Before approval:

- no PostgreSQL activation.
- no `postgres_read` mode.
- no Prisma-backed reads.
- no Prisma-backed writes.
- no migrations.
- no `db:push`.
- no `db:seed`.
- no DB reset.

Approval must define:

- read/write boundary.
- database user scope.
- schema readiness.
- backup state.
- rollback path.
- validation commands.

---

# Failure Handling Policy

Any governance violation must stop the workflow review or activation.

Violations include:

- workflow active before approval.
- public trigger detected.
- schedule trigger detected without approval.
- credential attached without approval.
- forbidden node detected.
- external URL detected without approval.
- secret found in export/log/report.
- R&D Collector path detected without approval.
- AI provider path detected without approval.
- source-control write path detected without approval.
- DB write path detected without approval.

Failure response:

1. Stop activation.
2. Keep workflow inactive.
3. Export evidence for QA.
4. Remove or disable violating node only after PM approval.
5. Report sanitized failure summary.
6. Request fix plan.

---

# QA Checklist

QA should verify:

- this document is plan-only.
- workflow review checklist is complete.
- forbidden node policy is explicit.
- credentials approval policy is explicit.
- inactive-by-default rule is clear.
- export review before activation is required.
- execution audit requirement is clear.
- sanitized output policy is explicit.
- approval gates exist for R&D Collector, AI, source-control writes, and database access.
- no workflow execution is included.
- no credentials are included.
- no runtime change is included.
- no R&D Collector execution is included.
- no AI provider connection is included.

Required QA decision:

- `APPROVED FOR PM MERGE REVIEW`
- `NOT APPROVED — FIX GOVERNANCE PACK`

Approval of this document does not approve any real workflow activation.
