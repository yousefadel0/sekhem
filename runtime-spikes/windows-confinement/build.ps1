$ErrorActionPreference = 'Stop'
$spikeRoot = $PSScriptRoot
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { throw 'MSVC x64 build tools are required; no toolchain is downloaded.' }
New-Item -ItemType Directory -Path (Join-Path $spikeRoot 'build') -Force | Out-Null
# Fixed build commands only; no user-controlled shell fragments or filesystem deletion.
$devcmd = Join-Path $vsPath 'Common7\Tools\VsDevCmd.bat'
$buildCommand = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl /nologo /std:c++17 /EHsc /W4 /WX /O2 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX /Fe:build\confinement-spike.exe /Fo:build\ confinement.cpp adversarial-tests.cpp /link normaliz.lib' -f $devcmd
Push-Location -LiteralPath $spikeRoot
try {
    & $env:ComSpec /d /s /c $buildCommand
    if ($LASTEXITCODE -ne 0) { throw "Native build failed: $LASTEXITCODE" }
    $inputs = @{}
    foreach ($name in @('confinement.hpp','confinement.cpp','adversarial-tests.cpp')) {
        $inputs[$name] = (Get-FileHash -LiteralPath (Join-Path $spikeRoot $name) -Algorithm SHA256).Hash
    }
    @{ command=$buildCommand; windows=[Environment]::OSVersion.VersionString; sourceHashes=$inputs;
       executableHash=(Get-FileHash -LiteralPath (Join-Path $spikeRoot 'build\confinement-spike.exe') -Algorithm SHA256).Hash } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $spikeRoot 'build\manifest.json') -Encoding utf8
}
finally { Pop-Location }
