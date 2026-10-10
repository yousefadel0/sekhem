# SEKHEM — FP-06 AI Request Policy + Redaction Contract

## Package

`FP-06` — AI Request Policy + Redaction

## Owner

Tasker 4

## Status

In Progress / Policy Contract Artifact

This file is a documentation/policy contract only.

No real AI provider activation, prompt/output body logging, secret/env/token/cookie output, DB action, migration, seed, reset, db push, runtime write, deployment, restart, runtime smoke, or production readiness claim is enabled by this file.

## Purpose

Define the policy layer that controls AI request intake, request classification, redaction, provider/model activation gates, budget/limit enforcement, safe logging, evidence capture, and blocker routing before any future AI Gateway or controlled draft generation workflow can execute.

This contract prepares FP-07 Task Contract + Risk Classification, FP-08 Tool Router + Sandbox, FP-09 Model/Provider Adapter, FP-10 Controlled Draft Generation, FP-12 Security Policy + Scans, and FP-16 Evidence Platform integration.

## Source Alignment

This policy aligns with:

- `docs/pm-handoffs/full-product-parallel-execution-model.md`
- `docs/pm-handoffs/fp-12-security-policy-scans.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- FP-05 Execution Orchestrator Contract
- PM rule: no real AI provider activation without explicit PM approval
- PM rule: no GitHub write actions from product runtime without explicit PM approval
- PM rule: no production claim before final gate

## Risk Class

AI request policy and redaction are security-sensitive.

```text
Risk class: Class C
```

This artifact is docs/policy only. Any future implementation of request routing, provider invocation, persistence, telemetry, or gateway middleware must be separately task-contracted and approved.

## Policy Principles

1. AI requests are denied by default unless the request type is explicitly allowed.
2. Unknown, malformed, or unsupported request types are rejected fail-closed.
3. Prompts and outputs must be redacted and safety-checked before evidence/logging/display.
4. Prompt body and output body must not be logged.
5. Real provider/model activation requires explicit PM approval and provider gate evidence.
6. AI must not directly write repository files, apply diffs, deploy, restart, run DB actions, or expose public APIs.
7. Unsafe requests route to blocker evidence with a sanitized summary only.
8. Evidence must contain request metadata, policy decision, redaction result, and blocker refs when applicable.

## 1. Allowed AI Request Types

Allowed request types are limited to controlled, reviewable, non-autonomous modes.

```yaml
allowed_request_types:
  - policy_classification_preview
  - source_summary_preview
  - task_contract_draft
  - risk_classification_suggestion
  - qa_test_plan_draft
  - security_scan_summary_draft
  - evidence_summary_draft
  - blocker_summary_draft
  - release_notes_draft
  - controlled_code_diff_draft
```

### Allowed request definitions

| Request type | Meaning | Output allowed | Required gate |
| --- | --- | --- | --- |
| `policy_classification_preview` | Classify a request against PM/security policy | Safe classification only | FP-06 policy gate |
| `source_summary_preview` | Summarize approved sanitized source evidence | Sanitized summary | FP-03 + FP-12 source safety |
| `task_contract_draft` | Draft a Task Contract | Draft text only | PM review |
| `risk_classification_suggestion` | Suggest Class A-E | Suggestion only; PM remains authority | PM/rules review |
| `qa_test_plan_draft` | Draft validation plan | Test plan only | FP-14 alignment |
| `security_scan_summary_draft` | Summarize sanitized security scan evidence | Safe summary only | FP-12 evidence |
| `evidence_summary_draft` | Summarize FP-16 evidence records | Safe summary only | FP-16 evidence refs |
| `blocker_summary_draft` | Draft blocker summary without unsafe content | Safe blocker text | FP-16 blocker evidence |
| `release_notes_draft` | Draft release notes from approved evidence | Draft only | Release gate evidence |
| `controlled_code_diff_draft` | Create review-only diff proposal | Draft diff only; no apply | FP-07/FP-08/FP-10 gates |

### Explicit non-actions for all allowed request types

Allowed AI request types must not:

- apply file changes;
- push to GitHub;
- call live providers without approval;
- run commands;
- deploy or restart;
- run migrations, db push, seed, reset, or DB writes;
- scan live environment;
- fetch credentialed sources;
- bypass PM approval;
- claim production readiness.

## 2. Rejected and Unknown Request Types

Unknown request types must be rejected, not guessed.

```yaml
unknown_request_policy:
  default_decision: BLOCKED
  reason_code: UNKNOWN_AI_REQUEST_TYPE
  evidence_required: true
  blocker_required: true
```

Rejected request types include:

```text
autonomous_code_apply
autonomous_repo_write
github_write_from_runtime
production_deploy
runtime_restart
public_api_exposure
db_migration_execution
db_push
seed
reset
live_db_write
real_ai_provider_activation_without_pm_approval
credentialed_source_fetch
private_vendor_sdk_fetch
raw_log_analysis_without_redaction
secret_extraction
prompt_body_logging
output_body_logging
policy_bypass_request
```

Rejected/unknown response shape:

```yaml
ai_policy_response:
  accepted: false
  status: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  prompt_body_logged: false
  output_body_logged: false
```

## 3. AI Request Schema Proposal

Future AI Gateway requests must use a bounded schema.

```yaml
ai_request:
  request_id: string
  package_id: string
  task_id: string | null
  request_type: string
  requested_by: string
  requested_role: PM | Tasker4 | Tasker5 | QA | SecurityReviewer | System
  risk_class: ClassA | ClassB | ClassC | ClassD | ClassE | null
  source_evidence_refs: array
  approval_refs: array
  blocker_refs: array
  constraints: array
  allowed_files: array
  forbidden_files: array
  max_output_tokens: number | null
  max_cost_units: number | null
  provider_mode: disabled | mock | dry_run | real_provider_requested
  prompt_summary: string
  prompt_body_ref: string | null
  prompt_body_inline_allowed: false
  output_body_logging_allowed: false
```

Required fields:

```text
request_id
package_id
request_type
requested_by
requested_role
provider_mode
prompt_summary
prompt_body_inline_allowed = false
output_body_logging_allowed = false
```

If required fields are missing, the request is `BLOCKED`.

## 4. Prompt/Input Redaction Policy

### Redaction before AI processing

The input/prompt must be checked and redacted before any AI model or mock provider receives it.

Sensitive categories:

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
internal IPs unless approved for internal-only evidence
customer data
private/vendor SDK content
live device/NOS output
unapproved vendor-private labels in customer-facing text
```

### Redaction behavior

- Replace unsafe content with fixed markers such as `[REDACTED_SECRET]`, `[REDACTED_TOKEN]`, `[REDACTED_COOKIE]`, `[REDACTED_PRIVATE_KEY]`, `[REDACTED_CONNECTION_STRING]`.
- Do not echo original value in errors, logs, docs, evidence, screenshots, or prompts.
- If redaction cannot safely preserve meaning, reject the request and route to blocker.
- Prompt summary may be logged only after redaction and must not contain raw body content.

### Redaction result shape

```yaml
input_redaction_result:
  redaction_applied: boolean
  unsafe_content_detected: boolean
  unsafe_categories: array
  sanitized_prompt_summary: string
  safe_to_send_to_model: boolean
  blocked_reason: string | null
```

## 5. Output Redaction Policy

AI output must be checked before storage, display, evidence capture, issue comments, or PM board notes.

Output must be blocked/redacted if it contains:

- secret-like values;
- raw env/token/cookie/credential content;
- raw logs, full headers, stack traces, raw HTML;
- DB reset/migration/push/seed instructions without PM approval;
- deployment/restart/public exposure instructions without PM approval;
- GitHub write/apply commands without approval;
- production readiness claims before final gate;
- policy bypass language;
- unsafe source/customer/runtime content.

Output redaction result:

```yaml
output_redaction_result:
  redaction_applied: boolean
  unsafe_output_detected: boolean
  unsafe_categories: array
  safe_output_summary: string
  safe_to_display: boolean
  blocked_reason: string | null
```

If output fails safety checks, do not store the output body. Store only a sanitized blocker/evidence summary.

## 6. No Prompt/Output Body Logging Rule

Prompt body and output body must not be logged.

Allowed logs:

```yaml
safe_ai_log:
  request_id: string
  package_id: string
  task_id: string | null
  request_type: string
  requested_by: string
  provider_mode: disabled | mock | dry_run | real_provider_requested
  policy_decision: PASS | FIX | BLOCKED
  redaction_applied: boolean
  unsafe_categories: array
  evidence_refs: array
  blocker_id: string | null
  created_at: string
```

Forbidden logs:

```text
prompt_body
output_body
raw model request
raw model response
raw headers
cookies
tokens
credentials
env values
connection strings
private keys
raw stack traces
raw logs
```

Any code path that attempts prompt/output body logging must be blocked by security gate.

## 7. Model/Provider Activation Gate

Default provider state:

```yaml
provider_mode_default: disabled
real_provider_allowed_without_pm_approval: false
```

Allowed provider modes:

| Mode | Meaning | Runtime/provider call allowed |
| --- | --- | --- |
| `disabled` | No provider selected | NO |
| `mock` | Deterministic local mock response | NO real provider |
| `dry_run` | Request validation only or mocked transport | NO real provider |
| `real_provider_requested` | PM approval request only | NO until approved |

Real provider activation requires:

```yaml
provider_activation_gate:
  pm_approval_ref: string
  provider_name: string
  model_name: string
  budget_limit: number
  data_policy_review: PASS
  redaction_policy_review: PASS
  logging_policy_review: PASS
  rollback_disable_plan: string
  expiry_or_review_date: string
```

Block provider activation when:

- PM approval is missing;
- provider/model not specified;
- budget limit missing;
- data/logging/redaction policy review missing;
- request includes secrets/raw unsafe content;
- request asks for autonomous code apply, repo write, DB action, deployment, or restart.

## 8. Budget and Limit Policy

Every AI request must have explicit limits before execution.

```yaml
ai_budget_limits:
  max_output_tokens: number
  max_input_refs: number
  max_source_refs: number
  max_cost_units: number | null
  timeout_ms: number
  max_retries: number
  allow_streaming: false
  allow_background_execution: false
```

Default limits for policy design:

```yaml
default_max_output_tokens: 1200
default_max_input_refs: 10
default_max_source_refs: 10
default_timeout_ms: 30000
default_max_retries: 0
```

Block or downgrade request when:

- limits missing;
- request exceeds configured limit;
- estimated cost exceeds PM-approved budget;
- request needs background/autonomous execution;
- repeated failures occur.

Budget evidence must never include provider credentials or account secrets.

## 9. Evidence Requirements

Every AI request decision must create evidence compatible with FP-16.

```yaml
ai_request_policy_evidence:
  evidence_id: string
  package_id: FP-06
  task_id: string | null
  request_id: string
  request_type: string
  requested_by: string
  provider_mode: disabled | mock | dry_run | real_provider_requested
  policy_decision: PASS | FIX | BLOCKED
  input_redaction_result_ref: string | null
  output_redaction_result_ref: string | null
  blocker_id: string | null
  approval_refs: array
  source_evidence_refs: array
  prompt_body_logged: false
  output_body_logged: false
  sanitized_summary: string
  created_at: string
```

Minimum evidence for allowed request:

- request type;
- requester and role;
- package/task;
- provider mode;
- policy decision;
- redaction result;
- evidence refs used;
- confirmation that prompt/output body were not logged.

Minimum evidence for blocked request:

- reason code;
- sanitized reason;
- blocker ref;
- unsafe categories without raw values;
- prompt/output body logging set to false.

## 10. Blocker Routing for Unsafe Requests

Unsafe AI requests must route to blocker evidence instead of proceeding.

Blocker reasons:

```text
UNKNOWN_AI_REQUEST_TYPE
UNSUPPORTED_AI_REQUEST_TYPE
PROMPT_REDACTION_FAILED
OUTPUT_REDACTION_FAILED
SECRET_LIKE_CONTENT_DETECTED
PROMPT_BODY_LOGGING_REQUESTED
OUTPUT_BODY_LOGGING_REQUESTED
REAL_PROVIDER_REQUIRES_PM_APPROVAL
BUDGET_LIMIT_MISSING
REQUEST_EXCEEDS_LIMIT
AUTONOMOUS_ACTION_REQUESTED
REPOSITORY_WRITE_REQUESTED
DB_ACTION_REQUESTED
DEPLOYMENT_OR_RESTART_REQUESTED
PUBLIC_API_EXPOSURE_REQUESTED
PRODUCTION_CLAIM_REQUESTED
```

Blocker evidence shape:

```yaml
ai_blocker:
  package_id: FP-06
  owner: Tasker4
  request_id: string
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  unsafe_categories: array
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include raw prompt body, raw output body, secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, full headers, or customer data.

## 11. Acceptance Criteria

FP-06 baseline is acceptable when it defines:

- allowed AI request types;
- rejected and unknown request behavior;
- request schema proposal;
- prompt/input redaction policy;
- output redaction policy;
- safe logging policy;
- no prompt/output body logging rule;
- provider/model activation gate;
- budget/limit policy;
- evidence requirements;
- blocker routing for unsafe requests;
- forbidden action confirmation.

## 12. Forbidden Actions Check

```yaml
real_ai_provider_activation: NO
prompt_output_body_logging: NO
env_secret_token_cookie_output: NO
db_action: NO
migration_reset_seed_db_push: NO
runtime_write: NO
deployment_restart: NO
runtime_smoke: NO
production_claim: NO
```

## 13. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-06 AI Request Policy + Redaction contract created at docs/pm-handoffs/fp-06-ai-request-policy-redaction.md. Covers allowed AI request types, rejected/unknown request handling, prompt/input redaction, output redaction, safe logging, no prompt/output body logging, model/provider activation gate, budget/limit policy, evidence requirements, and blocker routing for unsafe requests. Docs/policy only. No real AI provider activation. No prompt/output body logging. No secrets/env/token/cookie output. No DB action. No migration/reset/seed/db push. No runtime write. No deployment/restart/runtime smoke. No production claim.
```
