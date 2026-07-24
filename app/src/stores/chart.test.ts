import { afterEach, describe, expect, it } from 'vitest'
import { generateChart, type BirthInfo } from '@/lib/astro'
import {
  useChartStore,
  useContentCacheStore,
  useFutureReportActivityStore,
  useSettingsStore,
} from './index'

const ORIGINAL: BirthInfo = {
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  gender: 'male',
  trueSolarEnabled: false,
  birthTimeReliable: false,
}

afterEach(() => {
  useChartStore.setState({ birthInfo: null, chart: null })
  useContentCacheStore.getState().clearAll()
  useFutureReportActivityStore.setState({ captureCount: 0 })
  useSettingsStore.setState({ persona: 'scholar' })
})

describe('chart replacement', () => {
  it('commits birth input and chart atomically and clears chart-derived caches', () => {
    const originalChart = generateChart(ORIGINAL)
    useChartStore.setState({
      birthInfo: ORIGINAL,
      chart: originalChart,
    })
    useContentCacheStore.getState().setAiInterpretation('old reading', 'old-key')
    useContentCacheStore.getState().setFutureReport({
      tier: '1-year',
      text: 'old report',
      orderId: 'old-order',
    })
    useContentCacheStore.getState().setYearlyFortune(2026, 'old year')

    const snapshots: Array<{
      birthInfo: BirthInfo | null
      chart: unknown
    }> = []
    const unsubscribe = useChartStore.subscribe((state) => {
      snapshots.push({
        birthInfo: state.birthInfo,
        chart: state.chart,
      })
    })
    const replacement: BirthInfo = {
      ...ORIGINAL,
      hour: 10,
      birthTimeReliable: false,
    }
    const replacementChart = generateChart(replacement)

    useChartStore.getState().replaceChart(replacement, replacementChart)
    unsubscribe()

    expect(snapshots).toEqual([{
      birthInfo: replacement,
      chart: replacementChart,
    }])
    expect(useContentCacheStore.getState()).toMatchObject({
      aiInterpretation: null,
      aiInterpretationKey: null,
      futureReport: null,
      yearlyFortune: {},
      klineCache: null,
    })
  })

  it('blocks every chart mutation while payment capture is pending', () => {
    const originalChart = generateChart(ORIGINAL)
    useChartStore.setState({
      birthInfo: ORIGINAL,
      chart: originalChart,
    })
    const replacement = {
      ...ORIGINAL,
      hour: 20,
    }
    const replacementChart = generateChart(replacement)
    useFutureReportActivityStore.getState().beginCapture()

    expect(
      useChartStore.getState().replaceChart(replacement, replacementChart),
    ).toBe(false)
    expect(useChartStore.getState().clear()).toBe(false)
    expect(useChartStore.getState().setBirthInfo(replacement)).toBe(false)
    expect(useChartStore.getState().setChart(replacementChart)).toBe(false)
    expect(useSettingsStore.getState().setPersona('sage')).toBe(false)
    expect(useChartStore.getState()).toMatchObject({
      birthInfo: ORIGINAL,
      chart: originalChart,
    })
    expect(useSettingsStore.getState().persona).toBe('scholar')

    useFutureReportActivityStore.getState().endCapture()
    expect(
      useChartStore.getState().replaceChart(replacement, replacementChart),
    ).toBe(true)
    expect(useSettingsStore.getState().setPersona('sage')).toBe(true)
  })
})
