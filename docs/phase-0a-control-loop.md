# SEKHEM Phase 0A — Agent control loop

Implemented on 2026-09-22. Runtime dispatch remains disabled. This is a control-plane implementation, not Local Runtime acceptance.

## Pre-edit audit and design decision

Actual production flow was ConversationService.postMessage → scheduled AgentRuntimeService.executeRun → AgentUnderstandingService.createPlan → validated AgentPlan.steps JSON → planning completion. AgentRuntimeService.applyDecision delegated to AgentToolControlService but had no planning caller. ToolAuthorizationService already performed registry, input, permission, scope, risk, plan/dependency and approval checks. ToolApprovalService persisted exact Phase 5B fingerprints, but the approval controller recorded a decision without reconnecting to orchestration. Cancellation called cancelPending; pause/resume used conditional run writes. Recovery synthesized claims for the old planning/read pipeline; SSE notified consumers of saved events and conversation restoration supplied authoritative presentation. The frontend approval surface was a receipt list.

The older ExecutionPlaneService/ExecutionRequest scaffold remains unused by the new path. Its policy and PowerShell placeholder were not changed.

Existing AgentArtifact can safely hold one internal control snapshot: it has a unique primary key, run/project relations and JSON metadata. Existing AgentRun row updates serialize control transactions. Existing AgentRunEvent primary keys provide a second uniqueness barrier for intent creation. No Prisma model, index, migration or database operation was needed.

## 1. Files changed

- [app/page.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/page.tsx)
- [backend/src/agent-runtime/agent-run.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-run.dto.ts)
- [backend/src/agent-runtime/agent-runtime.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.controller.ts)
- [backend/src/agent-runtime/agent-runtime.module.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.module.ts)
- [backend/src/agent-runtime/agent-runtime.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.service.ts)
- [backend/src/agent-runtime/tools/agent-tool-control.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/agent-tool-control.service.ts)
- [backend/src/agent-runtime/tools/tool-authorization.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/tool-authorization.service.ts)
- [backend/src/agent-runtime/tools/tool-contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/tool-contract.ts)
- [backend/src/agent-runtime/tools/tool-scope.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/tool-scope.service.ts)
- [backend/src/conversation/conversation.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.dto.ts)
- [backend/src/conversation/conversation.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.service.ts)
- [backend/test/agent-planning.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-planning.test.ts)
- [backend/test/tool-authorization.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/tool-authorization.test.ts)
- [components/workspace/agent-workspace.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-workspace.tsx)
- [hooks/useAgentRunEvents.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useAgentRunEvents.ts)
- [lib/conversation-restoration.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/conversation-restoration.ts)
- [lib/sekhem-agent.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-agent.ts)

## 2. Files added

- [backend/src/agent-runtime/tools/agent-control-store.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/agent-control-store.service.ts)
- [backend/src/agent-runtime/tools/agent-control.contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/agent-control.contract.ts)
- [backend/src/agent-runtime/tools/agent-decision.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/agent-decision.service.ts)
- [backend/test/agent-decision.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-decision.test.ts)
- [components/workspace/agent-control-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-control-card.tsx)
- [test/agent-control-presentation.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/agent-control-presentation.test.ts)
- [docs/phase-0a-control-loop.md](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/docs/phase-0a-control-loop.md)

Builds also regenerate backend/dist JavaScript/source maps, .next output and tsconfig.tsbuildinfo. These are expected generated artifacts, not provider or source-policy changes.

## 3. Existing services reused

AuthService.validateDurableSession; ProjectAccessService.assert; ResourceAuthorizationService; WorkspaceBindingService; ToolRegistryService; ToolPermissionService; ToolScopeService; ToolRiskService; ToolAuthorizationService; ToolApprovalService; AgentToolControlService; AuditService; AgentRun/AgentArtifact/AgentRunEvent persistence; existing SSE, conversation snapshot and frontend API client.

ToolScopeService now forwards the deployment-owned authorizedRoots already supplied by WorkspaceBindingService to the existing WorkspaceSourceResolver. This does not accept an allowlist or root from a client/model and does not change filesystem security primitives.

## 4. New control-loop states

PLAN_READY → DECIDING → ACTION_PROPOSED → REVALIDATING → AUTHORIZATION_PENDING. A required review produces AWAITING_APPROVAL; an exact human decision records APPROVED and revalidation follows. Successful authorization produces EXECUTION_INTENT_CREATED, immediately followed by EXECUTION_BLOCKED / EXECUTION_BOUNDARY_NOT_IMPLEMENTED.

NEEDS_USER_INPUT represents a plan that cannot safely produce the supported exact action. FAILED is reserved in the typed state contract. Known invalid/stale control data blocks; unknown durable state fails closed.

Control state is distinct from AgentRun lifecycle. COMPLETED continues to mean the planning work finished. Proposals are staged before terminal planning status becomes visible, but authorization cannot interrupt the final planning-message commit. A fresh authenticated POST is required to continue. No model inference or execution is added to the decision stage.

## 5. Action Proposal contract

The strict proposal binds proposalId, runId, planId/version/stepId, user/project/organization/conversation, tool ID/version, validatedInput, purpose, effect, scope, registry risk/permissions/approval requirement, workspace binding ID/version, plan/input/scope/verification digests, policy version, creation time, deterministic proposalDigest and a bounded exact preview.

The initial supported projection is a READ_ONLY INSPECT step with one selected, read workspace evidence target explicitly covered by that step's evidence scope, valid verification criteria and no unresolved prerequisites. It produces canonical filesystem.read 1.0.0. The control plane does not choose an arbitrary target from multiple sources, synthesize commands, reinterpret file contents as permission, or lower a plan's risk to fit a tool.

Write/terminal, multi-target, ungrounded, dependency-blocked and unsupported analytical proposals remain blocked or need action details. Where a safe exact diff/executable preview is absent, the UI displays “Detailed execution preview unavailable.” The read-only workspace grant remains filesystem.read only. Request human review can strengthen the existing low-risk read policy; it cannot relax policy.

## 6. Execution Intent contract

The intent binds intentId, canonical requestId/toolRequestId, run/plan/version/step, actionProposalId, user/project/organization/conversation, authorizing durable session ID, workspace binding ID/version, runtimeId:null, authorizationReference, optional approvalReference, proposal/input/scope digests, policy version, issuedAt/expiresAt and deterministic idempotencyKey.

Lifecycle: BOUNDARY_BLOCKED, CANCELLED, EXPIRED or INVALIDATED. executionAllowed:false and dispatchable:false are literal contract requirements. Expiry is at most five minutes and never exceeds the authorizing token or approval expiry. No cookie, token, credential or file body is retained in the intent.

There is no consume/dispatch method: these receipts have zero permitted uses today. A future Runtime must not turn an existing Phase 0A receipt into a permit by changing a flag.

## 7. Exact approval binding

The canonical Phase 5B fingerprint now optionally incorporates a server-created actionBinding: user, project, organization, conversation, workspace binding ID/version, proposal digest, plan digest, input digest, scope digest, verification digest and control policy version. Existing request/run/plan/step/tool/version/risk/scope and physical path binding remain included.

The existing ToolApprovalService, required reviewer role and approval TTL are reused. No second approval object or authorization framework was created. A reviewer may record approval; only the run owner can request that run's intent. Non-owner approval therefore waits for an authenticated owner continuation.

## 8. Revalidation rules

Fresh durable session validation occurs at the HTTP boundary and again during orchestration after waits/approval. Current project/org membership and execution authority are checked. The persisted proposal must exactly equal a newly derived operation from the current plan; canonical request input must match it. Workspace binding version, tool definition/version, risk, permissions, scope, verification expectations, current reviewer authority, approval fingerprint/expiry and run lifecycle are checked. The canonical gate also compares actionBinding to its freshly loaded plan and normalized input/scope. A final persisted-plan comparison precedes intent creation.

A changed proposal/input/scope/workspace/plan/verification expectation blocks. Auth and infrastructure failures remain denials/errors and roll back the transaction. There is no signature-only fallback, automatic approval replacement, or side-effect retry. Optimistic lock conflicts return an error; a later identical request reconciles the saved non-dispatchable receipt.

## 9. Idempotency design

One internal AgentArtifact has id control_SHA256(runId), artifactType AGENT_CONTROL_STATE, isCustomerSafe:false, empty content and a typed JSON snapshot. All writes use the AgentRun transaction lock. The intent/idempotency key is deterministic over run, exact proposal, canonical request and policy. Its creation event has the deterministic intent primary key, with an explicit existing-event check and the database primary-key constraint as a final barrier.

Repeated identical requests return the existing intent. An expired, cancelled or invalidated intent is not renewed. No exactly-once execution claim is made. Concurrency tests use serialized in-memory transactions; real PostgreSQL concurrency was not exercised because this task must not modify database data.

## 10. Recovery and control operations

Startup first invalidates existing control handoffs and suspends unfinished control runs without synthetic claims, inference or dispatch. The Phase 5B recovery guard also detects a staged control record before tool authorization has occurred. Planning/read recovery remains separate. Recovery preserves records for inspection; stale authority requires a new reviewed plan/control flow rather than automatic resumption.

Pause/cancellation serialize with control writes. Cancellation marks an existing intent CANCELLED and retains canonical approval cancellation. Paused and cancelled runs cannot create a new intent. Steering invalidates the prior bound control action. No late operation can make an invalidated intent dispatchable.

## 11. Events and presentation

Added PLAN_READY, DECISION_STARTED, ACTION_PROPOSED, AUTHORIZATION_PENDING, AUTHORIZATION_EVALUATED, APPROVED, REVALIDATION_STARTED, REVALIDATION_FAILED, EXECUTION_INTENT_CREATED and CONTROL_STATE_CHANGED, and reused APPROVAL_REQUESTED/GRANTED/DENIED/EXPIRED/CANCELLED and EXECUTION_BLOCKED.

No EXECUTION_STARTED, EXECUTION_COMPLETED or VERIFICATION_COMPLETED event is emitted by this flow. Event/audit payloads contain bounded state/identity/digest metadata, not prompts, source bodies, commands or credentials.

GET run and conversation restoration expose the internal control snapshot separately from evidence/output artifacts. isCustomerSafe:false excludes it from existing artifact evidence collection. Existing Agent Run/Approvals surfaces display the exact read action, approval controls and blocked intent. SSE only triggers snapshot refresh. The frontend accepts a newer, explicitly versioned control transition after planning completion while continuing to reject stale state.

## 12. Database changes

NONE. No Prisma edits, migrations, db push, resets, data queries or data mutations were performed against the real database. Persistence behavior was tested with in-memory substitutes. The intentionally deferred migration/legacy Workspace drift remains untouched.

## 13. Tests before and after

Before edits: 198/198 targeted backend tests and 121/121 frontend tests passed. Windows sandbox prevented tsx from starting (uv_os_get_passwd ENOMEM); tests were run outside that sandbox with approval.

After final changes: 582/582 tests passed across 32 active-path backend test files, including 52 focused Phase 0A cases. Frontend: 129/129 passed, including eight new approval/intent/SSE/restoration tests. Existing planning tests additionally assert that validated planning reaches staging while invalid planning does not. Existing controller authorization coverage now uses the new orchestration dependency and retains the canonical legacy-approval path.

An earlier broad backend run reported 582/585 passing. Three exceptions were investigated without changing unrelated code: the cookie Secure assertion required NODE_ENV=production and subsequently passed 1/1 unchanged; the old execution-plane symlink test needs Windows file-symlink privilege; the old PowerShell source-text test falsely matches its existing powershell.execute capability identifier. The last two remain failing legacy-test exceptions (6/8 passed in that suite), so this is not a claim that the entire repository test suite is green. Relevant legacy source/tests are hash-identical to the pre-edit baseline.

Commands used: node --import tsx --test --test-concurrency=1 with the backend file list below; node --import tsx --test test/*.test.ts from the repository root; the unchanged auth-service-contract test separately with NODE_ENV=production. TSX_DISABLE_CACHE=1 was set only in test processes.

Backend final file list:

- backend/test/conversation-restoration.test.ts
- backend/test/agent-result-semantics.test.ts
- backend/test/agent-planning.test.ts
- backend/test/agent-runtime.test.ts
- backend/test/agent-runtime.steering.test.ts
- backend/test/agent-runtime.events.controller.test.ts
- backend/test/agent-runtime.events.observable.test.ts
- backend/test/agent-runtime.events.security.test.ts
- backend/test/agent-ai-call-trace.test.ts
- backend/test/agent-understanding.test.ts
- backend/test/conversation.integration.test.ts
- backend/test/conversation.routing.test.ts
- backend/test/ai-gateway-output-contract.test.ts
- backend/test/provider-diagnostic.test.ts
- backend/test/assistant-context-budget.test.ts
- backend/test/tool-authorization.test.ts
- backend/test/attachment-file-reader.test.ts
- backend/test/agent-file-reader.test.ts
- backend/test/workspace-mvp.test.ts
- backend/test/workspace-discovery-relevance.test.ts
- backend/test/message-intent-regression.test.ts
- backend/test/content-reading-regression.test.ts
- backend/test/file-intelligence.test.ts
- backend/test/evidence-orchestration.test.ts
- backend/test/agent-context-builder.test.ts
- backend/test/agent-context-hardening.test.ts
- backend/test/workspace-intelligence.test.ts
- backend/test/provider-adapter.registry.test.ts
- backend/test/vllm-openai-compatible.adapter.test.ts
- backend/test/sekhem-assistant-identity.test.ts
- backend/test/agent-decision.test.ts
- backend/test/identity-auth-foundation.test.ts

## 14. Typecheck

Backend and frontend npm run typecheck passed. Authentication, planning and provider schemas were not altered to make tests pass.

## 15. Production build

Backend npm run build (tsc -p tsconfig.json) passed and regenerated dist. Frontend npm run build (next build) passed after allowing the existing Google Fonts build fetch; the sandboxed attempt failed fetching Inter/Source Code Pro. The existing Next middleware deprecation warning remains. No application process was restarted or deployed.

## 16. Security invariants

Planning, authorization, approval and intent remain distinct from execution. Model output cannot grant permissions, choose a Runtime, expand scope, downgrade risk or claim verification. Session revocation/expiry/suspension/missing record/lookup failure deny. Project/org/owner checks and reviewer authority remain server controlled. Changed operation or authority invalidates the handoff. Cancellation/expiry and unknown states fail closed. Runtime identity remains null.

Provider configuration, AI Gateway, Teletech/GLM endpoint, credentials, dialect, 512-token budget, assistant identity/runtime instructions, preview policy, auth/login/session implementation, Prisma/migrations, workspace security primitives, evidence semantics and the old execution scaffold were not modified. Package manifests/lockfiles and env/config files remain unchanged. No live provider call or real database access was made.

Final content-hash verification: 165 protected source/config/generated files matched their pre-edit hashes. No unexpected modified/added files and no removed files were found. Generated dist was inspected for the actual planning-to-decision call, the planning-completion guard, session-bound intent metadata, runtimeId:null and the disabled execution boundary.

## 17. Intentionally disabled and limitations

No Local Runtime, pairing, socket/transport, process, terminal, Git execution, browser filesystem access, user-workspace mutation, executable permit, tool-result ingestion, automatic dependent-step progression or verification execution exists in this change. No write/terminal diff is fabricated. The supported action projection is deliberately narrow and does not cover every PLAN_READY plan. Internal state remains subject to existing run/conversation cascade deletion, which must be reconsidered before real execution audit retention. Filesystem check-before-use protections are unchanged and are not claimed to be race-proof execution confinement. This implementation has not been deployed or accepted against a live database.

## 18. Exact next step for Local Runtime Phase 0B

Specify and validate the versioned Runtime identity/pairing and workspace-grant protocol, execution permit contract, Windows confinement feasibility and durable execution/consumption ledger requirements. Bind a real Runtime/workspace identity only after that protocol and persistence gate is approved. Preserve Phase 0A non-dispatchable receipts; fresh execution-time authorization, exact approval, expiry/cancellation checks, durable claim and independently verified results must precede any future tool dispatch. Do not enable the older ExecutionPlane scaffold or flip executionAllowed.
