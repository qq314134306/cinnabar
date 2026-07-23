import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/migrations/20260723040000_opaque_auth_sessions.sql',
    import.meta.url,
  )),
  'utf8',
)

describe('opaque auth session migration', () => {
  it('stores only hashed browser secrets and encrypted provider credentials', () => {
    expect(migration).toContain('sid_hash')
    expect(migration).toContain('csrf_hash')
    expect(migration).toContain('access_token_ciphertext')
    expect(migration).toContain('refresh_token_ciphertext')
    expect(migration).toContain('csrf_secret_ciphertext')
    expect(migration).toContain('encryption_key_version')
    expect(migration).not.toMatch(/\baccess_token\s+text\b/)
    expect(migration).not.toMatch(/\brefresh_token\s+text\b/)
  })

  it('enforces absolute/idle/revocation state plus refresh lease and version', () => {
    expect(migration).toContain('last_seen_at')
    expect(migration).toContain('absolute_expires_at')
    expect(migration).toContain('revoked_at')
    expect(migration).toContain('refresh_lease_id')
    expect(migration).toContain('refresh_lease_expires_at')
    expect(migration).toContain('version')
    expect(migration).toContain('claim_app_auth_session_refresh')
    expect(migration).toContain("interval '30 seconds'")
    expect(migration).toContain('p_expected_version')
    expect(migration).toContain('and refresh_lease_id is null')
    expect(migration).not.toContain('refresh_lease_expires_at <= pg_catalog.now()')
  })

  it('persists a unique pending migration before token rotation can become active', () => {
    expect(migration).toContain("migration_state in ('pending', 'active')")
    expect(migration).toContain('migration_token_hash')
    expect(migration).toContain('app_auth_sessions_pending_migration_idx')
    expect(migration).toContain("migration_state = 'active'")
    expect(migration).toContain("migration_state = 'pending'")
    expect(migration).toContain("'migration_reauth_required'")
  })

  it('keeps browser roles out and creates a PII-minimized audit trail', () => {
    expect(migration).toContain(
      'revoke all on public.app_auth_sessions from public, anon, authenticated',
    )
    expect(migration).toContain(
      'grant select, insert, update on public.app_auth_sessions to service_role',
    )
    expect(migration).toContain('create table public.app_auth_events')
    expect(migration).toContain("'identity_conflict'")
    expect(migration).toContain("'session_refreshed'")
    expect(migration).toContain('Tokens, cookies, CSRF values, encryption keys')
  })
})
