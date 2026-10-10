# Stage 2 Batch 11C — R&D Collector One-source / One-page Execution Plan

## Status

Documentation-only execution plan.

No execution is approved by this document.

This plan prepares a controlled Phase B candidate for one approved public URL only. A separate PM-approved execution task is required before any internet call, workflow run, source collection, or controlled limited source test.

## Task Owner

Tasker 5 — Online workflow, n8n governance, AI Gateway planning, and R&D Collector workflow planning.

## Scope

Plan only.

File created:

- `docs/product/stage-2-batch-11c-rd-collector-one-page-execution-plan.md`

Services touched:

- None.

Runtime touched:

- None.

## Proposed Single Public Source URL

Proposed source URL:

```text
https://www.nist.gov/news-events/news/2024/04/nist-releases-version-20-landmark-cybersecurity-framework
```

Source rationale:

- Public official source.
- Single page only.
- Relevant to technology governance, cybersecurity, and R&D Radar evidence collection.
- Intended as a low-risk candidate for sanitized metadata/excerpt extraction only.

Access assumptions for planning:

- Login required: No.
- Credentials required: No.
- External API key required: No.
- Payment/subscription required: No.

Execution caveat:

- These assumptions must be re-validated during the required pre-execution robots/terms/access review before any real request is made.
- If the URL prompts for login, blocks automated access, requires credentials, requires payment, returns an unexpected redirect, or conflicts with robots/terms, execution must fail closed.

## Mandatory Pre-execution Review Requirement

Before any execution, QA/PM must approve documented evidence for:

1. Robots review for the exact host/path.
2. Terms/public-use review for the exact source.
3. Confirmation that the exact URL is public and requires no login.
4. Confirmation that no credentials, cookies, tokens, API keys, session headers, or authentication headers are used.
5. Confirmation that no redirect is followed unless the final target URL is explicitly allowlisted before execution.

No runtime execution may start until this review is completed and approved.

## Exact Phase B Limits

The first controlled Phase B execution candidate must use the following limits exactly:

| Control | Required value |
|---|---:|
| `maxSources` | `1` |
| `maxPagesPerSource` | `1` |
| `maxDepth` | `0` |
| `maxRequestsPerRun` | `1` |
| `maxExecutionSeconds` | `60` |
| `maxResponseBytes` | `1000000` |
| Redirect handling | Fail closed unless explicitly allowlisted |
| AI enrichment | Disabled |
| Persistence | Disabled |
| Source-control writes | Disabled |
| Trigger | Manual/internal only if later approved |
| Public exposure | Disabled |

## Execution Behavior If Later Approved

If PM approves a separate execution task later, the collector must:

1. Read exactly the one approved URL.
2. Make no more than one HTTP request.
3. Use depth `0`; do not follow page links.
4. Not crawl the domain.
5. Not fetch images, scripts, CSS, PDFs, linked pages, RSS feeds, APIs, or secondary assets.
6. Not follow redirects unless the redirect target is pre-approved in an allowlist.
7. Abort if response body exceeds `1000000` bytes.
8. Abort if execution exceeds `60` seconds.
9. Produce sanitized extraction only.
10. Require human review before any downstream use.

## Sanitized Extraction Only

Allowed output fields only:

- approved source URL
- final URL if no redirect occurred, or redirect-abort status if redirect occurred
- HTTP status class only, not sensitive headers
- source title if safely available
- source organization/domain
- publication/update date if safely available
- short sanitized excerpt or bullet summary
- extraction timestamp
- execution limits used
- abort reason if aborted
- human review status

Forbidden output:

- raw full page content
- cookies
- tokens
- secrets
- authentication headers
- full response headers
- hidden form/session fields
- tracking identifiers
- personal data beyond what is already public on the page
- generated claims not grounded in the page
- AI-generated enrichment

## Explicit Forbidden Scope

This plan does not authorize:

- internet call
- web crawling
- n8n workflow execution
- credentials
- cookies or authenticated headers
- AI provider use
- AI enrichment
- database writes
- persistence
- source-control runtime writes
- scheduled trigger
- public trigger
- production activation
- public API
- frontend cutover
- secrets in docs
- recursive crawling
- retry storm
- background polling
- parallel fetching
- source collection beyond the single approved URL

## QA Gate

QA must verify before approving any future execution batch:

- The document proposes exactly one public source URL.
- No generic domain allowlist is introduced.
- No source list beyond the one URL is introduced.
- `maxSources=1`.
- `maxPagesPerSource=1`.
- `maxDepth=0`.
- `maxRequestsPerRun=1`.
- `maxExecutionSeconds=60`.
- `maxResponseBytes=1000000`.
- Redirects fail closed unless explicitly allowlisted.
- No AI enrichment is permitted.
- No persistence is permitted.
- No source-control writes are permitted.
- Sanitized extraction only is required.
- Human review is required.
- Robots/terms review is mandatory before execution.
- No secrets are present in this document.

## Rollback / Abort Conditions

Abort before or during any later approved execution if:

- The URL is changed without PM approval.
- More than one URL is introduced.
- Login, credentials, cookies, tokens, API keys, or authenticated headers are required.
- robots/terms review is missing or fails.
- A redirect occurs and the target is not explicitly allowlisted.
- The response exceeds `1000000` bytes.
- Runtime exceeds `60` seconds.
- Any workflow attempts persistence, AI enrichment, database writes, source-control writes, public exposure, scheduled execution, or production activation.

## Documentation-only Confirmation

This Batch 11C deliverable is documentation-only.

No workflow was executed.
No internet call was made.
No crawling was performed.
No credentials were used.
No AI provider was used.
No database writes were made.
No persistence was enabled.
No source-control runtime writes were enabled.
No scheduled/public trigger was created.
No production activation was performed.
No public API or frontend cutover was performed.
No secrets were added.
