import { describe, expect, it, vi } from 'vitest'
import {
  CreditWalletUnavailableError,
  formatCreditAmount,
  getCreditActionLabel,
  loadCreditWallet,
  RECENT_CREDIT_TRANSACTION_LIMIT,
} from '@/lib/credits'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('credit wallet client', () => {
  it('uses the cookie-authenticated safe account API and maps sanitized activity', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        catalog_version: '2026-07-23.v1',
        credit_expiration: 'never',
        balance: 21,
        entries: [
          {
            id: '2',
            amount: -9,
            type: 'debit',
            created_at: '2026-07-23T12:00:00.000Z',
            business_key: 'must-not-leak',
            metadata: { report: 'must-not-leak' },
          },
          {
            id: '1',
            amount: 30,
            type: 'registration_grant',
            created_at: '2026-07-22T12:00:00.000Z',
          },
        ],
        next_cursor: null,
      },
    }))

    const wallet = await loadCreditWallet(
      fetcher as unknown as typeof fetch,
    )

    expect(fetcher).toHaveBeenCalledWith(
      `/api/credits/account?limit=${RECENT_CREDIT_TRANSACTION_LIMIT}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    )
    expect(wallet).toEqual({
      balance: 21,
      transactions: [
        {
          id: '2',
          amount: -9,
          entryType: 'debit',
          createdAt: '2026-07-23T12:00:00.000Z',
        },
        {
          id: '1',
          amount: 30,
          entryType: 'registration_grant',
          createdAt: '2026-07-22T12:00:00.000Z',
        },
      ],
    })
    expect(JSON.stringify(wallet)).not.toContain('business_key')
    expect(JSON.stringify(wallet)).not.toContain('metadata')
    expect(JSON.stringify(wallet)).not.toContain('must-not-leak')
  })

  it('supports an empty account snapshot', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      data: { balance: 0, entries: [], next_cursor: null },
    }))

    await expect(loadCreditWallet(
      fetcher as unknown as typeof fetch,
    )).resolves.toEqual({
      balance: 0,
      transactions: [],
    })
  })

  it('never exposes API or Supabase diagnostics in its error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      error: {
        code: 'internal_error',
        message: 'relation credit_ledger does not exist',
        request_id: 'request-1',
      },
    }, 503))

    const error = await loadCreditWallet(
      fetcher as unknown as typeof fetch,
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CreditWalletUnavailableError)
    expect((error as Error).message).toBe('Credit wallet is unavailable.')
    expect((error as Error).message).not.toContain('credit_ledger')
  })

  it('rejects malformed safe-view data with the same friendly error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        balance: 30,
        entries: [{
          id: '1',
          amount: -9,
          type: 'registration_grant',
          created_at: 'not-a-date',
        }],
      },
    }))

    await expect(loadCreditWallet(
      fetcher as unknown as typeof fetch,
    )).rejects.toBeInstanceOf(CreditWalletUnavailableError)
  })

  it('does not add a browser-readable Authorization header', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      data: { balance: 0, entries: [] },
    }))

    await loadCreditWallet(fetcher as unknown as typeof fetch)

    const [, request] = fetcher.mock.calls[0]
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('adds the transient Supabase Bearer only for an explicit legacy session', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      data: { balance: 0, entries: [] },
    }))

    await loadCreditWallet(
      fetcher as unknown as typeof fetch,
      'legacy-access-token',
    )

    const [, request] = fetcher.mock.calls[0]
    expect(request.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer legacy-access-token',
    })
  })

  it('formats known actions and signed amounts for the UI', () => {
    expect(getCreditActionLabel('registration_grant')).toBe('Welcome credits')
    expect(getCreditActionLabel('debit')).toBe('Credits used')
    expect(formatCreditAmount(30)).toBe('+30')
    expect(formatCreditAmount(-9)).toBe('−9')
  })
})
