-- Apply after 20260723040000_opaque_auth_sessions.sql

begin;

create table public.app_auth_login_transactions (
  handle_hash             text primary key
    check (handle_hash ~ '^[A-Za-z0-9_-]{43}$'),
  flow_type               text not null
    check (flow_type in ('email', 'oauth')),
  encryption_key_version  text not null
    check (
      length(encryption_key_version) between 1 and 32
      and encryption_key_version ~ '^[A-Za-z0-9_-]+$'
    ),
  verifier_ciphertext     text not null
    check (
      length(verifier_ciphertext) between 20 and 512
      and verifier_ciphertext ~ '^[A-Za-z0-9_-]+$'
    ),
  verifier_iv             text not null
    check (verifier_iv ~ '^[A-Za-z0-9_-]{16}$'),
  callback_url            text not null
    check (
      length(callback_url) between 16 and 2048
      and callback_url !~ '[?#]'
      and (
        callback_url like 'https://%/api/auth/callback'
        or callback_url ~ '^http://localhost(:[0-9]+)?/api/auth/callback$'
      )
    ),
  created_at              timestamptz not null default pg_catalog.now(),
  expires_at              timestamptz not null,
  claimed_at              timestamptz,
  constraint app_auth_login_transactions_short_lived
    check (
      expires_at > created_at
      and (
        (
          flow_type = 'email'
          and expires_at <= created_at + interval '1 hour'
        )
        or (
          flow_type = 'oauth'
          and expires_at <= created_at + interval '10 minutes'
        )
      )
    ),
  constraint app_auth_login_transactions_claim_window
    check (claimed_at is null or claimed_at >= created_at)
);

create index app_auth_login_transactions_expiry_idx
  on public.app_auth_login_transactions (expires_at)
  where claimed_at is null;

alter table public.app_auth_login_transactions enable row level security;
revoke all on public.app_auth_login_transactions
  from public, anon, authenticated;
grant select, insert, update, delete on public.app_auth_login_transactions
  to service_role;

comment on table public.app_auth_login_transactions is
  'Short-lived one-use server PKCE transactions. Contains no email, provider token, raw verifier, or browser cookie handle.';
comment on column public.app_auth_login_transactions.handle_hash is
  'SHA-256 base64url hash of the random __Host flow-cookie handle.';
comment on column public.app_auth_login_transactions.verifier_ciphertext is
  'AES-GCM ciphertext bound to handle hash, flow type, callback URL, and key version.';

commit;
