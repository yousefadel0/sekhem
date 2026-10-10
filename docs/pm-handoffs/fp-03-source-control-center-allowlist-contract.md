# SEKHEM — FP-03 Source Control Center Allowlist Contract

## Package

`FP-03` — R&D Source Allowlist + Connector Runtime / Source Control Center Contract

## Owner

PM

## Execution Support

Tasker 5

Tasker 5 supports the source control contract, manual collection rules, workflow/source coordination, sanitization expectations, and review-before-import rules.

PM remains owner of source family approval and source governance decisions.

Backend/API persistence, connector runtime implementation, and R&D Radar import behavior require Tasker 4 dependency/gate when implementation is needed.

## Status

In Progress / Allowlist Approved / Contract Artifact

This file is a documentation/control contract only.

No source collection, crawl, clone, build, test, import, DB write, or runtime action is enabled by this file.

## Purpose

Define the Source Control Center contract for approved source registration, lifecycle, risk review, allowlist enforcement, manual controlled fetch scope, evidence requirements, deduplication, sanitization, blocker handling, and future UI readiness.

## Approved Mode

Manual controlled metadata/docs fetch only.

No broad crawling.

No schedule.

No public trigger.

No automatic R&D Radar import.

No clone/build/test against SONiC repositories.

## Approved Allowlist Reference

Approved SONiC allowlist doc:

```text
docs/pm-handoffs/fp-03-sonic-official-repo-allowlist.md
```

## 1. Source Registration Fields

Each source registered in the Source Control Center must include:

```yaml
source_id: string
source_family: string
source_type: internal_doc | internal_repo_docs | github_org | github_repo | github_file | github_release_metadata | official_docs
source_name: string
source_url: string | null
repository_full_name: string | null
organization: string | null
owner: PM | Tasker5 | Tasker4 | QA | SecurityReviewer
approved_by: string | null
approval_ref: string | null
risk_category: Safe | Needs Review | High Risk | Blocked
lifecycle_state: proposed | risk_review | approved | active | blocked | rejected
allowed_fetch_scopes: array
blocked_fetch_scopes: array
manual_collection_only: boolean
review_before_import_required: boolean
dedup_key_strategy: url | repo_path | sha256 | source_ref_hash
sanitization_required: boolean
evidence_required: array
created_at: string
updated_at: string
notes: string | null
```

Required minimum fields:

- `source_id`
- `source_family`
- `source_type`
- `source_name`
- `owner`
- `risk_category`
- `lifecycle_state`
- `manual_collection_only`
- `review_before_import_required`
- `sanitization_required`

If any required field is missing, the source must remain `proposed` or `blocked` and cannot become `active`.

## 2. Source Lifecycle

Allowed lifecycle states:

```text
proposed
risk_review
approved
active
blocked
rejected
```

### State Meanings

| State | Meaning | Allowed action |
| --- | --- | --- |
| `proposed` | Source suggested but not reviewed | PM/Tasker5 review only |
| `risk_review` | Source requires risk/safety review | No fetch beyond metadata inspection |
| `approved` | PM approved source family or exact source | Ready for controlled activation |
| `active` | Source may be used for manual controlled metadata/docs fetch | Manual fetch only |
| `blocked` | Source cannot be used until blocker resolved | No fetch/import |
| `rejected` | Source is not allowed | No fetch/import |

### State Transition Rules

Allowed transitions:

```text
proposed -> risk_review
proposed -> rejected
risk_review -> approved
risk_review -> blocked
risk_review -> rejected
approved -> active
approved -> blocked
active -> blocked
blocked -> risk_review
blocked -> rejected
```

Not allowed:

```text
proposed -> active
risk_review -> active
rejected -> active
blocked -> active without risk_review
```

## 3. Source Risk Categories

Allowed risk categories:

```text
Safe
Needs Review
High Risk
Blocked
```

### Category Definitions

| Risk Category | Meaning | Default handling |
| --- | --- | --- |
| Safe | Approved internal source or official source with low collection risk | May become active after approval evidence |
| Needs Review | Source appears relevant but needs PM/Tasker5 review | No active fetch/import until reviewed |
| High Risk | Source may include sensitive, unsafe, broad, vendor, private, executable, or legal risk | PM/security review required |
| Blocked | Source is forbidden or blocked by safety rule | No fetch/import |

Risk category must be explicit before a source becomes `active`.

## 4. Approved Source Families

### 4.1 SEKHEM Internal Source Files

Approved internal source family:

```text
SEKHEM internal source files
```

Approved sources:

- `SEKHEM SOURCE PACK - Production Runtime Instructions`
- `production plan`
- GitHub repository docs under `docs/**` in `sekhemaifactory-creator/sekhem-product-application`

Allowed use:

- source-of-truth PM/runtime governance;
- production plan validation;
- task contract alignment;
- evidence references;
- controlled documentation lookup.

### 4.2 SONiC Official GitHub Organization

Approved source family:

```text
SONiC official GitHub organization
```

Approved organization:

```text
sonic-net
```

Approved Tier 1 repositories:

- `sonic-net/SONiC`
- `sonic-net/sonic-buildimage`
- `sonic-net/sonic-mgmt`
- `sonic-net/sonic-utilities`
- `sonic-net/sonic-swss`
- `sonic-net/sonic-sairedis`
- `sonic-net/sonic-swss-common`
- `sonic-net/sonic-linux-kernel`
- `sonic-net/sonic-frr`
- `sonic-net/sonic-platform-common`
- `sonic-net/sonic-platform-daemons`
- `sonic-net/sonic-gnmi`
- `sonic-net/sonic-telemetry`
- `sonic-net/sonic-mgmt-framework`

Allowed use:

- metadata/docs inspection;
- README/docs/release metadata review;
- repository identity verification;
- architecture/source reference mapping;
- manual evidence capture for SEKHEM Hardware/NOS Lab planning.

## 5. Blocked Source Types

Blocked source types include:

- unapproved GitHub organizations;
- unapproved repositories;
- personal forks unless explicitly approved;
- social feeds, comments, chats, forums, Reddit, LinkedIn, Telegram, Discord, X/Facebook content;
- search-engine result scraping;
- broad web crawling;
- vendor/private SDK repositories;
- credentialed/private vendor portals;
- binary blobs unless explicitly approved for metadata-only review;
- device configuration dumps;
- customer or production network data;
- secrets, keys, tokens, cookies, environment files, or credentials;
- raw logs with sensitive values;
- raw HTML/full HTTP headers;
- paid/private content without approval;
- live device/NOS command output unless Lab Approval exists.

## 6. Allowed Fetch Scopes

Allowed manual controlled fetch scopes:

```text
repository metadata
README files
docs directory metadata/docs files
release metadata
license metadata
issue/PR metadata only when specifically approved
specific file by approved path
source reference URL and timestamp
content hash / SHA metadata
```

For SONiC Tier 1 repositories, allowed scope is limited to manual controlled metadata/docs fetch only.

Allowed evidence fields:

```yaml
source_id: string
source_family: string
repository_full_name: string | null
source_url: string | null
source_path: string | null
retrieved_at: string
retrieved_by: string
content_type: metadata | docs | readme | release_metadata | license_metadata
content_hash: string | null
summary_sanitized: string
evidence_ref: string
```

## 7. Blocked Fetch Scopes

Blocked fetch scopes:

- recursive organization crawling;
- recursive repository crawling;
- repository clone;
- build/test execution;
- package installation;
- script execution;
- workflow execution;
- automatic R&D Radar import;
- scheduled fetch;
- public trigger/webhook fetch;
- credentialed fetch;
- private/vendor SDK fetch;
- raw HTML capture;
- full HTTP headers;
- cookies/tokens/session capture;
- secrets or env files;
- device/lab commands;
- network scans;
- production runtime access.

## 8. Manual Collection Rules

Manual collection rules:

1. PM-approved source family or exact source is required.
2. Source lifecycle must be `active` before collection, except metadata-only inspection during `risk_review`.
3. Collection must be manual and bounded.
4. Collector must specify exact repo/path/metadata target.
5. No recursive crawl.
6. No schedule.
7. No public trigger.
8. No automatic import.
9. No external write.
10. No clone/build/test.
11. No private SDK or credentialed access.
12. No secrets or unsafe raw content.
13. Evidence must be recorded before any future import proposal.

## 9. Review-Before-Import Rule

No collected source may be imported into R&D Radar automatically.

Required path:

```text
Manual controlled fetch
-> sanitized summary + evidence refs
-> PM/Tasker5 review
-> risk category confirmation
-> deduplication check
-> Tasker 4 backend/API import gate if persistence is required
-> R&D Radar import only after explicit approval
```

Review-before-import is mandatory for all source families, including approved SONiC Tier 1 repositories.

## 10. Evidence Requirements

Each source collection event must provide:

```yaml
source_registration_id: string
source_lifecycle_state: active | risk_review
source_risk_category: Safe | Needs Review | High Risk | Blocked
approved_source_family: string
exact_source_ref: string
allowed_fetch_scope_used: string
manual_operator_or_tasker: string
retrieved_at: string
content_hash_or_metadata_hash: string | null
sanitized_summary: string
dedup_key: string
evidence_refs: array
review_status: pending_review | approved_for_import | rejected | blocked
forbidden_actions_check: PASS | FAIL
```

Evidence must prove:

- source was allowlisted;
- fetch scope was bounded;
- collection was manual;
- content was sanitized;
- deduplication key was generated;
- review-before-import is pending or complete;
- no blocked fetch scope occurred.

## 11. Deduplication Requirements

Deduplication must prevent repeated or conflicting import of the same source.

Minimum dedup strategies:

- exact source URL;
- repository full name + path;
- commit SHA or release tag when available;
- content hash or metadata hash when available;
- source family + title/slug fallback only for manual review.

Dedup result states:

```text
new_source
same_source_same_hash
same_source_changed_hash
possible_duplicate
conflict_requires_review
```

Rules:

- `same_source_same_hash` should not create duplicate R&D records.
- `same_source_changed_hash` requires review.
- `possible_duplicate` requires review.
- `conflict_requires_review` blocks import until resolved.

Persistence of dedup records is a Tasker 4 backend dependency.

## 12. Sanitization Requirements

Sanitization must remove or block:

- secrets;
- tokens;
- cookies;
- credentials;
- private keys;
- environment values;
- connection strings;
- raw logs;
- stack traces;
- raw HTML;
- full HTTP headers;
- internal IPs;
- customer data;
- private/vendor SDK content;
- live device output;
- unapproved vendor-private labels in customer-facing text.

Allowed output after sanitization:

```yaml
summary_sanitized: string
source_title: string
source_url: string
source_family: string
repo_full_name: string | null
source_path: string | null
retrieved_at: string
content_hash: string | null
risk_flags: array
evidence_refs: array
```

Unsafe content behavior:

1. Do not echo raw unsafe content.
2. Mark `unsafe_content_detected = true`.
3. Store only sanitized reason/evidence reference.
4. Route to blocker if safe summary cannot be produced.

## 13. Blocker Handling

A source must route to blocker when:

- source is outside approved family;
- repo is not on approved Tier 1 list;
- fetch scope exceeds allowed scope;
- recursive crawl is requested;
- schedule/public trigger is requested;
- automatic import is requested;
- clone/build/test is requested;
- private/vendor SDK access is requested;
- secrets or unsafe raw content are encountered;
- dedup conflict exists;
- Tasker 4 backend dependency is required and not yet approved;
- PM decision is required.

Blocker result shape:

```yaml
blocker_id: string
package_id: FP-03
owner: PM
blocking_owner: PM | Tasker5 | Tasker4 | SecurityReviewer | QA | null
source_id: string | null
repository_full_name: string | null
reason_code: string
customer_safe_summary: string
next_action: string
pm_decision_needed: string | null
evidence_refs: array
created_at: string
```

Blocker summaries must not include secrets, raw logs, raw HTML, full headers, internal IPs, tokens, cookies, credentials, private keys, connection strings, or unsafe vendor/private content.

## 14. UI Readiness Notes for Future Source Control Center Screen

Future UI should show:

- source family;
- exact source/repo;
- lifecycle state;
- risk category;
- allowed fetch scopes;
- blocked fetch scopes;
- approval reference;
- evidence refs;
- dedup state;
- review-before-import status;
- blocker state;
- next action;
- owner/blocking owner.

UI must not show:

- raw HTML;
- full headers;
- raw logs;
- secrets;
- tokens;
- cookies;
- credentials;
- private keys;
- connection strings;
- internal runtime values;
- unsafe device/lab output.

UI is not the enforcement layer.

Backend enforcement must exist before final acceptance.

## Backend / Tasker 4 Dependencies

Tasker 4 backend dependency is required for:

- persistent source registry;
- source lifecycle APIs;
- allowlist enforcement APIs;
- source evidence storage;
- deduplication storage;
- review-before-import state storage;
- R&D Radar import endpoint or workflow;
- RBAC around source approvals/imports;
- audit trail persistence.

Tasker 5 may define the contract but must not implement backend persistence or override Tasker 4 authority.

## Acceptance Criteria

FP-03 Source Control Center contract is complete when:

- source registration fields are defined;
- lifecycle states are defined;
- risk categories are defined;
- approved source families are listed;
- blocked source types are listed;
- allowed fetch scopes are defined;
- blocked fetch scopes are defined;
- manual collection rules are defined;
- review-before-import rule is defined;
- evidence requirements are defined;
- deduplication requirements are defined;
- sanitization requirements are defined;
- blocker handling is defined;
- UI readiness notes are included;
- forbidden actions check confirms no unsafe action occurred;
- board row has Notes / Evidence.

## Forbidden Actions Check

Confirmed by this document:

- no broad crawling;
- no schedule;
- no public trigger;
- no automatic R&D Radar import;
- no code execution;
- no clone/build/test against SONiC repos;
- no external repo write;
- no private/vendor SDK access;
- no live device/lab execution;
- no raw HTML/full headers;
- no secrets/env/token/cookie/private keys;
- no DB write;
- no deployment/restart;
- no production claim.
