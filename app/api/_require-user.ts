/**
 * [INPUT]: Opaque session cookie (or legacy Bearer only during dual rollback)
 * [OUTPUT]: The verified Supabase user for a server API request
 * [POS]: Server-only authentication/CSRF boundary for paid Future Report APIs
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import type { User } from '@supabase/supabase-js'
import { AppAuthError } from './_auth'
import { authenticateAppRequest } from './_app-session'

export class HttpError extends AppAuthError {
  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message, status, code)
    this.name = 'HttpError'
  }
}

export async function requireUser(req: Request): Promise<User> {
  const context = await authenticateAppRequest(req, {
    allowLegacy: true,
    requireCsrf: req.method === 'POST',
  })
  return context.user
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppAuthError) {
    return jsonResponse({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    }, error.status)
  }
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
    )
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  console.error(message)
  return jsonResponse({ error: 'Payment service is temporarily unavailable.' }, 500)
}
