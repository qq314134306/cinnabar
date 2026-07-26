param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('local', 'development', 'test', 'staging', 'preview')]
  [string]$Environment,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]{1,63}$')]
  [string]$ExpectedDatabaseName,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmDisposableDatabase
)

# Requires psql and a disposable, fully migrated Supabase database.
# Each scenario establishes a deterministic barrier:
# 1. connection A locks profiles and enters pg_sleep;
# 2. the coordinator observes A sleeping;
# 3. connection B starts and is observed waiting on a lock;
# 4. A's sleep ends, releasing the row lock through COMMIT.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-proof-common.ps1')

Assert-CinnabarReleaseProofTarget `
  -DatabaseUrl $DatabaseUrl `
  -Environment $Environment `
  -ExpectedDatabaseName $ExpectedDatabaseName `
  -ConfirmDisposableDatabase:$ConfirmDisposableDatabase

# Account deletion intentionally preserves pseudonymous ledger history, so
# fixed UUIDs would make a second run observe the first run's business keys.
# Unique per-run subjects keep this test repeatable on the same disposable DB.
$doubleSpendUser = [guid]::NewGuid().ToString()
$sameKeyUser = [guid]::NewGuid().ToString()
$testJobs = @()
$cleanupFailed = $false

function Invoke-Scalar([string]$Sql) {
  $result = Invoke-CinnabarPsql `
    -Arguments @('-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1') `
    -InputText $Sql
  if ($result.ExitCode -ne 0) {
    throw 'psql scalar query failed'
  }
  return $result.Output
}

function Wait-ForActivity(
  [string]$ApplicationName,
  [string]$WaitEventType,
  [int]$TimeoutSeconds = 10
) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $sql = "select count(*) from pg_catalog.pg_stat_activity where application_name = '$ApplicationName' and wait_event_type = '$WaitEventType';"
    if ((Invoke-Scalar $sql) -eq '1') {
      return
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for $ApplicationName to enter $WaitEventType."
}

function Start-SpendJob(
  [string]$ApplicationName,
  [string]$UserId,
  [int]$Amount,
  [string]$BusinessKey,
  [bool]$HoldProfileLock
) {
  return Start-Job -ScriptBlock {
    param(
      $PsqlPath,
      $PgHost,
      $PgPort,
      $PgDatabase,
      $PgUser,
      $PgPassword,
      $PgSslMode,
      $AppName,
      $Uid,
      $Debit,
      $Key,
      $HoldLock
    )
    $env:PGHOST = $PgHost
    $env:PGHOSTADDR = $null
    $env:PGPORT = $PgPort
    $env:PGDATABASE = $PgDatabase
    $env:PGUSER = $PgUser
    $env:PGPASSWORD = $PgPassword
    $env:PGSSLMODE = $PgSslMode
    $env:PGOPTIONS = ''
    $env:PGSERVICE = $null
    $env:PGSERVICEFILE = $null
    $env:PGAPPNAME = $AppName
    if (Get-Variable -Name PSNativeCommandUseErrorActionPreference `
        -ErrorAction SilentlyContinue) {
      $PSNativeCommandUseErrorActionPreference = $false
    }
    if ($HoldLock) {
      $sql = @"
begin;
select 1 from public.profiles where id = '$Uid' for update;
select pg_catalog.pg_sleep(3);
select ledger_id, balance, created
from public.spend_credits('$Uid', $Debit, '$Key');
commit;
"@
    } else {
      $sql = @"
select ledger_id, balance, created
from public.spend_credits('$Uid', $Debit, '$Key');
"@
    }
    $output = $sql |
      & $PsqlPath -X -q -A -t -F '|' -v ON_ERROR_STOP=1 2>&1
    [pscustomobject]@{
      AppName = $AppName
      ExitCode = $LASTEXITCODE
      Output = ($output | Out-String).Trim()
    }
  } -ArgumentList $script:CinnabarPsqlCommand, $env:PGHOST, $env:PGPORT,
    $env:PGDATABASE, $env:PGUSER, $env:PGPASSWORD, $env:PGSSLMODE,
    $ApplicationName, $UserId, $Amount,
    $BusinessKey, $HoldProfileLock
}

function Receive-SpendResult($Job) {
  $Job | Wait-Job | Out-Null
  $result = $Job | Receive-Job | Where-Object { $_.ExitCode -ne $null } |
    Select-Object -Last 1
  Remove-Job $Job -Force
  return $result
}

$setup = @"
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000', '$doubleSpendUser',
  'authenticated', 'authenticated', 'ledger-race-1@example.invalid', '',
  now(), now(), now()
),
(
  '00000000-0000-0000-0000-000000000000', '$sameKeyUser',
  'authenticated', 'authenticated', 'ledger-race-2@example.invalid', '',
  now(), now(), now()
);
"@
try {
  $setupResult = Invoke-CinnabarPsql `
    -Arguments @('-X', '-v', 'ON_ERROR_STOP=1') `
    -InputText $setup
  if ($setupResult.ExitCode -ne 0) {
    throw 'Concurrency test setup failed.'
  }

  # Different keys: both initially see a 30-credit account, but the profile lock
  # forces B to re-check after A commits. Exactly one 20-credit debit may exist.
  $jobA = Start-SpendJob 'credit-race-different-a' $doubleSpendUser 20 'race:a' $true
  $testJobs += $jobA
  Wait-ForActivity 'credit-race-different-a' 'Timeout'
  $jobB = Start-SpendJob 'credit-race-different-b' $doubleSpendUser 20 'race:b' $false
  $testJobs += $jobB
  Wait-ForActivity 'credit-race-different-b' 'Lock'
  $resultA = Receive-SpendResult $jobA
  $resultB = Receive-SpendResult $jobB
  if ($resultA.ExitCode -ne 0 -or $resultB.ExitCode -eq 0) {
    throw "Different-key race did not produce one success and one rejection.`nA: $($resultA.Output)`nB: $($resultB.Output)"
  }
  $differentCheck = @"
select
  (select sum(amount) from public.credit_ledger
   where account_id = '$doubleSpendUser'),
  (select count(*) from public.credit_ledger
   where account_id = '$doubleSpendUser' and entry_type = 'debit');
"@
  if ((Invoke-Scalar $differentCheck) -ne '10|1') {
    throw 'Different-key race did not finish with balance 10 and one debit.'
  }

  # Same key: B blocks behind A, then resolves idempotently to the same ledger
  # row with created=false rather than inserting a duplicate.
  $jobC = Start-SpendJob 'credit-race-same-a' $sameKeyUser 7 'race:same' $true
  $testJobs += $jobC
  Wait-ForActivity 'credit-race-same-a' 'Timeout'
  $jobD = Start-SpendJob 'credit-race-same-b' $sameKeyUser 7 'race:same' $false
  $testJobs += $jobD
  Wait-ForActivity 'credit-race-same-b' 'Lock'
  $resultC = Receive-SpendResult $jobC
  $resultD = Receive-SpendResult $jobD
  if ($resultC.ExitCode -ne 0 -or $resultD.ExitCode -ne 0) {
    throw "Same-key race failed.`nA: $($resultC.Output)`nB: $($resultD.Output)"
  }
  $lineC = @($resultC.Output -split "`r?`n" | Where-Object { $_ -match '^\d+\|' })[-1]
  $lineD = @($resultD.Output -split "`r?`n" | Where-Object { $_ -match '^\d+\|' })[-1]
  $fieldsC = $lineC -split '\|'
  $fieldsD = $lineD -split '\|'
  if ($fieldsC[0] -ne $fieldsD[0] -or
      $fieldsC[2] -ne 't' -or $fieldsD[2] -ne 'f') {
    throw "Same-key calls did not return one ledger id with created t/f.`nA: $lineC`nB: $lineD"
  }
  $sameCheck = @"
select count(*) from public.credit_ledger
where account_id = '$sameKeyUser' and business_key = 'race:same';
"@
  if ((Invoke-Scalar $sameCheck) -ne '1') {
    throw 'Same-key race inserted more than one ledger entry.'
  }
} finally {
  $testJobs | Where-Object {
    $_.State -notin @('Completed', 'Failed', 'Stopped')
  } | Stop-Job -ErrorAction SilentlyContinue
  $testJobs | Remove-Job -Force -ErrorAction SilentlyContinue
  try {
    $cleanupResult = Invoke-CinnabarPsql `
      -Arguments @('-X', '-v', 'ON_ERROR_STOP=1') `
      -InputText "delete from auth.users where id in ('$doubleSpendUser', '$sameKeyUser');"
    if ($cleanupResult.ExitCode -ne 0) {
      $cleanupFailed = $true
    }
  } catch {
    $cleanupFailed = $true
  } finally {
    Restore-CinnabarPsqlEnvironment
  }
}

if ($cleanupFailed) {
  throw 'Concurrency test cleanup failed.'
}

'PASS credit ledger concurrency'
