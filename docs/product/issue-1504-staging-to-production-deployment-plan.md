# Issue 1504 — Staging-to-Production Deployment and Rollback Plan

## Status

- Issue ID: 1504
- Owner: Infra
- Scope: Documentation only
- Decision: PASS — plan only, not approved for execution

This document converts the approved Issue 1504 staging-to-production readiness plan into repository documentation.

## Scope and Safety

This is a deployment and rollback planning document only. It does not approve or execute production deployment.

Forbidden by this document:

- No production deployment.
- No public exposure.
- No DNS cutover.
- No VM reboot.
- No host reboot.
- No restore execution.
- No backup scheduling implementation.
- No destructive commands.
- No database migration.
- No secrets printed.
- No AI provider call.
- No workflow execution.
- No service restart.
- No backend code changes.
- No frontend code changes.

Any actual deployment requires a separate PM-approved implementation task with explicit scope, target environment, rollback authority, and QA gate.

## 1. Deployment Prerequisites

Before moving the production-track slice toward production readiness, all of the following must be true:

1. PM approval exists for the exact deployment scope.
2. QA has approved the release candidate.
3. Backend API validation has passed.
4. PostgreSQL persistence validation has passed.
5. Frontend live-vs-fallback validation has passed.
6. n8n workflow summary validation has passed, if workflow integration is included.
7. GitHub readiness is read-only and does not perform write actions.
8. Customer Language Review is PASS.
9. Information Hierarchy Review is PASS.
10. Rollback owner and rollback trigger conditions are defined.
11. Backup and restore readiness is confirmed before any runtime change.
12. No production claim is made before PM approval.

## 2. Environment Checklist

### Current private runtime baseline

- Backend runtime host: `sekhem-app-01`.
- Backend binds to loopback only: `127.0.0.1:3001`.
- Backend private listener: Tailscale/private access only.
- Automation runtime host: `sekhem-automation-01`.
- n8n listener: private/manual/internal only.
- Data runtime host: `sekhem-data-01`.
- PostgreSQL, Redis, and MinIO are private data services.
- Admin access is through the private admin network only.

### Production readiness target must define

- Production app host.
- Production data host.
- Production automation host.
- Public/private API boundary.
- Domain and DNS plan, if any.
- TLS termination plan.
- Firewall policy.
- Secrets storage mechanism.
- Backup schedule and retention policy.
- Monitoring and alert path.
- Rollback owner.
- Customer-facing release scope.

No DNS cutover or public exposure is approved by this document.

## 3. Secrets Handling Rule

Hard rule:

```text
No secrets in repository files.
No secrets in documentation.
No secrets in screenshots.
No secrets in logs.
No secrets in handoff reports.
No DATABASE_URL printed.
No tokens printed.
No private keys printed.
No raw environment file output.
```

Allowed handling pattern:

- Store secrets only in server-local environment files, deployment environment variables, or an approved secret store.
- Sensitive files must use restricted ownership and permissions, such as `600 root:root` where applicable.
- Validation output may show key presence, host, port, and non-secret names only.
- Creating or rotating credentials requires explicit PM approval.

## 4. Pre-Deployment Validation

### Frontend validation

- Build passes.
- Customer demo route opens.
- Live backend state is visible when backend works.
- Fallback is inactive when live backend works.
- Customer UI does not show internal IPs, secrets, raw logs, stack traces, internal vendor labels, or false production claims.
- Customer Language Review: PASS.
- Information Hierarchy Review: PASS.

### Backend validation

- Health endpoint passes.
- R&D Radar status endpoint passes.
- Evidence endpoint passes.
- Candidate endpoint passes.
- PM decision POST/GET read-back passes.
- WorkflowRunSummary read-back passes.
- GitHub readiness endpoint is read-only.
- CORS, if needed, is limited to the approved validation origin.

### Database validation

- PostgreSQL is reachable only through the approved private path.
- R&D Radar tables exist.
- Runtime role has only required permissions.
- No destructive migration is pending.
- Pre-deployment schema backup plan is reviewed.

### Automation validation

- n8n health is PASS.
- Workflow is manual/internal only.
- Workflow remains inactive after test.
- No public trigger.
- No scheduled trigger.
- No forbidden credentials or nodes.
- No raw HTML storage.
- No direct DB writes from n8n unless PM separately approves.

### GitHub readiness validation

- GitHub status is read-only.
- Backend CI check is visible.
- No branch, commit, issue, pull request, merge, or force-push action is performed by runtime.

## 5. Deployment Steps

These are planning steps only. They are not executable approval.

1. Freeze release candidate.
   - Record backend commit.
   - Record frontend commit.
   - Record workflow export/version if included.
   - Record current runtime health.

2. Back up before runtime change.
   - Create schema-only database backup.
   - Create backend metadata backup.
   - Create n8n runtime metadata backup.
   - Confirm backup files exist, are non-empty, and have restricted permissions.
   - Do not print secrets.

3. Prepare target environment.
   - Confirm target host names and role boundaries.
   - Confirm environment keys exist without printing values.
   - Confirm firewall and public/private access policy.
   - Confirm rollback path.

4. Deploy backend only after approval.
   - Use approved commit only.
   - Install dependencies.
   - Build.
   - Apply only separately approved additive migrations, if any.
   - Reload or restart services only if explicitly approved.
   - Validate health and R&D Radar endpoints.

5. Deploy frontend only after approval.
   - Use approved frontend commit only.
   - Set browser-safe API base URL only.
   - Build and validate route.
   - Confirm live/fallback state.
   - Confirm customer-safe language and hierarchy.

6. Validate automation integration only after approval.
   - Use approved workflow export/version.
   - Keep workflow inactive unless manual/internal execution is separately approved.
   - Confirm sanitized summary contract.

7. Validate GitHub readiness.
   - Read-only status only.
   - No GitHub write actions.

8. Final demo/release gate.
   - PM reviews screens.
   - QA reviews safety.
   - Decide: internal demo, customer demo, production readiness hold, or fix.

## 6. Rollback Steps

### Backend rollback

- Revert to previous backend release directory or commit.
- Restore previous server-local environment file if changed.
- Reload/restart backend only after PM approval.
- Validate health endpoint.
- Validate R&D Radar endpoints return safe responses and not stack traces.

### Frontend rollback

- Revert to previous frontend build or commit.
- Restore previous browser-safe API configuration.
- Rebuild/redeploy only after approval.
- Validate route opens.
- Confirm no internal diagnostics are exposed.

### Database rollback

Preferred strategy: forward fix, not destructive rollback.

- Do not drop tables without explicit PM approval.
- If migration was additive and tables are unused, leave schema in place until reviewed.
- If data corruption occurs, stop writes and isolate the issue.
- Restore only to an isolated target unless PM explicitly approves live restore.

### n8n rollback

- Disable workflow if it was enabled.
- Confirm no schedule/public trigger exists.
- Revert workflow export/version if needed.
- Preserve sanitized failure evidence.
- Confirm n8n health.

### Public exposure rollback

If public exposure is accidentally introduced:

- Remove the public listener, proxy, or DNS exposure immediately.
- Confirm access is restricted to the approved boundary.
- Report as an incident.

## 7. Post-Deployment Validation

After any approved deployment, validate:

- Backend health endpoint returns healthy.
- Frontend route opens.
- Live backend state is visible.
- Fallback is inactive when live backend works.
- PM decision POST works.
- PM decision GET read-back works.
- WorkflowRunSummary read-back works.
- Candidate draft is visible.
- PM approval gate is visible.
- GitHub readiness remains read-only.
- No public exposure beyond approved boundary.
- No secrets in logs/screenshots/reports.
- Customer Language Review remains PASS.
- Information Hierarchy Review remains PASS.

## 8. Monitoring and Health Checks

Minimum health checks:

- Backend service status.
- Backend private health endpoint.
- Nginx/private listener status.
- PostgreSQL container/service health.
- Redis container/service health.
- MinIO container/service health.
- n8n container/service health.
- n8n private health endpoint.
- Disk usage.
- Memory usage.
- Docker container status.
- Backup directory existence and permissions.

Monitoring must not print secrets.

Backup scheduling is not implemented by this document and still requires a separate PM-approved task.

## 9. Stop Conditions Requiring PM Approval

Stop and request PM approval before:

- Production deployment.
- Public API exposure.
- DNS cutover.
- VM reboot.
- Host reboot.
- Restore testing or restore execution.
- Backup scheduling implementation.
- Any destructive command.
- Any DB migration.
- DB reset, `db:push`, or `db:seed`.
- Credential creation, rotation, or exposure.
- AI provider call.
- Workflow execution beyond explicitly approved manual/internal scope.
- Service restart or reload that can affect runtime.
- GitHub write actions.
- Real initiative creation.
- Task creation.
- Scope expansion.

## 10. Customer-Facing Explanation

### What this gives the customer

SEKHEM shows a controlled product journey from research signals to reviewed evidence, then to a candidate initiative and approval gate. The value is not only collecting information; it is turning evidence into a governed decision path that can later connect to engineering readiness.

### What is not yet production execution

This is a production-track slice, not a final production launch. It demonstrates the core operating model and validated integration path, while keeping rollout, public exposure, AI activation, and automated execution behind approval gates.

### What we can safely say

Safe claims:

- The system demonstrates a live governed workflow from evidence to decision readiness.
- The backend API and persistence layer have been validated in the private runtime.
- Workflow summaries are sanitized before they are shown.
- GitHub readiness is read-only at this stage.
- PM approval remains required before real initiative promotion.
- AI can be added later behind a controlled approval gate.

Do not say:

- This is production.
- AI replaces engineers.
- SEKHEM automatically creates tasks.
- SEKHEM automatically approves initiatives.
- The workflow runs publicly.
- The system writes to GitHub.

## 11. Forbidden Actions Confirmation

Confirmed for this documentation-only task:

- No production deployment.
- No public exposure.
- No DNS cutover.
- No VM reboot.
- No host reboot.
- No restore execution.
- No backup scheduling implementation.
- No destructive commands.
- No database migration.
- No secrets printed.
- No AI provider call.
- No workflow execution.
- No service restart.
- No backend code.
- No frontend code.

## Final Decision

Decision: PASS — documentation-only deployment and rollback plan created.

This document does not approve execution. A separate PM-approved implementation task is required before any deployment or runtime change.
