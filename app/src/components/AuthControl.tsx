/* ============================================================
   Header auth control — Sign in button, or email + Sign out
   once authenticated. Renders nothing when Supabase isn't
   configured so the header stays clean without env.
   ============================================================ */

import { useState } from 'react'
import { useAuthStore } from '@/stores'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AuthModal } from '@/components/AuthModal'

export function AuthControl() {
  const { user, initialized, signOut } = useAuthStore()
  const [showModal, setShowModal] = useState(false)

  if (!isSupabaseConfigured) return null
  // Avoid a flash of the wrong state before the session resolves.
  if (!initialized) return <div className="w-16 h-9" aria-hidden />

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden sm:inline max-w-[160px] truncate text-xs text-text-muted"
          title={user.email ?? undefined}
        >
          {user.email}
        </span>
        <button
          onClick={() => void signOut()}
          className="
            px-3 py-2 rounded-xl text-xs font-medium
            bg-white/[0.04] border border-white/[0.08] text-text-secondary
            hover:bg-white/[0.08] hover:text-text
            transition-all duration-200
          "
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <>
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
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
