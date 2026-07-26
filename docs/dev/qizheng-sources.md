# Qizheng local engine sources and limits

The production provider is fully local. AOV/Mingyu is used only to preserve a
fixed anonymous development fixture; no runtime code sends birth data to it.

## Adopted calculation layers

- Sun, Moon, Mercury, Venus, Mars, Jupiter, and Saturn use pinned
  `astronomy-engine` 2.1.19 geocentric ecliptic-of-date positions. The package
  is MIT licensed; its notice is retained in
  `docs/licenses/astronomy-engine-MIT.txt`.
- Tropical longitudes are converted to a sidereal longitude using the IAU 2006
  precession polynomial before assigning signs and mansions. The 28 mansion
  boundaries use the exact Mingyu unequal-distance table, whose 28 entries sum
  to **366.5 du** (not 365.5), scaled to 360 degrees. This table is a selected
  project convention rather than a claim that all historical mansion tables
  share that total. Mansion zero is the start of Jiao at 0 degrees in this
  project sidereal coordinate. The coordinate has zero precession offset at
  J2000.0 and applies the documented IAU 2006 polynomial away from that epoch.
- Life Palace follows the Guolao rule “place the birth hour at the Sun and
  count forward to Mao”. Body Palace places the birth hour at the Moon and
  counts backward to You. The Twelve Palaces are laid backward from Life
  Palace. Life Master uses the traditional branch-to-ruler table.
- Rahu/Ketu use an explicitly labelled mean lunar-node approximation. Lunar
  Apogee uses an explicitly labelled mean lunar-apogee approximation. These
  are not presented as true-node or true-Lilith results and are therefore not
  expected to numerically equal that layer in the AOV fixture.
- Zi Qi alone uses the traditional mean-motion model: epoch
  1995-12-31T00:00:00Z at 237.038993 degrees and period 10227.1792 days. It is
  always marked as a traditional mean-motion source, separate from modern
  astronomy.
- Aspects use fixed, documented angular rules: conjunction 0/8 degrees,
  sextile 60/4, square 90/6, trine 120/6, opposition 180/8. Closeness is the
  fraction of the allowed orb. A relationship involving Zi Qi, a mean lunar
  node, or the mean lunar apogee is marked as a mixed model; none of those
  relationships may be labelled same-layer modern astronomy.

## Derived-rule provenance

The mansion table, Life/Body Palace formulas, Life Master table, aspect orbs,
precession polynomial, and Zi Qi constants were derived from
[`Brhiza/mingyu`](https://github.com/Brhiza/mingyu) commit
`6e8e1beb5396eb468c3ee15833b35061e1208798`, specifically
[`packages/core/src/qi_zheng/index.ts`](https://github.com/Brhiza/mingyu/blob/6e8e1beb5396eb468c3ee15833b35061e1208798/packages/core/src/qi_zheng/index.ts):

- lines 5-17: quoted rule summary and bibliography;
- lines 40-83: 28-distance and Life Master tables;
- lines 386-428: aspect angles, orbs, and closeness calculation;
- lines 473-545 and 661-665: Zi Qi epoch, period, source records, and formula;
- lines 682-714: precession and mansion conversion; and
- lines 1575-1591: Life Palace, Body Palace, Twelve Palace, and Life Master
  calculation.

That package declares `author: Brhiza` and `license: MIT` in
`packages/core/package.json`; its complete `packages/core/LICENSE` notice,
“Copyright (c) 2025 mingyu”, is retained verbatim in
`docs/licenses/mingyu-core-MIT.txt`. Astronomy Engine remains independently
covered by `docs/licenses/astronomy-engine-MIT.txt`.

Classical locations used by that implementation are recorded precisely enough
to audit the selected passages:

- *Guolao Xingzong* (明刻本系统，卷一“入门起例／安命度法”): the instruction
  placing the birth hour at the Sun and counting forward to Mao for Life;
  Mingyu's file header preserves the exact quoted sentence. The Body rule is
  the adjacent Mingyu-selected Moon/You passage; because historical schools
  vary, this implementation claims only that selected convention.
- *Xingxue Dacheng* (《四库全书》本，全览“十二宫立命”段): discusses using
  the Sun and birth hour to establish Life Palace and the coordinate caveat.
- *Qizheng Suan Neipian* (《世宗庄宪大王实录》所载《七政算内外篇》，
  “四余星第七·紫气”): “顺行二十八年一周天”, `10227.1792`-day
  period, `1256.5224`-day post-solstice parameter, and “二十八日一度”.
- *Gujin Lülü Kao* (《四库全书》本，卷五十八，紫气立成校勘段): repeats
  the period and records the terminal-rounding discrepancy.
- *Gexiang Xinshu* (《四库全书》本，卷三，紫气段) and *Goryeosa*
  (卷五十二，历志“紫气”段): separately record uniform/direct motion and
  the daily rate.

Only the compact rules and numeric tables above are implemented here;
interpretation, predictive scoring, and unverified school variants are out of
scope.

The local v1 contract deliberately leaves dignity as unavailable (`—`) rather
than assigning a neutral value. A complete, sourced dignity table is a later
fact-layer change and must not be inferred from the anonymous fixture.

## Fail-closed boundary

The provider requires Cinnabar's saved resolved local time, explicit
`birthTimeReliable === true`, finite in-range coordinates, a non-empty valid
IANA timezone, and an integer resolved offset in the supported -12:00 to
+14:00 range. It derives the UTC instant from the saved local time and offset,
then formats that instant through the IANA zone to verify the local fields and
historical DST choice. Missing, unknown, approximate, conflicting, or invalid
evidence returns no Qizheng facts. Calculation errors return no substitute
chart, and the provider contains no network request or external-service
fallback.

The AOV fixture has two explicitly different roles. Its seven modern-body
positions are an external ephemeris cross-check. Its Life/Body Palace, mansion,
aspect, and Zi Qi fields come from the same Mingyu rule lineage documented
above and are only same-source regression parity—not independent validation.
The local mean-node and mean-apogee approximations are intentionally not
expected to match AOV's true-node and true-Lilith layer.
