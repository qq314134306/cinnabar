# Project Map

> L2 | Parent: `AGENTS.md`

## Purpose

This file gives future agents a fast structural map before they touch code. Keep
it factual and compact.

## Application Shape

The app is a Vite React application under `app/`. It uses TypeScript, React 19,
Zustand, Tailwind CSS 4, Vitest, ESLint, iztro for Zi Wei Dou Shu charting, and
Vercel Analytics.

The root TypeScript build is a project-reference graph: `tsconfig.app.json`
checks browser source, `tsconfig.api.json` checks every Vercel API source under
the strict shared Edge/Node surface, and `tsconfig.node.json` checks Vite
configuration. `npm run build` runs this complete graph before bundling.

The public brand is Cinnabar ("Eastern Astrology, in English"). All user-facing
text is English; the iztro engine output stays zh-CN internally and is
translated at the presentation layer.

Primary runtime flow:

1. User enters birth data in the form.
2. Birth date and birthplace inputs are normalized.
3. True solar time correction can adjust the effective birth time.
4. iztro generates the chart (zh-CN keys internally).
5. App state stores the chart and user selections.
6. UI renders chart, deterministic Life Timeline, match (Compatibility), share,
   and AI reading views through the English glossary layer. Yearly Fortune
   remains hidden because it depends on the disabled public-AI path.
7. AI reading clients send only an allowlisted `reading.v1`
   `natal`/`compatibility`/`yearly` product request to `/api/interpret`. The
   server validates 18+ eligibility, rebuilds the chart and prompt, claims the
   persistent daily quota, and then streams DeepSeek SSE.

## Deployment Topology

```text
qq314134306/cinnabar pull request
  -> required GitHub candidate checks (verify + Fresh database proof)
  -> protected main merge
  -> exact-main verification and Vercel build may run in parallel
  -> Vercel Deployment Checks or staged/manual promotion
  -> app/ build and Vercel Functions
```

Authenticated inspection confirmed that Vercel is connected directly to the
canonical repository's `main` branch and uses `app` as the Root Directory. The
observed production deployment serves both `interpret` and `subscribe`
functions. No mirror repository participates in this topology, and deployment
documentation must not treat a mirror ref or sync token as release authority.

This is the target topology, not proof that every gate is operational. GitHub
Actions are currently disabled for the canonical fork and Actions secrets are
empty. The legacy-named workflow is already pure verification with no sync or
deployment job, but has no hosted run evidence. Before release, enable it and
make its two jobs required pull-request checks on protected `main`. Because the
exact `main` workflow and Vercel build can start together after merge,
Deployment Checks or an equivalent staged/manual promotion must prevent
production domain assignment until the checks for that commit pass and its
sanitized database artifact is inspected.

The Vercel Production and Preview scopes currently contain only the existing
Supabase, Make, and DeepSeek variable names. They do not yet contain
`APP_ORIGIN`, `AUTH_MODE`, `SESSION_ENCRYPTION_KEY`,
`ENABLE_PUBLIC_AI_READINGS`, `VITE_ENABLE_PUBLIC_AI_READINGS`,
`PUBLIC_AI_QUOTA_HMAC_KEY`,
`PUBLIC_AI_DAILY_IP_LIMIT`, or `PUBLIC_AI_DAILY_GLOBAL_LIMIT`. Documentation
records names and presence only, never values. Public AI therefore remains
default-off, server-owned authentication remains on its legacy rollout stage,
and payments remain last and disabled.

## App Module Map

<directory>
app/api/ - Vercel Node/Edge Functions and server-owned public-AI authority.
app/src/components/ - React UI components grouped by feature.
app/src/components/ui/ - Small reusable UI primitives.
app/src/lib/ - Business logic helpers and calculation support.
app/src/stores/ - Zustand state.
app/src/knowledge-db/ - Structured guidance database and retrieval pipeline.
app/src/knowledge/ - Static Zi Wei Dou Shu knowledge modules.
app/tests/ - Tests outside source tree, currently including workflow validation.
</directory>

## Important Files

- `app/tsconfig.json` + `app/tsconfig.api.json` - root build reference and the
  strict, no-emit API compilation boundary. API tests are excluded, but all
  `app/api/**/*.ts` production files remain in the build graph.
- `app/tests/api-typecheck.test.ts` - four drift contracts pin the root API
  reference, API include/test-exclude patterns, Edge/Node runtime libraries,
  and strict compiler policy.
- `README.md` + `docs/README.{zh-TW,ja,en}.md` - four-language public Cinnabar
  documentation. It is limited to the currently visible product, keeps
  DeepSeek/API credentials server-side, distinguishes Vite static UI from the
  Vercel-compatible API runtime, and states that Future Report payments remain
  disabled and unproven live.
- `app/api/interpret.ts` + `app/api/_public-reading.ts` - default-off public AI
  boundary. It strictly parses `reading.v1`, rejects minors, reconstructs chart
  facts/prompts, owns fixed per-operation DeepSeek policy, atomically claims
  persistent HMAC(IP)+global UTC-day quotas, and returns only stable safe errors
  or the upstream SSE stream.
- `app/src/lib/reading-contract.ts` - browser-safe discriminated request types,
  allowlisted BirthInfo serializers, defaults, and final wire projection. It
  excludes resolved time, coordinates/timezone, facts, prompts, and messages.
- `app/src/lib/llm.ts` + `llm.test.ts` - the only public-reading browser client.
  It posts a strict request, supports cancellation, and parses SSE across chunk,
  multiline, UTF-8, `[DONE]`, and tail-buffer boundaries.
- `app/src/components/BirthForm.tsx` - birth input, birthplace matching entry, and true solar time options.
- `app/src/components/OpenSourceLinks.tsx` - GitHub repository and license links for open source attribution.
- `app/src/lib/ziwei-glossary.ts` - Chinese→English terminology dictionaries (Cinnabar glossary).
- `app/src/lib/chart-facts.ts` - English CHART FACTS builder for AI prompts.
- `app/src/lib/ai-prompts.ts` - base system prompt, personas, reading templates (free reading, compatibility, paid Future Report).
- `app/src/lib/paypal.ts` - PayPal Smart Payment Buttons adapter; passes tier +
  stable attempt ID and allowlisted birth/persona fields to authenticated
  server APIs. Browser code never submits facts, forecast years, coordinates,
  timezone, prompts, price, or payment status.
- `app/api/_future-report-chart.ts` - server-only input validator and
  deterministic chart authority. It resolves canonical local place/timezone
  data, true solar time, iztro chart facts, tier-owned 2/5-year facts, and the
  chart fingerprint.
- `app/api/future-report-order.ts` + `future-report-capture.ts` - authenticated
  PayPal Orders v2 creation/capture; server price catalog, business-derived
  idempotency IDs, and post-capture status/currency/amount/reference validation.
- `app/api/future-report-access.ts` + `future-report-generate.ts` - restores
  verified purchases only for the matching chart fingerprint and
  generates/stores reports from an atomically claimed pre-capture snapshot.
  Paid generation has one 45-second fetch/body deadline, a strict 512 KiB JSON
  cap, fixed model policy, and independent seven-second generation-failure CAS
  cleanup that cannot mask the original error.
- `app/api/paypal-webhook.ts` + `_paypal-webhook.ts` - PayPal-official signature
  verification, event-ID deduplication, allowlisted capture/dispute handling,
  authoritative resource re-fetch, retryable lag handling, and an irreversible
  dispute tombstone enforced by the monotonic payment-state RPC.
- `app/api/cron/paypal-reconciliation.ts` + `_paypal-reconciliation.ts` -
  `CRON_SECRET`-protected recent-purchase verification with a persistent keyset
  cursor, PayPal 429 backoff, aggregate-only output, a default 40-purchase
  ceiling, and a 210-second cursor-safe wall-clock exit. All PayPal OAuth and
  business API reads use a 15-second hard timeout even if an injected fetch
  implementation ignores abort.
- `app/src/lib/analytics.ts` - guarded gtag.js wrapper: manual SPA page_views + named GA4 custom events.
- `app/vercel.json` + `app/api/auth.ts` +
  `app/tests/vercel-function-budget.test.ts` - preserves every public
  `/api/auth/*` URL while routing the nine auth handlers through one deployable
  Function. The contract pins the complete API entrypoint set to the 12-Function
  Hobby budget. The handlers remain underscore-prefixed and non-routed.
- `app/vercel.json` + `app/api/csp-report.ts` - Vercel security headers and the
  bounded, sanitized CSP violation collector. The policy remains report-only
  until real third-party browser flows establish an enforcement allowlist.
- `app/api/subscribe.ts` + `app/tests/subscribe-api.test.ts` - strict
  same-origin public email relay and its boundary suite. The API owns the exact
  JSON/source/email contract, streamed byte cap, single-XFF validation,
  bounded per-IP/overflow/isolate-global abuse brake, Make-owned webhook host
  allowlist, redirect denial, request/body deadlines, and stable no-store
  errors. It is the only reader of
  `MAKE_WEBHOOK_URL`; its in-memory limiter is not a distributed quota.
- `app/src/lib/compatibility-score.ts` +
  `app/src/components/match/MatchAnalysis.tsx` + their tests - always-available
  deterministic local Compatibility snapshot across communication, shared
  direction, emotional rhythm, and resilience. It is symmetric, needs no
  account/API/payment, and is explicitly reflective rather than scientific.
  The optional uncached AI narrative retains controller/request-key/
  input-identity ownership; changes, retries, and unmount reject stale tokens
  and errors.
- `app/src/components/share/ShareCard.tsx` + `ShareCard.test.ts` - local
  editable chart-summary card and 2x PNG export. The quote area uses an
  html2canvas-stable Georgia/Times font stack, explicit width, and word wrapping
  because the display webfont previously produced overlapping words only in the
  saved artifact.
- `app/src/lib/supabase.ts` - lazy browser Supabase client for `legacy` rollback
  only (public publishable key; never constructed for a new `dual`/`opaque`
  login).
- `app/api/_supabase-admin.ts` - server-only service-role client (`SUPABASE_SECRET_KEY`; underscore = not a route; never imported by src/).
- `app/api/_app-session.ts` + `_auth.ts` + `_csrf.ts` - server-only opaque SID
  authority: versioned AES-GCM token custody, strict mode parsing, exact
  same-origin POST/CSRF checks, idle/absolute expiry, audit events, and
  refresh-token rotation protected by a persistent lease/version. It also owns
  bounded Supabase `/auth/v1/user` validation for both opaque and allowed
  Bearer paths: only explicit credential rejection/null user/identity mismatch
  becomes `401`, while provider unavailability becomes a non-mutating
  `503 AUTH_UPSTREAM_UNAVAILABLE`.
- `app/api/auth.ts` +
  `app/api/_auth-route-{session,migrate,logout}.ts` - minimal BFF session
  hydration, one-time legacy Supabase-session migration, and revocation behind
  the single auth router. Browser cookies contain only
  `__Host-cinnabar_sid`; tokens never return after migration.
- `app/src/stores/index.ts` + `app/src/components/AuthControl.tsx` - resettable
  client auth-hydration single-flight, trailing event-driven revalidation, and
  retry UI. Cross-tab messages carry only a fixed freshness hint. Availability
  uncertainty preserves existing identity and paid cache; only explicit
  signed-out state or `401` clears them. An unknown legacy-migration phase
  remains terminal because refresh-token rotation may have begun.
- `app/api/_auth-login.ts` +
  `app/api/_auth-route-{login-preflight,login-email,login-email-verify,login-oauth,callback}.ts` -
  server-owned PKCE start/callback boundary. A one-use pre-auth double-submit
  token protects the login POSTs. A service-role-only database transaction
  holds the encrypted verifier; the browser holds only an opaque flow handle.
  The exact callback claims the transaction before exchange and issues an
  opaque SID without returning provider tokens. Supabase/GoTrue owns Google
  OAuth state/nonce/ID-token validation; the Cinnabar handle only binds the
  callback browser to its login transaction.
- `app/api/_auth-route-email-confirm.ts` + `supabase/templates/magic_link.html` -
  scanner-resistant email-link boundary. The template exposes a six-digit
  manual OTP and carries TokenHash only in a URL fragment. Passive GET/HEAD does
  not claim or verify; explicit same-origin POST does both exactly once.
- `app/api/_credits-catalog.ts` - immutable `2026-07-23.v1` source of truth for
  credit packs, feature costs, registration grant, and non-expiry policy.
- `app/api/credits/catalog.ts` - cacheable public catalog API (no secrets).
- `app/api/credits/account.ts` + `_credits-auth.ts` - opaque-cookie authenticated
  with a dual-mode Bearer rollback,
  RLS-constrained account balance and sanitized cursor-paginated activity API;
  UUID/ULID request IDs, stable error categories, and a best-effort per-warm-
  instance user rate limit protect the HTTP boundary.
- `app/api/_credits-service.ts` - non-routed, RLS-only account reader with no
  service-role dependency.
- `app/api/_credits-rate-limit.ts` - injectable in-memory account-read limiter;
  it returns `Retry-After` but is explicitly not a global distributed quota.
- `app/api/_credits-spend.ts` - isolated trusted product-ID-to-ledger-debit
  helper; not a standalone spending endpoint.
- `docs/dev/credits-api.openapi.yaml` - OpenAPI 3.1 contract for the public
  catalog and authenticated read-only account endpoints.
- `app/src/components/AuthModal.tsx` + `AuthControl.tsx` - email-link/Google
  sign-in modal and header sign-in/out control; `useAuthStore` in `src/stores`
  selects legacy browser auth or the server login BFF by `AUTH_MODE`.
- `app/src/components/CreditWallet.tsx` + `app/src/lib/credits.ts` - signed-in
  balance and recent safe credit activity via authenticated
  `/api/credits/account`; its portal dialog isolates the app background and read
  failures degrade locally without gating auth, readings, or checkout.
- `supabase/migrations/*.sql` - profiles/auth provisioning, opaque auth sessions
  and their audit/refresh lease, short-lived one-use PKCE login transactions,
  credit ledger, and an independent server-only Future Report purchase table
  containing PayPal evidence plus recoverable generation input/output. The app
  runtime never executes migrations. Candidate CI applies the complete chain to
  an isolated Fresh database through the guarded Release Proof; deployment
  environments must apply each migration once in strict timestamp order under
  the same prerequisites.
- `supabase/tests/credit_ledger.sql` - disposable-database SQL assertions for
  registration grants, idempotent debit, no-negative-balance behavior,
  append-only enforcement, account-deletion pseudonymization, and actual role
  privileges.
- `supabase/tests/credit_ledger_concurrency.ps1` - two-connection PostgreSQL
  barrier test designed to verify different-key double-spend prevention and
  same-key concurrent idempotency. It uses unique per-run subjects and refuses
  to run until the shared non-production database guard passes.
- `supabase/tests/invoke-release-proof.ps1` +
  `release-proof-common.ps1` - fail-closed migration/test orchestrator and
  shared target guard. Fresh and upgrade modes apply the seven `20260723`
  migrations as one ordered transaction; verify-only reruns behavior checks on
  an already migrated disposable target. The parsed connection is supplied to
  `psql` only through temporary, restored `PG*` environment variables. Output
  is a credential-free, host-free Release Proof v2 JSON summary bound to source
  commit, run/attempt, migration fingerprint, execution context, CLI version,
  and cleanup state. Paths are
  Windows/Linux portable, nested environment snapshots restore as a stack,
  native exit codes are explicit, and summary-file failures still emit a
  sanitized stdout result.
- `supabase/tests/future_report_payments.sql`,
  `paypal_webhook_reconciliation.sql`, `opaque_auth_sessions.sql`, and
  `auth_login_transactions.sql` -
  rollback-only database behavior suites for payment state/retry/purge,
  webhook idempotency/terminal tombstones, opaque-session lease/ACL/cascade
  behavior, and login-transaction minimal schema/TTL/one-use/ACL behavior.
- `supabase/migrations/20260723060000_public_ai_quota.sql` +
  `supabase/tests/public_ai_quota.sql` - service-role-executable,
  SECURITY-DEFINER daily-quota RPC over a table with no role-level table grants,
  plus rollback-only proof of ACLs, HMAC-subject storage, global+IP
  all-or-nothing claims, limit behavior, and UTC-day cleanup.
- `app/tests/database-release-proof.test.ts` - local contract test that pins
  migration order, target safeguards, credential isolation, baseline modes,
  cross-platform PowerShell behavior, SQL suite coverage, and bounded v2
  provenance/toolchain/cleanup evidence without a database connection.
- `app/tests/readme-contract.test.ts` - 24 locale-matrix assertions that keep
  visible features, server-side DeepSeek, Vite-versus-Vercel runtime scope,
  payment-off flags, language navigation, GPLv3, and iztro attribution aligned
  across all four public READMEs.
- `app/tests/auth-session-reliability.test.ts` +
  `auth-session-identity.test.ts` - deterministic opaque-session failure matrix:
  provider-user timeout/request abort and local loopback origin handling,
  20-way refresh winner adoption, lease/CAS uncertainty, migration error
  classification, expiry/revocation, last-seen mutation ordering, cookie
  parsing, and cookie/Bearer identity conflicts. Provider `429`, non-auth
  errors, malformed responses, network failure, abort, and timeout remain
  retryable `503` states without opaque revocation.
- `app/src/lib/subscribe.ts` - client POST helper for `/api/subscribe`;
  normalizes email, understands the stable nested error shape, and forwards an
  optional abort signal.
- `app/src/components/EmailCapture.tsx` - reusable, source-tagged email opt-in.
- `app/src/components/SoulCard.tsx` + `app/src/lib/soul-card.ts` - shareable Soul Card (deterministic derivation from the chart) with locked teaser + share/email unlock.
- `app/src/components/ExitIntentModal.tsx` - once-per-session exit-intent email capture.
- `app/src/components/FutureReportPaywall.tsx` - pricing tiers, checkout, and paid report display below the free reading.
- `app/src/components/AIInterpretation.tsx` - request-keyed natal-reading cache
  and guarded streaming UI. Retry and chart/persona changes abort the old
  controller and reject late tokens, cache writes, errors, and analytics.
- `app/tests/future-report-generation-reliability.test.ts` +
  `app/src/components/AIInterpretation.test.ts` +
  `app/src/stores/auth.test.ts` - bounded paid-generation, request-keyed stream,
  and recoverable auth-hydration regression coverage.
- `app/src/lib/fortune-score.ts` - local chart scoring, including the
  deterministic Life Timeline path; it no longer exposes an LLM message route.
- `app/src/components/kline/LifeKLine.tsx` + `ScoreRadar.tsx` - visible English
  Life Timeline UI with a current-age-focused default range, an optional age
  1–100 full model, horizontal mobile inspection, an explicit year selector,
  translated cycle labels, and four-dimension detail. The full range covers ten
  decadal cycles and is explicitly not presented as a lifespan estimate.
- `app/src/lib/true-solar-time.ts` - true solar time calculation and birthplace matching helpers (Chinese, pinyin, and world-city input; DST-aware offsets via Intl).
- `app/src/lib/birthplace-data.json` - local Chinese city/region coordinate dataset.
- `app/src/lib/world-cities.json` - curated global city dataset (name, country, longitude, IANA timezone, aliases).
- `app/src/lib/birth-date.ts` - birth date handling.
- `app/src/lib/astro.ts` - chart-facing astrology helpers.
- `app/src/knowledge-db/retrieval/retrieve.ts` - guidance retrieval.
- `.github/workflows/sync-zwknows.yml` - legacy-named candidate workflow with
  two intended gates: locked install, moderate-or-higher dependency audit, app
  lint/test/build/whitespace with payment flags closed, and an Ubuntu isolated
  `Fresh` Supabase Release Proof using CLI `2.84.2`. The database job finalizes
  no-backup cleanup before validating and uploading only a sanitized Release
  Proof v2 artifact. It contains no deployment job or credential use. Enable
  Actions, require both jobs before merging to `main`, and separately gate
  Vercel production promotion on the exact commit.

## Data Sources

- Birthplace coordinate data comes from the open source `88250/city-geo` dataset.
- License text is tracked in `docs/licenses/city-geo-MulanPSL2.txt`.
- Runtime domain knowledge lives in `app/src/knowledge/`; structured retrieval
  entries and source metadata live in `app/src/knowledge-db/`. Product/design
  reference material is under `docs/plans/`. This repository has no numbered
  root knowledge folders.

## Boundaries

- UI components should call business helpers instead of embedding calculation logic.
- `app/src/lib/` owns deterministic data transformation and calculation helpers.
- `app/src/knowledge-db/` owns retrieval data and prompt-grounding context.
- Workflow tests under `app/tests/` protect repository automation contracts.
- Candidate verification must complete as required pull-request checks before
  a protected `main` merge. Vercel reads `main` directly, so its build can race
  the exact-commit Actions run; Deployment Checks or staged/manual promotion
  must hold production until that run succeeds. No workflow may push a
  deployment mirror.
- Every production API TypeScript file belongs to the root `tsc -b` graph
  through `tsconfig.api.json`. Type errors must be fixed at their ownership or
  response boundary, not hidden by excluding files or weakening strict options.
- Opaque and rollback-compatible Bearer authentication validates provider
  identity through a bounded `/auth/v1/user` request before granting account
  access. Only explicit `401`/`403`, null user, or opaque identity mismatch is
  an authentication rejection. All other provider/network/parse/abort/timeout
  failures are availability errors; they cannot revoke a SID, advance
  `last_seen_at`, clear the cookie, or fabricate a cookie/Bearer conflict.
- `credit_ledger` is the sole credit balance source. Browser roles can read only
  their own four display-safe columns through `credit_activity`; whole-table
  SELECT and ownership/idempotency/metadata columns are denied. The balance
  view exposes only the aggregate. Credit writes cross the server-only
  service-role boundary through `spend_credits`. `profiles.credits` is retained
  only as a deprecated rolling-deployment compatibility field.
- Account deletion nulls the ledger's owner-facing `user_id` through a narrowly
  allowed FK action while retaining immutable entries under pseudonymous
  `account_id`.
- Credit prices and feature costs are selected only from the versioned
  server-owned catalog. Account reads validate a Supabase session and retain
  end-user RLS; request query/body fields cannot choose the account. Product
  debits remain an internal helper until a transactional generation endpoint
  can own both delivery and spending.
- Future Report PayPal purchases are separate from `credit_ledger`. A signed-in
  browser chooses only a tier; server code selects integer minor-unit USD
  pricing, moves money, verifies the current PayPal order, and exposes only the
  owner's durable entitlement through authenticated APIs.
- Future Report payments are a fail-closed dormant path. Exact client/server
  enable flags are both required. Chart facts are now reconstructed server-side
  from strict birth/persona input; the flags remain unset until the complete
  payment/webhook/reconciliation path and this reconstruction are deployed and
  verified together.
- Public AI accepts no arbitrary chat payload. The browser supplies only strict
  `reading.v1` birth/persona/year input; server code owns chart/prompt
  reconstruction and model policy. It remains fail-closed unless the exact
  enable flag, origin, DeepSeek and Supabase credentials, HMAC key, positive
  limits, and quota migration are all present. Quota claims persist HMAC
  subjects rather than raw IPs and are not refunded after upstream failure.
- Candidate database migrations are one-shot artifacts, not idempotent setup
  scripts. Release Proof accepts only a known baseline: no app tables for
  `Fresh`, profiles-only for `Upgrade`, or all expected tables for
  `VerifyOnly`. Partial candidate state is rejected rather than guessed or
  repaired.
- In server-login modes, the browser obtains a one-use pre-auth CSRF token,
  starts email or Google login, and receives only an opaque flow cookie. Email
  transactions live at most one hour; OAuth transactions live at most ten
  minutes. The exact callback atomically claims the row before Supabase code
  exchange and creates an opaque app session. A claimed transaction is never
  replayed; an uncertain/lost post-claim result requires a new login.
- Email verification reuses the initiating browser's flow transaction. The
  manual six-digit OTP endpoint and fragment-only TokenHash confirmation page
  both call Supabase `verifyOtp`; only an explicit guarded POST claims the
  transaction. The confirmation landing's passive requests do not consume it.
  A different device has no flow cookie, so the user must enter the OTP back in
  the original browser. Any failed verification ends that transaction.

[PROTOCOL]: Update this file when module ownership, data flow, important files, or
source data changes.
