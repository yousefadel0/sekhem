# MVP acceptance — 2026-10-09

Status: IN PROGRESS. This report does not certify MVP completion or production readiness.

## Scope and changes

- Preserve the existing conversation, runtime, authorization and persisted records.
- Isolate optional workspace surface storage from conversation code. Only the layout enum is stored.
- Render escaped source before CodeMirror initializes; indicate when governed save is unavailable.
- Refresh one directory without resetting discovery of the entire project tree.
- Keep verified source-read counts distinct from listing observations.
- Display failure diagnostics for failed/partial inspection, not normal phases.
- Collapse completed inspection progress into history; retain the final answer and evidence-limited replies.
- Project the known completed report format into summary/limits, with original source excerpts and full report in Details. No persisted message changes.

## Deterministic evidence

- Final frontend .ts and .tsx suite including the report formatter: 540/540 PASS.
  Command: `node --import tsx --test test/*.test.ts test/*.test.tsx`.
- Report formatter and failure UX after its implementation: 9/9 PASS.
  Command: `node --import tsx --test test/inspection-report-presentation.test.ts test/inspection-failure-ux.test.tsx`.
- Directory/editor/surface focused checks: 23/23 PASS.
- Core backend conversation modes, workspace, answer contracts and budgets: 153/153 PASS.
  Command from backend: `node --import tsx --test --test-concurrency=1 test/conversation-modes.test.ts test/workspace-runtime.test.ts test/ai-gateway-output-contract.test.ts test/ai-gateway-output-budget.test.ts test/assistant-context-budget.test.ts`.
- Final frontend typecheck: PASS outside the Windows sandbox.
  Command: `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`.
- These test counts overlap and must not be added together.

## Live evidence

- Authenticated frontend loaded after the user reopened the previously failed tab. Listeners on 3000, 3001 and 7443 were observed. A listener alone is not application acceptance.
- Fresh layout listing reached SUCCEEDED / VERIFIED in the runtime ledger:
  `rt1_RUNTIME_EXECUTION_265f3fb519326d9de93793b749df69370b41044d13b7f2fcbefd5578f242bf0a`.
  Returned Header.module.css, Header.tsx, Sidebar.module.css and Sidebar.tsx.
- Header.tsx opened in the live CodeMirror editor. This UI observation alone is not a separately audited source-content receipt claim.
- Test conversation: `conv-1791549692737-cxsoh2`.
- Arabic greeting produced a conversational answer.
- README-only analysis produced exactly one verified source read in the inspection projection:
  `rt1_RUNTIME_EXECUTION_ac460ac27dd6a315701678ef571ca11e0877a68314893bff5734dec872b7eed5`.
- Run `run_1791549720582_whrjy`: COMPLETED, event sequence 34, UNDERSTANDING_CHECKPOINT at sequence 32; no failure reason.
- Run started 12:42:00.589 UTC and completed 12:43:58.753 UTC (about 118 seconds). No performance improvement is claimed for model latency.
- Reload restored the conversation and completed result in the browser. A scoped authoritative comparison still showed exactly one README read with the same execution ID.
- The initial directory-refresh live action refreshed the whole tree. After fixing it, a before/after ledger comparison for the test conversation showed exactly one additional execution: filesystem.list for src/components/layout, SUCCEEDED / VERIFIED, receipt `rt1_RUNTIME_EXECUTION_df59acfd09f7cada0a6ad09551ca769e8969afa98b6aaaa2298da38603aed3fd`. No sibling directory listings appeared in that scope.
- Compact report rendering was observed live: summary/inferences and limits remained visible, with full source excerpts under closed Details. Completed progress messages were disclosed as history.

## Outstanding acceptance

- A named disposable file and exact permitted change for the product's proposal/approval/write/read-back/verification journey. Request sent to the user; no arbitrary test mutation was selected.
- Current backend source changes require source/process alignment before claiming live coverage of every backend change.
- Source checkout has no established Git baseline; this is not a Git diff or commit provenance report.
- Production build acceptance remains outstanding; avoid rebuilding shared Next output while the user is using the development server.

## Deferred

SSH is P2 post-MVP under the authoritative October 7 Notion baseline. No SSH migration, remote command, grant change, enrollment change, deployment or restart was performed in this implementation batch. SSH schema mismatch and signing/production infrastructure remain separate follow-up work.

## Follow-up delivery audit and fixes (October 9)

The later implementation corrects false PLAN intent left by prohibited plan nouns without dropping coordinated prohibitions, separately positive actions, or conditional exceptions. Test fixtures were updated for the current Prisma methods, durable failure records, canonical structured transport, and the existing fail-closed INSPECTION_SCOPE_DENIED result. No scope guard was relaxed. The old understanding loop fixture now emits understanding fields instead of using removed planning-scope data.

- Frontend default test script now includes both .ts and .tsx.
- SSH PostgreSQL test now requires SEKHEM_RUNTIME_DB_TEST=1 and the existing isolated local sekhem_test_* database validator. It no longer reads application .env/DATABASE_URL.
- Summary display retains the original report, uncertainty and unknowns in Details, uses readable Arabic headings, and removes internal fact-ID display from the summary only. Ordered Markdown lists preserve explicit numbering across paragraph breaks.
- Editor save errors explain the Agent requirement and retain the local draft. Explicit whole-message `Continue in Agent.` uses the existing compatibility handoff endpoint; the current server still retains CHAT mode. It does not authorize a write.
- Generated logs, builds, local package store and validation screenshots are excluded from Git packaging.

### Current evidence

- Backend final full suite: 3150 tests, 3147 PASS, 0 FAIL, 3 SKIPPED, 0 cancelled. Log: backend/mvp-delivery-backend-final.log.
- Frontend full suite: 545 PASS, 0 FAIL. Log: mvp-delivery-frontend-final.log. Subsequent save-notice wording check: 2/2 PASS.
- Frontend and backend typecheck: PASS. Logs: mvp-delivery-typecheck.log and backend/mvp-delivery-typecheck.log.
- Frontend production build: PASS in a separate same-drive source copy under .next/mvp-build-audit, including shared backend imports/dependencies. Active dev output was not rebuilt. Backend build: PASS into TEMP, without replacing backend/dist.
- Five local GET samples each: health returned 200 with 156.4ms first request and 1.3–8.0ms subsequent; login returned 200 with 227.1ms first request and 45.7–68.0ms subsequent. This is a small development-server timing sample, not a load or model-latency benchmark. Log: mvp-http-timing.json.
- Live readable summary and numbered points observed. Chat Save/Review rejected AGENT_CONVERSATION_REQUIRED. The draft was discarded; no product file write was performed.
- README SHA-256 remained A6CE7625A7D97EA59694B5DC9682FF1AF1A0D26AD73BFFD7D0ABB860B26A01C3 across this attempted draft flow.
- User explicitly approved one-hour renewal of the saved grant scope. UI confirmed Grant v47 until 17:46:02 Cairo, with enrollment revision 3 unchanged. Screenshot: mvp-grant-renewal.jpg. This later renewal supersedes the earlier no-grant-change statement for the previous batch only.

### Remaining gates

- Explicit same-conversation Agent transition is awaiting a separate user decision; current CHAT tool restriction remains intact. Write/receipt/read-back/reload E2E is NOT VERIFIED.
- Backend lint remains failing: 2370 errors and 139 warnings in the latest run (backend/mvp-delivery-lint.log). Frontend lint passed with 0 errors and 229 warnings. No rule downgrade or broad refactor performed. GitHub CI includes this gate and cannot be declared green.
- Backend source/process alignment for the latest code has not been proven live; no service restart occurred in this follow-up.
- No Git baseline, GitHub publication, server deployment, migration or production Runtime signing acceptance is claimed.

## Unified MVP delivery map — October 9 follow-up

Target: one conversation for chat, workspace inspection, reviewed changes and verified results. The target work window is 120–180 minutes; completion depends on evidence, not elapsed time.

| Slice | Planned window | Acceptance |
| --- | --- | --- |
| P0-A: diagnose rejections | 0–20 min | Identify mode, grant, binding, capability, provider and transport failures separately. |
| P0-B: same-conversation work | 20–65 min | Preserve history; authenticate project/owner/binding; no child conversation, implicit approval, permit or execution; safe idempotency. |
| P0-C: work-session access | 65–100 min | Explicit saved-tool activation for up to 8 hours, capped by token/durable session/enrollment; revocation and version checks retained; no automatic renewal. |
| P0-D: local live acceptance | 100–150 min | One README heading change in OMNIROUTE_TEST through exact proposal, approval, permit, conditional write, authorized read-back, diff/receipt and reload. |
| P0-E: delivery verification | 150–180 min | Regressions/typechecks/build and an honest CI status; no READY claim with unverified live execution. |

### Implemented source changes

- Same-conversation handoff now persists AGENT as an internal capability path after the existing project/owner/binding checks. User-facing mode selection is not introduced. Tool guards remain intact.
- Save/Review first requests authenticated same-conversation activation using a stable request identifier, validates the response retains the same conversation, then requests the existing conditional-write proposal. It does not approve or execute.
- Work-session access raises the renewal request ceiling from 1 hour to 8 hours. Runtime settings requests 8 hours explicitly; the API helper retains its one-hour default for compatibility. Backend token, durable session and enrollment expiry still cap the actual duration. No live grant has been extended by this source change.
- Focused backend tests: 99/99 PASS, including preservation of historical source relationships. Editor tests: 10/10 PASS, including activation rejection and foreign-target rejection before proposal. Runtime UI/save notice tests: 19/19 PASS.
- Frontend final full suite: 546/546 PASS, 0 FAIL, 0 SKIPPED. Log: mvp-unified-session-frontend-final.log.
- Frontend/backend typecheck outside the filesystem sandbox: PASS. In-sandbox failures concerned dependency visibility and are retained in separate logs, not treated as passing results.
- Frontend production build in the existing isolated source copy: PASS. No active development output was rebuilt.
- Backend build: PASS into `C:/Users/youse/AppData/Local/Temp/sekhem-session-build-70c7f44c68cc41588c72dcacabe4c0d7`, without changing backend/dist or restarting it.
- Frontend changed-file lint: PASS with 0 errors and 7 warnings. Backend changed-file lint still failed; inherited debt remains and no successful CI claim is made.

### Reproduction commands

From the repository root:

```powershell
node --import tsx --test test/*.test.ts test/*.test.tsx
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/next/dist/bin/next build .next/mvp-build-audit --webpack
```

From backend (dependency-resolving checks used the host environment after sandbox restrictions):

```powershell
node --import tsx --test test/conversation-modes.test.ts test/runtime-grant-renewal.test.ts
node --import tsx --test --test-concurrency=1 test/*.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.json --outDir <separate-TEMP-build-directory>
```

Grant duration and workspace-read consent are separate contracts. `WORKSPACE_READ_TTL_MS` remains one hour; the existing development persistent-read policy is unchanged. The new 8-hour renewal ceiling does not silently extend reading consent, approval or permits.

### Live and external status

- Notion: the section `2026-10-09 — Unified MVP Delivery Map` was visibly inserted into the existing roadmap, preserving the original title and historical baseline. Reload was blocked by browser security policy; durable persistence after reload is NOT VERIFIED. No bypass attempted; user confirmation requested.
- Backend local process reload and activating the longer live access window await separate user answers because earlier instructions prohibited restarts and the prior grant approval covered only one hour.
- Latest source changes are NOT live E2E proof. No new workspace file write, migration, authority SQL edit, production deployment or Runtime restart is claimed.
- Full backend verification outside the sandbox: 3156 tests, 3153 PASS, 0 FAIL, 3 SKIPPED, 0 cancelled; log backend/mvp-unified-session-backend-host.log. The later historical-source preservation change was verified separately by the final 99/99 focused suite and final host typecheck. It is not claimed as part of that full-run snapshot.
- The sandbox full run failed: 3157 tests, 2795 PASS, 205 FAIL, 154 cancelled, 3 SKIPPED; log backend/mvp-unified-session-backend.log. Socket/filesystem/dependency restrictions affected that run. The host run is a separately recorded result, not a relabeling of failures.
- Backend lint remains a real CI gate; no lint rule was disabled, downgraded or hidden.

## Comprehensive acceptance audit — 2026-10-09

Scope: current complete automated suites, host typechecks, complete lint, isolated builds, local HTTP probes, read-only database/schema checks and existing authenticated UI. No source repair, migration, generate, deployment, grant extension or service restart was performed in this audit.

### Current verification matrix

| Check | Actual result | Evidence |
| --- | --- | --- |
| Backend complete suite | 3157 tests; 3154 PASS; 0 FAIL; 3 SKIPPED; 116 suites | backend/mvp-comprehensive-backend-tests.log |
| Frontend complete suite | 546 PASS; 0 FAIL; 0 SKIPPED; 12 suites | mvp-comprehensive-frontend-tests.log |
| Both host typechecks | PASS, exit 0 | root and backend mvp-comprehensive-typecheck.log |
| Frontend complete lint | Exit 0; 0 errors, 229 warnings | mvp-comprehensive-lint.json |
| Backend complete lint | Exit 1; 2370 errors, 139 warnings | backend/mvp-comprehensive-lint.json |
| Backend build into separate TEMP directory | PASS, exit 0 | backend/mvp-comprehensive-build.log |
| Frontend refreshed isolated production build | PASS, exit 0 | mvp-comprehensive-production-build.log |
| Backend health / DB readiness | HTTP 200 / 200 | Single local samples at 17:26 Cairo; readiness executes SELECT 1 only |
| Frontend login route | HTTP 200 | Single local sample, 264.8 ms; not a load benchmark |
| Unauthenticated projects API | HTTP 401 | Single local sample; expected authentication rejection |
| Fresh README editor read | Rendered Verified observation, SOURCE READY and source text | mvp-comprehensive-read-verification.jpg |
| Existing explorer/layout | Saved tree displayed Header.tsx and Sidebar.tsx without DENIED | UI snapshot only; no fresh layout listing or content read proved |
| Live modification and server operations | NOT VERIFIED | Pending backend reload permission; no isolated server supplied |

Skipped real PostgreSQL coverage: UserMemory persistence integration, SSH revision/concurrency/history persistence, and runtime ledger/authorization. Automated mocked and local tests do not substitute for these integrations.

### Findings and next-phase gates

1. **Database/schema drift:** read-only SELECT against the database configured by backend/.env found 9 missing model tables: SshTarget, SshTargetRevision, SshConnectionValidation, HistoricalMemoryItem, AgentInitiative, AgentInitiativeVersion, AgentInitiativePlan, AgentInitiativeTask and AgentInitiativeDecision. Database/schema identity digest: c29c986f3e3c77a236c851e8e5cba63dab1a5e02828fc4fefbaeab2687ab31a8. Existing migrations 20260920000000_add_agent_initiative_runtime, 20261002000000_account_historical_memory and 20261005090000_ssh_target_registration are absent from the applied migration rows. An applied 20260917180000_add_workspace row has no matching migration directory in this checkout. Reconcile the target and history before any separately approved migration. Green SELECT 1 readiness does not establish feature schema readiness.
2. **Lint gate fails:** backend errors include 2145 no-explicit-any and 170 no-unused-vars. Two parsing errors report “File appears to be binary.” at line 1 in backend/check2.js and backend/getUsers.js. No baseline proves all this debt predates current changes; do not claim successful CI.
3. **Source/process alignment:** backend PID 11556 started at 15:08; conversation.service.ts was changed at 17:18. The latest source changes have not been loaded through an approved restart and therefore are not live E2E proof. Permission remains pending.
4. **UI status ambiguity:** footer Agent COMPLETED coexists with PLAN_NOT_READY / Needs user input. Agent workspace can display Workspace binding unavailable while current workspace is READY. The former fallback uses run inspection/presentation/receipt fields, not a live binding probe (components/workspace/agent-workspace.tsx:90). “Local execution is unavailable” is also a conditional presentation fallback at line 93. These messages do not independently prove runtime denial.
5. **Runtime access:** this audit did not activate the new 8-hour ceiling. Actual existing grant expiry was 17:46 Cairo; extension requires the pending explicit answer. Persistent development read policy does not authorize writing.
6. **Release evidence missing:** no real server execution, production deployment, load benchmark, provider continuation after the latest source change, signed installer publication, or write/read-back/reload receipt was established. No .git metadata exists in this checkout, so genuine baseline diff and GitHub publication readiness are unverified. Notion durable persistence remains unverified after the prior browser block.

README remained unchanged: SHA256 A6CE7625A7D97EA59694B5DC9682FF1AF1A0D26AD73BFFD7D0ABB860B26A01C3. UI opening did not establish Agent evidence admission or write success.

### Prisma Client audit

Installed/generated version is 6.19.3. Source and generated schemas both contain 76 models. Generated schema timestamp: 2026-10-04T22:37:01.989Z. Raw schema hashes differ, but comparing model body lines after removing comments and normalizing whitespace found no source-only or generated-only model fields. This comparison is not a complete semantic comparison of enums, datasource and generator definitions. No generate or migrations were executed. Both current full typechecks passed; that does not establish database compatibility.

### Reproduction commands for this audit

Root: `node --import tsx --test test/*.test.ts test/*.test.tsx`; `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`; `node node_modules/eslint/bin/eslint.js . --format json`.

Backend: `node --import tsx --test --test-concurrency=1 test/*.test.ts`; `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`; `node node_modules/eslint/bin/eslint.js . --format json`; `node node_modules/typescript/bin/tsc -p tsconfig.json --outDir <separate TEMP directory>`.

Frontend build uses `node node_modules/next/dist/bin/next build .next/mvp-build-audit --webpack` after refreshing the isolated source copy; it does not replace the active development output. Database inspection used Prisma SELECT queries for current_database/current_schema, information_schema.tables and _prisma_migrations, then disconnected. No user contents or connection secrets were printed.

**Decision:** automated functional suites and typechecks pass, but comprehensive live acceptance is incomplete. Before declaring the MVP ready: reconcile database feature scope/history, resolve the backend lint gate, load approved source changes, and demonstrate one bounded modification with approval, conditional write, read-back, receipt and reload restoration. Remote server acceptance remains a separate gate requiring an identified isolated target and scope.

## Development follow-up — 2026-10-09

Implemented narrowly scoped repairs after the user's request to continue development:

- app/page.tsx footer now uses runActivity with saved planning and the latest saved event instead of raw run.status. Live browser snapshot displayed Agent: Needs user input for the previously misleading COMPLETED footer. Screenshot: mvp-status-consistency-live.jpg.
- components/workspace/agent-workspace.tsx now says Workspace not recorded in this run when the snapshot lacks workspace metadata. A missing execution snapshot is described as No execution record is attached to this run, with reviewed proposal/authorization requirements; it no longer asserts that local execution is unavailable.
- backend/src/product.service.ts default database readiness now checks generated Prisma model table names with a parameterized, read-only PostgreSQL catalog query. Missing tables, or relations that are not ordinary/partitioned tables, prevent ready. Public response fields remain unchanged and do not reveal table names or raw errors. This checks table presence, not columns, indexes, constraints or migration checksums.
- backend/check2.js and backend/getUsers.js converted UTF-16LE BOM to UTF-8, then corrected the invalid escaped prisma.\$disconnect token. Source text was verified preserved during encoding conversion. Both pass node --check; neither script was executed. Their existing CommonJS require imports still violate no-require-imports; this is not a full lint pass.

Verification: frontend focused presentation regressions 52/52 PASS, frontend typecheck PASS, changed frontend lint 0 errors/3 warnings. Backend service + HTTP regressions 38/38 PASS and typecheck PASS. Logs: mvp-status-consistency-tests.log, mvp-status-consistency-typecheck.log, mvp-status-consistency-lint.log, backend/mvp-schema-readiness-final-tests.log and backend/mvp-schema-readiness-typecheck.log. Earlier full suites predate these changes and are not relabeled as current full-run proof.

Read-only migration comparison: all 9 applied migrations with files present matched their recorded SHA256 checksums. The applied add_workspace migration still has no file in the checkout; targeted filename search under D:/yy/yy found no original copy. Evidence: backend/mvp-migration-checksums.log. The new catalog-query approach was also run directly against the configured database and returned the same 9 missing tables; this is query evidence, not proof that the unrestarted service loaded the changed code.

Pending: explicit local backend restart permission, original add_workspace migration file, approved database repair and disposable test database provisioning. Live grant currently displays EXPIRED; no renewal performed. No security checks, grants or migration records were altered. MVP remains NOT READY while those gates and complete backend lint remain open.

Final focused rerun after the report entry: frontend presentation 52/52 PASS, frontend typecheck PASS and scoped lint PASS with 0 errors/3 warnings; backend service plus HTTP 38/38 PASS, backend typecheck PASS and scoped lint PASS with 0 errors. Logs listed above were refreshed. The frontend footer was visibly corrected in the already-open conversation. Backend readiness changes are not yet active in the running process.

Lint triage correction: the stored backend lint JSON contains 2370 errors and 139 warnings from its earlier complete run. Its 2 source-file parse errors were caused by check2.js and getUsers.js UTF-16LE encoding plus an escaped `$disconnect`; encoding was converted with text round-trip verification and the syntax token corrected, and both files pass `node --check` without executing either script. The two files now parse but their existing CommonJS imports fail the backend lint rule against require. The other large lint debt is still open; no claim that full lint is resolved.

Five-item follow-up: `node scripts/prisma-cli.mjs migrate status` (read-only) exited 1 and reported last common migration `20260917120000_add_conversation_attachment`, three pending migrations (`20260920000000_add_agent_initiative_runtime`, `20261002000000_account_historical_memory`, `20261005090000_ssh_target_registration`), and one database migration absent locally (`20260917180000_add_workspace`). This makes direct production of a reconciled application migration history unsafe until the exact missing source is recovered. The complete intended SQL of the three pending migrations is in those repository files and was reviewed; none has been run.

Latest post-change backend build passed into TEMP: `C:/Users/youse/AppData/Local/Temp/sekhem-five-fix-build-80f580c490e64ee799edc1d3ce9769e9`. Refreshed isolated frontend production build also passed: mvp-status-consistency-production-build.log. Integration tests still require a disposable local PostgreSQL database; no test database URL is configured in this session.

## Database repair execution — 2026-10-09

User explicitly requested repair of the existing database. Before changes, a custom-format pg_dump of `sekhem_product_dev` was created at `C:/Users/youse/AppData/Local/Temp/sekhem_product_dev_pre_migration_20261009.dump` (100,672,621 bytes); `pg_restore --list` validated its catalog. No restore was run.

Prisma `migrate deploy` applied the three previously pending repository migrations to the named development database. A disposable local `sekhem_test_mvp_20261009` database was created empty and initialized with the repository migrations. Comparing all 76 Prisma model tables and scalar/enum columns showed the development database already had all expected fields, but a fresh database lacked `Workspace` and `AuditEvent.createdAt`, `AuditEvent.riskLevel` and `AuditEvent.sourceType`. The original applied `20260917180000_add_workspace` migration source remains unavailable; its original checksum was not reconstructed or edited. Instead, two new additive migrations were added: `20261009190000_reconcile_workspace_table` creates the schema-defined Workspace table/indexes only when absent, and `20261009194500_repair_audit_event_columns` adds the schema-defined AuditEvent columns/index only when absent. Their DDL was first applied to the disposable database, then deployed to development. Existing Workspace/AuditEvent definitions in development were checked against Prisma before deployment; IF NOT EXISTS preserved them.

Post-repair evidence: Prisma migrate status says “Database schema is up to date”; Prisma validate succeeds; DMMF comparison finds no missing model tables or scalar columns in either development or test. The full backend suite ran with `SEKHEM_RUNTIME_DB_TEST=1` and `SEKHEM_MEMORY_DB_TEST=1` against the isolated test database: **3186 PASS, 0 FAIL, 0 SKIPPED, 116 suites**, 352,789 ms. This includes live PostgreSQL persistence/authorization, UserMemory, SSH history/concurrency/immutability, and AgentRun event sequencing. Log: backend/mvp-five-fixes-backend-full-tests.log. The test database is retained for further work.

Current gates: frontend tests 547/547 PASS; backend typecheck PASS; Prisma validate/status PASS. Frontend full typecheck currently reports **347 diagnostics** across files not changed in this repair (many missing `children` props on Radix component types); no clean baseline diff is available. Backend full lint remains **2370 errors and 139 warnings**, unchanged after current run. Frontend production build passed in isolation before this database-only change.

The local backend process has not been restarted, so the updated readiness probe is not active in the running service. The expired Runtime grant also prevents a live file-write/read-back/reload acceptance check. No live execution or production deployment is claimed.
