import { describe, expect, it, vi } from 'vitest'
import {
  CREDIT_CATALOG,
  getCreditPack,
  getCreditProduct,
} from '../api/_credits-catalog'
import { debitCreditsForProduct } from '../api/_credits-spend'
import catalogHandler from '../api/credits/catalog'

describe('server credit catalog', () => {
  it('pins the approved versioned product contract', () => {
    expect(CREDIT_CATALOG).toEqual({
      schema_version: 1,
      catalog_version: '2026-07-23.v1',
      registration_grant_credits: 30,
      credit_expiration: 'never',
      packs: [
        {
          id: 'credits_100',
          credits: 100,
          price: { currency: 'USD', minor_units: 490, display: '$4.90' },
        },
        {
          id: 'credits_250',
          credits: 250,
          price: { currency: 'USD', minor_units: 990, display: '$9.90' },
        },
        {
          id: 'credits_550',
          credits: 550,
          price: { currency: 'USD', minor_units: 1_990, display: '$19.90' },
        },
      ],
      products: [
        { id: 'love_pattern', credit_cost: 100 },
        { id: 'year_flow_snapshot', credit_cost: 180 },
      ],
    })
    expect(getCreditPack('credits_250')?.price.minor_units).toBe(990)
    expect(getCreditProduct('love_pattern')?.credit_cost).toBe(100)
    expect(getCreditProduct('not-a-product')).toBeNull()
  })

  it('serves only the public catalog over GET', async () => {
    const response = await catalogHandler(new Request('https://example.test/api/credits/catalog'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600')
    await expect(response.json()).resolves.toEqual({ data: CREDIT_CATALOG })

    const rejected = await catalogHandler(new Request(
      'https://example.test/api/credits/catalog',
      { method: 'POST' },
    ))
    expect(rejected.status).toBe(405)
  })

  it('derives debit amounts and metadata from the trusted catalog', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ledger_id: 7, balance: 12, created: true }],
      error: null,
    })

    const result = await debitCreditsForProduct(
      {
        userId: 'trusted-user-id',
        productId: 'year_flow_snapshot',
        businessKey: 'year-flow:request-123',
        metadata: {
          catalog_version: 'client-forgery',
          product_id: 'client-forgery',
          request_id: 'request-123',
        },
        amount: 1,
      } as never,
      { rpc } as never,
    )

    expect(result).toEqual([{ ledger_id: 7, balance: 12, created: true }])
    expect(rpc).toHaveBeenCalledWith('spend_credits', {
      p_user_id: 'trusted-user-id',
      p_amount: 180,
      p_business_key: 'year-flow:request-123',
      p_metadata: {
        request_id: 'request-123',
        product_id: 'year_flow_snapshot',
        catalog_version: '2026-07-23.v1',
      },
    })
  })
})
