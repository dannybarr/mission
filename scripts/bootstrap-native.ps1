$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
$env:CARGO_HOME = Join-Path $toolsRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $toolsRoot 'rustup'
$installer = Join-Path $toolsRoot 'rustup-init.exe'
if (-not (Test-Path -LiteralPath $installer)) {
  Invoke-WebRequest 'https://win.rustup.rs/x86_64' -OutFile $installer
}
& $installer -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-gnu --default-toolchain stable
if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed' }
$compiler = Join-Path $toolsRoot 'mingw64\bin\gcc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
  $release = Invoke-RestMethod 'https://api.github.com/repos/brechtsanders/winlibs_mingw/releases/latest'
  $asset = $release.assets | Where-Object { $_.name -match 'x86_64.*posix.*seh.*\.zip$' -and $_.name -notmatch 'llvm' } | Select-Object -First 1
  if (-not $asset) { throw 'Portable compiler archive not found' }
  $archive = Join-Path $toolsRoot 'compiler.zip'
  Invoke-WebRequest $asset.browser_download_url -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $toolsRoot -Force
}
$makeExecutable = Join-Path $toolsRoot 'mingw64\bin\make.exe'
if (-not (Test-Path $makeExecutable)) {
  Copy-Item -LiteralPath (Join-Path $toolsRoot 'mingw64\bin\mingw32-make.exe') -Destination $makeExecutable
}
$perlModules = Join-Path $toolsRoot 'perl-modules'
if (-not (Test-Path (Join-Path $perlModules 'Locale-Maketext-Simple-0.21\lib'))) {
  New-Item -ItemType Directory -Force -Path $perlModules | Out-Null
  $perlArchive = Join-Path $perlModules 'locale.tar.gz'
  Invoke-WebRequest 'https://cpan.metacpan.org/authors/id/J/JE/JESSE/Locale-Maketext-Simple-0.21.tar.gz' -OutFile $perlArchive
  tar.exe -xf $perlArchive -C $perlModules
}
if (-not (Test-Path (Join-Path $perlModules 'ExtUtils-MakeMaker-7.78\lib'))) {
  $makeMakerArchive = Join-Path $perlModules 'makemaker.tar.gz'
  Invoke-WebRequest 'https://cpan.metacpan.org/authors/id/B/BI/BINGOS/ExtUtils-MakeMaker-7.78.tar.gz' -OutFile $makeMakerArchive
  tar.exe -xf $makeMakerArchive -C $perlModules
}
foreach ($moduleUrl in @(
  'https://cpan.metacpan.org/authors/id/M/MA/MAREKR/Pod-Usage-2.05.tar.gz',
  'https://cpan.metacpan.org/authors/id/K/KH/KHW/Pod-Simple-3.48.tar.gz',
  'https://cpan.metacpan.org/authors/id/N/NE/NEILB/Pod-Escapes-1.07.tar.gz',
  'https://cpan.metacpan.org/authors/id/R/RR/RRA/podlators-v6.1.1.tar.gz'
)) {
  $archiveName = ($moduleUrl -split '/')[-1]
  $folderName = $archiveName.Replace('.tar.gz','')
  if (-not (Test-Path (Join-Path $perlModules $folderName))) {
    $moduleArchive = Join-Path $perlModules $archiveName
    Invoke-WebRequest $moduleUrl -OutFile $moduleArchive
    tar.exe -xf $moduleArchive -C $perlModules
  }
}
Write-Output 'Project-local native toolchain installed. No system PATH changes made.'
