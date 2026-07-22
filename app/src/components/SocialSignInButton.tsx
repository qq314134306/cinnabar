/* ============================================================
   Reusable social sign-in button (config-driven).
   Google is wired now; Facebook config is reserved for later.
   Official provider logo on a brand-consistent dark button.
   ============================================================ */

import type { ReactNode } from 'react'
import type { OAuthProvider } from '@/stores'

/** Official multi-color Google "G" mark. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

/** Official Facebook "f" mark (reserved — not yet wired in the modal). */
function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  )
}

const PROVIDER_CONFIG: Record<OAuthProvider, { label: string; icon: ReactNode }> = {
  google: { label: 'Continue with Google', icon: <GoogleIcon /> },
  facebook: { label: 'Continue with Facebook', icon: <FacebookIcon /> },
}

interface SocialSignInButtonProps {
  provider: OAuthProvider
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}

export function SocialSignInButton({ provider, onClick, loading = false, disabled = false }: SocialSignInButtonProps) {
  const { label, icon } = PROVIDER_CONFIG[provider]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="
        w-full flex items-center justify-center gap-3
        px-4 py-2.5 rounded-lg text-sm font-medium
        bg-white/[0.06] border border-white/[0.12] text-text
        hover:bg-white/[0.1] hover:border-gold/40
        disabled:opacity-60 disabled:cursor-not-allowed
        transition-all
      "
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="inline-flex items-center justify-center rounded-full bg-white p-1">{icon}</span>
      )}
      <span>{loading ? 'Redirecting…' : label}</span>
    </button>
  )
}
