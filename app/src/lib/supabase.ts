/**
 * [INPUT]: Public Supabase env plus the opaque-session auth BFF
 * [OUTPUT]: A legacy-compatible login client and validated BFF auth helpers
 * [POS]: Browser auth compatibility/migration boundary used by the auth store
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 *
 * In legacy mode the Supabase client remains the application session authority,
 * with the access token retained only in memory for rollback-compatible reads.
 * Dual mode migrates that session once; opaque mode uses only the BFF cookie.
 */

import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** True when both public env vars are present (production). */
export const isSupabaseConfigured = Boolean(url && publishableKey)

let legacySupabaseClient: SupabaseClient | null = null

/**
 * Creates the browser SDK only after the BFF reports legacy/dual mode. Opaque
 * mode never calls this function, so loading the application cannot create or
 * recover browser-owned provider session state.
 */
export function getLegacySupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!legacySupabaseClient) {
    legacySupabaseClient = createClient(url as string, publishableKey as string, {
      auth: {
        // Dual uses these only to discover and migrate an already-issued
        // legacy session. New dual/opaque login always starts at the BFF.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return legacySupabaseClient
}

export type AuthMode = 'legacy' | 'dual' | 'opaque'
export type BffOAuthProvider = 'google'

export const AUTH_CALLBACK_ERROR_MESSAGE =
  'Sign-in could not be completed. Please try again.'

export const EMAIL_OTP_VERIFICATION_ERROR_MESSAGE =
  'Verification could not be completed. Please check the code and try again.'

const LOGIN_UNAVAILABLE_MESSAGE =
  'Sign-in is temporarily unavailable. Please try again.'

export interface BffAuthUser {
  id: string
  email: string | null
}

interface SignedOutAuthSnapshot {
  authenticated: false
  authMode: AuthMode
}

interface SignedInAuthSnapshot {
  authenticated: true
  authMode: AuthMode
  csrfToken: string
  sessionVersion: string
  user: BffAuthUser
}

export type BffAuthSnapshot = SignedOutAuthSnapshot | SignedInAuthSnapshot

export interface BffEmailLoginAccepted {
  accepted: true
  authMode: AuthMode
  verificationCsrfToken: string
}

export interface BffOAuthLoginStarted {
  url: string
  authMode: AuthMode
}

interface BffLoginPreflight {
  authMode: AuthMode
  csrfToken: string
}

export type AuthCallbackMarker = 'success' | 'error' | null

export type BffAuthErrorCode =
  | 'MIGRATION_REAUTH_REQUIRED'
  | 'MIGRATION_RETRYABLE'

const BFF_AUTH_ERROR_CODES = new Set<BffAuthErrorCode>([
  'MIGRATION_REAUTH_REQUIRED',
  'MIGRATION_RETRYABLE',
])

export class BffAuthError extends Error {
  readonly status: number
  readonly code: BffAuthErrorCode | null

  constructor(
    message: string,
    status: number,
    code: BffAuthErrorCode | null = null,
  ) {
    super(message)
    this.name = 'BffAuthError'
    this.status = status
    this.code = code
  }
}

function normalizeBffAuthErrorCode(value: unknown): BffAuthErrorCode | null {
  return (
    typeof value === 'string'
    && BFF_AUTH_ERROR_CODES.has(value as BffAuthErrorCode)
  )
    ? value as BffAuthErrorCode
    : null
}

function isAuthMode(value: unknown): value is AuthMode {
  return value === 'legacy' || value === 'dual' || value === 'opaque'
}

function normalizeAuthSnapshot(value: unknown): BffAuthSnapshot {
  if (!value || typeof value !== 'object') {
    throw new BffAuthError('Authentication service returned an invalid response.', 502)
  }

  const record = value as Record<string, unknown>
  if (!isAuthMode(record.authMode) || typeof record.authenticated !== 'boolean') {
    throw new BffAuthError('Authentication service returned an invalid response.', 502)
  }
  if (!record.authenticated) {
    return { authenticated: false, authMode: record.authMode }
  }

  const user = record.user as Record<string, unknown> | null
  if (
    !user
    || typeof user.id !== 'string'
    || !user.id
    || (typeof user.email !== 'string' && user.email !== null)
    || typeof record.csrfToken !== 'string'
    || !record.csrfToken
    || typeof record.sessionVersion !== 'string'
    || !record.sessionVersion
  ) {
    throw new BffAuthError('Authentication service returned an invalid response.', 502)
  }

  return {
    authenticated: true,
    authMode: record.authMode,
    csrfToken: record.csrfToken,
    sessionVersion: record.sessionVersion,
    user: {
      id: user.id,
      email: user.email as string | null,
    },
  }
}

async function readAuthResponse(response: Response): Promise<BffAuthSnapshot> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const record = body && typeof body === 'object'
      ? body as Record<string, unknown>
      : null
    const nestedError = (
      record?.error
      && typeof record.error === 'object'
      && !Array.isArray(record.error)
    )
      ? record.error as Record<string, unknown>
      : null
    const message = typeof record?.error === 'string'
      ? record.error
      : typeof nestedError?.message === 'string'
        ? nestedError.message
        : 'Authentication is temporarily unavailable.'
    const code = normalizeBffAuthErrorCode(
      typeof record?.code === 'string' ? record.code : nestedError?.code,
    )
    throw new BffAuthError(message, response.status, code)
  }
  return normalizeAuthSnapshot(body)
}

async function readLoginResponse(
  response: Response,
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null)
  if (
    response.status !== expectedStatus
    || !body
    || typeof body !== 'object'
    || Array.isArray(body)
  ) {
    // Login routes can sit in front of identity-provider SDKs. Never surface
    // their response bodies, request IDs, or diagnostics in the browser.
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, response.status || 502)
  }
  return body as Record<string, unknown>
}

async function fetchBffLoginPreflight(
  fetcher: typeof fetch,
): Promise<BffLoginPreflight> {
  let response: Response
  try {
    response = await fetcher('/api/auth/login-preflight', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 0)
  }
  const body = await readLoginResponse(response, 200)
  if (
    (body.authMode !== 'dual' && body.authMode !== 'opaque')
    || typeof body.csrfToken !== 'string'
    || !body.csrfToken
  ) {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 502)
  }
  return {
    authMode: body.authMode,
    csrfToken: body.csrfToken,
  }
}

export async function startBffEmailLogin(
  email: string,
  fetcher: typeof fetch = fetch,
): Promise<BffEmailLoginAccepted> {
  const preflight = await fetchBffLoginPreflight(fetcher)
  let response: Response
  try {
    response = await fetcher('/api/auth/login-email', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF': preflight.csrfToken,
      },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 0)
  }
  const body = await readLoginResponse(response, 202)
  if (
    body.accepted !== true
    || body.authMode !== preflight.authMode
    || typeof body.verificationCsrfToken !== 'string'
    || !body.verificationCsrfToken
  ) {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 502)
  }
  return {
    accepted: true,
    authMode: preflight.authMode,
    verificationCsrfToken: body.verificationCsrfToken,
  }
}

export async function verifyBffEmailOtp(
  email: string,
  token: string,
  verificationCsrfToken: string,
  fetcher: typeof fetch = fetch,
): Promise<Extract<BffAuthSnapshot, { authenticated: true }>> {
  if (!/^[0-9]{6}$/u.test(token) || !verificationCsrfToken) {
    throw new BffAuthError(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE, 400)
  }

  let response: Response
  try {
    response = await fetcher('/api/auth/login-email-verify', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF': verificationCsrfToken,
      },
      body: JSON.stringify({ email, token }),
    })
  } catch {
    throw new BffAuthError(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE, 0)
  }

  const body = await response.json().catch(() => null)
  if (response.status !== 200) {
    throw new BffAuthError(
      EMAIL_OTP_VERIFICATION_ERROR_MESSAGE,
      response.status || 502,
    )
  }

  try {
    const snapshot = normalizeAuthSnapshot(body)
    if (!snapshot.authenticated || snapshot.authMode === 'legacy') {
      throw new Error('invalid verification session')
    }
    return snapshot
  } catch {
    throw new BffAuthError(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE, 502)
  }
}

function validateOAuthRedirectUrl(
  value: unknown,
  appOrigin: string,
  configuredSupabaseUrl: string,
): string {
  if (typeof value !== 'string' || !value) {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 502)
  }

  try {
    const app = new URL(appOrigin)
    const supabaseBase = new URL(configuredSupabaseUrl)
    const redirect = new URL(value)
    const allowedQueryKeys = new Set([
      'provider',
      'redirect_to',
      'code_challenge',
      'code_challenge_method',
    ])
    const providers = redirect.searchParams.getAll('provider')
    const callbacks = redirect.searchParams.getAll('redirect_to')
    const challenges = redirect.searchParams.getAll('code_challenge')
    const challengeMethods = redirect.searchParams.getAll('code_challenge_method')
    const permitsLocalHttp = (
      supabaseBase.protocol === 'http:'
      && supabaseBase.hostname === 'localhost'
    )
    if (
      (supabaseBase.protocol !== 'https:' && !permitsLocalHttp)
      || Boolean(supabaseBase.username)
      || Boolean(supabaseBase.password)
      || supabaseBase.pathname !== '/'
      || Boolean(supabaseBase.search)
      || Boolean(supabaseBase.hash)
      || redirect.protocol !== supabaseBase.protocol
      || redirect.origin !== supabaseBase.origin
      || redirect.pathname !== '/auth/v1/authorize'
      || redirect.username
      || redirect.password
      || redirect.hash
      || Array.from(redirect.searchParams.keys()).some(
        (key) => !allowedQueryKeys.has(key),
      )
      || providers.length !== 1
      || providers[0] !== 'google'
      || callbacks.length !== 1
      || callbacks[0] !== `${app.origin}/api/auth/callback`
      || challenges.length !== 1
      || !/^[A-Za-z0-9_-]{43}$/u.test(challenges[0])
      || challengeMethods.length !== 1
      || challengeMethods[0] !== 's256'
    ) {
      throw new Error('unsafe redirect')
    }
    return redirect.href
  } catch {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 502)
  }
}

export async function startBffOAuthLogin(
  provider: BffOAuthProvider,
  fetcher: typeof fetch = fetch,
  appOrigin = typeof window !== 'undefined' ? window.location.origin : '',
  configuredSupabaseUrl = url ?? '',
): Promise<BffOAuthLoginStarted> {
  const preflight = await fetchBffLoginPreflight(fetcher)
  let response: Response
  try {
    response = await fetcher('/api/auth/login-oauth', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF': preflight.csrfToken,
      },
      body: JSON.stringify({ provider }),
    })
  } catch {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 0)
  }
  const body = await readLoginResponse(response, 200)
  if (body.authMode !== preflight.authMode) {
    throw new BffAuthError(LOGIN_UNAVAILABLE_MESSAGE, 502)
  }
  return {
    url: validateOAuthRedirectUrl(
      body.url,
      appOrigin,
      configuredSupabaseUrl,
    ),
    authMode: preflight.authMode,
  }
}

export function assignBffOAuthRedirect(
  url: string,
  target: Pick<Location, 'assign'> = window.location,
): void {
  target.assign(url)
}

export function consumeAuthCallbackMarker(
  locationValue: Pick<Location, 'pathname' | 'search' | 'hash'> =
    window.location,
  historyValue: Pick<History, 'replaceState' | 'state'> = window.history,
): AuthCallbackMarker {
  const params = new URLSearchParams(locationValue.search)
  if (!params.has('auth_callback')) return null

  const values = params.getAll('auth_callback')
  const value = values.length === 1 ? values[0] : null
  const marker = value === 'success' || value === 'error' ? value : null
  params.delete('auth_callback')

  const search = params.toString()
  historyValue.replaceState(
    historyValue.state,
    '',
    `${locationValue.pathname}${search ? `?${search}` : ''}${locationValue.hash}`,
  )
  return marker
}

export async function fetchBffSession(
  fetcher: typeof fetch = fetch,
): Promise<BffAuthSnapshot> {
  const response = await fetcher('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  return readAuthResponse(response)
}

export async function migrateLegacySession(
  session: Session,
  fetcher: typeof fetch = fetch,
): Promise<SignedInAuthSnapshot> {
  const response = await fetcher('/api/auth/migrate', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'X-CSRF': 'migrate',
    },
    body: JSON.stringify({ refreshToken: session.refresh_token }),
  })
  const snapshot = await readAuthResponse(response)
  if (!snapshot.authenticated) {
    throw new BffAuthError('Authentication migration did not create a session.', 502)
  }
  return snapshot
}

export async function logoutBffSession(
  csrfToken: string,
  fetcher: typeof fetch = fetch,
): Promise<SignedOutAuthSnapshot> {
  const response = await fetcher('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'X-CSRF': csrfToken,
    },
  })
  const snapshot = await readAuthResponse(response)
  if (snapshot.authenticated) {
    throw new BffAuthError('Authentication service did not end the session.', 502)
  }
  return snapshot
}

/**
 * Removes only Supabase auth persistence after the server has accepted the
 * migration. It intentionally does not call Supabase signOut, which would
 * revoke the refresh token now held by the BFF.
 */
export function clearLegacySupabaseAuthStorage(
  storage?: Storage | null,
): void {
  try {
    const target = storage === undefined
      ? (typeof window !== 'undefined' ? window.localStorage : null)
      : storage
    if (!target) return

    const keys: string[] = []
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index)
      if (key?.startsWith('sb-') && key.includes('-auth-token')) keys.push(key)
    }
    for (const key of keys) target.removeItem(key)
  } catch {
    // Storage can be disabled. The BFF session remains authoritative and no
    // later auth SDK action is allowed to refresh the legacy browser session.
  }
}
