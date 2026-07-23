import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  createOpaqueSessionFromTrustedSupabaseSession,
  sessionCookie,
} from '../api/_app-session'

const APP_ORIGIN = 'https://cinnabar.example'
const NOW = Date.parse('2026-07-23T12:00:00.000Z')

beforeEach(() => {
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.AUTH_MODE = 'dual'
  process.env.SESSION_ENCRYPTION_KEY =
    `v1:${Buffer.alloc(32, 9).toString('base64url')}`
})

afterEach(() => {
  delete process.env.APP_ORIGIN
  delete process.env.AUTH_MODE
  delete process.env.SESSION_ENCRYPTION_KEY
})

describe('trusted PKCE Session persistence', () => {
  it('creates an active opaque row without refreshing or storing plaintext', async () => {
    const sessionRows: Array<Record<string, unknown>> = []
    const auditRows: Array<Record<string, unknown>> = []
    const admin = {
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (row: Record<string, unknown>) => {
          if (table === 'app_auth_sessions') sessionRows.push(row)
          if (table === 'app_auth_events') auditRows.push(row)
          return { error: null }
        }),
      })),
    } as unknown as SupabaseClient
    const session = {
      access_token: 'provider-access-secret',
      refresh_token: 'provider-refresh-secret',
      expires_at: Math.floor(NOW / 1_000) + 3_600,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date(NOW).toISOString(),
      },
    } as Session

    const created = await createOpaqueSessionFromTrustedSupabaseSession(
      new Request(`${APP_ORIGIN}/api/auth/callback?code=redacted`),
      session,
      { admin, now: () => NOW },
    )

    expect(sessionRows).toHaveLength(1)
    expect(sessionRows[0]).toMatchObject({
      migration_state: 'active',
      migration_token_hash: null,
      user_id: session.user.id,
      version: 1,
    })
    const persisted = JSON.stringify(sessionRows[0])
    expect(persisted).not.toContain('provider-access-secret')
    expect(persisted).not.toContain('provider-refresh-secret')
    expect(sessionRows[0].access_token_ciphertext).toEqual(expect.any(String))
    expect(sessionRows[0].refresh_token_ciphertext).toEqual(expect.any(String))
    expect(created.context.accessToken).toBe('provider-access-secret')
    expect(created.sid).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(sessionCookie(created.sid)).toContain('HttpOnly')
    expect(auditRows).toContainEqual(expect.objectContaining({
      event_type: 'session_authenticated',
      reason: 'server_pkce_login',
      user_id: session.user.id,
    }))
  })

  it('rejects expired trusted sessions before writing', async () => {
    const insert = vi.fn()
    const admin = {
      from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient
    const expired = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Math.floor(NOW / 1_000) - 1,
      user: { id: '00000000-0000-4000-8000-000000000001' },
    } as Session

    await expect(createOpaqueSessionFromTrustedSupabaseSession(
      new Request(`${APP_ORIGIN}/api/auth/callback`),
      expired,
      { admin, now: () => NOW },
    )).rejects.toThrowError(/could not be completed/i)
    expect(insert).not.toHaveBeenCalled()
  })

  it('reuses the same-user cookie and rejects a different PKCE identity', async () => {
    const sessionRows: Array<Record<string, unknown>> = []
    const firstAdmin = {
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (row: Record<string, unknown>) => {
          if (table === 'app_auth_sessions') sessionRows.push(row)
          return { error: null }
        }),
      })),
    } as unknown as SupabaseClient
    const existingSession = {
      access_token: 'existing-access',
      refresh_token: 'existing-refresh',
      expires_at: Math.floor(NOW / 1_000) + 3_600,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date(NOW).toISOString(),
      },
    } as Session
    const first = await createOpaqueSessionFromTrustedSupabaseSession(
      new Request(`${APP_ORIGIN}/api/auth/callback`),
      existingSession,
      { admin: firstAdmin, now: () => NOW },
    )
    const row = sessionRows[0]
    const signOut = vi.fn(async () => ({ error: null }))
    const auditInsert = vi.fn(async () => ({ error: null }))
    const secondAdmin = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: existingSession.user },
          error: null,
        })),
        admin: { signOut },
      },
      from: vi.fn((table: string) => {
        if (table === 'app_auth_events') {
          return { insert: auditInsert }
        }
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        }
        return chain
      }),
    } as unknown as SupabaseClient
    const differentSession = {
      ...existingSession,
      access_token: 'different-access',
      refresh_token: 'different-refresh',
      user: {
        ...existingSession.user,
        id: '00000000-0000-4000-8000-000000000002',
      },
    } as Session
    const sameUserSession = {
      ...existingSession,
      access_token: 'same-user-new-access',
      refresh_token: 'same-user-new-refresh',
    } as Session
    const existingRequest = () => new Request(
      `${APP_ORIGIN}/api/auth/callback`,
      {
        headers: {
          Cookie: `__Host-cinnabar_sid=${first.sid}`,
        },
      },
    )

    const reused = await createOpaqueSessionFromTrustedSupabaseSession(
      existingRequest(),
      sameUserSession,
      { admin: secondAdmin, now: () => NOW },
    )
    expect(reused.sid).toBe(first.sid)
    expect(reused.context.user.id).toBe(existingSession.user.id)
    expect(signOut).toHaveBeenCalledWith('same-user-new-access', 'local')
    expect(sessionRows).toHaveLength(1)
    await expect(createOpaqueSessionFromTrustedSupabaseSession(
      existingRequest(),
      differentSession,
      { admin: secondAdmin, now: () => NOW },
    )).rejects.toThrowError(/conflicting/i)
    expect(signOut).toHaveBeenCalledWith('different-access', 'local')
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'identity_conflict',
      reason: 'pkce_cookie_mismatch',
    }))
    expect(sessionRows).toHaveLength(1)
  })
})
