# SEKHEM — FP-04 R&D Import + Rejection + QA Contract

## Package

`FP-04` — R&D Import + Rejection + QA

## Owner

Tasker 4

## Status

In Progress / Contract Artifact

This file is a documentation/contract artifact only.

No live source collection, automatic import into R&D Radar, broad crawling, DB write, migration, reset, seed, db push, runtime execution, public trigger, schedule, raw HTML/full headers capture, secret/env/token/cookie output, deployment, restart, runtime smoke, or production readiness claim is enabled by this file.

## Purpose

Define the safe R&D import, rejection, duplicate handling, metadata-only import, manual QA review, evidence linkage, blocker routing, and rollback/delete-request policy for R&D Radar source findings.

FP-04 depends on FP-03 Source Control Center / Allowlist, FP-07 Task Contract + Risk Classification, FP-12 Security Policy + Scans, FP-13 Risk-Class Security Enforcement, FP-16 Evidence Platform, and FP-31 Source Control Center UI before implementation.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-03-source-control-center-allowlist-contract.md`
- `docs/pm-handoffs/fp-07-task-contract-risk-classification.md`
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- `docs/pm-handoffs/fp-13-risk-class-security-enforcement.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- FP-31 Source Control Center UI PM Review status
- PM rule: no broad crawl, no schedule, no public trigger, no automatic import, no secrets, no raw HTML/full headers
- PM rule: no production claim before final gate

## Risk Class

```text
Current artifact: docs/contract only
Future import workflow implementation: Class C/D depending storage and source handling
```

Any future backend persistence, R&D Radar write path, import queue, UI action, or source connector execution requires a separate implementation package and PM approval.

## R&D Import Principles

1. Import is approved-source only.
2. Import is metadata-only by default.
3. Manual review is required before import.
4. Unknown, rejected, unsafe, duplicate, or unapproved source findings fail closed.
5. No automatic import into R&D Radar is allowed under FP-04.
6. No broad crawling, recursive fetch, schedule, public trigger, or live source collection is allowed.
7. No raw HTML, full headers, credentials, tokens, cookies, env values, private keys, or secrets may be stored in PM-visible evidence.
8. Every import/rejection decision must produce FP-16-compatible evidence.
9. Unsafe source handling routes to blocker.
10. Bad imports require rollback/delete request policy and QA review.

## 1. Approved-Source-Only Rule

Only sources approved under FP-03 may move to import review.

```yaml
approved_source_check:
  source_id: string
  source_family: string
  source_url: string | null
  repository_full_name: string | null
  allowlist_status: proposed | risk_review | approved | active | blocked | rejected
  allowed_fetch_scope: metadata_only | docs_metadata | release_metadata | license_metadata | specific_file_metadata | other_approved_scope
  source_control_center_ref: string
  result: PASS | FIX | BLOCKED
```

Rules:

- `approved` or `active` source status is required for import review.
- `blocked` or `rejected` source status is not importable.
- Unknown source is `BLOCKED`.
- Source family outside FP-03 approved families is `BLOCKED`.
- Source evidence must include source URL/ref and sanitization status.

## 2. Rejected-Source Handling

Rejected sources must be recorded safely and excluded from import.

```yaml
rejected_source_record:
  rejected_source_id: string
  source_url_or_ref: string | null
  source_family: string | null
  rejection_reason_code: string
  sanitized_reason: string
  rejected_by: PM | Tasker4 | QA | SecurityReviewer | SourceControlReviewer | string
  rejected_at: string
  evidence_refs: array
  import_allowed: false
```

Rejection reasons:

```text
NOT_ALLOWLISTED
SOURCE_FAMILY_BLOCKED
UNSAFE_CONTENT_DETECTED
FETCH_SCOPE_EXCEEDED
BROAD_CRAWL_REQUIRED
CREDENTIAL_REQUIRED
PRIVATE_VENDOR_SDK
RAW_HTML_OR_FULL_HEADERS_ONLY
SECRET_OR_TOKEN_DETECTED
DUPLICATE_OF_EXISTING_FINDING
PM_REJECTED
QA_REJECTED
```

Rejected-source summaries must not include raw unsafe content.

## 3. Unsafe-Source Blocker Routing

Unsafe sources must route to blocker instead of import.

Unsafe conditions:

```text
secret/env/token/cookie/credential/private_key_detected
raw_html_or_full_headers_present
raw_logs_or_stack_traces_present
customer_data_detected
internal_ip_or_runtime_config_detected
private_vendor_sdk_or_credentialed_portal_required
broad_crawl_or_recursive_fetch_requested
schedule_or_public_trigger_requested
automatic_import_requested
```

Blocker shape:

```yaml
rd_source_blocker:
  blocker_id: string
  package_id: FP-04
  source_id: string | null
  finding_id: string | null
  owner: Tasker4
  blocking_owner: PM | QA | SecurityReviewer | SourceControlReviewer | Tasker4
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, raw headers, raw HTML, customer data, or unsafe source content.

## 4. Duplicate Finding Handling

Duplicate findings must be detected before import.

```yaml
duplicate_finding_check:
  candidate_finding_id: string
  dedup_key: string
  source_id: string
  normalized_title_hash: string | null
  normalized_url_hash: string | null
  existing_finding_ref: string | null
  duplicate_status: unique | duplicate | possible_duplicate | conflict
  qa_decision_required: boolean
  result: PASS | FIX | BLOCKED
```

Rules:

- Exact duplicate is not imported as a new finding.
- Possible duplicate routes to QA review.
- Dedup conflict routes to blocker if it can affect release evidence or imported R&D data integrity.
- Duplicate handling must preserve existing evidence and add new source evidence as cross-reference only.

## 5. Metadata-Only Import Model

FP-04 import model is metadata-only.

```yaml
rd_import_candidate:
  import_candidate_id: string
  source_id: string
  source_family: string
  source_ref: string
  source_title: string | null
  source_summary_sanitized: string
  source_timestamp: string | null
  collected_metadata_only: true
  raw_content_stored: false
  raw_html_stored: false
  full_headers_stored: false
  source_hash: string | null
  sanitization_status: PASS | FIX | BLOCKED
  duplicate_status: unique | duplicate | possible_duplicate | conflict
  manual_review_status: pending_review | pass | fix | blocked
  import_status: pending_review | PASS | FIX | BLOCKED | rejected
```

Allowed metadata examples:

- source ref/URL;
- repository full name;
- file path/ref if approved;
- title/name;
- sanitized summary;
- timestamp;
- SHA/hash/checksum;
- license metadata;
- release metadata;
- approved source classification.

Forbidden import content:

- raw HTML;
- full HTTP headers;
- cookies/tokens/session data;
- API keys/secrets/env values;
- private keys/credentials;
- raw logs/full stack traces;
- customer data dumps;
- private vendor SDK content;
- credentialed portal content;
- recursive crawled content.

## 6. Manual Review Before Import

Manual review is mandatory before import.

```text
Source allowlist check
-> sanitization check
-> duplicate check
-> metadata-only import candidate creation
-> manual QA review
-> PASS / FIX / BLOCKED import decision
-> FP-16 evidence link
-> backend import only in future approved implementation
```

Manual review record:

```yaml
manual_import_review:
  review_id: string
  import_candidate_id: string
  reviewer: PM | QA | SecurityReviewer | SourceControlReviewer | Tasker4 | string
  reviewed_at: string
  decision: PASS | FIX | BLOCKED
  decision_reason: string
  required_fixes: array
  blocker_id: string | null
  evidence_refs: array
  import_allowed: boolean
```

Rules:

- No import may occur while review status is `pending_review`.
- `PASS` permits future approved backend import, not immediate DB write in FP-04.
- `FIX` requires correction before import eligibility.
- `BLOCKED` routes to blocker and rejects import.

## 7. Evidence Requirements

Every import, rejection, duplicate, unsafe-source, QA, and rollback/delete decision must link to FP-16 evidence.

```yaml
rd_import_evidence:
  evidence_id: string
  package_id: FP-04
  import_candidate_id: string | null
  source_id: string | null
  finding_id: string | null
  evidence_type: source_allowlist | import_candidate | rejection | duplicate_check | sanitization | qa_review | blocker | rollback_delete_request
  source_allowlist_ref: string | null
  security_evidence_ref: string | null
  qa_review_ref: string | null
  blocker_id: string | null
  sanitized_summary: string
  raw_content_stored: false
  raw_html_stored: false
  full_headers_stored: false
  secrets_detected: boolean
  result: PASS | FIX | BLOCKED
  created_at: string
```

Minimum evidence for import candidate:

- source allowlist ref;
- metadata-only confirmation;
- sanitization status;
- duplicate status;
- manual review status;
- QA result;
- no raw HTML/full headers/secrets confirmation.

## 8. Source Sanitization Status

```yaml
source_sanitization_status:
  status: PASS | FIX | BLOCKED
  unsafe_content_detected: boolean
  unsafe_categories: array
  sanitized_summary_ref: string
  raw_content_stored: false
  blocker_id: string | null
```

Rules:

- `PASS`: sanitized metadata safe for review/import.
- `FIX`: metadata incomplete or needs safer summary.
- `BLOCKED`: unsafe source content detected, scope exceeded, or raw forbidden content required.

## 9. Import PASS / FIX / BLOCKED Status

| Status | Meaning | Import effect |
| --- | --- | --- |
| PASS | Approved source, metadata-only, sanitized, non-duplicate or QA-approved duplicate, manual review complete | Eligible for future backend import after implementation approval |
| FIX | Safe but incomplete metadata/evidence/review issue | Not importable until fixed |
| BLOCKED | Unsafe, rejected, unapproved, duplicate conflict, missing approval, or forbidden content | Not importable |

`PASS` under FP-04 does not execute import or DB write.

## 10. QA Review Workflow

QA review validates import safety, evidence completeness, duplicate handling, and source policy compliance.

QA checklist:

```yaml
qa_review_checklist:
  approved_source_only: required
  metadata_only: required
  manual_review_complete: required
  sanitization_passed: required
  duplicate_checked: required
  evidence_linked_to_fp16: required
  no_raw_html_full_headers: required
  no_secrets_tokens_cookies_env: required
  no_broad_crawl_schedule_public_trigger: required
  rollback_delete_policy_present: required
```

QA result:

```yaml
qa_import_result:
  qa_review_id: string
  decision: PASS | FIX | BLOCKED
  reviewer: QA | PM | SecurityReviewer | SourceControlReviewer | string
  decision_reason: string
  evidence_refs: array
  blocker_id: string | null
  import_allowed_for_future_backend: boolean
```

QA must mark `BLOCKED` if any forbidden content, unapproved source, automatic import, broad crawl, public trigger, schedule, or DB write is detected.

## 11. Rollback / Delete Request Policy for Bad Imports

Because FP-04 is docs-only and performs no DB write, rollback is policy-only. Future bad imports must use controlled delete/rollback request workflow.

```yaml
bad_import_delete_request:
  delete_request_id: string
  finding_id: string
  source_id: string | null
  reason_code: string
  requested_by: PM | QA | SecurityReviewer | Tasker4 | string
  requested_at: string
  evidence_refs: array
  qa_review_required: true
  pm_approval_required: true
  hard_delete_allowed: false_by_default
  preferred_action: quarantine | mark_rejected | supersede | soft_delete | remove_from_release_manifest
  result: PASS | FIX | BLOCKED
```

Rules:

- No destructive delete by default.
- Bad imports should be quarantined or marked rejected first.
- Soft delete/supersede requires QA and PM evidence.
- Hard delete requires explicit PM approval and retention/legal review where applicable.
- Release manifests must exclude blocked/rejected imports.

## 12. Backend Persistence Dependency

Backend persistence is needed for production import workflow but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Production R&D import/rejection/QA requires persisted source candidates, rejection records, duplicate keys, sanitization status, QA review state, blocker linkage, import status, and rollback/delete requests.
```

Future implementation must include:

- additive schema proposal;
- no migration execution until PM approval;
- import candidate table/model;
- rejection/duplicate/sanitization status model;
- QA review state machine;
- FP-16 evidence writer;
- blocker router;
- soft-delete/quarantine policy;
- tests for unapproved source, unsafe source, duplicate conflict, missing manual review, and forbidden raw content;
- no automatic source import without PM-approved package.

## 13. Acceptance Criteria

FP-04 contract is acceptable when it defines:

- approved-source import only;
- rejected-source handling;
- unsafe-source blocker routing;
- duplicate finding handling;
- metadata-only import model;
- manual review before import;
- evidence requirements;
- source sanitization status;
- import PASS / FIX / BLOCKED status;
- QA review workflow;
- rollback/delete request policy for bad imports;
- backend persistence dependency;
- forbidden action confirmation.

## 14. Forbidden Actions Check

```yaml
live_source_collection: NO
automatic_import_into_rd_radar: NO
broad_crawling: NO
db_write: NO
migration_reset_seed_db_push: NO
runtime_execution: NO
public_trigger: NO
schedule: NO
raw_html_full_headers: NO
env_secret_token_cookie_output: NO
deployment_restart: NO
runtime_smoke: NO
production_claim: NO
```

## 15. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-04 R&D Import + Rejection + QA contract created at docs/pm-handoffs/fp-04-rd-import-rejection-qa.md. Covers approved-source import only, rejected-source handling, unsafe-source blocker routing, duplicate finding handling, metadata-only import model, manual review before import, evidence requirements, source sanitization status, import PASS/FIX/BLOCKED status, QA review workflow, rollback/delete request policy for bad imports, and backend persistence dependency. Docs/contract only. No live source collection. No automatic import into R&D Radar. No broad crawling. No DB write. No migration/reset/seed/db push. No runtime execution. No public trigger. No schedule. No raw HTML/full headers. No secrets/env/token/cookie output. No deployment/restart/runtime smoke. No production claim.
```
