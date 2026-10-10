# SEKHEM — FP-19 Release Notes + Rollback Contract

## Package

`FP-19` — Release Notes + Rollback

## Owner

Tasker 5

## Status

In Progress / Contract + Template Artifact

This file is a documentation/template artifact only.

No release execution, deployment, rollback execution, runtime command, DB action, migration, reset, seed, or `db push` is enabled by this file.

## Purpose

Define the release notes and rollback contract for SEKHEM release governance.

The contract provides a reusable template for release communication, evidence summary, QA/security status, known blockers/exceptions, rollback planning, rollback triggers, PM approval, and no-production-claim language.

## Scope

Allowed scope:

- release notes template;
- changed packages summary template;
- evidence summary template;
- security and QA status summary;
- known blocker/exception section;
- rollback plan template;
- rollback trigger conditions;
- PM approval checklist;
- no-production-claim language.

Out of scope:

- release execution;
- deployment;
- rollback execution;
- runtime command;
- DB action;
- migration/reset/seed/`db push`;
- secret/env/token/cookie handling;
- production claim.

## Release Notes Template

```markdown
# SEKHEM Release Notes — <Release Candidate / Version>

## Release Identity

- Release ID:
- Release candidate / version:
- Date prepared:
- Prepared by:
- Target environment: staging / production-candidate / production
- PM approval status: pending / approved / rejected
- Release package reference:
- Artifact SHA256 reference:

## Release Purpose

<Customer-safe summary of what this release is intended to validate or deliver.>

## Changed Packages Summary

| Package / Track | Owner | Status | Summary of Change | Evidence Ref |
| --- | --- | --- | --- | --- |
| FP-__ | <Owner> | PASS / FIX / BLOCKED / PM Review | <Summary> | <Evidence ref> |

## Product Areas Affected

- Runtime + Workflow:
- R&D Sources:
- AI Execution Core:
- Quality + Security:
- Evidence + Release:
- UI/UX:
- Hardware/NOS Lab Path:
- Deployment + UAT:

## Evidence Summary

| Evidence Type | Required | Status | Reference |
| --- | --- | --- | --- |
| Task Contract | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Risk Class | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Changed Files | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Diff Summary | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Tests / Quality Runner | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Security Gate | YES / NO | PASS / FIX / BLOCKED | <ref> |
| Reviewer Notes | YES / NO | PASS / FIX / BLOCKED | <ref> |
| PM Approval | YES | pending / approved / rejected | <ref> |
| Blockers / Exceptions | YES / NO | open / closed / accepted exception | <ref> |
| Rollback Plan | YES | PASS / FIX / BLOCKED | <ref> |

## Security / QA Status Summary

- Security Gate status:
- Secrets scan status:
- Dependency/license status:
- Risk-class enforcement status:
- QA test status:
- UAT status:
- Open security risks:
- Open QA risks:

## Known Blockers / Exceptions

| ID | Type | Owner | Severity | Status | Customer-safe summary | PM decision needed |
| --- | --- | --- | --- | --- | --- | --- |
| <BLOCKER-ID> | blocker / exception | <Owner> | low / medium / high / critical | open / closed / accepted | <Summary> | <Decision> |

## Human Approval Checklist

- [ ] Required evidence attached.
- [ ] Security/QA status reviewed.
- [ ] Known blockers reviewed.
- [ ] Exceptions explicitly accepted or rejected by PM.
- [ ] Rollback plan reviewed.
- [ ] No production claim before final gate.
- [ ] PM release approval recorded.

## No-Production-Claim Statement

This release note does not claim production readiness unless the final production gate has passed and PM has explicitly approved production cutover.

Until final PM approval, this release remains a staging / release-candidate artifact only.
```

## Changed Packages Summary Requirements

The changed packages summary must include:

```yaml
package_id: string
track_name: string
owner: string
status: PASS | FIX | BLOCKED | PM Review | Done
summary_of_change: string
evidence_ref: string
risk_class: Class A | Class B | Class C | Class D | Class E | null
qa_status: PASS | FIX | BLOCKED | NOT_REQUIRED
security_status: PASS | FIX | BLOCKED | NOT_REQUIRED
blockers_open: integer
exceptions_open: integer
```

Rules:

- Every changed package must have an owner.
- Every changed package must have evidence.
- Any `BLOCKED` package must include blocker reason, owner, and next action.
- `Done / PM Review` is not a production claim.
- PM approval is required before release/cutover.

## Evidence Summary Requirements

A release note must not be accepted without evidence.

Minimum evidence set:

- task contract or package contract;
- risk class or risk-class-not-required reason;
- changed files or no-code/no-change statement;
- diff summary or docs-only statement;
- test/quality evidence or test-not-required reason;
- security gate result where required;
- reviewer notes;
- PM approval reference;
- blocker/exception references;
- rollback plan reference;
- artifact SHA256 where a release artifact exists.

If evidence is missing, release status must be:

```text
BLOCKED_MISSING_EVIDENCE
```

## Security / QA Status Summary Requirements

Security and QA summary must include:

```yaml
security_gate_status: PASS | FIX | BLOCKED | NOT_REQUIRED
qa_status: PASS | FIX | BLOCKED | NOT_REQUIRED
secrets_scan_status: PASS | FIX | BLOCKED | NOT_REQUIRED
dependency_license_status: PASS | FIX | BLOCKED | NOT_REQUIRED
risk_enforcement_status: PASS | FIX | BLOCKED | NOT_REQUIRED
uat_status: PASS | FIX | BLOCKED | NOT_STARTED
open_security_risks: array
open_qa_risks: array
evidence_refs: array
```

Rules:

- Security/QA status must not be inferred without evidence.
- Reviewer notes do not override failed gates.
- PM may accept an exception only with explicit PM decision evidence.
- Failed security or QA gate blocks production cutover unless PM explicitly accepts the exception and policy permits it.

## Known Blockers / Exceptions Section

The release note must include a known blockers/exceptions table even when no blockers exist.

If no blockers exist, record:

```text
No known open blockers at time of release note preparation.
```

Blocker fields:

```yaml
blocker_id: string
blocker_type: blocker | exception
owner: string
blocking_owner: string | null
severity: low | medium | high | critical
status: open | closed | accepted_exception | rejected_exception
customer_safe_summary: string
pm_decision_needed: string | null
evidence_refs: array
```

Blocker/exception text must be sanitized and must not include secrets, raw logs, stack traces, tokens, cookies, env values, connection strings, private keys, raw provider output, or internal unsafe details.

## Rollback Plan Template

```markdown
# SEKHEM Rollback Plan — <Release Candidate / Version>

## Rollback Identity

- Rollback plan ID:
- Related release ID:
- Prepared by:
- Reviewed by:
- PM approval status:
- Target environment:

## Rollback Objective

<Customer-safe summary of what rollback restores or disables.>

## Rollback Scope

| Component | Change introduced | Rollback action | Owner | Evidence Ref |
| --- | --- | --- | --- | --- |
| <component> | <change> | <rollback/disable action> | <owner> | <ref> |

## Rollback Preconditions

- [ ] PM rollback approval recorded.
- [ ] Rollback owner assigned.
- [ ] Backup/restore evidence reviewed where applicable.
- [ ] DB impact reviewed by Tasker 4 where applicable.
- [ ] Deployment/runtime impact reviewed by Infra where applicable.
- [ ] Customer-safe status note prepared.

## Rollback Steps

> Fill only after rollback is explicitly approved. This template does not execute rollback.

1. Step:
   - Owner:
   - Evidence:
   - Validation:
2. Step:
   - Owner:
   - Evidence:
   - Validation:

## Rollback Validation

- Health check evidence:
- QA smoke evidence:
- Security evidence:
- Data integrity evidence:
- Customer-visible status:

## Rollback Completion Criteria

- [ ] PM confirms rollback complete.
- [ ] QA validates expected state.
- [ ] Security validates no new exposure.
- [ ] Evidence attached.
- [ ] Board updated.
```

## Rollback Trigger Conditions

Rollback planning must be activated when any of the following occur:

- production/staging release gate fails after release candidate assembly;
- critical security finding;
- secrets exposure;
- unauthorized public exposure;
- failed deployment validation;
- data integrity risk;
- DB migration/write issue;
- failed UAT blocker;
- release package missing required evidence;
- artifact SHA mismatch;
- rollback requested by PM;
- customer-impacting failure after approved release;
- unapproved production claim or cutover attempt.

Rollback trigger does not mean rollback may execute automatically.

Rollback execution requires explicit PM approval and the correct owner gate.

## PM Approval Requirement

PM approval is required before:

- final release acceptance;
- production cutover;
- deployment;
- rollback execution;
- exception acceptance;
- production-readiness claim;
- customer-facing production announcement.

Approval record must include:

```yaml
approval_id: string
approved_by: PM
approval_type: release | rollback | exception | production_cutover
scope: string
evidence_refs: array
approved_at: string
conditions: array
```

If PM approval is missing, release state must be:

```text
PM_APPROVAL_REQUIRED
```

## No-Production-Claim Language

Required wording for release notes before final production gate:

```text
This artifact is a release-candidate / staging-readiness document only. It does not claim SEKHEM is production-ready. Production readiness may be claimed only after all required gates pass and PM explicitly approves production cutover.
```

Required wording when blockers remain:

```text
This release candidate has unresolved blocker(s) or exception(s). It must not be presented as production-ready until blockers are resolved or explicitly accepted by PM under the approved exception policy.
```

Required wording for rollback templates:

```text
This rollback plan is a planning artifact only. It does not execute rollback and does not authorize runtime changes. Rollback execution requires explicit PM approval and owner validation.
```

## Stop Conditions

Return `BLOCKED` if release note or rollback preparation requires:

- release execution;
- deployment;
- rollback execution;
- runtime command;
- DB action;
- migration/reset/seed/`db push`;
- secrets/env/token/cookie handling;
- production claim before final gate;
- missing evidence for release acceptance;
- missing PM approval for cutover/rollback/exception.

## Acceptance Criteria

FP-19 is complete when:

- release notes template is created;
- changed packages summary is defined;
- evidence summary is defined;
- security/QA status summary is defined;
- known blocker/exception section is defined;
- rollback plan template is created;
- rollback trigger conditions are defined;
- PM approval requirement is defined;
- no-production-claim wording is defined;
- forbidden actions check confirms no unsafe action occurred;
- board row has Notes / Evidence.

## Forbidden Actions Check

Confirmed by this document:

- no release execution;
- no deployment;
- no rollback execution;
- no runtime command;
- no DB action;
- no migration/reset/seed/`db push`;
- no secrets/env/token/cookie handling;
- no production claim.
