# SEKHEM — FP-08 Tool Router + Sandbox Contract

## Package

`FP-08` — Tool Router + Sandbox

## Owner

Tasker 4

## Status

In Progress / Contract Artifact

This file is a documentation/contract artifact only.

No actual Aider/OpenHands execution, arbitrary command execution, repository write through runtime, file apply, DB action, migration, reset, seed, db push, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the safe Tool Router + Sandbox contract that maps approved task contracts and risk classes to allowed tool routes, isolated workspaces, command/tool allowlists, changed-file scope enforcement, evidence capture, blocker routing, and fail-closed behavior.

FP-08 prepares future controlled draft generation and tool execution, but it does not execute tools or apply changes.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-07-task-contract-risk-classification.md`
- `docs/pm-handoffs/fp-13-risk-class-security-enforcement.md`
- `docs/pm-handoffs/fp-15-quality-runner-runtime.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rule: no GitHub write actions from product runtime without explicit PM approval
- PM rule: no production claim before final gate

## Risk Class of This Artifact

```text
Current artifact: docs/contract only
Future router/sandbox implementation: Class D
Future security gate/tool enforcement integration: Class C/D
```

Any future implementation of a tool router, sandbox runner, repository checkout, code tool adapter, or command execution service requires a separate Tasker 4 implementation package and PM approval.

## Router Principles

1. A Task Contract from FP-07 is required before routing.
2. Risk-class enforcement from FP-13 must pass before any route is accepted.
3. Tools are denied by default unless explicitly allowlisted for the task and risk class.
4. Aider/OpenHands routes are draft/review-only until later PM-approved controlled draft generation.
5. No route may apply files directly.
6. No route may write to GitHub from product runtime without explicit PM approval.
7. All work must run in an isolated workspace when execution is later approved.
8. Changed files must remain inside allowed file scope.
9. Evidence must link to FP-16.
10. Unknown route, unknown tool, unauthorized path, or unsafe output fails closed.

## 1. Tool Router Request Schema Proposal

```yaml
tool_router_request:
  router_request_id: string
  package_id: string
  task_id: string
  task_contract_ref: string
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  requested_route: docs_only | static_review | quality_profile | security_profile | ai_draft | aider_draft | openhands_draft | reviewer_review | evidence_only | lab_manual
  requested_tools: array
  requested_files: array
  allowed_files: array
  blocked_files: array
  allowed_commands: array
  blocked_commands: array
  reviewer_refs: array
  approval_refs: array
  evidence_refs: array
  sandbox_mode: none | isolated_readonly | isolated_draft | isolated_validate
  apply_changes_allowed: false
  github_write_allowed: false
  db_action_allowed: false
  deployment_allowed: false
  runtime_action_allowed: false
```

Required fields:

```text
router_request_id
package_id
task_id
task_contract_ref
risk_class
requested_route
requested_tools
requested_files
allowed_files
blocked_files
sandbox_mode
apply_changes_allowed = false
github_write_allowed = false
db_action_allowed = false
deployment_allowed = false
runtime_action_allowed = false
```

Missing required fields result in `BLOCKED`.

## 2. Allowed Tool Routing by Risk Class

### Class A — Docs / Tests / UI Text

```yaml
ClassA_allowed_routes:
  - docs_only
  - static_review
  - evidence_only
allowed_tools:
  - docs_editor
  - github_read
  - github_write_docs_only_when_pm_or_tasker_approved
sandbox_required: false_for_docs_only
```

Blocks:

- runtime execution;
- DB action;
- tool execution beyond docs/static review;
- secret/env/token/cookie output;
- production claim.

### Class B — Controlled App/API/UI/Report

```yaml
ClassB_allowed_routes:
  - static_review
  - quality_profile
  - ai_draft
  - reviewer_review
allowed_tools:
  - github_read
  - static_code_review
  - quality_runner_profile
  - ai_draft_no_apply
sandbox_required: isolated_draft_or_isolated_validate
```

Blocks:

- file apply without human approval;
- arbitrary command execution;
- route outside allowed files;
- public API exposure without PM approval;
- missing tests/evidence.

### Class C — Security-Sensitive Work

```yaml
ClassC_allowed_routes:
  - static_review
  - security_profile
  - ai_draft
  - reviewer_review
  - evidence_only
allowed_tools:
  - github_read
  - static_code_review
  - security_scan_profile
  - ai_draft_redacted_no_apply
  - evidence_writer_future_only
sandbox_required: isolated_readonly_or_isolated_draft
security_gate_required: true
```

Blocks:

- missing security reviewer or PM review;
- unredacted prompt/output;
- real AI provider activation without PM approval;
- secrets scan/security evidence missing when required;
- unsafe logs or raw sensitive output.

### Class D — DB / Architecture / Release Logic

```yaml
ClassD_allowed_routes:
  - static_review
  - quality_profile
  - security_profile
  - ai_draft
  - reviewer_review
  - evidence_only
allowed_tools:
  - github_read
  - static_code_review
  - quality_runner_profile
  - security_scan_profile
  - ai_draft_no_apply
sandbox_required: isolated_readonly_or_isolated_validate
pm_approval_required: true_for_db_migration_release_logic_or_persistence_execution
```

Blocks:

- DB action without PM approval;
- migration/reset/seed/db push;
- release package generation without evidence gate approval;
- missing ADR/rollback/dry-run;
- production claim.

### Class E — Hardware / NOS / Lab / Live Devices

```yaml
ClassE_allowed_routes:
  - lab_manual
  - evidence_only
  - static_review
allowed_tools:
  - github_read
  - lab_manual_evidence_review
  - static_profile_review
sandbox_required: isolated_readonly_when_file_or_report_validation_needed
lab_approval_required_for_live_or_device_touching_work: true
```

Blocks:

- live device commands;
- NOS changes;
- config push;
- production network access;
- hardware execution;
- lab automation claim without approval;
- missing lab evidence or QA review.

## 3. Aider / OpenHands Route Restrictions

Aider and OpenHands are allowed only as future draft/review adapters, not as apply or autonomous execution tools.

```yaml
aider_openhands_policy:
  default_allowed: false
  allowed_modes:
    - draft_diff_only
    - static_review_only
    - plan_only
  forbidden_modes:
    - apply_changes
    - commit_changes
    - push_to_github
    - run_arbitrary_commands
    - deploy
    - restart
    - db_action
    - live_provider_without_pm_approval
```

Aider/OpenHands route requirements:

- FP-07 Task Contract required.
- FP-13 risk-class security gate must pass.
- Changed file allowlist required.
- Blocked file list required.
- Sandbox mode must be `isolated_draft` or stricter.
- Output must be reviewable diff or plan only.
- No file write to source repo.
- No automatic commit.
- No runtime GitHub write.
- No secrets in prompts, outputs, logs, or evidence.

If Aider/OpenHands attempts apply, command execution, or repo write, result is `BLOCKED`.

## 4. Reviewer Route Restrictions

Reviewer routes may inspect plans, diffs, evidence, test results, or policy outputs. They must not execute changes.

```yaml
reviewer_route_policy:
  allowed_inputs:
    - sanitized_diff
    - changed_files_list
    - task_contract
    - risk_classification
    - test_evidence
    - security_evidence
    - blocker_evidence
  forbidden_inputs:
    - raw_secrets
    - raw_env_values
    - raw_tokens
    - raw_cookies
    - raw_credentials
    - raw_private_keys
    - raw_logs_with_sensitive_data
  allowed_outputs:
    - PASS
    - FIX
    - BLOCKED
    - reviewer_notes_sanitized
```

Reviewer route cannot:

- apply diff;
- push to repo;
- run deployment/restart;
- run DB action;
- activate real AI provider;
- clear blocker without evidence.

## 5. Changed-Files Scope Enforcement

Changed-files enforcement must compare requested and actual changed files against the Task Contract.

```yaml
changed_files_scope:
  requested_files: array
  actual_changed_files: array
  allowed_files: array
  blocked_files: array
  max_changed_files: number | null
  scope_result: PASS | FIX | BLOCKED
```

Rules:

- Any actual changed file outside `allowed_files` is `BLOCKED`.
- Any actual changed file matching `blocked_files` is `BLOCKED`.
- Missing changed-files list is `BLOCKED` for file-changing work.
- Exceeding `max_changed_files` is `BLOCKED` unless PM updates contract.
- Generated lockfile/workspace files must be explicitly allowed or excluded.
- Evidence must record changed-files list and scope decision.

## 6. Isolated Workspace Rules

Future execution, if approved, must use isolated workspace rules.

```yaml
sandbox_workspace:
  workspace_id: string
  mode: isolated_readonly | isolated_draft | isolated_validate
  source_ref: string
  commit_sha: string
  network_allowed: false_by_default
  db_allowed: false
  deployment_allowed: false
  runtime_access_allowed: false
  secrets_available: false
  write_to_source_repo_allowed: false
```

Sandbox rules:

- Use clean checkout or controlled copy.
- No production runtime mount.
- No production DB access.
- No environment secrets exposed.
- No credentials injected.
- No public API exposure.
- No deployment/restart path.
- No write-back to source repo unless a separate PM-approved GitHub write package exists.
- Artifacts must be sanitized before evidence use.

## 7. Command / Tool Allowlist

The router may only dispatch to command/profile IDs that are approved by FP-15 or FP-12.

Allowed command/profile categories:

```yaml
allowed_command_profiles:
  - frontend_lint_build
  - backend_build_test
  - prisma_validate
  - security_scan_evidence
  - secrets_scan_evidence
  - dependency_license_sbom
  - lab_manual_evidence
  - release_quality_rollup
  - static_review_only
  - docs_write_only
```

Forbidden command categories:

```text
arbitrary shell
curl to unknown external endpoint
runtime service restart
systemctl restart/reload
pm2 restart
Docker deploy/restart
kubectl apply/delete/rollout
terraform apply
db push
prisma migrate deploy/dev/reset
seed
truncate/drop/delete database data
GitHub push/merge from runtime
Aider/OpenHands apply mode
live device/NOS commands
```

Unknown command/profile IDs are `BLOCKED`.

## 8. Blocked Paths / Files

The router must hard-block sensitive paths unless explicitly approved by PM and security gate.

```yaml
blocked_paths_files:
  - .env
  - .env.*
  - **/*.pem
  - **/*.key
  - **/*secret*
  - **/*credential*
  - **/*token*
  - **/*cookie*
  - private_keys/**
  - production runtime config paths
  - deployment manifests unless approved
  - migration execution scripts unless approved as plan-only
  - generated artifacts containing raw scan output
  - customer data dumps
  - raw device configs
  - raw logs with sensitive data
```

Rules:

- Blocked file request returns `BLOCKED`.
- Blocked file in actual diff returns `BLOCKED`.
- Blocked file content must not be printed.
- If a blocked path is necessary, PM must revise the Task Contract and approve a higher-risk package.

## 9. Evidence Requirements

Every routing decision must create or link FP-16 evidence.

```yaml
tool_router_evidence:
  evidence_id: string
  package_id: FP-08
  task_id: string
  router_request_id: string
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  task_contract_ref: string
  security_gate_ref: string | null
  requested_route: string
  route_decision: PASS | FIX | BLOCKED
  allowed_tools_checked: boolean
  file_scope_checked: boolean
  blocked_paths_checked: boolean
  sandbox_mode: string
  command_profile_id: string | null
  actual_changed_files_ref: string | null
  blocker_id: string | null
  sanitized_summary: string
  created_at: string
```

Evidence must prove:

- task contract exists;
- risk class exists;
- route is allowlisted;
- requested tools are allowed;
- changed-files scope is enforced;
- blocked paths were checked;
- sandbox mode is safe;
- no forbidden action occurred;
- blocker was created when blocked.

## 10. Stop Conditions

The router must stop immediately when:

- Task Contract missing;
- risk class missing or unknown;
- FP-13 security gate result is not PASS;
- requested route not allowlisted;
- requested tool not allowlisted;
- Aider/OpenHands requested apply/commit/push/command mode;
- arbitrary command execution requested;
- changed-files scope missing for file-changing work;
- actual file outside allowed scope;
- blocked file/path requested or changed;
- sandbox cannot be created safely;
- DB action requested;
- migration/reset/seed/db push requested;
- deployment/restart requested;
- secrets/env/token/cookie/credential output requested;
- production claim requested.

Stop response:

```yaml
router_stop_response:
  accepted: false
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  tool_executed: false
  file_applied: false
  repo_written: false
```

## 11. Blocker Routing

Blocker reasons:

```text
MISSING_TASK_CONTRACT
MISSING_RISK_CLASS
SECURITY_GATE_NOT_PASS
UNKNOWN_ROUTE
UNAPPROVED_TOOL
AIDER_OPENHANDS_APPLY_REQUESTED
ARBITRARY_COMMAND_REQUESTED
CHANGED_FILES_SCOPE_MISSING
CHANGED_FILE_OUT_OF_SCOPE
BLOCKED_FILE_REQUESTED
BLOCKED_FILE_CHANGED
SANDBOX_UNAVAILABLE_OR_UNSAFE
DB_ACTION_REQUESTED
MIGRATION_RESET_SEED_DB_PUSH_REQUESTED
DEPLOYMENT_RESTART_REQUESTED
SECRET_OR_CREDENTIAL_OUTPUT_REQUESTED
RUNTIME_GITHUB_WRITE_REQUESTED
PRODUCTION_CLAIM_REQUESTED
```

Blocker shape:

```yaml
tool_router_blocker:
  blocker_id: string
  package_id: FP-08
  task_id: string | null
  owner: Tasker4
  blocking_owner: PM | Tasker4 | QA | SecurityReviewer | LabOwner | Infra
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, raw headers, raw HTML, customer data, or unsafe device output.

## 12. Fail-Closed Behavior

The router must fail closed.

Fail-closed cases:

```text
unknown_route
unknown_tool
missing_contract
missing_risk_class
missing_security_gate_result
missing_allowed_files
missing_blocked_files
missing_changed_files_for_file_task
sandbox_safety_unknown
evidence_writer_unavailable
blocked_path_match_unknown
reviewer_missing
approval_missing
```

Fail-closed result:

```yaml
router_response:
  accepted: false
  result: BLOCKED
  command_executed: false
  tool_executed: false
  file_applied: false
  repo_written: false
  reason_code: FAIL_CLOSED
  sanitized_reason: string
```

If safety cannot be determined, the router returns `BLOCKED`.

## 13. Backend Dependency

Backend implementation is needed for production tool routing and sandboxing but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Production routing requires persisted task contracts, risk class checks, route registry, sandbox orchestration, changed-files enforcement, blocked path matching, evidence writing, and blocker routing before any tool execution.
```

Future implementation must include:

- route registry;
- tool registry;
- sandbox workspace manager;
- changed-files scope checker;
- blocked path matcher;
- FP-13 security gate integration;
- FP-16 evidence writer;
- blocker router;
- tests for unknown route/tool, Aider/OpenHands apply block, file-scope violation, blocked path, and fail-closed behavior;
- no actual tool execution until PM approval.

## 14. Acceptance Criteria

FP-08 contract is acceptable when it defines:

- allowed tool routing by risk class;
- Aider/OpenHands route restrictions;
- reviewer route restrictions;
- changed-files scope enforcement;
- isolated workspace rules;
- command/tool allowlist;
- blocked paths/files;
- evidence requirements;
- stop conditions;
- blocker routing;
- fail-closed behavior;
- backend dependency;
- forbidden action confirmation.

## 15. Forbidden Actions Check

```yaml
actual_aider_openhands_execution: NO
arbitrary_command_execution: NO
repo_write_through_runtime: NO
file_apply: NO
db_action: NO
migration_reset_seed_db_push: NO
deployment_restart: NO
runtime_smoke: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 16. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-08 Tool Router + Sandbox contract created at docs/pm-handoffs/fp-08-tool-router-sandbox.md. Covers allowed tool routing by risk class, Aider/OpenHands route restrictions, reviewer route restrictions, changed-files scope enforcement, isolated workspace rules, command/tool allowlist, blocked paths/files, evidence requirements, stop conditions, blocker routing, fail-closed behavior, and backend dependency. Docs/contract only. No actual Aider/OpenHands execution. No arbitrary command execution. No repo write through runtime. No file apply. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
