param([switch]$CoreOnly, [switch]$DesktopCheck, [switch]$DesktopBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot '.tools'
$env:CARGO_HOME = Join-Path $toolsRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $toolsRoot 'rustup'
$env:PATH = (Join-Path $toolsRoot 'mingw64\bin') + ';' + (Join-Path $toolsRoot 'cargo\bin') + ';C:\Program Files\Git\usr\bin;' + $env:PATH
$env:MAKE = 'mingw32-make'
$env:MSYS2_ENV_CONV_EXCL = 'PERL5LIB'
$perlLibraries = Get-ChildItem (Join-Path $toolsRoot 'perl-modules') -Directory | ForEach-Object { Join-Path $_.FullName 'lib' } | Where-Object { Test-Path $_ }
$env:PERL5LIB = ($perlLibraries | ForEach-Object { $_.Replace('\','/') -replace '^([A-Za-z]):','/$1' }) -join ':'
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP $(if ($CoreOnly) { 'mission-core-crypto-target' } else { 'mission-core-native-target' })
Push-Location (Join-Path $projectRoot 'src-tauri')
try {
  $testArguments = @('test', '--lib')
  if ($CoreOnly) { $testArguments += '--no-default-features' }
  if ($DesktopCheck) { $testArguments = @('check', '--features', 'desktop', '--bin', 'mission-core') }
  if ($DesktopBuild) { $testArguments = @('build', '--features', 'desktop,tauri/custom-protocol', '--bin', 'mission-core') }
  & (Join-Path $toolsRoot 'cargo\bin\cargo.exe') @testArguments
  if ($LASTEXITCODE -ne 0) { throw 'Native tests failed' }
}
finally { Pop-Location }
