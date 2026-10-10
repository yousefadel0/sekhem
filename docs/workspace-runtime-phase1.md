# Workspace Runtime Integration — Phase 1

Implementation and acceptance record, 2026-09-23.

Workspace: `D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main`.

Result: Phase 1 implementation and requested real Windows acceptance PASS. No unresolved regression in the required suites.

## Architecture

The existing Workspace UI now resolves a private versioned binding before choosing a data source. A runtime-selected binding uses a small Workspace adapter around the accepted Trusted Local Runtime control plane. The backend never reads the selected folder directly. Legacy backend Workspace remains available only when no runtime binding is selected.

Runtime identity, grants, authorization, proposals, approvals, execution permits, worker transport, operations, verification and lifecycle are reused unchanged. WorkspaceController is composed in AgentRuntimeModule so its adapter can reuse those services without a dependency cycle. Workspace persistence remains in WorkspaceIntelligenceModule.

## Exact source and test files

Modified:
- `components/workspace/trusted-runtime-control.tsx`
- `backend/src/workspace-intelligence/workspace-intelligence.module.ts`
- `backend/src/workspace-intelligence/workspace.controller.ts`
- `hooks/useWorkspace.ts`
- `backend/src/agent-runtime/agent-runtime.module.ts`
- `app/page.tsx`
- `backend/src/conversation/conversation.service.ts`
- `backend/src/workspace-intelligence/workspace-binding.service.ts`
- `backend/src/agent-runtime/understanding/evidence-collector.service.ts`
- `lib/sekhem-agent.ts`
- `components/workspace/workspace-explorer.tsx`
- `components/workspace/agent-workspace.tsx`
- `backend/src/data-access/postgres-product-read.repository.ts`
- `components/workspace/sekhem-primitives.tsx`

Added:
- `backend/src/workspace-intelligence/workspace-store.service.ts`
- `backend/src/workspace-intelligence/workspace-runtime.service.ts`
- `backend/src/workspace-intelligence/workspace-runtime.contract.ts`
- `components/workspace/workspace-runtime.tsx`
- `backend/test/workspace-runtime.test.ts`
- `backend/test/workspace-runtime-persistence.test.ts`
- `backend/test/helpers/workspace-runtime-harness.ts`
- `test/workspace-runtime.test.ts`

This report is also new. Generated output: backend/dist, .next and TypeScript build metadata. Live acceptance adds only the isolated .workspace-acceptance-20260923 fixture, private local worker identity/logs and normal application records through the authorized APIs. No Git history was available; changes were compared against the captured 453-file SHA-256 baseline.

## API and contracts

Base: `/api/projects/:projectId/workspace`.

| Method | Path | Purpose |
|---|---|---|
| GET | /runtime/devices | Owned enrolled runtimes and observed availability |
| GET / POST | /bindings | List / create immutable folder and runtime association |
| GET | /bindings/:id?version=N | Fresh authorization and runtime availability |
| POST | /bindings/:id/verify | Propose exact filesystem.list for the root |
| POST | /bindings/:id/tree | Propose exact relative-directory listing |
| POST | /bindings/:id/file | Propose exact relative-file read |
| GET | /bindings/:id/tree?version=N&path=...&operationId=... | Observe the specified or latest saved listing |
| GET | /bindings/:id/file?version=N&operationId=... | Observe a saved read |

POST operation bodies carry bindingVersion, conversationId, requestId and relativePath. GET never submits or replays a runtime operation.

Typed contracts include WorkspaceBinding, WorkspaceBindingVersion, WorkspaceStatus, RuntimeWorkspaceReference, WorkspaceOperation, WorkspaceFileReference, WorkspaceReceiptReference and operation views. File references contain workspaceId, bindingVersion, runtimeId, relativePath and receiptId.

## Persistence

Private AuditEvent module: `SEKHEM_WORKSPACE_V1`. Records have deterministic primary keys, payload digests, a format version and revision. A separate PostgreSQL advisory transaction lock and compare-and-swap updates serialize mutable heads; history records are immutable. Runtime ledger records and their lock are unchanged.

There is one active binding per user/organization/project. New roots/devices create new immutable bindings with increasing binding versions; earlier versions remain. Verification changes a binding revision without retargeting it. An old receipt cannot replace a newer successful verification. Operations freeze their original binding, version, runtime, absolute path and run association. Generic audit listings exclude both private namespaces.

Conversation metadata is a server-owned reference, never authorization or a root path. The UI restores it only through fresh durable-session, ownership, organization/project and runtime checks.

## Runtime integration

Explicit UI request → durable session and project checks → owned binding and current device/grant → immutable Workspace operation → existing RuntimeControl.propose → existing human approval → existing revalidation and one-time permit → authenticated Windows worker → immutable runtime receipt → existing verification → Workspace view.

Only filesystem.list and filesystem.read are exposed by this adapter. The root is a navigation anchor, not a sandbox; existing broad machine access is unchanged. Relative-coordinate checks cannot be described as OS confinement. No automatic mutations or operation replay are added.

## UI behavior

- Enrolled runtime selection and explicit Windows path entry; no native picker or upload substitution.
- Root verification requires a successful approved list receipt before READY.
- Lazy directory expansion restores saved observations and requires an explicit approved listing to load or refresh.
- Lists retain the existing 256-entry cap and display “Showing first 256 entries; results may be incomplete.”
- Source viewer uses the existing escaped CodeBlock, reads at most 32 KiB, shows truncation, runtime identity, binding version, relative path, receipt and observation time.
- The viewer explicitly describes UTF-8 decoded text; it does not claim original-byte inspection.
- Offline/revoked/expired/unauthorized/stale bindings expose metadata only, without a backend filesystem fallback.
- The legacy Agent Run card suppresses raw stdout for the adapter's exact Workspace observation purpose and directs users to the checked viewer. This is presentation routing only, not an authorization rule; standalone Runtime action receipt output is unchanged. The offline reload acceptance verified zero rendered test-file content.
- Loading, approval, executing, denied, missing, failed, unsupported and truncated operation states remain distinct.
- UI Workspace run messages are excluded from ordinary model history/evidence using private persisted run associations. Opening a file does not automatically admit its contents to Chat/Agent context.

## Security and unchanged boundaries

Existing durable authentication, owner/organization/project policy and active runtime grants remain authoritative. Exact paths are frozen before approval and receipt attribution is checked before displaying results. Sensitive filename and secret-content checks remain in place. Unsupported binary/decoding results are not displayed as faithful source.

Protected source/config baseline comparison: 65 protected files matched their pre-edit hashes, including AI Gateway/provider/model settings, authentication, Prisma/schema/migrations, existing runtime core/client/lifecycle, package manifests/lockfiles, environment files and workspace deployment configuration. Node remains v24.21.0. No model/provider call, migration, db push, reset, deployment, sandbox, Workspace mutation or terminal-execution feature was introduced.

Database writes were limited to isolated existing test fixtures with their cleanup, and explicitly approved live enrollment/grant/conversation/proposal/receipt/binding records. Database schema and existing project files were not changed.

## Tests and builds

- Related backend suite: 444/444 passed before the final verification-order regression was added; focused rerun below covers that correction.
- Final Workspace backend tests: 31/31 passed.
- Accepted runtime controls: 69/69 passed (original suite plus supplemental audit, with overlapping controls).
- Runtime lifecycle regressions: 11/11 passed, including revoked/disabled/invalid identity termination and bounded temporary-failure backoff.
- Combined final runtime/Workspace invocation: 111/111 passed, no skips.
- Final full frontend suite: 152/152 passed, including 21 Workspace Runtime cases.
- Backend typecheck and production build: passed.
- Frontend typecheck and production build: passed; pre-existing middleware convention deprecation warning.
- Initial sandbox test attempts could not resolve the Windows user profile; identical runs outside that sandbox passed. An intermediate TypeScript narrowing error and an outdated sidebar text assertion were corrected; no unresolved failure remains.

Commands:
```powershell
# backend related suite (SEKHEM_RUNTIME_DB_TEST unset)
node --import tsx --test --test-concurrency=1 test/workspace-runtime.test.ts test/workspace-runtime-persistence.test.ts test/workspace-mvp.test.ts test/workspace-discovery-relevance.test.ts test/workspace-intelligence.test.ts test/agent-context-builder.test.ts test/agent-context-hardening.test.ts test/agent-planning.test.ts test/conversation-restoration.test.ts test/conversation.routing.test.ts test/durable-session-enforcement.test.ts test/tool-authorization.test.ts test/agent-decision.test.ts test/trusted-runtime-operations.test.ts test/trusted-runtime-transport.test.ts test/trusted-runtime-client.test.ts

# backend final runtime + Workspace suite; isolated DB fixtures are cleaned by existing tests
$env:SEKHEM_RUNTIME_DB_TEST='1'
node --import tsx --test --test-concurrency=1 audit/post-runtime-controls.test.ts test/trusted-runtime-persistence.test.ts test/trusted-runtime-operations.test.ts test/trusted-runtime-transport.test.ts test/trusted-runtime-client.test.ts test/workspace-runtime.test.ts test/workspace-runtime-persistence.test.ts

# frontend
npm test
npm run typecheck
npm run build

# backend
npm run typecheck
npm run build
```

## Real Windows acceptance

Dedicated folder: `.workspace-acceptance-20260923` under the repository root. Only HELLO.md and nested/CHILD.md were created manually in this disposable fixture; user project files were not edited by runtime actions.

- A separate acceptance runtime was enrolled through the UI after explicit user approval.
- The project received a one-hour grant for filesystem.list and filesystem.read only.
- Root verification required approval, then became READY from a VERIFIED runtime receipt.
- Browser reload restored binding v1 and the saved observation without submitting a new operation.
- After manual fixture creation, an approved refresh listed HELLO.md and nested.
- Lazy nested expansion required its own approved list and returned CHILD.md.
- HELLO.md required a distinct approved read; the source viewer showed the actual 99-byte receipt text and provenance.
- All four execution receipts below were reread through RuntimeLedgerService: SUCCEEDED / VERIFIED, same runtime/device.
- Worker PID 23452 was stopped at 2026-09-23T15:48:52Z. The UI changed to OFFLINE after the existing heartbeat window; tree and file content disappeared, cached binding metadata remained, and no backend fallback appeared.
- Offline browser reload retained the same binding and displayed only Workspace metadata; the old Agent Run receipt card no longer rendered raw Workspace content.
- The same worker identity was restarted as PID 18512 at 2026-09-23T15:57:59Z. Explorer returned to READY with the same root, runtime fingerprint and binding v1 (revision 2). Device connection epoch advanced to 2.
- A final read-only database check confirmed exactly four operations, no replay/new operation, and the same server-owned conversation binding reference. All eight saved UI-operation messages were excluded by the model-history filter (zero admitted messages).

Local backend (PID 29372), frontend (PID 25316), and restored test worker (PID 18512) were left running. The explicitly approved read/list grant retains its original one-hour expiry. The test fixture and acceptance records remain available for inspection.

Binding: `workspace_90f4b2dc0aa7d392f11247f601f7a3b2239f72779fca7c6001eb89232333079b`, version 1.
Runtime: `rt1_RUNTIME_DEVICE_509037ca5279b7f6cdb3af46c25e182b0915831ad84baa6938f0e0db94547b77`.
Fingerprint: `c0142d23ace3d5d0c26b35f4d77b556c947fc88abf5dcb71c3c046378c3750d5`.
Conversation: `conv-1790178269881-iv4e70`.

| Operation | Receipt |
|---|---|
| filesystem.list (root) | `rt1_RUNTIME_EXECUTION_d43221328feb3ce8ffef337c971e162e735a07ecb6d79b177188048b477acec1` |
| filesystem.list (root) | `rt1_RUNTIME_EXECUTION_fdea022d62af4b6c1ae86e506fb3ee38baa36da94b016707ecf2ba009a912af3` |
| filesystem.list nested | `rt1_RUNTIME_EXECUTION_efdb3a62437841e63f1752482b79524a5db1a44a4862d59a3d535f9e1302a141` |
| filesystem.read HELLO.md | `rt1_RUNTIME_EXECUTION_cc13b55589f318a882fd887785c4fca244262428717962e209ddad1362826364` |

HELLO.md disk SHA-256 and receipt-text SHA-256 both equal `83139464aff1b5a44e6860c685c54b18c0eb4b8536ab4de664b77fbb644e4818`.

## Limitations and next phase

This slice is Windows drive paths, explicit selection, one active binding per user/project, bounded list/read, and approved observations only. Offline detection uses the existing 45-second heartbeat window plus the UI polling interval. Listings and source text are timestamped observations, not continuous filesystem watches. Reload restores the binding/tree, not a new file read.

No native picker, installer/updater, Workspace content search, autonomous Agent runtime reads, writes/moves/copies/deletes, terminal execution, stale-safe overwrite or sandbox was added. Old bindings and operations remain retained; the UI operates only the active binding. P0-B migration reconciliation remains deferred and untouched.

Recommended next phase: explicit, approval-backed runtime evidence admission into the existing Agent context pipeline, with current binding/version/receipt provenance and the existing evidence security and budget rules. Implement it separately before any Agent runtime mutation capability.
