$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $ProjectRoot ".venv"

if (-not (Test-Path -LiteralPath $VenvPath)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $VenvPath
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv $VenvPath
    }
    else {
        throw "Python 3 was not found. Install Python 3.11 or 3.12 and run this script again."
    }
}

$PythonExe = Join-Path $VenvPath "Scripts\python.exe"
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r (Join-Path $ProjectRoot "requirements.txt")
Write-Host "StockGuard AI Python environment is ready."
