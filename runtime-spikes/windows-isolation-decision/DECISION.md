# Phase 0B-2A — deadline decision

**NO SAFE LOCAL READ ARCHITECTURE DEMONSTRATED.**

**Decision: NO-GO.** No architecture is approved for MVP integration. This is a
failure to demonstrate a safe architecture in this environment, not a claim that
every AppContainer, ACL or snapshot design is impossible.

## 1–3. Architecture results

| Family | Actual result | Decision |
|---|---|---|
| A — AppContainer broker | A compiled disposable child-process/pipe prototype exists. Initial sandbox launch failed with Win32 2. The corrected, profile-backed version was blocked before execution by Windows Application Control. No isolated reader token or attack matrix was validated. | NO-GO / runtime tests SKIP |
| B — ACL/restricted-principal broker | Two fixture ACL inheritance controls passed. The host token was already restricted; creating the intended restricting-SID token failed with Win32 87. A normal-user run was then blocked by Application Control. No separate reader identity was demonstrated. | NO-GO / broker tests SKIP |
| C — bounded reconstruction into an isolated read environment | Source acquisition and destination isolation experiments were implemented but did not execute. The retained 0B-2 source-acquisition failure remains unresolved. No snapshot architecture passed. | NO-GO / new runtime tests SKIP |

The normal-user run received sandbox escalation approval, then Windows refused to
start the executable: **“An Application Control policy has blocked this file.”**
This was not an automatic approval-review rejection. No policy, allowlist, signing,
antivirus, privilege or interpreter workaround was attempted. The unsigned binary
was observed separately; the precise blocking rule/cause was not established.

Available SDK/API inspection found AppContainer profile/SID APIs,
SECURITY_CAPABILITIES, the LPAC process attribute and restricted-token APIs.
AppContainer/profile APIs were exported by the installed userenv.dll. Availability
does not prove successful isolation. Packaged Win32 app isolation and LPAC were
not activated. Microsoft's [AppContainer launch procedure](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)
and [Win32 isolation overview](https://learn.microsoft.com/en-us/windows/win32/secauthz/app-isolation-overview)
were checked; no package/service installation was attempted.

## 4. Exact hard-link evidence

The original reproducer remains authoritative and unchanged:

- CreateHardLinkW created an alias during the held read.
- NtSetInformationFile(FileLinkInformation) succeeded; object identity matched.
- Controlled alias-create / ReadFile / alias-remove sequence: **823/1,000 byte
  releases; 177 denials**.
- This violated the required alias policy, without demonstrating arbitrary
  outside-file content redirection.

**New A/B/C hard-link results: none obtained.** Do not attribute the old 823/1,000
measurement to AppContainer or a restricted-principal broker.

## 5–6. Boundary assessment and recommendation

| Required dimension | A — AppContainer | B — ACL/restricted principal | C — reconstructed snapshot |
|---|---|---|---|
| Security boundary | Package SID + user permissions | Restricted token + object DACL | Source acquisition, then separate destination/read identity |
| Windows enforcement | Documented permission intersection; not demonstrated here | Fixture ACE inheritance observed; reader access checks untested | Fresh byte reconstruction proposed; isolation untested |
| Hard links | Attacker exclusion not established | ACE inheritance is not an exclusive-membership guarantee | Source-acquisition race unresolved; destination ownership unproven |
| Junctions | Matrix blocked | Matrix blocked | Source rejection / destination metadata checks blocked |
| Rename/replacement | Held-read test hooks prepared; unrun | Same | Acquisition consistency unproven |
| Privileges | Profile creation/launch need an allowed host; no admin requested | Normal source token needed for a meaningful comparison | Controlled copier and isolated reader prerequisites unresolved |
| Performance | Not measured | Not measured | Not measured; copying adds bytes/time and stale-evidence concerns |
| Complexity estimate | Profile lifecycle, token verification, IPC and policy integration | Principal lifecycle, inherited grants and attacker rights | Secure acquisition plus separate storage/reader lifecycle |
| UX impact | Permission/grant lifecycle | Permission/ownership changes may be required | Refresh/snapshot age must be explicit |
| Residual assumptions | Reader isolation must not be confused with excluding a different attacker | Must protect the object from the normal-user attacker, including retained handles | A clean destination cannot retroactively authorize an unsafe source read |
| New validation | No isolated read validated | 2 ACL controls only | No new test executed |

**Recommendation: no architecture selected.** AppContainer is a documented process
boundary; that fact alone does not resolve this task's continuous hard-link
invariant. The distinction between reader permissions and attacker permissions is
an architectural inference requiring the blocked tests, not a claimed new result.
See Microsoft's [AppContainer isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)
and [restricted-token access checks](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken).

## 7–9. Remaining MVP scope and steps

**Local Runtime integration scope in this batch: none.** No authenticated local
bridge, picker, binding, Agent evidence integration or production activation was
created. No credible completion estimate can be given before a security gate
passes. Do not promise this feature within the remaining five hours.

All Local Runtime filesystem access remains disabled. Mutation, copy tools,
terminal, Git, process execution, pairing, WSS and persistence remain disabled.
The demo must not claim validated local-PC project access from this spike.

If separately authorized later:

1. Obtain an approved test environment that permits the disposable executable and
   provides a normal-user attacker token; do not disable the current host policy.
2. Execute A/B/C with verified token identities, all required attack cases and the
   unchanged 0B-2 reproducer. Expand race coverage before any GO.
3. Only after a demonstrated GO, estimate and scope identity, selection, binding,
   bounded reads, provenance and Agent integration. Execution remains blocked.

## 10. Build, tests and protected files

Native build: **PASS**, MSVC C++17, /W4 /WX /O2 /MT. Both build attempts succeeded.

Initial development run **run-20360-102166171**: **2 PASS / 0 FAIL / 1 SKIP, then
FATAL setup abort**. These were two B ACL inheritance controls and A launch SKIP;
the fatal B setup is not a passing test. This incomplete run predates the final
profile-backed source and does not validate the final binary.

Final binary execution: **BLOCKED before startup; 0 tests executed**.
Prepared cases include structured input denials, fixed OS access controls,
junctions, incoming/outgoing hard links, held rename/replacement, 1,000-attempt
cross-process hard-link interleavings, sensitive names, ADS, and separate snapshot
source/destination checks. They are **not** reported as executed. This remains a
decision spike, not a complete race-coverage certification suite.

Commands from the repository root:

~~~powershell
& '.\runtime-spikes\windows-isolation-decision\build.ps1'
& '.\runtime-spikes\windows-isolation-decision\run.ps1'
~~~

New files only under runtime-spikes/windows-isolation-decision/:
isolation-decision.cpp, fixture-support.hpp, build.ps1, run.ps1, .gitignore,
DECISION.md, README.md, build products and evidence. The original confinement
implementation is compiled read-only as a dependency; its files were not edited.

SHA-256 comparisons: **1,941 existing repository files unchanged; all 39 retained
0B-2 files unchanged**. No provider, database, authentication, authorization,
Phase 0A, production binding, frontend, SSE or production Runtime changes.
No provider calls. Only disposable dummy fixtures were used.

The corrected binary never started, so its AppContainer profile creation and
cleanup code did not run. No AppContainer profiles or Windows accounts were
created by the executed initial version. Disposable fixture ACLs/files remain
for inspection; no recursive cleanup was attempted.
