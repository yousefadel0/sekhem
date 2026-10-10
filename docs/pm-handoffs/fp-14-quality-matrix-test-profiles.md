# SEKHEM — FP-14 Quality Matrix + Test Profiles

## Package

```text
Package ID: FP-14
Owner: QA
Track: Track 4 — Quality + Security
Status: Contract / quality policy artifact
```

## Purpose

This document defines the production quality matrix for SEKHEM full-product execution.

It covers:

- test tools;
- blocking thresholds;
- evidence requirements;
- risk-class to test-profile mapping;
- Quality Runner profile requirements;
- lab/manual evidence requirements for Class E;
- cutover safety gate.

This document does not execute tests, run commands, touch runtime state, write to DB, deploy, restart, or claim production readiness.

## Golden Safety Rule

```text
No production cutover without Quality/Lab PASS or explicit PM exception.
```

A PM exception must be documented with:

- package ID;
- risk class;
- missing quality evidence;
- accepted residual risk;
- PM approver;
- date/time;
- compensating control;
- rollback/stop condition.

## Risk Classes

| Risk Class | Meaning | Examples | Default Gate |
| --- | --- | --- | --- |
| Class A | Docs, tests, UI text | PM handoff docs, copy changes, test-only patches, non-runtime labels | Lightweight review + docs/test evidence |
| Class B | App/API/UI/report | frontend shell, backend endpoint logic, API response shape, report generation | Build + relevant tests + regression checks |
| Class C | Security-sensitive | auth/RBAC, secrets handling, scan logic, approval gates, customer-safe redaction | Security scan + secrets scan + targeted tests + reviewer approval |
| Class D | DB, architecture, release logic | Prisma schema, migration plan, persistence, release package, rollback/disable logic | Prisma validate + backend tests + migration plan review + no DB action unless PM-approved |
| Class E | Hardware/NOS/live devices | SONiC/NOS lab, device configuration, physical network test, live hardware validation | Lab/manual evidence + rollback plan + PM/lab owner approval |

## Quality Matrix

| Area | Required Tools / Checks | Minimum Threshold | Evidence Required | Blocking Rule |
| --- | --- | --- | --- | --- |
| Frontend lint | `npm run lint` or approved package-manager equivalent | 0 new errors. Existing warnings allowed only if outside changed files and documented | command name, environment/worktree, commit SHA, error/warning count, changed-file attribution | Block if any lint error exists or new warning affects changed file without PM exception |
| Frontend build | `npm run build` or approved package-manager equivalent | Build PASS | command name, commit SHA, build output summary, no production claim | Block if build fails |
| Backend build | `npm run build` or approved backend build command | Build PASS | command name, commit SHA, build output summary | Block if build fails |
| Backend tests | `npm test` plus targeted test commands when scoped | Relevant targeted tests PASS; full suite required for backend runtime, auth, workflow, DB, release logic changes unless PM narrows scope | test suite names, pass/fail counts, commit SHA, isolation mode | Block if targeted tests fail; block if full suite is required but missing |
| Prisma schema validation | `npx prisma validate` with safe dummy `DATABASE_URL` when no DB action is approved | PASS | command, dummy URL confirmation without secrets, no DB connection/action, commit SHA | Block Class D DB/schema work if Prisma validate fails or is missing |
| Migration safety review | SQL/migration file inspection only unless PM explicitly approves migration execution | Additive only unless separate PM approval; no destructive migration | migration path, additive review, rollback/disable note | Block if destructive migration, reset, seed, `db push`, or live DB action appears without PM approval |
| Security scan evidence | approved SAST/dependency/security scan or documented manual security review when tool unavailable | No critical/high unresolved findings in changed scope unless PM exception | scanner name/version when available, commit SHA, finding summary, disposition | Block Class C/D release-affecting work with unresolved critical/high findings |
| Secrets scan evidence | approved secrets scan or manual grep/review evidence when tool unavailable | 0 secrets, tokens, cookies, keys, credentials, connection strings in repo/logs/docs/prompts/screenshots | scanner/manual review summary, changed files reviewed, finding count | Block any suspected secret exposure until removed and rotated/PM-reviewed |
| Dependency/license evidence | lockfile review, package diff review, license/SBOM check when dependencies change | No unapproved risky license or unreviewed dependency addition | package files changed, dependency list, license/SBOM summary if applicable | Block if dependency added without review, license risk unresolved, or SBOM missing when required |
| SBOM evidence | approved SBOM generation/check for release or dependency-impacting package | SBOM generated or explicitly deferred by PM | SBOM artifact reference, checksum if artifact-backed | Block release packages without SBOM evidence or PM exception |
| Quality Runner profile | QA profile selected according to risk class | Profile exists and evidence collected | profile ID/name, required checks, pass/fail summary | Block if wrong profile used or profile evidence incomplete |
| Lab/manual evidence | lab runbook, screenshots/log summaries, operator notes for Class E | PASS from lab owner or PM-approved exception | device/simulator scope, operator, timestamp, steps, observed result, rollback/stop condition | Block Class E cutover without lab PASS or explicit PM exception |

## Risk-Class to Test-Profile Mapping

| Risk Class | Required Profile | Required Checks | Optional / Conditional Checks | Closure Rule |
| --- | --- | --- | --- | --- |
| Class A | `QA-A-DOCS-TEST-UI-TEXT` | file scope review, markdown/doc review, no forbidden action check, evidence note | lint/build only if UI code is touched | PASS when docs/test/UI text scope is clean and no runtime risk exists |
| Class B | `QA-B-APP-API-UI-REPORT` | frontend lint/build when frontend touched; backend build/tests when backend touched; targeted regression tests | full suite when endpoint/runtime behavior changes | PASS only with build/tests relevant to changed app/API/UI/report scope |
| Class C | `QA-C-SECURITY-SENSITIVE` | targeted security tests, auth/RBAC or approval-gate tests, secrets scan evidence, customer-safe output review | dependency/SBOM evidence if package/dependency changes | PASS only when no privilege escalation, no secret leak, no unsafe exposure, and reviewer evidence exists |
| Class D | `QA-D-DB-ARCH-RELEASE` | backend build/tests, Prisma validate, migration/safety review, rollback/disable note, release/evidence validation when applicable | isolated DB smoke only when PM explicitly approves; never default | PASS only when schema/architecture/release checks pass and no DB action occurred unless separately approved |
| Class E | `QA-E-HARDWARE-NOS-LAB` | lab/manual evidence, device/simulator scope, operator record, rollback/stop plan, safety review | packet captures, topology diagrams, vendor/NOS logs if approved and sanitized | PASS only with lab owner PASS or explicit PM exception |

## Quality Runner Profile Requirements

Every Quality Runner profile must define:

```text
profileId
riskClass
packageId
changedFiles
requiredCommandsOrChecks
evidenceArtifacts
blockingThresholds
allowedWarnings
forbiddenActions
reviewerRole
pmExceptionAllowed
```

Minimum profile behavior:

1. It must fail closed when required evidence is missing.
2. It must separate targeted checks from full-suite checks.
3. It must mark warnings as accepted only when they are pre-existing or outside changed files.
4. It must never execute deployment, restart, migration, seed, reset, `db push`, live load test, public exposure, AI provider activation, or hardware action unless that action is explicitly approved for that package.
5. It must produce customer-safe evidence without secrets, tokens, cookies, full headers, raw env values, private keys, or unsafe internal details.

## Evidence Requirements

Every QA PASS must include:

- package ID or task ID;
- owner;
- risk class;
- commit SHA or document path;
- changed files;
- validation mode: GitHub inspection, isolated worktree, CI, staging, lab/manual;
- exact tests/checks performed;
- pass/fail counts where applicable;
- blocking findings and disposition;
- forbidden actions check;
- Google Sheet recommendation;
- PM exception reference if any gate is waived.

Evidence must not include:

- secrets;
- tokens;
- cookies;
- credentials;
- connection strings;
- raw environment values;
- private keys;
- full headers;
- unsafe raw logs;
- customer-unsafe stack traces.

## Blocking Thresholds

The following are always blocking unless PM explicitly grants a documented exception:

1. Build failure in changed runtime scope.
2. Targeted test failure in changed scope.
3. Prisma validation failure for Class D schema/persistence work.
4. Missing migration safety review for migration files.
5. Any destructive migration, DB reset, seed, or `db push` without explicit PM approval.
6. Any suspected secret, token, credential, cookie, key, or connection string exposure.
7. Any public trigger, schedule, deployment, restart, runtime smoke, live load test, or live hardware action not explicitly approved.
8. Any direct AI provider activation without PM approval.
9. Any GitHub write action from product runtime without PM approval.
10. Any production-readiness or cutover claim before final gate.
11. Any Class E hardware/NOS change without lab/manual evidence or PM exception.
12. Any unresolved critical/high security finding in changed scope.
13. Any dependency or license risk that lacks review and disposition.
14. Missing Google Sheet evidence for task/package closure.

## Class E Lab / Manual Evidence Profile

Class E work requires a lab/manual evidence profile because automated CI evidence is not enough for live devices or NOS behavior.

Required Class E evidence:

- package ID;
- lab owner/operator;
- device or simulator scope;
- topology/scope summary;
- commands or manual steps summarized safely;
- expected result;
- observed result;
- PASS/FIX/BLOCKED result;
- sanitized logs or screenshots if used;
- rollback/stop plan;
- no secrets/IP-sensitive raw dumps unless approved and sanitized;
- PM/lab owner approval before live-device or customer-impacting action.

Class E blocking rules:

- Block if lab owner is not identified.
- Block if hardware/NOS action touches live/customer devices without PM approval.
- Block if rollback/stop condition is missing.
- Block if raw device credentials, secrets, private keys, or unsafe configs are exposed.
- Block if lab result is ambiguous or not tied to the package ID.

## Cutover Gate

Production cutover may not proceed until:

- all applicable Quality Runner profiles are PASS;
- Class C security-sensitive checks are PASS or PM-excepted;
- Class D DB/architecture/release checks are PASS or PM-excepted;
- Class E lab/manual checks are PASS or PM-excepted;
- release evidence exists with checksums/artifact references where applicable;
- rollback/disable plan exists;
- final PM cutover approval is explicit.

## Forbidden Actions for FP-14

This FP-14 artifact did not perform and must not imply:

- runtime execution;
- live load test;
- arbitrary command execution;
- DB action;
- migration/reset/seed/db push;
- deployment;
- restart;
- production claim;
- source crawling;
- AI provider activation;
- hardware/NOS action.

## Google Sheet Closure Evidence

Recommended `Full Product Tracks` evidence for FP-14:

```text
FP-14 Quality Matrix + Test Profiles created at docs/pm-handoffs/fp-14-quality-matrix-test-profiles.md. Covers test tools, thresholds, evidence requirements, blocking rules, risk-class to test-profile mapping for Classes A-E, frontend lint/build, backend build/tests, Prisma validate, security scan, secrets scan, dependency/license/SBOM evidence, Quality Runner profile requirements, and Class E lab/manual evidence profile. Safety gate defined: no cutover without Quality/Lab PASS or explicit PM exception. Docs-only change. No runtime execution, no live load test, no arbitrary command execution, no DB action, no deployment/restart, and no production claim.
```
