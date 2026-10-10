# Final gate search inventory

Date: 2026-09-21. Snapshot taken after the JSON-object fix and before the final report/documentation update. 457 matching lines across 158 files. Every matching line is classified; rows with multiple requested terms list all terms. Paths are relative to the workspace root. No attachment contents, credentials or environment values are reproduced.

Counts: LEGACY: 247; KEEP: 83; UNRELATED: 33; TEST-ONLY: 93; CHANGE: 1. CHANGE identifies the one resolved contract repair, not unfinished work. LEGACY means outside the root live assistant source contract; it does not mean safe to execute an old compiled build.

Search expression: `2000|2_000|2048|2_048|reviewRequest|knowledge_summary_preview|contextWindow|contextBudget|ASSISTANT_CONTEXT_BUDGET|JSON_OBJECT_ONLY`.

Scope: recursive `rg --json --hidden --no-ignore` from the workspace root, including the nested source snapshot, compiled backend/dist, tests, diagnostics, docs, frontend and stored attachment data. Excluded dependency/cache/git directories (node_modules, .pnpm-store, .next, .git), lockfiles (pnpm-lock.yaml, package-lock.json, yarn.lock, *.lock), .env* files, *.tsbuildinfo and *.map, this audit's temporary baseline copies and agent-context-final-gate* artifacts. Environment/lockfiles were hash-checked separately without publishing their contents. The full-file baseline audit is recorded in the final report. No source or application directory was excluded.

Substring matches are intentional: 12_000, 120000, timestamps and PreviewRequest names are not silently treated as 2k gates or actual reviewRequest calls. The new-model UI's 2048 default and the manual debug script's old clamp are identified separately. Generated JS still has old live gating and requires a rebuild before use.

| File | Line | Matched terms | Classification | Reason |
| --- | ---: | --- | --- | --- |
| `backend/dist/agent-runtime/agent-runtime.service.js` | 926 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway-policy.service.js` | 13 | `knowledge_summary_preview` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway-policy.service.js` | 56 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.controller.js` | 39 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.controller.js` | 41 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.controller.js` | 127 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 41 | `knowledge_summary_preview` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 90 | `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 91 | `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 93 | `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 144 | `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 167 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 169 | `knowledge_summary_preview`, `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 189 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 224 | `2048` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 283 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 288 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 310 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/ai-gateway.service.js` | 368 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/providers/vllm-openai-compatible.adapter.js` | 331 | `JSON_OBJECT_ONLY` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 37 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 39 | `JSON_OBJECT_ONLY` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 215 | `2000`, `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 238 | `2000`, `contextWindow` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 268 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 271 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 298 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 301 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 459 | `2048` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/ai-gateway/runtime-configuration.service.js` | 463 | `2048` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/attachment/attachment.service.js` | 180 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/attachment/pdf-parser.service.js` | 47 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/file-intelligence/file-intelligence.limits.js` | 15 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/file-intelligence/security/file-intelligence-security.service.js` | 57 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/rag/rag.service.js` | 25 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/rag/rag.service.js` | 60 | `reviewRequest` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/rd-radar-analysis.service.js` | 321 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/repository-source/repository-content.service.js` | 138 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/dist/repository-source/repository-content.service.js` | 149 | `2000` | LEGACY | Existing compiled artifact, unchanged; stale assistant gates/clamp remain in this build. Rebuild before deployment. |
| `backend/prisma/migrations/20260815190000_add_rd_radar_v1_local_llm/migration.sql` | 22 | `contextWindow` | KEEP | Persisted contextWindow schema/historical migration definition; protected and unchanged. |
| `backend/prisma/migrations/20260917120000_add_conversation_attachment/migration.sql` | 2 | `2000` | UNRELATED | Migration timestamp comment contains 2000; immutable migration unchanged. |
| `backend/prisma/schema.prisma` | 965 | `contextWindow` | KEEP | Persisted contextWindow schema/historical migration definition; protected and unchanged. |
| `backend/scripts/debug-conv.ts` | 65 | `2000` | TEST-ONLY | Manual diagnostic script, unchanged and not executed by this task. |
| `backend/scripts/debug-conv.ts` | 68 | `2048` | TEST-ONLY | Manual diagnostic retains old 2048 floor; never run by this task and not a production entry point. |
| `backend/src/agent-runtime/agent-runtime.service.ts` | 312 | `contextBudget` | KEEP | Optional content-free budget metadata propagated from the gateway. |
| `backend/src/agent-runtime/agent-runtime.service.ts` | 378 | `contextBudget` | KEEP | Optional content-free budget metadata propagated from the gateway. |
| `backend/src/agent-runtime/agent-runtime.service.ts` | 811 | `contextBudget` | KEEP | Optional content-free budget metadata propagated from the gateway. |
| `backend/src/agent-runtime/agent-runtime.service.ts` | 1106 | `2000` | UNRELATED | Agent event-poll timing (milliseconds), not request length. |
| `backend/src/ai-gateway/ai-gateway-policy.dto.ts` | 3 | `knowledge_summary_preview` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway-policy.service.ts` | 6 | `knowledge_summary_preview` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway-policy.service.ts` | 52 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.controller.ts` | 23 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.controller.ts` | 24 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 3 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 5 | `knowledge_summary_preview` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 12 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 13 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 23 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.dto.ts` | 45 | `contextBudget` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 7 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 8 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 29 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 31 | `knowledge_summary_preview` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 142 | `contextWindow` | LEGACY | Separate R&D repository-analysis context calculation; not the live assistant budget and unchanged. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 143 | `contextWindow` | LEGACY | Separate R&D repository-analysis context calculation; not the live assistant budget and unchanged. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 144 | `contextWindow` | LEGACY | Separate R&D repository-analysis context calculation; not the live assistant budget and unchanged. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 200 | `contextWindow` | LEGACY | Separate R&D repository-analysis context calculation; not the live assistant budget and unchanged. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 252 | `contextWindow` | KEEP | Shared assistant budget / content-free response metadata. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 280 | `contextBudget` | KEEP | Shared assistant budget / content-free response metadata. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 334 | `contextWindow` | KEEP | Shared assistant budget / content-free response metadata. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 366 | `contextBudget` | KEEP | Shared assistant budget / content-free response metadata. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 409 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 413 | `reviewRequest` | KEEP | Only remaining production policy.reviewRequest invocation; inside separate createPreviewRequest endpoint. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 437 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 509 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/ai-gateway.service.ts` | 515 | `reviewRequest` | KEEP | Separate preview types, request handler or validation; PreviewRequest substrings are not live policy calls. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 14 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 33 | `ASSISTANT_CONTEXT_BUDGET`, `contextBudget` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 36 | `contextBudget` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 37 | `contextBudget` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 42 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 48 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 50 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 55 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 75 | `ASSISTANT_CONTEXT_BUDGET` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 137 | `ASSISTANT_CONTEXT_BUDGET` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/assistant-context-budget.ts` | 140 | `contextWindow` | KEEP | Single live assistant budget authority, estimator or typed budget diagnostics. |
| `backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 1 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 8 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 9 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 36 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/mock-ai-gateway-provider.adapter.ts` | 4 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/mock-ai-gateway-provider.adapter.ts` | 10 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/openai/openai-dry-run-provider.adapter.ts` | 4 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/openai/openai-dry-run-provider.adapter.ts` | 30 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 3 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 8 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 23 | `reviewRequest` | KEEP | Preserved separate preview contract/policy or optional budget DTO; no live assistant content-policy invocation. |
| `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | 17 | `contextWindow` | KEEP | Shared selected-model budget validation on actual transmitted messages. |
| `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | 493 | `contextWindow` | KEEP | Shared selected-model budget validation on actual transmitted messages. |
| `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | 495 | `contextWindow` | KEEP | Shared selected-model budget validation on actual transmitted messages. |
| `backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | 614 | `JSON_OBJECT_ONLY` | CHANGE | Resolved: explicit JSON_OBJECT_ONLY now sends response_format {type: json_object}; no global default restored. |
| `backend/src/ai-gateway/rd-radar-output.schema.ts` | 7 | `JSON_OBJECT_ONLY` | KEEP | Explicit dialect/model contract shared by runtime configuration and structured output. |
| `backend/src/ai-gateway/runtime-configuration.dto.ts` | 3 | `JSON_OBJECT_ONLY` | KEEP | Explicit dialect/model contract shared by runtime configuration and structured output. |
| `backend/src/ai-gateway/runtime-configuration.dto.ts` | 29 | `contextWindow` | KEEP | Explicit dialect/model contract shared by runtime configuration and structured output. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 32 | `JSON_OBJECT_ONLY` | KEEP | Explicit dialect allowlist; unknown owner does not fall back to JSON_OBJECT_ONLY. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 198 | `2_000`, `contextWindow` | KEEP | Model contextWindow validation/projection; upper bound 2,000,000 is configuration validation, not a 2k input gate. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 220 | `2_000`, `contextWindow` | KEEP | Model contextWindow validation/projection; upper bound 2,000,000 is configuration validation, not a 2k input gate. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 248 | `2_000` | UNRELATED | Repository per-file byte limit maximum (2,000,000), not a chat character gate. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 279 | `2_000` | UNRELATED | Repository per-file byte limit maximum (2,000,000), not a chat character gate. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 371 | `contextWindow` | KEEP | Model contextWindow validation/projection; upper bound 2,000,000 is configuration validation, not a 2k input gate. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 466 | `2_048` | UNRELATED | Provider URL/identifier string validation (2048 characters), not an output token clamp. |
| `backend/src/ai-gateway/runtime-configuration.service.ts` | 471 | `2_048` | UNRELATED | Provider URL/identifier string validation (2048 characters), not an output token clamp. |
| `backend/src/attachment/attachment.service.ts` | 205 | `2_000` | KEEP | Existing attachment/PDF reader 12,000-character extraction bound (substring match), separate from aggregate model budgeting. |
| `backend/src/attachment/pdf-parser.service.ts` | 18 | `2_000` | KEEP | Existing attachment/PDF reader 12,000-character extraction bound (substring match), separate from aggregate model budgeting. |
| `backend/src/common/api-exception.filter.ts` | 35 | `contextBudget` | KEEP | Content-free context-budget metadata propagation. |
| `backend/src/conversation/conversation.service.ts` | 501 | `contextBudget` | KEEP | Content-free context-budget metadata propagation. |
| `backend/src/file-intelligence/file-intelligence.limits.ts` | 14 | `2_000` | KEEP | JSON item-count resource bound of 2000, not a chat character gate. |
| `backend/src/file-intelligence/security/file-intelligence-security.service.ts` | 57 | `2_000` | KEEP | Bounded 2000-character file sniffing sample, not a chat request gate. |
| `backend/src/rag/rag.dto.ts` | 29 | `reviewRequest` | LEGACY | Separate RAG preview API/type; PreviewRequest name match, no live assistant policy call. |
| `backend/src/rag/rag.service.ts` | 3 | `reviewRequest` | LEGACY | Separate RAG preview API/type; PreviewRequest name match, no live assistant policy call. |
| `backend/src/rag/rag.service.ts` | 20 | `reviewRequest` | LEGACY | Separate RAG preview API/type; PreviewRequest name match, no live assistant policy call. |
| `backend/src/rag/rag.service.ts` | 59 | `reviewRequest` | LEGACY | Separate RAG preview API/type; PreviewRequest name match, no live assistant policy call. |
| `backend/src/rd-radar-analysis.service.ts` | 294 | `2_000` | LEGACY | Separate 2,000-character analysisPurpose limit; R&D contract untouched. |
| `backend/src/rd-radar.controller.ts` | 7 | `reviewRequest` | UNRELATED | CollectPreviewRequest type/method name substring; no assistant reviewRequest invocation. |
| `backend/src/rd-radar.controller.ts` | 80 | `reviewRequest` | UNRELATED | CollectPreviewRequest type/method name substring; no assistant reviewRequest invocation. |
| `backend/src/rd-radar.dto.ts` | 220 | `reviewRequest` | UNRELATED | CollectPreviewRequest type/method name substring; no assistant reviewRequest invocation. |
| `backend/src/rd-radar.service.ts` | 5 | `reviewRequest` | UNRELATED | CollectPreviewRequest type/method name substring; no assistant reviewRequest invocation. |
| `backend/src/rd-radar.service.ts` | 243 | `reviewRequest` | UNRELATED | CollectPreviewRequest type/method name substring; no assistant reviewRequest invocation. |
| `backend/src/repository-source/repository-content.service.ts` | 120 | `2000` | UNRELATED | Git symlink mode 120000; substring match unrelated to character limits. |
| `backend/src/repository-source/repository-content.service.ts` | 129 | `2000` | UNRELATED | Git symlink mode 120000; substring match unrelated to character limits. |
| `backend/storage/attachments/att_1789912021446_6eaum0ac` | 10 | `2000` | UNRELATED | Stored attachment data; not executable policy or model configuration. Content omitted. |
| `backend/storage/attachments/att_1789912051412_c9nu37q6` | 10 | `2000` | UNRELATED | Stored attachment data; not executable policy or model configuration. Content omitted. |
| `backend/storage/attachments/att_1789981036697_xeugq423` | 10 | `2000` | UNRELATED | Stored attachment data; not executable policy or model configuration. Content omitted. |
| `backend/storage/attachments/att_1789990457528_itxnciey` | 10 | `2000` | UNRELATED | Stored attachment data; not executable policy or model configuration. Content omitted. |
| `backend/storage/attachments/att_1789992396849_w9pj3sr4` | 10 | `2000` | UNRELATED | Stored attachment data; not executable policy or model configuration. Content omitted. |
| `backend/test/agent-runtime.events.observable.test.ts` | 80 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/agent-runtime.events.observable.test.ts` | 160 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/agent-runtime.events.observable.test.ts` | 250 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/agent-runtime.test.ts` | 1037 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 18 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 32 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 47 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 52 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 60 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 68 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 76 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 87 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 100 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-policy.service.test.ts` | 114 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 14 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 32 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 41 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 82 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 106 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 119 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 144 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 161 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 178 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 196 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 213 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 224 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 239 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 271 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 298 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 330 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 353 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 393 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 422 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 483 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-preview.test.ts` | 521 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/ai-gateway-provider-settings.test.ts` | 14 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 12 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 31 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 58 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 73 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 85 | `ASSISTANT_CONTEXT_BUDGET` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 86 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 87 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 99 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 100 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 122 | `ASSISTANT_CONTEXT_BUDGET` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 123 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 151 | `2_000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 154 | `2_000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 159 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/assistant-context-budget.test.ts` | 219 | `contextBudget` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/attachment.service.test.ts` | 101 | `2_000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/helpers/assistant-context-harness.ts` | 10 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/helpers/assistant-context-harness.ts` | 14 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/helpers/assistant-context-harness.ts` | 15 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/helpers/assistant-context-harness.ts` | 27 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/helpers/assistant-context-harness.ts` | 45 | `2_000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/identity-auth-foundation.test.ts` | 169 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 5 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 20 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 24 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 31 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 47 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 49 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/mock-ai-gateway-provider.adapter.test.ts` | 50 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 7 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 11 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 23 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 25 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 41 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 43 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 49 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 58 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 72 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 88 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 99 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/openai-dry-run-provider.adapter.test.ts` | 110 | `reviewRequest` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/rd-radar-analysis.service.test.ts` | 118 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/rd-radar-analysis.service.test.ts` | 146 | `contextWindow` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/repository-content.service.test.ts` | 28 | `2000` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 92 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 121 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 133 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 154 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 164 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 166 | `JSON_OBJECT_ONLY` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 276 | `2048` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `backend/test/vllm-openai-compatible.adapter.test.ts` | 280 | `2048` | TEST-ONLY | Test fixture, assertion or test helper; no production setting or provider call. |
| `components/chat/chat-message-item.tsx` | 15 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `components/chat/code-block.tsx` | 20 | `2000` | UNRELATED | Clipboard success-indicator timeout in milliseconds. |
| `components/chat/code-block.tsx` | 33 | `2000` | UNRELATED | Clipboard success-indicator timeout in milliseconds. |
| `components/chat/empty-state-console.tsx` | 12 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `components/chat/thinking-indicator.tsx` | 11 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `components/rd-radar-live-analysis-panel.tsx` | 130 | `2000` | LEGACY | Separate R&D analysis-purpose input limit; protected engine outside live assistant G01/G02. |
| `components/runtime-configuration-panel.tsx` | 15 | `JSON_OBJECT_ONLY` | KEEP | Explicit operator-selectable dialect contract; no automatic JSON-object fallback. |
| `components/runtime-configuration-panel.tsx` | 20 | `contextWindow` | KEEP | Operator-configured model context field; persisted configuration unchanged. |
| `components/runtime-configuration-panel.tsx` | 101 | `contextWindow` | KEEP | Operator-configured model context field; persisted configuration unchanged. |
| `components/runtime-configuration-panel.tsx` | 160 | `JSON_OBJECT_ONLY` | KEEP | Explicit operator-selectable dialect contract; no automatic JSON-object fallback. |
| `components/runtime-configuration-panel.tsx` | 170 | `contextWindow` | KEEP | Operator-configured model context field; persisted configuration unchanged. |
| `components/runtime-configuration-panel.tsx` | 171 | `2048` | KEEP | New-model form default only; does not clamp requests or overwrite the persisted 512-token model setting. |
| `components/runtime-configuration-panel.tsx` | 175 | `contextWindow` | KEEP | Operator-configured model context field; persisted configuration unchanged. |
| `components/workspace/cinematic-intro.tsx` | 23 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `components/workspace/workspace-header.tsx` | 23 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `components/workspace/workspace-sidebar.tsx` | 38 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `docs/architecture/agent-context-gateway-contract.md` | 27 | `2_000` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 28 | `knowledge_summary_preview`, `reviewRequest` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 38 | `reviewRequest` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 83 | `ASSISTANT_CONTEXT_BUDGET` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 85 | `contextBudget` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 87 | `contextBudget` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 123 | `contextWindow` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 164 | `JSON_OBJECT_ONLY` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/architecture/agent-context-gateway-contract.md` | 172 | `JSON_OBJECT_ONLY` | KEEP | G01/G02 report reference; historical failing-contract wording is superseded in the final-gate report. |
| `docs/product/issue-1960-ai-gateway-controlled-architecture.md` | 135 | `knowledge_summary_preview` | LEGACY | Historical architecture/product documentation; not a live execution gate. |
| `public/icon.svg` | 1 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `public/placeholder-logo.svg` | 1 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `public/placeholder.svg` | 1 | `2000` | UNRELATED | SVG namespace contains the year 2000; no input/output limit. |
| `scratch/live-verification-3prompts.mjs` | 90 | `2000` | TEST-ONLY | Manual diagnostic script, unchanged and not executed by this task. |
| `scratch/test-exact-body.mjs` | 52 | `2048` | TEST-ONLY | Manual diagnostic script, unchanged and not executed by this task. |
| `scratch/test-stream.mjs` | 62 | `2000` | TEST-ONLY | Manual diagnostic script, unchanged and not executed by this task. |
| `SEKHEM_BACKEND_MASTER_MAP.md` | 526 | `JSON_OBJECT_ONLY` | LEGACY | Historical architecture/product documentation; not a live execution gate. |
| `SEKHEM_DATABASE_RECONCILIATION.md` | 90 | `contextWindow` | LEGACY | Historical architecture/product documentation; not a live execution gate. |
| `sekhem-product-application-main/backend/dist/agent-runtime/agent-runtime.service.js` | 804 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway-policy.service.js` | 13 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway-policy.service.js` | 56 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.controller.js` | 39 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.controller.js` | 41 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.controller.js` | 127 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 41 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 90 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 91 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 93 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 144 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 167 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 169 | `knowledge_summary_preview`, `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 189 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 224 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 283 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 288 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 310 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/ai-gateway.service.js` | 368 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/providers/vllm-openai-compatible.adapter.js` | 323 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 37 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 39 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 215 | `2000`, `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 238 | `2000`, `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 268 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 271 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 298 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 301 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 459 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/ai-gateway/runtime-configuration.service.js` | 463 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/attachment/attachment.service.js` | 179 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/attachment/pdf-parser.service.js` | 47 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/file-intelligence/file-intelligence.limits.js` | 15 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/file-intelligence/security/file-intelligence-security.service.js` | 57 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/rag/rag.service.js` | 25 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/rag/rag.service.js` | 60 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/rd-radar-analysis.service.js` | 321 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/repository-source/repository-content.service.js` | 138 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/dist/repository-source/repository-content.service.js` | 149 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/prisma/migrations/20260815190000_add_rd_radar_v1_local_llm/migration.sql` | 22 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/prisma/migrations/20260917120000_add_conversation_attachment/migration.sql` | 2 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/prisma/schema.prisma` | 822 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/scripts/debug-conv.ts` | 65 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/scripts/debug-conv.ts` | 68 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.service.ts` | 948 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway-policy.dto.ts` | 3 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway-policy.service.ts` | 6 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway-policy.service.ts` | 52 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.controller.ts` | 23 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.controller.ts` | 24 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.dto.ts` | 1 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.dto.ts` | 3 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.dto.ts` | 10 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.dto.ts` | 11 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.dto.ts` | 21 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 7 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 8 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 25 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 27 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 86 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 87 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 88 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 139 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 162 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 163 | `knowledge_summary_preview`, `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 218 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 298 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 302 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 326 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 398 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/ai-gateway.service.ts` | 404 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 1 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 8 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 9 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/ai-gateway-provider.adapter.ts` | 36 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/mock-ai-gateway-provider.adapter.ts` | 4 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/mock-ai-gateway-provider.adapter.ts` | 10 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/openai/openai-dry-run-provider.adapter.ts` | 4 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/openai/openai-dry-run-provider.adapter.ts` | 30 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 3 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 8 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/openai/openai-text-preview.transport.ts` | 23 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/providers/vllm-openai-compatible.adapter.ts` | 355 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/rd-radar-output.schema.ts` | 7 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.dto.ts` | 3 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.dto.ts` | 29 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 32 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 198 | `2_000`, `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 220 | `2_000`, `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 248 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 279 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 371 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 466 | `2_048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/ai-gateway/runtime-configuration.service.ts` | 471 | `2_048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/attachment/attachment.service.ts` | 204 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/attachment/pdf-parser.service.ts` | 18 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/file-intelligence/file-intelligence.limits.ts` | 14 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/file-intelligence/security/file-intelligence-security.service.ts` | 57 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rag/rag.dto.ts` | 29 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rag/rag.service.ts` | 3 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rag/rag.service.ts` | 20 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rag/rag.service.ts` | 59 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar-analysis.service.ts` | 294 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar.controller.ts` | 7 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar.controller.ts` | 80 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar.dto.ts` | 220 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar.service.ts` | 5 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/rd-radar.service.ts` | 243 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/repository-source/repository-content.service.ts` | 120 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/src/repository-source/repository-content.service.ts` | 129 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/agent-runtime.events.observable.test.ts` | 80 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/agent-runtime.events.observable.test.ts` | 160 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/agent-runtime.events.observable.test.ts` | 250 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 18 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 32 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 47 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 52 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 60 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 68 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 76 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 87 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 100 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-policy.service.test.ts` | 114 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 14 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 32 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 41 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 82 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 106 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 119 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 144 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 161 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 178 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 196 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 213 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 224 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 239 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 483 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-preview.test.ts` | 521 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/ai-gateway-provider-settings.test.ts` | 14 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/attachment.service.test.ts` | 101 | `2_000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/identity-auth-foundation.test.ts` | 169 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 5 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 20 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 24 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 31 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 47 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 49 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/mock-ai-gateway-provider.adapter.test.ts` | 50 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 7 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 11 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 23 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 25 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 41 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 43 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 49 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 58 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 72 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 88 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 99 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/openai-dry-run-provider.adapter.test.ts` | 110 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/rd-radar-analysis.service.test.ts` | 118 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/rd-radar-analysis.service.test.ts` | 146 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/repository-content.service.test.ts` | 28 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/vllm-openai-compatible.adapter.test.ts` | 69 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/vllm-openai-compatible.adapter.test.ts` | 190 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/backend/test/vllm-openai-compatible.adapter.test.ts` | 194 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/chat/chat-message-item.tsx` | 15 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/chat/code-block.tsx` | 20 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/chat/code-block.tsx` | 33 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/chat/empty-state-console.tsx` | 12 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/chat/thinking-indicator.tsx` | 11 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/rd-radar-live-analysis-panel.tsx` | 130 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 15 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 20 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 101 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 160 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 170 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 171 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/runtime-configuration-panel.tsx` | 175 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/workspace/cinematic-intro.tsx` | 23 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/workspace/workspace-header.tsx` | 23 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/components/workspace/workspace-sidebar.tsx` | 38 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/docs/product/issue-1960-ai-gateway-controlled-architecture.md` | 135 | `knowledge_summary_preview` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/public/icon.svg` | 1 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/public/placeholder-logo.svg` | 1 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/public/placeholder.svg` | 1 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/scratch/live-verification-3prompts.mjs` | 90 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/scratch/test-exact-body.mjs` | 52 | `2048` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/scratch/test-stream.mjs` | 62 | `2000` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/SEKHEM_BACKEND_MASTER_MAP.md` | 526 | `JSON_OBJECT_ONLY` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/SEKHEM_DATABASE_RECONCILIATION.md` | 90 | `contextWindow` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/tsc_full_output.txt` | 25 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/tsc_full_output.txt` | 26 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/typecheck_output.txt` | 70 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `sekhem-product-application-main/typecheck_output.txt` | 71 | `reviewRequest` | LEGACY | Older nested project snapshot; comparison evidence, not the root source tested in this pass. |
| `tsc_full_output.txt` | 25 | `reviewRequest` | UNRELATED | Pre-existing compiler diagnostic log; PreviewRequest name contains reviewRequest as a substring. |
| `tsc_full_output.txt` | 26 | `reviewRequest` | UNRELATED | Pre-existing compiler diagnostic log; PreviewRequest name contains reviewRequest as a substring. |
| `typecheck_output.txt` | 70 | `reviewRequest` | UNRELATED | Pre-existing compiler diagnostic log; PreviewRequest name contains reviewRequest as a substring. |
| `typecheck_output.txt` | 71 | `reviewRequest` | UNRELATED | Pre-existing compiler diagnostic log; PreviewRequest name contains reviewRequest as a substring. |

