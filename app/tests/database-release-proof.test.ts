import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = fileURLToPath(new URL(
  '../../supabase/migrations/',
  import.meta.url,
))
const testsDirectory = fileURLToPath(new URL(
  '../../supabase/tests/',
  import.meta.url,
))
const runner = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/tests/invoke-release-proof.ps1',
    import.meta.url,
  )),
  'utf8',
)
const commonGuard = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/tests/release-proof-common.ps1',
    import.meta.url,
  )),
  'utf8',
)
const concurrency = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/tests/credit_ledger_concurrency.ps1',
    import.meta.url,
  )),
  'utf8',
)

const candidateMigrations = [
  '20260723000000_credit_ledger.sql',
  '20260723010000_future_report_payments.sql',
  '20260723020000_paypal_webhook_reconciliation.sql',
  '20260723030000_future_report_server_chart.sql',
  '20260723040000_opaque_auth_sessions.sql',
  '20260723050000_auth_login_transactions.sql',
  '20260723060000_public_ai_quota.sql',
]

describe('database release-proof contract', () => {
  it('pins the seven candidate migrations in timestamp dependency order', () => {
    const actual = readdirSync(migrationsDirectory)
      .filter((name) => name.startsWith('20260723') && name.endsWith('.sql'))
      .sort()

    expect(actual).toEqual(candidateMigrations)
    let previousPosition = -1
    for (const migration of candidateMigrations) {
      const position = runner.indexOf(`'${migration}'`)
      expect(position).toBeGreaterThan(previousPosition)
      previousPosition = position
    }

    const dependencyComments = candidateMigrations.map((name) =>
      readFileSync(`${migrationsDirectory}/${name}`, 'utf8'))
    expect(dependencyComments[0]).toContain(
      'Apply after 20260718000000_init_profiles_auth.sql',
    )
    expect(dependencyComments[1]).toContain(
      'Apply after 20260723000000_credit_ledger.sql',
    )
    expect(dependencyComments[2]).toContain(
      'Apply after 20260723010000_future_report_payments.sql',
    )
    expect(dependencyComments[3]).toContain(
      'Apply after 20260723020000_paypal_webhook_reconciliation.sql',
    )
    expect(dependencyComments[4]).toContain(
      'Apply after 20260723030000_future_report_server_chart.sql',
    )
    expect(dependencyComments[5]).toContain(
      'Apply after 20260723040000_opaque_auth_sessions.sql',
    )
    expect(dependencyComments[6]).toContain(
      'Apply after 20260723050000_auth_login_transactions.sql',
    )
  })

  it('requires an explicit disposable non-production target and server marker', () => {
    expect(commonGuard).toContain(
      "[ValidateSet('local', 'development', 'test', 'staging', 'preview')]",
    )
    expect(commonGuard).toContain('[switch]$ConfirmDisposableDatabase')
    expect(commonGuard).toContain('TARGET_GUARD_PRODUCTION_NAME_REJECTED')
    expect(commonGuard).toContain('TARGET_GUARD_CONNECTION_OPTION_REJECTED')
    expect(commonGuard).toContain(
      "current_setting('cinnabar.environment', true)",
    )
    expect(commonGuard).toContain(
      'TARGET_GUARD_SERVER_ENVIRONMENT_MARKER_MISMATCH',
    )
    expect(commonGuard).toContain('TARGET_GUARD_DATABASE_NAME_MISMATCH')
    expect(commonGuard).toContain('TARGET_GUARD_POSTGRES_OWNER_REQUIRED')
    expect(commonGuard).toContain("$env:PGOPTIONS = ''")
    expect(commonGuard).toContain('$env:PGHOSTADDR = $null')
    expect(commonGuard).toContain('$env:PGPASSWORD = $databasePassword')
    expect(commonGuard).toContain('Restore-CinnabarPsqlEnvironment')
    expect(commonGuard).not.toContain(
      '& $script:CinnabarPsqlCommand $DatabaseUrl',
    )
    expect(runner).not.toContain(
      'Invoke-CinnabarPsql -DatabaseUrl $DatabaseUrl',
    )
    expect(concurrency).not.toContain(
      '& $script:CinnabarPsqlCommand $DatabaseUrl',
    )
    expect(concurrency).not.toContain('& $PsqlPath $Url')
    expect(runner).not.toMatch(
      /schemaVersion[\s\S]{0,500}(DatabaseUrl|ExpectedDatabaseName)/,
    )
  })

  it('keeps the PowerShell runner portable and restores nested process state', () => {
    expect(runner).not.toContain("'..\\..'")
    expect(runner).not.toContain('"supabase\\migrations\\$migrationName"')
    expect(runner).not.toContain('"supabase\\tests\\$sqlTest"')
    expect(runner).toContain(
      "(Join-Path $migrationsDirectory $migrationName)",
    )
    expect(runner).toContain("(Join-Path $sqlTestsDirectory $sqlTest)")

    expect(commonGuard).toContain('CinnabarPgEnvironmentStack')
    expect(commonGuard).toContain(
      '$script:CinnabarPgEnvironmentStack.Push($originalEnvironment)',
    )
    expect(commonGuard).toContain(
      '$originalEnvironment = $script:CinnabarPgEnvironmentStack.Pop()',
    )
    expect(commonGuard).not.toContain('CinnabarOriginalPgEnvironment')
    expect(commonGuard).toContain(
      '$PSNativeCommandUseErrorActionPreference = $false',
    )
    expect(concurrency).toContain(
      '$PSNativeCommandUseErrorActionPreference = $false',
    )

    expect(runner).toContain('& $concurrencyScript')
    expect(runner).toContain('Out-Null')
    expect(runner).not.toContain('$output = & $concurrencyScript')
    expect(runner).not.toContain(
      "if ($LASTEXITCODE -ne 0) {\n      throw 'CONCURRENCY_TEST_FAILED'",
    )
    expect(concurrency).toContain('$cleanupFailed = $true')
    expect(concurrency).toContain(
      "throw 'Concurrency test cleanup failed.'",
    )
  })

  it('distinguishes fresh, upgrade, and rerunnable verification baselines', () => {
    expect(runner).toContain("[ValidateSet('Fresh', 'Upgrade', 'VerifyOnly')]")
    expect(runner).toContain("'Fresh' { '0|0|0|0|0|0|0' }")
    expect(runner).toContain("'Upgrade' { '1|0|0|0|0|0|0' }")
    expect(runner).toContain("'VerifyOnly' { '1|1|1|1|1|1|1' }")
    expect(runner).toContain(
      "to_regclass('public.public_ai_daily_quotas')",
    )
    expect(runner).toContain(
      "'public.claim_public_ai_daily_quota(text,text,integer,integer)'",
    )
    expect(runner).toContain("if ($state -cne '1|1|1|1|1|1|1')")
    expect(runner).toContain("--single-transaction")
    expect(runner).toContain("if ($Mode -ne 'VerifyOnly')")
  })

  it('runs every SQL behavior suite and the deterministic concurrency proof', () => {
    const expectedTests = [
      'credit_ledger.sql',
      'future_report_payments.sql',
      'paypal_webhook_reconciliation.sql',
      'opaque_auth_sessions.sql',
      'auth_login_transactions.sql',
      'public_ai_quota.sql',
    ]
    for (const sqlTest of expectedTests) {
      expect(readdirSync(testsDirectory)).toContain(sqlTest)
      expect(runner).toContain(`'${sqlTest}'`)
    }
    const publicAiQuotaTest = readFileSync(
      `${testsDirectory}/public_ai_quota.sql`,
      'utf8',
    )
    expect(publicAiQuotaTest).toContain(
      "'service_role', 'public.public_ai_daily_quotas', 'SELECT'",
    )
    expect(publicAiQuotaTest).toContain(
      "'public.claim_public_ai_daily_quota(text,text,integer,integer)'",
    )
    expect(publicAiQuotaTest).toContain(
      "'only the service role needs quota claim execution'",
    )
    expect(runner).toContain("'credit-ledger-concurrency'")
    expect(concurrency).toContain('Assert-CinnabarReleaseProofTarget')
    expect(concurrency).toContain('$doubleSpendUser = [guid]::NewGuid()')
    expect(concurrency).toContain('$sameKeyUser = [guid]::NewGuid()')
  })

  it('binds v2 evidence to provenance, migrations, toolchain, and cleanup', () => {
    expect(runner).toContain("schemaVersion = 'cinnabar.release-proof.v2'")
    expect(runner).toContain("[ValidatePattern('^[0-9a-fA-F]{40}$')]")
    expect(runner).toContain("[ValidatePattern('^[1-9][0-9]{0,19}$')]")
    expect(runner).toContain(
      "[ValidatePattern('^[0-9]+\\.[0-9]+\\.[0-9]+$')]",
    )
    expect(runner).toContain("executionContext = $proofExecutionContext")
    expect(runner).toContain('sourceCommit = $sourceCommitValue')
    expect(runner).toContain('runId = $runIdValue')
    expect(runner).toContain('runAttempt = $runAttemptValue')
    expect(runner).toContain(
      'candidateMigrationsSha256 = $script:CinnabarCandidateMigrationsSha256',
    )
    expect(runner).toContain(
      'supabaseCliVersion = $supabaseCliVersionValue',
    )
    expect(runner).toContain("'github-actions'")
    expect(runner).toContain("'local'")
    expect(runner).toContain("'PROOF_METADATA_PARTIAL'")
    expect(runner).toContain("'PROOF_METADATA_CI_INCOMPLETE'")
    expect(runner).toContain("'CI_DATABASE_CLEANUP_NOT_COMPLETED'")
    expect(runner).toContain("status = if ($CleanupRequired) { 'pending' }")
    expect(runner).toContain(
      "else { 'not-applicable' }",
    )
    expect(commonGuard).toContain('Get-CinnabarMigrationSetSha256')
    expect(commonGuard).toContain('Get-FileHash -LiteralPath $migrationPath')
    expect(commonGuard).toContain(
      '[System.Security.Cryptography.SHA256]::Create()',
    )
  })

  it('emits only a bounded sanitized pass/fail summary contract', () => {
    expect(runner).toContain('success = $summarySuccess')
    expect(runner).toContain('failureCode = $summaryFailureCode')
    expect(runner).toContain('steps = $steps')
    expect(runner).toContain('cleanup = [ordered]@{')
    expect(runner).not.toContain('databaseUrl =')
    expect(runner).not.toContain('host =')
    expect(runner).not.toContain('psqlOutput')
    expect(runner).toContain("failureCode = 'SUMMARY_WRITE_FAILED'")
    expect(runner).toContain("Add-Result 'summary-write' 'fail' 0")
    expect(runner).toMatch(/\$summaryJson\r?\nif \(\$failureCode\)/u)
  })

  it('surfaces only bounded redacted psql migration diagnostics', () => {
    expect(runner).toContain('Write-CinnabarPsqlFailureDiagnostic')
    expect(runner).toContain('Select-Object -First 12')
    expect(runner).toContain("$line.Length -gt 300")
    expect(runner).toContain('[redacted-database-url]')
    expect(runner).toContain("$line.Replace($repoRoot, '<repo>')")
    expect(runner).toContain(
      'Write-CinnabarPsqlFailureDiagnostic -Output $result.Output',
    )
  })
})
