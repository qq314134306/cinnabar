$ErrorActionPreference = 'Stop'

function Get-CinnabarMigrationSetSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MigrationsDirectory,

    [Parameter(Mandatory = $true)]
    [string[]]$MigrationNames
  )

  $manifest = [System.Text.StringBuilder]::new()
  foreach ($migrationName in $MigrationNames) {
    if ($migrationName -notmatch '^[0-9]{14}_[a-z0-9_]+\.sql$') {
      throw 'MIGRATION_FINGERPRINT_NAME_INVALID'
    }
    $migrationPath = Join-Path $MigrationsDirectory $migrationName
    if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) {
      throw 'MIGRATION_FINGERPRINT_FILE_MISSING'
    }
    $contentHash = (
      Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    [void]$manifest.Append($migrationName)
    [void]$manifest.Append("`n")
    [void]$manifest.Append($contentHash)
    [void]$manifest.Append("`n")
  }

  $manifestBytes = [System.Text.UTF8Encoding]::new($false).GetBytes(
    $manifest.ToString()
  )
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (
      [System.BitConverter]::ToString(
        $hasher.ComputeHash($manifestBytes)
      ).Replace('-', '').ToLowerInvariant()
    )
  } finally {
    $hasher.Dispose()
  }
}

if (-not (Get-Variable -Name CinnabarPgEnvironmentStack `
    -Scope Script -ErrorAction SilentlyContinue)) {
  $script:CinnabarPgEnvironmentStack =
    [System.Collections.Generic.Stack[hashtable]]::new()
}

function Set-CinnabarPsqlEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [System.Uri]$TargetUri
  )

  $databaseName = [System.Uri]::UnescapeDataString(
    $TargetUri.AbsolutePath.TrimStart('/')
  )
  if (-not $databaseName -or $databaseName.Contains('/')) {
    throw 'TARGET_GUARD_DATABASE_PATH_INVALID'
  }

  $userInfo = @($TargetUri.UserInfo -split ':', 2)
  if ($userInfo.Count -lt 1 -or -not $userInfo[0]) {
    throw 'TARGET_GUARD_DATABASE_USER_REQUIRED'
  }
  $databaseUser = [System.Uri]::UnescapeDataString($userInfo[0])
  $databasePassword = if ($userInfo.Count -eq 2) {
    [System.Uri]::UnescapeDataString($userInfo[1])
  } else {
    $null
  }

  $sslMode = $null
  if ($TargetUri.Query) {
    foreach ($pair in $TargetUri.Query.TrimStart('?') -split '&') {
      if (-not $pair) {
        continue
      }
      $parts = @($pair -split '=', 2)
      $key = [System.Uri]::UnescapeDataString($parts[0])
      $value = if ($parts.Count -eq 2) {
        [System.Uri]::UnescapeDataString($parts[1])
      } else {
        ''
      }
      if ($key -cne 'sslmode') {
        throw 'TARGET_GUARD_CONNECTION_OPTION_REJECTED'
      }
      if ($value -notin @(
        'disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'
      )) {
        throw 'TARGET_GUARD_SSLMODE_INVALID'
      }
      $sslMode = $value
    }
  }

  $names = @(
    'PGHOST',
    'PGHOSTADDR',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGSSLMODE',
    'PGOPTIONS',
    'PGSERVICE',
    'PGSERVICEFILE'
  )
  $originalEnvironment = @{}
  foreach ($name in $names) {
    $originalEnvironment[$name] =
      [System.Environment]::GetEnvironmentVariable($name, 'Process')
  }
  # The release runner invokes the standalone concurrency proof in-process.
  # Preserve every nesting level so its guard cannot overwrite the runner's
  # original caller environment.
  $script:CinnabarPgEnvironmentStack.Push($originalEnvironment)

  $env:PGHOST = $TargetUri.Host
  $env:PGHOSTADDR = $null
  $env:PGPORT = if ($TargetUri.Port -gt 0) {
    $TargetUri.Port.ToString()
  } else {
    '5432'
  }
  $env:PGDATABASE = $databaseName
  $env:PGUSER = $databaseUser
  $env:PGPASSWORD = $databasePassword
  $env:PGSSLMODE = $sslMode
  $env:PGOPTIONS = ''
  $env:PGSERVICE = $null
  $env:PGSERVICEFILE = $null
}

function Restore-CinnabarPsqlEnvironment {
  if (-not $script:CinnabarPgEnvironmentStack -or
      $script:CinnabarPgEnvironmentStack.Count -eq 0) {
    return
  }
  $originalEnvironment = $script:CinnabarPgEnvironmentStack.Pop()
  foreach ($entry in $originalEnvironment.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable(
      $entry.Key,
      $entry.Value,
      'Process'
    )
  }
}

function Assert-CinnabarReleaseProofTarget {
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

  if (-not $ConfirmDisposableDatabase) {
    throw 'TARGET_GUARD_DISPOSABLE_CONFIRMATION_REQUIRED'
  }

  if ($DatabaseUrl -notmatch '^postgres(?:ql)?://') {
    throw 'TARGET_GUARD_POSTGRES_URL_REQUIRED'
  }

  try {
    $targetUri = [System.Uri]$DatabaseUrl
  } catch {
    throw 'TARGET_GUARD_INVALID_URL'
  }

  if (-not $targetUri.Host) {
    throw 'TARGET_GUARD_HOST_REQUIRED'
  }
  if ($targetUri.Host -match '(?i)(^|[.-])prod(?:uction)?([.-]|$)' -or
      $ExpectedDatabaseName -match '(?i)(^|[_-])prod(?:uction)?([_-]|$)') {
    throw 'TARGET_GUARD_PRODUCTION_NAME_REJECTED'
  }
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) {
    throw 'TARGET_GUARD_PSQL_UNAVAILABLE'
  }
  $script:CinnabarPsqlCommand = $psql.Source

  try {
    # Credentials move into the temporary child environment so the complete
    # URI never appears in a psql process command line. PGOPTIONS and service
    # settings are cleared so callers cannot forge or redirect the target.
    Set-CinnabarPsqlEnvironment -TargetUri $targetUri
    $query = @"
select current_database(),
       current_user,
       coalesce(current_setting('cinnabar.environment', true), ''),
       pg_is_in_recovery()::text;
"@
    $result = Invoke-CinnabarPsql `
      -Arguments @('-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1') `
      -InputText $query
    if ($result.ExitCode -ne 0) {
      throw 'TARGET_GUARD_PREFLIGHT_CONNECTION_FAILED'
    }

    $line = @(
      $result.Output -split "`r?`n" |
        Where-Object { $_ -match '\|' }
    ) | Select-Object -Last 1
    $fields = @($line -split '\|', 4)
    if ($fields.Count -ne 4) {
      throw 'TARGET_GUARD_PREFLIGHT_RESPONSE_INVALID'
    }
    if ($fields[0] -cne $ExpectedDatabaseName) {
      throw 'TARGET_GUARD_DATABASE_NAME_MISMATCH'
    }
    if ($fields[1] -cne 'postgres') {
      throw 'TARGET_GUARD_POSTGRES_OWNER_REQUIRED'
    }
    if ($fields[2] -cne $Environment) {
      throw 'TARGET_GUARD_SERVER_ENVIRONMENT_MARKER_MISMATCH'
    }
    if ($fields[3] -cne 'false') {
      throw 'TARGET_GUARD_PRIMARY_DATABASE_REQUIRED'
    }
  } catch {
    Restore-CinnabarPsqlEnvironment
    throw
  }
}

function Invoke-CinnabarPsql {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [AllowEmptyString()]
    [string]$InputText
  )

  # PowerShell 7 can opt into translating a non-zero native exit into a
  # terminating error. Disable that only in this local scope so every platform
  # returns the same explicit ExitCode contract to the caller.
  $hasNativeErrorPreference = [bool](Get-Variable `
    -Name PSNativeCommandUseErrorActionPreference `
    -ErrorAction SilentlyContinue)
  if ($hasNativeErrorPreference) {
    $previousNativeErrorPreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
  }
  try {
    if ($PSBoundParameters.ContainsKey('InputText')) {
      $output = $InputText |
        & $script:CinnabarPsqlCommand @Arguments 2>&1
    } else {
      $output = & $script:CinnabarPsqlCommand @Arguments 2>&1
    }
    $exitCode = $LASTEXITCODE
  } finally {
    if ($hasNativeErrorPreference) {
      $PSNativeCommandUseErrorActionPreference =
        $previousNativeErrorPreference
    }
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($output | Out-String).Trim()
  }
}
