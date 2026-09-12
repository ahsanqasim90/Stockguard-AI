$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python environment not found. Run .\setup.ps1 first."
}

Set-Location $ProjectRoot
& $PythonExe "ml\prepare_data.py" --config "configs\pilot.json"
