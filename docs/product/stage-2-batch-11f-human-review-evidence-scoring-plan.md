# Stage 2 Batch 11F — Human Review + Evidence Scoring Plan

## Purpose

This document defines the Stage 2 Batch 11F plan for human review and evidence scoring of sanitized R&D Collector evidence.

The goal is to provide a structured, manual review model before any later initiative creation, AI enrichment, persistence, database write, source-control write, workflow activation, task creation, or frontend change.

## Scope

Planning only.

This document defines:

- prerequisite evidence gates.
- required review fields.
- 1–5 scoring scale.
- reviewer decision values.
- recommended next actions.
- sanitized review object output.
- validation rules.
- QA gate.
- forbidden scope.

## Explicit Non-Scope

This plan does not authorize:

- execution.
- internet call.
- crawling.
- AI provider connection.
- AI enrichment.
- DB writes.
- persistence.
- source-control runtime writes.
- automatic initiative creation.
- task creation.
- production workflow activation.
- public trigger.
- scheduled trigger.
- frontend cutover.
- secrets in docs, logs, workflow exports, or reports.

---

# Mandatory Prerequisite Gate

Batch 11F is a review and scoring framework only.

Batch 11F must not be implemented, executed, or used to score evidence unless a prior R&D Collector execution batch has been QA-approved as PASS and provides sanitized evidence objects.

Allowed source execution status before scoring:

```text
QA_APPROVED_PASS
```

Examples of acceptable prerequisite batches:

- Stage 2 Batch 11E-Execution, if QA-approved as PASS.
- Stage 2 Batch 11E-Fix, if QA-approved as PASS.
- Any later PM-approved controlled execution batch, only if QA-approved as PASS and sanitized evidence objects are available.

## Missing / Failed Evidence Handling

If source evidence is missing, failed, aborted, incomplete, not sanitized, or not QA-approved, Batch 11F may only define the review framework.

It must not conduct scoring.

It must reject any review object where:

```text
sourceExecutionBatchStatus != QA_APPROVED_PASS
```

It must also reject scoring if:

- no prior closed execution batch is referenced.
- evidence object is missing.
- evidence object was not sanitized.
- evidence was produced by a failed or aborted execution.
- evidence contains raw page content, raw HTML, full headers, cookies, tokens, auth headers, secrets, hidden fields, stack traces, or non-approved URL content.

---

# Required Evidence Provenance Fields

Every review object must include provenance fields proving it came from a prior QA-approved sanitized execution.

```json
{
  "sourceExecutionBatchId": "stage-2-batch-11e-execution",
  "sourceExecutionBatchStatus": "QA_APPROVED_PASS",
  "evidenceObjectId": "temporary-or-workflow-local-evidence-reference",
  "evidenceCollectedAt": "ISO-8601 timestamp or not_confirmed",
  "evidenceWasSanitized": true
}
```

Rules:

- `sourceExecutionBatchId` must reference a prior closed execution batch.
- `sourceExecutionBatchStatus` must equal `QA_APPROVED_PASS`.
- `evidenceObjectId` or temporary evidence reference must exist.
- `evidenceWasSanitized` must be `true`.
- scoring is rejected if any provenance field is missing or invalid.

---

# Evidence Review Fields

Each evidence item must be reviewed using the following fields.

```json
{
  "sourceExecutionBatchId": "stage-2-batch-11e-execution",
  "sourceExecutionBatchStatus": "QA_APPROVED_PASS",
  "evidenceObjectId": "temporary-evidence-reference-001",
  "evidenceCollectedAt": "not_confirmed",
  "evidenceWasSanitized": true,
  "sourceUrl": "https://example.gov/exact-approved-url",
  "title": "sanitized title",
  "sourceOrganization": "source organization name",
  "visibleDate": "visible publication/update date if available, otherwise not_confirmed_in_sanitized_parse",
  "keyPoints": [
    "sanitized key point 1",
    "sanitized key point 2",
    "sanitized key point 3"
  ],
  "requiresHumanReview": true,
  "reviewerDecision": "accept_as_relevant",
  "evidenceRelevanceScore": 4,
  "evidenceReliabilityScore": 5,
  "evidenceFreshnessScore": 4,
  "businessApplicabilityScore": 3,
  "riskNotes": "short human-written notes only",
  "recommendedNextAction": "keep_as_reference"
}
```

## Field Rules

### sourceUrl

The exact approved source URL used during collection.

Rules:

- must be an exact URL.
- must not be a generic domain.
- must match a previously approved allowlist entry.
- must be present in a QA-approved sanitized evidence object.

### title

Sanitized page title from the collected evidence.

Rules:

- no raw HTML.
- no hidden metadata.
- no generated rewrite.

### sourceOrganization

The public organization responsible for the source.

### visibleDate

Visible publication or update date if available in sanitized extraction.

If not visible:

```text
not_confirmed_in_sanitized_parse
```

### keyPoints

Three to five sanitized key points from the source.

Rules:

- no raw full page content.
- no AI-generated conclusions.
- no unsupported interpretation.
- no downstream business decision.

### requiresHumanReview

Must remain:

```json
true
```

Evidence cannot bypass human review.

### reviewerDecision

Human-selected decision using the approved decision set.

### evidenceRelevanceScore

Manual score from 1 to 5 describing relevance to the current R&D topic.

### evidenceReliabilityScore

Manual score from 1 to 5 describing source trust and credibility.

### evidenceFreshnessScore

Manual score from 1 to 5 describing how current or still-applicable the evidence appears.

### businessApplicabilityScore

Manual score from 1 to 5 describing how directly useful the evidence is for SEKHEM business/product planning.

### riskNotes

Human-written notes describing uncertainty, limitation, risk, or follow-up needed.

Rules:

- must be short.
- must not include raw page content.
- must not include secrets or credentials.
- must not include AI conclusions.

### recommendedNextAction

Human-selected next action using the approved next-action set.

---

# Scoring Scale

All score fields use the same 1–5 scale.

## Score 1 — Very Weak

Barely relevant, unreliable, outdated, or not useful.

Normally rejected or used only as weak background.

## Score 2 — Weak

Partially relevant but limited.

Needs more sources before use.

## Score 3 — Moderate

Useful but not decisive.

Acceptable as supporting evidence with human caution.

## Score 4 — Strong

Clearly relevant and useful.

Suitable as a strong reference after human review.

## Score 5 — Very Strong

Highly relevant, highly reliable, current, and directly actionable.

Suitable as a key reference for later initiative consideration.

## Score-Specific Guidance

### evidenceRelevanceScore

- 1: unrelated or nearly irrelevant.
- 2: weak indirect relevance.
- 3: moderate relevance.
- 4: strong relevance.
- 5: direct and central relevance.

### evidenceReliabilityScore

- 1: unknown or weak source.
- 2: source reliability uncertain.
- 3: generally acceptable source.
- 4: reliable source.
- 5: authoritative primary source.

### evidenceFreshnessScore

- 1: outdated or likely obsolete.
- 2: old or freshness unclear.
- 3: acceptable but should be cross-checked.
- 4: current or still clearly applicable.
- 5: recent, maintained, or official current reference.

### businessApplicabilityScore

- 1: no clear business use.
- 2: weak possible use.
- 3: useful background.
- 4: directly useful for planning.
- 5: strongly actionable for product or initiative design.

---

# Reviewer Decisions

The reviewer must choose exactly one decision.

Approved decisions:

- `accept_as_relevant`
- `needs_more_sources`
- `reject_not_relevant`
- `reject_too_generic`
- `reject_outdated`
- `hold_for_expert_review`

## Decision Guidance

### accept_as_relevant

Use when the evidence is relevant and credible enough to keep as a reviewed reference.

### needs_more_sources

Use when the evidence is promising but insufficient alone.

### reject_not_relevant

Use when the evidence does not support the R&D topic.

### reject_too_generic

Use when evidence is too broad to support a useful R&D conclusion.

### reject_outdated

Use when evidence is stale or superseded.

### hold_for_expert_review

Use when human reviewer cannot safely judge technical or strategic meaning.

---

# Recommended Next Actions

The reviewer must choose exactly one recommended next action.

Approved next actions:

- `keep_as_reference`
- `collect_more_sources`
- `create_candidate_initiative_later`
- `discard`
- `escalate_to_domain_expert`

## Next Action Rules

### keep_as_reference

Keep evidence as reviewed supporting material.

Allowed only as sanitized review output.

### collect_more_sources

Request additional source collection in a later approved batch.

Does not authorize execution by itself.

### create_candidate_initiative_later

Mark evidence as potentially useful for a future candidate initiative.

This does not create an initiative.

A separate PM-approved workflow is required before any initiative creation.

### discard

Discard evidence from downstream consideration.

This plan does not authorize persistence.

### escalate_to_domain_expert

Route evidence to a qualified human expert for interpretation.

This does not authorize external sharing unless separately approved.

---

# Sanitized Review Object Output

The output must be a sanitized review object only.

Example:

```json
{
  "reviewId": "human-review-temp-001",
  "reviewMode": "manual-human-review-only",
  "sourceExecutionBatchId": "stage-2-batch-11e-execution",
  "sourceExecutionBatchStatus": "QA_APPROVED_PASS",
  "evidenceObjectId": "temporary-evidence-reference-001",
  "evidenceCollectedAt": "not_confirmed",
  "evidenceWasSanitized": true,
  "sourceUrl": "https://www.nist.gov/cyberframework",
  "title": "Cybersecurity Framework | NIST",
  "sourceOrganization": "National Institute of Standards and Technology (NIST)",
  "visibleDate": "not_confirmed_in_sanitized_parse",
  "keyPoints": [
    "sanitized key point 1",
    "sanitized key point 2",
    "sanitized key point 3"
  ],
  "requiresHumanReview": true,
  "reviewerDecision": "accept_as_relevant",
  "scores": {
    "evidenceRelevanceScore": 4,
    "evidenceReliabilityScore": 5,
    "evidenceFreshnessScore": 4,
    "businessApplicabilityScore": 3
  },
  "riskNotes": "Relevant public NIST reference. Needs domain mapping before initiative creation.",
  "recommendedNextAction": "keep_as_reference",
  "safety": {
    "rawPageContentIncluded": false,
    "aiGeneratedConclusionIncluded": false,
    "persisted": false,
    "databaseWriteExecuted": false,
    "initiativeCreated": false,
    "taskCreated": false,
    "sourceControlWriteExecuted": false
  }
}
```

## Output Restrictions

The review output must not include:

- raw page content.
- full response headers.
- raw HTML.
- scripts.
- CSS.
- cookies.
- tokens.
- auth headers.
- environment values.
- stack traces.
- AI-generated conclusions.
- automatic initiative decisions.
- task creation payloads.
- database IDs created by persistence.

---

# Review Workflow Concept

Future implementation may use a manual/internal review form or internal review object.

Allowed future components only after PM approval:

- manual/internal review UI.
- static JSON review object.
- local validation step.
- human reviewer input.
- sanitized report output.

Forbidden without separate PM approval:

- AI-assisted scoring.
- automated scoring.
- database persistence.
- automatic initiative creation.
- automatic task creation.
- external notification.
- public workflow trigger.
- scheduled workflow trigger.

---

# Validation Rules

Before accepting a review object, validation must confirm:

- `sourceExecutionBatchId` exists.
- `sourceExecutionBatchStatus` equals `QA_APPROVED_PASS`.
- `evidenceObjectId` or temporary evidence reference exists.
- `evidenceWasSanitized=true`.
- the referenced evidence came from a prior closed QA-approved execution batch.
- `sourceUrl` exists and matches the prior approved sanitized evidence object.
- `title` exists or is explicitly marked unavailable.
- `sourceOrganization` exists.
- `visibleDate` exists or is explicitly marked `not_confirmed_in_sanitized_parse`.
- `keyPoints` contains 3 to 5 sanitized entries.
- `requiresHumanReview=true`.
- `reviewerDecision` is one of the approved decisions.
- all scores are integers from 1 to 5.
- `riskNotes` is present.
- `recommendedNextAction` is one of the approved next actions.
- safety flags confirm no raw content, no AI conclusion, no persistence, no DB write, no initiative creation, no task creation, and no source-control write.

Reject review object if:

- `sourceExecutionBatchStatus` is missing or is not `QA_APPROVED_PASS`.
- the source execution batch is failed, aborted, incomplete, or not QA-approved.
- evidence object is missing.
- evidence was not sanitized.
- score is outside 1–5.
- reviewer decision is not approved.
- recommended action is not approved.
- raw page content appears.
- AI-generated conclusion appears.
- persistence or DB write is implied.
- automatic initiative/task creation is implied.
- secrets or auth material appear.

---

# QA Gate

QA should verify:

- plan only.
- no execution.
- no internet call.
- no crawling.
- no AI provider.
- no AI enrichment.
- no DB writes.
- no persistence.
- no source-control runtime writes.
- no automatic initiative creation.
- no task creation.
- no production workflow activation.
- no public trigger.
- no scheduled trigger.
- no frontend cutover.
- no secrets in docs.
- Batch 11F explicitly requires a prior `QA_APPROVED_PASS` execution batch before scoring.
- missing, failed, aborted, incomplete, non-sanitized, or non-QA-approved evidence is rejected.
- required evidence review fields are defined.
- provenance fields are defined.
- 1–5 scoring scale is defined clearly.
- reviewer decisions are limited to approved values.
- recommended next actions are limited to approved values.
- output is sanitized review object only.
- validation rules reject unsafe or out-of-scope review objects.

Required QA decision:

- `APPROVED FOR PM REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve execution, AI, persistence, database writes, source-control writes, automatic initiative creation, task creation, public triggers, scheduled triggers, or frontend changes.
