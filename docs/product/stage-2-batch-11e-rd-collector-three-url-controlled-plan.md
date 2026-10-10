# Stage 2 Batch 11E — R&D Collector Three-URL Controlled Plan

## Purpose

This document defines the Stage 2 Batch 11E plan to expand the R&D Collector from one exact public URL to three exact public URLs.

This is planning only. It does not execute n8n, make internet calls, crawl pages, create credentials, call AI, write to databases, persist evidence, write source control, expose public APIs, or change frontend behavior.

## Context

Stage 2 Batch 11D-Fix is closed and passed.

The first real one-page R&D Collector execution succeeded against:

```text
https://www.nist.gov/cyberframework
```

Batch 11D-Fix confirmed:

- workflow remained inactive after execution.
- trigger remained manual/internal only.
- exactly one HTTP Request node existed.
- exact URL was requested.
- redirect following was disabled.
- no second URL was requested.
- raw execution output was removed.
- final report contained sanitized extraction only.
- no AI, DB write, persistence, source-control write, public trigger, scheduled trigger, public API exposure, or frontend cutover occurred.

Batch 11E prepares the next controlled planning step only: three exact public URLs maximum.

## Scope

Planning only.

Future execution requires a separate PM-approved execution task with pre-execution review.

## Explicit Non-Scope

This plan does not authorize:

- execution.
- internet calls.
- crawling.
- recursive link following.
- generic domain crawling.
- PDF/RSS/API/image/script/CSS fetching.
- credentials, cookies, tokens, or auth headers.
- AI provider connection.
- AI enrichment.
- PostgreSQL activation.
- DB writes.
- persistence.
- source-control writes.
- scheduled trigger.
- public trigger.
- production activation.
- public API exposure.
- frontend cutover.
- secrets in docs, logs, workflow exports, or final reports.

---

# Proposed Three Exact Public Source URLs

The three proposed URLs are all public NIST Cybersecurity Framework pages under the same official host.

## URL 1 — NIST Cybersecurity Framework Main Page

```text
https://www.nist.gov/cyberframework
```

Purpose:

- Baseline CSF landing page.
- Previously executed successfully in Batch 11D-Fix.
- Provides high-level CSF context and links to resource areas.

## URL 2 — NIST CSF 2.0 Quick Start Guides

```text
https://www.nist.gov/cyberframework/quick-start-guides
```

Purpose:

- Collect sanitized evidence about official Quick Start Guides.
- Supports understanding how NIST expects different users to begin applying CSF 2.0.

## URL 3 — NIST CSF 2.0 Profiles

```text
https://www.nist.gov/cyberframework/profiles
```

Purpose:

- Collect sanitized evidence about CSF Organizational and Community Profiles.
- Supports understanding profile-based application of CSF outcomes.

## Source Selection Rationale

These URLs were selected because:

- They are exact NIST public web pages, not generic domains.
- They are same-host official `.gov` pages.
- They are relevant to controlled R&D Radar evaluation of cybersecurity framework structure, resources, and profile concepts.
- They avoid PDFs, APIs, RSS feeds, scripts, images, and external domains.
- They avoid login-protected, credentialed, or paywalled content.

---

# Per-URL Pre-execution Requirements

Before any future execution, each URL must be revalidated independently.

For every URL, QA/PM must confirm:

- exact URL matches the approved list.
- public page.
- no login required.
- no credentials required.
- no API key required.
- no payment/subscription required.
- robots review completed for exact host/path.
- terms/access review completed for exact host/path.
- redirects reviewed.
- redirect target is either the exact URL or explicitly allowlisted.

If any URL fails review, execution must abort or remove that URL only through a new PM-approved revision.

---

# Source Allowlist Model

Future execution must use an allowlist object like this:

```json
{
  "allowedSources": [
    {
      "sourceId": "nist-csf-main",
      "url": "https://www.nist.gov/cyberframework",
      "domain": "www.nist.gov",
      "path": "/cyberframework",
      "loginRequired": false,
      "credentialsRequired": false,
      "apiKeyRequired": false,
      "paymentRequired": false,
      "robotsReviewRequired": true,
      "termsReviewRequired": true
    },
    {
      "sourceId": "nist-csf-quick-start-guides",
      "url": "https://www.nist.gov/cyberframework/quick-start-guides",
      "domain": "www.nist.gov",
      "path": "/cyberframework/quick-start-guides",
      "loginRequired": false,
      "credentialsRequired": false,
      "apiKeyRequired": false,
      "paymentRequired": false,
      "robotsReviewRequired": true,
      "termsReviewRequired": true
    },
    {
      "sourceId": "nist-csf-profiles",
      "url": "https://www.nist.gov/cyberframework/profiles",
      "domain": "www.nist.gov",
      "path": "/cyberframework/profiles",
      "loginRequired": false,
      "credentialsRequired": false,
      "apiKeyRequired": false,
      "paymentRequired": false,
      "robotsReviewRequired": true,
      "termsReviewRequired": true
    }
  ]
}
```

No URL outside this exact list may be requested.

---

# Execution Limits for Future Batch 11E Implementation

Future execution must enforce these limits:

```text
maxSources=3
maxPagesPerSource=1
maxDepth=0
maxRequestsPerRun=3
parallelFetching=false
minimumSecondsBetweenRequests=10
maxExecutionSeconds=180
maxResponseBytesPerURL=1000000
```

## Fetch Ordering

Future execution must fetch sequentially only:

1. `https://www.nist.gov/cyberframework`
2. `https://www.nist.gov/cyberframework/quick-start-guides`
3. `https://www.nist.gov/cyberframework/profiles`

No parallel fetching is allowed.

## Delay Rule

There must be at least 10 seconds between requests.

If the implementation cannot enforce delay inside n8n safely, execution must abort before request 2.

---

# Redirect Policy

Default:

```text
redirectsDisabled=true
```

Rules:

- Redirect following must be disabled by default.
- If a redirect occurs, the workflow must fail closed unless the exact final URL is explicitly allowlisted before execution.
- Redirects to another host, path, PDF, API endpoint, RSS feed, image, script, CSS, or external domain are forbidden.

---

# Trigger and Activation Rules

Future workflow must be:

- manual/internal only.
- inactive by default.
- not scheduled.
- not public.
- not production activated.

Allowed trigger:

```text
Manual Trigger
```

Forbidden triggers:

- Schedule Trigger.
- Webhook Trigger.
- public endpoint trigger.
- polling trigger.
- queue trigger.
- customer-facing trigger.

---

# Output Requirements

Future execution must produce one sanitized evidence object per URL.

Each evidence object must include only:

```json
{
  "sourceId": "exact-source-id",
  "title": "sanitized title",
  "sourceOrganization": "National Institute of Standards and Technology (NIST)",
  "visibleDate": "visible publication/update date if available, otherwise not_confirmed_in_sanitized_parse",
  "keyPoints": [
    "3 to 5 sanitized public-page key points"
  ],
  "sourceUrl": "exact approved URL",
  "requiresHumanReview": true,
  "rawContentStored": false,
  "aiGenerated": false,
  "persisted": false
}
```

## Sanitized Output Only

Forbidden in output:

- raw full page content.
- full response headers.
- cookies.
- tokens.
- auth headers.
- environment values.
- stack traces.
- raw HTML.
- scripts.
- CSS.
- hidden page fields.
- analytics identifiers.
- any non-approved URL content.

---

# Forbidden Nodes and Actions

Future workflow must not include:

- AI provider nodes.
- PostgreSQL nodes.
- DB write nodes.
- source-control write nodes.
- Git nodes.
- notification nodes.
- webhook trigger nodes.
- schedule trigger nodes.
- shell command nodes that mutate runtime.
- Docker/Kubernetes control nodes.
- credential nodes.

Allowed node categories only:

- Manual Trigger.
- Function/Code nodes for validation and sanitized extraction.
- HTTP Request nodes only for the three approved exact URLs.
- Wait/Delay node only if needed to enforce minimum 10 seconds between requests.
- IF/Switch nodes only for fail-closed validation.

---

# Validation Rules

Before future execution, QA must validate:

- exact URL list has exactly 3 entries.
- each URL is exact, not a generic domain.
- workflow inactive by default.
- manual/internal trigger only.
- no scheduled/public trigger.
- no credentials.
- no forbidden nodes.
- exactly three HTTP Request nodes, or one controlled loop that can only call the three exact approved URLs.
- redirect following disabled.
- maxSources=3.
- maxPagesPerSource=1.
- maxDepth=0.
- maxRequestsPerRun=3.
- no parallel fetching.
- minimum 10 seconds between requests.
- maxExecutionSeconds=180.
- maxResponseBytesPerURL=1000000.
- sanitized-only output.

After future execution, QA must validate:

- workflow remains inactive.
- no second or fourth URL requested.
- no generic domain crawling.
- no recursive crawling.
- no PDF/RSS/API/image/script/CSS fetching.
- no credentials/cookies/tokens/auth headers used.
- no AI provider used.
- no DB writes.
- no persistence.
- no source-control writes.
- one sanitized evidence object exists per URL.
- each evidence object has `requiresHumanReview=true`.
- each evidence object has `rawContentStored=false`.
- each evidence object has `aiGenerated=false`.
- each evidence object has `persisted=false`.

---

# Abort Conditions

Abort before execution if:

- URL list has fewer or more than 3 entries.
- any URL differs from the approved list.
- any URL requires login, credentials, API key, payment, or subscription.
- robots/terms/access review is missing for any URL.
- workflow is active before approval.
- scheduled/public trigger exists.
- credentials are attached.
- forbidden nodes exist.
- redirect following is enabled without explicit allowlist.
- delay between requests cannot be enforced.
- output would include raw content or sensitive data.

Abort during execution if:

- any request redirects to a non-allowlisted URL.
- a request exceeds max response size.
- timeout exceeds approved limit.
- a fourth request is attempted.
- linked resources are attempted.
- login/credential challenge is detected.
- raw content appears in final output.

---

# QA Gate

QA should verify this plan is documentation-only and that it includes:

- exactly 3 public source URLs.
- exact URLs, not generic domains.
- no login / no credentials / no API key / no payment requirements.
- robots/terms/access review requirement before execution.
- maxSources=3.
- maxPagesPerSource=1.
- maxDepth=0.
- maxRequestsPerRun=3.
- no parallel fetching.
- minimum 10 seconds between requests.
- maxExecutionSeconds=180.
- maxResponseBytesPerURL=1000000.
- redirects disabled by default.
- fail-closed redirect policy.
- one sanitized evidence object per URL.
- human review required.
- inactive/manual/internal workflow requirement.
- forbidden node policy.
- validation and abort conditions.

Required QA decision:

- `APPROVED FOR PM EXECUTION REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve execution. A separate PM-approved execution task is required before any multi-URL request is made.
