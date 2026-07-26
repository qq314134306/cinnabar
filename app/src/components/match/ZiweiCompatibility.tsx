import type { ZiweiCompatibilityResult } from '@/lib/ziwei-compatibility'

const PALACE_LABELS: Record<string, string> = {
  命宫: 'Life', 夫妻: 'Partner', 福德: 'Inner Life', 迁移: 'Travel',
  官禄: 'Career', 财帛: 'Wealth', 兄弟: 'Siblings', 子女: 'Children',
  疾厄: 'Well-being', 交友: 'Friends', 仆役: 'Friends', 田宅: 'Home', 父母: 'Parents',
}

const TRANSFORMATION_LABELS = {
  禄: 'Lu', 权: 'Quan', 科: 'Ke', 忌: 'Ji',
} as const

function palace(name: string): string {
  return PALACE_LABELS[name] ?? name
}

export function ZiweiCompatibility({ result }: { result: ZiweiCompatibilityResult }) {
  return (
    <section
      aria-labelledby="ziwei-compatibility-title"
      className="space-y-5 rounded-xl border border-star/20 bg-star/[0.04] p-4"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-star-light/80">
          Zi Wei dual-chart evidence
        </p>
        <h4 id="ziwei-compatibility-title" className="mt-1 font-medium text-text">
          Two natal charts, then cross-chart structure
        </h4>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          Deterministic entertainment and self-discovery facts. This layer does
          not supply BaZi pillars, scores, predictions, or relationship verdicts.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {result.charts.map((chart) => (
          <div key={chart.label} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
              {chart.label} · independently cast
            </p>
            <p className="mt-2 text-sm text-text-secondary">Resolved date: {chart.solarDate}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {chart.reliableTime
                ? `Life Palace: ${chart.lifePalaceBranch ?? 'Unavailable'} · ${chart.lifePalaceStars.join(' · ') || 'No major star'}`
                : 'Hour-dependent palace details withheld.'}
            </p>
          </div>
        ))}
      </div>

      {result.uncertainty.suppressed ? (
        <div role="status" className="rounded-lg border border-gold/20 bg-gold/[0.05] p-3 text-sm leading-relaxed text-text-secondary">
          {result.uncertainty.reason}
        </div>
      ) : (
        <>
          <div>
            <h5 className="text-sm font-medium text-text">Key palace overlays</h5>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {result.palaceOverlays.map((item) => (
                <p key={`${item.direction}-${item.sourcePalace}`} className="rounded-lg bg-white/[0.025] p-2 text-xs text-text-secondary">
                  {item.direction} · {palace(item.sourcePalace)} at {item.branch} overlays {palace(item.receivingPalace)}
                </p>
              ))}
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-text">Natal transformations across charts</h5>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {result.crossTransformations.map((item) => (
                <p key={`${item.direction}-${item.code}`} className="rounded-lg bg-white/[0.025] p-2 text-xs text-text-secondary">
                  {item.direction} · {item.starName} transforms as {TRANSFORMATION_LABELS[item.code]} in {palace(item.sourcePalace)} ({item.branch}), landing on the other chart’s {palace(item.receivingPalace)}
                </p>
              ))}
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-text">San Fang Si Zheng interaction</h5>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {result.sanFangInteractions.map((item) => (
                <div key={`${item.direction}-${item.focusPalace}`} className="rounded-lg bg-white/[0.025] p-3 text-xs text-text-secondary">
                  <p>{item.direction} · {palace(item.focusPalace)} network from {item.focusBranch}</p>
                  <p className="mt-1 text-text-muted">
                    {item.receivingPalaces.map((entry) => `${entry.role}: ${palace(entry.palaceName)} (${entry.branch})`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
