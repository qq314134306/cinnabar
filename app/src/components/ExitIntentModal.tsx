/* ============================================================
   Exit-intent email capture — shows once per session when the
   cursor leaves toward the top of the viewport (desktop leave
   signal). Never blocks the page; dismissible.
   ============================================================ */

import { useEffect, useState } from 'react'
import { EmailCapture } from '@/components/EmailCapture'

const SESSION_KEY = 'cinnabar_exit_intent_shown'

export function ExitIntentModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return

    const handleMouseOut = (e: MouseEvent) => {
      // Cursor left through the top edge and isn't entering another element.
      if (e.clientY <= 0 && !e.relatedTarget) {
        sessionStorage.setItem(SESSION_KEY, '1')
        setOpen(true)
        document.removeEventListener('mouseout', handleMouseOut)
      }
    }

    document.addEventListener('mouseout', handleMouseOut)
    return () => document.removeEventListener('mouseout', handleMouseOut)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
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
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-text-muted hover:text-text hover:bg-white/[0.06] transition-colors"
        >
          ✕
        </button>

        <div className="text-center mb-5">
          <div className="text-3xl mb-2 text-gold/70">☆</div>
          <h3
            className="text-xl font-semibold text-text mb-2"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Before you go…
          </h3>
          <p className="text-sm text-text-muted">
            Want a few gentle self-discovery notes from your chart? Leave your email
            and we'll keep you posted — entertainment only, no spam.
          </p>
        </div>

        <EmailCapture
          source="exit_intent"
          ctaLabel="Keep me posted"
          onSuccess={() => setTimeout(() => setOpen(false), 1400)}
        />
      </div>
    </div>
  )
}
