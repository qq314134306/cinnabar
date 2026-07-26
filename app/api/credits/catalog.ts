/**
 * [INPUT]: GET /api/credits/catalog
 * [OUTPUT]: Public immutable credit packs, feature costs, grant, and expiry policy
 * [POS]: Versioned public catalog endpoint; contains no secrets or payment logic
 */

import { CREDIT_CATALOG } from '../_credits-catalog'
import { creditsJson, requestIdFor } from '../_credits-http'

const CATALOG_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

export default async function handler(req: Request): Promise<Response> {
  const requestId = requestIdFor(req)
  if (req.method !== 'GET') {
    return creditsJson(
      { error: { code: 'method_not_allowed', message: 'Method Not Allowed', request_id: requestId } },
      405,
      requestId,
    )
  }

  return creditsJson(
    { data: CREDIT_CATALOG },
    200,
    requestId,
    CATALOG_CACHE_CONTROL,
  )
}
