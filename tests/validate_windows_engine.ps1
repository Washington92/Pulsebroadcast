param(
    [string]$ObsRoot = 'C:\Program Files\obs-studio',
    [switch]$RequireRust
)

$ErrorActionPreference = 'Stop'

function Invoke-Check {
    param([string]$Name, [string]$Program, [string[]]$Arguments)
    Write-Host "`n--- $Name ---"
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed (exit $LASTEXITCODE)."
    }
    Write-Host "$Name passed."
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
    Invoke-Check 'Frontend tests' 'npm.cmd' @('test')
    Invoke-Check 'Frontend build' 'npm.cmd' @('run', 'build')
    Invoke-Check 'Native libobs Preview and Program smoke test' 'pwsh' @(
        '-NoProfile', '-File', (Join-Path $PSScriptRoot 'libobs_preview_cut_smoke.ps1'),
        '-ObsRoot', $ObsRoot
    )

    $cargo = Get-Command cargo -CommandType Application -ErrorAction SilentlyContinue
    if ($cargo) {
        Push-Location src-tauri
        try {
            Invoke-Check 'Rust tests' $cargo.Source @('test')
            Invoke-Check 'Rust compilation check' $cargo.Source @('check')
        } finally {
            Pop-Location
        }
    } elseif ($RequireRust) {
        throw 'Rust validation blocked: cargo was not found.'
    } else {
        Write-Warning 'Rust validation skipped: cargo was not found. The native smoke test runs outside wMix.'
    }
} finally {
    Pop-Location
}
