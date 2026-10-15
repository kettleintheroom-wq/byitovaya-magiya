$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS 22+ from nodejs.org, then reopen PowerShell.' }
Push-Location (Join-Path $PSScriptRoot 'push')
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Deployment has not started.' }
    & node scripts/setup-preview.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Setup stopped. See the message above.' }
} finally { Pop-Location }
