import type {
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  REFRESH_UPSTREAM_TIMEOUT_MS,
  PROVIDER_USER_TIMEOUT_MS,
  classifyRefreshCasState,
  createOpaqueSessionFromLegacy,
  fetchWithTimeout,
  refreshIfNeeded,
  validateProviderUser,
  type AppAuthSessionRow,
  type EncryptionConfiguration,
  type SessionDependencies,
} from '../api/_app-session'
import { AppAuthError } from '../api/_auth'
import {
  bytesToBase64Url,
  sha256Base64Url,
} from '../api/_csrf'

const NOW = Date.parse('2026-07-23T12:00:00.000Z')
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.test',
} as User

function sessionRow(
  overrides: Partial<AppAuthSessionRow> = {},
): AppAuthSessionRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    sid_hash: 's'.repeat(43),
    user_id: USER.id,
    migration_state: 'active',
    migration_token_hash: null,
    encryption_key_version: 'v1',
    access_token_ciphertext: 'ciphertext',
    access_token_iv: 'a'.repeat(16),
    refresh_token_ciphertext: 'ciphertext',
    refresh_token_iv: 'b'.repeat(16),
    token_expires_at: new Date(NOW + 60_000).toISOString(),
    csrf_hash: 'c'.repeat(43),
    csrf_secret_ciphertext: 'ciphertext',
    csrf_secret_iv: 'd'.repeat(16),
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
}

async function encryptedForWinner(
  configuration: EncryptionConfiguration,
  row: AppAuthSessionRow,
  purpose: 'access' | 'refresh' | 'csrf',
  value: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = new Uint8Array(12)
  const additionalData = new TextEncoder().encode(
    `cinnabar-session|${row.id}|${row.user_id}|${purpose}|${configuration.version}`,
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
    configuration.key,
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  }
}

beforeEach(() => {
  process.env.AUTH_MODE = 'dual'
  process.env.SESSION_ENCRYPTION_KEY = `v1:${'A'.repeat(43)}`
  process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key'
})

afterEach(() => {
  delete process.env.AUTH_MODE
  delete process.env.SESSION_ENCRYPTION_KEY
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  vi.useRealTimers()
})

describe('refresh rotation reliability', () => {
  it('actively aborts an upstream refresh before the database lease can expire', async () => {
    vi.useFakeTimers()
    let observedSignal: AbortSignal | null = null
    const neverCompletes = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? null
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(observedSignal?.reason)
        }, { once: true })
      })
    }) as unknown as typeof fetch

    const request = fetchWithTimeout(
      'https://identity.example/token',
      { method: 'POST' },
      neverCompletes,
    )
    const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(REFRESH_UPSTREAM_TIMEOUT_MS + 1)

    await rejection
    expect(observedSignal?.aborted).toBe(true)
  })

  it('bounds provider user validation even when fetch never settles', async () => {
    vi.useFakeTimers()
    let observedSignal: AbortSignal | null = null
    const neverSettles = vi.fn((
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      observedSignal = init?.signal ?? null
      return new Promise<Response>(() => undefined)
    }) as unknown as typeof fetch

    const validation = validateProviderUser(
      new Request('https://cinnabar.example/api/auth/session'),
      'access-token',
      USER.id,
      neverSettles,
    )
    const rejection = expect(validation).rejects.toMatchObject<AppAuthError>({
      status: 503,
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(PROVIDER_USER_TIMEOUT_MS + 1)

    await rejection
    expect(observedSignal?.aborted).toBe(true)
  })

  it('forwards request cancellation into provider user validation', async () => {
    const requestController = new AbortController()
    let observedSignal: AbortSignal | null = null
    const waitsForAbort = vi.fn((
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      observedSignal = init?.signal ?? null
      return new Promise<Response>(() => undefined)
    }) as unknown as typeof fetch
    const request = new Request(
      'https://cinnabar.example/api/auth/session',
      { signal: requestController.signal },
    )

    const validation = validateProviderUser(
      request,
      'access-token',
      USER.id,
      waitsForAbort,
    )
    const rejection = expect(validation).rejects.toMatchObject<AppAuthError>({
      status: 503,
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
    })
    requestController.abort(new DOMException('client left', 'AbortError'))

    await rejection
    expect(observedSignal?.aborted).toBe(true)
  })

  it.each([
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ])('permits a local Supabase loopback URL: %s', async (configured) => {
    process.env.VITE_SUPABASE_URL = configured
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input)).pathname).toBe('/auth/v1/user')
      return new Response(JSON.stringify(USER), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await expect(validateProviderUser(
      new Request('http://localhost/api/auth/session'),
      'access-token',
      USER.id,
      fetchImpl,
    )).resolves.toMatchObject(USER)
  })

  it.each([
    [
      'HTTP 401',
      new Response(null, { status: 401 }),
      USER.id,
    ],
    [
      'HTTP 403',
      new Response(null, { status: 403 }),
      USER.id,
    ],
    [
      'a null user document',
      new Response(JSON.stringify(null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      USER.id,
    ],
    [
      'a wrapped null user',
      new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      USER.id,
    ],
    [
      'an identity mismatch',
      new Response(JSON.stringify(USER), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      '99999999-9999-4999-8999-999999999999',
    ],
  ])('classifies only %s as a permanently invalid identity', async (
    _case,
    response,
    expectedUserId,
  ) => {
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch

    await expect(validateProviderUser(
      new Request('https://cinnabar.example/api/auth/session'),
      'access-token',
      expectedUserId,
      fetchImpl,
    )).rejects.toMatchObject<AppAuthError>({
      status: 401,
      code: 'INVALID_SESSION',
    })
  })

  it('adopts an advanced winner and never treats the old lease as owned', () => {
    const oldLease = '33333333-3333-4333-8333-333333333333'
    const winner = sessionRow({ version: 5 })
    expect(classifyRefreshCasState(winner, 4, oldLease, NOW)).toBe('winner')
    expect(classifyRefreshCasState(
      sessionRow({
        version: 4,
        refresh_lease_id: oldLease,
        refresh_lease_expires_at: new Date(NOW + 30_000).toISOString(),
      }),
      4,
      oldLease,
      NOW,
    )).toBe('owned')
    expect(classifyRefreshCasState(
      sessionRow({
        version: 4,
        refresh_lease_id: '44444444-4444-4444-8444-444444444444',
        refresh_lease_expires_at: new Date(NOW + 30_000).toISOString(),
      }),
      4,
      oldLease,
      NOW,
    )).toBe('contended')
  })

  it('marks an expired same-version lease stale instead of making it stealable', () => {
    expect(classifyRefreshCasState(
      sessionRow({
        refresh_lease_id: '55555555-5555-4555-8555-555555555555',
        refresh_lease_expires_at: new Date(NOW - 1).toISOString(),
      }),
      4,
      'another-lease',
      NOW,
    )).toBe('stale')
  })

  it('uses a winner after lost CAS response and never revokes its new version', async () => {
    const rawKey = new Uint8Array(32)
    const configuration: EncryptionConfiguration = {
      version: 'v1',
      key: await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ),
    }
    const initial = sessionRow({
      version: 4,
      token_expires_at: new Date(NOW - 1).toISOString(),
    })
    const csrfToken = 'csrf-winner'
    const winnerBase = sessionRow({
      version: 5,
      token_expires_at: new Date(NOW + 3_600_000).toISOString(),
    })
    const [access, refresh, csrf] = await Promise.all([
      encryptedForWinner(configuration, winnerBase, 'access', 'winner-access'),
      encryptedForWinner(configuration, winnerBase, 'refresh', 'winner-refresh'),
      encryptedForWinner(configuration, winnerBase, 'csrf', csrfToken),
    ])
    const winner = sessionRow({
      ...winnerBase,
      access_token_ciphertext: access.ciphertext,
      access_token_iv: access.iv,
      refresh_token_ciphertext: refresh.ciphertext,
      refresh_token_iv: refresh.iv,
      csrf_secret_ciphertext: csrf.ciphertext,
      csrf_secret_iv: csrf.iv,
      csrf_hash: await sha256Base64Url(csrfToken),
    })
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'loser-access',
          refresh_token: 'loser-refresh',
          expires_at: Math.floor((NOW + 3_600_000) / 1_000),
          user: USER,
        } as Session,
      },
      error: null,
    })
    const commitBuilder = {
      eq: vi.fn(),
      gt: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'NETWORK_RESPONSE_LOST' },
      }),
    }
    commitBuilder.eq.mockReturnValue(commitBuilder)
    commitBuilder.gt.mockReturnValue(commitBuilder)
    commitBuilder.is.mockReturnValue(commitBuilder)
    commitBuilder.select.mockReturnValue(commitBuilder)
    const winnerQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: winner, error: null }),
    }
    winnerQuery.eq.mockReturnValue(winnerQuery)
    const update = vi.fn(() => commitBuilder)
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'app_auth_sessions') {
          return {
            update,
            select: vi.fn(() => winnerQuery),
          }
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as unknown as SupabaseClient

    const result = await refreshIfNeeded(
      new Request('https://cinnabar.example/api/credits/account'),
      's'.repeat(43),
      initial,
      {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        csrfToken,
      },
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
      configuration,
    )

    expect(result.row.version).toBe(5)
    expect(result.secrets).toEqual({
      accessToken: 'winner-access',
      refreshToken: 'winner-refresh',
      csrfToken,
    })
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0]).not.toHaveProperty('revoked_at')
  })

  it('allows twenty simultaneous requests to perform at most one provider refresh', async () => {
    const rawKey = new Uint8Array(32)
    const configuration: EncryptionConfiguration = {
      version: 'v1',
      key: await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ),
    }
    const sid = 'x'.repeat(43)
    const initialBase = sessionRow({
      sid_hash: await sha256Base64Url(sid),
      token_expires_at: new Date(NOW - 1).toISOString(),
    })
    const [initialAccess, initialRefresh, initialCsrf] = await Promise.all([
      encryptedForWinner(configuration, initialBase, 'access', 'old-access'),
      encryptedForWinner(configuration, initialBase, 'refresh', 'old-refresh'),
      encryptedForWinner(configuration, initialBase, 'csrf', 'csrf-winner'),
    ])
    let liveRow = sessionRow({
      ...initialBase,
      access_token_ciphertext: initialAccess.ciphertext,
      access_token_iv: initialAccess.iv,
      refresh_token_ciphertext: initialRefresh.ciphertext,
      refresh_token_iv: initialRefresh.iv,
      csrf_secret_ciphertext: initialCsrf.ciphertext,
      csrf_secret_iv: initialCsrf.iv,
      csrf_hash: await sha256Base64Url('csrf-winner'),
    })
    let commitCount = 0
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'winner-access',
          refresh_token: 'winner-refresh',
          expires_at: Math.floor((NOW + 3_600_000) / 1_000),
          user: USER,
        } as Session,
      },
      error: null,
    })
    const admin = {
      rpc: vi.fn(async (
        name: string,
        input: {
          p_expected_version: number
          p_lease_id: string
        },
      ) => {
        expect(name).toBe('claim_app_auth_session_refresh')
        if (
          liveRow.version === input.p_expected_version
          && liveRow.refresh_lease_id === null
        ) {
          liveRow = {
            ...liveRow,
            refresh_lease_id: input.p_lease_id,
            refresh_lease_expires_at: new Date(NOW + 30_000).toISOString(),
          }
          return { data: true, error: null }
        }
        return { data: false, error: null }
      }),
      from: vi.fn((table: string) => {
        if (table === 'app_auth_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {
          select: vi.fn(() => {
            const query = {
              eq: vi.fn(),
              maybeSingle: vi.fn(async () => ({ data: liveRow, error: null })),
            }
            query.eq.mockReturnValue(query)
            return query
          }),
          update: vi.fn((value: Partial<AppAuthSessionRow>) => {
            const query = {
              eq: vi.fn(),
              gt: vi.fn(),
              is: vi.fn(),
              select: vi.fn(),
              maybeSingle: vi.fn(async () => {
                if (
                  value.version === liveRow.version + 1
                  && value.refresh_lease_id === null
                ) {
                  liveRow = { ...liveRow, ...value }
                  commitCount += 1
                  return { data: liveRow, error: null }
                }
                return { data: null, error: null }
              }),
            }
            query.eq.mockReturnValue(query)
            query.gt.mockReturnValue(query)
            query.is.mockReturnValue(query)
            query.select.mockReturnValue(query)
            return query
          }),
        }
      }),
    } as unknown as SupabaseClient
    const dependencies: SessionDependencies = {
      admin,
      createRefreshClient: () => ({
        auth: { refreshSession },
      }) as unknown as SupabaseClient,
      providerFetch: vi.fn(),
      now: () => NOW,
      random: () => 0,
      sleep: async () => {
        await Promise.resolve()
      },
    }
    const initialSecrets = {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      csrfToken: 'csrf-winner',
    }

    const results = await Promise.all(Array.from(
      { length: 20 },
      () => refreshIfNeeded(
        new Request('https://cinnabar.example/api/credits/account'),
        sid,
        sessionRow({
          ...liveRow,
          refresh_lease_id: null,
          refresh_lease_expires_at: null,
        }),
        initialSecrets,
        dependencies,
        configuration,
      ),
    ))

    expect(refreshSession).toHaveBeenCalledOnce()
    expect(commitCount).toBe(1)
    expect(results).toHaveLength(20)
    expect(results.every(({ row }) => row.version === 5)).toBe(true)
    expect(results.every(({ secrets }) => (
      secrets.accessToken === 'winner-access'
      && secrets.refreshToken === 'winner-refresh'
      && secrets.csrfToken === 'csrf-winner'
    ))).toBe(true)
  })

  it('turns a provider refresh timeout into exact-lease revocation and reauthentication', async () => {
    const rawKey = new Uint8Array(32)
    const configuration: EncryptionConfiguration = {
      version: 'v1',
      key: await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ),
    }
    const revokedValues: Array<Partial<AppAuthSessionRow>> = []
    const revokeQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '22222222-2222-4222-8222-222222222222' },
        error: null,
      }),
    }
    revokeQuery.eq.mockReturnValue(revokeQuery)
    revokeQuery.is.mockReturnValue(revokeQuery)
    revokeQuery.select.mockReturnValue(revokeQuery)
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'app_auth_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {
          update: vi.fn((value: Partial<AppAuthSessionRow>) => {
            revokedValues.push(value)
            return revokeQuery
          }),
        }
      }),
    } as unknown as SupabaseClient
    const refreshSession = vi.fn().mockRejectedValue(
      new DOMException('Upstream authentication timed out.', 'TimeoutError'),
    )

    await expect(refreshIfNeeded(
      new Request('https://cinnabar.example/api/credits/account'),
      's'.repeat(43),
      sessionRow({ token_expires_at: new Date(NOW - 1).toISOString() }),
      {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        csrfToken: 'csrf',
      },
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
      configuration,
    )).rejects.toMatchObject<AppAuthError>({
      code: 'REFRESH_REAUTH_REQUIRED',
      status: 401,
    })
    expect(refreshSession).toHaveBeenCalledOnce()
    expect(revokedValues).toContainEqual(expect.objectContaining({
      revoke_reason: 'refresh_outcome_unknown',
    }))
  })

  it.each([
    ['missing', undefined],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['fractional', 1.5],
    ['outside the Date range', Number.MAX_SAFE_INTEGER],
  ])('rejects a %s provider expiry before persistence', async (
    _case,
    expiresAt,
  ) => {
    const rawKey = new Uint8Array(32)
    const configuration: EncryptionConfiguration = {
      version: 'v1',
      key: await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ),
    }
    const revokedValues: Array<Partial<AppAuthSessionRow>> = []
    const revokeQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '22222222-2222-4222-8222-222222222222' },
        error: null,
      }),
    }
    revokeQuery.eq.mockReturnValue(revokeQuery)
    revokeQuery.is.mockReturnValue(revokeQuery)
    revokeQuery.select.mockReturnValue(revokeQuery)
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'app_auth_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {
          update: vi.fn((value: Partial<AppAuthSessionRow>) => {
            revokedValues.push(value)
            return revokeQuery
          }),
        }
      }),
    } as unknown as SupabaseClient
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_at: expiresAt,
          user: USER,
        },
      },
      error: null,
    })

    await expect(refreshIfNeeded(
      new Request('https://cinnabar.example/api/credits/account'),
      's'.repeat(43),
      sessionRow({ token_expires_at: new Date(NOW - 1).toISOString() }),
      {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        csrfToken: 'csrf',
      },
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
      configuration,
    )).rejects.toMatchObject<AppAuthError>({
      code: 'REFRESH_REAUTH_REQUIRED',
      status: 401,
    })
    expect(revokedValues).toContainEqual(expect.objectContaining({
      revoke_reason: 'refresh_response_invalid',
    }))
    expect(revokedValues).not.toContainEqual(expect.objectContaining({
      token_expires_at: expect.anything(),
    }))
  })

  it('revokes an abandoned stale lease without replaying its provider token', async () => {
    const rawKey = new Uint8Array(32)
    const configuration: EncryptionConfiguration = {
      version: 'v1',
      key: await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ),
    }
    const stale = sessionRow({
      token_expires_at: new Date(NOW - 1).toISOString(),
      refresh_lease_id: '55555555-5555-4555-8555-555555555555',
      refresh_lease_expires_at: new Date(NOW - 1).toISOString(),
    })
    const selectQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: stale, error: null }),
    }
    selectQuery.eq.mockReturnValue(selectQuery)
    const revokeQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: stale.id },
        error: null,
      }),
    }
    revokeQuery.eq.mockReturnValue(revokeQuery)
    revokeQuery.is.mockReturnValue(revokeQuery)
    revokeQuery.select.mockReturnValue(revokeQuery)
    const update = vi.fn(() => revokeQuery)
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'app_auth_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {
          select: vi.fn(() => selectQuery),
          update,
        }
      }),
    } as unknown as SupabaseClient
    const refreshSession = vi.fn()

    await expect(refreshIfNeeded(
      new Request('https://cinnabar.example/api/credits/account'),
      's'.repeat(43),
      stale,
      {
        accessToken: 'old-access',
        refreshToken: 'must-not-replay',
        csrfToken: 'csrf',
      },
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
      configuration,
    )).rejects.toMatchObject<AppAuthError>({
      code: 'REFRESH_REAUTH_REQUIRED',
      status: 401,
    })
    expect(refreshSession).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      revoke_reason: 'refresh_lease_abandoned',
    }))
  })
})

describe('pending legacy migration reliability', () => {
  it('does not rotate the provider token when the pending insert fails', async () => {
    const refreshSession = vi.fn()
    const pendingQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    pendingQuery.eq.mockReturnValue(pendingQuery)
    pendingQuery.is.mockReturnValue(pendingQuery)
    const sessionTable = {
      select: vi.fn(() => pendingQuery),
      insert: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '08006' },
      }),
    }
    const admin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: USER },
          error: null,
        }),
      },
      from: vi.fn(() => sessionTable),
    } as unknown as SupabaseClient
    const dependencies: Partial<SessionDependencies> = {
      admin,
      createRefreshClient: () => ({
        auth: { refreshSession },
      }) as unknown as SupabaseClient,
      now: () => NOW,
      random: () => 0,
      sleep: async () => undefined,
    }

    const migration = createOpaqueSessionFromLegacy(
      new Request('https://cinnabar.example/api/auth/migrate'),
      'verified-access',
      'legacy-refresh',
      dependencies,
    )

    await expect(migration).rejects.toMatchObject<AppAuthError>({
      code: 'MIGRATION_RETRYABLE',
      status: 503,
    })
    expect(sessionTable.insert).toHaveBeenCalledOnce()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('classifies an invalid migrated expiry as reauthentication-required', async () => {
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_at: Number.POSITIVE_INFINITY,
          user: USER,
        },
        user: USER,
      },
      error: null,
    })
    const pendingLookup = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    pendingLookup.eq.mockReturnValue(pendingLookup)
    pendingLookup.is.mockReturnValue(pendingLookup)
    const cleanupQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'pending-session' },
        error: null,
      }),
    }
    cleanupQuery.eq.mockReturnValue(cleanupQuery)
    cleanupQuery.is.mockReturnValue(cleanupQuery)
    cleanupQuery.select.mockReturnValue(cleanupQuery)
    const updates: Array<Partial<AppAuthSessionRow>> = []
    const sessionTable = {
      select: vi.fn(() => pendingLookup),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn((value: Partial<AppAuthSessionRow>) => {
        updates.push(value)
        return cleanupQuery
      }),
    }
    const admin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: USER },
          error: null,
        }),
      },
      from: vi.fn((table: string) => (
        table === 'app_auth_sessions'
          ? sessionTable
          : { insert: vi.fn().mockResolvedValue({ error: null }) }
      )),
    } as unknown as SupabaseClient

    await expect(createOpaqueSessionFromLegacy(
      new Request('https://cinnabar.example/api/auth/migrate'),
      'verified-access',
      'legacy-refresh',
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
    )).rejects.toMatchObject<AppAuthError>({
      code: 'MIGRATION_REAUTH_REQUIRED',
      status: 401,
    })
    expect(updates).toContainEqual(expect.objectContaining({
      revoke_reason: 'migration_response_invalid',
    }))
    expect(updates).not.toContainEqual(expect.objectContaining({
      migration_state: 'active',
    }))
  })

  it('adopts the committed winner when a migration CAS response is lost', async () => {
    let pendingRow: AppAuthSessionRow | null = null
    let activeUpdate: Partial<AppAuthSessionRow> | null = null
    const orderedEvents: string[] = []
    const refreshSession = vi.fn(async () => {
      orderedEvents.push('provider-refresh')
      const session = {
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        expires_at: Math.floor((NOW + 3_600_000) / 1_000),
        user: USER,
      } as Session
      return { data: { session, user: USER }, error: null }
    })

    const pendingLookup = {
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    pendingLookup.eq.mockReturnValue(pendingLookup)
    pendingLookup.is.mockReturnValue(pendingLookup)

    const loadWinner = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: pendingRow && activeUpdate
          ? { ...pendingRow, ...activeUpdate }
          : null,
        error: null,
      })),
    }
    loadWinner.eq.mockReturnValue(loadWinner)

    const commitBuilder = {
      eq: vi.fn(),
      gt: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        // Simulates a committed transaction whose HTTP response was lost.
        data: null,
        error: { code: 'NETWORK_RESPONSE_LOST' },
      }),
    }
    commitBuilder.eq.mockReturnValue(commitBuilder)
    commitBuilder.gt.mockReturnValue(commitBuilder)
    commitBuilder.is.mockReturnValue(commitBuilder)
    commitBuilder.select.mockReturnValue(commitBuilder)

    const sessionTable = {
      select: vi.fn((columns: string) => (
        columns === 'id' ? pendingLookup : loadWinner
      )),
      insert: vi.fn(async (value: AppAuthSessionRow) => {
        pendingRow = value
        orderedEvents.push('pending-insert')
        return { data: null, error: null }
      }),
      update: vi.fn((value: Partial<AppAuthSessionRow>) => {
        activeUpdate = value
        orderedEvents.push('active-commit')
        return commitBuilder
      }),
    }
    const auditTable = {
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const admin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: USER },
          error: null,
        }),
      },
      from: vi.fn((table: string) => (
        table === 'app_auth_sessions' ? sessionTable : auditTable
      )),
    } as unknown as SupabaseClient

    const result = await createOpaqueSessionFromLegacy(
      new Request('https://cinnabar.example/api/auth/migrate'),
      'verified-access',
      'legacy-refresh',
      {
        admin,
        createRefreshClient: () => ({
          auth: { refreshSession },
        }) as unknown as SupabaseClient,
        now: () => NOW,
        random: () => 0,
        sleep: async () => undefined,
      },
    )

    expect(orderedEvents.slice(0, 3)).toEqual([
      'pending-insert',
      'provider-refresh',
      'active-commit',
    ])
    expect(result.context.accessToken).toBe('rotated-access')
    expect(result.context.csrfToken).toBeTruthy()
    expect(activeUpdate).toMatchObject({
      migration_state: 'active',
      migration_token_hash: null,
      version: 2,
      refresh_lease_id: null,
    })
    const updateCallsAtCompletion = sessionTable.update.mock.calls.length
    expect(updateCallsAtCompletion).toBe(1)
  })

  it.each([
    [true, 'MIGRATION_RETRYABLE', 503],
    [false, 'MIGRATION_REAUTH_REQUIRED', 401],
  ] as const)(
    'classifies a retryable provider error by whether pending cleanup succeeds: %s',
    async (cleanupSucceeds, expectedCode, expectedStatus) => {
      const refreshSession = vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: { status: 503, message: 'provider unavailable' },
      })
      const pendingLookup = {
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      pendingLookup.eq.mockReturnValue(pendingLookup)
      pendingLookup.is.mockReturnValue(pendingLookup)
      const cleanupQuery = {
        eq: vi.fn(),
        is: vi.fn(),
        select: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: cleanupSucceeds ? { id: 'pending-session' } : null,
          error: null,
        }),
      }
      cleanupQuery.eq.mockReturnValue(cleanupQuery)
      cleanupQuery.is.mockReturnValue(cleanupQuery)
      cleanupQuery.select.mockReturnValue(cleanupQuery)
      const sessionTable = {
        select: vi.fn(() => pendingLookup),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn(() => cleanupQuery),
      }
      const admin = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: USER },
            error: null,
          }),
        },
        from: vi.fn((table: string) => (
          table === 'app_auth_sessions'
            ? sessionTable
            : { insert: vi.fn().mockResolvedValue({ error: null }) }
        )),
      } as unknown as SupabaseClient

      await expect(createOpaqueSessionFromLegacy(
        new Request('https://cinnabar.example/api/auth/migrate'),
        'verified-access',
        'legacy-refresh',
        {
          admin,
          createRefreshClient: () => ({
            auth: { refreshSession },
          }) as unknown as SupabaseClient,
          now: () => NOW,
          random: () => 0,
          sleep: async () => undefined,
        },
      )).rejects.toMatchObject<AppAuthError>({
        code: expectedCode,
        status: expectedStatus,
      })
      expect(refreshSession).toHaveBeenCalledOnce()
      expect(sessionTable.update).toHaveBeenCalledWith(expect.objectContaining({
        revoke_reason: 'migration_provider_retryable',
      }))
    },
  )
})
