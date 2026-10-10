# SEKHEM — FP-09 Model / Provider Adapter Contract

## Package

`FP-09` — Model / Provider Adapter

## Owner

Tasker 4

## Status

In Progress / Contract Artifact

This file is a documentation/contract artifact only.

No real AI provider activation, API key usage, env/token/cookie/secret output, provider call, model execution, DB action, migration, reset, seed, db push, deployment, restart, runtime smoke, or production readiness claim is enabled by this file.

## Purpose

Define the safe Model / Provider Adapter contract for SEKHEM AI Gateway integration. FP-09 defines the provider registry model, local and hosted adapter options, off-switch, budget caps, provider activation approval gates, allowed request types, redaction-before-call requirements, safe logging, evidence requirements, and blocker routing.

FP-09 does not activate any provider or execute any model.

## Source Alignment

This contract aligns with:

- `docs/pm-handoffs/fp-06-ai-request-policy-redaction.md`
- `docs/pm-handoffs/fp-07-task-contract-risk-classification.md`
- `docs/pm-handoffs/fp-08-tool-router-sandbox.md`
- `docs/pm-handoffs/fp-13-risk-class-security-enforcement.md`
- `docs/pm-handoffs/fp-16-evidence-platform-contract.md`
- PM rule: no real AI provider activation without explicit PM approval
- PM rule: no secrets in repo, logs, screenshots, prompts, or docs
- PM rule: no production claim before final gate

## Risk Class

```text
Current artifact: docs/contract only
Future adapter implementation: Class C/D depending provider/runtime scope
```

Any future provider registry, adapter code, gateway call path, credential configuration, or model execution requires a separate approved implementation package.

## Adapter Principles

1. Provider mode defaults to `disabled`.
2. No provider call is allowed unless PM approval gate passes.
3. API keys and provider credentials must never be printed, logged, documented, or exposed to prompts.
4. Prompt/input redaction must pass before any provider call.
5. Output redaction must pass before display, storage, review, or evidence.
6. Prompt body and output body must not be logged.
7. Budget cap is mandatory before real provider activation.
8. Off-switch must be able to disable all provider use immediately.
9. Unknown provider, unknown model, unknown request type, missing budget, or missing approval fails closed.
10. Every decision must link to FP-16 evidence.

## 1. Provider Registry

Provider registry is a policy/configuration model only.

```yaml
provider_registry_entry:
  provider_id: string
  provider_name: string
  adapter_type: local_model | hosted_provider | mock | disabled
  lifecycle_state: proposed | disabled | pending_pm_approval | approved_for_dry_run | approved_for_real_use | blocked | retired
  default_enabled: false
  allowed_request_types: array
  allowed_risk_classes: array
  allowed_models: array
  budget_policy_ref: string | null
  data_policy_ref: string | null
  redaction_policy_ref: string | null
  logging_policy_ref: string | null
  approval_ref: string | null
  off_switch_ref: string
  evidence_refs: array
```

Provider lifecycle rules:

- `disabled` is the default state.
- `pending_pm_approval` may not call provider.
- `approved_for_dry_run` may validate requests without real provider calls.
- `approved_for_real_use` requires explicit PM approval and all safety evidence.
- `blocked` means no request may route to provider.

## 2. Local Model Adapter Option

Local model adapter option is allowed as a future design path only.

```yaml
local_model_adapter:
  adapter_type: local_model
  default_enabled: false
  allowed_without_pm_approval: false
  model_execution_allowed_in_this_phase: false
  network_required: false
  credential_required: false
  data_residency_advantage: possible
  constraints:
    - no model execution under FP-09
    - no prompt/output body logging
    - redaction required before call
    - output safety check required after call
    - budget/resource limit required
    - sandbox required for future execution
```

Local model blocker triggers:

- model execution requested in this phase;
- GPU/runtime resource allocation requested without approval;
- unredacted prompt requested;
- output body logging requested;
- local model configured with unsafe filesystem access;
- production readiness claim based on adapter contract.

## 3. Hosted Provider Adapter Option

Hosted provider adapter option is allowed as a future design path only.

```yaml
hosted_provider_adapter:
  adapter_type: hosted_provider
  default_enabled: false
  allowed_without_pm_approval: false
  provider_call_allowed_in_this_phase: false
  api_key_required_for_future_use: true
  api_key_output_allowed: false
  prompt_redaction_required: true
  output_redaction_required: true
  budget_cap_required: true
  logging_policy_required: true
  approval_gate_required: true
```

Hosted provider blocker triggers:

- API key usage in FP-09;
- provider call requested in FP-09;
- provider credentials printed or logged;
- missing PM approval;
- missing budget cap;
- missing data/redaction/logging policy review;
- unknown provider/model;
- request type not allowlisted.

## 4. Off-Switch

Global provider off-switch is mandatory.

```yaml
provider_off_switch:
  global_ai_providers_enabled: false
  disable_all_providers: true
  disable_reason: FP-09 contract phase only
  controlled_by: PM | SecurityReviewer | Tasker4
  emergency_disable_allowed: true
  emergency_disable_evidence_required: true
```

Off-switch rules:

- Default is all providers disabled.
- If off-switch is active, all provider calls are `BLOCKED`.
- Off-switch overrides provider-specific approvals until PM re-enables.
- Off-switch state must be visible in evidence and release gate checks.
- Off-switch must not expose secrets or provider credentials.

## 5. Budget Cap Policy

Budget cap is required before any future real provider use.

```yaml
provider_budget_cap:
  provider_id: string
  model_id: string
  max_requests_per_day: number
  max_requests_per_task: number
  max_input_tokens_per_request: number
  max_output_tokens_per_request: number
  max_cost_units_per_day: number
  max_cost_units_per_task: number
  timeout_ms: number
  max_retries: number
  hard_stop_on_budget_exceeded: true
  pm_approval_ref: string
```

Budget rules:

- Missing budget cap means `BLOCKED`.
- Exceeding budget cap means `BLOCKED`.
- Budget exception requires PM approval and expiry.
- Budget evidence must never include billing secrets, API keys, tokens, cookies, or account credentials.

## 6. Provider Activation Approval Gate

Real provider activation requires explicit PM approval.

```yaml
provider_activation_gate:
  activation_request_id: string
  provider_id: string
  model_id: string
  requested_by: string
  requested_use_case: string
  allowed_request_types: array
  risk_class: ClassC | ClassD
  pm_approval_ref: string
  security_review_ref: string
  redaction_review_result: PASS
  logging_review_result: PASS
  budget_cap_ref: string
  off_switch_checked: true
  rollback_disable_plan: string
  expiry_or_review_date: string
  final_decision: PASS | FIX | BLOCKED
```

Provider activation is blocked when:

- PM approval is missing;
- security review is missing;
- budget cap is missing;
- redaction/logging review is missing;
- off-switch is active;
- provider/model is not in registry;
- request type is not allowlisted;
- prompt/output body logging is requested;
- secrets or credentials are present.

## 7. Allowed Request Types

FP-09 inherits FP-06 allowed AI request types. Provider adapter may only support request types explicitly listed in both FP-06 and the provider registry.

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

Request type rules:

- Unknown request type is `BLOCKED`.
- Request type not enabled for provider is `BLOCKED`.
- `controlled_code_diff_draft` remains draft only and must not apply files.
- Autonomous code apply, repo write, deployment, restart, DB action, or public exposure requests are rejected.

## 8. Redaction Before Provider Call

No provider call may occur before prompt/input redaction passes.

```yaml
pre_provider_redaction:
  request_id: string
  redaction_result: PASS | FIX | BLOCKED
  unsafe_content_detected: boolean
  unsafe_categories: array
  sanitized_prompt_summary_ref: string
  prompt_body_logged: false
  safe_to_call_provider: boolean
```

Rules:

- If redaction result is not `PASS`, provider call is `BLOCKED`.
- Prompt body must not be logged.
- Unsafe content must be replaced or blocked before model use.
- Secrets, tokens, cookies, credentials, private keys, env values, connection strings, raw logs, raw headers, raw HTML, customer data, and unsafe device output are blocked.

## 9. Output Redaction and Safety

Output must be redacted and safety-checked before storage, display, evidence, or reviewer routing.

```yaml
post_provider_output_safety:
  request_id: string
  output_redaction_result: PASS | FIX | BLOCKED
  unsafe_output_detected: boolean
  unsafe_categories: array
  safe_output_summary_ref: string
  output_body_logged: false
  safe_to_display: boolean
```

Rules:

- Output body must not be logged.
- Unsafe output is blocked and summarized safely.
- Output must not include secrets, unsafe commands, DB reset/migration/push/seed instructions without approval, deployment/restart instructions without approval, or production readiness claim.

## 10. Safe Logging Policy

Only metadata logging is allowed.

```yaml
provider_safe_log:
  request_id: string
  provider_id: string | null
  model_id: string | null
  adapter_type: local_model | hosted_provider | mock | disabled
  provider_mode: disabled | mock | dry_run | real_provider_requested | real_provider_approved
  request_type: string
  policy_decision: PASS | FIX | BLOCKED
  redaction_applied: boolean
  budget_checked: boolean
  off_switch_checked: boolean
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
api_key
authorization header
cookies
tokens
credentials
private keys
env values
connection strings
raw logs
full headers
```

Any attempt to log forbidden values is `BLOCKED`.

## 11. Evidence Requirements

Every provider routing decision must create or link FP-16-compatible evidence.

```yaml
provider_adapter_evidence:
  evidence_id: string
  package_id: FP-09
  task_id: string | null
  request_id: string
  provider_id: string | null
  model_id: string | null
  adapter_type: local_model | hosted_provider | mock | disabled
  provider_mode: disabled | mock | dry_run | real_provider_requested | real_provider_approved
  activation_gate_result: PASS | FIX | BLOCKED | NOT_REQUESTED
  off_switch_state: enabled | disabled_all
  budget_cap_ref: string | null
  redaction_evidence_refs: array
  logging_policy_result: PASS | FIX | BLOCKED
  blocker_id: string | null
  sanitized_summary: string
  prompt_body_logged: false
  output_body_logged: false
  provider_call_executed: false
  model_execution_executed: false
  created_at: string
```

Minimum evidence for FP-09 PM Review:

- provider registry defined;
- local adapter option defined;
- hosted adapter option defined;
- off-switch defined;
- budget cap defined;
- provider activation gate defined;
- redaction/safe logging defined;
- no provider activation in this phase confirmed.

## 12. Blocker Routing

Blocker reasons:

```text
PROVIDER_NOT_REGISTERED
MODEL_NOT_REGISTERED
REQUEST_TYPE_NOT_ALLOWED
OFF_SWITCH_ACTIVE
MISSING_PM_PROVIDER_APPROVAL
MISSING_SECURITY_REVIEW
MISSING_BUDGET_CAP
BUDGET_CAP_EXCEEDED
REDACTION_NOT_PASS
OUTPUT_SAFETY_NOT_PASS
PROMPT_BODY_LOGGING_REQUESTED
OUTPUT_BODY_LOGGING_REQUESTED
API_KEY_USAGE_REQUESTED_IN_CONTRACT_PHASE
PROVIDER_CALL_REQUESTED_IN_CONTRACT_PHASE
MODEL_EXECUTION_REQUESTED_IN_CONTRACT_PHASE
SECRET_OR_CREDENTIAL_DETECTED
PRODUCTION_CLAIM_REQUESTED
```

Blocker shape:

```yaml
provider_adapter_blocker:
  blocker_id: string
  package_id: FP-09
  task_id: string | null
  owner: Tasker4
  blocking_owner: PM | SecurityReviewer | Tasker4 | QA
  reason_code: string
  severity: low | medium | high | critical
  customer_safe_summary: string
  pm_decision_needed: string | null
  evidence_refs: array
  created_at: string
```

Blocker summaries must not include API keys, tokens, cookies, credentials, private keys, env values, connection strings, prompt body, output body, raw model request, raw model response, raw logs, or full headers.

## 13. Fail-Closed Behavior

The provider adapter gate must fail closed.

Fail-closed triggers:

```text
unknown_provider
unknown_model
unknown_request_type
provider_registry_missing
off_switch_state_unknown
budget_cap_missing
pm_approval_missing
security_review_missing
redaction_result_missing
logging_policy_result_missing
unsafe_content_detected
provider_mode_unknown
```

Fail-closed response:

```yaml
provider_adapter_response:
  accepted: false
  result: BLOCKED
  reason_code: string
  sanitized_reason: string
  blocker_required: true
  evidence_required: true
  provider_call_executed: false
  model_execution_executed: false
```

If the adapter cannot determine safety, it returns `BLOCKED`.

## 14. Backend Dependency

Backend implementation is needed for production provider routing but is not authorized here.

```yaml
backend_dependency_needed: YES
reason: Production provider adapter requires provider registry, off-switch state, budget enforcement, approval validation, redaction enforcement, safe logging, evidence writer integration, and blocker routing.
```

Future implementation must include:

- provider registry API/config;
- off-switch enforcement;
- budget counter/enforcement;
- provider activation approval validator;
- redaction-before-call middleware;
- output safety middleware;
- safe metadata-only logging;
- FP-16 evidence writer;
- blocker router;
- tests for off-switch, missing approval, missing budget, unknown request/provider/model, redaction failure, and no body logging;
- no real provider activation until explicit PM approval.

## 15. Acceptance Criteria

FP-09 contract is acceptable when it defines:

- provider registry;
- local model adapter option;
- hosted provider adapter option;
- off-switch;
- budget cap;
- provider activation approval gate;
- allowed request types;
- redaction before provider call;
- safe logging;
- evidence requirements;
- blocker routing;
- no provider activation in this phase;
- backend dependency;
- forbidden action confirmation.

## 16. Forbidden Actions Check

```yaml
real_ai_provider_activation: NO
api_key_usage: NO
env_token_cookie_secret_output: NO
provider_call: NO
model_execution: NO
db_action: NO
migration_reset_seed_db_push: NO
deployment_restart: NO
runtime_smoke: NO
production_claim: NO
```

## 17. PM / QA Review Recommendation

Recommended board update:

```text
Status: PASS / PM Review
Notes/Evidence: FP-09 Model/Provider Adapter contract created at docs/pm-handoffs/fp-09-model-provider-adapter.md. Covers provider registry, local model adapter option, hosted provider adapter option, off-switch, budget cap, provider activation approval gate, allowed request types, redaction before provider call, safe logging, evidence requirements, blocker routing, fail-closed behavior, and backend dependency. Docs/contract only. No real AI provider activation. No API key usage. No env/token/cookie/secret output. No provider call. No model execution. No DB action. No migration/reset/seed/db push. No deployment/restart/runtime smoke. No production claim.
```
