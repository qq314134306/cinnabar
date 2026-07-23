import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/migrations/20260723050000_auth_login_transactions.sql',
    import.meta.url,
  )),
  'utf8',
)

describe('server PKCE transaction migration', () => {
  it('is ordered after opaque sessions and stores only an opaque handle hash', () => {
    expect(migration).toContain(
      '-- Apply after 20260723040000_opaque_auth_sessions.sql',
    )
    expect(migration).toContain('handle_hash')
    expect(migration).toContain('verifier_ciphertext')
    expect(migration).toContain('verifier_iv')
    expect(migration).toContain('encryption_key_version')
    expect(migration).not.toMatch(/\bemail\s+(?:text|varchar)/i)
    expect(migration).not.toMatch(/\baccess_token\b/i)
    expect(migration).not.toMatch(/\brefresh_token\b/i)
    expect(migration).not.toMatch(/\bverifier\s+text\b/i)
  })

  it('enforces one-use claim state and separate email/OAuth lifetimes', () => {
    expect(migration).toContain('claimed_at')
    expect(migration).toContain("flow_type in ('email', 'oauth')")
    expect(migration).toContain("interval '1 hour'")
    expect(migration).toContain("interval '10 minutes'")
    expect(migration).toContain('callback_url')
    expect(migration).toContain("callback_url !~ '[?#]'")
  })

  it('keeps browser roles out and allows only the service role to mutate', () => {
    expect(migration).toContain(
      'alter table public.app_auth_login_transactions enable row level security',
    )
    expect(migration).toContain(
      'from public, anon, authenticated',
    )
    expect(migration).toContain(
      'to service_role',
    )
  })
})
