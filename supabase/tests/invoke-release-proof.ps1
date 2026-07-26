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
  [ValidateSet('Fresh', 'Upgrade', 'VerifyOnly')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmDisposableDatabase,

  [string]$SummaryPath,

  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$SourceCommit,

  [ValidatePattern('^[1-9][0-9]{0,19}$')]
  [string]$RunId,

  [ValidateRange(1, 2147483647)]
  [Nullable[int]]$RunAttempt,

  [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')]
  [string]$SupabaseCliVersion,

  [switch]$CleanupRequired
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-proof-common.ps1')

$repoRoot = (
  Resolve-Path (Join-Path (Join-Path $PSScriptRoot '..') '..')
).Path
$migrationsDirectory = Join-Path (
  Join-Path $repoRoot 'supabase'
) 'migrations'
$sqlTestsDirectory = Join-Path (
  Join-Path $repoRoot 'supabase'
) 'tests'
$baseMigration = '20260718000000_init_profiles_auth.sql'
$candidateMigrations = @(
  '20260723000000_credit_ledger.sql',
  '20260723010000_future_report_payments.sql',
  '20260723020000_paypal_webhook_reconciliation.sql',
  '20260723030000_future_report_server_chart.sql',
  '20260723040000_opaque_auth_sessions.sql',
  '20260723050000_auth_login_transactions.sql',
  '20260723060000_public_ai_quota.sql'
)
$sqlTests = @(
  'credit_ledger.sql',
  'future_report_payments.sql',
  'paypal_webhook_reconciliation.sql',
  'opaque_auth_sessions.sql',
  'auth_login_transactions.sql',
  'public_ai_quota.sql'
)
$steps = [System.Collections.Generic.List[object]]::new()
$startedAt = [DateTime]::UtcNow
$failureCode = $null
$script:CinnabarCandidateMigrationsSha256 = $null
$sourceCommitValue = if ($SourceCommit) {
  $SourceCommit.ToLowerInvariant()
} else {
  $null
}
$runIdValue = if ($RunId) { $RunId } else { $null }
$runAttemptValue = if ($null -ne $RunAttempt) {
  [int]$RunAttempt
} else {
  $null
}
$supabaseCliVersionValue = if ($SupabaseCliVersion) {
  $SupabaseCliVersion
} else {
  $null
}
$ciMetadataCount = 0
foreach ($metadataValue in @(
  $sourceCommitValue,
  $runIdValue,
  $runAttemptValue
)) {
  if ($null -ne $metadataValue) {
    $ciMetadataCount++
  }
}
$proofExecutionContext = if ($ciMetadataCount -eq 0) {
  'local'
} elseif ($ciMetadataCount -eq 3) {
  'github-actions'
} else {
  'invalid'
}

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [long]$DurationMs
  )
  $steps.Add([ordered]@{
    name = $Name
    status = $Status
    durationMs = $DurationMs
  })
}

function Invoke-ProofStep {
  param(
    [string]$Name,
    [scriptblock]$Action,
    [string]$Failure
  )
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $Action
    $timer.Stop()
    Add-Result $Name 'pass' $timer.ElapsedMilliseconds
  } catch {
    $timer.Stop()
    Add-Result $Name 'fail' $timer.ElapsedMilliseconds
    throw $Failure
  }
}

function Write-CinnabarPsqlFailureDiagnostic {
  param(
    [AllowEmptyString()]
    [string]$Output,

    [ValidatePattern('^[a-z0-9:_.-]{1,100}$')]
    [string]$Context = 'migration-transaction'
  )

  $diagnosticLines = @(
    $Output -split "`r?`n" |
      Where-Object {
        $_ -match '(?i)(?:^|:\s)(?:ERROR|FATAL|DETAIL|HINT|CONTEXT):'
      } |
      Select-Object -First 12 |
      ForEach-Object {
        $line = $_ -replace '(?i)postgres(?:ql)?://\S+',
          '[redacted-database-url]'
        $line = $line.Replace($repoRoot, '<repo>')
        if ($line.Length -gt 300) {
          $line.Substring(0, 300) + '...'
        } else {
          $line
        }
      }
  )
  $diagnostic = if ($diagnosticLines.Count -gt 0) {
    $diagnosticLines -join ' | '
  } else {
    'psql returned no recognized safe diagnostic lines'
  }
  Write-Warning "$Context diagnostic: $diagnostic"
}

function Invoke-ScalarQuery {
  param([string]$Sql)
  $result = Invoke-CinnabarPsql -Arguments @(
    '-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', $Sql
  )
  if ($result.ExitCode -ne 0) {
    throw 'PSQL_QUERY_FAILED'
  }
  return @(
    $result.Output -split "`r?`n" |
      Where-Object { $_ -match '\|' }
  ) | Select-Object -Last 1
}

try {
  Invoke-ProofStep 'proof-metadata' {
    if ($ciMetadataCount -notin @(0, 3)) {
      throw 'PROOF_METADATA_PARTIAL'
    }
    if ($proofExecutionContext -eq 'github-actions' -and
        (-not $CleanupRequired -or -not $supabaseCliVersionValue)) {
      throw 'PROOF_METADATA_CI_INCOMPLETE'
    }
    if ($proofExecutionContext -eq 'local' -and $CleanupRequired) {
      throw 'PROOF_METADATA_LOCAL_CLEANUP_REJECTED'
    }
    $script:CinnabarCandidateMigrationsSha256 =
      Get-CinnabarMigrationSetSha256 `
      -MigrationsDirectory $migrationsDirectory `
      -MigrationNames $candidateMigrations
    if ($script:CinnabarCandidateMigrationsSha256 -notmatch
        '^[0-9a-f]{64}$') {
      throw 'MIGRATION_FINGERPRINT_INVALID'
    }
  } 'PROOF_METADATA_FAILED'

  Invoke-ProofStep 'target-guard' {
    Assert-CinnabarReleaseProofTarget `
      -DatabaseUrl $DatabaseUrl `
      -Environment $Environment `
      -ExpectedDatabaseName $ExpectedDatabaseName `
      -ConfirmDisposableDatabase:$ConfirmDisposableDatabase
  } 'TARGET_GUARD_FAILED'

  Invoke-ProofStep 'supabase-prerequisites' {
    $prerequisites = Invoke-ScalarQuery @"
select (to_regnamespace('auth') is not null)::int,
       exists(select 1 from pg_roles where rolname = 'anon')::int,
       exists(select 1 from pg_roles where rolname = 'authenticated')::int,
       exists(select 1 from pg_roles where rolname = 'service_role')::int,
       (to_regprocedure('gen_random_uuid()') is not null)::int;
"@
    if ($prerequisites -cne '1|1|1|1|1') {
      throw 'SUPABASE_PREREQUISITES_MISSING'
    }
  } 'SUPABASE_PREREQUISITES_FAILED'

  Invoke-ProofStep 'baseline-state' {
    $state = Invoke-ScalarQuery @"
select (to_regclass('public.profiles') is not null)::int,
       (to_regclass('public.credit_ledger') is not null)::int,
       (to_regclass('public.future_report_purchases') is not null)::int,
       (to_regclass('public.paypal_webhook_events') is not null)::int,
       (to_regclass('public.app_auth_sessions') is not null)::int,
       (to_regclass('public.app_auth_login_transactions') is not null)::int,
       case
         when to_regclass('public.public_ai_daily_quotas') is null
          and to_regprocedure(
            'public.claim_public_ai_daily_quota(text,text,integer,integer)'
          ) is null then 0
         when to_regclass('public.public_ai_daily_quotas') is not null
          and to_regprocedure(
            'public.claim_public_ai_daily_quota(text,text,integer,integer)'
          ) is not null then 1
         else 2
       end;
"@
    $expectedState = switch ($Mode) {
      'Fresh' { '0|0|0|0|0|0|0' }
      'Upgrade' { '1|0|0|0|0|0|0' }
      'VerifyOnly' { '1|1|1|1|1|1|1' }
    }
    if ($state -cne $expectedState) {
      throw 'BASELINE_STATE_MISMATCH'
    }
  } 'BASELINE_STATE_FAILED'

  if ($Mode -ne 'VerifyOnly') {
    Invoke-ProofStep 'migration-transaction' {
      $migrationNames = if ($Mode -eq 'Fresh') {
        @($baseMigration) + $candidateMigrations
      } else {
        $candidateMigrations
      }
      $arguments = [System.Collections.Generic.List[string]]::new()
      @('-X', '-q', '--single-transaction', '-v', 'ON_ERROR_STOP=1') |
        ForEach-Object { $arguments.Add($_) }
      foreach ($migrationName in $migrationNames) {
        $arguments.Add('-f')
        $arguments.Add(
          (Join-Path $migrationsDirectory $migrationName)
        )
      }
      $result = Invoke-CinnabarPsql -Arguments $arguments.ToArray()
      if ($result.ExitCode -ne 0) {
        Write-CinnabarPsqlFailureDiagnostic -Output $result.Output
        throw 'MIGRATION_TRANSACTION_FAILED'
      }
    } 'MIGRATION_TRANSACTION_FAILED'
  }

  Invoke-ProofStep 'migrated-state' {
    $state = Invoke-ScalarQuery @"
select (to_regclass('public.profiles') is not null)::int,
       (to_regclass('public.credit_ledger') is not null)::int,
       (to_regclass('public.future_report_purchases') is not null)::int,
       (to_regclass('public.paypal_webhook_events') is not null)::int,
       (to_regclass('public.app_auth_sessions') is not null)::int,
       (to_regclass('public.app_auth_login_transactions') is not null)::int,
       case
         when to_regclass('public.public_ai_daily_quotas') is null
          and to_regprocedure(
            'public.claim_public_ai_daily_quota(text,text,integer,integer)'
          ) is null then 0
         when to_regclass('public.public_ai_daily_quotas') is not null
          and to_regprocedure(
            'public.claim_public_ai_daily_quota(text,text,integer,integer)'
          ) is not null then 1
         else 2
       end;
"@
    if ($state -cne '1|1|1|1|1|1|1') {
      throw 'MIGRATED_STATE_INCOMPLETE'
    }
  } 'MIGRATED_STATE_FAILED'

  foreach ($sqlTest in $sqlTests) {
    Invoke-ProofStep "sql-test:$sqlTest" {
      $result = Invoke-CinnabarPsql -Arguments @(
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        (Join-Path $sqlTestsDirectory $sqlTest)
      )
      if ($result.ExitCode -ne 0) {
        Write-CinnabarPsqlFailureDiagnostic `
          -Output $result.Output `
          -Context "sql-test:$sqlTest"
        throw 'SQL_TEST_FAILED'
      }
    } 'SQL_TEST_FAILED'
  }

  Invoke-ProofStep 'credit-ledger-concurrency' {
    $concurrencyScript = Join-Path $PSScriptRoot 'credit_ledger_concurrency.ps1'
    & $concurrencyScript `
      -DatabaseUrl $DatabaseUrl `
      -Environment $Environment `
      -ExpectedDatabaseName $ExpectedDatabaseName `
      -ConfirmDisposableDatabase:$ConfirmDisposableDatabase |
      Out-Null
  } 'CONCURRENCY_TEST_FAILED'
} catch {
  $failureCode = if ($_.Exception.Message -match '^[A-Z0-9_:-]+$') {
    $_.Exception.Message
  } else {
    'RELEASE_PROOF_FAILED'
  }
} finally {
  Restore-CinnabarPsqlEnvironment
}

$summaryTarget = $null
if ($SummaryPath) {
  try {
    $summaryDirectory = Split-Path -Parent $SummaryPath
    if ($summaryDirectory -and
        -not (Test-Path -LiteralPath $summaryDirectory -PathType Container)) {
      throw 'SUMMARY_DIRECTORY_NOT_FOUND'
    }
    $summaryTarget = [System.IO.Path]::GetFullPath($SummaryPath)
  } catch {
    if (-not $failureCode) {
      $failureCode = 'SUMMARY_WRITE_FAILED'
    }
    Add-Result 'summary-write' 'fail' 0
  }
}

function New-SummaryJson {
  $summarySuccess = ($null -eq $failureCode) -and -not $CleanupRequired
  $summaryFailureCode = if ($failureCode) {
    $failureCode
  } elseif ($CleanupRequired) {
    'CI_DATABASE_CLEANUP_NOT_COMPLETED'
  } else {
    $null
  }
  $summary = [ordered]@{
    schemaVersion = 'cinnabar.release-proof.v2'
    environment = $Environment
    mode = $Mode
    executionContext = $proofExecutionContext
    sourceCommit = $sourceCommitValue
    runId = $runIdValue
    runAttempt = $runAttemptValue
    candidateMigrationsSha256 = $script:CinnabarCandidateMigrationsSha256
    supabaseCliVersion = $supabaseCliVersionValue
    success = $summarySuccess
    failureCode = $summaryFailureCode
    startedAt = $startedAt.ToString('o')
    finishedAt = [DateTime]::UtcNow.ToString('o')
    steps = $steps
    cleanup = [ordered]@{
      required = [bool]$CleanupRequired
      status = if ($CleanupRequired) { 'pending' } else { 'not-applicable' }
      durationMs = $null
    }
  }
  return $summary | ConvertTo-Json -Depth 6
}

$summaryJson = New-SummaryJson
if ($summaryTarget) {
  try {
    [System.IO.File]::WriteAllText(
      $summaryTarget,
      $summaryJson,
      [System.Text.UTF8Encoding]::new($false)
    )
  } catch {
    if (-not $failureCode) {
      $failureCode = 'SUMMARY_WRITE_FAILED'
    }
    Add-Result 'summary-write' 'fail' 0
    $summaryJson = New-SummaryJson
  }
}

$summaryJson
if ($failureCode) {
  exit 1
}
exit 0
