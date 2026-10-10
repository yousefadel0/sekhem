# SEKHEM MVP REPAIR REPORT

## 1. Executive Summary

P0 implementation is in place and the focused/regression checks and production builds pass. Final acceptance is blocked by the required authenticated browser demonstration: the production application opens at http://localhost:3000/login?next=%2F, and no signed-in SEKHEM session is available. Sign-in was requested; no credentials were fabricated or authentication bypassed.

The current preview runs the final production frontend on port 3000 and backend on port 3001. No live provider request was made during this implementation verification.

## 2. Problems Found

- Normal and queued chat sends forced chat mode; the existing automatic detector was not registered in the conversation module.
- The proxy buffered SSE, and the frontend did not subscribe to the full existing event vocabulary.
- Conversation reload ignored durable run history and retained only transient run selection.
- Workspace capabilities had no complete browser API, and project/workspace/root identity was ambiguous.
- Evidence and structured understanding/plans were persisted internally but not presented in the main conversation.
- Loading, failures, empty lists and execution labels were misleading.
- Project listing and conversation creation needed actual project/organization checks.
- Text-based pending-message reconciliation could collapse identical queued messages.

## 3. Problems Fixed

Registered the existing backend detector; added explicit Automatic/Chat/Agent analysis selection; restored durable runs; streamed SSE; added the server workspace binding and read-only API; connected lazy tree, viewer, inline run cards and inspector; persisted bounded evidence receipts; repaired error and execution labels; scoped project access; and correlated pending messages by identity.

Existing shell/theme, rendering components, conversation service, AgentRuntime, AgentPlan JSON, FileIntelligence readers, gateway and control plane remain in use. No second runtime, queue, gateway, database workspace model, or separate Agent page was introduced.

## 4. Chat → Agent Flow

Automatic mode sends neither forcing flag. The server's ExecutionModeDetectorService decides between normal chat and an AgentRun. Explicit Chat sends chat:true; Agent analysis sends triggerAgent:true. Queued messages retain their chosen mode.

Automated tests verify “Hello” remains CHAT and “Analyze this project and inspect the authentication implementation.” creates an AgentRun in the same conversation. Production Nest wiring is also tested. Subsequent engineering messages start separate analysis runs; they are not presented as steering an earlier run.

## 5. AgentRun Lifecycle

The existing durable lifecycle remains authoritative. The UI separates request state, run history, selected run, stream state, workspace state and execution availability. Cards are linked to their originating user messages through server-persisted message IDs. Active runs and the latest 20 completed run details hydrate automatically; older runs remain selectable.

Planning results can be PLAN_READY or PLAN_NOT_READY. A completed planning run with missing information is labeled “Needs user input · Analysis completed.” Completion never claims commands or plan steps executed.

## 6. SSE / Live Updates

The proxy forwards text/event-stream bodies directly and preserves cookies, resume headers and ordinary JSON behavior. The subscription handles actual backend understanding, evidence, planning, approval, control and execution-boundary events. Events trigger authoritative snapshot reconciliation, including after terminal transitions. A five-second reconciliation timer covers active runs and errors.

An open-stream proxy test reads two separate chunks before closing the backend stream. Existing replay, ordering, disconnect, terminal-drain and security tests pass. A completed stream is labeled CLOSED; failures are labeled DISCONNECTED. Live authenticated browser delivery remains unverified.

## 7. Workspace Binding

The deployment-owned backend/config/workspace.json maps the existing project project-community-sonic-sovereign to workspace sekhem-source, displayed as “SEKHEM source workspace”. The configured relative root resolves to this repository. The descriptor exposes safe identity, READ_ONLY mode and BACKEND_HOST location, not the absolute root.

The config must be deployed alongside backend/dist; its root is relative to the config file. Binding versions hash workspace/project/canonical-root identity. Conversation metadata and AgentPlan work-item parameters retain the server snapshot. Browser-supplied metadata cannot replace it. File/tree requests include its version, and a changed binding is rejected. Production capability calls resolve this binding before reading and do not silently use a global root.

No new environment variable or environment-file change was made.

## 8. File Tree

GET /api/projects/:projectId/workspace/tree lists only the requested directory. Expansion is lazy. The tree supports directories, files, collapse/expand, selected-file indication, loading, empty, denied, unavailable and error states. Sensitive names and symlinks are omitted from the browser listing.

Existing limits are preserved: depth 8, 200 files, 100 directories, 300 tree nodes, 5 MiB total bytes, and 512 KiB per inspected file. Truncation is explicit.

## 9. File Viewer

GET /api/projects/:projectId/workspace/file reauthorizes access and enforces normalized path containment, canonical sensitive-path checks and existing extraction limits. The Files inspector displays filename, relative path, MIME/language, read state, truncation, warnings and bounded content through CodeBlock.

Existing text, code, Markdown, JSON, CSV, HTML and PDF extraction remains authoritative. Unsupported content returns a controlled error. Scanned PDF text is reported unavailable; OCR and editing are absent.

## 10. Evidence UI

AgentPlan JSON now persists a bounded user-facing receipt: source type, safe label/path, read outcome, discovered/read/selected indicators, truncation and selection reason. Source bodies are not copied into this receipt. The UI explicitly states that context selection does not establish influence on the answer.

Workspace evidence opens through the authorized file API using the run's saved binding. Existing provenance and context budgeting remain intact. A missing or denied source is not represented as read.

## 11. Understanding UI

The Plan inspector renders the actual persisted objective, scope, constraints, unknowns and readiness. No understanding values are invented. When no result exists, the UI says so.

## 12. Plan UI

The same inspector renders persisted readiness, proposed steps, missing information, stop conditions, success criteria and validation issues. There is no execution button. The existing strict plan validator remains unchanged.

## 13. Result / Conversation Persistence

The existing deterministic assistant-result persistence remains in the originating conversation. Run cards, plan/evidence projections and workspace snapshots come from saved backend records. The URL records project/conversation selection for reload restoration.

Client correlation metadata distinguishes identical pending messages without treating their text as identity. The UI reconciles saved messages while retaining unacknowledged local sends. Regression tests cover this duplicate-message case and persisted run presentation. The real browser refresh journey remains pending sign-in.

## 14. Execution Availability

Execution remains unavailable. No Local Runtime, PowerShell/CMD execution, command process, package installation, Git mutation or workspace-write capability was added. Agent presentation explicitly returns executionAvailable:false and executionPerformed:false. Existing executionAllowed:false/control-plane boundaries remain unchanged.

Developer commands used to build and test this repair are not AgentRun execution or verification. No claim is made that an Agent executed these commands.

## 15. Authorization / Security

New endpoints validate durable authentication, current active User.organizationId assignment, actual project organization, existing ResourceAuthorizationService project policy and the exact server-owned binding. This matches the repository's AdminService/AuthService identity model; the unused OrganizationMember table is not treated as a competing source of membership truth.

Project listing is filtered before data retrieval. Conversation creation, reads and message posting are checked against the actual project. Run creation rejects a conversation belonging to another actor/project. Run reads, listing and SSE access apply project checks. Agent controller entry points now validate durable sessions.

Tests cover cross-organization Admin denial, removed/reassigned organization membership, nonmember project denial, metadata substitution, traversal, escaping junctions, aliases into sensitive directories and ordinary HTTP denial envelopes. Authorization is rechecked on evidence/file reads.

## 16. GLM Integration

Existing GLM-5.2-Abliterated / Teletech configuration, credentials, gateway, structured-output transport and context limits were not changed. The configured model's output limit remains 512 tokens.

Provider/model database records had the same SHA-256 fingerprint before and after verification: 9fbdf124f4e9ec228d4fb39a14c6faf2615322d01ad0b714c2ee02ccc9ef126a. No provider activation, discovery, configuration test or live inference call was performed. A structured planning response may still be rejected by the existing validator or output limit; this is surfaced as not ready.

## 17. Tests

Focused tests:
- Routing plus initial workspace suite: 22/22 passed.
- Final workspace/module/binding/HTTP suite: 17/17 passed.
- Streaming proxy: 2/2 passed.

Regression tests:
- Relevant backend suite: 327/327 passed across 37 suites, including AgentRun, planning, control-plane B1–B6, evidence, authorization, file intelligence, workspace and budget checks.
- Frontend suite: 45/45 passed.
- After adding duplicate-message reconciliation, the affected frontend client suite passed 16/16. Counts overlap; they are not additive.

Typechecks:
- node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit — PASS.
- node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit — PASS, including the final frontend source.
- Production frontend also performed its own TypeScript check.

Production builds:
- From backend: pnpm run build → tsc -p tsconfig.json — PASS.
- From repository root: pnpm run build → next build — PASS, including 26 generated pages.
- Process-scoped pnpm_config_verify_deps_before_run=false prevented the installed pnpm fallback from reinstalling dependencies. No package or configuration file was edited.
- The sandboxed frontend attempt failed downloading the existing Google Fonts. The permitted network retry succeeded.
- Node 24 is installed; the repository declares Node 22. Builds report this engine warning. Next also reports the existing middleware convention deprecation.

Live server checks:
- Final backend starts successfully and connects to PostgreSQL.
- Final frontend starts successfully on port 3000.
- Through the production frontend proxy: health returns 200; unauthenticated projects, workspace descriptor, tree and file routes return 401.
- Browser loads the real production login screen. Authenticated demonstration is blocked pending user sign-in.

Existing separate regression failures, left unchanged:
- auth-service-contract.test.ts assumes Secure cookies without setting production mode; unchanged AuthService adds Secure only in production.
- execution-plane.test.ts cannot create a Windows file symlink here (EPERM). The new junction-escape tests pass.
- execution-plane.test.ts's process regex matches the unchanged literal capability name powershell.execute. The executor still returns EXECUTION_NOT_ENABLED.
- Both affected test files and underlying auth/executor source match the pre-edit baseline hashes. No unrelated test was weakened.

## 18. Database Changes

NONE — no schema changes, migrations, seeds, membership edits or direct application-data writes. Existing JSON fields hold the new runtime projections when users create conversations/runs. This verification used read-only configuration/identity queries and isolated test fixtures.

## 19. Provider Changes

NONE.

Package files, lockfiles, environment files, Prisma schema, migrations and AI Gateway source also match the baseline. No dependency installation completed.

## 20. Files Changed

Source, configuration and tests:

- [app/api/[[...path]]/route.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/api/[[...path]]/route.ts)
- [app/page.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/page.tsx)
- [backend/config/workspace.json](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/config/workspace.json)
- [backend/src/agent-runtime/agent-run.dto.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-run.dto.ts)
- [backend/src/agent-runtime/agent-runtime.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.controller.ts)
- [backend/src/agent-runtime/agent-runtime.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/agent-runtime.service.ts)
- [backend/src/agent-runtime/capabilities/workspace-capability.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/capabilities/workspace-capability.service.ts)
- [backend/src/agent-runtime/capabilities/workspace-source.resolver.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/capabilities/workspace-source.resolver.ts)
- [backend/src/agent-runtime/skills/workspace-reader.skill.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/skills/workspace-reader.skill.ts)
- [backend/src/agent-runtime/understanding/agent-context-builder.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-context-builder.service.ts)
- [backend/src/agent-runtime/understanding/agent-presentation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-presentation.ts)
- [backend/src/agent-runtime/understanding/agent-understanding.types.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/agent-runtime/understanding/agent-understanding.types.ts)
- [backend/src/auth/project-access.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/auth/project-access.service.ts)
- [backend/src/conversation/conversation.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.controller.ts)
- [backend/src/conversation/conversation.module.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.module.ts)
- [backend/src/conversation/conversation.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/conversation/conversation.service.ts)
- [backend/src/data-access/memory-product-read.repository.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/data-access/memory-product-read.repository.ts)
- [backend/src/data-access/postgres-product-read.repository.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/data-access/postgres-product-read.repository.ts)
- [backend/src/data-access/product-read.repository.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/data-access/product-read.repository.ts)
- [backend/src/product.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/product.controller.ts)
- [backend/src/product.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/product.service.ts)
- [backend/src/workspace-intelligence/models/workspace.types.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/models/workspace.types.ts)
- [backend/src/workspace-intelligence/security/workspace-security.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/security/workspace-security.service.ts)
- [backend/src/workspace-intelligence/workspace-binding.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-binding.service.ts)
- [backend/src/workspace-intelligence/workspace-discovery.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-discovery.service.ts)
- [backend/src/workspace-intelligence/workspace-intelligence.module.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-intelligence.module.ts)
- [backend/src/workspace-intelligence/workspace-intelligence.service.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace-intelligence.service.ts)
- [backend/src/workspace-intelligence/workspace.controller.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/src/workspace-intelligence/workspace.controller.ts)
- [backend/test/agent-planning.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-planning.test.ts)
- [backend/test/agent-runtime.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/agent-runtime.test.ts)
- [backend/test/conversation.routing.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/conversation.routing.test.ts)
- [backend/test/tool-authorization.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/tool-authorization.test.ts)
- [backend/test/workspace-mvp.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/test/workspace-mvp.test.ts)
- [components/chat/agent-run-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/chat/agent-run-card.tsx)
- [components/chat/empty-state-console.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/chat/empty-state-console.tsx)
- [components/workspace/agent-inspector.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-inspector.tsx)
- [components/workspace/workspace-explorer.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-explorer.tsx)
- [components/workspace/workspace-header.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-header.tsx)
- [components/workspace/workspace-sidebar.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-sidebar.tsx)
- [hooks/useAgentRunEvents.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useAgentRunEvents.ts)
- [hooks/useConversationRuns.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useConversationRuns.ts)
- [hooks/useWorkspace.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useWorkspace.ts)
- [lib/sekhem-agent.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-agent.ts)
- [lib/sekhem-conversation.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/sekhem-conversation.ts)
- [test/mvp-streaming-proxy.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/mvp-streaming-proxy.test.ts)
- [test/sekhem-agent-events.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/sekhem-agent-events.test.ts)
- [test/sekhem-conversation-client.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/sekhem-conversation-client.test.ts)

Documentation created:

- [docs/sekhem-mvp-repair-report.md](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/docs/sekhem-mvp-repair-report.md)

Generated files changed by build/typecheck:

- [backend/dist/agent-runtime/agent-runtime.controller.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/agent-runtime.controller.js)
- [backend/dist/agent-runtime/agent-runtime.controller.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/agent-runtime.controller.js.map)
- [backend/dist/agent-runtime/agent-runtime.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/agent-runtime.service.js)
- [backend/dist/agent-runtime/agent-runtime.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/agent-runtime.service.js.map)
- [backend/dist/agent-runtime/capabilities/workspace-capability.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/capabilities/workspace-capability.service.js)
- [backend/dist/agent-runtime/capabilities/workspace-capability.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/capabilities/workspace-capability.service.js.map)
- [backend/dist/agent-runtime/capabilities/workspace-source.resolver.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/capabilities/workspace-source.resolver.js)
- [backend/dist/agent-runtime/capabilities/workspace-source.resolver.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/capabilities/workspace-source.resolver.js.map)
- [backend/dist/agent-runtime/skills/workspace-reader.skill.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/skills/workspace-reader.skill.js)
- [backend/dist/agent-runtime/skills/workspace-reader.skill.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/skills/workspace-reader.skill.js.map)
- [backend/dist/agent-runtime/understanding/agent-context-builder.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/understanding/agent-context-builder.service.js)
- [backend/dist/agent-runtime/understanding/agent-context-builder.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/understanding/agent-context-builder.service.js.map)
- [backend/dist/agent-runtime/understanding/agent-presentation.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/understanding/agent-presentation.js)
- [backend/dist/agent-runtime/understanding/agent-presentation.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/understanding/agent-presentation.js.map)
- [backend/dist/agent-runtime/understanding/agent-understanding.types.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/agent-runtime/understanding/agent-understanding.types.js.map)
- [backend/dist/auth/project-access.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/auth/project-access.service.js)
- [backend/dist/auth/project-access.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/auth/project-access.service.js.map)
- [backend/dist/conversation/conversation.controller.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.controller.js)
- [backend/dist/conversation/conversation.controller.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.controller.js.map)
- [backend/dist/conversation/conversation.module.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.module.js)
- [backend/dist/conversation/conversation.module.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.module.js.map)
- [backend/dist/conversation/conversation.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.service.js)
- [backend/dist/conversation/conversation.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/conversation/conversation.service.js.map)
- [backend/dist/data-access/memory-product-read.repository.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/data-access/memory-product-read.repository.js)
- [backend/dist/data-access/memory-product-read.repository.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/data-access/memory-product-read.repository.js.map)
- [backend/dist/data-access/postgres-product-read.repository.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/data-access/postgres-product-read.repository.js)
- [backend/dist/data-access/postgres-product-read.repository.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/data-access/postgres-product-read.repository.js.map)
- [backend/dist/product.controller.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/product.controller.js)
- [backend/dist/product.controller.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/product.controller.js.map)
- [backend/dist/product.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/product.service.js)
- [backend/dist/product.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/product.service.js.map)
- [backend/dist/workspace-intelligence/security/workspace-security.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/security/workspace-security.service.js)
- [backend/dist/workspace-intelligence/security/workspace-security.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/security/workspace-security.service.js.map)
- [backend/dist/workspace-intelligence/workspace-binding.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-binding.service.js)
- [backend/dist/workspace-intelligence/workspace-binding.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-binding.service.js.map)
- [backend/dist/workspace-intelligence/workspace-discovery.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-discovery.service.js)
- [backend/dist/workspace-intelligence/workspace-discovery.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-discovery.service.js.map)
- [backend/dist/workspace-intelligence/workspace-intelligence.module.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-intelligence.module.js)
- [backend/dist/workspace-intelligence/workspace-intelligence.module.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-intelligence.module.js.map)
- [backend/dist/workspace-intelligence/workspace-intelligence.service.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-intelligence.service.js)
- [backend/dist/workspace-intelligence/workspace-intelligence.service.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace-intelligence.service.js.map)
- [backend/dist/workspace-intelligence/workspace.controller.js](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace.controller.js)
- [backend/dist/workspace-intelligence/workspace.controller.js.map](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/backend/dist/workspace-intelligence/workspace.controller.js.map)
- [next-env.d.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/next-env.d.ts)
- [tsconfig.tsbuildinfo](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/tsconfig.tsbuildinfo)

Next.js also regenerated its .next build directory. It is generated output and was excluded from the source baseline inventory. The source baseline used file hashes because this workspace has no .git directory. No baseline file was deleted; no protected configuration file changed.

## 21. Known Remaining Limitations

- The authenticated browser journey, live GLM result, visual evidence/plan display and refresh restoration have not been demonstrated. Sign-in is the current blocker.
- P1 attachment persistence/preview repair, approval decision UI and workspace search UI remain deferred. Existing attachments remain available; image analysis is explicitly described as unavailable.
- Approval cards show the presence of real pending requests; full action/scope/risk decision controls are not included.
- The configured 512-token model output limit may prevent a usable structured plan for a large request. Configuration and strict validation were intentionally preserved.
- Workspace collection remains bounded; evidence can be incomplete and this is shown as warnings/missing information.
- One deployment-owned backend-host workspace is supported; no arbitrary root selection or local runtime.
- Node 22 validation and the three pre-existing regression failures above remain outstanding.
- Legacy runs without the new display receipt honestly report unavailable evidence/plan data.
- Unsaved composer attachments are not durably restored across conversation switches or reloads; this is deferred P1 work.

## 22. MVP Definition of Done

PASS below identifies a demonstrated automated/server check. A FAIL for pending browser verification means acceptance is not established, not that a defect was observed.

| Criterion | Result | Evidence / remaining work |
| --- | --- | --- |
| 1. Hello remains CHAT | PASS | Routing and budgeted-chat tests |
| 2. Engineering request creates AgentRun | PASS | Exact requested example and module wiring tests |
| 3. AgentRun persists | PASS | Transactional runtime tests |
| 4. Run survives conversation reload | PASS | Durable conversation/run-detail tests; browser confirmation pending |
| 5. SSE arrives incrementally | PASS | Two-chunk open-stream proxy test and backend stream tests |
| 6. Run reaches terminal state | PASS | Planning runtime tests with controlled provider fixtures; live provider pending |
| 7. Workspace descriptor loads | PASS | Config binding and authorized HTTP fixture tests; live browser pending |
| 8. Unauthorized access fails | PASS | Unit/HTTP tests and real unauthenticated production 401 |
| 9. Path traversal fails | PASS | Workspace security tests |
| 10. Symlink escape fails | PASS | Junction/canonical alias tests; legacy file-symlink fixture hits OS EPERM |
| 11. File tree loads | PASS | Lazy directory service tests; browser confirmation pending |
| 12. File read works | PASS | Actual temporary source file through authorized HTTP route |
| 13. Unsupported file handled honestly | PASS | Controlled error and existing extractor tests |
| 14. Evidence appears in the live UI | FAIL | Implemented and persistence tested; authenticated visual check pending |
| 15. Plan appears in the live UI | FAIL | Implemented and persistence tested; authenticated visual check pending |
| 16. Live result appears in the same conversation | FAIL | Runtime persistence tested; live provider/browser demonstration pending |
| 17. Browser refresh restores all state | FAIL | Implementation and correlation tests pass; authenticated refresh pending |
| 18. No Agent command execution | PASS | Execution remains disabled; control-plane tests pass |
| 19. executionPerformed remains false | PASS | Receipt/presentation and control-plane checks |
| 20. GLM configuration unchanged | PASS | Source/config hashes and database configuration fingerprint |
| 21. Agent control-plane security regressions | PASS | Existing tool-authorization B1–B6 suite |
| Single real authorized workspace | PASS | Explicit config and authorization tests |
| No new schema/migration/provider/model | PASS | Baseline inventory and read-only DB verification |
| No R&D/Initiative/demo navigation presented as MVP | PASS | Main navigation adjusted; demo routes retained |
| Required production builds | PASS | Final backend and frontend builds |
| Full user journey in a real authenticated browser | FAIL | Pending sign-in |
| P1 attachments/approval/search completion | NOT APPLICABLE | Optional scope deferred |

## 23. End-to-End Demonstration Result

Opened the actual final production application through the computer-use browser skill. The app redirects to the real login page. No existing signed-in SEKHEM session was available in the connected browser, and the requested sign-in has not yet been completed.

The full demonstration has therefore NOT passed. The next required action is to sign in at http://localhost:3000 with the existing authorized account and reply “Signed in.” Then verify project/workspace selection, directory expansion, a source-file read, an automatic engineering request, live run events, real evidence/understanding/plan/result and browser refresh, with execution remaining unavailable.

The browser panel is retained for that continuation. The server-side and automated checks above are not represented as a substitute for this journey.

## 24. Final Status

MVP_BLOCKED

