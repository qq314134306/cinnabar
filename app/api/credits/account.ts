/**
 * [INPUT]: GET /api/credits/account with opaque SID (or dual-mode Bearer fallback)
 * [OUTPUT]: Current balance and a cursor-paginated, sanitized ledger page
 * [POS]: Authenticated credit-account read endpoint; identity comes from server auth context
 *
 * Query/body user_id values are never read. The validated JWT is attached to a
 * publishable-key client, so credit_activity/credit_balances RLS determines the
 * only account that can be returned. Internal ledger columns are never selected.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  authenticateCreditsRequest,
  type AuthenticatedCreditsContext,
} from '../_credits-auth'
import { CREDIT_CATALOG } from '../_credits-catalog'
import {
  CreditsApiError,
  creditsErrorResponse,
  creditsJson,
  requestIdFor,
} from '../_credits-http'
import {
  creditAccountRateLimiter,
  type CreditsRateLimitDecision,
} from '../_credits-rate-limit'
import {
  loadCreditAccountPage,
  parseCreditAccountPage,
  type CreditAccountPage,
  type CreditAccountPageOptions,
} from '../_credits-service'

export interface CreditsAccountDependencies {
  authenticate: (req: Request) => Promise<AuthenticatedCreditsContext>
  loadAccount: (
    client: SupabaseClient,
    options: CreditAccountPageOptions,
  ) => Promise<CreditAccountPage>
  rateLimit: (userId: string) => CreditsRateLimitDecision
}

const defaultDependencies: CreditsAccountDependencies = {
  authenticate: authenticateCreditsRequest,
  loadAccount: loadCreditAccountPage,
  rateLimit: (userId) => creditAccountRateLimiter.consume(userId),
}

export async function handleCreditsAccount(
  req: Request,
  dependencyOverrides: Partial<CreditsAccountDependencies> = {},
): Promise<Response> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const requestId = requestIdFor(req)
  if (req.method !== 'GET') {
    return creditsJson(
      { error: { code: 'method_not_allowed', message: 'Method Not Allowed', request_id: requestId } },
      405,
      requestId,
    )
  }

  try {
    const pagination = parseCreditAccountPage(req.url)
    const { client, user } = await dependencies.authenticate(req)
    const rateLimit = dependencies.rateLimit(user.id)
    if (!rateLimit.allowed) {
      throw new CreditsApiError(
        429,
        'rate_limited',
        'Too many credit account requests. Please try again shortly.',
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      )
    }
    const account = await dependencies.loadAccount(client, pagination)
    return creditsJson(
      {
        data: {
          catalog_version: CREDIT_CATALOG.catalog_version,
          credit_expiration: CREDIT_CATALOG.credit_expiration,
          ...account,
        },
      },
      200,
      requestId,
    )
  } catch (error) {
    return creditsErrorResponse(error, requestId)
  }
}

export default handleCreditsAccount
