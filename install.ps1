# OpenBot Installer for Windows (PowerShell)
# Usage: iwr -useb https://raw.githubusercontent.com/your/openbot/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "OpenBot Installer" -ForegroundColor Cyan -NoNewline
Write-Host " — Your personal AI agent"
Write-Host "──────────────────────────────────────────────"

# ── Node.js check ─────────────────────────────────────────────────────────────
try {
    $nodeVer = (node --version 2>$null).TrimStart('v').Split('.')[0]
    if ([int]$nodeVer -lt 20) {
        Write-Host "✗ Node.js 20+ required (found v$nodeVer)" -ForegroundColor Red
        Write-Host "  Download: https://nodejs.org" -ForegroundColor DarkGray
        exit 1
    }
    Write-Host "✓ Node.js $(node --version)" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    Write-Host "  Or use winget: winget install OpenJS.NodeJS" -ForegroundColor DarkGray
    exit 1
}

# ── Install directory ─────────────────────────────────────────────────────────
$InstallDir = if ($env:OPENBOT_INSTALL_DIR) { $env:OPENBOT_INSTALL_DIR } else { "$env:USERPROFILE\.openbot-app" }

# If running from project root, install in place
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$ScriptDir\package.json") {
    $InstallDir = $ScriptDir
    $InPlace = $true
}

if (-not $InPlace) {
    Write-Host ""
    Write-Host "Install location: $InstallDir" -ForegroundColor DarkGray
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    
    # Copy files if available locally
    if (Test-Path "$ScriptDir\gateway") {
        Copy-Item -Recurse -Force "$ScriptDir\*" "$InstallDir\" -Exclude "node_modules"
    }
}

Set-Location $InstallDir

# ── Install dependencies ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor DarkGray
npm install --silent 2>$null
if ($LASTEXITCODE -ne 0) { npm install }

# ── Create launcher ───────────────────────────────────────────────────────────
$BinDir = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$LauncherContent = "@echo off`r`nnode `"$InstallDir\cli\index.js`" %*"
Set-Content -Path "$BinDir\openbot.cmd" -Value $LauncherContent

# Add to PATH for current user if not already there
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$BinDir;$CurrentPath", "User")
    Write-Host "✓ Added $BinDir to user PATH" -ForegroundColor Green
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "──────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "✓ OpenBot installed!" -ForegroundColor Green
Write-Host "──────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Run setup:    " -NoNewline; Write-Host "openbot onboard" -ForegroundColor Cyan
Write-Host "  Start:        " -NoNewline; Write-Host "openbot daemon start" -ForegroundColor Cyan
Write-Host "  Dashboard:    " -NoNewline; Write-Host "openbot dashboard" -ForegroundColor Cyan
Write-Host "  Chat (CLI):   " -NoNewline; Write-Host "openbot tui" -ForegroundColor Cyan
Write-Host ""
Write-Host "Restart your terminal for PATH changes to take effect." -ForegroundColor DarkGray
Write-Host ""
