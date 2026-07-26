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
  boundaries use the traditional unequal ancient-distance sequence, scaled
  from 365.5 du to 360 degrees; they are not 28 equal sectors.
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
  fraction of the allowed orb. A relationship involving Zi Qi is marked as a
  mixed model.

The traditional rule and mansion tables were cross-checked against the
MIT-licensed Mingyu core implementation and its cited sources: *Guolao
Xingzong*, *Yuding Wuxing Jingyi*, *Xingxue Dacheng*, and the Zi Qi passage in
*Qizheng Suan Neipian*. Only the compact rules and numeric tables above are
implemented here; interpretation, predictive scoring, and unverified school
variants are out of scope.

The local v1 contract deliberately leaves dignity as unavailable (`—`) rather
than assigning a neutral value. A complete, sourced dignity table is a later
fact-layer change and must not be inferred from the anonymous fixture.

## Fail-closed boundary

The provider requires Cinnabar's saved resolved local time, exact reliability,
coordinates, IANA timezone, and resolved UTC offset. Unknown or approximate
time returns no Qizheng facts. Calculation errors return no substitute chart,
and the provider contains no network request or external-service fallback.
