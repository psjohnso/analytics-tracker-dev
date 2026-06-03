#!/usr/bin/env pwsh
# qa-pr.ps1 -- Quick-check out a PR branch and serve it locally for QA review.
#
# Usage (PowerShell 5.1 on Windows -- the shell that ships with Windows):
#   powershell -ExecutionPolicy Bypass -File scripts/qa-pr.ps1 <PR-number> [-Port 8000|8001|8002|8003]
#
# Usage (PowerShell 7+ if installed via 'winget install Microsoft.PowerShell'):
#   pwsh scripts/qa-pr.ps1 <PR-number> [-Port 8000|8001|8002|8003]
#
# What it does:
#   1. Stashes any uncommitted changes (named, recoverable)
#   2. gh pr checkout <PR-number>
#   3. Opens default browser to http://localhost:<port>
#   4. Runs `python -m http.server <port>` in the repo root
#   5. On Ctrl+C (or any exit): stops server, returns to your previous
#      branch, restores the stash
#
# Ports 8000-8003 are the registered AGOL OAuth redirect URIs --
# anything else would fail OAuth sign-in. Use a different port for
# each PR if running concurrent reviews.
#
# Requires: gh CLI authenticated, python 3, port not already in use.
#
# NOTE: this script is ASCII-only on purpose. PowerShell 5.1 reads
# UTF-8 files without a BOM as Windows-1252, which corrupts any
# multi-byte characters and breaks the parser. Keep it ASCII.
# -----------------------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0, HelpMessage="GitHub PR number")]
    [int]$PR,

    [Parameter(Position=1)]
    [ValidateSet(8000, 8001, 8002, 8003)]
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'

# -- Pre-flight ----------------------------------------------------
try { $repoRoot = (git rev-parse --show-toplevel 2>$null).Trim() } catch { $repoRoot = '' }
if (-not $repoRoot -or -not (Test-Path "$repoRoot/index.html")) {
    Write-Host "Error: not inside the analytics-tracker repo (index.html not found at repo root)." -ForegroundColor Red
    exit 1
}
Set-Location $repoRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gh (GitHub CLI) is required but not found on PATH." -ForegroundColor Red
    Write-Host "Install: winget install --id GitHub.cli" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Error: python is required but not found on PATH." -ForegroundColor Red
    exit 1
}

# Port already in use?
$portCheck = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($portCheck) {
    Write-Host "Error: port $Port is already in use." -ForegroundColor Red
    Write-Host "Try -Port 8001, 8002, or 8003." -ForegroundColor Yellow
    exit 1
}

# -- Remember where we were ---------------------------------------
$previousBranch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
$dirtyOutput = git status --porcelain 2>$null
$hasChanges = $false
if ($dirtyOutput) { $hasChanges = $true }
$stashName = "qa-pr-$PR-autostash-$(Get-Date -Format 'yyyyMMddHHmmss')"

function Restore-PreviousState {
    Write-Host ""
    Write-Host "Restoring previous state..." -ForegroundColor Yellow
    if ((git rev-parse --abbrev-ref HEAD 2>$null).Trim() -ne $previousBranch) {
        git checkout $previousBranch 2>$null | Out-Null
        Write-Host "  [OK] Back on '$previousBranch'" -ForegroundColor Green
    }
    if ($hasChanges) {
        $stashLine = git stash list | Select-String -Pattern $stashName | Select-Object -First 1
        if ($stashLine) {
            $stashRef = ($stashLine -split ':')[0]
            git stash pop $stashRef 2>$null | Out-Null
            Write-Host "  [OK] Stashed changes restored" -ForegroundColor Green
        }
    }
}

# -- Main flow ----------------------------------------------------
try {
    if ($hasChanges) {
        Write-Host "Stashing uncommitted changes as '$stashName'..." -ForegroundColor Yellow
        git stash push -u -m $stashName | Out-Null
    }

    Write-Host "Checking out PR #$PR..." -ForegroundColor Cyan
    gh pr checkout $PR
    if ($LASTEXITCODE -ne 0) { throw "gh pr checkout failed (exit $LASTEXITCODE)" }

    $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    $title  = (gh pr view $PR --json title --jq '.title' 2>$null).Trim()

    Write-Host ""
    Write-Host "On branch: $branch" -ForegroundColor Green
    Write-Host "PR title:  $title" -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting local server at http://localhost:$Port" -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop the server and return to '$previousBranch'." -ForegroundColor Yellow
    Write-Host ""

    Start-Process "http://localhost:$Port"
    python -m http.server $Port
}
catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Restore-PreviousState
    exit 1
}
finally {
    Restore-PreviousState
}
