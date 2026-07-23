-- Run against a disposable migrated Supabase database:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/credit_ledger.sql
begin;
do $$
declare
  v_user_id uuid := '10000000-0000-0000-0000-000000000001';
  v_first record; v_repeat record; v_balance bigint; v_count integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', 'ledger-test@example.invalid', '',
    now(), now(), now()
  );
  select count(*), sum(amount) into v_count, v_balance
    from public.credit_ledger
   where user_id = v_user_id and entry_type = 'registration_grant';
  assert v_count = 1 and v_balance = 30, 'registration grants 30 exactly once';

  perform public.grant_registration_credits(v_user_id);
  select count(*) into v_count from public.credit_ledger
   where user_id = v_user_id and entry_type = 'registration_grant';
  assert v_count = 1, 'registration grant is idempotent';

  select * into v_first from public.spend_credits(
    v_user_id, 7, 'test:purchase:1', '{"tier":"test"}'
  );
  assert v_first.balance = 23 and v_first.created, 'first debit succeeds';
  select * into v_repeat from public.spend_credits(
    v_user_id, 7, 'test:purchase:1', '{"tier":"test"}'
  );
  assert v_repeat.ledger_id = v_first.ledger_id
     and v_repeat.balance = 23 and not v_repeat.created,
    'repeated business key returns original debit';

  begin
    perform public.spend_credits(v_user_id, 8, 'test:purchase:1', '{"tier":"test"}');
    assert false, 'changed data under a used business key must fail';
  exception when unique_violation then null;
  end;
  begin
    perform public.spend_credits(v_user_id, 24, 'test:purchase:2');
    assert false, 'overspend must fail';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.spend_credits(v_user_id, 0, 'test:zero');
    assert false, 'zero debit must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.spend_credits(v_user_id, -1, 'test:negative');
    assert false, 'negative debit argument must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.spend_credits(v_user_id, 1, '   ');
    assert false, 'blank business key must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.spend_credits(v_user_id, 1, 'test:array', '[]'::jsonb);
    assert false, 'non-object metadata must fail';
  exception when invalid_parameter_value then null;
  end;
  select balance into v_balance from public.credit_balances;
  assert v_balance = 23, 'failed overspend leaves balance unchanged';

  begin
    update public.credit_ledger set amount = 999 where id = v_first.ledger_id;
    assert false, 'ledger update must fail';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

-- Add another account, then exercise RLS as the first authenticated user.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'ledger-test-2@example.invalid', '',
  now(), now(), now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
do $$
declare
  v_visible_entries integer;
  v_visible_balance bigint;
begin
  select count(*) into v_visible_entries from public.credit_activity;
  assert v_visible_entries = 2,
    'activity view must expose only the current user ledger';
  select balance into v_visible_balance from public.credit_balances;
  assert v_visible_balance = 23,
    'balance view must aggregate only the current user ledger';
  begin
    perform business_key, metadata, account_id, user_id
      from public.credit_ledger limit 1;
    assert false, 'authenticated must not read internal ledger columns';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- ACL checks plus actual denied execution as an authenticated browser role.
set local role authenticated;
do $$
begin
  begin
    insert into public.credit_ledger (
      account_id, user_id, amount, entry_type, business_key
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      -1, 'debit', 'forbidden'
    );
    assert false, 'authenticated insert must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.spend_credits(
      '10000000-0000-0000-0000-000000000001', 1, 'forbidden'
    );
    assert false, 'authenticated spend execution must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  assert (
    select pg_catalog.array_agg(attribute.attname order by attribute.attnum)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.credit_activity'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) = array['id', 'amount', 'entry_type', 'created_at']::name[],
    'credit_activity must expose exactly the four display-safe columns';
  assert (
    select pg_catalog.array_agg(attribute.attname order by attribute.attnum)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.credit_balances'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) = array['balance']::name[],
    'credit_balances must not expose user_id';
  assert not has_table_privilege(
    'authenticated', 'public.credit_ledger', 'SELECT'
  ), 'authenticated must not receive whole-table SELECT';
  assert has_column_privilege(
    'authenticated', 'public.credit_ledger', 'id', 'SELECT'
  );
  assert has_column_privilege(
    'authenticated', 'public.credit_ledger', 'amount', 'SELECT'
  );
  assert has_column_privilege(
    'authenticated', 'public.credit_ledger', 'entry_type', 'SELECT'
  );
  assert has_column_privilege(
    'authenticated', 'public.credit_ledger', 'created_at', 'SELECT'
  );
  assert not has_column_privilege(
    'authenticated', 'public.credit_ledger', 'account_id', 'SELECT'
  );
  assert not has_column_privilege(
    'authenticated', 'public.credit_ledger', 'user_id', 'SELECT'
  );
  assert not has_column_privilege(
    'authenticated', 'public.credit_ledger', 'business_key', 'SELECT'
  );
  assert not has_column_privilege(
    'authenticated', 'public.credit_ledger', 'metadata', 'SELECT'
  );
  assert has_table_privilege(
    'authenticated', 'public.credit_activity', 'SELECT'
  );
  assert has_table_privilege(
    'authenticated', 'public.credit_balances', 'SELECT'
  );
  assert not has_table_privilege('authenticated', 'public.credit_ledger', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.credit_ledger', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.credit_ledger', 'DELETE');
  assert not has_table_privilege('service_role', 'public.credit_ledger', 'INSERT');
  assert not has_table_privilege('service_role', 'public.credit_ledger', 'UPDATE');
  assert not has_table_privilege('service_role', 'public.credit_ledger', 'DELETE');
  assert not has_function_privilege(
    'authenticated', 'public.spend_credits(uuid,integer,text,jsonb)', 'EXECUTE'
  );
  assert has_function_privilege(
    'service_role', 'public.spend_credits(uuid,integer,text,jsonb)', 'EXECUTE'
  );
  assert not has_function_privilege(
    'service_role', 'public.grant_registration_credits(uuid)', 'EXECUTE'
  );
  assert not has_function_privilege(
    'service_role', 'public.reject_credit_ledger_mutation()', 'EXECUTE'
  );
  assert not has_function_privilege(
    'service_role', 'public.handle_new_user()', 'EXECUTE'
  );
  assert not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid in (
      'public.grant_registration_credits(uuid)'::regprocedure,
      'public.handle_new_user()'::regprocedure,
      'public.spend_credits(uuid,integer,text,jsonb)'::regprocedure
    )
    and r.rolname <> 'postgres'
  ), 'all credit SECURITY DEFINER functions must be owned by postgres';
end;
$$;

-- The service role cannot write the table and can execute only the intended RPC.
set local role service_role;
do $$
begin
  begin
    insert into public.credit_ledger (
      account_id, user_id, amount, entry_type, business_key
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      -1, 'debit', 'forbidden-service-role'
    );
    assert false, 'service_role direct insert must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select * from public.spend_credits(
  '10000000-0000-0000-0000-000000000001', 1, 'test:service-role'
);
reset role;

-- Account deletion pseudonymizes ownership via FK SET NULL, while retaining
-- immutable ledger amounts under account_id. Direct deletes remain forbidden.
delete from auth.users
where id = '10000000-0000-0000-0000-000000000002';
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.credit_ledger
   where account_id = '10000000-0000-0000-0000-000000000002'
     and user_id is null;
  assert v_count = 1, 'account deletion must pseudonymize retained ledger rows';
  begin
    delete from public.credit_ledger
     where account_id = '10000000-0000-0000-0000-000000000002';
    assert false, 'direct ledger delete must fail after pseudonymization';
  exception when sqlstate '55000' then null;
  end;
end;
$$;
rollback;
