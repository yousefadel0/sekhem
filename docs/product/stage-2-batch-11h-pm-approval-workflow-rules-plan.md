# Stage 2 Batch 11H — PM Approval Workflow Rules Plan

## Purpose

This document defines planning rules for a PM approval workflow that may later promote a draft candidate initiative proposal into a real initiative.

This is planning only. It does not execute anything, create a real initiative, create tasks, call AI, write to a database, persist data, activate workflows, expose triggers, or change the frontend.

## Context

Stage 2 Batch 11G-Execution is approved to close based on the submitted Tasker report.

Important limitation:

- Batch 11G-Execution was not independently verified from n8n/server runtime.
- The candidate proposal exists as a manual/internal draft proposal simulation only.
- No promotion to a real initiative is allowed without independent runtime verification before promotion.

Candidate proposal:

```text
candidate-csf-guided-risk-assessment-001
```

Recommended next gate:

```text
PM_REVIEW_REQUIRED
```

## Scope

Planning only.

This plan defines:

- PM approval workflow states.
- required PM review fields.
- runtime verification requirement before promotion.
- approval rules.
- rejection rules.
- sanitized PM approval decision object.
- QA gate.

## Explicit Non-Scope

This plan does not authorize:

- execution.
- real initiative creation.
- task creation.
- AI provider use.
- AI enrichment.
- database writes.
- persistence.
- runtime source-control writes.
- workflow activation.
- public or scheduled trigger.
- frontend cutover.
- private credentials or raw source content in docs, logs, workflow exports, or reports.

---

# PM Approval Workflow States

A future PM approval workflow must use these controlled states only.

## draft_candidate_created

A sanitized draft candidate proposal object exists. It is not a real initiative and cannot be promoted without PM review and runtime verification.

## pm_review_pending

The candidate is ready for PM review. PM decision has not been made.

## pm_approved_for_initiative_creation

PM explicitly approves the candidate for a later initiative creation path. Approval must define scope and still does not create a real initiative by itself.

Required condition:

```json
"requiresRuntimeVerificationBeforePromotion": true
```

## pm_rejected

PM rejects the candidate. No initiative or task should be created.

## more_evidence_required

PM requires more reviewed evidence before decision. Evidence collection needs a separate approved batch.

## domain_expert_review_required

PM requires expert review before approval. External sharing requires separate approval where applicable.

---

# Required PM Review Fields

A sanitized PM approval decision object must include:

```json
{
  "candidateId": "candidate-csf-guided-risk-assessment-001",
  "proposalTitle": "Draft Candidate: CSF-Guided Cybersecurity Risk Assessment Path",
  "sourceReviewObjectIds": [
    "review-nist-csf-main-001",
    "review-nist-csf-quick-start-001",
    "review-nist-csf-profiles-001"
  ],
  "evidenceScoresSummary": {
    "averageRelevanceScore": 4.33,
    "highestReliabilityScore": 5,
    "lowestReliabilityScore": 5,
    "needsMoreSourcesPresent": true
  },
  "expectedBusinessValue": "Human-reviewed business value hypothesis only",
  "uncertaintyRisks": [
    "Known uncertainty or risk"
  ],
  "requiredAdditionalEvidence": [
    "Additional evidence requirement"
  ],
  "pmDecision": "more_evidence_required",
  "pmDecisionReason": "Human-written PM reason",
  "approvedScopeIfAny": "none",
  "nextGate": "COLLECT_MORE_EVIDENCE_REQUIRED",
  "requiresRuntimeVerificationBeforePromotion": true
}
```

## Field Rules

### candidateId

Must match the candidate proposal ID:

```text
candidate-csf-guided-risk-assessment-001
```

### sourceReviewObjectIds

Must include reviewed evidence objects only.

Current allowed review objects:

- `review-nist-csf-main-001`
- `review-nist-csf-quick-start-001`
- `review-nist-csf-profiles-001`

### evidenceScoresSummary

Must summarize human review scores only. It must not include automated or AI scoring.

### uncertaintyRisks

Must include unresolved risks, including:

- 11G-Execution was not independently verified from n8n/server runtime.
- profiles evidence may require more sources.
- domain expert review may be needed before real initiative creation.

### requiredAdditionalEvidence

Must be non-empty when any included review object has:

```text
reviewerDecision=needs_more_sources
```

### pmDecision

Approved PM decision values:

- `approve_for_later_initiative_creation`
- `reject`
- `more_evidence_required`
- `domain_expert_review_required`
- `hold`

### approvedScopeIfAny

If PM approves, this field must define the exact approved scope. If not approved, use:

```text
none
```

### nextGate

Approved next gate values:

- `RUNTIME_VERIFICATION_REQUIRED`
- `PM_REVIEW_REQUIRED`
- `COLLECT_MORE_EVIDENCE_REQUIRED`
- `DOMAIN_EXPERT_REVIEW_REQUIRED`
- `REJECT_CANDIDATE`
- `SEPARATE_INITIATIVE_CREATION_SCOPE_REQUIRED`

### requiresRuntimeVerificationBeforePromotion

Must always be:

```json
true
```

---

# Runtime Verification Requirement Before Promotion

Before any real initiative creation, the system must validate and capture independent runtime verification proof.

Required runtime verification fields:

```json
{
  "n8nWorkflowId": "workflow-id",
  "n8nExecutionId": "execution-id-if-available",
  "sanitizedExecutionSummary": "sanitized summary only",
  "workflowActiveFalseProof": true,
  "nodeList": [
    "Manual Trigger",
    "Validation Node",
    "Sanitized Output Node"
  ],
  "timestamp": "ISO-8601 timestamp",
  "proofNoCredentials": true,
  "proofNoForbiddenNodes": true,
  "proofNoPersistence": true,
  "proofNoDbWrites": true,
  "proofNoPublicTrigger": true,
  "proofNoScheduledTrigger": true
}
```

Runtime verification must confirm:

- n8n workflow ID.
- n8n execution ID if available.
- sanitized execution summary.
- workflow `active=false` proof.
- node list.
- timestamp.
- proof no credentials.
- proof no forbidden nodes.
- proof no persistence.
- proof no database writes.
- proof no public trigger.
- proof no scheduled trigger.

If runtime verification is missing, incomplete, or inconsistent, promotion must be rejected.

---

# Approval Rules

## Rule 1 — PM approval must be explicit

PM approval must be clearly recorded in the sanitized PM decision object.

## Rule 2 — PM approval must define scope

If approved, `approvedScopeIfAny` must define what is approved and what remains excluded.

## Rule 3 — PM approval does not imply database write

PM approval must not imply database write unless a separate persistence scope exists.

## Rule 4 — PM approval does not imply AI enrichment

PM approval must not imply AI enrichment unless a separate AI scope exists.

## Rule 5 — PM approval does not imply task creation

PM approval must not imply task creation unless a separate task scope exists.

## Rule 6 — PM approval does not bypass runtime verification

Before any real initiative creation, runtime verification must pass.

## Rule 7 — PM approval does not create a real initiative

Approval may only move the candidate to a later controlled gate. Real initiative creation requires a separate approved implementation/execution task.

---

# Rejection Rules

Reject promotion if any of the following is true:

- runtime verification proof is missing or incomplete.
- `createdAsDraftOnly` is not true.
- `sourceExecutionBatchStatus` is not `QA_APPROVED_PASS`.
- `requiredAdditionalEvidence` exists and remains unresolved.
- `pmDecision` is missing or not approved.
- real initiative creation path has no rollback/disable plan.
- output includes raw source content, raw HTML, full headers, private credentials, AI-generated conclusions, database write results, production initiative IDs, or task IDs.

---

# Sanitized PM Approval Decision Output

The output must be a sanitized PM approval decision object only.

Example:

```json
{
  "pmApprovalDecisionId": "pm-decision-temp-001",
  "candidateId": "candidate-csf-guided-risk-assessment-001",
  "proposalTitle": "Draft Candidate: CSF-Guided Cybersecurity Risk Assessment Path",
  "sourceReviewObjectIds": [
    "review-nist-csf-main-001",
    "review-nist-csf-quick-start-001",
    "review-nist-csf-profiles-001"
  ],
  "evidenceScoresSummary": {
    "averageRelevanceScore": 4.33,
    "highestReliabilityScore": 5,
    "lowestReliabilityScore": 5,
    "needsMoreSourcesPresent": true
  },
  "expectedBusinessValue": "Potential future value includes clearer R&D Radar recommendations and more structured cybersecurity initiative proposals.",
  "uncertaintyRisks": [
    "Batch 11G-Execution was not independently verified from n8n/server runtime.",
    "CSF Profiles evidence requires more sources before product workflow mapping.",
    "Domain expert validation is required before real initiative creation."
  ],
  "requiredAdditionalEvidence": [
    "Runtime verification proof for the candidate proposal simulation.",
    "Additional reviewed sources for CSF Profiles methodology.",
    "Domain expert review before promotion."
  ],
  "pmDecision": "more_evidence_required",
  "pmDecisionReason": "Candidate is promising but cannot be promoted until runtime verification and additional evidence are complete.",
  "approvedScopeIfAny": "none",
  "nextGate": "COLLECT_MORE_EVIDENCE_REQUIRED",
  "requiresRuntimeVerificationBeforePromotion": true,
  "safety": {
    "realInitiativeCreated": false,
    "taskCreated": false,
    "databaseWriteExecuted": false,
    "persisted": false,
    "sourceControlRuntimeWriteExecuted": false,
    "aiProviderUsed": false,
    "aiEnrichmentExecuted": false,
    "workflowActivated": false,
    "publicTriggerUsed": false,
    "scheduledTriggerUsed": false,
    "rawContentIncluded": false,
    "rawHtmlIncluded": false,
    "fullHeadersIncluded": false
  }
}
```

---

# Validation Rules

Before accepting a PM approval decision object, validation must confirm:

- `candidateId` exists.
- `proposalTitle` exists.
- `sourceReviewObjectIds` exists and is non-empty.
- `evidenceScoresSummary` exists.
- `expectedBusinessValue` exists.
- `uncertaintyRisks` exists.
- `requiredAdditionalEvidence` exists when unresolved evidence is present.
- `pmDecision` is in approved decision set.
- `pmDecisionReason` exists.
- `approvedScopeIfAny` exists.
- `nextGate` is approved.
- `requiresRuntimeVerificationBeforePromotion=true`.
- if PM approval is granted, scope is explicit.
- if promotion is requested, runtime verification proof exists.
- no real initiative was created.
- no task was created.
- no database write occurred.
- no persistence occurred.
- no AI provider or AI enrichment was used.
- no workflow activation occurred.
- no public or scheduled trigger was used.
- no raw source content, raw HTML, full headers, or private credential material is present.

Reject if any validation rule fails.

---

# QA Gate

QA should verify:

- plan only.
- no execution.
- no real initiative creation.
- no task creation.
- no AI provider.
- no AI enrichment.
- no database writes.
- no persistence.
- no runtime source-control writes.
- no workflow activation.
- no public trigger.
- no scheduled trigger.
- no frontend cutover.
- no private credentials.
- no raw source content.
- PM approval workflow states are defined.
- required PM review fields are defined.
- runtime verification requirement is explicit.
- approval rules are complete.
- rejection rules are complete.
- sanitized PM approval decision output is defined.
- `requiresRuntimeVerificationBeforePromotion=true` is mandatory.
- PM approval does not imply database write, AI enrichment, task creation, or real initiative creation without separate scope.

Required QA decision:

- `APPROVED FOR PM REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve execution, real initiative creation, task creation, AI, database writes, persistence, runtime source-control writes, workflow activation, public triggers, scheduled triggers, frontend changes, or production changes.
