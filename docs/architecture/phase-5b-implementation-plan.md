# Phase 5B implementation plan

## Read-only audit findings

- AgentRuntime owns durable AgentRun/AgentPlan lifecycle, event/audit transactions, pause/resume/cancel, steering and recovery. Phase 4 stores validated planning in `AgentPlan.steps[0].parameters.planning`; planning completion currently completes the run.
- SkillRegistry contains read-only evidence/reasoning skills. ExecutionPlane is a deny-by-default placeholder; PowerShellExecutor cannot launch a process. Neither becomes a tool executor in this phase.
- ResourceAuthorizationService supplies live project membership, organization boundaries and READ/UPDATE/DELETE/EXECUTE/APPROVE decisions. Reuse it for permissions and reviewers.
- WorkspaceSourceResolver validates trusted roots against configured allowed roots. WorkspacePathService and WorkspaceSecurityService provide normalization, containment, sensitive-path and symlink protections. Check ancestors of prospective targets too.
- AgentApproval (distinct from product Approval) has run ID, type, status, actor, reviewer role, decision, timestamps, dueAt and revisedPlan JSON. A versioned TOOL_AUTHORIZATION envelope can bind request/input/plan/scope hashes without schema changes; preserve legacy arrays.
- No tool-bound reviewer endpoint or centralized capability mapping exists. No durable project-to-workspace-root binding exists. Never infer that binding from a model or global root.
- No Phase 5A document was found. Its location was requested. The supplied Phase 5B brief is the available contract; the conservative choices below are explicit and subject to that authoritative reference.

## Implementation sequence

1. Add bounded definition/request contracts, deterministic registry and risk defaults. Definitions have no executor or transport.
2. Centralize capability-to-resource-action mapping. Require existing application authorization plus explicit server-owned workspace capability grants. Approval cannot alter either.
3. Validate an explicit server-owned workspace binding, relative paths and allowed prefixes using existing root/path security. Missing bindings block. Check escaping/unresolved ancestor symlinks without reading file content or performing tool file operations.
4. Add one ToolAuthorizationService pipeline: resolve latest durable Phase 4 plan/step, enforce constraints/effects, normalize scope, check permissions, classify risk, evaluate approval. Fingerprints bind request/version/run/step/input/actor/scope. Revalidate every call.
5. Reuse AgentApproval for PENDING/APPROVED/DENIED/EXPIRED/CANCELLED. Default mutations to approval required; use authenticated reviewers and optimistic state transitions. Persist bounded metadata, never raw commands/content, roots or credentials.
6. Add an explicit AgentRuntime decision boundary, without a decision loop. EXECUTE_TOOL and REQUEST_APPROVAL use the same pipeline. Authorized operations pause at the execution boundary; pending requests await approval; blocked requests pause with a code. Completed Phase 4 planning jobs can enter this explicit path; recovery never auto-dispatches it. Other decisions stop for later loop/verification work.
7. Preserve legacy read-only skills and Phase 4. Add a guarded approval endpoint that records decisions only. Cancel pending tool approvals on cancellation; preserve legacy approval payloads.
8. Test registry, permissions, temporary-path containment, risk, approval replay/expiry, runtime states and zero execution using mocked persistence. Run existing related tests and no-emit typecheck; audit source/protected-file hashes.

## Audit refinements during verification

- Bind resolved targets/allowed prefixes into approval fingerprints, including prospective files below symlinks, so in-workspace symlink retargeting invalidates prior approval.
- Existing pause/resume/cancel calls supplied no project and substituted the caller for the actual owner. This blocked legitimate non-admin lifecycle control and supplied no durable tenant boundary. At the required Phase 5B lifecycle seam, load the actual run/project first and call the unchanged ResourceAuthorizationService with persisted owner/project/organization; use its existing CANCEL action for cancellation. No authentication or role-policy implementation changed.

## Boundaries

No Local Runtime, OS execution, WebSocket, provider/Gateway change, auth policy change, dependency install, schema/migration, frontend change or production database operation. Bindings enter through an internal server API only; HTTP/model data cannot supply roots, grants, reviewer identity or policy. Authorization is a fresh control-plane decision, not an execution credential. Future execution must repeat authorization and enforce OS-level confinement.
