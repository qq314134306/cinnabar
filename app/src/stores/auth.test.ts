import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => {
  class MockBffAuthError extends Error {
    readonly status: number
    readonly code: string | null

    constructor(
      message: string,
      status: number,
      code: string | null = null,
    ) {
      super(message)
      this.status = status
      this.code = code
    }
  }

  return {
    assignBffOAuthRedirect: vi.fn(),
    BffAuthError: MockBffAuthError,
    clearLegacySupabaseAuthStorage: vi.fn(),
    consumeAuthCallbackMarker: vi.fn(),
    fetchBffSession: vi.fn(),
    getLegacySupabaseClient: vi.fn(),
    getSession: vi.fn(),
    logoutBffSession: vi.fn(),
    migrateLegacySession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithOtp: vi.fn(),
    startBffEmailLogin: vi.fn(),
    startBffOAuthLogin: vi.fn(),
    stopAutoRefresh: vi.fn(),
    unsubscribe: vi.fn(),
    verifyBffEmailOtp: vi.fn(),
  }
})

vi.mock('@/lib/supabase', () => ({
  assignBffOAuthRedirect: mocks.assignBffOAuthRedirect,
  AUTH_CALLBACK_ERROR_MESSAGE: 'Sign-in could not be completed. Please try again.',
  EMAIL_OTP_VERIFICATION_ERROR_MESSAGE:
    'Verification could not be completed. Please check the code and try again.',
  BffAuthError: mocks.BffAuthError,
  clearLegacySupabaseAuthStorage: mocks.clearLegacySupabaseAuthStorage,
  consumeAuthCallbackMarker: mocks.consumeAuthCallbackMarker,
  fetchBffSession: mocks.fetchBffSession,
  getLegacySupabaseClient: mocks.getLegacySupabaseClient,
  logoutBffSession: mocks.logoutBffSession,
  migrateLegacySession: mocks.migrateLegacySession,
  startBffEmailLogin: mocks.startBffEmailLogin,
  startBffOAuthLogin: mocks.startBffOAuthLogin,
  verifyBffEmailOtp: mocks.verifyBffEmailOtp,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
      stopAutoRefresh: mocks.stopAutoRefresh,
    },
  },
}))

const COOKIE_SESSION = {
  authenticated: true as const,
  authMode: 'dual' as const,
  csrfToken: 'csrf-cookie',
  sessionVersion: 'session-cookie',
  user: { id: 'cookie-user', email: 'cookie@example.com' },
}

const LEGACY_SESSION = {
  access_token: 'legacy-access',
  refresh_token: 'legacy-refresh',
  user: { id: 'legacy-user', email: 'legacy@example.com' },
} as Session

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function installAuthSyncBrowser(withBroadcastChannel = true) {
  const focusListeners: Array<() => void> = []
  const visibilityListeners: Array<() => void> = []
  const channelInstances: FakeBroadcastChannel[] = []

  class FakeBroadcastChannel {
    readonly name: string
    readonly posted: unknown[] = []
    readonly messageListeners: Array<(event: MessageEvent<unknown>) => void> = []

    constructor(name: string) {
      this.name = name
      channelInstances.push(this)
    }

    addEventListener(
      type: string,
      listener: (event: MessageEvent<unknown>) => void,
    ): void {
      if (type === 'message') this.messageListeners.push(listener)
    }

    postMessage(value: unknown): void {
      // Real BroadcastChannel does not dispatch a message back to the sending
      // object. Tests deliver explicitly when simulating a second tab.
      this.posted.push(value)
    }

    emit(value: unknown): void {
      for (const listener of this.messageListeners) {
        listener({ data: value } as MessageEvent<unknown>)
      }
    }
  }

  const windowStub = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'focus') focusListeners.push(listener)
    }),
  }
  const documentStub = {
    visibilityState: 'visible',
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.push(listener)
    }),
  }

  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal(
    'BroadcastChannel',
    withBroadcastChannel ? FakeBroadcastChannel : undefined,
  )

  return {
    channelInstances,
    documentStub,
    emitFocus: () => {
      for (const listener of focusListeners) listener()
    },
    emitVisibility: () => {
      for (const listener of visibilityListeners) listener()
    },
    windowStub,
  }
}

describe('opaque auth store migration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    for (const mock of Object.values(mocks)) {
      if ('mockReset' in mock) mock.mockReset()
    }
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    })
    mocks.getLegacySupabaseClient.mockReturnValue({
      auth: {
        getSession: mocks.getSession,
        onAuthStateChange: mocks.onAuthStateChange,
        signOut: mocks.signOut,
        signInWithOAuth: mocks.signInWithOAuth,
        signInWithOtp: mocks.signInWithOtp,
        stopAutoRefresh: mocks.stopAutoRefresh,
      },
    })
    mocks.consumeAuthCallbackMarker.mockReturnValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prioritizes a cookie session without consulting legacy browser auth', async () => {
    mocks.fetchBffSession.mockResolvedValue(COOKIE_SESSION)

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.getLegacySupabaseClient).not.toHaveBeenCalled()
    expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
    expect(mocks.stopAutoRefresh).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      csrfToken: 'csrf-cookie',
      sessionVersion: 'session-cookie',
      error: null,
    })
    expect(useAuthStore.getState()).not.toHaveProperty('session')
  })

  it('retries after a provider 503 and restores the same cookie session', async () => {
    mocks.fetchBffSession
      .mockRejectedValueOnce(new mocks.BffAuthError(
        'Authentication is temporarily unavailable.',
        503,
      ))
      .mockResolvedValueOnce(COOKIE_SESSION)

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authMode: null,
      csrfToken: null,
      sessionVersion: null,
      initialized: false,
      error: 'Authentication is temporarily unavailable.',
    })
    expect(mocks.getLegacySupabaseClient).not.toHaveBeenCalled()

    await useAuthStore.getState().init()

    expect(mocks.fetchBffSession).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      authMode: COOKIE_SESSION.authMode,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })
  })

  it('retries after a network failure without selecting the BFF login authority', async () => {
    mocks.fetchBffSession
      .mockRejectedValueOnce(new Error('network diagnostic'))
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'legacy',
      })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authMode: null,
      initialized: false,
      error: 'network diagnostic',
    })
    await expect(
      useAuthStore.getState().signInWithEmail('person@example.com'),
    ).rejects.toThrow('Could not determine the sign-in mode.')
    expect(mocks.startBffEmailLogin).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()

    await useAuthStore.getState().init()

    expect(mocks.fetchBffSession).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      authMode: 'legacy',
      csrfToken: null,
      sessionVersion: 'legacy:legacy-user:active',
      legacyAccessToken: 'legacy-access',
      initialized: true,
      error: null,
    })
  })

  it('coalesces concurrent init calls into one in-flight request', async () => {
    const pending = deferred<typeof COOKIE_SESSION>()
    mocks.fetchBffSession.mockReturnValue(pending.promise)

    const { useAuthStore } = await import('@/stores')
    const first = useAuthStore.getState().init()
    const second = useAuthStore.getState().init()

    expect(second).toBe(first)
    expect(mocks.fetchBffSession).toHaveBeenCalledOnce()

    pending.resolve(COOKIE_SESSION)
    await Promise.all([first, second])

    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
  })

  it('preserves an existing identity and paid cache when revalidation returns 503', async () => {
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockRejectedValueOnce(new mocks.BffAuthError(
        'Authentication is temporarily unavailable.',
        503,
      ))

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '1-year',
      text: 'paid report',
      orderId: 'ORDER1234',
    })

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      authMode: COOKIE_SESSION.authMode,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: 'Authentication is temporarily unavailable.',
    })
    expect(useContentCacheStore.getState().futureReport).toEqual({
      tier: '1-year',
      text: 'paid report',
      orderId: 'ORDER1234',
    })
  })

  it('clears identity and paid cache only after an explicit signed-out snapshot', async () => {
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'opaque',
      })

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '5-year',
      text: 'paid report',
      orderId: 'ORDER5678',
    })

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authMode: 'opaque',
      csrfToken: null,
      sessionVersion: null,
      initialized: true,
      error: null,
    })
    expect(useContentCacheStore.getState().futureReport).toBeNull()
  })

  it('treats an authoritative session 401 as signed out', async () => {
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockRejectedValueOnce(new mocks.BffAuthError(
        'Your session is invalid or expired.',
        401,
      ))

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '1-year',
      text: 'paid report',
      orderId: 'ORDER9012',
    })

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
      initialized: true,
    })
    expect(useContentCacheStore.getState().futureReport).toBeNull()
  })

  it('does not let an older init response overwrite a newer verified session', async () => {
    const pending = deferred<{
      authenticated: false
      authMode: 'opaque'
    }>()
    const verifiedSession = {
      ...COOKIE_SESSION,
      authMode: 'opaque' as const,
      csrfToken: 'csrf-new',
      sessionVersion: 'session-new',
      user: { id: 'new-user', email: 'new@example.com' },
    }
    mocks.fetchBffSession
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'opaque',
      })
      .mockReturnValueOnce(pending.promise)
    mocks.verifyBffEmailOtp.mockResolvedValue(verifiedSession)

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()
    const staleInit = useAuthStore.getState().init()

    await useAuthStore.getState().verifyEmailOtp(
      'new@example.com',
      '012345',
      'verification-csrf',
    )
    pending.resolve({
      authenticated: false,
      authMode: 'opaque',
    })
    await staleInit

    expect(useAuthStore.getState()).toMatchObject({
      user: verifiedSession.user,
      authMode: 'opaque',
      csrfToken: 'csrf-new',
      sessionVersion: 'session-new',
      initialized: true,
      error: null,
    })
  })

  it('ignores a queued legacy listener after a newer cookie session wins', async () => {
    const listeners: Array<(event: string, session: Session | null) => void> = []
    mocks.onAuthStateChange.mockImplementation((callback) => {
      listeners.push(callback as (event: string, session: Session | null) => void)
      return {
        data: { subscription: { unsubscribe: mocks.unsubscribe } },
      }
    })
    mocks.fetchBffSession
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'legacy',
      })
      .mockResolvedValueOnce({
        ...COOKIE_SESSION,
        authMode: 'opaque',
      })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()
    await useAuthStore.getState().init()
    expect(listeners).toHaveLength(1)

    listeners[0]?.('SIGNED_OUT', null)

    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      authMode: 'opaque',
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
  })

  it('broadcasts one fixed secret-free invalidation after local sign-out without self-looping', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession.mockResolvedValue(COOKIE_SESSION)
    mocks.logoutBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'opaque',
    })

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()
    await useAuthStore.getState().signOut()

    expect(browser.channelInstances).toHaveLength(1)
    expect(browser.channelInstances[0]?.name).toBe('cinnabar-auth-v1')
    expect(browser.channelInstances[0]?.posted).toEqual([{
      type: 'session-may-have-changed',
      version: 1,
    }])
    expect(JSON.stringify(browser.channelInstances[0]?.posted)).not.toMatch(
      /user|email|token|csrf|sid|sessionVersion/iu,
    )
    expect(mocks.fetchBffSession).toHaveBeenCalledOnce()
  })

  it('revalidates a remote sign-out before clearing identity and paid cache', async () => {
    const browser = installAuthSyncBrowser()
    const pending = deferred<{
      authenticated: false
      authMode: 'opaque'
    }>()
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockReturnValueOnce(pending.promise)

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '1-year',
      text: 'paid report',
      orderId: 'ORDER1234',
    })

    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
    })
    expect(useAuthStore.getState().user).toEqual(COOKIE_SESSION.user)
    expect(useContentCacheStore.getState().futureReport?.text).toBe('paid report')

    pending.resolve({
      authenticated: false,
      authMode: 'opaque',
    })
    await vi.waitFor(() => expect(useAuthStore.getState().user).toBeNull())

    expect(useContentCacheStore.getState().futureReport).toBeNull()
    expect(browser.channelInstances[0]?.posted).toEqual([])
  })

  it('preserves the current session when broadcast revalidation returns 503', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockRejectedValueOnce(new mocks.BffAuthError(
        'Authentication is temporarily unavailable.',
        503,
      ))

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '5-year',
      text: 'paid report',
      orderId: 'ORDER5678',
    })

    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
    })
    await vi.waitFor(() => {
      expect(useAuthStore.getState().error).toBe(
        'Authentication is temporarily unavailable.',
      )
    })

    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
    expect(useContentCacheStore.getState().futureReport?.text).toBe('paid report')
  })

  it('uses focus revalidation when BroadcastChannel is unavailable', async () => {
    const browser = installAuthSyncBrowser(false)
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'opaque',
      })

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()
    browser.emitFocus()

    await vi.waitFor(() => expect(useAuthStore.getState().user).toBeNull())
    expect(browser.channelInstances).toHaveLength(0)
    expect(mocks.fetchBffSession).toHaveBeenCalledTimes(2)
  })

  it('tails one revalidation after coalesced pulses so a remote logout wins a stale signed-in flight', async () => {
    const browser = installAuthSyncBrowser()
    const pending = deferred<typeof COOKIE_SESSION>()
    mocks.fetchBffSession
      .mockResolvedValueOnce(COOKIE_SESSION)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        authenticated: false,
        authMode: 'opaque',
      })

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    useContentCacheStore.getState().setFutureReport({
      tier: '5-year',
      text: 'paid report',
      orderId: 'ORDER-REMOTE-LOGOUT',
    })
    browser.emitFocus()
    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
    })
    browser.emitFocus()
    browser.emitVisibility()

    expect(mocks.fetchBffSession).toHaveBeenCalledTimes(2)
    expect(browser.channelInstances).toHaveLength(1)
    expect(browser.windowStub.addEventListener).toHaveBeenCalledTimes(1)
    expect(browser.documentStub.addEventListener).toHaveBeenCalledTimes(1)

    pending.resolve({
      ...COOKIE_SESSION,
      csrfToken: 'csrf-stale',
      sessionVersion: 'session-stale',
    })
    await vi.waitFor(() => {
      expect(mocks.fetchBffSession).toHaveBeenCalledTimes(3)
      expect(useAuthStore.getState().user).toBeNull()
    })
    expect(useContentCacheStore.getState().futureReport).toBeNull()
    expect(browser.channelInstances[0]?.posted).toEqual([])
  })

  it('tails one revalidation after coalesced pulses so a remote login wins a stale signed-out flight', async () => {
    const browser = installAuthSyncBrowser()
    const signedOutSnapshot = {
      authenticated: false as const,
      authMode: 'opaque' as const,
    }
    const pending = deferred<typeof signedOutSnapshot>()
    mocks.fetchBffSession
      .mockResolvedValueOnce(signedOutSnapshot)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        ...COOKIE_SESSION,
        authMode: 'opaque',
        csrfToken: 'csrf-remote-login',
        sessionVersion: 'session-remote-login',
      })

    const { useAuthStore, useContentCacheStore } = await import('@/stores')
    await useAuthStore.getState().init()
    browser.emitFocus()
    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
    })
    browser.emitVisibility()

    expect(mocks.fetchBffSession).toHaveBeenCalledTimes(2)
    pending.resolve(signedOutSnapshot)

    await vi.waitFor(() => {
      expect(mocks.fetchBffSession).toHaveBeenCalledTimes(3)
      expect(useAuthStore.getState()).toMatchObject({
        user: COOKIE_SESSION.user,
        csrfToken: 'csrf-remote-login',
        sessionVersion: 'session-remote-login',
      })
    })
    expect(useContentCacheStore.getState().futureReport).toBeNull()
    expect(browser.channelInstances[0]?.posted).toEqual([])
  })

  it('ignores malformed or unversioned channel messages', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession.mockResolvedValue(COOKIE_SESSION)

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()
    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 2,
    })
    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
      user: 'should-not-be-accepted',
    })

    expect(mocks.fetchBffSession).toHaveBeenCalledOnce()
  })

  it('keeps the existing browser session visible when the server is in legacy mode', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'legacy',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    expect(mocks.onAuthStateChange).toHaveBeenCalledOnce()
    expect(mocks.migrateLegacySession).not.toHaveBeenCalled()
    expect(mocks.clearLegacySupabaseAuthStorage).not.toHaveBeenCalled()
    expect(mocks.stopAutoRefresh).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      csrfToken: null,
      sessionVersion: 'legacy:legacy-user:active',
      legacyAccessToken: 'legacy-access',
      error: null,
    })
  })

  it('migrates one legacy session and clears browser tokens only after success', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.migrateLegacySession.mockResolvedValue({
      ...COOKIE_SESSION,
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      sessionVersion: 'migrated-session',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => {
      expect(useAuthStore.getState().sessionVersion).toBe('migrated-session')
    })

    expect(mocks.migrateLegacySession).toHaveBeenCalledOnce()
    expect(mocks.migrateLegacySession).toHaveBeenCalledWith(LEGACY_SESSION)
    expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(browser.channelInstances[0]?.posted).toEqual([{
      type: 'session-may-have-changed',
      version: 1,
    }])
  })

  it('preserves legacy storage only for an explicitly retryable migration', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.migrateLegacySession.mockRejectedValue(new mocks.BffAuthError(
      'Migration can be retried.',
      503,
      'MIGRATION_RETRYABLE',
    ))

    const { useAuthStore } = await import('@/stores')
    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
      initialized: false,
      error: 'Could not secure your existing session. Please try again.',
    })
    expect(mocks.clearLegacySupabaseAuthStorage).not.toHaveBeenCalled()
    expect(mocks.stopAutoRefresh).not.toHaveBeenCalled()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(browser.channelInstances[0]?.posted).toEqual([])
  })

  it('destroys legacy persistence when migration requires a new sign-in', async () => {
    const browser = installAuthSyncBrowser()
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.migrateLegacySession.mockRejectedValue(new mocks.BffAuthError(
      'Refresh result is uncertain.',
      401,
      'MIGRATION_REAUTH_REQUIRED',
    ))

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
      legacyAccessToken: null,
      error: 'Your session needs to be signed in again.',
    })
    expect(mocks.stopAutoRefresh).toHaveBeenCalledOnce()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
    expect(browser.channelInstances[0]?.posted).toEqual([{
      type: 'session-may-have-changed',
      version: 1,
    }])
  })

  it.each([
    ['bare failure', () => new Error('Unknown failure')],
    [
      'unclassified server 503',
      () => new mocks.BffAuthError('Migration phase missing.', 503),
    ],
  ])(
    'fails closed for an unknown migration phase instead of treating it as an ordinary 503: %s',
    async (_caseName, createFailure) => {
      const browser = installAuthSyncBrowser()
      mocks.fetchBffSession.mockResolvedValue({
        authenticated: false,
        authMode: 'dual',
      })
      mocks.getSession.mockResolvedValue({
        data: { session: LEGACY_SESSION },
        error: null,
      })
      mocks.migrateLegacySession.mockRejectedValue(createFailure())

      const { useAuthStore } = await import('@/stores')
      useAuthStore.getState().init()
      await vi.waitFor(() => {
        expect(useAuthStore.getState().initialized).toBe(true)
      })

      expect(useAuthStore.getState().error).toBe(
        'Your session needs to be signed in again.',
      )
      expect(mocks.stopAutoRefresh).toHaveBeenCalledOnce()
      expect(mocks.unsubscribe).toHaveBeenCalledOnce()
      expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
      expect(browser.channelInstances[0]?.posted).toEqual([{
        type: 'session-may-have-changed',
        version: 1,
      }])
    },
  )

  it('keeps the current opaque identity when BFF logout fails', async () => {
    mocks.logoutBffSession.mockRejectedValue(new Error('Sign-out failed'))

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })

    await expect(useAuthStore.getState().signOut()).rejects.toThrow(
      'Could not sign out. Please try again.',
    )
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
  })

  it('logs out through the BFF with CSRF and clears the minimal state', async () => {
    mocks.logoutBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })
    await useAuthStore.getState().signOut()

    expect(mocks.logoutBffSession).toHaveBeenCalledWith('csrf-cookie')
    expect(mocks.onAuthStateChange).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
    })
  })

  it('rehydrates a missing CSRF token before revoking the BFF session', async () => {
    mocks.fetchBffSession.mockResolvedValue(COOKIE_SESSION)
    mocks.logoutBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: null,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })
    await useAuthStore.getState().signOut()

    expect(mocks.fetchBffSession).toHaveBeenCalledOnce()
    expect(mocks.logoutBffSession).toHaveBeenCalledWith('csrf-cookie')
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
    })
  })

  it('clears local BFF identity without a logout request only when hydration is signed out', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: null,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })
    await useAuthStore.getState().signOut()

    expect(mocks.logoutBffSession).not.toHaveBeenCalled()
    expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      csrfToken: null,
      sessionVersion: null,
    })
  })

  it('preserves the current identity when missing-CSRF hydration fails', async () => {
    mocks.fetchBffSession.mockRejectedValue(new Error('network diagnostic'))

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: null,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })

    await expect(useAuthStore.getState().signOut()).rejects.toThrow(
      'Could not sign out. Please try again.',
    )
    expect(mocks.logoutBffSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      csrfToken: null,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
  })

  it('keeps the rehydrated identity if revocation fails after recovering CSRF', async () => {
    mocks.fetchBffSession.mockResolvedValue(COOKIE_SESSION)
    mocks.logoutBffSession.mockRejectedValue(new Error('dependency diagnostic'))

    const { useAuthStore } = await import('@/stores')
    useAuthStore.setState({
      user: COOKIE_SESSION.user,
      csrfToken: null,
      sessionVersion: COOKIE_SESSION.sessionVersion,
      initialized: true,
      error: null,
    })

    await expect(useAuthStore.getState().signOut()).rejects.toThrow(
      'Could not sign out. Please try again.',
    )
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      csrfToken: COOKIE_SESSION.csrfToken,
      sessionVersion: COOKIE_SESSION.sessionVersion,
    })
  })

  it('logs out through Supabase in legacy mode and clears state only after success', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'legacy',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.signOut.mockResolvedValue({ error: null })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => {
      expect(useAuthStore.getState().legacyAccessToken).toBe('legacy-access')
    })
    await useAuthStore.getState().signOut()

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.logoutBffSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      sessionVersion: null,
      legacyAccessToken: null,
    })
  })

  it('preserves the legacy identity when Supabase sign-out fails', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'legacy',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.signOut.mockResolvedValue({ error: { message: 'Provider sign-out failed' } })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => {
      expect(useAuthStore.getState().legacyAccessToken).toBe('legacy-access')
    })

    await expect(useAuthStore.getState().signOut()).rejects.toThrow(
      'Provider sign-out failed',
    )
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      legacyAccessToken: 'legacy-access',
    })
  })

  it.each(['dual', 'opaque'] as const)(
    'starts email and Google OAuth through the BFF in %s mode without browser auth persistence',
    async (authMode) => {
      mocks.fetchBffSession.mockResolvedValue({
        authenticated: false,
        authMode,
      })
      mocks.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })
      mocks.startBffEmailLogin.mockResolvedValue({
        accepted: true,
        authMode,
        verificationCsrfToken: 'verify-email',
      })
      mocks.startBffOAuthLogin.mockResolvedValue({
        url: 'https://cinnabar.example/api/auth/oauth/authorize',
        authMode,
      })

      const { useAuthStore } = await import('@/stores')
      useAuthStore.getState().init()
      await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

      const emailStart = await useAuthStore.getState().signInWithEmail('  person@example.com  ')
      await useAuthStore.getState().signInWithOAuth('google')

      expect(mocks.startBffEmailLogin).toHaveBeenCalledWith('person@example.com')
      expect(emailStart).toEqual({
        accepted: true,
        authMode,
        verificationCsrfToken: 'verify-email',
      })
      expect(mocks.startBffOAuthLogin).toHaveBeenCalledWith('google')
      expect(mocks.assignBffOAuthRedirect).toHaveBeenCalledWith(
        'https://cinnabar.example/api/auth/oauth/authorize',
      )
      expect(mocks.signInWithOtp).not.toHaveBeenCalled()
      expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
      expect(mocks.getLegacySupabaseClient).toHaveBeenCalledTimes(authMode === 'dual' ? 1 : 0)
      expect(mocks.stopAutoRefresh).toHaveBeenCalledTimes(authMode === 'dual' ? 1 : 0)
      expect(mocks.clearLegacySupabaseAuthStorage).toHaveBeenCalledOnce()
    },
  )

  it('keeps legacy email and OAuth login on the browser Supabase client', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'legacy',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    mocks.signInWithOtp.mockResolvedValue({ error: null })
    mocks.signInWithOAuth.mockResolvedValue({ error: null })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    const emailStart = await useAuthStore.getState().signInWithEmail('  person@example.com  ')
    await useAuthStore.getState().signInWithOAuth('google')

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: { emailRedirectTo: undefined },
    })
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: undefined },
    })
    expect(mocks.startBffEmailLogin).not.toHaveBeenCalled()
    expect(mocks.startBffOAuthLogin).not.toHaveBeenCalled()
    expect(emailStart).toBeNull()
  })

  it.each(['dual', 'opaque'] as const)(
    'verifies a server-owned email OTP and hydrates the %s session',
    async (authMode) => {
      mocks.fetchBffSession.mockResolvedValue({
        authenticated: false,
        authMode,
      })
      mocks.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })
      mocks.startBffEmailLogin.mockResolvedValue({
        accepted: true,
        authMode,
        verificationCsrfToken: 'verify-email',
      })
      mocks.verifyBffEmailOtp.mockResolvedValue({
        ...COOKIE_SESSION,
        authMode,
        sessionVersion: 'verified-session',
        user: { id: 'verified-user', email: 'person@example.com' },
      })

      const { useAuthStore } = await import('@/stores')
      useAuthStore.getState().init()
      await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

      const started = await useAuthStore.getState().signInWithEmail(
        ' person@example.com ',
      )
      await useAuthStore.getState().verifyEmailOtp(
        ' person@example.com ',
        '012345',
        started?.verificationCsrfToken ?? '',
      )

      expect(mocks.verifyBffEmailOtp).toHaveBeenCalledWith(
        'person@example.com',
        '012345',
        'verify-email',
      )
      expect(useAuthStore.getState()).toMatchObject({
        user: { id: 'verified-user', email: 'person@example.com' },
        authMode,
        csrfToken: 'csrf-cookie',
        sessionVersion: 'verified-session',
        legacyAccessToken: null,
        error: null,
      })
      expect(mocks.signInWithOtp).not.toHaveBeenCalled()
      expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
    },
  )

  it('uses fixed OTP failure copy and never falls back to browser Supabase', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'opaque',
    })
    mocks.verifyBffEmailOtp.mockRejectedValue(
      new Error('vendor invalid otp diagnostic'),
    )

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    await expect(useAuthStore.getState().verifyEmailOtp(
      'person@example.com',
      '012345',
      'verify-email',
    )).rejects.toThrow(
      'Verification could not be completed. Please check the code and try again.',
    )
    expect(mocks.getLegacySupabaseClient).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does not fall back to Supabase when a dual-mode login preflight fails', async () => {
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    mocks.startBffEmailLogin.mockRejectedValue(
      new Error('Sign-in is temporarily unavailable. Please try again.'),
    )

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    await expect(
      useAuthStore.getState().signInWithEmail('person@example.com'),
    ).rejects.toThrow('Sign-in is temporarily unavailable. Please try again.')
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('broadcasts a successful callback once after commit without echoing ordinary or remote init', async () => {
    const browser = installAuthSyncBrowser()
    mocks.consumeAuthCallbackMarker
      .mockReturnValueOnce('success')
      .mockReturnValue(null)
    mocks.fetchBffSession.mockResolvedValue({
      ...COOKIE_SESSION,
      authMode: 'opaque',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    expect(mocks.consumeAuthCallbackMarker).toHaveBeenCalledOnce()
    expect(mocks.fetchBffSession).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      user: COOKIE_SESSION.user,
      error: null,
    })
    expect(browser.channelInstances[0]?.posted).toEqual([{
      type: 'session-may-have-changed',
      version: 1,
    }])

    await useAuthStore.getState().init()
    browser.channelInstances[0]?.emit({
      type: 'session-may-have-changed',
      version: 1,
    })
    await vi.waitFor(() => {
      expect(mocks.fetchBffSession).toHaveBeenCalledTimes(3)
    })
    expect(browser.channelInstances[0]?.posted).toEqual([{
      type: 'session-may-have-changed',
      version: 1,
    }])
  })

  it('shows only fixed retry copy for an error callback after consuming its marker', async () => {
    mocks.consumeAuthCallbackMarker.mockReturnValue('error')
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'opaque',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      error: 'Sign-in could not be completed. Please try again.',
    })
    expect(mocks.consumeAuthCallbackMarker).toHaveBeenCalledOnce()
  })

  it('preserves fixed callback failure copy while migrating an old dual session', async () => {
    mocks.consumeAuthCallbackMarker.mockReturnValue('error')
    mocks.fetchBffSession.mockResolvedValue({
      authenticated: false,
      authMode: 'dual',
    })
    mocks.getSession.mockResolvedValue({
      data: { session: LEGACY_SESSION },
      error: null,
    })
    mocks.migrateLegacySession.mockResolvedValue({
      ...COOKIE_SESSION,
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      sessionVersion: 'migrated-session',
    })

    const { useAuthStore } = await import('@/stores')
    useAuthStore.getState().init()
    await vi.waitFor(() => {
      expect(useAuthStore.getState().sessionVersion).toBe('migrated-session')
    })

    expect(useAuthStore.getState()).toMatchObject({
      user: { id: 'legacy-user', email: 'legacy@example.com' },
      error: 'Sign-in could not be completed. Please try again.',
    })
  })
})
