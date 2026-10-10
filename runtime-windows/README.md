# SEKHEM Runtime for Windows

This package hosts the existing Trusted Local Runtime worker. It does not introduce another execution engine or sandbox. The per-user application provides pairing, connection status, start/stop, a notification-area menu and a native Windows folder picker. The worker still needs the existing project grants, workspace consent, authorization, execution permits and verified receipts.

## Local development (unsigned)

On a developer machine, **do not treat the unsigned Runtime as a production release**. Production Authenticode remains a **release** prerequisite only ([SIGNING.md](SIGNING.md)). SEKHEM pairing, grants, workspace binding, approvals, execution permits, conditional writes, receipts and read-back are unchanged.

On this Windows configuration, **Smart App Control / Application Control** (`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy` `VerifiedAndReputablePolicyState = 1`) blocks the unsigned WinForms host `SEKHEM Runtime.exe` (`An Application Control policy has blocked this file`). That is not Mark of the Web; Zone.Identifier is absent. Do not turn Smart App Control off.

Local execution uses `build.ps1 -PayloadOnly` and starts the existing worker with the **vendor-signed** `node.exe` already required by the build:

```powershell
.\runtime-windows\run-local.ps1 -PairOnly
.\runtime-windows\run-local.ps1
```

Pairing codes print on the console. Enroll the code in SEKHEM Settings, then run without `-PairOnly` to connect. The Settings download still appears only for a signed `release.json`; that gate is for published installers.

## Local MVP user flow

1. Sign in to SEKHEM and select an existing project.
2. For local development, run `.\runtime-windows\run-local.ps1` (see above). For a production machine, download **SEKHEM Runtime Setup.exe** only after a signed release is published.
3. Choose **Pair computer** in the Runtime window (or `-PairOnly` locally). Enter that code in SEKHEM Settings and choose **Pair this computer**.
4. Choose **Connect** in the Runtime window. In Settings, explicitly allow the read-only project capabilities for one hour.
5. Open Workspace, choose **Choose Folder**, select a real folder in the native Windows dialog and choose **Open workspace**.
6. Review the existing folder-verification approval, then allow bounded workspace reading. Directory listing, search and file reads reuse that finite consent without per-file approval.
7. Continue in the same conversation. Workspace requests appear as Agent activity there; detailed controls remain available.

Initial enrollment, project capability authorization, root verification and workspace read consent are still distinct security steps. They have not been collapsed into a broader implicit grant. A fresh grant is required after expiration or scope changes. Selecting a folder alone authorizes no content access.

## Build

Use Windows x64 with the existing Node **24.21.0**, repository dependencies, the Windows .NET Framework compiler and an official Inno Setup compiler. No Node installation or downgrade is performed by this build.

From the repository root:

```powershell
.\runtime-windows\build.ps1 -RuntimeUrl 'https://localhost:7443' -WebUrl 'http://localhost:3000' -PayloadOnly
```

`-PayloadOnly` creates a unique development folder under `runtime-windows/out/build-*/payload` and never publishes an installer. Its `build-manifest.json` records source, dependency-lock and payload hashes, Node version and conditional-write protocol support.

For a **production** release, omit `-PayloadOnly` and supply `-SignToolPath`, `-CertificateThumbprint` and `-TimestampUrl`. That path is a release prerequisite, not a local-dev requirement. It uses a provisioned CA-issued RSA code-signing certificate/token in the current user's Personal certificate store; it does not create a certificate or accept a password. The host, folder picker, installer and uninstaller must be signed and timestamped. Signing and verification must succeed before publishing. Permanent product identity, rotation, CI, and new-PC verification are documented in [SIGNING.md](SIGNING.md). Use `signing-preflight.ps1`, `verify-release.ps1`, and `verify-installed.ps1` on **release** artifacts. Do not publish or Settings-download `-PayloadOnly` output.

Pass `-InnoCompiler 'C:\path\to\ISCC.exe'` when the compiler is elsewhere. After signature checks pass, the installer is copied to `public/runtime/SEKHEM Runtime Setup.exe` with `release.json`. The setup UI offers a download only when that signed-release record exists. Deploy these two files together; do not carry an old release record into a new release.

For another deployment, build with its actual HTTPS Runtime origin and web URL. Omit `-TrustedCa` for a public CA; Node certificate validation remains enabled. Only a public PEM certificate may be packaged. Private keys, backend environment files and Runtime identities are never installer inputs.

A payload configured for `localhost:7443` and `localhost:3000` connects only to services on that computer. Production Windows acceptance remains unverified until a signed release is installed and tested. Signing follows [Microsoft's Smart App Control guidance](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control) and [Inno Setup's signing support](https://jrsoftware.org/ishelp/topic_setup_signtool.htm). Inno Setup is credited to Jordan Russell and Martijn Laan.

## Lifecycle and storage

- Default install: `%LOCALAPPDATA%\Programs\SEKHEM Runtime`.
- Default identity: `%LOCALAPPDATA%\SEKHEM\trusted-runtime`, using the existing worker's private-key storage and ACL implementation.
- Optional installer startup task uses the current user's Windows sign-in startup entry. No administrator service is installed.
- Closing the window hides it in the notification area. **Exit** terminates this host's worker and its descendants.
- Temporary transport failures use the worker's existing bounded backoff. Permanent identity/authentication rejection stops it; the host does not silently restart a rejected identity.
- A disconnected or uncertain folder-picker request is not replayed. A new request requires another user action.
- Uninstall removes installed binaries, shortcuts and startup entry. It preserves private identity and user workspaces. Revocation remains an explicit server-side operation.

For an isolated acceptance identity, the host accepts `--state <directory>`. Normal users need no command line. **Connect** and **Disconnect** control only this host's child worker.

## Boundaries

The picker uses Windows Common Item Dialog through a fixed packaged helper. It does not enumerate the backend filesystem, add a local unauthenticated HTTP bridge, grant filesystem authority or accept a server-provided executable. Its request/result travel through the existing signed transport and durable session/project checks, with device epoch, fingerprint, binding version and expiry validation.

The plan adapter supports a bounded exact change to one fully read UTF-8 file, with human approval, a SHA-256 preimage check, and a subsequent read matching the approved content. Conditional content is capped at 22 KiB and the serialized input remains capped at 24 KiB. Older workers cannot receive these writes. General multi-file and terminal plans require further implementation and are blocked explicitly.

Execution progress is saved separately from the immutable plan. Receipt settlement commits before authorizing another step; a failed next-step check never discards a completed receipt or substitutes another session. Cancellation and unknown outcomes never trigger automatic mutation replay.

The runtime grants, original session, workspace binding and approval remain mandatory. Provider/model settings and output budgets are unchanged. No production database is used by the default test suite. Real PostgreSQL tests opt in through `SEKHEM_RUNTIME_DB_TEST=1` or `SEKHEM_MEMORY_DB_TEST=1` and `SEKHEM_TEST_DATABASE_URL` pointing to a disposable local database named `sekhem_test_*`.
