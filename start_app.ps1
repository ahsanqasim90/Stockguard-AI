param(
    [int]$ApiPort = 8001,
    [int]$WebPort = 5173,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$FrontendRoot = Join-Path $ProjectRoot "frontend"
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python environment not found. Run .\setup.ps1 first."
}

if (-not (Test-Path -LiteralPath (Join-Path $FrontendRoot "node_modules"))) {
    throw "Frontend dependencies not found. Run: cd frontend; npm install"
}

New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

$env:OMP_NUM_THREADS = "2"
$env:MKL_NUM_THREADS = "2"
$env:OPENBLAS_NUM_THREADS = "2"
$env:NUMEXPR_NUM_THREADS = "2"

$ApiProcess = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList "-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", $ApiPort `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru

$WebProcess = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", $WebPort `
    -WorkingDirectory $FrontendRoot `
    -WindowStyle Hidden `
    -PassThru

@{
    api_pid = $ApiProcess.Id
    web_pid = $WebProcess.Id
    api_url = "http://127.0.0.1:$ApiPort"
    web_url = "http://127.0.0.1:$WebPort"
    started_at = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RuntimeRoot "services.json") -Encoding UTF8

Start-Sleep -Seconds 2

try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/health" -TimeoutSec 10 | Out-Null
} catch {
    throw "API did not start successfully. $($_.Exception.Message)"
}

try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort" -UseBasicParsing -TimeoutSec 10 | Out-Null
} catch {
    throw "Website did not start successfully. $($_.Exception.Message)"
}

Write-Host "StockGuard AI is running."
Write-Host "Website: http://127.0.0.1:$WebPort"
Write-Host "API docs: http://127.0.0.1:$ApiPort/docs"

if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:$WebPort"
}
