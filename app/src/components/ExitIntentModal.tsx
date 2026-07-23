/* ============================================================
   Exit-intent email capture — shows once per session when the
   cursor leaves toward the top of the viewport (desktop leave
   signal). Never blocks the page; dismissible.
   ============================================================ */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { EmailCapture } from '@/components/EmailCapture'

const SESSION_KEY = 'cinnabar_exit_intent_shown'

export function ExitIntentModal() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const closeModal = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return
    } catch {
      // Session storage may be unavailable; the once-per-session hint becomes
      // best-effort while the dialog itself remains usable.
    }

    const handleMouseOut = (e: MouseEvent) => {
      // Cursor left through the top edge and isn't entering another element.
      if (e.clientY <= 0 && !e.relatedTarget) {
        try {
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // See the read guard above.
        }
        previousFocusRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
        setOpen(true)
        document.removeEventListener('mouseout', handleMouseOut)
      }
    }

    document.addEventListener('mouseout', handleMouseOut)
    return () => document.removeEventListener('mouseout', handleMouseOut)
  }, [])

  useEffect(() => {
    if (!open) return
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
  }, [closeModal, open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  if (!open) return null

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
          aria-label="Close email signup"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-text-muted hover:text-text hover:bg-white/[0.06] transition-colors"
        >
          <span aria-hidden="true">✕</span>
        </button>

        <div className="text-center mb-5">
          <div aria-hidden="true" className="text-3xl mb-2 text-gold/70">☆</div>
          <h3
            id={titleId}
            className="text-xl font-semibold text-text mb-2"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Before you go…
          </h3>
          <p id={descriptionId} className="text-sm text-text-muted">
            Want a few gentle self-discovery notes from your chart? Leave your email
            and we'll keep you posted — entertainment only, no spam.
          </p>
        </div>

        <EmailCapture
          source="exit_intent"
          ctaLabel="Keep me posted"
          onSuccess={() => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
            closeTimerRef.current = setTimeout(closeModal, 1400)
          }}
        />
      </div>
    </div>
  )
}
