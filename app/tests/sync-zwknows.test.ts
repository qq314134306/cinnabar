import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Cinnabar candidate verification workflow', () => {
  const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/sync-zwknows.yml'), 'utf8')
  const verifyJob = workflow.slice(
    workflow.indexOf('  verify:'),
    workflow.indexOf('  database-proof:'),
  )
  const databaseProofJob = workflow.slice(workflow.indexOf('  database-proof:'))
  const jobsSection = workflow.slice(workflow.indexOf('jobs:'))

  it('parses every PowerShell run block with the real PowerShell parser', () => {
    const lines = workflow.split(/\r?\n/)
    const scripts: string[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const shellMatch = lines[index].match(/^(\s*)shell:\s*pwsh\s*$/)
      if (!shellMatch) {
        continue
      }

      const mappingIndent = shellMatch[1].length
      let runIndex = index + 1
      for (; runIndex < lines.length; runIndex += 1) {
        const line = lines[runIndex]
        if (line.trim() && line.search(/\S/) < mappingIndent) {
          break
        }
        if (line === `${' '.repeat(mappingIndent)}run: |`) {
          break
        }
      }

      expect(lines[runIndex]).toBe(`${' '.repeat(mappingIndent)}run: |`)
      const scriptIndent = mappingIndent + 2
      const scriptLines: string[] = []
      for (runIndex += 1; runIndex < lines.length; runIndex += 1) {
        const line = lines[runIndex]
        if (line.trim() && line.search(/\S/) < scriptIndent) {
          break
        }
        scriptLines.push(line.slice(Math.min(scriptIndent, line.length)))
      }
      scripts.push(scriptLines.join('\n'))
    }

    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) {
      const result = spawnSync(
        process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$source = [Console]::In.ReadToEnd(); $tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }',
        ],
        { input: script, encoding: 'utf8' },
      )

      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    }
  })

  it('verifies pushes, pull requests, and manual candidates without deployment credentials', () => {
    expect(workflow).toContain('name: Cinnabar candidate verification')
    expect(workflow).toMatch(/push:\s+branches:\s+- main/)
    expect(workflow).toMatch(/pull_request:\s+branches:\s+- main/)
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toMatch(/permissions:\s+contents: read/)
    expect(verifyJob).not.toContain('ZWKNOWS_SYNC_TOKEN')
    expect(verifyJob).not.toContain('git push')
    expect(databaseProofJob).not.toContain('secrets.')
    expect(databaseProofJob).not.toContain('ZWKNOWS_SYNC_TOKEN')
    expect(databaseProofJob).not.toContain('git push')
  })

  it('runs the complete locked app verification gate', () => {
    expect(verifyJob).toContain('cache-dependency-path: app/package-lock.json')
    expect(verifyJob).toContain('run: npm ci')
    expect(verifyJob).toContain('run: npm audit --audit-level=moderate')
    expect(verifyJob).toContain('run: npm run lint')
    expect(verifyJob).toContain('run: npm run test')
    expect(verifyJob).toContain('run: npm run build')
    expect(verifyJob).toContain('git diff --check "$BASE_SHA...HEAD"')
    expect(verifyJob).toContain('git diff --check "$BEFORE_SHA...HEAD"')
    expect(verifyJob).toContain('git show --check --format= HEAD')
  })

  it('blocks on a moderate locked-dependency audit without mutating dependencies', () => {
    const installIndex = verifyJob.indexOf('run: npm ci')
    const auditIndex = verifyJob.indexOf(
      'run: npm audit --audit-level=moderate',
    )
    const lintIndex = verifyJob.indexOf('run: npm run lint')
    const buildIndex = verifyJob.indexOf('run: npm run build')

    expect(auditIndex).toBeGreaterThan(installIndex)
    expect(auditIndex).toBeLessThan(lintIndex)
    expect(auditIndex).toBeLessThan(buildIndex)
    expect(verifyJob).not.toMatch(/npm\s+audit\s+fix/)
    expect(verifyJob).not.toMatch(/npm\s+audit[^\n]*--force/)
  })

  it('builds candidates with payment and public AI feature flags explicitly closed', () => {
    expect(verifyJob).toContain("ENABLE_FUTURE_REPORT_PAYMENTS: 'false'")
    expect(verifyJob).toContain("VITE_ENABLE_FUTURE_REPORT_PAYMENTS: 'false'")
    expect(verifyJob).toContain("ENABLE_PUBLIC_AI_READINGS: 'false'")
    expect(verifyJob).toContain("VITE_ENABLE_PUBLIC_AI_READINGS: 'false'")
    expect(verifyJob).not.toContain("ENABLE_FUTURE_REPORT_PAYMENTS: 'true'")
    expect(verifyJob).not.toContain("VITE_ENABLE_FUTURE_REPORT_PAYMENTS: 'true'")
    expect(verifyJob).not.toContain("ENABLE_PUBLIC_AI_READINGS: 'true'")
    expect(verifyJob).not.toContain("VITE_ENABLE_PUBLIC_AI_READINGS: 'true'")
    expect(verifyJob).toContain('AUTH_MODE: legacy')
  })

  it('runs an isolated pinned fresh Supabase database proof', () => {
    expect(databaseProofJob).toContain('runs-on: ubuntu-latest')
    expect(databaseProofJob).not.toMatch(/\n\s+needs:/)
    expect(databaseProofJob).toMatch(/permissions:\s+contents: read/)
    expect(databaseProofJob).toContain('uses: supabase/setup-cli@v3')
    expect(databaseProofJob).toContain('version: 2.84.2')
    expect(databaseProofJob).toContain('postgresql-client')
    expect(databaseProofJob).toContain(
      'database_workdir="$RUNNER_TEMP/cinnabar-database-proof"',
    )
    expect(databaseProofJob).toContain('cd "$database_workdir"')
    expect(databaseProofJob).toContain('supabase init')
    expect(databaseProofJob).toContain(
      'supabase db start >"$RUNNER_TEMP/supabase-db-start.log" 2>&1',
    )
    expect(databaseProofJob).not.toContain('working-directory: supabase')
    expect(databaseProofJob).not.toContain('cd supabase/migrations')
    expect(databaseProofJob).toContain("$env:PGUSER = 'supabase_admin'")
    expect(databaseProofJob).toContain(
      'alter database postgres set "cinnabar.environment" = \'\'test\'\';',
    )
    expect(databaseProofJob).toContain('$env:PGUSER = $proofOwner')
    expect(databaseProofJob).toContain(
      '& ./supabase/tests/invoke-release-proof.ps1',
    )
    expect(databaseProofJob).toContain('-Environment test')
    expect(databaseProofJob).toContain('-ExpectedDatabaseName postgres')
    expect(databaseProofJob).toContain('-Mode Fresh')
    expect(databaseProofJob).toContain('-ConfirmDisposableDatabase')
    expect(databaseProofJob).toContain('-SummaryPath $env:CINNABAR_PROOF_SUMMARY')
    expect(databaseProofJob).toContain(
      '-SourceCommit $env:CINNABAR_SOURCE_COMMIT',
    )
    expect(databaseProofJob).toContain('-RunId $env:CINNABAR_RUN_ID')
    expect(databaseProofJob).toContain(
      '-RunAttempt ([int]$env:CINNABAR_RUN_ATTEMPT)',
    )
    expect(databaseProofJob).toContain(
      "-SupabaseCliVersion $actualSupabaseCliVersion",
    )
    expect(databaseProofJob).toContain('& supabase --version')
    expect(databaseProofJob).toContain(
      "$actualSupabaseCliVersion -cne '2.84.2'",
    )
    expect(databaseProofJob).toContain('-CleanupRequired')
  })

  it('keeps the local database credential in one proof step and artifacts only sanitized JSON', () => {
    expect(databaseProofJob.match(/CINNABAR_DATABASE_URL:/g)).toHaveLength(1)
    expect(databaseProofJob).not.toContain('GITHUB_OUTPUT')
    expect(databaseProofJob).not.toContain('GITHUB_ENV')
    expect(databaseProofJob).not.toMatch(/echo .*postgresql:\/\//)
    expect(databaseProofJob).toContain('name: cinnabar-database-proof')
    expect(databaseProofJob).toContain(
      'path: ${{ runner.temp }}/cinnabar-database-proof-summary.json',
    )
    expect(databaseProofJob).toContain('if: always()')
    expect(databaseProofJob).toContain(
      "failureCode = 'CI_DATABASE_PROOF_NOT_COMPLETED'",
    )
    expect(databaseProofJob).toContain('if-no-files-found: error')
    expect(databaseProofJob).toContain(
      "schemaVersion = 'cinnabar.release-proof.v2'",
    )
    expect(databaseProofJob).toContain(
      'sourceCommit = $env:CINNABAR_SOURCE_COMMIT.ToLowerInvariant()',
    )
    expect(databaseProofJob).toContain('runId = $env:CINNABAR_RUN_ID')
    expect(databaseProofJob).toContain(
      'runAttempt = [int]$env:CINNABAR_RUN_ATTEMPT',
    )
    expect(databaseProofJob).toContain(
      'candidateMigrationsSha256 = $candidateSha256',
    )
    expect(databaseProofJob).toContain("supabaseCliVersion = '2.84.2'")
    expect(databaseProofJob).not.toMatch(
      /path:\s+.*(?:DATABASE_URL|postgresql:\/\/|PGPASSWORD)/,
    )
    expect(databaseProofJob).not.toMatch(
      /path:\s+.*(?:supabase-db-start\.log|config\.toml|database-proof\/)/,
    )
  })

  it('finalizes cleanup and validates the JSON before the always upload', () => {
    const cleanupIndex = databaseProofJob.indexOf(
      'name: Stop isolated Supabase and finalize cleanup summary',
    )
    const validationIndex = databaseProofJob.indexOf(
      'name: Validate finalized sanitized database proof',
    )
    const uploadIndex = databaseProofJob.indexOf(
      'name: Upload finalized sanitized database proof',
    )
    const gateIndex = databaseProofJob.indexOf(
      'name: Enforce database proof final gate',
    )

    expect(cleanupIndex).toBeGreaterThan(-1)
    expect(validationIndex).toBeGreaterThan(cleanupIndex)
    expect(uploadIndex).toBeGreaterThan(validationIndex)
    expect(gateIndex).toBeGreaterThan(uploadIndex)
    expect(databaseProofJob).toContain('uses: actions/upload-artifact@v4')
    expect(databaseProofJob).toMatch(
      /name: Upload finalized sanitized database proof[\s\S]*?if: always\(\)/,
    )
    expect(databaseProofJob).toMatch(
      /name: Stop isolated Supabase and finalize cleanup summary[\s\S]*?if: always\(\)/,
    )
    expect(databaseProofJob).toContain('supabase stop --no-backup')
    expect(databaseProofJob).not.toContain('supabase stop --all')
  })

  it('cannot report success when start, proof, cleanup, validation, or upload fails', () => {
    expect(databaseProofJob).toContain('id: database_start')
    expect(databaseProofJob).toContain('id: release_proof')
    expect(databaseProofJob).toContain('id: database_cleanup')
    expect(databaseProofJob).toContain('id: validate_proof')
    expect(databaseProofJob).toContain('id: upload_proof')
    expect(databaseProofJob).toContain("status = if ($cleanupSucceeded) { 'pass' } else { 'fail' }")
    expect(databaseProofJob).toContain(
      "$summary.failureCode = 'CI_DATABASE_CLEANUP_FAILED'",
    )
    expect(databaseProofJob).toContain(
      "$summary.failureCode = 'CI_DATABASE_START_FAILED'",
    )
    expect(databaseProofJob).toContain(
      "$summary.failureCode = 'CI_DATABASE_PROOF_FAILED'",
    )
    expect(databaseProofJob).toContain('$summary.success = $false')
    expect(databaseProofJob).toContain(
      'CINNABAR_CLEANUP_OUTCOME: ${{ steps.database_cleanup.outcome }}',
    )
    expect(databaseProofJob).toContain(
      'CINNABAR_VALIDATE_OUTCOME: ${{ steps.validate_proof.outcome }}',
    )
    expect(databaseProofJob).toContain(
      'CINNABAR_UPLOAD_OUTCOME: ${{ steps.upload_proof.outcome }}',
    )
    expect(databaseProofJob).toContain(
      'test "$CINNABAR_CLEANUP_OUTCOME" = "success"',
    )
    expect(databaseProofJob).toContain(
      'test "$CINNABAR_VALIDATE_OUTCOME" = "success"',
    )
    expect(databaseProofJob).toContain(
      'test "$CINNABAR_UPLOAD_OUTCOME" = "success"',
    )
  })

  it('rejects wrong run bindings, migration fingerprints, and forged success', () => {
    expect(databaseProofJob).toContain(
      "$summary.sourceCommit -cne $env:CINNABAR_SOURCE_COMMIT.ToLowerInvariant()",
    )
    expect(databaseProofJob).toContain(
      "$summary.runId -cne $env:CINNABAR_RUN_ID",
    )
    expect(databaseProofJob).toContain(
      "$summary.candidateMigrationsSha256 -cne $expectedCandidateSha256",
    )
    expect(databaseProofJob).toContain(
      "$summary.supabaseCliVersion -cne '2.84.2'",
    )
    expect(databaseProofJob).toContain(
      "$summary.cleanup.status -cne 'pass'",
    )
    expect(databaseProofJob).toContain(
      '$step.name -cne $expectedSteps[$index]',
    )
    expect(databaseProofJob).toContain("$step.status -cne 'pass'")
    expect(databaseProofJob).toContain(
      '$summary.success -isnot [bool]',
    )
    expect(databaseProofJob).toContain('$summary.success -cne $true')
    expect(databaseProofJob).toContain('$null -ne $summary.failureCode')
    expect(databaseProofJob).toContain(
      "throw 'PROOF_SUMMARY_SUCCESS_INVALID'",
    )
  })

  it('contains only the two read-only verification jobs and no mirror deployment path', () => {
    const jobNames = [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):\r?$/gm)]
      .map((match) => match[1])

    expect(jobNames).toEqual(['verify', 'database-proof'])
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2)
    expect(workflow).not.toContain('  sync:')
    expect(workflow).not.toContain('github.repository')
    expect(workflow).not.toContain('ZWKNOWS_SYNC_TOKEN')
    expect(workflow).not.toContain('zwknows-sync')
    expect(workflow).not.toContain('ruijayfeng/zwknows')
    expect(workflow).not.toContain('force-with-lease')
    expect(workflow).not.toContain('git push')
    expect(workflow).not.toContain('secrets.')
    expect(workflow).not.toMatch(/contents:\s+write/)
  })
})
