# Workspace Runtime Phase 2 — implementation and acceptance report

Date: 2026-09-23. Implementation and automated checks PASS. Live acceptance is PARTIAL: verified runtime evidence reached the existing Agent pipeline, but the live model returned truncated structured output twice. A grounded summary was NOT produced. Phase 2 must not be described as fully accepted.

## 1. Exact files changed

19 existing source files modified; 4 implementation/test files added; this report added. SHA-256 comparison against the pre-edit 462-file baseline identified no other tracked-by-baseline source/config changes. This directory has no usable Git repository, so this is a filesystem baseline comparison, not a Git diff.

- Modified: [app/page.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/page.tsx)
- Modified: [backend/src/agent-runtime/agent-run.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-run.dto.ts)
- Modified: [backend/src/agent-runtime/agent-runtime.module.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.module.ts)
- Modified: [backend/src/agent-runtime/agent-runtime.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.service.ts)
- Modified: [backend/src/agent-runtime/understanding/agent-context-builder.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-context-builder.service.ts)
- Modified: [backend/src/agent-runtime/understanding/agent-context-serializer.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-context-serializer.service.ts)
- Modified: [backend/src/agent-runtime/understanding/agent-presentation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-presentation.ts)
- Modified: [backend/src/agent-runtime/understanding/agent-understanding.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-understanding.service.ts)
- Modified: [backend/src/agent-runtime/understanding/agent-understanding.types.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-understanding.types.ts)
- Modified: [backend/src/agent-runtime/understanding/evidence-collector.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/evidence-collector.service.ts)
- Modified: [backend/src/conversation/conversation.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.dto.ts)
- Modified: [backend/src/conversation/conversation.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.service.ts)
- Modified: [backend/src/workspace-intelligence/workspace-runtime.contract.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-runtime.contract.ts)
- Modified: [backend/src/workspace-intelligence/workspace-store.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-store.service.ts)
- Modified: [backend/src/workspace-intelligence/workspace.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace.controller.ts)
- Modified: [components/chat/agent-run-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/chat/agent-run-card.tsx)
- Modified: [components/workspace/workspace-runtime.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-runtime.tsx)
- Modified: [lib/sekhem-agent.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-agent.ts)
- Modified: [lib/sekhem-conversation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-conversation.ts)
- Added: [backend/src/workspace-intelligence/workspace-runtime-evidence.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-runtime-evidence.service.ts)
- Added: [backend/test/workspace-runtime-evidence.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/workspace-runtime-evidence.test.ts)
- Added: [components/workspace/runtime-evidence.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/runtime-evidence.tsx)
- Added: [test/workspace-runtime-evidence.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/workspace-runtime-evidence.test.ts)
- Added: [docs/workspace-runtime-phase2.md](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/docs/workspace-runtime-phase2.md)

Expected generated output: backend/dist, frontend .next, and TypeScript build cache. Existing local service logs were regenerated under backend/.runtime-state. No package or dependency changes.

## 2. Contracts

- RuntimeEvidenceRequest: immutable explicit user intent, including request, workspace/version, runtime/fingerprint, project/org/user, Conversation, relative path, and deterministic operation identity.
- RuntimeEvidenceReference: the request coordinates plus authoritative receiptId, observationTime, verificationState=VERIFIED, truncated, encoding=utf-8-decoded, sourceType=runtime-workspace, and contentIdentity={status:UNAVAILABLE}. No file-content digest is invented.
- RuntimeEvidenceView: PENDING / APPROVAL_REQUIRED / EXECUTING / VERIFIED / TRUNCATED / UNAVAILABLE / DENIED / FAILED / STALE; includes immutable historical reference separately from current availability.
- Two immutable record kinds (evidenceRequest/evidenceReceipt) in the existing private Workspace store; no tables, schema, migrations, or runtime ledger format changes.
- POST /api/projects/:projectId/workspace/bindings/:id/evidence creates a fresh read proposal; GET .../evidence/:requestId?version=N only observes the saved request.
- Conversation and Agent run DTOs accept explicit structured runtimeEvidence references, never client-supplied file bodies or claims of verification.

## 3. Runtime evidence flow

Selected file → explicit Ask Agent → private immutable evidence intent → Phase 1 adapter's fresh filesystem.read proposal → existing exact human approval → existing runtime authorization/revalidation → authenticated Windows worker → immutable verified receipt → adapter content restrictions → evidence admission → existing Agent Conversation/run.

Viewer reads cannot be promoted by a caller. The evidence-request namespace produces a distinct operation. Duplicate requests retain the same target; conflicting reuse rejects. Reads are never dispatched by model output, context collection, GET polling, file selection, or receipt restoration.

## 4. Existing context-builder integration

- Conversation requires explicit Agent routing for runtimeEvidence; Chat/automatic misuse is rejected rather than silently dropping evidence.
- Agent run creation validates the exact reference, persists it in the existing plan parameters, and creates a planning-only step with no dispatchable skill.
- The collector repeats admission immediately before building context, obtains content from the checked authoritative adapter, applies the existing reader bound, and returns ordinary workspace evidence.
- Explicit runtime evidence suppresses backend filesystem discovery and unrelated automatic repository/artifact/history/memory/attachment discovery. Explicit attached files retain their existing admission path.
- Existing prioritization, deduplication, five-item limit, text budget, serializer, planning schema, exact-excerpt provenance validation and PLAN_READY/PLAN_NOT_READY semantics remain in use.
- Receipt-specific source IDs keep successive reads distinct. The final model-facing provenance key is runtime:<receiptId>; the full structured reference is preserved in headers, evidence receipts, and content-free audit records. The initial redundant compound citation was shortened after live truncation, without changing any budget or schema.
- Source-excerpt facts, interpretations, and hypotheses from a validated runtime-evidence plan are included in the existing Agent memo with their labels. Invalid/truncated output still emits only the existing truthful failure result.

## 5. Security guarantees

- Controller durable-session validation remains authoritative. Background admission reuses RuntimeIdentityService.actor with the originating session, plus current project, organization and account checks.
- Admission verifies owner, existing Conversation, exact project/org, active binding and version, runtime and fingerprint, operation target and identity, current runtime/grant availability, authoritative result verification, and the entire immutable reference.
- Revoked/disabled runtime, expired/revoked grant, stale binding/identity, offline worker, missing or invalid session, failed lookup, unapproved/failed/denied/unverified read all fail closed.
- Sensitive-file, secret-content, binary/decoding and 32 KiB runtime read restrictions remain in the accepted Phase 1 adapter.
- TRUNCATED is admitted only because the existing collector/serializer policy accepts bounded truncated text. It remains explicitly marked; no claim of complete or original-byte inspection.
- Source text remains untrusted data and cannot grant authority. Planning remains non-executable. Existing private operation-run filtering continues excluding raw runtime observation messages from ordinary model history.
- SHA-256 before/after checks: Prisma 14/14 files unchanged; AI Gateway 24/24; auth 9/9; trusted-runtime core 11/11; package/lock files 4/4; environment files 2/2. Provider/model configuration, endpoint, credentials, dialect, 512-token limit, security instructions and preview policy were not edited.
- P0-B remains deferred. No schema operation, deployment, content search, native picker, sandbox or new runtime execution feature was implemented. Requested existing runtime regression tests exercised only their disposable fixtures; approved live acceptance added normal binding/read/evidence/conversation/plan records.

## 6. UI behavior

The existing Files viewer offers Ask Agent · approval required. The action explains that file opening is not evidence admission and requests a fresh read. Existing runtime approval controls show the exact path. The evidence panel distinguishes approval, reading, verified/truncated, denied, unavailable, failed and stale states, shows provenance, and exposes Send to Agent only for usable verified evidence.

Send to Agent posts the instruction and immutable reference to the existing Conversation. Existing AgentRunCard, AgentWorkspace, EvidenceList and Understanding/Plan views show the result. Saved evidence cards explicitly describe historical observations and retain provenance after reload/offline. No backend file link is fabricated for a runtime receipt.

## 7. Tests

| Test set | Result |
| --- | --- |
| New backend runtime evidence security/integration tests | 41/41 PASS |
| Related backend regression set, including new tests | 486/486 PASS |
| Final focused admission/context/planning rerun after citation simplification | 84/84 PASS |
| Accepted runtime controls | 69/69 PASS |
| Runtime lifecycle | 11/11 PASS |
| Phase 1 Workspace | 31/31 PASS |
| Combined accepted runtime/Workspace/persistence command | 111/111 PASS |
| Full frontend suite, including 15 new tests | 167/167 PASS |

Counts overlap; they must not be summed as distinct tests.

Backend related command:
```powershell
node --import tsx --test --test-concurrency=1 test/workspace-runtime-evidence.test.ts test/workspace-runtime.test.ts test/workspace-runtime-persistence.test.ts test/workspace-mvp.test.ts test/workspace-discovery-relevance.test.ts test/workspace-intelligence.test.ts test/agent-context-builder.test.ts test/agent-context-hardening.test.ts test/agent-planning.test.ts test/conversation-restoration.test.ts test/conversation.routing.test.ts test/durable-session-enforcement.test.ts test/tool-authorization.test.ts test/agent-decision.test.ts test/trusted-runtime-operations.test.ts test/trusted-runtime-transport.test.ts test/trusted-runtime-client.test.ts
```

Accepted runtime/persistence command:
```powershell
$env:SEKHEM_RUNTIME_DB_TEST='1'
node --import tsx --test --test-concurrency=1 audit/post-runtime-controls.test.ts test/trusted-runtime-persistence.test.ts test/trusted-runtime-operations.test.ts test/trusted-runtime-transport.test.ts test/trusted-runtime-client.test.ts test/workspace-runtime.test.ts test/workspace-runtime-persistence.test.ts
```

Final focused command:
```powershell
node --import tsx --test --test-concurrency=1 test/workspace-runtime-evidence.test.ts test/agent-context-builder.test.ts test/agent-context-hardening.test.ts test/agent-planning.test.ts
```

Frontend command: npm test. The Windows restricted-process tsx startup failed with uv_os_get_passwd ENOMEM; the same commands passed with process permission. Tests used mocks or their existing isolated database/runtime fixtures, never fabricated live acceptance results.

## 8. Typecheck/build

- Backend npm run typecheck: PASS. Backend npm run build: PASS, regenerated dist from repaired source; rebuilt after final receipt-key change.
- Frontend npm run typecheck: PASS. Frontend npm run build: PASS. The initial restricted-network attempt could not fetch existing Google Fonts; the unchanged build passed with network permission.
- Existing Next.js middleware convention warning remains. No manifest, lockfile or font-source edits were used to bypass build failures.

## 9. Real Windows acceptance

Only the existing disposable .workspace-acceptance-20260923 folder and its harmless HELLO.md were used. Its SHA-256 remained 83139464AFF1B5A44E6860C685C54B18C0EB4B8536AB4DE664B77FBB644E4818. No destructive acceptance action ran.

The old Conversation's v1 binding was no longer active: later pre-existing bindings had superseded it. Its read correctly rejected WORKSPACE_BINDING_STALE. The existing UI created and verified a fresh v7 binding to the same disposable folder, using the same enrolled runtime and existing read/list grant; no new grant or enrollment.

- Conversation: conv-1790178269881-iv4e70.
- Workspace: workspace_af2ae0a3bbc6e11c28ae0268fedfd354e1381eb47a25b73a8b0668cfa9e00eb9, binding v7.
- Runtime fingerprint: c0142d23ace3d5d0c26b35f4d77b556c947fc88abf5dcb71c3c046378c3750d5 (unchanged).
- Opening HELLO.md required its viewer approval and displayed the real source. Read-only database check: 0 evidence requests, 0 evidence receipts at that point.
- Ask Agent created a distinct exact read and visibly required approval. After approval, VERIFIED evidence displayed workspace, binding, runtime, fingerprint, file, receipt, operation, observation time, and unavailable content identity.
- Final evidence receipt: rt1_RUNTIME_EXECUTION_2c5f6b0e51da42947f01c263e64d2120719bcffc8bf4381fb96ab46c9fed229b. Observation: 2026-09-23T16:36:05.297Z.
- Final Agent run: run_1790181407292_n8irt. Exactly one source (HELLO.md) was read and selected. No unrelated file was admitted, and the response did not claim unrelated inspection.
- Summary acceptance FAILED: both live calls ended with HTTP 200 / finishReason=length / refusalFieldPresent=false. Existing validation preserved OUTPUT_TRUNCATED and PLAN_NOT_READY, with no fabricated facts, fallback summary, automatic retry, or execution.
- Final redacted correlation ID: ai-reasoning-dc1e9b04-c079-4ec3-83e2-77b4a4611769. Model GLM-5.2-Abliterated, dialect LLAMACPP_JSON_SCHEMA; 1 system and 1 user message. Instruction version sekhem-assistant-v1; fingerprint 5fa1a352c13fe89216002e4a17c59831b38823bcdb17172285f90487c55baeaa. No refusal cause was inferred.
- Stopped only the acceptance worker at 2026-09-23T16:37:48.785Z. After existing heartbeat expiry, a fresh Ask Agent request showed Evidence unavailable / Workspace offline. No new runtime operation was created, and the backend fallback remained absent.
- Both historical evidence metadata fingerprints remained identical across the offline test. Saved evidence and provenance remained visible after page reload. The failed fresh request is only a pending intent record, without a runtime execution or receipt.
- Backend and frontend remain running; the acceptance worker is stopped. The browser is left on the historical Evidence view.

## 10. Known limitations

- Live grounded-summary acceptance remains blocked by truncated structured model output under the unchanged provider/output contract. HTTP success does not establish a valid planning result.
- Model interpretation quality is not guaranteed by provenance checks; validation establishes exact source excerpts and valid references, not the truth of every inference. Inference and hypothesis labels remain explicit.
- Evidence is an observation at the receipt time, not a current-file assertion. Fresh analysis does not imply fresh OS access unless a new explicit read was requested and approved.
- Original bytes and content identity are unavailable from this runtime read protocol. No content search or autonomous discovery was added.
- The temporary Ask Agent panel does not restore its pending selection after switching away/reloading. Requests and approvals remain durable in the existing Conversation/runtime records, and plan-attached evidence restores normally. A new Ask Agent action always requests fresh evidence.
- The legacy run summary can still show 'Workspace binding unavailable' when it has no backend-host binding; the runtime Evidence card carries the actual structured binding and provenance.

## 11. Exact next recommendation

Do not advance to Workspace search or autonomous reads. Review this Phase 2 implementation with the live summary gate explicitly OPEN. The next separate authorized task should audit structured-planning output size/completion against the existing 512-token provider contract using the two recorded diagnostic correlations. Any proposed budget, prompt or provider change needs its own scope; none was made here. Then rerun the exact HELLO.md grounded-summary acceptance.

