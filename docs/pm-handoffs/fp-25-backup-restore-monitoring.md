# FP-25 — Backup / Restore / Monitoring Contract

Package ID: FP-25
Owner: Infra
Status: In Progress / PM Review
Goal: Backup / Restore / Monitoring
Document Path: `docs/pm-handoffs/fp-25-backup-restore-monitoring.md`

## 1. Purpose

This contract defines the Backup / Restore / Monitoring model for SEKHEM Production Runtime Release.

The purpose is to standardize how backup scope, restore validation, monitoring health checks, alerts, evidence retention, and release-package backup linkage must be represented before UAT or release readiness can be accepted.

This document is contract-only. It does not execute backups, restores, DB dumps, file storage writes, deployment, restart, migration, reset, seed, db push, or production operations.

## 2. Scope

FP-25 covers:

* Backup inventory
* Backup scope
* Restore validation plan
* Monitoring health checks
* Alert rules
* Evidence retention
* Release package backup linkage
* Restore blocker rules
* No destructive restore rule
* PM approval before restore
* UAT readiness dependency
* Backend/storage dependency

## 3. Non-Scope

FP-25 does not include:

* Live backup execution
* Restore execution
* Database dump
* File storage write
* Destructive action
* Migration, reset, seed, or db push
* Deployment or restart
* Secrets, env, token, cookie, or credential exposure
* Production readiness claim

## 4. Backup Inventory

Every backup inventory record must identify the backup target, owner, scope, retention class, validation state, and release linkage.

Required backup inventory fields:

```text
backup_inventory_id
backup_type
backup_scope
source_system
source_environment
source_owner
backup_owner
storage_target_reference
retention_class
retention_period
encryption_required
hash_required
release_package_reference
evidence_bundle_reference
last_validation_status
last_validation_timestamp
restore_test_reference
known_limitations
blockers
notes
```

Approved backup types:

```text
metadata_backup
artifact_metadata_backup
release_package_backup
evidence_bundle_backup
configuration_reference_backup
database_backup_contract
storage_backup_contract
```

FP-25 does not authorize execution of any backup type. It only defines the inventory and validation contract.

## 5. Backup Scope

Backup scope must be explicit.

Minimum backup scope categories:

* Release package metadata
* Evidence bundle metadata
* Artifact manifest metadata
* SHA256/hash manifest
* Approval records
* Gate checklist records
* Rollback references
* QA evidence references
* Security evidence references
* Monitoring evidence references
* Backup policy documents
* Restore validation evidence
* UAT readiness evidence

Out of scope unless separately approved:

* Live database dumps
* Raw file storage copies
* Production secrets
* `.env` files
* Tokens
* Cookies
* Private keys
* Full raw logs
* Unredacted customer data
* Uncontrolled local developer files

Any backup scope that requires live DB dump, live file storage copy, or secret exposure must be marked BLOCKED.

## 6. Restore Validation Plan

Restore validation must prove that a backup can be safely referenced, checked, and validated without destructive action.

Restore validation plan must include:

```text
restore_validation_id
backup_inventory_id
restore_scope
restore_mode
validation_environment
owner
required_evidence
expected_result
actual_result
qa_decision: PASS / FIX / BLOCKED
security_review_required
pm_approval_required
rollback_reference
blockers
notes
```

Approved restore validation modes:

```text
contract_review_only
manifest_integrity_check
hash_manifest_review
metadata_consistency_review
evidence_reference_review
dry_run_plan_review
isolated_restore_plan_review
```

Forbidden restore validation modes under FP-25:

* Live restore
* Production restore
* Destructive overwrite
* DB reset
* DB import
* DB migration
* File storage overwrite
* Runtime cutover
* Service restart
* Deployment

## 7. Monitoring Health Checks

Monitoring must be defined as health-check evidence requirements, not live monitoring implementation.

Required monitoring health check categories:

```text
application_health
db_readiness_health
auth_session_health
workflow_executor_health
source_connector_health
ai_gateway_policy_health
security_gate_health
artifact_storage_health
release_factory_health
backup_inventory_health
evidence_bundle_health
uat_readiness_health
```

Each monitoring health check must include:

```text
health_check_id
health_check_name
scope
owner
expected_signal
evidence_reference
frequency_policy
severity
qa_decision: PASS / FIX / BLOCKED
blocker_rule
notes
```

No monitoring check may expose secrets, env values, tokens, cookies, credentials, raw connection strings, or unredacted logs.

## 8. Alert Rules

Alert rules must define what becomes a blocker and who owns response.

Required alert rule fields:

```text
alert_rule_id
alert_name
trigger_condition
severity
owner
routing_target
evidence_required
pm_decision_required
expected_response
blocker_status
notes
```

Minimum alert categories:

```text
backup_missing
backup_hash_missing
backup_hash_mismatch
restore_validation_missing
restore_validation_failed
evidence_bundle_missing
release_package_backup_link_missing
monitoring_health_failed
uat_readiness_blocked
secret_exposure_detected
storage_dependency_unavailable
db_dependency_unavailable
approval_record_missing
rollback_reference_missing
```

Alert severity levels:

```text
INFO
WARN
BLOCKER
CRITICAL_BLOCKER
```

Any alert related to missing backup evidence, failed restore validation, missing rollback reference, secret exposure, or destructive restore request must be BLOCKER or CRITICAL_BLOCKER.

## 9. Evidence Retention

Backup / restore / monitoring evidence must be retained as part of the release evidence model.

Evidence retention record fields:

```text
evidence_retention_id
evidence_type
package_id
related_backup_inventory_id
related_restore_validation_id
storage_reference
retention_class
retention_period
redaction_status
hash_reference
owner
qa_decision
created_at
expires_at
notes
```

Evidence must be redacted before retention.

Evidence must not include:

* Secrets
* Env values
* Tokens
* Cookies
* Private keys
* Raw credentials
* Raw database dumps
* Unredacted stack traces
* Unredacted production logs
* Restricted internal IPs where prohibited
* Unapproved customer data

## 10. Release Package Backup Linkage

Every release package must reference backup readiness before UAT or release approval.

Required release package backup linkage fields:

```text
release_package_id
backup_inventory_reference
backup_scope_reference
hash_manifest_reference
restore_validation_reference
monitoring_evidence_reference
rollback_package_reference
qa_decision: PASS / FIX / BLOCKED
pm_approval_status
notes
```

If a release package has no backup linkage, the release package must be BLOCKED.

If backup linkage exists but restore validation is missing, the release package must be BLOCKED.

If hash evidence is missing or mismatched, the release package must be BLOCKED.

## 11. Restore Blocker Rules

Restore blockers must route to the correct owner and require PM decision where needed.

Restore must be BLOCKED when:

* PM approval is missing
* Restore scope is unclear
* Backup inventory is missing
* Backup hash is missing
* Backup hash mismatch exists
* Restore validation evidence is missing
* Restore requires destructive action
* Restore targets production without explicit PM go/no-go
* Restore requires DB reset, DB import, or DB migration
* Restore requires file storage overwrite
* Restore may expose secrets
* Rollback package reference is missing
* UAT readiness dependency is unresolved

Required blocker fields:

```text
blocker_id
blocker_reason
blocker_owner
pm_decision_needed
safe_next_action
evidence_reference
status: PASS / FIX / BLOCKED
```

## 12. No Destructive Restore Rule

FP-25 requires a strict no-destructive-restore rule.

No destructive restore may be executed under this contract.

Forbidden:

* Restore overwrite
* Database reset
* Database import
* Database migration
* File storage overwrite
* Production restore
* Production cutover
* Runtime restart
* Deployment
* Service replacement
* Data deletion
* Rollback execution

Required rule:

```text
No restore may execute unless PM explicitly approves a separate restore execution task with rollback plan, impact scope, owner, and validation evidence.
```

Any restore request involving destructive action must be marked BLOCKED.

## 13. PM Approval Before Restore

PM approval is mandatory before any restore execution.

Approval record must include:

```text
restore_request_id
backup_inventory_id
restore_scope
restore_target
restore_owner
risk_assessment
rollback_plan_reference
validation_evidence_reference
pm_approval_decision: PASS / FIX / BLOCKED
pm_approval_timestamp
notes
```

PM approval for restore validation planning does not authorize restore execution.

PM approval for release package review does not authorize restore execution.

PM approval for UAT readiness does not authorize production restore.

## 14. UAT Readiness Dependency

UAT readiness depends on backup / restore / monitoring evidence.

UAT cannot be marked ready unless:

* Backup inventory exists
* Backup scope is defined
* Restore validation plan exists
* Restore validation evidence is available or explicitly deferred by PM
* Monitoring health checks are defined
* Alert rules are defined
* Release package backup linkage exists
* No destructive restore rule is acknowledged
* PM approval before restore rule is acknowledged
* Open blockers are routed

If any required backup / restore / monitoring evidence is missing, UAT readiness must be FIX or BLOCKED.

## 15. Backend / Storage Dependency

Backend/storage dependency needed: YES.

FP-25 requires backend/storage support for:

* Backup inventory metadata
* Backup scope records
* Restore validation records
* Monitoring health check records
* Alert rule records
* Evidence retention records
* Release package backup linkage
* PM restore approval records
* Blocker routing records
* Audit timeline

Until backend/storage is implemented and approved, FP-25 remains a contract-only backup / restore / monitoring model.

No DB write or file storage write is authorized by this contract.

## 16. PASS / FIX / BLOCKED Model

### PASS

Use PASS only when:

* Backup inventory is defined
* Backup scope is defined
* Restore validation plan is defined
* Monitoring health checks are defined
* Alert rules are defined
* Evidence retention is defined
* Release package backup linkage is defined
* No destructive restore rule is defined
* PM approval before restore rule is defined
* UAT readiness dependency is defined
* No forbidden action occurred

### FIX

Use FIX when:

* Policy is mostly defined but incomplete
* Evidence fields need clarification
* Monitoring rule ownership needs refinement
* Backup scope needs narrowing
* Restore validation evidence needs additional documentation
* No safety blocker exists

### BLOCKED

Use BLOCKED when:

* Backup scope is unclear
* Restore validation requires destructive action
* PM approval requirement is missing
* Release package backup linkage is missing
* UAT dependency is unresolved
* Backend/storage dependency blocks execution
* Secret exposure risk exists
* Live DB dump or file storage write is requested
* Owner or blocker routing is unclear

## 17. Acceptance Criteria

FP-25 is acceptable when:

* Backup inventory is defined
* Backup scope is defined
* Restore validation plan is defined
* Monitoring health checks are defined
* Alert rules are defined
* Evidence retention is defined
* Release package backup linkage is defined
* Restore blocker rules are defined
* No destructive restore rule is defined
* PM approval before restore rule is defined
* UAT readiness dependency is defined
* Backend/storage dependency is identified
* Forbidden actions are not performed

## 18. Forbidden Actions Confirmation

FP-25 confirms:

* No live backup execution
* No restore execution
* No DB dump
* No file storage write
* No destructive action
* No migration/reset/seed/db push
* No deployment/restart
* No secrets/env/token/cookie exposure
* No production claim
