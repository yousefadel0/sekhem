param([ValidateRange(100,100000)][int]$Iterations = 2000)
$ErrorActionPreference = 'Stop'
$spikeExecutable = Join-Path $PSScriptRoot 'build\confinement-spike.exe'
if (-not (Test-Path -LiteralPath $spikeExecutable)) { throw 'Run build.ps1 first.' }
Push-Location -LiteralPath $PSScriptRoot
try { & $spikeExecutable $Iterations; if ($LASTEXITCODE -ne 0) { throw "Spike reported failure: $LASTEXITCODE. Inspect evidence; do not suppress the failure." } }
finally { Pop-Location }
