# Issue 1503 - Backend Production Readiness Gap Analysis

Issue ID: 1503

Owner: Tasker 4

Decision: PASS - backend/runtime/API/PostgreSQL production readiness gaps are identified.

## Scope/Safety

This analysis covers Tasker 4 ownership only:

- backend API readiness.
- Prisma schema and additive migration readiness.
- PostgreSQL persistence readiness.
- runtime backend readiness.
- backend validation and tests.
- backend-facing GitHub read-only readiness status API.

No production deployment, DB migration, db:push, db:seed, DB reset, public exposure, AI provider call, GitHub write action, or secret inspection was performed for this analysis.

## Gap Analysis

### Must-fix before production-track readiness

| Item | Gap | Required owner |
| --- | --- | --- |
| PostgreSQL migration state | The additive R&D Radar migration exists, but production-track readiness requires environment-specific approval, backup/check, application to the approved safe database, and table validation before any broader runtime reliance. | Tasker 4 + PM |
| Runtime DB activation guard | PostgreSQL-backed reads/writes must remain behind explicit runtime guardrails. Production-track readiness requires a documented and tested operating mode for `postgres_read` plus `rd_radar_only`, with no broad write mode and no migration execution by the app runtime. | Tasker 4 |
| EvidenceReview candidate linkage | Persisted EvidenceReview read-back is general only. The current PostgreSQL schema/service does not support candidate-specific EvidenceReview filtering; the endpoint rejects `candidateId` in PostgreSQL mode. | Tasker 4 + PM |
| Backend route freeze | R&D Radar routes exist, but production-track readiness needs a final route inventory for exactly approved GET/POST behavior and no extra public/write capability beyond approved contracts. | Tasker 4 + QA |
| Customer-safe error behavior | Endpoint failures must keep normalized wrappers and avoid raw stack traces, raw provider errors, internal IPs, tokens, and implementation wording in customer-facing responses. | Tasker 4 + QA |
| GitHub readiness runtime deployment | Issue 1501 tightened `/api/rd-radar/github-status` to safe read-only status on main. Production-track readiness requires confirming the private/staging runtime is deployed with that commit and still exposes GET-only behavior. | Tasker 4 + Infra |
| Source collection approval | Issue 1506 defines a controlled source allowlist plan, but no full production source-collection engine is approved. Every source, schedule, trigger, and automation path still needs PM approval before production-track collection. | Tasker 5 + Tasker 4 + PM |
| Private API hardening | Current backend runtime is private/internal. Production-track readiness requires confirmation that it remains non-public, behind approved network controls, and does not leak internal IPs or runtime labels into customer UI. | Infra + Tasker 4 + Tasker 2 |
| Deployment runbook | A production-track backend deployment runbook must be finalized with rollback, health checks, validation, secret handling, and explicit no-migration/no-seed defaults unless PM approves otherwise. | Tasker 4 + Infra |

### Can-demo but not production

| Item | Current usable state | Production limitation | Required owner |
| --- | --- | --- | --- |
| R&D Radar UI/API flow | Customer demo can show readiness, evidence, candidates, PM decisions, workflow summaries, and GitHub readiness status. | This is not a full autonomous production engine. It depends on controlled data and approved runtime mode. | Tasker 2 + Tasker 4 |
| Candidate and PMDecision persistence | Canonical candidate and PMDecision POST/read-back flows are validated in staging/private mode. | Write scope is limited to R&D Radar contracts and must stay guarded by runtime config. | Tasker 4 |
| WorkflowRunSummary callback | Sanitized workflow summary POST/read-back is available and rejects forbidden raw fields. | It is not a public trigger and must not imply real workflow execution or source automation. | Tasker 4 + Tasker 5 |
| GitHub readiness status | `/api/rd-radar/github-status` returns customer-safe read-only readiness shape. | It does not perform GitHub writes, enforce branch protection, create PRs, or deploy. | Tasker 4 |
| Source allowlist | The first controlled collection plan is documented. | Actual source automation, scheduling, GitHub read-only collection, and AI enrichment are not approved. | Tasker 5 + PM |

### Can-defer post-contract

| Item | Deferral reason | Required owner |
| --- | --- | --- |
| Full source collection engine | Needs PM-approved allowlist, scheduling policy, retry policy, and operational boundary. | Tasker 5 + PM |
| AI enrichment | Requires separate AI provider approval, privacy review, prompt/output policy, and customer claim review. | PM + Tasker 5 + Tasker 4 |
| Public API exposure | Current posture is private/internal. Public exposure needs security, auth, rate limiting, observability, and deployment approval. | Infra + Tasker 4 + PM |
| Auth/RBAC enforcement | Not required for current private demo path, but required before broader customer or multi-user production access. | Tasker 4 + PM |
| GitHub write automation | Explicitly forbidden from product runtime. Any future write action needs separate approval and safety design. | PM + Tasker 4 |
| Broad observability/SLOs | Useful after contract scope is fixed; not a blocker for internal demo, but needed before production operations. | Infra + Tasker 4 |

### Risks

| Risk | Impact | Required owner |
| --- | --- | --- |
| DB state drift between local, staging/private, and production | Backend may validate locally while runtime uses older schema or data. | Tasker 4 + Infra |
| Runtime branch/commit drift | Private backend may run an older build than main. | Tasker 4 + Infra |
| Overclaiming source automation | Customer may infer autonomous crawling or continuous monitoring before approval. | PM + Tasker 5 + Tasker 1 |
| Candidate-specific review gap | Customer may expect per-candidate evidence review history that the current schema cannot yet provide. | Tasker 4 + PM |
| Internal wording leakage | Terms like backend, API unavailable, fixture, fallback, raw logs, or vendor labels can weaken customer readiness. | Tasker 1 + Tasker 2 + QA |
| Unsafe future adapter activation | GitHub, AI, workflow, or DB writes could be accidentally enabled without PM gates if guardrails are bypassed. | Tasker 4 + Tasker 5 + PM |

## Customer-Facing Meaning

### What the customer sees now

- A validated R&D Radar experience that can present readiness status, sanitized evidence, candidate initiatives, PM decisions, workflow summaries, and repository readiness.
- Read-only repository readiness language that does not promise source-control changes.
- A controlled PM review path where candidate decisions can be recorded and read back in the approved staging/private flow.

### What is still internal/readiness work

- Applying and validating database migrations per approved environment.
- Keeping runtime mode, DB write mode, and private network exposure under explicit approval.
- Completing candidate-specific EvidenceReview read-back if PM wants that user journey.
- Approving the final source allowlist and collection schedule before any production-track collection automation.
- Confirming the private runtime is on the expected main commit and uses the latest read-only GitHub readiness endpoint.

### What we must not claim yet

- Full production readiness.
- Autonomous crawling or broad continuous monitoring.
- Scheduled source collection.
- AI-generated analysis or AI enrichment.
- GitHub write automation, branch creation, PR creation, merges, deployments, or issue creation from product runtime.
- Public production API availability.
- Automatic initiative creation or task creation from collected evidence.

## Forbidden Actions Check

PASS.

This analysis did not perform:

- production deployment.
- DB migration.
- db:push.
- db:seed.
- DB reset.
- public exposure.
- secret printing.
- AI provider call.
- GitHub write from product runtime.
- production-complete claim.

## Files Changed

- `docs/product/issue-1503-backend-production-readiness-gap-analysis.md`

## Validation

Commands run:

- `git fetch origin`
- `git show origin/main:docs/pm-handoffs/stage-2-tasker-instructions.md`
- `git show origin/main:docs/pm-handoffs/stage-2-production-acceleration-directive.md`
- `git show origin/main:docs/pm-handoffs/sekhem-tasker-ownership-map.md`
- `git show origin/main:docs/pm-handoffs/customer-language-review.md`
- `rg -n "rd-radar|github-status|WorkflowRunSummary|EvidenceReview|CandidateInitiative|PMDecision|GitHubIntegrationStatus" backend/src backend/prisma backend/test`
- `rg -n "createBranch|create branch|commit|pull request|merge|deploy|issue|writeActionsExecuted|github" backend/src backend/test`

Results:

- Required self-refresh files read from latest `origin/main`.
- R&D Radar backend route and persistence surfaces inspected.
- GitHub readiness endpoint verified as GET-only in controller source.
- Search found no GitHub branch creation, commit creation, PR creation, merge, deploy, or issue creation calls in the R&D Radar GitHub readiness path.

## PR Number

Not opened.
