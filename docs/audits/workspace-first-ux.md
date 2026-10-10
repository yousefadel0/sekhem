# Workspace-first product UX correction

Status: UI correction built and tested. Real Windows end-to-end acceptance remains BLOCKED at sign-in.

## Behavior changed

- Workspace is the default primary surface. Both the labeled Workspace toolbar entry and the existing primary navigation select the existing WorkspaceExplorer, close incidental drawers, and exit expanded Chat.
- Explorer and Chat are shown together on desktop/tablet, including 910px. Optional file/activity details share the available space with Chat instead of replacing it. On phones, Workspace and Chat are stacked; labeled Workspace/Chat/Details controls remain visible.
- The existing Explorer shows “No folder connected.”, Choose Folder, a simple Runtime connection state, and Connect Computer (opens existing Settings).
- Choose Folder still uses the existing authenticated native-picker request. The Open button appears after a folder is selected. Binding creation and verification still require the existing backend and Runtime checks.
- Authentication denial, unavailable status lookup, disconnected computer and missing folder have different presentation. A 401 from the workspace/inventory polling removes the cached application surface and offers Sign in; it cannot continue presenting the old Workspace as Ready.
- Runtime fingerprints and binding/receipt/proposal details are in disclosures or Settings. Read approval controls, exact target/purpose and verification details remain available. Nothing automatically approves an action.
- Agent cards keep inspection progress/results in the same conversation and use View details. A failed inspection no longer also displays an old PLAN_READY secondary line.

## Exact files changed

- [app/page.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/page.tsx)
- [app/workspace.css](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/app/workspace.css)
- [components/chat/agent-run-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/chat/agent-run-card.tsx)
- [components/workspace/agent-inspection-card.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/agent-inspection-card.tsx)
- [components/workspace/sekhem-shell.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/sekhem-shell.tsx)
- [components/workspace/workspace-explorer.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-explorer.tsx)
- [components/workspace/workspace-header.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-header.tsx)
- [components/workspace/workspace-runtime.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/components/workspace/workspace-runtime.tsx)
- [hooks/useWorkspace.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useWorkspace.ts)
- [hooks/useWorkspaceRuntime.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/hooks/useWorkspaceRuntime.ts)
- [lib/workspace-runtime-status.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/lib/workspace-runtime-status.ts)
- [test/agent-inspection-presentation.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/agent-inspection-presentation.test.ts)
- [test/workspace-design.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/workspace-design.test.ts)
- [test/workspace-runtime.test.ts](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/workspace-runtime.test.ts)

Added:
- [test/workspace-ux.fixture.tsx](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/test/workspace-ux.fixture.tsx): isolated responsive browser fixture using the real UI components. No login, Runtime, filesystem access, or model calls; no application route added.
- [docs/audits/workspace-first-ux.md](D:/yy/yy/sekhem-product-application-main/sekhem-product-application-main/docs/audits/workspace-first-ux.md): this report.

Expected generated output: .next production build and TypeScript incremental cache. Temporary browser-fixture bundle/server/logs were outside application source. The fixture server was stopped.

## Validation

- Focused frontend tests were run for workspace design, Runtime presentation, read grants and Runtime status. Intermediate failures were presentation expectations affected by this correction; saved observation metadata was retained under details.
- Final `npm test`: **208 passed, 0 failed, 0 cancelled** across 11 suites.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, all 26 pages generated. No application route added.
- The first sandboxed test launch failed before assertions because Node/tsx could not initialize Windows user information. The authorized unsandboxed run succeeded.
- The first sandboxed build could not download the existing Google Fonts. The normal build succeeded with network access; font configuration was unchanged.
- Existing Next.js middleware-deprecation warning remains.
- Frontend restarted with the final production build. Backend and Runtime processes were not restarted.

Regression coverage includes empty Workspace onboarding, disabled native picker without a capable device, expired authentication suppressing cached ready/file actions, status lookup failure distinguished from offline state, one mounted composer, same-conversation inspection messaging, failed-inspection truthfulness, and existing grant/receipt/current-access restrictions.

## Responsive browser checks — isolated UI fixture, not live acceptance

The fixture uses the actual Shell, PrimaryNavigation, WorkspaceExplorer, ProjectChat and FilePanel with production CSS. It is explicitly labeled as a fixture and was served only at a separate loopback test port.

| Width | Workspace opens visibly | Choose Folder visible | Chat retained with details | Draft preserved | Horizontal page overflow |
|---|---|---|---|---|---|
| 1440 | Pass | Pass, disabled without Runtime | Pass | Pass | None |
| 1200 | Pass | Pass, disabled without Runtime | Pass | Pass | None |
| 1024 | Pass | Pass, disabled without Runtime | Pass | Pass | None |
| 910 | Pass | Pass, disabled without Runtime | Pass | Pass | None |
| 768 | Pass | Pass, disabled without Runtime | Pass | Pass | None |
| 390 | Pass | Pass, disabled without Runtime | Pass | Pass | None |

At 768px and above, the existing primary Workspace navigation was clicked. At 390px, the permanently visible labeled Workspace toolbar entry was clicked. Returning to Workspace from expanded Chat also restored Explorer and retained the draft. The browser viewport override was reset afterward.

![910px isolated component fixture — not live acceptance](C:/Users/youse/.codex/visualizations/2026/09/21/01a0c3ff-d04d-7b62-bf3a-fa7fbfcd8ba1/workspace-first-910-ui-fixture.png)

## Actual 910px acceptance

The real localhost:3000 application was opened/reloaded. Its expired session redirected to the real login form. The final live check at **910 × 742** still showed Operator Identifier, password and Authenticate Session.

A sign-in request is pending with the user. No credentials were read, changed, or bypassed.

| Acceptance stage | Actual result |
|---|---|
| Open application | Reached the real login page |
| Sign in | Blocked: existing session expired; sign-in not completed during this pass |
| Select authorized project / click Workspace in authenticated application | Not verified live |
| Native Windows picker / select folder / Open | Not attempted while unauthenticated |
| Verified real file tree | Not verified in this pass |
| Agent read-only inspection / same-conversation result | Not attempted in this pass |

The responsive fixture is not a substitute for these stages. **No claim of completed real Windows acceptance is made.** Current Runtime availability cannot be established from the unauthenticated browser; previous cached device state was not treated as fresh evidence.

![Real 910px application: sign-in blocker](C:/Users/youse/.codex/visualizations/2026/09/21/01a0c3ff-d04d-7b62-bf3a-fa7fbfcd8ba1/workspace-first-live-login-blocker.png)

## Preserved boundaries and remaining work

The existing Browser → Backend → authenticated Runtime → native picker → binding → approved verification path is unchanged. No backend filesystem fallback or new permissions were added.

Baseline SHA-256 comparison found no changes in backend source/tests/Prisma, Runtime implementation/installer source, environment files, provider configuration, package manifests/lockfiles, or Node version files. No database mutation, Runtime enrollment/grant, workspace rebinding, migration or live provider request was performed in this pass. The frontend change reports authentication failures; server authentication/authorization architecture is untouched.

Remaining acceptance: sign in with the existing account, confirm an active installed Runtime, then use the real UI for folder selection, approved binding verification, file tree access and read-only Agent inspection. If Runtime enrollment/grant renewal is needed, activate only the existing narrow read capabilities with the required user approval. Model output limits and any existing GLM truncation limitation remain unchanged.

No Phase 6.4, Write/Edit/Delete/Move/Copy/Terminal/general execution, project-creation system, or previous-plan execution was implemented.

