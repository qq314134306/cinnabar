-- ============================================================
-- Cinnabar - server-owned opaque browser sessions
-- Apply after 20260723030000_future_report_server_chart.sql.
--
-- Browser cookies contain only a random SID. Supabase access/refresh tokens
-- and the CSRF secret are AES-GCM ciphertext produced by the application.
-- This migration never contains or derives the encryption key.
-- ============================================================

create table public.app_auth_sessions (
  id                         uuid primary key,
  sid_hash                   text not null unique,
  user_id                    uuid not null references auth.users (id) on delete cascade,
  migration_state            text not null default 'active'
    check (migration_state in ('pending', 'active')),
  migration_token_hash       text,
  encryption_key_version     text not null,
  access_token_ciphertext    text not null,
  access_token_iv            text not null,
  refresh_token_ciphertext   text not null,
  refresh_token_iv           text not null,
  token_expires_at           timestamptz not null,
  csrf_hash                  text not null,
  csrf_secret_ciphertext     text not null,
  csrf_secret_iv             text not null,
  last_seen_at               timestamptz not null default now(),
  absolute_expires_at        timestamptz not null,
  revoked_at                 timestamptz,
  revoke_reason              text,
  refresh_lease_id           uuid,
  refresh_lease_expires_at   timestamptz,
  version                    bigint not null default 1 check (version > 0),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint app_auth_sessions_sid_hash_shape check (
    sid_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint app_auth_sessions_csrf_hash_shape check (
    csrf_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint app_auth_sessions_migration_hash_shape check (
    migration_token_hash is null
    or migration_token_hash ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint app_auth_sessions_key_version_shape check (
    encryption_key_version ~ '^[A-Za-z0-9_-]{1,32}$'
  ),
  constraint app_auth_sessions_ciphertext_bounds check (
    length(access_token_ciphertext) between 16 and 20000
    and length(refresh_token_ciphertext) between 16 and 20000
    and length(csrf_secret_ciphertext) between 16 and 512
  ),
  constraint app_auth_sessions_iv_shape check (
    access_token_iv ~ '^[A-Za-z0-9_-]{16}$'
    and refresh_token_iv ~ '^[A-Za-z0-9_-]{16}$'
    and csrf_secret_iv ~ '^[A-Za-z0-9_-]{16}$'
  ),
  constraint app_auth_sessions_lifetime check (
    absolute_expires_at > created_at
    and last_seen_at >= created_at
  ),
  constraint app_auth_sessions_revocation_shape check (
    (revoked_at is null and revoke_reason is null)
    or
    (
      revoked_at is not null
      and revoke_reason is not null
      and length(revoke_reason) between 1 and 64
    )
  ),
  constraint app_auth_sessions_refresh_lease_shape check (
    (refresh_lease_id is null and refresh_lease_expires_at is null)
    or
    (refresh_lease_id is not null and refresh_lease_expires_at is not null)
  ),
  constraint app_auth_sessions_migration_state_shape check (
    (
      migration_state = 'active'
      and migration_token_hash is null
    )
    or
    (
      migration_state = 'pending'
      and migration_token_hash is not null
    )
  )
);

create index app_auth_sessions_user_active_idx
  on public.app_auth_sessions (user_id, absolute_expires_at)
  where revoked_at is null and migration_state = 'active';

create unique index app_auth_sessions_pending_migration_idx
  on public.app_auth_sessions (user_id, migration_token_hash)
  where revoked_at is null and migration_state = 'pending';

create index app_auth_sessions_expiry_idx
  on public.app_auth_sessions (absolute_expires_at)
  where revoked_at is null;

alter table public.app_auth_sessions enable row level security;
revoke all on public.app_auth_sessions from public, anon, authenticated;
grant select, insert, update on public.app_auth_sessions to service_role;

create table public.app_auth_events (
  id            bigint generated always as identity primary key,
  session_id    uuid references public.app_auth_sessions (id) on delete set null,
  user_id       uuid references auth.users (id) on delete set null,
  event_type    text not null check (event_type in (
    'migration_succeeded',
    'migration_started',
    'migration_failed',
    'migration_reauth_required',
    'session_authenticated',
    'session_rejected',
    'session_refreshed',
    'refresh_failed',
    'identity_conflict',
    'logout'
  )),
  reason        text check (reason is null or length(reason) between 1 and 64),
  request_id    text check (request_id is null or length(request_id) between 1 and 64),
  created_at    timestamptz not null default now()
);

create index app_auth_events_user_created_idx
  on public.app_auth_events (user_id, created_at desc);

alter table public.app_auth_events enable row level security;
revoke all on public.app_auth_events from public, anon, authenticated;
grant insert on public.app_auth_events to service_role;

create function public.claim_app_auth_session_refresh(
  p_session_id uuid,
  p_expected_version bigint,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  if p_session_id is null or p_expected_version is null or p_lease_id is null then
    raise exception 'auth_session_refresh_claim_invalid' using errcode = '22023';
  end if;

  update public.app_auth_sessions
     set refresh_lease_id = p_lease_id,
         refresh_lease_expires_at = pg_catalog.now() + interval '30 seconds',
         updated_at = pg_catalog.now()
   where id = p_session_id
     and version = p_expected_version
     and migration_state = 'active'
     and revoked_at is null
     and absolute_expires_at > pg_catalog.now()
     -- Never steal an expired lease at the same token version: the former
     -- owner may have reached the provider before dying. Reusing that refresh
     -- token would trigger rotation-family reuse detection. Stale leases are
     -- CAS-revoked by the application and require a fresh login.
     and refresh_lease_id is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_app_auth_session_refresh(uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_app_auth_session_refresh(uuid, bigint, uuid)
  to service_role;

do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_roles r on r.oid = p.proowner
     where p.oid = 'public.claim_app_auth_session_refresh(uuid,bigint,uuid)'::regprocedure
       and r.rolname <> 'postgres'
  ) then
    raise exception 'auth session SECURITY DEFINER function must be owned by postgres';
  end if;
end;
$$;

comment on table public.app_auth_sessions is
  'Opaque BFF browser sessions. SID and CSRF values are stored only as hashes; Supabase tokens and the recoverable CSRF secret are application AES-GCM ciphertext.';
comment on table public.app_auth_events is
  'PII-minimized authentication audit trail. Tokens, cookies, CSRF values, encryption keys, and vendor errors must never be written here.';
comment on function public.claim_app_auth_session_refresh(uuid, bigint, uuid) is
  'Durable short refresh lease. Callers must finish with matching lease ID and version so refresh-token rotation cannot be overwritten by a concurrent request.';
