# SEKHEM — FP-22 Lab Evidence Workflow Contract

## Package

`FP-22` — Lab Evidence Workflow

## Owner

Tasker 4

## Status

In Progress / Workflow Contract Artifact

This file is a documentation/workflow contract only.

No live device commands, NOS changes, config push, production network access, hardware execution, file storage implementation, DB action, migration, reset, seed, db push, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the controlled Lab Evidence Workflow that connects FP-21 Hardware/NOS Lab Architecture to FP-16 Evidence Platform and release gates. The workflow supports manual or simulated lab report upload, device inventory reference, lab validation profile reference, QA review, PASS / FIX / BLOCKED lab result, blocker routing, and release gate linkage.

FP-22 does not claim live automation, does not execute hardware actions, and does not validate live devices.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-21-hardware-nos-lab-architecture.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- `docs/pm-handoffs/fp-15-quality-runner-runtime.md`
- FP-14 Class E lab/manual evidence profile
- PM rule: no production claim before final gate

## Risk Class

Lab evidence workflow is tied to Class E evidence, but this artifact is docs/workflow only.

```text
Current artifact: docs/workflow contract only
Future live lab execution: Class E and separately approved
Future backend/storage implementation: Class D and separately approved
```

## FP-22 Principles

1. FP-22 records and reviews lab evidence; it does not execute lab automation.
2. Manual and simulated lab reports are allowed as evidence inputs.
3. Live-device execution is not allowed under this package.
4. Every lab evidence package must reference device inventory or explicitly state simulated/no-device scope.
5. Every lab evidence package must reference a lab validation profile or manual review profile.
6. Every lab result must be `PASS`, `FIX`, or `BLOCKED`.
7. QA review is required before release gate use.
8. Unsafe, incomplete, or unapproved lab evidence routes to blocker.
9. PM-visible evidence must be sanitized.
10. No live hardware validation claim is allowed from FP-22 alone.

## 1. Allowed Lab Evidence Modes

```yaml
allowed_lab_evidence_modes:
  - manual_report_upload
  - simulated_lab_report_upload
  - architecture_review_report
  - inventory_review_report
  - read_only_profile_design_review
  - sanitized_observation_upload
```

### Mode meanings

| Mode | Meaning | Live execution allowed |
| --- | --- | --- |
| `manual_report_upload` | Human-created report from approved source or prior approved lab activity | NO under FP-22 |
| `simulated_lab_report_upload` | Simulated or mocked lab result for workflow validation | NO |
| `architecture_review_report` | Review of topology/isolation/access model | NO |
| `inventory_review_report` | Review of device inventory completeness | NO |
| `read_only_profile_design_review` | Review of future read-only validation profile design | NO |
| `sanitized_observation_upload` | Sanitized observation without raw unsafe output | NO |

Rejected modes:

```text
live_device_command_execution
nos_configuration_change
config_push
firmware_upgrade
reload_or_reboot
production_network_test
packet_capture_on_production_path
automated_remediation
```

Rejected modes must produce `BLOCKED` and route to blocker evidence.

## 2. Manual / Simulated Report Upload Contract

Future upload workflow must support report metadata and references only. This document does not implement file storage.

```yaml
lab_report_upload:
  upload_id: string
  package_id: FP-22
  evidence_mode: manual_report_upload | simulated_lab_report_upload | architecture_review_report | inventory_review_report | read_only_profile_design_review | sanitized_observation_upload
  uploaded_by: PM | Tasker4 | QA | Infra | SecurityReviewer | LabOwner | string
  uploaded_at: string
  report_title: string
  report_ref: string
  report_hash_sha256: string | null
  report_size_bytes: number | null
  sanitized_summary: string
  raw_sensitive_content_stored: false
  no_live_execution_claim: true
  no_hardware_execution: true
```

Upload acceptance rules:

- Report body must be sanitized before PM-visible evidence.
- Hash/checksum is required when a file artifact exists.
- Report must not include credentials, secrets, cookies, tokens, private keys, env values, raw configs, raw full logs, full headers, or customer data.
- Report must not claim live execution unless separate live lab approval evidence exists outside FP-22.
- Simulated reports must be clearly labeled as simulated.

## 3. Device Inventory Reference

Every non-simulated lab evidence package must reference a device inventory record. Simulated packages must mark device scope as simulated.

```yaml
device_inventory_reference:
  device_scope: physical_device | virtual_nos | simulated | architecture_only | inventory_only
  device_id: string | null
  asset_tag: string | null
  vendor: string | null
  model: string | null
  nos_name: string | null
  nos_version: string | null
  inventory_status: planned | received | quarantined | lab_ready | read_only_validation_allowed | write_validation_requires_approval | retired | blocked | simulated | not_applicable
  inventory_evidence_ref: string | null
  production_network_attached: false
```

Blocking conditions:

- physical or virtual device evidence without inventory reference;
- inventory status is `quarantined`, `blocked`, or unknown for non-simulated validation;
- production network attachment is true;
- credentials or device secrets appear in inventory evidence;
- serial-sensitive or customer-sensitive data is not sanitized where required.

## 4. Lab Validation Profile Reference

Lab evidence must reference an approved validation profile or profile-design review.

```yaml
lab_validation_profile_reference:
  profile_id: string
  profile_name: string
  profile_type: manual_review | simulated | read_only_design | future_read_only_execution
  profile_version: string | null
  allowed_command_categories: array
  blocked_command_categories: array
  approval_required: boolean
  approval_ref: string | null
  reviewer: QA | SecurityReviewer | PM | LabOwner | string
```

FP-22 permits only `manual_review`, `simulated`, and `read_only_design` profiles by default.

`future_read_only_execution` may be referenced as design evidence but not executed under FP-22.

Blocked command categories:

```text
configure terminal
commit
write memory
copy running-config startup-config
reload
reboot
install image
upgrade firmware
delete files
change interface state
change routing state
change credentials
push templates
any command that modifies runtime state
```

## 5. Evidence Package Fields

Unified lab evidence package:

```yaml
lab_evidence_package:
  evidence_id: string
  package_id: FP-22
  task_id: string | null
  evidence_mode: string
  report_upload: lab_report_upload
  device_inventory_reference: device_inventory_reference
  lab_validation_profile_reference: lab_validation_profile_reference
  qa_review: qa_review_result | null
  security_review_ref: string | null
  blocker_id: string | null
  release_candidate_id: string | null
  artifact_refs: array
  artifact_hashes: array
  sanitized_summary: string
  safety_statement:
    no_live_device_commands: true
    no_nos_changes: true
    no_config_push: true
    no_production_network_access: true
    no_hardware_execution: true
    no_secrets_printed: true
    no_live_automation_claim: true
  result: PASS | FIX | BLOCKED | pending_review
```

Minimum required fields:

- `evidence_id`
- `package_id`
- `evidence_mode`
- `report_ref`
- `sanitized_summary`
- `raw_sensitive_content_stored = false`
- `no_live_execution_claim = true`
- `no_hardware_execution = true`
- `device_inventory_reference`
- `lab_validation_profile_reference`
- safety statement

Missing minimum fields result in `FIX` or `BLOCKED` depending on release impact.

## 6. PASS / FIX / BLOCKED Lab Result

Lab evidence must use the standard result vocabulary.

| Result | Meaning | Release effect |
| --- | --- | --- |
| PASS | Evidence complete, sanitized, reviewed, no live execution claim | May link to release if all other gates pass |
| FIX | Evidence incomplete, missing hash, missing reviewer, or needs correction | Cannot release until fixed or exception approved |
| BLOCKED | Unsafe, live execution implied, production network risk, secrets, missing required approval, or unresolved blocker | Cannot proceed |

### PASS criteria

- Manual/simulated/architecture report uploaded or referenced.
- Sanitized summary present.
- Device inventory reference present or simulated/not-applicable scope stated.
- Validation profile reference present.
- QA review completed.
- Hash/checksum present for file artifact.
- Safety statement confirms no live commands, no NOS changes, no config push, no production network access, no hardware execution.
- No raw secrets or unsafe content.

### FIX criteria

- Missing non-critical metadata.
- Missing checksum for non-release evidence.
- QA notes request clarification.
- Simulated/manual status is ambiguous but no unsafe claim is made.
- Evidence is safe but incomplete.

### BLOCKED criteria

- Live device commands are included or implied.
- NOS/config changes are included or implied.
- Production network access is included or implied.
- Hardware execution is claimed under FP-22.
- Secrets/env/tokens/cookies/credentials/private keys are present.
- Report includes raw configs, raw logs, raw headers, or customer data without sanitization.
- Required approval is missing.
- Release gate tries to consume pending or unreviewed lab evidence.

## 7. QA Review Workflow

QA review is mandatory before evidence can be linked to a release gate.

```text
Report upload/reference
-> metadata validation
-> safety statement validation
-> inventory/profile reference check
-> sanitization check
-> hash/checksum check
-> QA review
-> PASS / FIX / BLOCKED decision
-> FP-16 evidence link
-> release gate linkage if PASS
```

QA review record:

```yaml
qa_review_result:
  review_id: string
  reviewer: QA | SecurityReviewer | PM | string
  reviewed_at: string
  decision: PASS | FIX | BLOCKED
  decision_reason: string
  required_fixes: array
  blocker_id: string | null
  evidence_refs: array
  release_gate_eligible: boolean
```

QA reviewer must mark `BLOCKED` if any live execution, production access, config change, secret exposure, or unsafe evidence is detected.

## 8. Blocker Routing

A blocker must be created when lab evidence is unsafe, unapproved, or cannot be reviewed safely.

Blocker reasons:

```text
LIVE_DEVICE_COMMAND_INCLUDED
NOS_CHANGE_INCLUDED
CONFIG_PUSH_INCLUDED
PRODUCTION_NETWORK_ACCESS_INCLUDED
HARDWARE_EXECUTION_CLAIMED
MISSING_DEVICE_INVENTORY_REFERENCE
MISSING_VALIDATION_PROFILE_REFERENCE
UNSAFE_RAW_OUTPUT_INCLUDED
SECRET_OR_CREDENTIAL_DETECTED
MISSING_QA_REVIEW
MISSING_APPROVAL
HASH_MISSING_OR_MISMATCHED
RELEASE_GATE_LINKED_TO_UNREVIEWED_EVIDENCE
```

Blocker shape:

```yaml
lab_blocker:
  blocker_id: string
  package_id: FP-22
  owner: Tasker4
  blocking_owner: PM | QA | SecurityReviewer | LabOwner | Infra | Tasker4
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include raw configs, secrets, credentials, tokens, cookies, private keys, env values, raw logs, raw headers, customer data, or unsafe device output.

## 9. Release Gate Linkage

FP-22 lab evidence may be linked to release only after QA review marks it `PASS`.

Release linkage fields:

```yaml
release_gate_linkage:
  release_candidate_id: string
  lab_evidence_id: string
  qa_review_id: string
  device_inventory_ref: string | null
  validation_profile_ref: string
  artifact_hashes: array
  open_blocker_count: number
  release_gate_eligible: boolean
  release_effect: PASS | FIX | BLOCKED
```

Release is blocked when:

- lab evidence is required but missing;
- evidence result is `pending_review`, `FIX`, or `BLOCKED`;
- artifact hash is missing or mismatched;
- blocker is unresolved;
- lab evidence claims live automation or hardware execution under FP-22;
- production readiness is claimed from lab evidence alone.

## 10. No Live Automation Claim

FP-22 does not approve live automation.

Required statement on each evidence package:

```yaml
no_live_automation_claim: true
no_live_device_commands: true
no_hardware_execution: true
```

Evidence text must not say or imply:

```text
validated on live hardware
executed against production device
pushed config
changed NOS state
ran live lab automation
approved production hardware readiness
```

Unless a future separate Class E live validation package with PM approval exists, such statements are `BLOCKED`.

## 11. Backend Dependency

Backend/storage implementation is needed for production use but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Future FP-22 runtime requires upload metadata, artifact references, hashes, immutable QA review status, blocker linkage, and release gate linkage persisted through FP-16 evidence platform.
```

Future implementation must be separately approved and include:

- additive schema proposal or approved storage contract;
- upload metadata API;
- checksum validation;
- QA review state machine;
- blocker routing;
- FP-16 evidence writer integration;
- no raw sensitive content in PM-visible records;
- no live hardware execution.

## 12. Acceptance Criteria

FP-22 workflow contract is acceptable when it defines:

- manual/simulated lab report upload;
- device inventory reference;
- lab validation profile reference;
- evidence package fields;
- PASS / FIX / BLOCKED lab result;
- QA review workflow;
- blocker routing;
- release gate linkage;
- no live automation claim;
- no live hardware execution;
- backend dependency;
- forbidden action confirmation.

## 13. Forbidden Actions Check

```yaml
live_device_commands: NO
nos_changes: NO
config_push: NO
production_network_access: NO
hardware_execution: NO
file_storage_implementation: NO
db_action: NO
migration_reset_seed_db_push: NO
deployment_restart: NO
runtime_smoke: NO
env_secret_token_cookie_output: NO
production_claim: NO
```

## 14. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-22 Lab Evidence Workflow contract created at docs/pm-handoffs/fp-22-lab-evidence-workflow.md. Covers manual/simulated lab report upload, device inventory reference, lab validation profile reference, evidence package fields, PASS/FIX/BLOCKED lab result, QA review workflow, blocker routing, release gate linkage, no live automation claim, no live hardware execution, and backend dependency. Docs/workflow contract only. No live device commands. No NOS changes. No config push. No production network access. No hardware execution. No file storage implementation. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
