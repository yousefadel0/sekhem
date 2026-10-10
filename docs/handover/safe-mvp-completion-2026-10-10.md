# SEKHEM safe MVP completion and server readiness

## Decision

The authoritative 2026-10-07 baseline remains **HISTORICAL MVP CLOSED / P0 UI CLOSED**. This batch corrected a reproduced reading-setup presentation defect and prepared an isolated, hashed backend candidate. **Current-version Agent acceptance is BLOCKED / NOT VERIFIED. Real-server and multi-user readiness is NOT READY / NOT VERIFIED.** No operational deployment occurred.

Baseline: https://app.notion.com/p/3edb7da1720a81cb903fe7c1fdb60578?pvs=204. Preserve previous Golden Write acceptance and the 231-test punctuation repair evidence in `mvp-closure-decision-2026-10-10.md`; neither campaign was repeated.

## Current topology and evidence

Source checkout: `D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main`. Active test workspace: `C:\Users\youse\OneDrive\Desktop\OMNIROUTE_TEST`. No Git metadata is present, so no complete baseline diff or reviewed commit identity is available.

Read-only process inspection identified the Next development process PID 15168 from this checkout and backend PID 20612 launched through `tsx watch src/main.ts` (parent PID 19292). Backend creation time was 2026-10-10 06:09:47 +03:00. Paths and timestamps do **not** prove the identity of imported Agent modules. No startup artifact hash, loaded-module attestation, or equivalent binding to the repaired Agent source was established.

Source uses PostgreSQL for durable state, with SSE delivering events. Approval, execution permit, RuntimeGrant, enrollment, binding, receipts and verification remain separate. The API source binds `0.0.0.0`, default port 3001; the trusted Runtime TLS source binds loopback, observed configuration port 7443. The historical public domain record is not evidence of an available production host. Effective running environment overrides and complete production configuration remain unverified.

Three observed Runtime clients use the existing payload's `node.exe`. Its Authenticode status is Valid, signer OpenJS Foundation. This establishes vendor-signed Node, **not** a signed SEKHEM release or trusted identity of all worker files. Browser settings still state that a signed Windows installer has not been published.

Authenticated browser state showed Root Admin / Admin, OMNIROUTE_TEST, My Windows computer connected, Read Authorized, Grant EXPIRED. Settings explicitly described development reading until revoked while device and enrollment remain active. These UI observations are not operation-specific authorization proof. The preceding read-only preflight recorded grant v48, enrollment revision 3, consent/binding v45 and an expired grant timestamp; this batch did not renew or alter any of them. See `mvp-reacceptance-preflight-2026-10-10.md` for that point-in-time evidence.

## Confirmed defect and bounded repair

`WorkspaceReadSetup` required the aggregate grant status ACTIVE before presenting reading as ready. A mixed read/write/terminal grant can be expired while the backend confirms persistent development reads. The browser simultaneously showed Read Authorized and requested activation of reading. This was a presentation predicate defect, not evidence that expired write/terminal authority should be enabled.

Changed `components/workspace/trusted-runtime-control.tsx`: reading readiness now recognizes the existing server-derived `persistentReadAccess` signal for an expired grant only when its underlying status and device are ACTIVE, it is not revoked, the enrollment is current and required read tools are configured. Rendering does not renew access or authorize an operation. Global Grant EXPIRED remains visible.

Changed `test/workspace-read-setup.test.tsx`: four regressions cover confirmed persistent reading, absence of confirmation, changed enrollment and revoked grant. The positive case failed before the repair. The setup handlers and backend enforcement were not changed.

Changed `docs/architecture/network-and-deployment.md`: corrected the unsupported current loopback API assertion and separated historical domain references from current source topology.

New files are this handoff and the isolated candidate/verification manifests. Existing source changes, old handoffs, database state and Runtime state were retained. No complete Git diff is claimed.

Bounded production-code diff:

```diff
-  const ready = !state.configurationRequired && !state.enrollmentChanged && access.grantStatus === "ACTIVE" && workspaceReadTools.every(t => grant?.capabilities.includes(t))
+  // The server may confirm enrolled development reads while a mixed write/terminal
+  // grant is expired. This presentation does not renew it or authorize operations.
+  const readAccessReady = access.grantStatus === "ACTIVE" || access.grantStatus === "EXPIRED" &&
+    grant?.persistentReadAccess === true && grant.status === "ACTIVE" && !grant.revokedAt && device?.status === "ACTIVE"
+  const ready = !state.configurationRequired && !state.enrollmentChanged && readAccessReady && workspaceReadTools.every(t => grant?.capabilities.includes(t))
```

## Verification performed

Commands below use the existing installation. Host checks were run outside the Windows sandbox where stated; no clean installation was performed.

| Check | Command | Exit and result |
| --- | --- | --- |
| Red regression before fix | `node --import tsx --test test/workspace-read-setup.test.tsx` | 1; 9 passed, 1 failed, persistent-read presentation |
| Focused related tests after fix | `node --import tsx --test test/workspace-read-setup.test.tsx test/workspace-runtime-status.test.ts test/workspace-connection-presentation.test.tsx` | 0; 33 passed, 0 failed, 0 skipped |
| Frontend sandbox typecheck | `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | 1; React/Radix declaration diagnostics; not treated as product proof |
| Frontend host typecheck | `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false` | 0; zero diagnostics |
| Targeted host lint | `node node_modules/eslint/bin/eslint.js components/workspace/trusted-runtime-control.tsx test/workspace-read-setup.test.tsx` | 0; zero errors, five warnings; not project-wide lint success |
| Isolated backend compilation | `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --outDir storage/release-candidates/backend-mvp-20261010-bounded/dist` | 0; existing live dist not replaced |
| Browser presentation after hot reload | Existing tab, settings closed, accessibility snapshot | Reading tools ready; Grant EXPIRED; Read Authorized; no setup or renewal clicked |

The frontend host result limits the interpretation of the sandbox diagnostics; it does not turn the failed sandbox command into a pass. Existing backend CI lint evidence in `docs/operations/backend-deployment.md` remains 2465 errors and 137 warnings. The full backend/frontend suites were not rerun or represented as current execution evidence.

## Acceptance matrix

| Gate | Status | Evidence and limitation |
| --- | --- | --- |
| Historical MVP and P0 UI closure | CLOSED historical | Authoritative 2026-10-07 baseline; unchanged |
| Punctuation repair source verification | PASS local, prior batch | 231 focused tests and backend host typecheck retained; no rerun |
| Reading setup presentation | PASS local and browser presentation | Red/green regression, 33 focused passes, live label correction |
| Exact repaired Agent backend loaded | NOT VERIFIED | Process paths/start time insufficient; candidate not launched |
| Effective authorization for selected live operation | NOT VERIFIED | Persistent-read UI signal is not complete session/project/binding/permit/signature validation |
| Current-version bounded Agent report | BLOCKED | No new provider dispatch, file read, run, receipt or checkpoint created |
| Durable replay and interruption recovery | NOT VERIFIED live | Existing source/unit evidence cannot prove interrupted-action acceptance |
| Historical TEST bounded summary | Prior saved evidence only | Run `run_1791598779866_2km7r`, receipt `rt1_RUNTIME_EXECUTION_9f370533e90333ff1bd9e27e7e2b068aa3b9bb51415ead30c143324525759190`; recorded COMPLETED/GROUNDED; does not establish current loaded repair |
| Cross-user/private scope and simultaneous SSE | NOT VERIFIED current live | No disposable accounts created or concurrent acceptance executed in this batch |
| Database table/column compatibility | PASS within previous read-only scope | 76-model check reported no missing tables/columns; not complete health |
| Migration source-history integrity | BLOCKED | 16 DB records / 15 local files; original Workspace SQL missing |
| Backend candidate compile | PASS local | Hashed candidate, unchanged source during build; startup and clean install unverified |
| GitHub CI release gates | NOT READY | Saved backend lint failures; no verified remote or CI run |
| Real-server HTTPS and remote Runtime onboarding | BLOCKED | No authorized target, DNS/certificates or verified signed Runtime distribution |
| Backup and isolated restore | NOT VERIFIED | Source snapshot is not a DB backup; no restore executed |

## Database safety

No database writes, migrations, schema changes, restore/reset or `_prisma_migrations` edits were performed. Previous read-only evidence identified `sekhem_product_dev` / `public`, no missing model tables/columns within the 76-model check and no pending/unfinished entries in its scope. Complete constraints, relational data integrity, SQL history and full schema drift remain unverified.

Missing original migration: `20260917180000_add_workspace`; preserve checksum `e72a278e407ca0a7a8fcc172844e57435420c5eb3f6c7b97415163b80f826f5c`. Recovery search remains closed without a specific new source. `reconcile_workspace_table` is not proven to be that original. No causal connection to a localhost outage was established.

Safest present choice is to leave the database unchanged and document the missing history artifact. Any forward-only reconciliation requires separately reviewed provenance, policy, SQL and isolated validation; this candidate does not solve migration reproducibility.

## Candidate and conditional deployment runbook

Candidate: `storage/release-candidates/backend-mvp-20261010-bounded`. Manifest SHA-256: `fbf67c0a136e30ccdaecea414a5dd8f148ab74bc71ca7acfd86f14f410e430c0`. Manifest records 274 backend source hashes and 569 emitted/copied artifact hashes, Node v24.21.0, compile exit 0 and unchanged source during build. It includes compiled dist, package/lock configuration and existing Prisma source. It is **PREPARED_NOT_DEPLOYED_NOT_READY**; not a self-contained installed service, signed release, Git commit or database backup. Dependencies, generated Prisma Client, startup and target compatibility require verification in an isolated approved environment.

Use Node `>=24.21.0 <25` and pnpm 11.1.2 from package metadata. Future approved preparation should use frozen root/backend lockfiles, validate/generate Prisma Client without applying migrations, and run the defined CI gates. Those commands have not been executed as a clean installation in this batch.

Before a server launch, independently confirm target ownership, OS, deployment path, secure credential mechanism, exact origins, DNS and HTTPS identity. Validate durable PostgreSQL mode, secure production sessions/cookies, provider allowlist and configuration encryption using supported secret references. Do not reuse local development credentials or expose the database. HTTP liveness alone must not represent database/operation readiness.

Deploy the compiled candidate under process supervision with `node dist/main.js`, after verifying its complete manifest, dependencies and approved environment. Record manifest identity with the launch/PID so the new process can be tied to the candidate. No launch/restart is authorized by preparation alone. Frontend production packaging, reverse proxy configuration, CSRF/rate-limit behavior and actual secure-cookie continuity still need target acceptance.

The browser accesses the web app on the server. Each user's installed, paired Runtime performs permitted operations on that user's chosen local folders. The backend does not gain filesystem access to a user's computer merely from a web sign-in. Remote Runtime transport needs public HTTPS ingress preserving trusted TLS identity; private local payloads and certificates are not an already validated production installer.

Rollback should select a previously verified immutable application artifact without overwriting user data. There is no established prior production artifact or demonstrated rollback. Database recovery requires a separately authorized backup plus manifest/provenance and isolated restore target that cannot connect to production databases or volumes. No backup/restore test was performed.

SSH/Git/Web expansion remains outside this closure batch. SSH target access, repository integration and backend deployment are independent capabilities; no external host/repository/credential was invented or contacted.

## Remaining risks and next action

- Code defect: the reproduced reading-setup presentation defect is fixed. Saved project-wide backend lint failures remain a release blocker; broad cleanup was not started.
- Missing evidence: current loaded Agent identity, complete operation authorization, grounded report/checkpoint/reload, concurrent isolation, interrupted-action recovery, comprehensive schema/data validation and clean reproducibility.
- Infrastructure blockers: absent approved server, repository/CI target, remote TLS identity, verified Runtime installer and isolated restore environment.
- Authorization blockers: no service launch/restart, access renewal, protected action, database reconciliation, restore or deployment authorization in this batch.

**Single next action:** approve a bounded launch of the prepared backend candidate after reviewing its manifest and current service environment, with a recorded launch identity and rollback to the existing launch configuration. This is a separate operational action and is not executed here. Once identity is established, recheck existing operation gates read-only and perform only the one bounded Agent report if all gates already pass; otherwise stop at the precise missing authorization.
