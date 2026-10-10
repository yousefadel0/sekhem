# FP-30A — Release Approval Record Template

Package ID: FP-30A
Owner: PM
Gate: PM Release Approval
Status: BLOCKED until completed by PM

## Approval Record

```text
release_candidate_id:
package_id: FP-30A / FP-30
approver:
approval_decision: PASS / FIX / BLOCKED
approval_timestamp:
evidence_bundle_reference: docs/pm-handoffs/fp-30a-final-release-evidence/
hash_manifest_reference: docs/pm-handoffs/fp-30a-final-release-evidence/sha256sums.txt
qa_uat_gate_reference: docs/pm-handoffs/fp-30a-final-release-evidence/qa-uat-gate-record.md
security_gate_reference: docs/pm-handoffs/fp-30a-final-release-evidence/security-gate-record.md
backup_restore_reference: docs/pm-handoffs/fp-30a-final-release-evidence/backup-restore-evidence-record.md
rollback_reference: docs/pm-handoffs/fp-30a-final-release-evidence/rollback-reference.md
no_auto_deploy_acknowledgement: YES / NO
production_readiness_claim_made: NO
notes:
```

## Mandatory Acknowledgement

```text
No deployment is authorized by this approval record.
No production readiness is claimed by this approval record alone.
Final deployment requires a separate explicit PM production go/no-go decision.
```

## Gate Fields

```text
gate_id: FP-30A-PM-APPROVAL
gate_name: PM Release Approval Gate
decision: BLOCKED
owner: PM
evidence_reference: This template must be completed by PM.
notes: Approval is not complete until PM fills this record and resolves BLOCKED evidence.
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
