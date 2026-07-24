/* ============================================================
   Global state management
   ============================================================ */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import type { FunctionalAstrolabe } from '@/lib/astro'
import type { BirthInfo } from '@/lib/astro'
import type { LifetimeKLinePoint } from '@/lib/fortune-score'
import type { ForecastTier, Persona } from '@/lib/ai-prompts'
import {
  assignBffOAuthRedirect,
  AUTH_CALLBACK_ERROR_MESSAGE,
  clearLegacySupabaseAuthStorage,
  BffAuthError,
  consumeAuthCallbackMarker,
  EMAIL_OTP_VERIFICATION_ERROR_MESSAGE,
  fetchBffSession,
  getLegacySupabaseClient,
  logoutBffSession,
  migrateLegacySession,
  startBffEmailLogin,
  startBffOAuthLogin,
  verifyBffEmailOtp,
  type AuthMode,
  type BffEmailLoginAccepted,
  type BffAuthSnapshot,
  type BffAuthUser,
} from '@/lib/supabase'

/* ------------------------------------------------------------
   Future Report capture activity
   ------------------------------------------------------------ */

interface FutureReportActivityState {
  captureCount: number
  beginCapture: () => void
  endCapture: () => void
}

export const useFutureReportActivityStore =
  create<FutureReportActivityState>()((set) => ({
    captureCount: 0,
    beginCapture: () => set((state) => ({
      captureCount: state.captureCount + 1,
    })),
    endCapture: () => set((state) => ({
      captureCount: Math.max(0, state.captureCount - 1),
    })),
  }))

function canMutateChart(): boolean {
  return useFutureReportActivityStore.getState().captureCount === 0
}

/* ------------------------------------------------------------
   Chart state
   ------------------------------------------------------------ */

interface ChartState {
  birthInfo: BirthInfo | null
  chart: FunctionalAstrolabe | null
  setBirthInfo: (info: BirthInfo) => boolean
  setChart: (chart: FunctionalAstrolabe) => boolean
  replaceChart: (info: BirthInfo, chart: FunctionalAstrolabe) => boolean
  clear: () => boolean
}

export const useChartStore = create<ChartState>()((set) => ({
  birthInfo: null,
  chart: null,
  setBirthInfo: (info) => {
    if (!canMutateChart()) return false
    set({ birthInfo: info })
    return true
  },
  setChart: (chart) => {
    if (!canMutateChart()) return false
    set({ chart })
    return true
  },
  replaceChart: (birthInfo, chart) => {
    if (!canMutateChart()) return false
    set({ birthInfo, chart })
    useContentCacheStore.getState().clearAll()
    return true
  },
  clear: () => {
    if (!canMutateChart()) return false
    set({ birthInfo: null, chart: null })
    // Also clear cached AI content
    useContentCacheStore.getState().clearAll()
    return true
  },
}))

/* ------------------------------------------------------------
   Content cache (AI readings, K-line, etc.)
   ------------------------------------------------------------ */

interface KLineCache {
  lifetime: LifetimeKLinePoint[]  // full ages 1-100 dataset
  isGenerating: boolean           // whether reasons are still being generated
}

export interface FutureReportCache {
  tier: ForecastTier
  text: string
  orderId: string
}

interface ContentCacheState {
  // AI natal reading
  aiInterpretation: string | null
  aiInterpretationKey: string | null
  setAiInterpretation: (
    content: string | null,
    requestKey: string | null,
  ) => void

  // Paid Future Report (set once payment is captured and the report streams in)
  futureReport: FutureReportCache | null
  setFutureReport: (report: FutureReportCache | null) => void

  // Yearly fortune readings (cached per year)
  yearlyFortune: Record<number, string>
  setYearlyFortune: (year: number, content: string) => void

  // K-line data
  klineCache: KLineCache | null
  setKlineCache: (cache: KLineCache) => void
  updateKlineReasons: (reasons: { age: number; reason: string }[]) => void
  setKlineGenerating: (isGenerating: boolean) => void

  // Clear all caches
  clearAll: () => void
}

export const useContentCacheStore = create<ContentCacheState>()((set) => ({
  aiInterpretation: null,
  aiInterpretationKey: null,
  futureReport: null,
  yearlyFortune: {},
  klineCache: null,

  setAiInterpretation: (content, requestKey) => set({
    aiInterpretation: content,
    aiInterpretationKey: requestKey,
  }),
  setFutureReport: (report) => set({ futureReport: report }),

  setYearlyFortune: (year, content) => set((state) => ({
    yearlyFortune: { ...state.yearlyFortune, [year]: content },
  })),

  setKlineCache: (cache) => set({ klineCache: cache }),

  updateKlineReasons: (reasons) => set((state) => {
    if (!state.klineCache) return state
    const updatedLifetime = state.klineCache.lifetime.map(point => {
      const found = reasons.find(r => r.age === point.age)
      return found ? { ...point, reason: found.reason } : point
    })
    return {
      klineCache: {
        ...state.klineCache,
        lifetime: updatedLifetime,
        isGenerating: false,
      },
    }
  }),

  setKlineGenerating: (isGenerating) => set((state) => {
    if (!state.klineCache) return state
    return {
      klineCache: { ...state.klineCache, isGenerating },
    }
  }),

  clearAll: () => set({
    aiInterpretation: null,
    aiInterpretationKey: null,
    futureReport: null,
    yearlyFortune: {},
    klineCache: null,
  }),
}))

/* ------------------------------------------------------------
   Settings state — reader persona (Scholar / Old Sage)
   ------------------------------------------------------------ */

interface SettingsState {
  persona: Persona
  setPersona: (persona: Persona) => boolean
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      persona: 'scholar',
      setPersona: (persona) => {
        if (!canMutateChart()) return false
        set({ persona })
        return true
      },
    }),
    {
      name: 'cinnabar-settings',
    }
  )
)

/* ------------------------------------------------------------
   Auth state - legacy compatibility + opaque HttpOnly-cookie BFF
   ------------------------------------------------------------ */

/** Social identity providers we support (Facebook reserved for later). */
export type OAuthProvider = 'google' | 'facebook'

interface AuthState {
  user: BffAuthUser | null
  authMode: AuthMode | null
  csrfToken: string | null
  sessionVersion: string | null
  /** Transitional in-memory token used only while the server reports legacy mode. */
  legacyAccessToken: string | null
  /** True once cookie-first hydration and any one-time migration has resolved. */
  initialized: boolean
  error: string | null
  /** Resolves the configured auth mode, preserving or migrating legacy auth. */
  init: () => Promise<void>
  /** Sends a passwordless link through the active auth authority. */
  signInWithEmail: (email: string) => Promise<BffEmailLoginAccepted | null>
  /** Verifies a server-owned email OTP and hydrates the opaque session. */
  verifyEmailOtp: (
    email: string,
    token: string,
    verificationCsrfToken: string,
  ) => Promise<void>
  /** Starts OAuth through the active auth authority. */
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>
  signOut: () => Promise<void>
}

let authInitPromise: Promise<void> | null = null
let authStateGeneration = 0
let authListenerUnsubscribe: (() => void) | null = null
let authListenerGeneration = 0
let legacyMigrationAttempted = false
let legacyMigrationPromise: Promise<void> | null = null
let pendingAuthCallbackError: string | null | undefined
let pendingAuthCallbackSuccess = false
let activeAuthMode: AuthMode | null = null
let legacySupabaseClient: ReturnType<typeof getLegacySupabaseClient> = null
let authSyncBound = false
let authSyncChannel: BroadcastChannel | null = null
let authRevalidationDirty = false

const AUTH_SYNC_CHANNEL_NAME = 'cinnabar-auth-v1'
const AUTH_SYNC_EVENT = {
  type: 'session-may-have-changed',
  version: 1,
} as const

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function signedOutPatch(error: string | null = null) {
  return {
    user: null,
    authMode: activeAuthMode,
    csrfToken: null,
    sessionVersion: null,
    legacyAccessToken: null,
    initialized: true,
    error,
  }
}

function signedInPatch(snapshot: Extract<BffAuthSnapshot, { authenticated: true }>) {
  return {
    user: snapshot.user,
    authMode: snapshot.authMode,
    csrfToken: snapshot.csrfToken,
    sessionVersion: snapshot.sessionVersion,
    legacyAccessToken: null,
    initialized: true,
    error: null,
  }
}

function signedInLegacyPatch(session: Session) {
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
    authMode: 'legacy' as const,
    csrfToken: null,
    sessionVersion: `legacy:${session.user.id}:${session.expires_at ?? 'active'}`,
    legacyAccessToken: session.access_token,
    initialized: true,
    error: null,
  }
}

function commitAuthState(
  patch: Partial<AuthState>,
): void {
  authStateGeneration += 1
  useAuthStore.setState(patch)
}

function commitAuthStateIfCurrent(
  expectedGeneration: number,
  patch: Partial<AuthState>,
): boolean {
  if (authStateGeneration !== expectedGeneration) return false
  commitAuthState(patch)
  return true
}

function clearPaidAuthContent(): void {
  useContentCacheStore.getState().setFutureReport(null)
}

function commitSignedOut(
  error: string | null = null,
): void {
  commitAuthState(signedOutPatch(error))
  clearPaidAuthContent()
}

function commitSignedOutIfCurrent(
  expectedGeneration: number,
  error: string | null = null,
): boolean {
  if (!commitAuthStateIfCurrent(expectedGeneration, signedOutPatch(error))) {
    return false
  }
  clearPaidAuthContent()
  return true
}

function setTransientAuthError(
  expectedGeneration: number,
  error: string,
): void {
  if (authStateGeneration !== expectedGeneration) return
  // Preserve every identity-bearing field. In particular, a provider 503 must
  // not turn a valid opaque session into a fabricated signed-out snapshot.
  useAuthStore.setState({ error })
}

function consumePendingAuthCallbackError(): string | null {
  if (pendingAuthCallbackError !== undefined) return pendingAuthCallbackError
  const marker = consumeAuthCallbackMarker()
  pendingAuthCallbackSuccess = marker === 'success'
  pendingAuthCallbackError = marker === 'error'
    ? AUTH_CALLBACK_ERROR_MESSAGE
    : null
  return pendingAuthCallbackError
}

function finishAuthCallback(): void {
  pendingAuthCallbackError = undefined
  pendingAuthCallbackSuccess = false
}

function isAuthSyncEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).length === 2
    && record.type === AUTH_SYNC_EVENT.type
    && record.version === AUTH_SYNC_EVENT.version
  )
}

function requestAuthRevalidation(): void {
  if (authInitPromise) {
    authRevalidationDirty = true
    return
  }

  // Event-driven refreshes are detached from the DOM callback. Keep an
  // unexpected rejection contained even though init handles known failures.
  void useAuthStore.getState().init().catch(() => undefined)
}

function ensureAuthSyncBound(): void {
  if (authSyncBound || typeof window === 'undefined') return
  authSyncBound = true

  window.addEventListener('focus', requestAuthRevalidation)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestAuthRevalidation()
    })
  }

  if (typeof BroadcastChannel === 'undefined') return
  try {
    authSyncChannel = new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME)
    authSyncChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (isAuthSyncEvent(event.data)) requestAuthRevalidation()
    })
  } catch {
    // Focus/visibility revalidation remains available when channel creation is
    // unsupported or blocked by browser policy.
    authSyncChannel = null
  }
}

function broadcastAuthMayHaveChanged(): void {
  ensureAuthSyncBound()
  try {
    authSyncChannel?.postMessage(AUTH_SYNC_EVENT)
  } catch {
    // Other tabs still revalidate when they regain focus/visibility.
  }
}

function stopLegacySessionPersistence(): void {
  authListenerGeneration += 1
  legacySupabaseClient?.auth.stopAutoRefresh()
  authListenerUnsubscribe?.()
  authListenerUnsubscribe = null
  clearLegacySupabaseAuthStorage()
}

async function migrateLegacyIntoBff(
  session: Session,
  completionError: string | null = null,
  expectedGeneration = authStateGeneration,
): Promise<void> {
  if (legacyMigrationAttempted) return legacyMigrationPromise ?? Promise.resolve()
  legacyMigrationAttempted = true

  legacyMigrationPromise = migrateLegacySession(session)
    .then((snapshot) => {
      if (authStateGeneration !== expectedGeneration) return
      activeAuthMode = snapshot.authMode
      // Clear browser persistence only after the server owns the refresh token.
      stopLegacySessionPersistence()
      commitAuthState({
        ...signedInPatch(snapshot),
        error: completionError,
      })
      finishAuthCallback()
      broadcastAuthMayHaveChanged()
    })
    .catch((error: unknown) => {
      if (authStateGeneration !== expectedGeneration) return
      if (
        error instanceof BffAuthError
        && error.code === 'MIGRATION_RETRYABLE'
      ) {
        // The server guarantees provider rotation did not begin, so preserving
        // the browser session for a same-page retry is safe in this one case.
        legacyMigrationAttempted = false
        setTransientAuthError(
          expectedGeneration,
          completionError
            ?? 'Could not secure your existing session. Please try again.',
        )
        return
      }

      // MIGRATION_REAUTH_REQUIRED is the explicit terminal classification.
      // An unknown outcome also reaches this fail-closed path: unlike an
      // ordinary provider 503, its phase cannot be proven pre-rotation, so the
      // client must not replay an uncertain refresh-token family.
      stopLegacySessionPersistence()
      commitSignedOut(
        completionError ?? 'Your session needs to be signed in again.',
      )
      finishAuthCallback()
      broadcastAuthMayHaveChanged()
    })
    .finally(() => {
      legacyMigrationPromise = null
    })

  return legacyMigrationPromise
}

function bindLegacyAuthListener(): void {
  const supabase = legacySupabaseClient ?? getLegacySupabaseClient()
  if (
    !supabase
    || authListenerUnsubscribe
    || (activeAuthMode !== 'legacy' && activeAuthMode !== 'dual')
  ) return
  legacySupabaseClient = supabase
  const listenerGeneration = ++authListenerGeneration

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (
      listenerGeneration !== authListenerGeneration
      || authInitPromise
    ) return

    if (!session) {
      commitSignedOut()
      return
    }

    if (activeAuthMode === 'legacy') {
      commitAuthState(signedInLegacyPatch(session))
      return
    }

    if (activeAuthMode === 'dual') {
      void migrateLegacyIntoBff(session, null, authStateGeneration)
    }
  })
  authListenerUnsubscribe = () => data.subscription.unsubscribe()
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  authMode: null,
  csrfToken: null,
  sessionVersion: null,
  legacyAccessToken: null,
  initialized: false,
  error: null,

  init: () => {
    ensureAuthSyncBound()
    if (authInitPromise) return authInitPromise

    const callbackError = consumePendingAuthCallbackError()
    const expectedGeneration = authStateGeneration
    const run = (async () => {
      try {
        const snapshot = await fetchBffSession()
        if (authStateGeneration !== expectedGeneration) return

        activeAuthMode = snapshot.authMode
        if (snapshot.authenticated) {
          // Cookie identity always wins. Never inspect a stale browser token
          // once the BFF has authenticated the request.
          stopLegacySessionPersistence()
          const shouldBroadcastCallbackSuccess = pendingAuthCallbackSuccess
          if (commitAuthStateIfCurrent(expectedGeneration, {
            ...signedInPatch(snapshot),
            error: callbackError,
          })) {
            finishAuthCallback()
            if (shouldBroadcastCallbackSuccess) {
              broadcastAuthMayHaveChanged()
            }
          }
          return
        }

        if (snapshot.authMode === 'opaque') {
          stopLegacySessionPersistence()
          if (commitSignedOutIfCurrent(expectedGeneration, callbackError)) {
            finishAuthCallback()
          }
          return
        }

        const supabase = legacySupabaseClient ?? getLegacySupabaseClient()
        legacySupabaseClient = supabase
        if (!supabase) {
          if (commitSignedOutIfCurrent(expectedGeneration, callbackError)) {
            finishAuthCallback()
          }
          return
        }

        bindLegacyAuthListener()
        const { data, error } = await supabase.auth.getSession()
        if (authStateGeneration !== expectedGeneration) return
        if (error) {
          // The cookie preflight cannot decide legacy browser authority. A
          // provider/client read error is therefore availability, not logout.
          setTransientAuthError(expectedGeneration, error.message)
          return
        }
        if (!data.session) {
          if (snapshot.authMode === 'dual') {
            // No legacy session remains to migrate. Disable the SDK before any
            // new login starts so dual mode cannot create browser token state.
            stopLegacySessionPersistence()
          }
          if (commitSignedOutIfCurrent(expectedGeneration, callbackError)) {
            finishAuthCallback()
          }
          return
        }
        if (snapshot.authMode === 'legacy') {
          if (commitAuthStateIfCurrent(expectedGeneration, {
            ...signedInLegacyPatch(data.session),
            error: callbackError,
          })) {
            finishAuthCallback()
          }
          return
        }
        await migrateLegacyIntoBff(
          data.session,
          callbackError,
          expectedGeneration,
        )
      } catch (error: unknown) {
        if (authStateGeneration !== expectedGeneration) return

        // The session endpoint normally turns an invalid SID into an explicit
        // authenticated:false snapshot. Preserve a defensive authoritative
        // 401 boundary for proxies and future endpoint changes.
        if (error instanceof BffAuthError && error.status === 401) {
          if (commitSignedOutIfCurrent(
            expectedGeneration,
            callbackError ?? errorMessage(
              error,
              'Your session is invalid or expired.',
            ),
          )) {
            finishAuthCallback()
          }
          return
        }

        // Provider 503s, network failures, and malformed responses leave
        // cookie authority unknown. Preserve user/CSRF/version and release the
        // single-flight below so the same page can safely retry.
        setTransientAuthError(
          expectedGeneration,
          errorMessage(
            callbackError ?? error,
            callbackError ?? 'Could not restore your session.',
          ),
        )
      }
    })()

    const tracked = run.finally(() => {
      if (authInitPromise !== tracked) return
      authInitPromise = null
      if (!authRevalidationDirty) return

      // Collapse every sync/focus/visibility pulse observed during this flight
      // into one later init. A microtask boundary avoids recursively entering
      // init from the current promise's finally handler.
      authRevalidationDirty = false
      queueMicrotask(requestAuthRevalidation)
    })
    authInitPromise = tracked
    return tracked
  },

  signInWithEmail: async (email: string) => {
    set({ error: null })
    const normalizedEmail = email.trim()
    if (!activeAuthMode) {
      throw new Error('Could not determine the sign-in mode. Retry your session check.')
    }
    if (activeAuthMode !== 'legacy') {
      const result = await startBffEmailLogin(normalizedEmail)
      activeAuthMode = result.authMode
      return result
    }
    const supabase = legacySupabaseClient ?? getLegacySupabaseClient()
    legacySupabaseClient = supabase
    if (!supabase) throw new Error('Sign-in is not available right now.')
    legacyMigrationAttempted = false
    bindLegacyAuthListener()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
    if (error) throw new Error(error.message)
    return null
  },

  verifyEmailOtp: async (email, token, verificationCsrfToken) => {
    set({ error: null })
    let snapshot: Extract<BffAuthSnapshot, { authenticated: true }>
    try {
      snapshot = await verifyBffEmailOtp(
        email.trim(),
        token,
        verificationCsrfToken,
      )
    } catch {
      throw new Error(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE)
    }

    activeAuthMode = snapshot.authMode
    stopLegacySessionPersistence()
    commitAuthState(signedInPatch(snapshot))
    broadcastAuthMayHaveChanged()
  },

  signInWithOAuth: async (provider: OAuthProvider) => {
    set({ error: null })
    if (!activeAuthMode) {
      throw new Error('Could not determine the sign-in mode. Retry your session check.')
    }
    if (activeAuthMode !== 'legacy') {
      if (provider !== 'google') {
        throw new Error('This sign-in provider is not available.')
      }
      const result = await startBffOAuthLogin(provider)
      activeAuthMode = result.authMode
      assignBffOAuthRedirect(result.url)
      return
    }
    const supabase = legacySupabaseClient ?? getLegacySupabaseClient()
    legacySupabaseClient = supabase
    if (!supabase) throw new Error('Sign-in is not available right now.')
    legacyMigrationAttempted = false
    bindLegacyAuthListener()
    // Temporary legacy redirect: the returning session is migrated to the BFF
    // immediately. This is not a completed server-side PKCE flow.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
    if (error) throw new Error(error.message)
  },

  signOut: async () => {
    const state = useAuthStore.getState()
    if (activeAuthMode === 'legacy') {
      const supabase = legacySupabaseClient ?? getLegacySupabaseClient()
      legacySupabaseClient = supabase
      if (!supabase) throw new Error('Sign-out is not available right now.')
      const { error } = await supabase.auth.signOut()
      if (error) throw new Error(error.message)
      legacyMigrationAttempted = false
      commitSignedOut()
      broadcastAuthMayHaveChanged()
      bindLegacyAuthListener()
      return
    }

    let csrfToken = state.csrfToken
    if (!csrfToken) {
      let hydrated: BffAuthSnapshot
      try {
        hydrated = await fetchBffSession()
      } catch {
        throw new Error('Could not sign out. Please try again.')
      }

      activeAuthMode = hydrated.authMode
      if (!hydrated.authenticated) {
        legacyMigrationAttempted = false
        clearLegacySupabaseAuthStorage()
        commitSignedOut()
        broadcastAuthMayHaveChanged()
        return
      }

      // The cookie is authoritative. Keep the refreshed authenticated identity
      // visible if the subsequent revocation request fails.
      commitAuthState(signedInPatch(hydrated))
      csrfToken = hydrated.csrfToken
    }

    let snapshot: Extract<BffAuthSnapshot, { authenticated: false }>
    try {
      snapshot = await logoutBffSession(csrfToken)
    } catch {
      throw new Error('Could not sign out. Please try again.')
    }

    activeAuthMode = snapshot.authMode
    legacyMigrationAttempted = false
    clearLegacySupabaseAuthStorage()
    commitSignedOut()
    broadcastAuthMayHaveChanged()
  },
}))
