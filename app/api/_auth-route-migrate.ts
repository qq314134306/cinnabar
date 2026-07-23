/**
 * [INPUT]: POST Bearer access token + exact { refreshToken } legacy session
 * [OUTPUT]: Opaque HttpOnly SID cookie, CSRF token, and minimal user
 * [POS]: One-time bridge from browser-held Supabase tokens to the BFF session
 */

import { AppAuthError, readOptionalBearerToken } from './_auth'
import {
  createOpaqueSessionFromLegacy,
  publicSession,
  sessionCookie,
} from './_app-session'
import { authErrorResponse, authJson } from './_auth-http'
import {
  MIGRATION_CSRF_VALUE,
  requirePostRequestGuards,
} from './_csrf'

export const config = { runtime: 'edge' }

const MAX_BODY_LENGTH = 9_000

function parseMigrationBody(value: unknown): { refreshToken: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  const body = value as Record<string, unknown>
  if (
    Object.keys(body).length !== 1
    || typeof body.refreshToken !== 'string'
    || !body.refreshToken
  ) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  return { refreshToken: body.refreshToken }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    requirePostRequestGuards(req, MIGRATION_CSRF_VALUE)
    const accessToken = readOptionalBearerToken(req)
    if (!accessToken) {
      throw new AppAuthError('A valid session is required.', 401, 'INVALID_SESSION')
    }
    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_LENGTH) {
      throw new AppAuthError('Request body too large.', 413, 'REQUEST_TOO_LARGE')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new AppAuthError('Invalid JSON body.', 400, 'INVALID_REQUEST')
    }
    const body = parseMigrationBody(parsed)
    const created = await createOpaqueSessionFromLegacy(
      req,
      accessToken,
      body.refreshToken,
    )
    return authJson({ ...publicSession(created.context) }, 200, {
      'Set-Cookie': sessionCookie(created.sid),
    })
  } catch (error) {
    if (
      error instanceof AppAuthError
      && (
        error.code === 'MIGRATION_REAUTH_REQUIRED'
        || error.code === 'MIGRATION_RETRYABLE'
      )
    ) {
      // This route keeps a flat stable code so the transitional browser auth
      // client can distinguish forced re-login from a safe pre-rotation retry.
      return authJson(
        { error: error.message, code: error.code },
        error.status,
      )
    }
    return authErrorResponse(error)
  }
}
