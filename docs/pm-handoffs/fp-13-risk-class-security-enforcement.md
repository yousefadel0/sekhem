# SEKHEM — FP-13 Risk-Class Security Enforcement Contract

## Package

`FP-13` — Risk-Class Security Enforcement

## Owner

Tasker 4

## Status

In Progress / Security Gate Contract Artifact

This file is a documentation/security gate contract only.

No backend implementation, runtime security gate activation, scan execution, DB action, migration, reset, seed, db push, deployment, restart, runtime smoke, secret/env/token/cookie output, or production readiness claim is enabled by this file.

## Purpose

Define the risk-class security enforcement model that blocks unsafe or incomplete work before tool execution, AI execution, quality runner execution, evidence approval, or release gate promotion. FP-13 consumes FP-07 Task Contract + Risk Classification, FP-12 Security Policy + Scans, FP-14 Quality Matrix, and FP-16 Evidence Platform outputs.

This contract prepares future enforcement middleware and release gates, but does not activate them.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-07-task-contract-risk-classification.md`
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- `docs/pm-handoffs/fp-14-quality-matrix-test-profiles.md` when present / FP-14 PM Review status
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rule: security gate blocks Class C/D gaps, failed scans, missing evidence, and unauthorized file changes
- PM rule: no production claim before final gate

## Risk Class of This Artifact

```text
Current artifact: docs/security gate contract only
Future backend enforcement: Class C/D depending scope
```

Any future runtime security gate implementation must be separately task-contracted and approved.

## Security Enforcement Principles

1. Risk class must be assigned before execution.
2. Security gate must fail closed when required data is missing.
3. Missing reviewer, missing approval, missing evidence, failed scan, unauthorized route, or missing rollback/dry-run creates `BLOCKED`.
4. Class C/D/E require stricter review and approval checks than Class A/B.
5. PM exceptions are explicit, scoped, time-bounded, evidence-linked, and never override hard forbidden actions.
6. No gate may expose secrets, env values, tokens, cookies, credentials, private keys, raw logs, full headers, or customer data.
7. No production readiness claim is allowed from FP-13 alone.

## 1. Security Gate Input Model

```yaml
security_gate_request:
  gate_request_id: string
  package_id: string
  task_id: string | null
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE | null
  task_contract_ref: string | null
  requested_route: string
  requested_tools: array
  requested_files: array
  command_profile_id: string | null
  evidence_refs: array
  qa_evidence_refs: array
  security_evidence_refs: array
  approval_refs: array
  reviewer_refs: array
  adr_refs: array
  rollback_ref: string | null
  dry_run_ref: string | null
  lab_approval_ref: string | null
  blocker_refs: array
  release_candidate_id: string | null
```

Required minimum fields:

```text
gate_request_id
package_id
risk_class
task_contract_ref
requested_route
evidence_refs
```

If any required minimum field is missing, result is `BLOCKED`.

## 2. Class A Security Rules

Class A covers safe docs, tests, UI text, PM docs, and non-runtime policy artifacts.

Required checks:

```yaml
ClassA:
  task_contract_required: true
  reviewer_required: PM_or_QA_when_board_status_changes
  adr_required: false
  rollback_required: false
  dry_run_required: false
  security_scan_required: false
  evidence_required: true
```

Class A blocks:

- missing task contract;
- file scope violation;
- secret/env/token/cookie output;
- production claim;
- evidence missing;
- docs imply runtime action, DB action, deployment, restart, or live hardware execution.

## 3. Class B Security Rules

Class B covers controlled app/API/UI/report/test work without security/DB/release impact.

Required checks:

```yaml
ClassB:
  task_contract_required: true
  reviewer_required: Tasker4_or_QA
  adr_required: when_architecture_or_interface_changes
  rollback_required: when_runtime_behavior_changes
  dry_run_required: when_command_execution_or_tool_profile_runs
  security_scan_required: when_release_affecting
  evidence_required: true
```

Class B blocks:

- missing reviewer;
- missing required tests;
- unauthorized files/tools;
- route not allowed by task contract;
- missing ADR for architecture/interface changes;
- missing rollback/dry-run when runtime behavior or command execution is involved;
- failed build/test profile;
- missing evidence linkage to FP-16.

## 4. Class C Security Rules

Class C covers security-sensitive work: auth, RBAC, approval, redaction, source connector security, AI request safety, scan policy, secret handling, and audit controls.

Required checks:

```yaml
ClassC:
  task_contract_required: true
  reviewer_required: SecurityReviewer_or_PM
  qa_review_required: when_release_related
  adr_required: when_security_policy_or_boundary_changes
  rollback_required: when_enforcement_or_runtime_policy_changes
  dry_run_required: when_tool_or_scan_execution_is_proposed
  security_scan_required: when_code_or_release_affecting
  evidence_required: true
```

Class C blocks:

- missing SecurityReviewer/PM review;
- missing ADR for security boundary or policy change;
- missing rollback/dry-run for enforcement or scan/tool execution;
- failed secrets/security scan;
- redaction failure;
- unsafe logging of prompt/output body;
- unapproved AI provider activation;
- missing FP-12 security evidence;
- missing FP-16 evidence linkage;
- unresolved blocker.

## 5. Class D Security Rules

Class D covers DB, persistence, migrations, architecture, release logic, workflow runtime persistence, evidence persistence, release package, and gate logic.

Required checks:

```yaml
ClassD:
  task_contract_required: true
  reviewer_required: PM_and_Tasker4
  qa_review_required: true_when_release_related
  adr_required: true_for_architecture_persistence_release_logic
  rollback_required: true_when_runtime_persistence_or_release_logic_changes
  dry_run_required: true_for_validation_or_generation_steps
  security_scan_required: true_when_release_affecting
  evidence_required: true
```

Class D blocks:

- missing PM approval;
- missing ADR for DB/architecture/release logic;
- missing rollback or disable note;
- missing dry-run/validation evidence;
- migration execution without explicit PM approval;
- DB reset/seed/db push/destructive migration;
- failed Prisma validate/build/test where applicable;
- release gate logic without security evidence;
- missing artifact/hash evidence;
- production claim before final gate.

## 6. Class E Security Rules

Class E covers hardware, NOS, lab device, live device, lab validation, and production/customer network-sensitive work.

Required checks:

```yaml
ClassE:
  task_contract_required: true
  reviewer_required: PM_and_QA_and_SecurityReviewer
  lab_approval_required: true_for_live_or_device_touching_work
  adr_required: true_for_lab_architecture_or_execution_model
  rollback_required: true_for_any_possible_state_change
  dry_run_required: true_for_any_execution_profile
  security_scan_required: when_artifacts_or_release_evidence_are_involved
  evidence_required: true
```

Class E blocks:

- missing PM approval;
- missing SecurityReviewer or QA review;
- missing LabOwner/Infra approval for lab/device work;
- missing lab approval for any live device command or hardware execution;
- NOS change/config push/reload/reboot/firmware upgrade without explicit higher gate;
- production network access;
- missing device inventory reference;
- missing lab validation profile;
- missing rollback plan for possible state change;
- raw device output includes secrets, credentials, customer data, or unsafe configs;
- production hardware readiness claim before live-device gates pass.

## 7. Blocking Conditions

### Missing reviewer block

```yaml
block_condition: MISSING_REVIEWER
result: BLOCKED
applies_to: ClassB | ClassC | ClassD | ClassE
required_evidence: reviewer_ref or approval_ref
```

### Missing ADR block

```yaml
block_condition: MISSING_ADR
result: BLOCKED
applies_to: architecture, security boundary, persistence, release logic, lab architecture
required_evidence: adr_ref
```

ADR is required when work changes or defines:

- architecture;
- DB/persistence;
- release gates;
- security boundaries;
- AI provider or redaction boundary;
- lab execution model;
- public API exposure;
- workflow runtime behavior.

### Missing rollback/dry-run block

```yaml
block_condition: MISSING_ROLLBACK_OR_DRY_RUN
result: BLOCKED
required_evidence: rollback_ref or dry_run_ref
```

Rollback/dry-run required for:

- runtime behavior change;
- DB/persistence work;
- release artifact generation;
- tool/profile execution;
- security scan execution;
- AI provider activation;
- lab/device execution;
- deployment/restart proposals.

### Missing lab approval block for Class E

```yaml
block_condition: MISSING_LAB_APPROVAL
result: BLOCKED
applies_to: ClassE
required_evidence: lab_approval_ref
```

Class E live/device-touching work cannot proceed without lab approval.

### Failed scan block

```yaml
block_condition: FAILED_SCAN
result: BLOCKED
applies_to: ClassC | ClassD | release_related_ClassB | release_related_ClassE
required_evidence: FP-12 security scan evidence
```

Blocks include:

- failed secrets scan;
- verified/high-confidence secret;
- critical/high dependency finding without exception;
- missing SBOM/license evidence for release;
- failed source connector security check;
- failed AI request/prompt/output safety check.

### Unauthorized route block

```yaml
block_condition: UNAUTHORIZED_ROUTE
result: BLOCKED
```

Unauthorized routes include:

```text
R&D Radar -> coding tool/model -> code
AI -> direct file apply
AI -> deployment/restart
runtime -> GitHub write without PM approval
source connector -> automatic import without review
quality runner -> arbitrary command
lab workflow -> live device execution without lab approval
```

### Missing evidence block

```yaml
block_condition: MISSING_EVIDENCE
result: BLOCKED
required_evidence: FP-16-compatible evidence
```

Missing evidence blocks:

- task contract evidence;
- risk classification evidence;
- source allowlist evidence when sources are used;
- workflow callback evidence for orchestrated work;
- QA/test evidence;
- security scan evidence;
- lab/manual evidence;
- approval evidence;
- blocker evidence;
- release package evidence/hash.

## 8. PM Exception Handling

PM exceptions are allowed only for non-hard-forbidden conditions and must be explicit, scoped, and evidence-linked.

```yaml
pm_exception:
  exception_id: string
  package_id: string
  task_id: string | null
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE
  exception_type: reviewer_exception | test_exception | scan_exception | license_exception | timing_exception | evidence_exception
  approved_by: PM
  approved_at: string
  scope: string
  expiry: string
  reason: string
  compensating_controls: array
  evidence_refs: array
  cannot_override_hard_forbidden_actions: true
```

PM exception cannot override:

- destructive migration;
- DB reset;
- secret/token/cookie/credential printing;
- unauthorized production DB write;
- unapproved deployment/restart;
- public API exposure without approval;
- real AI provider activation without approval;
- GitHub write from product runtime without approval;
- live hardware execution without Class E approval;
- production readiness claim before final gate.

Expired or out-of-scope PM exception is invalid and results in `BLOCKED`.

## 9. Fail-Closed Policy

The security gate must fail closed.

Fail-closed triggers:

```text
risk_class_missing
risk_class_unknown
task_contract_missing
required_field_missing
reviewer_missing
adr_required_but_missing
rollback_required_but_missing
dry_run_required_but_missing
lab_approval_required_but_missing
security_scan_required_but_missing
security_scan_failed
source_allowlist_missing
unauthorized_route
unknown_tool
file_scope_violation
blocked_file_requested
missing_evidence
unsafe_content_detected
approval_missing_or_expired
pm_exception_invalid
```

Fail-closed response:

```yaml
security_gate_response:
  accepted: false
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  command_executed: false
  runtime_activated: false
```

If the gate cannot determine safety, it must return `BLOCKED`.

## 10. Enforcement Result Model

Allowed final results:

```text
PASS
FIX
BLOCKED
```

| Result | Meaning | Execution effect |
| --- | --- | --- |
| PASS | Required security checks satisfied | May proceed to next gate if other gates pass |
| FIX | Non-unsafe correction required | Cannot release; may return to owner for correction |
| BLOCKED | Unsafe, unapproved, missing evidence/reviewer/approval, or hard stop | Must not proceed |

## 11. Blocker Model

```yaml
risk_security_blocker:
  blocker_id: string
  package_id: FP-13
  task_id: string | null
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE | null
  owner: Tasker4
  blocking_owner: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | LabOwner | Infra | Legal
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, raw headers, raw HTML, customer data, or unsafe device output.

## 12. Evidence Mapping to FP-16

Every FP-13 decision must create or link FP-16 evidence.

```yaml
risk_security_enforcement_evidence:
  evidence_id: string
  package_id: FP-13
  task_id: string | null
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE | null
  gate_request_id: string
  gate_result: PASS | FIX | BLOCKED
  rule_results: array
  blocker_id: string | null
  pm_exception_ref: string | null
  reviewer_refs: array
  adr_refs: array
  rollback_ref: string | null
  dry_run_ref: string | null
  lab_approval_ref: string | null
  qa_evidence_refs: array
  security_evidence_refs: array
  sanitized_summary: string
  created_at: string
```

Release gate cannot accept FP-13 result unless evidence status is reviewed and immutable under FP-16 rules.

## 13. Backend Dependency

Backend implementation is required for production enforcement but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Production enforcement requires runtime validation of risk class, task contract, reviewers, ADRs, rollback/dry-run evidence, lab approvals, scan evidence, route authorization, PM exceptions, blockers, and FP-16 evidence linkage before tool execution or release promotion.
```

Future implementation must include:

- gate API contract;
- rule engine;
- risk-class policy registry;
- evidence reader/writer integration;
- blocker router;
- PM exception validator;
- fail-closed tests;
- tests per Class A/B/C/D/E;
- no runtime activation until PM approval.

## 14. Acceptance Criteria

FP-13 security enforcement contract is acceptable when it defines:

- security gate rules per risk class;
- Class A-E enforcement rules;
- missing reviewer block;
- missing ADR block;
- missing rollback/dry-run block;
- missing lab approval block for Class E;
- failed scan block;
- unauthorized route block;
- missing evidence block;
- PM exception handling;
- fail-closed policy;
- blocker model;
- FP-16 evidence mapping;
- backend dependency;
- forbidden action confirmation.

## 15. Forbidden Actions Check

```yaml
backend_implementation: NO
runtime_security_gate_activation: NO
scan_execution: NO
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
Notes/Evidence: FP-13 Risk-Class Security Enforcement contract created at docs/pm-handoffs/fp-13-risk-class-security-enforcement.md. Covers security gate rules per risk class, Class A-E rules, missing reviewer block, missing ADR block, missing rollback/dry-run block, missing lab approval block for Class E, failed scan block, unauthorized route block, missing evidence block, PM exception handling, fail-closed policy, blocker model, FP-16 evidence mapping, and backend dependency. Docs/security gate contract only. No backend implementation. No runtime security gate activation. No scan execution. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No secrets/env/token/cookie output. No production claim.
```
