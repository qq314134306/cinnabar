import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import {
  assignBffOAuthRedirect,
  AUTH_CALLBACK_ERROR_MESSAGE,
  BffAuthError,
  clearLegacySupabaseAuthStorage,
  consumeAuthCallbackMarker,
  EMAIL_OTP_VERIFICATION_ERROR_MESSAGE,
  fetchBffSession,
  logoutBffSession,
  migrateLegacySession,
  startBffEmailLogin,
  startBffOAuthLogin,
  verifyBffEmailOtp,
} from './supabase'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function validOAuthAuthorizeUrl(
  supabaseOrigin = 'https://project.supabase.co',
  appOrigin = 'https://cinnabar.example',
): string {
  const query = new URLSearchParams({
    provider: 'google',
    redirect_to: `${appOrigin}/api/auth/callback`,
    code_challenge: 'a'.repeat(43),
    code_challenge_method: 's256',
  })
  return `${supabaseOrigin}/auth/v1/authorize?${query}`
}

describe('opaque auth BFF client', () => {
  it('starts email login with the exact BFF body, headers, and credentials', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-email',
      }))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        authMode: 'opaque',
        verificationCsrfToken: 'verify-email',
      }, 202))

    await expect(startBffEmailLogin(
      'reader@example.com',
      fetcher as unknown as typeof fetch,
    )).resolves.toEqual({
      accepted: true,
      authMode: 'opaque',
      verificationCsrfToken: 'verify-email',
    })

    expect(fetcher.mock.calls).toEqual([
      ['/api/auth/login-preflight', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }],
      ['/api/auth/login-email', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF': 'preauth-email',
      },
      body: '{"email":"reader@example.com"}',
      }],
    ])
  })

  it('rejects an email start response without a verification CSRF token', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'dual',
        csrfToken: 'preauth-email',
      }))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        authMode: 'dual',
      }, 202))

    await expect(startBffEmailLogin(
      'reader@example.com',
      fetcher as unknown as typeof fetch,
    )).rejects.toThrow('Sign-in is temporarily unavailable. Please try again.')
  })

  it('performs preflight, email start, then OTP verification without persisting secrets', async () => {
    const localStorageSet = vi.fn()
    const sessionStorageSet = vi.fn()
    vi.stubGlobal('window', {
      localStorage: { setItem: localStorageSet },
      sessionStorage: { setItem: sessionStorageSet },
      location: { origin: 'https://cinnabar.example' },
    })
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-email',
      }))
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        authMode: 'opaque',
        verificationCsrfToken: 'verify-email',
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: true,
        authMode: 'opaque',
        csrfToken: 'session-csrf',
        sessionVersion: 'session-one',
        user: { id: 'user-one', email: 'reader@example.com' },
      }))

    const started = await startBffEmailLogin(
      'reader@example.com',
      fetcher as unknown as typeof fetch,
    )
    const session = await verifyBffEmailOtp(
      'reader@example.com',
      '012345',
      started.verificationCsrfToken,
      fetcher as unknown as typeof fetch,
    )

    expect(session).toMatchObject({
      authenticated: true,
      authMode: 'opaque',
      user: { id: 'user-one', email: 'reader@example.com' },
    })
    expect(fetcher.mock.calls[2]).toEqual([
      '/api/auth/login-email-verify',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF': 'verify-email',
        },
        body: '{"email":"reader@example.com","token":"012345"}',
      },
    ])
    expect(localStorageSet).not.toHaveBeenCalled()
    expect(sessionStorageSet).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('returns fixed copy for OTP verification failures and vendor bodies', async () => {
    const vendorDiagnostic = 'invalid otp for upstream identity record'
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      error: { message: vendorDiagnostic },
    }, 401))

    const error = await verifyBffEmailOtp(
      'reader@example.com',
      '012345',
      'verify-email',
      fetcher as unknown as typeof fetch,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(BffAuthError)
    expect(error).toMatchObject({
      message: EMAIL_OTP_VERIFICATION_ERROR_MESSAGE,
      status: 401,
    })
    expect((error as Error).message).not.toContain(vendorDiagnostic)
  })

  it.each(['12345', '1234567', '１２３４５６', '12a456', '123 456'])(
    'does not POST a non-six-digit ASCII OTP %s',
    async (token) => {
      const fetcher = vi.fn()

      await expect(verifyBffEmailOtp(
        'reader@example.com',
        token,
        'verify-email',
        fetcher as unknown as typeof fetch,
      )).rejects.toThrow(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE)

      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('starts Google OAuth with only the allowlisted provider and redirects with location.assign', async () => {
    const authorizeUrl = validOAuthAuthorizeUrl()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'dual',
        csrfToken: 'preauth-oauth',
      }))
      .mockResolvedValueOnce(jsonResponse({
        url: authorizeUrl,
        authMode: 'dual',
      }))
    const assign = vi.fn()

    const result = await startBffOAuthLogin(
      'google',
      fetcher as unknown as typeof fetch,
      'https://cinnabar.example',
      'https://project.supabase.co',
    )
    assignBffOAuthRedirect(result.url, { assign })

    expect(fetcher.mock.calls).toEqual([
      ['/api/auth/login-preflight', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }],
      ['/api/auth/login-oauth', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF': 'preauth-oauth',
      },
      body: '{"provider":"google"}',
      }],
    ])
    expect(assign).toHaveBeenCalledWith(
      authorizeUrl,
    )
  })

  it.each([
    ['https://evil.example/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback'],
    ['http://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback'],
    ['https://project.supabase.co/auth/v1/token?provider=google&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback'],
    ['https://project.supabase.co/auth/v1/authorize?provider=github&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback'],
    ['https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fevil.example%2Fapi%2Fauth%2Fcallback'],
    ['https://user:password@project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback'],
    ['https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fcinnabar.example%2Fapi%2Fauth%2Fcallback#secret'],
  ])('rejects an unsafe OAuth redirect URL %s', async (oauthUrl) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-oauth',
      }))
      .mockResolvedValueOnce(jsonResponse({
        url: oauthUrl,
        authMode: 'opaque',
      }))

    await expect(startBffOAuthLogin(
      'google',
      fetcher as unknown as typeof fetch,
      'https://cinnabar.example',
      'https://project.supabase.co',
    )).rejects.toMatchObject({
      message: 'Sign-in is temporarily unavailable. Please try again.',
      status: 502,
    })
  })

  it('allows HTTP only for an explicitly configured localhost Supabase URL', async () => {
    const authorizeUrl = validOAuthAuthorizeUrl(
      'http://localhost:54321',
      'http://localhost:5173',
    )
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'dual',
        csrfToken: 'preauth-local',
      }))
      .mockResolvedValueOnce(jsonResponse({
        url: authorizeUrl,
        authMode: 'dual',
      }))

    await expect(startBffOAuthLogin(
      'google',
      fetcher as unknown as typeof fetch,
      'http://localhost:5173',
      'http://localhost:54321',
    )).resolves.toMatchObject({
      authMode: 'dual',
      url: expect.stringContaining('http://localhost:54321/auth/v1/authorize'),
    })
  })

  it.each([
    'https://project.supabase.co/base',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co?tenant=one',
    'https://project.supabase.co#config',
    'http://127.0.0.1:54321',
  ])('rejects an unsafe configured Supabase base URL %s', async (configuredUrl) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-oauth',
      }))
      .mockResolvedValueOnce(jsonResponse({
        url: validOAuthAuthorizeUrl(),
        authMode: 'opaque',
      }))

    await expect(startBffOAuthLogin(
      'google',
      fetcher as unknown as typeof fetch,
      'https://cinnabar.example',
      configuredUrl,
    )).rejects.toThrow('Sign-in is temporarily unavailable. Please try again.')
  })

  it('does not expose vendor response bodies from either login endpoint', async () => {
    const vendorDiagnostic = 'Supabase request abc failed: user probe detail'
    const emailFetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-email',
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: vendorDiagnostic,
        message: vendorDiagnostic,
      }, 503))
    const oauthFetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        authMode: 'opaque',
        csrfToken: 'preauth-oauth',
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: { message: vendorDiagnostic },
      }, 502))

    for (const attempt of [
      startBffEmailLogin(
        'reader@example.com',
        emailFetcher as unknown as typeof fetch,
      ),
      startBffOAuthLogin(
        'google',
        oauthFetcher as unknown as typeof fetch,
        'https://cinnabar.example',
        'https://project.supabase.co',
      ),
    ]) {
      const error = await attempt.catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(BffAuthError)
      expect((error as Error).message).toBe(
        'Sign-in is temporarily unavailable. Please try again.',
      )
      expect((error as Error).message).not.toContain(vendorDiagnostic)
    }
  })

  it('does not POST or persist a token when login preflight fails', async () => {
    const localStorageSet = vi.fn()
    vi.stubGlobal('window', {
      localStorage: { setItem: localStorageSet },
      location: { origin: 'https://cinnabar.example' },
    })
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      error: 'vendor preflight diagnostic',
    }, 503))

    await expect(startBffEmailLogin(
      'reader@example.com',
      fetcher as unknown as typeof fetch,
    )).rejects.toThrow('Sign-in is temporarily unavailable. Please try again.')

    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('/api/auth/login-preflight', expect.any(Object))
    expect(localStorageSet).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('uses same-origin credentials for cookie-first session hydration', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      authenticated: false,
      authMode: 'dual',
    }))

    await fetchBffSession(fetcher as unknown as typeof fetch)

    expect(fetcher).toHaveBeenCalledWith('/api/auth/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  })

  it('sends the legacy token pair only to the one-time migration endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      authenticated: true,
      authMode: 'dual',
      csrfToken: 'csrf-new',
      sessionVersion: 'session-new',
      user: { id: 'user-1', email: 'reader@example.com' },
    }))
    const legacy = {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
    } as Session

    await migrateLegacySession(legacy, fetcher as unknown as typeof fetch)

    const [, request] = fetcher.mock.calls[0]
    expect(request.credentials).toBe('same-origin')
    expect(request.headers.Authorization).toBe('Bearer access-secret')
    expect(request.headers['X-CSRF']).toBe('migrate')
    expect(JSON.parse(request.body)).toEqual({ refreshToken: 'refresh-secret' })
  })

  it.each([
    ['MIGRATION_REAUTH_REQUIRED', 401],
    ['MIGRATION_RETRYABLE', 503],
  ] as const)('parses the allowlisted migration code %s', async (code, status) => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      error: 'Stable migration failure.',
      code,
    }, status))
    const legacy = {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
    } as Session

    const error = await migrateLegacySession(
      legacy,
      fetcher as unknown as typeof fetch,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(BffAuthError)
    expect(error).toMatchObject({
      message: 'Stable migration failure.',
      status,
      code,
    })
  })

  it('does not trust an unknown server error code', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      error: 'Unknown migration failure.',
      code: 'UNTRUSTED_CODE',
    }, 503))
    const legacy = {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
    } as Session

    const error = await migrateLegacySession(
      legacy,
      fetcher as unknown as typeof fetch,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(BffAuthError)
    expect(error).toMatchObject({
      status: 503,
      code: null,
    })
  })

  it('sends BFF logout with the synchronizer token and no Authorization header', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      authenticated: false,
      authMode: 'dual',
    }))

    await logoutBffSession('csrf-current', fetcher as unknown as typeof fetch)

    const [, request] = fetcher.mock.calls[0]
    expect(request.credentials).toBe('same-origin')
    expect(request.headers['X-CSRF']).toBe('csrf-current')
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('removes only Supabase auth keys after successful migration', () => {
    const storage = {
      'sb-project-auth-token': '{"access_token":"secret"}',
      'sb-project-auth-token-code-verifier': 'verifier',
      'sb-project-auth-token.0': 'chunk',
      'cinnabar-settings': '{"persona":"scholar"}',
      'cinnabar-paypal-attempt:user:1-year': 'attempt',
    }
    const localStorage = {
      get length() {
        return Object.keys(storage).length
      },
      key(index: number) {
        return Object.keys(storage)[index] ?? null
      },
      removeItem(key: string) {
        delete storage[key as keyof typeof storage]
      },
    } as Storage

    clearLegacySupabaseAuthStorage(localStorage)

    expect(storage).toEqual({
      'cinnabar-settings': '{"persona":"scholar"}',
      'cinnabar-paypal-attempt:user:1-year': 'attempt',
    })
  })

  it.each([
    ['success', 'success'],
    ['error', 'error'],
    ['untrusted-message', null],
  ] as const)('consumes callback marker %s and preserves unrelated query/hash state', (
    callbackValue,
    expectedMarker,
  ) => {
    const replaceState = vi.fn()
    const marker = consumeAuthCallbackMarker({
      pathname: '/reading',
      search: `?campaign=summer&auth_callback=${callbackValue}&tab=chart`,
      hash: '#result',
    }, {
      state: { navigation: 1 },
      replaceState,
    })

    expect(marker).toBe(expectedMarker)
    expect(replaceState).toHaveBeenCalledWith(
      { navigation: 1 },
      '',
      '/reading?campaign=summer&tab=chart#result',
    )
  })

  it('rejects duplicate callback markers while still removing all of them', () => {
    const replaceState = vi.fn()

    const marker = consumeAuthCallbackMarker({
      pathname: '/',
      search: '?auth_callback=success&campaign=summer&auth_callback=error',
      hash: '',
    }, {
      state: null,
      replaceState,
    })

    expect(marker).toBeNull()
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/?campaign=summer',
    )
  })

  it('exports only the fixed retryable callback error copy', () => {
    expect(AUTH_CALLBACK_ERROR_MESSAGE).toBe(
      'Sign-in could not be completed. Please try again.',
    )
  })
})
