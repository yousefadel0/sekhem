# FP-18 — Release Factory Core Contract

Package ID: FP-18
Owner: Infra
Status: In Progress / PM Review
Goal: Release Factory Core
Document Path: `docs/pm-handoffs/fp-18-release-factory-core.md`

## 1. Purpose

This contract defines the Release Factory Core for SEKHEM Production Runtime Release.

The Release Factory is responsible for defining how a release package is assembled, verified, evidenced, approved, stored, and referenced for rollback.

This is a contract and design document only. It does not implement artifact upload, deployment, release execution, database writes, or file storage writes.

## 2. Scope

FP-18 covers:

* Artifact storage model
* SHA256 and hash requirements
* Release package structure
* Evidence bundle requirements
* Required gate checklist
* Missing evidence blocker rule
* No-auto-deploy rule
* Rollback package reference
* Release approval record
* Storage/backend dependency

## 3. Non-Scope

FP-18 does not include:

* Artifact upload implementation
* Deployment execution
* Release execution
* Production cutover
* Database action
* Migration, reset, seed, or db push
* File storage write
* Runtime validation
* Public trigger
* Schedule activation
* Secrets, env, token, cookie, or credential exposure
* Production readiness claim

## 4. Artifact Storage Model

The Release Factory must use a controlled artifact storage model.

A release artifact is any file or bundle generated for review, QA, approval, rollback, deployment preparation, or release packaging.

Each artifact must have:

* Stable artifact ID
* Package ID
* Release candidate ID
* Artifact type
* File name
* Storage target reference
* SHA256 hash
* Size in bytes
* Creation timestamp
* Created-by owner
* Evidence source reference
* Approval status
* Retention classification

Artifact storage must be treated as a controlled backend dependency. Until storage is implemented and approved, release package records must remain contract-only or metadata-only.

No artifact may be uploaded to uncontrolled storage.

No artifact may include secrets, env files, tokens, cookies, raw credentials, private keys, unredacted logs, or database dumps.

## 5. SHA256 / Hash Requirements

Every release package and every included artifact must have a SHA256 hash.

Required hash rules:

* Each file must have its own SHA256 hash.
* The full release package bundle must have a package-level SHA256 hash.
* Hashes must be calculated after final package assembly.
* Any change to package content invalidates the previous hash.
* Hashes must be recorded in the release manifest.
* Hashes must be part of the approval evidence.
* Hash mismatch is a blocking release issue.
* Missing hash is a blocking release issue.

The release manifest must include:

```text
artifact_id
artifact_path
artifact_type
sha256
size_bytes
created_at
source_task_or_package
approval_state
```

## 6. Release Package Structure

Each release package must follow this structure:

```text
release-package/
  manifest.json
  release-summary.md
  gate-checklist.md
  approval-record.md
  rollback-reference.md
  evidence/
    test-results/
    qa-reports/
    security-reports/
    runtime-readiness/
    screenshots-or-logs-redacted/
  artifacts/
    backend/
    frontend/
    docs/
    infra/
  hashes/
    sha256sums.txt
```

Required files:

* `manifest.json`
* `release-summary.md`
* `gate-checklist.md`
* `approval-record.md`
* `rollback-reference.md`
* `hashes/sha256sums.txt`

The package must not include:

* `.env`
* credentials
* tokens
* cookies
* private keys
* raw database dumps
* unredacted logs
* local developer-only files
* uncontrolled generated files
* node_modules
* build cache directories

## 7. Evidence Bundle Requirements

A release package is not valid unless it includes an evidence bundle.

The evidence bundle must include:

* Package ID
* Related PROD / FP task IDs
* QA decision per item: PASS / FIX / BLOCKED
* Test evidence
* Security evidence
* Runtime readiness evidence where applicable
* Storage readiness evidence where applicable
* Rollback readiness evidence
* Gate checklist evidence
* Approval evidence
* Known risks
* Open blockers
* Explicit forbidden-actions statement

Evidence must be redacted.

Evidence must not expose:

* Secrets
* Env values
* Tokens
* Cookies
* Credentials
* Private URLs if restricted
* Raw stack traces containing sensitive internals
* Raw logs containing secrets
* Database connection strings

## 8. Required Gate Checklist

A release package cannot proceed unless the required gates are evaluated.

Minimum required gates:

* Scope gate
* QA gate
* Security gate
* Evidence gate
* Artifact integrity gate
* Rollback readiness gate
* Storage/backend dependency gate
* PM approval gate
* No-auto-deploy confirmation gate

Each gate must have:

```text
gate_id
gate_name
decision: PASS / FIX / BLOCKED
owner
evidence_reference
notes
timestamp
```

Any gate marked FIX or BLOCKED prevents release approval.

A missing gate decision is treated as BLOCKED.

## 9. Missing Evidence Blocker

Missing evidence is a hard blocker.

The Release Factory must block release approval if any required evidence is missing.

Missing evidence examples:

* No test result
* No QA decision
* No security decision
* No hash manifest
* No rollback reference
* No approval record
* No evidence bundle
* No storage dependency decision
* No PM approval
* Unclear owner
* Unclear task/package ID
* Unredacted sensitive evidence

Rule:

```text
If required evidence is missing, release status must be BLOCKED.
```

No release package may be marked approved based on verbal confirmation only.

## 10. No-Auto-Deploy Rule

The Release Factory must never auto-deploy.

Release package creation does not mean deployment approval.

Release approval does not mean automatic deployment.

Deployment requires a separate PM go/no-go decision.

Forbidden:

* No automatic deployment
* No automatic production cutover
* No public trigger
* No scheduled release execution
* No background release job
* No deployment from artifact creation
* No deployment from approval record creation

Required wording in every release package:

```text
This release package is for review and approval only. It does not deploy, trigger deployment, or claim production readiness.
```

## 11. Rollback Package Reference

Every release package must reference a rollback package or rollback plan.

Rollback reference must include:

* Rollback package ID or rollback plan path
* Previous known-good release reference
* Restore procedure reference
* Owner
* Validation checklist
* Known limitations
* PM decision required before rollback execution

Rollback package reference must not execute rollback.

Rollback execution is out of scope for FP-18.

If rollback reference is missing, the release package must be BLOCKED.

## 12. Release Approval Record

A release approval record is required before any release package can be accepted.

Approval record must include:

```text
release_candidate_id
package_id
approver
approval_decision: PASS / FIX / BLOCKED
approval_timestamp
evidence_bundle_reference
hash_manifest_reference
rollback_reference
no_auto_deploy_acknowledgement
notes
```

Approval record does not execute deployment.

Approval record must explicitly confirm:

```text
No deployment is authorized by this approval record.
```

## 13. Storage / Backend Dependency

The Release Factory depends on approved artifact storage and backend metadata support.

Backend/storage dependency needed: YES.

Required backend/storage capabilities:

* Store release package metadata
* Store artifact metadata
* Store SHA256 hash records
* Store evidence bundle references
* Store gate decisions
* Store approval records
* Store rollback references
* Enforce missing evidence blocker
* Enforce no-auto-deploy separation

Until backend/storage is implemented and approved, FP-18 remains a contract and release package design only.

No storage write is authorized by this contract.

## 14. Acceptance Criteria

FP-18 is acceptable when:

* Artifact model is defined
* SHA256/hash rules are defined
* Release package structure is defined
* Evidence bundle requirements are defined
* Gate checklist is defined
* Missing evidence blocker is defined
* No-auto-deploy rule is defined
* Rollback package reference is defined
* Release approval record is defined
* Storage/backend dependency is identified
* Forbidden actions are not performed

## 15. Forbidden Actions Confirmation

FP-18 confirms:

* No artifact upload implementation
* No deployment
* No release execution
* No DB action
* No file storage write
* No migration/reset/seed/db push
* No secrets/env/token/cookie exposure
* No production readiness claim
