/* ============================================================
   EmailCapture — reusable email opt-in
   Posts to the /api/subscribe proxy (which forwards to the Make
   webhook server-side). Mobile-first, site-styled, and compliant:
   self-discovery / entertainment framing only.
   ============================================================ */

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui'
import { analytics, type CaptureSource } from '@/lib/analytics'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface EmailCaptureProps {
  /** Where this opt-in lives — sent to analytics and the webhook. */
  source: CaptureSource
  /** Small heading above the field. */
  title?: string
  /** Supporting line under the heading. */
  description?: string
  /** Submit button label. */
  submitLabel?: string
  /** Confirmation shown after a successful submit. */
  successMessage?: string
  /** Called once the email is accepted (used for optimistic unlocks). */
  onSuccess?: () => void
  className?: string
}

export function EmailCapture({
  source,
  title = 'Want your self-discovery updates?',
  description = 'Occasional reflections and new features — for entertainment and self-discovery only. Unsubscribe anytime.',
  submitLabel = 'Keep me posted',
  successMessage = "You're on the list ✦",
  onSuccess,
  className = '',
}: EmailCaptureProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return

    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('submitting')
    setMessage('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Something went wrong. Please try again.')
      }

      analytics.emailCapture(source)
      setStatus('success')
      setMessage(successMessage)
      setEmail('')
      onSuccess?.()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div
        className={`
          flex items-center justify-center gap-2 rounded-xl
          border border-gold/25 bg-gold/[0.06]
          px-4 py-3 text-sm text-gold
          ${className}
        `}
        role="status"
      >
        <span aria-hidden>✓</span>
        {message}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full ${className}`} noValidate>
      {title && (
        <p className="text-sm font-medium text-text-secondary">{title}</p>
      )}
      {description && (
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === 'error') setStatus('idle')
          }}
          placeholder="you@example.com"
          aria-label="Email address"
          className="
            min-w-0 flex-1 rounded-xl px-4 py-3
            bg-white/[0.04] backdrop-blur-sm
            border border-white/[0.08]
            text-text placeholder:text-text-muted/60
            transition-all duration-200
            focus:outline-none focus:bg-white/[0.06]
            focus:border-gold/50 focus:shadow-[0_0_0_3px_rgba(201,162,75,0.12)]
            hover:border-white/[0.12]
          "
        />
        <Button
          type="submit"
          variant="gold"
          disabled={status === 'submitting'}
          className="shrink-0"
        >
          {status === 'submitting' ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-night border-t-transparent" />
              Sending
            </span>
          ) : (
            submitLabel
          )}
        </Button>
      </div>

      {status === 'error' && (
        <p className="mt-2 text-xs text-misfortune" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
