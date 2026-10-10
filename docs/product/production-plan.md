# SEKHEM Production Plan

## Purpose

This plan converts Sekhem from internal MVP / vertical-slice readiness into a Production 100% product release track.

The plan is organized into 8 production epics. Every task has an ID, owner, dependency, target sprint, acceptance criteria, and safety gate.

## Live Production Board

The live production execution board is the Google Sheet named `production plan`:

```text
https://docs.google.com/spreadsheets/d/1DA-B5g1ifzy8xZCQKAHNgPEDsUel-_8AGK_KQ0pDhSU/edit
```

Sheet update rules:

- The Google Sheet is the live production board for all PROD tasks.
- The `Tasks` tab must be updated whenever a task starts, is blocked, or is completed.
- When a task is completed, the task owner must set `Status = Done` immediately.
- `Done` status is intentionally highlighted in **red** in the sheet.
- Red `Done` means: completed but still requiring PM/QA visibility before final acceptance.
- No task may be marked `Done` unless `Notes / Evidence` contains validation evidence.
- Blocked tasks must include blocker reason, owner, and required PM decision in `Notes / Evidence`.
- QA must verify that the sheet row was updated before giving PASS.

## QA Strict Code Review Gate

QA is a production gate, not a rubber stamp.

Before `PASS`, QA must inspect actual implementation evidence, not only the tasker summary.

QA must check:

- changed files list.
- code diff or patch summary.
- whether changed files match the approved task ID and scope.
- whether unrelated files were modified.
- whether dangerous code was added: destructive migration, DB reset, public exposure, hardcoded secrets, provider keys, raw logs, internal IP leakage, GitHub write action, automatic deployment, or bypassed approval gate.
- whether required tests, lint, build, smoke tests, API checks, or workflow execution evidence match the task type.
- whether rollback/disable plan exists for DB, auth, workflow, AI, security, artifact, or deployment changes.
- whether the Google Sheet row is updated with `Notes / Evidence` before PASS.

QA must return:

- `PASS` only when implementation, code review, evidence, sheet update, and forbidden-action checks pass.
- `FIX` when implementation is wrong but fixable by the owner.
- `BLOCKED` when PM decision, missing access, risky approval, missing evidence, or external blocker prevents safe progress.

QA must not approve based only on statements like `implemented`, `looks good`, or `tested locally` without concrete evidence.

## Production Board Summary

| Epic ID | Epic | Goal | Primary Owner | Target Sprint | Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-01 | DB Runtime | PostgreSQL-backed approved runtime | Tasker 4 | Sprint 1 | Persistence read/write PASS |
| PROD-02 | Auth/RBAC | Real access control | Tasker 4 + Tasker 2 | Sprint 1 | Protected UI/API PASS |
| PROD-03 | Workflow Executor | Controlled workflow runtime | Tasker 5 | Sprint 2 | Backend-only workflow callbacks PASS |
| PROD-04 | Source Connectors | Approved source collection | Tasker 5 + Tasker 4 | Sprint 2 | Source allowlist collection PASS |
| PROD-05 | AI Gateway | Controlled AI draft runtime | Tasker 5 + Tasker 4 | Sprint 3 | Cited draft with review gate PASS |
| PROD-06 | Security Gate | Real security validation | Tasker 4 + Tasker 5 | Sprint 4 | Pass/block security result PASS |
| PROD-07 | Artifact Storage + Release Package | Evidence-backed release package | Tasker 4 + Tasker 5 | Sprint 4 | WF9 real package PASS |
| PROD-08 | Deployment + UAT | Production cutover readiness | Infra + QA + PM | Sprint 5 | Full WF0-WF9 UAT PASS |

## Sprint Timing

| Sprint | Duration | Focus |
| --- | --- | --- |
| Sprint 0 | 2-3 days | Production control freeze |
| Sprint 1 | 7-10 days | DB Runtime + Auth/RBAC |
| Sprint 2 | 10-14 days | Workflow Executor + Source Connectors |
| Sprint 3 | 7-10 days | AI Gateway controlled runtime |
| Sprint 4 | 10-14 days | Security Gate + Artifact Storage + Release Package |
| Sprint 5 | 7-10 days | Deployment readiness + UAT + production cutover |

Aggressive safe target: 6 weeks.
Quality target: 8 weeks.

## Epic PROD-01 — DB Runtime

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-01.001 | Confirm approved database environment and runtime flags | Tasker 4 | Sprint 0 | Approved DB target, runtime mode, write mode documented without secrets | No secrets printed |
| PROD-01.002 | Validate current Prisma schema against production runtime needs | Tasker 4 | PROD-01.001 | Schema gaps listed; additive-only migration path confirmed | No destructive migration |
| PROD-01.003 | Implement PostgreSQL-backed approved write/read services | Tasker 4 | PROD-01.002 | Approved entities persist and read back from PostgreSQL | Guarded write mode only |
| PROD-01.004 | Replace memory-only critical writes with persistence behind flags | Tasker 4 | PROD-01.003 | Memory fallback remains dev-only; staging uses PostgreSQL | No broad write mode |
| PROD-01.005 | Add DB health and readiness endpoints | Tasker 4 | PROD-01.003 | Health reports DB availability without leaking internals | Customer-safe errors |
| PROD-01.006 | Add persistence tests and read-back smoke tests | Tasker 4 + QA | PROD-01.004 | Test suite PASS; staging smoke PASS | No db reset |
| PROD-01.007 | Document rollback and disable plan | Tasker 4 + Infra | PROD-01.006 | Rollback plan reviewed by QA/PM | No production cutover yet |

## Epic PROD-02 — Auth/RBAC

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-02.001 | Define roles and permission matrix | Tasker 4 + Tasker 1 | Sprint 0 | Admin, PM, Technical Reviewer, Security Reviewer, Viewer defined | PM approval |
| PROD-02.002 | Implement authentication boundary | Tasker 4 | PROD-02.001 | Login/session works in staging | No public exposure without review |
| PROD-02.003 | Enforce backend API authorization | Tasker 4 | PROD-02.002 | Protected APIs reject unauthorized requests | Unauthorized approvals blocked |
| PROD-02.004 | Protect frontend routes and actions | Tasker 2 | PROD-02.002 | UI hides/blocks unauthorized actions | No sensitive leakage |
| PROD-02.005 | Attach real actor identity to audit events | Tasker 4 | PROD-02.003 | Audit events include authenticated actor and role | No fake actor in staging |
| PROD-02.006 | Auth/RBAC QA matrix | QA | PROD-02.004 | Role-by-role test PASS | No privilege escalation |

## Epic PROD-03 — Workflow Executor

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-03.001 | Freeze backend workflow callback contracts | Tasker 5 + Tasker 4 | PROD-01 | Contract documented and accepted | Backend is source of truth |
| PROD-03.002 | Implement controlled manual workflow execution | Tasker 5 | PROD-03.001 | Manual workflow sends sanitized callback | No public trigger |
| PROD-03.003 | Persist workflow runs and states | Tasker 4 + Tasker 5 | PROD-01.003 | Workflow run visible after restart | Backend write only |
| PROD-03.004 | Add idempotency, retry limit, timeout policy | Tasker 5 | PROD-03.002 | Duplicate and runaway retries prevented | No infinite retry |
| PROD-03.005 | Route failures to Failure / Blocker Center | Tasker 5 + Tasker 4 | PROD-03.003 | Failed workflow creates blocker with owner/severity | Sanitized errors only |
| PROD-03.006 | Frontend workflow run panel live wiring | Tasker 2 | PROD-03.003 | UI shows persisted runs and states | No internal vendor label |
| PROD-03.007 | Workflow executor QA | QA | PROD-03.006 | Manual controlled workflow PASS | No forbidden nodes/actions |

## Epic PROD-04 — Source Connectors

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-04.001 | Approve initial source allowlist | PM + Tasker 5 | Sprint 0 | Domains/categories/schedules approved | No broad crawling |
| PROD-04.002 | Implement one-source controlled connector | Tasker 5 | PROD-04.001 + PROD-03 | Source fetch works with limits | Approved source only |
| PROD-04.003 | Add extraction and sanitization pipeline | Tasker 5 | PROD-04.002 | No raw HTML/full headers/customer-unsafe output | Sanitized content only |
| PROD-04.004 | Add source metadata and deduplication | Tasker 5 + Tasker 4 | PROD-04.003 | Metadata + duplicate mapping persisted | Traceability required |
| PROD-04.005 | Import approved findings into R&D Radar | Tasker 4 + Tasker 5 | PROD-04.004 | Findings become persisted R&D records | Backend API only |
| PROD-04.006 | Rejection reasons and evidence scoring | Tasker 4 + Tasker 5 | PROD-04.005 | Invalid findings rejected with reason | No silent failure |
| PROD-04.007 | Source connector QA | QA | PROD-04.006 | Controlled WF0/WF1 PASS | No scheduled trigger yet |

## Epic PROD-05 — AI Gateway

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-05.001 | Freeze AI Gateway runtime contract | Tasker 5 + Tasker 4 | PROD-01 + PROD-02 | Request/response schema approved | Draft-only output |
| PROD-05.002 | Implement allowlisted AI request types | Tasker 4 | PROD-05.001 | Unknown request types rejected | Fail closed |
| PROD-05.003 | Implement redaction and policy checks | Tasker 4 + Tasker 5 | PROD-05.002 | Secrets/logs/internal values removed | No secrets in prompt/output |
| PROD-05.004 | Implement provider adapter interface with off-switch | Tasker 4 | PROD-05.003 | Provider can be disabled instantly | No provider until approved |
| PROD-05.005 | Controlled provider activation in staging | Tasker 4 + PM | PROD-05.004 | Draft response generated under budget cap | PM approval required |
| PROD-05.006 | Add citations, confidence, risk flags, review state | Tasker 4 + Tasker 5 | PROD-05.005 | AI output is cited and reviewable | Human review required |
| PROD-05.007 | Frontend AI draft review UI | Tasker 2 | PROD-05.006 | UI shows sources, confidence, approve/reject | No provider names |
| PROD-05.008 | AI Gateway QA | QA | PROD-05.007 | Safe cited draft PASS | No autonomous action |

## Epic PROD-06 — Security Gate

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-06.001 | Define security gate policy baseline | Tasker 4 + Tasker 5 + QA | PROD-05 | Policy list approved | PM review for risky scope |
| PROD-06.002 | Implement secrets scan integration | Tasker 4 | PROD-06.001 | Secrets scan result stored | Block on secret finding |
| PROD-06.003 | Implement dependency/license check | Tasker 4 | PROD-06.001 | Dependency/license result stored | Block disallowed licenses |
| PROD-06.004 | Implement SBOM/status evidence | Tasker 4 | PROD-06.003 | SBOM reference/status available | Evidence required |
| PROD-06.005 | Implement risk scoring and pass/block state | Tasker 4 + Tasker 5 | PROD-06.002 | Gate result has risk and decision | No override without approval |
| PROD-06.006 | Security approval workflow | Tasker 4 + Tasker 2 | PROD-06.005 | Reviewer can approve/reject/exception | Actor identity required |
| PROD-06.007 | Security Gate QA | QA | PROD-06.006 | Pass/block/exception scenarios PASS | Audit required |

## Epic PROD-07 — Artifact Storage + Release Package

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-07.001 | Approve artifact storage target and bucket policy | Infra + Tasker 4 | PROD-01 | Storage target approved without secrets | Private storage only |
| PROD-07.002 | Implement artifact reference storage | Tasker 4 | PROD-07.001 | Artifact refs persist in backend | No raw secrets |
| PROD-07.003 | Generate SHA256 for release artifacts | Tasker 4 | PROD-07.002 | SHA256 stored and displayed | Integrity required |
| PROD-07.004 | Build release evidence bundle | Tasker 4 + Tasker 5 | PROD-06 | Evidence includes tests, security, approvals | Block missing evidence |
| PROD-07.005 | Generate release notes and rollback plan | Tasker 5 + Tasker 4 | PROD-07.004 | Notes and rollback plan attached | Human review required |
| PROD-07.006 | Implement WF9 real release package creation | Tasker 4 + Tasker 5 | PROD-07.005 | Release package created from real evidence | Does not deploy |
| PROD-07.007 | Frontend Release Factory live wiring | Tasker 2 | PROD-07.006 | UI shows artifacts, SHA256, checklist, approval | No production claim |
| PROD-07.008 | Release Package QA | QA | PROD-07.007 | WF9 package PASS | No auto deployment |

## Epic PROD-08 — Deployment + UAT

| Task ID | Task | Owner | Dependencies | Acceptance Criteria | Safety Gate |
| --- | --- | --- | --- | --- | --- |
| PROD-08.001 | Finalize staging deployment runbook | Infra + Tasker 4 | PROD-01 to PROD-07 | Runbook reviewed | No secrets in docs |
| PROD-08.002 | Validate backup and restore path | Infra + QA | PROD-08.001 | Restore dry-run PASS | No data loss |
| PROD-08.003 | Add production health and monitoring checks | Infra + Tasker 4 | PROD-08.001 | Health/monitoring visible | No internal leak to UI |
| PROD-08.004 | Run full WF0-WF9 UAT | QA + all owners | PROD-07 | Full scenario PASS | Evidence recorded |
| PROD-08.005 | Fix UAT blockers | Relevant owner | PROD-08.004 | All blockers closed or accepted | PM decision for exceptions |
| PROD-08.006 | Final security review | QA + Security Reviewer | PROD-08.005 | Security sign-off PASS | No unresolved critical |
| PROD-08.007 | Production go/no-go review | PM + QA + owners | PROD-08.006 | PM decision recorded | Explicit PM approval only |
| PROD-08.008 | Production cutover execution | Infra + PM | PROD-08.007 | Production release completed or rollback executed | Rollback ready |

## Final Acceptance

Final acceptance requires:

- all PROD-01 through PROD-08 gates PASS.
- no unresolved critical blocker.
- no forbidden action executed.
- full WF0-WF9 UAT evidence recorded.
- every relevant Google Sheet row updated.
- final PM approval recorded.

## Reporting Format

Every task report must use:

```text
Issue ID: PROD-XX.XXX
Owner: <Tasker / QA / Infra>
Decision: PASS / FIX / BLOCKED
Scope completed:
Validation evidence:
Changed files reviewed: yes/no
Code diff reviewed: yes/no
Tests/lint/build/smoke evidence:
Google Sheet row updated: yes/no
Risks:
Forbidden actions check: PASS / FAIL
Next task:
```
