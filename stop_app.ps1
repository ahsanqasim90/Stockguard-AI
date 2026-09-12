$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeFile = Join-Path $ProjectRoot ".runtime\services.json"

if (-not (Test-Path -LiteralPath $RuntimeFile)) {
    Write-Host "No StockGuard runtime file was found."
    exit 0
}

$Services = Get-Content -LiteralPath $RuntimeFile -Raw | ConvertFrom-Json
foreach ($ProcessId in @($Services.api_pid, $Services.web_pid)) {
    if ($ProcessId) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Remove-Item -LiteralPath $RuntimeFile -Force
Write-Host "StockGuard AI services stopped."
