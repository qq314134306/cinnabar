/**
 * [INPUT]: Same-origin login starts and Supabase PKCE callback codes
 * [OUTPUT]: One-use login transactions, opaque flow cookies, and trusted Sessions
 * [POS]: SERVER-ONLY PKCE authority; verifier and provider tokens never reach browser JS
 *
 * Threat model: the random HttpOnly cookie selects a server-side transaction
 * containing an AES-GCM encrypted PKCE verifier. Callback claims that row by
 * hash before contacting Supabase, so replay and concurrent callbacks fail
 * locally. Supabase owns the Google OAuth state/nonce and ID-token validation;
 * this layer does not invent parallel protocol values. Exact redirect
 * construction prevents open redirects. No vendor error, token, verifier,
 * email, or cookie value is logged.
 */

import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { AppAuthError, readAuthMode } from './_auth'
import { fetchWithTimeout } from './_app-session'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  constantTimeEqual,
  readAppOrigin,
  requirePostRequestMetadata,
  sha256Base64Url,
} from './_csrf'
import { getSupabaseAdmin } from './_supabase-admin'

export const LOGIN_FLOW_COOKIE_NAME = '__Host-cinnabar_auth_flow'
export const EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS = 60 * 60
export const OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS = 10 * 60
export const LOGIN_CSRF_COOKIE_NAME = '__Host-cinnabar_login_csrf'
export const LOGIN_CSRF_MAX_AGE_SECONDS = 10 * 60
export const LOGIN_CALLBACK_PATH = '/api/auth/callback'
export const PKCE_STORAGE_KEY = 'cinnabar-server-pkce'

const MAX_COOKIE_HEADER_LENGTH = 8_192
const MAX_EMAIL_LENGTH = 254
const MAX_AUTH_CODE_LENGTH = 2_048
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u
const EMAIL_OTP_PATTERN = /^\d{6}$/u
const EMAIL_TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u

export type LoginFlowType = 'email' | 'oauth'

export interface AppAuthLoginTransactionRow {
  handle_hash: string
  flow_type: LoginFlowType
  encryption_key_version: string
  verifier_ciphertext: string
  verifier_iv: string
  callback_url: string
  created_at: string
  expires_at: string
  claimed_at: string | null
}

interface EncryptionConfiguration {
  version: string
  key: CryptoKey
}

interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface LoginDependencies {
  admin: SupabaseClient
  fetchImpl: typeof fetch
  now: () => number
}

export interface StartedLogin {
  flowCookie: string
}

export interface StartedOAuthLogin extends StartedLogin {
  url: string
}

export type EmailVerificationCredentials =
  | {
      email: string
      token: string
      type: 'email'
    }
  | {
      token_hash: string
      type: 'email'
    }

interface RequestStorageOptions {
  initial?: Readonly<Record<string, string>>
  onVerifier?: (verifier: string) => Promise<void>
}

class RequestMemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>()
  private readonly onVerifier?: (verifier: string) => Promise<void>
  private verifierWritten = false

  constructor(options: RequestStorageOptions = {}) {
    for (const [key, value] of Object.entries(options.initial ?? {})) {
      this.values.set(key, JSON.stringify(value))
    }
    this.onVerifier = options.onVerifier
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  async setItem(key: string, value: string): Promise<void> {
    if (key === `${PKCE_STORAGE_KEY}-code-verifier` && this.onVerifier) {
      let verifier: unknown
      try {
        verifier = JSON.parse(value)
      } catch {
        verifier = null
      }
      if (
        this.verifierWritten
        || typeof verifier !== 'string'
        || !VERIFIER_PATTERN.test(verifier)
      ) {
        throw new AppAuthError(
          'Authentication is temporarily unavailable.',
          503,
          'PKCE_VERIFIER_INVALID',
        )
      }
      await this.onVerifier(verifier)
      this.verifierWritten = true
    }
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

function defaultDependencies(): LoginDependencies {
  return {
    admin: getSupabaseAdmin(),
    fetchImpl: fetch,
    now: Date.now,
  }
}

function withDependencies(
  overrides: Partial<LoginDependencies>,
): LoginDependencies {
  return {
    admin: overrides.admin ?? getSupabaseAdmin(),
    fetchImpl: overrides.fetchImpl ?? fetch,
    now: overrides.now ?? Date.now,
  }
}

function requireServerLoginMode(): void {
  if (readAuthMode() === 'legacy') {
    throw new AppAuthError(
      'Server-managed sign-in is not enabled.',
      503,
      'SERVER_LOGIN_DISABLED',
    )
  }
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

async function readEncryptionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EncryptionConfiguration> {
  const match = env.SESSION_ENCRYPTION_KEY
    ?.match(/^([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{43})$/u)
  if (!match) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_KEY_INVALID',
    )
  }
  const rawKey = base64UrlToBytes(match[2])
  if (rawKey.byteLength !== 32) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SESSION_KEY_INVALID',
    )
  }
  return {
    version: match[1],
    key: await crypto.subtle.importKey(
      'raw',
      ownedArrayBuffer(rawKey),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    ),
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function transactionAdditionalData(
  row: Pick<
    AppAuthLoginTransactionRow,
    'handle_hash' | 'flow_type' | 'callback_url' | 'encryption_key_version'
  >,
): Uint8Array {
  return new TextEncoder().encode(
    [
      'cinnabar-login-transaction',
      'v1',
      row.handle_hash,
      row.flow_type,
      row.callback_url,
      row.encryption_key_version,
    ].join('|'),
  )
}

async function encryptVerifier(
  verifier: string,
  configuration: EncryptionConfiguration,
  binding: Pick<
    AppAuthLoginTransactionRow,
    'handle_hash' | 'flow_type' | 'callback_url'
  >,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ownedArrayBuffer(iv),
      additionalData: ownedArrayBuffer(
        transactionAdditionalData({
          ...binding,
          encryption_key_version: configuration.version,
        }),
      ),
      tagLength: 128,
    },
    configuration.key,
    ownedArrayBuffer(new TextEncoder().encode(verifier)),
  )
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  }
}

async function decryptVerifier(
  row: AppAuthLoginTransactionRow,
): Promise<string> {
  const configuration = await readEncryptionConfiguration()
  if (row.encryption_key_version !== configuration.version) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ownedArrayBuffer(base64UrlToBytes(row.verifier_iv)),
        additionalData: ownedArrayBuffer(transactionAdditionalData(row)),
        tagLength: 128,
      },
      configuration.key,
      ownedArrayBuffer(base64UrlToBytes(row.verifier_ciphertext)),
    )
  } catch {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  const verifier = new TextDecoder().decode(plaintext)
  if (!VERIFIER_PATTERN.test(verifier)) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  return verifier
}

function createPkceClient(
  storage: RequestMemoryStorage,
  fetchImpl: typeof fetch,
): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  expectedSupabaseAuthorizeUrl()
  const client = createClient(url, publishableKey, {
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init, fetchImpl),
    },
    auth: {
      flowType: 'pkce',
      // auth-js 2.110.7 uses the supplied request-local storage only when this
      // is true. The Map never leaves this request and is cleared in finally.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
      storage,
      storageKey: PKCE_STORAGE_KEY,
    },
  })
  return client
}

export function loginCallbackUrl(): string {
  return new URL(LOGIN_CALLBACK_PATH, `${readAppOrigin()}/`).toString()
}

export function requireExactCallbackRequest(req: Request): void {
  let requestUrl: URL
  try {
    requestUrl = new URL(req.url)
  } catch {
    throw new AppAuthError(
      'Authentication could not be completed.',
      400,
      'LOGIN_CALLBACK_INVALID',
    )
  }
  if (
    requestUrl.origin !== readAppOrigin()
    || requestUrl.pathname !== LOGIN_CALLBACK_PATH
    || requestUrl.hash
  ) {
    throw new AppAuthError(
      'Authentication could not be completed.',
      400,
      'LOGIN_CALLBACK_INVALID',
    )
  }
}

function expectedSupabaseAuthorizeUrl(): URL {
  const configured = process.env.VITE_SUPABASE_URL
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
  if (
    base.username
    || base.password
    || base.pathname !== '/'
    || base.search
    || base.hash
    || !(
      base.protocol === 'https:'
      || (base.protocol === 'http:' && base.hostname === 'localhost')
    )
  ) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'SUPABASE_AUTH_UNAVAILABLE',
    )
  }
  return new URL('/auth/v1/authorize', base.origin)
}

function validateOAuthAuthorizationUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'OAUTH_START_FAILED',
    )
  }
  const expected = expectedSupabaseAuthorizeUrl()
  const allowedKeys = new Set([
    'provider',
    'redirect_to',
    'code_challenge',
    'code_challenge_method',
  ])
  const challenge = url.searchParams.getAll('code_challenge')
  if (
    url.origin !== expected.origin
    || url.pathname !== expected.pathname
    || url.hash
    || Array.from(url.searchParams.keys()).some((key) => !allowedKeys.has(key))
    || url.searchParams.getAll('provider').length !== 1
    || url.searchParams.get('provider') !== 'google'
    || url.searchParams.getAll('redirect_to').length !== 1
    || url.searchParams.get('redirect_to') !== loginCallbackUrl()
    || challenge.length !== 1
    || !HANDLE_PATTERN.test(challenge[0])
    || url.searchParams.getAll('code_challenge_method').length !== 1
    || url.searchParams.get('code_challenge_method') !== 's256'
  ) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'OAUTH_START_FAILED',
    )
  }
  return url.toString()
}

async function insertLoginTransaction(
  verifier: string,
  handleHash: string,
  flowType: LoginFlowType,
  dependencies: LoginDependencies,
): Promise<void> {
  const callback = loginCallbackUrl()
  const configuration = await readEncryptionConfiguration()
  const encrypted = await encryptVerifier(
    verifier,
    configuration,
    {
      handle_hash: handleHash,
      flow_type: flowType,
      callback_url: callback,
    },
  )
  const createdAtMs = dependencies.now()
  const maxAgeSeconds = flowType === 'email'
    ? EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS
    : OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS
  const inserted = await dependencies.admin
    .from('app_auth_login_transactions')
    .insert({
      handle_hash: handleHash,
      flow_type: flowType,
      encryption_key_version: configuration.version,
      verifier_ciphertext: encrypted.ciphertext,
      verifier_iv: encrypted.iv,
      callback_url: callback,
      created_at: new Date(createdAtMs).toISOString(),
      expires_at: new Date(
        createdAtMs + maxAgeSeconds * 1_000,
      ).toISOString(),
      claimed_at: null,
    })
  if (inserted.error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'LOGIN_TRANSACTION_UNAVAILABLE',
    )
  }
}

async function abandonLoginTransaction(
  handleHash: string,
  dependencies: LoginDependencies,
): Promise<void> {
  try {
    const claimedAt = new Date(dependencies.now()).toISOString()
    const result = await dependencies.admin
      .from('app_auth_login_transactions')
      .update({ claimed_at: claimedAt })
      .eq('handle_hash', handleHash)
      .is('claimed_at', null)
    if (!result.error) return
  } catch {
    // Best-effort invalidation must never hide the original start failure.
  }
  console.error(JSON.stringify({
    level: 'error',
    event: 'auth_login_transaction_cleanup_failed',
    error_category: 'login_transaction_cleanup_failed',
  }))
}

async function prepareStart(
  flowType: LoginFlowType,
  dependencies: LoginDependencies,
): Promise<{
  client: SupabaseClient
  storage: RequestMemoryStorage
  handle: string
  handleHash: string
}> {
  const handle = randomBase64Url(32)
  const handleHash = await sha256Base64Url(handle)
  const storage = new RequestMemoryStorage({
    onVerifier: (verifier) => insertLoginTransaction(
      verifier,
      handleHash,
      flowType,
      dependencies,
    ),
  })
  return {
    client: createPkceClient(storage, dependencies.fetchImpl),
    storage,
    handle,
    handleHash,
  }
}

export async function readStrictJsonObject(
  req: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type')
  if (
    !contentType
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
  ) {
    throw new AppAuthError(
      'Content-Type must be application/json.',
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    )
  }
  const declaredLength = req.headers.get('content-length')
  if (
    declaredLength
    && (
      !/^(?:0|[1-9]\d*)$/u.test(declaredLength)
      || Number(declaredLength) > maxBytes
    )
  ) {
    throw new AppAuthError('Request body too large.', 413, 'REQUEST_TOO_LARGE')
  }
  if (!req.body) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new AppAuthError('Request body too large.', 413, 'REQUEST_TOO_LARGE')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new AppAuthError('Invalid JSON body.', 400, 'INVALID_REQUEST')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AppAuthError('Invalid JSON body.', 400, 'INVALID_REQUEST')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  return parsed as Record<string, unknown>
}

export function normalizeLoginEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  const email = value.trim().toLowerCase()
  if (
    !email
    || email.length > MAX_EMAIL_LENGTH
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  return email
}

export function normalizeEmailOtp(value: unknown): string {
  if (typeof value !== 'string' || !EMAIL_OTP_PATTERN.test(value)) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  return value
}

export function normalizeEmailTokenHash(value: unknown): string {
  if (
    typeof value !== 'string'
    || !EMAIL_TOKEN_HASH_PATTERN.test(value)
  ) {
    throw new AppAuthError('Invalid request body.', 400, 'INVALID_REQUEST')
  }
  return value
}

export function loginFlowCookie(
  handle: string,
  flowType: LoginFlowType,
): string {
  if (!HANDLE_PATTERN.test(handle)) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'INVALID_COOKIE_VALUE',
    )
  }
  const maxAgeSeconds = flowType === 'email'
    ? EMAIL_LOGIN_FLOW_MAX_AGE_SECONDS
    : OAUTH_LOGIN_FLOW_MAX_AGE_SECONDS
  return `${LOGIN_FLOW_COOKIE_NAME}=${handle}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`
}

export function clearLoginFlowCookie(): string {
  return `${LOGIN_FLOW_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

export function createLoginCsrfToken(): string {
  requireServerLoginMode()
  return randomBase64Url(32)
}

export function loginCsrfCookie(token: string): string {
  if (!HANDLE_PATTERN.test(token)) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'INVALID_COOKIE_VALUE',
    )
  }
  return `${LOGIN_CSRF_COOKIE_NAME}=${token}; Path=/; Max-Age=${LOGIN_CSRF_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`
}

export function clearLoginCsrfCookie(): string {
  return `${LOGIN_CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

function readLoginCsrfCookie(req: Request): string {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) {
    throw new AppAuthError(
      'Request verification failed.',
      403,
      'CSRF_REJECTED',
    )
  }
  const values = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${LOGIN_CSRF_COOKIE_NAME}=`))
    .map((part) => part.slice(LOGIN_CSRF_COOKIE_NAME.length + 1))
  if (values.length !== 1 || !HANDLE_PATTERN.test(values[0])) {
    throw new AppAuthError(
      'Request verification failed.',
      403,
      'CSRF_REJECTED',
    )
  }
  return values[0]
}

export function requireLoginPostGuards(req: Request): void {
  requireServerLoginMode()
  const supplied = requirePostRequestMetadata(req)
  const cookie = readLoginCsrfCookie(req)
  if (
    !HANDLE_PATTERN.test(supplied)
    || !constantTimeEqual(supplied, cookie)
  ) {
    throw new AppAuthError(
      'Request verification failed.',
      403,
      'CSRF_REJECTED',
    )
  }
}

export function readLoginFlowCookie(req: Request): string {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  const values = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${LOGIN_FLOW_COOKIE_NAME}=`))
    .map((part) => part.slice(LOGIN_FLOW_COOKIE_NAME.length + 1))
  if (values.length !== 1 || !HANDLE_PATTERN.test(values[0])) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  return values[0]
}

export function readCallbackCode(req: Request): string {
  requireExactCallbackRequest(req)
  if (req.url.length > 4_096) {
    throw new AppAuthError(
      'Authentication could not be completed.',
      400,
      'LOGIN_CALLBACK_INVALID',
    )
  }
  const url = new URL(req.url)
  const codes = url.searchParams.getAll('code')
  const hasControlCharacter = codes[0]
    ? Array.from(codes[0]).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0
        return codePoint <= 31 || codePoint === 127
      })
    : false
  if (
    Array.from(url.searchParams.keys()).some((key) => key !== 'code')
    || codes.length !== 1
    || !codes[0]
    || codes[0].length > MAX_AUTH_CODE_LENGTH
    || hasControlCharacter
  ) {
    throw new AppAuthError(
      'Authentication could not be completed.',
      400,
      'LOGIN_CALLBACK_INVALID',
    )
  }
  return codes[0]
}

export async function beginEmailLogin(
  email: string,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<StartedLogin> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const prepared = await prepareStart('email', dependencies)
  try {
    const result = await prepared.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: loginCallbackUrl(),
      },
    })
    if (result.error) {
      await abandonLoginTransaction(prepared.handleHash, dependencies)
      console.error(JSON.stringify({
        level: 'error',
        event: 'auth_email_start_failed',
        error_category: 'provider_rejected',
      }))
      return { flowCookie: clearLoginFlowCookie() }
    }
    return { flowCookie: loginFlowCookie(prepared.handle, 'email') }
  } catch (error) {
    await abandonLoginTransaction(prepared.handleHash, dependencies)
    throw error
  } finally {
    prepared.storage.clear()
  }
}

export async function beginOAuthLogin(
  provider: 'google',
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<StartedOAuthLogin> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const prepared = await prepareStart('oauth', dependencies)
  try {
    const result = await prepared.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: loginCallbackUrl(),
        skipBrowserRedirect: true,
      },
    })
    if (result.error || !result.data.url) {
      throw new AppAuthError(
        'Authentication is temporarily unavailable.',
        503,
        'OAUTH_START_FAILED',
      )
    }
    return {
      url: validateOAuthAuthorizationUrl(result.data.url),
      flowCookie: loginFlowCookie(prepared.handle, 'oauth'),
    }
  } catch (error) {
    await abandonLoginTransaction(prepared.handleHash, dependencies)
    throw error
  } finally {
    prepared.storage.clear()
  }
}

export async function claimLoginTransaction(
  handle: string,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<{ flowType: LoginFlowType; verifier: string }> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const handleHash = await sha256Base64Url(handle)
  const claimedAt = new Date(dependencies.now()).toISOString()
  const result = await dependencies.admin
    .from('app_auth_login_transactions')
    .update({ claimed_at: claimedAt })
    .eq('handle_hash', handleHash)
    .is('claimed_at', null)
    .gt('expires_at', claimedAt)
    .select('*')
    .maybeSingle()
  if (result.error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'LOGIN_TRANSACTION_UNAVAILABLE',
    )
  }
  if (!result.data) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  const row = result.data as AppAuthLoginTransactionRow
  const returnedClaimedAt = row.claimed_at ? Date.parse(row.claimed_at) : Number.NaN
  if (
    row.handle_hash !== handleHash
    || (row.flow_type !== 'email' && row.flow_type !== 'oauth')
    || row.callback_url !== loginCallbackUrl()
    || !Number.isFinite(returnedClaimedAt)
    || returnedClaimedAt !== Date.parse(claimedAt)
    || Date.parse(row.expires_at) <= dependencies.now()
  ) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  return {
    flowType: row.flow_type,
    verifier: await decryptVerifier(row),
  }
}

/**
 * Claims only an email transaction. Keeping the flow type inside the database
 * predicate prevents an email-verification endpoint from consuming an OAuth
 * transaction before rejecting it.
 */
export async function claimEmailLoginTransaction(
  handle: string,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<void> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const handleHash = await sha256Base64Url(handle)
  const claimedAt = new Date(dependencies.now()).toISOString()
  const result = await dependencies.admin
    .from('app_auth_login_transactions')
    .update({ claimed_at: claimedAt })
    .eq('handle_hash', handleHash)
    .eq('flow_type', 'email')
    .is('claimed_at', null)
    .gt('expires_at', claimedAt)
    .select('*')
    .maybeSingle()
  if (result.error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'LOGIN_TRANSACTION_UNAVAILABLE',
    )
  }
  if (!result.data) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  const row = result.data as AppAuthLoginTransactionRow
  const returnedClaimedAt = row.claimed_at ? Date.parse(row.claimed_at) : Number.NaN
  if (
    row.handle_hash !== handleHash
    || row.flow_type !== 'email'
    || row.callback_url !== loginCallbackUrl()
    || !Number.isFinite(returnedClaimedAt)
    || returnedClaimedAt !== Date.parse(claimedAt)
    || Date.parse(row.expires_at) <= dependencies.now()
  ) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
}

/**
 * Checks that the scanner-safe landing still has an unclaimed email
 * transaction. This is deliberately read-only: GET must never claim the row,
 * contact the identity provider, or verify a token.
 */
export async function validateEmailLoginTransaction(
  handle: string,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<void> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const handleHash = await sha256Base64Url(handle)
  const checkedAt = new Date(dependencies.now()).toISOString()
  const result = await dependencies.admin
    .from('app_auth_login_transactions')
    .select('handle_hash,flow_type,callback_url,expires_at,claimed_at')
    .eq('handle_hash', handleHash)
    .eq('flow_type', 'email')
    .is('claimed_at', null)
    .gt('expires_at', checkedAt)
    .maybeSingle()
  if (result.error) {
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'LOGIN_TRANSACTION_UNAVAILABLE',
    )
  }
  const row = result.data as Pick<
    AppAuthLoginTransactionRow,
    'handle_hash' | 'flow_type' | 'callback_url' | 'expires_at' | 'claimed_at'
  > | null
  if (
    !row
    || row.handle_hash !== handleHash
    || row.flow_type !== 'email'
    || row.callback_url !== loginCallbackUrl()
    || row.claimed_at !== null
    || Date.parse(row.expires_at) <= dependencies.now()
  ) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
}

export async function exchangePkceCode(
  code: string,
  verifier: string,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<Session> {
  requireServerLoginMode()
  if (!VERIFIER_PATTERN.test(verifier)) {
    throw new AppAuthError(
      'Authentication flow is invalid or expired.',
      400,
      'LOGIN_FLOW_INVALID',
    )
  }
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const storage = new RequestMemoryStorage({
    initial: {
      [`${PKCE_STORAGE_KEY}-code-verifier`]: verifier,
    },
  })
  try {
    const client = createPkceClient(storage, dependencies.fetchImpl)
    const result = await client.auth.exchangeCodeForSession(code)
    if (
      result.error
      || !result.data.session
      || !result.data.session.access_token
      || !result.data.session.refresh_token
    ) {
      throw new AppAuthError(
        'Authentication could not be completed.',
        401,
        'LOGIN_FAILED',
      )
    }
    return result.data.session
  } catch (error) {
    if (error instanceof AppAuthError) throw error
    throw new AppAuthError(
      'Authentication is temporarily unavailable.',
      503,
      'AUTH_UPSTREAM_UNAVAILABLE',
    )
  } finally {
    storage.clear()
  }
}

/**
 * Verifies a user-entered email OTP or the template TokenHash with Supabase in
 * request-local memory. auth-js 2.110.7 sends these credentials directly to
 * /auth/v1/verify and does not attach the original PKCE verifier. That request
 * shape is contract-tested locally, but provider compatibility still requires
 * isolated staging proof before server login is enabled in production.
 */
export async function verifyEmailLogin(
  credentials: EmailVerificationCredentials,
  dependencyOverrides: Partial<LoginDependencies> = {},
): Promise<Session> {
  requireServerLoginMode()
  const dependencies = Object.keys(dependencyOverrides).length
    ? withDependencies(dependencyOverrides)
    : defaultDependencies()
  const storage = new RequestMemoryStorage()
  try {
    const client = createPkceClient(storage, dependencies.fetchImpl)
    const result = await client.auth.verifyOtp(credentials)
    if (
      result.error
      || !result.data.session
      || !result.data.session.access_token
      || !result.data.session.refresh_token
    ) {
      throw new AppAuthError(
        'Email verification could not be completed.',
        400,
        'EMAIL_VERIFICATION_FAILED',
      )
    }
    return result.data.session
  } catch (error) {
    if (error instanceof AppAuthError) throw error
    throw new AppAuthError(
      'Email verification could not be completed.',
      400,
      'EMAIL_VERIFICATION_FAILED',
    )
  } finally {
    storage.clear()
  }
}
