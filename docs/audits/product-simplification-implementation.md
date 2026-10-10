# Product simplification and Windows Runtime implementation

Status: **PARTIAL — implementation and builds verified; end-to-end live acceptance pending read-access authorization.**

## Implemented

- Conversation is the primary Workspace surface. Automatic Agent requests stay in that conversation, with active approval/activity controls inline; Files and activity is secondary. Detailed Runtime controls are in Settings / Advanced.
- Native Windows Choose Folder is carried over the existing signed Runtime transport. The native helper uses Windows Common Item Dialog. Selection alone creates no binding, file grant, execution permit or evidence.
- Folder requests validate the existing durable session, project authorization, device ownership/fingerprint/connection epoch, binding identity/version and expiry. One outstanding selection per device; no automatic replay after an uncertain dispatch.
- Natural workspace follow-ups route to the existing Agent. A bounded snapshot of the same conversation reaches structured reasoning in user/assistant roles. Explorer-generated operations are excluded, and conversation text cannot authorize execution or become verified file evidence.
- Existing finite Workspace Read Grant remains authoritative for automatic list/search/read. Normal consent copy describes the folder, scope, duration and revocation. Write/terminal permissions have not been added.
- Windows installer bundles the existing worker, actual signed Node 24.21.0 binary, a tray host and native folder helper. The host supports pairing, connection, disconnect, startup and stopping its own process tree. Permanent authentication failures are not silently restarted.
- Normal Settings has a Runtime download, pairing and a finite read-only project grant. No manual worker commands or end-user TLS provisioning are required by the installed local package.

## Current new-user experience

Sign in → select an existing project → Settings → install Runtime → pair computer → connect → explicitly allow read-only project capabilities → Workspace → Choose Folder → native Windows dialog → Open workspace → approve root verification → allow bounded workspace reading → browse files and continue in the same Chat/Agent conversation.

The initial authorization steps are still separate. They reuse existing security gates and are not an implicit grant from selecting a folder. Once bounded read consent is active, covered multi-file reads do not each require human approval.

New-project creation is an existing product gap; this batch provides project selection, not a new project-provisioning/permission mechanism. General Agent writes and terminal execution remain future work. Routing “Execute it” to the Agent does not make arbitrary text executable.

## Validation

| Check | Result |
| --- | --- |
| Complete frontend suite | 204 passed, 0 failed/cancelled |
| Related backend Runtime/Workspace/Agent/Gateway/provider suites | 354 tests: 351 passed, 0 assertion failures, 3 cancelled by one failing setup hook |
| Same-conversation/Agent/planning/Gateway focused group | 138 passed |
| Earlier Runtime regression group | 128 passed |
| Frontend typecheck and production build | PASS |
| Backend typecheck and production build | PASS |
| Windows C# host and native helper compilation | PASS |
| Bundled existing worker --version | PASS, Node 24.21.0 |
| Installer compilation | PASS |
| Real isolated per-user installation | PASS, exit 0 |
| Installed app launch and pairing-code generation | PASS, observed in native Windows UI |
| Fresh enrollment/grant, native folder selection, verified reads, offline/reconnect | PENDING, requires live read-access authorization |

The three cancelled backend tests are the existing provider-settings HTTP fixture. Its before hook expects login status 201 using legacy staging-only credentials and receives 401 under current durable authentication (`backend/test/ai-gateway-provider-settings.test.ts:178`). This fixture and auth implementation are unchanged from the pre-edit hashes. The earlier post-implementation audit already records this fixture category. No security check was weakened to pass it.

Tests cover selection ownership/project/org/session checks, expiry, stale binding, changed Runtime, duplicate dialogs, unsupported workers, cancellation, no authority from selection, continued polling during a picker, permanent rejection and no uncertain picker replay. Conversation tests cover workspace follow-ups, Chat explanations, bounded same-conversation history, schema/provider parameter preservation and evidence/approval separation.

The first sandboxed frontend build could not fetch Google Fonts; the normal build with network permission passed. There was no source workaround. Local tsx tests required the existing environment's unrestricted process access; no auth or database changes were used to resolve that environment constraint.

## Live acceptance state

The rebuilt frontend is authenticated as the existing local account and exposes the new Settings setup. Its existing active fixture binding still points to a revoked Runtime. A prepared disposable identity was reused for the installed Runtime; the installed host successfully generated a new pairing code. No new Runtime grant, workspace replacement or content operation has been activated in this batch yet.

Windows control initially timed out on app-access approval; after the user made the window available, native pairing was observed. The remaining read-access confirmation is required at activation by the browser tool. Until completed, this report does not claim native-folder-to-verified-tree acceptance, automatic multi-file grant acceptance, live same-conversation GLM completion, startup after Windows sign-in or uninstall acceptance.

## Artifacts and release limits

- Installer: `public/runtime/SEKHEM Runtime Setup.exe`, 25,088,098 bytes.
- SHA-256: `F02747B1F66BC589DA5FB45C0D28E0916B09D60A469C1C4F1B6D00F1972423A6`.
- Unsigned local MVP build, configured for `https://localhost:7443` and `http://localhost:3000`, with the existing public local CA certificate. No private key or environment file is packaged.
- Actual installed acceptance copy: `runtime-windows/out/acceptance-install`. Startup was disabled for this isolated installation. The normal installer offers per-user startup.
- Generated output also includes `backend/dist`, frontend `.next`/TypeScript cache, Runtime payload/compiler/installer output and local validation logs. These are not source changes.
- Production signing/distribution and a deployment-specific public HTTPS connection profile remain release work. The current localhost package is not a remote-machine deployment.
- GLM thinking/output truncation remains unchanged and out of scope. No live provider request has been made in this batch.

## Security and protected scope

Pre-edit/current SHA-256 comparisons confirm no changes to auth source, Prisma/schema/migrations, provider adapter/settings, backend configuration, environment files, package manifests, lockfiles or Node configuration. Existing identity cryptographic algorithms, signed execution permits, receipt verification, provenance validation and sensitive-file rules remain in place. The Runtime identity service only admits the new typed folder-result transport operation; it does not change signing or revocation semantics.

No direct database edits, migrations, resets, backend filesystem fallback or general Phase 6.4 execution were introduced. Folder-selection records use the existing private ledger. Normal application/Runtime API actions and their ledger records remain the only intended live persistence writes; pairing-code generation used the existing challenge registration path.

## Exact source/documentation files changed

- `app/page.tsx`
- `app/workspace.css`
- `components/workspace/sekhem-shell.tsx`
- `components/workspace/trusted-runtime-control.tsx`
- `components/workspace/workspace-explorer.tsx`
- `components/workspace/workspace-read-grant.tsx`
- `components/workspace/workspace-runtime.tsx`
- `lib/sekhem-agent.ts`
- `test/workspace-design.test.ts`
- `test/workspace-read-grant.test.ts`
- `test/workspace-runtime.test.ts`
- `backend/src/agent-runtime/agent-runtime.module.ts`
- `backend/src/agent-runtime/workspace-intent.ts`
- `backend/src/agent-runtime/inspection/agent-inspection.service.ts`
- `backend/src/agent-runtime/inspection/inspection.types.ts`
- `backend/src/ai-gateway/ai-gateway.service.ts`
- `backend/src/trusted-runtime/runtime-client.ts`
- `backend/src/trusted-runtime/runtime-execution.service.ts`
- `backend/src/trusted-runtime/runtime-identity.service.ts`
- `backend/src/trusted-runtime/runtime.contract.ts`
- `backend/src/trusted-runtime/runtime.controller.ts`
- `backend/src/workspace-intelligence/workspace-runtime.service.ts`
- `backend/src/workspace-intelligence/workspace-store.service.ts`
- `backend/test/ai-gateway-output-contract.test.ts`
- `backend/test/conversation.routing.test.ts`
- `backend/test/trusted-runtime-client.test.ts`
- `backend/test/helpers/inspection-loop-harness.ts`
- `backend/src/trusted-runtime/runtime-folder-client.ts`
- `backend/src/trusted-runtime/runtime-folder.service.ts`
- `backend/test/inspection-conversation-context.test.ts`
- `backend/test/runtime-folder.test.ts`
- `.gitignore`
- `runtime-windows/NativeFolderPicker.cs`
- `runtime-windows/RuntimeHost.cs`
- `runtime-windows/installer.iss`
- `runtime-windows/build.ps1`
- `runtime-windows/licenses/NODE-24.21.0.txt`
- `runtime-windows/README.md`
- `docs/audits/product-simplification-implementation.md`

## Commands

From repository root, in separate terminals for local application hosting:

```powershell
node --version # v24.21.0
npm run start
```

```powershell
Set-Location backend
npm run start
```

The existing backend configuration supplies local Runtime TLS. End users launch the installed **SEKHEM Runtime** shortcut; they do not run the worker manually.

Validation commands:

```powershell
$env:TSX_DISABLE_CACHE='1'
node --import tsx --test test/*.test.ts
npm run typecheck
npm run build
Set-Location backend
$related = Get-ChildItem test -File | Where-Object { $_.Name -match '^(trusted-runtime-|workspace-runtime|workspace-read|agent-workspace-loop|agent-understanding|agent-planning|runtime-folder|inspection-conversation|conversation\.|ai-gateway-|assistant-context-budget|provider-diagnostic|vllm)' -and $_.Name -notmatch 'persistence' } | ForEach-Object FullName
node --import tsx --test --test-concurrency=1 @related
npm run typecheck
npm run build
```

Installer build command and host lifecycle details are in `runtime-windows/README.md`. Tests above are mocks/in-memory or read-only fixture startup; destructive database persistence suites were excluded.
