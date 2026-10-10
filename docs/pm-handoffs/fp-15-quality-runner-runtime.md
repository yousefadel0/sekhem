# SEKHEM — FP-15 Quality Runner Runtime Contract

## Package

`FP-15` — Quality Runner Runtime

## Owner

Tasker 4

## Status

In Progress / Runtime Contract Artifact

This file is a documentation/runtime contract only.

No arbitrary command execution, live load test, runtime execution, DB action, migration, reset, seed, db push, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the safe Quality Runner Runtime contract for executing only allowlisted validation profiles and producing PASS / FIX / BLOCKED evidence linked to FP-16. This contract converts FP-14 Quality Matrix profiles into a controlled runner model that can later be implemented with strict command allowlisting, sanitized evidence, and fail-closed behavior.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-14-quality-matrix-test-profiles.md` when present / FP-14 PM Review status
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rules: no DB action, no deployment/restart, no production claim before final gate

## Risk Class

Quality runner runtime implementation is controlled automation and release-affecting behavior.

```text
Risk class for future implementation: Class D
Current artifact: docs/runtime contract only
```

Any future implementation requires a separate Tasker 4 backend/API package, tests, and PM approval before runtime execution.

## Quality Runner Principles

1. The runner must execute only named allowlisted profiles.
2. The runner must never accept arbitrary shell commands from user, AI, source connector, prompt, ticket, or request body.
3. Every run must produce a PASS / FIX / BLOCKED result.
4. Every run must create FP-16-compatible evidence.
5. Required evidence missing or unsafe output means `BLOCKED`, not silent pass.
6. Security and secrets findings route to blocker evidence.
7. Runner output must be sanitized before PM board, docs, UI, or AI use.
8. No release gate may proceed from unreviewed quality evidence.

## 1. Allowed Runner Profiles

The only accepted runner inputs are profile IDs from this allowlist.

```yaml
allowed_profiles:
  - frontend_lint_build
  - backend_build_test
  - prisma_validate
  - security_scan_evidence
  - secrets_scan_evidence
  - dependency_license_sbom
  - lab_manual_evidence
  - release_quality_rollup
```

Unknown profile IDs are rejected as `BLOCKED`.

## 2. Runner Request Schema Proposal

```yaml
quality_runner_request:
  runner_request_id: string
  package_id: string
  task_id: string | null
  profile_id: string
  requested_by: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | CI | System
  commit_sha: string | null
  source_ref: string | null
  evidence_refs: array
  approval_refs: array
  max_duration_ms: number | null
  allow_network: false
  allow_db_action: false
  allow_runtime_action: false
  allow_deployment: false
  arbitrary_command: null
```

Required fields:

```text
runner_request_id
package_id
profile_id
requested_by
allow_db_action = false
allow_runtime_action = false
allow_deployment = false
arbitrary_command = null
```

If any safety field is missing or not explicitly false/null, the request is `BLOCKED`.

## 3. Command Allowlist

Future implementation must bind each profile to a fixed command template. Inputs may only fill safe variables such as commit SHA, report path, or profile ID after validation.

### Global command rules

Allowed:

- package manager install from lockfile in clean isolated workspace;
- build commands defined by repository scripts;
- targeted test scripts defined by repository scripts;
- Prisma validate only with safe dummy/non-secret DATABASE_URL if needed;
- scan tool dry-run/CI commands approved by FP-12;
- hash/checksum commands for generated evidence artifacts.

Forbidden:

- arbitrary shell command from request body;
- `eval`, shell interpolation of untrusted input, command concatenation from AI output;
- `db push`, `prisma migrate`, seed, reset, live DB writes;
- deployment, restart, runtime smoke, service reload;
- live load testing;
- public trigger or scheduled external execution;
- printing env/secrets/tokens/cookies;
- credentialed source fetch;
- recursive crawling;
- repository write/push/apply.

## 4. Profile: Frontend Lint/Build

```yaml
profile_id: frontend_lint_build
purpose: Validate frontend static quality and build readiness in isolated workspace.
allowed_command_templates:
  - npm ci or pnpm install --frozen-lockfile when lockfile exists
  - npm run lint
  - npm run build
forbidden:
  - deployment
  - live API calls
  - env printing
  - runtime smoke
result_mapping:
  all_commands_pass: PASS
  lint_or_build_fail: FIX
  command_not_allowlisted_or_unsafe_output: BLOCKED
```

Evidence fields:

```yaml
frontend_lint_build_evidence:
  profile_id: frontend_lint_build
  workspace: isolated
  commit_sha: string
  install_result: PASS | FIX | BLOCKED
  lint_result: PASS | FIX | BLOCKED | NOT_APPLICABLE
  build_result: PASS | FIX | BLOCKED
  sanitized_summary: string
  report_ref: string | null
```

## 5. Profile: Backend Build/Test

```yaml
profile_id: backend_build_test
purpose: Validate backend compile and test contracts in isolated workspace.
allowed_command_templates:
  - npm ci or pnpm install --frozen-lockfile when lockfile exists
  - npm run build
  - npm test
  - npx tsx --test --test-concurrency=1 <allowlisted_test_files>
forbidden:
  - DB writes
  - migration/reset/seed/db push
  - runtime smoke
  - deployment/restart
  - env printing
result_mapping:
  build_and_required_tests_pass: PASS
  build_or_required_tests_fail: FIX
  unsafe_or_unapproved_command: BLOCKED
```

Allowed targeted test files must be configured by profile and not accepted from arbitrary request text.

Evidence fields:

```yaml
backend_build_test_evidence:
  profile_id: backend_build_test
  commit_sha: string
  build_result: PASS | FIX | BLOCKED
  test_count_total: number | null
  test_count_passed: number | null
  test_count_failed: number | null
  failed_suite_summary: string | null
  report_ref: string | null
  result: PASS | FIX | BLOCKED
```

## 6. Profile: Prisma Validate

```yaml
profile_id: prisma_validate
purpose: Validate Prisma schema only.
allowed_command_templates:
  - DATABASE_URL="postgresql://user:pass@localhost:5432/sekhem_validation" npx prisma validate
  - npm run prisma:validate only when the script is known to validate schema and not execute migration/db push/seed/reset
forbidden:
  - prisma migrate
  - prisma db push
  - prisma db seed
  - prisma migrate reset
  - live DB connection requirement
  - printing real DATABASE_URL
result_mapping:
  schema_valid: PASS
  schema_invalid: FIX
  env_secret_or_db_action_requested: BLOCKED
```

Evidence fields:

```yaml
prisma_validate_evidence:
  profile_id: prisma_validate
  commit_sha: string
  database_url_mode: dummy_non_secret
  schema_valid: boolean
  migration_executed: false
  db_action: false
  sanitized_summary: string
  result: PASS | FIX | BLOCKED
```

## 7. Profile: Security Scan Evidence

```yaml
profile_id: security_scan_evidence
purpose: Collect or validate sanitized FP-12 security scan evidence.
allowed_command_templates:
  - approved FP-12 scan command in dry-run or isolated repo snapshot mode
  - evidence summary validation command
forbidden:
  - live env scan
  - printing secrets
  - scanning production DB/customer data
  - deployment/restart/runtime smoke
result_mapping:
  required_security_evidence_pass: PASS
  missing_or_medium_fixable_findings: FIX
  secret_or_critical_or_scan_failure: BLOCKED
```

Evidence fields:

```yaml
security_scan_runner_evidence:
  profile_id: security_scan_evidence
  scan_type: secrets | dependency | license_sbom | redaction | source_connector_security | ai_safety | release_gate
  scan_mode: design_only | dry_run | repo_snapshot | ci_artifact | manual_review
  evidence_ref: string
  critical_count: number | null
  high_count: number | null
  unsafe_content_detected: boolean
  result: PASS | FIX | BLOCKED
```

## 8. Profile: Secrets Scan Evidence

```yaml
profile_id: secrets_scan_evidence
purpose: Validate sanitized secrets scan evidence without exposing raw secret values.
allowed_command_templates:
  - approved secrets scanner against repo snapshot or changed files
  - sanitized summary verification
forbidden:
  - live env dump
  - .env value output
  - token/cookie/session capture
  - raw secret evidence in PM-visible output
result_mapping:
  no_verified_or_high_confidence_secret: PASS
  scan_incomplete_or_low_confidence_needs_review: FIX
  verified_secret_or_raw_secret_output: BLOCKED
```

Evidence fields:

```yaml
secrets_scan_runner_evidence:
  profile_id: secrets_scan_evidence
  scan_scope: repository_snapshot | changed_files | release_artifact
  raw_secret_logged: false
  redacted_findings_count: number
  verified_findings_count: number
  evidence_ref: string
  blocker_id: string | null
  result: PASS | FIX | BLOCKED
```

## 9. Profile: Dependency / License / SBOM

```yaml
profile_id: dependency_license_sbom
purpose: Validate dependency vulnerability, license, and SBOM evidence.
allowed_command_templates:
  - approved npm/pnpm/yarn audit summary command
  - approved SBOM generation command in isolated workspace
  - approved license summary command
forbidden:
  - package upgrade
  - dependency install outside lockfile
  - publishing package data externally
  - storing unsafe raw output in PM-visible evidence
result_mapping:
  sbom_license_dependency_evidence_pass: PASS
  medium_or_review_needed: FIX
  critical_high_missing_sbom_or_license_blocker: BLOCKED
```

Evidence fields:

```yaml
dependency_license_sbom_evidence:
  profile_id: dependency_license_sbom
  lockfile_ref: string
  sbom_ref: string | null
  license_summary_ref: string | null
  critical_count: number
  high_count: number
  exception_refs: array
  result: PASS | FIX | BLOCKED
```

## 10. Profile: Lab / Manual Evidence

```yaml
profile_id: lab_manual_evidence
purpose: Record controlled manual validation evidence without executing live runtime or lab actions by default.
allowed_command_templates:
  - no shell command by default
  - manual evidence validation only
forbidden:
  - live device commands without lab approval
  - production runtime access
  - network scans
  - deployment/restart
  - customer data output
result_mapping:
  manual_evidence_complete_and_safe: PASS
  missing_detail_or_review_needed: FIX
  live_action_or_unsafe_output_without_approval: BLOCKED
```

Evidence fields:

```yaml
lab_manual_runner_evidence:
  profile_id: lab_manual_evidence
  lab_scope: hardware_nos | manual_qa | pm_review | security_review | uat | other
  operator: string
  environment_label: local | isolated_tmp | staging_private | lab_private | docs_only | other
  live_device_touched: boolean
  production_runtime_touched: boolean
  sanitized_observation: string
  approval_ref: string | null
  result: PASS | FIX | BLOCKED
```

## 11. Profile: Release Quality Rollup

```yaml
profile_id: release_quality_rollup
purpose: Aggregate FP-16 evidence into a release gate quality result.
allowed_command_templates:
  - evidence manifest validation
  - checksum/hash verification
  - blocker status aggregation
forbidden:
  - building release artifact unless separately approved
  - deployment
  - restart
  - DB action
  - production claim
result_mapping:
  all_required_evidence_pass_and_no_open_blockers: PASS
  missing_noncritical_or_fixable_evidence: FIX
  missing_required_release_evidence_or_open_blocker: BLOCKED
```

Evidence fields:

```yaml
release_quality_rollup_evidence:
  profile_id: release_quality_rollup
  release_candidate_id: string
  required_evidence_count: number
  pass_count: number
  fix_count: number
  blocked_count: number
  open_blocker_count: number
  missing_hash_count: number
  final_decision: PASS | FIX | BLOCKED
```

## 12. PASS / FIX / BLOCKED Result Model

Every runner result must use exactly one of:

```text
PASS
FIX
BLOCKED
```

Result rules:

| Result | Meaning | Release effect |
| --- | --- | --- |
| PASS | Required commands/evidence passed safely | May proceed if other gates pass |
| FIX | Validation failed or evidence incomplete but no immediate unsafe condition | Cannot release until fixed or exception approved |
| BLOCKED | Unsafe, forbidden, missing required approval/evidence, or command not allowlisted | Cannot proceed |

`BLOCKED` is mandatory when:

- profile unknown;
- command not allowlisted;
- request includes arbitrary command;
- DB action requested;
- migration/reset/seed/db push requested;
- deployment/restart requested;
- secrets/env/token/cookie output requested;
- required security evidence missing for release;
- raw unsafe content appears in output;
- runner cannot determine safe result.

## 13. Evidence Linkage to FP-16

Every runner execution must produce FP-16-compatible evidence.

```yaml
quality_runner_evidence:
  evidence_id: string
  package_id: FP-15
  task_id: string | null
  profile_id: string
  runner_request_id: string
  commit_sha: string | null
  source_ref: string | null
  command_template_id: string | null
  command_was_allowlisted: boolean
  arbitrary_command_requested: false
  result: PASS | FIX | BLOCKED
  sanitized_summary: string
  report_ref: string | null
  artifact_hashes: array
  blocker_id: string | null
  fp16_evidence_refs: array
  created_by: string
  created_at: string
```

Evidence rules:

- Link to commit SHA for code validation.
- Link to task/package ID.
- Link to blocker ID when result is `BLOCKED`.
- Link to security evidence for FP-12 profiles.
- Link to hash/checksum for report/artifact files.
- Do not store raw unsafe command output in PM-visible evidence.

## 14. Fail-Closed Behavior

The quality runner must fail closed.

Fail-closed cases:

```text
unknown profile
missing required request field
unapproved command
arbitrary command requested
unsafe output detected
scanner/test command cannot complete
missing lockfile for install profile
missing evidence ref for evidence-only profile
hash mismatch
review status missing
PM approval missing for high-risk action
runtime/DB/deployment action requested
```

Fail-closed result shape:

```yaml
runner_response:
  accepted: false
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  command_executed: false
```

## 15. Backend Implementation Dependency

Backend implementation is required before FP-15 can become runtime-capable.

```yaml
backend_implementation_dependency_needed: YES
reason: A production quality runner needs profile registry, command template allowlist, execution sandbox, evidence writer, hash generation, blocker routing, and review-state integration.
```

Future implementation must include:

- profile registry with hardcoded allowlist;
- command template IDs, not raw command strings from request body;
- isolated workspace execution only;
- timeout/resource limits;
- sanitized output handling;
- FP-16 evidence writer;
- blocker router;
- tests for unknown profile, forbidden command, fail-closed behavior, and PASS/FIX/BLOCKED mapping;
- no DB action or file storage until separately approved.

## 16. Acceptance Criteria

FP-15 contract is acceptable when it defines:

- allowlisted test profiles;
- frontend lint/build profile;
- backend build/test profile;
- Prisma validate profile;
- security scan evidence profile;
- secrets scan evidence profile;
- dependency/license/SBOM profile;
- lab/manual evidence profile;
- PASS/FIX/BLOCKED output model;
- FP-16 evidence linkage;
- command allowlist;
- fail-closed behavior;
- backend implementation dependency;
- forbidden action confirmation.

## 17. Forbidden Actions Check

```yaml
arbitrary_command_execution: NO
live_load_test: NO
runtime_execution: NO
db_action: NO
migration_reset_seed_db_push: NO
deployment_restart: NO
runtime_smoke: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 18. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-15 Quality Runner Runtime contract created at docs/pm-handoffs/fp-15-quality-runner-runtime.md. Covers allowlisted profiles, frontend lint/build, backend build/test, Prisma validate, security scan evidence, secrets scan evidence, dependency/license/SBOM, lab/manual evidence, PASS/FIX/BLOCKED result model, FP-16 evidence linkage, command allowlist, fail-closed behavior, and backend implementation dependency. Docs/runtime contract only. No arbitrary command execution. No live load test. No runtime execution. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
