/**
 * [INPUT]: GET with optional __Host-cinnabar_sid cookie
 * [OUTPUT]: Minimal authenticated user, CSRF token, and stable session version
 * [POS]: Opaque BFF session hydration endpoint
 */

import { AppAuthError } from './_auth'
import {
  authenticateAppRequest,
  clearSessionCookie,
  publicSession,
} from './_app-session'
import {
  authErrorResponse,
  authJson,
  signedOutSession,
} from './_auth-http'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return authJson(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } },
      405,
      { Allow: 'GET' },
    )
  }
  try {
    const context = await authenticateAppRequest(req, { allowLegacy: false })
    return authJson({ ...publicSession(context) })
  } catch (error) {
    if (
      error instanceof AppAuthError
      && (error.status === 401 || error.code === 'OPAQUE_SESSION_REQUIRED')
    ) {
      return authJson(signedOutSession(), 200, {
        'Set-Cookie': clearSessionCookie(),
      })
    }
    return authErrorResponse(error)
  }
}
