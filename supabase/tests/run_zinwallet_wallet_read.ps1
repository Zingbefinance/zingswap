param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$sourceDb = 'zinwallet_test'
$testDb = 'zinwallet_wallet_read_test'
$psql = Join-Path $PostgresBin 'psql.exe'
$createdb = Join-Path $PostgresBin 'createdb.exe'
$provisionMigration = Join-Path $PSScriptRoot '..\migrations\20261109100000_community_wallet_provisioning.sql'
$readMigration = Join-Path $PSScriptRoot '..\migrations\20261109110000_community_wallet_read_api.sql'
$readTest = Join-Path $PSScriptRoot 'zinwallet_wallet_read.sql'

function Invoke-LocalPsql([string[]]$Arguments, [int]$TimeoutSeconds, [string]$Label) {
  $start = [System.Diagnostics.ProcessStartInfo]::new($psql)
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill($true) } catch {}
    throw "$Label timed out after $TimeoutSeconds seconds."
  }
  if (-not $stdout.Wait(5000) -or -not $stderr.Wait(5000)) {
    throw "$Label output streams did not close."
  }
  if ($process.ExitCode -ne 0) {
    throw "$Label failed (exit $($process.ExitCode)): $($stdout.Result) $($stderr.Result)"
  }
  return $stdout.Result.Trim()
}

try {
  if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Requires PowerShell 7 or later.' }
  if ($testDb -cne 'zinwallet_wallet_read_test') { throw 'Disposable database safety-name check failed.' }
  foreach ($path in @($psql, $createdb, $provisionMigration, $readMigration, $readTest)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required file not found: $path" }
  }

  $localArgs = @('-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres')
  $adminArgs = $localArgs + @('-d', 'postgres', '-At', '-c')
  $sourceExists = Invoke-LocalPsql ($adminArgs + @(
    "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '$sourceDb'")) 12 'Local source database check'
  if (-not $sourceExists) { throw "Required local source database $sourceDb was not found." }
  $targetExists = Invoke-LocalPsql ($adminArgs + @(
    "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '$testDb'")) 12 'Disposable database check'
  if ($targetExists) { throw "Refusing to reuse $testDb. No existing database was removed or reset." }

  $createdbArgs = @('--no-password', '-h', '127.0.0.1', '-p', '5432',
    '-U', 'postgres', '-T', $sourceDb, $testDb)
  $createStart = [System.Diagnostics.ProcessStartInfo]::new($createdb)
  $createStart.UseShellExecute = $false
  $createStart.RedirectStandardOutput = $true
  $createStart.RedirectStandardError = $true
  foreach ($argument in $createdbArgs) { [void]$createStart.ArgumentList.Add($argument) }
  $createProcess = [System.Diagnostics.Process]::new()
  $createProcess.StartInfo = $createStart
  [void]$createProcess.Start()
  $createOut = $createProcess.StandardOutput.ReadToEndAsync()
  $createErr = $createProcess.StandardError.ReadToEndAsync()
  if (-not $createProcess.WaitForExit(45000)) {
    try { $createProcess.Kill($true) } catch {}
    throw 'Disposable local database creation timed out.'
  }
  if (-not $createOut.Wait(5000) -or -not $createErr.Wait(5000)) {
    throw 'Disposable database creation output streams did not close.'
  }
  if ($createProcess.ExitCode -ne 0) {
    throw "Disposable local database creation failed (exit $($createProcess.ExitCode)): $($createErr.Result)"
  }

  $testArgs = $localArgs + @('-d', $testDb, '-v', 'ON_ERROR_STOP=1')
  $hasProvisioning = Invoke-LocalPsql ($testArgs + @('-At', '-c',
    "SELECT pg_catalog.to_regprocedure('public.ensure_community_wallet()') IS NOT NULL")) 12 'Provisioning migration check'
  if ($hasProvisioning -ne 't') {
    [void](Invoke-LocalPsql ($testArgs + @('-f', $provisionMigration)) 60 'Local provisioning migration')
  }

  $hasReadRpc = Invoke-LocalPsql ($testArgs + @('-At', '-c',
    "SELECT pg_catalog.to_regprocedure('public.get_community_wallet_snapshot(integer,timestamp with time zone,uuid)') IS NOT NULL")) 12 'Wallet read migration check'
  if ($hasReadRpc -ne 't') {
    [void](Invoke-LocalPsql ($testArgs + @('-f', $readMigration)) 60 'Local wallet read migration')
  }

  $output = Invoke-LocalPsql ($testArgs + @('-f', $readTest)) 45 'Wallet ownership, authentication, balance, and pagination tests'
  Write-Host $output
  Write-Host "Disposable local database retained for inspection: $testDb"
}
finally {
  if ($createProcess -and -not $createProcess.HasExited) {
    try { $createProcess.Kill($true); [void]$createProcess.WaitForExit(5000) } catch {}
  }
}
