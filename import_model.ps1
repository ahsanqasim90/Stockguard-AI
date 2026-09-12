param(
    [Parameter(Mandatory = $true)]
    [string]$File
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProductionRoot = Join-Path $ProjectRoot "artifacts\production"
$ArchivePath = (Resolve-Path -LiteralPath $File).Path

if ([IO.Path]::GetExtension($ArchivePath) -ne ".zip") {
    throw "Expected a .zip model bundle: $ArchivePath"
}

New-Item -ItemType Directory -Path $ProductionRoot -Force | Out-Null
$ProductionRoot = (Resolve-Path -LiteralPath $ProductionRoot).Path
$StagingPath = Join-Path $ProductionRoot (".staging_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $StagingPath | Out-Null

function Remove-SafeStaging {
    if (Test-Path -LiteralPath $StagingPath) {
        $ResolvedStaging = (Resolve-Path -LiteralPath $StagingPath).Path
        $ExpectedPrefix = $ProductionRoot.TrimEnd("\") + "\.staging_"
        if (-not $ResolvedStaging.StartsWith($ExpectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected path: $ResolvedStaging"
        }
        Remove-Item -LiteralPath $ResolvedStaging -Recurse -Force
    }
}

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $StagingFull = [IO.Path]::GetFullPath($StagingPath).TrimEnd("\") + "\"
        foreach ($Entry in $Zip.Entries) {
            $EntryTarget = [IO.Path]::GetFullPath((Join-Path $StagingPath $Entry.FullName))
            if (-not $EntryTarget.StartsWith($StagingFull, [StringComparison]::OrdinalIgnoreCase)) {
                throw "Unsafe path found in ZIP: $($Entry.FullName)"
            }
        }
    }
    finally {
        $Zip.Dispose()
    }

    [IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $StagingPath)

    $ManifestPath = Join-Path $StagingPath "training_manifest.json"
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "training_manifest.json is missing from the bundle."
    }

    $Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
    if ($Manifest.project -ne "StockGuard AI") {
        throw "Unexpected project in manifest: $($Manifest.project)"
    }

    $Version = [string]$Manifest.model_version
    if ($Version -notmatch "^[A-Za-z0-9._-]+$") {
        throw "Invalid model version: $Version"
    }

    $ModelFile = [string]$Manifest.model_file
    if ((Split-Path -Leaf $ModelFile) -ne $ModelFile) {
        throw "Invalid model filename in manifest: $ModelFile"
    }

    $ModelPath = Join-Path $StagingPath $ModelFile
    if (-not (Test-Path -LiteralPath $ModelPath)) {
        throw "Model file is missing from the bundle: $ModelFile"
    }

    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ModelPath).Hash.ToLowerInvariant()
    $ExpectedHash = ([string]$Manifest.model_sha256).ToLowerInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw "Model checksum failed. Expected $ExpectedHash but found $ActualHash."
    }

    foreach ($RequiredFile in @(
        "category_mappings.json",
        "forecast_28_days.csv",
        "forecast_summary.csv"
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $StagingPath $RequiredFile))) {
            throw "Required bundle file is missing: $RequiredFile"
        }
    }

    $Destination = Join-Path $ProductionRoot ("v" + $Version)
    if (Test-Path -LiteralPath $Destination) {
        $ExistingModel = Join-Path $Destination $ModelFile
        if (
            (Test-Path -LiteralPath $ExistingModel) -and
            ((Get-FileHash -Algorithm SHA256 -LiteralPath $ExistingModel).Hash.ToLowerInvariant() -eq $ActualHash)
        ) {
            Write-Host "Model v$Version is already imported and verified."
            Remove-SafeStaging
            exit 0
        }
        throw "Destination already exists with different contents: $Destination"
    }

    Move-Item -LiteralPath $StagingPath -Destination $Destination

    $Current = [ordered]@{
        version = $Version
        directory = ("v" + $Version)
        model_file = $ModelFile
        model_sha256 = $ActualHash
        imported_at_utc = [DateTime]::UtcNow.ToString("o")
    }
    $Current | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ProductionRoot "current.json") -Encoding UTF8

    Write-Host ""
    Write-Host "StockGuard model imported successfully."
    Write-Host "Version: $Version"
    Write-Host "Model: $Destination\$ModelFile"
    Write-Host "SHA-256: $ActualHash"
    Write-Host "Current manifest: $ProductionRoot\current.json"
}
catch {
    Remove-SafeStaging
    throw
}
