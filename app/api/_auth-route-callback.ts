/**
 * [INPUT]: Exact Supabase PKCE code callback plus opaque flow cookie
 * [OUTPUT]: Active opaque SID cookie and fixed success/error redirect marker
 * [POS]: One-use server callback; never returns provider tokens or errors
 */

import {
  clearLoginFlowCookie,
  claimLoginTransaction,
  exchangePkceCode,
  readCallbackCode,
  readLoginFlowCookie,
} from './_auth-login'
import {
  createOpaqueSessionFromTrustedSupabaseSession,
  sessionCookie,
} from './_app-session'
import { authJson } from './_auth-http'
import { readAppOrigin } from './_csrf'

export const config = { runtime: 'edge' }

function callbackRedirect(
  result: 'success' | 'error',
  additionalCookie?: string,
): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store, private',
    Pragma: 'no-cache',
    Location: `${readAppOrigin()}/?auth_callback=${result}`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  headers.append('Set-Cookie', clearLoginFlowCookie())
  if (additionalCookie) headers.append('Set-Cookie', additionalCookie)
  return new Response(null, { status: 303, headers })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return authJson(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } },
      405,
      {
        Allow: 'GET',
        'Set-Cookie': clearLoginFlowCookie(),
      },
    )
  }
  try {
    const code = readCallbackCode(req)
    const handle = readLoginFlowCookie(req)
    const transaction = await claimLoginTransaction(handle)
    const trustedSession = await exchangePkceCode(code, transaction.verifier)
    const created = await createOpaqueSessionFromTrustedSupabaseSession(
      req,
      trustedSession,
    )
    return callbackRedirect('success', sessionCookie(created.sid))
  } catch {
    return callbackRedirect('error')
  }
}
