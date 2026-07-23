/**
 * [INPUT]: Same-origin browser GET before a server-managed login start
 * [OUTPUT]: Double-submit pre-auth CSRF token plus HttpOnly Strict cookie
 * [POS]: One-use browser binding bootstrap for /api/auth/login-*
 */

import { AppAuthError, readAuthMode } from './_auth'
import {
  createLoginCsrfToken,
  loginCsrfCookie,
} from './_auth-login'
import { authErrorResponse, authJson } from './_auth-http'
import { readAppOrigin } from './_csrf'

export const config = { runtime: 'edge' }

const PREFLIGHT_PATH = '/api/auth/login-preflight'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return authJson(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } },
      405,
      { Allow: 'GET' },
    )
  }
  try {
    const url = new URL(req.url)
    if (
      url.origin !== readAppOrigin()
      || url.pathname !== PREFLIGHT_PATH
      || url.search
      || url.hash
    ) {
      throw new AppAuthError(
        'Request origin is not allowed.',
        403,
        'ORIGIN_REJECTED',
      )
    }
    const csrfToken = createLoginCsrfToken()
    return authJson({ authMode: readAuthMode(), csrfToken }, 200, {
      'Set-Cookie': loginCsrfCookie(csrfToken),
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
