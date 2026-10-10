# SEKHEM — FP-10 Controlled Draft Generation Contract

## Package

`FP-10` — Controlled Draft Generation

## Owner

Tasker 4

## Status

In Progress / Contract Artifact

This file is a documentation/contract artifact only.

No actual AI generation, file apply, merge, deployment, restart, dependency change, DB action, migration, reset, seed, db push, provider activation, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the controlled draft generation workflow for SEKHEM. FP-10 allows future systems to generate draft-only plans and diffs for human review while preventing automatic file application, merge, deployment, dependency changes, migration execution, or production claims.

This contract depends on the policy/gate layers from FP-06, FP-07, FP-08, FP-09, FP-13, FP-15, and FP-16 before any runtime implementation.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-06-ai-request-policy-redaction.md`
- `docs/pm-handoffs/fp-07-task-contract-risk-classification.md`
- `docs/pm-handoffs/fp-08-tool-router-sandbox.md`
- `docs/pm-handoffs/fp-09-model-provider-adapter.md`
- `docs/pm-handoffs/fp-13-risk-class-security-enforcement.md`
- `docs/pm-handoffs/fp-15-quality-runner-runtime.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rule: no automatic file apply
- PM rule: no production claim before final gate

## Risk Class

```text
Current artifact: docs/contract only
Future controlled draft runtime: Class C/D depending files, tools, and release impact
```

Any future runtime implementation of controlled draft generation must be separately task-contracted and approved.

## Controlled Draft Principles

1. Generation is draft-only.
2. Generated output may be a plan, patch proposal, or diff preview only.
3. No generated content may be applied automatically.
4. Human approval is mandatory before any follow-up implementation task.
5. Changed files must remain inside FP-07 allowed scope.
6. Dependency changes require explicit PM approval.
7. Migrations require explicit PM approval and must remain plan-only until migration execution is separately approved.
8. Failed generation, unsafe output, scope violation, or missing evidence routes to blocker.
9. Reviewer loops are bounded.
10. Tests must be defined before approval and executed only by approved FP-15 profile or separate task.

## 1. Draft-Only Generation Rule

```yaml
draft_only_generation:
  auto_apply_allowed: false
  auto_merge_allowed: false
  auto_deploy_allowed: false
  repo_write_allowed_from_runtime: false
  generated_output_types:
    - draft_plan
    - draft_diff
    - patch_preview
    - reviewer_notes_request
    - test_plan_draft
    - blocker_summary
```

The generator must not:

- apply files;
- commit or push;
- merge PRs;
- deploy or restart;
- run DB actions;
- execute migrations;
- change dependencies without approval;
- claim production readiness.

Any attempt to do these returns `BLOCKED`.

## 2. Controlled Draft Request Schema Proposal

```yaml
controlled_draft_request:
  draft_request_id: string
  package_id: FP-10
  task_id: string
  task_contract_ref: string
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  request_type: controlled_code_diff_draft | test_plan_draft | docs_patch_draft | blocker_fix_plan | release_note_draft
  source_evidence_refs: array
  approval_refs: array
  allowed_files: array
  blocked_files: array
  max_changed_files: number | null
  max_reviewer_loops: number
  dependency_change_requested: boolean
  migration_change_requested: boolean
  provider_mode: disabled | mock | dry_run | real_provider_requested
  auto_apply_allowed: false
  auto_merge_allowed: false
  deployment_allowed: false
```

Required fields:

```text
draft_request_id
package_id
task_id
task_contract_ref
risk_class
request_type
allowed_files
blocked_files
max_reviewer_loops
auto_apply_allowed = false
auto_merge_allowed = false
deployment_allowed = false
```

Missing required fields result in `BLOCKED`.

## 3. Diff Generation Contract

Diff generation may produce a reviewable diff only.

```yaml
draft_diff:
  draft_id: string
  base_ref: string
  target_ref: string | null
  proposed_changed_files: array
  diff_ref: string | null
  diff_summary: string
  generated_by: ai_mock | ai_dry_run | human | future_provider
  apply_state: not_applied
  merge_state: not_merged
  deployment_state: not_deployed
```

Rules:

- Diff must be reviewable before any implementation.
- Diff must be tied to task contract and allowed files.
- Diff must not include secrets, env values, tokens, cookies, credentials, private keys, connection strings, raw logs, full headers, customer data, or unsafe device output.
- Diff body may be stored only as controlled artifact/evidence if safe.
- PM-visible summary must be sanitized.

## 4. Changed-Files Scope

Changed-files scope is enforced before draft acceptance and before human approval.

```yaml
changed_files_scope:
  allowed_files: array
  blocked_files: array
  proposed_changed_files: array
  max_changed_files: number | null
  scope_result: PASS | FIX | BLOCKED
```

Scope rules:

- Proposed file outside allowed scope is `BLOCKED`.
- Proposed file matching blocked files is `BLOCKED`.
- Missing changed-files list is `BLOCKED`.
- Exceeding `max_changed_files` is `BLOCKED` unless PM revises contract.
- Generated lockfile/workspace/dependency files require explicit approval.
- Migration files require explicit PM approval and plan-only label.

## 5. Reviewer Loop Rules

Reviewer loops are bounded to prevent uncontrolled iteration.

```yaml
reviewer_loop_policy:
  default_max_reviewer_loops: 3
  max_allowed_reviewer_loops_without_pm_exception: 3
  loop_actions:
    - reviewer_comment
    - draft_revision
    - test_plan_update
    - blocker_update
  loop_exit_states:
    - approved_for_implementation_task
    - rejected
    - blocked
    - max_loops_reached
```

Rules:

- Default maximum reviewer loops: 3.
- Each loop must add reviewer notes and evidence reference.
- If max loops reached without approval, result is `BLOCKED` or `FIX` for PM decision.
- Reviewer notes must be sanitized.
- Reviewer may request changes but cannot apply files through FP-10.

## 6. Tests Before Approval

Before a draft can be approved for implementation or release path, required tests must be specified.

```yaml
tests_before_approval:
  required_test_profiles: array
  quality_runner_profile_refs: array
  test_plan_ref: string
  test_execution_required_before_merge: true
  test_execution_allowed_in_fp10: false
```

Rules:

- FP-10 defines required tests but does not execute them.
- Test execution must use FP-15 approved profiles or separate approved task.
- Missing required test plan is `BLOCKED` for code-changing drafts.
- Failed required tests route to blocker before approval/merge.

## 7. Reviewer Notes

Reviewer notes are required for approval or rejection.

```yaml
reviewer_notes:
  reviewer: PM | QA | Tasker4 | SecurityReviewer | LabOwner | string
  reviewed_at: string
  decision: PASS | FIX | BLOCKED
  notes_sanitized: string
  required_changes: array
  evidence_refs: array
```

Reviewer notes must not include raw secrets, prompt body, output body, raw logs, full headers, env values, tokens, cookies, credentials, or customer data.

## 8. Failure to Blocker Routing

A blocker must be created when controlled draft generation fails safety, scope, evidence, review, or approval requirements.

Blocker reasons:

```text
MISSING_TASK_CONTRACT
MISSING_RISK_CLASS
SECURITY_GATE_NOT_PASS
PROVIDER_NOT_APPROVED
DRAFT_GENERATION_FAILED
UNSAFE_DRAFT_OUTPUT
CHANGED_FILE_OUT_OF_SCOPE
BLOCKED_FILE_REQUESTED
MAX_REVIEWER_LOOPS_REACHED
REQUIRED_TEST_PLAN_MISSING
REQUIRED_TEST_FAILED
HUMAN_APPROVAL_MISSING
AUTO_APPLY_REQUESTED
AUTO_MERGE_REQUESTED
DEPLOYMENT_REQUESTED
DEPENDENCY_CHANGE_REQUIRES_PM_APPROVAL
MIGRATION_REQUIRES_PM_APPROVAL
DB_ACTION_REQUESTED
SECRET_OR_CREDENTIAL_DETECTED
PRODUCTION_CLAIM_REQUESTED
```

Blocker shape:

```yaml
controlled_draft_blocker:
  blocker_id: string
  package_id: FP-10
  task_id: string | null
  draft_request_id: string | null
  owner: Tasker4
  blocking_owner: PM | QA | Tasker4 | SecurityReviewer | LabOwner | Infra
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, raw headers, raw HTML, customer data, prompt body, output body, or unsafe device output.

## 9. No Auto-Apply / No Merge / No Deployment

Hard rules:

```yaml
hard_forbidden_actions:
  auto_apply: false
  merge: false
  deployment: false
  restart: false
  runtime_smoke: false
  db_action: false
  migration_execution: false
  dependency_change_without_pm_approval: false
```

FP-10 cannot produce a state where code is applied, committed, pushed, merged, deployed, restarted, or promoted automatically.

If a draft says it applied files, merged, deployed, or restarted, result is `BLOCKED`.

## 10. Dependency Change Rule

Dependency changes require explicit PM approval before being included in a draft.

Dependency-sensitive files include:

```text
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
requirements.txt
poetry.lock
Dockerfile
container manifests
```

Rules:

- Dependency change without approval is `BLOCKED`.
- Dependency change must include security/license/SBOM impact evidence.
- Lockfile changes must be explicitly allowed in Task Contract.
- No package install/update is run under FP-10.

## 11. Migration Rule

Migration changes require explicit PM approval and must remain plan-only until migration execution is separately approved.

Rules:

- Migration file proposal requires Class D.
- Migration proposal must be additive unless PM approves otherwise.
- Migration execution is forbidden under FP-10.
- `db push`, seed, reset, destructive migration, live DB write are forbidden.
- Migration proposal must include rollback/disable note and Prisma validate/test plan.

## 12. Human Approval Gate

Human approval is mandatory before any draft can move to implementation or release path.

```yaml
human_approval_gate:
  approval_required: true
  allowed_approvers:
    - PM
    - QA
    - SecurityReviewer
    - Tasker4
  approval_scope: draft_to_implementation_task | draft_to_fix_task | draft_rejected | draft_blocked
  approval_ref_required: true
  approval_without_tests_allowed: false_for_code_drafts
```

Approval gate blocks when:

- approval missing;
- approver not authorized;
- changed-files scope not passed;
- required tests not defined;
- security gate not passed;
- blocker unresolved;
- dependency/migration change lacks PM approval.

## 13. Evidence Mapping to FP-16

Every controlled draft must create/link FP-16 evidence.

```yaml
controlled_draft_evidence:
  evidence_id: string
  package_id: FP-10
  task_id: string
  draft_request_id: string
  draft_id: string | null
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  task_contract_ref: string
  security_gate_ref: string | null
  provider_adapter_ref: string | null
  tool_router_ref: string | null
  changed_files_scope_result: PASS | FIX | BLOCKED
  reviewer_loop_count: number
  max_reviewer_loops: number
  required_test_plan_ref: string | null
  reviewer_notes_refs: array
  human_approval_ref: string | null
  blocker_id: string | null
  auto_apply: false
  merged: false
  deployed: false
  sanitized_summary: string
  created_at: string
```

Evidence must prove:

- draft is not applied;
- draft is not merged;
- draft is not deployed;
- changed-files scope passed;
- reviewer loop count is within limit;
- required tests are defined;
- human approval exists before implementation handoff;
- blocker exists for unsafe failure.

## 14. Fail-Closed Behavior

FP-10 must fail closed.

Fail-closed cases:

```text
missing_task_contract
missing_risk_class
missing_security_gate_result
missing_tool_router_result
missing_provider_adapter_result_when_ai_used
provider_not_approved
unsafe_output_detected
changed_files_unknown
blocked_file_detected
reviewer_loop_count_unknown
human_approval_missing
dependency_change_unknown_or_unapproved
migration_change_unknown_or_unapproved
evidence_writer_unavailable
```

Fail-closed response:

```yaml
controlled_draft_response:
  accepted: false
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  draft_generated: false
  file_applied: false
  merged: false
  deployed: false
```

If safety cannot be determined, FP-10 returns `BLOCKED`.

## 15. Backend Dependency

Backend implementation is needed for production controlled draft generation but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Production controlled draft generation requires task contract checks, risk-class gate, provider adapter gate, tool router sandbox, changed-files scope validator, reviewer loop state, evidence writer, blocker router, and human approval gate.
```

Future implementation must include:

- draft request API;
- draft artifact storage contract;
- changed-files validator;
- reviewer loop state machine;
- no-auto-apply enforcement tests;
- no-merge/no-deploy enforcement tests;
- dependency/migration approval checks;
- FP-16 evidence writer;
- blocker router;
- human approval gate;
- no actual AI/provider generation until FP-09 approval.

## 16. Acceptance Criteria

FP-10 contract is acceptable when it defines:

- draft-only generation;
- diff generation;
- changed-files scope;
- max reviewer loop count;
- tests before approval;
- reviewer notes;
- failure to blocker routing;
- no auto-apply;
- no merge;
- no deployment;
- no dependency change without approval;
- no migration without explicit PM approval;
- human approval gate;
- FP-16 evidence mapping;
- backend dependency;
- forbidden action confirmation.

## 17. Forbidden Actions Check

```yaml
actual_ai_generation: NO
file_apply: NO
merge: NO
deployment_restart: NO
dependency_change: NO
db_action: NO
migration_reset_seed_db_push: NO
provider_activation: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 18. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-10 Controlled Draft Generation contract created at docs/pm-handoffs/fp-10-controlled-draft-generation.md. Covers draft-only generation, diff generation, changed-files scope, max reviewer loop count, tests before approval, reviewer notes, failure-to-blocker routing, no auto-apply, no merge, no deployment, no dependency change without approval, no migration without explicit PM approval, human approval gate, FP-16 evidence mapping, fail-closed behavior, and backend dependency. Docs/contract only. No actual AI generation. No file apply. No merge. No deployment/restart. No dependency change. No DB action. No migration/reset/seed/db push. No provider activation. No secrets/env/token/cookie output. No production claim.
```
