# SEKHEM — FP-16 Evidence Platform Contract

## Package

`FP-16` — Evidence Platform

## Owner

Tasker 4

## Status

In Progress / Evidence Model Contract Artifact

This file is a documentation/model contract only.

No DB schema change, migration, reset, seed, db push, file storage implementation, runtime write, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the unified evidence platform model required before SEKHEM release gates can operate safely. The model standardizes evidence capture, review, linkage, hashing/checksums, immutability, blocker integration, approval traceability, and release package evidence across the full product tracks.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/full-product-parallel-execution-model.md`
- `docs/pm-handoffs/fp-03-source-control-center-allowlist-contract.md`
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- FP-01 workflow runtime persistence validation evidence
- FP-14 Quality Matrix / Test Profiles
- PM rule: no production claim before final gate

## Risk Class

`FP-16` is evidence/release-control design work.

```text
Risk class: Class D for future backend persistence/storage implementation.
Current artifact class: docs/model only.
```

Any future implementation of persistence, artifact storage, immutable records, or release packaging must be a separate approved Tasker 4 package with explicit PM approval.

## Evidence Platform Goals

1. Provide one consistent evidence envelope for all product tracks.
2. Link evidence to package IDs, task IDs, commit SHAs, workflow runs, approvals, blockers, and release candidates.
3. Keep review status immutable after review decision.
4. Require hash/checksum for every file/artifact evidence reference when content is stored.
5. Store only sanitized summaries in PM docs/boards.
6. Support security, QA, source, workflow, lab/manual, approval, blocker, and release package gates.
7. Prevent release if required evidence is missing, stale, failed, unsafe, or unreviewed.

## 1. Unified Evidence Envelope

All evidence records must conform to a common envelope before type-specific fields are attached.

```yaml
evidence_id: string
package_id: FP-01 | FP-02 | FP-03 | FP-05 | FP-12 | FP-14 | FP-16 | FP-21 | FP-24 | string
task_id: string | null
risk_class: ClassA | ClassB | ClassC | ClassD | ClassE | null
evidence_type: task_contract | source_allowlist | workflow_callback | qa_test | security_scan | lab_manual | approval | blocker | release_package | other
title: string
sanitized_summary: string
source_ref: string | null
source_system: github | google_sheet | google_doc | local_validation | ci | manual | runtime | lab | other
source_uri: string | null
commit_sha: string | null
workflow_run_id: string | null
approval_id: string | null
blocker_id: string | null
release_candidate_id: string | null
artifact_refs: array
hashes: array
created_by: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | LabOwner | CI | System | string
created_at: string
review_status: pending_review | pass | fix | blocked | superseded
reviewed_by: string | null
reviewed_at: string | null
review_decision_ref: string | null
forbidden_actions_check: PASS | FAIL
raw_sensitive_content_stored: false
```

Required rule: `raw_sensitive_content_stored` must always be `false` for PM-visible evidence records.

## 2. Evidence Type Catalog

### 2.1 Task Contract Evidence

Task contract evidence proves that a package or task was authorized, bounded, risk-classified, and has acceptance criteria.

```yaml
task_contract_evidence:
  task_id: string
  package_id: string
  objective: string
  risk_class: string
  allowed_tools: array
  allowed_files: array
  forbidden_files: array
  max_changed_files: number | null
  acceptance_criteria: array
  required_tests: array
  required_reviewers: array
  approvals_required: array
  stop_conditions: array
  output_schema_ref: string | null
  pm_approval_ref: string | null
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- missing task ID for file-changing work;
- missing risk class;
- missing allowed/forbidden file scope;
- task requests DB, deployment, public API, AI provider activation, or GitHub write without explicit PM approval;
- acceptance criteria missing.

### 2.2 Source Allowlist Evidence

Source allowlist evidence proves that source data came from an approved family or exact source and respected controlled fetch scope.

```yaml
source_allowlist_evidence:
  source_id: string
  source_family: string
  source_type: string
  source_url: string | null
  repository_full_name: string | null
  lifecycle_state: proposed | risk_review | approved | active | blocked | rejected
  risk_category: Safe | Needs Review | High Risk | Blocked
  allowed_fetch_scope_used: string
  blocked_fetch_scope_detected: boolean
  manual_collection_only: boolean
  review_before_import_required: boolean
  dedup_key: string
  content_hash_or_metadata_hash: string | null
  sanitized_summary: string
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- source not allowlisted;
- lifecycle state not eligible;
- recursive crawl, schedule, public trigger, clone/build/test, package install, script execution, or automatic import requested;
- raw unsafe content detected;
- dedup conflict unresolved.

### 2.3 Workflow Callback Evidence

Workflow callback evidence proves execution/status events were accepted, persisted, deduplicated, and traceable.

```yaml
workflow_callback_evidence:
  workflow_run_id: string
  callback_id: string | null
  idempotency_key_ref: string | null
  issue_id: string
  task_id: string | null
  step: string
  status: queued | running | succeeded | failed | blocked | cancelled | timed_out
  occurred_at: string
  accepted_at: string | null
  payload_hash: string | null
  duplicate: boolean
  state_transition_valid: boolean
  error_summary: string | null
  blocker_id: string | null
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- invalid transition;
- missing idempotency key;
- idempotency conflict;
- failed or blocked callback without safe evidence;
- raw error content includes secrets, env values, tokens, cookies, credentials, raw logs, raw headers, or connection strings.

### 2.4 QA/Test Evidence

QA/test evidence proves that required validation for a package or release was performed and can be traced to command, commit, and result.

```yaml
qa_test_evidence:
  test_scope: unit | integration | http_contract | build | prisma_validate | targeted | full_suite | manual_qa | other
  command_ref: string
  command_executed: string | null
  commit_sha: string | null
  test_count_total: number | null
  test_count_passed: number | null
  test_count_failed: number | null
  suite_count: number | null
  duration_ms: number | null
  report_ref: string | null
  sanitized_failure_summary: string | null
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- required test missing;
- build failure;
- targeted test failure;
- unsafe raw output in evidence;
- failure not classified PASS/FIX/BLOCKED;
- test report not tied to commit or task.

### 2.5 Security Scan Evidence

Security scan evidence follows FP-12 policy.

```yaml
security_scan_evidence:
  scan_type: secrets | dependency | license_sbom | redaction | source_connector_security | ai_safety | release_gate
  scan_scope: string
  scan_mode: design_only | dry_run | repo_snapshot | ci_artifact | manual_review
  tool_name: string | null
  tool_version: string | null
  scan_artifact_ref: string | null
  sanitized_summary: string
  critical_count: number | null
  high_count: number | null
  medium_count: number | null
  low_count: number | null
  unsafe_content_detected: boolean
  exception_ref: string | null
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- missing secrets scan for release candidate;
- verified/high-confidence secret finding;
- critical/high dependency finding without exception;
- missing SBOM/license evidence;
- failed source connector or AI safety check;
- scan failed or raw unsafe content appears in evidence.

### 2.6 Lab/Manual Evidence

Lab/manual evidence covers controlled manual validation, Hardware/NOS lab planning, and non-automated review outputs.

```yaml
lab_manual_evidence:
  lab_scope: hardware_nos | manual_qa | pm_review | security_review | uat | other
  operator: string
  environment_label: local | isolated_tmp | staging_private | lab_private | docs_only | other
  live_device_touched: boolean
  production_runtime_touched: boolean
  command_summary: string | null
  sanitized_observation: string
  artifact_ref: string | null
  approval_ref: string | null
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- live device touched without lab approval;
- production runtime touched without PM approval;
- raw device output contains secrets, customer data, internal unsafe content, or credentials;
- command summary implies deployment, restart, db action, or public exposure without approval.

### 2.7 Approval Evidence

Approval evidence proves PM or reviewer decisions are explicit, traceable, and bounded.

```yaml
approval_evidence:
  approval_id: string
  approval_type: pm_decision | qa_review | security_review | legal_exception | release_gate | deployment_gate | db_gate | ai_provider_gate | github_write_gate
  approved_by: string
  approved_at: string
  decision: approved | rejected | blocked | exception_granted | exception_expired
  scope: string
  expiry: string | null
  constraints: array
  evidence_refs: array
  result: PASS | FIX | BLOCKED
```

Blocking conditions:

- approval missing for high-risk action;
- approval lacks scope/constraints;
- approval expired;
- approval used outside intended package/task;
- approval conflicts with PM forbidden actions.

### 2.8 Blocker Evidence

Blocker evidence records why execution, release, scan, source import, or approval cannot proceed.

```yaml
blocker_evidence:
  blocker_id: string
  package_id: string
  task_id: string | null
  blocker_reason: string
  severity: low | medium | high | critical
  owner: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | Legal | LabOwner | string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
  resolved_at: string | null
  resolution_ref: string | null
  result: BLOCKED | FIX | PASS
```

Blocking conditions:

- blocker exists unresolved for release candidate;
- blocker lacks reason, owner, or PM decision field;
- blocker summary includes raw sensitive content;
- blocker resolution lacks evidence.

### 2.9 Release Package Evidence

Release package evidence proves that a release candidate has traceable source, build, security, QA, approval, artifact, and blocker status evidence.

```yaml
release_package_evidence:
  release_candidate_id: string
  version_label: string | null
  commit_sha: string
  package_manifest_ref: string | null
  artifact_refs: array
  artifact_hashes: array
  qa_evidence_refs: array
  security_evidence_refs: array
  approval_evidence_refs: array
  blocker_evidence_refs: array
  open_blocker_count: number
  final_gate_result: PASS | FIX | BLOCKED
  production_claim_allowed: false
```

Blocking conditions:

- missing artifact hash;
- missing QA/security evidence;
- unresolved blocker;
- missing PM release approval;
- final gate not reviewed;
- production readiness claim before FP-29/FP-30 final gate.

## 3. Hash and Checksum Requirements

Every file-like artifact evidence must include a checksum before review can pass.

Allowed hash algorithms:

```text
sha256 required
sha512 optional
source commit SHA required for GitHub source artifacts
content hash required for fetched source summaries when available
```

Required hash fields:

```yaml
hash_record:
  artifact_ref: string
  hash_algorithm: sha256
  hash_value: string
  computed_at: string
  computed_by: string
  source_commit_sha: string | null
  file_size_bytes: number | null
```

Rules:

- Hash must be computed from the exact artifact bytes or exact sanitized content.
- Hash must not be computed from live env values or secrets.
- Evidence without required hash is `FIX` for non-release and `BLOCKED` for release.
- Hash mismatch after review creates a new blocker and supersedes previous evidence.
- Hashes must be stored with immutable review status.

## 4. Immutable Review Status

Review status is append-only after a decision.

Allowed review statuses:

```text
pending_review
pass
fix
blocked
superseded
```

Transition rules:

```text
pending_review -> pass
pending_review -> fix
pending_review -> blocked
pass -> superseded
fix -> superseded
blocked -> superseded
```

Forbidden transitions:

```text
pass -> fix
pass -> blocked
fix -> pass
blocked -> pass
superseded -> pass
superseded -> fix
superseded -> blocked
```

If evidence changes after review, create a new evidence record and mark the old record `superseded` with a new evidence reference. Do not mutate the old decision.

## 5. Linkage Model

Evidence must support these links:

```yaml
links:
  package_id: required
  task_id: optional_required_for_file_changes
  workflow_run_id: optional
  callback_id: optional
  source_id: optional
  approval_id: optional
  blocker_id: optional
  release_candidate_id: optional
  commit_sha: optional_required_for_code_artifacts
  artifact_ref: optional_required_for_files
```

Linkage rules:

- A release package must link to QA, security, approval, blocker, and artifact evidence.
- A blocker should link to the evidence that created it.
- Approval evidence should link to the exact task/package/action it approved.
- Workflow callback evidence should link to workflow run and task when available.
- Source evidence should link to source registration and sanitized source ref.

## 6. Storage Contract Design

This section is design only and does not implement storage.

### Logical storage areas

```text
evidence_records: metadata envelope + review state
artifact_store_refs: pointers to file-like artifacts
hash_records: checksum metadata
review_decisions: immutable append-only review decisions
blocker_links: evidence-to-blocker relations
release_evidence_manifest: release candidate evidence roll-up
```

### Storage rules

- PM-visible evidence stores sanitized summaries only.
- Raw scan output, if ever retained, must be private and referenced only by safe artifact ref.
- No secrets, env values, tokens, cookies, credentials, private keys, raw logs, full headers, or unsafe customer data may be stored in PM-visible records.
- Writes require future Tasker 4 backend persistence approval.
- DB schema change is not authorized by this document.
- File storage implementation is not authorized by this document.

## 7. Evidence Review Rules

Evidence review must use this result vocabulary:

```text
PASS
FIX
BLOCKED
```

Review meanings:

| Result | Meaning | Release effect |
| --- | --- | --- |
| PASS | Evidence is complete, safe, and traceable | May proceed if other gates pass |
| FIX | Evidence or implementation needs correction | Cannot release unless exception exists |
| BLOCKED | Unsafe, missing, unapproved, or decision-needed | Cannot release |

Minimum reviewer fields:

```yaml
review:
  reviewed_by: string
  reviewed_at: string
  decision: PASS | FIX | BLOCKED
  decision_reason: string
  evidence_refs: array
  pm_decision_needed: string | null
```

## 8. Release Gate Evidence Requirements

A release cannot pass unless all required evidence is present and reviewed.

Required release evidence:

```text
task contract evidence for release-affecting tasks
source allowlist evidence for external/internal imported sources
workflow callback evidence for orchestrated work
QA/test evidence for build and required tests
security scan evidence per FP-12
lab/manual evidence where manual or Hardware/NOS validation applies
approval evidence for PM/security/legal/db/deployment gates
blocker evidence showing zero unresolved release blockers
release package evidence with artifact hashes
```

Release is blocked when:

- any required evidence is missing;
- any evidence is `pending_review`, `fix`, or `blocked` without exception;
- hash is missing or mismatched;
- raw sensitive content appears in evidence;
- approval is missing, expired, or out of scope;
- unresolved blocker exists;
- production readiness is claimed before final production gate.

## 9. Backend Persistence Dependency

Backend persistence is required for production implementation of FP-16.

```yaml
backend_persistence_dependency_needed: YES
reason: Evidence records, immutable review decisions, hash records, blocker links, and release evidence manifests require durable storage before release automation can rely on them.
```

This document does not authorize the schema. Future implementation must include:

- additive schema proposal;
- migration plan only until PM approves execution;
- API contract;
- tests for immutability and hash validation;
- no destructive migration;
- no DB reset;
- no live DB write until PM approval.

## 10. Acceptance Criteria

FP-16 contract is acceptable when it defines:

- task contract evidence;
- source allowlist evidence;
- workflow callback evidence;
- QA/test evidence;
- security scan evidence;
- lab/manual evidence;
- approval evidence;
- blocker evidence;
- release package evidence;
- evidence hash/checksum requirements;
- immutable review status;
- backend persistence dependency;
- forbidden action confirmation.

## 11. Forbidden Actions Check

```yaml
db_schema_change: NO
migration_reset_seed_db_push: NO
file_storage_implementation: NO
runtime_write: NO
deployment_restart: NO
runtime_smoke: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 12. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-16 evidence platform contract/model created at docs/pm-handoffs/fp-16-evidence-platform-contract.md. Covers task contract evidence, source allowlist evidence, workflow callback evidence, QA/test evidence, security scan evidence, lab/manual evidence, approval evidence, blocker evidence, release package evidence, hash/checksum requirements, immutable review status, storage contract design, blocker linkage, and backend persistence dependency. Docs/model only. No DB schema change. No migration/reset/seed/db push. No file storage implementation. No runtime write. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
