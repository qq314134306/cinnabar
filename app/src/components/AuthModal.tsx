/* ============================================================
   Sign-in modal — passwordless email and OAuth via the active auth authority.
   Brand-styled, mobile-first, self-discovery / entertainment tone.
   ============================================================ */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react'
import { useAuthStore, type OAuthProvider } from '@/stores'
import { EMAIL_OTP_VERIFICATION_ERROR_MESSAGE } from '@/lib/supabase'
import { isValidEmail } from '@/lib/subscribe'
import { SocialSignInButton } from '@/components/SocialSignInButton'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type VerificationStatus = 'idle' | 'verifying' | 'error'
const EMAIL_OTP_PATTERN = /^[0-9]{6}$/

interface AuthModalProps {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithEmail, signInWithOAuth, verifyEmailOtp } = useAuthStore()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [emailVerificationStarted, setEmailVerificationStarted] = useState(false)
  const [verificationCsrfToken, setVerificationCsrfToken] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle')
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  // OAuth is a separate concern from the email form (different loading/error).
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const emailErrorId = useId()
  const closeModal = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [closeModal])

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
      const submittedEmail = email.trim()
      const result = await signInWithEmail(submittedEmail)
      setEmail(submittedEmail)
      setEmailVerificationStarted(Boolean(result))
      setVerificationCsrfToken(result?.verificationCsrfToken ?? null)
      setOtp('')
      setVerificationStatus('idle')
      setVerificationMessage(null)
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const updateOtp = (value: string) => {
    setOtp(value.replace(/[^0-9]/gu, '').slice(0, 6))
    if (verificationStatus === 'error') {
      setVerificationStatus('idle')
      setVerificationMessage(null)
    }
  }

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    updateOtp(event.clipboardData.getData('text'))
  }

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault()
    if (verificationStatus === 'verifying' || !verificationCsrfToken) return
    if (!EMAIL_OTP_PATTERN.test(otp)) {
      setVerificationStatus('error')
      setVerificationMessage('Enter the 6-digit code from your email.')
      return
    }

    setVerificationStatus('verifying')
    setVerificationMessage(null)
    try {
      await verifyEmailOtp(email, otp, verificationCsrfToken)
      onClose()
    } catch {
      // Verification attempts are terminal server-side. Destroy the in-memory
      // synchronizer token so this UI cannot retry an already-consumed flow.
      setVerificationCsrfToken(null)
      setVerificationStatus('error')
      setVerificationMessage(EMAIL_OTP_VERIFICATION_ERROR_MESSAGE)
    }
  }

  const handleStartAgain = () => {
    setStatus('idle')
    setMessage(null)
    setOtp('')
    setEmailVerificationStarted(false)
    setVerificationCsrfToken(null)
    setVerificationStatus('idle')
    setVerificationMessage(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="
          relative w-full max-w-md p-6 lg:p-8 rounded-2xl
          bg-gradient-to-br from-night-light to-night
          border border-gold/20 shadow-[0_8px_40px_rgba(0,0,0,0.5)]
        "
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeModal}
          aria-label="Close sign in"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-text-muted hover:text-text hover:bg-white/[0.06] transition-colors"
        >
          <span aria-hidden="true">✕</span>
        </button>

        {status === 'sent' && emailVerificationStarted ? (
          <div className="text-center py-4">
            <div aria-hidden="true" className="text-3xl mb-3 text-gold/80">✉</div>
            <h3 id={titleId} className="text-xl font-semibold text-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Enter your verification code
            </h3>
            <p id={descriptionId} className="text-sm text-text-muted">
              We sent a 6-digit code to{' '}
              <span className="text-text-secondary">{email}</span>.
            </p>

            <form className="mt-5" onSubmit={handleVerify}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                disabled={!verificationCsrfToken}
                onChange={(event) => updateOtp(event.target.value)}
                onPaste={handleOtpPaste}
                aria-label="6-digit verification code"
                aria-invalid={verificationStatus === 'error'}
                aria-describedby={
                  verificationMessage
                    ? `${verificationCsrfToken ? 'email-otp-help ' : ''}email-otp-error`
                    : verificationCsrfToken
                      ? 'email-otp-help'
                      : undefined
                }
                className="
                  w-full px-4 py-3 rounded-lg text-center text-xl tracking-[0.35em]
                  bg-white/[0.04] border border-white/[0.1]
                  text-text placeholder:text-text-muted/60
                  focus:outline-none focus:border-gold/40 focus:bg-white/[0.06]
                  transition-colors
                "
                placeholder="000000"
              />
              {verificationCsrfToken && (
                <p id="email-otp-help" className="mt-2 text-xs text-text-muted">
                  You can also use the secure link in your email.
                </p>
              )}

              {verificationCsrfToken ? (
                <button
                  type="submit"
                  disabled={
                    verificationStatus === 'verifying'
                    || !EMAIL_OTP_PATTERN.test(otp)
                  }
                  className="
                    mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-semibold
                    bg-gradient-to-r from-gold to-gold-dark text-night
                    hover:from-gold-light hover:to-gold
                    disabled:opacity-60 disabled:cursor-not-allowed
                    transition-all
                  "
                >
                  {verificationStatus === 'verifying' ? 'Verifying' : 'Verify'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartAgain}
                  className="
                    mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-semibold
                    bg-gradient-to-r from-gold to-gold-dark text-night
                    hover:from-gold-light hover:to-gold
                    transition-all
                  "
                >
                  Start again
                </button>
              )}

              {verificationMessage && (
                <p id="email-otp-error" role="alert" className="mt-2 text-xs text-misfortune">
                  {verificationMessage}
                </p>
              )}
            </form>
          </div>
        ) : status === 'sent' ? (
          <div className="text-center py-4">
            <div aria-hidden="true" className="text-3xl mb-3 text-gold/80">✉</div>
            <h3 id={titleId} className="text-xl font-semibold text-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Check your inbox
            </h3>
            <p id={descriptionId} className="text-sm text-text-muted">
              We sent a sign-in link to <span className="text-text-secondary">{email}</span>.
              Open it on this device to continue.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <div aria-hidden="true" className="text-3xl mb-2 text-gold/70">☆</div>
              <h3 id={titleId} className="text-xl font-semibold text-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                Sign in to Cinnabar
              </h3>
              <p id={descriptionId} className="text-sm text-text-muted">
                Sign in to access your Cinnabar account — no password needed.
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
              <p role="alert" className="mt-2 text-xs text-misfortune text-center">{oauthError}</p>
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
                aria-invalid={status === 'error' ? 'true' : undefined}
                aria-describedby={status === 'error' && message ? emailErrorId : undefined}
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
                    <span
                      aria-hidden="true"
                      className="w-3.5 h-3.5 border-2 border-night border-t-transparent rounded-full animate-spin"
                    />
                    Sending link
                  </span>
                ) : (
                  'Email me a sign-in link'
                )}
              </button>

              {status === 'error' && message && (
                <p
                  id={emailErrorId}
                  role="alert"
                  className="mt-2 text-xs text-misfortune"
                >
                  {message}
                </p>
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
