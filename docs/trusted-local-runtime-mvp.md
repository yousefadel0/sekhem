# Trusted Local Runtime — broad machine access, controlled execution

Implementation and acceptance report — 23 September 2026.

The controlled runtime path is implemented and the four authorized Windows actions succeeded. This is not an all-green repository acceptance: the full backend suite still reports 51 failures and 39 cancelled tests in unchanged legacy fixtures. P0-B remains deferred.

1. **RuntimeLedgerService architecture.** A dedicated typed protocol uses existing AuditEvent rows under SEKHEM_TRUSTED_RUNTIME_V1. It does not use AuditService as authority. Versioned envelopes validate payload digests, deterministic record IDs, revisions and immutability. Mutable heads have immutable revisions and compare-and-swap updates. A PostgreSQL transaction advisory lock serializes the MVP control operations across backend processes. Persistence failures propagate; there is no memory fallback. Ordinary audit listings exclude private runtime ledger records.

2. **Record types.** RUNTIME_DEVICE, RUNTIME_FINGERPRINT, RUNTIME_GRANT, RUNTIME_PROPOSAL, RUNTIME_EXECUTION, RUNTIME_IDEMPOTENCY, RUNTIME_PERMIT_CONSUMPTION, RUNTIME_RESULT, RUNTIME_CHALLENGE, RUNTIME_AUTH_CONSUMPTION and RUNTIME_REVISION. SHA-256-derived AuditEvent primary keys reserve identities; exact duplicates return existing records and conflicting reuse rejects.

3. **RuntimeDevice.** Public Ed25519 key, fingerprint, owner, organization, key/protocol/runtime versions, connection epoch, status and timestamps are durable. ACTIVE, REVOKED and DISABLED are enforced. Enrollment requires possession proof. Private keys stay in the local owner-protected identity file and never enter PostgreSQL.

4. **RuntimeGrant.** Enrollment grants no project access. A separate deterministic runtime/project grant records TRUSTED_MACHINE mode, capabilities, owner/org, version, status and expiry. Grant updates and revocation advance the version. The UI grants only selected capabilities for one hour. Device ownership, current organization/project access and grant state are revalidated.

5. **RuntimeExecution.** Independent ledger attribution includes execution/intent/idempotency identities, runtime/grant, user/org/project, originating conversation/run/plan/step/proposal/approval, exact validated input and digests. State, times, cancellation, error, result and verification are stored separately from immutable attribution. Final process output/PID/exit/duration/truncation live in the typed result; bounded partial output is saved during heartbeats. Run/conversation IDs are retained as attribution strings, not cascading foreign keys.

6. **Authentication.** Nonce/challenge, signed operation/body digest, timestamp, expiry, runtime ID and current connection epoch authenticate the worker. Invalid signatures, expired challenges, replay, revoked/disabled devices and stale epochs reject. Browser controls continue using AuthService.validateDurableSession. Dispatch revalidates the originating durable session and current account/membership. Existing ResourceAuthorizationService, ToolAuthorizationService and ToolApprovalService enforce action and reviewer authority.

7. **HTTPS polling.** The worker authenticates, connects, polls, acknowledges once, executes and submits a signed receipt. TLS requires a genuinely encrypted socket, ignoring forwarded-protocol claims. The optional local listener binds 127.0.0.1:7443 with TLS 1.2 minimum. The worker explicitly trusts the generated local certificate; certificate verification stays enabled. Only runtime transport gets a 512 KiB HTTP parser; other application routes keep their previous body limits. Application-level record bounds remain stricter.

8. **Execution permit.** One transaction verifies runtime/epoch, grant/version/owner/org/project, current run/plan/proposal/approval and exact operation binding, reruns canonical tool authorization and creates the execution/idempotency/permit records. The permit is consumed before dispatch. The runtime receives the payload only after commit. A one-time start acknowledgement rechecks grant state. No database transaction waits for an OS process.

9. **Idempotency.** Duplicate polls cannot deliver a second executable payload. Start acknowledgement cannot authorize another execution. An identical receipt may be retransmitted; conflicting receipts reject. Reconnects fence earlier epochs. One-time authorization is not a promise of exactly-once OS effects: disconnected or ambiguous operations settle OUTCOME_UNKNOWN and are never automatically repeated.

10. **Filesystem.** Real Node fs/promises implements read/write/list/search/create/delete/move/copy with explicit absolute paths and bounded results. Create and copy do not overwrite. Delete handles a file or empty directory, not recursive directory deletion; copy/move handle regular files. Read/search/list, content and verification sizes are bounded. This is broad machine access under the runtime account, not a sandbox or workspace confinement claim.

11. **Process execution.** Explicit executable/args/cwd/timeout are part of the proposal and approval. spawn uses shell:false. Windows npm invokes the installed npm-cli.js through Node with the approved arguments. Actual PID/stdout/stderr/exit/duration/timeout/cancellation are captured. Output is limited to 32 KiB per stream; timeouts are at most five minutes. No natural-language text is converted into commands.

12. **Cancellation.** Before dispatch no OS execution occurs. A revocation winning before start denies the acknowledgement, even if dispatch committed first. Running process cancellation uses actual process-tree termination and requires evidence of termination. An unconfirmed termination yields OUTCOME_UNKNOWN. Completed receipts are not rewritten as cancelled.

13. **Verification.** Write/create re-read and hash the resulting file; delete checks absence; copy compares source and destination hashes; move additionally checks source absence and destination existence. Terminal verification requires actual exit code zero. The backend applies deterministic receipt checks. An LLM cannot declare success. Verification still trusts the enrolled runtime and machine; it is not remote attestation.

14. **Conversation/AgentRun deletion retention.** PostgreSQL tests create real isolated executions, delete their originating conversation/run, and prove attribution, result, verification and timestamps remain readable through the runtime ledger. A separate case deletes AgentRun before result submission and still persists the receipt. Test fixtures are uniquely named and cleanup removes only their own tracked rows; existing application data and schema are not reset.

15. **SSE/UI/chat.** The existing conversation composer offers exact runtime actions and enrollment/grants. Existing Agent Control Card displays proposal, exact approval, authorization, execution, partial/final output and verification. All requested execution/verification event types are emitted into the existing AgentRun/SSE projection. The ledger remains authoritative. Runtime plans point to their receipt; planning-only execution flags are null for runtime plans instead of falsely claiming no execution. Actual completion remains distinct from PLAN_READY. A stale generated Next cache caused a temporary SSE proxy 404 during development; rebuilding without a concurrent dev server resolved it without changing the proxy. Live SSE and restored receipts were observed in the browser.

16. **Tests.** Final focused runtime: **33/33 passed**, including real PostgreSQL identity/uniqueness, authentication/replay/expiry, grant changes, approval/input/plan binding, concurrent consumption, revocation races, one-time start, output bounds, duplicate/conflicting results, deletion retention, reconnect/unknown recovery, real filesystem/process/cancellation and scoped HTTP parser cases. A race test initially assumed revocation always acquired the transaction lock first; it was corrected to assert both orderings and mandatory denial before OS start after revocation. Related authorization/session/SSE: **272/272 passed**. Final frontend: **131/131 passed**. Full backend: **1,059 tests; 968 passed; 51 failed; 39 cancelled; 1 skipped**. The skipped opt-in database test passed in the separate runtime run. Failures occur in unchanged auth/AI-patch/automation/R&D/provider-settings/HTTP fixtures (including signature-only/staging session and cookie-policy expectations), Windows symlink creation EPERM, and a legacy source-text assertion about the disabled PowerShell executor. No full pre-edit run was captured, so the report does not claim a proven before/after baseline for every failure. No authorization rule was weakened to accommodate them.

17. **Typecheck.** Backend npm run typecheck and frontend npm run typecheck both passed against final source.

18. **Build.** Backend npm run build and frontend npm run build both passed. backend/dist and .next were regenerated. The final backend/frontend were restarted locally, and the saved acceptance receipt survived restart and browser reload. Next reports its existing middleware convention deprecation warning. No deployment occurred.

19. **Windows E2E.** Each action followed user → exact plan → proposal → human approval → backend authorization → HTTPS runtime → OS operation → verification, in one conversation.

| Action | Actual result | Duration | Exit | Verification |
| --- | --- | --- | --- | --- |
| Create SEKHEM_RUNTIME_TEST.txt | Exact content: SEKHEM LOCAL RUNTIME WORKS; independently read on Windows | 6 ms | N/A | VERIFIED |
| Delete the same file | notFound:true; Windows Test-Path remains False | 2 ms | N/A | VERIFIED |
| node --version | stdout v24.21.0; stderr empty; PID 12092 | 86 ms | 0 | VERIFIED |
| npm test at repository root | 130 tests passed at execution time; stderr empty; PID 27960 | 2,758 ms | 0 | VERIFIED |

The later frontend display regression adds the 131st test, which passed in the final local suite. The approved npm action ran the root/frontend suite; the separate backend suite result is reported above.

Conversation: conv-1790165876481-tmb6a3.

Execution receipts:
- Create: rt1_RUNTIME_EXECUTION_1f6c28f6c838f9ff737d3a432d62adc1539e52f766afa44396eed31eb1c78b30
- Delete: rt1_RUNTIME_EXECUTION_0b4ef1e156a371481a7c05b661945454bcbee9b6b81007b9beb7725655d92483
- Node: rt1_RUNTIME_EXECUTION_1c6aa3af30a3d4fb998414883bb86ab151aa16927cb673c310310991ccb7afe7
- npm: rt1_RUNTIME_EXECUTION_dedbc3ff8416e564e5bf4ad4b0e0a4df6752141526787bb75f57bc2177ffa0e2

20. **Remaining limitations.** P0-B is deliberately unresolved. Full-backend test failures remain an acceptance blocker. The installed Node is 24.21.0 while both manifests require Node 22; release acceptance on the declared version remains necessary. This local MVP has a manually launched worker and local TLS provisioning, no service installer, automatic key/certificate rotation or remote runtime deployment. Exact user-authored actions are executable; ordinary model-generated plans do not automatically become commands. Filesystem paths are broad and trusted, with no strong race/hard-link isolation. Bounded output can truncate; a receipt exceeding the record bound is rejected rather than weakening bounds. Challenge/consumption/revision retention and the global transaction lock need operational retention/capacity work before sustained multi-runtime use. There is no general retained-execution history browser after conversation deletion; authorized ledger APIs retain access by known run ID. No automatic mutation recovery is implemented.

Protected-boundary check: SHA-256 comparisons against the pre-edit snapshot confirm **24 AI Gateway/provider files, 9 auth files, 10 Prisma schema/migration files and 10 environment/manifest/lock files unchanged**. No migration, db push, reset, provider call, endpoint/model/credential change or deployment was performed. Database writes were the requested runtime/control/acceptance records and isolated regression fixtures, not schema changes. Workspace discovery and existing read-only file security code are unchanged.

Commands used for final validation (from backend unless marked root):

```powershell
$env:SEKHEM_RUNTIME_DB_TEST = '1'
node --import tsx --test --test-concurrency=1 test/trusted-runtime-operations.test.ts test/trusted-runtime-persistence.test.ts test/trusted-runtime-transport.test.ts
node --import tsx --test --test-concurrency=1 test/tool-authorization.test.ts test/agent-decision.test.ts test/durable-session-enforcement.test.ts test/agent-runtime.events.security.test.ts test/agent-runtime.events.observable.test.ts test/agent-runtime.events.controller.test.ts
# Full backend suite ran without the opt-in database flag.
Remove-Item Env:SEKHEM_RUNTIME_DB_TEST -ErrorAction SilentlyContinue
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# Root frontend:
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Local setup (backend directory; PowerShell 7 for the certificate script):

```powershell
./scripts/setup-runtime-tls.ps1
npm.cmd run build
npm.cmd start
# Separate terminal; --pair only for enrollment:
node dist/trusted-runtime/runtime-client.js --ca .runtime-state/localhost.crt --state .runtime-state/client --pair
# After enrollment, restart the same device without --pair.
```

The runtime client requires its explicit CA certificate. Keep .runtime-state private and uncommitted. Enrollment alone does not grant authority; select a project grant and approve each exact action in the conversation.

Files modified or added, relative to the repository (plus this report):

- `.gitignore`
- `app/page.tsx`
- `app/workspace.css`
- `backend/scripts/setup-runtime-tls.ps1`
- `backend/src/agent-runtime/agent-result.ts`
- `backend/src/agent-runtime/agent-runtime.module.ts`
- `backend/src/agent-runtime/agent-runtime.service.ts`
- `backend/src/agent-runtime/tools/tool-contract.ts`
- `backend/src/agent-runtime/tools/tool-registry.service.ts`
- `backend/src/agent-runtime/tools/tool-scope.service.ts`
- `backend/src/agent-runtime/understanding/agent-presentation.ts`
- `backend/src/data-access/postgres-product-read.repository.ts`
- `backend/src/main.ts`
- `backend/src/trusted-runtime/runtime-client.ts`
- `backend/src/trusted-runtime/runtime-control.service.ts`
- `backend/src/trusted-runtime/runtime-execution.service.ts`
- `backend/src/trusted-runtime/runtime-identity.service.ts`
- `backend/src/trusted-runtime/runtime-ledger.service.ts`
- `backend/src/trusted-runtime/runtime-operations.ts`
- `backend/src/trusted-runtime/runtime-plan.ts`
- `backend/src/trusted-runtime/runtime-tls.ts`
- `backend/src/trusted-runtime/runtime-tools.ts`
- `backend/src/trusted-runtime/runtime.contract.ts`
- `backend/src/trusted-runtime/runtime.controller.ts`
- `backend/test/tool-authorization.test.ts`
- `backend/test/trusted-runtime-operations.test.ts`
- `backend/test/trusted-runtime-persistence.test.ts`
- `backend/test/trusted-runtime-transport.test.ts`
- `components/chat/agent-run-card.tsx`
- `components/workspace/agent-control-card.tsx`
- `components/workspace/agent-inspector.tsx`
- `components/workspace/agent-workspace.tsx`
- `components/workspace/sekhem-primitives.tsx`
- `components/workspace/sekhem-shell.tsx`
- `components/workspace/trusted-runtime-control.tsx`
- `hooks/useAgentRunEvents.ts`
- `lib/sekhem-agent.ts`
- `test/agent-result-presentation.test.ts`
- `test/sekhem-agent-events.test.ts`
- `test/workspace-design.test.ts`
- `docs/trusted-local-runtime-mvp.md`

Generated/local-only artifacts: backend/dist, .next, TypeScript incremental metadata, and ignored backend/.runtime-state (local identity/TLS material and test/process logs). Private key/TLS secrets are intentionally absent from this report.
