# G01/G02 final contract-verification gate

Verified: 2026-09-21. **PASS for the source foundation to begin Phase 4 development. Phase 4 was not implemented.** This verifies repository contracts under mocked provider transport, not a deployment or live-provider certification.

## 1. JSON_OBJECT_ONLY evidence

| Evidence | Finding |
| --- | --- |
| `backend/src/ai-gateway/runtime-configuration.dto.ts:3`; `rd-radar-output.schema.ts:3` | Four distinct dialects: LLAMACPP_JSON_SCHEMA, OPENAI_JSON_SCHEMA, VLLM_STRUCTURED_OUTPUTS, JSON_OBJECT_ONLY. JSON-object compatibility is an explicit dialect, not an absent/unknown dialect. |
| `backend/test/vllm-openai-compatible.adapter.test.ts:83` | The original multi-dialect regression explicitly expects `response_format: { type: "json_object" }`. Its expectation is unchanged. Before this fix, the adapter/registry baseline was 20 passed, 1 failed. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts:195` | Older nested source constructs the body with an unconditional JSON-object response format. Its helper at line 355 intentionally leaves that default in place for JSON_OBJECT_ONLY. |
| `backend/dist/ai-gateway/providers/vllm-openai-compatible.adapter.js:154` and nested compiled adapter | Existing compiled copies retain that same body default and no-op explicit JSON_OBJECT_ONLY branch. They are historical corroboration, not the baseline used to audit G01/G02. |
| Current pre-fix adapter | The unconditional body default was absent, but the helper still did nothing for JSON_OBJECT_ONLY. This mechanically explains the regression. |
| `components/runtime-configuration-panel.tsx:160`; `runtime-configuration.service.ts:32,523` | UI offers “JSON object compatibility”; service accepts and persists it as an explicit choice. No repository evidence redefines it as “omit structured-output transport”. |
| `runtime-configuration.service.ts:528` | Owner inference maps llama.cpp/llamacpp, openai and vllm to their respective schema dialects. Unknown ownership throws and requires explicit configuration; it does not silently select JSON_OBJECT_ONLY. |
| `provider-adapter.registry.ts` | Resolves by provider type and forwards requests. It does not translate dialects, remove response_format, or choose JSON-object mode. Existing adapter compatibility wrappers/default alias were not changed. |
| `ai-gateway.service.ts:237,319` and repository-analysis caller | Completion, streaming and repository analysis forward the persisted dialect. There is no production caller hard-coding JSON_OBJECT_ONLY. Explicitly configuring it would therefore exercise the repaired shared helper. |

The available history is a filesystem snapshot, generated JS and captured hashes. This workspace has no Git repository/history. **Who removed the global default, when, and why cannot be established.** The inference is limited to the observable dependency: the old explicit branch relied on that default; removing the default left the branch without the format required by the unchanged test. Restoring the explicit contract does not require guessing the rationale for plain requests.

Repository compatibility contracts are:

| Dialect | Request envelope |
| --- | --- |
| LLAMACPP_JSON_SCHEMA | `response_format: { type: "json_schema", schema }`; existing llama-only reasoning controls preserved |
| OPENAI_JSON_SCHEMA | `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` |
| VLLM_STRUCTURED_OUTPUTS | `structured_outputs: { json: schema }`, no response_format |
| JSON_OBJECT_ONLY | `response_format: { type: "json_object" }`, no schema-enforcement envelope |
| No explicit dialect | No response_format or structured_outputs |

These are local transport contracts, not assertions that every OpenAI-compatible endpoint accepts every dialect. JSON-object mode does not provide the schema-enforcement promise of the schema dialects. Existing response validation and provider verification remain in place. No live provider call was necessary or made.

### Current configured production path

A direct Prisma SELECT-only inspection used PostgreSQL `default_transaction_read_only=on` and verified that setting before reading safe fields. No application bootstrap, provider-test endpoint, credential decryption or provider request was used.

Only one provider/model was returned:

- Provider: Teletech — SEKHEM; type vllm_openai_compatible; enabled; saved health healthy.
- Saved dialect: **LLAMACPP_JSON_SCHEMA**, verified 2026-09-16T14:07:45.047Z.
- Model: GLM-5.2-Abliterated; enabled/default; contextWindow **262144**; maxOutputTokens **512**.
- Provider updatedAt: 2026-09-20T11:30:16.229Z; model updatedAt: 2026-09-16T14:07:43.706Z.

Therefore the currently persisted Agent/Gateway selection does **not** use JSON_OBJECT_ONLY. Its llama.cpp envelope is unchanged. Saved health/verification timestamps are configuration evidence, not a new health check.

## 2. Decision and exact change

Repository evidence establishes the explicit JSON_OBJECT_ONLY format. At `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts:614`, the final gate changes only the shared dialect helper:

```diff
-    else if (output.dialect !== "JSON_OBJECT_ONLY") throw new BadRequestException("Structured output dialect is unsupported");
+    else if (output.dialect === "JSON_OBJECT_ONLY") body.response_format = { type: "json_object" };
+    else throw new BadRequestException("Structured output dialect is unsupported");
```

The helper is used by completion, streaming and dialect verification. No unconditional default was reintroduced. Other dialect branches, provider/model selection, saved configuration, prompts and credentials were not changed.

Two tests were added to the adapter test file: complete/stream parity for all four dialects plus no-dialect requests, and explicit JSON_OBJECT_ONLY verification using the same envelope. They also check the configured 512-token request budget. The original failing test was retained unchanged.

## 3. Complete modified-file audit

Cumulative scope includes the accepted G01/G02 work and this final pass: **20 files: 9 production, 6 tests, 5 documentation/report/helper files**. “New” means added during this cumulative task. Final-pass application-code changes are restricted to the adapter and its test file.

### Production execution-context changes

| File | Status / actual diff |
| --- | --- |
| `backend/src/agent-runtime/agent-runtime.service.ts` | Modified in G01/G02: preserve instruction text; serialize once before evidence audit and reuse it; propagate budget metadata. |
| `backend/src/agent-runtime/understanding/agent-context-serializer.service.ts` | Modified in G01/G02: account for exact evidence headers, separators and truncation markers; report dropped unfit frames; avoid splitting surrogate pairs. Existing context architecture and section wording preserved. |
| `backend/src/agent-runtime/understanding/agent-understanding.types.ts` | Modified in G01/G02: reference the shared 24,000-character evidence constant. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | Modified in G01/G02: optional typed contextBudget metadata. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | Modified in G01/G02: remove live preview-policy/2k gates and 2048 output floor; use shared budget for complete/stream; preserve typed budget errors and metadata. Separate preview and R&D behavior preserved. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | New in G01/G02: selected-model budget, shared UTF-8 JSON estimator, whole-message retention and explicit mandatory-context errors. |
| `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | Modified in G01/G02: shared validation of actual messages and shared output cap. Final gate: the explicit JSON_OBJECT_ONLY branch above. |
| `backend/src/common/api-exception.filter.ts` | Modified in G01/G02: expose only typed, content-free budget diagnostics; arbitrary exception payloads remain private. |
| `backend/src/conversation/conversation.service.ts` | Modified in G01/G02: retrieve newest 20 history records then restore chronological order; retain trailing user history with framed context; persist budget/evidence metadata. |

### Tests

| File | Status / actual diff |
| --- | --- |
| `backend/test/agent-runtime.test.ts` | Modified: context-builder fixture and grounded durable-run regression through gateway/adapter with mocked transport. |
| `backend/test/ai-gateway-preview.test.ts` | Modified: six persisted-model fixtures gain the required contextWindow; no preview assertions weakened. |
| `backend/test/conversation.integration.test.ts` | Modified: query-aware chronological mock and expectations for already existing chat replies. Earlier failures were reproduced against a hash-verified pre-change ConversationService before those expectations changed. |
| `backend/test/conversation.routing.test.ts` | Modified: missing transaction/chat fixture collaborators supplied; production routing unchanged. |
| `backend/test/assistant-context-budget.test.ts` | New: 13 budget, evidence, error-envelope and conversation-path regressions. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | Modified only in final gate: two contract regressions added; original expectations unchanged. |

### Documentation/report/helper files

| File | Status / purpose |
| --- | --- |
| `backend/test/helpers/assistant-context-harness.ts` | New G01/G02 test-only harness; real builder/gateway/registry/adapter, mocked evidence/persistence/provider transport. |
| `docs/architecture/agent-context-gateway-contract.md` | New G01/G02 report, updated in final gate to retain historical results while marking the JSON mismatch resolved. |
| `docs/architecture/agent-context-final-gate.md` | New final report (this file). |
| `docs/architecture/agent-context-final-gate-search.md` | New complete classified search inventory. |
| `docs/architecture/agent-context-final-gate.diff` | New cumulative source/test/helper diff against hash-verified originals. |

Temporary baseline reconstruction and audit scripts under `scratch/context-contract-audit/` were removed after verification; they are not retained deliverables.

### Diff method and findings

The pre-G01/G02 capture contains SHA-256 hashes for 382 files. Final comparison found **13 existing files changed, 369 unchanged, none missing**. All 13 original source/test files were reconstructed and their bytes matched the captured original hashes before diffing. The three newly added source/test/helper files were reviewed in full. A fresh source/test/Prisma/frontend inventory found exactly those three additions and no other added file in those trees. This is a content-verified comparison, not an invented Git commit baseline.

The saved [actual diff](agent-context-final-gate.diff) covers all 16 source/test/helper files. It ignores CR at line ends only. Endings were independently checked: the runtime service preserves its existing CRLF file with 10 locally edited/inserted LF lines; there is no whole-file normalization. Other changed source/test files retain LF. Documentation was reviewed directly, including the three superseding edits to the initial report.

- No accidental refactor, unrelated formatting cleanup, new dead path or new provider fallback was found.
- Both live gateway methods use one preparation function; the adapter rechecks actual transmitted messages with the same estimator/model-budget function. Rechecking is intentional, not a second conflicting formula.
- Existing complete/stream schema wrappers remain duplicated in shape; no new parallel budget implementation was introduced.
- Preview policy and legacy POLICY_BLOCKED DTO/error handlers remain for compatibility. No live askAssistant/streamAssistant invocation emits a preview policy decision.
- Existing registry compatibility wrappers/default alias and default-model selection remain unchanged. No provider failover was added.
- No content censorship/moderation, keyword exception or prompt rewriting was added. Existing identity prompt wording, including its harmlessness/approval language, remains unchanged; evidence authorization boundaries remain intact.
- The 24k evidence allocation, 20-message retention, 96k estimated-input ceiling, 4096 output ceiling and model headroom are centralized for live assistant execution. Retained request/history content is not sliced to fit.
- Separate R&D budgeting and legacy adapter bounds for callers without a live assistant contextWindow remain outside this contract. Existing response-presentation and transport bounds are unchanged.

## 4. Repository search and classification

The [full inventory](agent-context-final-gate-search.md) classifies **457 matching lines in 158 files**: KEEP 83, CHANGE 1 (resolved), LEGACY 247, TEST-ONLY 93, UNRELATED 33.

The recursive search includes both numeric spellings (2000/2_000 and 2048/2_048), all eight requested terms, nested source, compiled JS, frontend, tests, docs, scripts and attachment data. Dependency/cache/git directories, source maps, lockfiles, environment files and audit-generated copies were excluded explicitly; protected manifests/locks/env were hash-verified. The inventory records every match without publishing data contents.

| Occurrence | Classification / conclusion |
| --- | --- |
| Root live askAssistant and streamAssistant | No remaining 2k request gate, policy reviewRequest call or 2048 output floor. |
| `ai-gateway.service.ts:413` | KEEP: sole production policy.reviewRequest call, inside the separate preview endpoint. |
| knowledge_summary_preview and PreviewRequest symbols | KEEP for separate preview contracts; substring matches of PreviewRequest do not establish a policy call. Separate RAG/R&D preview names are classified explicitly. |
| R&D analysisPurpose max 2000 and independent context calculation | LEGACY protected R&D contract; unchanged, not live assistant gates. |
| `components/runtime-configuration-panel.tsx:171` | KEEP: new-model form default of 2048, not a request clamp or replacement of the saved 512 setting. |
| `backend/scripts/debug-conv.ts:68` | TEST-ONLY: manual diagnostic retains old Math.max(...,2048); not invoked by normal application startup or this task. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | LEGACY compiled artifact still contains old 2k/policy/2048 behavior. Rebuild from repaired source before running this build. |
| Nested project copy | LEGACY snapshot; not edited and not the root source tested here. |
| 12k extraction bounds, JSON item count, sniffing sample | KEEP existing reader/resource limits; not aggregate assistant request limits. |
| URL/identifier lengths, SVG namespaces, timestamps, symlink mode, polling/UI timers, stored attachment text | UNRELATED to live assistant gates. |
| contextWindow, contextBudget, ASSISTANT_CONTEXT_BUDGET | KEEP model configuration/shared budget/metadata; separate legacy and test occurrences classified individually. |
| JSON_OBJECT_ONLY helper | CHANGE resolved; explicit contract restored. Types/configuration stay KEEP, tests TEST-ONLY, old copies LEGACY. |

## 5. Typecheck

From `backend/`: `pnpm exec tsc -p tsconfig.json --noEmit` — **PASS, exit 0** after the production/test edits. Generated JS was not rebuilt.

## 6. Focused tests

From `backend/`:

```text
pnpm exec tsx --test --test-concurrency=1 test/vllm-openai-compatible.adapter.test.ts test/provider-adapter.registry.test.ts test/assistant-context-budget.test.ts
```

**36/36 passed, 5 suites, zero failures or skips.** Covers original JSON contract, all dialects in completion/streaming, plain requests, dialect verification, configured output reservation, G01/G02 request retention and budget errors.

## 7. Broader regression

Official runner: `pnpm exec tsx --test --test-concurrency=1`, with the same 24-file selection recorded in the [initial report](agent-context-gateway-contract.md#verification-and-baseline-comparison).

**278/278 passed, 33 suites, zero failed/cancelled/skipped/todo, exit 0.** Previous result was 275/276; the existing failure is resolved and two tests were added.

Coverage includes context builder/hardening, understanding/evidence, runtime/steering/SSE/security, attachment/File Intelligence/workspace boundaries, gateway preview/policy/settings, provider registry/adapter, runtime configuration and conversation routing/integration. This is the requested related regression selection, not a claim that every unrelated repository test was run.

The pnpm process used `pnpm_config_verify_deps_before_run=false` and the installed backend node_modules/.bin to avoid dependency refresh. Windows sandbox prevented tsx initialization, so the test runner ran with approved elevation. HTTP/Nest tests used an unreachable loopback test DATABASE_URL, memory runtime/data-source settings and disabled auth DB mode. These were process-local values, not edits to environment files. Provider HTTP transport and database collaborators were mocked. Test names saying “real provider” refer to the real application adapter path with injected mocked transport.

## 8. Protected-system verification

Hash comparison and command/diff review confirm:

- Root/backend package.json and pnpm-lock.yaml unchanged; no dependency install/update.
- Root .env.local and backend .env unchanged; credentials were not printed, decrypted, changed or included in audit artifacts.
- Prisma schema, all captured migrations, seed and reconciliation files unchanged; no migration or seed executed.
- Runtime provider/model configuration service, DTO, UI, provider registry and stored Teletech/GLM configuration unchanged.
- No production database writes. The only production database operation in this final pass was the explicit read-only configuration inspection described above; tests were isolated from production.
- Authentication/authorization services and ownership checks unchanged. The exception-filter addition only exposes the typed budget diagnostic.
- AgentContext builder/architecture, EvidenceCollector, ExecutionModeDetector, selection/provenance boundaries and file-reader implementations unchanged. The previously authorized serializer accounting edits are fully listed above.
- R&D/Initiative engines and execution/write capabilities unchanged. Their co-located gateway methods were inspected in the actual diff and were not modified.
- No Phase 4 implementation and no live provider call.

## 9. Remaining findings and limits

1. Historical author/date/rationale for removing the unconditional JSON default is unavailable without Git history. This does not leave the explicit JSON_OBJECT_ONLY contract ambiguous; original tests and prior implementation agree.
2. **Compiled backend/dist is stale.** package.json start executes node dist/main.js, while start:dev uses source. This gate does not certify a running process or rebuild/deploy artifacts. A fresh build is required before deploying/running the repaired production build.
3. No external provider compatibility/health or model vision certification was performed. JSON-object mode is tested as a request contract only.
4. The shared token estimator is intentionally conservative UTF-8 JSON-byte accounting, not a provider tokenizer. Large image data URLs can be rejected explicitly. Existing 4096 output cap and legacy non-assistant/R&D budgeting remain documented.
5. Earlier independent findings remain outside this pass: durable attachment storage/upload parser alignment, PDF/OCR/image intelligence, repository/workspace binding, tenant/session findings, inline HTML serving, Initiative persistence drift/binary artifacts, provider failover, and streaming accumulation/presentation limits. See the initial audit/report; none was silently declared fixed.

There are **no unexplained failures in the executed related suites**, and no unresolved JSON-object contract decision requiring a live call or product guess.

## 10. Readiness decision

**G01 verified. G02 verified. JSON_OBJECT_ONLY contract understood and minimally repaired. The source foundation is ready to begin Phase 4 development.** Production deployment still requires rebuilding the stale generated backend and its separate deployment verification. Phase 4 remains unimplemented.

