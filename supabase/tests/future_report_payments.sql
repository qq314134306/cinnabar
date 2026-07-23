-- Run against a disposable database after both 20260723 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/future_report_payments.sql
begin;

do $$
declare
  v_user_id uuid := '20000000-0000-0000-0000-000000000001';
  v_purchase public.future_report_purchases%rowtype;
  v_claimed public.future_report_purchases%rowtype;
  v_purchase_id uuid;
  v_index integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', 'future-report-test@example.invalid', '',
    now(), now(), now()
  );

  for v_index in 1..3 loop
    select * into v_purchase
      from public.create_future_report_purchase(
        v_user_id,
        '1-year',
        990,
        'USD',
        ('30000000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid
      );
  end loop;

  begin
    perform public.create_future_report_purchase(
      v_user_id, '1-year', 990, 'USD',
      '30000000-0000-4000-8000-000000000004'
    );
    assert false, 'fourth open order inside one hour must fail';
  exception when raise_exception then
    assert sqlerrm = 'future_report_open_order_limit';
  end;

  select * into v_purchase
    from public.future_report_purchases
   where user_id = v_user_id
   order by created_at
   limit 1;
  v_purchase_id := v_purchase.id;

  update public.future_report_purchases
     set paypal_order_id = 'ORDER-STATE-TEST',
         payment_status = 'created'
   where id = v_purchase_id;
  update public.future_report_purchases
     set payment_status = 'capture_pending',
         chart_fingerprint = repeat('a', 64),
         generation_input = jsonb_build_object(
           'snapshotVersion', 'future-report.server-chart.v1',
           'birth', jsonb_build_object(
             'calendar', 'solar',
             'date', '1990-06-15',
             'hour', 12,
             'gender', 'female',
             'birthTimeReliable', true,
             'trueSolarEnabled', false,
             'location', null,
             'resolved', jsonb_build_object(
               'date', '1990-06-15',
               'hour', 12,
               'minute', 0,
               'timeIndex', 6,
               'correctionMinutes', 0,
               'trueSolarApplied', false
             )
           ),
           'currentYear', 2026,
           'years', jsonb_build_array(2026, 2027),
           'chartFacts', 'facts',
           'yearlyFacts', 'years',
           'persona', 'scholar',
           'chartFingerprint', repeat('a', 64)
         )
   where id = v_purchase_id;
  update public.future_report_purchases
     set payment_status = 'completed',
         paypal_capture_id = 'CAPTURE-STATE-TEST',
         payment_completed_at = now()
   where id = v_purchase_id;

  begin
    update public.future_report_purchases
       set payment_status = 'created'
     where id = v_purchase_id;
    assert false, 'completed payment must not regress';
  exception when raise_exception then null;
  end;

  select * into v_claimed
    from public.claim_future_report_generation(
      v_purchase_id,
      v_user_id,
      clock_timestamp()
    );
  assert v_claimed.payment_status = 'completed'
     and v_claimed.generation_status = 'generating'
     and v_claimed.generation_attempt_count = 1,
    'atomic claim requires completed payment and increments attempts';

  perform public.fail_future_report_generation(
    v_purchase_id,
    v_claimed.generation_started_at
  );
  begin
    perform public.claim_future_report_generation(
      v_purchase_id,
      v_user_id,
      clock_timestamp()
    );
    assert false, 'immediate generation retry must respect database backoff';
  exception when raise_exception then
    assert sqlerrm = 'future_report_generation_backoff';
  end;

  update public.future_report_purchases
     set payment_status = 'refunded'
   where id = v_purchase_id;
  begin
    update public.future_report_purchases
       set payment_status = 'completed'
     where id = v_purchase_id;
    assert false, 'refunded payment is terminal';
  exception when raise_exception then null;
  end;

  delete from auth.users where id = v_user_id;
  select * into v_purchase
    from public.future_report_purchases
   where id = v_purchase_id;
  assert v_purchase.user_id is null
     and v_purchase.chart_fingerprint is null
     and v_purchase.generation_input is null
     and v_purchase.generated_report is null
     and v_purchase.generation_status = 'purged',
    'account deletion retains payment evidence but purges report content';
end;
$$;

do $$
begin
  assert not has_table_privilege(
    'service_role',
    'public.future_report_purchases',
    'INSERT'
  ), 'service role must create purchases through the quota RPC';
end;
$$;

rollback;
