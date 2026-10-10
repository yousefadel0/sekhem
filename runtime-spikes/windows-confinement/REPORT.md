# SEKHEM Phase 0B-2 — Windows filesystem confinement spike

## 1. Executive summary

**READ_ONLY_FILESYSTEM: NO-GO. FILESYSTEM_MUTATION: NO-GO under the tested model.**
**PROCESS_EXECUTION and GIT: NOT_EVALUATED.**

The isolated native experiment completed on Windows 10.0.26200, x64, using a local
fixed NTFS volume. The final suite has **87 PASS, 3 FAIL, 9 SKIP (99 cases)**.
The failures are retained security hypotheses, not suppressed assertions.

The handle-relative reader denied the tested traversal, namespace, ADS, reparse,
sensitive-name, and object replacement attacks. However, holding a file open with
`FILE_SHARE_READ` does **not** prevent creating an additional hard link to that file.
Both `CreateHardLinkW` and `NtSetInformationFile(FileLinkInformation)` using a
preopened read-attributes handle created a same-object alias outside the selected
root while the reader retained its handle.

More decisively, a controlled create/read/remove interleaving bypassed link-count
and timestamp sampling: **823 of 1,000 attempts returned bytes while an outside-root
alias had existed during the actual ReadFile call**. The other 177 failed closed.
The alias identity was checked against the actual held source handle.

This is a demonstrated breach of the required hard-link policy. It is **not** a
claim that a junction redirected the reader to arbitrary outside-file content.
The file object remained the originally opened object; the forbidden alias was
temporarily created and removed. Object identity does not imply exclusive tree
membership, and pre/post metadata snapshots are not a continuous guarantee.

The normal API now fails closed with `HARD_LINK_POLICY_UNPROVEN`. The unsafe
`probeReadRelative` remains explicitly test-only to reproduce the failed hypothesis.
No production source or capability was changed or enabled.

Final authoritative evidence: `evidence/run-21492-99761515/`.
All numerical findings below refer to that run unless explicitly labelled otherwise.

## 2. Exact files created / changed and pre-edit audit

All authored repository files are NEW under:

`D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\runtime-spikes\windows-confinement\`

| New file | Purpose |
|---|---|
| `.gitignore` | Exclude generated native build products |
| `PRE_EDIT_AUDIT.md` | Required inspection/classification completed before implementation |
| `confinement.hpp` | Structured native C++ boundary and RAII handle types |
| `confinement.cpp` | Root registration, relative resolution, policy/read experiment, fail-closed normal API |
| `adversarial-tests.cpp` | Disposable fixture broker, native API controls, race harness, evidence writer |
| `build.ps1` | Fixed MSVC build and source/binary hash manifest |
| `run.ps1` | Fixed executable runner with bounded iteration parameter |
| `README.md` | Reproduction instructions and quarantine warning |
| `REPORT.md` | This report |

Generated artifacts are `build/confinement-spike.exe`, two `.obj` files,
`build/manifest.json`, and the evidence directories. `evidence/ARTIFACTS.json` lists
the exact absolute paths, byte sizes and SHA-256 values for the retained files;
it excludes itself. `evidence/protected-boundaries.json` records the protection
check. Temporary fixture roots are separately listed in each run's
`fixture-location.txt`; they are not real user workspaces.

No pre-existing repository file changed. A before/after comparison of **1,941**
files found **0 changes, 0 additions, 0 deletions outside this spike**. Dependency
and cache trees, `.git`, `.next`, and the spike directory are excluded from that
snapshot. There is no `.git` directory in this checkout, so this is a content-hash
comparison rather than a Git status claim.

Pre-edit classification:

| Class | Inspected pieces | Conclusion |
|---|---|---|
| A — reusable policy | Sensitive names/extensions/ancestors, explicit allowed paths, all affected tool paths, byte bounds, project permissions and approval constraints | Preserve independently of native containment |
| B — backend-host-only | WorkspaceBindingService/configuration, WorkspaceSourceResolver, backend canonical paths and discovery | Cannot establish authority on another machine |
| C — unsafe as confinement | Trimming/collapsing path normalization; lexical fallback after realpath failure; check-before-open operations; link inspection catch paths; no hard-link model | Do not reuse as a kernel boundary |
| D — irrelevant/protected | PowerShellExecutor/ExecutionPlane, provider, auth, Prisma, frontend/SSE | Untouched; never activated |

Actual callers inspected include WorkspaceController/WorkspaceCapabilityService,
AgentContextBuilder/EvidenceCollector, canonical ToolScope authorization, and the
Phase 0A non-dispatchable intent. Existing Windows suites test temporary links and
junctions but do not establish retained-handle or concurrent hard-link guarantees.

## 3. Windows APIs actually used

Boundary APIs:

- `NtCreateFile` through `ntdll.dll`, with `OBJECT_ATTRIBUTES.RootDirectory`.
- `OBJ_CASE_INSENSITIVE`, `OBJ_DONT_REPARSE`, `FILE_OPEN_REPARSE_POINT`,
  `FILE_SYNCHRONOUS_IO_NONALERT`, disposition `FILE_OPEN`.
- `GetFileInformationByHandleEx`: FileIdInfo, FileStandardInfo,
  FileAttributeTagInfo and FileBasicInfo.
- `NtQueryInformationFile(FileCaseSensitiveInformation)` (information class 71).
- `GetFinalPathNameByHandleW(FILE_NAME_NORMALIZED | VOLUME_NAME_GUID)`.
- `GetVolumeInformationByHandleW`, `GetDriveTypeW`, `GetFileType`.
- `DuplicateHandle`, `ReadFile`, `CloseHandle`, `CompareStringOrdinal`,
  `IsNormalizedString`.

Harness-only APIs include `CreateDirectoryW`, `CreateFileW`, `WriteFile`,
`CreateHardLinkW`, `CreateSymbolicLinkW`, `MoveFileW`, `DeleteFileW`,
`RemoveDirectoryW`, `DeviceIoControl(FSCTL_SET_REPARSE_POINT)`,
`NtSetInformationFile(FileLinkInformation/FileCaseSensitiveInformation)`,
`GetShortPathNameW` and `GetProcessHandleCount`.

Mutation APIs are confined to fixture setup/attacks; none is a tool operation in the
confinement boundary. **NT native APIs are required by this prototype.** It is not
a Node/TypeScript path-containment implementation.

The documented directory-relative and reparse mechanisms were verified against
actual observations rather than assumed from flags:
[NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile),
[OBJECT_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/ntdef/ns-ntdef-_object_attributes).

## 4. Root registration implementation

`Fixtures` creates a fresh random directory under Windows TEMP, opens a retained
anchor handle, and checks directory/reparse/volume properties. No CLI option accepts
an arbitrary root. The native `Root(anchor, relativeDirectory)` duplicates the
trusted fixture anchor and opens each selected directory component relative to
the preceding handle. It retains the full handle chain.

Root identity consists of the handle-derived volume serial and 128-bit file ID.
The normalized volume-GUID path is retained locally to detect name changes, not
used to authorize a later path-string reopen. Registration rejects reparses,
non-directories, aliases, case-sensitive directories, non-fixed/non-NTFS volumes,
unsupported identity queries and volume roots. The selected root's handle and
identity remain the operation anchor.

During registration/reads the retained directory handles have only the required
read/list/attribute/synchronize rights and `FILE_SHARE_READ`, without share-write
or share-delete. Replacement of the registered root was denied while held. After
unregistration, replacing a disposable directory produced a different object ID.

The spike does not implement a production picker, binding version, attestation,
user authentication, or authorization grant. The fixture anchor is established by
the harness; a future selection/registration broker still needs its own review.

API references: [file identity](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info),
[final path](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew),
[volume information](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew).

## 5. Relative resolution and path policy

The experimental reader accepts a UTF-16 relative string and an integer byte bound.
It does not trim, collapse, or repair suspicious forms. The wire-like path syntax
uses forward slashes only; each validated component is passed alone to NtCreateFile
with the previously opened directory as RootDirectory. All intermediate and leaf
handles stay open through the read and post-read checks.

Rejected forms include absolute/drive-qualified/drive-relative paths, UNC/device
namespaces, GLOBALROOT, colon/ADS, traversal, empty/dot components, backslashes,
trailing separators, trailing dot/space, leading whitespace, reserved devices,
embedded NUL, invalid surrogate pairs, non-NFC strings, selected bidi/confusable
separators, wildcards, overlong components and excessive depth/length. The limits
are 1,024 UTF-16 code units total, 255 per component and 16 components.

After opening each component, the code checks object type, reparse attributes,
delete-pending state, volume identity, case-sensitive directory mode, actual long
name and sensitive-name policy. Case-insensitive ordinary names work. On this
volume an 8.3 alias existed for a sensitive dummy filename; the actual long-name
check returned `SENSITIVE_PATH_DENIED`.

This separately demonstrates:

- **CONFINED != AUTHORIZED:** the `.env` fixture is an in-root object but its content
  is denied by policy.
- **AUTHORIZED PATH NAME != SAFE OBJECT RESOLUTION:** an innocuous junction name
  is still rejected as a reparse object.

Only name policy is demonstrated here. Production text/binary/secret-content
classification is not implemented or replaced; real source/user content was never
read by the spike.

## 6. Reparse findings

Exact metadata-only junction flag probes:

| NtCreateFile object/options combination | Observed result |
|---|---|
| Neither no-reparse flag | Followed the junction to the outside fixture directory; negative control, no outside bytes read |
| OBJ_DONT_REPARSE only | Rejected, NTSTATUS `0xC000050B` |
| FILE_OPEN_REPARSE_POINT only | Opened the reparse object itself, not its target |
| Both flags | Opened the reparse object itself; attribute inspection was still required to deny it |

Consequently, success of the native open is **not** sufficient. The explicit
`FILE_ATTRIBUTE_REPARSE_POINT` check remains mandatory.

Passed cases: in-root junction, escaping junction, nested junction, selected root
being a junction, registration through an intermediate junction, a junction
introduced after input validation, and concurrent junction swapping.

File/directory symbolic-link creation failed with Win32 `1314`
(`ERROR_PRIVILEGE_NOT_HELD`). Three static symlink tests and one symlink race are
SKIP. Developer Mode/admin rights were not enabled. Unknown reparse tags and filter
drivers were not independently exercised and cannot be claimed proven.

## 7. Hard-link findings

| Hypothesis / observation | Result |
|---|---|
| Already multiply linked file is denied | PASS, both in-root and outside-root aliases |
| Share-read-only file handle prevents a new outside hard link | **FAIL**, CreateHardLinkW succeeded |
| Preopened read-attributes handle cannot add a hard link | **FAIL**, NtSetInformationFile class 11 returned success and alias identity matched |
| Preopened DELETE/write-attributes handle causes reader to deny | PASS, sharing conflict / `RACE_DETECTED` |
| Pre/post link count, size and timestamp checks catch every transient hard link | **FAIL**, 823/1,000 controlled attempts released bytes |

Controlled failing interleaving:

1. Reader opens the source handle with share-read only; link count is one.
2. Reader finishes its pre-read object check.
3. Attacker creates an alias under the outside fixture; alias and held source IDs match.
4. Reader calls ReadFile while that alias exists.
5. Attacker removes the alias before the post-read metadata check.
6. Reader either denies because a sampled property changed (177) or returns bytes (823).

The exact NTFS timestamp-update cause of the difference is not established. The
observations are sufficient to disprove continuous protection using sampled
link-count/timestamp checks. Adding more samples would not establish atomicity.

A registered directory's sharing mode blocked certain incoming rename/link
operations targeting that directory (Win32 32), but did not prevent linking its
files into a different, unheld directory. Therefore directory sharing cannot be
used as a general hard-link defense.

Reference for the tested native hard-link information class:
[FILE_LINK_INFORMATION](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_link_information).

## 8. Race / TOCTOU findings

Five independent attack arenas each ran 10,000 reads with a concurrent adversarial
thread. The harness records before/opened identities, outcomes, escape flags and
fail-closed status per iteration. Interrupted swaps are retried through explicit
attack states instead of being silently abandoned after a failed restore.

| Attack | Attempts | Successful fixture changes | Reads | Safe denials | Observed object-tree escapes |
|---|---:|---:|---:|---:|---:|
| File replacement | 16,148 | 8,344 | 411 | 9,589 | 0 |
| Parent moved outside root | 2,652 | 1,960 | 1 | 9,999 | 0 |
| Junction introduction/removal | 4,698 | 1,894 | 73 | 9,927 | 0 |
| Hard-link create/remove | 9,965 | 9,965 | 218 | 9,782 | 0 |
| Replacement by multiply linked object | 13,340 | 7,811 | 161 | 9,839 | 0 |
| **Total** | **46,803** | **29,974** | **864** | **49,136** | **0** |

Zero observed tree escapes in these stress tests does not mean zero hard-link policy
breaches: the separately synchronized 1,000-attempt test proved that breach. The
trace deliberately distinguishes `escape` from `hardLinkPolicyBreach`.

Synchronized attempts to rename the held target, move its held parent, or delete
the held target were denied. Ancestor/leaf handles were retained, not reopened by
path. Stress counts are scheduling-dependent and are not a formal proof against
every Windows filesystem race.

## 9. Unsupported environment findings

| Environment/property | Availability / actual test | Capability disposition |
|---|---|---|
| C: local fixed NTFS, Windows 26200 | TESTED with disposable fixtures | Overall UNSUPPORTED / NO-GO because hard-link policy failed |
| D: local fixed NTFS | AVAILABLE by read-only inventory; native fixture suite not run there | UNKNOWN / unsupported for release |
| ReFS | NOT AVAILABLE in disposable environment; SKIP | UNSUPPORTED by NTFS-only registration policy |
| FAT/exFAT | NOT AVAILABLE; SKIP | UNSUPPORTED by registration policy |
| Removable volume | NOT AVAILABLE; SKIP | UNSUPPORTED by fixed-volume policy |
| UNC/network share | Lexical rejection TESTED without network access; real share NOT AVAILABLE | UNSUPPORTED |
| Volume root | Metadata rejection TESTED | UNSUPPORTED |
| Reparse root | Junction rejection TESTED | UNSUPPORTED |
| Ordinary case-insensitive directories | Handle query and mixed-case reads TESTED | Mechanism works; overall read gate remains closed |
| Case-sensitive directory mode | Query on ordinary directories worked; enabling mode on fixture returned `0xC0000022` | Positive-mode integration UNKNOWN / SKIP; detected flags fail closed |
| File/directory symbolic links | Creation returned 1314 | NOT TESTED / SKIP; no symbolic-link support claimed |
| 8.3 aliases | Alias existed and sensitive long-name denial TESTED | No alias expansion authorized |

No filesystem was formatted/mounted, no network share contacted, no privilege or
Developer Mode enabled, and no administrator token was requested.

## 10. Native API contract and failure model

This is a C++ spike interface, not a production ABI:

| Implemented operation | Contract |
|---|---|
| `Root(fixtureAnchor, selectedRelativeDirectory)` | Registers retained directory-object chain; structured relative selection only |
| `Root::identity()` | Volume + file ID, no root path |
| `Root::readRelative(relativePath, maxBytes)` | **Quarantined**: returns DENIED / HARD_LINK_POLICY_UNPROVEN, no target read |
| `Root::probeReadRelative(relativePath, maxBytes, hook)` | Test-only failing prototype; maximum 4,096 bytes |
| Root/Handle destructors | Close retained handles on success, denial and exceptions |

`inspectHandle`, `nativeOpen`, `finalName` and `handleForTest` are experiment/internal
helpers, not a remote API. Test hooks run synchronously inside the test executable;
they are never accepted from JSON, IPC or a backend. There is no shell, executable,
PowerShell, Git, write, delete, move or copy operation in the boundary API.

ReadResult contains status (`READ` or `DENIED`), bytes (length is bytes read),
truncation, object identity, observed link counts and sanitized code. Denials return
zero bytes and no absolute root path. The only absolute fixture location is in a
separate harness provenance file.

Implemented stable failures: INVALID_RELATIVE_PATH, UNSUPPORTED_ROOT,
ROOT_IDENTITY_CHANGED, REPARSE_POINT_DENIED, HARD_LINK_POLICY_DENIED,
HARD_LINK_POLICY_UNPROVEN, OBJECT_CHANGED, OUTSIDE_ROOT_DENIED,
SENSITIVE_PATH_DENIED, NOT_FOUND, ACCESS_DENIED, TOO_LARGE,
UNSUPPORTED_OBJECT, RACE_DETECTED, INTERNAL_FAILURE.

Unexpected exceptions become INTERNAL_FAILURE. Sharing/delete-pending conflicts
are RACE_DETECTED. Security denials are not silently relabelled NOT_FOUND. The
OUTSIDE_ROOT_DENIED guard checks volume inconsistency; tree containment is enforced
by the relative handle chain, not by a pathname-prefix test.

## 11. Exact test matrix and build/run commands

Final run: **87 PASS / 3 FAIL / 9 SKIP**, 99 test cases, 50,000 concurrent race reads,
1,000 synchronized hard-link races, 1,000 successful registration/read cycles and
1,000 failed-registration cleanup cycles.

| Category | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| A Ordinary reads | 3 | 0 | 0 |
| B Nested/object-type reads | 2 | 0 | 0 |
| C Traversal/ambiguous components | 6 | 0 | 0 |
| D Absolute/drive paths | 3 | 0 | 0 |
| E UNC/device namespaces | 5 | 0 | 0 |
| F ADS/colon | 3 | 0 | 0 |
| G Reserved names | 6 | 0 | 0 |
| H Trailing/leading ambiguity | 3 | 0 | 0 |
| I Unicode/normalization/8.3 | 12 | 0 | 0 |
| J Symbolic links | 0 | 0 | 3 |
| K Junctions | 2 | 0 | 0 |
| L Nested reparses | 1 | 0 | 0 |
| M Reparse registration | 2 | 0 | 0 |
| N Existing/replacement hard links | 3 | 0 | 0 |
| O Concurrent/preopened/ABA hard links | 2 | 3 | 0 |
| P Rename/parent move | 3 | 0 | 0 |
| Q Replacement | 2 | 0 | 0 |
| R Reparse introduction | 2 | 0 | 1 |
| S Root identity | 2 | 0 | 0 |
| T Bounded reads | 4 | 0 | 0 |
| U Errors/sanitization | 2 | 0 | 0 |
| V/W Handle cleanup/repeated registration | 2 | 0 | 0 |
| X Unsupported roots/environments | 3 | 0 | 5 |
| Policy separation | 8 | 0 | 0 |
| Native flag probes | 4 | 0 | 0 |
| Rename diagnostic | 1 | 0 | 0 |
| Normal API fail-closed gate | 1 | 0 | 0 |
| **Total** | **87** | **3** | **9** |

The three exact failing assertions are:

- `O hard link creation during held read` — HARDLINK_CREATED_DURING_HELD_READ.
- `O preopened read-only handle cannot add link` — PREOPENED_LINK_BYPASS.
- `O hard-link ABA spans actual read` — CRITICAL_HARDLINK_ABA_BYTES_RELEASED.

Build: PASS with MSVC 14.51.36231, Windows SDK 10.0.26100.0, C++17, x64,
`/W4 /WX /O2`. No dependency install and no application build/typecheck were needed
or run; production source is unchanged.

Exact commands used from the repository root:

```powershell
& '.\runtime-spikes\windows-confinement\build.ps1'
& '.\runtime-spikes\windows-confinement\run.ps1' -Iterations 10000
```

The build script initializes the existing developer environment and invokes:

```text
cl /nologo /std:c++17 /EHsc /W4 /WX /O2 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX /Fe:build\confinement-spike.exe /Fo:build\ confinement.cpp adversarial-tests.cpp /link normaliz.lib
```

Native suite exit code: **1**, correctly propagated by the runner. Source and binary
hashes for this build are retained in `build/manifest.json`. Binary SHA-256:
`548A1099BFB75D84C1306F6E597F8CE58B36C43DD65577ADD0887736D79A4682`.

Development evidence is retained, not represented as final acceptance:

- `run-5752-99073062`: preliminary fixture setup aborted; incomplete run.
- `run-16672-99234468`: 82/7/9; exposed harness restore/setup issues under retained
  directory sharing as well as the hard-link failures.
- `run-14208-99450921`: 86/3/9 with 2,000 iterations per race after independent
  arenas/stateful restore handling.
- `run-21852-99579234`: 87/3/9 with 10,000 iterations; 795/1,000 controlled hard-link
  attempts released bytes.
- `run-21492-99761515`: final source/manifest run reported above; 823/1,000.

The directory/file sharing restrictions were not weakened to improve test counts.
The harness was corrected to attack unheld child arenas and retry partial swaps.

## 12. Security proof table

Results describe finite observed tests, not formal proof or production certification.

| Property | Implementation mechanism | Windows primitive | Evidence/test | Result | Residual risk |
|---|---|---|---|---|---|
| Root identity anchoring | Retained root/ancestor handles, volume + 128-bit ID | FileIdInfo, DuplicateHandle | S identity/replacement tests | PASS observed | Production root-selection broker absent |
| Tree containment | Component-at-a-time opens from parent handles | NtCreateFile RootDirectory | Five stress races, identity/sentinel comparisons | PASS observed, zero tree escapes | Does not establish unique hard-link membership |
| Traversal denial | Reject, do not normalize | Strict C++ validator | C cases | PASS | New path forms require review |
| Reparse denial | No-reparse open plus explicit attribute denial | OBJ_DONT_REPARSE, FILE_OPEN_REPARSE_POINT, FileAttributeTagInfo | K/L/M/R and flag controls | PASS for junctions | Symlinks skipped; other tags/filter drivers untested |
| ADS denial | Reject every input colon | Validator | F cases | PASS | No stream enumeration API provided |
| Device/UNC denial | Relative syntax only | Validator | D/E/X cases | PASS | Network integration intentionally absent |
| Object replacement | Held leaf and intermediate handles | Share-read without share-delete/write | Q tests and replacement races | PASS observed | Native sharing does not prevent hard links |
| Rename resistance | Keep all resolved ancestors open | Sharing and retained handles | P synchronized and stress cases | PASS observed | Platform/filter/privileged bypasses not proven |
| Hard-link policy | Count before/after plus metadata checks | FileStandardInfo, FileBasicInfo | N/O controls and ABA | **FAIL** | Outside aliases can exist during read and disappear before sampling |
| Bounded reads | Validate 1..4096, allocate/read at most bound | ReadFile | T tests | PASS experimental | Normal API deliberately disabled |
| Sanitized errors | Stable codes, no native path strings | Typed Failure/ReadResult | U tests | PASS | Harness provenance file separately contains dummy fixture location |
| Sensitive object names | Check requested and handle-derived long names | GetFinalPathNameByHandleW | Policy tests and 8.3 fixture | PASS observed | Content authorization/extraction remains separate |
| Cleanup | Move-only RAII handles, exception unwinding | CloseHandle/GetProcessHandleCount | V/W repeated and failed registration | PASS, 63 before / 63 after | Fixture files intentionally retained |
| Unsupported guarantee | Quarantine normal read entry | No target I/O | GATE test | PASS fail-closed | Experimental probe must remain isolated |

## 13. Residual risks

- The hard-link invariant failed; this model cannot support production read or
  mutation permission under the required policy.
- The test used one Windows build, one NTFS test volume and a non-elevated token.
- Concurrent attackers are native threads with independent handles in one process;
  cross-process and cross-principal matrices remain untested.
- Symlink privilege and case-sensitive fixture creation were unavailable. No PASS
  substitutes were manufactured.
- Unknown reparse tags, filter drivers, cloud placeholders, alternate filesystem
  implementations, kernel/admin attackers and malicious storage are unproven.
- Pre-existing writable mappings and full file-content snapshot consistency were
  not evaluated. File object identity is not an immutable-content guarantee.
- The sensitive-name copy is a spike demonstration, not a new production policy
  source. Binary/text/secret interpretation remains outside this boundary.
- The temporary fixture anchor bootstrap is harness-owned, not a completed secure
  interactive root-selection design.
- Fixture directories remain in TEMP for inspection. There is no recursive deletion
  that could follow adversarial links. Handle resources, however, were released.

## 14. READ_ONLY_FILESYSTEM disposition

**NO-GO.** Ordinary bounded reads and several containment mechanisms worked, but
the mandatory hard-link policy did not. `Root::readRelative` now denies every
request without reading it. The passing fail-closed gate is separate from, and
does not erase, the three experimental FAIL results.

## 15. FILESYSTEM_MUTATION disposition

**NO-GO under the proposed model.** No filesystem mutation tool was implemented or
approved. Fixture mutation was solely adversarial test machinery. No mutation
safety is inferred from read results, and the failed continuous alias restriction
prevents advancing this model to mutation. PROCESS_EXECUTION and GIT remain
**NOT_EVALUATED**.

## 16. Protected boundaries

No existing files changed in the 1,941-file protection snapshot. No Prisma/schema,
migrations, database operations, provider/model configuration, AI Gateway, identity
prompts, authentication/session semantics, Phase 5B/0A semantics, production
workspace binding, frontend, SSE or production Runtime module was changed.

No provider calls, pairing, WebSocket, deployment, application restart, terminal tool,
Git tool or execution activation occurred. All native spike reads and adversarial
mutations used disposable fixtures; repository files were inspected only for the
required audit and protection hashes. PowerShell hosted audit, build, test and report
commands; neither PowerShellExecutor nor ExecutionPlane was invoked. No new package
manifests/lockfiles were introduced.

## 17. Recommended next phase

Do **not** proceed to production filesystem access or mutation using this boundary.
The next useful task is a separately scoped **0B-2A hard-link isolation investigation**:
evaluate an enforceable OS security/ownership boundary or broker/snapshot design
against the same failing interleaving. A private snapshot alone must not be assumed
to solve authorized source acquisition. Require an explicit security argument and
cross-process adversarial tests before lifting the quarantine.

Retain the present reproducer unchanged as a regression gate. A new approach must
prevent the forbidden condition, not merely add metadata samples, suppress the
failing test, weaken the policy or advertise the Runtime as ready.
