# Phase 0B-2 pre-edit audit

Scope: disposable native Windows filesystem experiments only. No production imports,
configuration, package changes, Runtime pairing, transport, database, or execution.

## Classification

| Class | Existing implementation | Finding |
|---|---|---|
| A: policy concepts | `WorkspaceSecurityService`, repository `FORBIDDEN_SEGMENTS`, `ToolScopeService`, tool registry | Preserve sensitive names/ancestors, exact relative scope, all affected paths, permissions/risk/approval and bounded reads. These are policy, not kernel confinement. |
| B: backend host only | `WorkspaceBindingService`, `WorkspaceSourceResolver`, deployment workspace configuration | Resolve deployment-owned absolute paths on the backend. Cannot authorize a user's local filesystem. |
| C: unsafe as a Runtime boundary | `WorkspacePathService.normalizeRelativePath`, `WorkspaceSecurityService.canonical/isEscapingSymlink`, discovery and `ToolScopeService.checkedPath` | Normalization trims/collapses forms; canonicalization can fall back to lexical paths; link inspection catches errors; pathname checks precede independent opens. No retained object chain or hard-link/race guarantee. Do not copy as confinement. |
| D: irrelevant / protected | PowerShellExecutor, ExecutionPlaneService/ExecutionPolicyService, AI/provider, auth, Prisma, frontend/SSE | Remain unchanged and disabled. Old executor is a placeholder; policy denies execution. |

Callers inspected: WorkspaceController and WorkspaceCapabilityService use binding /
project authorization before discovery/inspection. AgentContextBuilder and
EvidenceCollector use WorkspaceCapabilityService. Canonical tool authorization calls
ToolScopeService after registry/input/permission gates; Phase 0A records only a
non-dispatchable intent. None of these are wired to this spike.

Existing Windows tests use temporary junctions and symlinks in workspace/tool suites;
they do not exercise native relative handles, hard-link concurrency or sustained
rename/reparse races. Some symlink tests depend on host privilege.

Implementation choice: standalone C++17 native executable compiled with the already
installed MSVC toolchain. No dependency download. Only the test harness may create,
rename, link, or remove disposable fixtures. The confinement API exposes reads and
metadata only. The executable has no command/PowerShell/Git or arbitrary-root mode.

Baseline: Windows build 26200; local C: and D: report fixed NTFS. WMI/CIM inventory is
unavailable under the initial sandbox token; use native/.NET volume inventory. A
SHA-256 snapshot of 1,941 existing repository files was retained in tool-session
memory before editing. Cache/dependency trees and this new spike directory excluded.
