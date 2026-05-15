# Downloads Ninja 1.12.1 into android/.tools/ so Gradle can use it (Windows MAX_PATH + old SDK ninja).
# Run from repo root: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ensure-windows-ninja.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path (Join-Path $root "android") ".tools"
$zipPath = Join-Path $toolsDir "ninja-win.zip"
$ninjaOut = Join-Path $toolsDir "ninja.exe"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

if (Test-Path $ninjaOut) {
    Write-Host "Already present: $ninjaOut"
    exit 0
}

$ver = "v1.12.1"
$url = "https://github.com/ninja-build/ninja/releases/download/$ver/ninja-win.zip"
Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
Remove-Item $zipPath -Force
if (-not (Test-Path $ninjaOut)) {
    throw "ninja.exe not found after extract; check release layout for $ver"
}
Write-Host "OK: $ninjaOut"
Write-Host "Rebuild Android (e.g. Build > Clean, then assembleDebug)."
