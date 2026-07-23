-- Run against a disposable database after all 20260723 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/paypal_webhook_reconciliation.sql
begin;

do $$
declare
  v_user_id uuid := '24000000-0000-0000-0000-000000000001';
  v_purchase public.future_report_purchases%rowtype;
  v_outcome text;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', 'paypal-webhook-test@example.invalid', '',
    now(), now(), now()
  );

  select * into v_purchase
    from public.create_future_report_purchase(
      v_user_id,
      '1-year',
      990,
      'USD',
      '34000000-0000-4000-8000-000000000001'
    );

  update public.future_report_purchases
     set paypal_order_id = 'ORDER-DISPUTE-FIRST',
         payment_status = 'created'
   where id = v_purchase.id;
  update public.future_report_purchases
     set payment_status = 'capture_pending'
   where id = v_purchase.id;

  select public.apply_future_report_paypal_state(
    v_purchase.id,
    'disputed',
    'ORDER-DISPUTE-FIRST',
    'CAPTURE-DISPUTE-FIRST',
    now(),
    'PP-D-FIRST'
  ) into v_outcome;
  assert v_outcome = 'updated',
    'a dispute before local completion must lay an irreversible tombstone';

  select public.apply_future_report_paypal_state(
    v_purchase.id,
    'completed',
    'ORDER-DISPUTE-FIRST',
    'CAPTURE-DISPUTE-FIRST',
    now(),
    null
  ) into v_outcome;
  assert v_outcome = 'blocked_terminal',
    'completion after dispute must be acknowledged without restoring access';

  select * into v_purchase
    from public.future_report_purchases
   where id = v_purchase.id;
  assert v_purchase.payment_status = 'disputed'
     and v_purchase.paypal_dispute_id = 'PP-D-FIRST',
    'dispute tombstone and evidence must remain durable';

  begin
    update public.future_report_purchases
       set payment_status = 'completed'
     where id = v_purchase.id;
    assert false, 'direct completion cannot regress the disputed terminal state';
  exception when raise_exception then
    assert sqlerrm = 'future_report_terminal_payment_state';
  end;

  assert public.claim_paypal_webhook_event(
    'WH-SQL-IDEMPOTENCY',
    'PAYMENT.CAPTURE.COMPLETED'
  ), 'first event claim must succeed';
  perform public.finish_paypal_webhook_event(
    'WH-SQL-IDEMPOTENCY',
    'processed',
    'payment_blocked_terminal',
    'CAPTURE-DISPUTE-FIRST'
  );
  assert not public.claim_paypal_webhook_event(
    'WH-SQL-IDEMPOTENCY',
    'PAYMENT.CAPTURE.COMPLETED'
  ), 'processed event ID must be idempotent';
end;
$$;

rollback;
