# Conversation / execution boundary

## Pre-edit audit

`AgentInspectionService.decide()` used `AiGatewayService.requestStructuredReasoning()` with `INSPECTION_DECISION_SCHEMA` for every model response. `parseInspectionDecision()` required the complete six-field envelope and parsed its report before returning a read action. `inspectUnderstanding()` then validated excerpts, constraints, and provenance before any conversational response was saved. An error reached `advance()` → `fail()`, which ended the run and placed `INVALID_MODEL_PROPOSAL` in Chat. Thus an invalid report could discard both communication and an otherwise separate proposed inspection.

`advance()` also treated denied approvals as terminal failures. The inspection decision endpoint offered approve/deny only. `ConversationService.postMessage()` routed subsequent input into a new AgentRun or ordinary Chat rather than the active inspection. These are orchestration and presentation concerns; Runtime authorization already independently checks every executable operation.

## Change

- Agent conversation uses the existing Gateway, identity, context accounting, configured model, and 8,192-token reservation without a whole-response JSON constraint. The configured non-thinking transport fields remain present. Chat and R&D contracts are unchanged.
- Natural replies are saved in the same conversation independently of action authorization. A single optional `sekhem-action` block can propose one read-only intent. Its exact fields, tool, query, path, sensitive-file checks and scope validation remain strict. Prose is never executed, and ambiguous/invalid intents wait for clarification.
- Optional `sekhem-understanding` metadata uses the existing strict grounding validator. Invalid metadata cannot fabricate evidence or completion, and does not discard conversation or authorize an action. A final grounded result still requires actual Runtime source reads.
- Same-Chat follow-ups continue the one active inspection, with bounded history, ownership/project checks, attachment validation and durable message deduplication. Explicit Chat mode retains its normal route. Concurrent user input invalidates stale model work; late replies/errors cannot act on an obsolete turn.
- Pending approval permits communication without replacing the proposal. Reject and Skip deny the exact existing proposal through RuntimeControl. Their comments/decisions remain in Chat; continuation uses the same run, and a declined operation cannot be automatically repeated within it.
- Approval, revalidation, grants, scope, Runtime identities, permits, dispatch, receipts and evidence admission are unchanged. No write or terminal capability is added. No Planning phase is implemented.

## Validation

Before edits: 20/20 focused inspection/context tests passed.

Initial refactor verification: 764/764 tests in 44 related backend files passed. Frontend: 211/211. Backend/frontend typecheck and production builds passed. Final counts after live-discovered fixes and added regressions are recorded below. Database-writing Runtime persistence integration tests were excluded. The unrelated provider-settings HTTP fixture with the previously observed sign-in failure was not used as an acceptance gate.

Live acceptance is recorded below after the actual run; tests are not a substitute for real source reads.

## Live-discovered receipt observation race

The first live run (`run_1790271615339_4ehc3`) delivered natural conversation, authorized a listing and a `package.json` read, and received successful verified Runtime results. The Agent nevertheless stopped with `WORKSPACE_RECEIPT_MISMATCH`. The saved workspace evidence receipt matched the immutable execution result, but `observe()` had fetched its execution snapshot before evidence observation. A Runtime result arriving between these two reads made the snapshot stale.

An isolated regression reproduced the failure before the fix. The minimal correction reads the execution snapshot after evidence observation. Receipt identity and `VERIFIED` checks remain unchanged, as do Runtime and evidence-admission services. Afterward 126/126 related security/evidence tests, backend typecheck and backend build passed. The failed live run remains intact; acceptance uses a fresh request.

## Live-discovered presentation defects

The older conversation-restoration filter hid all inspection replies when an inspection entered PAUSED/AWAITING_INPUT. Persisted model conversation, inspection checkpoints, and clarification messages now remain visible; stale completion memos are still filtered. The message response discriminator also only recognized QUEUED acknowledgements, while same-run continuation returns RUNNING. It now validates both acknowledgement shapes, leaving ordinary Chat messages unchanged. Regression coverage verifies both defects.

## Final validation

- Baseline: 20/20 focused tests.
- Final related backend suite: **767/767 passed**, 47 suites, 44 test files. Selection: `agent-*`, `ai-gateway-*`, `assistant-context*`, `conversation*`, `inspection-*`, `tool-*`, `workspace-*`, `trusted-runtime-*`, `provider-*`, `vllm*`. Excluded database-writing `trusted-runtime-persistence` and the previously failing unrelated `ai-gateway-provider-settings` HTTP fixture.
- Frontend suite: **213/213 passed**. After the final clarification flag, the affected restoration/client suite passed again: **39/39**.
- Backend and frontend: `pnpm run typecheck` and `pnpm run build` passed.
- Tests used the existing installed Node v24.21.0; the repository's existing Node 22 engine warning remains. No Node or package configuration was changed.
- Security cases include unauthorized grant, sensitive/out-of-scope paths, terminal intent rejection, ambiguous/malformed intent, approval pending, rejection/skip, stale turn success/error, ownership/idempotency, immutable evidence, and actual source-read grounding. No destructive database integration tests were run.
- Temporary in-memory metadata observation was removed after acceptance; backend was restarted normally with `node dist/main.js`.

## Live result

**CONVERSATION / EXECUTION BOUNDARY REFACTOR = PASS**

**UNDERSTAND LIVE ACCEPTANCE = BLOCKED at certified completion; conversation and source-inspection flow succeeded.**

The remaining issue is not output truncation or a stopped conversation. GLM supplied useful natural findings and a final answer, but its final grounding snapshot used a generic JSON fence and paraphrased facts, not an accepted optional grounding record. Earlier optional records produced `GROUNDING_NOT_VERIFIED` diagnostics. The latest answer was preserved and shown; it did not create a certified GROUNDED checkpoint. The saved run remains **PAUSED / AWAITING_INPUT**, last checkpoint **INTERMEDIATE**, with no failure reason. It has not been marked COMPLETED.

No permissive parsing, synthesized facts, fake completion, additional operation allowance, provider retries, or validation relaxation was added to force acceptance. Next work, if requested, is limited to the optional grounding/finalization contract; it must preserve natural conversation and strict factual/provenance validation. Planning has not started.

### Identity and authorization

- Initial request: “Understand this project and identify where authentication is implemented.”
- Workspace: `D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\.phase63-acceptance-20260923`
- Binding: `workspace_ea56e5d502d236a72e1646824d495ac28b0104aaaaea3ff60be0db536702a32d`, version **22**, READY.
- Runtime: `rt1_RUNTIME_DEVICE_9e1ab25da1b8b8f3a2f5d1aeeda9ed81ebf7bdc10906c0694be883f5f915efbd`
- Runtime fingerprint: `76035c0bd7096100b93c5c87fc758c74eb9a83acf0d1c0053668bf9c2517cde6`
- AgentRun: `run_1790272067503_5ssls`
- Same Chat: `conv-1790266301322-z20wq8`
- Grant: `rt1_RUNTIME_GRANT_8f5f0c204ad743530eacedd7c54fc7e426cfa46fb64f786f3bf9969801c4411f`, version **9**, expires **2026-09-24T18:38:38.213Z**.
- The existing bounded consent was renewed through authenticated UI with only **filesystem.list, filesystem.search, filesystem.read**. All four operations cite this exact approval coverage and passed the existing execution pipeline; no new permission abstraction or bypass was used.
- The original root binding verification was retained. A real refreshed root listing and subsequent Agent listing ran through Runtime.

### Actual operations

| Operation | Relative target | Result |
|---|---|---|
| filesystem.list | workspace root | VERIFIED |
| filesystem.search | src (query auth) | VERIFIED |
| filesystem.read | src/auth/session.ts | VERIFIED, full read |
| filesystem.read | package.json | VERIFIED, full read |

**Two source files read**, four observations admitted. Every execution payload digest and immutable result digest was rechecked successfully; each evidence reference matches its receipt, runtime, workspace, binding version and conversation. No backend filesystem fallback, write/create/delete/move/copy, terminal, or test execution occurred in the live AgentRun.

#### filesystem.list — workspace root

- Proposal: `rtproposal_a0ef93206dc696231c4cbebc06dd8125f5b432aaa1130eb2204af69e11b22a34`
- Approval: `toolapproval_06dbf1c904eddf81603d24135327f6efd3665e82322dd2d22c5665a5569740ca`
- Execution intent: `rtintent_b8d38f2b4e9cb20be8f830ac195ebf8cd0aa7dd719b01ffe7bcee8551b1ad39e`
- Operation: `wsop_2a47d7f987e8e16c65c520c637c8af7f1fbd054166ab9d10caadc2eb911c1ee2`
- Receipt: `rt1_RUNTIME_EXECUTION_13a13a04881edd45077e4dd565109ccbeef695069393c2fa51c857c66b39ca87`
- State / verification: **VERIFIED / VERIFIED**.
- Immutable result, execution digest, result digest and provenance match: **PASS**.

#### filesystem.search — src

- Proposal: `rtproposal_1e26621d011d8c56827e55573fdde8bb4fe8d61eeaac0036543fc01aaba23e5b`
- Approval: `toolapproval_03655dd42019999891a8ef16508d4d5d81ed461518dfcdbbab690db95e9efdfd`
- Execution intent: `rtintent_72de49bfbab3e7d91b1218268fb5f0976d049b173f7106d9a075d3aeabba3ee6`
- Operation: `wsop_0714f2c2506c3a8587956b5d880bb98e02a37193201ef9c43d652aeddf4fddca`
- Receipt: `rt1_RUNTIME_EXECUTION_5277a55e9d3055123f56d3329d4d6dcfdfc437cc4f7de35be21ccc1d1c1de194`
- State / verification: **VERIFIED / VERIFIED**.
- Immutable result, execution digest, result digest and provenance match: **PASS**.

#### filesystem.read — src/auth/session.ts

- Proposal: `rtproposal_7a2e1adecf1a80ed7975670473b2657a397815a2b32cdf9e7d03436d2e2758f8`
- Approval: `toolapproval_e033a34dab44dac79d2963af329d2fbc3574d24d4e58678d25f5181f6420cba6`
- Execution intent: `rtintent_64eecda23867991652b2622ebcb88e22e74bb97c14800dd58191042c729c174b`
- Operation: `wsop_407d10c9d62d112e5ad31b023d0bcfd6babd724c1f845defe950af81e5279df2`
- Receipt: `rt1_RUNTIME_EXECUTION_5e8d9395e90f8bcf7397292e6363edeee9ff95869150e786fa29919277d89573`
- State / verification: **VERIFIED / VERIFIED**.
- Immutable result, execution digest, result digest and provenance match: **PASS**.

#### filesystem.read — package.json

- Proposal: `rtproposal_2daf04aa8ed49c5e6f0c2884dd97ba3948fc350ce8994e45f727e784ece98cf3`
- Approval: `toolapproval_5cbb5f02689bf9beeaba71d90caac88f43e877a77530dc2763c7eef7804fa3c6`
- Execution intent: `rtintent_ccf7582724d4f20a7b67f90cc14259107e2df57b1dd5cfa452132503f1635bf2`
- Operation: `wsop_5b80fb7df611bbf21af5c1431524381a3eb1f08c2e1f757ca7a7958029307715`
- Receipt: `rt1_RUNTIME_EXECUTION_ad187547065e9be31f7ef4e5cfa542b648aa76f3453208ad1ef9f81b2cb5c668`
- State / verification: **VERIFIED / VERIFIED**.
- Immutable result, execution digest, result digest and provenance match: **PASS**.

### Natural understanding and same-run continuation

Six natural GLM replies are persisted in the same Chat, including the follow-up. The actual source reads support the reported session helper: `isSessionActive` returns `!session.revoked && session.expiresAt > now`. GLM explained the strict expiry comparison, reported the fixture package identity, and explicitly said README/docs and callers were unread/unknown. The initial report overgeneralized the single auth search hit; the follow-up narrowed this to the inspected scope and acknowledged other source files could contain differently named authentication logic.

A normal UI follow-up asked for an inspected-scope conclusion and no additional operations. It resumed **the same AgentRun**, retained the existing four verified operations and produced another answer. No extra read or action was dispatched. After refresh, prior progress, inspected files, verification, the final prose and the input-waiting state remained visible.

This demonstrates conversation independent of execution/grounding validation. It does **not** establish the required terminal certified-understanding status.

### Actual provider measurements

All six requests used the configured model **GLM-5.2-Abliterated**, **max_tokens=8192**, HTTP **200**, **finish_reason=stop**, `reasoning_effort=none`, `chat_template_kwargs.enable_thinking=false`, and no whole-response `response_format`.

| Request | Prompt tokens | Completion tokens | Final characters | Reasoning characters |
|---|---:|---:|---:|---:|
| Initial discovery | 2324 | 1507 | 2194 | 5125 |
| After listing | 3479 | 1796 | 3010 | 4619 |
| After search | 4470 | 2074 | 4117 | 4364 |
| After auth source read | 5515 | 2414 | 5445 | 4865 |
| After package read | 6698 | 2519 | 5714 | 4194 |
| Same-run follow-up | 8243 | 3066 | 8302 | 4879 |

No truncation occurred. The endpoint still returns reasoning despite non-thinking controls; deployed serving-template details remain unknown. No serving change was made.

### Configuration and protected boundaries

Provider/model configuration fingerprint before and after:
`8d9dc6b859688204d44562da07fea199af2dd299dede3f55748a8b16c6b76eb3`.

Production output budget remains **8,192**. Provider/model endpoint, thinking fields, credentials, Runtime cryptography, grants/authorization implementation, Auth, Prisma/schema/migrations, Node and package manifests were unchanged. Normal UI acceptance writes created run/message/grant/receipt records; there were no manual database mutations. The transport adapter change only allows existing thinking controls to remain attached to the new schema-less Agent conversational call.

## Exact source/test/document changes

- `backend/src/agent-runtime/agent-runtime.service.ts`
- `backend/src/agent-runtime/inspection/agent-inspection.service.ts`
- `backend/src/agent-runtime/inspection/inspection-conversation.ts`
- `backend/src/agent-runtime/inspection/inspection.types.ts`
- `backend/src/ai-gateway/ai-gateway.service.ts`
- `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts`
- `backend/src/conversation/conversation.service.ts`
- `backend/test/agent-conversation-boundary.test.ts`
- `backend/test/agent-workspace-loop.gaps.test.ts`
- `backend/test/agent-workspace-loop.security.test.ts`
- `backend/test/agent-workspace-understanding.test.ts`
- `backend/test/ai-gateway-output-budget.test.ts`
- `backend/test/helpers/inspection-loop-harness.ts`
- `components/workspace/agent-inspection-card.tsx`
- `docs/audits/conversation-execution-boundary.md`
- `lib/conversation-restoration.ts`
- `lib/sekhem-agent.ts`
- `lib/sekhem-conversation.ts`
- `test/agent-inspection-presentation.test.ts`
- `test/conversation-restoration.test.ts`
- `test/sekhem-conversation-client.test.ts`

Production builds additionally regenerated ignored build artifacts. A 486-file pre-edit SHA-256 baseline comparison identified the 18 existing modified files above plus the three new files. Protected source/config files in that baseline remained unchanged.
