/**
 * [INPUT]: POST with opaque SID cookie and session-bound X-CSRF
 * [OUTPUT]: Revoked server session and expired SID cookie
 * [POS]: Opaque BFF logout endpoint
 */

import {
  authenticateAppRequest,
  clearSessionCookie,
  revokeOpaqueSession,
} from './_app-session'
import { AppAuthError } from './_auth'
import {
  authErrorResponse,
  authJson,
  signedOutSession,
} from './_auth-http'
import { requirePostRequestMetadata } from './_csrf'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  try {
    const context = await authenticateAppRequest(req, {
      allowLegacy: false,
      requireCsrf: true,
    })
    await revokeOpaqueSession(req, context)
    return authJson(signedOutSession(), 200, {
      'Set-Cookie': clearSessionCookie(),
    })
  } catch (error) {
    if (error instanceof AppAuthError && error.status === 401) {
      try {
        // There is no trustworthy session secret to compare for an expired or
        // malformed cookie. Still require an explicit X-CSRF header plus exact
        // same-origin request metadata before idempotently clearing it.
        requirePostRequestMetadata(req)
        return authJson(signedOutSession(), 200, {
          'Set-Cookie': clearSessionCookie(),
        })
      } catch (guardError) {
        return authErrorResponse(guardError)
      }
    }
    return authErrorResponse(error)
  }
}
