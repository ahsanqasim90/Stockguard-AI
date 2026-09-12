param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

$env:OMP_NUM_THREADS = "2"
$env:MKL_NUM_THREADS = "2"
$env:OPENBLAS_NUM_THREADS = "2"
$env:NUMEXPR_NUM_THREADS = "2"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python environment not found. Run .\setup.ps1 first."
}

Set-Location $ProjectRoot
& $PythonExe "ml\verify_production_model.py"
exit $LASTEXITCODE
