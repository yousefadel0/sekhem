param([string]$StateDirectory = (Join-Path $PSScriptRoot '../.runtime-state'), [int]$Port = 7443)
$ErrorActionPreference = 'Stop'
$runtimeStatePath = [IO.Path]::GetFullPath($StateDirectory)
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid runtime TLS port' }
[IO.Directory]::CreateDirectory($runtimeStatePath) | Out-Null
if ((Get-Item -LiteralPath $runtimeStatePath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime state directory must not be a reparse point' }
$runtimeOwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $runtimeStatePath /inheritance:r /grant:r "*${runtimeOwnerSid}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect runtime TLS directory' }
$runtimeConfigPath = Join-Path $runtimeStatePath 'tls.json'
if (Test-Path -LiteralPath $runtimeConfigPath) { Write-Output 'Existing runtime TLS configuration retained.'; exit 0 }
$runtimeRsa = [Security.Cryptography.RSA]::Create(2048)
try {
  $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $runtimeRsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
  $request.CertificateExtensions.Add($san.Build())
  $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
  $usage = [Security.Cryptography.OidCollection]::new()
  $usage.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')) | Out-Null
  $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage, $true))
  $cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(180))
  try {
    $secretBytes = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
    $runtimePassphrase = [Convert]::ToBase64String($secretBytes)
    [IO.File]::WriteAllBytes((Join-Path $runtimeStatePath 'server.pfx'), $cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $runtimePassphrase))
    [IO.File]::WriteAllText((Join-Path $runtimeStatePath 'localhost.crt'), $cert.ExportCertificatePem())
    @{ pfx = 'server.pfx'; passphrase = $runtimePassphrase; port = $Port } | ConvertTo-Json | Set-Content -LiteralPath $runtimeConfigPath -Encoding utf8NoBOM
    Write-Output "Runtime TLS ready on https://localhost:$Port. Trust only the generated localhost.crt in the runtime client."
    Write-Output ('Certificate SHA256: ' + $cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256))
  } finally { $cert.Dispose() }
} finally { $runtimeRsa.Dispose() }
