# FP-21 — Hardware/NOS Lab Architecture

Package ID: FP-21  
Owner: Infra  
Status: Architecture Draft / PM Review  
Scope: Design and lab model only  
Live execution: Not included

## 1. Purpose

This document defines the Hardware/NOS Lab Architecture for SEKHEM production readiness.

The goal is to create a safe architecture model for future hardware and Network Operating System validation without touching live devices, production networks, or customer infrastructure.

FP-21 is architecture-only. It defines how a lab should be structured, how devices should be inventoried, how access should be isolated, and what approval gates are required before any future live-device validation.

## 2. Scope

### In Scope

- Lab topology design.
- Device inventory model.
- Isolation model.
- Access model.
- Runner tools.
- Safety constraints.
- Read-only validation profile concept.
- Evidence workflow requirements.
- Future live-device approval requirements.

### Out of Scope

- No live device commands.
- No NOS configuration changes.
- No config push.
- No production network access.
- No hardware execution.
- No deployment or restart.
- No secret, token, credential, cookie, or environment value exposure.
- No automated remediation.
- No live test execution.

## 3. Lab Topology

The lab must be separated from production and customer environments.

### Recommended Logical Zones

1. Management Zone
   - Used only for controlled access to lab devices.
   - Contains jump host, runner host, and evidence collector.
   - No direct route to production networks.

2. Device Under Test Zone
   - Contains switches, routers, white-box devices, virtual NOS nodes, or lab appliances.
   - Devices are treated as isolated test assets.
   - No production uplink.

3. Traffic Generation Zone
   - Optional zone for future synthetic traffic generators.
   - Must not route to production or public customer systems.
   - Used only after separate PM approval.

4. Evidence Zone
   - Stores command outputs, validation logs, screenshots if approved, checksums, and run metadata.
   - Must not store credentials, secrets, raw tokens, or private key material.

5. Quarantine Zone
   - Optional area for unknown, newly received, or untrusted hardware.
   - Device must remain isolated until asset identity, firmware baseline, and management access policy are confirmed.

### Topology Principle

Lab devices may be observed and validated only through approved lab paths. No lab path may bridge into production, staging runtime, customer infrastructure, or unmanaged public access.

## 4. Device Inventory Model

Every lab asset must have a structured inventory record before any validation.

### Required Inventory Fields

- `device_id`
- `asset_tag`
- `device_type`
- `vendor`
- `model`
- `serial_number`
- `nos_name`
- `nos_version`
- `firmware_version`
- `management_ip_or_lab_alias`
- `management_zone`
- `rack_location`
- `power_source`
- `console_access_method`
- `owner`
- `approval_status`
- `allowed_validation_profile`
- `last_known_state`
- `last_validation_run_id`
- `evidence_location`
- `notes`

### Device Status Values

- `planned`
- `received`
- `quarantined`
- `lab_ready`
- `read_only_validation_allowed`
- `write_validation_requires_approval`
- `retired`
- `blocked`

### Inventory Rules

- No device may be validated without an inventory record.
- No device may be connected to production network paths.
- No device may receive configuration changes unless a future explicit PM approval exists.
- Device credentials must never be stored in plain text, screenshots, logs, prompts, or docs.
- If device identity is unknown, status must remain `quarantined`.

## 5. Isolation Model

The lab must use hard isolation boundaries.

### Required Isolation Controls

1. Network Isolation
   - Separate VLANs or physical isolation from production.
   - No routing to production subnets.
   - No shared production management network.

2. Credential Isolation
   - Lab credentials must be separate from production credentials.
   - No production passwords, tokens, keys, or cookies may be used in lab.
   - Secrets must be held only in approved secure stores.

3. Execution Isolation
   - Runner tools must operate from a controlled runner host.
   - No direct laptop-to-device automation unless approved.
   - No automation path may execute write commands by default.

4. Evidence Isolation
   - Evidence must be sanitized before sharing.
   - Outputs must remove serial-sensitive data if required by policy.
   - No secrets or full configs may be pasted into docs or tickets.

5. Failure Isolation
   - Lab failure must not affect production services.
   - No shared restart, deployment, or runtime dependency with production.

## 6. Access Model

### Access Roles

1. Infra Operator
   - May run approved read-only lab validation.
   - May collect sanitized evidence.
   - May not push config or change NOS state without approval.

2. Network/NOS Engineer
   - May design validation profiles.
   - May review device state and expected behavior.
   - May not execute live changes without approval.

3. Security Reviewer
   - Reviews isolation, credential handling, and evidence safety.
   - Can block validation if secrets or production exposure risk exists.

4. PM
   - Approves live-device validation.
   - Approves any move from read-only validation to write or config-change validation.

5. QA
   - Reviews evidence and marks PASS / FIX / BLOCKED.

### Access Rules

- Default access mode is read-only.
- Write access is denied unless separately approved.
- Production device access is forbidden under FP-21.
- Shared accounts should be avoided.
- Operator identity must be recorded in evidence metadata.
- Any command set must be reviewed before execution.

## 7. Runner Tools

The lab runner model may include architecture-level tooling only:

- SSH client or jump host shell.
- Read-only command runner.
- Device inventory parser.
- Evidence collector.
- Log sanitizer.
- Diff viewer for approved outputs.
- Checksum generator.
- Static topology diagram generator.
- Read-only NOS state parser.
- Optional future Ansible, Nornir, pyATS, or Robot runner in read-only mode only.

### Runner Requirements

- Runner must support dry-run or read-only profile mode.
- Runner must log package ID, operator, device ID, command profile ID, timestamp, output location, and safety mode.
- Runner must fail closed if the command profile includes write verbs.
- Runner must not store credentials in logs.
- Runner must not automatically remediate issues.
- Runner must not connect to production networks.

## 8. Safety Constraints

Mandatory constraints for FP-21 and future lab work:

- No live device commands under FP-21.
- No NOS changes.
- No config push.
- No production network access.
- No hardware execution.
- No deployment.
- No restart.
- No secrets, environment values, tokens, cookies, private keys, or credentials printed.
- No automatic remediation.
- No write-mode runner profile by default.
- No production readiness claim based on lab architecture alone.
- No customer-facing hardware validation claim until future live-device gates pass.

## 9. Read-Only Validation Profile Concept

A read-only validation profile defines a controlled set of allowed checks that inspect state without changing state.

### Profile Fields

- `profile_id`
- `profile_name`
- `package_id`
- `device_scope`
- `allowed_commands`
- `blocked_commands`
- `expected_outputs`
- `sanitization_rules`
- `evidence_required`
- `approval_required`
- `owner`
- `reviewer`
- `expiry_date`

### Allowed Command Categories for Future Approval

These are examples for future review only and are not executable under FP-21:

- Show device identity.
- Show NOS version.
- Show interface status.
- Show LLDP/CDP neighbors.
- Show routing summary.
- Show BGP/EVPN summary.
- Show system health.
- Show logs with sanitization.
- Show time or uptime.
- Show hardware inventory.

### Blocked Command Categories

- Configure terminal.
- Commit.
- Write memory.
- Copy running-config startup-config.
- Reload.
- Reboot.
- Install image.
- Upgrade firmware.
- Delete files.
- Change interface state.
- Change routing state.
- Change credentials.
- Start packet capture on production paths.
- Push templates.
- Any command that modifies runtime state.

### Fail-Closed Rule

If a command is not explicitly listed as allowed in the approved read-only profile, it is blocked.

## 10. Evidence Workflow Requirements

Every future lab validation must produce a structured evidence package.

### Required Evidence

- Package ID.
- Device ID.
- Operator identity.
- Date and time.
- Approved validation profile ID.
- Command profile version.
- Sanitized output.
- PASS / FIX / BLOCKED result.
- Blocker reason if blocked.
- Safety statement.
- Confirmation that no write commands were run.
- Confirmation that no secrets were printed.
- Final device state statement.
- Reviewer notes.

### Evidence Storage Requirements

- Evidence must be stored in an approved project path or artifact store.
- Evidence must be immutable after QA review.
- Evidence must have a checksum when packaged for release review.
- Evidence must not include secrets or raw credentials.
- Evidence must be linked from the Google Sheet row as Notes/Evidence.

## 11. Rollback Requirements

Because FP-21 is architecture-only and includes no live execution, no technical rollback is required for this package.

For future live lab validation, rollback requirements must be defined before any execution.

### Future Rollback Requirements

- Pre-validation device state capture.
- Clear stop condition.
- Approved rollback owner.
- Approved rollback command set.
- Rollback evidence collection.
- PM approval before any state-changing rollback.
- No automatic rollback unless explicitly approved.

### Read-Only Rollback Principle

Read-only validation should not require rollback because it must not change device state. If rollback is needed after a supposedly read-only run, the profile must be treated as failed and blocked.

## 12. Future Live-Device Approval Requirements

Any future move from architecture to live-device validation requires separate PM approval.

### Required Approval Before Live Lab Execution

- Package ID for the live validation task.
- Device inventory reviewed.
- Device status set to `read_only_validation_allowed`.
- Topology isolation confirmed.
- Access path approved.
- Read-only validation profile approved.
- Command list reviewed.
- Evidence path approved.
- Secrets handling reviewed.
- Rollback plan reviewed if any command could affect state.
- Security reviewer approval.
- QA acceptance criteria defined.
- PM go/no-go recorded.

### Required Approval Before Write or Config Validation

Write or config validation requires a higher gate:

- PM explicit approval.
- Security approval.
- Network/NOS engineer approval.
- Rollback plan.
- Console recovery path.
- Maintenance window if applicable.
- Device backup if applicable.
- No production impact statement.
- Clear success/failure criteria.

## 13. QA Checklist

QA must review FP-21 using PASS / FIX / BLOCKED.

### PASS Criteria

- Lab topology defined.
- Device inventory model defined.
- Isolation model defined.
- Access model defined.
- Runner tools defined.
- Safety constraints defined.
- Read-only validation profile concept defined.
- Evidence workflow defined.
- Future live-device approval requirements defined.
- No live execution included.
- No forbidden action included.

### FIX Criteria

- Any required section is incomplete.
- Evidence workflow lacks owner or artifact path.
- Read-only profile is ambiguous.
- Approval requirements are unclear.

### BLOCKED Criteria

- Any live execution is included.
- Any production network access is included.
- Any command suggests NOS or config change.
- Any credential or secret handling is unsafe.
- Any automatic deployment, restart, or remediation is implied.

## 14. Final FP-21 Position

FP-21 establishes a safe design foundation for future Hardware/NOS lab validation.

It does not validate any live device.
It does not change any NOS.
It does not access production networks.
It does not approve live hardware execution.
It only defines the architecture and approval model required before future live validation can be considered.
