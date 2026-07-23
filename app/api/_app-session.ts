/**
 * [INPUT]: Opaque __Host-cinnabar_sid cookie or one-time Supabase session migration
 * [OUTPUT]: Server-authenticated user context, CSRF secret, and scoped access token
 * [POS]: SERVER-ONLY opaque session authority with AES-GCM token custody and refresh rotation
 *
 * SESSION_ENCRYPTION_KEY is `<version>:<base64url 32-byte key>`. The key,
 * plaintext tokens, SID, and CSRF secret must never be logged.
 */

import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import {
  AppAuthError,
  type AuthMode,
  readAuthMode,
  readOptionalBearerToken,
} from './_auth'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  requirePostRequestGuards,
  sha256Base64Url,
} from './_csrf'
import { getSupabaseAdmin } from './_supabase-admin'

export const SESSION_COOKIE_NAME = '__Host-cinnabar_sid'
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const REFRESH_UPSTREAM_TIMEOUT_MS = 8_000
export const PROVIDER_USER_TIMEOUT_MS = 8_000
export const REFRESH_WAIT_TIMEOUT_MS = 10_000
export const REFRESH_LEASE_MS = 30_000

const SESSION_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1_000
const SESSION_ABSOLUTE_TIMEOUT_MS = SESSION_COOKIE_MAX_AGE_SECONDS * 1_000
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1_000
const REFRESH_EARLY_MS = 60 * 1_000
const PENDING_MIGRATION_TIMEOUT_MS = 5 * 60 * 1_000
const REFRESH_WAIT_BASE_MS = 100
const REFRESH_WAIT_CAP_MS = 750
const MAX_ACCESS_TOKEN_LENGTH = 16_384
const MAX_REFRESH_TOKEN_LENGTH = 8_192
const SID_PATTERN = /^[A-Za-z0-9_-]{43}$/u

export interface AppAuthSessionRow {
  id: string
  sid_hash: string
  user_id: string
  migration_state: 'pending' | 'active'
  migration_token_hash: string | null
  encryption_key_version: string
  access_token_ciphertext: string
  access_token_iv: string
  refresh_token_ciphertext: string
  refresh_token_iv: string
  token_expires_at: string
  csrf_hash: string
  csrf_secret_ciphertext: string
  csrf_secret_iv: string
  last_seen_at: string
  absolute_expires_at: string
  revoked_at: string | null
  revoke_reason: string | null
  refresh_lease_id: string | null
  refresh_lease_expires_at: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface SessionSecrets {
  accessToken: string
  refreshToken: string
  csrfToken: string
}

export interface EncryptionConfiguration {
  version: string
  key: CryptoKey
}

interface EncryptedValue {
  ciphertext: string
  iv: string
}

export interface AppSessionContext {
  method: 'opaque' | 'legacy'
  authMode: AuthMode
  user: User
  accessToken: string
  csrfToken: string | null
  sessionVersion: string | null
  sessionId: string | null
}

export interface PublicAppSession {
  authenticated: true
  authMode: AuthMode
  csrfToken: string
  sessionVersion: string
  user: {
    id: string
    email: string | null
  }
}

export interface SessionDependencies {
  admin: SupabaseClient
  createRefreshClient: () => SupabaseClient
  providerFetch?: typeof fetch
  providerUserTimeoutMs?: number
  now: () => number
  random: () => number
  sleep: (milliseconds: number) => Promise<void>
}

function providerFetchForDependencies(
  overrides: Partial<SessionDependencies>,
): typeof fetch {
  if (overrides.providerFetch) return overrides.providerFetch
  if (!overrides.admin) return fetch

  // Dependency-injected tests historically supplied an auth client rather
  // than a fetch implementation. Keep that narrow seam compatible while the
  // production default uses the abortable HTTP boundary below.
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? ''
    const token = authorization.replace(/^Bearer /u, '')
    const result = await overrides.admin?.auth.getUser(token)
    if (result?.error || !result?.data.user) {
      const status = typeof result?.error?.status === 'number'
        ? result.error.status
        : 503
      return new Response(null, {
        status: status >= 200 && status <= 599 ? status : 503,
      })
    }
    return new Response(JSON.stringify(result.data.user), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

function defaultDependencies(
  overrides: Partial<SessionDependencies> = {},
): SessionDependencies {
  return {
    admin: overrides.admin ?? getSupabaseAdmin(),
    createRefreshClient: overrides.createRefreshClient
      ?? createSupabaseRefreshClient,
    providerFetch: providerFetchForDependencies(overrides),
    providerUserTimeoutMs:
      overrides.providerUserTimeoutMs ?? PROVIDER_USER_TIMEOUT_MS,
    now: overrides.now ?? Date.now,
    random: overrides.random ?? Math.random,
    sleep: overrides.sleep
      ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  }
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(new ArrayBuffer(byteLength))
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

function copyToWebCryptoBytes(
  value: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength))
  copy.set(value)
  return copy
}

async function readEncryptionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EncryptionConfiguration> {
  const configured = env.SESSION_ENCRYPTION_KEY
  const match = configured?.match(/^([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{43})$/u)
  if (!match) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_KEY_INVALID',
    )
  }
  const rawKey = copyToWebCryptoBytes(base64UrlToBytes(match[2]))
  if (rawKey.byteLength !== 32) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_KEY_INVALID',
    )
  }
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
  return { version: match[1], key }
}

function additionalData(
  sessionId: string,
  userId: string,
  purpose: 'access' | 'refresh' | 'csrf',
  version: string,
): Uint8Array<ArrayBuffer> {
  return copyToWebCryptoBytes(new TextEncoder().encode(
    `cinnabar-session|${sessionId}|${userId}|${purpose}|${version}`,
  ))
}

async function encryptValue(
  value: string,
  configuration: EncryptionConfiguration,
  sessionId: string,
  userId: string,
  purpose: 'access' | 'refresh' | 'csrf',
): Promise<EncryptedValue> {
  const iv = new Uint8Array(new ArrayBuffer(12))
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: additionalData(sessionId, userId, purpose, configuration.version),
      tagLength: 128,
    },
    configuration.key,
    copyToWebCryptoBytes(new TextEncoder().encode(value)),
  )
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  }
}

async function decryptValue(
  encrypted: EncryptedValue,
  configuration: EncryptionConfiguration,
  sessionId: string,
  userId: string,
  purpose: 'access' | 'refresh' | 'csrf',
): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copyToWebCryptoBytes(base64UrlToBytes(encrypted.iv)),
        additionalData: additionalData(
          sessionId,
          userId,
          purpose,
          configuration.version,
        ),
        tagLength: 128,
      },
      configuration.key,
      copyToWebCryptoBytes(base64UrlToBytes(encrypted.ciphertext)),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION')
  }
}

async function encryptSecrets(
  secrets: SessionSecrets,
  configuration: EncryptionConfiguration,
  sessionId: string,
  userId: string,
): Promise<{
  access: EncryptedValue
  refresh: EncryptedValue
  csrf: EncryptedValue
}> {
  const [access, refresh, csrf] = await Promise.all([
    encryptValue(secrets.accessToken, configuration, sessionId, userId, 'access'),
    encryptValue(secrets.refreshToken, configuration, sessionId, userId, 'refresh'),
    encryptValue(secrets.csrfToken, configuration, sessionId, userId, 'csrf'),
  ])
  return { access, refresh, csrf }
}

async function decryptSecrets(
  row: AppAuthSessionRow,
  configuration: EncryptionConfiguration,
): Promise<SessionSecrets> {
  if (row.encryption_key_version !== configuration.version) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'SESSION_KEY_ROTATED')
  }
  const [accessToken, refreshToken, csrfToken] = await Promise.all([
    decryptValue(
      { ciphertext: row.access_token_ciphertext, iv: row.access_token_iv },
      configuration,
      row.id,
      row.user_id,
      'access',
    ),
    decryptValue(
      { ciphertext: row.refresh_token_ciphertext, iv: row.refresh_token_iv },
      configuration,
      row.id,
      row.user_id,
      'refresh',
    ),
    decryptValue(
      { ciphertext: row.csrf_secret_ciphertext, iv: row.csrf_secret_iv },
      configuration,
      row.id,
      row.user_id,
      'csrf',
    ),
  ])
  if (await sha256Base64Url(csrfToken) !== row.csrf_hash) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION')
  }
  return { accessToken, refreshToken, csrfToken }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REFRESH_UPSTREAM_TIMEOUT_MS,
  requestSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const inputSignal = init?.signal
  const forwardInputAbort = () => controller.abort(inputSignal?.reason)
  const forwardRequestAbort = () => controller.abort(requestSignal?.reason)
  if (inputSignal?.aborted) {
    forwardInputAbort()
  } else {
    inputSignal?.addEventListener('abort', forwardInputAbort, { once: true })
  }
  if (requestSignal?.aborted) {
    forwardRequestAbort()
  } else if (requestSignal && requestSignal !== inputSignal) {
    requestSignal.addEventListener('abort', forwardRequestAbort, { once: true })
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Upstream authentication timed out.', 'TimeoutError'))
  }, timeoutMs)
  const abort = new Promise<never>((_resolve, reject) => {
    const rejectAbort = () => {
      reject(
        controller.signal.reason
        ?? new DOMException('Upstream authentication aborted.', 'AbortError'),
      )
    }
    if (controller.signal.aborted) rejectAbort()
    else controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal: controller.signal }),
      abort,
    ])
  } finally {
    clearTimeout(timer)
    inputSignal?.removeEventListener('abort', forwardInputAbort)
    requestSignal?.removeEventListener('abort', forwardRequestAbort)
  }
}

function providerUserUrl(env: NodeJS.ProcessEnv = process.env): URL {
  const configured = env.VITE_SUPABASE_URL
  if (!configured) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  let base: URL
  try {
    base = new URL(configured)
  } catch {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  const isLocalLoopback = (
    base.hostname === 'localhost'
    || base.hostname === '127.0.0.1'
    || base.hostname === '[::1]'
  )
  if (
    base.username
    || base.password
    || base.pathname !== '/'
    || base.search
    || base.hash
    || !(
      base.protocol === 'https:'
      || (base.protocol === 'http:' && isLocalLoopback)
    )
  ) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  return new URL('/auth/v1/user', base.origin)
}

function invalidProviderUser(): AppAuthError {
  return new AppAuthError(
    'Your session is invalid or expired.',
    401,
    'INVALID_SESSION',
  )
}

function unavailableProviderUser(): AppAuthError {
  return new AppAuthError(
    'Authentication is temporarily unavailable.',
    503,
    'AUTH_UPSTREAM_UNAVAILABLE',
  )
}

/**
 * Validates a provider access token through a bounded request. Provider
 * unavailability must never be confused with an invalid credential: only an
 * explicit 401/403, a null user, or an identity mismatch returns 401.
 */
export async function validateProviderUser(
  req: Request,
  accessToken: string,
  expectedUserId: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = PROVIDER_USER_TIMEOUT_MS,
): Promise<User> {
  const injectedFetch = fetchImpl !== fetch
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? (injectedFetch ? 'dependency-injected' : '')
  if (!publishableKey) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }

  let response: Response
  try {
    const url = process.env.VITE_SUPABASE_URL
      ? providerUserUrl()
      : injectedFetch
        ? new URL('https://dependency-injected.invalid/auth/v1/user')
        : providerUserUrl()
    response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
      fetchImpl,
      timeoutMs,
      req.signal,
    )
  } catch {
    throw unavailableProviderUser()
  }

  if (response.status === 401 || response.status === 403) {
    throw invalidProviderUser()
  }
  if (response.status !== 200) {
    throw unavailableProviderUser()
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw unavailableProviderUser()
  }
  if (body === null) throw invalidProviderUser()
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw unavailableProviderUser()
  }
  const record = body as Record<string, unknown>
  const candidate = 'user' in record ? record.user : record
  if (candidate === null) throw invalidProviderUser()
  if (
    !candidate
    || typeof candidate !== 'object'
    || Array.isArray(candidate)
    || typeof (candidate as Record<string, unknown>).id !== 'string'
    || !(candidate as Record<string, unknown>).id
  ) {
    throw unavailableProviderUser()
  }
  const user = candidate as unknown as User
  if (expectedUserId && user.id !== expectedUserId) {
    throw invalidProviderUser()
  }
  return user
}

function createSupabaseRefreshClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  return createClient(url, publishableKey, {
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function readCookieSid(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((part) => part.slice(SESSION_COOKIE_NAME.length + 1))
  if (matches.length === 0) return null
  if (matches.length !== 1 || !SID_PATTERN.test(matches[0])) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION')
  }
  return matches[0]
}

export function sessionCookie(sid: string): string {
  if (!SID_PATTERN.test(sid)) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'INVALID_COOKIE_VALUE',
    )
  }
  return `${SESSION_COOKIE_NAME}=${sid}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

function requestIdForAudit(req: Request): string | null {
  const supplied = req.headers.get('x-request-id')
  return supplied && /^[A-Za-z0-9_-]{1,64}$/u.test(supplied) ? supplied : null
}

async function recordAuthEvent(
  admin: SupabaseClient,
  req: Request,
  eventType: string,
  sessionId: string | null,
  userId: string | null,
  reason: string | null = null,
): Promise<void> {
  const { error } = await admin.from('app_auth_events').insert({
    session_id: sessionId,
    user_id: userId,
    event_type: eventType,
    reason,
    request_id: requestIdForAudit(req),
  })
  if (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'auth_audit_write_failed',
      error_category: 'auth_audit_write_failed',
    }))
  }
}

async function revokeSession(
  admin: SupabaseClient,
  req: Request,
  row: AppAuthSessionRow,
  reason: string,
  eventType: 'session_rejected' | 'refresh_failed' = 'session_rejected',
): Promise<void> {
  const revokedAt = new Date().toISOString()
  await admin
    .from('app_auth_sessions')
    .update({
      revoked_at: revokedAt,
      revoke_reason: reason,
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      updated_at: revokedAt,
    })
    .eq('id', row.id)
    .eq('version', row.version)
    .is('revoked_at', null)
  await recordAuthEvent(admin, req, eventType, row.id, row.user_id, reason)
}

async function loadRowBySid(
  admin: SupabaseClient,
  sid: string,
): Promise<AppAuthSessionRow | null> {
  const sidHash = await sha256Base64Url(sid)
  const { data, error } = await admin
    .from('app_auth_sessions')
    .select('*')
    .eq('sid_hash', sidHash)
    .maybeSingle()
  if (error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  return data as AppAuthSessionRow | null
}

type ValidatedRefreshSession = Session & { expires_at: number }

function requireRefreshSession(
  session: Session | null,
  expectedUserId: string,
): ValidatedRefreshSession {
  if (
    !session
    || !session.access_token
    || !session.refresh_token
    || session.user.id !== expectedUserId
  ) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'REFRESH_FAILED')
  }
  const expiresAt = session.expires_at
  const expiresAtMs = typeof expiresAt === 'number'
    ? expiresAt * 1_000
    : Number.NaN
  if (
    typeof expiresAt !== 'number'
    || !Number.isFinite(expiresAt)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= 0
    || !Number.isFinite(expiresAtMs)
    || !Number.isSafeInteger(expiresAtMs)
    || !Number.isFinite(new Date(expiresAtMs).getTime())
  ) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'REFRESH_FAILED')
  }
  return { ...session, expires_at: expiresAt }
}

export type RefreshCasState =
  | 'winner'
  | 'owned'
  | 'available'
  | 'contended'
  | 'stale'
  | 'invalid'

export function classifyRefreshCasState(
  row: AppAuthSessionRow | null,
  expectedVersion: number,
  leaseId: string,
  now: number,
): RefreshCasState {
  if (!row || row.revoked_at || row.migration_state !== 'active') return 'invalid'
  if (
    row.refresh_lease_id
    && row.refresh_lease_expires_at
    && Date.parse(row.refresh_lease_expires_at) <= now
  ) {
    return 'stale'
  }
  if (row.version > expectedVersion && !row.refresh_lease_id) return 'winner'
  if (row.version === expectedVersion && row.refresh_lease_id === leaseId) {
    return 'owned'
  }
  if (row.version === expectedVersion && !row.refresh_lease_id) return 'available'
  return 'contended'
}

async function loadRowById(
  admin: SupabaseClient,
  sessionId: string,
): Promise<AppAuthSessionRow | null> {
  const { data, error } = await admin
    .from('app_auth_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  return data as AppAuthSessionRow | null
}

async function revokeOwnedRefresh(
  admin: SupabaseClient,
  req: Request,
  row: AppAuthSessionRow,
  leaseId: string,
  reason: string,
): Promise<boolean> {
  const revokedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('app_auth_sessions')
    .update({
      revoked_at: revokedAt,
      revoke_reason: reason,
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      updated_at: revokedAt,
    })
    .eq('id', row.id)
    .eq('version', row.version)
    .eq('refresh_lease_id', leaseId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  if (!data) return false
  await recordAuthEvent(
    admin,
    req,
    'refresh_failed',
    row.id,
    row.user_id,
    reason,
  )
  return true
}

async function releaseRefreshLease(
  admin: SupabaseClient,
  row: AppAuthSessionRow,
  leaseId: string,
): Promise<boolean> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('app_auth_sessions')
    .update({
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      updated_at: updatedAt,
    })
    .eq('id', row.id)
    .eq('version', row.version)
    .eq('refresh_lease_id', leaseId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  return Boolean(data)
}

type RefreshResolution =
  | { kind: 'winner'; row: AppAuthSessionRow; secrets: SessionSecrets }
  | { kind: 'available'; row: AppAuthSessionRow; secrets: SessionSecrets }

async function waitForConcurrentRefresh(
  req: Request,
  sid: string,
  expectedVersion: number,
  attemptedLeaseId: string,
  dependencies: SessionDependencies,
  configuration: EncryptionConfiguration,
): Promise<RefreshResolution> {
  const deadline = dependencies.now() + REFRESH_WAIT_TIMEOUT_MS
  let attempt = 0
  while (dependencies.now() < deadline) {
    const reloaded = await loadRowBySid(dependencies.admin, sid)
    const state = classifyRefreshCasState(
      reloaded,
      expectedVersion,
      attemptedLeaseId,
      dependencies.now(),
    )
    if (state === 'winner' && reloaded) {
      return {
        kind: 'winner',
        row: reloaded,
        secrets: await decryptSecrets(reloaded, configuration),
      }
    }
    if (state === 'available' && reloaded) {
      return {
        kind: 'available',
        row: reloaded,
        secrets: await decryptSecrets(reloaded, configuration),
      }
    }
    if (state === 'stale' && reloaded?.refresh_lease_id) {
      await revokeOwnedRefresh(
        dependencies.admin,
        req,
        reloaded,
        reloaded.refresh_lease_id,
        'refresh_lease_abandoned',
      )
      throw new AppAuthError(
        'Your session is invalid or expired.',
        401,
        'REFRESH_REAUTH_REQUIRED',
      )
    }
    if (state === 'invalid') {
      throw new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION')
    }
    const exponential = Math.min(
      REFRESH_WAIT_CAP_MS,
      REFRESH_WAIT_BASE_MS * (2 ** Math.min(attempt, 3)),
    )
    const jitter = Math.floor(dependencies.random() * REFRESH_WAIT_BASE_MS)
    const remaining = deadline - dependencies.now()
    await dependencies.sleep(Math.max(1, Math.min(remaining, exponential + jitter)))
    attempt += 1
  }
  await recordAuthEvent(
    dependencies.admin,
    req,
    'session_rejected',
    null,
    null,
    'refresh_busy',
  )
  throw new AppAuthError(
    'Your session is temporarily busy. Please retry.',
    503,
    'SESSION_REFRESH_BUSY',
  )
}

async function resolveRefreshCasFailure(
  req: Request,
  sid: string,
  initialRow: AppAuthSessionRow,
  leaseId: string,
  dependencies: SessionDependencies,
  configuration: EncryptionConfiguration,
): Promise<{ row: AppAuthSessionRow; secrets: SessionSecrets }> {
  // A response can be lost after the database committed. Reload before any
  // revocation so a loser can adopt the winner's advanced version.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const current = await loadRowById(dependencies.admin, initialRow.id)
      const state = classifyRefreshCasState(
        current,
        initialRow.version,
        leaseId,
        dependencies.now(),
      )
      if (state === 'winner' && current) {
        return {
          row: current,
          secrets: await decryptSecrets(current, configuration),
        }
      }
      if (state === 'owned') {
        const revoked = await revokeOwnedRefresh(
          dependencies.admin,
          req,
          initialRow,
          leaseId,
          'refresh_commit_failed',
        )
        if (revoked) {
          throw new AppAuthError(
            'Your session is invalid or expired.',
            401,
            'REFRESH_REAUTH_REQUIRED',
          )
        }
      }
      if (state === 'stale' && current?.refresh_lease_id) {
        const revoked = await revokeOwnedRefresh(
          dependencies.admin,
          req,
          current,
          current.refresh_lease_id,
          'refresh_lease_abandoned',
        )
        if (revoked) {
          throw new AppAuthError(
            'Your session is invalid or expired.',
            401,
            'REFRESH_REAUTH_REQUIRED',
          )
        }
      }
      if (state === 'available' && current) {
        // Provider rotation already succeeded in this request. An unchanged,
        // lease-free row must never reuse the old refresh token. Acquire a
        // quarantine lease at the same version, then revoke through that exact
        // id+version+lease CAS. If another writer advanced first, claim fails
        // and the next reload adopts that winner instead.
        const quarantineLeaseId = crypto.randomUUID()
        const quarantined = await dependencies.admin.rpc(
          'claim_app_auth_session_refresh',
          {
            p_session_id: current.id,
            p_expected_version: initialRow.version,
            p_lease_id: quarantineLeaseId,
          },
        )
        if (!quarantined.error && quarantined.data === true) {
          const revoked = await revokeOwnedRefresh(
            dependencies.admin,
            req,
            current,
            quarantineLeaseId,
            'refresh_commit_uncertain',
          )
          if (revoked) {
            throw new AppAuthError(
              'Your session is invalid or expired.',
              401,
              'REFRESH_REAUTH_REQUIRED',
            )
          }
        }
      }
      if (state === 'invalid') {
        throw new AppAuthError(
          'Your session is invalid or expired.',
          401,
          'INVALID_SESSION',
        )
      }
    } catch (error) {
      if (
        error instanceof AppAuthError
        && error.code !== 'SESSION_STORE_UNAVAILABLE'
      ) {
        throw error
      }
      if (attempt === 2) break
    }
    const jitter = 75 + Math.floor(dependencies.random() * 75)
    await dependencies.sleep(jitter)
  }
  const concurrent = await waitForConcurrentRefresh(
    req,
    sid,
    initialRow.version,
    leaseId,
    dependencies,
    configuration,
  )
  if (concurrent.kind === 'available') {
    const quarantineLeaseId = crypto.randomUUID()
    const quarantined = await dependencies.admin.rpc(
      'claim_app_auth_session_refresh',
      {
        p_session_id: concurrent.row.id,
        p_expected_version: initialRow.version,
        p_lease_id: quarantineLeaseId,
      },
    )
    if (!quarantined.error && quarantined.data === true) {
      await revokeOwnedRefresh(
        dependencies.admin,
        req,
        concurrent.row,
        quarantineLeaseId,
        'refresh_commit_uncertain',
      )
    }
    throw new AppAuthError(
      'Your session is invalid or expired.',
      401,
      'REFRESH_REAUTH_REQUIRED',
    )
  }
  return { row: concurrent.row, secrets: concurrent.secrets }
}

async function failOwnedRefresh(
  req: Request,
  sid: string,
  initialRow: AppAuthSessionRow,
  leaseId: string,
  reason: string,
  dependencies: SessionDependencies,
  configuration: EncryptionConfiguration,
): Promise<{ row: AppAuthSessionRow; secrets: SessionSecrets }> {
  const revoked = await revokeOwnedRefresh(
    dependencies.admin,
    req,
    initialRow,
    leaseId,
    reason,
  )
  if (revoked) {
    throw new AppAuthError(
      'Your session is invalid or expired.',
      401,
      'REFRESH_REAUTH_REQUIRED',
    )
  }
  return resolveRefreshCasFailure(
    req,
    sid,
    initialRow,
    leaseId,
    dependencies,
    configuration,
  )
}

async function refreshAsLeaseOwner(
  req: Request,
  sid: string,
  initialRow: AppAuthSessionRow,
  initialSecrets: SessionSecrets,
  leaseId: string,
  dependencies: SessionDependencies,
  configuration: EncryptionConfiguration,
): Promise<{ row: AppAuthSessionRow; secrets: SessionSecrets }> {
  let refreshed: ValidatedRefreshSession
  try {
    const result = await dependencies.createRefreshClient().auth.refreshSession({
      refresh_token: initialSecrets.refreshToken,
    })
    if (result.error) {
      const status = typeof result.error.status === 'number'
        ? result.error.status
        : 0
      if (status === 400 || status === 401) {
        return failOwnedRefresh(
          req,
          sid,
          initialRow,
          leaseId,
          'refresh_rejected',
          dependencies,
          configuration,
        )
      }
      if (status === 429 || status >= 500) {
        const released = await releaseRefreshLease(
          dependencies.admin,
          initialRow,
          leaseId,
        )
        if (!released) {
          return resolveRefreshCasFailure(
            req,
            sid,
            initialRow,
            leaseId,
            dependencies,
            configuration,
          )
        }
        throw new AppAuthError(
          'Authentication is temporarily unavailable.',
          503,
          'REFRESH_UNAVAILABLE',
        )
      }
      return failOwnedRefresh(
        req,
        sid,
        initialRow,
        leaseId,
        'refresh_outcome_unknown',
        dependencies,
        configuration,
      )
    }
    try {
      refreshed = requireRefreshSession(result.data.session, initialRow.user_id)
    } catch {
      return failOwnedRefresh(
        req,
        sid,
        initialRow,
        leaseId,
        'refresh_response_invalid',
        dependencies,
        configuration,
      )
    }
  } catch (error) {
    if (error instanceof AppAuthError) throw error
    // A timeout/transport failure is an unknown provider outcome. Replaying
    // the same refresh token would be unsafe, so revoke only if this request
    // still owns the exact version+lease.
    return failOwnedRefresh(
      req,
      sid,
      initialRow,
      leaseId,
      'refresh_outcome_unknown',
      dependencies,
      configuration,
    )
  }

  const csrfToken = initialSecrets.csrfToken
  let encrypted: Awaited<ReturnType<typeof encryptSecrets>>
  try {
    encrypted = await encryptSecrets(
      {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        csrfToken,
      },
      configuration,
      initialRow.id,
      initialRow.user_id,
    )
  } catch {
    return failOwnedRefresh(
      req,
      sid,
      initialRow,
      leaseId,
      'refresh_encrypt_failed',
      dependencies,
      configuration,
    )
  }
  let row: AppAuthSessionRow | null = null
  for (let attempt = 0; attempt < 3 && !row; attempt += 1) {
    const completedAt = new Date(dependencies.now()).toISOString()
    const committed = await dependencies.admin
      .from('app_auth_sessions')
      .update({
        access_token_ciphertext: encrypted.access.ciphertext,
        access_token_iv: encrypted.access.iv,
        refresh_token_ciphertext: encrypted.refresh.ciphertext,
        refresh_token_iv: encrypted.refresh.iv,
        token_expires_at: new Date(refreshed.expires_at * 1_000).toISOString(),
        refresh_lease_id: null,
        refresh_lease_expires_at: null,
        version: initialRow.version + 1,
        last_seen_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', initialRow.id)
      .eq('version', initialRow.version)
      .eq('refresh_lease_id', leaseId)
      .gt('refresh_lease_expires_at', completedAt)
      .is('revoked_at', null)
      .select('*')
      .maybeSingle()
    if (!committed.error && committed.data) {
      row = committed.data as AppAuthSessionRow
      break
    }
    if (attempt < 2) {
      try {
        const current = await loadRowById(dependencies.admin, initialRow.id)
        const state = classifyRefreshCasState(
          current,
          initialRow.version,
          leaseId,
          dependencies.now(),
        )
        if (state === 'winner' && current) {
          return {
            row: current,
            secrets: await decryptSecrets(current, configuration),
          }
        }
        if (state !== 'owned') break
      } catch {
        // The exact CAS commit is safe to retry while the lease remains ours.
      }
      await dependencies.sleep(75 + Math.floor(dependencies.random() * 75))
    }
  }
  if (!row) {
    return resolveRefreshCasFailure(
      req,
      sid,
      initialRow,
      leaseId,
      dependencies,
      configuration,
    )
  }
  await recordAuthEvent(
    dependencies.admin,
    req,
    'session_refreshed',
    row.id,
    row.user_id,
  )
  return {
    row,
    secrets: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      csrfToken,
    },
  }
}

export async function refreshIfNeeded(
  req: Request,
  sid: string,
  initialRow: AppAuthSessionRow,
  initialSecrets: SessionSecrets,
  dependencies: SessionDependencies,
  configuration: EncryptionConfiguration,
): Promise<{ row: AppAuthSessionRow; secrets: SessionSecrets }> {
  let row = initialRow
  let secrets = initialSecrets
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    if (Date.parse(row.token_expires_at) > dependencies.now() + REFRESH_EARLY_MS) {
      return { row, secrets }
    }
    const leaseId = crypto.randomUUID()
    const claimed = await dependencies.admin.rpc('claim_app_auth_session_refresh', {
      p_session_id: row.id,
      p_expected_version: row.version,
      p_lease_id: leaseId,
    })
    if (claimed.error) {
      throw new AppAuthError(
        'Authentication is temporarily unavailable.',
        503,
        'SESSION_STORE_UNAVAILABLE',
      )
    }
    if (claimed.data === true) {
      return refreshAsLeaseOwner(
        req,
        sid,
        row,
        secrets,
        leaseId,
        dependencies,
        configuration,
      )
    }
    const concurrent = await waitForConcurrentRefresh(
      req,
      sid,
      row.version,
      leaseId,
      dependencies,
      configuration,
    )
    if (concurrent.kind === 'winner') {
      return { row: concurrent.row, secrets: concurrent.secrets }
    }
    row = concurrent.row
    secrets = concurrent.secrets
  }
  throw new AppAuthError(
    'Your session is temporarily busy. Please retry.',
    503,
    'SESSION_REFRESH_BUSY',
  )
}

async function loadOpaqueContext(
  req: Request,
  sid: string,
  authMode: AuthMode,
  dependencies: SessionDependencies,
): Promise<AppSessionContext> {
  const now = dependencies.now()
  const loadedRow = await loadRowBySid(dependencies.admin, sid)
  if (
    !loadedRow
    || loadedRow.revoked_at
    || loadedRow.migration_state !== 'active'
  ) {
    throw new AppAuthError('Your session is invalid or expired.', 401, 'INVALID_SESSION')
  }
  if (
    Date.parse(loadedRow.absolute_expires_at) <= now
    || Date.parse(loadedRow.last_seen_at) + SESSION_IDLE_TIMEOUT_MS <= now
  ) {
    await revokeSession(dependencies.admin, req, loadedRow, 'expired')
    throw new AppAuthError('Your session is invalid or expired.', 401, 'SESSION_EXPIRED')
  }
  const row = loadedRow
  const configuration = await readEncryptionConfiguration()
  let secrets: SessionSecrets
  try {
    secrets = await decryptSecrets(row, configuration)
  } catch (error) {
    await revokeSession(dependencies.admin, req, row, 'decrypt_failed')
    throw error
  }
  const refreshed = await refreshIfNeeded(
    req,
    sid,
    row,
    secrets,
    dependencies,
    configuration,
  )
  let verifiedUser: User
  try {
    verifiedUser = await validateProviderUser(
      req,
      refreshed.secrets.accessToken,
      refreshed.row.user_id,
      dependencies.providerFetch ?? fetch,
      dependencies.providerUserTimeoutMs ?? PROVIDER_USER_TIMEOUT_MS,
    )
  } catch (error) {
    if (error instanceof AppAuthError && error.status === 401) {
      await revokeSession(
        dependencies.admin,
        req,
        refreshed.row,
        'token_invalid',
      )
    }
    throw error
  }

  const lastSeen = Date.parse(refreshed.row.last_seen_at)
  if (lastSeen + LAST_SEEN_WRITE_INTERVAL_MS <= dependencies.now()) {
    const seenAt = new Date(dependencies.now()).toISOString()
    await dependencies.admin
      .from('app_auth_sessions')
      .update({ last_seen_at: seenAt, updated_at: seenAt })
      .eq('id', refreshed.row.id)
      .eq('version', refreshed.row.version)
      .is('revoked_at', null)
  }

  return {
    method: 'opaque',
    authMode,
    user: verifiedUser,
    accessToken: refreshed.secrets.accessToken,
    csrfToken: refreshed.secrets.csrfToken,
    sessionVersion: refreshed.row.id,
    sessionId: refreshed.row.id,
  }
}

async function validateBearerIdentity(
  req: Request,
  token: string,
  fetchImpl: typeof fetch,
): Promise<User> {
  return validateProviderUser(req, token, null, fetchImpl)
}

export async function authenticateAppRequest(
  req: Request,
  options: {
      allowLegacy?: boolean
      requireCsrf?: boolean
    } = {},
  dependencyOverrides: Partial<SessionDependencies> = {},
): Promise<AppSessionContext> {
  const dependencies = defaultDependencies(dependencyOverrides)
  const authMode = readAuthMode()
  const sid = readCookieSid(req)
  const bearer = readOptionalBearerToken(req)

  if (sid) {
    const context = await loadOpaqueContext(req, sid, authMode, dependencies)
    if (authMode === 'dual' && bearer) {
      const bearerUser = await validateBearerIdentity(
        req,
        bearer,
        dependencies.providerFetch ?? fetch,
      )
      if (bearerUser.id !== context.user.id) {
        await recordAuthEvent(
          dependencies.admin,
          req,
          'identity_conflict',
          context.sessionId,
          context.user.id,
          'bearer_cookie_mismatch',
        )
        throw new AppAuthError(
          'Conflicting authentication credentials.',
          409,
          'IDENTITY_CONFLICT',
        )
      }
    }
    if (options.requireCsrf) {
      requirePostRequestGuards(req, context.csrfToken as string)
    }
    return context
  }

  if (authMode !== 'opaque' && options.allowLegacy !== false && bearer) {
    if (options.requireCsrf) {
      throw new AppAuthError(
        'Migrate your session before this action.',
        403,
        'OPAQUE_SESSION_REQUIRED',
      )
    }
    const user = await validateBearerIdentity(
      req,
      bearer,
      dependencies.providerFetch ?? fetch,
    )
    return {
      method: 'legacy',
      authMode,
      user,
      accessToken: bearer,
      csrfToken: null,
      sessionVersion: null,
      sessionId: null,
    }
  }

  throw new AppAuthError('Sign in is required.', 401, 'AUTHENTICATION_REQUIRED')
}

export function publicSession(context: AppSessionContext): PublicAppSession {
  if (
    context.method !== 'opaque'
    || !context.csrfToken
    || !context.sessionVersion
  ) {
    throw new AppAuthError(
      'Migrate your session before continuing.',
      401,
      'OPAQUE_SESSION_REQUIRED',
    )
  }
  return {
    authenticated: true,
    authMode: context.authMode,
    csrfToken: context.csrfToken,
    sessionVersion: context.sessionVersion,
    user: {
      id: context.user.id,
      email: context.user.email ?? null,
    },
  }
}

async function revokePendingMigration(
  dependencies: SessionDependencies,
  req: Request,
  row: AppAuthSessionRow,
  leaseId: string,
  reason: string,
  eventType: 'migration_failed' | 'migration_reauth_required',
): Promise<boolean> {
  const revokedAt = new Date(dependencies.now()).toISOString()
  const { data, error } = await dependencies.admin
    .from('app_auth_sessions')
    .update({
      revoked_at: revokedAt,
      revoke_reason: reason,
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      updated_at: revokedAt,
    })
    .eq('id', row.id)
    .eq('version', row.version)
    .eq('refresh_lease_id', leaseId)
    .eq('migration_state', 'pending')
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error || !data) return false
  await recordAuthEvent(
    dependencies.admin,
    req,
    eventType,
    row.id,
    row.user_id,
    reason,
  )
  return true
}

/**
 * Establishes an active application session from a Session returned directly
 * by Supabase's server-side PKCE code exchange. Unlike the legacy migration
 * path, this must not refresh the newly issued token pair before committing it.
 */
export async function createOpaqueSessionFromTrustedSupabaseSession(
  req: Request,
  trustedSession: Session,
  dependencyOverrides: Partial<SessionDependencies> = {},
): Promise<{ context: AppSessionContext; sid: string }> {
  const authMode = readAuthMode()
  if (authMode === 'legacy') {
    throw new AppAuthError(
      'Server-managed sign-in is not enabled.',
      503,
      'SERVER_LOGIN_DISABLED',
    )
  }
  if (
    !trustedSession.access_token
    || trustedSession.access_token.length > MAX_ACCESS_TOKEN_LENGTH
    || !trustedSession.refresh_token
    || trustedSession.refresh_token.length > MAX_REFRESH_TOKEN_LENGTH
    || !trustedSession.user?.id
    || typeof trustedSession.expires_at !== 'number'
    || !Number.isSafeInteger(trustedSession.expires_at)
  ) {
    throw new AppAuthError(
      'Authentication could not be completed.',
      401,
      'LOGIN_FAILED',
    )
  }

  const dependencies: SessionDependencies = {
    admin: dependencyOverrides.admin ?? getSupabaseAdmin(),
    createRefreshClient: dependencyOverrides.createRefreshClient
      ?? createSupabaseRefreshClient,
    providerFetch: providerFetchForDependencies(dependencyOverrides),
    providerUserTimeoutMs:
      dependencyOverrides.providerUserTimeoutMs ?? PROVIDER_USER_TIMEOUT_MS,
    now: dependencyOverrides.now ?? Date.now,
    random: dependencyOverrides.random ?? Math.random,
    sleep: dependencyOverrides.sleep
      ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  }
  const createdAtMs = dependencies.now()
  if (trustedSession.expires_at * 1_000 <= createdAtMs) {
    throw new AppAuthError(
      'Authentication could not be completed.',
      401,
      'LOGIN_FAILED',
    )
  }
  const existingSid = readCookieSid(req)
  if (existingSid) {
    const existing = await loadOpaqueContext(
      req,
      existingSid,
      authMode,
      dependencies,
    )
    let newProviderSessionRevoked = true
    try {
      const revoked = await dependencies.admin.auth.admin.signOut(
        trustedSession.access_token,
        'local',
      )
      const status = revoked.error?.status
      newProviderSessionRevoked = (
        !revoked.error
        || status === 401
        || status === 403
        || status === 404
      )
    } catch {
      newProviderSessionRevoked = false
    }
    if (!newProviderSessionRevoked) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'auth_redundant_provider_session_revoke_failed',
        error_category: 'auth_redundant_provider_session_revoke_failed',
      }))
    }
    if (existing.user.id !== trustedSession.user.id) {
      await recordAuthEvent(
        dependencies.admin,
        req,
        'identity_conflict',
        existing.sessionId,
        existing.user.id,
        'pkce_cookie_mismatch',
      )
      throw new AppAuthError(
        'Conflicting authentication credentials.',
        409,
        'IDENTITY_CONFLICT',
      )
    }
    await recordAuthEvent(
      dependencies.admin,
      req,
      'session_authenticated',
      existing.sessionId,
      existing.user.id,
      'server_pkce_existing',
    )
    return { context: existing, sid: existingSid }
  }
  const configuration = await readEncryptionConfiguration()
  const sessionId = crypto.randomUUID()
  const sid = randomBase64Url(32)
  const csrfToken = randomBase64Url(32)
  const createdAt = new Date(createdAtMs).toISOString()
  const encrypted = await encryptSecrets(
    {
      accessToken: trustedSession.access_token,
      refreshToken: trustedSession.refresh_token,
      csrfToken,
    },
    configuration,
    sessionId,
    trustedSession.user.id,
  )
  const row: AppAuthSessionRow = {
    id: sessionId,
    sid_hash: await sha256Base64Url(sid),
    user_id: trustedSession.user.id,
    migration_state: 'active',
    migration_token_hash: null,
    encryption_key_version: configuration.version,
    access_token_ciphertext: encrypted.access.ciphertext,
    access_token_iv: encrypted.access.iv,
    refresh_token_ciphertext: encrypted.refresh.ciphertext,
    refresh_token_iv: encrypted.refresh.iv,
    token_expires_at: new Date(trustedSession.expires_at * 1_000).toISOString(),
    csrf_hash: await sha256Base64Url(csrfToken),
    csrf_secret_ciphertext: encrypted.csrf.ciphertext,
    csrf_secret_iv: encrypted.csrf.iv,
    last_seen_at: createdAt,
    absolute_expires_at: new Date(
      createdAtMs + SESSION_ABSOLUTE_TIMEOUT_MS,
    ).toISOString(),
    revoked_at: null,
    revoke_reason: null,
    refresh_lease_id: null,
    refresh_lease_expires_at: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
  }
  const inserted = await dependencies.admin
    .from('app_auth_sessions')
    .insert(row)
  if (inserted.error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  await recordAuthEvent(
    dependencies.admin,
    req,
    'session_authenticated',
    sessionId,
    trustedSession.user.id,
    'server_pkce_login',
  )
  return {
    sid,
    context: {
      method: 'opaque',
      authMode,
      user: trustedSession.user,
      accessToken: trustedSession.access_token,
      csrfToken,
      sessionVersion: sessionId,
      sessionId,
    },
  }
}

export async function createOpaqueSessionFromLegacy(
  req: Request,
  accessToken: string,
  refreshToken: string,
  dependencyOverrides: Partial<SessionDependencies> = {},
): Promise<{ context: AppSessionContext; sid: string }> {
  if (!refreshToken || refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
    throw new AppAuthError('A valid session is required.', 401, 'INVALID_SESSION')
  }
  const authMode = readAuthMode()
  if (authMode === 'legacy') {
    throw new AppAuthError(
      'Session migration is not enabled.',
      503,
      'MIGRATION_DISABLED',
    )
  }
  const dependencies: SessionDependencies = {
    admin: dependencyOverrides.admin ?? getSupabaseAdmin(),
    createRefreshClient: dependencyOverrides.createRefreshClient
      ?? createSupabaseRefreshClient,
    providerFetch: providerFetchForDependencies(dependencyOverrides),
    providerUserTimeoutMs:
      dependencyOverrides.providerUserTimeoutMs ?? PROVIDER_USER_TIMEOUT_MS,
    now: dependencyOverrides.now ?? Date.now,
    random: dependencyOverrides.random ?? Math.random,
    sleep: dependencyOverrides.sleep
      ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  }
  let legacyUser: User
  try {
    legacyUser = await validateBearerIdentity(
      req,
      accessToken,
      dependencies.providerFetch ?? fetch,
    )
  } catch (error) {
    await recordAuthEvent(
      dependencies.admin,
      req,
      'migration_failed',
      null,
      null,
      'bearer_rejected',
    )
    throw error
  }
  const existingSid = readCookieSid(req)
  if (existingSid) {
    const existing = await loadOpaqueContext(
      req,
      existingSid,
      authMode,
      dependencies,
    )
    if (existing.user.id !== legacyUser.id) {
      await recordAuthEvent(
        dependencies.admin,
        req,
        'identity_conflict',
        existing.sessionId,
        existing.user.id,
        'migration_cookie_mismatch',
      )
      throw new AppAuthError(
        'Conflicting authentication credentials.',
        409,
        'IDENTITY_CONFLICT',
      )
    }
    return { context: existing, sid: existingSid }
  }

  const configuration = await readEncryptionConfiguration()
  const migrationTokenHash = await sha256Base64Url(refreshToken)
  const pendingLookup = await dependencies.admin
    .from('app_auth_sessions')
    .select('id')
    .eq('user_id', legacyUser.id)
    .eq('migration_token_hash', migrationTokenHash)
    .eq('migration_state', 'pending')
    .is('revoked_at', null)
    .maybeSingle()
  if (pendingLookup.error) {
    throw new AppAuthError(
      'Authentication migration is temporarily unavailable.',
      503,
      'MIGRATION_RETRYABLE',
    )
  }
  if (pendingLookup.data) {
    await recordAuthEvent(
      dependencies.admin,
      req,
      'migration_reauth_required',
      null,
      legacyUser.id,
      'pending_attempt_exists',
    )
    throw new AppAuthError(
      'Your previous migration outcome is uncertain. Please sign in again.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    )
  }

  const sessionId = crypto.randomUUID()
  const sid = randomBase64Url(32)
  const csrfToken = randomBase64Url(32)
  const migrationLeaseId = crypto.randomUUID()
  const createdAtMs = dependencies.now()
  const createdAt = new Date(createdAtMs).toISOString()
  const pendingEncrypted = await encryptSecrets(
    {
      accessToken,
      refreshToken,
      csrfToken,
    },
    configuration,
    sessionId,
    legacyUser.id,
  )
  const row: AppAuthSessionRow = {
    id: sessionId,
    sid_hash: await sha256Base64Url(sid),
    user_id: legacyUser.id,
    migration_state: 'pending',
    migration_token_hash: migrationTokenHash,
    encryption_key_version: configuration.version,
    access_token_ciphertext: pendingEncrypted.access.ciphertext,
    access_token_iv: pendingEncrypted.access.iv,
    refresh_token_ciphertext: pendingEncrypted.refresh.ciphertext,
    refresh_token_iv: pendingEncrypted.refresh.iv,
    token_expires_at: new Date(createdAtMs + PENDING_MIGRATION_TIMEOUT_MS).toISOString(),
    csrf_hash: await sha256Base64Url(csrfToken),
    csrf_secret_ciphertext: pendingEncrypted.csrf.ciphertext,
    csrf_secret_iv: pendingEncrypted.csrf.iv,
    last_seen_at: createdAt,
    absolute_expires_at: new Date(
      createdAtMs + PENDING_MIGRATION_TIMEOUT_MS,
    ).toISOString(),
    revoked_at: null,
    revoke_reason: null,
    refresh_lease_id: migrationLeaseId,
    refresh_lease_expires_at: new Date(createdAtMs + REFRESH_LEASE_MS).toISOString(),
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
  }
  const inserted = await dependencies.admin.from('app_auth_sessions').insert(row)
  if (inserted.error) {
    const isPendingConflict = (
      'code' in inserted.error
      && inserted.error.code === '23505'
    )
    let safeToRetry = false
    if (!isPendingConflict) {
      try {
        const uncertainRow = await loadRowById(dependencies.admin, row.id)
        safeToRetry = !uncertainRow || await revokePendingMigration(
          dependencies,
          req,
          row,
          migrationLeaseId,
          'migration_pre_rotation_cleanup',
          'migration_failed',
        )
      } catch {
        safeToRetry = false
      }
    }
    throw new AppAuthError(
      isPendingConflict || !safeToRetry
        ? 'Your previous migration outcome is uncertain. Please sign in again.'
        : 'Authentication migration is temporarily unavailable.',
      isPendingConflict || !safeToRetry ? 401 : 503,
      isPendingConflict || !safeToRetry
        ? 'MIGRATION_REAUTH_REQUIRED'
        : 'MIGRATION_RETRYABLE',
    )
  }
  await recordAuthEvent(
    dependencies.admin,
    req,
    'migration_started',
    sessionId,
    legacyUser.id,
  )

  let refreshClient: SupabaseClient
  try {
    refreshClient = dependencies.createRefreshClient()
  } catch {
    const cleaned = await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      'migration_provider_unavailable',
      'migration_failed',
    )
    throw new AppAuthError(
      cleaned
        ? 'Authentication migration is temporarily unavailable.'
        : 'Your previous migration outcome is uncertain. Please sign in again.',
      cleaned ? 503 : 401,
      cleaned ? 'MIGRATION_RETRYABLE' : 'MIGRATION_REAUTH_REQUIRED',
    )
  }

  let refreshedResult: Awaited<ReturnType<typeof refreshClient.auth.refreshSession>>
  try {
    refreshedResult = await refreshClient.auth.refreshSession({
      refresh_token: refreshToken,
    })
  } catch {
    await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      'migration_outcome_unknown',
      'migration_reauth_required',
    )
    throw new AppAuthError(
      'Your migration outcome is uncertain. Please sign in again.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    )
  }
  if (refreshedResult.error) {
    const status = typeof refreshedResult.error.status === 'number'
      ? refreshedResult.error.status
      : 0
    const retryable = status === 429 || status >= 500
    const cleaned = await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      retryable ? 'migration_provider_retryable' : 'migration_refresh_rejected',
      retryable ? 'migration_failed' : 'migration_reauth_required',
    )
    const canRetry = retryable && cleaned
    throw new AppAuthError(
      canRetry
        ? 'Authentication migration is temporarily unavailable.'
        : 'Your session could not be migrated. Please sign in again.',
      canRetry ? 503 : 401,
      canRetry ? 'MIGRATION_RETRYABLE' : 'MIGRATION_REAUTH_REQUIRED',
    )
  }

  let refreshed: ValidatedRefreshSession
  try {
    refreshed = requireRefreshSession(
      refreshedResult.data.session,
      legacyUser.id,
    )
  } catch {
    await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      'migration_response_invalid',
      'migration_reauth_required',
    )
    throw new AppAuthError(
      'Your migration outcome is uncertain. Please sign in again.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    )
  }
  let activeEncrypted: Awaited<ReturnType<typeof encryptSecrets>>
  try {
    activeEncrypted = await encryptSecrets(
      {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        csrfToken,
      },
      configuration,
      sessionId,
      legacyUser.id,
    )
  } catch {
    await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      'migration_encrypt_failed',
      'migration_reauth_required',
    )
    throw new AppAuthError(
      'Your migration outcome is uncertain. Please sign in again.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    )
  }

  let committedRow: AppAuthSessionRow | null = null
  for (let attempt = 0; attempt < 3 && !committedRow; attempt += 1) {
    const committedAtMs = dependencies.now()
    const committedAt = new Date(committedAtMs).toISOString()
    const committed = await dependencies.admin
      .from('app_auth_sessions')
      .update({
        migration_state: 'active',
        migration_token_hash: null,
        access_token_ciphertext: activeEncrypted.access.ciphertext,
        access_token_iv: activeEncrypted.access.iv,
        refresh_token_ciphertext: activeEncrypted.refresh.ciphertext,
        refresh_token_iv: activeEncrypted.refresh.iv,
        token_expires_at: new Date(refreshed.expires_at * 1_000).toISOString(),
        absolute_expires_at: new Date(
          committedAtMs + SESSION_ABSOLUTE_TIMEOUT_MS,
        ).toISOString(),
        refresh_lease_id: null,
        refresh_lease_expires_at: null,
        version: row.version + 1,
        last_seen_at: committedAt,
        updated_at: committedAt,
      })
      .eq('id', row.id)
      .eq('version', row.version)
      .eq('refresh_lease_id', migrationLeaseId)
      .eq('migration_state', 'pending')
      .gt('refresh_lease_expires_at', committedAt)
      .is('revoked_at', null)
      .select('*')
      .maybeSingle()
    if (!committed.error && committed.data) {
      committedRow = committed.data as AppAuthSessionRow
      break
    }
    try {
      const current = await loadRowById(dependencies.admin, row.id)
      if (
        current
        && !current.revoked_at
        && current.migration_state === 'active'
        && current.version > row.version
        && current.sid_hash === row.sid_hash
      ) {
        committedRow = current
        break
      }
    } catch {
      // Retry the exact pending id+version+lease commit below.
    }
    if (attempt < 2) {
      await dependencies.sleep(75 + Math.floor(dependencies.random() * 75))
    }
  }
  if (!committedRow) {
    await revokePendingMigration(
      dependencies,
      req,
      row,
      migrationLeaseId,
      'migration_commit_failed',
      'migration_reauth_required',
    )
    throw new AppAuthError(
      'Your migration outcome is uncertain. Please sign in again.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    )
  }

  const committedSecrets = await decryptSecrets(committedRow, configuration)
  await recordAuthEvent(
    dependencies.admin,
    req,
    'migration_succeeded',
    sessionId,
    legacyUser.id,
  )
  return {
    sid,
    context: {
      method: 'opaque',
      authMode,
      user: refreshed.user,
      accessToken: committedSecrets.accessToken,
      csrfToken: committedSecrets.csrfToken,
      sessionVersion: sessionId,
      sessionId,
    },
  }
}

export async function revokeOpaqueSession(
  req: Request,
  context: AppSessionContext,
): Promise<void> {
  if (!context.sessionId) {
    throw new AppAuthError(
      'An opaque session is required.',
      401,
      'OPAQUE_SESSION_REQUIRED',
    )
  }
  const admin = getSupabaseAdmin()
  const revokedAt = new Date().toISOString()
  const { error } = await admin
    .from('app_auth_sessions')
    .update({
      revoked_at: revokedAt,
      revoke_reason: 'logout',
      refresh_lease_id: null,
      refresh_lease_expires_at: null,
      updated_at: revokedAt,
    })
    .eq('id', context.sessionId)
    .is('revoked_at', null)
  if (error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_STORE_UNAVAILABLE',
    )
  }
  let upstreamRevoked = true
  try {
    const upstream = await admin.auth.admin.signOut(context.accessToken, 'local')
    const status = upstream.error?.status
    upstreamRevoked = (
      !upstream.error
      || status === 401
      || status === 403
      || status === 404
    )
  } catch {
    upstreamRevoked = false
  }
  if (!upstreamRevoked) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'auth_upstream_logout_failed',
      error_category: 'auth_upstream_logout_failed',
    }))
  }
  await recordAuthEvent(
    admin,
    req,
    'logout',
    context.sessionId,
    context.user.id,
    upstreamRevoked ? 'user_requested' : 'user_requested_upstream_failed',
  )
}
