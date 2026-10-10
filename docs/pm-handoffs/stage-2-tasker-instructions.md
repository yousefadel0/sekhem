# Stage 2 Tasker Instructions

## Stage

Stage 2 — Online Runtime Architecture and Controlled Activation.

Current mode is online runtime. Air-gap is deferred to a later enterprise mode.

R&D Collector runs with the normal R&D Radar automation runtime for now.

---

## Stage 2 Current Runtime Status

Completed and accepted:

- Batch 1 — Ubuntu OS Baseline: PASS / CLOSED
- Batch 2 — Docker Runtime + Private Data Services Foundation: PASS / CLOSED
- Batch 3 — Private n8n Automation Runtime Preparation: PASS / CLOSED
- Batch 4 — n8n Admin Hardening + Runtime Validation: PASS / CLOSED
- Batch 5 — Controlled n8n Internal Test Workflow + Backup Dry Run: PASS / CLOSED
- Batch 6 — Backend Runtime Deployment on `sekhem-app-01`: PASS / CLOSED
- Batch 7A — Runtime Configuration Guardrails: PASS / CLOSED
- Backend Hardening Batch A — Backend Loopback Bind: PASS / CLOSED
- Batch 8 — Backend ↔ n8n Private Integration Test: PASS / CLOSED
- Batch 9 — Operational Workflow Skeleton: PASS / CLOSED
- Batch 10 — Manual Read-only Monitoring Health Scripts: PASS / CLOSED
- Monitoring/Backup Batch 2 — Manual Backup Scripts: PASS / CLOSED
- Monitoring/Backup Batch 3 — Health Scheduling Implementation: PASS / CLOSED
- Stage 2 Packaging Guardrail — backend pnpm v11 approved builds: PASS / CLOSED
- Restore-Readiness Gate Plan: PASS / CLOSED
- n8n Governance Pack Plan: PASS / CLOSED
- GitHub CI / Branch Protection Hardening Plan: PASS / CLOSED
- GitHub Backend CI Implementation: PASS / MERGED
- Backend CI Observation Follow-up PR: PASS / MERGED
- GitHub Branch Protection Manual Enforcement: BLOCKED / MANUAL POLICY ACTIVE
- Post-Reboot Resilience Incident: RECOVERED / CLOSED
- Post-Reboot Resilience Runtime-Side Hardening: PASS / CLOSED
- ESXi Auto Start Confirmation: PENDING MANUAL UI CONFIRMATION

R&D Collector progression:

- Stage 2 Batch 11 — Controlled Plan: PASS / CLOSED
- Stage 2 Batch 11A — Mock-only Workflow: PASS / CLOSED
- Stage 2 Batch 11B — Controlled Limited Source Plan: PASS / CLOSED
- Stage 2 Batch 11C — One-source / One-page Execution Plan: PASS / CLOSED
- Stage 2 Batch 11D — Original NIST news URL Execution: ABORTED SAFELY / SOURCE 4xx
- Stage 2 Batch 11D-Fix — NIST Cyberframework One-page Controlled Execution: PASS / CLOSED
- Stage 2 Batch 11E — Three-URL Controlled Plan: PASS / CLOSED
- Stage 2 Batch 11E-Execution — Three-URL Controlled Execution: PASS / CLOSED
- Stage 2 Batch 11F — Human Review + Evidence Scoring Plan: PASS / MERGED
- Stage 2 Batch 11F-Execution — Manual Human Review Simulation: PASS / CLOSED
- Stage 2 Batch 11G — Candidate Initiative Proposal Rules Plan: PASS / MERGED
- Stage 2 Batch 11G-Execution — Candidate Initiative Draft Proposal Simulation: APPROVED TO CLOSE / REPORT-BASED QA
- Stage 2 Batch 11H — PM Approval Workflow Rules Plan: PASS / MERGED

---

## Key Runtime Facts

- `sekhem-app-01` — Tailscale IP `100.74.93.25`
- Backend process binds only to `127.0.0.1:3001`
- Backend private Nginx listener: `100.74.93.25:8080`
- Backend private health: `http://100.74.93.25:8080/api/health`
- `sekhem-automation-01` — Tailscale IP `100.72.37.105`
- n8n private listener: `100.72.37.105:5678`
- `sekhem-data-01` — Tailscale IP `100.125.158.124`
- PostgreSQL: `100.125.158.124:5432` — healthy
- Redis: `100.125.158.124:6379` — healthy
- MinIO API: `100.125.158.124:9000` — healthy
- MinIO Console: `100.125.158.124:9001`
- Admin Tailscale IP: `100.89.249.75`

---

## Stage 2 Batch 11H Plan Facts

PR #47 merged commit: `8ae8ef957f4491ecb647b05264f5f5f601039851`.

File:

`docs/product/stage-2-batch-11h-pm-approval-workflow-rules-plan.md`

Scope:

- documentation-only PM approval workflow rules plan
- PM approval workflow states
- required PM review fields
- runtime verification requirement before promotion
- approval and rejection rules
- sanitized PM approval decision object
- no execution or downstream product action

Important context:

- Batch 11G-Execution was approved to close based on submitted Tasker report.
- Batch 11G-Execution was not independently verified from n8n/server runtime.
- Candidate proposal: `candidate-csf-guided-risk-assessment-001`.
- Recommended next gate: `PM_REVIEW_REQUIRED`.
- Batch 11H makes independent runtime verification a hard prerequisite before any real initiative promotion.

Controlled PM approval workflow states:

- `draft_candidate_created`
- `pm_review_pending`
- `pm_approved_for_initiative_creation`
- `pm_rejected`
- `more_evidence_required`
- `domain_expert_review_required`

Required PM review fields:

- `candidateId`
- `proposalTitle`
- `sourceReviewObjectIds`
- `evidenceScoresSummary`
- `expectedBusinessValue`
- `uncertaintyRisks`
- `requiredAdditionalEvidence`
- `pmDecision`
- `pmDecisionReason`
- `approvedScopeIfAny`
- `nextGate`
- `requiresRuntimeVerificationBeforePromotion=true`

Runtime verification requirement before real initiative creation:

- `n8nWorkflowId`
- `n8nExecutionId` if available
- `sanitizedExecutionSummary`
- `workflowActiveFalseProof`
- `nodeList`
- `timestamp`
- `proofNoCredentials`
- `proofNoForbiddenNodes`
- `proofNoPersistence`
- `proofNoDbWrites`
- `proofNoPublicTrigger`
- `proofNoScheduledTrigger`

Approval rules:

- PM approval must be explicit.
- PM approval must define scope.
- PM approval does not imply database write.
- PM approval does not imply AI enrichment.
- PM approval does not imply task creation.
- PM approval does not bypass runtime verification.
- PM approval does not create a real initiative.

Rejection rules:

- reject promotion if runtime verification proof is missing or incomplete
- reject if `createdAsDraftOnly` is not true
- reject if `sourceExecutionBatchStatus` is not `QA_APPROVED_PASS`
- reject if `requiredAdditionalEvidence` exists and remains unresolved
- reject if `pmDecision` is missing or not approved
- reject if real initiative creation path has no rollback/disable plan
- reject if output includes raw source content, raw HTML, full headers, private credentials, AI-generated conclusions, database write results, production initiative IDs, or task IDs

Not approved by this plan:

- execution
- real initiative creation
- task creation
- AI provider
- AI enrichment
- database writes
- persistence
- runtime source-control writes
- workflow activation
- public trigger
- scheduled trigger
- frontend cutover
- private credentials
- raw source content
- runtime changes
- production changes

Separate PM-approved implementation/execution task is required before any PM approval workflow execution, runtime verification execution, real initiative creation, persistence, task creation, or downstream product action.

---

## Stage 2 Batch 11G-Execution Facts

Decision: APPROVED TO CLOSE.

Important note:

- QA approval was based on submitted Tasker report.
- QA did not independently verify n8n UI, server logs, or direct runtime command output.
- Any promotion beyond draft candidate must satisfy the runtime verification requirement defined in Batch 11H.

Review name:

`SEKHEM Batch 11G-Execution - Candidate Initiative Draft Proposal Simulation`

Review mode:

`manual_internal_draft_proposal_simulation_only`

Submitted source execution batch:

`stage-2-batch-11e-execution`

Submitted source execution status:

`QA_APPROVED_PASS`

Candidate proposal reviewed:

`candidate-csf-guided-risk-assessment-001`

Proposal title:

`Draft Candidate: CSF-Guided Cybersecurity Risk Assessment Path`

Evidence references:

- `review-nist-csf-main-001`
- `review-nist-csf-quick-start-001`
- `review-nist-csf-profiles-001`

Eligibility result: PASS.

Reported eligibility checks:

- atLeastOneAcceptAsRelevant=true
- atLeastOneReliabilityScoreGte4=true
- averageRelevanceScore=4.33
- averageRelevanceScoreGte4=true
- needsMoreSourcesProducesRequiredAdditionalEvidence=true
- createCandidateInitiativeLaterStillRequiresPMApproval=true
- noAutomaticInitiativeCreation=true

Governance result: PASS.

Candidate proposal remained:

- draft-only
- manual/internal
- non-persistent
- not a real initiative
- not a task
- not a workflow activation
- not an AI-generated output
- not a database write

Recommended next gate:

`PM_REVIEW_REQUIRED`

Required additional evidence before real initiative:

- more official NIST or authoritative sources explaining CSF Profiles and implementation examples
- cybersecurity domain expert interpretation
- PM validation of whether the candidate should target assessment, governance mapping, R&D Radar scoring, or customer-facing guidance

---

## Stage 2 Batch 11G Plan Facts

PR #46 merged commit: `d3b9ed3dd570d3f3720fb0b8f667aefb704aa913`.

File:

`docs/product/stage-2-batch-11g-candidate-initiative-proposal-rules-plan.md`

Scope:

- documentation-only candidate initiative proposal rules plan
- candidate proposal fields
- eligibility rules and rejection rules
- sanitized draft-only candidate proposal object
- PM approval gate
- no-real-initiative boundary

Required candidate proposal fields:

- `initiativeCandidateId`
- `sourceReviewObjectIds`
- `sourceExecutionBatchId`
- `proposalTitle`
- `problemStatement`
- `evidenceSummary`
- `relevanceRationale`
- `expectedBusinessValue`
- `uncertaintyRisks`
- `requiredAdditionalEvidence`
- `recommendedOwnerRole`
- `recommendedNextGate`
- `requiresPMApproval=true`
- `createdAsDraftOnly=true`

Not approved by this plan:

- execution
- AI provider
- AI enrichment
- DB writes
- persistence
- real initiative creation
- automatic initiative creation
- task creation
- workflow activation
- public trigger
- scheduled trigger
- frontend cutover
- secrets
- raw page content
- raw HTML
- full headers
- runtime source-control writes
- production changes

---

## Stage 2 Batch 11F-Execution Facts

Decision: APPROVED — CLOSED.

Review name:

`SEKHEM Batch 11F-Execution - Manual Human Review Simulation`

Review mode:

`manual_internal_human_review_simulation_only`

Source execution batch:

`Stage 2 Batch 11E-Execution`

Source execution status used:

`QA_APPROVED_PASS`

Reviewed sanitized evidence objects:

1. `review-nist-csf-main-001` — `https://www.nist.gov/cyberframework`
2. `review-nist-csf-quick-start-001` — `https://www.nist.gov/cyberframework/quick-start-guides`
3. `review-nist-csf-profiles-001` — `https://www.nist.gov/cyberframework/profiles`

---

## Current Quality Gate Plan

Closed quality gates:

- Stage 2 Packaging Guardrail — CLOSED
- Monitoring/Backup health scheduling — CLOSED
- Restore-Readiness Gate Plan — CLOSED
- n8n Governance Pack Plan — CLOSED
- GitHub CI / Branch Protection Hardening Plan — CLOSED
- GitHub Backend CI Implementation — CLOSED
- Backend CI pull_request observation — CLOSED
- R&D Collector Controlled Plan — CLOSED
- R&D Collector Mock-only Workflow — CLOSED
- R&D Collector Controlled Limited Source Plan — CLOSED
- R&D Collector One-source / One-page Execution Plan — CLOSED
- R&D Collector One-page Controlled Execution — CLOSED after 11D-Fix
- R&D Collector Three-URL Controlled Plan — CLOSED
- R&D Collector Three-URL Controlled Execution — CLOSED
- R&D Collector Human Review + Evidence Scoring Plan — CLOSED
- R&D Collector Manual Human Review Simulation — CLOSED
- R&D Collector Candidate Initiative Proposal Rules Plan — CLOSED
- R&D Collector Candidate Initiative Draft Proposal Simulation — CLOSED / report-based QA
- R&D Collector PM Approval Workflow Rules Plan — CLOSED
- Branch Protection Enforcement — BLOCKED until GitHub Team or Enterprise upgrade; temporary manual merge policy active
- Post-Reboot Resilience Runtime-Side Hardening — CLOSED / ESXi Auto Start pending manual confirmation

Remaining execution gates before broader runtime expansion:

1. ESXi Auto Start manual UI confirmation.
2. Controlled VM-level reboot validation — separate PM-approved task; no host reboot.
3. GitHub Team or Enterprise upgrade before enforceable branch protection can be applied.
4. After upgrade, enforce branch protection on `main` with only required check `Backend CI / install-build-lint-test-prisma`.
5. Stage 2 Batch 11H-Execution — PM Approval Decision Simulation only, after PM approval.
6. Isolated Restore-Readiness Execution — separate PM approval only; never restore onto live runtime.
7. Backup scheduling implementation — separate PM approval only; no retention deletion until dry-run cleanup rules are reviewed.
8. Optional extra main-push Backend CI observation if PM wants it before hard branch protection enforcement.

Current next candidates:

- Stage 2 Batch 11H-Execution — PM Approval Decision Simulation — Tasker 5 after PM approval.
- ESXi Auto Start manual confirmation — PM / Infra Admin.
- Controlled VM-level reboot validation — Tasker Infra after PM approval.
- GitHub account upgrade decision — PM / Repo Owner.
- Branch Protection Enforcement after upgrade — Repo Admin.
- Isolated Restore-Readiness Execution Runbook/Batch — Tasker Infra after PM approval.
- Monitoring/Backup Batch 4 — Backup Scheduling Implementation only after PM approval.
- Stage 2 Batch 7B — Controlled PostgreSQL read activation planning/testing only after execution gates close or PM explicitly approves.

---

## Temporary GitHub Operating Policy

Branch protection is currently unenforceable on the private repository until GitHub Team or Enterprise upgrade.

Temporary operating policy:

- PM-only manual merge to `main`.
- QA approval required before merge.
- Backend CI PASS required before merge.
- No force push.
- No branch deletion.
- No direct push to `main`.
- No unrelated checks required yet.

Recommended required check name for future branch protection:

`Backend CI / install-build-lint-test-prisma`

Do not enable unrelated checks as required unless separately validated:

- frontend CI
- secret scanning enforcement
- dependency review enforcement
- Vercel required check
- CODEOWNERS

---

## Still Forbidden Without a New PM-Approved Batch

- PostgreSQL runtime activation
- Prisma-backed writes
- migrations
- `db:push`
- `db:seed`
- DB reset
- host reboot validation without maintenance window
- restore test on live runtime
- restore execution on live runtime
- backup scheduling implementation
- retention deletion
- Docker image pinning/change
- R&D Collector execution beyond explicitly approved scope and exact allowlist
- recursive crawling
- scheduled R&D Collector execution
- AI enrichment
- external credentials
- AI provider connection
- public API exposure
- frontend cutover
- production claim
- source-control runtime writes
- OpenHands execution
- initiative creation
- task creation
- automated scoring
- real candidate initiative creation
- candidate proposal persistence
- PM approval workflow execution beyond approved simulation scope
- runtime verification execution without PM-approved scope

---

## Tasker Self-Refresh Rule

Before starting any new task, every tasker must first read the latest `main` version of:

`docs/pm-handoffs/stage-2-tasker-instructions.md`

The tasker must use that file as the source of truth for closed batches, current runtime facts, current quality gate plan, allowed scope, forbidden scope, next candidates, tasker-specific responsibilities, and command formatting rules.

If stale context conflicts with this file, this file wins.

Do not ask PM to restate current status if the answer is already in this file.

---

## PM Operating Mode — Quality + Speed

The PM requires both safety and speed.

Taskers must not serialize independent work unnecessarily. If scopes are independent, run them in parallel. Do not wait idle unless there is a real dependency.

Parallel execution is not allowed when tasks modify the same file/branch, deploy the same service, activate DB/migrations without approval, execute n8n workflows before the relevant gate, or touch live restore/public exposure.

Every tasker must state task owner, exact scope, files/services touched, forbidden scope, QA gate, and dependencies.

---

## Single-Box Handoff Rule

When a tasker writes instructions for another tasker, TASKER QA, or PM to copy into another chat/tool, the instructions must be in one single fenced text block.

---

## Strict Separation: Instructions vs Executable Commands

Taskers must separate human/tasker instructions from executable server commands.

- `TASKER MESSAGE` is for bots/QA/PM instructions.
- `OPERATOR COMMAND` is the exact executable block the PM can paste into PowerShell, Bash, SSH, or a server shell.

Never mix them in the same copy block.

When PM asks for execution commands, provide only the OPERATOR COMMAND block unless PM explicitly asks for explanation.

Final reports are written only after execution output exists.

---

## Mandatory Controlled Autonomy Rule

If PM assigns a task with a named scope, the tasker has full working permission inside that limited scope.

Do not ask PM for routine permission to read, inspect, create, or update files inside the repo and inside assigned task scope.

The tasker must proceed, finish the task, commit, push the assigned branch, and report.

---

## Stop Conditions — Always Require PM Approval

Stop and ask PM only before merge, force push, push to main without approval, production deployment, production data access, adding credentials/secrets, connecting real external services outside approved scope, destructive operations, scope expansion, new phase/batch, deleting unrelated files, customer-facing direction changes, restore testing/execution, cron/systemd scheduling implementation, public exposure, DNS cutover, VM reboot validation, host reboot validation, AI provider connection, DB write, persistence, initiative creation, or task creation.

If none of these stop conditions apply, continue without asking.

---

## Linux / Server Work Rules

For Linux/server work:

- Use copy-paste blocks only.
- Avoid nano/vim/vi/manual editing.
- Prefer read-only diagnosis before changes.
- Separate diagnosis, change, validation, and rollback.
- Clearly mark commands that restart services, change firewall/networking/users, install packages, delete files, touch databases, create timers, or perform backups/restores.
- If a command may disconnect SSH, alter firewall/network access, delete files, alter DBs, schedule jobs, restore data, reboot VMs/host, or expose a service publicly, stop and request explicit PM approval.

---

## Tasker Infra

Tasker Infra owns Stage 2 infrastructure, Docker/runtime base, private data services, n8n infrastructure, monitoring/backup planning, manual health/backup scripts, scheduling plans, restore-readiness planning, and post-reboot resilience when PM-approved.

Current candidates:

- ESXi Auto Start manual confirmation support.
- Controlled VM-level reboot validation after PM approval.
- Isolated Restore-Readiness Execution Plan/Runbook after PM approval.
- Monitoring/Backup Batch 4 — Backup Scheduling Implementation only after PM approval.

No service changes, VM/host reboot validation, restore test, backup scheduling, Docker changes, or public exposure without PM-approved batch.

---

## Tasker 4

Tasker 4 owns backend runtime readiness, CI/branch protection planning, and PM-approved backend implementation tasks.

Current candidates:

- Branch Protection Enforcement after GitHub Team or Enterprise upgrade, using required check `Backend CI / install-build-lint-test-prisma` only.
- Temporary manual merge policy monitoring while branch protection is unenforceable.
- Optional extra main-push Backend CI observation if PM requests it.
- Stage 2 Batch 7B — Controlled PostgreSQL read activation planning/testing only after execution gates close or PM explicitly approves.

---

## Tasker 5

Tasker 5 owns online workflow, n8n governance, AI Gateway planning, and R&D Collector workflow planning.

Current candidates:

- Stage 2 Batch 11H-Execution — PM Approval Decision Simulation after PM approval.

Do not place credentials in repo or docs.

Do not execute collection beyond explicit PM-approved exact allowlist, recursive crawling, scheduled R&D Collector, AI enrichment, external credentials, AI provider integration, persistence, source-control writes, initiative creation, task creation, real candidate initiative creation, or PM approval workflow execution beyond approved simulation scope until PM approves a specific batch with exact limits and QA gate.

---

## TASKER QA

TASKER QA reviews Stage 2 plans and PM-approved implementation reports.

QA should run in parallel when there is no file/runtime conflict.

---

## Current Stage 2 Rule

Quality gates first.

Plan first unless PM explicitly approves implementation.

Real service connections are allowed later only through environment variables, server environment, or credential store after PM approval.

No credentials in repository files, documentation, logs, screenshots, or handoff reports.
