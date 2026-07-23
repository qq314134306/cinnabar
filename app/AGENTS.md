# App Agent Guide

> L2 | Parent: `../AGENTS.md`

## Scope

This directory contains the Vite React application. Read this file before
modifying files under `app/`.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Zustand
- Vitest
- React Testing Library + jsdom
- ESLint
- iztro
- Vercel Analytics

## Commands

Run from `app/`:

```powershell
npm ci
npm audit --audit-level=moderate
npm run dev
npm run lint
npm run test
npm run build
```

`npm run build` executes the root `tsc -b` project graph before Vite.
`tsconfig.api.json` is a strict referenced project, so the build type-checks
`app/api/` as well as the browser application and build configuration.

Targeted examples:

```powershell
npm run test -- true-solar-time
npm run test -- retrieve
npm run test -- llm
npm run test -- public-reading
npm run test -- sync-zwknows
npm run test -- database-release-proof
```

`sync-zwknows` is the current legacy test/file name. It protects the candidate
workflow contract until that workflow is renamed; the workflow itself contains
only verification jobs and the `zwknows` mirror is no longer a deployment
target.

## Deployment and Rollout Contract

Vercel is directly connected to the canonical GitHub repository's `main`
branch, with `app` as the Root Directory. A release candidate must pass the
application verification and isolated Fresh database proof as required pull-
request checks before merge; the merge commit then reaches Vercel through its
direct Git integration. Do not reintroduce a mirror repository, sync token, or
force-push stage. Direct Vercel builds do not prove that GitHub checks passed.

The pure verification workflow is ready but the canonical fork's Actions are
disabled and no Actions secrets are configured, so it has no hosted execution
evidence. Enable the workflow and protect `main` with the two candidate jobs as
required checks. Because the Vercel build and the `main` Actions run may start
in parallel after merge, also require Vercel Deployment Checks or an equivalent
staged/manual promotion before production domain assignment. Inspect the real
hosted run and sanitized database artifact before treating the gate as
operational.

The authenticated Vercel team is on Hobby, whose direct `api/` runtime permits
at most 12 deployable Functions. `api/auth.ts` is the single routed auth
Function; `vercel.json` rewrites every one-segment `/api/auth/:route` path to
it, and underscore-prefixed `_auth-route-*.ts` files contain the non-routed
handlers. Keep all public URLs and exact-origin checks unchanged. Run
`tests/vercel-function-budget.test.ts` whenever adding or moving an API entry
point; it locks the complete deployable set to the 12-function budget.
`interpret.ts`, all Future Report/PayPal provider-facing handlers, and
`cron/paypal-reconciliation.ts` are Node Functions because their streaming or
bounded long-running work can exceed Edge's first-response window. Keep their
route-specific limits in `vercel.json`; interpretation alone opts into
platform request cancellation because payment mutations must not be terminated
only because a browser disconnects.

Production and Preview currently expose only the existing Supabase, Make, and
DeepSeek variable names. The deployment still lacks `APP_ORIGIN`, `AUTH_MODE`,
`SESSION_ENCRYPTION_KEY`, `ENABLE_PUBLIC_AI_READINGS`,
`VITE_ENABLE_PUBLIC_AI_READINGS`,
`PUBLIC_AI_QUOTA_HMAC_KEY`, `PUBLIC_AI_DAILY_IP_LIMIT`, and
`PUBLIC_AI_DAILY_GLOBAL_LIMIT`. Names being present is not proof that their
values or provider integrations are valid, and values must never be copied into
documentation. Keep authentication on the legacy rollback path and public AI
disabled until the documented database, preview, provider, and cost-control
proofs pass. Future Report payments remain last and disabled.

## Member List

`src/main.tsx`: React entry point and app mounting.

`src/App.tsx`: Top-level application composition (Cinnabar shell: Your Chart,
Life Timeline, Compatibility, and Share Card; Yearly Fortune remains in the
codebase but is hidden from navigation). Desktop and mobile navigation have
distinct accessible labels, expose the active surface with
`aria-current="page"`, and keep decorative tab icons out of accessible names.

`api/interpret.ts` + `api/_public-reading.ts`: SERVER-OWNED, default-off public
AI boundary. It accepts only exact `reading.v1` `natal`, `compatibility`, or
`yearly` requests; browser messages, prompts, facts, resolved time,
coordinates, timezone, and extra keys are rejected. The server enforces 18+,
rebuilds the chart/facts/prompt, selects fixed DeepSeek model/token/temperature
policy, atomically claims persistent HMAC(IP)+global UTC-day quotas, and streams
the upstream SSE. Raw IPs, vendor errors, and generated content never enter
logs or public errors. Upstream has a bounded timeout and follows request
abort. Enable only with exact `ENABLE_PUBLIC_AI_READINGS=true`, exact
`APP_ORIGIN`, `DEEPSEEK_API_KEY`, `SUPABASE_SECRET_KEY`, base64url 32-byte
`PUBLIC_AI_QUOTA_HMAC_KEY`, positive `PUBLIC_AI_DAILY_IP_LIMIT` and
`PUBLIC_AI_DAILY_GLOBAL_LIMIT`, and the applied quota migration.
The browser independently requires exact
`VITE_ENABLE_PUBLIC_AI_READINGS=true`; missing, false, or malformed values hide
all three generation entries and `streamReading` rejects before `fetch`.
Candidate CI must keep both `ENABLE_PUBLIC_AI_READINGS=false` and
`VITE_ENABLE_PUBLIC_AI_READINGS=false`.

`api/subscribe.ts`: Vercel Edge Function for email capture (shared by
EmailCapture and the Soul Card unlock). The only place `MAKE_WEBHOOK_URL` is
read; it forwards `{email, source, created_at}` to Make with body-size and
per-IP rate limits. Set `MAKE_WEBHOOK_URL` in the Vercel project env.

`src/components/EmailCapture.tsx` + `EmailCapture.test.ts`: reusable,
source-tagged email opt-in. Invalid and request-error states are announced and
linked to the input, submitting state is busy/disabled and rejects duplicates,
and success is a status that invokes analytics plus the optional unlock
callback exactly once.

`src/components/ExitIntentModal.tsx` + `ExitIntentModal.test.ts`: best-effort
once-per-session desktop exit-intent wrapper. It is a labeled modal dialog,
moves focus inside, traps Tab, closes on Escape or the true backdrop, restores
prior focus, and clears its delayed-success timer on unmount. Unavailable
session storage must not break the dialog.

`api/_supabase-admin.ts`: SERVER-ONLY Supabase service-role client. The
underscore keeps it out of Vercel routing; it must never be imported from
`src/`. The only place `SUPABASE_SECRET_KEY` is read. `src/lib/supabase.ts` is
the browser client and uses only the public `VITE_SUPABASE_URL` +
`VITE_SUPABASE_PUBLISHABLE_KEY`. Authentication supports passwordless email
and Google: `legacy` uses the browser Supabase session, while new
`dual`/`opaque` sign-in uses the server-owned flows below. The `profiles` table,
RLS, and dependent schema live in `supabase/migrations/`; the app never applies
them automatically.
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client),
`SUPABASE_SECRET_KEY` (server only). The browser client is constructed lazily:
new `dual`/`opaque` login does not initialize it or persist Supabase tokens.

`api/_app-session.ts`, `_auth.ts`, `_csrf.ts`, `_auth-http.ts`,
`api/auth.ts`, and `_auth-route-{session,migrate,logout}.ts`: SERVER-ONLY
staged opaque-session BFF. `api/auth.ts` only dispatches the restored public
URL; endpoint logic stays in the underscore-prefixed, non-routed handlers.
`POST /api/auth/migrate` accepts the current Supabase access/refresh session
once and returns only a minimal user, CSRF token, and non-secret session
version; subsequent browser requests use `__Host-cinnabar_sid` (HttpOnly,
Secure, SameSite=Lax, Path=/, no Domain). Provider tokens and the recoverable
CSRF secret are purpose-bound AES-GCM ciphertext in `app_auth_sessions`; SID
and CSRF values are stored as hashes. POSTs require exact `APP_ORIGIN`,
`Sec-Fetch-Site: same-origin`, and `X-CSRF`. Configure `AUTH_MODE` as
`legacy`, `dual`, then `opaque`; dual prefers cookies and rejects conflicting
Bearer identity. `SESSION_ENCRYPTION_KEY` must be
`<version>:<base64url-32-byte-key>`. Never log or expose it. Payments require
the final `opaque` mode in addition to their existing disabled-by-default flag.
Refresh uses an aborting 8-second provider timeout, a non-stealable 30-second
database lease, and up-to-10-second jittered winner wait; all mutations compare
ID + version + lease. Migration inserts an encrypted pending row before
rotation. Retry only `MIGRATION_RETRYABLE`; `MIGRATION_REAUTH_REQUIRED` means
the old provider outcome is uncertain and requires a new sign-in.
Every opaque and allowed Bearer authentication also validates the access token
with a separate aborting eight-second `/auth/v1/user` request that follows the
incoming request signal. Only explicit `401`/`403`, null user, or opaque user-ID
mismatch is an invalid credential. Provider `429`, all other non-`200`
responses, invalid JSON/malformed non-null users, network errors, abort, and
timeout are `503 AUTH_UPSTREAM_UNAVAILABLE`: do not revoke the row, clear the
SID, write `last_seen_at`, or fabricate an identity conflict. Last-seen writes
occur only after successful provider validation and remain conditional on ID +
version + non-revocation. Provider origins require HTTPS except explicit local
loopback `localhost`, `127.0.0.1`, and `[::1]`.
Browser hydration mirrors this distinction: `init()` is a resettable Promise
single-flight, availability uncertainty preserves identity/CSRF/version and
paid cache, and only explicit signed-out state or `401` clears them. Keep
initial `authMode` unknown until hydration and retain the state/listener
generation guards plus the visible retry path.

`api/_auth-login.ts` and
`api/_auth-route-{login-preflight,login-email,login-oauth,callback}.ts`:
SERVER-ONLY
authorization-code + PKCE login for `dual`/`opaque`. Login POSTs consume a
one-use pre-auth double-submit header plus
`__Host-cinnabar_login_csrf; HttpOnly; Secure; SameSite=Strict`. The browser
then holds only an opaque `__Host-cinnabar_auth_flow` handle; its hash selects a
service-role-only row containing the purpose-bound AES-GCM PKCE verifier.
Email transactions/cookies live at most one hour and OAuth at most ten minutes.
The exact `${APP_ORIGIN}/api/auth/callback` claims the row before exchange and
issues the opaque SID without returning provider tokens. Supabase/GoTrue owns
Google OAuth state, nonce, and ID-token validation; the Cinnabar handle is only
login-transaction binding. A lost/uncertain post-claim response requires a
fresh login. Do not claim completed-SID recovery.

`api/_auth-route-login-email-verify.ts`, `_auth-route-email-confirm.ts`, and
`../supabase/templates/magic_link.html`: scanner-resistant email verification
for the same server PKCE transaction. The template presents `{{ .Token }}` for
manual six-digit OTP entry and places `{{ .TokenHash }}` only in the fragment of
the exact `${APP_ORIGIN}/api/auth/email-confirm` landing. GET/HEAD never claims
or verifies; a valid GET only reads the unclaimed transaction and rotates the
pre-auth CSRF cookie. Only an explicit guarded POST claims once and calls
`verifyOtp`. Both paths require the original same-device flow cookie; a
cross-device user must return to the initiating browser and enter the OTP.
Every verification failure is terminal for that transaction and requires a new
email start. The Supabase Dashboard Magic Link template must deploy this file
or equivalent content, with exact Site URL, OTP expiry no greater than one hour,
and email link tracking disabled. The installed auth-js `/verify` request shape
is contract-tested, but initial PKCE-challenge compatibility with direct
`/verify` still requires isolated staging proof.

`api/_credits-catalog.ts` + `_credits-spend.ts`: SERVER-ONLY, immutable,
versioned credit pack/product catalog and isolated trusted debit helper. Public
`GET /api/credits/catalog` serializes the non-secret contract. Authenticated
`GET /api/credits/account` validates the opaque session (with dual-mode Bearer
rollback) and reads the
balance/ledger through a publishable-key client constrained by RLS; it never
accepts a user ID or uses the service-role secret. There is intentionally no
standalone debit, payment, or generation endpoint. `_credits-service.ts` is the
account reader and has no service-role dependency. Browser-readable activity is
limited to `credit_activity`'s id/amount/type/time fields; internal ledger
columns have no browser SELECT privilege. The account endpoint accepts only
UUID/ULID request IDs, returns stable errors, validates canonical pagination,
and has a best-effort per-user warm-isolate limit with `Retry-After` (not a
distributed quota).

`src/components/`: Feature UI components. Keep deterministic calculation logic in
`src/lib/` instead of embedding it in components. All user-facing text is
English; the iztro engine output stays zh-CN internally and is translated at the
presentation layer.

`src/components/ui/`: Small reusable UI primitives.

`src/components/OpenSourceLinks.tsx`: GitHub repository and license links for
open source attribution in the app shell. Both must target the confirmed
canonical `qq314134306/cinnabar` repository.

`src/components/CreditWallet.tsx` + `src/lib/credits.ts`: Signed-in, read-only
credit wallet. The header shows the current balance and opens a mobile-first,
background-isolated recent-activity dialog. Browser reads use the opaque
same-origin cookie by default; only an explicit in-memory token from true
`AUTH_MODE=legacy` adds a rollback-compatible Bearer header.
`GET /api/credits/account` reads the safe activity view under end-user RLS; the
browser never reads raw ledger metadata or business keys. Missing/unavailable
credit data degrades inside the wallet without blocking auth or readings.
Credit writes remain server-only.

`src/lib/`: Business helpers for date handling, astrology support, true solar
time, birthplace data, LLM wiring, and scoring.

`src/lib/ziwei-glossary.ts`: Chinese→English translation dictionaries for stars,
palaces, transformations, brightness, stems/branches, shichen, and Na Yin.
Follows the Cinnabar glossary; covered by `ziwei-glossary.test.ts`.

`src/lib/chart-facts.ts`: Builds the English CHART FACTS block fed to AI
prompts, including `buildYearlyChartFacts` (year-by-year Liu Nian facts via
`chart.horoscope()`) for the paid Future Report.

`src/lib/ai-prompts.ts`: Base system prompt, Scholar/Old Sage personas, and the
free-reading / compatibility / paid Future Report prompt templates.

`src/lib/reading-contract.ts` + `src/lib/llm.ts`: browser-side public-reading
allowlist and streaming client. `streamReading` accepts only the discriminated
product request, applies a final runtime wire projection, forwards an
`AbortSignal`, and parses multiline/chunked/tail UTF-8 SSE through `[DONE]`.
There is no general chat/messages export.

`src/components/AIInterpretation.tsx` + `src/stores/index.ts`: the natal reading
cache is an atomic `{content, requestKey}` pair keyed by the exact serialized
`reading.v1` request. Retry and chart/persona changes abort and clear the old
stream. Keep controller + request-key + chart guards on tokens, cache writes,
errors, and completion analytics; never restore cache from an effect after a
retry has cleared it.

`src/lib/fortune-score.ts` + `src/components/kline/LifeKLine.tsx`: visible Life
Timeline uses the deterministic local calculator. Its default view stays
focused on the current age minus five through plus twenty-five, while the full
ages 1-100 model is explicitly optional and must never be described as a
lifespan estimate. It must not regain a generic LLM/messages path or invent a
`lifetime` public-AI operation.

`src/lib/paypal.ts`: PayPal Smart Payment Buttons adapter. It sends only the
tier, a stable checkout-attempt UUID, and an allowlisted birth/persona request
over the same-origin opaque session plus session-bound CSRF; it never sends
prices, chart facts, requested forecast years, coordinates/timezones, prompts,
or payment status.

`api/_future-report-chart.ts`: SERVER-ONLY Future Report chart authority. It
strictly parses birth/persona fields, resolves exact bundled birthplace matches
and true solar time, regenerates the iztro chart and English facts, selects the
2/5 calendar years from the paid tier, and emits the durable snapshot plus
SHA-256 chart fingerprint. `BirthForm` explicitly asks whether the selected
time is recorded or approximate: only recorded time emits a Birth Hour fact;
approximate/legacy-unknown time omits it. Paid capture rejects minors before
PayPal capture.

`src/components/FutureReportPaywall.tsx`: Pricing tiers (1-Year/5-Year),
account-gated PayPal checkout, server purchase recovery, no-recapture report
retry, and the purchased report view rendered below the free reading in
`AIInterpretation.tsx`.

`src/components/LocalChartSnapshot.tsx`: deterministic, current-model-year
chart summary rendered whenever a natal chart exists, regardless of the public
AI flag. It derives its English identity locally and exposes overall, Career,
Wealth, Relationships, and Well-being scores without an account, API, payment,
cache, or analytics. Keep this base result visible when the optional AI
narrative is enabled or unavailable.

`api/future-report-order.ts`, `future-report-capture.ts`,
`future-report-access.ts`, `future-report-generate.ts`: Authenticated Future
Report transaction boundary. The server owns prices and facts, creates/captures
PayPal orders, re-fetches and verifies completed
amount/currency/reference/capture, persists report inputs/results, and
generates only from a verified purchase.
Generation owns a fixed DeepSeek policy and one 45-second fetch/body deadline,
accepts at most 512 KiB of JSON, and maps vendor failures to safe stable errors.
After claim, every failure attempts the exact purchase/timestamp failure CAS
with an independent seven-second deadline; cleanup failure must never mask the
original error or hang the response.
Payments are deliberately disabled unless both
`ENABLE_FUTURE_REPORT_PAYMENTS=true` (server) and
`VITE_ENABLE_FUTURE_REPORT_PAYMENTS=true` (browser) are exact matches.
The current candidate workflow pins both flags to `false`.
Required server env after the production blockers are resolved:
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`,
`PAYPAL_ENV=sandbox|live`, `SUPABASE_SECRET_KEY`, and `DEEPSEEK_API_KEY`; the
browser separately needs the matching public `VITE_PAYPAL_CLIENT_ID`.

`api/paypal-webhook.ts` + `_paypal-webhook.ts`: Public, server-only PayPal
webhook boundary. It requires `PAYPAL_WEBHOOK_ID`, calls PayPal's official
verify-webhook-signature API with the delivery headers and event parsed from the
raw body, deduplicates by event ID, then re-fetches capture/order/dispute state
before a monotonic database RPC may update payment status. Disputes use
`resource.dispute_id` and lay an irreversible tombstone even before local
completion. Unknown and duplicate signed events are safely acknowledged;
temporarily missing purchases or lagging authoritative state remain retryable.

`api/cron/paypal-reconciliation.ts` + `_paypal-reconciliation.ts`: Private,
bounded recent-purchase reconciliation for Vercel Cron. It uses an independent
`CRON_SECRET`, a database-persisted keyset cursor and 429 backoff, re-fetches
PayPal order state through 15-second hard-bounded requests, and returns fixed
aggregate counters without account or processor identifiers. A run launches at
most 40 purchase reads by default, stops starting work after 210 seconds, and
leaves the cursor on the last completed purchase so the next run resumes safely.

`src/lib/analytics.ts`: Guarded gtag.js wrapper. The local application bundle
initializes GA4 and dynamically loads gtag.js with automatic page_view disabled,
so `index.html` needs no inline script or CSP exception. `App.tsx` sends a manual
page_view per tab change, and components fire named custom events
(view_landing, start_reading, complete_reading, view_paywall,
begin_checkout, purchase_success, view_wallet). `view_wallet` carries no
account data or other PII. The GA4 Measurement ID is public; no secrets belong
here.

`vercel.json` + `api/csp-report.ts`: Deployment security-header boundary. CSP
is deliberately `Content-Security-Policy-Report-Only` while real GA4, Supabase,
DeepSeek, and PayPal sandbox flows are observed. The report endpoint enforces a
streamed 16 KB byte cap, best-effort per-instance rate limit, and host/directive
sanitization; it never retains full URLs, query strings, script samples,
cookies, or request data. Do not switch CSP to enforcement until production
reports have been reviewed and payment/browser domains are verified.

`src/lib/true-solar-time.ts`: True solar time and birthplace matching logic.
Accepts Chinese names, tolerant pinyin ("Zhu Zhou"/"zhuzhou"), and world-city
English names; UTC offsets are DST-aware via the built-in Intl API (China
entries default to Asia/Shanghai).

`src/components/BirthForm.tsx` + `BirthForm.test.ts`: chart-casting entry. The
year, month, and day controls retain explicit accessible names, invalid
month/day combinations are clamped, and a generation failure must leave the
form retryable with a visible alert rather than only a console message.

`src/components/AuthControl.tsx` + `AuthControl.test.ts`: header authentication
state and recovery. When cookie authority is unknown, session retry remains
visible, but its long provider-error text is visually compact below the large
desktop breakpoint while remaining an announced alert. Tests exercise rendered
states rather than source-text matching.

`src/components/AuthModal.tsx` + `AuthModal.test.ts`: passwordless email/OTP
and OAuth entry dialog. It has a state-dependent accessible name/description,
moves focus inside, traps Tab, closes on Escape or the true backdrop, and
restores prior focus when its parent unmounts it. Email errors remain announced
and input-linked; OTP attempt-consumption behavior is unchanged.

`src/lib/birthplace-data.json`: Local Chinese coordinate dataset used for
birthplace matching (pinyin keys generated at load via pinyin-pro).

`src/lib/world-cities.json`: Curated global city dataset (name, country,
longitude, IANA timezone, aliases) for overseas true-solar-time correction.

`src/knowledge-db/`: Structured guidance database and retrieval pipeline.

`src/knowledge/`: Static domain knowledge used by the app (zh-CN; used by the
hidden fortune/K-line features).

`src/stores/`: Zustand state boundaries. Settings persist only the reader
persona; API keys are no longer stored client-side. Cross-tab authentication
uses only a fixed versioned revalidation hint, never identity or credentials,
and focus/visibility recovery reuses the session-init single-flight. Signals
received during a flight must produce one trailing revalidation.

`tests/`: Tests that sit outside `src`, including workflow contract tests.

`api/subscribe.ts` + `tests/subscribe-api.test.ts`: Strict same-origin public
email relay, exact input contract, bounded body/IP bucket, safe Make webhook
configuration, redirect denial, and active request/webhook deadlines. Its
per-IP, overflow, and isolate-global windows form only a warm-isolate abuse
brake; never describe them as a persistent quota.

`src/lib/compatibility-score.ts` +
`src/components/match/MatchAnalysis.tsx` + their tests: Compatibility always
offers a symmetric, deterministic local four-dimension snapshot without an
account, API, payment, cache, or analytics. The optional AI narrative remains
uncached; its controller, exact request key, and both input identities own
every streamed commit. Keep both paths free of analytics unless product and
privacy requirements explicitly change. Person A and Person B controls must
retain unique element IDs, person-specific accessible names, independent radio
groups, and an announced recoverable local-error state.

`src/components/share/ShareCard.tsx` + `ShareCard.test.ts`: deterministic
chart-summary card and local PNG export. The quote renderer uses an
html2canvas-stable fixed-width Georgia/Times stack with explicit wrapping;
changes to its font or layout require inspecting a real exported PNG, because
the browser preview alone does not reveal canvas text-measurement regressions.
The default quote and customization path work without AI; an existing AI
narrative may supply a quote but product copy must not present it as a
prerequisite.

`tests/api-typecheck.test.ts`: Contract coverage that keeps
`tsconfig.api.json` in the root build graph, keeps strict API type checking
enabled, and keeps `npm run build` on `tsc -b`. It does not replace executing
the real build.

`tests/database-release-proof.test.ts`: Local contract coverage for the
database release-proof runner. It pins the seven `20260723` migrations in
dependency order, requires the non-production target guard, distinguishes
fresh/upgrade/verify-only baselines, and verifies that every SQL/concurrency
suite is wired. It also pins Release Proof v2 source commit/run attempt,
migration-set fingerprint, exact CLI, cleanup-before-upload, and bounded
failure-artifact semantics. It does not replace a run against a disposable
Supabase-shaped PostgreSQL database. The GitHub workflow is configured to run
`Fresh`, but no successful hosted run or sanitized artifact has been inspected
yet; do not claim an operational Fresh proof from configuration or local
contracts alone.

`../supabase/migrations/20260723060000_public_ai_quota.sql` +
`../supabase/tests/public_ai_quota.sql`: persistent public-AI quota counters
behind a service-role-executable SECURITY DEFINER RPC; anon, authenticated, and
service-role clients have no direct table access. The rollback-only SQL suite
proves ACL, atomicity, limit, and cleanup behavior. The HMAC subject is
intentionally not a recoverable raw IP.

`tests/auth-session-reliability.test.ts` +
`tests/auth-session-identity.test.ts`: Deterministic Release Proof coverage for
provider-user timeout/request abort/local-loopback handling, authoritative
rejection versus transient unavailability, refresh contention/winner adoption,
lease/CAS uncertainty, migration retry-versus-reauth classification,
expiry/revocation, last-seen ordering, malformed cookies, and dual
cookie/Bearer identity conflicts. Keep their encrypted fixtures generated with
the same AES-GCM key and purpose-bound AAD as the production helper; placeholder
ciphertext makes concurrency tests flaky and invalid.

## Change Rules

- UI behavior changes should keep form flows usable for non-technical users.
- True solar time changes must protect users from needing raw longitude, latitude,
  or manual minute correction unless explicitly requested later.
- Birthplace matching changes should be tested against realistic city input.
- Workflow changes should keep `qq314134306/cinnabar` as the canonical source,
  keep the workflow verification-only, and enforce candidate checks before
  merge to protected `main`. Vercel deploys that branch through direct Git
  integration; production promotion must wait for exact-commit checks, and
  workflow jobs must not push or force-push a deployment mirror.
- Public AI must remain `reading.v1` allowlist-only and default-off. Do not add
  messages/prompts/facts to browser requests, weaken atomic persistent quota,
  store raw IPs, refund an allowed quota claim after upstream failure, or expose
  DeepSeek body/content in errors or logs.
- Authentication must not treat provider availability as credential rejection.
  Preserve the authoritative-rejection `401` versus availability
  `503 AUTH_UPSTREAM_UNAVAILABLE` boundary, exact-version opaque revocation, SID
  preservation, and post-validation last-seen write ordering.
- Cross-tab auth messages are revalidation hints only. Do not put user/email,
  SID, CSRF, provider tokens, session version, or paid data in BroadcastChannel
  or browser storage, and do not clear identity from a tab event without
  authoritative server state. Do not let an in-flight request swallow a
  freshness event; coalesce it into one trailing revalidation.
- Compatibility streaming must invalidate before abort and guard token, error,
  and completion commits by controller, exact request key, and both input
  identities. It has no cache or analytics.
- The public subscribe route must retain exact same-origin JSON/schema/source
  checks, the streamed byte cap, strict single-XFF handling, bounded
  warm-isolate buckets, safe webhook URL rules, active request-linked
  deadlines, Make-owned host allowlisting, redirect denial, response-body
  cancellation, stable no-store errors, and PII-free logs.
- API type errors must be fixed at their source. Do not exclude `api/` from the
  root TypeScript graph, weaken `strict`, or use broad casts to make the build
  pass.
- Dependency or lockfile changes require a clean `npm ci`, a moderate-or-higher
  audit, lint, the full test suite, and the production build.
- Documentation changes are required for meaningful app behavior, module, command,
  or workflow changes.

## Verification Guide

- Calculation helper change: run the matching targeted Vitest file and then
  `npm run test`.
- UI component change: run `npm run lint`, relevant tests, and browser-check the
  changed flow when practical.
- Build change: run `npm run build`; this includes strict `app/api/` type
  checking through `tsconfig.api.json`.
- Dependency or lockfile change: run `npm ci`,
  `npm audit --audit-level=moderate`, `npm run lint`, `npm run test`, and
  `npm run build`.
- GitHub workflow change: run the legacy-named
  `npm run test -- sync-zwknows` contract until the workflow/test are renamed,
  plus `actionlint` when available.
- Opaque/Bearer authentication change: run `npm run test -- auth-session`; keep
  provider rejection, non-`200`/parse/network/abort/timeout, no-revocation,
  no-last-seen-write, SID preservation, and loopback cases in the focused set.
- Database release-runner change: run
  `npm run test -- database-release-proof`, parse every PowerShell file, and
  then run the proof against an explicitly marked disposable target when
  PostgreSQL tooling is available.
- Public-reading change: run `npm run test -- llm`,
  `npm run test -- public-reading`, the database release-proof contract, lint,
  and the complete root build. If quota SQL changes, execute its SQL suite only
  on an explicitly marked disposable Supabase-shaped target.
- Cross-tab auth change: run `npm run test -- src/stores/auth.test.ts
  src/components/AuthControl.test.ts`, then lint and the complete root build.
- Compatibility change: run
  `npm run test -- src/lib/compatibility-score.test.ts
  src/components/match/MatchAnalysis.test.ts`, then lint and the complete root
  build.
- Share Card change: run
  `npm run test -- src/components/share/ShareCard.test.ts`, inspect one real
  exported PNG, then lint and the complete root build.
- Subscription change: run `npm run test -- tests/subscribe-api.test.ts`, lint,
  and the complete root build. A mocked webhook and warm-isolate limiter remain
  local contract evidence, not deployed delivery or distributed-rate proof.

The current lockfile baseline has zero known vulnerabilities at the moderate
audit threshold. That is point-in-time evidence, not a permanent property of
the dependency graph; CI reruns the audit for every candidate.

[PROTOCOL]: Update this file when app structure, commands, key files, or app-level
development rules change.
