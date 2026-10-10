$ErrorActionPreference = 'Stop'
$auditRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendRoot = Join-Path $auditRoot 'backend'
$destination = Join-Path $auditRoot 'docs/audits'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$xml = [xml](Get-Content -LiteralPath (Join-Path $backendRoot '.runtime-state/post-audit-backend.xml') -Raw)
$tap = Get-Content -LiteralPath (Join-Path $backendRoot '.runtime-state/post-audit-backend.tap') -Raw
function Redact([string]$value) {
  $value -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_TEST_TOKEN]'
}
$hookBlocks = @{}
foreach ($match in [regex]::Matches($tap, '(?ms)^not ok \d+ - ([^\r\n]+)\r?\n  ---.*?^  \.\.\.')) {
  if ($match.Value.Contains("failureType: 'hookFailed'")) { $hookBlocks[$match.Groups[1].Value] = Redact $match.Value }
}
$rows = @()
foreach ($case in $xml.SelectNodes('//testcase[failure or skipped]')) {
  $file = [string]$case.file
  $file = $file.Replace('\\','\')
  $name = [IO.Path]::GetFileName($file)
  $outcome = if ($case.skipped) { 'SKIPPED' } elseif ($case.failure.type -eq 'cancelledByParent') { 'CANCELLED' } else { 'FAILED' }
  $class = 'UNKNOWN'; $reason = ''; $affected = ''; $evidence = @()
  if ($name -in @('auth-service-contract.test.ts','execution-plane.test.ts')) {
    $class = 'PRE_EXISTING'
    $affected = if ($name -eq 'execution-plane.test.ts') { 'Legacy execution-plane tests / Windows symlink privilege / source-text assertion' } else { 'Authentication cookie contract test' }
    $reason = if ($name -eq 'auth-service-contract.test.ts') { 'Known pre-runtime Secure assertion expects production cookie behavior in nonproduction NODE_ENV.' } elseif ($case.name -match 'symlink') { 'Known pre-runtime Windows file-symlink creation fails EPERM before capability behavior can be exercised.' } else { 'Known pre-runtime regex incorrectly matches the powershell.execute capability identifier; the legacy executor remains disabled.' }
    $evidence = @('docs/phase-0a-control-loop.md:117','docs/sekhem-mvp-repair-report.md:133','Pre-runtime and current source/test SHA256 equality')
  } elseif ($outcome -eq 'SKIPPED') {
    $class = 'ENVIRONMENT_DEPENDENT'; $affected = 'Opt-in PostgreSQL runtime integration suite'
    $reason = 'Full run explicitly leaves SEKHEM_RUNTIME_DB_TEST unset. This is intentional opt-in coverage, not an executed failure. The complete runtime suite was subsequently run with the flag set and passed.'
    $evidence = @('backend/test/trusted-runtime-persistence.test.ts:28','backend/.runtime-state/post-audit-runtime.tap')
  } elseif ($name -eq 'auth.http.test.ts' -and $case.name -eq 'clears session cookie on logout') {
    $class = 'OUTDATED_ASSERTION'; $affected = 'AuthController logout cookie assertion'
    $reason = 'Requires Secure even with NODE_ENV=development; AuthService.clearCookie deliberately adds it only in production. Status and logout-body assertions preceding it pass. AuthService and this test are unchanged from pre-runtime hashes.'
    $evidence = @('backend/src/auth/auth.service.ts:240','backend/test/auth.http.test.ts:182','backend/.runtime-state/post-audit-fixtures.tap')
  } elseif ($name -in @('http-smoke.test.ts','http-write.test.ts','rd-radar.http.test.ts')) {
    $class = 'TEST_INFRASTRUCTURE'; $affected = switch ($name) { 'http-smoke.test.ts' { 'Product HTTP read fixtures' } 'http-write.test.ts' { 'Product HTTP write fixtures' } default { 'R&D Radar HTTP fixtures' } }
    $reason = 'Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.'
    $evidence = @('backend/audit/post-runtime-fixtures.test.ts','backend/src/auth/auth.service.ts:132','backend/src/auth/authz.guard.ts','backend/.runtime-state/post-audit-fixtures.tap')
  } elseif ($name -in @('auth-rbac.http.test.ts','auth.http.test.ts','ai-gateway-provider-settings.test.ts','ai-patch.http.test.ts','automation-contract.test.ts')) {
    $class = 'TEST_INFRASTRUCTURE'; $affected = switch ($name) { 'auth-rbac.http.test.ts' { 'RBAC HTTP login setup' } 'auth.http.test.ts' { 'Auth HTTP login setup' } 'ai-gateway-provider-settings.test.ts' { 'Provider-settings HTTP suite login hook' } 'ai-patch.http.test.ts' { 'AI Patch HTTP suite login hook' } default { 'Automation HTTP suite login hook' } }
    $reason = 'Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.'
    $evidence = @('backend/audit/post-runtime-fixtures.test.ts','backend/src/auth/auth.service.ts:66','backend/.runtime-state/post-audit-fixtures.tap')
  }
  $rows += [pscustomobject][ordered]@{
    id = $rows.Count + 1
    test = [string]$case.name
    suite = [string]$case.classname
    file = $file
    outcome = $outcome
    classification = $class
    affectedModule = $affected
    errorAndStack = Redact ([string]$case.failure.InnerText).Trim()
    parentHookErrorAndStack = $hookBlocks[[string]$case.classname]
    skipReason = if ($outcome -eq 'SKIPPED') { 'SEKHEM_RUNTIME_DB_TEST !== 1 (boolean skip; reporter emits no stack)' } else { $null }
    reason = $reason
    evidence = $evidence
  }
}
if ($rows.Count -ne 91 -or ($rows | Where-Object classification -eq UNKNOWN)) { throw 'Incomplete classification' }
$rows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $destination 'trusted-runtime-nonpasses.json') -Encoding utf8NoBOM
$md = [Collections.Generic.List[string]]::new()
$md.Add('# Full backend nonpass ledger — 2026-09-23')
$md.Add('')
$md.Add('Exact results from the untouched full backend suite: 51 failed, 39 cancelled, 1 intentionally skipped. Each row has exactly one class. Error/stack blocks are preserved from JUnit, with signed test cookies redacted. Cancellation has no individual execution stack: the original failed parent-hook stack is included. A skipped test has no error/stack.')
$md.Add('')
$md.Add('The closest recorded pre-runtime baseline documents three identical exceptions; no complete pre-runtime full-suite capture exists. Fixture diagnosis is proven separately with read-only database/auth probes. A class of TEST_INFRASTRUCTURE identifies the observed cause, not an assertion that every downstream endpoint passes.')
$md.Add('')
foreach ($row in $rows) {
  $md.Add("## $($row.id). $($row.test)")
  $md.Add('')
  $md.Add("- Outcome: $($row.outcome)")
  $md.Add("- Class: $($row.classification)")
  $md.Add("- File: $($row.file)")
  $md.Add("- Suite: $($row.suite)")
  $md.Add("- Affected module: $($row.affectedModule)")
  $md.Add("- Evidence: $($row.evidence -join '; ')")
  $md.Add('')
  $md.Add($row.reason)
  $md.Add('')
  if ($row.errorAndStack) { $md.Add('~~~text'); $md.Add($row.errorAndStack); $md.Add('~~~') }
  if ($row.parentHookErrorAndStack) { $md.Add('Parent-hook error and stack:'); $md.Add('~~~text'); $md.Add($row.parentHookErrorAndStack); $md.Add('~~~') }
  if ($row.skipReason) { $md.Add($row.skipReason) }
  $md.Add('')
}
$md | Set-Content -LiteralPath (Join-Path $destination 'trusted-runtime-nonpasses.md') -Encoding utf8NoBOM
$rows | Group-Object classification,outcome | Select-Object Name,Count | ConvertTo-Json

