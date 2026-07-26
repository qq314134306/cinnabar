import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AppAuthError } from '../api/_auth'

const loginMocks = vi.hoisted(() => ({
  beginEmailLogin: vi.fn(),
  beginOAuthLogin: vi.fn(),
  claimEmailLoginTransaction: vi.fn(),
  claimLoginTransaction: vi.fn(),
  exchangePkceCode: vi.fn(),
  validateEmailLoginTransaction: vi.fn(),
  verifyEmailLogin: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  createOpaqueSessionFromTrustedSupabaseSession: vi.fn(),
}))

vi.mock('../api/_auth-login', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_auth-login')>()
  return {
    ...actual,
    beginEmailLogin: loginMocks.beginEmailLogin,
    beginOAuthLogin: loginMocks.beginOAuthLogin,
    claimEmailLoginTransaction: loginMocks.claimEmailLoginTransaction,
    claimLoginTransaction: loginMocks.claimLoginTransaction,
    exchangePkceCode: loginMocks.exchangePkceCode,
    validateEmailLoginTransaction: loginMocks.validateEmailLoginTransaction,
    verifyEmailLogin: loginMocks.verifyEmailLogin,
  }
})

vi.mock('../api/_app-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_app-session')>()
  return {
    ...actual,
    createOpaqueSessionFromTrustedSupabaseSession:
      sessionMocks.createOpaqueSessionFromTrustedSupabaseSession,
  }
})

import {
  LOGIN_CSRF_COOKIE_NAME,
  LOGIN_FLOW_COOKIE_NAME,
} from '../api/_auth-login'
import callbackHandler from '../api/_auth-route-callback'
import emailConfirmHandler from '../api/_auth-route-email-confirm'
import loginEmailHandler from '../api/_auth-route-login-email'
import loginEmailVerifyHandler from '../api/_auth-route-login-email-verify'
import loginOAuthHandler from '../api/_auth-route-login-oauth'
import preflightHandler from '../api/_auth-route-login-preflight'

const APP_ORIGIN = 'https://cinnabar.example'
const CSRF = 'c'.repeat(43)
const FLOW = 'f'.repeat(43)
const SID = 's'.repeat(43)

function loginRequest(
  path: string,
  body: Record<string, unknown>,
  options: {
    csrf?: string
    cookie?: string
    origin?: string
    fetchSite?: string
  } = {},
): Request {
  return new Request(`${APP_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin ?? APP_ORIGIN,
      'Sec-Fetch-Site': options.fetchSite ?? 'same-origin',
      'X-CSRF': options.csrf ?? CSRF,
      Cookie: options.cookie
        ?? `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.AUTH_MODE = 'dual'
  loginMocks.beginEmailLogin.mockReset()
  loginMocks.beginOAuthLogin.mockReset()
  loginMocks.claimEmailLoginTransaction.mockReset()
  loginMocks.claimLoginTransaction.mockReset()
  loginMocks.exchangePkceCode.mockReset()
  loginMocks.validateEmailLoginTransaction.mockReset()
  loginMocks.verifyEmailLogin.mockReset()
  sessionMocks.createOpaqueSessionFromTrustedSupabaseSession.mockReset()
  loginMocks.beginEmailLogin.mockResolvedValue({
    flowCookie:
      `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`,
  })
  loginMocks.beginOAuthLogin.mockResolvedValue({
    url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    flowCookie:
      `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  })
})

afterEach(() => {
  delete process.env.APP_ORIGIN
  delete process.env.AUTH_MODE
})

describe('server login HTTP endpoints', () => {
  it('issues a Strict pre-auth cookie and matching token only outside legacy', async () => {
    const response = await preflightHandler(new Request(
      `${APP_ORIGIN}/api/auth/login-preflight`,
    ))
    expect(response.status).toBe(200)
    const body = await response.json() as {
      authMode: string
      csrfToken: string
    }
    expect(body.authMode).toBe('dual')
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(
      `${LOGIN_CSRF_COOKIE_NAME}=${body.csrfToken}`,
    )
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')

    process.env.AUTH_MODE = 'legacy'
    const legacy = await preflightHandler(new Request(
      `${APP_ORIGIN}/api/auth/login-preflight`,
    ))
    expect(legacy.status).toBe(503)
    await expect(legacy.json()).resolves.toMatchObject({
      error: { code: 'SERVER_LOGIN_DISABLED' },
    })
  })

  it('normalizes an exact email body and returns a stable no-enumeration shape', async () => {
    const response = await loginEmailHandler(loginRequest(
      '/api/auth/login-email',
      { email: ' USER@Example.COM ' },
    ))
    expect(response.status).toBe(202)
    const body = await response.json() as {
      accepted: boolean
      authMode: string
      verificationCsrfToken: string
    }
    expect(body).toMatchObject({
      accepted: true,
      authMode: 'dual',
    })
    expect(body.verificationCsrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(loginMocks.beginEmailLogin).toHaveBeenCalledWith('user@example.com')
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain(`${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`)
    expect(cookies[1]).toContain(
      `${LOGIN_CSRF_COOKIE_NAME}=${body.verificationCsrfToken}`,
    )
    expect(cookies[1]).toContain('SameSite=Strict')
    expect(cookies[1]).not.toContain('Max-Age=0')
  })

  it('accepts only Google and never accepts a client redirect target', async () => {
    const accepted = await loginOAuthHandler(loginRequest(
      '/api/auth/login-oauth',
      { provider: 'google' },
    ))
    expect(accepted.status).toBe(200)
    await expect(accepted.json()).resolves.toEqual({
      authMode: 'dual',
      url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    })

    const rejected = await loginOAuthHandler(loginRequest(
      '/api/auth/login-oauth',
      { provider: 'google', next: 'https://attacker.example' },
    ))
    expect(rejected.status).toBe(400)
    expect(loginMocks.beginOAuthLogin).toHaveBeenCalledTimes(1)
    expect(rejected.headers.get('set-cookie')).toContain(
      `${LOGIN_CSRF_COOKIE_NAME}=`,
    )
  })

  it.each([
    ['wrong origin', { origin: 'https://attacker.example' }],
    ['cross-site', { fetchSite: 'cross-site' }],
    ['wrong token', { csrf: 'x'.repeat(43) }],
    ['duplicate cookie', {
      cookie: `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; ${LOGIN_CSRF_COOKIE_NAME}=${CSRF}`,
    }],
  ])('rejects %s before starting an email login', async (_case, options) => {
    const response = await loginEmailHandler(loginRequest(
      '/api/auth/login-email',
      { email: 'user@example.com' },
      options,
    ))
    expect(response.status).toBe(403)
    expect(loginMocks.beginEmailLogin).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('fails login POST closed in legacy mode', async () => {
    process.env.AUTH_MODE = 'legacy'
    const response = await loginEmailHandler(loginRequest(
      '/api/auth/login-email',
      { email: 'user@example.com' },
    ))
    expect(response.status).toBe(503)
    expect(loginMocks.beginEmailLogin).not.toHaveBeenCalled()
  })
})

describe('scanner-safe email verification endpoints', () => {
  const trustedSession = {
    access_token: 'provider-access-secret',
    refresh_token: 'provider-refresh-secret',
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
    },
  }
  const opaqueContext = {
    method: 'opaque',
    authMode: 'dual',
    user: trustedSession.user,
    accessToken: trustedSession.access_token,
    csrfToken: 'session-csrf',
    sessionVersion: 'session-id',
    sessionId: 'session-id',
  }

  beforeEach(() => {
    loginMocks.claimEmailLoginTransaction.mockResolvedValue(undefined)
    loginMocks.validateEmailLoginTransaction.mockResolvedValue(undefined)
    loginMocks.verifyEmailLogin.mockResolvedValue(trustedSession)
    sessionMocks.createOpaqueSessionFromTrustedSupabaseSession
      .mockResolvedValue({
        sid: SID,
        context: opaqueContext,
      })
  })

  function verificationRequest(
    path: string,
    body: Record<string, unknown>,
  ): Request {
    return loginRequest(path, body, {
      cookie:
        `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; `
        + `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
    })
  }

  it('claims an email flow before one manual OTP verification and returns only the public session', async () => {
    const response = await loginEmailVerifyHandler(verificationRequest(
      '/api/auth/login-email-verify',
      { email: ' USER@Example.COM ', token: '012345' },
    ))
    const responseText = await response.clone().text()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      authMode: 'dual',
      csrfToken: 'session-csrf',
      sessionVersion: 'session-id',
      user: {
        id: trustedSession.user.id,
        email: 'user@example.com',
      },
    })
    expect(loginMocks.claimEmailLoginTransaction).toHaveBeenCalledWith(FLOW)
    expect(loginMocks.verifyEmailLogin).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '012345',
      type: 'email',
    })
    expect(
      loginMocks.claimEmailLoginTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(loginMocks.verifyEmailLogin.mock.invocationCallOrder[0])
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(3)
    expect(cookies.some((cookie) => cookie.includes(
      `__Host-cinnabar_sid=${SID}`,
    ))).toBe(true)
    expect(cookies.some((cookie) => (
      cookie.includes(`${LOGIN_FLOW_COOKIE_NAME}=`)
      && cookie.includes('Max-Age=0')
    ))).toBe(true)
    expect(cookies.some((cookie) => (
      cookie.includes(`${LOGIN_CSRF_COOKIE_NAME}=`)
      && cookie.includes('Max-Age=0')
    ))).toBe(true)
    const serialized = JSON.stringify([
      ...response.headers,
      responseText,
    ])
    expect(serialized).not.toContain('provider-access-secret')
    expect(serialized).not.toContain('provider-refresh-secret')
    expect(serialized).not.toContain('012345')
  })

  it('rejects invalid manual input before claim with one fixed terminal error', async () => {
    const response = await loginEmailVerifyHandler(verificationRequest(
      '/api/auth/login-email-verify',
      { email: 'user@example.com', token: '12345' },
    ))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'EMAIL_VERIFICATION_FAILED',
        message:
          'Email verification could not be completed. Please start again.',
      },
    })
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toHaveLength(2)
  })

  it('renders a passive no-resource GET that clears the fragment before requiring a click', async () => {
    const response = await emailConfirmHandler(new Request(
      `${APP_ORIGIN}/api/auth/email-confirm`,
      {
        headers: {
          Cookie: `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
      },
    ))
    expect(response.status).toBe(200)
    expect(loginMocks.validateEmailLoginTransaction).toHaveBeenCalledWith(FLOW)
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
    const html = await response.text()
    const clearIndex = html.indexOf('window.history.replaceState')
    const clickIndex = html.indexOf("addEventListener('click'")
    expect(clearIndex).toBeGreaterThan(0)
    expect(clickIndex).toBeGreaterThan(clearIndex)
    expect(html).toContain('window.location.hash')
    expect(html).not.toContain('c'.repeat(64))
    expect(html).toContain("method: 'POST'")
    expect(html).not.toMatch(/<(?:img|iframe|link)\b/iu)
    expect(html).not.toMatch(/\b(?:src|href)=["']https?:/iu)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    const csp = response.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/u)
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toContain(`${LOGIN_CSRF_COOKIE_NAME}=`)
    expect(cookies[0]).toContain('SameSite=Strict')
    expect(cookies[0]).not.toContain('Max-Age=0')
  })

  it('rejects a landing GET without a flow cookie before any database or provider call', async () => {
    const response = await emailConfirmHandler(new Request(
      `${APP_ORIGIN}/api/auth/email-confirm`,
    ))
    expect(response.status).toBe(400)
    expect(loginMocks.validateEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it.each([
    `${APP_ORIGIN}/api/auth/email-confirm?token_hash=${'a'.repeat(64)}`,
    `${APP_ORIGIN}/api/auth/email-confirm?next=https://attacker.example`,
    `${APP_ORIGIN}/other`,
  ])('rejects non-exact landing URL without database or provider calls: %s', async (url) => {
    const response = await emailConfirmHandler(new Request(url, {
      headers: {
        Cookie: `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
      },
    }))
    expect(response.status).toBe(400)
    expect(loginMocks.validateEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain('a'.repeat(64))
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('keeps exact and invalid scanner HEAD requests passive and cookieless', async () => {
    const exact = await emailConfirmHandler(new Request(
      `${APP_ORIGIN}/api/auth/email-confirm`,
      {
        method: 'HEAD',
        headers: {
          Cookie: `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
      },
    ))
    const invalid = await emailConfirmHandler(new Request(
      `${APP_ORIGIN}/api/auth/email-confirm?probe=1`,
      {
        method: 'HEAD',
        headers: {
          Cookie: `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
      },
    ))
    expect(exact.status).toBe(204)
    expect(invalid.status).toBe(400)
    for (const response of [exact, invalid]) {
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(response.headers.getSetCookie()).toHaveLength(0)
    }
    expect(loginMocks.validateEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
  })

  it('verifies only the template TokenHash after an explicit guarded POST', async () => {
    const tokenHash = 'a'.repeat(64)
    const response = await emailConfirmHandler(verificationRequest(
      '/api/auth/email-confirm',
      { tokenHash },
    ))
    expect(response.status).toBe(200)
    expect(loginMocks.claimEmailLoginTransaction).toHaveBeenCalledWith(FLOW)
    expect(loginMocks.verifyEmailLogin).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: 'email',
    })
    expect(
      loginMocks.claimEmailLoginTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(loginMocks.verifyEmailLogin.mock.invocationCallOrder[0])
    const responseText = await response.text()
    expect(responseText).not.toContain(tokenHash)
    expect(responseText).not.toContain('provider-access-secret')
    expect(response.headers.getSetCookie()).toHaveLength(3)
  })

  it('stops replay at the database claim and never performs a second verify', async () => {
    loginMocks.claimEmailLoginTransaction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppAuthError(
        'Authentication flow is invalid or expired.',
        400,
        'LOGIN_FLOW_INVALID',
      ))
    const request = () => verificationRequest(
      '/api/auth/email-confirm',
      { tokenHash: 'b'.repeat(64) },
    )
    const first = await emailConfirmHandler(request())
    const replay = await emailConfirmHandler(request())
    expect(first.status).toBe(200)
    expect(replay.status).toBe(400)
    expect(loginMocks.claimEmailLoginTransaction).toHaveBeenCalledTimes(2)
    expect(loginMocks.verifyEmailLogin).toHaveBeenCalledTimes(1)
    expect(
      sessionMocks.createOpaqueSessionFromTrustedSupabaseSession,
    ).toHaveBeenCalledTimes(1)
  })

  it('hides provider failure details and never retries verification after claim', async () => {
    loginMocks.claimEmailLoginTransaction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppAuthError(
        'Authentication flow is invalid or expired.',
        400,
        'LOGIN_FLOW_INVALID',
      ))
    loginMocks.verifyEmailLogin.mockRejectedValueOnce(
      new Error('vendor rejected token_hash=provider-secret-value'),
    )
    const request = () => verificationRequest(
      '/api/auth/email-confirm',
      { tokenHash: 'd'.repeat(64) },
    )
    const first = await emailConfirmHandler(request())
    const replay = await emailConfirmHandler(request())
    expect(first.status).toBe(400)
    expect(replay.status).toBe(400)
    expect(loginMocks.verifyEmailLogin).toHaveBeenCalledTimes(1)
    expect(await first.text()).not.toContain('vendor')
    expect(await replay.text()).not.toContain('provider-secret-value')
  })

  it('rejects wrong-origin and duplicate-CSRF verification before claim', async () => {
    const wrongOrigin = await loginEmailVerifyHandler(new Request(
      `${APP_ORIGIN}/api/auth/login-email-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://attacker.example',
          'Sec-Fetch-Site': 'cross-site',
          'X-CSRF': CSRF,
          Cookie:
            `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; `
            + `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
        body: JSON.stringify({
          email: 'user@example.com',
          token: '012345',
        }),
      },
    ))
    const duplicateCsrf = await loginEmailVerifyHandler(new Request(
      `${APP_ORIGIN}/api/auth/login-email-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: APP_ORIGIN,
          'Sec-Fetch-Site': 'same-origin',
          'X-CSRF': CSRF,
          Cookie:
            `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; `
            + `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; `
            + `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
        body: JSON.stringify({
          email: 'user@example.com',
          token: '012345',
        }),
      },
    ))
    expect(wrongOrigin.status).toBe(400)
    expect(duplicateCsrf.status).toBe(400)
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
  })

  it('requires same-origin Fetch metadata, matching CSRF, and the flow cookie', async () => {
    const makeRequest = (
      fetchSite: string,
      csrfHeader: string,
      cookie: string,
    ) => new Request(`${APP_ORIGIN}/api/auth/login-email-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: APP_ORIGIN,
        'Sec-Fetch-Site': fetchSite,
        'X-CSRF': csrfHeader,
        Cookie: cookie,
      },
      body: JSON.stringify({
        email: 'user@example.com',
        token: '012345',
      }),
    })
    const cookie =
      `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}; `
      + `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`
    const responses = await Promise.all([
      loginEmailVerifyHandler(makeRequest('cross-site', CSRF, cookie)),
      loginEmailVerifyHandler(makeRequest(
        'same-origin',
        'x'.repeat(43),
        cookie,
      )),
      loginEmailVerifyHandler(makeRequest(
        'same-origin',
        CSRF,
        `${LOGIN_CSRF_COOKIE_NAME}=${CSRF}`,
      )),
    ])
    expect(responses.map((response) => response.status)).toEqual([
      400,
      400,
      400,
    ])
    expect(loginMocks.claimEmailLoginTransaction).not.toHaveBeenCalled()
    expect(loginMocks.verifyEmailLogin).not.toHaveBeenCalled()
  })

  it('ships a scanner-safe template with OTP and fragment-only TokenHash', () => {
    const template = readFileSync(
      new URL('../../supabase/templates/magic_link.html', import.meta.url),
      'utf8',
    )
    expect(template).toContain('{{ .Token }}')
    expect(template).toContain(
      '{{ .SiteURL }}/api/auth/email-confirm#token_hash={{ .TokenHash }}',
    )
    expect(template).not.toContain('.ConfirmationURL')
    expect(template).not.toMatch(/https?:\/\//iu)
    expect(template).not.toMatch(/<(?:img|iframe|script|link)\b/iu)
  })
})

describe('PKCE callback endpoint', () => {
  const trustedSession = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    user: { id: 'user-id' },
  }

  beforeEach(() => {
    loginMocks.claimLoginTransaction.mockResolvedValue({
      flowType: 'oauth',
      verifier: 'v'.repeat(64),
    })
    loginMocks.exchangePkceCode.mockResolvedValue(trustedSession)
    sessionMocks.createOpaqueSessionFromTrustedSupabaseSession.mockResolvedValue({
      sid: SID,
      context: { sessionId: 'session-id' },
    })
  })

  function callbackRequest(query = 'code=provider-code', cookie = FLOW): Request {
    return new Request(
      `${APP_ORIGIN}/api/auth/callback?${query}`,
      {
        headers: {
          Cookie: `${LOGIN_FLOW_COOKIE_NAME}=${cookie}`,
        },
      },
    )
  }

  it('claims before exchange and returns only fixed redirect markers and cookies', async () => {
    const response = await callbackHandler(callbackRequest())
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/?auth_callback=success`,
    )
    expect(await response.text()).toBe('')
    expect(loginMocks.claimLoginTransaction).toHaveBeenCalledWith(FLOW)
    expect(loginMocks.exchangePkceCode).toHaveBeenCalledWith(
      'provider-code',
      'v'.repeat(64),
    )
    expect(
      loginMocks.claimLoginTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(loginMocks.exchangePkceCode.mock.invocationCallOrder[0])
    expect(
      loginMocks.exchangePkceCode.mock.invocationCallOrder[0],
    ).toBeLessThan(
      sessionMocks.createOpaqueSessionFromTrustedSupabaseSession
        .mock.invocationCallOrder[0],
    )
    const cookies = response.headers.get('set-cookie') ?? ''
    expect(cookies).toContain(`${LOGIN_FLOW_COOKIE_NAME}=`)
    expect(cookies).toContain('Max-Age=0')
    expect(cookies).toContain(`__Host-cinnabar_sid=${SID}`)
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(JSON.stringify([...response.headers])).not.toContain('access-token')
    expect(JSON.stringify([...response.headers])).not.toContain('refresh-token')
  })

  it.each([
    ['missing cookie', callbackRequest('code=provider-code', '')],
    ['duplicate cookie', new Request(
      `${APP_ORIGIN}/api/auth/callback?code=provider-code`,
      {
        headers: {
          Cookie:
            `${LOGIN_FLOW_COOKIE_NAME}=${FLOW}; ${LOGIN_FLOW_COOKIE_NAME}=${FLOW}`,
        },
      },
    )],
    ['tampered cookie', callbackRequest('code=provider-code', 'short')],
    ['duplicate code', callbackRequest('code=one&code=two')],
  ])('rejects %s without exchanging a provider code', async (_case, request) => {
    const response = await callbackHandler(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/?auth_callback=error`,
    )
    expect(loginMocks.exchangePkceCode).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('treats an expired or replayed transaction as final and never exchanges twice', async () => {
    loginMocks.claimLoginTransaction.mockRejectedValue(
      new AppAuthError(
        'Authentication flow is invalid or expired.',
        400,
        'LOGIN_FLOW_INVALID',
      ),
    )
    const first = await callbackHandler(callbackRequest())
    const replay = await callbackHandler(callbackRequest())
    expect(first.headers.get('location')).toContain('auth_callback=error')
    expect(replay.headers.get('location')).toContain('auth_callback=error')
    expect(loginMocks.claimLoginTransaction).toHaveBeenCalledTimes(2)
    expect(loginMocks.exchangePkceCode).not.toHaveBeenCalled()
  })

  it('clears the flow cookie and hides upstream failures', async () => {
    loginMocks.exchangePkceCode.mockRejectedValue(
      new Error('vendor says token=secret-provider-value'),
    )
    const response = await callbackHandler(callbackRequest())
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/?auth_callback=error`,
    )
    expect(await response.text()).toBe('')
    expect(JSON.stringify([...response.headers])).not.toContain('vendor')
    expect(response.headers.get('set-cookie')).toContain(
      `${LOGIN_FLOW_COOKIE_NAME}=`,
    )
    expect(response.headers.get('set-cookie')).not.toContain(
      '__Host-cinnabar_sid=',
    )
  })
})
