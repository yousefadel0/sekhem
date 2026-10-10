# Issue 1960 - AI Gateway Controlled Architecture

Issue ID: 1960
Owner: Tasker 5 / Architect
Decision: Architecture only

## 1. Purpose

The AI Gateway is a future controlled boundary between Sekhem backend services and approved AI providers.

The Gateway will:

- route approved requests to an approved provider adapter later.
- enforce policy before any provider call.
- redact secrets and sensitive values before prompt construction.
- record sanitized audit metadata.
- block unsafe operations.
- return citation-bearing draft responses for human review where required.

This issue does not implement the Gateway, connect a provider, add credentials, change environment files, change backend code, change frontend code, migrate a database, deploy a service, or claim production readiness.

## 2. Architecture Summary

```text
Customer-safe product screen
  -> Backend API
    -> Approved source retrieval
      -> Knowledge Base
      -> RAG Index Preview
      -> Repository Source Adapter (read-only)
    -> AI Gateway
      -> Request validation
      -> Policy check
      -> Secret and sensitive-value redaction
      -> Safe prompt builder
      -> Provider adapter interface
        -> Mock adapter first
        -> Approved provider adapter later
      -> Response validation
      -> Citation attachment
      -> Confidence and risk flags
      -> Human review gate where needed
      -> Sanitized audit metadata
    -> Customer-safe draft response
```

The backend remains the control plane. Product screens and automation workflows must not call a provider directly.

## 3. Future Provider Types

Provider routing must remain generic. Customer-facing UI must not expose provider names.

Supported future provider types:

| Provider type | Meaning | Activation rule |
| --- | --- | --- |
| `cloud_provider` | Approved externally hosted AI service | Disabled until separately approved with credential-store and data-handling review |
| `private_model` | Approved privately hosted model service | Disabled until separately approved with private runtime and access-control review |
| `on_prem_model` | Approved model hosted inside a controlled on-prem environment | Disabled until separately approved with infrastructure and operational review |
| `mock_provider` | Deterministic fixture adapter for contract validation | First implementation target in Issue 1963 |

No provider is activated by Issue 1960.

## 4. Gateway Contract

The following shapes are architecture contracts. Endpoint names are proposals for Tasker 4 review during Issue 1961. Issue 1960 does not create backend APIs.

### 4.1 Request

```json
{
  "requestId": "ai-request-temp-001",
  "requestType": "rag_answer_preview",
  "userQuestion": "Customer-safe user question",
  "approvedSourceRefs": [
    "knowledge-item:knowledge-001"
  ],
  "retrievalMode": "approved_sources_only",
  "providerRoutingPolicy": "mock_only",
  "responseMode": "draft_with_citations",
  "humanReviewRequired": true
}
```

Rules:

- `requestId` is temporary and sanitized.
- `requestType` must be allowlisted.
- retrieval uses approved sources only.
- prompt construction happens after policy and redaction checks.
- provider routing remains `mock_only` until a later approved phase.
- risky outputs require human review.

### 4.2 Response

```json
{
  "requestId": "ai-request-temp-001",
  "status": "draft_ready_for_review",
  "answerPreview": "Sanitized draft response",
  "citations": [
    {
      "citationRef": "knowledge-item:knowledge-001",
      "citationLabel": "Approved knowledge source"
    }
  ],
  "confidence": {
    "band": "medium",
    "requiresHumanReview": true
  },
  "riskFlags": [],
  "providerType": "mock_provider",
  "auditMetadata": {
    "policyCheck": "PASS",
    "redactionCheck": "PASS",
    "providerCallExecuted": false,
    "autonomousActionExecuted": false
  }
}
```

Rules:

- responses are drafts unless a later approved workflow defines a different safe state.
- citations are mandatory for RAG answer previews.
- provider type is internal metadata and should not be displayed in customer-facing UI.
- raw prompts, raw provider responses, credentials, tokens, and stack traces are excluded.
- Issue 1960 records `providerCallExecuted=false`.

### 4.3 Allowlisted Request Types

Initial architecture allowlist:

- `rag_answer_preview`
- `knowledge_summary_preview`
- `repository_context_summary_preview`
- `ai_patch_explanation_preview`
- `risk_review_preview`

These are preview/draft request types only. They do not authorize provider execution.

## 5. Request Lifecycle

1. User asks a question or requests an allowed preview.
2. Backend validates the request type and customer-safe input.
3. Backend retrieves approved sources only.
4. Gateway policy layer validates source scope and action scope.
5. Gateway redaction layer removes secrets and sensitive values.
6. Safe prompt builder creates the minimum necessary prompt.
7. Provider adapter receives the safe prompt later, after separate approval.
8. Response validator rejects unsafe, uncited, or over-scoped output.
9. Citation layer attaches approved source references.
10. Confidence and risk layer adds review flags.
11. Human review gate is required where risk, confidence, or action type demands it.
12. Backend returns a customer-safe draft response and sanitized audit metadata.

For Issue 1960, step 7 is architecture only. No provider call occurs.

## 6. Safety Controls

### 6.1 Prompt Safety

- no secrets in prompts.
- no tokens, credentials, auth headers, environment values, private keys, or connection strings.
- no raw logs or stack traces.
- no internal IPs or private URLs in customer-facing output.
- prompt includes only the minimum approved source excerpts or sanitized summaries.

### 6.2 Action Safety

- no source code write.
- no repository write.
- no branch, commit, issue, pull request, merge, or force-push action.
- no deployment.
- no autonomous execution.
- no direct database write from automation.
- no initiative or task creation.
- no public or scheduled trigger.

### 6.3 Provider Safety

- provider routing defaults to `mock_only`.
- provider credentials must live only in an approved runtime credential store later.
- no credentials in repository files, docs, logs, screenshots, prompts, or responses.
- provider calls require a later approved phase and fail closed when policy is missing.
- provider errors collapse into a customer-safe unavailable state without raw errors.

### 6.4 Response Safety

- citations required for RAG answers.
- low-confidence responses must be marked for human review.
- policy risk flags must be included when output may affect security, code, deployment, or customer commitments.
- response must remain draft-only when human approval is required.
- unsafe response content is rejected before customer display.

### 6.5 Confidence And Risk Flags

Confidence bands:

- `high`
- `medium`
- `low`
- `insufficient_evidence`

Risk flags:

- `human_review_required`
- `insufficient_evidence`
- `uncited_claim`
- `sensitive_content_redacted`
- `security_review_required`
- `repository_write_forbidden`
- `deployment_forbidden`
- `autonomous_execution_forbidden`

There is no auto-approval threshold. A high confidence band does not bypass policy or human review requirements.

## 7. Audit Metadata

The Gateway should log sanitized metadata only:

```json
{
  "requestId": "ai-request-temp-001",
  "requestType": "rag_answer_preview",
  "timestamp": "ISO-8601 timestamp",
  "approvedSourceRefCount": 1,
  "policyCheck": "PASS",
  "redactionCheck": "PASS",
  "providerRoutingPolicy": "mock_only",
  "providerCallExecuted": false,
  "citationCount": 1,
  "confidenceBand": "medium",
  "riskFlags": [
    "human_review_required"
  ],
  "humanReviewRequired": true,
  "autonomousActionExecuted": false
}
```

Audit metadata must not store:

- raw prompts.
- raw provider responses.
- credentials or tokens.
- environment values.
- raw source code.
- raw logs or stack traces.

## 8. Integration Map

| Integration point | Gateway use | Current boundary |
| --- | --- | --- |
| Knowledge Base | Supplies approved sanitized source records | Read-only source retrieval |
| RAG Index Preview | Supplies citation-bearing preview chunks | Preview-only, no embeddings, no vector DB, no AI answer |
| RAG Answer Preview | Future draft answer with citations | Gateway mock-first contract; no provider call in Issue 1960 |
| Repository Source Adapter | Supplies approved repository context summaries | Read-only provider-neutral adapter; no repository writes |
| AI Patch audit | Records draft request, review, approve/reject/stop metadata | No auto-apply, no repository write, no deployment |

### Integration Rules

- Knowledge Base and Repository Source Adapter are inputs, never autonomous action channels.
- RAG Index Preview remains read-only and citation-bearing.
- RAG Answer Preview must use approved sources only and return a draft with citations.
- AI Patch remains an audit/review workflow. Gateway output cannot apply a patch.
- Backend APIs remain the only product integration boundary.

## 9. Implementation Phases

### Issue 1960 - Controlled architecture

Owner: Tasker 5 / Architect

- define purpose, contract, lifecycle, safety controls, integration map, and customer-safe meaning.
- documentation only.

### Issue 1961 - Gateway API stub

Owner: Tasker 4 after separate approval

- add backend-owned mock-only API contract.
- return deterministic fixture response.
- no provider call.
- no credentials.
- no DB migration unless separately approved.

### Issue 1962 - Policy and redaction layer

Owner: Tasker 4 with Tasker 5 contract review after separate approval

- implement allowlisted request types.
- implement fail-closed policy checks.
- implement secret and sensitive-value redaction.
- log sanitized audit metadata only.

### Issue 1963 - Provider adapter mock

Owner: Tasker 4 with Tasker 5 contract review after separate approval

- implement provider-neutral adapter interface.
- use deterministic mock adapter only.
- verify citations, confidence bands, risk flags, and human review gates.
- no real provider connection.

### Issue 1964 - Private provider integration later

Owner: PM-approved implementation owners after separate approval

- select one approved private provider path.
- use runtime credential store only.
- complete data-handling, network, audit, rollback, and disable-plan review.
- keep customer UI provider-neutral.
- prohibit autonomous actions.

Issue 1964 does not start automatically after Issue 1963.

## 10. Customer-Safe Meaning

The customer may later see:

- `Answer Preview`
- `Sources`
- `Readiness Check`
- `Needs review`
- `Sample view`
- `Live data`

The customer should understand:

- the answer is based on approved sources.
- citations are available.
- some responses require human review.
- the system can prepare a draft, not take autonomous action.
- readiness and review state are visible.

The customer must not see:

- provider names.
- automation vendor names.
- internal model names.
- raw prompts.
- credentials, secrets, tokens, or environment values.
- internal IPs or private URLs.
- raw logs, stack traces, or full headers.
- claims that AI, RAG, provider routing, deployment, patch application, or autonomous execution is active before separately approved implementation and validation.

## 11. Explicit Non-Scope

Issue 1960 does not authorize:

- any cloud, private, on-prem, or local model call.
- API keys or credentials.
- environment file changes.
- backend implementation.
- frontend implementation.
- database migration.
- database write.
- runtime integration.
- deployment.
- production claim.
- source code write.
- repository write.
- GitHub write from product.
- AI Patch auto-apply.
- autonomous execution.
