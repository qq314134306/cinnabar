-- ============================================================
-- Cinnabar — verified PayPal purchases for paid Future Reports
-- Apply after 20260723000000_credit_ledger.sql.
-- This migration is intentionally separate from the credit wallet.
-- ============================================================

create table public.future_report_purchases (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users (id) on delete set null,
  tier                    text not null check (tier in ('1-year', '5-year')),
  amount_minor            integer not null check (amount_minor > 0),
  currency                text not null check (currency = 'USD'),
  client_attempt_id       uuid not null,
  paypal_order_id         text unique,
  paypal_capture_id       text unique,
  payment_status          text not null default 'creating'
    check (payment_status in (
      'creating',
      'created',
      'capture_pending',
      'completed',
      'refunded',
      'disputed'
    )),
  payment_completed_at    timestamptz,
  chart_fingerprint       text,
  generation_input        jsonb,
  generation_status       text not null default 'not_started'
    check (generation_status in ('not_started', 'generating', 'failed', 'completed', 'purged')),
  generation_attempt_count integer not null default 0
    check (generation_attempt_count between 0 and 3),
  generation_next_retry_at timestamptz,
  generation_started_at   timestamptz,
  generated_report        text,
  generation_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Database-level defense in depth: even a faulty server caller cannot pair a
  -- tier with an unexpected amount. A future price change requires a migration.
  constraint future_report_server_catalog_check check (
    (tier = '1-year' and amount_minor = 990)
    or
    (tier = '5-year' and amount_minor = 1490)
  ),
  constraint future_report_generation_input_shape_check check (
    generation_input is null
    or (
      jsonb_typeof(generation_input) = 'object'
      and jsonb_typeof(generation_input -> 'chartFacts') = 'string'
      and jsonb_typeof(generation_input -> 'yearlyFacts') = 'string'
      and (generation_input ->> 'persona') in ('scholar', 'sage')
      and (generation_input ->> 'chartFingerprint') ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint future_report_chart_fingerprint_shape_check check (
    chart_fingerprint is null or chart_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint future_report_completed_payment_shape_check check (
    payment_status <> 'completed'
    or (
      paypal_order_id is not null
      and paypal_capture_id is not null
      and payment_completed_at is not null
      and (
        user_id is null
        or (
          generation_input is not null
          and chart_fingerprint is not null
        )
      )
    )
  ),
  constraint future_report_completed_generation_shape_check check (
    generation_status <> 'completed'
    or user_id is null
    or (
      generated_report is not null
      and length(generated_report) > 0
      and generation_completed_at is not null
    )
  )
);

create unique index future_report_user_attempt_unique
  on public.future_report_purchases (user_id, client_attempt_id)
  where user_id is not null;

create index future_report_owner_completed_idx
  on public.future_report_purchases (user_id, chart_fingerprint, payment_completed_at desc)
  where payment_status = 'completed' and user_id is not null;

create or replace function public.touch_future_report_purchase_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger future_report_purchase_updated_at
  before update on public.future_report_purchases
  for each row execute function public.touch_future_report_purchase_updated_at();

create or replace function public.enforce_future_report_purchase_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- ON DELETE SET NULL is the only supported owner-removal path. Purge all
  -- chart/report content while retaining minimum payment evidence.
  if old.user_id is not null and new.user_id is null then
    new.chart_fingerprint := null;
    new.generation_input := null;
    new.generated_report := null;
    new.generation_status := 'purged';
    new.generation_started_at := null;
    new.generation_completed_at := null;
    new.generation_next_retry_at := null;
    return new;
  end if;

  if old.user_id is null and new.user_id is not null then
    raise exception 'future_report_owner_reassignment_forbidden';
  end if;

  if old.payment_status in ('refunded', 'disputed')
     and new.payment_status <> old.payment_status then
    raise exception 'future_report_terminal_payment_state';
  end if;

  if old.payment_status <> new.payment_status and not (
    (old.payment_status = 'creating' and new.payment_status = 'created')
    or (old.payment_status = 'created' and new.payment_status = 'capture_pending')
    or (old.payment_status = 'capture_pending' and new.payment_status = 'completed')
    or (old.payment_status = 'completed' and new.payment_status in ('refunded', 'disputed'))
  ) then
    raise exception 'future_report_illegal_payment_transition: % -> %',
      old.payment_status, new.payment_status;
  end if;

  if old.generation_status <> new.generation_status and not (
    (old.generation_status in ('not_started', 'failed') and new.generation_status = 'generating')
    or (old.generation_status = 'generating' and new.generation_status in ('generating', 'failed', 'completed'))
  ) then
    raise exception 'future_report_illegal_generation_transition: % -> %',
      old.generation_status, new.generation_status;
  end if;

  if new.generation_status = 'generating'
     and new.payment_status <> 'completed' then
    raise exception 'future_report_generation_requires_completed_payment';
  end if;

  return new;
end;
$$;

create trigger future_report_purchase_state_guard
  before update on public.future_report_purchases
  for each row execute function public.enforce_future_report_purchase_state();

create or replace function public.create_future_report_purchase(
  p_user_id uuid,
  p_tier text,
  p_amount_minor integer,
  p_currency text,
  p_client_attempt_id uuid
)
returns setof public.future_report_purchases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.future_report_purchases%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
    into existing
    from public.future_report_purchases
   where user_id = p_user_id
     and client_attempt_id = p_client_attempt_id;

  if found then
    if existing.tier <> p_tier
       or existing.amount_minor <> p_amount_minor
       or existing.currency <> p_currency then
      raise exception 'future_report_attempt_conflict';
    end if;
    return next existing;
    return;
  end if;

  if (
    select count(*)
      from public.future_report_purchases
     where user_id = p_user_id
       and payment_status in ('creating', 'created', 'capture_pending')
       and created_at >= now() - interval '1 hour'
  ) >= 3 then
    raise exception 'future_report_open_order_limit';
  end if;

  return query
    insert into public.future_report_purchases (
      user_id,
      tier,
      amount_minor,
      currency,
      client_attempt_id,
      payment_status
    )
    values (
      p_user_id,
      p_tier,
      p_amount_minor,
      p_currency,
      p_client_attempt_id,
      'creating'
    )
    returning *;
end;
$$;

create or replace function public.claim_future_report_generation(
  p_purchase_id uuid,
  p_user_id uuid,
  p_generation_started_at timestamptz
)
returns setof public.future_report_purchases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purchase public.future_report_purchases%rowtype;
begin
  select *
    into purchase
    from public.future_report_purchases
   where id = p_purchase_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'future_report_purchase_not_found';
  end if;
  if purchase.payment_status <> 'completed' then
    raise exception 'future_report_payment_not_completed';
  end if;
  if purchase.generation_status in ('completed', 'purged') then
    raise exception 'future_report_generation_terminal';
  end if;
  if purchase.generation_status = 'generating'
     and purchase.generation_started_at > now() - interval '10 minutes' then
    raise exception 'future_report_generation_in_progress';
  end if;
  if purchase.generation_attempt_count >= 3 then
    raise exception 'future_report_generation_attempt_limit';
  end if;
  if purchase.generation_next_retry_at is not null
     and purchase.generation_next_retry_at > now() then
    raise exception 'future_report_generation_backoff';
  end if;

  return query
    update public.future_report_purchases
       set generation_status = 'generating',
           generation_started_at = p_generation_started_at,
           generation_attempt_count = generation_attempt_count + 1,
           generation_next_retry_at = null
     where id = p_purchase_id
       and user_id = p_user_id
       and payment_status = 'completed'
    returning *;
end;
$$;

create or replace function public.fail_future_report_generation(
  p_purchase_id uuid,
  p_generation_started_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.future_report_purchases
     set generation_status = 'failed',
         generation_next_retry_at = now() + case generation_attempt_count
           when 1 then interval '30 seconds'
           when 2 then interval '2 minutes'
           else interval '24 hours'
         end
   where id = p_purchase_id
     and generation_status = 'generating'
     and generation_started_at = p_generation_started_at;
end;
$$;

-- No browser table access. All reads/writes cross an authenticated server API
-- using the service role; no DELETE grant exists even for that role.
alter table public.future_report_purchases enable row level security;

revoke all on public.future_report_purchases from anon, authenticated, service_role;
grant select, update on public.future_report_purchases to service_role;
revoke all on function public.create_future_report_purchase(uuid, text, integer, text, uuid) from public;
revoke all on function public.claim_future_report_generation(uuid, uuid, timestamptz) from public;
revoke all on function public.fail_future_report_generation(uuid, timestamptz) from public;
grant execute on function public.create_future_report_purchase(uuid, text, integer, text, uuid) to service_role;
grant execute on function public.claim_future_report_generation(uuid, uuid, timestamptz) to service_role;
grant execute on function public.fail_future_report_generation(uuid, timestamptz) to service_role;

-- Operational reconciliation view. Any returned row needs investigation; this
-- catches local entitlement/payment drift but does not replace PayPal payout
-- settlement reconciliation.
create view public.future_report_reconciliation_exceptions
with (security_invoker = true)
as
select
  id,
  user_id,
  tier,
  amount_minor,
  currency,
  paypal_order_id,
  paypal_capture_id,
  payment_status,
  generation_status,
  created_at,
  updated_at,
  case
    when payment_status = 'completed' and (
      paypal_order_id is null
      or paypal_capture_id is null
      or payment_completed_at is null
      or generation_input is null
    ) then 'completed payment missing durable evidence'
    when payment_status <> 'completed' and paypal_capture_id is not null
      then 'capture recorded without completed payment'
    when generation_status = 'completed' and (
      generated_report is null
      or generation_completed_at is null
    ) then 'completed generation missing report'
    when generation_attempt_count > 3
      then 'generation retry quota exceeded'
    when payment_status in ('creating', 'created', 'capture_pending')
      and updated_at < now() - interval '30 minutes'
      then 'stale checkout'
  end as exception
from public.future_report_purchases
where
  (
    payment_status = 'completed'
    and (
      paypal_order_id is null
      or paypal_capture_id is null
      or payment_completed_at is null
      or generation_input is null
    )
  )
  or (payment_status <> 'completed' and paypal_capture_id is not null)
  or (
    generation_status = 'completed'
    and (generated_report is null or generation_completed_at is null)
  )
  or (
    payment_status in ('creating', 'created', 'capture_pending')
    and updated_at < now() - interval '30 minutes'
  );

revoke all on public.future_report_reconciliation_exceptions from anon, authenticated;
grant select on public.future_report_reconciliation_exceptions to service_role;

comment on table public.future_report_purchases is
  'Server-written PayPal purchases and recoverable generation snapshots; separate from credit_ledger.';
comment on view public.future_report_reconciliation_exceptions is
  'Local payment/entitlement integrity exceptions. A zero-row result is expected.';
