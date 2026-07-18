/* ============================================================
   Reusable email capture — posts to /api/subscribe with a source tag.
   Mobile-first, brand-styled, compliance-safe copy
   (self-discovery / entertainment only; no divination wording).
   ============================================================ */

import { useState, type FormEvent } from 'react'
import { isValidEmail, subscribeEmail } from '@/lib/subscribe'
import { analytics } from '@/lib/analytics'

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface EmailCaptureProps {
  /** Analytics + backend source label, e.g. "reading" | "exit_intent" | "soul_card". */
  source: string
  title?: string
  subtitle?: string
  ctaLabel?: string
  placeholder?: string
  /** Called once the email is successfully captured (e.g. to unlock a teaser). */
  onSuccess?: () => void
  className?: string
}

export function EmailCapture({
  source,
  title,
  subtitle,
  ctaLabel = 'Notify me',
  placeholder = 'you@example.com',
  onSuccess,
  className = '',
}: EmailCaptureProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return

    if (!isValidEmail(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('submitting')
    setMessage(null)
    try {
      await subscribeEmail(email, source)
      setStatus('success')
      setMessage("You're on the list — thank you.")
      analytics.emailCapture(source)
      onSuccess?.()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className={`text-center text-sm text-gold ${className}`}>
        <span className="mr-1">✓</span>
        {message}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full ${className}`}>
      {title && (
        <p className="text-sm font-medium text-text-secondary mb-1">{title}</p>
      )}
      {subtitle && <p className="text-xs text-text-muted mb-3">{subtitle}</p>}

      <div className="flex flex-col sm:flex-row gap-2">
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
          placeholder={placeholder}
          aria-label="Email address"
          className="
            flex-1 min-w-0 px-4 py-2.5 rounded-lg text-sm
            bg-white/[0.04] border border-white/[0.1]
            text-text placeholder:text-text-muted/60
            focus:outline-none focus:border-gold/40 focus:bg-white/[0.06]
            transition-colors
          "
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="
            shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold
            bg-gradient-to-r from-gold to-gold-dark text-night
            hover:from-gold-light hover:to-gold
            disabled:opacity-60 disabled:cursor-not-allowed
            transition-all
          "
        >
          {status === 'submitting' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-night border-t-transparent rounded-full animate-spin" />
              Sending
            </span>
          ) : (
            ctaLabel
          )}
        </button>
      </div>

      {status === 'error' && message && (
        <p className="mt-2 text-xs text-misfortune">{message}</p>
      )}

      <p className="mt-2 text-[11px] text-text-muted/70">
        For entertainment &amp; self-discovery. No spam — unsubscribe anytime.
      </p>
    </form>
  )
}
