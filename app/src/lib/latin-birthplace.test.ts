import { describe, expect, it } from 'vitest'
import { findBirthplaceAsync, resolveBirthTimeAsync } from './true-solar-time'

const ZHUZHOU_CITY = '株洲市'  // 株洲市
const WU_SHICHEN = '午时'          // 午时 (Horse hour)
const SI_SHICHEN = '巳时'          // 巳时 (Snake hour)

describe('pinyin birthplace matching', () => {
  it('matches spaced, case-varied pinyin to the Chinese dataset', async () => {
    expect((await findBirthplaceAsync('Zhu Zhou'))?.name).toBe(ZHUZHOU_CITY)
    expect((await findBirthplaceAsync('zhuzhou'))?.name).toBe(ZHUZHOU_CITY)
    expect((await findBirthplaceAsync('ZHUZHOU'))?.name).toBe(ZHUZHOU_CITY)
    expect((await findBirthplaceAsync(' zhu zhou '))?.name).toBe(ZHUZHOU_CITY)
  })

  it('exposes an English display name for Chinese cities', async () => {
    expect((await findBirthplaceAsync('Zhu Zhou'))?.enName).toBe('Zhuzhou')
    expect((await findBirthplaceAsync('New York'))?.enName).toBe('New York')
  })

  it('still matches Chinese input as before', async () => {
    expect((await findBirthplaceAsync('株洲'))?.name).toBe(ZHUZHOU_CITY)
  })

  it('applies the China-standard correction to a pinyin-matched city', async () => {
    const result = await resolveBirthTimeAsync({
      year: 1995,
      month: 6,
      day: 10,
      hour: 12,
      birthplace: 'Zhu Zhou',
      enabled: true,
    })

    expect(result.applied).toBe(true)
    expect(result.location?.name).toBe(ZHUZHOU_CITY)
    // Zhuzhou sits ~113.1°E, west of the 120°E meridian → roughly -28 min + EoT
    expect(result.correctionMinutes).toBeLessThan(-20)
    expect(result.correctionMinutes).toBeGreaterThan(-40)
  })
})

describe('world city matching', () => {
  it('matches major world cities case-insensitively', async () => {
    expect((await findBirthplaceAsync('New York'))?.tz).toBe('America/New_York')
    expect((await findBirthplaceAsync('new york city'))?.tz).toBe('America/New_York')
    expect((await findBirthplaceAsync('london'))?.tz).toBe('Europe/London')
    expect((await findBirthplaceAsync('TOKYO'))?.tz).toBe('Asia/Tokyo')
    expect((await findBirthplaceAsync('São Paulo'))?.tz).toBe('America/Sao_Paulo')
  })

  it('returns null for unknown places without throwing', async () => {
    expect(await findBirthplaceAsync('Atlantis')).toBeNull()
  })

  it('uses DST-aware offsets: a summer New York noon moves a full hour back', async () => {
    // July 15: EDT (UTC-4). Solar mean time at -74° lags the EDT clock by ~1h.
    const summer = await resolveBirthTimeAsync({
      year: 1990,
      month: 7,
      day: 15,
      hour: 12,
      birthplace: 'New York',
      enabled: true,
    })

    expect(summer.applied).toBe(true)
    expect(summer.location?.country).toBe('United States')
    expect(summer.originalShichen).toBe(WU_SHICHEN)
    expect(summer.correctedShichen).toBe(SI_SHICHEN)
    expect(summer.correctionMinutes).toBeLessThan(-50)

    // January 15: EST (UTC-5). The clock nearly matches solar time → same shichen.
    const winter = await resolveBirthTimeAsync({
      year: 1990,
      month: 1,
      day: 15,
      hour: 12,
      birthplace: 'New York',
      enabled: true,
    })

    expect(winter.applied).toBe(true)
    expect(winter.correctedShichen).toBe(WU_SHICHEN)
    expect(Math.abs(winter.correctionMinutes)).toBeLessThan(20)
  })
})
