param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$sourceDb = 'zinwallet_test'
$testDb = 'zinwallet_wallet_provisioning_test'
$psql = Join-Path $PostgresBin 'psql.exe'
$createdb = Join-Path $PostgresBin 'createdb.exe'
$migration = Join-Path $PSScriptRoot '..\migrations\20261109100000_community_wallet_provisioning.sql'
$sequentialTest = Join-Path $PSScriptRoot 'zinwallet_provisioning.sql'
$concurrencySetup = Join-Path $PSScriptRoot 'zinwallet_provisioning_concurrency_setup.sql'
$concurrencyVerify = Join-Path $PSScriptRoot 'zinwallet_provisioning_concurrency_verify.sql'
$workerId = 'b8da5e88-5197-4fa4-9a00-000000000903'
$workers = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Invoke-Captured([string]$Executable, [string[]]$Arguments, [int]$TimeoutSeconds, [string]$Label) {
  $start = [System.Diagnostics.ProcessStartInfo]::new($Executable)
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

function Start-ProvisioningWorker([string]$ApplicationUser) {
  $start = [System.Diagnostics.ProcessStartInfo]::new($psql)
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $arguments = @('-X', '-qAt', '--no-password', '-h', '127.0.0.1', '-p', '5432',
    '-U', 'postgres', '-d', $testDb, '-v', 'ON_ERROR_STOP=1', '-c',
    "SET ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claim.sub', '$ApplicationUser', false); SELECT pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', '$ApplicationUser', 'role', 'authenticated')::text, false); SELECT public.ensure_community_wallet();")
  foreach ($argument in $arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  [void]$process.Start()
  $workers.Add($process)
  return [pscustomobject]@{
    Process = $process
    Stdout = $process.StandardOutput.ReadToEndAsync()
    Stderr = $process.StandardError.ReadToEndAsync()
  }
}

function Get-LastWalletUuidFromOutput([string]$Output) {
  # psql may write the user ID and claims JSON before the RPC result. Extract
  # UUID tokens wherever they occur, then take the final token (the SELECT
  # result). Requiring a whole-line match misses UUIDs surrounded by output.
  $uuidPattern = '(?i)(?<![0-9a-f])[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?![0-9a-f])'
  $uuidMatches = [regex]::Matches($Output, $uuidPattern)
  if ($uuidMatches.Count -eq 0) { return $null }
  return $uuidMatches[$uuidMatches.Count - 1].Value.ToLowerInvariant()
}

function Complete-ProvisioningWorker($Job, [string]$Label) {
  if (-not $Job.Process.WaitForExit(45000)) {
    try { $Job.Process.Kill($true) } catch {}
    throw "$Label timed out."
  }
  if (-not $Job.Stdout.Wait(5000) -or -not $Job.Stderr.Wait(5000)) {
    throw "$Label output streams did not close."
  }
  if ($Job.Process.ExitCode -ne 0) {
    throw "$Label failed (exit $($Job.Process.ExitCode)): $($Job.Stdout.Result) $($Job.Stderr.Result)"
  }
  $walletId = Get-LastWalletUuidFromOutput $Job.Stdout.Result
  if (-not $walletId) { throw "$Label returned no wallet UUID: $($Job.Stdout.Result)" }
  return $walletId
}

try {
  if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Requires PowerShell 7 or later.' }
  if ($testDb -cne 'zinwallet_wallet_provisioning_test') { throw 'Disposable database safety-name check failed.' }
  foreach ($path in @($psql, $createdb, $migration, $sequentialTest, $concurrencySetup, $concurrencyVerify)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required file not found: $path" }
  }

  $adminArgs = @('-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres')
  $sourceExists = Invoke-Captured $psql ($adminArgs + @('-d', 'postgres', '-At', '-c',
    "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '$sourceDb'")) 12 'Local source database check'
  if (-not $sourceExists) { throw "Required local source database $sourceDb was not found." }
  $targetExists = Invoke-Captured $psql ($adminArgs + @('-d', 'postgres', '-At', '-c',
    "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '$testDb'")) 12 'Disposable database check'
  if ($targetExists) { throw "Refusing to reuse $testDb; inspect or remove only this disposable local database before rerunning." }

  [void](Invoke-Captured $createdb (@('--no-password', '-h', '127.0.0.1', '-p', '5432',
    '-U', 'postgres', '-T', $sourceDb, $testDb)) 45 'Disposable local database creation')

  $testArgs = $adminArgs + @('-d', $testDb, '-v', 'ON_ERROR_STOP=1')
  $rpcExists = Invoke-Captured $psql ($testArgs + @('-At', '-c',
    "SELECT pg_catalog.to_regprocedure('public.ensure_community_wallet()') IS NOT NULL")) 12 'Provisioning migration check'
  if ($rpcExists -ne 't') {
    [void](Invoke-Captured $psql ($testArgs + @('-f', $migration)) 60 'Local provisioning migration application')
  }

  $unprovisionedUsers = Invoke-Captured $psql ($testArgs + @('-At', '-c',
    "SELECT EXISTS (SELECT 1 FROM auth.users AS users LEFT JOIN public.community_wallets AS wallet ON wallet.user_id=users.id LEFT JOIN public.community_ledger_accounts AS account ON account.wallet_id=wallet.id AND account.account_kind='available' AND account.asset_code='USD_CENT' WHERE wallet.id IS NULL OR account.id IS NULL)")) 12 'Existing-user wallet backfill check'
  if ($unprovisionedUsers -ne 'f') { throw 'At least one existing auth user has no wallet or available account.' }
  Write-Host 'Existing-user wallet backfill check passed.'

  $sequentialOutput = Invoke-Captured $psql ($testArgs + @('-f', $sequentialTest)) 30 'Idempotency and authorization tests'
  Write-Host $sequentialOutput
  [void](Invoke-Captured $psql ($testArgs + @('-f', $concurrencySetup)) 30 'Legacy concurrency fixture setup')

  $workerA = Start-ProvisioningWorker $workerId
  $workerB = Start-ProvisioningWorker $workerId
  $walletA = Complete-ProvisioningWorker $workerA 'Concurrent worker A'
  $walletB = Complete-ProvisioningWorker $workerB 'Concurrent worker B'
  if ($walletA -ne $walletB) {
    throw "Concurrent calls returned different wallet IDs: A=$walletA B=$walletB"
  }

  $verifyOutput = Invoke-Captured $psql ($testArgs + @('-f', $concurrencyVerify)) 30 'Concurrent provisioning assertions'
  Write-Host $verifyOutput
  Write-Host "Concurrent calls returned the same wallet: $walletA"
  Write-Host "Disposable local database retained for inspection: $testDb"
}
finally {
  foreach ($worker in $workers) {
    if ($worker -and -not $worker.HasExited) {
      try { $worker.Kill($true); [void]$worker.WaitForExit(5000) } catch {}
    }
  }
}
