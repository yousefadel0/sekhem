# FP-23 — Read-Only Hardware/NOS Validation Profiles

Package ID: FP-23
Owner: Infra
Status: In Progress / PM Review
Goal: Read-only Hardware/NOS Validation Profiles
Document Path: `docs/pm-handoffs/fp-23-readonly-hardware-nos-validation-profiles.md`

## 1. Purpose

This contract defines the read-only Hardware/NOS Validation Profiles for SEKHEM Production Runtime Release.

The purpose is to standardize how hardware, SONiC/NOS, and lab validation evidence may be represented without executing live device commands, changing configuration, accessing production networks, or performing hardware execution.

This document is contract-only. It defines validation profile structure, evidence requirements, approval linkage, and blocker routing.

## 2. Scope

FP-23 covers:

* Simulated validation profile
* Read-only lab evidence profile
* Supported device inventory fields
* SONiC/NOS metadata fields
* No config-change validation mode
* No live device command mode
* Manual evidence capture
* Class E lab approval linkage
* PASS / FIX / BLOCKED lab result model
* Evidence package requirements
* Blocker routing
* Backend/storage dependency

## 3. Non-Scope

FP-23 does not include:

* Live device commands
* SSH, API, SNMP, NETCONF, or gNMI execution
* NOS changes
* Config push
* Production network access
* Hardware execution
* Artifact upload
* Database action
* Migration, reset, seed, or db push
* Deployment or restart
* Secrets, env, token, cookie, or credential handling
* Production readiness claim

## 4. Validation Profile Types

FP-23 defines two approved profile types:

```text
SIMULATED_VALIDATION_PROFILE
READ_ONLY_LAB_EVIDENCE_PROFILE
```

No other profile type is approved under FP-23.

## 5. Simulated Validation Profile

The simulated validation profile is used when no physical device, NOS shell, or live lab connection is involved.

It may use:

* Static test fixtures
* Manually supplied inventory metadata
* Manually supplied NOS metadata
* Manually uploaded or pasted redacted evidence summaries
* Non-executing validation checklists
* Expected behavior matrices
* Lab architecture references
* Quality matrix references

It must not:

* Open SSH sessions
* Call device APIs
* Use SNMP
* Use NETCONF
* Use gNMI
* Push configuration
* Read production network state
* Execute NOS commands
* Upload artifacts automatically
* Claim live validation

Required field:

```text
profile_mode: simulated
live_device_access: false
config_change_allowed: false
command_execution_allowed: false
production_network_access: false
```

## 6. Read-Only Lab Evidence Profile

The read-only lab evidence profile is used when evidence is collected manually from an approved lab process and attached or summarized for review.

It may include manually captured:

* Device inventory evidence
* NOS version evidence
* Interface state screenshots or summaries
* Routing state screenshots or summaries
* Test result screenshots or summaries
* Lab topology references
* Class E lab approval references
* Redacted logs
* QA notes
* Blocker notes

It must not perform evidence collection automatically.

Required field:

```text
profile_mode: read_only_lab_evidence
manual_capture_required: true
live_device_access: false
config_change_allowed: false
command_execution_allowed: false
production_network_access: false
```

## 7. Supported Device Inventory Fields

Each device inventory record should support:

```text
device_id
lab_device_alias
device_role
vendor
model
hardware_sku
serial_number_redacted
asset_tag
asic_family
cpu_architecture
memory_size
storage_size
port_count
port_speed_profile
management_interface_type
power_profile
rack_or_lab_location
lab_owner
approval_class
evidence_reference
notes
```

Sensitive fields must be redacted.

Serial numbers may be partially redacted if required by PM or security policy.

## 8. SONiC/NOS Metadata Fields

Each SONiC/NOS metadata record should support:

```text
nos_name
nos_family
nos_version
sonic_branch
sonic_build_id
kernel_version
sai_version
sai_vendor
platform_name
platform_api_status
container_runtime_status
critical_services_summary
routing_stack
management_stack
telemetry_stack
supported_protocols
known_limitations
evidence_reference
manual_capture_timestamp
captured_by
qa_review_status
```

No field may require live command execution under FP-23.

All NOS metadata must be manually supplied or derived from approved read-only evidence.

## 9. No Config-Change Validation Mode

FP-23 requires a strict no-config-change mode.

Rules:

* No configuration push
* No interface change
* No routing change
* No ACL change
* No management-plane change
* No service restart
* No NOS package install
* No firmware update
* No image upgrade
* No persistent device change
* No production network touch

Required flag:

```text
config_change_allowed: false
```

Any requested validation requiring configuration change must be routed as BLOCKED.

## 10. No Live Device Command Mode

FP-23 prohibits live command execution.

Forbidden command channels:

* SSH
* API
* SNMP
* NETCONF
* gNMI
* Console
* Out-of-band automation
* Ansible
* Nornir
* Salt
* Vendor SDK
* NOS shell
* Linux shell on device

Required flag:

```text
live_device_command_mode: disabled
```

Any validation requiring live command execution must be marked BLOCKED and routed to PM.

## 11. Manual Evidence Capture

All evidence under FP-23 must be manually captured or manually provided.

Manual evidence may include:

* Screenshots
* Redacted command output pasted by an approved human operator
* Lab observation notes
* QA checklist results
* Device inventory sheets
* NOS metadata sheets
* Topology diagrams
* Test result summaries
* Lab approval records

Evidence must be redacted before storage or sharing.

Evidence must not include:

* Secrets
* Tokens
* Cookies
* Private keys
* Raw credentials
* Full serials if restricted
* Production network credentials
* Unredacted management IPs if restricted
* Sensitive customer data

## 12. Class E Lab Approval Linkage

Each validation profile must link to a Class E lab approval decision before it can be accepted.

Required Class E linkage fields:

```text
class_e_approval_id
class_e_approval_owner
class_e_approval_status: PASS / FIX / BLOCKED
class_e_scope
class_e_lab_environment
class_e_safety_notes
class_e_evidence_reference
class_e_approval_timestamp
```

If Class E lab approval is missing, the profile result must be BLOCKED.

Class E approval does not authorize live device commands, config changes, production access, or deployment.

## 13. Lab Result Model

Every Hardware/NOS validation profile must produce one of:

```text
PASS
FIX
BLOCKED
```

### PASS

Use PASS only when:

* Required fields are complete
* Evidence package exists
* Class E approval linkage exists
* No live command requirement exists
* No config-change requirement exists
* No forbidden action occurred
* QA accepts the evidence

### FIX

Use FIX when:

* Evidence exists but is incomplete
* Metadata is inconsistent
* Device/NOS fields need correction
* QA found a non-blocking issue
* Clarification is needed but no safety blocker exists

### BLOCKED

Use BLOCKED when:

* Evidence is missing
* Class E approval is missing
* Live device command is required
* Config change is required
* Production network access is required
* Artifact upload is required but not approved
* DB/storage dependency is unavailable
* Sensitive data is exposed
* Owner or scope is unclear

## 14. Evidence Package Requirements

Each FP-23 evidence package must include:

```text
profile_id
package_id
device_inventory_record
nos_metadata_record
profile_type
profile_mode
class_e_approval_reference
manual_evidence_references
qa_result: PASS / FIX / BLOCKED
qa_owner
qa_notes
blockers
forbidden_actions_confirmation
timestamp
```

Evidence package must confirm:

```text
No live device commands executed.
No SSH/API/SNMP/NETCONF/gNMI execution occurred.
No NOS changes were made.
No configuration push occurred.
No production network access occurred.
No hardware execution occurred.
No artifact upload occurred.
No DB action occurred.
No deployment or restart occurred.
No production readiness claim is made.
```

## 15. Blocker Routing

Blockers must be routed by blocker type.

```text
missing_evidence -> PM / QA
missing_class_e_approval -> PM
live_command_required -> Infra + PM
config_change_required -> Infra + Security + PM
production_network_access_required -> Security + PM
device_inventory_incomplete -> Infra
nos_metadata_incomplete -> Infra
sensitive_data_exposure -> Security
backend_storage_missing -> Backend + Infra
artifact_upload_needed -> Artifact Storage owner + PM
unclear_scope -> PM
```

Every BLOCKED result must include:

```text
blocker_reason
blocker_owner
pm_decision_needed
safe_next_action
```

## 16. Backend / Storage Dependency

Backend/storage dependency needed: YES.

FP-23 requires backend/storage support for:

* Profile metadata
* Device inventory metadata
* SONiC/NOS metadata
* Evidence package references
* Class E approval references
* QA decision records
* Blocker routing records
* Redaction status
* Audit timeline

Until backend/storage is implemented and approved, FP-23 remains a contract-only validation profile model.

No storage write is authorized by this contract.

## 17. Acceptance Criteria

FP-23 is acceptable when:

* Simulated validation profile is defined
* Read-only lab evidence profile is defined
* Device inventory fields are defined
* SONiC/NOS metadata fields are defined
* No-config-change mode is defined
* No-live-device-command mode is defined
* Manual evidence capture is defined
* Class E lab approval linkage is defined
* PASS / FIX / BLOCKED result model is defined
* Evidence package requirements are defined
* Blocker routing is defined
* Backend/storage dependency is identified
* Forbidden actions are not performed

## 18. Forbidden Actions Confirmation

FP-23 confirms:

* No live device commands
* No SSH/API/SNMP/NETCONF/gNMI execution
* No NOS changes
* No config push
* No production network access
* No hardware execution
* No artifact upload
* No DB action
* No migration/reset/seed/db push
* No deployment/restart
* No secrets/env/token/cookie exposure
* No production claim
