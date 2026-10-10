$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { throw 'Existing MSVC required; no install is performed.' }
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'build') -Force | Out-Null
$devcmd = Join-Path $vsPath 'Common7\Tools\VsDevCmd.bat'
$buildCommand = 'call "{0}" -arch=x64 -host_arch=x64 >nul && cl /nologo /std:c++17 /EHsc /W4 /WX /O2 /MT /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX /I..\windows-confinement /Fe:build\isolation-decision.exe /Fo:build\ isolation-decision.cpp ..\windows-confinement\confinement.cpp /link normaliz.lib userenv.lib advapi32.lib' -f $devcmd
Push-Location -LiteralPath $PSScriptRoot
try {
    & $env:ComSpec /d /s /c $buildCommand
    if ($LASTEXITCODE -ne 0) { throw "Native build failed: $LASTEXITCODE" }
    $sourceHashes = @{}
    foreach ($file in @('isolation-decision.cpp','fixture-support.hpp','..\windows-confinement\confinement.cpp','..\windows-confinement\confinement.hpp')) {
        $sourceHashes[$file] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    }
    @{command=$buildCommand; sourceHashes=$sourceHashes; executableHash=(Get-FileHash -LiteralPath 'build\isolation-decision.exe' -Algorithm SHA256).Hash} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath 'build\manifest.json' -Encoding utf8
} finally { Pop-Location }
