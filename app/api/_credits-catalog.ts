/**
 * [INPUT]: Approved Cinnabar credit-pack and feature pricing contract
 * [OUTPUT]: Immutable, versioned catalog plus trusted server-side lookups
 * [POS]: SERVER-ONLY source of truth for credit pricing and product costs
 * [PROTOCOL]: Bump CATALOG_VERSION whenever any value or identifier changes
 *
 * Keep this module under api/ and never import it from src/. Public clients may
 * read the serialized catalog endpoint, but only server code may use its lookup
 * functions to choose an amount for a ledger RPC.
 */

const packs = Object.freeze([
  Object.freeze({
    id: 'credits_100',
    credits: 100,
    price: Object.freeze({ currency: 'USD', minor_units: 490, display: '$4.90' }),
  }),
  Object.freeze({
    id: 'credits_250',
    credits: 250,
    price: Object.freeze({ currency: 'USD', minor_units: 990, display: '$9.90' }),
  }),
  Object.freeze({
    id: 'credits_550',
    credits: 550,
    price: Object.freeze({ currency: 'USD', minor_units: 1_990, display: '$19.90' }),
  }),
] as const)

const products = Object.freeze([
  Object.freeze({ id: 'love_pattern', credit_cost: 100 }),
  Object.freeze({ id: 'year_flow_snapshot', credit_cost: 180 }),
] as const)

export const CREDIT_CATALOG = Object.freeze({
  schema_version: 1,
  catalog_version: '2026-07-23.v1',
  registration_grant_credits: 30,
  credit_expiration: 'never',
  packs,
  products,
} as const)

export type CreditProductId = (typeof CREDIT_CATALOG.products)[number]['id']
export type CreditPackId = (typeof CREDIT_CATALOG.packs)[number]['id']

export function getCreditProduct(productId: string) {
  return CREDIT_CATALOG.products.find((product) => product.id === productId) ?? null
}

export function getCreditPack(packId: string) {
  return CREDIT_CATALOG.packs.find((pack) => pack.id === packId) ?? null
}
