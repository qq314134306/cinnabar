import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppAuthError } from '../api/_auth'

const sessionMocks = vi.hoisted(() => ({
  authenticateAppRequest: vi.fn(),
  createOpaqueSessionFromLegacy: vi.fn(),
  publicSession: vi.fn(),
  revokeOpaqueSession: vi.fn(),
}))

vi.mock('../api/_app-session', () => ({
  SESSION_COOKIE_NAME: '__Host-cinnabar_sid',
  authenticateAppRequest: sessionMocks.authenticateAppRequest,
  createOpaqueSessionFromLegacy: sessionMocks.createOpaqueSessionFromLegacy,
  publicSession: sessionMocks.publicSession,
  revokeOpaqueSession: sessionMocks.revokeOpaqueSession,
  sessionCookie: (sid: string) =>
    `__Host-cinnabar_sid=${sid}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
  clearSessionCookie: () =>
    '__Host-cinnabar_sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
}))

import logoutHandler from '../api/_auth-route-logout'
import migrateHandler from '../api/_auth-route-migrate'
import sessionHandler from '../api/_auth-route-session'

const APP_ORIGIN = 'https://cinnabar.example'
const SID = 's'.repeat(43)

beforeEach(() => {
  process.env.APP_ORIGIN = APP_ORIGIN
  process.env.AUTH_MODE = 'dual'
  sessionMocks.authenticateAppRequest.mockReset()
  sessionMocks.createOpaqueSessionFromLegacy.mockReset()
  sessionMocks.publicSession.mockReset()
  sessionMocks.revokeOpaqueSession.mockReset()
})

afterEach(() => {
  delete process.env.APP_ORIGIN
  delete process.env.AUTH_MODE
})

describe('opaque auth endpoint contract', () => {
  it('hydrates a signed-out state without exposing a vendor reason', async () => {
    sessionMocks.authenticateAppRequest.mockRejectedValue(
      new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION'),
    )

    const response = await sessionHandler(new Request(`${APP_ORIGIN}/api/auth/session`))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      authMode: 'dual',
    })
    expect(response.headers.get('set-cookie')).toContain(
      '__Host-cinnabar_sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    )
  })

  it('preserves the SID cookie when provider identity is temporarily unavailable', async () => {
    sessionMocks.authenticateAppRequest.mockRejectedValue(
      new AppAuthError(
        'Authentication is temporarily unavailable.',
        503,
        'AUTH_UPSTREAM_UNAVAILABLE',
      ),
    )

    const response = await sessionHandler(new Request(
      `${APP_ORIGIN}/api/auth/session`,
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'AUTH_UPSTREAM_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.',
      },
    })
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('migrates only an exact guarded legacy session and sets a host-only cookie', async () => {
    const context = { sessionVersion: 'session-version' }
    const publicValue = {
      authenticated: true,
      authMode: 'dual',
      csrfToken: 'csrf-token',
      sessionVersion: 'session-version',
      user: { id: 'user-id', email: 'user@example.test' },
    }
    sessionMocks.createOpaqueSessionFromLegacy.mockResolvedValue({
      context,
      sid: SID,
    })
    sessionMocks.publicSession.mockReturnValue(publicValue)

    const response = await migrateHandler(new Request(`${APP_ORIGIN}/api/auth/migrate`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        Origin: APP_ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF': 'migrate',
      },
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(publicValue)
    expect(sessionMocks.createOpaqueSessionFromLegacy).toHaveBeenCalledWith(
      expect.any(Request),
      'access-token',
      'refresh-token',
    )
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('__Host-cinnabar_sid=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
  })

  it.each([
    ['wrong origin', 'https://attacker.example', 'same-origin', 'migrate'],
    ['cross-site fetch', APP_ORIGIN, 'cross-site', 'migrate'],
    ['missing csrf', APP_ORIGIN, 'same-origin', 'wrong'],
  ])('rejects %s before touching Supabase', async (
    _case,
    origin,
    fetchSite,
    csrf,
  ) => {
    const response = await migrateHandler(new Request(`${APP_ORIGIN}/api/auth/migrate`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        Origin: origin,
        'Sec-Fetch-Site': fetchSite,
        'X-CSRF': csrf,
      },
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    }))

    expect(response.status).toBe(403)
    expect(sessionMocks.createOpaqueSessionFromLegacy).not.toHaveBeenCalled()
  })

  it('revokes logout only after the session-bound POST guard succeeds', async () => {
    const context = { sessionVersion: 'version' }
    sessionMocks.authenticateAppRequest.mockResolvedValue(context)

    const response = await logoutHandler(new Request(`${APP_ORIGIN}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `__Host-cinnabar_sid=${SID}`,
        Origin: APP_ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF': 'csrf-token',
      },
    }))

    expect(response.status).toBe(200)
    expect(sessionMocks.authenticateAppRequest).toHaveBeenCalledWith(
      expect.any(Request),
      { allowLegacy: false, requireCsrf: true },
    )
    expect(sessionMocks.revokeOpaqueSession).toHaveBeenCalledWith(
      expect.any(Request),
      context,
    )
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      authMode: 'dual',
    })
  })

  it('idempotently clears an invalid cookie after same-origin logout metadata', async () => {
    sessionMocks.authenticateAppRequest.mockRejectedValue(
      new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION'),
    )
    const response = await logoutHandler(new Request(`${APP_ORIGIN}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: '__Host-cinnabar_sid=invalid',
        Origin: APP_ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF': 'expired-session-token',
      },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      authMode: 'dual',
    })
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(sessionMocks.revokeOpaqueSession).not.toHaveBeenCalled()
  })

  it('does not clear an invalid cookie for a cross-site logout request', async () => {
    sessionMocks.authenticateAppRequest.mockRejectedValue(
      new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION'),
    )
    const response = await logoutHandler(new Request(`${APP_ORIGIN}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: '__Host-cinnabar_sid=invalid',
        Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site',
        'X-CSRF': 'anything',
      },
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('exposes a stable forced-reauth migration code', async () => {
    sessionMocks.createOpaqueSessionFromLegacy.mockRejectedValue(
      new AppAuthError(
        'Your migration outcome is uncertain. Please sign in again.',
        401,
        'MIGRATION_REAUTH_REQUIRED',
      ),
    )
    const response = await migrateHandler(new Request(`${APP_ORIGIN}/api/auth/migrate`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        Origin: APP_ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF': 'migrate',
      },
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Your migration outcome is uncertain. Please sign in again.',
      code: 'MIGRATION_REAUTH_REQUIRED',
    })
  })
})
