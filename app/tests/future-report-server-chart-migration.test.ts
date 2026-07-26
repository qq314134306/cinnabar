import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/migrations/20260723030000_future_report_server_chart.sql',
    import.meta.url,
  )),
  'utf8',
)

describe('Future Report server-chart database contract', () => {
  it('replaces the browser facts shape with a versioned server snapshot', () => {
    expect(migration).toContain('drop constraint if exists future_report_generation_input_shape_check')
    expect(migration).toContain("future-report.server-chart.v1")
    expect(migration).toContain("generation_input -> 'birth'")
    expect(migration).toContain("generation_input -> 'chartFacts'")
    expect(migration).toContain("generation_input -> 'yearlyFacts'")
  })

  it('enforces the tier year-count boundary in stored snapshots', () => {
    expect(migration).toContain(
      "(tier = '1-year' and jsonb_array_length(generation_input -> 'years') = 2)",
    )
    expect(migration).toContain(
      "(tier = '5-year' and jsonb_array_length(generation_input -> 'years') = 5)",
    )
  })

  it('requires complete nested birth data and matching fingerprint copies', () => {
    expect(migration).toContain("'{birth,location,timezone}'")
    expect(migration).toContain("'{birth,resolved,timeIndex}'")
    expect(migration).toContain('future_report_snapshot_fingerprint_match_check')
    expect(migration).toContain(
      "chart_fingerprint = generation_input ->> 'chartFingerprint'",
    )
  })
})
