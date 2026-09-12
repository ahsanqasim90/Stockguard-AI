param(
    [switch]$Quick,
    [switch]$Resume,
    [int]$Folds = 0,
    [string]$Models = "seasonal_naive,linear_regression,random_forest,arima"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

$env:OMP_NUM_THREADS = "3"
$env:MKL_NUM_THREADS = "3"
$env:OPENBLAS_NUM_THREADS = "3"
$env:NUMEXPR_NUM_THREADS = "3"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python environment not found. Run .\setup.ps1 first."
}

$BacktestArguments = @(
    "ml\backtest.py",
    "--config", "configs\pilot.json",
    "--models", $Models
)
if ($Quick) {
    $BacktestArguments += "--quick"
}
if ($Resume) {
    $BacktestArguments += "--resume"
}
if ($Folds -gt 0) {
    $BacktestArguments += @("--folds", $Folds)
}

Set-Location $ProjectRoot
$BacktestProcess = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList $BacktestArguments `
    -NoNewWindow `
    -PassThru

try {
    $BacktestProcess.PriorityClass = "BelowNormal"
}
catch {
    Write-Warning "Could not lower process priority; backtesting will continue normally."
}

$BacktestProcess.WaitForExit()
exit $BacktestProcess.ExitCode
