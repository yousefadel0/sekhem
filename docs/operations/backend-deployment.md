# Backend deployment

Owner: Platform · Deployment preparation reviewed: 2026-10-10. Real server deployment is NOT VERIFIED.

1. Merge a reviewed exact SHA with green verification and an existing rollback bundle.
2. Confirm required secret names are configured through the secure runtime UI; never read or print values.
3. Build once with Node 24.21.x/pnpm 11.1.2 and deploy the exact reviewed SHA. Database changes require a separately reviewed migration procedure, database identity and backup.
4. Preserve server-local `backend/pnpm-workspace.yaml` changes unless separately reconciled.
5. If privilege is required, stop after staging and request exactly one manual restart.
6. Verify loaded SHA, `MainPID`, `NRestarts`, and local/private/public health 200/200/200.
7. Verify unauthenticated mutation rejection and CORS without Provider Test or R&D.

`sekhem-backend.service` is the proposed service name; no current remote host or service has been verified. Host/user/key details belong in the approved secure connection profile, not source documentation.

## Release gates

- Install from committed lockfiles; frontend and backend have separate package roots.
- Backend: `pnpm prisma:generate`, `pnpm prisma:validate`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Generation is a build step; it does not apply migrations.
- Frontend: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` with the intended API URL. A localhost build is not a remote deployment artifact.
- Set `NODE_ENV=production`, a dedicated PostgreSQL `DATABASE_URL`, durable authentication mode, a strong session secret and the configuration encryption master key through the server secret manager. Do not use staging credentials or local runtime state as production enrollment.
- Restrict the backend's HTTP port to local/private ingress. Current application code listens on all interfaces; enforce the network boundary explicitly before starting it remotely.
- Database unavailability now rejects production startup. Check database identity, migrations/checksums, readiness and restart recovery independently.
- Resolve the applied migration `20260917180000_add_workspace` missing from the local migration directory before choosing a migration procedure. Do not invent its SQL, mark it applied, or reset the database to hide drift.
- Existing SSH support is pinned connection validation only; remote file/command support is not a completed release capability.

## Runtime transport and user computers

The web frontend and backend are hosted centrally. Each user needs only the separately distributed Runtime on their own machine, not the SEKHEM source checkout. A user pairs their computer, selects their folder and confirms access. Personal chats, bindings and grants stay scoped to that user.

Production must provide a reachable HTTPS Runtime endpoint with a certificate identity pinned by the local Runtime. The existing extra TLS listener is loopback-only. A proxy must preserve a real TLS hop to that listener: transport routes reject ordinary HTTP, and adding forwarded headers does not authorize transport. Test this topology with a remote user computer before claiming multi-device readiness. Do not expose the development listener or reuse its keys as a public service.

A signed Windows installer has not been delivered. Until packaging/signing and enrollment against the real endpoint are verified, ordinary-user production onboarding remains a release blocker.

## SSH acceptance prerequisites

Provide an authorized disposable server, reachable host/port, dedicated SSH account, independently verified host-key fingerprint, project/tenant-scoped credential reference from a secret manager and a remote root. Private IP connectivity requires an actual route/VPN/bastion arrangement. Connection validation never grants read or command authority. See `../architecture/ssh-target-registration.md` for the implemented boundary.

## Verification snapshot — 2026-10-10

Release status: **NOT READY for GitHub CI / remote deployment**. Local verification is not production acceptance.

- Frontend full tests: 570 passed, 0 failed. Production build and typecheck passed.
- Frontend CI lint (`eslint .`): 0 errors, 239 warnings. Generated storage/scratch snapshots are excluded; application and test rules remain enabled.
- Backend production build and typecheck passed. The preceding full run (`storage/backend-release-tests-frozen-20261010.log`) had 3220 tests: 3216 passed, 1 failed, 3 skipped. Its sole failure was an obsolete expectation that a staging Admin without an organization could reach tenant administration. The corrected HTTP contracts passed 32/32. The final full run (`storage/backend-release-tests-final-stable-20261010.log`) exited 0: 3220 tests, 3217 passed, 0 failed/cancelled, 3 skipped, duration 398504.5096 ms. Three diagnostic/liveness/startup test files received type-only cleanup during this run; those exact files were independently rerun afterward, 16/16 passed, with clean targeted lint. No production code changed during the final full run. Skipped tests are not acceptance proof.
- Backend CI lint (`eslint .`) still fails: the current run (`storage/backend-ci-lint-current-20261010.log`) reports 2465 errors, 137 warnings, down from 2486 errors after the test type cleanup. The earlier narrower src/test run also failed (2305 errors, 137 warnings); that narrower count was not remeasured after cleanup. Do not disable rules, skip CI or treat a successful build as lint success.
- Live TEST read/summary acceptance: `run_1791598779866_2km7r` persisted `COMPLETED`, `GROUNDED`, progress 100, failureReason null. One authorized `filesystem.read` of `sekhem-e2e-test.txt` produced verified receipt `rt1_RUNTIME_EXECUTION_9f370533e90333ff1bd9e27e7e2b068aa3b9bb51415ead30c143324525759190`, UTF-8 decoded, not truncated. This proves the bounded read journey; it does not prove write/read-back, arbitrary commands, SSH, another physical computer, or remote deployment. Decoded excerpt offsets are not raw-byte identity.
- A prior live attempt failed before dispatch with a persistence diagnostic. Its original database error code was not retained by the old allowlist, so its specific cause remains unresolved. Diagnostics now preserve bounded Prisma codes without exception messages or connection/query values. A later successful attempt does not erase this unresolved failure.
- Read-only database inspection identified `sekhem_product_dev` / `public`: no RepositoryConnection, GitHubIntegrationStatus, SshTarget, SshTargetRevision or SshConnectionValidation rows. No backend .env SSH credential references were counted; running-process overrides were not inspected.
- This checkout has no Git metadata or verified GitHub remote. No push, external SSH connection, migration, grant change, service restart or deployment was performed for this release preparation.

Before declaring ready: resolve backend lint and migration-history provenance, prove an expressly authorized write with independent read-back/receipt/diff/reload, verify remote Runtime TLS onboarding and signed distribution, and configure independently authorized repository and disposable SSH targets. GitHub repository access, SSH access and deployment require separate acceptance evidence.

## Local verification commands

Commands below were run locally against the existing installation. CI still requires a clean install from both frozen lockfiles and its own successful run.

Frontend package root:

```powershell
node --import tsx --test test/*.test.ts test/*.test.tsx
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/next/dist/bin/next build
```

Backend package root:

```powershell
node --import tsx --test --test-concurrency=1 test/*.test.ts
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/prisma-cli.mjs validate
```

No Git diff, commit or reviewed release SHA can be produced from this checkout until its absent Git metadata is restored or an explicitly authorized repository is initialized. Existing source edits and local evidence have been retained; ignoring local evidence for release does not delete it.
