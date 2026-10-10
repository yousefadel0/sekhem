# Stage 2 Batch 11B — R&D Collector Controlled Limited Source Plan

## Purpose

This document defines the Stage 2 Batch 11B plan for R&D Collector Phase B: controlled limited real-source collection planning.

This is a plan-only document. It does not execute R&D Collector, crawl the internet, create or run an n8n workflow, add credentials, connect AI, activate PostgreSQL, persist evidence, write source control, expose public APIs, or change frontend behavior.

## Context

Stage 2 Batch 11A mock-only workflow is closed.

Batch 11A proved:

- inactive/manual/internal n8n workflow shape.
- mock input object only.
- mock source objects only.
- mock evidence output only.
- backend private health validation through `http://100.74.93.25:8080/api/health`.
- no real web crawling.
- no internet calls.
- no credentials.
- no AI.
- no database writes.
- no persistence.
- no source-control writes.
- no public/scheduled trigger.

Batch 11B is the planning gate before any controlled limited real-source execution.

## Scope

Plan only.

The plan defines how a future Phase B execution batch may safely test limited real-source collection after QA and PM approval.

## Explicit Non-Scope

This plan does not authorize:

- real web crawling.
- internet calls.
- workflow execution.
- credential creation or use.
- AI provider connection.
- PostgreSQL activation.
- DB writes.
- persistence.
- source-control writes.
- scheduled trigger.
- public trigger.
- production workflow activation.
- public API exposure.
- frontend cutover.
- secrets in docs, logs, workflow exports, or reports.

---

# Controlled Limited Source Model

## Core Rule

No source may be accessed unless it is explicitly approved in the Phase B execution task.

Default state:

```text
approvedSources = []
realWebCrawlingAllowed = false
internetCallsAllowed = false
```

A future Phase B execution batch must define exact allowlisted domains or URLs before any internet call.

## Source Allowlist Object

Each approved source must be represented using this model:

```json
{
  "sourceId": "source-001",
  "sourceName": "Approved Source Display Name",
  "sourceType": "approved-public-web-page",
  "domain": "example.com",
  "allowedUrls": [
    "https://example.com/specific-approved-page"
  ],
  "allowedPathPrefixes": [
    "/research/approved-section/"
  ],
  "disallowedPathPrefixes": [
    "/login",
    "/account",
    "/admin",
    "/private"
  ],
  "loginRequired": false,
  "credentialsRequired": false,
  "robotsReviewRequired": true,
  "termsReviewRequired": true,
  "maxPages": 1,
  "maxDepth": 0,
  "rateLimitSecondsBetweenRequests": 10,
  "approvedBy": "PM",
  "approvalReference": "PM-approved Batch 11B execution task",
  "notes": "Public page only. No login. No credential use."
}
```

## Allowed Source Types

Allowed only after PM approval:

- public documentation page.
- public press release page.
- public research article page.
- public vendor product page.
- public standards or foundation page.
- public GitHub repository metadata page only if source-control writes are not used.

## Forbidden Source Types

Forbidden by default:

- login-protected source.
- paywalled source.
- private portal.
- customer portal.
- admin panel.
- API requiring credentials.
- source requiring session cookies.
- source requiring scraping bypass.
- source blocked by robots or terms.
- source that requires CAPTCHA bypass.
- source containing sensitive personal data.
- source requiring download of executables or binaries.
- source requiring source-control write access.

---

# Domain and URL Approval Process

## Approval Steps

Before Phase B execution, PM approval must include:

1. exact source domain.
2. exact approved URL or path prefix.
3. purpose of collection.
4. source trust classification.
5. robots/terms review decision.
6. max source count.
7. max pages per source.
8. max execution timeout.
9. rate limit.
10. output destination.
11. confirmation no login is required.
12. confirmation no credentials are used.
13. confirmation no AI enrichment.
14. confirmation no persistence.
15. confirmation no source-control writes.

## Approval Evidence

The execution task should include a source approval table:

| Source ID | Domain | Exact URL / Path Prefix | Max Pages | Rate Limit | Login Required | Credentials | Robots/Terms Review | Approved |
|---|---|---|---:|---:|---|---|---|---|
| source-001 | example.com | https://example.com/specific-approved-page | 1 | 10 sec | No | No | Required | Yes |

No source outside this table may be called.

---

# Limits and Runtime Boundaries

## Max Source Count

Default Phase B first execution limit:

```text
maxSources = 1
```

Expansion beyond one source requires separate PM approval.

## Max Pages Per Source

Default Phase B first execution limit:

```text
maxPagesPerSource = 1
```

The first Phase B test should collect only one approved page from one approved source.

## Max Crawl Depth

Default:

```text
maxDepth = 0
```

Depth 0 means the collector may only fetch the exact approved URL. It must not follow links.

## Max Execution Timeout

Default:

```text
maxExecutionSeconds = 60
```

Any longer timeout requires PM approval.

## Max Response Size

Default:

```text
maxResponseBytes = 1000000
```

If a response is larger than the limit, the workflow must stop and return a sanitized failure.

---

# Rate Limit Policy

Default Phase B rate limit:

```text
minimumSecondsBetweenRequests = 10
maxRequestsPerRun = 1
```

Rules:

- no parallel fetching.
- no retry storm.
- no aggressive crawling.
- no recursive link following.
- no scheduled repetition.
- no background polling.

Retry rule:

- one retry maximum only if PM approves retries.
- default is no retry.

---

# Robots and Terms Handling

## Robots Review

Before any real source execution:

- robots policy must be reviewed for the approved domain/path.
- if robots disallows access, the source is rejected.
- if robots is unclear, PM must decide before execution.

## Terms Review

Before any real source execution:

- terms of use must be reviewed at a high level.
- collection must not bypass access restrictions.
- collection must not use credentials unless separately approved.
- collection must not scrape login-protected content.
- collection must not bypass rate limits, paywalls, CAPTCHAs, or access controls.

## Required Output Fields

Future execution report must include:

```json
{
  "robotsReviewed": true,
  "robotsAllowed": true,
  "termsReviewed": true,
  "termsAllowed": true
}
```

If any of these are false, the workflow must not execute collection.

---

# No Login-Protected Sources Rule

Phase B first execution must use public pages only.

Forbidden:

- login forms.
- private dashboards.
- authenticated APIs.
- cookies copied from browser sessions.
- bearer tokens.
- API keys.
- user/password credentials.
- OAuth credentials.
- CAPTCHA bypass.
- session replay.

If a source requires login, it is automatically rejected for Batch 11B.

---

# No Credentials Rule

No credentials are allowed in Batch 11B planning or first Phase B execution.

Forbidden:

- n8n credentials.
- API keys.
- auth headers.
- cookies.
- bearer tokens.
- username/password.
- OAuth.
- SSH keys.
- source-control tokens.

Workflow exports and execution output must contain no credential values or credential references.

---

# No AI Enrichment Rule

AI enrichment remains Phase C and is not part of Batch 11B.

Forbidden:

- AI provider nodes.
- AI Gateway calls.
- external LLM calls.
- embedding generation.
- auto-classification by AI.
- AI summarization.
- AI recommendation.

Phase B output must be simple extraction and sanitized evidence formatting only.

---

# No Persistence Rule

Batch 11B does not persist data.

Forbidden:

- PostgreSQL activation.
- Prisma-backed writes.
- DB writes.
- MinIO writes.
- Redis writes.
- file persistence outside temporary execution evidence.
- backend evidence storage.
- audit persistence.

Output is execution report only unless a later PM-approved persistence gate exists.

---

# No Source-Control Writes Rule

Forbidden:

- git commit.
- git push.
- branch creation.
- pull request creation.
- merge.
- repository write tokens.
- workflow-generated code or docs committed to repo.

GitHub/Git source-control access is read-only only if explicitly approved as a public source. No writes.

---

# Trigger and Activation Rules

Future Phase B workflow must be:

- inactive by default.
- manual/internal trigger only.
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
- queue trigger.
- polling trigger.
- customer-facing trigger.

---

# Sanitized Evidence Output

## Evidence Output Shape

```json
{
  "evidenceId": "evidence-phase-b-001",
  "requestId": "rdc-phase-b-2026-05-19-0001",
  "source": {
    "sourceId": "source-001",
    "domain": "example.com",
    "url": "https://example.com/specific-approved-page",
    "retrievedAt": "2026-05-19T00:00:00.000Z",
    "robotsReviewed": true,
    "robotsAllowed": true,
    "termsReviewed": true,
    "termsAllowed": true
  },
  "content": {
    "title": "sanitized title",
    "summary": "sanitized non-AI extraction summary",
    "rawContentStored": false,
    "rawContentReturned": false
  },
  "governance": {
    "phase": "Phase B controlled limited source",
    "requiresHumanReview": true,
    "aiGenerated": false,
    "persisted": false,
    "approvedForInitiativeCreation": false
  },
  "safety": {
    "realWebCrawlingExecuted": true,
    "internetCallsExecuted": true,
    "externalCredentialsUsed": false,
    "aiProviderUsed": false,
    "databaseWriteExecuted": false,
    "sourceControlWriteExecuted": false,
    "publicExposureCreated": false
  }
}
```

## Sanitization Rules

Output must not include:

- raw full page content.
- secrets.
- tokens.
- auth headers.
- cookies.
- `.env` values.
- stack traces.
- customer-sensitive data.
- hidden page metadata containing credentials.
- private source data.

Allowed:

- source ID.
- approved domain.
- approved URL.
- HTTP status.
- retrieved timestamp.
- short title.
- short sanitized extract.
- boolean safety flags.
- pass/fail status.

---

# Future Workflow Validation Rules

Before execution, the workflow must validate:

- workflow is inactive before manual execution.
- trigger is manual/internal only.
- no public trigger.
- no schedule trigger.
- no credentials.
- no AI nodes.
- no DB write nodes.
- no source-control write nodes.
- no release/deployment nodes.
- approved source list is not empty for Phase B.
- source count does not exceed approved max.
- each source domain is allowlisted.
- each requested URL is exact-approved or inside approved path prefix.
- no login is required.
- no credentials are required.
- robots/terms review is complete.
- limits are within approved values.

After execution, validate:

- only approved URL was called.
- request count did not exceed limit.
- timeout did not exceed limit.
- no links were followed when `maxDepth=0`.
- output is sanitized.
- no persistence occurred.
- no AI enrichment occurred.
- no source-control write occurred.
- human review required flag is true.

---

# Rollback and Abort Conditions

## Abort Conditions

Abort before execution if:

- no exact source allowlist exists.
- URL is not approved.
- robots/terms review is missing.
- source requires login.
- source requires credentials.
- workflow is active before approval.
- schedule/public trigger exists.
- forbidden node exists.
- AI node exists.
- DB write node exists.
- source-control write node exists.
- output would include raw sensitive data.

Abort during execution if:

- HTTP target redirects outside approved domain/path.
- response exceeds max size.
- timeout occurs.
- disallowed content is detected.
- credential challenge appears.
- login page is detected.
- too many requests are attempted.

## Rollback

Because this is planning only, no runtime rollback is required now.

Future Phase B execution rollback:

1. Keep workflow inactive.
2. Disable workflow if it was accidentally activated.
3. Delete only temporary execution artifacts if PM approves cleanup.
4. Preserve sanitized evidence/report for QA.
5. Do not delete system logs.
6. Do not delete governance evidence.
7. Do not change backend, database, frontend, or source control.

---

# QA Gate

QA should verify:

- plan only.
- no workflow execution.
- no real web crawling.
- no internet calls.
- no credentials.
- no AI provider.
- no PostgreSQL activation.
- no DB writes.
- no persistence.
- no source-control writes.
- no scheduled/public trigger.
- no production activation.
- no public API.
- no frontend cutover.
- no secrets in docs.
- exact source allowlist model is clear.
- domain/URL approval process is explicit.
- max source count is defined.
- max pages per source is defined.
- max execution timeout is defined.
- rate limit policy is clear.
- robots/terms handling is required.
- no login-protected sources rule is explicit.
- sanitized evidence output is defined.
- inactive/manual/internal trigger rule is preserved.
- rollback/abort conditions are clear.

Required QA decision:

- `APPROVED FOR PM EXECUTION PLANNING REVIEW`
- `NOT APPROVED — FIX PLAN`

Approval of this document does not approve Phase B execution. A separate PM-approved execution task is required before any real web request or controlled limited source collection.
