param(
  [Parameter(Mandatory=$true)][string]$SignToolPath,
  [string]$Installer = (Join-Path (Split-Path $PSScriptRoot -Parent) 'public\runtime\SEKHEM Runtime Setup.exe'),
  [string]$ReleaseJson = (Join-Path (Split-Path $PSScriptRoot -Parent) 'public\runtime\release.json'),
  [string]$PayloadDirectory,
  [string]$CertificateThumbprint
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $SignToolPath)) { throw 'SignToolPath does not exist' }
$publisher = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'signing\publisher.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $Installer)) { throw "Installer not found: $Installer" }
if (-not (Test-Path -LiteralPath $ReleaseJson)) { throw "release.json not found: $ReleaseJson" }

$record = Get-Content -LiteralPath $ReleaseJson -Raw | ConvertFrom-Json
if ($record.format -ne 1 -or $record.signed -ne $true -or $record.sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
  throw 'release.json is not a signed-release record (format 1, signed true, sha256)'
}
$hash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
if ($hash -ne $record.sha256) { throw "Installer SHA-256 $hash does not match release.json $($record.sha256)" }

& $SignToolPath verify /pa /all /tw $Installer
if ($LASTEXITCODE -ne 0) { throw 'Installer Authenticode verification or timestamp check failed' }
$signature = Get-AuthenticodeSignature -LiteralPath $Installer
if ($signature.Status -ne 'Valid') { throw "Installer Authenticode status is $($signature.Status)" }
if (-not $signature.TimeStamperCertificate) { throw 'Installer has no timestamp certificate' }
$thumb = $signature.SignerCertificate.Thumbprint
if ($CertificateThumbprint -and $thumb -ne $CertificateThumbprint) { throw 'Installer signer thumbprint does not match the supplied CertificateThumbprint' }
if ($publisher.expectedThumbprint -and $thumb -ne $publisher.expectedThumbprint) { throw 'Installer signer thumbprint does not match publisher.json' }
if ($publisher.expectedSubject -and $signature.SignerCertificate.Subject -ne $publisher.expectedSubject) { throw 'Installer signer subject does not match publisher.json' }

$result = [ordered]@{
  installer            = $Installer
  sha256               = $hash
  authenticode         = $signature.Status
  signerThumbprint     = $thumb
  signerSubject        = $signature.SignerCertificate.Subject
  signerIssuer         = $signature.SignerCertificate.Issuer
  timestamp            = $true
  timestampSubject     = $signature.TimeStamperCertificate.Subject
  releaseSigned        = $true
}

if ($PayloadDirectory) {
  $manifestPath = Join-Path $PayloadDirectory 'build-manifest.json'
  $worker = Join-Path $PayloadDirectory 'runtime-client.cjs'
  $hostExe = Join-Path $PayloadDirectory 'SEKHEM Runtime.exe'
  $picker = Join-Path $PayloadDirectory 'SekhemFolderPicker.exe'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.conditionalWriteProtocol -ne 1) { throw 'build-manifest.json does not declare conditionalWriteProtocol 1' }
  if ($manifest.release -ne $true) { throw 'build-manifest.json release is not true; this is not a published signed payload' }
  if (-not (Select-String -LiteralPath $worker -Pattern 'conditionalWriteProtocol' -Quiet)) {
    throw 'Bundled runtime-client.cjs does not contain conditionalWriteProtocol'
  }
  foreach ($binary in @($hostExe, $picker)) {
    & $SignToolPath verify /pa /all /tw $binary
    if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed: $binary" }
    $binSig = Get-AuthenticodeSignature -LiteralPath $binary
    if ($binSig.Status -ne 'Valid' -or $binSig.SignerCertificate.Thumbprint -ne $thumb -or -not $binSig.TimeStamperCertificate) {
      throw "Signed payload binary is not Valid with the installer publisher: $binary"
    }
  }
  $result.conditionalWriteProtocol = 1
  $result.payloadRelease = $true
}

$result | ConvertTo-Json
