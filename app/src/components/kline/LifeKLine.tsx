/* ============================================================
   人生 K 线 - Recharts 实现
   ============================================================

   核心特性:
   - 1-100 岁完整人生 K 线
   - 大运分界标注
   - 峰值红星标记
   - 深色玻璃态 Tooltip
   ============================================================ */

import { lazy, useState, useMemo, useCallback } from 'react'
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label,
  LabelList,
} from 'recharts'
import { useChartStore, useContentCacheStore } from '@/stores'
import { LazySurface } from '@/components/LazySurface'
import { KLineIcon } from '@/components/icons/KLineIcon'
import { translateGanZhi, translateStarLabel } from '@/lib/ziwei-glossary'
import {
  generateLifetimeKLines,
  type LifetimeKLinePoint,
} from '@/lib/fortune-score'

const ScoreRadar = lazy(async () => {
  const module = await import('./ScoreRadar')
  return { default: module.ScoreRadar }
})

/* ============================================================
   自定义 Tooltip (深色玻璃态)
   ============================================================ */

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: LifetimeKLinePoint }>
}

function translateCycle(value: string): string {
  return value === '童限' ? 'Early Years' : translateGanZhi(value)
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null

  const data = payload[0].payload
  const isUp = data.close >= data.open
  const scoreLevel = data.score >= 80 ? 'Very high' :
                     data.score >= 60 ? 'High' :
                     data.score >= 40 ? 'Balanced' :
                     data.score >= 20 ? 'Low' : 'Very low'

  return (
    <div className="bg-night/95 backdrop-blur-md p-5 rounded-xl shadow-2xl border border-white/10 z-50 w-[320px] md:w-[380px]">
      {/* ─── Header ─── */}
      <div className="flex justify-between items-start mb-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>
            {data.year} · {translateGanZhi(data.ganZhi)}
            <span className="text-base text-text-muted ml-2">(Age {data.age})</span>
          </p>
          <p className="text-sm text-star-light font-medium mt-1">
            Cycle: {translateCycle(data.daYun)} · Ages {data.daYunRange}
          </p>
        </div>
        <div className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
          data.score >= 60 ? 'bg-green-500/20 text-green-400' :
          data.score >= 40 ? 'bg-amber-500/20 text-amber-400' :
          'bg-rose-500/20 text-rose-400'
        }`}>
          {scoreLevel} · {data.score}
        </div>
      </div>

      {/* ─── OHLC Grid ─── */}
      <div className="grid grid-cols-4 gap-2 text-xs mb-4 bg-white/[0.03] p-3 rounded-lg">
        <div className="text-center">
          <span className="block text-text-muted mb-1">Open</span>
          <span className="font-mono text-white font-bold">{data.open}</span>
        </div>
        <div className="text-center">
          <span className="block text-text-muted mb-1">Close</span>
          <span className={`font-mono font-bold ${isUp ? 'text-green-400' : 'text-rose-400'}`}>{data.close}</span>
        </div>
        <div className="text-center">
          <span className="block text-text-muted mb-1">High</span>
          <span className="font-mono text-gold font-bold">{data.high}</span>
        </div>
        <div className="text-center">
          <span className="block text-text-muted mb-1">Low</span>
          <span className="font-mono text-rose-400 font-bold">{data.low}</span>
        </div>
      </div>

      {/* ─── Reason ─── */}
      <div className="text-sm text-text-secondary leading-relaxed max-h-[120px] overflow-y-auto"
           style={{ fontFamily: 'var(--font-brush)' }}>
        {data.reason || (
          <span className="text-text-muted">
            Locally modeled from the chart&apos;s palace and transformation weights.
          </span>
        )}
      </div>

      {/* ─── 流年四化 ─── */}
      {data.yearlyMutagens && data.yearlyMutagens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
          {data.yearlyMutagens.map((m, i) => (
            <span key={i} className="px-2 py-0.5 rounded text-xs bg-star/20 text-star-light">
              {translateStarLabel(m)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   自定义蜡烛图形状
   ============================================================ */

interface CandleShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: LifetimeKLinePoint
  yAxis?: { scale: (value: number) => number }
}

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload, yAxis } = props
  if (!payload) return null

  const isUp = payload.close >= payload.open
  const color = isUp ? '#22c55e' : '#ef4444'
  const strokeColor = isUp ? '#15803d' : '#b91c1c'

  let highY = y
  let lowY = y + height

  if (yAxis && typeof yAxis.scale === 'function') {
    try {
      highY = yAxis.scale(payload.high)
      lowY = yAxis.scale(payload.low)
    } catch {
      highY = y
      lowY = y + height
    }
  }

  const center = x + width / 2
  const renderHeight = height < 2 ? 2 : height

  return (
    <g>
      {/* 影线 */}
      <line x1={center} y1={highY} x2={center} y2={lowY} stroke={strokeColor} strokeWidth={1.5} />
      {/* 蜡烛体 */}
      <rect
        x={x}
        y={y}
        width={width}
        height={renderHeight}
        fill={color}
        stroke={strokeColor}
        strokeWidth={0.5}
        rx={1}
      />
    </g>
  )
}

/* ============================================================
   峰值星标组件
   ============================================================ */

interface PeakLabelProps {
  x?: number
  y?: number
  width?: number
  value?: number
  maxHigh: number
}

function PeakLabel(props: PeakLabelProps) {
  const { x = 0, y = 0, width = 0, value, maxHigh } = props
  if (value !== maxHigh) return null

  return (
    <g>
      {/* 金色星星 - 只标注峰值位置，不显示分数 */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        transform={`translate(${x + width / 2 - 6}, ${y - 18}) scale(0.5)`}
        fill="#fbbf24"
        stroke="#b45309"
        strokeWidth="1"
      />
    </g>
  )
}

/* ============================================================
   主组件
   ============================================================ */

interface LifeKLineProps {
  onRequestChart?: () => void
}

export function LifeKLine({ onRequestChart }: LifeKLineProps) {
  const { chart, birthInfo } = useChartStore()
  const { klineCache, setKlineCache } = useContentCacheStore()

  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [selectedPoint, setSelectedPoint] = useState<LifetimeKLinePoint | null>(null)
  const [timelineRange, setTimelineRange] = useState<'focus' | 'full'>('focus')

  /* ------------------------------------------------------------
     生成 K 线数据（本地确定性算法）
     ------------------------------------------------------------ */

  const generateKLines = useCallback(() => {
    if (!chart || !birthInfo) return

    setIsGenerating(true)
    setProgress('Building timeline...')

    try {
      const lifetime = generateLifetimeKLines(chart, birthInfo.year)
      setKlineCache({ lifetime, isGenerating: false })
      const currentAge = Math.max(
        1,
        Math.min(100, new Date().getFullYear() - birthInfo.year + 1),
      )
      setSelectedPoint(
        lifetime.find((point) => point.age === currentAge) ?? lifetime[0] ?? null,
      )
      setProgress('')
    } catch (error) {
      console.error('Life Timeline generation failed:', error)
      setProgress('Could not build the timeline. Try again.')
    }

    setIsGenerating(false)
  }, [chart, birthInfo, setKlineCache])

  /* ------------------------------------------------------------
     数据转换
     ------------------------------------------------------------ */

  const chartData = useMemo(() => {
    if (!klineCache?.lifetime) return []
    return klineCache.lifetime.map(d => ({
      ...d,
      bodyRange: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
    }))
  }, [klineCache])

  const currentAge = birthInfo
    ? Math.max(1, Math.min(100, new Date().getFullYear() - birthInfo.year + 1))
    : 1
  const visibleChartData = useMemo(() => {
    if (timelineRange === 'full') return chartData
    const firstAge = Math.max(1, currentAge - 5)
    const lastAge = Math.min(100, currentAge + 25)
    return chartData.filter((point) => (
      point.age >= firstAge && point.age <= lastAge
    ))
  }, [chartData, currentAge, timelineRange])
  const chartWidth = Math.max(880, visibleChartData.length * 24)

  // 大运变化点
  const daYunChanges = useMemo(() => {
    if (!visibleChartData.length) return []
    return visibleChartData.filter((d, i) => {
      if (i === 0) return true
      return d.daYun !== visibleChartData[i - 1].daYun
    })
  }, [visibleChartData])

  // 最高点
  const maxHigh = useMemo(() => {
    if (!visibleChartData.length) return 100
    return Math.max(...visibleChartData.map(d => d.high))
  }, [visibleChartData])

  const activePoint = useMemo(() => {
    if (
      selectedPoint &&
      visibleChartData.some((point) => point.age === selectedPoint.age)
    ) {
      return selectedPoint
    }
    return visibleChartData.find((point) => point.age === currentAge)
      ?? visibleChartData[0]
      ?? null
  }, [currentAge, selectedPoint, visibleChartData])

  /* ------------------------------------------------------------
     图表点击
     ------------------------------------------------------------ */

  const handleChartClick = useCallback((data: unknown) => {
    const chartData = data as { activePayload?: Array<{ payload: LifetimeKLinePoint }> }
    if (chartData.activePayload?.[0]?.payload) {
      setSelectedPoint(chartData.activePayload[0].payload)
    }
  }, [])

  /* ------------------------------------------------------------
     渲染
     ------------------------------------------------------------ */

  if (!chart) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState onRequestChart={onRequestChart} />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full animate-fade-in space-y-6">
      {/* ─── 标题区 ─── */}
      <div className="text-center">
        <h2
          className="text-2xl font-bold bg-gradient-to-r from-star-light via-gold to-star-light bg-clip-text text-transparent"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Life Timeline
        </h2>
        <p className="text-text-muted text-sm mt-2">
          Born {birthInfo?.year} · A focused view of modeled life cycles
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-text-muted/70">
          The model spans ages 1–100 only to cover ten decadal cycles. It does
          not estimate lifespan or imply that someone will live to 100.
        </p>
      </div>

      {/* ─── 生成按钮 / K 线图 ─── */}
      {!klineCache ? (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={generateKLines}
            disabled={isGenerating}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-star to-gold text-night font-medium hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] transition-all duration-300 disabled:opacity-50"
          >
            {isGenerating ? (
              progress || 'Building...'
            ) : (
              <span className="inline-flex items-center gap-2">
                <KLineIcon className="h-4 w-4" />
                Build My Life Timeline
              </span>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* ─── K 线图 ─── */}
          <div className="relative min-w-0 max-w-full p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm">
            {/* 顶部发光线 */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-star/50 to-transparent" />

            {/* 图表标题 */}
            <div className="mb-4 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>
                Lifetime Cycle Timeline
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                <label className="flex w-full flex-col items-stretch gap-1.5 text-text-muted sm:w-auto sm:flex-row sm:items-center sm:gap-2">
                  <span>Range</span>
                  <select
                    aria-label="Timeline range"
                    value={timelineRange}
                    onChange={(event) => {
                      setTimelineRange(
                        event.target.value === 'full' ? 'full' : 'focus',
                      )
                      setSelectedPoint(null)
                    }}
                    className="w-full rounded-lg border border-white/10 bg-night px-2 py-1.5 text-text-secondary outline-none focus:border-gold/40 sm:w-auto"
                  >
                    <option value="focus">Around now (−5 / +25 years)</option>
                    <option value="full">Full model (ages 1–100)</option>
                  </select>
                </label>
                <label className="flex w-full flex-col items-stretch gap-1.5 text-text-muted sm:w-auto sm:flex-row sm:items-center sm:gap-2">
                  <span>Inspect year</span>
                  <select
                    aria-label="Choose a year"
                    value={activePoint?.age ?? ''}
                    onChange={(event) => {
                      const age = Number(event.target.value)
                      setSelectedPoint(
                        visibleChartData.find((point) => point.age === age) ?? null,
                      )
                    }}
                    className="w-full rounded-lg border border-white/10 bg-night px-2 py-1.5 text-text-secondary outline-none focus:border-gold/40 sm:w-auto"
                  >
                    {visibleChartData.map((point) => (
                      <option key={point.age} value={point.age}>
                        {point.year} · Age {point.age}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="flex items-center text-green-400 bg-green-500/10 px-2 py-1 rounded">
                  <span className="w-2 h-2 bg-green-500 mr-2 rounded-full" /> Rising
                </span>
                <span className="flex items-center text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                  <span className="w-2 h-2 bg-rose-500 mr-2 rounded-full" /> Falling
                </span>
              </div>
            </div>

            <p className="mb-2 px-2 text-xs text-text-muted/70">
              Select a year above or tap a candle to inspect its score profile.
            </p>
            <div className="-mx-2 max-w-full overflow-x-auto px-2 pb-2">
              <ComposedChart
                width={chartWidth}
                height={500}
                data={visibleChartData}
                margin={{ top: 30, right: 10, left: 0, bottom: 20 }}
                onClick={handleChartClick}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />

                <XAxis
                  dataKey="age"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                  interval={9}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  label={{
                    value: 'Age',
                    position: 'insideBottomRight',
                    offset: -5,
                    fontSize: 10,
                    fill: 'rgba(255,255,255,0.3)',
                  }}
                />

                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                  axisLine={false}
                  tickLine={false}
                  ticks={[0, 25, 50, 75, 100]}
                  label={{
                    value: 'Cycle score',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 10,
                    fill: 'rgba(255,255,255,0.3)',
                  }}
                />

                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: 'rgba(124,58,237,0.3)', strokeWidth: 1, strokeDasharray: '4 4' }}
                />

                {/* 大运分界线 */}
                {daYunChanges.map((point, index) => (
                  <ReferenceLine
                    key={`dayun-${index}`}
                    x={point.age}
                    stroke="rgba(124,58,237,0.3)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  >
                    <Label
                      value={translateCycle(point.daYun)}
                      position="top"
                      fill="#a78bfa"
                      fontSize={9}
                      fontWeight="bold"
                    />
                  </ReferenceLine>
                ))}

                {/* K 线蜡烛 */}
                <Bar
                  dataKey="bodyRange"
                  shape={<CandleShape />}
                  isAnimationActive={true}
                  animationDuration={1500}
                >
                  <LabelList
                    dataKey="high"
                    position="top"
                    content={<PeakLabel maxHigh={maxHigh} />}
                  />
                </Bar>
              </ComposedChart>
            </div>

            {/* 生成状态 */}
            {klineCache.isGenerating && (
              <div className="absolute bottom-4 right-4 flex items-center gap-2 text-xs text-text-muted bg-night/80 px-3 py-1.5 rounded-lg">
                <span className="inline-block w-3 h-3 border-2 border-star border-t-transparent rounded-full animate-spin" />
                Calculating timeline...
              </div>
            )}
          </div>

          {/* ─── 选中年份详情 ─── */}
          {activePoint && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* 雷达图 */}
              <LazySurface
                label="score profile"
                loadingLabel="Loading score profile…"
                variant="panel"
              >
                <ScoreRadar
                  score={{
                    total: activePoint.score,
                    trend: activePoint.close >= activePoint.open ? 'up' : 'down',
                    dimensions: activePoint.dimensions,
                  }}
                  period={`${activePoint.year} (Age ${activePoint.age})`}
                />
              </LazySurface>

              {/* 详细信息卡片 */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-sm">
                <h3 className="text-sm text-text-muted font-medium mb-4">
                  {activePoint.year} · {translateGanZhi(activePoint.ganZhi)} · Age {activePoint.age}
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Major cycle</span>
                    <span className="text-star-light font-medium">
                      {translateCycle(activePoint.daYun)} · Ages {activePoint.daYunRange}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Overall score</span>
                    <span className={`font-bold ${
                      activePoint.score >= 70 ? 'text-gold' :
                      activePoint.score >= 50 ? 'text-green-400' :
                      activePoint.score >= 30 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {activePoint.score} / 100
                    </span>
                  </div>

                  {activePoint.yearlyMutagens && activePoint.yearlyMutagens.length > 0 && (
                    <div className="pt-3 border-t border-white/10">
                      <span className="text-text-muted text-sm block mb-2">Annual transformations</span>
                      <div className="flex flex-wrap gap-1.5">
                        {activePoint.yearlyMutagens.map((m, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-xs bg-star/20 text-star-light">
                            {translateStarLabel(m)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePoint.reason && (
                    <div className="pt-3 border-t border-white/10">
                      <span className="text-text-muted text-sm block mb-2">Modeled context</span>
                      <p className="text-text-secondary text-sm leading-relaxed" style={{ fontFamily: 'var(--font-brush)' }}>
                        {activePoint.reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ============================================================
   空状态组件
   ============================================================ */

function EmptyState({ onRequestChart }: LifeKLineProps) {
  return (
    <div className="text-center p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <KLineIcon className="mx-auto mb-4 h-12 w-12 text-gold/30" />
      <p className="text-text-muted mb-4">
        Create your birth chart before opening Life Timeline.
      </p>
      {onRequestChart && (
        <button
          type="button"
          onClick={onRequestChart}
          className="rounded-lg bg-cinnabar/20 px-4 py-2 text-sm text-cinnabar-light transition-colors hover:bg-cinnabar/30"
        >
          Go to Your Chart
        </button>
      )}
    </div>
  )
}
