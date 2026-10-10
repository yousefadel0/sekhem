# Core Agent upgrade — pre-edit audit and phased plan

## Protected baseline

The current product is extended in place. Node remains 24.21.0. No provider,
authentication, Prisma, Runtime cryptography, or workspace binding redesign is
part of this change. The known provider output limitation remains out of scope.

## What already works

- `ConversationService.postMessage` creates the originating message and AgentRun
  transactionally in the same conversation, with idempotent client message IDs.
- `AgentRuntimeService` delegates workspace-bound work to the durable
  `AgentInspectionService`. Missing bindings cannot fall back to backend files.
- `AgentInspectionService` persists model leases, exact operation proposals,
  approvals, Runtime observations, immutable evidence references and failures.
- `RuntimeControlService`, `ToolAuthorizationService` and `ToolApprovalService`
  enforce actor/project authority, exact plan/input fingerprints, read consent,
  approval, active identity, binding versions and revalidation at dispatch/start.
- `RuntimeExecutionService` uses signed permits/receipts and lifecycle fencing.
  Uncertain operations are not replayed. Cancellation rejects late model work.
- `WorkspaceRuntimeEvidenceService` and `EvidenceCollectorService` validate the
  actual receipt and attribution before content enters the bounded model context.
- Existing planning validation checks exact visible excerpts, inference references,
  constraints, dependency ordering, scope, effects and verification criteria.
- Chat already hosts AgentRun cards and final inspection messages. Explorer and
  optional inspection details remain supporting views.

## Missing pieces

1. Understanding reports are forced through the implementation planning contract.
   A report needs `PLAN_READY`, even when useful findings include explicit unknowns.
2. A list/search receipt can supply a valid quote without any actual source read.
   Receipt verification does not itself prove project understanding.
3. Intermediate model findings are not persisted separately from exact tool plans.
4. Inspection bounds are four operations by default and at most five evidence
   items. Large-project coverage is therefore incomplete; bounds must not be
   silently raised or incomplete coverage presented as comprehensive analysis.
5. Existing planning steps are controlled descriptions with empty tool inputs;
   they are not executable implementation plans with reviewed changes.
6. Conversation routing does not resolve “Execute the plan” to a preceding exact
   plan/version. Standalone Runtime actions are separate from the Agent loop.
7. The inspection loop deliberately admits only list/read/search. Runtime already
   supports other tools, but that is not a multi-step workspace-bound work loop.
8. Change reviews, durable plan-level decisions, real diffs, post-change
   verification and a grounded implementation report are not yet integrated.

## Minimal delivery plan

| Phase | Existing extension points | Gate |
| --- | --- | --- |
| 1 Understand | `backend/src/agent-runtime/inspection/{agent-inspection.service,inspection.contract,inspection.types}.ts`; shared `understanding/agent-planning.contract.ts`; `components/chat/agent-run-card.tsx`; `components/workspace/agent-inspection-card.tsx`; `lib/sekhem-agent.ts` | Distinct understanding contract, source-read requirement, bounded checkpoints, truthful partial output, same Chat |
| 2 Plan | Existing inspection service and planning contract/types, `components/chat/agent-run-card.tsx` | Evidence-grounded versioned implementation plan; no execution authority |
| 3 Plan → execution | `backend/src/conversation/conversation.service.ts`, `backend/src/agent-runtime/agent-runtime.service.ts`, inspection service | Resolve an explicit preceding plan/version in the same actor/project/conversation/workspace; ambiguity stops work |
| 4 Work | Inspection orchestration, `backend/src/trusted-runtime/runtime-control.service.ts`, existing Runtime plan/tool contracts | Exact approved actions through existing permits, binding revalidation, cancellation and no replay |
| 5 Diffs/progress | Existing Runtime observations/artifacts, Chat cards and inspection details | Reviewable changes derived from observed before/after content; persisted progress |
| 6 Critical approvals | Existing `ToolApprovalService`, Runtime control and Chat approval presentation | Separate explicit approval for destructive/critical work; no authority from a plan or read grant |
| 7 Verification | Existing inspection/evidence orchestration and Runtime receipts | Real checks against the approved expected result; incomplete checks cannot pass |
| 8 Final report | Existing same-conversation result publishing and Chat | Truthful completed/failed/uncertain work, actual changes and verification |
| 9 Windows acceptance | Rebuilt application, installed Runtime, normal authenticated UI | Real folder, analysis, plan decision, approved changes, verification and continuation |

These are extension points, not authorization to skip a phase gate. Later file
changes require inspection of the exact contracts before editing.

## Phase 1 boundaries and regression risks

- Keep the existing per-run operation/evidence bounds. Intermediate findings are
  a bounded checkpoint, not a growing transcript or a new source of evidence.
- Revalidate every model fact against the current visible source excerpts.
  Prior findings and conversation history do not authorize actions or prove facts.
- Keep legacy planning validation strict and compatible with existing runs.
- Preserve full versus truncated reads, unknowns and incomplete coverage.
- No work capabilities are added to the inspection allowlist in Phase 1.
- Test same-conversation reporting, source versus listing evidence, forged quotes,
  forged references, partial output, cancellation, restart, duplicate dispatch,
  revocation, binding changes and provider truncation.

Pre-edit focused baseline: 53 tests passed, zero failures. Tests used in-memory
services and signed fixture Runtime requests, not the live database/provider.

## Phase 1 implementation and validation

Implemented a strict understanding-only output contract using the existing
planning grounding validator. The planning schema, readiness checks and execution
authority are unchanged. Already-produced legacy read-only reports still pass
through the existing strict planning validator.

An inspection can now save a bounded intermediate understanding while proposing
the next read. Its quotes must match the currently visible admitted evidence.
Only one current checkpoint enters the next request, and only when it fits the
remaining existing evidence-character allowance. Historical Chat findings never
replace current evidence validation or grant authority.

Project analysis requires a fact backed by a real Runtime source read. List and
search observations alone cannot complete it. Unknowns, truncated evidence and
outstanding implementation/planning/verification produce an explicit incomplete
report. Completion is limited to the inspected scope. Chat shows actual operation
targets and verified read progress, plus persisted findings and the final report.

Existing files changed:

- `backend/src/agent-runtime/agent-run.dto.ts`
- `backend/src/agent-runtime/inspection/agent-inspection.service.ts`
- `backend/src/agent-runtime/inspection/inspection.contract.ts`
- `backend/src/agent-runtime/inspection/inspection.types.ts`
- `backend/src/agent-runtime/understanding/agent-planning.contract.ts`
- `components/chat/agent-run-card.tsx`
- `components/workspace/agent-inspection-card.tsx`
- `hooks/useAgentRunEvents.ts`
- `lib/sekhem-agent.ts`
- `lib/workspace-presentation.ts`
- `test/agent-inspection-presentation.test.ts`

Added:

- `backend/src/agent-runtime/inspection/inspection-understanding.ts`
- `backend/test/agent-workspace-understanding.test.ts`
- This audit.

Checks:

- Pre-edit Agent loop: 53/53.
- Existing planning/loop/context after first implementation: 77/77.
- Related backend suite: 834/834 across 43 files; excluded the opt-in real database
  integration test. No live provider call was part of this suite.
- Final focused suite after the completion guard: 90/90, including 18 new
  understanding regressions.
- Final stopped-checkpoint state regression plus loop security: 65/65.
- Full frontend: 210/210, including two new presentation regressions.
- Backend and frontend typechecks: passed.
- Backend and frontend production builds: passed. Backend rebuilt after the final
  completion guard. Existing Next middleware deprecation warning remains.
- Node: 24.21.0.

Hash comparison of 495 baseline source/config/test files: 11 intentional existing
files changed, 484 unchanged. Provider/configuration/auth/Prisma/Runtime enforcement
and workspace implementation remain unchanged. Generated build output is expected.

### Remaining gate

Real Windows acceptance is in progress. The existing session was reauthenticated,
the rebuilt applications were restarted with no model/execution work active, and
the installed Runtime (displayed fingerprint prefix `76035c0bd709`) opened the real native folder picker. The disposable
`.phase63-acceptance-20260923` directory was selected. Activation of that project
binding and its bounded read access awaits the browser-required confirmation.
The current project binding is still `test_attack`; no content from that folder
was read or transmitted for this acceptance. No live model request has been sent.

The per-run operation and five-source bounds remain unchanged. Large-project
coverage beyond a bounded run, planning, plan-to-execution linking, controlled
modification, diffs and execution verification are not delivered by Phase 1.
No production-readiness or end-to-end work-loop acceptance is claimed.
