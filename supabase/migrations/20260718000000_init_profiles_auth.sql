-- ============================================================
-- Cinnabar — user accounts: profiles table + auto-provisioning
-- Run this in the Supabase SQL Editor (auth is a Supabase built-in).
-- Scope: authentication + profiles only. No credits-spending logic yet.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles table
--    One row per auth.users record. credits/referral are seeded
--    by the trigger below; clients may never write these.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  created_at    timestamptz not null default now(),
  credits       integer     not null default 30,
  referral_code text        unique,
  referred_by   uuid        references auth.users (id) on delete set null
);

-- ------------------------------------------------------------
-- 2. Unique referral-code generator
-- ------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  code text;
  is_free boolean := false;
begin
  while not is_free loop
    -- 8-char uppercase code from a random uuid
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    is_free := not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$;

-- ------------------------------------------------------------
-- 3. Auto-provision a profile on new auth user
--    SECURITY DEFINER so it can insert past RLS.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, referral_code, credits)
  values (new.id, new.email, public.generate_referral_code(), 30);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. Row-level security
--    - RLS on.
--    - A user may SELECT only their own row.
--    - No INSERT/UPDATE/DELETE policy exists for client roles, so all
--      writes from the browser are denied. credits/referral changes go
--      only through the server using the SECRET (service_role) key,
--      which bypasses RLS.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Lock down table privileges, then grant read-only to signed-in users.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);
