param(
  [int]$Port = 3000,
  [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $RepoRoot 'app'

if (-not (Test-Command 'node') -or -not (Test-Command 'npm')) {
  Write-Host 'Node.js/npm not found. Attempting Node.js LTS install via winget...'

  if (-not (Test-Command 'winget')) {
    throw 'winget is not available. Install Node.js LTS from https://nodejs.org and re-run this script.'
  }

  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

  # Refresh PATH for current process after installation.
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"

  if (-not (Test-Command 'node') -or -not (Test-Command 'npm')) {
    throw 'Node.js install completed but node/npm are still unavailable in this shell. Re-open PowerShell and run this script again.'
  }
}

if (-not (Test-Path $AppDir)) {
  throw "App directory not found: $AppDir"
}

Push-Location $AppDir
try {
  Write-Host 'Installing app dependencies...'
  npm install

  if ($SkipStart) {
    Write-Host 'Dependencies installed. Start later with: cd app; npm start'
    exit 0
  }

  $env:PORT = [string]$Port
  Write-Host "Starting server on port $Port ..."
  npm start
}
finally {
  Pop-Location
}
