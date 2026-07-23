-- Cinnabar credit ledger. Apply after 20260718000000_init_profiles_auth.sql.
--
-- SECURITY DEFINER functions are owned by the migration executor (normally the
-- postgres owner in Supabase migrations/SQL Editor). The owner assertion below
-- rejects deployment if a browser or service role somehow executes this DDL.

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  -- account_id is the stable pseudonymous ledger subject. user_id is nulled by
  -- the FK when auth deletes the account, making historical entries unreadable
  -- through owner RLS without deleting financial history.
  account_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  amount integer not null,
  entry_type text not null check (entry_type in ('registration_grant', 'debit')),
  business_key text not null
    check (pg_catalog.length(pg_catalog.btrim(business_key)) between 1 and 200),
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  constraint credit_ledger_amount_direction check (
    (entry_type = 'registration_grant' and amount > 0)
    or (entry_type = 'debit' and amount < 0)
  ),
  constraint credit_ledger_active_owner_matches_account check (
    user_id is null or user_id = account_id
  ),
  unique (account_id, business_key)
);

create index credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc, id desc);

alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from public, anon, authenticated, service_role;
-- security_invoker views require the caller to hold the underlying column
-- privileges. Grant only the four display-safe columns; ownership, idempotency,
-- and internal metadata columns remain unreadable to browser roles.
grant select (id, amount, entry_type, created_at)
  on public.credit_ledger to authenticated;
create policy "Credit ledger is viewable by owner"
  on public.credit_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.reject_credit_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- ON DELETE SET NULL is implemented by a nested FK-trigger UPDATE. Permit
  -- only that exact privacy mutation; a direct UPDATE has trigger depth 1.
  if tg_op = 'UPDATE'
     and pg_catalog.pg_trigger_depth() > 1
     and old.user_id is not null
     and new.user_id is null
     and new.id = old.id
     and new.account_id = old.account_id
     and new.amount = old.amount
     and new.entry_type = old.entry_type
     and new.business_key = old.business_key
     and new.metadata = old.metadata
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'credit_ledger is append-only' using errcode = '55000';
end;
$$;
create trigger credit_ledger_append_only
  before update or delete on public.credit_ledger
  for each row execute function public.reject_credit_ledger_mutation();
revoke all on function public.reject_credit_ledger_mutation()
  from public, anon, authenticated, service_role;

create view public.credit_activity with (security_invoker = true) as
select id, amount, entry_type, created_at
from public.credit_ledger;
revoke all on public.credit_activity from public, anon, authenticated;
grant select on public.credit_activity to authenticated;

create view public.credit_balances with (security_invoker = true) as
select pg_catalog.coalesce(pg_catalog.sum(amount), 0)::bigint as balance
from public.credit_ledger;
revoke all on public.credit_balances from public, anon, authenticated;
grant select on public.credit_balances to authenticated;

create function public.grant_registration_credits(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.credit_ledger
    (account_id, user_id, amount, entry_type, business_key)
  values (p_user_id, p_user_id, 30, 'registration_grant', 'registration_grant')
  on conflict (account_id, business_key) do nothing;
$$;
revoke all on function public.grant_registration_credits(uuid)
  from public, anon, authenticated, service_role;

-- profiles.credits was not previously spendable. Fail migration rather than
-- silently reinterpret unexpected pre-existing state.
do $$
begin
  if exists (select 1 from public.profiles where credits <> 30 or credits is null) then
    raise exception 'credit migration requires every profiles.credits value to equal 30';
  end if;
end;
$$;
select public.grant_registration_credits(id) from public.profiles;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, referral_code)
  values (new.id, new.email, public.generate_referral_code());
  perform public.grant_registration_credits(new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

-- Keep the deprecated column during rolling deployment compatibility. It is no
-- longer a balance source and remains at its immutable seed value.
comment on column public.profiles.credits is
  'Deprecated compatibility field; always 30. Use credit_ledger/credit_balances.';

create function public.spend_credits(
  p_user_id uuid,
  p_amount integer,
  p_business_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ledger_id bigint, balance bigint, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.credit_ledger%rowtype;
  v_balance bigint;
  v_ledger_id bigint;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'p_user_id is required and p_amount must be positive'
      using errcode = '22023';
  end if;
  if p_business_key is null
     or pg_catalog.length(pg_catalog.btrim(p_business_key)) not between 1 and 200 then
    raise exception 'p_business_key must contain 1 to 200 characters'
      using errcode = '22023';
  end if;
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'p_metadata must be a JSON object' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'credit account not found' using errcode = 'P0002';
  end if;

  select * into v_existing from public.credit_ledger
   where account_id = p_user_id
     and business_key = pg_catalog.btrim(p_business_key);
  if found then
    if v_existing.entry_type <> 'debit'
       or v_existing.amount <> -p_amount
       or v_existing.metadata <> p_metadata then
      raise exception 'business key was already used with different debit data'
        using errcode = '23505';
    end if;
    select pg_catalog.coalesce(pg_catalog.sum(amount), 0)::bigint into v_balance
      from public.credit_ledger where account_id = p_user_id;
    return query select v_existing.id, v_balance, false;
    return;
  end if;

  select pg_catalog.coalesce(pg_catalog.sum(amount), 0)::bigint into v_balance
    from public.credit_ledger where account_id = p_user_id;
  if v_balance < p_amount then
    raise exception 'insufficient credits' using errcode = 'P0001';
  end if;

  insert into public.credit_ledger
    (account_id, user_id, amount, entry_type, business_key, metadata)
  values (
    p_user_id, p_user_id, -p_amount, 'debit',
    pg_catalog.btrim(p_business_key), p_metadata
  ) returning id into v_ledger_id;
  return query select v_ledger_id, v_balance - p_amount, true;
end;
$$;

revoke all on function public.spend_credits(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, text, jsonb)
  to service_role;
comment on function public.spend_credits(uuid, integer, text, jsonb) is
  'Service-role only; arguments must come from trusted server state.';

-- SECURITY DEFINER adopts the function owner. This migration must be executed
-- by the standard Supabase SQL Editor/migration owner: postgres.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid in (
      'public.grant_registration_credits(uuid)'::regprocedure,
      'public.handle_new_user()'::regprocedure,
      'public.spend_credits(uuid,integer,text,jsonb)'::regprocedure
    )
    and r.rolname <> 'postgres'
  ) then
    raise exception 'credit SECURITY DEFINER functions must be owned by postgres';
  end if;
end;
$$;
