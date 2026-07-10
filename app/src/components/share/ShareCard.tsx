/* ============================================================
   Share card — a quotable "essence of your chart" image
   Cinnabar seal styling, exported with html2canvas.
   ============================================================ */

import { useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { useChartStore, useContentCacheStore } from '@/stores'
import { Button } from '@/components/ui'
import type { FunctionalAstrolabe } from '@/lib/astro'
import { translateFiveElementsClass, translateGanZhi, translateStarLabel } from '@/lib/ziwei-glossary'

/* ------------------------------------------------------------
   Fonts (html2canvas cannot resolve CSS variables — hardcoded)
   ------------------------------------------------------------ */

const FONT_DISPLAY = "'Cormorant Garamond', 'Georgia', serif"
const FONT_BODY = "'Inter', system-ui, sans-serif"

/* ------------------------------------------------------------
   Sexagenary year (stem-branch) helpers
   ------------------------------------------------------------ */

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

function yearToGanZhi(year: number): string {
  const stemIndex = (year - 4) % 10
  const branchIndex = (year - 4) % 12
  return `${STEMS[stemIndex]}${BRANCHES[branchIndex]}`
}

/* ------------------------------------------------------------
   Pull a quotable passage from the AI reading
   ------------------------------------------------------------ */

function extractQuote(content: string): string | null {
  // Prefer explicit double-quoted sentences from the reading
  const quotes = content.match(/"([^"]{20,240})"/g)
  if (quotes && quotes.length > 0) {
    return quotes[0].replace(/"/g, '')
  }
  // Fall back to the opening sentence of the reading
  const plain = content
    .replace(/^#.*$/gm, '')
    .replace(/[*_>`]/g, '')
    .trim()
  const firstSentence = plain.match(/[^.!?]{40,220}[.!?]/)
  if (firstSentence) {
    return firstSentence[0].trim()
  }
  return null
}

/* ------------------------------------------------------------
   Life Palace main stars
   ------------------------------------------------------------ */

function getLifePalaceStars(chart: FunctionalAstrolabe): string {
  const lifePalace = chart.palaces?.find((p) => p.name === '命宫')
  if (!lifePalace?.majorStars?.length) return 'Unknown'
  return lifePalace.majorStars.map((s) => translateStarLabel(String(s.name))).join(' · ')
}

/* ------------------------------------------------------------
   Notable pattern detection (simplified)
   ------------------------------------------------------------ */

function getPatternName(chart: FunctionalAstrolabe): string | null {
  const lifePalace = chart.palaces?.find((p) => p.name === '命宫')
  const stars = lifePalace?.majorStars?.map((s) => String(s.name)) || []

  if (stars.includes('紫微') && stars.includes('天府')) return 'Emperor & Treasurer united'
  if (stars.includes('紫微') && stars.includes('贪狼')) return 'Emperor & Desirer united'
  if (stars.includes('紫微') && stars.includes('天相')) return 'Emperor & Minister united'
  if (stars.includes('太阳') && stars.includes('太阴')) return 'Sun & Moon united'
  if (stars.includes('天机') && stars.includes('太阴')) return 'Strategist & Moon pattern'
  if (stars.includes('廉贞') && stars.includes('贪狼')) return 'Firebrand & Desirer united'
  if (stars.includes('武曲') && stars.includes('贪狼')) return 'General & Desirer united'

  return null
}

/* ------------------------------------------------------------
   Share card component
   ------------------------------------------------------------ */

export function ShareCard() {
  const { chart, birthInfo } = useChartStore()
  const { aiInterpretation } = useContentCacheStore()
  const cardRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [customQuote, setCustomQuote] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const extractedQuote = aiInterpretation ? extractQuote(aiInterpretation) : null
  const displayQuote = customQuote || extractedQuote || 'Your chart holds the map.\nHow you walk it is yours to choose.'

  const ganZhi = birthInfo ? yearToGanZhi(birthInfo.year) : ''
  const ganZhiEn = ganZhi ? translateGanZhi(ganZhi) : ''
  const stars = chart ? getLifePalaceStars(chart) : ''
  const pattern = chart ? getPatternName(chart) : null
  const fiveElements = chart ? translateFiveElementsClass(chart.fiveElementsClass) : ''

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return

    setGenerating(true)
    try {
      await document.fonts.ready

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#12132b',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      })

      const dataUrl = canvas.toDataURL('image/png')

      const link = document.createElement('a')
      link.download = `cinnabar-reading-${ganZhiEn.toLowerCase() || 'chart'}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Image generation failed:', err)
      alert(`Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }, [ganZhiEn])

  if (!chart || !birthInfo) {
    return (
      <div className="text-center py-12 text-text-muted">
        <div className="text-4xl mb-3 opacity-30">✦</div>
        <p>Cast your chart first, then create a share card.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Hint */}
      {!extractedQuote && (
        <div className="text-center text-text-muted text-sm px-4">
          <p>💡 Get your AI reading first and a quote will be pulled from it automatically.</p>
        </div>
      )}

      {/* Card preview — hardcoded colors (html2canvas can't parse oklab) */}
      <div
        ref={cardRef}
        style={{
          width: '360px',
          height: '560px',
          background: '#12132b',
          borderRadius: '16px',
          position: 'relative',
          overflow: 'hidden',
          margin: '0 auto',
        }}
      >
        {/* Double gold border */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            bottom: '8px',
            borderRadius: '12px',
            border: '1px solid rgba(201, 162, 75, 0.25)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            bottom: '12px',
            borderRadius: '8px',
            border: '1px solid rgba(201, 162, 75, 0.12)',
            pointerEvents: 'none',
          }}
        />

        {/* Corner stars */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', color: 'rgba(201, 162, 75, 0.35)', fontSize: '18px' }}>✦</div>
        <div style={{ position: 'absolute', top: '16px', right: '16px', color: 'rgba(201, 162, 75, 0.35)', fontSize: '18px' }}>✦</div>
        <div style={{ position: 'absolute', bottom: '16px', left: '16px', color: 'rgba(201, 162, 75, 0.35)', fontSize: '18px' }}>✦</div>
        <div style={{ position: 'absolute', bottom: '16px', right: '16px', color: 'rgba(201, 162, 75, 0.35)', fontSize: '18px' }}>✦</div>

        {/* Content */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Star divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '1px', background: 'rgba(201, 162, 75, 0.35)' }} />
            <span style={{ color: 'rgba(201, 162, 75, 0.55)', fontSize: '12px', letterSpacing: '0.1em' }}>☆ · ☆ · ☆</span>
            <div style={{ width: '48px', height: '1px', background: 'rgba(201, 162, 75, 0.35)' }} />
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <h2
              style={{
                fontSize: '22px',
                letterSpacing: '0.14em',
                color: '#C9A24B',
                fontFamily: FONT_DISPLAY,
                margin: 0,
              }}
            >
              THE ESSENCE OF YOUR CHART
            </h2>
          </div>

          {/* Quote */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                fontSize: '19px',
                lineHeight: '1.8',
                color: '#F3ECDD',
                whiteSpace: 'pre-line',
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '0 16px',
              }}
            >
              "{displayQuote}"
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '64px', height: '1px', background: 'rgba(201, 162, 75, 0.35)' }} />
            <span style={{ color: 'rgba(201, 162, 75, 0.45)', fontSize: '12px' }}>❖</span>
            <div style={{ width: '64px', height: '1px', background: 'rgba(201, 162, 75, 0.35)' }} />
          </div>

          {/* Chart facts */}
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: '14px',
                letterSpacing: '0.05em',
                color: 'rgba(224, 192, 120, 0.85)',
                fontFamily: FONT_BODY,
                margin: '0 0 8px 0',
              }}
            >
              Life Palace stars: {stars}
            </p>
            {pattern && (
              <p style={{ fontSize: '12px', color: 'rgba(201, 162, 75, 0.65)', fontFamily: FONT_BODY, margin: '0 0 4px 0' }}>
                Pattern: {pattern}
              </p>
            )}
            <p style={{ fontSize: '12px', color: 'rgba(201, 162, 75, 0.55)', fontFamily: FONT_BODY, margin: 0 }}>
              {fiveElements}
            </p>
          </div>

          {/* Cinnabar seal + year */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '16px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                border: '1px solid rgba(178, 58, 46, 0.7)',
                background: 'rgba(178, 58, 46, 0.85)',
                color: '#F3ECDD',
                fontSize: '16px',
                fontFamily: FONT_DISPLAY,
              }}
            >
              ☆
            </div>
            <p style={{ color: 'rgba(224, 192, 120, 0.65)', fontSize: '14px', letterSpacing: '0.08em', fontFamily: FONT_BODY, margin: 0 }}>
              {ganZhiEn} Year
            </p>
          </div>

          {/* Watermark */}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(201, 162, 75, 0.12)', textAlign: 'center' }}>
            <p style={{ color: 'rgba(201, 162, 75, 0.4)', fontSize: '12px', letterSpacing: '0.25em', fontFamily: FONT_BODY, margin: 0 }}>
              ─── CINNABAR ───
            </p>
          </div>
        </div>
      </div>

      {/* Edit quote */}
      <div className="space-y-3">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={customQuote}
              onChange={(e) => setCustomQuote(e.target.value)}
              placeholder="Write your own quote — line breaks are kept..."
              className="w-full h-24 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-text placeholder:text-text-muted focus:outline-none focus:border-gold/30 resize-none"
              style={{ fontFamily: FONT_DISPLAY }}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => setIsEditing(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            ✎ Customize the quote
          </button>
        )}
      </div>

      {/* Download */}
      <Button
        onClick={handleDownload}
        disabled={generating}
        className="w-full"
        variant="gold"
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-night border-t-transparent rounded-full animate-spin" />
            Generating...
          </span>
        ) : (
          'Save Share Image'
        )}
      </Button>

      <p className="text-center text-text-muted text-xs">
        Save the image and share it anywhere ✨
      </p>
    </div>
  )
}
