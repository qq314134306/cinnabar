/**
 * [INPUT]: Opaque SID cookie, with legacy Bearer fallback only in dual/legacy mode
 * [OUTPUT]: A validated Supabase user and least-privilege, user-scoped client
 * [POS]: SERVER-ONLY authentication boundary for credit account APIs
 *
 * This module intentionally uses the public publishable key plus the user's
 * validated JWT. Account reads therefore remain constrained by database RLS and
 * never need SUPABASE_SECRET_KEY.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { AppAuthError } from './_auth'
import { authenticateAppRequest } from './_app-session'
import { CreditsApiError } from './_credits-http'

const MAX_ACCESS_TOKEN_LENGTH = 8_192

type UserClientFactory = (accessToken: string) => SupabaseClient

export interface AuthenticatedCreditsContext {
  user: User
  client: SupabaseClient
}

export function readBearerToken(req: Request): string {
  const authorization = req.headers.get('authorization')
  const match = authorization?.match(/^Bearer[ \t]+(\S+)$/i)
  const accessToken = match?.[1]
  if (!accessToken || accessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
    throw new CreditsApiError(401, 'authentication_required', 'A valid session is required.')
  }
  return accessToken
}

export function createCreditsUserClient(accessToken: string): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new CreditsApiError(
      503,
      'service_unavailable',
      'The credits service is temporarily unavailable.',
    )
  }

  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function authenticateCreditsRequest(
  req: Request,
  createUserClient?: UserClientFactory,
): Promise<AuthenticatedCreditsContext> {
  // Explicit factory injection preserves the focused Bearer validator contract
  // used by tests and rollback tooling. Production calls resolve the BFF cookie
  // first and permit Bearer only when AUTH_MODE allows legacy fallback.
  if (createUserClient) {
    const accessToken = readBearerToken(req)
    const client = createUserClient(accessToken)
    const { data, error } = await client.auth.getUser(accessToken)
    if (error || !data.user) {
      throw new CreditsApiError(401, 'invalid_session', 'Your session is invalid or expired.')
    }
    return { user: data.user, client }
  }

  try {
    const context = await authenticateAppRequest(req, { allowLegacy: true })
    return {
      user: context.user,
      client: createCreditsUserClient(context.accessToken),
    }
  } catch (error) {
    if (error instanceof AppAuthError) {
      if (error.status === 409) {
        throw new CreditsApiError(
          409,
          'identity_conflict',
          'Conflicting authentication credentials.',
        )
      }
      if (error.status === 401) {
        throw new CreditsApiError(
          401,
          'invalid_session',
          'Your session is invalid or expired.',
        )
      }
      if (error.status === 403) {
        throw new CreditsApiError(403, 'request_rejected', 'Request rejected.')
      }
    }
    throw error
  }
}
