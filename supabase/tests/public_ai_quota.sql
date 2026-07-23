-- Run against a disposable database after all 20260723 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/public_ai_quota.sql
begin;

do $$
declare
  v_global_hash text := repeat('A', 43);
  v_ip_one_hash text := repeat('B', 43);
  v_ip_two_hash text := repeat('C', 43);
  v_ip_three_hash text := repeat('D', 43);
  v_allowed boolean;
  v_retry integer;
  v_window date := (statement_timestamp() at time zone 'UTC')::date;
begin
  assert (
    select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'public_ai_daily_quotas'
  ), 'public AI quota rows must have RLS enabled';

  assert not has_table_privilege(
    'anon', 'public.public_ai_daily_quotas', 'SELECT'
  ), 'anonymous users must not read public AI subject hashes';
  assert not has_table_privilege(
    'authenticated', 'public.public_ai_daily_quotas', 'SELECT'
  ), 'authenticated browser users must not read public AI subject hashes';
  assert not has_table_privilege(
    'anon', 'public.public_ai_daily_quotas', 'INSERT'
  ), 'anonymous users must not mint quota';
  assert not has_table_privilege(
    'authenticated', 'public.public_ai_daily_quotas', 'UPDATE'
  ), 'authenticated browser users must not alter quota';
  assert not has_table_privilege(
    'service_role', 'public.public_ai_daily_quotas', 'SELECT'
  ), 'service role must use only the SECURITY DEFINER quota RPC';
  assert not has_table_privilege(
    'service_role', 'public.public_ai_daily_quotas', 'INSERT'
  ), 'service role must not insert quota rows directly';
  assert not has_table_privilege(
    'service_role', 'public.public_ai_daily_quotas', 'UPDATE'
  ), 'service role must not update quota rows directly';
  assert not has_table_privilege(
    'service_role', 'public.public_ai_daily_quotas', 'DELETE'
  ), 'service role must not delete quota rows directly';

  assert not has_function_privilege(
    'anon',
    'public.claim_public_ai_daily_quota(text,text,integer,integer)',
    'EXECUTE'
  ), 'anonymous users must not call the quota claim RPC';
  assert not has_function_privilege(
    'authenticated',
    'public.claim_public_ai_daily_quota(text,text,integer,integer)',
    'EXECUTE'
  ), 'authenticated browser users must not call the quota claim RPC';
  assert has_function_privilege(
    'service_role',
    'public.claim_public_ai_daily_quota(text,text,integer,integer)',
    'EXECUTE'
  ), 'only the service role needs quota claim execution';

  assert (
    select array_agg(column_name::text order by ordinal_position)
      = array['window_start', 'subject_hash', 'request_count']::text[]
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'public_ai_daily_quotas'
  ), 'quota persistence must contain only UTC window, irreversible subject hash, and count';

  insert into public.public_ai_daily_quotas (
    window_start,
    subject_hash,
    request_count
  )
  select
    v_window - 8,
    lpad(value::text, 43, 'S'),
    1
  from generate_series(1, 101) value;

  select allowed, retry_after_seconds
    into v_allowed, v_retry
    from public.claim_public_ai_daily_quota(
      v_global_hash,
      v_ip_one_hash,
      2,
      1
    );
  assert v_allowed, 'the first claim must be allowed';
  assert v_retry between 1 and 86400, 'retry delay must end at the next UTC day';

  select allowed
    into v_allowed
    from public.claim_public_ai_daily_quota(
      v_global_hash,
      v_ip_one_hash,
      2,
      1
    );
  assert not v_allowed, 'the per-IP limit must reject without incrementing';

  select allowed
    into v_allowed
    from public.claim_public_ai_daily_quota(
      v_global_hash,
      v_ip_two_hash,
      2,
      1
    );
  assert v_allowed, 'another IP may consume the remaining global request';

  select allowed
    into v_allowed
    from public.claim_public_ai_daily_quota(
      v_global_hash,
      v_ip_three_hash,
      2,
      1
    );
  assert not v_allowed, 'the global limit must reject every further IP';

  assert (
    select request_count = 2
      from public.public_ai_daily_quotas
     where window_start = v_window
       and subject_hash = v_global_hash
  ), 'the global counter must never exceed its limit';
  assert (
    select request_count = 1
      from public.public_ai_daily_quotas
     where window_start = v_window
       and subject_hash = v_ip_one_hash
  ), 'a rejected IP claim must not increment its counter';
  assert not exists (
    select 1
      from public.public_ai_daily_quotas
     where window_start = v_window
       and subject_hash = v_ip_three_hash
  ), 'a globally rejected claim must not create an IP row';
  assert (
    select count(*) = 1
      from public.public_ai_daily_quotas
     where window_start < v_window - 7
  ), 'successful claims must delete at most one bounded batch of 100 stale rows';

  begin
    perform public.claim_public_ai_daily_quota(
      v_global_hash,
      v_global_hash,
      2,
      1
    );
    raise exception 'identical purpose hashes must fail';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

rollback;
