/**
 * [INPUT]: Guarded POST with exact { email, token } and an email flow cookie
 * [OUTPUT]: Minimal opaque application session or one fixed terminal failure
 * [POS]: Manual six-digit email OTP verification boundary
 */

import {
  clearLoginCsrfCookie,
  clearLoginFlowCookie,
  claimEmailLoginTransaction,
  normalizeEmailOtp,
  normalizeLoginEmail,
  readLoginFlowCookie,
  readStrictJsonObject,
  requireLoginPostGuards,
  verifyEmailLogin,
} from './_auth-login'
import {
  createOpaqueSessionFromTrustedSupabaseSession,
  publicSession,
  sessionCookie,
} from './_app-session'
import { authJson } from './_auth-http'

export const config = { runtime: 'edge' }

const MAX_BODY_BYTES = 1_024
const FAILURE_BODY = {
  error: {
    code: 'EMAIL_VERIFICATION_FAILED',
    message: 'Email verification could not be completed. Please start again.',
  },
}

function withTerminalCookies(
  response: Response,
  sidCookie?: string,
): Response {
  const headers = new Headers(response.headers)
  if (sidCookie) headers.append('Set-Cookie', sidCookie)
  headers.append('Set-Cookie', clearLoginFlowCookie())
  headers.append('Set-Cookie', clearLoginCsrfCookie())
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function fixedFailure(status = 400, allow?: string): Response {
  return withTerminalCookies(authJson(
    FAILURE_BODY,
    status,
    allow ? { Allow: allow } : {},
  ))
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fixedFailure(405, 'POST')
  try {
    requireLoginPostGuards(req)
    const body = await readStrictJsonObject(req, MAX_BODY_BYTES)
    if (
      Object.keys(body).length !== 2
      || !('email' in body)
      || !('token' in body)
    ) {
      return fixedFailure()
    }
    const email = normalizeLoginEmail(body.email)
    const token = normalizeEmailOtp(body.token)
    const handle = readLoginFlowCookie(req)

    // The one-use database claim always precedes the one-use provider call.
    await claimEmailLoginTransaction(handle)
    const trustedSession = await verifyEmailLogin({
      email,
      token,
      type: 'email',
    })
    const created = await createOpaqueSessionFromTrustedSupabaseSession(
      req,
      trustedSession,
    )
    return withTerminalCookies(
      authJson({ ...publicSession(created.context) }),
      sessionCookie(created.sid),
    )
  } catch {
    return fixedFailure()
  }
}
