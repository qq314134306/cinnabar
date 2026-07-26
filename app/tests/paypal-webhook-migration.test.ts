import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/migrations/20260723020000_paypal_webhook_reconciliation.sql',
    import.meta.url,
  )),
  'utf8',
)
const sqlBehaviorTest = readFileSync(
  fileURLToPath(new URL(
    '../../supabase/tests/paypal_webhook_reconciliation.sql',
    import.meta.url,
  )),
  'utf8',
)

describe('PayPal webhook/reconciliation database contract', () => {
  it('deduplicates by event ID and safely retries failed or expired processing', () => {
    expect(migration).toContain('event_id             text primary key')
    expect(migration).toContain('claim_paypal_webhook_event')
    expect(migration).toContain("delivery_status in ('processed', 'ignored')")
    expect(migration).toContain("v_event.delivery_status = 'processing'")
    expect(migration).toContain('lease_expires_at > now()')
  })

  it('applies PayPal states through a service-role-only monotonic RPC', () => {
    expect(migration).toContain('apply_future_report_paypal_state')
    expect(migration).toContain(
      "v_purchase.payment_status = 'capture_pending'\n        and p_target_status in ('completed', 'denied')",
    )
    expect(migration).toContain(
      "v_purchase.payment_status = 'completed'\n        and p_target_status in ('refunded', 'disputed')",
    )
    expect(migration).toContain(
      "old.payment_status in ('refunded', 'disputed', 'denied')",
    )
    expect(migration).toContain(
      "old.payment_status in ('creating', 'created', 'capture_pending')\n      and new.payment_status = 'disputed'",
    )
    expect(migration).toContain("v_outcome := 'blocked_terminal'")
    expect(migration).toContain('future_report_paypal_order_conflict')
    expect(migration).toContain('future_report_paypal_capture_conflict')
    expect(migration).toContain('grant execute on function public.apply_future_report_paypal_state')
  })

  it('persists a keyset cursor and retry backoff between cron invocations', () => {
    expect(migration).toContain('create table public.paypal_reconciliation_state')
    expect(migration).toContain('cursor_created_at')
    expect(migration).toContain('cursor_purchase_id')
    expect(migration).toContain('next_retry_at')
    expect(migration).toContain('advance_paypal_reconciliation_cursor')
    expect(migration).toContain('defer_paypal_reconciliation')
  })

  it('has a SQL behavior case proving dispute then completion stays disputed', () => {
    expect(sqlBehaviorTest).toContain("'disputed'")
    expect(sqlBehaviorTest).toContain("'completed'")
    expect(sqlBehaviorTest).toContain("v_outcome = 'blocked_terminal'")
    expect(sqlBehaviorTest).toContain("v_purchase.payment_status = 'disputed'")
    expect(sqlBehaviorTest).toContain('future_report_terminal_payment_state')
  })

  it('is isolated from the credit ledger and never stores raw webhook bodies', () => {
    expect(migration).not.toContain('credit_ledger')
    expect(migration).not.toContain('raw_body')
    expect(migration).not.toContain('headers json')
    expect(migration).toContain('paypal_webhook_events')
  })
})
