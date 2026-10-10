# Phase 6.3B — Bounded Workspace Read Grant

Status: PARTIAL — implementation and related regression checks pass; real Windows acceptance is pending explicit activation of the replacement disposable runtime and read-only consent.

## Gap analysis performed before implementation

The existing `RuntimeGrant` is reusable and keyed by runtime/project. It contains grant ID, runtime ID, user, organization, project, TRUSTED_MACHINE mode, capabilities, version, status, creation, optional expiration and revocation timestamps. Private-ledger revisions retain history. It previously supplied capability authority, but not reusable human consent for a specific Workspace binding.

`RuntimeControlService.propose()` and `proposeInspectionTx()` both force the existing ToolAuthorization approval gate. Tool definitions continue to require approval. `ToolApprovalService` keys an approval by run/request; its fingerprint binds the exact tool/input, plan, scope and actor/action coordinates. This explains why each new file required another human approval. Dispatch and start revalidate the current grant, actor, project, plan and approval.

The smallest change is an explicit Workspace Read consent nested in the existing grant, plus coverage on each exact operation. It does not replace the gate or share operation receipts. Legacy grants and standalone actions retain exact-action approval. Existing private-ledger persistence is sufficient; no schema or migration is needed.

## Implementation and grant model

- Human-only Workspace endpoints approve or revoke consent using durable session validation and the existing Project EXECUTE / Approval APPROVE authorization services.
- The server derives workspace ID, binding ID/version, root, runtime ID/fingerprint, user, organization and project from the authoritative active, verified binding.
- Consent allows exactly filesystem.list, filesystem.search and filesystem.read. Its fingerprint, version, approver and approval timestamp are retained. Expiration is finite: 1–60 minutes, capped by an existing active parent grant's expiry. Renewal requires explicit consent.
- Approving/revoking consent increments the parent grant version. Existing active capabilities remain unchanged; recreating expired/revoked capability authority grants only the three read operations.
- Every covered operation still receives a separate proposal, operation/request identity, execution intent, exact authorization binding, permit, receipt and verification. The existing approval record explicitly identifies inherited Workspace Read consent rather than claiming a new human decision.
- Coverage is revalidated against current durable state. Grant revocation/expiry fails closed rather than falling back to a new signature-only or implicit approval path. In-flight heartbeat checks request cancellation; already completed observations remain historical.
- Binding/project/runtime changes cannot transfer consent. Old pending operations fail revalidation. An old worker that does not advertise support for scoped-read checks cannot receive consent-covered execution.

## Security and evidence

Session, actor, organization/project authorization, exact-action checks, signed transport, connection epochs, permit/idempotency semantics, receipt verification and evidence provenance remain in place. Mutation and terminal actions are not covered; even where separately granted they still require their existing exact-action approval.

Scoped worker operations validate root/target containment, sensitive/excluded paths, canonical paths and link restrictions. Windows junction/hard-link denial is tested. File reads inspect bounded content and fail without returning content on a scoped security error. This remains the accepted Trusted Local Runtime architecture, not an OS sandbox against a hostile process running as the same Windows account.

Explorer observations do not become Agent evidence merely because consent exists. Explicit evidence requests and the existing verified receipt/admission pipeline are retained. Tests exercise forged/unverified/stale evidence rejection and immutable provenance.

## Explorer and Agent UX

Explorer displays one consent panel with exact workspace/root/runtime/binding scope, the three allowed operations, excluded mutation/terminal operations, expiration and revoke control. The first pending file resumes after consent. Subsequent reads, directory requests and bounded search reuse it. Historical observations remain labeled as observations, not proof of current access.

Agent inspection operations show “Authorized by Workspace Read Grant” with scope, grant version, expiration, each operation and its receipt/verification. In-memory integration proves repeated list/search/read operations remain in one AgentRun without additional human decisions.

## Files changed

Backend:

- `backend/src/trusted-runtime/runtime.contract.ts`
- `backend/src/trusted-runtime/workspace-read-coverage.ts` (new)
- `backend/src/trusted-runtime/workspace-read-path.ts` (new)
- `backend/src/trusted-runtime/runtime-control.service.ts`
- `backend/src/trusted-runtime/runtime-execution.service.ts`
- `backend/src/trusted-runtime/runtime-client.ts`
- `backend/src/trusted-runtime/runtime-operations.ts`
- `backend/src/agent-runtime/tools/tool-contract.ts`
- `backend/src/agent-runtime/tools/tool-authorization.service.ts`
- `backend/src/agent-runtime/tools/tool-approval.service.ts`
- `backend/src/agent-runtime/inspection/inspection.types.ts`
- `backend/src/agent-runtime/inspection/agent-inspection.service.ts`
- `backend/src/workspace-intelligence/workspace-runtime.service.ts`
- `backend/src/workspace-intelligence/workspace.controller.ts`

Frontend:

- `app/page.tsx`
- `lib/sekhem-agent.ts`
- `lib/workspace-runtime-status.ts`
- `components/workspace/workspace-read-grant.tsx` (new)
- `components/workspace/workspace-explorer.tsx`
- `components/workspace/workspace-runtime.tsx`
- `components/workspace/runtime-evidence.tsx`
- `components/workspace/trusted-runtime-control.tsx`
- `components/workspace/agent-inspection-card.tsx`
- `components/workspace/sekhem-primitives.tsx`

Tests and acceptance fixture:

- `backend/test/workspace-read-grant.test.ts` (new)
- `backend/test/workspace-read-path.test.ts` (new)
- `backend/test/helpers/inspection-loop-harness.ts`
- `test/workspace-read-grant.test.ts` (new)
- `test/workspace-runtime-status.test.ts`
- `.phase63-acceptance-20260923/docs/OVERVIEW.md` (new harmless fixture)
- `.phase63-acceptance-20260923/src/app.ts` (new harmless fixture)
- This report; expected generated build outputs and local acceptance logs/identity state.

## Validation

- Related backend suite: **171 passed, 0 failed**. Includes 28 new grant/worker cases and the existing Workspace, evidence, Runtime lifecycle/transport/operations/persistence and Agent-loop/security/gap suites.
- Full frontend suite: **201 passed, 0 failed**.
- Broader backend suite, excluding destructive database integration: **1,218 tests; 1,127 passed, 51 failed, 39 cancelled, 1 skipped**. It is not a green full-suite result. Failures occur in older HTTP/auth fixture suites, an expectation of a Secure cookie in local configuration, a Windows symlink privilege failure and an existing disabled-PowerShell expectation. They were not repaired or bypassed in this scoped change.
- Backend `npm run typecheck` and `npm run build`: passed.
- Frontend `npm run typecheck` and `npm run build`: passed. Next.js reports its existing middleware convention deprecation warning.
- Hash comparison against the prior Phase 6.3A baseline (219 protected/config/backend files) shows changes only in the 12 existing backend files listed above. Authentication, Prisma/migrations, provider/model settings, budgets, environment files and package/lockfiles are unchanged.

The backend related command used `node --import tsx --test --test-concurrency=1` with `workspace-read-grant`, `workspace-read-path`, `workspace-runtime`, `workspace-runtime-evidence`, `trusted-runtime-client`, `trusted-runtime-transport`, `trusted-runtime-operations`, `workspace-runtime-persistence`, `agent-workspace-loop`, `agent-workspace-loop.security` and `agent-workspace-loop.gaps` test files. Frontend used `node --import tsx --test test/*.test.ts`.

## Live acceptance so far

- Authenticated SEKHEM session confirmed in the normal UI.
- Existing binding v20 still targets the disposable `.phase63-acceptance-20260923` folder, but its Runtime B (`c0142d23ace3d5d0c26b`) is now permanently REVOKED. All enrolled runtimes are revoked. Its worker exited on HTTP 401, as required by lifecycle policy.
- User approved preparing a new disposable runtime rather than undoing revocation. The replacement was prepared using the existing TLS endpoint/certificate. No old identity was restored.
- Backend and frontend were rebuilt and restarted with unchanged configuration.
- Activation, normal UI binding/verification and the bounded read-consent confirmation are pending. No new runtime grant or consent has been activated yet.
- Five-file/folder/search acceptance, live Agent multi-operation acceptance, mutation denial, revocation/history and reconnect/no-replay checks remain unverified in the real application. No live provider call has been made for this batch.

## Not implemented / remaining limits

- No installer/download or Phase 6.4.
- No provider/model/GLM/thinking/output-budget changes.
- No authentication redesign, Prisma/migration change, manual database rewrite or cryptography change.
- Existing bounded reads/search and Agent iteration limits remain; consent is not unlimited filesystem access or evidence authorization.
- The known GLM output truncation limitation remains unchanged and could still block Agent acceptance.
- PASS requires completion of real Windows acceptance; tests alone are insufficient.
