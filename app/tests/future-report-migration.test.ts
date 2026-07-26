import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/migrations/20260723010000_future_report_payments.sql',
    import.meta.url,
  )),
  'utf8',
)

describe('Future Report database safety contract', () => {
  it('enforces monotonic terminal payment and generation states', () => {
    expect(migration).toContain("old.payment_status in ('refunded', 'disputed')")
    expect(migration).toContain('future_report_illegal_payment_transition')
    expect(migration).toContain('future_report_illegal_generation_transition')
    expect(migration).toContain('future_report_generation_requires_completed_payment')
  })

  it('owns open-order quota and generation retry/backoff in the database', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('future_report_open_order_limit')
    expect(migration).toContain('generation_attempt_count >= 3')
    expect(migration).toContain('future_report_generation_backoff')
    expect(migration).toContain('claim_future_report_generation')
  })

  it('purges chart and generated content when an account is deleted', () => {
    expect(migration).toContain('old.user_id is not null and new.user_id is null')
    expect(migration).toContain('new.chart_fingerprint := null')
    expect(migration).toContain('new.generation_input := null')
    expect(migration).toContain('new.generated_report := null')
    expect(migration).toContain("new.generation_status := 'purged'")
  })
})
