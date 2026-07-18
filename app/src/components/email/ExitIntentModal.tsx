/* ============================================================
   ExitIntentModal — one gentle email invite per session when the
   cursor leaves toward the top of the page (desktop exit intent).
   Touch devices never fire mouseleave, so this stays desktop-only.
   ============================================================ */

import { useEffect, useState } from 'react'
import { EmailCapture } from './EmailCapture'

const SESSION_KEY = 'cinnabar-exit-intent-shown'

export function ExitIntentModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return

    const handleMouseOut = (e: MouseEvent) => {
      // Only trigger when the pointer actually leaves through the top edge.
      if (e.clientY > 0 || e.relatedTarget) return
      sessionStorage.setItem(SESSION_KEY, '1')
      setOpen(true)
      document.removeEventListener('mouseout', handleMouseOut)
    }

    // Give the visitor a moment to engage before arming the trap.
    const timer = window.setTimeout(() => {
      document.addEventListener('mouseout', handleMouseOut)
    }, 5_000)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseout', handleMouseOut)
    }
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Stay in touch with Cinnabar"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-night/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Card */}
      <div
        className="
          relative w-full max-w-md rounded-2xl p-6
          bg-gradient-to-br from-white/[0.08] to-white/[0.02]
          backdrop-blur-xl border border-white/[0.1]
          shadow-[0_8px_40px_rgba(0,0,0,0.45)]
        "
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 text-text-muted hover:text-text transition-colors"
        >
          ✕
        </button>

        <div className="mb-4 text-center">
          <div className="mb-2 text-2xl text-gold/70">☆</div>
          <h3
            className="text-xl font-semibold text-text"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Before you drift off…
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Get the occasional Cinnabar reflection — a little more self-discovery, for
            entertainment only.
          </p>
        </div>

        <EmailCapture
          source="exit_intent"
          title=""
          description=""
          submitLabel="Send me updates"
          successMessage="Lovely — you’re on the list ✦"
          onSuccess={() => setTimeout(() => setOpen(false), 1500)}
        />
      </div>
    </div>
  )
}
