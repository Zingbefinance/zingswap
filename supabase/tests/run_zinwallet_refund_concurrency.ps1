param(
  [switch]$ResetDisposableDatabase,
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$db = 'zinwallet_refund_concurrency_test'
$psql = Join-Path $PostgresBin 'psql.exe'
$createdb = Join-Path $PostgresBin 'createdb.exe'
$dropdb = Join-Path $PostgresBin 'dropdb.exe'
$setup = Join-Path $PSScriptRoot 'zinwallet_refund_concurrency_setup.sql'
$worker = Join-Path $PSScriptRoot 'zinwallet_refund_concurrency_worker.sql'
$verify = Join-Path $PSScriptRoot 'zinwallet_refund_concurrency_verify.sql'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss')
$reportPath = Join-Path $PSScriptRoot "zinwallet_concurrency_report_$stamp.txt"
$report = [System.Collections.Generic.List[string]]::new()
$children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$controller = $null
$suitePassed = $false
$oldPgpassFile = $env:PGPASSFILE
$oldConnectTimeout = $env:PGCONNECT_TIMEOUT
$oldPgpassword = $env:PGPASSWORD

function Start-CapturedProcess([string]$Executable, [string[]]$Arguments) {
  $start = [System.Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  [void]$process.Start()
  $children.Add($process)
  return [pscustomobject]@{
    Process = $process
    Stdout = $process.StandardOutput.ReadToEndAsync()
    Stderr = $process.StandardError.ReadToEndAsync()
  }
}

function Complete-CapturedProcess($Job, [int]$TimeoutSeconds, [string]$Label) {
  if (-not $Job.Process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $Job.Process.Kill($true) } catch {}
    [void]$Job.Process.WaitForExit(5000)
    throw "$Label exceeded its $TimeoutSeconds-second timeout and was stopped."
  }
  if (-not $Job.Stdout.Wait(5000) -or -not $Job.Stderr.Wait(5000)) {
    throw "$Label exited, but its output streams did not close within five seconds."
  }
  return [pscustomobject]@{
    ExitCode = $Job.Process.ExitCode
    Stdout = $Job.Stdout.Result
    Stderr = $Job.Stderr.Result
  }
}

function Invoke-Captured([string]$Executable, [string[]]$Arguments,
                         [int]$TimeoutSeconds, [string]$Label) {
  $job = Start-CapturedProcess $Executable $Arguments
  $result = Complete-CapturedProcess $job $TimeoutSeconds $Label
  if ($result.ExitCode -ne 0) {
    throw "$Label failed (exit $($result.ExitCode)): $($result.Stdout) $($result.Stderr)"
  }
  return $result.Stdout.Trim()
}

function Wait-ControlMarker($Process, [string]$Marker, [int]$TimeoutSeconds = 20) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lineTask = $Process.StandardOutput.ReadLineAsync()
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not $lineTask.Wait(500)) { continue }
    $line = $lineTask.Result
    if ($null -eq $line) { throw "Controller psql exited before marker $Marker." }
    if ($line -eq $Marker) { return }
    $lineTask = $Process.StandardOutput.ReadLineAsync()
  }
  throw "Timed out waiting for controller marker $Marker."
}

function Invoke-LocalQuery([string]$Sql) {
  $args = @('-X', '-h', '127.0.0.1', '-p', '5432', '-v', 'VERBOSITY=verbose',
    '-U', 'postgres', '-d', $db, '-At', '-c', $Sql)
  return Invoke-Captured $psql $args 12 'Local PostgreSQL inspection query'
}

function Get-ExpectedPostgresSqlState([string]$DetailedError) {
  # Verbose libpq errors put the SQLSTATE immediately after the localized
  # severity. Capture the severity as text so French ERREUR (and other locale
  # names) work. Only inspect a line's error-header shape; message text can be
  # mojibaked by the Windows console code page, but the ASCII SQLSTATE remains.
  $pattern = '(?im)(?:^|:\s*)(?:ERROR|ERREUR|FATAL|PANIC):\s*(?<state>23514|40001):(?:\s|$)'
  $states = @([regex]::Matches($DetailedError, $pattern) |
    ForEach-Object { $_.Groups['state'].Value } |
    Sort-Object -Unique)
  if ($states.Count -ne 1) { return $null }
  return [string]$states[0]
}

function Record-WorkerFailure([string]$CaseName, [string]$Contender, [string]$SqlState) {
  if ($SqlState -eq '23514') { $outcome = 'cap_rejected' }
  elseif ($SqlState -eq '40001') { $outcome = 'serialization_retry' }
  else { throw "Unsupported SQLSTATE for worker $Contender in $CaseName." }
  $sql = "INSERT INTO public.zinwallet_concurrency_results(case_name,contender,outcome,sqlstate) VALUES ('$CaseName','$Contender','$outcome','$SqlState') ON CONFLICT (case_name,contender) DO UPDATE SET outcome=EXCLUDED.outcome,sqlstate=EXCLUDED.sqlstate"
  [void](Invoke-LocalQuery $sql)
}

try {
  if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Requires PowerShell 7 or later.' }
  if ($db -cne 'zinwallet_refund_concurrency_test') { throw 'Database safety-name check failed.' }
  foreach ($path in @($psql, $createdb, $dropdb, $setup, $worker, $verify)) {
    if (-not (Test-Path $path)) { throw "Required file not found: $path" }
  }

  # The PostgreSQL password stays in the user's protected pgpass file, never
  # in this script, command arguments, stdout, stderr, or the test report.
  $pgpass = if ($env:APPDATA) { Join-Path $env:APPDATA 'postgresql\pgpass.conf' } else { $null }
  if (-not $pgpass -or -not (Test-Path -LiteralPath $pgpass -PathType Leaf)) {
    throw 'A Windows PostgreSQL pgpass.conf is required for noninteractive local authentication.'
  }
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowedSids = @($currentSid, 'S-1-5-18', 'S-1-5-32-544') # user, SYSTEM, local Administrators
  foreach ($aclPath in @($pgpass, (Split-Path -Parent $pgpass))) {
    $acl = Get-Acl -LiteralPath $aclPath
    foreach ($ace in $acl.Access) {
      if ($ace.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
      try { $sid = $ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }
      catch { throw 'Could not validate the pgpass file/directory Windows ACL; refusing database access.' }
      if ($sid -notin $allowedSids) {
        throw 'The pgpass file or its directory grants access to an unexpected Windows principal; restrict its ACL before running.'
      }
    }
  }
  $env:PGPASSFILE = $pgpass
  $env:PGCONNECT_TIMEOUT = '5'
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

  $version = Invoke-Captured $psql @('--version') 10 'psql version check'
  if ($version -notmatch 'psql \(PostgreSQL\) 18\.') { throw "Expected psql 18, found: $version" }
  $localArgs = @('-X', '-h', '127.0.0.1', '-p', '5432', '-v', 'VERBOSITY=verbose', '-U', 'postgres')
  $serverVersion = Invoke-Captured $psql ($localArgs + @('-d', 'postgres', '-At', '-c', 'SHOW server_version_num')) 12 'Local PostgreSQL version check'
  if ([int]$serverVersion -lt 180000 -or [int]$serverVersion -ge 190000) {
    throw "Expected PostgreSQL 18 on 127.0.0.1:5432; server_version_num=$serverVersion"
  }

  # Fail closed if the SQL worker parameter and setup function drift apart.
  $setupText = Get-Content -Raw -LiteralPath $setup
  $workerText = Get-Content -Raw -LiteralPath $worker
  if ($setupText -notmatch 'p_barrier_key\s+bigint' -or
      $workerText -notmatch ":'case_name',\s*:'contender',\s*:barrier_key") {
    throw 'barrier_key argument is inconsistent between setup SQL and worker SQL.'
  }

  $exists = Invoke-Captured $psql ($localArgs + @('-d', 'postgres', '-At', '-c',
    "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '$db'")) 12 'Disposable database check'
  if ($exists -and -not $ResetDisposableDatabase) {
    throw "Refusing to reuse $db. Pass -ResetDisposableDatabase to recreate this exact disposable database from local zinwallet_test."
  }
  if ($exists) {
    # This is the only database name ever passed to dropdb.
    if ($db -cne 'zinwallet_refund_concurrency_test') { throw 'Refusing unsafe database deletion.' }
    [void](Invoke-Captured $dropdb @('-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', $db) 30 'Disposable database reset')
  }
  [void](Invoke-Captured $createdb @('-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-T', 'zinwallet_test', $db) 45 'Disposable database creation')
  [void](Invoke-Captured $psql ($localArgs + @('-d', $db, '-v', 'ON_ERROR_STOP=1', '-f', $setup)) 60 'Concurrency fixture setup')

  $report.Add("UTC: $([DateTime]::UtcNow.ToString('o'))")
  $report.Add("Local endpoint: 127.0.0.1:5432; server_version_num=$serverVersion")
  $report.Add("Disposable database: $db (cloned from local zinwallet_test)")
  $report.Add('Overlap proof: PostgreSQL pg_blocking_pids(B) includes A while B has an ungranted lock.')

  $cases = @(
    @{ Name = 'rc'; Isolation = 'READ COMMITTED'; Key = 780045901 },
    @{ Name = 'rr'; Isolation = 'REPEATABLE READ'; Key = 780045902 },
    @{ Name = 'sr'; Isolation = 'SERIALIZABLE'; Key = 780045903 }
  )

  foreach ($case in $cases) {
    $name = $case.Name; $key = [long]$case.Key
    $appA = "zw_${name}_worker_a"; $appB = "zw_${name}_worker_b"
    $controller = $null; $a = $null; $b = $null
    try {
      # The controller owns this advisory lock before A starts. A blocks on it
      # only after posting and therefore keeps the counter-row lock meanwhile.
      $controlStart = [System.Diagnostics.ProcessStartInfo]::new($psql)
      $controlStart.UseShellExecute = $false
      $controlStart.RedirectStandardInput = $true
      $controlStart.RedirectStandardOutput = $true
      $controlStart.RedirectStandardError = $true
      foreach ($arg in (@('-X', '-qAt') + $localArgs + @('-d', $db))) {
        [void]$controlStart.ArgumentList.Add($arg)
      }
      $controller = [System.Diagnostics.Process]::new(); $controller.StartInfo = $controlStart
      [void]$controller.Start(); $children.Add($controller)
      $controllerError = $controller.StandardError.ReadToEndAsync()
      $controller.StandardInput.WriteLine("SELECT pg_catalog.pg_advisory_lock($key); SELECT 'BARRIER_HELD';")
      $controller.StandardInput.Flush(); Wait-ControlMarker $controller 'BARRIER_HELD'

      $common = @('-X', '-h', '127.0.0.1', '-p', '5432', '-v', 'VERBOSITY=verbose',
        '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', $db)
      $argsA = $common + @('-v', "case_name=$name", '-v', 'contender=A', '-v', "barrier_key=$key",
        '-c', "SET application_name TO '$appA'; SET statement_timeout='60000'",
        '-c', "BEGIN ISOLATION LEVEL $($case.Isolation)", '-f', $worker)
      $a = Start-CapturedProcess $psql $argsA

      # The barrier wait itself proves A has passed the counter UPDATE.
      $aPid = $null; $deadline = [DateTime]::UtcNow.AddSeconds(30)
      while ([DateTime]::UtcNow -lt $deadline) {
        $aPid = Invoke-LocalQuery "SELECT pid FROM pg_catalog.pg_stat_activity a WHERE application_name='$appA' AND state='active' AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND NOT l.granted)"
        if ($aPid) { break }
        if ($a.Process.HasExited) { throw "Worker A exited before acquiring its barrier: $($a.Stderr.Result)" }
        Start-Sleep -Milliseconds 150
      }
      if (-not $aPid) { throw "Worker A did not reach its post-publication barrier in $name." }

      $argsB = $common + @('-v', "case_name=$name", '-v', 'contender=B', '-v', 'barrier_key=0',
        '-c', "SET application_name TO '$appB'; SET statement_timeout='60000'",
        '-c', "BEGIN ISOLATION LEVEL $($case.Isolation)", '-f', $worker)
      $b = Start-CapturedProcess $psql $argsB

      # Release A only after B is observed blocked by A, not after a guessed delay.
      $evidence = $null; $deadline = [DateTime]::UtcNow.AddSeconds(30)
      while ([DateTime]::UtcNow -lt $deadline) {
        $evidence = Invoke-LocalQuery "SELECT a.pid || '|' || b.pid || '|' || COALESCE(b.wait_event,'') FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_stat_activity b ON b.datname=a.datname WHERE a.application_name='$appA' AND b.application_name='$appB' AND a.pid=ANY(pg_catalog.pg_blocking_pids(b.pid)) AND b.state='active' AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid=b.pid AND NOT l.granted)"
        if ($evidence) { break }
        if ($b.Process.HasExited) { throw "Worker B exited before PostgreSQL showed it blocked by A: $($b.Stderr.Result)" }
        Start-Sleep -Milliseconds 150
      }
      if (-not $evidence) { throw "No verified B-to-A lock dependency for $name; scenario is invalid." }

      $controller.StandardInput.WriteLine("SELECT 'BARRIER_RELEASED', pg_catalog.pg_advisory_unlock($key);")
      $controller.StandardInput.Flush(); Wait-ControlMarker $controller 'BARRIER_RELEASED|t'
      $controller.StandardInput.WriteLine('\q'); $controller.StandardInput.Flush()
      if (-not $controller.WaitForExit(5000)) { throw 'Controller psql did not close after barrier release.' }

      $aResult = Complete-CapturedProcess $a 75 "Worker A $name"
      $bResult = Complete-CapturedProcess $b 75 "Worker B $name"

      # A failure in the function's result INSERT or at COMMIT rolls back the
      # worker's whole transaction, including any result/refund rows it wrote.
      # Parse its header SQLSTATE and record it from this separate controller
      # session; final accounting below decides whether this was a valid loser.
      foreach ($workerResult in @(
        @{ Name = 'A'; Result = $aResult },
        @{ Name = 'B'; Result = $bResult }
      )) {
        if ($workerResult.Result.ExitCode -ne 0) {
          $details = $workerResult.Result.Stdout + "`n" + $workerResult.Result.Stderr
          $state = Get-ExpectedPostgresSqlState $details
          if (-not $state) {
            throw "Worker $($workerResult.Name) failed without a recognized verbose 23514/40001 SQLSTATE in ${name}: $details"
          }
          Record-WorkerFailure $name $workerResult.Name $state
        }
      }
      $report.Add("CASE $name [$($case.Isolation)]")
      $report.Add("Overlap evidence A_pid|B_pid|B_wait_event=$evidence")
    }
    finally {
      # On every exit path, release all controller-held advisory locks first,
      # then close its session. Stop any worker still blocked after that.
      if ($controller -and -not $controller.HasExited) {
        try {
          $controller.StandardInput.WriteLine('SELECT pg_catalog.pg_advisory_unlock_all();')
          $controller.StandardInput.WriteLine('\q'); $controller.StandardInput.Flush()
          if (-not $controller.WaitForExit(5000)) { $controller.Kill($true); [void]$controller.WaitForExit(5000) }
        } catch { try { $controller.Kill($true) } catch {} }
      }
      foreach ($child in @($a, $b)) {
        if ($child -and -not $child.Process.HasExited) {
          try { $child.Process.Kill($true); [void]$child.Process.WaitForExit(5000) } catch {}
        }
      }
      foreach ($session in @(@{ Name = 'A'; Job = $a }, @{ Name = 'B'; Job = $b })) {
        $job = $session.Job
        if ($job) {
          try {
            if ($job.Stdout.Wait(5000) -and $job.Stderr.Wait(5000)) {
              $sessionOut = $job.Stdout.Result.Trim()
              $sessionErr = $job.Stderr.Result.Trim()
              $report.Add("SESSION $name/$($session.Name): exit=$($job.Process.ExitCode); stdout=$sessionOut; stderr=$sessionErr")
            } else {
              $report.Add("SESSION $name/$($session.Name): output collection timed out.")
            }
          } catch { $report.Add("SESSION $name/$($session.Name): output collection failed: $($_.Exception.Message)") }
        }
      }
    }
  }

  $verification = Invoke-Captured $psql ($localArgs + @('-d', $db, '-v', 'ON_ERROR_STOP=1', '-f', $verify)) 30 'Final accounting assertions'
  $results = Invoke-LocalQuery "SELECT case_name||'|'||contender||'|'||outcome||'|'||COALESCE(sqlstate,'') FROM public.zinwallet_concurrency_results ORDER BY case_name,contender"
  $balances = Invoke-LocalQuery "SELECT c.case_name||'|'||b.reversed_amount_minor||'|'||(SELECT count(*) FROM public.community_ledger_transactions r WHERE r.reverses_transaction_id=c.original_id AND r.status='posted') FROM public.zinwallet_concurrency_cases c JOIN community_private.community_ledger_reversal_balances b ON b.transaction_id=c.original_id ORDER BY c.case_name"
  $report.Add('OUTCOMES'); $report.Add($results)
  $report.Add('COUNTERS_AND_POSTED_REFUNDS'); $report.Add($balances)
  $report.Add('VERIFY_OUTPUT'); $report.Add($verification.Trim())
  $report.Add("Disposable database retained for inspection: $db")
  $suitePassed = $true
}
catch {
  $report.Add("FAILED: $($_.Exception.Message)")
  throw
}
finally {
  if ($controller -and -not $controller.HasExited) {
    try { $controller.Kill($true); [void]$controller.WaitForExit(5000) } catch {}
  }
  foreach ($child in $children) {
    if ($child -and -not $child.HasExited) {
      try { $child.Kill($true); [void]$child.WaitForExit(5000) } catch {}
    }
  }
  if ($report.Count -gt 0) { $report | Set-Content -Encoding UTF8 $reportPath }
  if ($null -eq $oldPgpassFile) { Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue }
  else { $env:PGPASSFILE = $oldPgpassFile }
  if ($null -eq $oldConnectTimeout) { Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue }
  else { $env:PGCONNECT_TIMEOUT = $oldConnectTimeout }
  if ($null -eq $oldPgpassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $oldPgpassword }
}

if ($suitePassed) {
  if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw 'The test report was not written; success will not be announced.'
  }
  if ((Get-Item -LiteralPath $reportPath).Length -le 0) {
    throw 'The test report is empty; success will not be announced.'
  }
  Write-Host "Concurrency suite passed. Report: $reportPath"
}
