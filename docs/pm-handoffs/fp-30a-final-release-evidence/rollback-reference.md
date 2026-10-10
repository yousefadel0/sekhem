# FP-30A — Rollback Reference

Package ID: FP-30A
Owner: Infra / PM
Gate: Rollback Reference
Status: PASS / Template Evidence

## Rollback Reference

Rollback execution is not authorized by this package.

Rollback requires a separate PM-approved task with:

```text
rollback_request_id
rollback_scope
rollback_owner
previous_known_good_reference
restore_or_rollback_plan_reference
impact_assessment
validation_evidence_reference
pm_approval_decision: PASS / FIX / BLOCKED
pm_approval_timestamp
```

## Referenced Rollback Docs

- `docs/pm-handoffs/fp-19-release-notes-rollback.md`
- `docs/pm-handoffs/fp-18-release-factory-core.md`
- `docs/pm-handoffs/fp-25-backup-restore-monitoring.md`

## Required Rollback Wording

```text
Rollback reference does not execute rollback.
Rollback execution requires explicit PM approval in a separate task.
No deployment, restore, restart, DB action, or destructive operation is authorized by this rollback reference.
```

## Gate Fields

```text
gate_id: FP-30A-ROLLBACK
gate_name: Rollback Reference Gate
decision: PASS
owner: Infra / PM
evidence_reference: docs/pm-handoffs/fp-19-release-notes-rollback.md
notes: Rollback reference exists as template/control. Rollback execution remains blocked without separate PM approval.
timestamp: 2026-06-12
```

Forbidden actions confirmation:

- No deployment.
- No automatic deployment.
- No DB action.
- No migration/reset/seed/db push.
- No service restart.
- No secrets printed.
- No token handling.
- No public exposure.
- No production readiness claim.
- No GitHub write from product runtime.
