-- Run against a disposable database after all 20260723 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/auth_login_transactions.sql
begin;

do $$
declare
  v_email_handle text := repeat('a', 43);
  v_oauth_handle text := repeat('b', 43);
begin
  assert (
    select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'app_auth_login_transactions'
  ), 'login transactions must have RLS enabled';

  assert not has_table_privilege(
    'anon', 'public.app_auth_login_transactions', 'SELECT'
  ), 'anonymous users must not read login transactions';
  assert not has_table_privilege(
    'authenticated', 'public.app_auth_login_transactions', 'SELECT'
  ), 'browser users must not read login transactions';
  assert not has_table_privilege(
    'authenticated', 'public.app_auth_login_transactions', 'INSERT'
  ), 'browser users must not create login transactions';
  assert not has_table_privilege(
    'authenticated', 'public.app_auth_login_transactions', 'UPDATE'
  ), 'browser users must not claim login transactions';
  assert not has_table_privilege(
    'authenticated', 'public.app_auth_login_transactions', 'DELETE'
  ), 'browser users must not delete login transactions';
  assert has_table_privilege(
    'service_role', 'public.app_auth_login_transactions', 'SELECT'
  ), 'service role must read login transactions';
  assert has_table_privilege(
    'service_role', 'public.app_auth_login_transactions', 'INSERT'
  ), 'service role must create login transactions';
  assert has_table_privilege(
    'service_role', 'public.app_auth_login_transactions', 'UPDATE'
  ), 'service role must claim login transactions';
  assert has_table_privilege(
    'service_role', 'public.app_auth_login_transactions', 'DELETE'
  ), 'service role must delete login transactions';

  assert (
    select array_agg(column_name::text order by ordinal_position)
      = array[
        'handle_hash',
        'flow_type',
        'encryption_key_version',
        'verifier_ciphertext',
        'verifier_iv',
        'callback_url',
        'created_at',
        'expires_at',
        'claimed_at'
      ]::text[]
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'app_auth_login_transactions'
  ), 'login transaction schema must remain minimal and contain no identity or provider-token columns';

  insert into public.app_auth_login_transactions (
    handle_hash,
    flow_type,
    encryption_key_version,
    verifier_ciphertext,
    verifier_iv,
    callback_url,
    created_at,
    expires_at
  ) values (
    v_email_handle,
    'email',
    'v1',
    repeat('c', 32),
    repeat('d', 16),
    'https://example.test/api/auth/callback',
    statement_timestamp(),
    statement_timestamp() + interval '1 hour'
  );

  insert into public.app_auth_login_transactions (
    handle_hash,
    flow_type,
    encryption_key_version,
    verifier_ciphertext,
    verifier_iv,
    callback_url,
    created_at,
    expires_at
  ) values (
    v_oauth_handle,
    'oauth',
    'v1',
    repeat('e', 32),
    repeat('f', 16),
    'http://localhost:5173/api/auth/callback',
    statement_timestamp(),
    statement_timestamp() + interval '10 minutes'
  );

  update public.app_auth_login_transactions
     set claimed_at = statement_timestamp()
   where handle_hash = v_oauth_handle
     and claimed_at is null;
  assert found, 'an unclaimed transaction must be claimable exactly once';

  update public.app_auth_login_transactions
     set claimed_at = statement_timestamp()
   where handle_hash = v_oauth_handle
     and claimed_at is null;
  assert not found, 'a claimed transaction must not be claimable again';

  begin
    insert into public.app_auth_login_transactions (
      handle_hash,
      flow_type,
      encryption_key_version,
      verifier_ciphertext,
      verifier_iv,
      callback_url,
      created_at,
      expires_at
    ) values (
      repeat('g', 43),
      'oauth',
      'v1',
      repeat('h', 32),
      repeat('i', 16),
      'https://example.test/api/auth/callback',
      statement_timestamp(),
      statement_timestamp() + interval '11 minutes'
    );
    raise exception 'oauth transaction exceeding ten minutes must fail';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.app_auth_login_transactions (
      handle_hash,
      flow_type,
      encryption_key_version,
      verifier_ciphertext,
      verifier_iv,
      callback_url,
      created_at,
      expires_at
    ) values (
      repeat('j', 43),
      'email',
      'v1',
      repeat('k', 32),
      repeat('l', 16),
      'https://example.test/api/auth/callback',
      statement_timestamp(),
      statement_timestamp() + interval '1 hour 1 second'
    );
    raise exception 'email transaction exceeding one hour must fail';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
