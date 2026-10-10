# SEKHEM — FP-07 Task Contract + Risk Classification Contract

## Package

`FP-07` — Task Contract + Risk Classification

## Owner

Tasker 4

## Status

In Progress / Contract Artifact

This file is a documentation/contract artifact only.

No backend implementation, DB schema change, migration, reset, seed, db push, tool execution, AI provider activation, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the required Task Contract and Risk Classification model used before any SEKHEM product workflow may generate code, execute tools, run validations, modify files, create release evidence, or request approvals. FP-07 converts upstream execution requests into bounded, reviewable, evidence-linked work packages.

This contract prepares FP-08 Tool Router + Sandbox, FP-10 Controlled Draft Generation, FP-13 Risk-Class Security Enforcement, FP-15 Quality Runner Runtime, FP-16 Evidence Platform, and future release gates.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/full-product-parallel-execution-model.md`
- `docs/pm-handoffs/fp-06-ai-request-policy-redaction.md`
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rule: any code/file-changing package must have a Task Contract
- PM rule: no production claim before final gate

## Risk Class of This Artifact

```text
Current artifact: docs/contract only
Future backend persistence/enforcement: Class D
Future security-sensitive enforcement: Class C/D depending scope
```

Any future persistence, enforcement middleware, tool routing, or workflow runtime change must be separately task-contracted and approved.

## 1. Task Contract Requirement

A Task Contract is required before any work package can:

- change files;
- generate code or diffs;
- execute a tool profile;
- run a quality/security validation;
- touch DB/runtime/deployment paths;
- request AI provider/model use;
- create release package evidence;
- consume source connector output for import;
- modify workflow/runtime/security/release logic.

If a required Task Contract field is missing, execution result is:

```text
BLOCKED
```

## 2. Persisted Task Contract Fields — Schema Proposal

This is a proposal only. It does not implement a DB schema.

```yaml
task_contract:
  contract_id: string
  package_id: string
  task_id: string
  source_initiative_id: string | null
  objective: string
  requested_by: string
  owner: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | Infra | LabOwner | string
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  risk_reason: string
  allowed_tools: array
  allowed_files: array
  blocked_files: array
  allowed_commands: array
  blocked_commands: array
  required_tests: array
  required_reviewers: array
  required_approvals: array
  stop_conditions: array
  rollback_required: boolean
  rollback_plan_ref: string | null
  dry_run_required: boolean
  dry_run_plan_ref: string | null
  evidence_required: array
  fp16_evidence_refs: array
  blocker_id: string | null
  approval_refs: array
  status: draft | pending_review | approved | rejected | blocked | superseded
  created_at: string
  created_by: string
  reviewed_at: string | null
  reviewed_by: string | null
  review_decision: PASS | FIX | BLOCKED | null
  immutable_after_review: true
```

Required minimum fields:

```text
contract_id
package_id
task_id
objective
owner
risk_class
risk_reason
allowed_tools
allowed_files
blocked_files
required_tests
required_reviewers
required_approvals
stop_conditions
evidence_required
```

## 3. Risk Classes A/B/C/D/E

### Class A — Safe Docs / Tests / UI Text

```yaml
risk_class: ClassA
meaning: Safe documentation, test text, UI copy, PM docs, non-runtime policy artifacts.
examples:
  - docs-only policy contract
  - PM handoff note
  - test plan document
  - UI label/copy draft
requirements:
  - allowed files bounded
  - no runtime execution
  - no secrets
  - PM/QA review when board status changes
```

### Class B — Controlled App/API/UI/Report Work

```yaml
risk_class: ClassB
meaning: Controlled application, API, UI, report, or test work without sensitive security/DB/release impact.
examples:
  - bounded frontend component
  - non-sensitive API handler
  - report formatting
  - deterministic unit tests
requirements:
  - task contract
  - allowed files
  - required tests
  - reviewer assignment
  - no public exposure without approval
```

### Class C — Security-Sensitive Work

```yaml
risk_class: ClassC
meaning: Security, auth, RBAC, approval, redaction, secrets, scan policy, source safety, AI safety, or audit-sensitive work.
examples:
  - auth/RBAC
  - security gate
  - secrets/redaction policy
  - AI request safety
  - source connector safety checks
requirements:
  - security reviewer or PM review
  - security evidence
  - redaction rules
  - blocker routing
  - no secrets/raw unsafe content
```

### Class D — DB / Architecture / Release Logic

```yaml
risk_class: ClassD
meaning: Database, persistence, migrations, architecture, release gate, evidence persistence, workflow runtime, or production-impacting backend logic.
examples:
  - Prisma schema proposal
  - additive migration plan
  - evidence persistence
  - workflow runtime persistence
  - release package logic
requirements:
  - PM approval before DB/migration action
  - migration plan only until approved
  - no destructive migration
  - no DB reset
  - build/tests/evidence
  - rollback/disable note
```

### Class E — Hardware / NOS / Live Devices

```yaml
risk_class: ClassE
meaning: Hardware, Network OS, lab device, live device, production network, or NOS validation work.
examples:
  - lab evidence workflow
  - read-only NOS validation profile
  - device inventory review
  - future live hardware validation
requirements:
  - PM approval
  - lab approval
  - QA/Security review
  - no live device commands unless separately approved
  - no config push
  - no production network access
```

## 4. Risk Classification Rules

Risk classification must be rules-based. AI may suggest a risk class but must not be the authority.

Automatic minimum class rules:

| Work type | Minimum risk class |
| --- | --- |
| Docs-only PM policy | ClassA |
| Frontend/UI logic | ClassB |
| API/backend logic | ClassB |
| Auth/RBAC/audit/security | ClassC |
| AI request safety/redaction/provider gate | ClassC |
| Source connector safety | ClassC |
| DB schema/persistence/migration plan | ClassD |
| Workflow runtime persistence | ClassD |
| Release/evidence gate logic | ClassD |
| Hardware/NOS/live device/lab execution | ClassE |

Downgrades require PM approval and evidence.

If classification is ambiguous, choose the higher class or mark `BLOCKED` for PM review.

## 5. Allowed Tools

Allowed tools must be explicitly listed by contract. Examples for future contracts:

```yaml
allowed_tools:
  - docs_editor
  - github_read
  - github_write_docs_only
  - static_code_review
  - quality_runner_profile
  - security_scan_profile
  - evidence_writer
  - blocker_router
```

Rules:

- Tool access must be minimum necessary.
- A tool not listed is forbidden.
- AI may not call runtime/code/apply/deploy tools unless contract explicitly allows it and PM approval exists.
- Product runtime must not perform GitHub write actions without explicit PM approval.
- Quality runner must use profile IDs, not arbitrary commands.

## 6. Allowed Files and Blocked Files

### Allowed files

Allowed files must be exact files or bounded path patterns.

```yaml
allowed_files:
  - docs/pm-handoffs/<specific-file>.md
  - backend/src/<specific-module>.ts
  - backend/test/<specific-test>.ts
```

### Blocked files

Blocked files must include risky or unrelated paths.

```yaml
blocked_files:
  - .env
  - .env.*
  - **/*secret*
  - **/*credential*
  - **/*token*
  - **/*cookie*
  - private_keys/**
  - production runtime config paths
  - unrelated frontend/backend files
  - deployment manifests unless explicitly approved
  - migration files unless explicitly approved as plan-only
```

Rules:

- If requested file is outside allowed scope, result is `BLOCKED`.
- If blocked file is requested, result is `BLOCKED`.
- If a task needs additional files, the contract must be revised before work continues.
- No credentials or secrets may be added to repo, docs, logs, screenshots, prompts, or evidence.

## 7. Required Tests

Required tests must be linked to risk class.

```yaml
required_tests:
  ClassA:
    - docs_review
    - forbidden_actions_check
  ClassB:
    - build_or_lint_when_applicable
    - targeted_unit_or_contract_tests
  ClassC:
    - security_policy_check
    - redaction_negative_tests_when_implemented
    - secrets_safe_output_check
  ClassD:
    - build
    - targeted_tests
    - prisma_validate_when_schema_related
    - migration_not_executed_check_when plan-only
  ClassE:
    - lab_manual_evidence_review
    - safety_statement_check
    - no_live_execution_check
```

If required tests cannot run, result is `FIX` or `BLOCKED` depending release impact.

## 8. Required Reviewers

Reviewer rules:

```yaml
required_reviewers:
  ClassA:
    - PM_or_QA
  ClassB:
    - Tasker4_or_QA
  ClassC:
    - SecurityReviewer_or_PM
    - QA_when_release_related
  ClassD:
    - PM
    - Tasker4
    - QA_when_release_related
  ClassE:
    - PM
    - LabOwner_or_Infra
    - SecurityReviewer
    - QA
```

Reviewer evidence must link to FP-16 approval or review evidence.

## 9. Required Approvals

Approvals are required for high-risk actions.

```yaml
approval_requirements:
  db_action:
    required: PM explicit approval
  migration_execution:
    required: PM explicit approval
  real_ai_provider_activation:
    required: PM explicit approval
  github_write_from_product_runtime:
    required: PM explicit approval
  deployment_or_restart:
    required: PM explicit approval
  public_api_exposure:
    required: PM explicit approval
  live_hardware_execution:
    required: PM + SecurityReviewer + LabOwner
  write_or_config_validation:
    required: PM + SecurityReviewer + Network/NOS reviewer
```

Missing approval means `BLOCKED`.

## 10. Stop Conditions

A task must stop immediately when:

- requested action exceeds allowed files/tools;
- secret/env/token/cookie/credential/private key appears;
- raw logs, raw headers, raw HTML, customer data, or unsafe device output appear;
- DB migration/reset/seed/db push is requested without approval;
- deployment/restart/runtime smoke is requested without approval;
- real AI provider activation is requested without approval;
- GitHub write from product runtime is requested without approval;
- production readiness claim is requested before final gate;
- test/build/security gate fails;
- reviewer or PM decision is needed.

Stop result shape:

```yaml
stop_result:
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
```

## 11. Rollback and Dry-Run Requirements

### Dry-run requirements

Dry-run is required when:

- command execution is proposed;
- AI provider activation is proposed;
- source connector import is proposed;
- security scan execution is proposed;
- release package generation is proposed;
- lab validation is proposed.

Dry-run evidence:

```yaml
dry_run_evidence:
  dry_run_required: boolean
  dry_run_completed: boolean
  dry_run_scope: string
  result: PASS | FIX | BLOCKED
  evidence_ref: string | null
```

### Rollback requirements

Rollback plan is required when work could affect runtime, DB, deployment, hardware/NOS, release artifacts, or persisted state.

Rollback evidence:

```yaml
rollback_evidence:
  rollback_required: boolean
  rollback_plan_ref: string | null
  rollback_owner: string | null
  stop_condition_ref: string | null
  safe_disable_path: string | null
```

Docs-only packages may state rollback not applicable.

## 12. Evidence Linkage to FP-16

Every Task Contract must map to FP-16 evidence.

```yaml
fp16_linkage:
  task_contract_evidence_ref: string
  risk_classification_evidence_ref: string
  approval_evidence_refs: array
  qa_test_evidence_refs: array
  security_evidence_refs: array
  blocker_evidence_refs: array
  workflow_callback_evidence_refs: array
  release_package_evidence_refs: array
```

Evidence rules:

- File-changing tasks must link commit SHA.
- Test/scan results must link evidence ref.
- PM approvals must link approval evidence.
- Blockers must link blocker evidence.
- Review status is immutable after review; changed evidence creates a new record and supersedes old evidence.

## 13. Blocker Routing

A blocker must be created when a contract is missing, unsafe, incomplete, or blocked by policy.

Blocker reasons:

```text
MISSING_TASK_CONTRACT
MISSING_RISK_CLASS
UNKNOWN_OR_UNAPPROVED_TOOL
FILE_SCOPE_VIOLATION
BLOCKED_FILE_REQUESTED
REQUIRED_TEST_MISSING
REQUIRED_REVIEWER_MISSING
REQUIRED_APPROVAL_MISSING
STOP_CONDITION_TRIGGERED
ROLLBACK_PLAN_MISSING
DRY_RUN_REQUIRED
SECRET_OR_CREDENTIAL_DETECTED
DB_ACTION_REQUIRES_PM_APPROVAL
AI_PROVIDER_REQUIRES_PM_APPROVAL
DEPLOYMENT_RESTART_REQUIRES_PM_APPROVAL
LIVE_HARDWARE_REQUIRES_PM_APPROVAL
PRODUCTION_CLAIM_NOT_ALLOWED
```

Blocker shape:

```yaml
task_contract_blocker:
  blocker_id: string
  package_id: FP-07
  task_id: string | null
  owner: Tasker4
  blocking_owner: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | LabOwner | Infra | Legal
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, full headers, raw HTML, customer data, or unsafe device output.

## 14. Backend Dependency

Backend persistence/enforcement is needed for production use but is not authorized by this document.

```yaml
backend_dependency_needed: YES
reason: Production enforcement requires persisted task contracts, immutable risk classification, approval evidence, allowed tool/file scopes, blocker linkage, and workflow/runtime checks before tool execution.
```

Future implementation must include:

- additive schema proposal;
- API contract;
- enforcement middleware;
- immutable review/status behavior;
- FP-16 evidence writer integration;
- blocker router;
- tests for missing contract, unknown risk class, file/tool scope violation, missing approval, and stop conditions;
- no migration execution until PM approval;
- no destructive migration;
- no DB reset.

## 15. Acceptance Criteria

FP-07 contract is acceptable when it defines:

- persisted task contract fields;
- risk classes A/B/C/D/E;
- allowed tools;
- allowed files;
- blocked files;
- required tests;
- required reviewers;
- required approvals;
- stop conditions;
- rollback/dry-run requirements;
- evidence linkage to FP-16;
- blocker routing;
- backend dependency;
- forbidden action confirmation.

## 16. Forbidden Actions Check

```yaml
backend_implementation: NO
db_schema_change: NO
migration_reset_seed_db_push: NO
tool_execution: NO
real_ai_provider_activation: NO
deployment_restart: NO
runtime_smoke: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 17. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-07 Task Contract + Risk Classification contract created at docs/pm-handoffs/fp-07-task-contract-risk-classification.md. Covers persisted task contract fields, risk classes A/B/C/D/E, allowed tools, allowed files, blocked files, required tests, required reviewers, required approvals, stop conditions, rollback/dry-run requirements, evidence linkage to FP-16, blocker routing, and backend persistence/enforcement dependency. Docs/contract only. No backend implementation. No DB schema change. No migration/reset/seed/db push. No tool execution. No AI provider activation. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
