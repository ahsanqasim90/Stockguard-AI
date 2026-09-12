param(
    [switch]$Quick,
    [switch]$Resume,
    [string]$Models = "seasonal_naive,linear_regression,random_forest,arima"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

# Keep numerical libraries from occupying every logical processor.
$env:OMP_NUM_THREADS = "3"
$env:MKL_NUM_THREADS = "3"
$env:OPENBLAS_NUM_THREADS = "3"
$env:NUMEXPR_NUM_THREADS = "3"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python environment not found. Run .\setup.ps1 first."
}

$TrainingArguments = @(
    "ml\train.py",
    "--config", "configs\pilot.json",
    "--models", $Models
)
if ($Quick) {
    $TrainingArguments += "--quick"
}
if ($Resume) {
    $TrainingArguments += "--resume"
}

Set-Location $ProjectRoot
$TrainingProcess = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList $TrainingArguments `
    -NoNewWindow `
    -PassThru

try {
    $TrainingProcess.PriorityClass = "BelowNormal"
}
catch {
    Write-Warning "Could not lower process priority; training will continue normally."
}

$TrainingProcess.WaitForExit()
exit $TrainingProcess.ExitCode
