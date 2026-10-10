# Stage 2 Online Workflow Architecture

## Purpose

This document defines the Stage 2 online workflow and AI Gateway architecture for Sekhem.

This is a planning document only. It does not implement workflows, connect real services, add credentials, or activate runtime automation.

## Current Mode

Stage 2 runs in online runtime mode.

The R&D Internet Collector runs inside the normal Automation Runtime with R&D Radar. Air-gap operation is not part of this stage and is deferred to a later enterprise deployment mode.

## Non-Negotiable Rules

- No credentials in repository files or documentation.
- No hardcoded secrets.
- No real service connection in this planning task.
- No direct AI calls from the frontend.
- No vendor names in customer-facing UI.
- All automation actions must pass through backend-approved endpoints.
- Human approval remains required for risky actions.
- Real service connections are allowed later only through environment variables, runtime credential store, and PM approval.
- Workflow runtime may prepare recommendations, drafts, and packages, but it must not perform production-impacting actions without an explicit approval gate.

## Architectural Boundary

```text
Customer UI
  -> Backend API
    -> Automation Runtime
      -> Workflow Nodes
      -> AI Gateway
      -> Approved External Services later
    -> Audit Log
    -> Data Store
```

The frontend displays business concepts only. It must never expose internal tool names, AI provider names, automation engine names, queue names, tokens, secrets, raw model prompts, or internal workflow node labels.

The backend is the control plane. The Automation Runtime is not allowed to bypass the backend for business-state changes.

## AI Gateway Mock-First Lifecycle

### First implementation

- AI Gateway returns deterministic mock responses.
- Mock responses are generated from fixed templates and fixture data.
- All AI requests are logged as audit events without storing secrets or sensitive prompts.
- Frontend calls backend endpoints only.
- Backend calls the AI Gateway boundary only.
- Automation Runtime can request AI-generated drafts only through backend-approved endpoints.

### Runtime activation later

- AI Gateway routes requests to approved providers or local models through server-side configuration.
- Provider credentials live only in environment variables or credential store.
- Model routing, budget caps, logging policy, retry policy, and prompt templates are controlled server-side.
- Customer UI continues to show neutral labels such as `AI Analysis`, `Technical Memo`, `Risk Review`, and `Recommendation`.
- No provider or automation vendor names are shown in customer-facing UI.

## Common Backend Endpoint Pattern

Endpoint names below are proposed planning endpoints. Tasker 4/backend implementation may adjust names, but the workflow must preserve the same control principle: automation submits requests to backend-approved APIs and receives controlled outputs.

Common endpoint groups:

- `/api/automation/events/*`
- `/api/rd/*`
- `/api/initiatives/*`
- `/api/approvals/*`
- `/api/ai-gateway/*`
- `/api/tasks/*`
- `/api/code-workspaces/*`
- `/api/security-gates/*`
- `/api/blockers/*`
- `/api/release-packages/*`
- `/api/audit/*`

## Common Workflow Node Types

Expected workflow node types are generic and must remain implementation-neutral in customer-facing documentation:

- Schedule Trigger
- Backend Webhook Trigger
- HTTP Request to Backend
- Data Validation
- Deduplication
- Normalization
- AI Gateway Request
- Human Approval Wait
- Conditional Branch
- Task Creation
- Notification
- Error Handler
- Audit Logger
- Package Builder

Internal implementation may use a workflow automation engine later, but customer-facing UI must not name it.

---

# WF0 R&D Internet Collector

## Trigger

Scheduled run inside the online Automation Runtime, manually triggered PM run, or backend event requesting a focused collection cycle.

## Inputs

- Research topic or radar domain.
- Allowed source categories.
- Search keywords.
- Collection schedule.
- Customer/project context approved by backend.
- Collection limits and rate rules.

## Outputs

- Raw candidate findings.
- Source metadata.
- Collection run ID.
- Initial duplicate score.
- Initial relevance score.
- Import-ready payload for WF1.

## Backend Endpoints Used

- `POST /api/rd/collector-runs`
- `POST /api/rd/collector-runs/{runId}/findings`
- `GET /api/rd/radar-config`
- `POST /api/audit/events`
- `POST /api/automation/events/collector-completed`

## Expected Workflow Nodes

- Schedule Trigger
- Manual Backend Trigger
- HTTP Request to approved source connector later
- Source Fetch
- Content Extract
- Metadata Extract
- Deduplication
- Backend Submit
- Audit Logger
- Error Handler

## Credentials Needed Later

- External search/source API credentials, if approved.
- Proxy or controlled egress credential, if required.
- Backend service credential for Automation Runtime.

No credential values are stored in repository files or documentation.

## Approval Gate

No approval is required for mock collection. PM approval is required before enabling any real external source connector or paid API consumption.

## Audit Events

- `rd.collector.run.started`
- `rd.collector.source.requested`
- `rd.collector.finding.captured`
- `rd.collector.duplicate.detected`
- `rd.collector.run.completed`
- `rd.collector.run.failed`

## Failure Handling

- Retry transient source failures within safe limits.
- Mark source as failed without blocking the full run.
- Send partial findings to backend with failed-source metadata.
- Stop run if source policy, credential, or rate-limit error is detected.
- Write sanitized error event to audit log.

## What Is Mocked First

- External source access.
- Internet search results.
- Extracted content.
- Relevance scoring.
- Rate limits.

## What Becomes Real Later

- Approved external source connectors.
- Real source crawling/search within allowed policy.
- Real extraction and source metadata capture.
- Real rate limiting and source health tracking.

---

# WF1 R&D Normalize / Import

## Trigger

WF0 completion event or backend request to import pending R&D findings.

## Inputs

- Raw findings from WF0.
- Source metadata.
- Radar taxonomy.
- Customer/project context.
- Deduplication rules.
- Confidence thresholds.

## Outputs

- Normalized R&D evidence records.
- Imported radar items.
- Rejected findings with reason.
- Duplicate mappings.
- Evidence quality score.

## Backend Endpoints Used

- `GET /api/rd/taxonomy`
- `POST /api/rd/import-batches`
- `POST /api/rd/evidence`
- `POST /api/rd/findings/{findingId}/reject`
- `POST /api/audit/events`
- `POST /api/automation/events/rd-import-completed`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Data Validation
- Content Normalization
- Deduplication
- Classification
- AI Gateway Request for summary later
- Backend Import
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- AI Gateway service credential if AI-assisted summarization is activated.

No source credentials are required in this workflow if WF0 already collected the data.

## Approval Gate

No approval required for mock import. PM approval is required before enabling AI-assisted summarization or automatic import into customer-visible R&D Radar.

## Audit Events

- `rd.import.batch.started`
- `rd.import.finding.normalized`
- `rd.import.finding.rejected`
- `rd.import.duplicate.linked`
- `rd.import.evidence.created`
- `rd.import.batch.completed`
- `rd.import.batch.failed`

## Failure Handling

- Reject invalid records with reason.
- Continue processing valid records.
- Stop batch if schema mismatch affects all records.
- Preserve raw finding reference for traceability.
- Report failed batch to backend Failure / Blocker Center if unresolved.

## What Is Mocked First

- Normalized finding records.
- Evidence quality score.
- AI summaries.
- Taxonomy classification.

## What Becomes Real Later

- Real schema validation.
- Real deduplication.
- Real vector-ready evidence preparation.
- Real AI-assisted summarization through AI Gateway after approval.

---

# WF2 Start Initiative

## Trigger

User action in backend-controlled UI to start an initiative from a recommended R&D item, or PM-approved backend event.

## Inputs

- Selected R&D item.
- Evidence IDs.
- Initiative title.
- Business objective.
- Technical scope.
- Owner.
- Priority.
- Initial risk level.

## Outputs

- Initiative record.
- Activity timeline entry.
- Initial decision state.
- Proposed execution path options.
- Audit trail.

## Backend Endpoints Used

- `POST /api/initiatives`
- `GET /api/rd/evidence/{evidenceId}`
- `POST /api/initiatives/{initiativeId}/activity`
- `POST /api/automation/events/initiative-started`
- `POST /api/audit/events`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Evidence Fetch
- Initiative Context Builder
- Execution Path Draft
- Backend Update
- Notification
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Notification provider credential later, if enabled.

## Approval Gate

Human action is required to start an initiative. Automation must not create initiatives directly from raw R&D findings without backend-approved user action.

## Audit Events

- `initiative.start.requested`
- `initiative.created`
- `initiative.evidence.linked`
- `initiative.execution-path.options.generated`
- `initiative.owner.assigned`
- `initiative.start.failed`

## Failure Handling

- Reject start request if evidence is missing or stale.
- Keep initiative in draft if downstream automation fails.
- Do not generate tasks until execution path is approved.
- Raise blocker if required evidence cannot be loaded.

## What Is Mocked First

- Execution path options.
- Activity timeline automation.
- Notifications.

## What Becomes Real Later

- Real initiative lifecycle state machine.
- Real evidence linking.
- Real owner assignment and notifications.
- Real execution path recommendation using AI Gateway after approval.

---

# WF3 Execution Path Approval

## Trigger

Initiative enters `awaiting_execution_path_approval` state.

## Inputs

- Initiative ID.
- Proposed execution paths.
- Evidence summary.
- Risk score.
- Required approvals.
- Owner and reviewer identities.

## Outputs

- Approved execution path.
- Rejected paths with reason.
- Updated initiative state.
- Approval record.
- Next workflow trigger.

## Backend Endpoints Used

- `GET /api/initiatives/{initiativeId}`
- `POST /api/approvals/execution-path`
- `POST /api/initiatives/{initiativeId}/state`
- `POST /api/automation/events/execution-path-approved`
- `POST /api/audit/events`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Approval Context Builder
- Human Approval Wait
- Conditional Branch
- Backend State Update
- Notification
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Identity provider or internal approval service credential later.
- Notification credential later, if enabled.

## Approval Gate

Mandatory human approval. No downstream technical memo, task generation, code workspace, or security gate package proceeds without approved execution path.

## Audit Events

- `execution_path.approval.requested`
- `execution_path.approved`
- `execution_path.rejected`
- `execution_path.changes_requested`
- `initiative.state.changed`
- `execution_path.approval.failed`

## Failure Handling

- Keep initiative in pending approval if approval workflow fails.
- Prevent duplicate approval submissions.
- Escalate timeout to blocker queue.
- Preserve all approval decisions and reviewer comments.

## What Is Mocked First

- Approval UI response.
- Reviewer assignment.
- Approval notifications.

## What Becomes Real Later

- Real RBAC-backed approval.
- Real reviewer routing.
- Real timeout escalation.
- Real approval evidence retention.

---

# WF4 AI Technical Memo

## Trigger

Execution path is approved and initiative enters `technical_memo_required` state.

## Inputs

- Initiative context.
- Approved execution path.
- Linked evidence.
- Repository metadata summary, if available.
- Architecture constraints.
- Risk policy.

## Outputs

- AI Technical Memo draft.
- Assumptions list.
- Risk list.
- Recommended tasks.
- Required security checks.
- Reviewer-ready memo record.

## Backend Endpoints Used

- `GET /api/initiatives/{initiativeId}`
- `GET /api/initiatives/{initiativeId}/evidence`
- `POST /api/ai-gateway/technical-memo/draft`
- `POST /api/initiatives/{initiativeId}/technical-memos`
- `POST /api/audit/events`
- `POST /api/automation/events/technical-memo-created`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Context Fetch
- Prompt Context Builder
- AI Gateway Request
- Memo Formatter
- Backend Save Draft
- Human Review Wait
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- AI Gateway internal service credential.
- Model/provider credential later inside AI Gateway credential store only.

## Approval Gate

Human review is required before memo recommendations can generate tasks or affect execution state.

## Audit Events

- `technical_memo.generation.requested`
- `ai_gateway.request.created`
- `ai_gateway.mock_response.returned`
- `technical_memo.draft.created`
- `technical_memo.review.approved`
- `technical_memo.review.rejected`
- `technical_memo.generation.failed`

## Failure Handling

- If AI Gateway fails, create a manual memo placeholder.
- Do not block initiative permanently.
- Mark memo as failed and route to Failure / Blocker if repeated failures occur.
- Never expose raw prompts or provider errors to customer UI.

## What Is Mocked First

- AI memo content.
- Risk analysis.
- Recommended tasks.
- Repository intelligence context.

## What Becomes Real Later

- Real AI Gateway model routing.
- Real context retrieval.
- Real memo generation.
- Real reviewer feedback loop.

---

# WF5 Task / Kanban

## Trigger

AI Technical Memo is reviewed and approved, or PM manually requests task planning for an approved initiative.

## Inputs

- Approved technical memo.
- Initiative scope.
- Execution path.
- Constraints.
- Security requirements.
- Owner/team mapping.

## Outputs

- Task list.
- Kanban cards.
- Dependencies.
- Acceptance criteria.
- Risk tags.
- Status transitions.

## Backend Endpoints Used

- `GET /api/initiatives/{initiativeId}/technical-memos/latest-approved`
- `POST /api/tasks/batches`
- `POST /api/tasks`
- `POST /api/initiatives/{initiativeId}/kanban-state`
- `POST /api/audit/events`
- `POST /api/automation/events/tasks-created`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Memo Fetch
- Task Breakdown
- Dependency Mapper
- Backend Task Create
- Kanban Update
- Notification
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Project management connector credential later, if external integration is approved.
- Notification credential later, if enabled.

## Approval Gate

Human approval is required before generated tasks are accepted into active execution. Mock tasks may be created as draft only.

## Audit Events

- `task.batch.generation.requested`
- `task.draft.created`
- `task.approved`
- `task.activated`
- `kanban.state.updated`
- `task.generation.failed`

## Failure Handling

- Keep generated tasks in draft if validation fails.
- Reject tasks missing acceptance criteria.
- Prevent duplicate task creation from the same memo version.
- Escalate unresolved dependency conflict to blocker workflow.

## What Is Mocked First

- Generated task list.
- Kanban board updates.
- Notifications.
- External project management sync.

## What Becomes Real Later

- Real task creation in backend.
- Real Kanban lifecycle.
- Real dependency tracking.
- Optional external task system integration after approval.

---

# WF6 Code Draft Workspace

## Trigger

Approved task enters `ready_for_code_draft` state and human reviewer requests a code draft workspace.

## Inputs

- Approved task ID.
- Initiative ID.
- Repository metadata.
- Allowed branch policy.
- File scope restrictions.
- Technical memo constraints.
- Security restrictions.

## Outputs

- Draft workspace request.
- Workspace metadata.
- Branch suggestion.
- Proposed change summary.
- Draft handoff for engineering review.

## Backend Endpoints Used

- `GET /api/tasks/{taskId}`
- `GET /api/initiatives/{initiativeId}`
- `POST /api/code-workspaces/requests`
- `POST /api/code-workspaces/{workspaceId}/draft-summary`
- `POST /api/audit/events`
- `POST /api/automation/events/code-workspace-requested`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Task Scope Fetch
- Repository Scope Validator
- Workspace Request Builder
- AI Gateway Request for draft plan later
- Backend Save Workspace Request
- Human Approval Wait
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Repository platform credential later, only after PM approval.
- Code workspace runtime credential later, if approved.
- AI Gateway internal service credential later for code draft planning.

## Approval Gate

Mandatory human approval before any real repository branch, pull request, or code workspace is created. Automation must not directly write to production branches.

## Audit Events

- `code_workspace.requested`
- `code_workspace.scope.validated`
- `code_workspace.scope.rejected`
- `code_workspace.mock_created`
- `code_workspace.real_activation.requested`
- `code_workspace.failed`

## Failure Handling

- Reject if task lacks approval.
- Reject if requested file scope exceeds approved boundaries.
- Reject if branch policy is missing.
- Escalate unclear scope to Failure / Blocker Center.

## What Is Mocked First

- Workspace creation.
- Branch creation.
- Repository inspection.
- Code draft output.

## What Becomes Real Later

- Real isolated code workspace creation.
- Real repository branch creation after approval.
- Real draft changes in non-production branch.
- Real pull request preparation after security review.

---

# WF7 Security Gate

## Trigger

Code draft workspace produces a reviewable change package, or release package requires security validation.

## Inputs

- Workspace ID.
- Proposed change summary.
- Changed files list.
- Risk profile.
- Dependency metadata.
- Security policy.
- Approval history.

## Outputs

- Security gate result.
- Risk classification.
- Required fixes.
- Approval or rejection state.
- Security evidence record.

## Backend Endpoints Used

- `GET /api/code-workspaces/{workspaceId}`
- `POST /api/security-gates/runs`
- `POST /api/security-gates/{runId}/results`
- `POST /api/approvals/security-gate`
- `POST /api/audit/events`
- `POST /api/automation/events/security-gate-completed`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Change Metadata Fetch
- Static Policy Check
- Dependency Policy Check later
- AI Gateway Risk Review later
- Human Security Approval Wait
- Backend Result Save
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Repository read credential later, if approved.
- Security scanning tool credential later, if approved.
- AI Gateway internal service credential later.

## Approval Gate

Human security approval is mandatory for risky changes, release-impacting changes, permission changes, external integrations, infrastructure changes, and any change touching secrets, auth, deployment, or data paths.

## Audit Events

- `security_gate.run.started`
- `security_gate.policy.checked`
- `security_gate.risk.flagged`
- `security_gate.approved`
- `security_gate.rejected`
- `security_gate.override.requested`
- `security_gate.run.failed`

## Failure Handling

- Block release package if security gate fails.
- Route unresolved risk to Failure / Blocker Center.
- Prevent override without human approval.
- Preserve all risk evidence and reviewer comments.

## What Is Mocked First

- Security scan results.
- Dependency risk output.
- AI risk review.
- Approval response.

## What Becomes Real Later

- Real static checks.
- Real dependency checks.
- Real repository diff review.
- Real policy-driven gate enforcement.

---

# WF8 Failure / Blocker

## Trigger

Any workflow emits a failed, blocked, timed-out, rejected, or requires-human-review event.

## Inputs

- Source workflow ID.
- Entity ID.
- Failure type.
- Sanitized error message.
- Retry count.
- Owner.
- Severity.
- Related audit events.

## Outputs

- Blocker record.
- Severity classification.
- Owner assignment.
- Recommended next action.
- Retry or stop decision.
- Timeline update.

## Backend Endpoints Used

- `POST /api/blockers`
- `PATCH /api/blockers/{blockerId}`
- `POST /api/blockers/{blockerId}/activity`
- `POST /api/automation/events/blocker-created`
- `POST /api/audit/events`

## Expected Workflow Nodes

- Error Trigger
- Backend Event Fetch
- Failure Classifier
- Severity Mapper
- Owner Resolver
- Notification
- Backend Blocker Create
- Audit Logger

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Notification credential later, if enabled.
- Incident/ticketing connector credential later, if approved.

## Approval Gate

Human decision required for retries that may change state, repeat paid AI calls, rerun external collection, or unblock security/release gates.

## Audit Events

- `blocker.created`
- `blocker.classified`
- `blocker.owner.assigned`
- `blocker.retry.requested`
- `blocker.resolved`
- `blocker.escalated`

## Failure Handling

- Blocker workflow must avoid infinite recursion.
- If blocker creation fails, write minimal audit event and send fallback notification later.
- Repeated failures are grouped under the same blocker when possible.
- Sensitive technical details are kept internal and sanitized for customer-facing UI.

## What Is Mocked First

- Failure classification.
- Owner assignment.
- Notification.
- Retry actions.

## What Becomes Real Later

- Real incident classification.
- Real SLA timers.
- Real owner routing.
- Real retry orchestration after approval.

---

# WF9 Release Package

## Trigger

Security Gate is approved and initiative/task set reaches release-package-ready state.

## Inputs

- Initiative ID.
- Approved task list.
- Technical memo.
- Security gate result.
- Change summary.
- Test evidence.
- Release notes draft.
- Approval history.

## Outputs

- Release package record.
- Release notes.
- Evidence bundle.
- Approval checklist.
- Go/no-go recommendation.
- PM review handoff.

## Backend Endpoints Used

- `GET /api/initiatives/{initiativeId}`
- `GET /api/security-gates/{runId}`
- `POST /api/release-packages`
- `POST /api/release-packages/{packageId}/evidence`
- `POST /api/approvals/release-package`
- `POST /api/audit/events`
- `POST /api/automation/events/release-package-created`

## Expected Workflow Nodes

- Backend Webhook Trigger
- Evidence Collector
- Checklist Builder
- Release Notes Builder
- Package Builder
- Human Release Approval Wait
- Backend Package Save
- Audit Logger
- Error Handler

## Credentials Needed Later

- Backend service credential for Automation Runtime.
- Repository read credential later, if approved.
- Artifact storage credential later, if approved.
- Notification credential later, if enabled.

## Approval Gate

Mandatory human approval. Release Package workflow prepares a package only. It does not deploy, merge, push to main, publish artifacts, or touch production.

## Audit Events

- `release_package.creation.requested`
- `release_package.evidence.collected`
- `release_package.checklist.created`
- `release_package.created`
- `release_package.approved`
- `release_package.rejected`
- `release_package.creation.failed`

## Failure Handling

- Block package if required evidence is missing.
- Route missing security approval to Failure / Blocker Center.
- Preserve partial package as draft if non-critical evidence is missing.
- Prevent duplicate package generation for the same approved change set.

## What Is Mocked First

- Release package content.
- Evidence bundle.
- Release notes.
- Go/no-go recommendation.

## What Becomes Real Later

- Real evidence collection.
- Real artifact references.
- Real release checklist enforcement.
- Real PM release review workflow.

---

# Runtime Activation Principles

## Mock-First Implementation

The first implementation should only prove state transitions, endpoint contracts, UI behavior, audit events, and approval gates using fixtures and mock workflow responses.

Mock-first means:

- No external connectors.
- No real source crawling.
- No real AI provider call.
- No real repository write.
- No real security scanner execution.
- No real deployment.
- No credentials committed or displayed.

## Real Activation Later

Runtime activation happens only after PM approval and should be done workflow by workflow.

Activation order should be:

1. Backend endpoint contracts and audit events.
2. Mock workflow runtime execution.
3. Real internal workflow execution with backend-only state changes.
4. Real AI Gateway routing through credential store.
5. Real external source connectors for R&D Collector.
6. Real repository read access.
7. Real isolated code workspace creation.
8. Real security scanners.
9. Real release package evidence collection.

Production-impacting actions remain outside Stage 2 until separately approved.

## Security Restrictions

- Frontend cannot call AI providers directly.
- Frontend cannot call automation runtime directly.
- Automation runtime cannot mutate business state except through backend-approved endpoints.
- Automation runtime cannot access production data unless explicitly approved in a later task.
- Secrets must stay in environment variables or credential store.
- Logs must not include secrets, provider keys, raw credentials, or sensitive prompts.
- Customer UI must use neutral product labels and hide vendor/platform names.
- Risky workflow decisions require human approval.
- Release Package does not deploy.
- Security Gate approval does not equal production deployment approval.

## QA Checklist

- WF0 through WF9 are documented.
- Each workflow includes trigger, inputs, outputs, endpoints, nodes, credentials later, approval gate, audit events, failure handling, mocked-first scope, and real-later scope.
- R&D Collector is online and inside normal Automation Runtime with R&D Radar.
- No air-gap implementation is planned for Stage 2.
- No credentials or hardcoded secrets are included.
- No direct AI calls from frontend are allowed.
- No customer-facing vendor names are required by the UI.
- Automation is constrained to backend-approved endpoints.
- Human approval remains required for risky actions.
- Documentation only; no workflow implementation is included.

## QA Handoff

Tasker 5 submits this document for QA review under Stage 2 planning.

Requested QA decision:

- `APPROVED FOR PM IMPLEMENTATION REVIEW`
- or `NOT APPROVED — FIX PLAN`
