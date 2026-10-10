param(
  [Parameter(Mandatory=$true)][string]$RuntimeUrl,
  [Parameter(Mandatory=$true)][string]$WebUrl,
  [string]$TrustedCa,
  [switch]$PayloadOnly,
  [string]$SignToolPath,
  [string]$CertificateThumbprint,
  [string]$TimestampUrl,
  [string]$InnoCompiler = "$PSScriptRoot\out\build-tools\inno\ISCC.exe"
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$buildDirectory = Join-Path $PSScriptRoot ('out\build-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $buildDirectory 'payload'
if (-not $PayloadOnly) {
  if (-not $SignToolPath -or -not (Test-Path -LiteralPath $SignToolPath) -or $CertificateThumbprint -notmatch '^[A-Fa-f0-9]{40}$' -or
      $TimestampUrl -notmatch '^https?://[A-Za-z0-9./:_-]+$') { throw 'Release signing is not configured. Supply SignToolPath, CertificateThumbprint and TimestampUrl, or use -PayloadOnly for an unpublished development payload.' }
  if (($SignToolPath + $PSScriptRoot) -match '["$\r\n]') { throw 'Signing tool paths cannot contain quotes, dollar signs or newlines' }
}
$runtimeEndpoint = [uri]$RuntimeUrl
$webEndpoint = [uri]$WebUrl
if ($runtimeEndpoint.Scheme -ne 'https' -or $runtimeEndpoint.UserInfo -or $runtimeEndpoint.Query -or $runtimeEndpoint.AbsolutePath -ne '/') { throw 'Runtime URL must be an HTTPS origin without credentials' }
if (($webEndpoint.Scheme -ne 'https' -and -not ($webEndpoint.Scheme -eq 'http' -and $webEndpoint.IsLoopback)) -or $webEndpoint.UserInfo) { throw 'Web URL must be HTTPS (or loopback HTTP for local MVP)' }
$nodeBinary = (Get-Command node).Source
if ((& $nodeBinary --version) -ne 'v24.21.0') { throw 'This package requires the existing Node 24.21.0; no runtime is downloaded or downgraded' }
if ((Get-AuthenticodeSignature -LiteralPath $nodeBinary).Status -ne 'Valid') { throw 'Bundled Node must have a valid vendor signature' }
New-Item -ItemType Directory -Force -Path $payload | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe ("/out:" + (Join-Path $payload 'SEKHEM Runtime.exe')) /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'RuntimeHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Runtime host compilation failed' }
& $compiler /nologo /target:exe ("/out:" + (Join-Path $payload 'SekhemFolderPicker.exe')) /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'NativeFolderPicker.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native picker compilation failed' }
$bundler = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'node_modules\.pnpm') -Directory -Filter '@esbuild+win32-x64@*' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $bundler) { throw 'Existing Windows esbuild dependency is required' }
& (Join-Path $bundler.FullName 'node_modules\@esbuild\win32-x64\esbuild.exe') (Join-Path $repoRoot 'backend\src\trusted-runtime\runtime-client.ts') --bundle --platform=node --target=node24 ("--outfile=" + (Join-Path $payload 'runtime-client.cjs')) ("--metafile=" + (Join-Path $buildDirectory 'bundle-inputs.json')) --legal-comments=external
if ($LASTEXITCODE -ne 0) { throw 'Worker bundling failed' }
Copy-Item -LiteralPath $nodeBinary -Destination (Join-Path $payload 'node.exe') -Force
$caName = $null
if ($TrustedCa) {
  $certificateText = Get-Content -LiteralPath $TrustedCa -Raw
  if ($certificateText -match 'PRIVATE KEY' -or $certificateText -notmatch 'BEGIN CERTIFICATE') { throw 'Only public PEM certificates may be packaged' }
  Copy-Item -LiteralPath $TrustedCa -Destination (Join-Path $payload 'trusted-ca.pem') -Force
  $caName = 'trusted-ca.pem'
} elseif (Test-Path -LiteralPath (Join-Path $payload 'trusted-ca.pem')) {
  # Fixed generated file only, never an identity/workspace directory.
  Remove-Item -LiteralPath (Join-Path $payload 'trusted-ca.pem')
}
@{ runtimeUrl=$RuntimeUrl; webUrl=$WebUrl; caFile=$caName; version='1.0.0' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $payload 'connection.json') -Encoding UTF8
& $nodeBinary (Join-Path $payload 'runtime-client.cjs') --version
if ($LASTEXITCODE -ne 0) { throw 'Packaged worker smoke test failed' }
# Preserve licenses for bundled packages and Node, using the actual bundle inputs.
$licenseDirectory = Join-Path $payload 'licenses'
New-Item -ItemType Directory -Force -Path $licenseDirectory | Out-Null
$meta = Get-Content -LiteralPath (Join-Path $buildDirectory 'bundle-inputs.json') -Raw | ConvertFrom-Json
$seenPackages = @{}
foreach ($inputName in $meta.inputs.PSObject.Properties.Name) {
  if ($inputName -notmatch 'node_modules') { continue }
  $packageDirectory = Split-Path ([IO.Path]::GetFullPath((Join-Path (Get-Location) $inputName))) -Parent
  while ($packageDirectory.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath (Join-Path $packageDirectory 'package.json')) {
      if (-not $seenPackages.ContainsKey($packageDirectory)) {
        $seenPackages[$packageDirectory] = $true
        $package = Get-Content -LiteralPath (Join-Path $packageDirectory 'package.json') -Raw | ConvertFrom-Json
        foreach ($license in (Get-ChildItem -LiteralPath $packageDirectory -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|NOTICE)' })) {
          Copy-Item -LiteralPath $license.FullName -Destination (Join-Path $licenseDirectory (($package.name -replace '[/@]', '_') + '-' + $package.version + '-' + $license.Name)) -Force
        }
      }
      break
    }
    $packageDirectory = Split-Path $packageDirectory -Parent
  }
}
$nodeLicense = Join-Path $PSScriptRoot 'licenses\NODE-24.21.0.txt'
if (-not (Test-Path -LiteralPath $nodeLicense)) { throw 'Node redistribution LICENSE is required' }
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $licenseDirectory 'NODE-LICENSE.txt') -Force
$sourcePaths = @($meta.inputs.PSObject.Properties.Name | Where-Object { $_ -notmatch 'node_modules' } | ForEach-Object { [IO.Path]::GetFullPath((Join-Path (Get-Location) $_)) })
$sourcePaths += @('runtime-windows\RuntimeHost.cs', 'runtime-windows\NativeFolderPicker.cs', 'runtime-windows\installer.iss', 'runtime-windows\build.ps1', 'runtime-windows\sign-file.ps1', 'backend\pnpm-lock.yaml', 'pnpm-lock.yaml', '.node-version') | ForEach-Object { Join-Path $repoRoot $_ }
$sourceFiles = @($sourcePaths | Sort-Object -Unique | ForEach-Object { @{ path=$_.Substring($repoRoot.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash } })
$manifest = @{ format=1; createdAt=[DateTime]::UtcNow.ToString('o'); nodeVersion=(& $nodeBinary --version); conditionalWriteProtocol=1; release=(-not $PayloadOnly); sources=$sourceFiles }
if (-not $PayloadOnly) {
  foreach ($binary in @('SEKHEM Runtime.exe', 'SekhemFolderPicker.exe')) {
    & (Join-Path $PSScriptRoot 'sign-file.ps1') -FilePath (Join-Path $payload $binary) -SignToolPath $SignToolPath -CertificateThumbprint $CertificateThumbprint -TimestampUrl $TimestampUrl
  }
}
$manifest.files = @(Get-ChildItem -LiteralPath $payload -File -Recurse | Sort-Object FullName | ForEach-Object { @{ path=$_.FullName.Substring($payload.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $payload 'build-manifest.json') -Encoding UTF8
if ($PayloadOnly) { Write-Output "Unpublished development payload: $payload"; return }
if (-not (Test-Path -LiteralPath $InnoCompiler)) { throw 'Install the official Inno Setup compiler, then pass -InnoCompiler. Payload is built; installer is not.' }
$signCommand = '$q' + (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') + '$q -NoProfile -NonInteractive -File $q' + (Join-Path $PSScriptRoot 'sign-file.ps1') + '$q -FilePath $f -SignToolPath $q' + $SignToolPath + '$q -CertificateThumbprint ' + $CertificateThumbprint + ' -TimestampUrl ' + $TimestampUrl
& $InnoCompiler ("/DPayloadDir=" + $payload) ("/Ssekhem=" + $signCommand) (Join-Path $PSScriptRoot 'installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$installer = Join-Path $PSScriptRoot 'out\installer\SEKHEM Runtime Setup.exe'
& $SignToolPath verify /pa /all /tw $installer
if ($LASTEXITCODE -ne 0) { throw 'Installer signature verification failed; publication refused' }
$installerSignature = Get-AuthenticodeSignature -LiteralPath $installer
if ($installerSignature.Status -ne 'Valid' -or $installerSignature.SignerCertificate.Thumbprint -ne $CertificateThumbprint) { throw 'Installer publisher mismatch; publication refused' }

$downloadDirectory = Join-Path $repoRoot 'public\runtime'
New-Item -ItemType Directory -Force -Path $downloadDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'out\installer\SEKHEM Runtime Setup.exe') -Destination (Join-Path $downloadDirectory 'SEKHEM Runtime Setup.exe') -Force
@{ format=1; signed=$true; sha256=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash; publisher=$installerSignature.SignerCertificate.Subject; createdAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $downloadDirectory 'release.json') -Encoding UTF8
