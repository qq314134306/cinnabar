/* ============================================================
   Sign-in modal — passwordless magic link / OTP via Supabase.
   Brand-styled, mobile-first, self-discovery / entertainment tone.
   ============================================================ */

import { useState, type FormEvent } from 'react'
import { useAuthStore, type OAuthProvider } from '@/stores'
import { isValidEmail } from '@/lib/subscribe'
import { SocialSignInButton } from '@/components/SocialSignInButton'

type Status = 'idle' | 'sending' | 'sent' | 'error'

interface AuthModalProps {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithEmail, signInWithOAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  // OAuth is a separate concern from the email form (different loading/error).
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const handleOAuth = async (provider: OAuthProvider) => {
    if (oauthLoading) return
    setOauthLoading(provider)
    setOauthError(null)
    try {
      // On success the browser redirects to the provider; this stays "loading".
      await signInWithOAuth(provider)
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Could not start sign-in. Please try again.')
      setOauthLoading(null)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    if (!isValidEmail(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }
    setStatus('sending')
    setMessage(null)
    try {
      await signInWithEmail(email)
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="
          relative w-full max-w-md p-6 lg:p-8 rounded-2xl
          bg-gradient-to-br from-night-light to-night
          border border-gold/20 shadow-[0_8px_40px_rgba(0,0,0,0.5)]
        "
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-text-muted hover:text-text hover:bg-white/[0.06] transition-colors"
        >
          ✕
        </button>

        {status === 'sent' ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-3 text-gold/80">✉</div>
            <h3 className="text-xl font-semibold text-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Check your inbox
            </h3>
            <p className="text-sm text-text-muted">
              We sent a sign-in link to <span className="text-text-secondary">{email}</span>.
              Open it on this device to continue.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className="text-3xl mb-2 text-gold/70">☆</div>
              <h3 className="text-xl font-semibold text-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                Sign in to Cinnabar
              </h3>
              <p className="text-sm text-text-muted">
                Save your charts and cards across visits — no password needed.
              </p>
            </div>

            {/* Social sign-in (Google now; Facebook reserved) */}
            <div className="space-y-2.5">
              <SocialSignInButton
                provider="google"
                onClick={() => void handleOAuth('google')}
                loading={oauthLoading === 'google'}
                disabled={oauthLoading !== null}
              />
            </div>

            {oauthError && (
              <p className="mt-2 text-xs text-misfortune text-center">{oauthError}</p>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <span className="h-px flex-1 bg-white/[0.1]" />
              <span className="text-xs text-text-muted">or</span>
              <span className="h-px flex-1 bg-white/[0.1]" />
            </div>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (status === 'error') {
                    setStatus('idle')
                    setMessage(null)
                  }
                }}
                placeholder="you@example.com"
                aria-label="Email address"
                className="
                  w-full px-4 py-2.5 rounded-lg text-sm
                  bg-white/[0.04] border border-white/[0.1]
                  text-text placeholder:text-text-muted/60
                  focus:outline-none focus:border-gold/40 focus:bg-white/[0.06]
                  transition-colors
                "
              />

              <button
                type="submit"
                disabled={status === 'sending'}
                className="
                  mt-3 w-full px-4 py-2.5 rounded-lg text-sm font-semibold
                  bg-gradient-to-r from-gold to-gold-dark text-night
                  hover:from-gold-light hover:to-gold
                  disabled:opacity-60 disabled:cursor-not-allowed
                  transition-all
                "
              >
                {status === 'sending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-night border-t-transparent rounded-full animate-spin" />
                    Sending link
                  </span>
                ) : (
                  'Email me a sign-in link'
                )}
              </button>

              {status === 'error' && message && (
                <p className="mt-2 text-xs text-misfortune">{message}</p>
              )}
            </form>

            <p className="mt-4 text-[11px] text-text-muted/70 text-center">
              For entertainment &amp; self-discovery. By continuing you agree this is
              not professional advice.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
