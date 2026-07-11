import { describe, expect, it } from 'vitest'
import zhStars from 'iztro/lib/i18n/locales/zh-CN/star'
import zhPalaces from 'iztro/lib/i18n/locales/zh-CN/palace'
import {
  translateBranch,
  translateFiveElementsClass,
  translateGanZhi,
  translateNayin,
  translatePalaceName,
  translateShichen,
  translateStarLabel,
  translateStem,
  translateZodiac,
} from './ziwei-glossary'

const CJK = /[一-鿿]/

describe('ziwei-glossary coverage', () => {
  it('translates every star name the engine can emit', () => {
    const untranslated: string[] = []
    for (const zhName of Object.values(zhStars) as string[]) {
      if (CJK.test(translateStarLabel(zhName))) {
        untranslated.push(zhName)
      }
    }
    expect(untranslated).toEqual([])
  })

  it('translates every palace name the engine can emit', () => {
    const untranslated: string[] = []
    for (const zhName of Object.values(zhPalaces) as string[]) {
      if (CJK.test(translatePalaceName(zhName))) {
        untranslated.push(zhName)
      }
    }
    expect(untranslated).toEqual([])
  })

  it('translates stems, branches, and ganzhi pairs', () => {
    expect(translateStem('庚')).toBe('Geng')
    expect(translateBranch('辰')).toBe('Chen')
    expect(translateGanZhi('庚辰')).toBe('Geng-Chen')
  })

  it('translates shichen names to zodiac hours', () => {
    expect(translateShichen('午时')).toBe('Horse Hour')
    expect(translateShichen('子时')).toBe('Rat Hour')
  })

  it('translates five elements class, zodiac, and nayin', () => {
    expect(translateFiveElementsClass('木三局')).toBe('Wood Class (cycle of 3)')
    expect(translateZodiac('龙')).toBe('Dragon')
    expect(CJK.test(translateNayin('海中金'))).toBe(false)
  })
})
