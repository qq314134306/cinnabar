import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const probe = fileURLToPath(new URL(
  './fixtures/true-solar-time-probe.mjs',
  import.meta.url,
))

function runInTimezone(timezone: string): unknown {
  const output = execFileSync(process.execPath, [probe], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TZ: timezone,
    },
  })
  return JSON.parse(output)
}

describe('true solar time host-timezone determinism', () => {
  it('returns the same wall-clock result in distant host timezones', () => {
    const losAngeles = runInTimezone('America/Los_Angeles')
    const tokyo = runInTimezone('Asia/Tokyo')
    const utc = runInTimezone('UTC')

    expect(losAngeles).toEqual(tokyo)
    expect(tokyo).toEqual(utc)
  })
})
