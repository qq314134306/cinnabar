/* ============================================================
   Soul Card — a shareable, vertical "who you are" card built from
   the user's already-cast chart (Life Palace star + element + keywords).
   Exported as an image with html2canvas; shares/email optimistically
   unlock a hooky teaser (never the paid Future Report).
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import QRCode from 'qrcode'
import { useChartStore } from '@/stores'
import { buildSoulCardData, type SoulCardData } from '@/lib/soul-card'
import { translateFiveElementsClass } from '@/lib/ziwei-glossary'
import { Button } from '@/components/ui'
import { EmailCapture } from '@/components/email'
import { analytics, type SharePlatform } from '@/lib/analytics'

/* html2canvas cannot resolve CSS variables — fonts hardcoded (matches ShareCard). */
const FONT_DISPLAY = "'Cormorant Garamond', 'Georgia', serif"
const FONT_BODY = "'Inter', system-ui, sans-serif"

const SITE_URL = 'https://cinnabarastrology.com'
const SHARE_TEXT =
  'I just unlocked my Cinnabar Soul Card ✦ Discover your Eastern-astrology archetype — for entertainment & self-discovery.'

/* ------------------------------------------------------------
   Soul Card
   ------------------------------------------------------------ */

export function SoulCard() {
  const { chart } = useChartStore()
  const cardRef = useRef<HTMLDivElement>(null)

  const [data, setData] = useState<SoulCardData | null>(null)
  const [name, setName] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [unlocked, setUnlocked] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Build the card data from the real chart.
  useEffect(() => {
    setData(chart ? buildSoulCardData(chart) : null)
  }, [chart])

  // Generate the homepage QR once.
  useEffect(() => {
    QRCode.toDataURL(SITE_URL, {
      margin: 1,
      width: 160,
      color: { dark: '#12132b', light: '#F3ECDD' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [])

  // Fire the view event once the card is actually shown.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (data && !viewedRef.current) {
      viewedRef.current = true
      analytics.soulCardView()
    }
  }, [data])

  const unlock = useCallback(() => setUnlocked(true), [])

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return
    setGenerating(true)
    try {
      await document.fonts.ready
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true,
      })
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'cinnabar-soul-card.png'
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      analytics.shareClick('download')
      unlock()
    } catch (err) {
      console.error('Soul Card export failed:', err)
      alert(`Image export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }, [unlock])

  const openShare = useCallback(
    (platform: Exclude<SharePlatform, 'download' | 'copy_link'>) => {
      const urls: Record<typeof platform, string> = {
        pinterest: `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(
          SITE_URL
        )}&description=${encodeURIComponent(SHARE_TEXT)}`,
        x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          SHARE_TEXT
        )}&url=${encodeURIComponent(SITE_URL)}`,
      }
      window.open(urls[platform], '_blank', 'noopener,noreferrer')
      analytics.shareClick(platform)
      unlock()
    },
    [unlock]
  )

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${SITE_URL}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be blocked; still count the intent and unlock.
    }
    analytics.shareClick('copy_link')
    unlock()
  }, [unlock])

  if (!chart || !data) return null

  const { element, coreStarPinyin, coreStarArchetype, keywords, teaser, borrowed } = data
  const elementClassLabel = translateFiveElementsClass(chart.fiveElementsClass)

  return (
    <div className="space-y-6">
      {/* Optional name */}
      <div className="mx-auto max-w-xs">
        <input
          type="text"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          aria-label="Name for your Soul Card"
          className="
            w-full rounded-xl px-4 py-2.5 text-center text-sm
            bg-white/[0.04] border border-white/[0.08]
            text-text placeholder:text-text-muted/60
            focus:outline-none focus:border-gold/40
          "
        />
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        style={{
          width: '340px',
          height: '600px',
          background: `linear-gradient(160deg, ${element.bgFrom} 0%, ${element.bgTo} 100%)`,
          borderRadius: '18px',
          position: 'relative',
          overflow: 'hidden',
          margin: '0 auto',
        }}
      >
        {/* Element glow */}
        <div
          style={{
            position: 'absolute',
            top: '-90px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '260px',
            height: '260px',
            borderRadius: '50%',
            background: element.accentSoft,
            filter: 'blur(70px)',
            opacity: 0.35,
            pointerEvents: 'none',
          }}
        />

        {/* Double border */}
        <div style={{ position: 'absolute', inset: '8px', borderRadius: '14px', border: `1px solid ${element.accentSoft}`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: '12px', borderRadius: '10px', border: '1px solid rgba(201, 162, 75, 0.14)', pointerEvents: 'none' }} />

        {/* Corner stars */}
        <div style={{ position: 'absolute', top: '18px', left: '18px', color: element.accentSoft, fontSize: '16px' }}>✦</div>
        <div style={{ position: 'absolute', top: '18px', right: '18px', color: element.accentSoft, fontSize: '16px' }}>✦</div>
        <div style={{ position: 'absolute', bottom: '18px', left: '18px', color: element.accentSoft, fontSize: '16px' }}>✦</div>
        <div style={{ position: 'absolute', bottom: '18px', right: '18px', color: element.accentSoft, fontSize: '16px' }}>✦</div>

        {/* Content */}
        <div style={{ position: 'absolute', inset: 0, padding: '34px 28px', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '17px', letterSpacing: '0.04em', color: '#F3ECDD', fontFamily: FONT_DISPLAY }}>
              {name.trim() || 'Your'}
            </p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', letterSpacing: '0.28em', textTransform: 'uppercase', color: element.accent, fontFamily: FONT_BODY }}>
              Cinnabar Soul Card
            </p>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '18px 0' }}>
            <div style={{ width: '40px', height: '1px', background: element.accentSoft }} />
            <span style={{ color: element.accent, fontSize: '11px', letterSpacing: '0.1em' }}>☆ · ☆ · ☆</span>
            <div style={{ width: '40px', height: '1px', background: element.accentSoft }} />
          </div>

          {/* Core identity */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '13px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(224,192,120,0.7)', fontFamily: FONT_BODY }}>
              {element.label} · {coreStarArchetype.replace(/^the /i, '')}
            </p>
            <h2 style={{ margin: '10px 0 0 0', fontSize: '40px', lineHeight: 1.05, color: '#F3ECDD', fontFamily: FONT_DISPLAY }}>
              {coreStarPinyin}
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: '15px', fontStyle: 'italic', color: element.accent, fontFamily: FONT_DISPLAY }}>
              {coreStarArchetype}
            </p>

            {/* Keyword chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '22px' }}>
              {keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: `1px solid ${element.accentSoft}`,
                    color: '#F3ECDD',
                    fontSize: '12px',
                    letterSpacing: '0.04em',
                    fontFamily: FONT_BODY,
                  }}
                >
                  {k}
                </span>
              ))}
            </div>

            <p style={{ margin: '20px 0 0 0', fontSize: '11px', color: 'rgba(201,162,75,0.6)', fontFamily: FONT_BODY }}>
              {elementClassLabel}
              {borrowed ? ' · influence via the opposite palace' : ''}
            </p>
          </div>

          {/* Footer: brand + QR */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '18px' }}>
            <div>
              <p style={{ margin: 0, fontSize: '15px', letterSpacing: '0.14em', color: element.accent, fontFamily: FONT_DISPLAY }}>
                ─ CINNABAR ─
              </p>
              <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'rgba(243,236,221,0.7)', fontFamily: FONT_BODY }}>
                cinnabarastrology.com
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '9px', letterSpacing: '0.03em', color: 'rgba(139,138,158,0.9)', fontFamily: FONT_BODY }}>
                For entertainment &amp; self-discovery
              </p>
            </div>
            {qrDataUrl && (
              <div style={{ padding: '4px', background: '#F3ECDD', borderRadius: '6px' }}>
                <img src={qrDataUrl} alt="Scan to visit Cinnabar" width={52} height={52} style={{ display: 'block' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Locked teaser */}
      <div className="relative mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <p className="text-sm font-semibold text-gold">{teaser.title}</p>
        <p
          className={`mt-2 text-sm text-text-secondary transition-all duration-300 ${
            unlocked ? '' : 'blur-sm select-none'
          }`}
        >
          {teaser.body}
        </p>
        {!unlocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-night/40 backdrop-blur-[1px] text-center">
            <span className="text-lg text-gold/80">🔒</span>
            <p className="px-6 text-xs text-text-secondary">
              Share your card or drop your email to reveal it.
            </p>
          </div>
        )}
      </div>

      {/* Share actions */}
      <div className="mx-auto max-w-sm space-y-3">
        <Button onClick={handleDownload} disabled={generating} variant="gold" className="w-full">
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-night border-t-transparent" />
              Generating…
            </span>
          ) : (
            'Download image'
          )}
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={() => openShare('pinterest')}>
            Pinterest
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openShare('x')}>
            Share on X
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        </div>
      </div>

      {/* Email unlock */}
      {!unlocked && (
        <div className="mx-auto max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <EmailCapture
            source="soul_card"
            title="Prefer email? Unlock it that way"
            description="We’ll send occasional self-discovery updates — entertainment only, unsubscribe anytime."
            submitLabel="Unlock"
            successMessage="Unlocked ✦ Check your card above."
            onSuccess={unlock}
          />
        </div>
      )}
    </div>
  )
}
