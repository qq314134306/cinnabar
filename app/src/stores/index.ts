/* ============================================================
   Global state management
   ============================================================ */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FunctionalAstrolabe } from '@/lib/astro'
import type { BirthInfo } from '@/lib/astro'
import type { LifetimeKLinePoint } from '@/lib/fortune-score'
import type { ForecastTier, Persona } from '@/lib/ai-prompts'

/* ------------------------------------------------------------
   Chart state
   ------------------------------------------------------------ */

interface ChartState {
  birthInfo: BirthInfo | null
  chart: FunctionalAstrolabe | null
  setBirthInfo: (info: BirthInfo) => void
  setChart: (chart: FunctionalAstrolabe) => void
  clear: () => void
}

export const useChartStore = create<ChartState>()((set) => ({
  birthInfo: null,
  chart: null,
  setBirthInfo: (info) => set({ birthInfo: info }),
  setChart: (chart) => set({ chart }),
  clear: () => {
    set({ birthInfo: null, chart: null })
    // Also clear cached AI content
    useContentCacheStore.getState().clearAll()
  },
}))

/* ------------------------------------------------------------
   Content cache (AI readings, K-line, etc.)
   ------------------------------------------------------------ */

interface KLineCache {
  lifetime: LifetimeKLinePoint[]  // full ages 1-100 dataset
  isGenerating: boolean           // whether reasons are still being generated
}

export interface FutureReportCache {
  tier: ForecastTier
  text: string
  orderId: string
}

interface ContentCacheState {
  // AI natal reading
  aiInterpretation: string | null
  setAiInterpretation: (content: string) => void

  // Paid Future Report (set once payment is captured and the report streams in)
  futureReport: FutureReportCache | null
  setFutureReport: (report: FutureReportCache | null) => void

  // Yearly fortune readings (cached per year)
  yearlyFortune: Record<number, string>
  setYearlyFortune: (year: number, content: string) => void

  // K-line data
  klineCache: KLineCache | null
  setKlineCache: (cache: KLineCache) => void
  updateKlineReasons: (reasons: { age: number; reason: string }[]) => void
  setKlineGenerating: (isGenerating: boolean) => void

  // Clear all caches
  clearAll: () => void
}

export const useContentCacheStore = create<ContentCacheState>()((set) => ({
  aiInterpretation: null,
  futureReport: null,
  yearlyFortune: {},
  klineCache: null,

  setAiInterpretation: (content) => set({ aiInterpretation: content }),
  setFutureReport: (report) => set({ futureReport: report }),

  setYearlyFortune: (year, content) => set((state) => ({
    yearlyFortune: { ...state.yearlyFortune, [year]: content },
  })),

  setKlineCache: (cache) => set({ klineCache: cache }),

  updateKlineReasons: (reasons) => set((state) => {
    if (!state.klineCache) return state
    const updatedLifetime = state.klineCache.lifetime.map(point => {
      const found = reasons.find(r => r.age === point.age)
      return found ? { ...point, reason: found.reason } : point
    })
    return {
      klineCache: {
        ...state.klineCache,
        lifetime: updatedLifetime,
        isGenerating: false,
      },
    }
  }),

  setKlineGenerating: (isGenerating) => set((state) => {
    if (!state.klineCache) return state
    return {
      klineCache: { ...state.klineCache, isGenerating },
    }
  }),

  clearAll: () => set({
    aiInterpretation: null,
    futureReport: null,
    yearlyFortune: {},
    klineCache: null,
  }),
}))

/* ------------------------------------------------------------
   Settings state — reader persona (Scholar / Old Sage)
   ------------------------------------------------------------ */

interface SettingsState {
  persona: Persona
  setPersona: (persona: Persona) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      persona: 'scholar',
      setPersona: (persona) => set({ persona }),
    }),
    {
      name: 'cinnabar-settings',
    }
  )
)
