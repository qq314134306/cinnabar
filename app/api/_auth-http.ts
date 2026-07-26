/**
 * [INPUT]: Opaque auth endpoint response bodies and AppAuthError failures
 * [OUTPUT]: Stable no-store JSON responses with optional cookie mutation
 * [POS]: SERVER-ONLY HTTP boundary for /api/auth/*
 */

import { AppAuthError, readAuthMode } from './_auth'

export function authJson(
  body: Record<string, unknown>,
  status = 200,
  additionalHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie, Authorization',
      ...additionalHeaders,
    },
  })
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AppAuthError) {
    return authJson(
      { error: { code: error.code, message: error.message } },
      error.status,
    )
  }
  console.error(JSON.stringify({
    level: 'error',
    event: 'auth_api_unhandled_error',
    error_category: 'unclassified_auth_error',
  }))
  return authJson(
    {
      error: {
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.',
      },
    },
    503,
  )
}

export function signedOutSession(): Record<string, unknown> {
  return {
    authenticated: false,
    authMode: readAuthMode(),
  }
}
