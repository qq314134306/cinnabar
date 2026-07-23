/**
 * [INPUT]: Guarded POST with exact { email }
 * [OUTPUT]: Stable non-enumerating acceptance and one-use flow cookie
 * [POS]: Server-owned Supabase email PKCE start
 */

import { AppAuthError, readAuthMode } from './_auth'
import {
  beginEmailLogin,
  clearLoginCsrfCookie,
  createLoginCsrfToken,
  loginCsrfCookie,
  normalizeLoginEmail,
  readStrictJsonObject,
  requireLoginPostGuards,
} from './_auth-login'
import { authErrorResponse, authJson } from './_auth-http'

export const config = { runtime: 'edge' }

const MAX_BODY_BYTES = 1_024

function withClearedPreauthCookie(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', clearLoginCsrfCookie())
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function withLoginCookies(
  response: Response,
  flowCookie: string,
  verificationCsrfCookie: string,
): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', flowCookie)
  headers.append('Set-Cookie', verificationCsrfCookie)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default async function handler(req: Request): Promise<Response> {
  try {
    requireLoginPostGuards(req)
    const body = await readStrictJsonObject(req, MAX_BODY_BYTES)
    if (Object.keys(body).length !== 1 || !('email' in body)) {
      throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
    }
    const email = normalizeLoginEmail(body.email)
    const started = await beginEmailLogin(email)
    const verificationCsrfToken = createLoginCsrfToken()
    return withLoginCookies(
      authJson({
        accepted: true,
        authMode: readAuthMode(),
        verificationCsrfToken,
      }, 202),
      started.flowCookie,
      loginCsrfCookie(verificationCsrfToken),
    )
  } catch (error) {
    return withClearedPreauthCookie(authErrorResponse(error))
  }
}
