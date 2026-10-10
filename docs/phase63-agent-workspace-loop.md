PHASE 6.3 STATUS:
PARTIAL — real Windows approvals, runtime operations, receipt verification, evidence admission and model reevaluation succeeded. GLM output truncation prevented a grounded final report. Runtime stop/restart checks passed; one exposed UI state-carryover defect was repaired and verified. PASS is not claimed.

IMPLEMENTED:
- One durable AgentRun supports model-selected filesystem.list/read/search, exact approvals, runtime execution, receipt verification, evidence admission, additional inspections and a grounded final report in its originating conversation.
- No active Runtime workspace means WORKSPACE_BINDING_REQUIRED; an empty evidence set never falls back to the backend filesystem.
- Existing Chat clientMessageId now reserves one Agent request through a deterministic message primary key, a Conversation row lock and a server-owned run association. Identical retransmissions return the saved run without rescheduling; changed input under the same key rejects.
- Chat cards, the existing Agent workspace, approvals, activity, operation receipts and evidence viewing reflect persisted state.

REUSED:
- RuntimeLedgerService private persistence, immutable revisions, compare-and-swap and transactional locking.
- RuntimeIdentityService, ResourceAuthorizationService, ToolAuthorizationService, ToolApprovalService, exact ActionProposal, execution intent/permit, signed worker transport and runtime verification.
- Workspace bindings/store, Runtime Evidence admission, EvidenceCollector, existing context ranking/budgets/serializer and strict planning/provenance validation.
- Existing Conversation, Chat, Workspace panels and SSE.

NEW FILES:
- [backend/src/agent-runtime/inspection/agent-inspection.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/inspection/agent-inspection.service.ts)
- [backend/src/agent-runtime/inspection/inspection.contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/inspection/inspection.contract.ts)
- [backend/src/agent-runtime/inspection/inspection.types.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/inspection/inspection.types.ts)
- [backend/test/agent-workspace-loop.gaps.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-workspace-loop.gaps.test.ts)
- [backend/test/agent-workspace-loop.security.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-workspace-loop.security.test.ts)
- [backend/test/agent-workspace-loop.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-workspace-loop.test.ts)
- [backend/test/agent-workspace-search.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-workspace-search.test.ts)
- [backend/test/helpers/inspection-loop-harness.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/helpers/inspection-loop-harness.ts)
- [components/workspace/agent-inspection-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-inspection-card.tsx)
- [test/agent-inspection-presentation.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/agent-inspection-presentation.test.ts)
- [Phase 6.3 report](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/docs/phase63-agent-workspace-loop.md)
- Disposable acceptance fixture only: [.phase63-acceptance-20260923/README.md](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/.phase63-acceptance-20260923/README.md), [package.json](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/.phase63-acceptance-20260923/package.json), [src/auth/session.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/.phase63-acceptance-20260923/src/auth/session.ts).

MODIFIED FILES:
- [backend/src/agent-runtime/agent-result.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-result.ts)
- [backend/src/agent-runtime/agent-run.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-run.dto.ts)
- [backend/src/agent-runtime/agent-runtime.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.controller.ts)
- [backend/src/agent-runtime/agent-runtime.module.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.module.ts)
- [backend/src/agent-runtime/agent-runtime.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.service.ts)
- [backend/src/agent-runtime/tools/tool-contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/tools/tool-contract.ts)
- [backend/src/agent-runtime/understanding/agent-context-builder.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-context-builder.service.ts)
- [backend/src/agent-runtime/understanding/agent-presentation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-presentation.ts)
- [backend/src/agent-runtime/understanding/evidence-collector.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/evidence-collector.service.ts)
- [backend/src/conversation/conversation.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.dto.ts)
- [backend/src/conversation/conversation.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.service.ts)
- [backend/src/trusted-runtime/runtime-control.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/trusted-runtime/runtime-control.service.ts)
- [backend/src/trusted-runtime/runtime-execution.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/trusted-runtime/runtime-execution.service.ts)
- [backend/src/trusted-runtime/runtime-operations.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/trusted-runtime/runtime-operations.ts)
- [backend/src/trusted-runtime/runtime-tools.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/trusted-runtime/runtime-tools.ts)
- [backend/src/trusted-runtime/runtime.contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/trusted-runtime/runtime.contract.ts)
- [backend/src/workspace-intelligence/workspace-runtime-evidence.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-runtime-evidence.service.ts)
- [backend/src/workspace-intelligence/workspace-runtime.contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-runtime.contract.ts)
- [backend/src/workspace-intelligence/workspace-runtime.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-runtime.service.ts)
- [backend/src/workspace-intelligence/workspace-store.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-store.service.ts)
- [components/chat/agent-run-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/chat/agent-run-card.tsx)
- [components/workspace/agent-control-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-control-card.tsx)
- [components/workspace/agent-workspace.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-workspace.tsx)
- [hooks/useAgentRunEvents.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useAgentRunEvents.ts)
- [lib/sekhem-agent.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-agent.ts)
- [lib/workspace-presentation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/workspace-presentation.ts)
- Generated output: backend/dist, .next, TypeScript build metadata. Local service/test logs are under backend/.runtime-state.
- There is no Git metadata in this workspace. Source/configuration changes were checked against the captured 626-file SHA-256 baseline rather than reported as a clean Git working tree.

STATE MACHINE:
- REQUESTED → UNDERSTANDING → INSPECTION_PLANNED → ACTION_PROPOSED → AUTHORIZATION_PENDING → AWAITING_APPROVAL → APPROVED → REVALIDATING → EXECUTING → OBSERVING → VERIFYING → NEEDS_MORE_EVIDENCE → UNDERSTANDING.
- REPORTING → COMPLETED only after the existing strict grounding/planning validator accepts the model report and verified runtime evidence exists.
- FAILED and CANCELLED stop advancement. Revalidation/dispatch are also durably represented by the existing runtime execution/permit records and events. No intermediate state implies execution succeeded.

AGENT LOOP:
- GLM decides each next inspection, whether evidence is sufficient, and the report. The application validates and enforces the decision; no fabricated model plan or deterministic project-analysis substitute was added.
- Conservative default: 4 inspection operations. Optional SEKHEM_AGENT_INSPECTION_MAX_ITERATIONS accepts integers 1–5, bounded by the existing five-item evidence limit. No environment file was changed.
- Strict task output permits INSPECT, REPORT or STOP. REPORT embeds the unchanged planning schema; arbitrary additional fields, self-authorization, foreign scope and mutation/terminal tools reject.
- Model truncation stays OUTPUT_TRUNCATED / PLAN_NOT_READY; malformed output and insufficient evidence never dispatch.
- The original message ID is retained in every generated plan for same-message Chat presentation.

RUNTIME INTEGRATION:
- Existing Runtime v2 list/read/search operations only. Each iteration has a deterministic run+plan-version proposal, approval, intent and permit.
- Authorization binds user, organization, project, conversation, current plan/step, tool/version, exact target/input, purpose, grant, binding/version, runtime fingerprint and digests.
- Fresh checks occur before dispatch and at the worker start acknowledgement. Revocation, session/grant expiry, changed binding/plan/input and rejected approval fail closed.
- A completed read leaves the overall AgentRun active for evidence admission and model reevaluation.

EVIDENCE:
- Only verified receipts admitted through WorkspaceRuntimeEvidenceService and EvidenceCollector enter context.
- Existing RuntimeEvidenceReference provenance is unchanged. Listings/search matches are SCANNED observations; they do not claim that listed files were read.
- Content restrictions, discovery exclusions, bounded search traversal/read, truncation and existing context limits remain enforced.
- Selection metadata uses evidence identity after normalization; it no longer incorrectly marks cloned selected evidence as dropped.
- Stored observations can be inspected through existing authorized Workspace GET APIs without dispatching new operations.

VERIFICATION:
- Real services in an in-memory database test identity signatures, approval, permit creation, result attribution and receipt admission.
- Tests reject wrong execution digests/paths, unverified receipts, stale bindings and tampered targets/plans.
- Execution verification proves the recorded observation. Engineering completion requires a separately grounded model report; successful file I/O alone does not complete the objective.
- No automated fixture result is claimed as a live Windows acceptance result.

PERSISTENCE:
- AGENT_INSPECTION records use the existing private Runtime ledger, plus existing AgentRun/AgentPlan/Approval/Workspace operation/evidence and Runtime execution records.
- Persisted model leases prevent simultaneous model decisions. Interrupted expired leases fail explicitly; they do not replay uncertain work.
- Restart tests recover pending approval and completed receipts. Reconnect preserves OUTCOME_UNKNOWN; duplicate polls cannot issue a second executable payload.
- Cancellation survives late model output and late signed runtime success.

SECURITY:
- All 15 requested model/scope/approval/staleness/receipt/iteration invariants have focused regression coverage.
- No changes to authentication architecture, ordinary AuditService, Prisma schema/migrations, provider/model/endpoint/thinking controls/output budgets, runtime identity/cryptography, context serializer or existing evidence provenance contracts.
- No write/terminal capability added to the loop; existing explicit runtime capabilities elsewhere were not redesigned.
- Test-only filesystem fixtures and local application restart/build actions were performed. No migration, DB push/reset, destructive DB integration test or deployment was performed. Live provider calls occurred only through the explicitly approved acceptance UI flow described below.
- The runtime retains its accepted TRUSTED_MACHINE boundary. Workspace authorization is not a claim of OS-level race-resistant sandboxing or hard-link isolation.

TESTS:
- focused: 52/52 backend Phase 6.3 tests passed in the final combined run.
- related: 666 tests total; 665 passed, 0 failed, 1 skipped. The skipped test is the existing opt-in database integration test; it was not enabled.
- frontend: 175/175 passed, including 8 Phase 6.3 presentation/event/Chat-card tests.
- typecheck: backend and frontend passed with their existing commands.
- build: backend and frontend production builds passed; generated artifacts were regenerated from final source. Existing Next middleware-convention warning remains.
- Before repair, the new search test demonstrated sensitive/dependency files being searched; the new Chat retry test demonstrated duplicate AgentRuns. Both pass after repair. No existing tests were deleted or weakened.
- Final backend command (backend directory):
  $env:TSX_DISABLE_CACHE='1'
  $phaseTests = @(rg --files test | Where-Object { $_ -match '(agent-|trusted-runtime|workspace|conversation|tool-authorization|durable-session-enforcement)' -and $_ -match '\.test\.ts$' })
  node --import tsx --test --test-reporter=spec --test-concurrency=1 @phaseTests
- Frontend: node --import tsx --test test/*.test.ts
- Both applications: npm.cmd run typecheck; npm.cmd run build.
- [Final related test log](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/.runtime-state/phase63-final-related-tests.log).

LIVE WINDOWS ACCEPTANCE — 2026-09-24:
- Decision: PHASE 6.3 STATUS: PARTIAL. The real approved runtime loop reached evidence admission and model reevaluation, but GLM output truncation prevented a grounded final report. No provider workaround was applied.
- Authenticated localhost:3000 session confirmed in the real Codex browser. All binding, grant and operation approvals used the actual SEKHEM UI; no direct DB mutations or internal approval calls were used.
- Conversation: conv-1790202822665-kwm3pp.
- Exact request: "Understand this project and identify where authentication is implemented."
- Acceptance AgentRun: run_1790203070546_f8p4y. Both inspection operations and model reevaluations remained in this one run.
- Runtime: rt1_RUNTIME_DEVICE_509037ca5279b7f6cdb3af46c25e182b0915831ad84baa6938f0e0db94547b77.
- Public fingerprint: c0142d23ace3d5d0c26b35f4d77b556c947fc88abf5dcb71c3c046378c3750d5. Same enrolled identity before/after restart; connection epoch 3 → 4.
- Workspace: workspace_8b4e8f3ae28fa5a5cd949eee98fe83edf456d2718faa5c7dd49abccec087936c; version 18; .phase63-acceptance-20260923.
- Root: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\.phase63-acceptance-20260923.
- Binding was verified with a separately approved runtime-backed filesystem.list and returned READY. Binding version 18 remained READY after restarting the same identity.
- Grant v2: ONLY filesystem.list, filesystem.read, filesystem.search; expires 2026-09-23T23:33:00.867Z (02:33 on September 24, Cairo). No write/create/delete/move/copy/terminal capability was granted.
- One interrupted initial attempt (run_1790202929752_17o7n) was cancelled before approval/execution because a separate UI binding action selected yscan-presentation v17 after fixture v16 verification. The user agreed to leave the binding unchanged; fixture v18 was verified and the exact request resubmitted. That cancelled attempt had zero observations and is not counted as acceptance of the fixture.

ACTUAL AGENT OPERATIONS:
- Operation 1: filesystem.list; relative target (workspace root); plan v2; SUCCEEDED / VERIFIED.
  - Proposal: rtproposal_a14cb0350fced4ab188aba43edbc328d3a9650618b548d274a2ec87ac796c2e0
  - UI approval: toolapproval_af5ab7a5129656facfa9871f16f4a1c501f97f901c6bedbfa03ee2a39651fe5d
  - Execution intent: rtintent_cfa3f38de2970f1ba55d0ea9749331bccc2e85ad46e1ccb3c628a041c7700720
  - Operation: wsop_4ae1c98cd26348a3f5796fcc81a743e3071a3c5ea611580412a33c934ea04e4e
  - Receipt/execution: rt1_RUNTIME_EXECUTION_22a72b641ce3d9c0b7ec1ed7ece148e8f20f7399850e265f011b08f66436a0b2
  - Observation time: 2026-09-23T22:38:17.552Z
  - Operation digest: 30963faa6fc18de631d8066762fc7289a754c03647f9b20d43ecae4f03b1d4ae
- Operation 2: filesystem.search; relative target (workspace root); query auth; plan v3; SUCCEEDED / VERIFIED.
  - Proposal: rtproposal_b476cae6e0cd43b713e3995a8999b7e760ce76609ad63155184c264372c6e589
  - UI approval: toolapproval_60469a075da84821cf4f8b5c1ae1e4fee76f8f45f0d1950a9f812cff4f67c7c7
  - Execution intent: rtintent_3d63db01474c9a8ff6faf315ebb465224563e8fef263d4ba8a225eacdbdbbf26
  - Operation: wsop_7a1ee0c5a0f287cc874d58395f971d3f4fc961208aec6a5929439d639543df50
  - Receipt/execution: rt1_RUNTIME_EXECUTION_9bb3ba80aadee3fc2c40b8c4777294e9867e35474877fc1188f2ab8f246374c5
  - Observation time: 2026-09-23T22:38:50.335Z
  - Operation digest: 93d09fcc4239ecf0a3dc43c3bfca48c516dcf1cca2750c8f856ad98992b6e500
- For each operation, durable events prove REQUESTED → UNDERSTANDING → INSPECTION_PLANNED → ACTION_PROPOSED → AUTHORIZATION_PENDING → AWAITING_APPROVAL → UI APPROVAL_GRANTED → APPROVED → REVALIDATING → permit creation → execution dispatch/start → VERIFICATION_SUCCEEDED → OBSERVING → VERIFYING → NEEDS_MORE_EVIDENCE → UNDERSTANDING.
- Both receipts were admitted as runtime-workspace references with VERIFIED state. Read-only ledger checks confirmed execution/evidence payload digests, exact stored immutable reference equality, run/project/org/user/conversation/runtime attribution, binding version, and operation target agreement.
- Listing/search observations are SCANNED, not full file reads. The search returned README.md line 2 and src/auth/session.ts line 1. The original acceptance run never performed filesystem.read and never completed an authentication analysis.
- The UI displayed the exact tool, root target, search query, binding/version, proposal, approval buttons, runtime ID, receipt ID and verification. "Inspect evidence" displayed the saved real search matches.
- Main run stopped as FAILED / OUTPUT_TRUNCATED; Chat explicitly states PLAN_NOT_READY and two verified observations. No final engineering report, unperformed verification, or uninspected-file conclusion was fabricated.

MODEL RESULT:
- Main reevaluation diagnostic: ai-reasoning-06b0d5f2-1677-42b7-b700-f7a08b219e27.
- GLM-5.2-Abliterated; provider ai-provider-5cdea59b-c00b-48dc-8b1e-7825fbd155a9; LLAMACPP_JSON_SCHEMA.
- HTTP 200; finish_reason length; refusalFieldPresent false. Existing redacted logs do not expose completion-token usage or reasoning/final-content lengths, so those values were not independently measured in this acceptance.
- Instruction version sekhem-assistant-v1; fingerprint 4e12bcc20eaf48669f490c51175869fba31a9c70df1db156183672bd733a009c; message roles system 1/user 1.
- Thinking controls, model configuration and token budget were not changed. Earlier diagnosis remains context, not a substitute for these observed results.

RUNTIME STOP / RESTART:
- Stopped only the existing test worker PID 12324 at 01:39:37 Cairo. Submitted "Read src/auth/session.ts in this workspace." after the 45-second offline threshold.
- Offline run: run_1790203248880_cosw8; FAILED / RUNTIME_OFFLINE; zero proposals/operations/evidence; no model attempt. No backend filesystem fallback occurred.
- Restarted the same existing identity without pairing (worker PID 36064). Before a fresh UI request, the ledger recorded zero new executions since stop; the offline run remained FAILED with zero operations/evidence after restart.
- A separately requested post-restart Agent read used run run_1790203483639_sr38g. This is a recovery check, not continuation or completion of the failed main objective.
- Fresh UI-approved operation: filesystem.read; target src/auth/session.ts; plan v2; SUCCEEDED / VERIFIED.
  - Proposal: rtproposal_c1102d4fc574d63534848f07ee478afbf14a63eceeafd6c7355ac3e94bfffbee
  - UI approval: toolapproval_d49f4ed4879e7028857cc97da0d22ce6b7d24cd7b9e29a41d758c2cde8d14c21
  - Execution intent: rtintent_8ba1d2bb45087e273d7d903ee5379bab756c2c372e79a1abbc6863d80519e8fa
  - Operation: wsop_7f883a89cffbbb6320f020a788d054272817110ff06b8f869b3f12aca2bda064
  - Receipt/execution: rt1_RUNTIME_EXECUTION_16df0a34dc3ccd8669595eaa8fd8738fdc636129c37970580c4d33cc6ed4a7c0
  - Observation time: 2026-09-23T22:45:27.416Z
- The UI displayed the actual source, including isSessionActive and its revoked/expiry check. It was admitted as verified evidence, and model reevaluation ran.
- Recovery reevaluation also stopped OUTPUT_TRUNCATED: ai-reasoning-43eb66a5-92a4-4544-aadf-935962fa534e; HTTP 200; finish_reason length; no refusal field.
- No uncertain in-flight operation was created by this stop-idle test. No automatic replay of stopped or completed operations was observed; this does not claim an additional live mid-execution crash test.

CONCRETE UI DEFECT / MINIMAL REPAIR:
- Opening a saved observation and switching AgentRuns retained the old observation panel under the new run, despite zero evidence on the new run.
- Fixed only components/workspace/agent-control-card.tsx: key AgentInspectionCard by run.id, so run-scoped local observation/error/busy state cannot carry into another run.
- Rebuilt live UI regression: opened the main run's saved search observation, switched to the offline run, and confirmed no Saved runtime observation region remained.
- Frontend regression suite: 175/175 passed; frontend typecheck and production build passed. An initial restricted-process attempt failed before tests loaded (tsx Windows userInfo/ENOMEM); rerun outside that restriction passed. Existing Next middleware warning remains.
- Backend source was unchanged in this acceptance continuation; its prior 665 passed / 1 skipped, focused 52/52, typecheck and build results remain the preceding implementation validation, not newly rerun tests.
- SHA-256 comparison over 635 pre-acceptance source/config/test/document paths showed only agent-control-card.tsx changed before updating this report. The report and generated .next/typecheck metadata/logs are the other acceptance artifacts.
- No changes to provider/Teletech/model/thinking/output limits, authentication architecture, Prisma/migrations, runtime security/cryptography, Gateway contracts or evidence provenance contracts. Database state changed only through authorized normal application actions; diagnostic SQL/Prisma inspection was read-only.
- Phase 6.4 was not started.

KNOWN LIMITATIONS:
- Full acceptance remains incomplete because no grounded final model report was produced. A provider-serving/output investigation remains a separate task; no speculative SEKHEM fix or budget change is justified by this acceptance.
- Read/observation and iteration limits remain conservative; observations are historical, not continuous attestations of current file contents.
- Existing runtime trusted-machine limitations, private-ledger retention/scaling concerns and intentionally deferred P0-B migration reconciliation remain.
- Installed Node is v24.21.0 while manifests declare Node 22; validation on the declared Node version remains outstanding.

NOT IMPLEMENTED:
- Mutation/terminal Agent actions, a new execution framework/protocol, permission bypass, speculative provider workaround, output-budget change, automatic filesystem retries, schema migration, deployment or a replacement Chat.
