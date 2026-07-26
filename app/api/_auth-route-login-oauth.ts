/**
 * [INPUT]: Guarded POST with exact { provider: "google" }
 * [OUTPUT]: Validated Supabase authorization URL and one-use flow cookie
 * [POS]: Server-owned Google-via-Supabase PKCE start
 */

import { AppAuthError, readAuthMode } from './_auth'
import {
  beginOAuthLogin,
  clearLoginCsrfCookie,
  readStrictJsonObject,
  requireLoginPostGuards,
} from './_auth-login'
import { authErrorResponse, authJson } from './_auth-http'

export const config = { runtime: 'edge' }

const MAX_BODY_BYTES = 128

function withClearedPreauthCookie(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', clearLoginCsrfCookie())
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function withLoginCookies(response: Response, flowCookie: string): Response {
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', flowCookie)
  headers.append('Set-Cookie', clearLoginCsrfCookie())
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
    if (
      Object.keys(body).length !== 1
      || body.provider !== 'google'
    ) {
      throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
    }
    const started = await beginOAuthLogin('google')
    return withLoginCookies(
      authJson({ url: started.url, authMode: readAuthMode() }, 200),
      started.flowCookie,
    )
  } catch (error) {
    return withClearedPreauthCookie(authErrorResponse(error))
  }
}
