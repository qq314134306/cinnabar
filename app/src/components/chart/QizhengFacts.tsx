import type { BirthInfo } from '@/lib/astro'
import type { QizhengResult } from '@/lib/qizheng-contract'
import { calculateLocalQizheng } from '@/lib/qizheng-local'

export function QizhengFacts({ birthInfo, result: suppliedResult }: { birthInfo: BirthInfo; result?: QizhengResult }) {
  const result = suppliedResult ?? calculateLocalQizheng(birthInfo)

  return (
    <section aria-labelledby="qizheng-heading" className="mt-4 border-t border-white/[0.08] pt-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">Verified cross-method facts</p>
      <h3 id="qizheng-heading" className="mt-1 text-sm font-semibold text-text">Qi Zheng Si Yu</h3>
      {!result.ok && (
        <div role="status" className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-xs text-text-secondary">{result.failure.message}</p>
          <p className="mt-1 text-[10px] text-text-muted">{result.metadata.adapterVersion} · fail closed</p>
        </div>
      )}
      {result.ok && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-text-secondary">Eleven bodies and their geometric relationships, calculated from the saved resolved time and location evidence. For entertainment &amp; self-discovery; no outcome is predicted.</p>
          <dl className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
            <Fact label="Life palace" value={`House ${result.facts.lifePalace + 1}`} />
            <Fact label="Body palace" value={`House ${result.facts.bodyPalace + 1}`} />
            <Fact label="Life master" value={BODY_LABELS[result.facts.lifeMaster] ?? result.facts.lifeMaster} />
            <Fact label="Evidence" value={`${result.facts.evidence.locationLabel} · UTC${formatOffset(result.facts.evidence.timezoneOffsetHours)}`} />
          </dl>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.facts.stars.map((star) => <article key={star.name} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex justify-between gap-2"><h4 className="text-xs font-medium text-text">{BODY_LABELS[star.name] ?? star.name}</h4><span className="text-[10px] text-gold/80">{star.kind === '七政' ? 'Seven Governors' : 'Four Residuals'}</span></div><p className="mt-1 text-[10px] text-text-secondary">Mansion {star.mansion} · {star.mansionDegree.toFixed(2)}° · {PALACE_LABELS[star.palace] ?? star.palace}{star.retrograde ? ' · retrograde' : ''}</p><p className="mt-1 text-[10px] text-text-muted">{precisionLabel(star.precisionClass)} · {star.sourceId}</p></article>)}
          </div>
          <div><h4 className="text-xs font-medium text-text">Aspects</h4><ul className="mt-1 grid gap-1 sm:grid-cols-2">{result.facts.aspects.map((aspect) => <li key={`${aspect.star1}-${aspect.star2}-${aspect.type}`} className="text-[10px] text-text-secondary">{BODY_LABELS[aspect.star1] ?? aspect.star1} / {BODY_LABELS[aspect.star2] ?? aspect.star2} · {ASPECT_LABELS[aspect.type] ?? aspect.type} · {aspect.actualAngle.toFixed(2)}° ({precisionLabel(aspect.precisionClass)})</li>)}</ul></div>
          <div><h4 className="text-xs font-medium text-text">Twelve palaces</h4><ul className="mt-1 flex flex-wrap gap-1">{result.facts.palaces.map((palace) => <li key={palace.palace} className="rounded-full border border-white/[0.07] px-2 py-1 text-[10px] text-text-secondary">{PALACE_LABELS[palace.palace] ?? palace.palace} · House {palace.signIndex + 1}</li>)}</ul></div>
          <p className="text-[10px] text-text-muted">{result.facts.version} · {result.metadata.provider} {result.metadata.providerVersion ?? 'unknown'} · {result.metadata.adapterVersion}</p>
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2"><dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt><dd className="mt-1 text-text">{value}</dd></div> }
function formatOffset(value: number): string { return `${value >= 0 ? '+' : ''}${value}` }

const BODY_LABELS: Record<string, string> = { '太阳': 'Sun', '太阴': 'Moon', '辰星(水)': 'Mercury', '太白(金)': 'Venus', '荧惑(火)': 'Mars', '岁星(木)': 'Jupiter', '镇星(土)': 'Saturn', '罗睺(火余)': 'Rahu', '计都(土余)': 'Ketu', '月孛(水余)': 'Lunar Apogee', '紫炁(木余)': 'Zi Qi', '日': 'Sun' }
const PALACE_LABELS: Record<string, string> = { '命宫': 'Life Palace', '财帛': 'Wealth Palace', '兄弟': 'Siblings Palace', '田宅': 'Property Palace', '男女': 'Children Palace', '奴仆': 'Friends Palace', '妻妾': 'Partnership Palace', '疾厄': 'Well-being Palace', '迁移': 'Travel Palace', '官禄': 'Career Palace', '福德': 'Inner Life Palace', '相貌': 'Appearance Palace' }
const ASPECT_LABELS: Record<string, string> = { '同宫': 'Conjunction', '对照': 'Opposition', '四正': 'Square', '三方': 'Trine', '六合': 'Sextile' }
function precisionLabel(value: string): string { if (value === '传统均速模型') return 'traditional mean-motion model'; if (value.includes('混合')) return 'mixed-model evidence'; return 'modern astronomical calculation' }
