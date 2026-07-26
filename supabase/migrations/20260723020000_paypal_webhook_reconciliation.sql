-- ============================================================
-- Cinnabar - signed PayPal webhook ingestion and reconciliation
-- Apply after 20260723010000_future_report_payments.sql.
-- This migration does not read or modify the credit ledger.
-- ============================================================

alter table public.future_report_purchases
  add column paypal_dispute_id text,
  add column paypal_last_verified_status text,
  add column paypal_last_verified_at timestamptz;

alter table public.future_report_purchases
  drop constraint future_report_purchases_payment_status_check;

alter table public.future_report_purchases
  add constraint future_report_purchases_payment_status_check
  check (payment_status in (
    'creating',
    'created',
    'capture_pending',
    'completed',
    'refunded',
    'disputed',
    'denied'
  ));

create table public.paypal_webhook_events (
  event_id             text primary key,
  event_type           text not null,
  resource_id          text,
  delivery_status      text not null
    check (delivery_status in ('processing', 'processed', 'ignored', 'failed')),
  processing_outcome   text,
  attempt_count        integer not null default 1 check (attempt_count > 0),
  lease_expires_at     timestamptz,
  received_at          timestamptz not null default now(),
  processed_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint paypal_webhook_event_id_length check (length(event_id) between 1 and 255),
  constraint paypal_webhook_event_type_length check (length(event_type) between 1 and 127),
  constraint paypal_webhook_resource_id_length check (
    resource_id is null or length(resource_id) between 1 and 255
  ),
  constraint paypal_webhook_outcome_length check (
    processing_outcome is null or length(processing_outcome) between 1 and 80
  )
);

alter table public.paypal_webhook_events enable row level security;
revoke all on public.paypal_webhook_events from anon, authenticated, service_role;

create table public.paypal_reconciliation_state (
  worker_name          text primary key
    check (worker_name = 'future_report_paypal'),
  cursor_created_at    timestamptz,
  cursor_purchase_id   uuid,
  next_retry_at        timestamptz,
  updated_at           timestamptz not null default now(),
  constraint paypal_reconciliation_cursor_shape check (
    (cursor_created_at is null and cursor_purchase_id is null)
    or
    (cursor_created_at is not null and cursor_purchase_id is not null)
  )
);

insert into public.paypal_reconciliation_state (worker_name)
values ('future_report_paypal');

alter table public.paypal_reconciliation_state enable row level security;
revoke all on public.paypal_reconciliation_state from anon, authenticated, service_role;

create or replace function public.claim_paypal_webhook_event(
  p_event_id text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted boolean := false;
  v_event public.paypal_webhook_events%rowtype;
begin
  if p_event_id is null
     or length(p_event_id) not between 1 and 255
     or p_event_type is null
     or length(p_event_type) not between 1 and 127 then
    raise exception 'paypal_webhook_event_invalid';
  end if;

  insert into public.paypal_webhook_events (
    event_id,
    event_type,
    delivery_status,
    lease_expires_at
  )
  values (
    p_event_id,
    p_event_type,
    'processing',
    now() + interval '2 minutes'
  )
  on conflict (event_id) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return true;
  end if;

  select *
    into v_event
    from public.paypal_webhook_events
   where event_id = p_event_id
   for update;

  if v_event.event_type <> p_event_type then
    raise exception 'paypal_webhook_event_identity_conflict';
  end if;

  if v_event.delivery_status in ('processed', 'ignored') then
    return false;
  end if;

  if v_event.delivery_status = 'processing'
     and v_event.lease_expires_at > now() then
    return false;
  end if;

  update public.paypal_webhook_events
     set delivery_status = 'processing',
         processing_outcome = null,
         attempt_count = attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes',
         updated_at = now()
   where event_id = p_event_id;

  return true;
end;
$$;

create or replace function public.finish_paypal_webhook_event(
  p_event_id text,
  p_delivery_status text,
  p_processing_outcome text,
  p_resource_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_delivery_status not in ('processed', 'ignored', 'failed') then
    raise exception 'paypal_webhook_finish_status_invalid';
  end if;
  if p_processing_outcome is null
     or length(p_processing_outcome) not between 1 and 80 then
    raise exception 'paypal_webhook_outcome_invalid';
  end if;
  if p_resource_id is not null
     and length(p_resource_id) not between 1 and 255 then
    raise exception 'paypal_webhook_resource_id_invalid';
  end if;

  update public.paypal_webhook_events
     set delivery_status = p_delivery_status,
         processing_outcome = p_processing_outcome,
         resource_id = coalesce(p_resource_id, resource_id),
         lease_expires_at = null,
         processed_at = case
           when p_delivery_status in ('processed', 'ignored') then now()
           else null
         end,
         updated_at = now()
   where event_id = p_event_id
     and delivery_status = 'processing';

  if not found then
    raise exception 'paypal_webhook_event_not_claimed';
  end if;
end;
$$;

-- Replaces the prior guard so a verified failed capture can become a terminal
-- denied state. Refunded, disputed, and denied are all terminal and cannot
-- restore access automatically, including when events arrive out of order.
create or replace function public.enforce_future_report_purchase_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

  if old.payment_status in ('refunded', 'disputed', 'denied')
     and new.payment_status <> old.payment_status then
    raise exception 'future_report_terminal_payment_state';
  end if;

  if old.payment_status <> new.payment_status and not (
    (old.payment_status = 'creating' and new.payment_status = 'created')
    or (
      old.payment_status in ('creating', 'created', 'capture_pending')
      and new.payment_status = 'disputed'
    )
    or (old.payment_status = 'created' and new.payment_status = 'capture_pending')
    or (
      old.payment_status = 'capture_pending'
      and new.payment_status in ('completed', 'denied')
    )
    or (
      old.payment_status = 'completed'
      and new.payment_status in ('refunded', 'disputed')
    )
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

create or replace function public.apply_future_report_paypal_state(
  p_purchase_id uuid,
  p_target_status text,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_verified_at timestamptz,
  p_paypal_dispute_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase public.future_report_purchases%rowtype;
  v_next_status text;
  v_outcome text := 'deferred';
begin
  if p_target_status not in ('completed', 'refunded', 'disputed', 'denied', 'pending') then
    raise exception 'future_report_paypal_target_invalid';
  end if;
  if p_paypal_order_id is null or p_paypal_capture_id is null then
    raise exception 'future_report_paypal_evidence_missing';
  end if;

  select *
    into v_purchase
    from public.future_report_purchases
   where id = p_purchase_id
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_purchase.paypal_order_id is distinct from p_paypal_order_id then
    raise exception 'future_report_paypal_order_conflict';
  end if;
  if v_purchase.paypal_capture_id is not null
     and v_purchase.paypal_capture_id <> p_paypal_capture_id then
    raise exception 'future_report_paypal_capture_conflict';
  end if;

  v_next_status := v_purchase.payment_status;

  if p_target_status = v_purchase.payment_status then
    v_outcome := 'unchanged';
  elsif v_purchase.payment_status in ('refunded', 'disputed', 'denied') then
    -- A later processor observation can never restore a terminal entitlement.
    -- Return a distinct idempotent outcome rather than calling it deferred.
    v_outcome := 'blocked_terminal';
  elsif p_target_status = 'disputed' then
    -- A dispute is an irreversible tombstone even if the completion webhook or
    -- synchronous final write has not reached us yet.
    v_next_status := 'disputed';
    v_outcome := 'updated';
  elsif v_purchase.payment_status = 'capture_pending'
        and p_target_status in ('completed', 'denied') then
    v_next_status := p_target_status;
    v_outcome := 'updated';
  elsif v_purchase.payment_status = 'completed'
        and p_target_status in ('refunded', 'disputed') then
    v_next_status := p_target_status;
    v_outcome := 'updated';
  end if;

  update public.future_report_purchases
     set paypal_capture_id = case
           when v_outcome in ('updated', 'unchanged')
             then coalesce(paypal_capture_id, p_paypal_capture_id)
           else paypal_capture_id
         end,
         paypal_dispute_id = case
           when p_target_status = 'disputed' and v_outcome in ('updated', 'unchanged')
             then coalesce(paypal_dispute_id, p_paypal_dispute_id)
           else paypal_dispute_id
         end,
         payment_status = v_next_status,
         payment_completed_at = case
           when p_target_status = 'completed' and v_outcome = 'updated'
             then coalesce(payment_completed_at, p_verified_at)
           else payment_completed_at
         end,
         paypal_last_verified_status = p_target_status,
         paypal_last_verified_at = p_verified_at
   where id = p_purchase_id;

  return v_outcome;
end;
$$;

create or replace function public.read_paypal_reconciliation_state()
returns setof public.paypal_reconciliation_state
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select *
    from public.paypal_reconciliation_state
   where worker_name = 'future_report_paypal';
$$;

create or replace function public.advance_paypal_reconciliation_cursor(
  p_cursor_created_at timestamptz default null,
  p_cursor_purchase_id uuid default null,
  p_cycle_completed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.paypal_reconciliation_state%rowtype;
begin
  select *
    into v_state
    from public.paypal_reconciliation_state
   where worker_name = 'future_report_paypal'
   for update;

  if p_cycle_completed then
    update public.paypal_reconciliation_state
       set cursor_created_at = null,
           cursor_purchase_id = null,
           next_retry_at = null,
           updated_at = now()
     where worker_name = 'future_report_paypal';
    return;
  end if;

  if p_cursor_created_at is null or p_cursor_purchase_id is null then
    raise exception 'paypal_reconciliation_cursor_invalid';
  end if;

  if v_state.cursor_created_at is null
     or (p_cursor_created_at, p_cursor_purchase_id)
        > (v_state.cursor_created_at, v_state.cursor_purchase_id) then
    update public.paypal_reconciliation_state
       set cursor_created_at = p_cursor_created_at,
           cursor_purchase_id = p_cursor_purchase_id,
           next_retry_at = null,
           updated_at = now()
     where worker_name = 'future_report_paypal';
  end if;
end;
$$;

create or replace function public.defer_paypal_reconciliation(
  p_next_retry_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_next_retry_at is null or p_next_retry_at <= now() then
    raise exception 'paypal_reconciliation_retry_invalid';
  end if;

  update public.paypal_reconciliation_state
     set next_retry_at = greatest(
           coalesce(next_retry_at, p_next_retry_at),
           p_next_retry_at
         ),
         updated_at = now()
   where worker_name = 'future_report_paypal';
end;
$$;

revoke all on function public.claim_paypal_webhook_event(text, text) from public;
revoke all on function public.finish_paypal_webhook_event(text, text, text, text) from public;
revoke all on function public.apply_future_report_paypal_state(
  uuid, text, text, text, timestamptz, text
) from public;
revoke all on function public.read_paypal_reconciliation_state() from public;
revoke all on function public.advance_paypal_reconciliation_cursor(
  timestamptz, uuid, boolean
) from public;
revoke all on function public.defer_paypal_reconciliation(timestamptz) from public;

grant execute on function public.claim_paypal_webhook_event(text, text) to service_role;
grant execute on function public.finish_paypal_webhook_event(text, text, text, text) to service_role;
grant execute on function public.apply_future_report_paypal_state(
  uuid, text, text, text, timestamptz, text
) to service_role;
grant execute on function public.read_paypal_reconciliation_state() to service_role;
grant execute on function public.advance_paypal_reconciliation_cursor(
  timestamptz, uuid, boolean
) to service_role;
grant execute on function public.defer_paypal_reconciliation(timestamptz) to service_role;

create index future_report_paypal_reconciliation_idx
  on public.future_report_purchases (created_at, id)
  where paypal_order_id is not null;

comment on table public.paypal_webhook_events is
  'PayPal event-ID deduplication and allowlisted processing outcomes; raw webhook bodies are never stored.';
comment on table public.paypal_reconciliation_state is
  'Persistent keyset cursor and retry backoff for bounded PayPal reconciliation runs.';
comment on function public.apply_future_report_paypal_state(
  uuid, text, text, text, timestamptz, text
) is
  'Applies only monotonic PayPal-verified Future Report payment transitions.';
