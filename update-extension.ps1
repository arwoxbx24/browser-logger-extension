# Browser Logger Extension Auto-Updater
# Run: powershell -ExecutionPolicy Bypass -File update-extension.ps1

param(
    [string]$ExtensionPath = "$env:USERPROFILE\Desktop\browser-logger-extension",
    [switch]$Watch,
    [int]$Interval = 60  # seconds between checks in watch mode
)

$repo = "arwoxbx24/browser-logger-extension"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"

function Get-LocalVersion {
    $manifestPath = Join-Path $ExtensionPath "manifest.json"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath | ConvertFrom-Json
        return $manifest.version
    }
    return "0.0.0"
}

function Get-RemoteVersion {
    try {
        $release = Invoke-RestMethod -Uri $apiUrl -Headers @{"User-Agent"="PowerShell"}
        $version = $release.tag_name -replace "^v", ""
        $zipAsset = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
        return @{
            Version = $version
            DownloadUrl = $zipAsset.browser_download_url
        }
    } catch {
        Write-Host "Failed to check remote version: $_" -ForegroundColor Red
        return $null
    }
}

function Update-Extension {
    param($DownloadUrl, $Version)

    Write-Host "Downloading v$Version..." -ForegroundColor Cyan

    $tempZip = Join-Path $env:TEMP "browser-logger-extension.zip"
    $tempDir = Join-Path $env:TEMP "browser-logger-extension-temp"

    # Download
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $tempZip

    # Clean temp dir
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

    # Extract
    Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force

    # Ensure extension directory exists
    if (-not (Test-Path $ExtensionPath)) {
        New-Item -ItemType Directory -Path $ExtensionPath -Force | Out-Null
    }

    # Copy files (preserve directory if extension is loaded)
    Get-ChildItem $tempDir -File | Copy-Item -Destination $ExtensionPath -Force

    # Cleanup
    Remove-Item $tempZip -Force
    Remove-Item $tempDir -Recurse -Force

    Write-Host "Updated to v$Version!" -ForegroundColor Green
    Write-Host ""
    Write-Host ">>> Now go to chrome://extensions and click RELOAD on Browser Logger" -ForegroundColor Yellow

    # Show notification
    [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
    [System.Windows.Forms.MessageBox]::Show(
        "Extension updated to v$Version!`n`nClick OK, then reload extension in Chrome.",
        "Browser Logger Updated",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    )
}

function Check-And-Update {
    $localVersion = Get-LocalVersion
    $remote = Get-RemoteVersion

    if (-not $remote) { return $false }

    Write-Host "Local: v$localVersion | Remote: v$($remote.Version)" -ForegroundColor Gray

    if ([version]$remote.Version -gt [version]$localVersion) {
        Write-Host "New version available!" -ForegroundColor Green
        Update-Extension -DownloadUrl $remote.DownloadUrl -Version $remote.Version
        return $true
    } else {
        Write-Host "Already up to date." -ForegroundColor Gray
        return $false
    }
}

# Main
Write-Host "=== Browser Logger Extension Updater ===" -ForegroundColor Cyan
Write-Host "Extension path: $ExtensionPath" -ForegroundColor Gray
Write-Host ""

if ($Watch) {
    Write-Host "Watch mode: checking every $Interval seconds" -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
    Write-Host ""

    while ($true) {
        $timestamp = Get-Date -Format "HH:mm:ss"
        Write-Host "[$timestamp] Checking..." -NoNewline
        Check-And-Update
        Start-Sleep -Seconds $Interval
    }
} else {
    Check-And-Update
}
