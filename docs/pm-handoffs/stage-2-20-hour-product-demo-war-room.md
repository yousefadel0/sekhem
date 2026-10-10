# Stage 2 — 20-Hour Product Demo War Room

## PM Decision

```text
STOP documentation-only batches unless they block the demo.
START visible product-demo implementation.
Target: customer-visible UI/UX + backend/private API + n8n workflow proof + GitHub readiness/status within 20 hours.
```

## Why This Exists

The project has passed enough governance and safety gates to stop spending most effort on documentation-only loops.

The current priority is to show a working SEKHEM product journey that the customer can understand quickly.

The demo must prove product motion while preserving safety.

## Product Demo Objective

Show this customer-visible journey:

```text
R&D Radar
→ Evidence Collected
→ Human Review Score
→ Candidate Initiative Draft
→ PM Approval Gate
→ Execution Path / GitHub Readiness Card
```

The demo must visibly interact with or represent:

1. Backend private API or demo-safe backend fixtures.
2. n8n manual/internal workflow output.
3. GitHub read-only/demo-safe integration/status layer.

## Hard Safety Rules

These are non-negotiable:

- No production claim.
- No public API exposure.
- No DB writes unless separately approved.
- No persistence unless separately approved.
- No AI provider connection unless separately approved.
- No real initiative creation.
- No task creation.
- No source-control runtime writes.
- No GitHub write actions unless PM explicitly approves.
- No secrets in repo/docs/logs/screenshots.
- No scheduled n8n triggers.
- No public n8n triggers.
- n8n workflows must remain manual/internal and inactive after test.
- Backend remains private.
- Frontend demo may consume mock/demo-safe backend data if real integration is not ready.

## Work Tracks — Run in Parallel

### Track A — Frontend / UI

Goal:

Build a customer-visible demo screen that communicates the SEKHEM journey in 60 seconds.

Required UI sections:

1. R&D Radar status card.
2. Evidence cards from the 3 NIST sources:
   - `https://www.nist.gov/cyberframework`
   - `https://www.nist.gov/cyberframework/quick-start-guides`
   - `https://www.nist.gov/cyberframework/profiles`
3. Human review scoring summary:
   - relevance
   - reliability
   - freshness
   - business applicability
4. Candidate initiative draft:
   - `Draft Candidate: CSF-Guided Cybersecurity Risk Assessment Path`
5. PM approval gate:
   - `PM_REVIEW_REQUIRED`
   - runtime verification required before real initiative promotion
6. Execution / GitHub readiness card:
   - backend CI check name: `Backend CI / install-build-lint-test-prisma`
   - repo integration status: `read-only/demo-safe`
   - no write action executed

Customer-facing UI rules:

- Use clean product language.
- Hide internal vendor names where customer-facing.
- Do not show n8n brand in customer UI unless internal/admin mode.
- Do not show secrets, IPs, raw logs, stack traces, or internal handoff wording.

Deliverables:

- Branch.
- Files changed.
- Screenshots or local preview summary.
- How to open the screen.
- What is real vs demo/mock.
- What remains blocked.

### Track B — Backend / API

Goal:

Expose demo-safe API endpoints or static/demo fixtures for the frontend.

Preferred endpoints:

```text
GET  /api/demo/rd-radar/status
GET  /api/demo/rd-radar/evidence
GET  /api/demo/rd-radar/candidate
GET  /api/demo/rd-radar/github-status
POST /api/demo/rd-radar/run-workflow-preview
```

Allowed fallback:

If endpoint implementation is too slow, create a clean local frontend fixture first and document backend TODO.

Backend response rules:

- Sanitized output only.
- No PostgreSQL activation.
- No DB writes.
- No real initiative creation.
- No real AI connection.
- No GitHub writes.
- No secrets.

Deliverables:

- Branch.
- Files changed.
- Endpoints created or fixture fallback.
- Validation commands.
- Sample sanitized response.
- Forbidden confirmation.

### Track C — Tasker 5 / n8n

Goal:

Prepare one demo-safe manual/internal workflow or workflow summary for UI integration.

Workflow goal:

Return sanitized result for the existing R&D Radar evidence journey.

Allowed:

- Manual/internal workflow only.
- Inactive after execution.
- Use existing successful 11E/11F/11G data.
- Sanitized JSON only.
- No schedule.
- No public trigger.
- No AI.
- No DB writes.
- No persistence.
- No GitHub writes.

Expected output JSON:

```json
{
  "workflowStatus": "PASS",
  "evidenceCount": 3,
  "reviewStatus": "PASS",
  "candidateId": "candidate-csf-guided-risk-assessment-001",
  "nextGate": "PM_REVIEW_REQUIRED",
  "runtimeVerificationRequired": true,
  "forbiddenActionsObserved": false
}
```

Deliverables:

- Workflow name.
- Workflow ID if created/used.
- Execution ID if available.
- Sanitized output.
- Proof workflow remains inactive.
- Proof no public/scheduled trigger.
- Proof no credentials/forbidden nodes.
- Forbidden confirmation.

### Track D — GitHub Readiness / Status

Goal:

Show demo-safe GitHub readiness/status without source-control writes.

Allowed:

- Read-only status display.
- Show repo integration status as `read-only/demo-safe`.
- Show backend CI check name: `Backend CI / install-build-lint-test-prisma`.
- Show branch protection status as manually governed / pending GitHub Team upgrade.

Forbidden:

- No GitHub write actions.
- No branch protection changes.
- No source-control runtime writes.
- No automated PR/commit creation from runtime.

## Fast QA Mode

TASKER QA must use short decisions only.

Format:

```text
Decision:
PASS / FIX / BLOCKED

Checked:
- scope
- files/runtime touched
- demo opens
- backend/API or fixture works
- n8n/manual output works if included
- GitHub status is read-only/demo-safe
- no forbidden actions

Blockers only:
...

Non-blocking notes:
...

Final:
APPROVED FOR DEMO
or
FIX BEFORE DEMO
```

Do not write long essays unless there is a real safety blocker.

## Deferred Until After Demo

Do not spend the next 20 hours on:

- ESXi Auto Start confirmation, unless already available.
- Controlled VM reboot validation.
- Restore execution.
- Backup scheduling.
- PostgreSQL activation.
- AI integration.
- GitHub Team upgrade.
- Branch protection enforcement.
- Docker image pinning.
- General documentation polishing.
- New governance-only plans that do not unblock the demo.

## First 4-Hour Target

The following must be visible:

```text
R&D Radar demo screen
3 evidence cards
candidate draft
PM approval gate
GitHub readiness card
```

## 8–12 Hour Target

Add:

```text
Run Workflow Preview button or simulated action
sanitized workflow result
clear real-vs-demo labels
```

## 20-Hour Target

Deliver:

```text
Customer-presentable demo
UI journey visible
backend/fixture data wired
n8n proof-of-motion or workflow-output card
GitHub readiness/status card
no forbidden action
```

## PM Decision Rules During War Room

For every report, PM decision should be one of:

```text
PASS — continue
FIX — fix listed blocker only
BLOCK — stop due to real safety/product blocker
```

Require full QA review only for:

- public exposure
- DB write
- secrets
- GitHub write
- AI connection
- production deployment
- persistence
- real initiative creation
- task creation

## Current Tasker Assignments

### Frontend / UI

Start now.

Primary next step:

Build the R&D Radar demo screen with fixture data if needed.

### Backend

Start now.

Primary next step:

Create demo-safe endpoints or confirm fixture fallback.

### Tasker 5 / n8n

Start now.

Primary next step:

Prepare sanitized manual/internal workflow-output card for UI integration using existing 11E/11F/11G data.

### Tasker QA

Start now.

Primary next step:

Review demo outputs in fast QA mode only.

## Final Rule

The demo wins unless there is a real safety blocker.
