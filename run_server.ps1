$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerPath = Join-Path $ProjectRoot "server"
$EnvPath = Join-Path $ServerPath ".env"

if (-not (Test-Path $EnvPath)) {
    Copy-Item (Join-Path $ServerPath ".env.example") $EnvPath
    Write-Host "Created server\.env from the template."
    Write-Host "Set MONGODB_URI in server\.env, then run this command again."
    exit 1
}

Push-Location $ServerPath
try {
    npm.cmd run dev
}
finally {
    Pop-Location
}
