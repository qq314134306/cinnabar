import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  beginEmailLogin,
  beginOAuthLogin,
  claimEmailLoginTransaction,
  claimLoginTransaction,
  clearLoginCsrfCookie,
  clearLoginFlowCookie,
  EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS,
  exchangePkceCode,
  LOGIN_CSRF_COOKIE_NAME,
  LOGIN_FLOW_COOKIE_NAME,
  loginCsrfCookie,
  loginFlowCookie,
  normalizeLoginEmail,
  normalizeEmailOtp,
  normalizeEmailTokenHash,
  OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS,
  readCallbackCode,
  readLoginFlowCookie,
  requireLoginPostGuards,
  validateEmailLoginTransaction,
  verifyEmailLogin,
  type AppAuthLoginTransactionRow,
} from '../api/_auth-login'

const APP_ORIGIN = 'https://cinnabar.example'
const SUPABASE_ORIGIN = 'https://project.supabase.co'
const NOW = Date.parse('2026-07-23T12:00:00.000Z')
const KEY = `v1:${Buffer.alloc(32, 7).toString('base64url')}`

interface InsertCapture {
  inserted: AppAuthLoginTransactionRow[]
  admin: SupabaseClient
}

function insertCapture(): InsertCapture {
  const inserted: AppAuthLoginTransactionRow[] = []
  const admin = {
    from: vi.fn(() => ({
      insert: vi.fn(async (row: AppAuthLoginTransactionRow) => {
        inserted.push(row)
        return { error: null }
      }),
    })),
  } as unknown as SupabaseClient
  return { inserted, admin }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.AUTH_MODE = 'dual'
  process.env.SESSION_ENCRYPTION_KEY = KEY
  process.env.VITE_SUPABASE_URL = SUPABASE_ORIGIN
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable-key'
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.APP_ORIGIN
  delete process.env.AUTH_MODE
  delete process.env.SESSION_ENCRYPTION_KEY
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
})

describe('server-owned PKCE primitives', () => {
  it('uses hardened host-only flow and pre-auth cookies with separate lifetimes', () => {
    const handle = 'h'.repeat(43)
    expect(loginFlowCookie(handle, 'email')).toBe(
      `${LOGIN_FLOW_COOKIE_NAME}=${handle}; Path=/; Max-Age=${EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    )
    expect(loginFlowCookie(handle, 'oauth')).toBe(
      `${LOGIN_FLOW_COOKIE_NAME}=${handle}; Path=/; Max-Age=${OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    )
    expect(loginCsrfCookie(handle)).toBe(
      `${LOGIN_CSRF_COOKIE_NAME}=${handle}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict`,
    )
    expect(clearLoginFlowCookie()).toContain('Max-Age=0')
    expect(clearLoginCsrfCookie()).toContain('Max-Age=0')
    expect(loginFlowCookie(handle, 'oauth')).not.toContain('Domain=')
  })

  it('normalizes only the email and rejects extra callback parameters', () => {
    expect(normalizeLoginEmail('  USER@Example.COM ')).toBe('user@example.com')
    expect(() => normalizeLoginEmail('not-an-email')).toThrowError(/invalid/i)
    expect(normalizeEmailOtp('012345')).toBe('012345')
    expect(() => normalizeEmailOtp('12345')).toThrowError(/invalid/i)
    expect(normalizeEmailTokenHash('a'.repeat(64))).toBe('a'.repeat(64))
    expect(() => normalizeEmailTokenHash('not a token hash'))
      .toThrowError(/invalid/i)
    expect(readCallbackCode(new Request(
      `${APP_ORIGIN}/api/auth/callback?code=one`,
    ))).toBe('one')
    expect(() => readCallbackCode(new Request(
      `${APP_ORIGIN}/api/auth/callback?code=one&code=two`,
    ))).toThrowError(/could not be completed/i)
    expect(() => readCallbackCode(new Request(
      `${APP_ORIGIN}/api/auth/callback?code=one&next=https://attacker.example`,
    ))).toThrowError(/could not be completed/i)
    expect(() => readCallbackCode(new Request(
      `https://attacker.example/api/auth/callback?code=one`,
    ))).toThrowError(/could not be completed/i)
    expect(() => readCallbackCode(new Request(
      `${APP_ORIGIN}/other?code=one`,
    ))).toThrowError(/could not be completed/i)
  })

  it('requires exact same-origin metadata and constant-time double-submit CSRF', () => {
    const token = 'c'.repeat(43)
    const request = (header = token, cookie = token) => new Request(
      `${APP_ORIGIN}/api/auth/login-email`,
      {
        method: 'POST',
        headers: {
          Origin: APP_ORIGIN,
          'Sec-Fetch-Site': 'same-origin',
          'X-CSRF': header,
          Cookie: `${LOGIN_CSRF_COOKIE_NAME}=${cookie}`,
        },
      },
    )
    expect(() => requireLoginPostGuards(request())).not.toThrow()
    expect(() => requireLoginPostGuards(request('x'.repeat(43))))
      .toThrowError(/verification/i)
    expect(() => requireLoginPostGuards(new Request(
      `${APP_ORIGIN}/api/auth/login-email`,
      {
        method: 'POST',
        headers: {
          Origin: APP_ORIGIN,
          'Sec-Fetch-Site': 'same-origin',
          'X-CSRF': token,
          Cookie: `${LOGIN_CSRF_COOKIE_NAME}=${token}; ${LOGIN_CSRF_COOKIE_NAME}=${token}`,
        },
      },
    ))).toThrowError(/verification/i)
  })

  it('persists an encrypted verifier before returning a validated Google URL', async () => {
    const capture = insertCapture()
    const result = await beginOAuthLogin('google', {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })

    expect(capture.inserted).toHaveLength(1)
    const row = capture.inserted[0]
    expect(row.flow_type).toBe('oauth')
    expect(row.callback_url).toBe(`${APP_ORIGIN}/api/auth/callback`)
    expect(row.expires_at).toBe(
      new Date(NOW + OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS * 1_000).toISOString(),
    )
    expect(row.verifier_ciphertext).not.toContain('undefined')
    expect(Object.keys(row)).not.toContain('email')
    expect(Object.keys(row)).not.toContain('access_token')
    const url = new URL(result.url)
    expect(url.origin).toBe(SUPABASE_ORIGIN)
    expect(url.pathname).toBe('/auth/v1/authorize')
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('redirect_to')).toBe(
      `${APP_ORIGIN}/api/auth/callback`,
    )
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    expect(result.url).not.toContain(row.verifier_ciphertext)
    expect(result.flowCookie).toContain('Max-Age=600')
  })

  it('sends email PKCE with the exact callback and stores no email in the transaction', async () => {
    const capture = insertCapture()
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input))
      expect(url.origin).toBe(SUPABASE_ORIGIN)
      expect(url.pathname).toBe('/auth/v1/otp')
      expect(url.searchParams.get('redirect_to')).toBe(
        `${APP_ORIGIN}/api/auth/callback`,
      )
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.email).toBe('user@example.com')
      expect(body.code_challenge_method).toBe('s256')
      expect(typeof body.code_challenge).toBe('string')
      return jsonResponse({})
    })

    const result = await beginEmailLogin('user@example.com', {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(capture.inserted).toHaveLength(1)
    expect(capture.inserted[0].flow_type).toBe('email')
    expect(capture.inserted[0].expires_at).toBe(
      new Date(NOW + EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS * 1_000).toISOString(),
    )
    expect(JSON.stringify(capture.inserted[0])).not.toContain('user@example.com')
    expect(result.flowCookie).toContain('Max-Age=3600')
  })

  it('claims once, accepts normalized timestamptz, and decrypts the bound verifier', async () => {
    const capture = insertCapture()
    const started = await beginOAuthLogin('google', {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })
    const handle = readLoginFlowCookie(new Request(APP_ORIGIN, {
      headers: {
        Cookie: started.flowCookie.split(';', 1)[0],
      },
    }))
    const sourceRow = capture.inserted[0]
    let available = true
    const admin = {
      from: vi.fn(() => {
        const query = {
          update: vi.fn((patch: { claimed_at: string }) => {
            const chain = {
              eq: vi.fn(() => chain),
              is: vi.fn(() => chain),
              gt: vi.fn(() => chain),
              select: vi.fn(() => chain),
              maybeSingle: vi.fn(async () => {
                if (!available) return { data: null, error: null }
                available = false
                return {
                  data: {
                    ...sourceRow,
                    claimed_at: patch.claimed_at.replace('Z', '+00:00'),
                  },
                  error: null,
                }
              }),
            }
            return chain
          }),
        }
        return query
      }),
    } as unknown as SupabaseClient

    const claims = await Promise.allSettled([
      claimLoginTransaction(handle, {
        admin,
        now: () => NOW,
        fetchImpl: vi.fn(),
      }),
      claimLoginTransaction(handle, {
        admin,
        now: () => NOW,
        fetchImpl: vi.fn(),
      }),
    ])
    const fulfilled = claims.filter(
      (claim): claim is PromiseFulfilledResult<{
        flowType: 'email' | 'oauth'
        verifier: string
      }> => claim.status === 'fulfilled',
    )
    const rejected = claims.filter((claim) => claim.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(fulfilled[0].value.flowType).toBe('oauth')
    expect(fulfilled[0].value.verifier).toMatch(
      /^[A-Za-z0-9._~-]{43,128}$/,
    )
  })

  it('puts email flow type in the atomic claim predicate', async () => {
    const handle = 'h'.repeat(43)
    const eqCalls: Array<[string, string]> = []
    const nowIso = new Date(NOW).toISOString()
    const handleHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(handle),
    ).then((digest) => Buffer.from(digest).toString('base64url'))
    const chain = {
      eq: vi.fn((column: string, value: string) => {
        eqCalls.push([column, value])
        return chain
      }),
      is: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: {
          handle_hash: handleHash,
          flow_type: 'email',
          encryption_key_version: 'v1',
          verifier_ciphertext: 'unused',
          verifier_iv: 'unused',
          callback_url: `${APP_ORIGIN}/api/auth/callback`,
          created_at: nowIso,
          expires_at: new Date(NOW + 60_000).toISOString(),
          claimed_at: nowIso,
        },
        error: null,
      })),
    }
    const admin = {
      from: vi.fn(() => ({
        update: vi.fn(() => chain),
      })),
    } as unknown as SupabaseClient

    await claimEmailLoginTransaction(handle, {
      admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })
    expect(eqCalls).toContainEqual(['flow_type', 'email'])
  })

  it('validates the email landing transaction with a read and never updates it', async () => {
    const handle = 'h'.repeat(43)
    const handleHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(handle),
    ).then((digest) => Buffer.from(digest).toString('base64url'))
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: {
          handle_hash: handleHash,
          flow_type: 'email',
          callback_url: `${APP_ORIGIN}/api/auth/callback`,
          expires_at: new Date(NOW + 60_000).toISOString(),
          claimed_at: null,
        },
        error: null,
      })),
    }
    const select = vi.fn(() => chain)
    const update = vi.fn()
    const admin = {
      from: vi.fn(() => ({ select, update })),
    } as unknown as SupabaseClient

    await validateEmailLoginTransaction(handle, {
      admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })
    expect(select).toHaveBeenCalledWith(
      'handle_hash,flow_type,callback_url,expires_at,claimed_at',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('exchanges with the claimed verifier in request-only Supabase storage', async () => {
    const verifier = 'v'.repeat(64)
    const capture = insertCapture()
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/auth/v1/token')
      expect(url.searchParams.get('grant_type')).toBe('pkce')
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toEqual({
        auth_code: 'provider-code',
        code_verifier: verifier,
      })
      return jsonResponse({
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expires_in: 3_600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date(NOW).toISOString(),
        },
      })
    })

    const session = await exchangePkceCode('provider-code', verifier, {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.access_token).toBe('access-secret')
    expect(session.refresh_token).toBe('refresh-secret')
  })

  it.each([
    {
      label: 'manual OTP',
      credentials: {
        email: 'user@example.com',
        token: '012345',
        type: 'email' as const,
      },
      expectedBody: {
        email: 'user@example.com',
        token: '012345',
        type: 'email',
        gotrue_meta_security: {},
      },
    },
    {
      label: 'template TokenHash',
      credentials: {
        token_hash: 'a'.repeat(64),
        type: 'email' as const,
      },
      expectedBody: {
        token_hash: 'a'.repeat(64),
        type: 'email',
        gotrue_meta_security: {},
      },
    },
  ])('uses the real auth-js /verify shape for $label', async ({
    credentials,
    expectedBody,
  }) => {
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input))
      expect(url.origin).toBe(SUPABASE_ORIGIN)
      expect(url.pathname).toBe('/auth/v1/verify')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual(expectedBody)
      return jsonResponse({
        access_token: 'verified-access-secret',
        refresh_token: 'verified-refresh-secret',
        expires_in: 3_600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date(NOW).toISOString(),
        },
      })
    })
    const session = await verifyEmailLogin(credentials, {
      admin: insertCapture().admin,
      now: () => NOW,
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.access_token).toBe('verified-access-secret')
    expect(JSON.stringify(expectedBody)).not.toContain('code_verifier')
  })

  it.each([
    'ftp://localhost',
    'https://project.supabase.co/nested',
  ])('fails closed for an invalid Supabase base URL: %s', async (configured) => {
    process.env.VITE_SUPABASE_URL = configured
    const capture = insertCapture()
    await expect(beginOAuthLogin('google', {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })).rejects.toThrowError(/temporarily unavailable/i)
    expect(capture.inserted).toHaveLength(0)
  })

  it('rejects server login in legacy mode before touching Supabase', async () => {
    process.env.AUTH_MODE = 'legacy'
    const capture = insertCapture()
    await expect(beginOAuthLogin('google', {
      admin: capture.admin,
      now: () => NOW,
      fetchImpl: vi.fn(),
    })).rejects.toThrowError(/not enabled/i)
    expect(capture.inserted).toHaveLength(0)
  })
})
