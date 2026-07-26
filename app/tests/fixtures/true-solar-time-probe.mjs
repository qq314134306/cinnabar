import { resolveBirthTime } from '../../src/lib/true-solar-time.ts'

const result = resolveBirthTime({
  year: 1990,
  month: 3,
  day: 11,
  hour: 1,
  birthplace: 'New York',
  enabled: true,
  birthplaces: [{
    name: 'New York',
    country: 'United States',
    tz: 'America/New_York',
    longitude: -74.006,
  }],
})

process.stdout.write(JSON.stringify({
  year: result.year,
  month: result.month,
  day: result.day,
  hour: result.hour,
  minute: result.minute,
  timeIndex: result.timeIndex,
  correctionMinutes: result.correctionMinutes,
  crossedDate: result.crossedDate,
}))
