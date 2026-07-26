import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const adminMocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('../api/_supabase-admin', () => ({
  getSupabaseAdmin: adminMocks.getSupabaseAdmin,
}))

import {
  authenticateAppRequest,
  type AppAuthSessionRow,
} from '../api/_app-session'
import { type AppAuthError } from '../api/_auth'
import {
  bytesToBase64Url,
  sha256Base64Url,
} from '../api/_csrf'

const NOW = Date.parse('2026-07-23T12:00:00.000Z')
const SID = 's'.repeat(43)
const COOKIE_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'cookie@example.test',
} as User
const BEARER_USER = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'bearer@example.test',
} as User

async function encryptForRow(
  row: AppAuthSessionRow,
  purpose: 'access' | 'refresh' | 'csrf',
  value: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(32),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const iv = new Uint8Array(12)
  const additionalData = new TextEncoder().encode(
    `cinnabar-session|${row.id}|${row.user_id}|${purpose}|v1`,
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
    key,
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  }
}

async function validRow(
  overrides: Partial<AppAuthSessionRow> = {},
): Promise<AppAuthSessionRow> {
  const csrfToken = 'csrf-token'
  const base: AppAuthSessionRow = {
    id: '22222222-2222-4222-8222-222222222222',
    sid_hash: await sha256Base64Url(SID),
    user_id: COOKIE_USER.id,
    migration_state: 'active',
    migration_token_hash: null,
    encryption_key_version: 'v1',
    access_token_ciphertext: '',
    access_token_iv: '',
    refresh_token_ciphertext: '',
    refresh_token_iv: '',
    token_expires_at: new Date(NOW + 3_600_000).toISOString(),
    csrf_hash: await sha256Base64Url(csrfToken),
    csrf_secret_ciphertext: '',
    csrf_secret_iv: '',
    last_seen_at: new Date(NOW).toISOString(),
    absolute_expires_at: new Date(NOW + 86_400_000).toISOString(),
    revoked_at: null,
    revoke_reason: null,
    refresh_lease_id: null,
    refresh_lease_expires_at: null,
    version: 4,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  }
  const [access, refresh, csrf] = await Promise.all([
    encryptForRow(base, 'access', 'cookie-access'),
    encryptForRow(base, 'refresh', 'cookie-refresh'),
    encryptForRow(base, 'csrf', csrfToken),
  ])
  return {
    ...base,
    access_token_ciphertext: access.ciphertext,
    access_token_iv: access.iv,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    csrf_secret_ciphertext: csrf.ciphertext,
    csrf_secret_iv: csrf.iv,
  }
}

function adminForRow(
  row: AppAuthSessionRow,
): {
  admin: SupabaseClient
  events: Array<Record<string, unknown>>
  updates: Array<Partial<AppAuthSessionRow>>
} {
  const events: Array<Record<string, unknown>> = []
  const updates: Array<Partial<AppAuthSessionRow>> = []
  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'app_auth_events') {
        return {
          insert: vi.fn(async (value: Record<string, unknown>) => {
            events.push(value)
            return { error: null }
          }),
        }
      }
      return {
        select: vi.fn(() => {
          const query = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }
          query.eq.mockReturnValue(query)
          return query
        }),
        update: vi.fn((value: Partial<AppAuthSessionRow>) => {
          updates.push(value)
          const query = {
            eq: vi.fn(),
            is: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
          query.eq.mockReturnValue(query)
          return query
        }),
      }
    }),
  } as unknown as SupabaseClient
  return { admin, events, updates }
}

function providerUserResponse(user: User): Response {
  return new Response(JSON.stringify(user), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function providerFetch(
  resolve: (token: string) => Response | Promise<Response>,
): typeof fetch {
  return vi.fn(async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? ''
    return resolve(authorization.replace(/^Bearer /u, ''))
  }) as unknown as typeof fetch
}

beforeEach(() => {
  adminMocks.getSupabaseAdmin.mockReset()
  process.env.AUTH_MODE = 'dual'
  process.env.SESSION_ENCRYPTION_KEY = `v1:${'A'.repeat(43)}`
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key'
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  delete process.env.AUTH_MODE
  delete process.env.SESSION_ENCRYPTION_KEY
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('opaque session identity and expiry failures', () => {
  it.each([
    [
      'absolute',
      { absolute_expires_at: new Date(NOW).toISOString() },
    ],
    [
      'idle',
      { last_seen_at: new Date(NOW - (7 * 24 * 60 * 60 * 1_000)).toISOString() },
    ],
  ])('revokes a session at its %s expiry boundary', async (_kind, overrides) => {
    const row = await validRow(overrides)
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/credits/account',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ), {}, {
      providerFetch: providerFetch(() => providerUserResponse(COOKIE_USER)),
    })).rejects.toMatchObject<AppAuthError>({
      code: 'SESSION_EXPIRED',
      status: 401,
    })
    expect(fixture.updates).toContainEqual(expect.objectContaining({
      revoke_reason: 'expired',
    }))
    expect(fixture.events).toContainEqual(expect.objectContaining({
      event_type: 'session_rejected',
      reason: 'expired',
    }))
  })

  it('rejects conflicting cookie and Bearer identities and audits the conflict', async () => {
    const row = await validRow()
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/credits/account',
      {
        headers: {
          Authorization: 'Bearer conflicting-access',
          Cookie: `__Host-cinnabar_sid=${SID}`,
        },
      },
    ), {}, {
      providerFetch: providerFetch((token) => providerUserResponse(
        token === 'cookie-access' ? COOKIE_USER : BEARER_USER,
      )),
    })).rejects.toMatchObject<AppAuthError>({
      code: 'IDENTITY_CONFLICT',
      status: 409,
    })
    expect(fixture.events).toContainEqual(expect.objectContaining({
      event_type: 'identity_conflict',
      reason: 'bearer_cookie_mismatch',
      user_id: COOKIE_USER.id,
    }))
  })

  it('revokes only an explicitly rejected provider credential', async () => {
    const row = await validRow()
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/auth/session',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ), {}, {
      providerFetch: providerFetch(() => new Response(null, { status: 401 })),
    })).rejects.toMatchObject<AppAuthError>({
      code: 'INVALID_SESSION',
      status: 401,
    })
    expect(fixture.updates).toContainEqual(expect.objectContaining({
      revoke_reason: 'token_invalid',
    }))
    expect(fixture.events).toContainEqual(expect.objectContaining({
      event_type: 'session_rejected',
      reason: 'token_invalid',
    }))
  })

  it.each([429, 503])(
    'preserves the opaque session for provider HTTP %i',
    async (status) => {
      const row = await validRow({
        last_seen_at: new Date(NOW - 10 * 60 * 1_000).toISOString(),
      })
      const fixture = adminForRow(row)
      adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)

      await expect(authenticateAppRequest(new Request(
        'https://cinnabar.example/api/auth/session',
        { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
      ), {}, {
        providerFetch: providerFetch(() => new Response(null, { status })),
      })).rejects.toMatchObject<AppAuthError>({
        code: 'AUTH_UPSTREAM_UNAVAILABLE',
        status: 503,
      })
      expect(fixture.updates).toHaveLength(0)
      expect(fixture.events).toHaveLength(0)
    },
  )

  it('preserves the opaque session when provider fetch throws', async () => {
    const row = await validRow({
      last_seen_at: new Date(NOW - 10 * 60 * 1_000).toISOString(),
    })
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)
    const unavailable = vi.fn(async () => {
      throw new TypeError('network unavailable')
    }) as unknown as typeof fetch

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/auth/session',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ), {}, {
      providerFetch: unavailable,
    })).rejects.toMatchObject<AppAuthError>({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(fixture.updates).toHaveLength(0)
    expect(fixture.events).toHaveLength(0)
  })

  it('treats an injected provider error without status as unavailable', async () => {
    const row = await validRow({
      last_seen_at: new Date(NOW - 10 * 60 * 1_000).toISOString(),
    })
    const fixture = adminForRow(row)
    Object.assign(fixture.admin, {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'network error without status' },
        }),
      },
    })

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/auth/session',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ), {}, {
      admin: fixture.admin,
    })).rejects.toMatchObject<AppAuthError>({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(fixture.updates).toHaveLength(0)
    expect(fixture.events).toHaveLength(0)
  })

  it('times out provider validation without revocation or last-seen writes', async () => {
    const row = await validRow({
      last_seen_at: new Date(NOW - 10 * 60 * 1_000).toISOString(),
    })
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)
    const neverSettles = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch

    const authentication = authenticateAppRequest(new Request(
      'https://cinnabar.example/api/auth/session',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    ), {}, {
      providerFetch: neverSettles,
      providerUserTimeoutMs: 1,
    })
    await expect(authentication).rejects.toMatchObject<AppAuthError>({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(fixture.updates).toHaveLength(0)
    expect(fixture.events).toHaveLength(0)
  })

  it('recovers the same SID after transient provider failure', async () => {
    const row = await validRow()
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)
    const fetchImpl = providerFetch(vi.fn()
      .mockReturnValueOnce(new Response(null, { status: 503 }))
      .mockReturnValueOnce(providerUserResponse(COOKIE_USER)))
    const request = () => new Request(
      'https://cinnabar.example/api/auth/session',
      { headers: { Cookie: `__Host-cinnabar_sid=${SID}` } },
    )

    await expect(authenticateAppRequest(request(), {}, {
      providerFetch: fetchImpl,
    })).rejects.toMatchObject<AppAuthError>({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    await expect(authenticateAppRequest(request(), {}, {
      providerFetch: fetchImpl,
    })).resolves.toMatchObject({
      method: 'opaque',
      user: COOKIE_USER,
    })
    expect(fixture.updates).toHaveLength(0)
    expect(fixture.events).toHaveLength(0)
  })

  it('does not report a dual identity conflict when Bearer validation is unavailable', async () => {
    const row = await validRow()
    const fixture = adminForRow(row)
    adminMocks.getSupabaseAdmin.mockReturnValue(fixture.admin)
    const fetchImpl = providerFetch((token) => (
      token === 'cookie-access'
        ? providerUserResponse(COOKIE_USER)
        : new Response(null, { status: 503 })
    ))

    await expect(authenticateAppRequest(new Request(
      'https://cinnabar.example/api/credits/account',
      {
        headers: {
          Authorization: 'Bearer bearer-access',
          Cookie: `__Host-cinnabar_sid=${SID}`,
        },
      },
    ), {}, {
      providerFetch: fetchImpl,
    })).rejects.toMatchObject<AppAuthError>({
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(fixture.updates).toHaveLength(0)
    expect(fixture.events).toHaveLength(0)
  })

  it('rejects malformed and duplicate session cookies before database access', async () => {
    const from = vi.fn()
    adminMocks.getSupabaseAdmin.mockReturnValue({
      from,
    } as unknown as SupabaseClient)
    for (const cookie of [
      '__Host-cinnabar_sid=short',
      `__Host-cinnabar_sid=${SID}; __Host-cinnabar_sid=${'x'.repeat(43)}`,
    ]) {
      await expect(authenticateAppRequest(new Request(
        'https://cinnabar.example/api/credits/account',
        { headers: { Cookie: cookie } },
      ))).rejects.toMatchObject<AppAuthError>({
        code: 'INVALID_SESSION',
        status: 401,
      })
    }
    expect(adminMocks.getSupabaseAdmin).toHaveBeenCalledTimes(2)
    expect(from).not.toHaveBeenCalled()
  })
})
