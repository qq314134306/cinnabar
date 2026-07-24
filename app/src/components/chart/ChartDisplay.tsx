/* ============================================================
   Natal chart visualization
   Follows the full Wenmo Tianji display standard:
   - Complete stars + brightness levels
   - Palace stems + decadal ranges
   - Boshi/Changsheng cycle gods + adjective stars
   - Life/Body masters + Na Yin element

   The iztro chart is kept in zh-CN internally; every string is
   translated to English at this presentation layer via the glossary.
   ============================================================ */

import { useState } from 'react'
import { useChartStore } from '@/stores'
import type { BirthInfo, FunctionalAstrolabe } from '@/lib/astro'
import { BirthTimeSensitivity } from './BirthTimeSensitivity'
import { BaZiFourPillars } from './BaZiFourPillars'
import {
  getMajorStarExplanation,
  getPalaceExplanation,
} from '@/lib/chart-explanations'
import {
  collectNatalTransformations,
  NATAL_TRANSFORMATION_ORDER,
  type NatalTransformation,
  type NatalTransformationCode,
  type NatalTransformationPalaceInput,
} from '@/lib/chart-transformations'
import {
  getFlankingPalaces,
  getSanFangSiZheng,
  type FlankingPalaceSide,
  type PalaceRelationRole,
} from '@/lib/palace-relations'
import {
  collectPalaceOriginTransformations,
  type PalaceOriginTransformation,
} from '@/lib/palace-origin-transformations'
import { TimingLens } from './TimingLens'
import {
  translateBrightness,
  translateFiveElementsClass,
  translateGanZhi,
  translateMutagen,
  translateNayin,
  translatePalaceName,
  translateShichen,
  translateStarLabel,
  translateStem,
  translateBranch,
  translateZodiac,
  translateWesternSign,
} from '@/lib/ziwei-glossary'

/* ------------------------------------------------------------
   Palace grid positions (keyed by earthly branch, zh-CN internal)
   ------------------------------------------------------------ */

const PALACE_POSITIONS: Record<string, { row: number; col: number }> = {
  '巳': { row: 0, col: 0 }, '午': { row: 0, col: 1 },
  '未': { row: 0, col: 2 }, '申': { row: 0, col: 3 },
  '辰': { row: 1, col: 0 }, '酉': { row: 1, col: 3 },
  '卯': { row: 2, col: 0 }, '戌': { row: 2, col: 3 },
  '寅': { row: 3, col: 0 }, '丑': { row: 3, col: 1 },
  '子': { row: 3, col: 2 }, '亥': { row: 3, col: 3 },
}

/* ------------------------------------------------------------
   Na Yin table (sixty jiazi, zh-CN keys from the engine)
   ------------------------------------------------------------ */

const NAYIN_TABLE: Record<string, string> = {
  '甲子': '海中金', '乙丑': '海中金', '丙寅': '炉中火', '丁卯': '炉中火',
  '戊辰': '大林木', '己巳': '大林木', '庚午': '路旁土', '辛未': '路旁土',
  '壬申': '剑锋金', '癸酉': '剑锋金', '甲戌': '山头火', '乙亥': '山头火',
  '丙子': '涧下水', '丁丑': '涧下水', '戊寅': '城头土', '己卯': '城头土',
  '庚辰': '白蜡金', '辛巳': '白蜡金', '壬午': '杨柳木', '癸未': '杨柳木',
  '甲申': '泉中水', '乙酉': '泉中水', '丙戌': '屋上土', '丁亥': '屋上土',
  '戊子': '霹雳火', '己丑': '霹雳火', '庚寅': '松柏木', '辛卯': '松柏木',
  '壬辰': '长流水', '癸巳': '长流水', '甲午': '砂中金', '乙未': '砂中金',
  '丙申': '山下火', '丁酉': '山下火', '戊戌': '平地木', '己亥': '平地木',
  '庚子': '壁上土', '辛丑': '壁上土', '壬寅': '金箔金', '癸卯': '金箔金',
  '甲辰': '覆灯火', '乙巳': '覆灯火', '丙午': '天河水', '丁未': '天河水',
  '戊申': '大驿土', '己酉': '大驿土', '庚戌': '钗钏金', '辛亥': '钗钏金',
  '壬子': '桑柘木', '癸丑': '桑柘木', '甲寅': '大溪水', '乙卯': '大溪水',
  '丙辰': '沙中土', '丁巳': '沙中土', '戊午': '天上火', '己未': '天上火',
  '庚申': '石榴木', '辛酉': '石榴木', '壬戌': '大海水', '癸亥': '大海水',
}

function getNayin(ganZhi: string): string {
  return translateNayin(NAYIN_TABLE[ganZhi])
}

/* ------------------------------------------------------------
   Brightness styling (keys are zh-CN from the engine)
   ------------------------------------------------------------ */

const BRIGHTNESS_STYLE: Record<string, string> = {
  '庙': 'text-fortune',
  '旺': 'text-gold',
  '得': 'text-star-light',
  '利': 'text-star-light',
  '平': 'text-text-muted',
  '不': 'text-misfortune/70',
  '陷': 'text-misfortune',
}

/* ------------------------------------------------------------
   Data types
   ------------------------------------------------------------ */

interface StarData {
  name: string
  brightness?: string
  mutagen?: string
}

interface PalaceData {
  name: string
  stem: string
  branch: string
  majorStars: StarData[]
  minorStars: StarData[]
  adjectiveStars: string[]
  decadal: { range: [number, number] }
  boshi12: string
  changsheng12: string
  isLife: boolean
  isBody: boolean
}

/* ------------------------------------------------------------
   Star tag — with brightness and transformation
   ------------------------------------------------------------ */

interface StarTagProps {
  star: StarData
  showBrightness?: boolean
}

function StarTag({ star, showBrightness = true }: StarTagProps) {
  const { name, brightness, mutagen } = star
  const hasMutagen = !!mutagen
  const brightnessInfo = translateBrightness(brightness)
  const brightnessStyle = brightness ? BRIGHTNESS_STYLE[brightness] || '' : ''
  const mutagenInfo = translateMutagen(mutagen)

  const mutagenStyle = {
    '禄': 'bg-gradient-to-r from-fortune/20 to-fortune/10 text-fortune',
    '权': 'bg-gradient-to-r from-gold/20 to-gold/10 text-gold',
    '科': 'bg-gradient-to-r from-star/20 to-star/10 text-star-light',
    '忌': 'bg-gradient-to-r from-misfortune/20 to-misfortune/10 text-misfortune',
  }[mutagen || ''] || ''

  return (
    <span
      className={`
        inline-flex items-center gap-0.5 text-[11px] px-1 py-0.5 rounded
        transition-all duration-200
        ${hasMutagen ? mutagenStyle + ' font-medium' : 'bg-white/5 text-text-secondary hover:bg-white/10'}
      `}
    >
      {translateStarLabel(name)}
      {showBrightness && brightnessInfo && (
        <span className={`text-[9px] ${brightnessStyle}`}>{brightnessInfo.code}</span>
      )}
      {mutagenInfo && <span className="text-[9px]">{mutagenInfo.code}</span>}
    </span>
  )
}

/* ------------------------------------------------------------
   Palace card
   ------------------------------------------------------------ */

interface PalaceCardProps extends PalaceData {
  isSelected?: boolean
  relation?: PalaceRelationRole
  onClick?: () => void
}

function PalaceCard({
  name, stem, branch, majorStars, minorStars, adjectiveStars, decadal,
  boshi12, changsheng12, isLife, isBody, isSelected, relation, onClick
}: PalaceCardProps) {
  const decadalRange = decadal?.range ? `${decadal.range[0]}-${decadal.range[1]}` : ''
  const displayName = translatePalaceName(name)
  const relationLabel = relation === 'focus'
    ? 'Focus'
    : relation === 'trine'
      ? 'Trine'
      : relation === 'opposite'
        ? 'Opposite'
        : null

  return (
    <button
      type="button"
      onClick={onClick}
      data-palace-relation={relation}
      aria-label={`Explain ${displayName}`}
      aria-pressed={isSelected}
      aria-controls={isSelected ? 'selected-palace-explanation' : undefined}
      aria-describedby={relationLabel ? `palace-relation-${branch}` : undefined}
      className={`
        group relative p-1.5 lg:p-3 h-full min-h-[130px] lg:min-h-[170px] flex flex-col text-left
        bg-white/[0.03] backdrop-blur-sm
        border border-white/[0.06] rounded-xl
        transition-all duration-300 cursor-pointer
        hover:bg-white/[0.06] hover:border-white/[0.12]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
        focus-visible:ring-offset-2 focus-visible:ring-offset-night
        ${isLife ? 'ring-1 ring-gold/50 bg-gold/[0.03]' : ''}
        ${isBody ? 'ring-1 ring-star/50 bg-star/[0.03]' : ''}
        ${relation === 'trine' ? 'ring-1 ring-gold/40 bg-gold/[0.05]' : ''}
        ${relation === 'opposite' ? 'ring-1 ring-star/40 bg-star/[0.05]' : ''}
        ${isSelected ? 'ring-2 ring-star' : ''}
      `}
    >
      {/* Header: palace stem-branch + name + decadal range */}
      <div className="flex items-center justify-between mb-1.5 text-[10px]">
        <span className="text-text-muted font-mono">{translateStem(stem)}-{translateBranch(branch)}</span>
        <div className="flex items-center gap-1">
          {decadalRange && (
            <span className="text-star-light/60 font-mono">{decadalRange}</span>
          )}
          <span className={`
            px-1 py-0.5 rounded font-medium
            ${isLife ? 'bg-gold/20 text-gold' : ''}
            ${isBody ? 'bg-star/20 text-star-light' : ''}
            ${!isLife && !isBody ? 'text-text-secondary' : ''}
          `}>
            {displayName}
          </span>
        </div>
      </div>

      {relationLabel && (
        <span
          id={`palace-relation-${branch}`}
          className={`
          mb-1 w-fit rounded-full border px-1.5 py-0.5 text-[8px]
          uppercase tracking-wider
          ${relation === 'focus'
            ? 'border-star/30 text-star-light'
            : relation === 'opposite'
              ? 'border-star/20 text-star-light/80'
              : 'border-gold/20 text-gold/80'
          }
        `}
        >
          {relationLabel}
        </span>
      )}

      {/* Major stars */}
      <div className="flex flex-wrap gap-0.5 mb-1">
        {majorStars.map((star, i) => (
          <StarTag key={i} star={star} />
        ))}
      </div>

      {/* Minor stars */}
      <div className="flex flex-wrap gap-0.5 mb-1">
        {minorStars.map((star, i) => (
          <StarTag key={i} star={star} showBrightness={false} />
        ))}
      </div>

      {/* Adjective stars */}
      {adjectiveStars.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-1 flex-1">
          {adjectiveStars.map((name, i) => (
            <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-white/[0.03] text-text-muted/70">
              {translateStarLabel(name)}
            </span>
          ))}
        </div>
      )}

      {/* Footer: cycle gods */}
      <div className="flex justify-between text-[9px] text-text-muted/60 mt-auto pt-1 border-t border-white/[0.04]">
        <span>{translateStarLabel(changsheng12)}</span>
        <span>{translateStarLabel(boshi12)}</span>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------
   Natal Four Transformations navigation
   ------------------------------------------------------------ */

interface FourTransformationsPanelProps {
  transformations: NatalTransformation[]
  selectedTransformation: NatalTransformationCode | null
  onSelectTransformation: (transformation: NatalTransformation) => void
}

const TRANSFORMATION_STYLES: Record<NatalTransformationCode, string> = {
  '禄': 'border-fortune/25 bg-fortune/[0.06] text-fortune',
  '权': 'border-gold/25 bg-gold/[0.06] text-gold',
  '科': 'border-star/25 bg-star/[0.06] text-star-light',
  '忌': 'border-misfortune/25 bg-misfortune/[0.06] text-misfortune',
}

function FourTransformationsPanel({
  transformations,
  selectedTransformation,
  onSelectTransformation,
}: FourTransformationsPanelProps) {
  return (
    <section
      aria-labelledby="natal-four-transformations-heading"
      className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 lg:p-4"
    >
      <div className="max-w-3xl">
        <h3
          id="natal-four-transformations-heading"
          className="text-sm font-semibold text-text"
        >
          Natal Four Transformations
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          A local index of which natal stars carry Lu, Quan, Ke, and Ji.
          Choose one to open its palace and four-palace context. These labels
          organize the chart; none is a standalone verdict.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {NATAL_TRANSFORMATION_ORDER.map((code) => {
          const info = translateMutagen(code)
          const entry = transformations.find((item) => item.code === code)

          if (!info || !entry) {
            return (
              <div
                key={code}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <p className="text-xs font-medium text-text-muted">
                  {info?.code ?? code}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Not available in this chart
                </p>
              </div>
            )
          }

          const palaceLabel = translatePalaceName(entry.palaceName)
          const isSelected = selectedTransformation === code

          return (
            <button
              key={code}
              type="button"
              aria-label={`Open ${info.code} transformation in ${palaceLabel}`}
              aria-pressed={isSelected}
              aria-controls={isSelected
                ? 'selected-palace-explanation'
                : undefined}
              onClick={() => onSelectTransformation(entry)}
              className={`
                rounded-lg border p-3 text-left transition-colors
                hover:bg-white/[0.08]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
                ${TRANSFORMATION_STYLES[code]}
                ${isSelected ? 'ring-2 ring-star' : ''}
              `}
            >
              <span className="block text-xs font-semibold">
                {info.code}
              </span>
              <span className="mt-1 block text-sm font-medium text-text">
                {translateStarLabel(entry.starName)}
              </span>
              <span className="mt-0.5 block text-xs text-text-secondary">
                {palaceLabel}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------
   Selected-palace explanation
   ------------------------------------------------------------ */

interface PalaceExplanationPanelProps {
  palace: PalaceData
  relatedPalaces: Array<{
    palace: PalaceData
    role: PalaceRelationRole
  }>
  flankingPalaces: Array<{
    palace: PalaceData
    side: FlankingPalaceSide
  }>
  originTransformations: PalaceOriginTransformation[]
  onNavigatePalace: (palaceName: string) => void
  onClose: () => void
}

function PalaceExplanationPanel({
  palace,
  relatedPalaces,
  flankingPalaces,
  originTransformations,
  onNavigatePalace,
  onClose,
}: PalaceExplanationPanelProps) {
  const palaceExplanation = getPalaceExplanation(palace.name)
  const majorStarExplanations = palace.majorStars.flatMap((star) => {
    const explanation = getMajorStarExplanation(star.name)
    return explanation ? [{ star, explanation }] : []
  })

  return (
    <section
      id="selected-palace-explanation"
      aria-labelledby="selected-palace-heading"
      className="
        mt-3 p-4 lg:p-5 rounded-xl border border-star/20
        bg-gradient-to-br from-star/[0.10] to-white/[0.03]
      "
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-star-light/70">
            Reflective guide
          </p>
          <h3
            id="selected-palace-heading"
            className="mt-1 text-base lg:text-lg font-semibold text-text"
          >
            About the {translatePalaceName(palace.name)}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close palace explanation"
          className="
            shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5
            text-xs text-text-secondary transition-colors
            hover:border-white/20 hover:bg-white/[0.06] hover:text-text
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-star
          "
        >
          Close
        </button>
      </div>

      {palaceExplanation ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <p className="text-sm leading-relaxed text-text-secondary">
            {palaceExplanation.summary}
          </p>
          <div className="rounded-lg bg-black/10 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Keep in balance
            </p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {palaceExplanation.watchFor}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          A local guide for this palace is not available yet.
        </p>
      )}

      <section
        aria-labelledby="san-fang-si-zheng-heading"
        className="mt-4 border-t border-white/[0.08] pt-4"
      >
        <h4
          id="san-fang-si-zheng-heading"
          className="text-xs font-medium uppercase tracking-wider text-text-muted"
        >
          San Fang Si Zheng · Four-palace view
        </h4>
        {relatedPalaces.length === 4 ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Read the focus palace together with its opposite and two trine
              palaces. This organizes context; it does not calculate strength
              or determine an outcome.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {relatedPalaces.map(({ palace: relatedPalace, role }, index) => {
                const trineNumber = relatedPalaces
                  .slice(0, index + 1)
                  .filter((item) => item.role === 'trine')
                  .length
                const roleLabel = role === 'focus'
                  ? 'Focus'
                  : role === 'opposite'
                    ? 'Opposite'
                    : `Trine ${trineNumber}`

                return (
                  <article
                    key={relatedPalace.branch}
                    data-relation-summary={role}
                    className="rounded-lg border border-white/[0.06] bg-black/10 p-3"
                  >
                    <p className="text-[9px] uppercase tracking-wider text-text-muted">
                      {roleLabel}
                    </p>
                    <h5 className="mt-1 text-sm font-medium text-gold">
                      {translatePalaceName(relatedPalace.name)}
                    </h5>
                    <p className="mt-0.5 text-[10px] text-text-muted">
                      {translateBranch(relatedPalace.branch)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {relatedPalace.majorStars.length > 0 ? (
                        relatedPalace.majorStars.map((star) => (
                          <StarTag key={star.name} star={star} />
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">
                          No major star
                        </span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            A four-palace relationship is unavailable for this engine label.
            Cinnabar will not invent one.
          </p>
        )}
      </section>

      <section
        aria-labelledby="flanking-palaces-heading"
        className="mt-4 border-t border-white/[0.08] pt-4"
      >
        <h4
          id="flanking-palaces-heading"
          className="text-xs font-medium uppercase tracking-wider text-text-muted"
        >
          Flanking Palaces · Adjacent context
        </h4>
        {flankingPalaces.length === 2 ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              The two neighboring palaces sit immediately beside the focus
              palace. This shows structural context only; it does not classify
              the pair as supportive or difficult.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {flankingPalaces.map(({ palace: flankingPalace, side }) => (
                <article
                  key={flankingPalace.branch}
                  data-flanking-summary={side}
                  className="rounded-lg border border-white/[0.06] bg-black/10 p-3"
                >
                  <p className="text-[9px] uppercase tracking-wider text-text-muted">
                    {side === 'previous' ? 'Previous neighbor' : 'Next neighbor'}
                  </p>
                  <h5 className="mt-1 text-sm font-medium text-gold">
                    {translatePalaceName(flankingPalace.name)}
                  </h5>
                  <p className="mt-0.5 text-[10px] text-text-muted">
                    {translateBranch(flankingPalace.branch)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {flankingPalace.majorStars.length > 0 ? (
                      flankingPalace.majorStars.map((star) => (
                        <StarTag key={star.name} star={star} />
                      ))
                    ) : (
                      <span className="text-xs text-text-muted">
                        No major star
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Both neighboring palaces are required for this structural view.
            Cinnabar will not fill missing engine data.
          </p>
        )}
      </section>

      <section
        aria-labelledby="palace-origin-transformations-heading"
        className="mt-4 border-t border-white/[0.08] pt-4"
      >
        <h4
          id="palace-origin-transformations-heading"
          className="text-xs font-medium uppercase tracking-wider text-text-muted"
        >
          Palace-origin Four Transformations
        </h4>
        {originTransformations.length === 4 ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              The selected palace&apos;s {translateStem(palace.stem)} stem
              supplies an engine-owned Lu, Quan, Ke, and Ji star-to-palace
              map. This is structural navigation only; it does not judge
              direction or outcome.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {originTransformations.map((transformation) => {
                const info = translateMutagen(transformation.code)
                const targetLabel = transformation.targetPalaceName
                  ? translatePalaceName(transformation.targetPalaceName)
                  : null

                return (
                  <article
                    key={transformation.code}
                    data-palace-origin-transformation={transformation.code}
                    className={`
                      rounded-lg border p-3
                      ${TRANSFORMATION_STYLES[transformation.code]}
                    `}
                  >
                    <p className="text-xs font-semibold">
                      {info?.code ?? transformation.code}
                    </p>
                    <p className="mt-1 text-sm font-medium text-gold">
                      {transformation.starName
                        ? translateStarLabel(transformation.starName)
                        : 'Star unavailable'}
                    </p>
                    {targetLabel ? (
                      <>
                        <h5 className="mt-1 text-xs font-medium text-text-secondary">
                          <span className="text-text-muted">Flows to </span>
                          {targetLabel}
                        </h5>
                        <p className="mt-0.5 text-[10px] text-text-muted">
                          {translateBranch(
                            transformation.targetPalaceBranch ?? undefined,
                          )}
                        </p>
                        {transformation.isSamePalace ? (
                          <span className="mt-2 block text-xs text-text-secondary">
                            Same palace
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Open ${info?.code ?? transformation.code} destination in ${targetLabel}`}
                            onClick={() => onNavigatePalace(
                              transformation.targetPalaceName ?? '',
                            )}
                            className="
                              mt-2 rounded-md border border-white/[0.08]
                              px-2 py-1 text-xs text-text-secondary
                              transition-colors hover:bg-white/[0.08]
                              hover:text-text focus-visible:outline-none
                              focus-visible:ring-2 focus-visible:ring-star
                            "
                          >
                            Open target
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-text-muted">
                        Destination unavailable
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            This engine palace does not expose a complete origin map. Cinnabar
            will not reconstruct one from assumptions.
          </p>
        )}
      </section>

      <div className="mt-4 border-t border-white/[0.08] pt-4">
        <h4 className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Major stars in this palace
        </h4>
        {majorStarExplanations.length > 0 ? (
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {majorStarExplanations.map(({ star, explanation }) => (
              <article
                key={star.name}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <h5 className="text-sm font-medium text-gold">
                  {translateStarLabel(star.name)}
                </h5>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {explanation.summary}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
                  <span className="font-medium text-text-secondary">Keep in balance:</span>{' '}
                  {explanation.watchFor}
                </p>
              </article>
            ))}
          </div>
        ) : palace.majorStars.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            This palace has no major star. Read its supporting stars and related
            palaces as context rather than treating the space as empty.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Detailed local notes are not available for this major-star label yet.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        Use this as a reflective starting point. One palace or star never
        defines an outcome.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------
   Center info panel
   ------------------------------------------------------------ */

interface CenterInfoProps {
  chart: FunctionalAstrolabe
  solarDate: string
  gender: string
  birthInfo: BirthInfo
}

function CenterInfo({ chart, solarDate, gender, birthInfo }: CenterInfoProps) {
  const yearGanZhi = chart.chineseDate?.split(' ')[0] || ''
  const nayin = getNayin(yearGanZhi)
  const resolvedTime = birthInfo.resolvedBirthTime
  const showCorrection = birthInfo.trueSolarEnabled && resolvedTime?.applied
  const showUnmatched = birthInfo.trueSolarEnabled && birthInfo.birthplace && !resolvedTime?.applied

  return (
    <div className="
      relative h-full min-h-[280px] lg:min-h-[360px] p-3 lg:p-4
      flex flex-col items-center justify-center
      bg-gradient-to-br from-white/[0.04] to-white/[0.02]
      backdrop-blur-md border border-white/[0.08] rounded-xl
    ">
      {/* Backdrop ring */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border-2 border-white" />
      </div>

      {/* Title */}
      <h3 className="
        text-lg lg:text-xl font-semibold mb-3
        bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent
      " style={{ fontFamily: 'var(--font-serif)' }}>
        Zi Wei Natal Chart
      </h3>

      {/* Info list */}
      <div className="text-xs lg:text-sm text-text-secondary space-y-1.5 text-center">
        <p><span className="text-text-muted">Born</span> <span className="text-text">{solarDate}</span></p>
        <p><span className="text-text-muted">Zi Wei year</span> <span className="text-text font-mono">{translateGanZhi(yearGanZhi)}</span></p>
        <p>
          <span className="text-text-muted">Hour</span>{' '}
          <span className="text-text">
            {birthInfo.birthTimeUnknown === true
              ? 'Unknown · shortlist required'
              : (
                <>
                  {translateShichen(chart.time)} {chart.timeRange}
                  {birthInfo.birthTimeReliable === false
                    ? ' · Approximate'
                    : ''}
                </>
              )}
          </span>
        </p>
        {showCorrection && resolvedTime && (
          <p>
            <span className="text-text-muted">True solar time</span>{' '}
            <span className="text-gold">
              {resolvedTime.location?.enName ?? resolvedTime.location?.name} {formatTime(resolvedTime.hour, resolvedTime.minute)}
              {resolvedTime.originalShichen !== resolvedTime.correctedShichen
                ? ` — ${translateShichen(resolvedTime.originalShichen)} corrected to ${translateShichen(resolvedTime.correctedShichen)}`
                : ' — hour unchanged'}
            </span>
          </p>
        )}
        {showUnmatched && (
          <p>
            <span className="text-text-muted">True solar time</span>{' '}
            <span className="text-text-muted">cast with your entered time</span>
          </p>
        )}
        <p><span className="text-text-muted">Gender</span> <span className="text-text">{gender}</span></p>
        {nayin && (
          <p><span className="text-text-muted">Na Yin</span> <span className="text-gold">{nayin}</span></p>
        )}
      </div>

      {/* Five elements class + life/body masters */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] w-full">
        <div className="flex justify-center gap-2 mb-2">
          <span className="
            px-2 py-0.5 rounded-full text-xs
            bg-gradient-to-r from-star/20 to-gold/20
            text-star-light font-medium border border-star/20
          ">
            {translateFiveElementsClass(chart.fiveElementsClass)}
          </span>
        </div>
        <div className="flex justify-center gap-4 text-xs">
          <p><span className="text-text-muted">Life Master</span> <span className="text-gold">{translateStarLabel(chart.soul)}</span></p>
          <p><span className="text-text-muted">Body Master</span> <span className="text-star-light">{translateStarLabel(chart.body)}</span></p>
        </div>
        <div className="flex justify-center gap-4 text-xs mt-1">
          <p><span className="text-text-muted">Zodiac</span> <span className="text-text">{translateZodiac(chart.zodiac)}</span></p>
          <p><span className="text-text-muted">Sign</span> <span className="text-text">{translateWesternSign(chart.sign)}</span></p>
        </div>
      </div>
    </div>
  )
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/* ------------------------------------------------------------
   Chart parsing — full detail
   ------------------------------------------------------------ */

function parsePalaces(chart: FunctionalAstrolabe): PalaceData[] {
  return (chart.palaces || []).map((palace) => {
    const majorStars: StarData[] = (palace.majorStars || []).map((s) => ({
      name: s.name as string,
      brightness: s.brightness as string | undefined,
      mutagen: s.mutagen as string | undefined,
    }))

    const minorStars: StarData[] = (palace.minorStars || []).map((s) => ({
      name: s.name as string,
      brightness: s.brightness as string | undefined,
      mutagen: s.mutagen as string | undefined,
    }))

    const adjectiveStars: string[] = (palace.adjectiveStars || []).map(
      (s) => String(s.name)
    )

    return {
      name: palace.name as string,
      stem: palace.heavenlyStem as string,
      branch: palace.earthlyBranch as string,
      majorStars,
      minorStars,
      adjectiveStars,
      decadal: palace.decadal as { range: [number, number] },
      boshi12: palace.boshi12 as string || '',
      changsheng12: palace.changsheng12 as string || '',
      isLife: palace.name === '命宫',
      isBody: palace.isBodyPalace === true,
    }
  })
}

/* ------------------------------------------------------------
   Main chart component
   ------------------------------------------------------------ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function ChartDisplay() {
  const { chart, birthInfo } = useChartStore()
  const [selectedPalace, setSelectedPalace] = useState<string | null>(null)
  const [selectedTransformation, setSelectedTransformation] =
    useState<NatalTransformationCode | null>(null)

  if (!chart || !birthInfo) return null
  if (birthInfo.birthTimeUnknown === true) {
    return (
      <div className="relative rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.06] to-transparent p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:p-6">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold/70">
            Chart held until a time block is chosen
          </p>
          <h2 className="mt-1 text-lg font-semibold text-text lg:text-xl">
            Birth hour not set
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Your date and gender are saved, but Cinnabar is not displaying the
            noon placeholder as a natal chart. Compare all 13 time blocks
            below, then explicitly apply the candidate you want to inspect.
          </p>
        </div>
        <BirthTimeSensitivity />
      </div>
    )
  }

  const palaceData = parsePalaces(chart)
  const transformations = collectNatalTransformations(
    chart.palaces as unknown as NatalTransformationPalaceInput[],
  )
  const selectedPalaceData = palaceData.find(
    (palace) => palace.name === selectedPalace,
  ) ?? null
  const selectedRelations = selectedPalaceData
    ? getSanFangSiZheng(selectedPalaceData.branch)
    : []
  const relationByBranch = new Map(
    selectedRelations.map((relation) => [relation.branch, relation.role]),
  )
  const relatedPalaces = selectedRelations.flatMap((relation) => {
    const palace = palaceData.find((item) => item.branch === relation.branch)
    return palace ? [{ palace, role: relation.role }] : []
  })
  const selectedFlanks = selectedPalaceData
    ? getFlankingPalaces(selectedPalaceData.branch)
    : []
  const flankingPalaces = selectedFlanks.flatMap((flank) => {
    const palace = palaceData.find((item) => item.branch === flank.branch)
    return palace ? [{ palace, side: flank.side }] : []
  })
  const rawSelectedPalace = selectedPalaceData
    ? (
        typeof chart.palace === 'function'
          ? chart.palace(
              selectedPalaceData.name as Parameters<typeof chart.palace>[0],
            )
          : chart.palaces.find((palace) => (
              palace.name === selectedPalaceData.name
              && palace.earthlyBranch === selectedPalaceData.branch
            ))
      )
    : null
  const originTransformations = collectPalaceOriginTransformations(
    rawSelectedPalace,
  )
  const grid: (PalaceData | null)[][] = Array(4).fill(null).map(() => Array(4).fill(null))

  palaceData.forEach((p) => {
    const pos = PALACE_POSITIONS[p.branch]
    if (pos) grid[pos.row][pos.col] = p
  })

  const solarDate = `${MONTH_NAMES[birthInfo.month - 1]} ${birthInfo.day}, ${birthInfo.year}`
  const gender = birthInfo.gender === 'male' ? 'Male' : 'Female'

  const renderPalace = (palace: PalaceData | null, key: string) => {
    if (!palace) return <div key={key} />
    return (
      <PalaceCard
        key={key}
        {...palace}
        isSelected={selectedPalace === palace.name}
        relation={relationByBranch.get(palace.branch)}
        onClick={() => {
          setSelectedTransformation(null)
          setSelectedPalace((current) => (
            current === palace.name ? null : palace.name
          ))
        }}
      />
    )
  }

  return (
    <div className="
      relative p-3 lg:p-6
      bg-gradient-to-br from-white/[0.04] to-transparent
      backdrop-blur-xl border border-white/[0.08] rounded-2xl
      shadow-[0_8px_32px_rgba(0,0,0,0.3)]
      max-w-6xl mx-auto
    ">
      {/* Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-star/50 to-transparent" />

      {/* 4x4 grid */}
      <div className="grid grid-cols-4 gap-1 lg:gap-2">
        {/* Row 0 */}
        {grid[0].map((p, c) => renderPalace(p, `0-${c}`))}

        {/* Row 1: left + center(2x2) + right */}
        {renderPalace(grid[1][0], '1-0')}
        <div className="col-span-2 row-span-2">
          <CenterInfo chart={chart} solarDate={solarDate} gender={gender} birthInfo={birthInfo} />
        </div>
        {renderPalace(grid[1][3], '1-3')}

        {/* Row 2: left + right (center already spans) */}
        {renderPalace(grid[2][0], '2-0')}
        {renderPalace(grid[2][3], '2-3')}

        {/* Row 3 */}
        {grid[3].map((p, c) => renderPalace(p, `3-${c}`))}
      </div>

      <FourTransformationsPanel
        transformations={transformations}
        selectedTransformation={selectedTransformation}
        onSelectTransformation={(transformation) => {
          setSelectedTransformation(transformation.code)
          setSelectedPalace(transformation.palaceName)
        }}
      />

      <BaZiFourPillars birthInfo={birthInfo} />

      <TimingLens
        chart={chart}
        birthInfo={birthInfo}
        onSelectPalace={(palaceName) => {
          setSelectedTransformation(null)
          setSelectedPalace(palaceName)
        }}
        onContextChange={() => {
          setSelectedTransformation(null)
          setSelectedPalace(null)
        }}
      />

      {selectedPalaceData && (
        <PalaceExplanationPanel
          palace={selectedPalaceData}
          relatedPalaces={relatedPalaces}
          flankingPalaces={flankingPalaces}
          originTransformations={originTransformations}
          onNavigatePalace={(palaceName) => {
            setSelectedTransformation(null)
            setSelectedPalace(palaceName)
          }}
          onClose={() => {
            setSelectedTransformation(null)
            setSelectedPalace(null)
          }}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-3 pt-3 border-t border-white/[0.06] text-[10px]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gold" />
          <span className="text-text-muted">Life Palace</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-star-light" />
          <span className="text-text-muted">Body Palace</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-fortune">Lu</span>
          <span className="text-gold">Quan</span>
          <span className="text-star-light">Ke</span>
          <span className="text-misfortune">Ji</span>
          <span className="text-text-muted">Four Transformations</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-fortune">+3</span>
          <span className="text-gold">+2</span>
          <span className="text-text-muted">−1</span>
          <span className="text-misfortune">−3</span>
          <span className="text-text-muted">Brightness</span>
        </div>
      </div>

      <BirthTimeSensitivity />
    </div>
  )
}
