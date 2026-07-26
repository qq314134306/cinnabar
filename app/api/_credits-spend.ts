/**
 * [INPUT]: Trusted user/product/business identifiers from a server product flow
 * [OUTPUT]: Service-role-only idempotent spend_credits RPC result
 * [POS]: SERVER-ONLY debit boundary; not imported by read APIs or browser code
 *
 * This helper is deliberately not exposed as a standalone endpoint. A future
 * product-generation endpoint must authenticate the session, own delivery, and
 * call it with a stable business key. The amount is always selected here from
 * the server catalog and can never be supplied by a client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from './_supabase-admin'
import { CREDIT_CATALOG, getCreditProduct, type CreditProductId } from './_credits-catalog'
import { CreditsApiError, CreditsInternalError } from './_credits-http'

export interface DebitCreditsInput {
  userId: string
  productId: CreditProductId | string
  businessKey: string
  metadata?: Record<string, unknown>
}

export async function debitCreditsForProduct(
  input: DebitCreditsInput,
  admin: Pick<SupabaseClient, 'rpc'> = getSupabaseAdmin(),
) {
  const product = getCreditProduct(input.productId)
  if (!product) {
    throw new CreditsApiError(400, 'unknown_credit_product', 'Unknown credit product.')
  }
  const businessKey = input.businessKey.trim()
  if (!businessKey || businessKey.length > 200) {
    throw new CreditsApiError(
      400,
      'invalid_business_key',
      'businessKey must contain 1 to 200 characters.',
    )
  }

  const { data, error } = await admin.rpc('spend_credits', {
    p_user_id: input.userId,
    p_amount: product.credit_cost,
    p_business_key: businessKey,
    p_metadata: {
      ...(input.metadata ?? {}),
      product_id: product.id,
      catalog_version: CREDIT_CATALOG.catalog_version,
    },
  })
  if (error) {
    throw new CreditsInternalError('credit_debit_failed')
  }
  return data
}
