# Windows filesystem confinement spike — NOT A RUNTIME

This isolated C++17 experiment is not imported by the application. It accepts only
an iteration count, creates its own random disposable directory under Windows TEMP,
and never accepts a workspace/root/command from the caller. The adversarial fixture
broker is the only code that creates, links, renames or removes test objects.

**READ_ONLY_FILESYSTEM: NO-GO. FILESYSTEM_MUTATION: NO-GO under this model.**
The proposed no-hard-links-during-read guarantee was disproved. `Root::readRelative`
therefore returns `HARD_LINK_POLICY_UNPROVEN` without opening or reading a target.
`Root::probeReadRelative` is an explicitly experimental test path retained to
reproduce the failing hypothesis. Do not import, dispatch or enable it.

## Build and run

From `D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main`:

```powershell
& '.\runtime-spikes\windows-confinement\build.ps1'
& '.\runtime-spikes\windows-confinement\run.ps1' -Iterations 10000
```

The build uses the existing MSVC x64 installation found by `vswhere`, Windows SDK,
and `normaliz.lib`. No packages are installed. `/W4 /WX` treats warnings as errors.
The exact compiler command and source/executable SHA-256 hashes are in
`build/manifest.json`. The runner's nonzero exit is intentional when a security
hypothesis fails; it must not be suppressed or reclassified as PASS.

The binary can be invoked directly from this directory:

```powershell
& '.\build\confinement-spike.exe' 10000
```

## Evidence and fixtures

Each invocation writes a new `evidence/run-<pid>-<tick>/` directory:

- `tests.jsonl`: one PASS/FAIL/SKIP per test case.
- `observations.jsonl`: native flag results, hard-link findings, race aggregates.
- `races.jsonl`: per-read before/opened object IDs, operation, result, escape and
  fail-closed observations; controlled ABA entries also report outside-alias proof.
- `summary.json`: exact test counts and release dispositions.
- `fixture-location.txt`: harness-only local fixture provenance, separate from
  native result/error output. No provider/user data is present.

Fixtures are intentionally retained, not recursively deleted. No cleanup command
is supplied because fixtures contain links; deletion must never follow them into
another tree. All targets, including the test's “outside root,” are beneath the
same random disposable fixture directory. Handle cleanup is independently tested.

## Boundary and limitations

The experiment uses parent-relative `NtCreateFile`, held handles, no-reparse flags,
handle identity and metadata, strict input rejection, name policy and a 4 KiB read
limit. No `realpath` or unchecked absolute-path reopen exists in the read path.
Handle-derived paths are used for object-name policy/change observations, not as
the containment boundary.

Ordinary positive reads occur only through the experimental path. They do not
constitute authorization or text/secret classification. Production content-reading
policy would still be required independently, but no such integration is present.

The outside hard-link can be created using both `CreateHardLinkW` and a preopened
read-attributes handle with `NtSetInformationFile(FileLinkInformation)`. Link-count
and timestamp sampling can miss a link created after the pre-read check and removed
after `ReadFile` but before the post-read check. The suite intentionally preserves
these FAIL assertions. See REPORT.md for the measured disposition and limitations.

Unavailable symbolic-link privilege, case-sensitive setup and filesystem types are
SKIP, never simulated PASS. No administrator elevation, privilege enablement, WSL
installation, volume formatting, network share access or filesystem policy change
is performed by this spike.
