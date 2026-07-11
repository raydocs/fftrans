param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release',
  [switch]$Install,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$solutionPath = Join-Path $repositoryRoot 'dalamud\FFTransDalamud\FFTransDalamud.sln'
$projectRoot = Join-Path $repositoryRoot 'dalamud\FFTransDalamud'

$dotnetCommand = Get-Command dotnet.exe -ErrorAction SilentlyContinue
$dotnetCandidates = @(
  (Join-Path $HOME '.dotnet\dotnet.exe'),
  $(if ($env:DOTNET_ROOT) { Join-Path $env:DOTNET_ROOT 'dotnet.exe' }),
  $(if ($dotnetCommand) { $dotnetCommand.Source })
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$dotnetPath = $null
foreach ($candidate in $dotnetCandidates) {
  $installedSdks = & $candidate --list-sdks 2>$null
  if ($LASTEXITCODE -eq 0 -and $installedSdks) {
    $dotnetPath = $candidate
    break
  }
}
if (-not $dotnetPath) {
  throw '.NET 10 SDK was not found. Install it from https://dotnet.microsoft.com/download/dotnet/10.0.'
}

$dalamudCandidates = @(
  $env:DALAMUD_HOME,
  (Join-Path $env:APPDATA 'XIVLauncher\addon\Hooks\dev'),
  (Join-Path $HOME '.dalamud-dev')
) | Where-Object { $_ }
$dalamudHome = $dalamudCandidates |
  Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Dalamud.dll') } |
  Select-Object -First 1

if (-not $dalamudHome) {
  $dalamudHome = Join-Path $HOME '.dalamud-dev'
  $downloadPath = Join-Path $env:TEMP 'fftrans-dalamud-latest.zip'
  Write-Host 'Downloading official Dalamud development files...'
  Invoke-WebRequest -Uri 'https://goatcorp.github.io/dalamud-distrib/latest.zip' -OutFile $downloadPath
  New-Item -ItemType Directory -Force -Path $dalamudHome | Out-Null
  Expand-Archive -LiteralPath $downloadPath -DestinationPath $dalamudHome -Force
}

if (-not (Test-Path -LiteralPath (Join-Path $dalamudHome 'Dalamud.dll'))) {
  throw "Dalamud development files are incomplete at $dalamudHome"
}

$env:DALAMUD_HOME = $dalamudHome
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'

& $dotnetPath restore $solutionPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $dotnetPath build $solutionPath --configuration $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipTests) {
  & $dotnetPath test $solutionPath --configuration $Configuration --no-build --logger 'console;verbosity=minimal'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$packagePath = Join-Path $projectRoot "src\FFTransDalamud\bin\x64\$Configuration\FFTransDalamud\latest.zip"
if (-not (Test-Path -LiteralPath $packagePath)) {
  throw "DalamudPackager did not create $packagePath"
}

$artifactDirectory = Join-Path $repositoryRoot 'build\dalamud'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$artifactPath = Join-Path $artifactDirectory 'FFTransDalamud-latest.zip'
Copy-Item -LiteralPath $packagePath -Destination $artifactPath -Force
Write-Host "Plugin package: $artifactPath"

if ($Install) {
  $installDirectory = Join-Path $env:APPDATA 'XIVLauncher\devPlugins\FFTransDalamud'
  New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
  Expand-Archive -LiteralPath $artifactPath -DestinationPath $installDirectory -Force
  Write-Host "Development plugin installed to: $installDirectory"
  Write-Host "Add this DLL in /xlsettings: $(Join-Path $installDirectory 'FFTransDalamud.dll')"
}
