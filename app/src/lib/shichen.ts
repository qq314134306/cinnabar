/* ============================================================
   Traditional two-hour periods (shichen), labeled by zodiac animal
   ============================================================ */

const SHICHEN_ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
] as const

export function hourToShichen(hour: number): string {
  const index = Math.floor(((hour + 1) % 24) / 2)
  return `${SHICHEN_ANIMALS[index]} Hour`
}

export function getShichenOptions() {
  return SHICHEN_ANIMALS.map((animal, index) => {
    const startHour = index === 0 ? 23 : (index * 2 - 1)
    const endHour = index === 11 ? 22 : index === 0 ? 0 : (index * 2)
    const range = index === 0
      ? '23:00–00:59'
      : `${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:59`
    return {
      value: index === 0 ? 23 : index * 2,
      label: `${range} (${animal} Hour)`,
    }
  })
}
