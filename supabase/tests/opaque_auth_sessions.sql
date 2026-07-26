-- Run against a disposable database after all 20260723 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/opaque_auth_sessions.sql
begin;

do $$
declare
  v_user_id uuid := '25000000-0000-0000-0000-000000000001';
  v_session_id uuid := '25000000-0000-4000-8000-000000000002';
  v_first_lease uuid := '25000000-0000-4000-8000-000000000003';
  v_second_lease uuid := '25000000-0000-4000-8000-000000000004';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', 'opaque-session-test@example.invalid', '',
    now(), now(), now()
  );

  insert into public.app_auth_sessions (
    id,
    sid_hash,
    user_id,
    encryption_key_version,
    access_token_ciphertext,
    access_token_iv,
    refresh_token_ciphertext,
    refresh_token_iv,
    token_expires_at,
    csrf_hash,
    csrf_secret_ciphertext,
    csrf_secret_iv,
    absolute_expires_at
  ) values (
    v_session_id,
    repeat('a', 43),
    v_user_id,
    'v1',
    repeat('b', 32),
    repeat('c', 16),
    repeat('d', 32),
    repeat('e', 16),
    now() + interval '1 hour',
    repeat('f', 43),
    repeat('g', 32),
    repeat('h', 16),
    now() + interval '1 day'
  );

  assert public.claim_app_auth_session_refresh(
    v_session_id, 1, v_first_lease
  ), 'first matching refresh lease claim must succeed';
  assert not public.claim_app_auth_session_refresh(
    v_session_id, 1, v_second_lease
  ), 'a concurrent refresh lease claim must fail';

  update public.app_auth_sessions
     set refresh_lease_expires_at = now() - interval '1 second'
   where id = v_session_id;
  assert not public.claim_app_auth_session_refresh(
    v_session_id, 1, v_second_lease
  ), 'an expired lease at the same token version must not be stolen';
  assert not public.claim_app_auth_session_refresh(
    v_session_id, 2, v_second_lease
  ), 'a stale expected version must not claim a lease';

  assert not has_table_privilege(
    'authenticated', 'public.app_auth_sessions', 'SELECT'
  ), 'browser users must not read opaque sessions';
  assert not has_table_privilege(
    'authenticated', 'public.app_auth_events', 'INSERT'
  ), 'browser users must not write auth events';
  assert has_table_privilege(
    'service_role', 'public.app_auth_sessions', 'SELECT'
  ), 'service role must read sessions for the BFF';
  assert has_function_privilege(
    'service_role',
    'public.claim_app_auth_session_refresh(uuid,bigint,uuid)',
    'EXECUTE'
  ), 'service role must be able to claim a refresh lease';
  assert not has_function_privilege(
    'authenticated',
    'public.claim_app_auth_session_refresh(uuid,bigint,uuid)',
    'EXECUTE'
  ), 'browser users must not claim refresh leases';

  delete from auth.users where id = v_user_id;
  assert not exists (
    select 1 from public.app_auth_sessions where id = v_session_id
  ), 'account deletion must cascade opaque sessions';
end;
$$;

rollback;
