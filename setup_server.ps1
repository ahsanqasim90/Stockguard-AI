$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerPath = Join-Path $ProjectRoot "server"

Write-Host "Installing StockGuard Node API dependencies..."
Push-Location $ServerPath
try {
    npm.cmd install
    npm.cmd run check
}
finally {
    Pop-Location
}

Write-Host "`nServer setup complete."
Write-Host "Next: copy server\.env.example to server\.env and add your MongoDB URI."
