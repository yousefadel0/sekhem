# Phase 6.3A — Runtime and Workspace State Consistency

PHASE 6.3A STATUS: PASS

Acceptance completed on Windows, 2026-09-24 (Africa/Cairo), against the rebuilt application. This decision covers state consistency only. The previously observed GLM output truncation remains outside this phase.

## Implementation

The navbar, sidebar, Explorer, settings, Runtime composer, and Agent inspection presentation now share the exact Workspace-bound runtime context. No device is silently substituted when that identity is missing, offline, revoked, or disabled. Explicit selection of a different device is labeled “Not the Workspace Runtime”; selecting the bound device does not modify the binding.

Presentation distinguishes installation status unknown, identity, connection/last seen, project grant, binding/version, per-operation approval, and saved verified observations. Connected does not mean authorized. Saved receipts retain their observation time/version and do not authorize operations or automatically become fresh Agent evidence.

The existing 15-second inventory and 5-second Workspace availability cadences remain. Response sequence guards prevent late requests from overwriting a newer context. Current binding failures take precedence over older inventory. Context changes hide mismatched or unavailable content.

Live acceptance also identified and repaired three presentation gaps: indistinguishable device names in the folder selector, an Ask Agent action offered for an unavailable file, and a folder selector retaining an old Online snapshot after revocation. The selector still uses the existing project-scoped discovery API and overlays the shared inventory; it introduces neither devices nor permissions.

## Exact files changed

- `app/page.tsx`
- `lib/workspace-runtime-status.ts` (new)
- `hooks/useWorkspaceRuntime.ts` (new)
- `hooks/useWorkspace.ts`
- `components/workspace/sekhem-primitives.tsx`
- `components/workspace/workspace-header.tsx`
- `components/workspace/sekhem-shell.tsx`
- `components/workspace/trusted-runtime-control.tsx`
- `components/workspace/workspace-explorer.tsx`
- `components/workspace/workspace-runtime.tsx`
- `components/workspace/agent-workspace.tsx`
- `components/workspace/agent-control-card.tsx`
- `components/workspace/agent-inspection-card.tsx`
- `test/workspace-runtime-status.test.ts` (new)
- `test/workspace-runtime.test.ts`
- `test/workspace-design.test.ts`
- This report.

Expected production-build artifacts and local acceptance worker logs/state were also generated. The checkout has no Git metadata, so this is a task edit inventory rather than a Git diff.

## Backend and security

No backend implementation changes. All 219 protected files in the pre-change snapshot (backend source, Prisma, configuration, package/lock files, and environment files) retained identical SHA-256 hashes after acceptance.

Authentication, pairing, cryptography, identity fencing, authorization, approvals, revalidation, permits, verification, evidence admission, and the prohibition on backend filesystem fallback remain unchanged. Every executed acceptance operation used the actual authenticated UI and its exact-action approval. UI labels confer no authority.

No direct database edits, migrations, schema changes, provider calls, or provider/model/thinking/output-budget changes occurred. Normal UI enrollment, grants, binding, approval, and receipt records were created by the authorized acceptance flow.

## Tests and build

- Frontend `npm.cmd test`: **192/192 passed**, including 17 new state-consistency regressions.
- Frontend `npm.cmd run typecheck`: **passed**.
- Frontend `npm.cmd run build`: **passed**; existing Next.js middleware-convention deprecation warning only.
- Related backend Runtime/Workspace tests: **86/86 passed** across `workspace-runtime`, `workspace-runtime-evidence`, `trusted-runtime-client`, `trusted-runtime-transport`, and `trusted-runtime-operations` test files.
- Related backend persistence/Agent loop tests: **57/57 passed** across `workspace-runtime-persistence`, `agent-workspace-loop`, `agent-workspace-loop.security`, and `agent-workspace-loop.gaps` test files.
- Backend test invocation used `node --import tsx --test` with those files. No destructive database integration tests or live-provider tests ran.

Regression coverage includes multiple identities, absent/missing bindings, revoked/disabled/offline identities, expired/revoked/missing grants, stale binding and fingerprint mismatch, failed status lookup, explicit selection and project switching, historical observations without authority, unavailable content/action hiding, refreshed selector status, and existing no-fallback/approval/receipt/evidence security tests.

## Real Windows acceptance

Project: `project-community-sonic-sovereign`.
Fixture: `D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\.phase63-acceptance-20260923`.

The user approved a separate disposable identity for revocation because revoked fingerprints are permanently reserved. B was tested for offline/reconnect; C was temporarily bound and revoked; a new binding was then explicitly verified back to the same B. Revocation semantics were preserved.

| Identity | Fingerprint prefix | Final state |
| --- | --- | --- |
| A (existing old identity) | `3140de5b77631df2df28` | REVOKED, unchanged |
| B (original Workspace runtime) | `c0142d23ace3d5d0c26b` | ACTIVE, CONNECTED, bound to v20 |
| C (disposable revocation test) | `3687fe1a9c51a6bc52b0` | REVOKED; worker stopped |

B runtime ID: `rt1_RUNTIME_DEVICE_509037ca5279b7f6cdb3af46c25e182b0915831ad84baa6938f0e0db94547b77`.

C runtime ID: `rt1_RUNTIME_DEVICE_16f45070b2a301f7a0bc009b1f025752d053c1030fd860a6c47ca6eae83f4fd4`.

| Binding | Runtime | Outcome |
| --- | --- | --- |
| `workspace_8b4e8f3ae28fa5a5cd949eee98fe83edf456d2718faa5c7dd49abccec087936c`, v18 | B | Correct primary identity with A revoked; expired grant, grant renewal, read, offline rejection, same-identity reconnect verified |
| `workspace_4bace0ba9db1d3ae4bd2010be69bffbc4e34870a2732c314dfd66bdbfb3cd67f`, v19 | C | Explicitly approved temporary switch; list/read verified; revocation made binding unavailable without switching to connected B |
| `workspace_ce46371d2812a104a301a5f6066a04d42c6f4809d57ec12d2e25a6ceff3986b4`, v20 | B | Explicit restoration; fresh approved list/read verified; final READY |

One-hour grants contained only `filesystem.list` and `filesystem.read`. B grant v3 expires at 03:37:09 local; C grant v1 expires at 03:39:34 local. Revoked C cannot use its grant.

Verified execution/receipt IDs:

| Runtime / operation | Target | Receipt |
| --- | --- | --- |
| B / read, v18 | `README.md` | `rt1_RUNTIME_EXECUTION_1a170d62b2a6239fd967d08dbcb919a1b702737403305447079c5e4b58dedb83` |
| C / list, v19 | root | `rt1_RUNTIME_EXECUTION_af954c5cc4d9041d3c2c40eaeea9f9d18a9851eaa7cb390f37775bb5cabc47d4` |
| C / read, v19 | `README.md` | `rt1_RUNTIME_EXECUTION_a56628b46bf15824f8fd2dddba81ad626703578372212a022b58914bfe6edf90` |
| B / list, v20 | root | `rt1_RUNTIME_EXECUTION_119201398b289e744018f1fc4275b2042b792a4edc8705eeaec16beea8ebd565` |
| B / read, v20 | `README.md` | `rt1_RUNTIME_EXECUTION_1754d8e251d1ffa2de929188bb722278ee0bd4bf4b8a66977df19a87d784802e` |

The final read was observed at `2026-09-23T23:56:12.769Z` and displayed as a saved, previously verified observation with B, binding v20, and the exact receipt.

When B stopped, availability converged to OFFLINE, source/tree content was hidden, the exact-action control was disabled, and an actual UI evidence request returned “Evidence unavailable / Workspace offline.” No receipt or fallback content was fabricated. Restarting the same B identity restored its original binding availability without replay; the two subsequent execution log entries were the newly approved v20 list/read.

After revoking C through the UI, the worker exited with `RUNTIME_HTTP_401:request rejected`. C stayed the bound runtime while B remained connected. The UI showed Identity REVOKED, Connection UNAVAILABLE, Binding REVOKED, and Read access Unavailable. A new exact read could not be submitted. Saved receipt metadata remained historical; cached source and Ask Agent were hidden. The final build also showed C and A as disabled REVOKED options in the folder selector.

After explicit restoration, navbar, sidebar, Explorer summary, and composer all reported B's exact runtime ID. The composer selected B, displayed ACTIVE/CONNECTED, active grant, READY v20, and separate per-action approval/revalidation. A and C remained revoked.

## Not implemented / remaining limitations

- No Workspace Read Grant (Phase 6.3B): every operation still requires approval.
- No installer/download or installation detection.
- No Phase 6.4.
- No provider/GLM workaround; known planning output truncation remains.
- Status converges on existing polling intervals; UI status is not an authorization guarantee. Backend revalidation remains authoritative.
- Live post-revocation operation denial was observed as disabled UI submission and worker HTTP 401 termination; backend rejection paths were additionally exercised by regression tests, not bypassed with internal calls.
