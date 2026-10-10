# Phase 5B — Tool authorization control plane

Verified 2026-09-21. The backend control plane is implemented. **Final related regression: 365/365 passed; backend no-emit typecheck passed.** Tool definitions do not execute. Approval cannot grant a missing permission, expand workspace scope or enable an executor.

The full release/architecture gate is **not unconditionally signed off**: the referenced Phase 5A document was not available, and two unchanged legacy execution-plane tests have host/test-harness failures described below. Implementation follows the supplied Phase 5B contract and the conservative decisions documented in the [implementation plan](phase-5b-implementation-plan.md).

## 1. Files changed

Four existing files:

| File | Change |
| --- | --- |
| backend/src/agent-runtime/agent-runtime.service.ts | Explicit decision/approval entry points; safe recovery stop; cancellation of tool approvals; durable owner/project scope for lifecycle controls; compatible approval JSON mapping |
| backend/src/agent-runtime/agent-run.dto.ts | Tool/approval event names and versioned approval envelope union |
| backend/src/agent-runtime/agent-runtime.controller.ts | Authenticated tool-approval decision endpoint |
| backend/src/agent-runtime/agent-runtime.module.ts | Dependency injection and exports for the control plane |

Twelve new files:

- backend/src/agent-runtime/tools/tool-contract.ts
- backend/src/agent-runtime/tools/tool-registry.service.ts
- backend/src/agent-runtime/tools/tool-permission.service.ts
- backend/src/agent-runtime/tools/tool-scope.service.ts
- backend/src/agent-runtime/tools/tool-risk.service.ts
- backend/src/agent-runtime/tools/tool-approval.service.ts
- backend/src/agent-runtime/tools/tool-authorization.service.ts
- backend/src/agent-runtime/tools/agent-tool-control.service.ts
- backend/test/tool-authorization.test.ts
- docs/architecture/phase-5b-implementation-plan.md
- docs/architecture/phase-5b-tool-authorization.md
- docs/architecture/phase-5b-tool-authorization.diff

No existing test was modified. The [reviewed source/test diff](phase-5b-tool-authorization.diff) contains the actual changes against exact pre-edit source snapshots. The workspace has no Git history; SHA-256 comparison covered 1,834 pre-existing workspace files: **4 changed, 1,830 unchanged, none missing**. Temporary audit files were removed after the final comparison.

## 2. Existing abstractions reused

The read-only audit traced AgentRuntime, Phase 4 planning, read-only SkillRegistry, deny-by-default ExecutionPlane, workspace/repository capability code, module wiring, authorization and approval models.

- **ResourceAuthorizationService:** live project membership, organization boundaries, resource actions and reviewer roles. Its implementation was not changed.
- **WorkspaceSourceResolver:** validates server-provided roots using the existing configured allowed-root policy. A global root is never silently assigned to a project by the new control plane.
- **WorkspacePathService / WorkspaceSecurityService:** relative-path normalization, containment, forbidden directories, sensitive paths and symlink checks. Prospective targets check every ancestor using those containment primitives.
- **Phase 4 AgentPlan:** uses the latest durable plan/version and an existing PLANNED step; no second plan generator or model call.
- **AgentApproval:** existing run-bound persistence, distinct from the product dashboard's Approval model.
- **AgentRunEvent / AuditService:** transactional metadata events and authenticated audit actor.
- **AgentRuntime:** existing lifecycle/status vocabulary, recovery, query APIs and module. Legacy read-only skills retain their established path.

## 3. New abstractions and tool contracts

ToolRegistryService provides register/get/has/list/resolve. Definitions are cloned and recursively frozen. Listing is stable; duplicate IDs always fail, including a second version under the same ID. Resolution requires the registered version when supplied. Unknown tools fail closed.

The 16 version-1.0.0 definitions are:

| Family | Definitions |
| --- | --- |
| Filesystem | list, read, search, write, delete, move, copy |
| Terminal | execute |
| Git | status, diff, log, branch, checkout, add, commit, push |

Each has ID/version/category/description, bounded input/output schema, required permissions, server risk, execution mode, dry-run/reversibility flags and affected-path fields. **executionMode is DEFINITION_ONLY; there is no execute method.** The current output contract describes NOT_EXECUTED. Future implementations need an explicit execution/output-contract change.

git.branch means inspection/listing only. package.install and browser.open are permission capabilities; package.install/process.kill have reserved HIGH risk defaults but are not registered tools. Input path fields, including git.add paths, are workspace-relative. Arbitrary git/shell arguments are never dispatched.

The canonical request includes the requested identifiers, input, purpose, scope, AGENT origin, run and plan-step linkage, server risk and approval requirement. Model risk/approval hints cannot reduce server requirements. Privileged actor/root/grant fields and unknown input fields are rejected.

The bounded JSON validator limits depth to 8, nodes to 512, aggregate string content to 32,768 characters, object keys to 32 and arrays to 128 before cloning/hashing. Tool schemas tighten those bounds: scope paths 32, path length 1,024, purpose 512, terminal command 4,096 and proposed write content 16,384 characters. Cycles, accessors, prototype keys, non-JSON objects and malformed input are rejected.

## 4. State-machine and runtime integration

There is no autonomous decision producer or decision loop. Trusted backend callers explicitly invoke:

`AgentRuntimeService.applyDecision(runId, authenticatedClaims, untrustedDecision, trustedWorkspaceBinding)`

The workspace binding is a separate server-owned argument. There is no public request endpoint that accepts roots or grants.

| Decision/outcome | Durable behavior |
| --- | --- |
| EXECUTE_TOOL → AUTHORIZED | PAUSED, EXECUTION_BOUNDARY_NOT_IMPLEMENTED; no executor or skill dispatch |
| EXECUTE_TOOL → APPROVAL_REQUIRED | Persist bound approval; AWAITING_APPROVAL |
| EXECUTE_TOOL → BLOCKED | PAUSED with bounded typed code; TOOL_BLOCKED event |
| REQUEST_APPROVAL | Same authorization pipeline; cannot bypass denied permissions; may additionally require review of a read |
| ASK_USER / REPLAN / VERIFY | PAUSED at the corresponding control-plane boundary; no clarification/replanning/verification loop |
| COMPLETE | Completes only the control-plane job; refuses outstanding pending tool approvals; no proposed step marked executed or verified |
| STOP | CANCELLED; invalidates pending/approved tool approvals |

A completed Phase 4 planning job can enter the explicit tool decision path. Tool authorization still requires its current PLAN_READY version, UNDERSTANDING_READY result, successful validation and the referenced PLANNED step. Typed plan constraints and effects are checked; plan readiness and its unchanged NOT_GRANTED field do not provide permission.

Conditional writes lock the run row within the transaction before state/approval changes. Failed persistence rolls back approval creation and state changes. A prior tool boundary is suspended on recovery/resume into CONTROL_PLANE_REAUTHORIZATION_REQUIRED; the background runner cannot turn it into skill execution or regenerate the plan.

Pause/resume/cancel originally authorized an unscoped UPDATE using the caller as owner. This prevented ordinary project users from controlling these new paused/approval states. The runtime now supplies the stored run owner, project and actual project organization to the unchanged authorization service; cancellation uses its existing CANCEL action. Cancellation also accepts AWAITING_APPROVAL. Cross-organization and owner checks are tested. Authentication and role-policy implementations were not changed.

## 5. Permission behavior

Every required permission needs **both** an explicit grant in the trusted workspace binding and existing application authorization:

| Capability | Existing resource action |
| --- | --- |
| filesystem.read, git.read | READ |
| filesystem.write, git.write | UPDATE |
| filesystem.delete | DELETE |
| terminal.execute, package.install, browser.open | EXECUTE |

Move requires read, write and delete; copy requires read and write. Results identify allowed/denied, capability, reason and normalized scope. Unknown/missing grants deny. A denied permission terminates authorization before approval evaluation. Approved requests are checked against current permissions again; revocation stays denied.

The new runtime decision entry also checks existing AgentRun EXECUTE authorization and the stored initiating user. Approval reviewers use the existing APPROVE action. No model field selects an authenticated actor or application role.

## 6. Scope behavior

An explicit TrustedToolWorkspace binds workspace ID, project ID, trusted root, allowed relative path prefixes and granted capabilities. Missing root/binding/prefixes yields INSUFFICIENT_SCOPE. Different projects/workspaces, traversal, absolute paths, undeclared affected paths, forbidden/sensitive paths, escaping symlinks and Windows alternate-stream/device-path forms are rejected.

Scope must cover exactly the normalized input paths. Both move/copy endpoints are validated. Prospective files are checked through every existing ancestor, including symlinks. Resolved target/prefix identities enter the approval fingerprint; retargeting a symlink inside the same root invalidates approval too.

Git and terminal definitions require an explicit whole-workspace path grant. A cwd inside a narrow subtree is not treated as process confinement. **No OS sandbox is implemented or claimed.** AUTHORIZED still has executionAllowed:false, is not a transferable execution credential and cannot be passed to an executor in this phase. Future execution must reauthorize and enforce confinement against filesystem races, shell behavior and repository-root semantics.

## 7. Approval behavior

Policy defaults:

- LOW read/list/search/git inspection: no approval.
- Every mutation: approval required.
- Terminal, delete and git push: HIGH risk and approval required.
- Explicit REQUEST_APPROVAL can require review of otherwise allowed read operations.
- Approval expiry: server-set 15 minutes; no model override.

Reused AgentApproval fields store PENDING, APPROVED, DENIED, EXPIRED and CANCELLED. A TOOL_AUTHORIZATION envelope in revisedPlan JSON includes version, run/plan/version/step, request/tool/version, risk, normalized scope and initiating user. Its SHA-256 fingerprint binds the complete proposed operation/input, current plan contents, actor, trusted root/grants and resolved path identities. Raw commands, proposed content and trusted roots are not persisted in the approval envelope.

Approval IDs deterministically bind run plus request ID. Changed input, request, plan or scope cannot replay an earlier approval. Legacy approval types/arrays cannot authorize these tools. Missing decisions, missing authenticated reviewer metadata, expired approvals and denied/cancelled states block.

The endpoint is:

`POST /api/agent-runs/:id/tool-approvals/:approvalId/decision`

It accepts only decision (APPROVED/DENIED/CANCELLED) and the displayed fingerprint. The session supplies reviewer identity; existing Technical Reviewer requirements apply through ResourceAuthorizationService. A successful grant records approval only. It neither resumes nor schedules execution. Reauthorization checks all earlier gates again. No new four-eyes/self-approval restriction was invented beyond the existing reviewer policy.

Events include TOOL_REQUESTED, TOOL_AUTHORIZATION_CHECKED, TOOL_BLOCKED, APPROVAL_REQUESTED/GRANTED/DENIED, with EXPIRED/CANCELLED lifecycle events where appropriate. Authorization failures also record typed expiry diagnostics. Events/audit contain bounded identifiers/status/risk metadata, not request bodies, command output, credentials, provider URLs or full evidence. Audit actor comes from authenticated claims.

## 8. Database changes

**Schema changes: none. Migrations: none. New persistence models: none. Production database operations: none.**

The implementation reuses AgentApproval JSON/status/timestamp fields and existing event/audit/run records. Application runtime bookkeeping is intentional; all verification used mocked persistence. The approval DTO/mapping supports both legacy revised-plan arrays and the new versioned envelope.

## 9. Local Runtime changes

**Local Runtime changes: none.** No OS executor, shell adapter, filesystem mutation implementation, process launch, WebSocket or runtime transport was added or invoked.

Backend AgentRuntime control-plane changes are listed above. Existing ExecutionPlane/PowerShell placeholder sources remain byte-identical and disabled. No user-workspace tool action occurred. Files created by tests were isolated temporary fixtures, not operations requested by the agent.

## 10. Tests and counts

| Verification | Actual result |
| --- | --- |
| Initial new focused suite | 47/47 passed |
| Final new Phase 5B suite | **51/51 passed**, also included in final related run |
| Previous related baseline | **302/302 passed unchanged**, including 24 Phase 4 tests and the original 278 |
| Existing identity/authorization suite | **12/12 passed** |
| Final combined related run: 27 files / 46 suites | **365/365 passed**, zero failures/skips/cancellations; exit 0 |
| Existing Secure-cookie contract under process-local NODE_ENV=production | **1/1 passed**, exit 0 |
| Additional unchanged execution-plane suite | **6/8 passed**; two host/test-harness failures remain |

The earlier expanded run, before four additional Phase 5B tests, was 367/370. Its cookie failure was explained by the existing production-only Secure flag and passed under production mode without code changes. The two remaining legacy failures are:

1. execution-plane.test.ts:115: Windows file symlink creation returns EPERM. That test's existing catch recognizes only messages containing privilege/access, so it fails before exercising containment. New Phase 5B junction escape/prospective-path/retargeting tests and existing workspace-security tests all pass.
2. execution-plane.test.ts:148: the existing regex `powershell\\.exe` also matches the prefix of the capability string `powershell.execute`. The unchanged placeholder does not spawn a process. SHA-256 confirms both the test and placeholder match the pre-edit baseline.

These failures were not hidden, skipped or fixed by weakening existing tests. No application source change was made for them. The final green 365-test selection excludes that separately reported legacy suite; it is not presented as an all-repository test pass.

New coverage includes registry/version/duplicates, immutable definitions, all permission gates, actual temporary-path validation, risk defaults, malformed and bounded proposals, plan linkage, constraints, approval replay/expiry/reviewer identity, revoked permission after approval, production Nest wiring, actual Phase 4 output, persisted runtime states, pause/resume/cancel/recovery, rollback on persistence failure, metadata redaction and zero tool/skill dispatch.

Commands ran from backend using installed dependencies:

```powershell
pnpm exec tsx --test --test-concurrency=1 test/tool-authorization.test.ts

$relatedTests = @(
  'test/tool-authorization.test.ts',
  'test/agent-planning.test.ts',
  'test/assistant-context-budget.test.ts',
  'test/agent-context-builder.test.ts',
  'test/agent-context-hardening.test.ts',
  'test/agent-understanding.test.ts',
  'test/evidence-orchestration.test.ts',
  'test/agent-runtime.test.ts',
  'test/agent-runtime.steering.test.ts',
  'test/agent-runtime.events.security.test.ts',
  'test/agent-runtime.events.observable.test.ts',
  'test/agent-runtime.events.controller.test.ts',
  'test/attachment-file-reader.test.ts',
  'test/file-intelligence.test.ts',
  'test/workspace-intelligence.test.ts',
  'test/attachment.controller.test.ts',
  'test/attachment.service.test.ts',
  'test/ai-gateway-policy.service.test.ts',
  'test/ai-gateway-preview.test.ts',
  'test/ai-gateway-provider-settings.test.ts',
  'test/provider-adapter.registry.test.ts',
  'test/vllm-openai-compatible.adapter.test.ts',
  'test/mock-ai-gateway-provider.adapter.test.ts',
  'test/runtime-config.test.ts',
  'test/conversation.routing.test.ts',
  'test/conversation.integration.test.ts',
  'test/identity-auth-foundation.test.ts'
)
pnpm exec tsx --test --test-concurrency=1 @relatedTests
# Initial expanded run additionally included:
# test/execution-plane.test.ts and test/auth-service-contract.test.ts

# Separate cookie verification:
$env:NODE_ENV='production'
pnpm exec tsx --test --test-concurrency=1 test/auth-service-contract.test.ts
```

Test processes used memory runtime/data source, disabled auth DB mode and, for the combined suites, an unreachable loopback DATABASE_URL. pnpm dependency refresh was disabled process-locally. Windows tsx required approved execution outside the sandbox after uv_os_get_passwd failed inside it. No dependencies, environment files, provider settings or database state changed.

## 11. Typecheck and protected-file audit

`pnpm exec tsc -p tsconfig.json --noEmit` passed with exit 0 after final source changes. The first check caught an Object.hasOwn target-library mismatch; the implementation now uses the existing-compatible hasOwnProperty call, without changing tsconfig/packages.

No production build was requested or run. Generated dist remains unchanged and must be rebuilt before deployment.

Hash comparison verified no changes to Gateway/provider sources/configuration/credentials, authentication/ResourceAuthorizationService, workspace-security/repository-root primitives, Prisma/schema/migrations, package/lock/env files, frontend, Phase 4 planning implementation or existing tests. No live AI provider request, production database operation, migration, local execution runtime or external transport was used.

## 12. Remaining limitations and decisions

- Phase 5A was named but not supplied/found. Its location was requested; no response was available at verification. Conservative assumptions are recorded in the implementation plan; full conformance to an unseen contract cannot be certified.
- Workspace bindings/grants must come from a trusted backend caller. No persistent workspace-grant editor, machine-wide fallback, model-controlled root or public provisioning endpoint was invented.
- No autonomous decision generation, tool execution, approval UI, execution transport or verification executor. The existing approval API returns metadata/fingerprint; a future review UI must present the exact proposed operation matched to that fingerprint.
- Input schemas and plan effect/constraint checks validate structure and explicit effects; they do not prove semantic equivalence between natural-language purpose and planned work.
- Shell commands and git definitions are proposals. Process confinement, repository-root resolution, race-free file handles and one-time execution consumption belong to execution implementation. The current decision cannot execute anything.
- Expiry is enforced on access/decision; no background expiry scheduler was introduced.
- Transactions and optimistic predicates were tested with mocked persistence. Live PostgreSQL concurrency/failure testing was intentionally not performed.
- The two unchanged execution-plane test issues remain; authentication's production-cookie check passed with the appropriate process setting.
- Source is not built/deployed. No later phase was started.

## 13. Definition of Done

- [x] Read-only architecture audit and source-based implementation plan.
- [x] Canonical bounded contracts and deterministic registry.
- [x] Central permission engine reusing application authorization.
- [x] Central workspace scope validation reusing existing security primitives.
- [x] Server-side risk classification; model cannot downgrade it.
- [x] Existing approval persistence reused with all five lifecycle states.
- [x] Approval bound to request/run/plan/input/risk/scope; replay rejected.
- [x] One tool-authorization pipeline; approval cannot elevate permission.
- [x] Explicit AgentRuntime decision integration and durable metadata/audit.
- [x] Authorized requests stop at the non-executing boundary.
- [x] Pause/resume/cancel/recovery and prior Phase 4 regressions verified.
- [x] Focused tests, related regressions, module wiring and typecheck pass.
- [x] No schema/migration/provider/authentication/package/env/frontend changes.
- [x] No Local Runtime, OS execution or user-workspace tool mutations.
- [ ] Authoritative Phase 5A contract reviewed and conformance signed off.
- [ ] All additionally inspected legacy execution-plane tests green on this host.

**Is the Definition of Done fully satisfied? Not unconditionally.** The requested Phase 5B control-plane implementation and its 51 focused tests are complete; final related tests/typecheck pass. Architecture sign-off awaits the Phase 5A reference, and the separately reported legacy test issues remain. Work stops at the Phase 5B execution boundary.

