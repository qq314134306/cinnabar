import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readAuthMode } from '../api/_auth'
import {
  clearSessionCookie,
  sessionCookie,
} from '../api/_app-session'
import {
  readAppOrigin,
  requirePostRequestGuards,
} from '../api/_csrf'
import { requireFutureReportPaymentsEnabled } from '../api/_future-report'

const appSessionSource = readFileSync(
  fileURLToPath(new URL('../api/_app-session.ts', import.meta.url)),
  'utf8',
)

afterEach(() => {
  delete process.env.APP_ORIGIN
  delete process.env.AUTH_MODE
  delete process.env.ENABLE_FUTURE_REPORT_PAYMENTS
})

describe('opaque session security contract', () => {
  it('accepts only explicit auth modes and defaults safely to legacy', () => {
    expect(readAuthMode({} as NodeJS.ProcessEnv)).toBe('legacy')
    expect(readAuthMode({ AUTH_MODE: 'dual' } as NodeJS.ProcessEnv)).toBe('dual')
    expect(readAuthMode({ AUTH_MODE: 'opaque' } as NodeJS.ProcessEnv)).toBe('opaque')
    expect(() => readAuthMode({ AUTH_MODE: 'TRUE' } as NodeJS.ProcessEnv))
      .toThrowError(/temporarily unavailable/i)
  })

  it('emits only the hardened __Host cookie shape', () => {
    const cookie = sessionCookie('a'.repeat(43))
    expect(cookie).toBe(
      `__Host-cinnabar_sid=${'a'.repeat(43)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
    )
    expect(cookie).not.toContain('Domain=')
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })

  it('requires exact Origin, same-origin fetch metadata, and X-CSRF on POST', () => {
    process.env.APP_ORIGIN = 'https://cinnabar.example'
    const guarded = (headers: HeadersInit) => requirePostRequestGuards(
      new Request('https://cinnabar.example/api/example', {
        method: 'POST',
        headers,
      }),
      'csrf-secret',
    )
    expect(() => guarded({
      Origin: 'https://cinnabar.example',
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF': 'csrf-secret',
    })).not.toThrow()
    expect(() => guarded({
      Origin: 'https://attacker.example',
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF': 'csrf-secret',
    })).toThrowError(/origin/i)
    expect(() => guarded({
      Origin: 'https://cinnabar.example',
      'Sec-Fetch-Site': 'cross-site',
      'X-CSRF': 'csrf-secret',
    })).toThrowError(/cross-site/i)
  })

  it('allows only HTTPS origins with an explicit localhost HTTP exception', () => {
    expect(readAppOrigin({
      APP_ORIGIN: 'https://cinnabar.example',
    } as NodeJS.ProcessEnv)).toBe('https://cinnabar.example')
    expect(readAppOrigin({
      APP_ORIGIN: 'http://localhost:5173',
    } as NodeJS.ProcessEnv)).toBe('http://localhost:5173')
    expect(() => readAppOrigin({
      APP_ORIGIN: 'http://cinnabar.example',
    } as NodeJS.ProcessEnv)).toThrowError(/temporarily unavailable/i)
    expect(() => readAppOrigin({
      APP_ORIGIN: 'ftp://localhost',
    } as NodeJS.ProcessEnv)).toThrowError(/temporarily unavailable/i)
    expect(() => readAppOrigin({
      APP_ORIGIN: 'http://127.0.0.1:5173',
    } as NodeJS.ProcessEnv)).toThrowError(/temporarily unavailable/i)
  })

  it('keeps payment closed until both its flag and opaque-only auth are active', () => {
    process.env.ENABLE_FUTURE_REPORT_PAYMENTS = 'true'
    process.env.AUTH_MODE = 'dual'
    expect(() => requireFutureReportPaymentsEnabled())
      .toThrowError(/secure server sessions/i)
    process.env.AUTH_MODE = 'opaque'
    expect(() => requireFutureReportPaymentsEnabled()).not.toThrow()
  })

  it('uses AES-GCM, purpose-bound AAD, provider rotation, and a durable lease', () => {
    expect(appSessionSource).toContain("name: 'AES-GCM'")
    expect(appSessionSource).toContain('additionalData:')
    expect(appSessionSource).toContain("'access' | 'refresh' | 'csrf'")
    expect(appSessionSource).toContain('auth.refreshSession({')
    expect(appSessionSource).toContain("auth.admin.signOut(context.accessToken, 'local')")
    expect(appSessionSource).toContain("rpc('claim_app_auth_session_refresh'")
    expect(appSessionSource).toContain("eq('refresh_lease_id', leaseId)")
    expect(appSessionSource).toContain("gt('refresh_lease_expires_at', completedAt)")
    expect(appSessionSource).toContain("'REFRESH_REAUTH_REQUIRED'")
    expect(appSessionSource).not.toMatch(/console\.(?:log|error)\([^)]*(?:accessToken|refreshToken|csrfToken|sid)/)
  })
})
