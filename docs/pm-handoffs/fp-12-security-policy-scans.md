# SEKHEM — FP-12 Security Policy + Scans Baseline

## Package

`FP-12` — Security Policy + Scans

## Owner

Tasker 4

## Status

In Progress / Policy Baseline Artifact

This file is a documentation/control contract only.

No real secrets scan against live environment, dependency scan execution, package upgrade, DB action, migration, seed, reset, runtime smoke, restart, deployment, public trigger, schedule, or production readiness claim is enabled by this file.

## Purpose

Define the production security policy baseline and scan evidence plan for the SEKHEM product application. The policy covers secrets scanning, dependency and license/SBOM evidence, sensitive data redaction, unsafe finding blocker rules, source connector security checks, AI request/prompt/output safety checks, and release blocking rules.

This baseline prepares FP-13 risk-class security enforcement, FP-15 quality runner runtime, FP-16 evidence platform, and FP-18 release factory gates.

## Source Alignment

This policy aligns with:

- `docs/pm-handoffs/full-product-parallel-execution-model.md`
- `docs/pm-handoffs/fp-03-source-control-center-allowlist-contract.md`
- FP-01 validated backend workflow runtime persistence patch
- FP-14 Quality Matrix / Test Profiles completion state

FP-12 is part of Track 4 — Quality + Security and may run when its board dependency allows.

## Risk Class

`FP-12` is security-sensitive policy work.

```text
Risk class: Class C
```

This artifact is docs/policy only. Any future implementation that runs scans, reads repository contents broadly, persists security evidence, executes tools, or blocks releases must be separately task-contracted and risk-classified.

## Security Gate Principles

1. Security evidence is required before any release candidate can proceed.
2. Scan output must be sanitized before storage, display, or customer-facing use.
3. Unsafe findings must create a blocker, not a silent warning.
4. Secret-like values must never be printed in logs, prompts, screenshots, docs, issue comments, or evidence summaries.
5. Source connector input must respect allowlist, fetch scope, and sanitization rules.
6. AI request, prompt, and output safety checks must fail closed.
7. A release cannot pass if any required security evidence is missing, stale, failed, or unreviewed.
8. No production claim is allowed before the final production gate passes.

## 1. Required Security Evidence Types

Each release candidate, task package, or security-sensitive workflow must be able to attach the following evidence categories when applicable:

```yaml
security_evidence:
  package_id: string
  task_id: string | null
  commit_sha: string | null
  scan_scope: string
  scan_mode: design_only | dry_run | repo_snapshot | ci_artifact
  executed_by: PM | Tasker4 | QA | SecurityReviewer | CI | null
  executed_at: string | null
  evidence_ref: string
  sanitized_summary: string
  result: PASS | FIX | BLOCKED
  blockers: array
  forbidden_actions_check: PASS | FAIL
```

Required evidence categories:

| Category | Evidence required | Minimum result before release |
| --- | --- | --- |
| Secrets scan | Sanitized scan summary, scope, tool/method, no raw secret values | PASS |
| Dependency scan | Vulnerability summary by severity and package scope | PASS or PM-approved exception |
| License/SBOM | SBOM artifact ref and license summary | PASS or Legal/PM exception |
| Sensitive data redaction | Redaction policy result and sampled negative checks | PASS |
| Source connector security | Allowlist, scope, sanitization, no blocked fetch scope | PASS |
| AI safety checks | Request, prompt, output, redaction, provider mode checks | PASS |
| Release blocking rules | Gate decision and blocker state | PASS |

## 2. Secrets Scan Policy

### Scope

Secrets scanning must cover repository files and generated release artifacts before release. It must not scan or print live environment values unless a separate PM-approved security task explicitly permits a safe scanner mode.

Allowed scan scopes:

```text
repository snapshot
changed files
release artifact directory
sanitized logs directory
CI-generated artifact metadata
```

Forbidden scan scopes:

```text
live environment dump
.env value printing
runtime process environment printing
cookies/tokens/session capture
credentialed vendor/private portal scraping
production DB content
customer data dumps
raw infrastructure logs containing secrets
```

### Candidate command design

Commands below are design examples for future authorized dry-run/CI usage only. They are not executed by this document.

```bash
# Example repo snapshot scan with redacted output only
trufflehog filesystem . --no-update --only-verified --json > security-evidence/secrets-scan.raw.json
python scripts/security/redact_scan_output.py security-evidence/secrets-scan.raw.json > security-evidence/secrets-scan.sanitized.json
```

```bash
# Example lightweight pattern guard for changed files only
git diff --name-only BASE_SHA HEAD_SHA \
  | xargs -r python scripts/security/scan_for_secret_patterns.py \
  > security-evidence/changed-files-secrets.sanitized.json
```

### Required secrets scan behavior

- Do not echo the secret-like value.
- Store only detector name, file path, line number if safe, severity, and redacted fingerprint.
- Redact with fixed markers such as `[REDACTED_SECRET]`, `[REDACTED_TOKEN]`, `[REDACTED_COOKIE]`, `[REDACTED_PRIVATE_KEY]`.
- If a verified or high-confidence secret is found, result is `BLOCKED`.
- If the scanner cannot complete, result is `BLOCKED` unless PM explicitly accepts `FIX` for non-release work.

### Secrets blocker triggers

Create a blocker when any of these are detected:

- private key material;
- API key, token, cookie, session value, password, or credential;
- connection string with credential-like content;
- env file or env value proposed for output;
- secret-like content in prompt, evidence, issue, log, screenshot, or documentation;
- scanner failure on required release scope.

Blocker summary must be safe and must not contain the raw value.

## 3. Dependency Scan Policy

### Scope

Dependency security review must cover backend, frontend, and any release tooling lockfiles when those packages are part of a release candidate.

Minimum files to inspect when present:

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
npm-shrinkwrap.json
Dockerfile
container build manifests
GitHub Actions workflow dependency actions
```

### Candidate command design

```bash
# npm/pnpm audit design example; output must be reviewed and sanitized
npm audit --json > security-evidence/npm-audit.raw.json
python scripts/security/summarize_audit.py security-evidence/npm-audit.raw.json > security-evidence/npm-audit.sanitized.json
```

```bash
# OS/container dependency scan design example
trivy fs --format json --output security-evidence/trivy-fs.raw.json .
python scripts/security/summarize_trivy.py security-evidence/trivy-fs.raw.json > security-evidence/trivy-fs.sanitized.json
```

### Severity handling

| Finding severity | Default action |
| --- | --- |
| Critical | BLOCKED until fixed or PM/Security exception with expiry |
| High | BLOCKED for release; FIX for non-release branch only |
| Medium | FIX unless exploit path is impossible and PM accepts exception |
| Low | Track as FIX or accepted risk with evidence |
| Unknown | Needs review; may be BLOCKED if package is release-critical |

### Dependency evidence fields

```yaml
dependency_scan:
  package_manager: npm | pnpm | yarn | mixed | unknown
  lockfile_ref: string
  scan_command_ref: string
  scan_artifact_ref: string
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  unknown_count: number
  exceptions: array
  result: PASS | FIX | BLOCKED
```

## 4. License and SBOM Evidence Policy

### SBOM requirement

Every release candidate must have a Software Bill of Materials evidence artifact or a documented PM-approved exception.

Candidate command design:

```bash
# SBOM design examples; do not execute unless task-approved
syft . -o cyclonedx-json=security-evidence/sbom.cyclonedx.json
trivy fs --format cyclonedx --output security-evidence/sbom.trivy.cyclonedx.json .
```

### License evidence

License evidence must summarize:

- package/component name;
- version;
- license identifier;
- source/registry when known;
- risk category;
- exception if required.

License blocker triggers:

- unknown license on release-critical package without review;
- copyleft or restricted license risk without PM/legal decision;
- missing SBOM for release candidate;
- generated SBOM contains unsafe paths or sensitive values.

## 5. Sensitive Data Redaction Policy

### Sensitive classes

The following must be redacted or blocked before storage/display:

```text
secrets
tokens
cookies
credentials
private keys
connection strings
environment values
raw logs
stack traces
raw HTML
full HTTP headers
internal IPs unless PM-approved for internal-only evidence
customer data
private/vendor SDK content
live device/NOS output
unapproved vendor-private labels in customer-facing text
```

### Redaction rules

- Prefer blocking over redaction when safety is uncertain.
- Keep only safe metadata: category, detector, file path, line number if safe, redacted fingerprint, owner, and next action.
- Redaction must be applied before AI processing, issue comments, PM docs, screenshots, and evidence storage.
- AI-generated summaries must not reconstruct or infer the raw secret.

### Safe evidence shape

```yaml
redaction_evidence:
  unsafe_content_detected: boolean
  unsafe_categories: array
  redaction_applied: boolean
  sanitized_summary: string
  safe_evidence_ref: string
  raw_content_stored: false
  result: PASS | FIX | BLOCKED
```

## 6. Unsafe Findings Blocker Policy

### Blocker creation rules

A blocker must be created when:

- any required security scan is missing for a release candidate;
- secrets scan returns verified/high-confidence secret;
- dependency scan returns critical/high release-impact finding;
- SBOM/license evidence is missing or unsafe;
- source connector violates allowlist or fetch scope;
- AI safety check fails or cannot complete;
- raw secret/log/header/cookie/token is proposed for output;
- release evidence is stale, unreviewed, or cannot be traced to commit/package/task;
- reviewer or PM decision is required.

### Blocker shape

```yaml
blocker:
  package_id: FP-12
  owner: Tasker4
  blocking_owner: PM | Tasker4 | QA | SecurityReviewer | Legal | Tasker5
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  evidence_refs: array
  pm_decision_needed: string | null
  next_action: string
  created_at: string
```

### Blocker safety

Blocker summaries must not include raw secrets, raw logs, raw HTML, full headers, cookies, tokens, credentials, private keys, connection strings, env values, customer data, or unsafe vendor/private content.

## 7. Source Connector Security Checks

FP-12 inherits FP-03 allowlist and source control rules.

Required checks before any source connector output may become evidence:

1. Source family or exact source is approved.
2. Lifecycle state allows controlled metadata/docs fetch.
3. Fetch is manual, bounded, and exact-scope.
4. No recursive crawl.
5. No schedule.
6. No public trigger.
7. No automatic R&D Radar import.
8. No clone/build/test/package install/script execution.
9. No credentialed/private/vendor SDK fetch.
10. No raw HTML/full headers/cookies/tokens/session capture.
11. Sanitized summary produced.
12. Dedup key/evidence ref created.
13. Review-before-import remains enforced.

Source connector blocker triggers:

- unapproved organization/repository/source;
- fetch scope exceeds allowed scope;
- credentialed/private source requested;
- raw unsafe content encountered;
- schedule/public trigger requested;
- automatic import requested;
- dedup conflict;
- PM/Tasker4 approval missing.

## 8. AI Request, Prompt, and Output Safety Checks

### AI request safety

Before any AI gateway or AI draft request is accepted, the request must be checked for:

- secrets or secret-like patterns;
- raw logs, stack traces, headers, cookies, tokens, credentials;
- file apply, deployment, restart, DB mutation, or repository write requests;
- unapproved provider/model activation;
- unsupported request type;
- prompt injection asking to bypass PM controls;
- customer/private data outside approved context.

### Prompt construction rules

- Use sanitized summaries and evidence refs only.
- Do not include raw environment values, credentials, cookies, tokens, private keys, raw logs, raw HTML, or full headers.
- Include task ID, risk class, allowed files, forbidden files, stop conditions, and output schema when code/diff work is requested.
- For code-changing requests, require Task Contract before generation.

### AI output safety

AI output must be checked for:

- secret-like values;
- unsafe commands;
- DB reset/migration/push/seed instructions without PM approval;
- public API exposure or automatic deployment;
- GitHub write actions without explicit PM approval;
- production readiness claims before final gate;
- hidden prompt or policy leakage;
- raw source/customer/runtime data.

If AI output fails checks, the workflow result is `BLOCKED` and only a safe reason may be stored.

## 9. Release Blocking Rules

A release candidate must be blocked when any required security category is not `PASS` or explicitly approved by PM/Security with evidence.

Release-blocking conditions:

```text
missing secrets scan evidence
failed secrets scan
missing dependency scan evidence
critical/high dependency finding without exception
missing SBOM/license evidence
license risk without PM/legal decision
failed source connector safety check
failed AI request/prompt/output safety check
unreviewed blocker
stale security evidence not tied to release commit
scan command failed or incomplete
raw unsafe content detected in release artifact/evidence
```

Release gate output:

```yaml
security_gate_result:
  package_id: FP-12
  release_candidate_id: string | null
  commit_sha: string | null
  secrets_scan: PASS | FIX | BLOCKED | NOT_APPLICABLE
  dependency_scan: PASS | FIX | BLOCKED | NOT_APPLICABLE
  license_sbom: PASS | FIX | BLOCKED | NOT_APPLICABLE
  redaction: PASS | FIX | BLOCKED
  source_connector_security: PASS | FIX | BLOCKED | NOT_APPLICABLE
  ai_safety: PASS | FIX | BLOCKED | NOT_APPLICABLE
  open_blockers: array
  final_decision: PASS | FIX | BLOCKED
  reviewed_by: PM | QA | SecurityReviewer | null
  reviewed_at: string | null
```

No final production readiness claim is allowed from FP-12 alone.

## 10. Evidence Retention and Review

Security evidence must be retained as sanitized references, not raw unsafe output.

Minimum retention fields:

```yaml
evidence_id: string
package_id: FP-12
task_id: string | null
commit_sha: string | null
artifact_type: secrets_scan | dependency_scan | license_sbom | redaction | source_connector_security | ai_safety | release_gate
artifact_ref: string
sha256: string | null
created_at: string
created_by: string
review_status: pending_review | pass | fix | blocked
reviewed_by: string | null
reviewed_at: string | null
```

Review status rules:

- `pending_review` cannot release.
- `fix` cannot release unless PM/Security exception exists.
- `blocked` cannot release.
- `pass` must include evidence ref and reviewer.

## 11. Scan Command Execution Rules

Future scan execution tasks must follow:

1. Use clean repository snapshot or CI workspace.
2. Do not print env values.
3. Do not scan live runtime process environment.
4. Do not connect to production DB.
5. Do not run migrations, db push, seed, reset, deployment, restart, or runtime smoke.
6. Save raw tool output only in controlled private artifact storage when required.
7. Publish only sanitized summary to PM docs/board.
8. Include command, scope, commit SHA, timestamp, tool version, and result.
9. Any scan failure produces `FIX` or `BLOCKED`, not silent pass.

## 12. Acceptance Criteria for FP-12 Baseline

FP-12 baseline is acceptable when this document defines:

- secrets scan policy;
- dependency scan policy;
- license/SBOM evidence policy;
- sensitive data redaction policy;
- unsafe findings blocker policy;
- source connector security checks;
- AI request/prompt/output safety checks;
- release blocking rules;
- evidence fields and review requirements;
- forbidden actions confirmation.

## 13. Forbidden Actions Check

```yaml
real_secrets_scan_against_live_env: NO
env_secret_token_cookie_printed: NO
db_action: NO
migration_reset_seed_db_push: NO
deployment_restart: NO
runtime_smoke: NO
production_claim: NO
```

## 14. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-12 security policy and scan evidence baseline created at docs/pm-handoffs/fp-12-security-policy-scans.md. Covers secrets scan, dependency scan, license/SBOM, sensitive data redaction, unsafe findings blocker policy, source connector security checks, AI request/prompt/output safety checks, release blocking rules, evidence fields, and forbidden action confirmation. Docs/policy only. No scan execution. No live env scan. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No production claim.
```
