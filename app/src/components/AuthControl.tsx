/* ============================================================
   Header auth control — Sign in button, or email + Sign out
   once authenticated. Renders nothing when Supabase isn't
   configured so the header stays clean without env.
   ============================================================ */

import { useState } from 'react'
import { useAuthStore } from '@/stores'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AuthModal } from '@/components/AuthModal'
import { CreditWallet } from '@/components/CreditWallet'

export function AuthControl() {
  const {
    user,
    authMode,
    sessionVersion,
    legacyAccessToken,
    initialized,
    error: authError,
    init,
    signOut,
  } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const visibleAuthError = signOutError ?? authError

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOut()
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if ((!initialized || !authMode) && authError) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void init()}
          className="
            px-3.5 py-2 rounded-xl text-xs font-semibold
            bg-white/[0.04] border border-white/[0.08] text-text-secondary
            hover:bg-white/[0.08] hover:text-text
            transition-all duration-200
          "
        >
          Retry session
        </button>
        <span role="alert" className="max-w-52 text-xs text-misfortune">
          {authError}
        </span>
      </div>
    )
  }

  // Avoid a flash of the wrong state before the session resolves.
  if (!initialized || !authMode) return <div className="w-16 h-9" aria-hidden />
  if (!isSupabaseConfigured && authMode === 'legacy' && !user) return null

  if (user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        {sessionVersion && (
          <CreditWallet
            key={`${user.id}:${sessionVersion}`}
            userId={user.id}
            sessionVersion={sessionVersion}
            legacyAccessToken={legacyAccessToken}
          />
        )}
        <span
          className="hidden sm:inline max-w-[160px] truncate text-xs text-text-muted"
          title={user.email ?? undefined}
        >
          {user.email}
        </span>
        <button
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          aria-label={signingOut ? 'Signing out' : 'Sign out'}
          className="
            min-h-9 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium
            bg-white/[0.04] border border-white/[0.08] text-text-secondary
            hover:bg-white/[0.08] hover:text-text
            disabled:opacity-60 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          <span className="hidden sm:inline">
            {signingOut ? 'Signing out' : 'Sign out'}
          </span>
          <svg
            className="h-4 w-4 sm:hidden"
            aria-hidden
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M9 8V5.75A1.75 1.75 0 0 1 10.75 4h6.5A1.75 1.75 0 0 1 19 5.75v12.5A1.75 1.75 0 0 1 17.25 20h-6.5A1.75 1.75 0 0 1 9 18.25V16m4-4H3m0 0 3-3m-3 3 3 3"
            />
          </svg>
        </button>
        {visibleAuthError && (
          <span role="alert" className="text-xs text-misfortune">
            {visibleAuthError}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowModal(true)}
        className="
          px-3.5 py-2 rounded-xl text-xs font-semibold
          bg-gradient-to-r from-gold to-gold-dark text-night
          hover:from-gold-light hover:to-gold
          transition-all duration-200
        "
      >
        Sign in
      </button>
      {authError && (
        <span role="alert" className="max-w-52 text-xs text-misfortune">
          {authError}
        </span>
      )}
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
