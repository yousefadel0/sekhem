param(
  [Parameter(Mandatory=$true)][string]$FilePath,
  [Parameter(Mandatory=$true)][string]$SignToolPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$CertificateThumbprint,
  [Parameter(Mandatory=$true)][ValidatePattern('^https?://[A-Za-z0-9./:_-]+$')][string]$TimestampUrl
)
$ErrorActionPreference = 'Stop'
# Use a provisioned certificate/token in the current user's certificate store.
# No private key, password, self-signed certificate or trust-store change is created here.
$certificate = Get-Item -LiteralPath ("Cert:\CurrentUser\My\" + $CertificateThumbprint)
if (-not $certificate.HasPrivateKey -or $certificate.Subject -eq $certificate.Issuer -or
    $certificate.PublicKey.Oid.Value -ne '1.2.840.113549.1.1.1') { throw 'A provisioned CA-issued RSA code-signing certificate is required' }
& $SignToolPath sign /sha1 $CertificateThumbprint /s My /fd SHA256 /td SHA256 /tr $TimestampUrl $FilePath
if ($LASTEXITCODE -ne 0) { throw 'Code signing failed' }
& $SignToolPath verify /pa /all /tw $FilePath
if ($LASTEXITCODE -ne 0) { throw 'Authenticode verification or timestamp check failed' }
$signature = Get-AuthenticodeSignature -LiteralPath $FilePath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint -or -not $signature.TimeStamperCertificate) {
  throw 'The signed artifact does not match the expected publisher and timestamp'
}
