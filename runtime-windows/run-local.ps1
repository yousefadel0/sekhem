param(
  [string]$RuntimeUrl = 'https://localhost:7443',
  [string]$WebUrl = 'http://localhost:3000',
  [string]$TrustedCa,
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'SEKHEM\trusted-runtime'),
  [switch]$PairOnly,
  [switch]$SkipBuild,
  [switch]$Version
)
$ErrorActionPreference = 'Stop'
# Local development launcher. Does not sign, does not publish, does not disable Smart App Control.
# Unsigned WinForms host EXEs are blocked on this machine by Application Control (SAC enforcement).
# The worker runs under the vendor-signed Node binary already required by build.ps1.
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $TrustedCa) {
  $defaultCa = Join-Path $repoRoot 'backend\.runtime-state\localhost.crt'
  if (Test-Path -LiteralPath $defaultCa) { $TrustedCa = $defaultCa }
}

function Get-LatestPayload {
  $builds = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'out') -Directory -Filter 'build-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  foreach ($build in $builds) {
    $candidate = Join-Path $build.FullName 'payload'
    if (Test-Path -LiteralPath (Join-Path $candidate 'runtime-client.cjs')) { return $candidate }
  }
  return $null
}

if (-not $SkipBuild) {
  $buildArgs = @{ RuntimeUrl = $RuntimeUrl; WebUrl = $WebUrl; PayloadOnly = $true }
  if ($TrustedCa) { $buildArgs.TrustedCa = $TrustedCa }
  & (Join-Path $PSScriptRoot 'build.ps1') @buildArgs
}

$payload = Get-LatestPayload
if (-not $payload) { throw 'No local payload. Run without -SkipBuild, or run build.ps1 -PayloadOnly first.' }

$node = Join-Path $payload 'node.exe'
$worker = Join-Path $payload 'runtime-client.cjs'
$picker = Join-Path $payload 'SekhemFolderPicker.exe'
$manifestPath = Join-Path $payload 'build-manifest.json'
if ((Get-AuthenticodeSignature -LiteralPath $node).Status -ne 'Valid') { throw 'Local worker must run under vendor-signed Node; node.exe signature is not Valid' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.conditionalWriteProtocol -ne 1) { throw 'Local payload does not declare conditionalWriteProtocol 1' }
if ($manifest.release -eq $true) { throw 'Refusing to use a release payload in the local unsigned launcher' }
if (-not (Select-String -LiteralPath $worker -Pattern 'conditionalWriteProtocol' -Quiet)) { throw 'Local runtime-client.cjs does not contain conditionalWriteProtocol' }
if (-not (Test-Path -LiteralPath $picker)) { throw 'Local folder picker is missing from the payload' }

Get-ChildItem -LiteralPath $payload -File | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

Write-Output "Local development payload: $payload"
Write-Output 'Windows Application Control/Smart App Control blocks the unsigned SEKHEM Runtime.exe host on this machine.'
Write-Output 'This launcher starts the existing worker with vendor-signed node.exe. Pairing, grants, approvals and permits are unchanged.'

if ($Version) {
  & $node $worker --version
  if ($LASTEXITCODE -ne 0) { throw "Local runtime worker --version exited with $LASTEXITCODE" }
  return
}

$arguments = @($worker, '--url', $RuntimeUrl, '--state', $StateDirectory, '--native-helper', $picker)
if ($TrustedCa) { $arguments += @('--ca', $TrustedCa) }
if ($PairOnly) { $arguments += '--pair-only' }
& $node @arguments
if ($LASTEXITCODE -ne 0) { throw "Local runtime worker exited with $LASTEXITCODE" }
