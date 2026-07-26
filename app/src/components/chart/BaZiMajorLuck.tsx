import { useState } from 'react'
import type { BirthInfo } from '@/lib/astro'
import type { BaziMajorLuck } from '@/lib/bazi-major-luck'
import { translateGanZhi } from '@/lib/ziwei-glossary'

interface BaZiMajorLuckProps {
  birthInfo: BirthInfo
}

function formatOffset(result: BaziMajorLuck) {
  const { years, months, days, hours } = result.startOffset
  return `${years}y ${months}m ${days}d ${hours}h after birth`
}

export function BaZiMajorLuck({ birthInfo }: BaZiMajorLuckProps) {
  const [result, setResult] = useState<BaziMajorLuck | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const resolved = birthInfo.resolvedBirthTime

  if (!resolved) return null

  const loadCycles = async () => {
    setStatus('loading')
    try {
      const { buildBaziMajorLuck } = await import('@/lib/bazi-major-luck')
      const next = buildBaziMajorLuck({
        year: resolved.year,
        month: resolved.month,
        day: resolved.day,
        hour: resolved.hour,
        minute: resolved.minute,
        gender: birthInfo.gender,
      })
      if (!next) throw new Error('Major Luck calculation failed')
      setResult(next)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  if (!result) {
    return (
      <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold text-text">Major Luck cycles · Da Yun</h4>
            <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-text-muted">
              Load eight deterministic ten-year calendar cycles. Start timing uses the corrected birth minute and solar-term distance.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCycles}
            disabled={status === 'loading'}
            className="rounded-lg border border-gold/25 bg-gold/[0.08] px-3 py-2 text-xs font-medium text-gold transition hover:bg-gold/[0.12] disabled:cursor-wait disabled:opacity-60"
          >
            {status === 'loading' ? 'Calculating…' : 'Show Major Luck'}
          </button>
        </div>
        {status === 'error' && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            Major Luck cycles could not be calculated for this birth time.
          </p>
        )}
      </div>
    )
  }

  return (
    <div data-bazi-major-luck className="mt-3 rounded-lg border border-gold/15 bg-gold/[0.035] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-text">Major Luck cycles · Da Yun</h4>
          <p className="mt-1 text-[10px] text-text-muted">
            {result.direction === 'forward' ? 'Forward' : 'Reverse'} sequence · starts {result.startAt} · {formatOffset(result)}
          </p>
        </div>
        <span className="rounded-full bg-gold/10 px-2 py-1 text-[10px] text-gold">
          Sect 2 · minute-aware
        </span>
      </div>

      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.cycles.map((cycle) => (
          <li key={`${cycle.startYear}-${cycle.ganZhi}`} className="rounded-md border border-white/[0.06] bg-black/10 p-2">
            <p className="font-mono text-sm font-semibold text-text">
              {translateGanZhi(cycle.ganZhi)}
            </p>
            <p className="mt-1 text-[10px] text-text-secondary">
              {cycle.startYear}–{cycle.endYear}
            </p>
            <p className="text-[10px] text-text-muted">
              Ages {cycle.startAge}–{cycle.endAge}
            </p>
          </li>
        ))}
      </ol>

      {birthInfo.birthTimeReliable === false && (
        <p role="note" className="mt-2 text-xs leading-relaxed text-gold/80">
          Start timing and cycle boundaries are provisional because the birth time is approximate.
        </p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
        These are calendar periods, not a lifespan forecast or an outcome prediction.
      </p>
    </div>
  )
}
