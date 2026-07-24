/* ============================================================
   Soul Card — a shareable vertical card built from the user's
   already-computed chart (Life Palace star + element + keywords).
   Exported as an image via html2canvas, with a small QR to the site.
   Sits on the results page with a locked "hidden strength" teaser
   that unlocks optimistically on share or email capture.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import QRCode from 'qrcode'
import { useChartStore } from '@/stores'
import { deriveSoulCard, elementArticle, identityLine, type SoulCardData } from '@/lib/soul-card'
import { analytics } from '@/lib/analytics'
import { Button } from '@/components/ui'
import { EmailCapture } from '@/components/EmailCapture'

const FONT_DISPLAY = "'Cormorant Garamond', 'Georgia', serif"
const FONT_BODY = "'Inter', system-ui, sans-serif"

const SITE_URL = 'https://cinnabarastrology.com'
const SHARE_TEXT =
  'I just unlocked my Cinnabar Soul Card ✨ Eastern Astrology, in English — discover yours:'
const SHARE_COPY = `${SHARE_TEXT} ${SITE_URL}`

type SharePlatform = 'download' | 'pinterest' | 'x' | 'copy_link'
type CopyState = 'idle' | 'copied' | 'error'

export function SoulCard() {
  const { chart } = useChartStore()
  const cardRef = useRef<HTMLDivElement>(null)
  const downloadInFlightRef = useRef(false)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [name, setName] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  // Fire soul_card_view once when the card mounts.
  useEffect(() => {
    analytics.soulCardView()
  }, [])

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      clearTimeout(copyResetTimerRef.current)
    }
  }, [])

  // Build the QR (points at the homepage) once.
  useEffect(() => {
    let active = true
    QRCode.toDataURL(SITE_URL, { width: 120, margin: 1, color: { dark: '#12132b', light: '#F3ECDD' } })
      .then((url) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {
        /* QR is decorative; ignore failures */
      })
    return () => {
      active = false
    }
  }, [])

  const data: SoulCardData | null = chart ? deriveSoulCard(chart) : null

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || downloadInFlightRef.current) return

    downloadInFlightRef.current = true
    setDownloadError(null)
    setGenerating(true)
    let link: HTMLAnchorElement | null = null
    try {
      await document.fonts.ready
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#12132b',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      })
      link = document.createElement('a')
      link.download = 'cinnabar-soul-card.png'
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
    } catch (err) {
      console.error('Soul Card image generation failed:', err)
      setDownloadError("We couldn't save this image. Please try again.")
    } finally {
      link?.remove()
      downloadInFlightRef.current = false
      setGenerating(false)
    }
  }, [])

  const copyShareLink = useCallback(async () => {
    if (copyResetTimerRef.current !== null) {
      clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = null
    }
    setCopyState('idle')

    try {
      const clipboard = navigator.clipboard
      if (!clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await clipboard.writeText(SHARE_COPY)
      setCopyState('copied')
      copyResetTimerRef.current = setTimeout(() => {
        setCopyState('idle')
        copyResetTimerRef.current = null
      }, 2000)
    } catch (err) {
      console.error('Soul Card link copy failed:', err)
      setCopyState('error')
    }
  }, [])

  const share = useCallback(
    (platform: SharePlatform) => {
      analytics.shareClick(platform)
      setUnlocked(true) // optimistic unlock, no server check

      const encodedText = encodeURIComponent(SHARE_TEXT)
      const encodedUrl = encodeURIComponent(SITE_URL)

      if (platform === 'download') {
        void handleDownload()
      } else if (platform === 'pinterest') {
        window.open(
          `https://www.pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`,
          '_blank',
          'noopener,noreferrer'
        )
      } else if (platform === 'x') {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
          '_blank',
          'noopener,noreferrer'
        )
      } else if (platform === 'copy_link') {
        void copyShareLink()
      }
    },
    [copyShareLink, handleDownload]
  )

  if (!chart || !data) return null

  const accent = data.element.color
  const accentSoft = data.element.soft
  const identity = identityLine(data)

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <h3
          className="text-xl lg:text-2xl font-semibold text-text mb-1"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Your Cinnabar Soul Card
        </h3>
        <p className="text-text-muted text-sm">
          Built from your chart — share it, or keep it for yourself.
        </p>
      </div>

      {/* Optional name personalization */}
      <div className="max-w-xs mx-auto">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          placeholder="Add your name (optional)"
          aria-label="Name for your Soul Card"
          className="
            w-full px-4 py-2 rounded-lg text-sm text-center
            bg-white/[0.04] border border-white/[0.1]
            text-text placeholder:text-text-muted/60
            focus:outline-none focus:border-gold/40 transition-colors
          "
        />
      </div>

      {/* The card (also the html2canvas capture target) — hardcoded colors */}
      <div
        ref={cardRef}
        style={{
          width: '340px',
          height: '600px',
          background: '#12132b',
          borderRadius: '18px',
          position: 'relative',
          overflow: 'hidden',
          margin: '0 auto',
        }}
      >
        {/* Element-tinted glow */}
        <div
          style={{
            position: 'absolute',
            top: '-30%',
            left: '-20%',
            width: '140%',
            height: '55%',
            background: `radial-gradient(ellipse at center, ${accentSoft} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
        {/* Double border in element accent */}
        <div style={{ position: 'absolute', inset: '8px', borderRadius: '14px', border: `1px solid ${accentSoft}`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: '12px', borderRadius: '10px', border: '1px solid rgba(201, 162, 75, 0.12)', pointerEvents: 'none' }} />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: '34px 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Top: name + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ width: '32px', height: '1px', background: accentSoft }} />
            <span style={{ color: accent, fontSize: '11px', letterSpacing: '0.14em', fontFamily: FONT_BODY }}>☆ · ☆ · ☆</span>
            <span style={{ width: '32px', height: '1px', background: accentSoft }} />
          </div>
          {name.trim() && (
            <p style={{ color: '#F3ECDD', fontSize: '22px', fontFamily: FONT_DISPLAY, margin: '2px 0 0', textAlign: 'center' }}>
              {name.trim()}
            </p>
          )}
          <p style={{ color: accent, fontSize: '13px', letterSpacing: '0.18em', fontFamily: FONT_BODY, textTransform: 'uppercase', margin: '6px 0 0' }}>
            Your Cinnabar Soul Card
          </p>

          {/* Middle: core identity + element + keywords */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#F3ECDD', fontSize: '26px', lineHeight: 1.25, fontFamily: FONT_DISPLAY, margin: 0 }}>
                {identity}
              </p>
              <p style={{ color: accent, fontSize: '14px', letterSpacing: '0.1em', fontFamily: FONT_BODY, marginTop: '10px' }}>
                {elementArticle(data.element.name)} {data.element.name} soul
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', padding: '0 10px' }}>
              {data.keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: `1px solid ${accent}`,
                    color: '#F3ECDD',
                    fontSize: '13px',
                    fontFamily: FONT_BODY,
                    background: accentSoft,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom: brand + URL + QR + disclaimer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', justifyContent: 'center', marginBottom: '10px' }}>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR code to cinnabarastrology.com"
                width={54}
                height={54}
                style={{ borderRadius: '6px', background: '#F3ECDD', padding: '3px' }}
              />
            )}
            <div style={{ textAlign: 'left' }}>
              <p style={{ color: '#C9A24B', fontSize: '17px', letterSpacing: '0.12em', fontFamily: FONT_DISPLAY, margin: 0 }}>
                CINNABAR
              </p>
              <p style={{ color: 'rgba(224, 192, 120, 0.75)', fontSize: '11px', fontFamily: FONT_BODY, margin: '2px 0 0' }}>
                cinnabarastrology.com
              </p>
            </div>
          </div>
          <p style={{ color: 'rgba(201, 162, 75, 0.5)', fontSize: '9px', letterSpacing: '0.08em', fontFamily: FONT_BODY, textAlign: 'center', margin: 0 }}>
            For entertainment &amp; self-discovery
          </p>
        </div>
      </div>

      {/* Locked "hidden strength" teaser */}
      <div
        className="max-w-md mx-auto relative p-5 rounded-xl border border-white/[0.1] bg-white/[0.02] overflow-hidden"
      >
        <p className="text-sm font-semibold text-gold mb-2 flex items-center gap-2">
          <span>{unlocked ? '✦' : '🔒'}</span> Your hidden strength
        </p>
        <p
          className={`text-sm text-text-secondary leading-relaxed transition-all duration-500 ${
            unlocked ? '' : 'blur-sm select-none'
          }`}
        >
          {data.hiddenStrength}
        </p>
        {!unlocked && (
          <p className="mt-3 text-xs text-text-muted">
            Share your card or drop your email below to reveal it.
          </p>
        )}
      </div>

      {/* Share row */}
      <div className="max-w-md mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button
            size="sm"
            variant="gold"
            disabled={generating}
            aria-describedby={downloadError ? 'soul-card-download-error' : undefined}
            onClick={() => share('download')}
          >
            {generating ? 'Saving…' : '⬇ Image'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => share('pinterest')}>
            Pinterest
          </Button>
          <Button size="sm" variant="secondary" onClick={() => share('x')}>
            Post on X
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-describedby={copyState !== 'idle' ? 'soul-card-copy-feedback' : undefined}
            onClick={() => share('copy_link')}
          >
            {copyState === 'copied' ? '✓ Copied' : 'Copy link'}
          </Button>
        </div>
        {downloadError && (
          <p
            id="soul-card-download-error"
            role="alert"
            className="mt-3 text-sm text-rose-300"
          >
            {downloadError}
          </p>
        )}
        {copyState === 'copied' && (
          <p
            id="soul-card-copy-feedback"
            role="status"
            className="mt-3 text-sm text-text-secondary"
          >
            Share link copied.
          </p>
        )}
        {copyState === 'error' && (
          <p
            id="soul-card-copy-feedback"
            role="alert"
            className="mt-3 text-sm text-rose-300"
          >
            We couldn't copy the link. Copy this address manually: {SITE_URL}
          </p>
        )}

        {/* Or unlock via email */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <EmailCapture
            source="soul_card"
            title="Prefer email? Unlock it instantly."
            subtitle="We'll send occasional self-discovery notes — nothing more."
            ctaLabel="Unlock"
            onSuccess={() => setUnlocked(true)}
          />
        </div>
      </div>
    </div>
  )
}
