param(
  [Parameter(Mandatory=$true)][string]$SignToolPath,
  [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\SEKHEM Runtime'),
  [string]$CertificateThumbprint
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $SignToolPath)) { throw 'SignToolPath does not exist' }
$publisher = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'signing\publisher.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $InstallDirectory)) { throw "Install directory not found: $InstallDirectory" }

$hostExe = Join-Path $InstallDirectory 'SEKHEM Runtime.exe'
$picker = Join-Path $InstallDirectory 'SekhemFolderPicker.exe'
$worker = Join-Path $InstallDirectory 'runtime-client.cjs'
$manifestPath = Join-Path $InstallDirectory 'build-manifest.json'
$connectionPath = Join-Path $InstallDirectory 'connection.json'
foreach ($path in @($hostExe, $picker, $worker, $connectionPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Installed file missing: $path" }
}

$thumbs = @()
foreach ($binary in @($hostExe, $picker)) {
  & $SignToolPath verify /pa /all /tw $binary
  if ($LASTEXITCODE -ne 0) { throw "Installed Authenticode verification failed: $binary" }
  $signature = Get-AuthenticodeSignature -LiteralPath $binary
  if ($signature.Status -ne 'Valid') { throw "Installed Authenticode status is $($signature.Status): $binary" }
  if (-not $signature.TimeStamperCertificate) { throw "Installed binary has no timestamp: $binary" }
  if ($CertificateThumbprint -and $signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint) {
    throw "Installed signer thumbprint mismatch: $binary"
  }
  if ($publisher.expectedThumbprint -and $signature.SignerCertificate.Thumbprint -ne $publisher.expectedThumbprint) {
    throw "Installed signer is not the product identity in publisher.json: $binary"
  }
  $thumbs += $signature.SignerCertificate.Thumbprint
}
if ($thumbs[0] -ne $thumbs[1]) { throw 'Host and folder picker were not signed by the same certificate' }

$protocolFromManifest = $null
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.conditionalWriteProtocol -ne 1) { throw 'Installed build-manifest.json does not declare conditionalWriteProtocol 1' }
  $protocolFromManifest = 1
  $workerHash = (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash
  $recorded = @($manifest.files | Where-Object { $_.path -eq 'runtime-client.cjs' })
  if ($recorded.Count -eq 1 -and $recorded[0].sha256 -ne $workerHash) {
    throw 'Installed runtime-client.cjs hash does not match installed build-manifest.json'
  }
}
if (-not (Select-String -LiteralPath $worker -Pattern 'conditionalWriteProtocol' -Quiet)) {
  throw 'Installed runtime-client.cjs does not contain conditionalWriteProtocol'
}
$connection = Get-Content -LiteralPath $connectionPath -Raw | ConvertFrom-Json

[pscustomobject]@{
  installDirectory           = $InstallDirectory
  hostSha256                 = (Get-FileHash -LiteralPath $hostExe -Algorithm SHA256).Hash
  workerSha256               = (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash
  authenticode               = 'Valid'
  signerThumbprint           = $thumbs[0]
  signerSubject              = (Get-AuthenticodeSignature -LiteralPath $hostExe).SignerCertificate.Subject
  timestamp                  = $true
  connectionRuntimeUrl       = $connection.runtimeUrl
  connectionVersion          = $connection.version
  conditionalWriteProtocol   = 1
  manifestProtocol           = $protocolFromManifest
  privateKeyOnThisPc         = $false
} | ConvertTo-Json
