-- Apply after 20260723050000_auth_login_transactions.sql

begin;

create table public.public_ai_daily_quotas (
  window_start date not null,
  subject_hash text not null
    check (subject_hash ~ '^[A-Za-z0-9_-]{43}$'),
  request_count integer not null
    check (request_count between 1 and 1000000),
  primary key (window_start, subject_hash)
);

alter table public.public_ai_daily_quotas enable row level security;
revoke all on public.public_ai_daily_quotas
  from public, anon, authenticated, service_role;

comment on table public.public_ai_daily_quotas is
  'Atomic UTC-day public AI quota counters. Subject hashes are purpose-separated server HMACs; raw IP addresses are never stored.';
comment on column public.public_ai_daily_quotas.subject_hash is
  'Base64url HMAC-SHA-256 of a server-owned scope label or normalized client IP.';

create or replace function public.claim_public_ai_daily_quota(
  p_global_subject_hash text,
  p_ip_subject_hash text,
  p_global_limit integer,
  p_ip_limit integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_window_start date := (pg_catalog.statement_timestamp() at time zone 'UTC')::date;
  v_global_count integer;
  v_ip_count integer;
  v_retry_after integer;
begin
  if (
    p_global_subject_hash is null
    or p_ip_subject_hash is null
    or p_global_limit is null
    or p_ip_limit is null
    or p_global_subject_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_ip_subject_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_global_subject_hash = p_ip_subject_hash
    or p_global_limit not between 1 and 1000000
    or p_ip_limit not between 1 and 1000000
    or p_global_limit < p_ip_limit
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_public_ai_quota_claim';
  end if;

  -- One UTC-day lock serializes the global counter and both row updates.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public_ai_daily_quota'),
    pg_catalog.hashtext(v_window_start::text)
  );

  select q.request_count
    into v_global_count
    from public.public_ai_daily_quotas q
   where q.window_start = v_window_start
     and q.subject_hash = p_global_subject_hash;

  select q.request_count
    into v_ip_count
    from public.public_ai_daily_quotas q
   where q.window_start = v_window_start
     and q.subject_hash = p_ip_subject_hash;

  v_retry_after := greatest(
    1,
    least(
      86400,
      pg_catalog.ceil(extract(
        epoch from (
          (v_window_start + 1)::timestamp
          - (pg_catalog.statement_timestamp() at time zone 'UTC')
        )
      ))::integer
    )
  );

  if (
    coalesce(v_global_count, 0) >= p_global_limit
    or coalesce(v_ip_count, 0) >= p_ip_limit
  ) then
    return query select false, v_retry_after;
    return;
  end if;

  insert into public.public_ai_daily_quotas (
    window_start,
    subject_hash,
    request_count
  ) values (
    v_window_start,
    p_global_subject_hash,
    1
  )
  on conflict (window_start, subject_hash)
  do update set request_count =
    public.public_ai_daily_quotas.request_count + 1;

  insert into public.public_ai_daily_quotas (
    window_start,
    subject_hash,
    request_count
  ) values (
    v_window_start,
    p_ip_subject_hash,
    1
  )
  on conflict (window_start, subject_hash)
  do update set request_count =
    public.public_ai_daily_quotas.request_count + 1;

  -- Bounded opportunistic cleanup keeps seven completed UTC days.
  with stale as (
    select q.ctid
      from public.public_ai_daily_quotas q
     where q.window_start < v_window_start - 7
     order by q.window_start, q.subject_hash
     limit 100
  )
  delete from public.public_ai_daily_quotas q
   using stale
   where q.ctid = stale.ctid;

  return query select true, v_retry_after;
end;
$$;

revoke all on function public.claim_public_ai_daily_quota(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.claim_public_ai_daily_quota(
  text,
  text,
  integer,
  integer
) to service_role;

commit;
