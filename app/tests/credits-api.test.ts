import type { SupabaseClient, User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  authenticateCreditsRequest,
  readBearerToken,
  type AuthenticatedCreditsContext,
} from '../api/_credits-auth'
import {
  CreditsApiError,
  creditsErrorResponse,
  requestIdFor,
} from '../api/_credits-http'
import { createInMemoryCreditsRateLimiter } from '../api/_credits-rate-limit'
import {
  loadCreditAccountPage,
  parseCreditAccountPage,
} from '../api/_credits-service'
import { handleCreditsAccount } from '../api/credits/account'

const REQUEST_ID = '123e4567-e89b-12d3-a456-426614174000'

describe('credit API authentication', () => {
  it('accepts only a bounded Bearer token', () => {
    expect(readBearerToken(new Request('https://example.test', {
      headers: { Authorization: 'Bearer session-token' },
    }))).toBe('session-token')
    expect(() => readBearerToken(new Request('https://example.test'))).toThrow(CreditsApiError)
    expect(() => readBearerToken(new Request('https://example.test', {
      headers: { Authorization: 'Basic no' },
    }))).toThrow(CreditsApiError)
  })

  it('validates the token with Supabase before returning a scoped client', async () => {
    const user = { id: 'session-user' } as User
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
    const client = { auth: { getUser } } as unknown as SupabaseClient
    const factory = vi.fn(() => client)
    const req = new Request('https://example.test/api/credits/account', {
      headers: { Authorization: 'Bearer validated-token' },
    })

    const context = await authenticateCreditsRequest(req, factory)

    expect(factory).toHaveBeenCalledWith('validated-token')
    expect(getUser).toHaveBeenCalledWith('validated-token')
    expect(context).toEqual({ user, client })
  })
})

describe('credit API HTTP boundary', () => {
  it('accepts only UUID or ULID request IDs', () => {
    const uuidRequest = new Request('https://example.test', {
      headers: { 'X-Request-ID': REQUEST_ID },
    })
    const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    const ulidRequest = new Request('https://example.test', {
      headers: { 'X-Request-ID': ulid },
    })
    const invalidRequest = new Request('https://example.test', {
      headers: { 'X-Request-ID': 'attacker-controlled log text' },
    })

    expect(requestIdFor(uuidRequest, () => 'generated')).toBe(REQUEST_ID)
    expect(requestIdFor(ulidRequest, () => 'generated')).toBe(ulid)
    expect(requestIdFor(invalidRequest, () => 'generated')).toBe('generated')
  })

  it('returns and logs only stable diagnostics for unexpected errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = creditsErrorResponse(
      new Error('PostgREST vendor detail: secret_table'),
      REQUEST_ID,
    )
    const responseText = await response.text()
    const logText = consoleError.mock.calls.flat().join(' ')

    expect(response.status).toBe(503)
    expect(responseText).toContain('"code":"internal_error"')
    expect(responseText).not.toContain('PostgREST')
    expect(logText).toContain('"error_category":"unclassified_internal_error"')
    expect(logText).not.toContain('PostgREST')
    expect(logText).not.toContain('secret_table')
    consoleError.mockRestore()
  })
})

describe('credit account pagination', () => {
  it('accepts canonical decimal bounds', () => {
    expect(parseCreditAccountPage(
      'https://example.test/api/credits/account?limit=50&cursor=9223372036854775807',
    )).toEqual({ limit: 50, cursor: '9223372036854775807' })
  })

  it.each(['0', '01', '+1', '1.0', '1e1', ' 1', '51', ''])(
    'rejects a non-canonical or out-of-range limit: %s',
    (limit) => {
      expect(() => parseCreditAccountPage(
        `https://example.test/api/credits/account?limit=${encodeURIComponent(limit)}`,
      )).toThrow(CreditsApiError)
    },
  )

  it.each([
    '0',
    '01',
    '-1',
    '9223372036854775808',
    '10000000000000000000',
  ])('rejects a non-canonical or out-of-range cursor: %s', (cursor) => {
    expect(() => parseCreditAccountPage(
      `https://example.test/api/credits/account?cursor=${cursor}`,
    )).toThrow(CreditsApiError)
  })
})

describe('credit account data access', () => {
  it('reads only the safe activity and balance views', async () => {
    const ledgerResult = Promise.resolve({
      data: [
        {
          id: '2',
          amount: -7,
          entry_type: 'debit',
          created_at: '2026-07-23T12:00:00.000Z',
        },
        {
          id: '1',
          amount: 30,
          entry_type: 'registration_grant',
          created_at: '2026-07-22T12:00:00.000Z',
        },
      ],
      error: null,
    })
    const ledgerQuery = {
      order: vi.fn(),
      limit: vi.fn(),
      lt: vi.fn(),
      then: ledgerResult.then.bind(ledgerResult),
    }
    ledgerQuery.order.mockReturnValue(ledgerQuery)
    ledgerQuery.limit.mockReturnValue(ledgerQuery)
    ledgerQuery.lt.mockReturnValue(ledgerQuery)
    const ledgerSelect = vi.fn(() => ledgerQuery)
    const balanceSelect = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: { balance: '23' }, error: null }),
    }))
    const from = vi.fn((table: string) => ({
      select: table === 'credit_balances' ? balanceSelect : ledgerSelect,
    }))
    const client = { from } as unknown as SupabaseClient

    const account = await loadCreditAccountPage(client, { limit: 1, cursor: '3' })

    expect(from).toHaveBeenNthCalledWith(1, 'credit_balances')
    expect(from).toHaveBeenNthCalledWith(2, 'credit_activity')
    expect(ledgerSelect).toHaveBeenCalledWith('id, amount, entry_type, created_at')
    expect(ledgerQuery.lt).toHaveBeenCalledWith('id', '3')
    expect(account).toEqual({
      balance: 23,
      entries: [{
        id: '2',
        amount: -7,
        type: 'debit',
        created_at: '2026-07-23T12:00:00.000Z',
      }],
      next_cursor: '2',
    })
    expect(JSON.stringify(account)).not.toMatch(/business_key|metadata|account_id|user_id/)
  })
})

describe('credit account rate limit', () => {
  it('returns a deterministic per-instance retry delay', () => {
    let now = 1_000
    const limiter = createInMemoryCreditsRateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      now: () => now,
    })

    expect(limiter.consume('user-1').allowed).toBe(true)
    expect(limiter.consume('user-1').allowed).toBe(true)
    expect(limiter.consume('user-1')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    })
    now = 2_001
    expect(limiter.consume('user-1').allowed).toBe(true)
  })
})

describe('credit account endpoint', () => {
  it('ignores supplied user IDs and reads only through the session-scoped client', async () => {
    const scopedClient = {} as SupabaseClient
    const context = {
      user: { id: 'session-user' } as User,
      client: scopedClient,
    } satisfies AuthenticatedCreditsContext
    const authenticate = vi.fn().mockResolvedValue(context)
    const loadAccount = vi.fn().mockResolvedValue({
      balance: 30,
      entries: [],
      next_cursor: null,
    })
    const req = new Request(
      'https://example.test/api/credits/account?user_id=attacker&limit=10',
      { headers: { Authorization: 'Bearer validated-token' } },
    )

    const rateLimit = vi.fn().mockReturnValue({ allowed: true, retryAfterSeconds: 0 })
    const response = await handleCreditsAccount(req, {
      authenticate,
      loadAccount,
      rateLimit,
    })

    expect(response.status).toBe(200)
    expect(rateLimit).toHaveBeenCalledWith('session-user')
    expect(loadAccount).toHaveBeenCalledWith(scopedClient, { limit: 10, cursor: null })
    expect(JSON.stringify(await response.json())).not.toContain('session-user')
    expect(JSON.stringify(await handleCreditsAccount(
      new Request('https://example.test/api/credits/account', { method: 'POST' }),
      { authenticate, loadAccount, rateLimit },
    ).then((result) => result.json()))).not.toContain('attacker')
  })

  it('rejects invalid pagination before touching authentication or data', async () => {
    const authenticate = vi.fn()
    const loadAccount = vi.fn()
    const response = await handleCreditsAccount(
      new Request('https://example.test/api/credits/account?limit=500'),
      { authenticate, loadAccount },
    )

    expect(response.status).toBe(400)
    expect(authenticate).not.toHaveBeenCalled()
    expect(loadAccount).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After before reading account data', async () => {
    const context = {
      user: { id: 'session-user' } as User,
      client: {} as SupabaseClient,
    } satisfies AuthenticatedCreditsContext
    const loadAccount = vi.fn()
    const response = await handleCreditsAccount(
      new Request('https://example.test/api/credits/account', {
        headers: { Authorization: 'Bearer validated-token' },
      }),
      {
        authenticate: vi.fn().mockResolvedValue(context),
        loadAccount,
        rateLimit: vi.fn().mockReturnValue({
          allowed: false,
          retryAfterSeconds: 17,
        }),
      },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'rate_limited' },
    })
    expect(loadAccount).not.toHaveBeenCalled()
  })
})
