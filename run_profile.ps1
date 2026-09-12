param(
    [int]$ChunkSize = 500000
)

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
$ProfileProcess = Start-Process `
    -FilePath $PythonExe `
    -ArgumentList @("ml\profile_data.py", "--config", "configs\pilot.json", "--chunk-size", $ChunkSize) `
    -NoNewWindow `
    -PassThru

try {
    $ProfileProcess.PriorityClass = "BelowNormal"
}
catch {
    Write-Warning "Could not lower process priority; profiling will continue normally."
}

$ProfileProcess.WaitForExit()
exit $ProfileProcess.ExitCode
