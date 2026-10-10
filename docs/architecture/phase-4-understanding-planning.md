# Phase 4 — Understanding and Planning implementation report

Verified: 2026-09-21. Phase 4 is implemented and verified under mocked transport and persistence. **302/302 related tests pass; backend typecheck passes. No Phase 5 or execution capability was added.**

## 1. Architecture before Phase 4

The audit preceded implementation and traced the existing route:

```text
ConversationService.postMessage
  → explicit chat/trigger flags or ExecutionModeDetector
  → AgentRuntime.executeChat OR createRunTx / executeRun
  → AgentUnderstandingService.understand (deterministic intent/context requirements)
  → EvidenceCollector through AgentContextBuilder (authorized bounded reads)
  → AgentContextSerializer (untrusted evidence framing and truncation)
  → AiGatewayService (selected provider/dialect and centralized budget)
```

Existing understanding was an AgentContext containing intent, operation class, selected read capabilities, missing-context codes, evidence, verification state and small preparatory context steps. It did not separate factual support, interpretations and hypotheses or validate a grounded cognitive plan.

The durable runtime also stored a one-skill initial execution plan in AgentPlan.steps, executed registered read-only skills, persisted returned AgentArtifacts, and generated a grounded final answer when evidence existed. The creation transaction, authorization checks, pause/cancel/approval guards, recovery, steering, events and audit mechanisms already existed.

Prisma already provides AgentRun state, AgentPlan.steps JSON/status, AgentRunEvent.payload JSON, AgentArtifact content/metadata and audit records. None requires a schema change for the new result.

## 2. Contracts reused

| Existing contract | Phase 4 use |
| --- | --- |
| AgentUnderstandingService | Extended with the single authoritative createPlan path; no second UnderstandingService or PlanService |
| AgentContext / AgentEvidence / evidenceIdentity | Same selected sources, provenance and trust boundaries; no new collector, reader or evidence database |
| AgentUnderstandingPlanStep | Extended by AgentPlannedStep with typed action, purpose, evidence, scope, risk and verification |
| Six-step and five-evidence limits | Reused for planning collections and references |
| AgentContextSerializer / builder | Optional transient map of exactly the text emitted for each collected evidence identity |
| AiGatewayService / ProviderAdapterRegistry / existing adapter | One internal structured-reasoning method using existing resolution, dialects and complete transport |
| prepareAssistantContext | Same model window, output reservation, headroom and input estimator; no duplicate budget formula |
| AgentPlan.steps JSON | Stores the planning result on a server-created planning work item |
| Existing AgentRun/event/audit lifecycle | Reused; only PLAN_VALIDATED was added to the event union |

The pre-collection AgentContext.plan remains a compatibility contract for context preparation, including its existing lightweight conversational hint. It is not the new grounded AgentPlan and is never dispatched as a Phase 4 plan. Legacy persisted skill plans remain executable only through their existing runtime path. Phase 4 generation occurs only in AgentUnderstandingService.createPlan.

## 3. Structured Understanding

AgentPlanningResult has separate understanding and plan fields. AgentUnderstanding includes:

- Existing classified intent and the original objective, without an invented paraphrase.
- Descriptive project/evidence scope derived from trusted context identifiers and collected source records.
- Constraints labeled USER, RUNTIME or INFERRED, with exact request quotes for user constraints.
- Expected outcome and explicit success criteria with source labels.
- Distinct facts, inferences and hypotheses.
- Actionable unknowns, evidence references and evidence gaps.
- Qualitative confidence and deterministic understanding readiness.

The model cannot replace objective, scope, constraints, success criteria, readiness or authorization. Those fields are server-owned. The model proposes excerpts, interpretations, hypotheses, missing information and bounded step structure.

No content moderation or preview-policy review is introduced. Planning validation concerns provenance, structure, requested effects and readiness.

## 4. Structured Planning

AgentPlan contains objective, unverified assumptions, constraints, steps, missing information, stop conditions, success criteria, readiness, an explicit authorization: NOT_GRANTED value and validation diagnostics.

AgentPlannedStep extends the existing preparatory-step contract. It adds INSPECT / ANALYZE / PROPOSE / IMPLEMENT / VERIFY, purpose, required evidence, missing-information IDs, scope references, effect, qualitative risk and planned verification criterion references.

Action/purpose values use a controlled vocabulary. Descriptions are produced from those values; arbitrary model-authored commands or claims of completed work cannot hide inside an action description. No skill ID is generated for a proposed step, and its input object is empty.

A valid IMPLEMENT step may describe future WRITE work with verification criteria, but remains PLANNED. Invalid or unresolved plans have BLOCKED steps. Neither status grants execution permission.

## 5. Fact / inference / hypothesis separation

A fact has kind SOURCE_EXCERPT, an existing evidence reference, exact text and start/end offsets into the visible serialized evidence body. Validation confirms that the source was collected and the exact excerpt was actually supplied to the model.

This is deliberately a statement about observed source text, not proof that a comment, document assertion or quoted instruction is true. Model-authored semantic paraphrases are not accepted as facts merely because a citation exists.

Inferences must reference validated fact IDs and carry explicit uncertainty. Hypotheses remain separate and uncertain; any evidence references must exist. Unsupported facts and dependent inferences are rejected, not silently promoted or rewritten into facts.

Denied sources, dropped frames and text beyond the serializer's truncation boundary cannot support a fact. Existing evidence identities and provenance are preserved.

## 6. Missing information

Each requirement has an ID, state, description, whyNeeded and severity. The state contract distinguishes KNOWN, UNKNOWN and NOT_APPLICABLE; unresolved requirements produced in this phase are explicitly UNKNOWN. Collected source support is separately represented by validated facts/references.

Preflight checks identify missing project scope, unavailable source or attachment evidence, missing requested repository binding/revision evidence, unresolved constraint interpretation and absent implementation acceptance criteria. Local workspace evidence is not substituted for a specifically requested repository.

For change/execution requests, explicit acceptance text is recognized through Acceptance:, Success criteria:, Success: or Expected outcome:. Without it, the result requests observable success/verification criteria instead of inventing a definition of “fixed.” Read/inspection planning retains the runtime grounding criterion.

Model-supplied unknowns are bounded and actionable. Unknown dependency information is reported as a missing prerequisite. No automatic evidence-regathering or clarification loop was implemented.

## 7. Deterministic validation rules

The provider schema and runtime schema validator share one definition. Extra fields are rejected, including attempted authorization, executable commands and execution-status claims.

| Rule | Enforcement |
| --- | --- |
| Objective exists | Empty objectives fail validation |
| Required steps exist | An empty proposed plan is not ready |
| Grounding | Each step references available evidence or an explicitly identified information gap |
| Factual support | Exact visible excerpts only; valid fact/evidence IDs |
| Scope | References must exist in the understanding and cover the step's evidence |
| No executed-work claims | Status is generated by the server; unsupported status/command properties fail schema validation |
| Dependencies | Existing step IDs only; duplicate edges, unknown dependencies, self cycles and multi-step cycles rejected |
| Ordering | Stable topological ordering for valid dependency graphs |
| Constraints | All authoritative constraint IDs must be acknowledged; typed effect violations and unresolved/inferred constraints prevent readiness |
| Success criteria | Criteria required; references must exist; implementation must reference the requested outcome |
| Missing information | Required gaps retained; nonexistent missing-information IDs rejected |
| Bounds | Collection, string, response, nesting and diagnostic limits enforced |
| Authorization | Fixed NOT_GRANTED; model cannot supply permission |
| Destructive behavior | Explicit destructive effects are not made ready; inconsistent effects/purposes rejected |
| Implementation verification | Required acceptance criterion and planned verification; implementation outside the request is rejected |

Recognized English constraint markers are interpreted conservatively. Simple prohibitions such as “Do not modify files”, “Do not run commands” and “Do not delete files” receive typed rules. Clauses whose meaning cannot be resolved deterministically, such as “preserve authorization behavior,” produce NEEDS_CLARIFICATION. Evidence cannot add or override constraints.

## 8. Readiness and confidence

```text
Trusted context + selected visible evidence
  → deterministic preflight understanding
  → one configured structured-reasoning request, when prerequisites exist
  → strict JSON/schema validation
  → provenance/scope/constraint/dependency validation
  → PLAN_READY or PLAN_NOT_READY
```

Missing target scope produces INSUFFICIENT_CONTEXT; missing evidence produces NEEDS_EVIDENCE; unresolved requirements produce NEEDS_CLARIFICATION. Malformed/unavailable reasoning produces a structured insufficient-context result with safe diagnostics. Valid grounded understanding can coexist with PLAN_NOT_READY when the proposed dependency graph or steps are invalid.

Confidence is not a probability or an execution score:

- LOW: validation problems or unresolved understanding.
- MEDIUM: explicit interpretations/hypotheses, incomplete evidence-reference coverage, or truncated evidence.
- HIGH: complete referenced excerpt coverage with no open requirements, inference/hypothesis uncertainty or truncation detected by this path.

Even HIGH plus PLAN_READY leaves authorization NOT_GRANTED.

## 9. AgentRuntime integration

New engineering runs, when the existing understanding dependency is present, create one planningOnly work item with an empty skillId in the existing AgentPlan row. The existing production module already provides this dependency; no module or registry change was needed.

After existing context collection and serialization, executeRun calls createPlan, stores the result, reports readiness and completes the planning job. The skill loop and ordinary grounded-answer call are skipped for that work item. Mixed planning/executable work items are rejected.

The complete persisted instruction is used during recovery, not a shortened run title. Completed runs remain idempotent. Existing pause/cancel/approval checks remain; the runtime checks again after model reasoning before storing/reporting the result.

AgentRun COMPLETED means the planning job finished, including when the resulting plan is PLAN_NOT_READY. It does not mean the proposed work was performed. Inner steps remain PLANNED or BLOCKED, and the assistant message states that no plan step was executed.

Casual CHAT and legacy durable skill plans retain their existing paths. ExecutionModeDetector, conversation routing and frontend were not changed.

## 10. Events and audit

Reused UNDERSTANDING_STARTED, CONTEXT_RESOLVED, EVIDENCE_COLLECTED, UNDERSTANDING_COMPLETED and PLAN_CREATED. The preliminary PLAN_CREATED event is suppressed for new planning jobs so the final plan produces one such event.

Added PLAN_VALIDATED and the existing audit service action AGENT_PLAN_VALIDATE. Payloads contain phase, readiness, confidence, counts, fixed authorization and bounded validation codes/paths. They contain no model excerpts, request body, raw response, provider URL or credentials. Existing evidence-event provenance metadata remains unchanged.

## 11. Persistence

No new persistence system, model, table, migration or seed.

The result is stored as:

```text
AgentPlan.steps[0]
  planningOnly: true
  skillId: ""
  parameters.planning
    version: 1
    understanding: AgentUnderstanding
    plan: AgentPlan
```

AgentPlan.status records PLAN_READY or PLAN_NOT_READY. Existing authorized run-detail APIs can return the data through the existing parameters field. No new endpoint or frontend change was needed.

The stored understanding contains references and short validated excerpts, not full evidence bodies or chain-of-thought. Inferences/hypotheses are bounded declarative summaries. Events/audit remain metadata-only. Existing AgentArtifact persistence was inspected and left unchanged because another copy of the plan/evidence was unnecessary.

Application bookkeeping uses the existing planning/event/message records; no capability to mutate repository files, infrastructure or arbitrary database records is introduced. **No production database operation was performed during this implementation.** Tests use in-memory mocks.

## 12. Exact modified files

Seven existing production files:

1. `backend/src/agent-runtime/understanding/agent-understanding.types.ts` — structured Understanding/Plan contracts extending existing step types.
2. `backend/src/agent-runtime/understanding/agent-understanding.service.ts` — authoritative generation/validation orchestration.
3. `backend/src/agent-runtime/understanding/agent-context-builder.service.ts` — forwards the optional visible-evidence map.
4. `backend/src/agent-runtime/understanding/agent-context-serializer.service.ts` — records exactly emitted collected evidence text; prompt output and limits preserved.
5. `backend/src/agent-runtime/agent-run.dto.ts` — planningOnly marker and PLAN_VALIDATED event type.
6. `backend/src/agent-runtime/agent-runtime.service.ts` — planning work-item integration, persistence and reporting; legacy loop retained.
7. `backend/src/ai-gateway/ai-gateway.service.ts` — internal structured reasoning using the existing provider/dialect/budget.

Four additions:

8. `backend/src/agent-runtime/understanding/agent-planning.contract.ts` — bounded proposal schema, interpretation and deterministic validation.
9. `backend/test/agent-planning.test.ts` — 24 Phase 4 tests.
10. `docs/architecture/phase-4-understanding-planning.md` — this report.
11. `docs/architecture/phase-4-understanding-planning.diff` — reviewed source/test diff against the captured baseline.

Temporary audit files were removed. No existing test file was modified.

## 13. Tests added

The new test file covers the complete requested matrix:

| User case | Verification |
| --- | --- |
| A — Casual CHAT | Hi and conversational project mentions produce no Phase 4 plan or model request |
| B — Engineering request | Grounded understanding and bounded proposed plan |
| C — Missing evidence | Actionable not-ready state, no fabricated file claims or model call |
| D — Grounding | Existing provenance, exact excerpt offsets, hypothesis distinction |
| E — Unsupported claim | Rejected fact and unsupported dependent inference |
| F/G — Dependencies | Missing, self and cyclic dependencies rejected |
| H — Constraint violation | Contradictory effect rejected; ambiguous constraint stops readiness |
| I — Success criteria | Missing acceptance criteria explicit; criteria removal rejected |
| J — Implementation | PLANNED, empty executable input, required verification; runtime dispatch count zero |
| K — Determinism | Repeated interpretation, serialization and validation identical |
| L — Bounds/malformed output | Text, depth, collections, malformed JSON, prose/fences and schema bypass rejected |
| M — Evidence injection | Cannot alter runtime constraints, scope or authorization |
| N — Existing AgentRun | Existing durable runtime regressions pass unchanged, including mocked real-adapter completion |

Additional tests cover repository/workspace distinction, invalid scope, unseen/denied evidence, duplicate IDs, unknowns, destructive effects, purpose/status smuggling, safe errors, all four configured dialects, missing dialect, truncated output, context limits, persisted full-instruction recovery and completed-run idempotency.

## 14. Existing tests and commands

All commands ran from backend with existing dependencies.

```powershell
$relatedTests = @(
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
  'test/conversation.integration.test.ts'
)
pnpm exec tsx --test --test-concurrency=1 @relatedTests
pnpm exec tsc -p tsconfig.json --noEmit
```

Test processes used an unreachable loopback DATABASE_URL, memory runtime/data-source settings and disabled auth DB mode. Provider HTTP transport and persistence were mocked. Existing pnpm dependency refresh was disabled with process-local pnpm_config_verify_deps_before_run=false; installed backend/node_modules/.bin was used. Windows tsx required approved execution outside the sandbox. No dependency or environment file changed.

## 15. Results

| Verification | Result |
| --- | --- |
| Initial Phase 4 focused iteration | 20/20 passed |
| Focused Phase 4 + existing Phase 2/3 iteration | 64/64 passed before the final repository-binding regression was added |
| Final Phase 4 tests, included in final combined run | 24/24 passed |
| Final unchanged prior related tests | 278/278 passed |
| Final combined regression, 25 files / 36 suites | **302/302 passed; 0 failures, cancellations, skips or todos; exit 0** |

The final run followed the schema-prompt, blocked-status and repository-binding audit fixes. Existing tests were neither changed nor weakened. This is the relevant suite selection, not a claim that every unrelated repository test was run.

## 16. Typecheck

`pnpm exec tsc -p tsconfig.json --noEmit` passed with exit 0 after the final source edits. The first development check caught three type errors, which were corrected before verification; no typecheck errors remain.

No production build was requested in this phase. Generated dist remains unchanged from the accepted G01/G02 production build and does not yet contain Phase 4. A normal production build is required before deploying these source changes.

## 17. Source diff and protected-system audit

The workspace has no Git history. Before implementation, SHA-256 hashes were captured for 1,830 workspace files, excluding dependency/cache/Git directories. Exact pre-edit contents of the seven changed existing files were retained in memory, reconstructed for comparison and verified against those hashes.

Final comparison: **7 existing files changed, 1,823 unchanged, none missing**, plus the four listed additions. The [actual reviewed diff](phase-4-understanding-planning.diff) includes all nine production/test files. Only CR differences at line ends were ignored; no whole-file formatting normalization or unrelated refactor was introduced.

Review confirmed:

- Existing evidence ordering, selection, provenance, authorization and text framing are preserved.
- One Phase 4 generation path; no duplicate collector, model registry, persistence system, runtime state machine or budget formula.
- No preview policy call, old 2k live gate, 2048 output floor, silent model substitution or fallback plan was introduced.
- Provider schema instructions are present for every dialect, including JSON_OBJECT_ONLY, whose transport does not include a schema.
- Plan readiness cannot dispatch a tool or select a write/execute capability.
- Existing approval/authorization guards and legacy durable execution remain unchanged.

Hash verification covers unchanged packages/locks, env files, Prisma/schema/migrations/seed, authentication/session, authorization/ownership, provider configuration/credentials, provider registry/adapter, ExecutionModeDetector, EvidenceCollector, file readers/workspace security, frontend, R&D/Initiative engines, execution-plane capabilities and generated dist. No live provider call, database write, migration or seed was run.

## 18. Deferred findings and practical limits

- Facts certify exact source excerpts, not semantic truth. General semantic entailment of free-form claims is intentionally not asserted; interpretations remain uncertain.
- Constraint parsing is conservative and currently targets documented English forms. Recognized but unresolved clauses block readiness. General multilingual/natural-language constraint coverage is not certified.
- Change/execution acceptance criteria require explicit labeled request text; absent criteria yield missing information. More flexible criteria extraction can be extended later without relaxing validation.
- The persisted provider's 512-token setting is unchanged. A response that cannot finish within its configured reservation fails explicitly; no hidden output-budget increase or retry is performed. All four dialects were tested with mocked transport, not certified against live endpoints.
- Existing repository binding/workspace availability limits remain. Missing requested repository evidence now stays explicit instead of borrowing unrelated local evidence.
- Legacy pre-Phase-4 skill plans are retained for compatibility. They are not interpreted as newly validated Phase 4 plans.
- Phase 4 source has not been built/deployed into dist in this task.
- Earlier storage, upload/parser, OCR/image intelligence, session, Initiative persistence and transport/output findings remain outside this phase.

## 19. No execution capability added

Phase 4 does not dispatch proposed steps, run shell commands, write/delete repository files, install packages, mutate Git, execute migrations or modify infrastructure/provider configuration. Existing execution-plane code was not changed or invoked. Readiness, confidence and descriptive scope remain separate from permission.

Only the already existing evidence-read path, model reasoning and authorized planning bookkeeping are used by the new application path. During verification those external interactions were mocked.

## 20. No Phase 5

No decision loop, autonomous retry/replanning cycle, tool scheduler, implementation dispatcher, verification executor or learning-persistence loop was implemented. The planning attempt reports its result and stops. Existing durable restart recovery is preserved; it is not a new agentic decision loop.

## 21. Definition of Done

- [x] Existing understanding architecture audited before implementation.
- [x] Structured evidence-grounded Understanding.
- [x] Objective, scope, constraints and success criteria represented.
- [x] FACT / INFERENCE / HYPOTHESIS separated.
- [x] Actionable unknowns and missing information.
- [x] Existing evidence provenance preserved.
- [x] Deterministic understanding readiness.
- [x] Structured AgentPlan.
- [x] Bounded, dependency-aware steps.
- [x] Deterministic schema and plan validation.
- [x] Typed constraint violations rejected; unresolved recognized constraints block readiness.
- [x] Invalid and cyclic dependencies rejected.
- [x] Unsupported factual claims rejected.
- [x] Readiness distinct from authorization.
- [x] No execution/write capability added.
- [x] Existing CHAT routing unchanged.
- [x] Existing durable runtime remains functional.
- [x] Existing Phase 2/3 tests pass.
- [x] New Phase 4 tests pass.
- [x] Backend typecheck passes.
- [x] Actual source diff audited; no unrelated changes.
- [x] No Prisma/schema/migration changes.
- [x] No provider configuration changes.
- [x] No authentication changes.
- [x] No censorship/moderation introduced.
- [x] No Phase 5 implementation.

Phase 4 source verification is complete within the documented structured proposal contract and limitations. Work stops here.

