# Stage 2 Batch 11G — Candidate Initiative Proposal Rules Plan

## Purpose

This document defines planning rules for converting reviewed and scored R&D evidence into a sanitized candidate initiative proposal later.

This is a planning-only governance document. It does not create a real initiative, create tasks, call AI, write to a database, persist data, activate workflows, expose public triggers, or change frontend behavior.

## Context

Stage 2 Batch 11F-Execution is closed and passed.

The R&D Collector path has completed this controlled chain:

```text
Collect → Sanitize → Human Review → Score → Recommended Next Action
```

Batch 11G prepares the next planning gate: converting reviewed/scored evidence into a candidate initiative proposal object at a later approved phase.

The candidate initiative proposal is not a real initiative. It is a sanitized draft object that requires PM approval before any downstream workflow, database write, task creation, or product action.

## Scope

Planning only.

This plan defines:

- candidate initiative proposal fields.
- eligibility rules.
- rejection rules.
- sanitized output object.
- governance restrictions.
- QA gate.

## Explicit Non-Scope

This plan does not authorize:

- execution.
- AI provider calls.
- AI enrichment.
- DB writes.
- persistence.
- automatic initiative creation.
- task creation.
- workflow activation.
- public trigger.
- scheduled trigger.
- frontend cutover.
- secrets in docs, logs, workflow exports, or reports.
- raw page content.
- raw HTML.
- full response headers.

---

# Candidate Initiative Proposal Fields

A future candidate initiative proposal object must include the following fields:

```json
{
  "initiativeCandidateId": "candidate-temp-001",
  "sourceReviewObjectIds": [
    "review-nist-csf-main-001",
    "review-nist-csf-quick-start-001",
    "review-nist-csf-profiles-001"
  ],
  "sourceExecutionBatchId": "stage-2-batch-11e-execution",
  "proposalTitle": "Draft candidate initiative title",
  "problemStatement": "Sanitized human-written problem statement",
  "evidenceSummary": "Sanitized summary of reviewed evidence only",
  "relevanceRationale": "Human-written explanation of why evidence supports candidate consideration",
  "expectedBusinessValue": "Human-written expected business value hypothesis",
  "uncertaintyRisks": [
    "Known uncertainty or risk 1",
    "Known uncertainty or risk 2"
  ],
  "requiredAdditionalEvidence": [
    "Additional evidence requirement 1"
  ],
  "recommendedOwnerRole": "Product Manager / Domain Expert / Security Architect",
  "recommendedNextGate": "PM_REVIEW_REQUIRED",
  "requiresPMApproval": true,
  "createdAsDraftOnly": true
}
```

## Field Definitions

### initiativeCandidateId

Temporary draft identifier for the proposal object.

Rules:

- must not be a production initiative ID.
- must not imply persistence.
- should use a temporary/draft naming convention.

### sourceReviewObjectIds

List of reviewed/scored evidence review object IDs used to support the candidate proposal.

Rules:

- must reference human-reviewed objects only.
- must not reference raw evidence objects directly unless a review object exists.
- must not include unreviewed, rejected, or unsafe evidence.

### sourceExecutionBatchId

Execution batch that produced the sanitized evidence.

Rules:

- must have `sourceExecutionBatchStatus=QA_APPROVED_PASS`.
- must not be failed, aborted, partial, unknown, or unapproved.

### proposalTitle

Short human-written title for the candidate initiative.

Rules:

- must be draft wording.
- must not claim approval.
- must not imply implementation has started.

### problemStatement

Human-written statement of the problem or opportunity suggested by the evidence.

Rules:

- must be based only on sanitized reviewed evidence.
- must not include raw page content.
- must not include AI-generated conclusions.
- must not overclaim beyond evidence.

### evidenceSummary

Short sanitized summary of the reviewed evidence used to justify the candidate.

Rules:

- must include reviewed evidence only.
- must not include raw HTML, full text, headers, or hidden metadata.
- must not include unsupported conclusions.

### relevanceRationale

Human-written explanation of why the reviewed/scored evidence is relevant.

Rules:

- must reference review scores and reviewer decisions.
- must not automate final approval.

### expectedBusinessValue

Human-written business value hypothesis.

Examples:

- improved product clarity.
- stronger R&D Radar initiative quality.
- better cybersecurity framework mapping.
- more structured customer-facing guidance later.

Rules:

- must be framed as hypothesis.
- must require PM validation.

### uncertaintyRisks

Known uncertainties or risks that must be reviewed before any initiative is created.

Examples:

- source coverage may be incomplete.
- domain expert validation required.
- business applicability needs market validation.
- implementation scope may be larger than evidence suggests.

### requiredAdditionalEvidence

Additional evidence that must be collected or reviewed before moving forward.

Rules:

- required when any source review has `reviewerDecision=needs_more_sources`.
- required when risk notes identify missing context.
- does not authorize source collection by itself.

### recommendedOwnerRole

Suggested human owner role for later review.

Allowed examples:

- Product Manager.
- Domain Expert.
- Security Architect.
- R&D Lead.
- PM.

### recommendedNextGate

Next governance gate before any action.

Allowed values:

- `PM_REVIEW_REQUIRED`.
- `DOMAIN_EXPERT_REVIEW_REQUIRED`.
- `COLLECT_MORE_EVIDENCE_REQUIRED`.
- `REJECT_CANDIDATE`.

### requiresPMApproval

Must always be:

```json
true
```

### createdAsDraftOnly

Must always be:

```json
true
```

---

# Eligibility Rules

A candidate initiative proposal object may be drafted only if all eligibility rules pass.

## Rule 1 — At least one accepted evidence item

At least one reviewed evidence item must have:

```text
reviewerDecision=accept_as_relevant
```

If none are accepted, reject proposal drafting.

## Rule 2 — At least one high-reliability evidence item

At least one reviewed evidence item must have:

```text
evidenceReliabilityScore >= 4
```

If no evidence source meets this threshold, reject proposal drafting.

## Rule 3 — Average relevance score threshold

Average relevance score across included review objects should be:

```text
averageEvidenceRelevanceScore >= 4
```

If the average relevance score is below 4, reject or hold for more sources.

## Rule 4 — Needs-more-sources handling

If any reviewed evidence item has:

```text
reviewerDecision=needs_more_sources
```

Then the proposal must include non-empty:

```text
requiredAdditionalEvidence
```

The candidate proposal may remain draft-only, but cannot advance to implementation planning until additional evidence is reviewed.

## Rule 5 — Candidate action still requires PM approval

If any reviewed evidence item has:

```text
recommendedNextAction=create_candidate_initiative_later
```

It still does not create an initiative.

The proposal must set:

```json
"requiresPMApproval": true,
"createdAsDraftOnly": true
```

## Rule 6 — No automatic initiative creation

No rule may automatically create a real initiative.

Allowed output is only:

```text
sanitized candidate initiative proposal object
```

---

# Rejection Rules

Reject proposal drafting if any of the following is true.

## Rejection Rule 1 — Source batch not QA-approved

Reject if:

```text
sourceExecutionBatchStatus != QA_APPROVED_PASS
```

## Rejection Rule 2 — Evidence not sanitized

Reject if:

```text
evidenceWasSanitized != true
```

## Rejection Rule 3 — Raw content exists

Reject if output or input includes:

- raw page content.
- raw HTML.
- full response headers.
- cookies.
- tokens.
- auth headers.
- environment values.
- stack traces.

## Rejection Rule 4 — AI-generated conclusion exists

Reject if any candidate proposal field is based on AI-generated conclusions.

Batch 11G is human-governed planning only.

## Rejection Rule 5 — Missing human review score

Reject if any included evidence item lacks:

- evidenceRelevanceScore.
- evidenceReliabilityScore.
- evidenceFreshnessScore.
- businessApplicabilityScore.
- reviewerDecision.
- recommendedNextAction.

## Rejection Rule 6 — PM approval missing

Reject advancement if PM approval is missing.

Drafting a sanitized proposal object does not equal PM approval.

---

# Sanitized Candidate Initiative Proposal Output

The output must be a sanitized candidate initiative proposal object only.

Example:

```json
{
  "initiativeCandidateId": "candidate-rd-csf-guidance-001",
  "sourceReviewObjectIds": [
    "review-nist-csf-main-001",
    "review-nist-csf-quick-start-001",
    "review-nist-csf-profiles-001"
  ],
  "sourceExecutionBatchId": "stage-2-batch-11e-execution",
  "sourceExecutionBatchStatus": "QA_APPROVED_PASS",
  "proposalTitle": "Draft Candidate: Cybersecurity Framework Guided Assessment Path",
  "problemStatement": "Organizations may need a structured way to understand and apply cybersecurity framework guidance without jumping directly into implementation tasks.",
  "evidenceSummary": "Sanitized reviewed NIST evidence indicates that the Cybersecurity Framework, Quick Start Guides, and Profiles can support structured cybersecurity risk management and guided framework adoption.",
  "relevanceRationale": "Two reviewed evidence items were accepted as relevant, all included sources had reliability score >= 5, and average relevance score was >= 4. Human review still requires additional evidence for profile methodology before any initiative is created.",
  "expectedBusinessValue": "Potential future value includes clearer R&D Radar recommendations, better structured cybersecurity initiative proposals, and stronger governance before customer-facing guidance is designed.",
  "uncertaintyRisks": [
    "Profile methodology needs additional reviewed sources before product workflow mapping.",
    "Business applicability should be validated by PM and cybersecurity domain expert.",
    "Current proposal is based on sanitized review objects only, not raw source review."
  ],
  "requiredAdditionalEvidence": [
    "Collect and review additional official NIST or authoritative sources explaining CSF Profiles and implementation examples.",
    "Obtain domain expert review before converting the candidate into a real initiative."
  ],
  "recommendedOwnerRole": "Product Manager + Cybersecurity Domain Expert",
  "recommendedNextGate": "PM_REVIEW_REQUIRED",
  "requiresPMApproval": true,
  "createdAsDraftOnly": true,
  "safety": {
    "realInitiativeCreated": false,
    "taskCreated": false,
    "databaseWriteExecuted": false,
    "persisted": false,
    "sourceControlRuntimeWriteExecuted": false,
    "aiProviderUsed": false,
    "aiEnrichmentExecuted": false,
    "rawContentIncluded": false,
    "rawHtmlIncluded": false,
    "fullHeadersIncluded": false
  }
}
```

---

# Output Restrictions

The proposal object must not include:

- raw page content.
- raw HTML.
- full response headers.
- cookies.
- tokens.
- auth headers.
- environment values.
- stack traces.
- AI-generated conclusions.
- production initiative IDs.
- task IDs.
- database IDs created by persistence.
- source-control commit IDs created by runtime.

---

# Validation Rules

Before accepting a candidate proposal object, validation must confirm:

- `initiativeCandidateId` exists and uses draft/candidate naming.
- `sourceReviewObjectIds` is non-empty.
- `sourceExecutionBatchId` exists.
- `sourceExecutionBatchStatus=QA_APPROVED_PASS`.
- at least one included review object has `reviewerDecision=accept_as_relevant`.
- at least one included review object has `evidenceReliabilityScore >= 4`.
- average relevance score is `>= 4`.
- if any review object has `needs_more_sources`, then `requiredAdditionalEvidence` is non-empty.
- `proposalTitle` exists.
- `problemStatement` exists.
- `evidenceSummary` exists.
- `relevanceRationale` exists.
- `expectedBusinessValue` exists.
- `uncertaintyRisks` exists.
- `recommendedOwnerRole` exists.
- `recommendedNextGate` is approved.
- `requiresPMApproval=true`.
- `createdAsDraftOnly=true`.
- no real initiative was created.
- no task was created.
- no DB write occurred.
- no persistence occurred.
- no source-control runtime write occurred.
- no AI provider or AI enrichment was used.
- no raw content, raw HTML, full headers, secrets, or stack traces are present.

Reject if any validation rule fails.

---

# Approved recommendedNextGate Values

The candidate proposal must use exactly one of:

- `PM_REVIEW_REQUIRED`.
- `DOMAIN_EXPERT_REVIEW_REQUIRED`.
- `COLLECT_MORE_EVIDENCE_REQUIRED`.
- `REJECT_CANDIDATE`.

No other value is approved.

---

# QA Gate

QA should verify:

- plan only.
- no execution.
- no AI provider.
- no AI enrichment.
- no DB writes.
- no persistence.
- no automatic initiative creation.
- no task creation.
- no workflow activation.
- no public trigger.
- no scheduled trigger.
- no frontend cutover.
- no secrets.
- no raw page content.
- no raw HTML.
- no full headers.
- required candidate initiative proposal fields are defined.
- eligibility rules are complete.
- rejection rules are complete.
- sanitized output object is defined.
- `requiresPMApproval=true` is mandatory.
- `createdAsDraftOnly=true` is mandatory.
- no automatic initiative creation is allowed.

Required QA decision:

- `APPROVED FOR PM REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve execution, AI, persistence, database writes, source-control writes, real initiative creation, task creation, workflow activation, public triggers, scheduled triggers, or frontend changes.
