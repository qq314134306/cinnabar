/**
 * [INPUT]: Browser POST Origin, Sec-Fetch-Site, and X-CSRF headers
 * [OUTPUT]: Exact same-origin and session-bound CSRF enforcement
 * [POS]: SERVER-ONLY request guard for state-changing BFF endpoints
 */

import { AppAuthError } from './_auth'

export const CSRF_HEADER = 'X-CSRF'
export const MIGRATION_CSRF_VALUE = 'migrate'

export function readAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_ORIGIN
  if (!configured) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'APP_ORIGIN_MISSING',
    )
  }

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'APP_ORIGIN_INVALID',
    )
  }
  if (
    url.origin !== configured
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !(
      url.protocol === 'https:'
      || (url.protocol === 'http:' && url.hostname === 'localhost')
    )
  ) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'APP_ORIGIN_INVALID',
    )
  }
  return configured
}

export async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bytesToBase64Url(new Uint8Array(digest))
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'AUTH_CONFIGURATION_INVALID',
    )
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'AUTH_CONFIGURATION_INVALID',
    )
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  let mismatch = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return mismatch === 0
}

export function requirePostRequestGuards(
  req: Request,
  expectedCsrf: string,
): void {
  const suppliedCsrf = requirePostRequestMetadata(req)
  if (!constantTimeEqual(suppliedCsrf, expectedCsrf)) {
    throw new AppAuthError('Request verification failed.', 403, 'CSRF_REJECTED')
  }
}

export function requirePostRequestMetadata(req: Request): string {
  if (req.method !== 'POST') {
    throw new AppAuthError('Method Not Allowed', 405, 'METHOD_NOT_ALLOWED')
  }
  if (req.headers.get('origin') !== readAppOrigin()) {
    throw new AppAuthError('Request origin is not allowed.', 403, 'ORIGIN_REJECTED')
  }
  if (req.headers.get('sec-fetch-site') !== 'same-origin') {
    throw new AppAuthError('Cross-site request rejected.', 403, 'FETCH_SITE_REJECTED')
  }
  const suppliedCsrf = req.headers.get(CSRF_HEADER)
  if (
    !suppliedCsrf
    || suppliedCsrf.length > 256
  ) {
    throw new AppAuthError('Request verification failed.', 403, 'CSRF_REJECTED')
  }
  return suppliedCsrf
}
