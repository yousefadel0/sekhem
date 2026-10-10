$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    & '.\build\isolation-decision.exe'
    if ($LASTEXITCODE -ne 0) { throw "Security hypotheses failed ($LASTEXITCODE). Retain the evidence and NO-GO." }
} finally { Pop-Location }
