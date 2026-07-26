import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BirthInfo } from '@/lib/astro'
import { adaptAovQizheng, buildQizhengEvidence } from '@/lib/qizheng-adapter'
import { QIZHENG_AOV_V1_FIXTURE } from '@/lib/__fixtures__/qizheng-aov-v1'
import { QizhengFacts } from './QizhengFacts'

afterEach(cleanup)

const BIRTH: BirthInfo = { year: 1990, month: 1, day: 1, hour: 12, gender: 'male', resolvedBirthTime: { year: 1990, month: 1, day: 1, hour: 12, minute: 0, timeIndex: 6, originalShichen: '午时', correctedShichen: '午时', correctionMinutes: 0, applied: true, crossedDate: false, timezoneOffsetMinutes: 480, location: { name: '北京', enName: 'Beijing', longitude: 116.4074, latitude: 39.9042 } } }

describe('QizhengFacts', () => {
  it('renders stars, aspects, palaces, evidence, and provenance from verified facts', () => {
    const result = adaptAovQizheng(QIZHENG_AOV_V1_FIXTURE, buildQizhengEvidence(BIRTH)!, 'fixture')
    render(createElement(QizhengFacts, { birthInfo: BIRTH, result }))
    expect(screen.getByRole('heading', { name: 'Qi Zheng Si Yu' })).toBeTruthy()
    expect(screen.getByText(/Beijing · UTC\+8/)).toBeTruthy()
    expect(screen.getByText('Zi Qi')).toBeTruthy()
    expect(screen.getByText('Aspects')).toBeTruthy()
    expect(screen.getByText('Twelve palaces')).toBeTruthy()
    expect(screen.getByText(/qizheng\.fact\.v1/)).toBeTruthy()
  })

  it('shows the local fail-closed state instead of generating substitute facts', () => {
    render(createElement(QizhengFacts, { birthInfo: BIRTH }))
    expect(screen.getByText(/No external service or substitute chart was used/)).toBeTruthy()
    expect(screen.queryByText('Zi Qi')).toBeNull()
  })

  it('does not generate time-derived facts from an approximate time', () => {
    render(createElement(QizhengFacts, { birthInfo: { ...BIRTH, birthTimeReliable: false } }))
    expect(screen.getByText(/requires a recorded birth time/)).toBeTruthy()
  })
})
// @vitest-environment jsdom
