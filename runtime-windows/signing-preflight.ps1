param(
  [string]$CertificateThumbprint,
  [int]$WarnDays = 30
)
$ErrorActionPreference = 'Stop'
$publisherPath = Join-Path $PSScriptRoot 'signing\publisher.json'
$publisher = Get-Content -LiteralPath $publisherPath -Raw | ConvertFrom-Json
if ($publisher.format -ne 1) { throw 'publisher.json format must be 1' }

function Get-QualifyingCertificate {
  param([string]$Thumbprint)
  $certs = @(Get-ChildItem Cert:\CurrentUser\My)
  if ($Thumbprint) {
    if ($Thumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'CertificateThumbprint must be 40 hex characters' }
    $certs = @($certs | Where-Object { $_.Thumbprint -eq $Thumbprint })
    if ($certs.Count -eq 0) { throw "No certificate $Thumbprint in Cert:\CurrentUser\My" }
  }
  @($certs | Where-Object {
    $_.HasPrivateKey -and
    $_.Subject -ne $_.Issuer -and
    $_.PublicKey.Oid.Value -eq $publisher.rsaOid
  })
}

$matches = @(Get-QualifyingCertificate -Thumbprint $CertificateThumbprint)
if ($matches.Count -eq 0) {
  throw 'No Cert:\CurrentUser\My certificate satisfies sign-file.ps1: HasPrivateKey, CA-issued (Subject -ne Issuer), RSA. Provision the product Authenticode identity; do not generate a self-signed certificate here.'
}
if ($publisher.expectedThumbprint -and $CertificateThumbprint -and ($CertificateThumbprint -ne $publisher.expectedThumbprint)) {
  throw "Thumbprint does not match publisher.json expectedThumbprint $($publisher.expectedThumbprint)"
}
if ($publisher.expectedThumbprint -and -not $CertificateThumbprint) {
  $matches = @($matches | Where-Object { $_.Thumbprint -eq $publisher.expectedThumbprint })
  if ($matches.Count -eq 0) { throw "publisher.json expectedThumbprint $($publisher.expectedThumbprint) is not a qualifying CurrentUser\My certificate" }
}

$now = Get-Date
foreach ($certificate in $matches) {
  $eku = @($certificate.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId })
  $codeSigning = $eku -contains $publisher.codeSigningEku -or @($certificate.EnhancedKeyUsageList | ForEach-Object { $_.FriendlyName }) -contains 'Code Signing'
  $days = [int]($certificate.NotAfter - $now).TotalDays
  if ($days -lt 0) { throw "Certificate $($certificate.Thumbprint) is expired" }
  if ($publisher.expectedSubject -and $certificate.Subject -ne $publisher.expectedSubject) {
    throw "Certificate subject '$($certificate.Subject)' does not match publisher.json expectedSubject"
  }
  [pscustomobject]@{
    Thumbprint     = $certificate.Thumbprint
    Subject        = $certificate.Subject
    Issuer         = $certificate.Issuer
    HasPrivateKey  = $certificate.HasPrivateKey
    Rsa            = ($certificate.PublicKey.Oid.Value -eq $publisher.rsaOid)
    CaIssued       = ($certificate.Subject -ne $certificate.Issuer)
    CodeSigningEku = $codeSigning
    NotAfter       = $certificate.NotAfter
    DaysRemaining  = $days
    ExpiryWarning  = ($days -le $WarnDays)
  }
  if (-not $codeSigning) {
    Write-Warning "Certificate $($certificate.Thumbprint) does not advertise Code Signing EKU $($publisher.codeSigningEku). signtool verify /pa will likely fail."
  }
  if ($days -le $WarnDays) {
    Write-Warning "Certificate $($certificate.Thumbprint) expires in $days day(s). Rotate the product identity before the next release."
  }
}
