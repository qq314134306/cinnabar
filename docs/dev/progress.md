# Development Progress

> L2 | Parent: `AGENTS.md`

## Current State

- Candidate branch: `codex/release-hardening` (production branch remains `main`)
- Confirmed canonical source and local `origin`: `qq314134306/cinnabar`
- Authenticated Vercel inspection on 2026-07-23 confirmed team
  `cinnabarastrology`, project `cinnabar`, direct Git integration to
  `qq314134306/cinnabar`, production branch `main`, and Root Directory `app`.
  The current production deployment is sourced from commit `104de00` and
  includes the `interpret` and `subscribe` functions. No Vercel project
  identifier or environment value is recorded in repository documentation.
- The current Vercel path is direct GitHub-to-Vercel deployment. The historical
  `ruijayfeng/zwknows` mirror and its write credential are not current
  deployment dependencies.
- Vercel currently has these environment-variable names in both Production and
  Preview: `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_URL`, `MAKE_WEBHOOK_URL`, and `DEEPSEEK_API_KEY`. Values were
  not copied or exposed.
- `APP_ORIGIN`, `AUTH_MODE`, `SESSION_ENCRYPTION_KEY`, both public-AI enable
  flags, and the quota variables are not configured in Vercel. The absent `AUTH_MODE`
  leaves the runtime on its code-level `legacy` fallback; public AI remains
  fail-closed. These are configuration gaps, not evidence for enabling either
  feature.
- Authenticated GitHub inspection found Actions disabled for the repository and
  no Actions secrets configured. The candidate workflow therefore has no
  GitHub-hosted run or artifact. Actions must be explicitly enabled before any
  hosted verification can be claimed.
- GitHub `main` is not protected. Vercel has Git Fork Protection, Standard
  Deployment Protection, Build Logs protection, and Source protection enabled,
  but no Deployment Checks are configured and automatic custom-production-
  domain assignment is enabled. A verified GitHub check is therefore not yet a
  proven prerequisite for the Production alias.
- The candidate branch contains work beyond production commit `104de00`. No
  push, pull request, hosted verification, or deployment of that candidate is
  claimed here.

## Recently Completed

- Split secondary product surfaces out of the landing bundle without changing
  their behavior. Optional AI narrative, Life Timeline, Compatibility, and the
  populated Share Card now load only when rendered and expose announced
  loading states; BirthForm, the base chart, and the no-chart Share Card
  recovery remain immediate. Navigation now updates the document title with
  the existing analytics virtual route. The production main script fell from
  1,416.78 kB / 421.89 kB gzip to 981.91 kB / 299.97 kB gzip (30.7% raw and
  28.9% gzip smaller). Chrome production-preview acceptance cast the default
  chart, observed the local snapshot and optional-AI state, then opened
  Compatibility and the populated Share Card with correct titles and no
  warning/error log.
- Added a matching browser-side public-AI kill switch. Only exact
  `VITE_ENABLE_PUBLIC_AI_READINGS=true` shows the three reading entrypoints;
  missing, false, or malformed values show a clear unavailable state, hide
  cached output, and make `streamReading` reject before `fetch`. Candidate CI
  now explicitly pins both the browser and server public-AI flags to `false`.
- Moved interpretation streaming, all Future Report/PayPal provider-facing
  handlers, and PayPal reconciliation from Edge to explicit Node Functions.
  The authenticated project has Fluid Compute enabled; `vercel.json` pins
  route-specific 60-300-second maximum durations and opts only interpretation
  into request cancellation. Payment mutations must not be killed merely
  because a browser disconnects. This removes the Edge 25-second
  first-response mismatch, while existing application deadlines remain. Local
  runtime contracts and build pass; a Vercel Preview is still required for
  operational proof.
- Confirmed the active Vercel team is on Hobby and removed a deterministic
  Preview blocker: the candidate had 20 deployable `api/` entrypoints against
  the plan's 12-Function limit. The nine public auth paths now rewrite through
  one `api/auth.ts` dispatcher while their tested implementations remain
  underscore-prefixed, non-routed modules. Exact public URLs and origin checks
  are restored before dispatch. A new contract pins the complete deployable set
  at 12, the rewrite, rewritten preflight behavior, and unknown/nested/
  ambiguous-route rejection. This is local eligibility evidence; only a real
  Preview proves the platform build.
- Corrected the app shell's header, footer, and GPLv3 links to the confirmed
  canonical `qq314134306/cinnabar` repository and added a component contract
  test so the visible attribution cannot drift back to the historical upstream.
- Made desktop and mobile primary navigation semantically observable: each nav
  has a distinct label, the active destination exposes `aria-current="page"`,
  and decorative icons no longer pollute button names. During unknown session
  authority, the retry action remains visible at every viewport while the long
  provider-error detail becomes visually compact below the large desktop
  breakpoint and remains an announced alert. AuthControl coverage now renders
  retry, callback-error, and failed-sign-out states instead of inspecting
  source text. A 390-by-844 Chrome check confirmed the compact header, visible
  retry action, semantic active-state transition to Timeline, zero page-level
  horizontal overflow, and an empty current-build warning/error log.
- Added same-origin cross-tab authentication freshness without copying
  credentials or identity into browser storage. A versioned
  `BroadcastChannel` carries only a fixed "session may have changed" event;
  receiving tabs, window focus, and visible-document recovery all reuse the
  resettable session-init single-flight. Signals received during a flight
  collapse into one trailing revalidation, so an event cannot be swallowed by
  a stale response. Successful callback hydration, OTP verification, legacy
  migration, and logout broadcast once. Transient session uncertainty still
  preserves the current identity and paid cache, while an authoritative
  signed-out response clears them. An unknown legacy migration phase remains
  terminal because refresh-token rotation cannot safely be replayed, and that
  terminal transition is broadcast.
- Bound Compatibility streaming to the exact compatibility request plus both
  input object identities. Persona or either person's input change, retry, and
  unmount invalidate the old controller before aborting it; every token, error,
  and completion checks current ownership. All request-defining controls are
  disabled during a stream, and Compatibility intentionally remains uncached
  and without analytics.
- Made Compatibility functional when public AI is disabled. “Compare Locally”
  now creates a symmetric, bounded four-dimension snapshot from both generated
  charts, including English identities, element context, strongest signal, and
  growth edge. It uses no account, API, payment, cache, or analytics; the UI
  explicitly labels it a reflective model rather than scientific evidence or
  relationship advice. The existing guarded stream remains an optional “Add AI
  Reading” layer. Desktop and 390-by-844 Chrome acceptance passed with no new
  current-build warning/error log. Person A/B year, month, day, hour, and
  gender controls now have unique element IDs, person-specific accessible
  names, and independent radio groups; a local comparison failure is announced
  as a retryable alert.
- Made Your Chart useful when public AI is disabled. A completed natal chart
  now includes a deterministic current-model-year snapshot with an English
  identity, overall score, and Career, Wealth, Relationships, and Well-being
  dimensions. It needs no account, API, payment, cache, or analytics and is
  labeled as reflective rather than scientific or professional advice. The
  unavailable AI state is now a separate optional-narrative notice, and the
  snapshot remains visible when the AI layer is enabled. Desktop and
  390-by-844 Chrome acceptance passed with four accessible progress bars, no
  page-level horizontal overflow, and no current-build browser warnings or
  errors.
- Verified the Share Card path against its real downloaded PNG rather than the
  browser preview alone. The export worked, but Cormorant italic text measured
  incorrectly in html2canvas and overlapped words. The quote area now uses a
  fixed-width Georgia/Times stack with explicit wrapping and spacing. A second
  2x PNG showed clean two-line text, and focused tests now cover custom-copy
  preservation plus the canvas/download contract. The fixed 360px preview now
  receives enough mobile container width, eliminating page-level horizontal
  overflow at 390-by-844 without changing the exported dimensions. The
  no-reading hint now presents the built-in/default customization path first;
  an available AI narrative is an optional quote source rather than a
  prerequisite.
- Made chart casting failures visible and recoverable. The birth year, month,
  and day selects now have explicit accessible names. If birth-time resolution
  or chart generation fails, the form restores its submit action and shows a
  concise alert; a retry clears the alert and can commit the chart normally.
  Component tests cover the accessible fields, failure state, and successful
  retry.
- Added rendered-state coverage for the reusable email opt-in. Invalid input
  and request failures are announced and linked to the email field; editing
  clears stale errors. Pending requests mark the form busy, disable the action,
  and reject duplicate submissions. Success is announced and invokes analytics
  plus an optional Soul Card unlock callback exactly once. These are local
  component contracts and do not claim that the external Make webhook has been
  verified.
- Made the once-per-session desktop exit-intent prompt a complete keyboard
  dialog. It now has an accessible name/description, moves focus to its close
  action, contains Tab focus, closes on Escape or the true backdrop, restores
  prior focus, and clears a delayed post-signup close on unmount. Session
  storage denial degrades the once-only behavior without breaking the dialog.
  Five component tests cover the trigger, session flag, focus loop, dismissal,
  focus restoration, and delayed-success close.
- Made the passwordless/OAuth sign-in overlay a labeled keyboard dialog without
  changing authentication authority or OTP attempt consumption. Its accessible
  name and description follow the sign-in, verification-code, and inbox
  states; focus enters the close action, Tab remains inside, Escape and the
  true backdrop request dismissal, and parent unmount restores prior focus.
  Email errors are now linked to the address field. Existing OTP tests plus
  focused dialog tests cover the preserved and new behavior.
- Hardened the public email subscription boundary. `/api/subscribe` is now an
  exact same-origin JSON POST with a 2 KiB streamed byte cap, exact
  `{email, source}` schema, normalized bounded email, fixed source allowlist,
  strict single overwritten-XFF parsing, bounded warm-isolate rate buckets, and
  stable no-store errors. A three-second request-body deadline precedes the
  limiter; rejected bodies do not consume its shared allowance. The configured
  webhook is restricted to Make-owned hosts, default HTTPS port, and no
  redirects, except explicit local-development loopback HTTP. A separate
  ten-second fetch/body-cancel deadline follows request abort. Per-IP,
  overflow, and single-isolate global windows are bounded, but remain a
  best-effort abuse brake rather than a persistent or distributed quota.
- Hardened paid Future Report generation after its purchase claim: one
  45-second DeepSeek fetch/body deadline follows request abort, the server owns
  a fixed model/token/temperature policy, and strict JSON is capped at 512 KiB.
  Stable `502`/`503` responses hide vendor details. Post-claim failure runs an
  independent seven-second generation-start-time CAS cleanup without masking
  the original error; an already completed report restores before current
  DeepSeek-key validation.
- Made auth initialization a resettable Promise single-flight with initial
  `authMode: null` and stale generation/listener guards. `503`, network, and
  malformed-response uncertainty preserves the current identity and paid
  cache; only known signed-out state or `401` clears them. `AuthControl` exposes
  `Retry session`.
- Bound free-reading cache and streaming to the exact stable
  birth-input-plus-persona request key. Retry aborts and clears OLD before the
  new stream; persona/birth/chart changes abort the prior operation, late
  token/cache/analytics commits are guarded, and persona controls are disabled
  while loading.
- Replaced the public AI chat pass-through with a fail-closed `reading.v1`
  product boundary. `/api/interpret` accepts only strict `natal`,
  `compatibility`, or `yearly` requests; the browser submits allowlisted birth
  inputs, persona, and year only, never messages, prompts, chart facts,
  resolved time, coordinates, or timezone. The server validates the exact
  request and 18+ eligibility, reconstructs the chart/facts/prompt, and owns
  fixed DeepSeek model, token, and temperature policies. Browser streaming now
  handles split/multiline/tail SSE, UTF-8 boundaries, stable safe errors, and
  aborts stale requests on retry/unmount. Life Timeline no longer has a generic
  LLM route and uses a deterministic local calculation.
- Added the seventh migration,
  `20260723060000_public_ai_quota.sql`, with its rollback-only SQL behavior
  suite. Public AI remains disabled unless both `ENABLE_PUBLIC_AI_READINGS` and
  `VITE_ENABLE_PUBLIC_AI_READINGS` are the exact string `true` and
  `APP_ORIGIN`, DeepSeek, Supabase service access,
  `PUBLIC_AI_QUOTA_HMAC_KEY`, and positive `PUBLIC_AI_DAILY_IP_LIMIT` /
  `PUBLIC_AI_DAILY_GLOBAL_LIMIT` values are all configured. A server-only HMAC
  hides normalized IPs; one database RPC atomically claims both HMAC(IP) and
  global UTC-day counters. Allowed claims are not refunded after upstream
  failure.
- Upgraded database evidence to `cinnabar.release-proof.v2`. Summaries bind the
  source commit, run ID and attempt, execution context, ordered migration-set
  SHA-256, and exact Supabase CLI version. CI finalizes no-backup cleanup before
  validating and uploading the artifact, and failure summaries retain the same
  bounded self-describing schema. This is repository configuration and local
  contract evidence only; no hosted run or artifact has been inspected.
- Closed a root-build type-safety and dependency-audit gap. The previous
  `tsc -b` graph referenced only the browser/Vite and Node configurations, so
  `app/api/**/*.ts` was absent from the production build's strict type check.
  Root `app/tsconfig.json` now also references `tsconfig.api.json`; four
  contracts in `app/tests/api-typecheck.test.ts` pin that reference, complete
  API-source/test exclusion boundaries, the shared Edge/Node runtime surface,
  and the strict compiler options. Bringing the API into the graph exposed and
  fixed WebCrypto inputs backed by generic `ArrayBufferLike`, unvalidated
  provider `expires_at`, non-erasable constructor parameter properties, and
  typed object responses that did not satisfy the JSON helper's record
  boundary. The fixes copy cryptographic bytes into owned `ArrayBuffer`
  instances, validate refresh expiry as finite positive epoch seconds, use
  explicit readonly class fields, and construct ordinary JSON response objects;
  no API was excluded and strictness was not lowered.
- Remediated the locked dependency audit without a forced or broad major
  upgrade. The initial lock reported 5 production and 11 full-tree
  vulnerabilities. A minimal compatible lockfile refresh resolves ECharts
  6.1.0, Vite 7.3.6, and their safe transitive versions; after a clean
  `npm ci`, both production and full `npm audit` report zero vulnerabilities.
  Candidate CI now runs `npm audit --audit-level=moderate` immediately after
  `npm ci`, before lint, tests, and build. The workflow contract pins that
  ordering and forbids audit mutation/force behavior.
- Rewrote the four public READMEs (Simplified Chinese, Traditional Chinese,
  Japanese, and English) around the current Cinnabar product rather than stale
  Ziwei-era claims. They advertise the visible Your Chart, Life Timeline,
  AI Reading, Compatibility, and Share Card surfaces; describe DeepSeek behind the
  server-only `/api/interpret` boundary; distinguish the Vite frontend dev/
  static output from a Vercel-compatible full API runtime; and keep both Future
  Report payment flags explicitly false with no live-payment claim. Language
  navigation, `npm ci`/lint/test/build commands, GPLv3/iztro attribution, and
  the absence of in-app API-key/multi-model configuration are consistent across
  all locales. `app/tests/readme-contract.test.ts` adds 24 drift assertions.
  This is documentation and local contract evidence only; no deployment,
  GitHub-hosted database proof, or payment flow was executed.
- Added server-owned authorization-code + PKCE login for `dual` and `opaque`
  auth modes while preserving the browser Supabase path in `legacy`. Email and
  Google starts use a same-origin preflight plus one-use, HttpOnly
  `__Host-cinnabar_login_csrf` double-submit cookie/header. The server keeps the
  PKCE verifier as purpose-bound AES-GCM ciphertext in a short-lived,
  service-role-only `app_auth_login_transactions` row and gives the browser only
  a random `__Host-cinnabar_auth_flow` handle. Email transactions expire after
  one hour and OAuth transactions after ten minutes. The exact
  `${APP_ORIGIN}/api/auth/callback` claims the row before exchanging the one-use
  code, creates the opaque application session, and redirects with only a fixed
  success/error marker; provider tokens and verifier material never enter
  browser storage. Supabase/GoTrue remains the Google OAuth client and owns
  provider state, OIDC nonce, and ID-token validation. The Cinnabar flow handle
  is only a login-transaction binding, not an alternate OAuth `state`.
  The claim-before-exchange design intentionally rejects replay. If the
  upstream exchange or durable session creation has an uncertain/lost response,
  the claimed transaction cannot be retried and the user must restart login;
  no recovery is claimed. Payment flags remain hard off.
- Added scanner-resistant email verification without weakening the PKCE
  transaction boundary. The Magic Link template shows the six-digit
  `{{ .Token }}` and places `{{ .TokenHash }}` only in a URL fragment pointing
  at the exact email confirmation landing; it contains no ConfirmationURL or
  third-party resources. Manual OTP and TokenHash verification both require the
  original flow cookie and a same-origin double-submit guard. The landing's
  GET/HEAD never claims or verifies; a valid GET only reads the transaction and
  rotates verification CSRF, while an explicit button POST claims once before
  `verifyOtp`. All failures terminate that flow and require a new start. Local
  endpoint/template contracts also pin the installed auth-js `/verify` request
  shapes. The Dashboard template and settings are not deployed here, and real
  compatibility between the initial PKCE challenge and direct `/verify` still
  requires isolated staging evidence.
- Expanded the deterministic auth failure matrix to 11 auth-related files /
  164 focused tests. Opaque-cookie and permitted Bearer authentication now
  validate access tokens through a bounded Supabase `/auth/v1/user` request
  with an aborting eight-second timeout and incoming-request cancellation.
  Only explicit `401`/`403`, null user, or opaque ID mismatch is credential
  rejection: it returns `401`, and the opaque path CAS-revokes the exact
  session/version. Provider `429`, every other non-`200`, invalid JSON,
  malformed non-null user data, network failure, abort, and timeout return
  `503 AUTH_UPSTREAM_UNAVAILABLE` without revocation, `last_seen_at` mutation,
  or SID clearing. Successful provider verification must precede the throttled,
  version-conditional last-seen write. The same classification applies to
  Bearer validation, and explicit IPv4/IPv6 loopback Supabase URLs remain
  usable for local development. The matrix also retains legacy logout, dual
  migration, 20-way refresh winner adoption, stale leases, lost CAS responses,
  retryable-versus-reauth migration cleanup, cookie parsing/expiry, and
  cookie/Bearer conflict coverage. Its AES-GCM fixtures use production-shaped
  keys and purpose-bound AAD.
- Added a fail-closed database Release Proof runner for the seven ordered
  `20260723` migrations. It accepts only explicit
  local/development/test/staging/preview environments, rejects production-like
  target names and unallowlisted connection options, clears caller
  `PGOPTIONS`/service settings, and requires exact database name, `postgres`
  owner, primary server, disposable confirmation, and a database-side
  `cinnabar.environment` marker before any mutation. The parsed URI is
  converted to temporary `PG*` environment variables and restored afterward,
  so credentials never enter a `psql` child-process command line. `Fresh`,
  `Upgrade`, and `VerifyOnly` modes make the migrations' one-shot assumption
  explicit and reject partial/unexpected baselines. Fresh/upgrade application
  uses one transaction in dependency order; all SQL suites and the
  two-connection credit race then run, producing only a sanitized JSON summary.
  Added opaque-session SQL lease/ACL/cascade checks, login-transaction
  schema/TTL/one-use/ACL checks, and per-run concurrency subjects. PowerShell
  parsing, local release-contract assertions, and a credential-leak failure
  exercise pass. Cross-platform hardening removed embedded Windows path
  separators, made nested `PG*` restoration reentrant, normalized native
  `psql` exit handling across PowerShell versions, made concurrency cleanup
  explicit, and preserved sanitized stdout when summary-file writing fails. No
  database Release Proof is claimed on this workstation because `psql`, Docker,
  and Supabase CLI remain unavailable.
- Converted the former deployment-mirror workflow into a candidate verification
  workflow.
  Pull requests, manual dispatches, and `main` pushes now install from the lock
  file and run app lint, the full Vitest suite, production build, and a
  candidate-range whitespace check. Both Future Report payment flags are
  explicitly false and auth remains in `legacy` for the CI build. A second
  independent job is configured to pin Supabase CLI `2.84.2`, install
  the PostgreSQL client, start a fresh isolated Supabase database on Ubuntu,
  mark it disposable, and run the seven-migration proof in `Fresh` mode. It
  initializes and always uploads only the sanitized JSON summary and always
  destroys the database without backup. The workflow does not push to a mirror
  or deploy Vercel. Static contracts cover both jobs and artifact isolation.
  GitHub Actions is currently disabled, so this remains configured behavior,
  not hosted execution or database evidence.
- Added a Vercel security-header baseline in report-only observation mode:
  CSP Report-Only, HSTS, no-sniff, frame denial, referrer controls, and a narrow
  Permissions Policy. GA4 initialization moved from inline HTML into the local
  application bundle, removing the need for an inline-script exception.
  `/api/csp-report` accepts legacy CSP and Reporting API shapes but records only
  allowlisted directive/disposition and host-level fields. It rejects methods,
  malformed/empty input, and bodies over a streamed 16 KB byte cap, with a
  documented best-effort warm-instance rate limit. Contract tests cover header
  intent, absence of the inline bootstrap, sanitization, both report shapes,
  400/405/413/429 behavior, and the byte cap. CSP remains report-only until real
  GA4, Supabase, and PayPal sandbox reports establish the enforcement allowlist.
- Added the staged opaque-session BFF boundary without enabling payments or
  credit writes. `POST /api/auth/migrate` validates and rotates the current
  Supabase session once, then replaces browser token authority with a
  `__Host-cinnabar_sid` HttpOnly/Secure/SameSite=Lax cookie. The server stores
  only SID/CSRF hashes plus purpose-bound AES-GCM ciphertext for Supabase
  access/refresh tokens and the recoverable CSRF secret. `GET
  /api/auth/session` hydrates a minimal user/CSRF/session-version shape and
  transparently refreshes provider tokens under a durable database
  lease/version. Reliability hardening makes that lease non-stealable at the
  same token version, gives the provider call an aborting 8-second timeout
  inside a 30-second lease, and lets competitors wait up to 10 seconds with
  jitter. Commit/release/revoke all compare session ID, expected version, and
  lease ID; a lost commit response reloads and adopts an advanced winner
  instead of revoking it. Migration now persists an encrypted `pending` row
  before provider rotation and CAS-activates it afterward. Only failures known
  to occur before rotation return `MIGRATION_RETRYABLE`; timeout, unknown
  provider outcome, or an uncommitted rotated token returns
  `MIGRATION_REAUTH_REQUIRED` and must force a fresh sign-in. `POST
  /api/auth/logout` revokes the row. Every authenticated
  POST requires exact `APP_ORIGIN`, `Sec-Fetch-Site: same-origin`, and
  session-bound `X-CSRF`. `AUTH_MODE=dual` prefers the cookie and rejects
  cookie/Bearer identity conflicts while retaining a read-only credit-account
  rollback path. Future Report payment APIs now also require
  `AUTH_MODE=opaque`; legacy/dual modes remain payment-disabled even if their
  payment flag is accidentally enabled. The default `legacy` deployment mode
  remains a real compatibility
  mode: it hydrates/listens to the existing browser Supabase session, keeps its
  automatic refresh, and supplies an in-memory Bearer only to rollback-compatible
  credit reads. `dual` migrates and clears browser token storage only after the
  BFF has committed the session; new login in `dual`/`opaque` uses the complete
  server-owned PKCE path and does not construct a browser Supabase client. If
  BFF logout loses its in-memory CSRF
  value, it rehydrates the cookie session before revocation and never shows a
  false signed-out state while the HttpOnly cookie remains live.
- Added the dormant PayPal webhook and recent-purchase reconciliation
  boundaries without enabling payments or touching the credit ledger. The
  webhook requires `PAYPAL_WEBHOOK_ID`, uses PayPal's official
  verify-webhook-signature API, deduplicates signed deliveries by event ID, and
  allowlists capture completed/refunded/reversed/declined plus customer dispute
  created/updated/resolved events. Capture, order, and dispute state are
  re-fetched before the database's monotonic RPC can update payment status;
  dispute events read `resource.dispute_id` and lay an irreversible tombstone
  before or after completion. Unknown and duplicate events are acknowledged,
  while missing local linkage or lagging authoritative state remains retryable.
  A separate `CRON_SECRET`-protected endpoint uses a persistent keyset cursor
  and PayPal 429 backoff so bounded runs rotate through backlogs larger than one
  invocation, returning only fixed aggregate counts. Mock and
  migration contract tests cover these boundaries; no PayPal sandbox/live or
  applied-Supabase validation was available.
- Removed browser authority over paid Future Report content. Capture and access
  now accept only exact birth/persona fields; arbitrary facts, requested years,
  coordinates/timezones, prompt fields, invalid dates/gender, and injected
  birthplace text are rejected. A server-only helper resolves canonical bundled
  place/timezone data, applies host-timezone-independent true solar time, casts
  the iztro chart, builds natal/yearly facts, enforces the tier's 2/5-year set,
  and emits the durable snapshot/fingerprint. The browser no longer hashes or
  submits chart facts. An independent migration replaces the old dormant
  browser-facts JSON constraint and requires its nested snapshot fingerprint to
  match the indexed column. BirthForm now explicitly records whether time is
  known or approximate; only known time emits a Birth Hour fact. Capture
  rejects under-18 requests before PayPal moves money. Focused tests cover tier
  escalation, exact root schemas, input tampering and boundaries, cross-host-TZ
  solar-time determinism, exact place matching, fingerprints/nested shape, and
  the unreliable-birth-time no-hour-pillar rule. Payments remain fail-closed
  pending end-to-end deployment verification of all payment safeguards.
- Replaced the browser-authoritative Future Report PayPal MVP with a signed-in,
  server-verified purchase flow. The browser now sends only tier + stable
  attempt ID; server APIs select $9.90/$14.90 from a trusted integer-minor-unit
  catalog, create/capture PayPal Orders v2 with stable request IDs, then
  re-fetch and verify `COMPLETED` status, USD amount, purchase reference, and
  completed capture before granting access. A separate
  `future_report_purchases` migration persists payment evidence, the complete
  generation snapshot before capture, generation lease/state, and final report.
  Refresh, Start Over, and generation failure therefore recover from the
  signed-in account, while retry uses the same purchase ID and never captures
  again. Added focused client, paywall recovery, and PayPal failure-path tests.
  This flow does not read, spend, recharge, or modify the credit ledger.
  Follow-up hardening now keeps the feature fail-closed by default (exact
  matching client/server enable flags are required), scopes async commits by
  owner + access token, clears paid cache on account switch, and recovers only
  a report whose SHA-256 chart fingerprint matches the current chart. PayPal
  validation also requires returned order ID, `CAPTURE` intent, configured
  merchant payee, and a final completed capture; only
  `ORDER_ALREADY_CAPTURED` receives 422 idempotent recovery, while
  `INSTRUMENT_DECLINED` returns a stable code for `actions.restart()`.
  Database RPCs/triggers enforce monotonic states, terminal refund/dispute,
  three open orders per user/hour, three generation attempts with backoff, and
  sensitive-content purge on account deletion.
- Added the signed-in credit wallet UI without coupling it to checkout or
  product pricing: the header exposes the current balance and an accessible,
  mobile-first dialog with the eight most recent activities (date, action, and
  signed amount). The browser normally authenticates
  `GET /api/credits/account` with the opaque same-origin cookie; true legacy
  mode adds only its in-memory Supabase access token for rollback compatibility.
  It consumes the API's safe activity shape and never queries raw ledger
  metadata/business keys. The portal dialog
  makes the application root `aria-hidden` + `inert`, traps focus, and restores
  background state/focus on Escape, backdrop close, or cleanup. Loading, empty,
  retryable failure, and migration-not-yet-deployed states stay contained
  inside the wallet so auth, free readings, and the paywall continue to work.
  Signed-out users keep the existing sign-in affordance and do not see the
  wallet. GA4 `view_wallet` sends no parameters or PII. Added focused API
  client tests and jsdom behavior coverage for dialog isolation/closing/focus,
  retry, empty data, analytics, and account switching.
- Added the versioned, server-owned credit catalog (`2026-07-23.v1`): packs are
  100/$4.90, 250/$9.90, and 550/$19.90; registration grants 30; Love Pattern
  costs 100; Year Flow Snapshot costs 180; credits never expire. The public
  catalog endpoint exposes only this non-secret contract. The authenticated
  account endpoint validates the Supabase Bearer token and reads balance plus a
  sanitized, cursor-paginated ledger through a user-scoped publishable-key
  client and RLS, never a request-supplied user ID or service role. A non-routed
  server helper derives debit amounts from product IDs and pins catalog metadata
  for future transactional product endpoints; no PayPal or Love generation was
  added. Security review removed browser whole-table ledger reads:
  `credit_activity` exposes only id/amount/type/time while ownership,
  idempotency keys, and metadata stay private; the balance view no longer
  exposes `user_id`. The account API accepts only UUID/ULID request IDs, emits
  stable non-vendor errors/log categories, enforces canonical bigint
  cursor/decimal limit syntax, and applies a documented best-effort warm-Edge-
  instance rate limit with `Retry-After`. Added focused catalog/auth/API/ACL
  trust-boundary tests.
- Hardened auth session reliability: failed initial session hydration now
  resolves to an initialized, signed-out state with an observable error instead
  of leaving the header stuck loading; failed sign-out preserves the real
  session in the UI, while confirmed sign-out clears it. The sign-in modal now
  describes account access without promising chart/card persistence.
- Added the backend credit-accounting foundation without coupling it to PayPal
  or product pricing: an append-only `credit_ledger` is the balance source
  (`profiles.credits` remains deprecated at 30 for rolling compatibility),
  existing/new users receive one idempotent 30-credit
  registration entry, and `spend_credits` performs service-role-only,
  business-key-idempotent atomic debits while locking per user and rejecting
  negative balances. Authenticated clients have column-level SELECT only for
  the four display-safe ledger fields, consumed through the owner-filtered
  `credit_activity` view; `account_id`, `user_id`, `business_key`, and
  `metadata` remain unreadable. The balance view exposes only the aggregate.
  Clients cannot write or execute the debit RPC.
  Account deletion pseudonymizes retained entries by clearing owner `user_id`
  through a tightly constrained FK action. Added rollback-only SQL contract
  tests plus a deterministic two-connection concurrency test under
  `supabase/tests/`. The migration requires the Supabase `postgres` owner;
  `service_role` has only debit-RPC execution and no direct ledger write grants.
- Added "Continue with Google" to the sign-in modal: a reusable, config-driven
  `SocialSignInButton` (official Google G logo; Facebook config reserved but
  not yet wired) sits above the email magic-link form with an "or" divider.
  `useAuthStore.signInWithOAuth(provider)` calls
  `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: origin } })`
  with its own loading/error state; on return the session, header, and
  auto-provisioned profile work unchanged (no DB change). Supabase secret stays
  server-only; DeepSeek/PayPal/paywall untouched.
- Added Supabase user accounts (auth + profiles only; no credits-spending
  logic yet). Frontend client `app/src/lib/supabase.ts` uses the public
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (guarded — degrades to
  signed-out when env is absent). `useAuthStore` hydrates the session and binds
  the auth listener; passwordless magic-link login via `signInWithOtp`. Header
  shows a Sign in button, or the user's email + Sign out once authenticated;
  the session persists across refresh. Server-only admin helper
  `app/api/_supabase-admin.ts` (underscore = not a Vercel route) reads
  `SUPABASE_SECRET_KEY` for future privileged writes and is never imported by
  the client. DB schema lives in `supabase/migrations/` (run manually in the
  SQL Editor): `profiles` table (id→auth.users, email, created_at, credits
  default 30, unique referral_code, referred_by), a `handle_new_user` trigger
  that auto-provisions the row with a unique referral code, and RLS allowing a
  user to SELECT only their own row with no client writes (all writes go through
  the server secret key). DeepSeek/PayPal/paywall untouched.
- Added Soul Card share fission + email capture on one shared backend:
  `api/subscribe` (Vercel Edge Function) validates the email, reads the
  `MAKE_WEBHOOK_URL` secret server-side only, forwards
  `{email, source, created_at}` to Make, and adds body-size + per-IP rate
  limiting. `EmailCapture` is a reusable client component (source-tagged,
  compliant copy) placed in three spots: the reading panel (`reading`), an
  exit-intent modal (`exit_intent`, once per session), and the Soul Card
  unlock (`soul_card`). The `SoulCard` renders a vertical html2canvas image
  from the already-computed chart (Life Palace star + element accent + 2–3
  keywords via deterministic maps in `lib/soul-card.ts`, brand + URL + QR),
  with a locked "hidden strength" teaser that unlocks optimistically on
  share or email — the teaser is never the paid report and pricing/paywall
  are untouched. New GA4 events: `soul_card_view`, `share_click(platform)`,
  `email_capture(source)`. DeepSeek/PayPal keys and the paywall are untouched.
- Added Google Analytics 4 (Measurement ID `G-NB3DMJB5NB`, a public value):
  gtag.js loads in `app/index.html` with `send_page_view:false`; a thin
  guarded wrapper (`app/src/lib/analytics.ts`) forwards manual SPA page_views
  and custom events. Because the app has no router, `App.tsx` fires `page_view`
  on every tab change (chart/compatibility/share-card virtual paths). Custom
  events: `view_landing` (BirthForm mount), `start_reading` + `complete_reading`
  (AIInterpretation), `view_paywall` + `begin_checkout` + `purchase_success`
  (FutureReportPaywall; `purchase_success` carries value/currency/tier/
  transaction_id, wired via a new `onInitiate` hook in `paypal.ts`). No secrets
  touch analytics — DeepSeek/PayPal credentials remain server-side only.
- Pricing/PayPal follow-up: raised the 1-Year Forecast to $9.90 (5-Year stays
  $14.90); added a "just $2.98/year — best value" badge on the 5-Year card
  (computed from `TIER_PRICES`, not hardcoded); forced the PayPal JS SDK to
  `locale=en_US` (currency stays USD) so the buttons and checkout popup
  render in English regardless of the visitor's country/browser locale.
- Added a paywall below the free reading: "Unlock Your Future Report" with
  1-Year ($6.90) and 5-Year ($14.90, "Most Popular", gold-bordered) tiers,
  checked out via PayPal Smart Payment Buttons (`app/src/lib/paypal.ts`,
  client-side createOrder/capture — the standard MVP integration). On
  approval, a persona-aware Paid Future Report streams from the existing
  `/api/interpret` proxy, grounded in new year-by-year Liu Nian facts
  (`buildYearlyChartFacts` in `app/src/lib/chart-facts.ts`) and the section-5
  Paid Future Report prompt (`buildFutureReportPrompt` in `ai-prompts.ts`;
  1-year tier covers this year + next year only, 5-year covers the full
  span). The report is cached in `useContentCacheStore.futureReport` so it
  survives tab switches, shows "✓ Purchase confirmed — Your Future Report"
  with a Print/Save button (`window.print`), and cancel/error states show a
  friendly retry notice without touching the free reading. Fixed a
  pre-existing ~3px mobile overflow in the natal chart's palace grid
  (`ChartDisplay.tsx`, tighter gap/padding on the smallest breakpoint only)
  found while verifying the new paywall on mobile.
- Review feedback round: birthplace matching now accepts pinyin ("Zhu Zhou" /
  "zhuzhou" / "ZHUZHOU" all match 株洲, shown as "Zhuzhou") via pinyin-pro, and
  supports ~230 major world cities (`app/src/lib/world-cities.json`) with
  DST-aware true-solar-time correction using each city's IANA timezone through
  the built-in Intl API — no timezone library. Unmatched cities degrade
  gracefully with friendly copy. Placeholder now "e.g. New York, London, Tokyo".
- Rebranded the site as Cinnabar ("Eastern Astrology, in English"): full English
  UI, new Midnight Indigo / Cinnabar Red / Imperial Purple / Celestial Gold /
  Parchment palette, English fonts, and English chart terminology via a new
  glossary layer (`app/src/lib/ziwei-glossary.ts`) with coverage tests.
- Replaced the client-side multi-provider LLM layer with a Vercel Function
  (`app/api/interpret.ts`) proxying DeepSeek; `DEEPSEEK_API_KEY` is read
  server-side only and the user-facing API key settings panel was removed.
- Rebuilt AI readings on an English prompt system (base system prompt, Scholar /
  Old Sage persona toggle, free-reading and compatibility templates) grounded in
  a generated English CHART FACTS block.
- Hid Yearly Fortune and Life K-Line from navigation while their original
  mixed-language and LLM-bound surfaces were not product-ready.
- Restored the deterministic path as the English Life Timeline: a first-class
  desktop/mobile tab with local cycle generation, a year selector, scrollable
  candle chart, translated cycle/transformation labels, and Career/Wealth/
  Relationships/Well-being detail. The default range is current age minus five
  through plus 25 years; the optional age 1–100 full model is explicitly
  described as ten decadal cycles rather than a lifespan estimate. Yearly
  Fortune remains hidden.
- Pointed `package-lock.json` resolved URLs at registry.npmjs.org (previously
  registry.npmmirror.com, which some build environments block).
- Added visible GitHub repository and MIT License links to the app shell (label
  since updated to GPLv3).
- Added true solar time correction support.
- Added free-text birthplace matching.
- Added local city and region coordinate dataset from `88250/city-geo`.
- Added Vercel Analytics.
- Historically used a GitHub Actions mirror-sync path; on 2026-07-23 it was
  superseded by the direct `qq314134306/cinnabar`-to-Vercel integration. The
  retained workflow now performs candidate verification only, and the old
  mirror or its credential is not a current deployment dependency.

## Current Documentation Task

Build a durable development documentation system so new sessions can understand
the project quickly without rediscovering context. Documentation must be updated
with each meaningful code change. GitHub issue and pull request templates now
extend this rule to incoming work and review.

## Known Verification Baseline

Previously passed:

```powershell
cd app
npm run lint
npm run test
npm run build
npm run test -- sync-zwknows
```

Known build note: Vite may report a large chunk warning. That warning was already
known and is not by itself a failure.

Full local verification on 2026-07-23 passed `npm run lint`, all 43 Vitest
files / 363 tests in three consecutive full-suite runs, `npm run build`
(including the root-referenced strict API project), a direct `tsc -b`,
production and full-tree audits at zero after a clean `npm ci`, `actionlint`
v1.7.12, PowerShell AST parsing for all Release Proof scripts, the sanitized
no-`psql` failure exercise, and `git diff --check`. The existing large-chunk
warning remained non-fatal. These are local mock/contract/static checks, not a
hosted database run, deployment proof, or Supabase/PayPal/other provider proof.

The current cumulative local baseline passed 60 Vitest files / 609 tests in
the latest full-suite run. It includes the Life Timeline navigation, focused
range, full ages 1-100 model, and lifespan-disclaimer contracts; the symmetric
local Compatibility model plus its default-off-AI interaction contract; the
deterministic local Your Chart snapshot and default-off-AI presentation; real
PowerShell AST parsing for every workflow `pwsh` block; the exact 12-Function
Hobby budget and auth-router contracts; the public-AI browser/server
fail-closed gates; and the broader auth, payment, subscription, database-proof,
and reading suites. `npm run lint`, `npm run build` with Vite 7.3.6, direct
`tsc -b`, a moderate-threshold audit with zero findings, the secret-pattern
scan, and `git diff --check` passed. Desktop and 390-by-844 Chrome acceptance
also covered both timeline ranges, all 100 full-model year options, intentional
chart scrolling, and a clean current-chunk warning/error log. The only build
note is the known non-fatal chunk-over-500-KB warning. This remains local
mock/contract/static evidence, not a hosted Actions run, database execution,
deployment, or Supabase/PayPal/DeepSeek/provider proof.

The candidate-verification workflow contract has additionally passed its
focused tests, and the workflow YAML was parsed locally. The database runner's focused
portability contract has passed six tests plus Windows PowerShell AST,
nested-environment restoration, and sanitized no-`psql` failure exercises. A
real GitHub-hosted Actions run remains required before treating the Linux Fresh
proof as operational. Actions is currently disabled for the repository, so no
hosted run or artifact exists yet.

## Open Risks

- Vercel's direct Git binding is authenticated and production currently points
  to source commit `104de00`, but the uncommitted candidate has reached neither
  hosted verification nor Vercel. Because GitHub Actions is disabled, the
  candidate workflow cannot provide a hosted code/database gate. A direct
  `main` push may still start a Vercel deployment independently, so release
  process or repository protection must prevent unverified pushes from being
  treated as approved releases.
- Vercel exposes the existing sensitive variables to Preview as well as
  Production. Git Fork Protection is enabled; retain it, do not approve
  untrusted fork previews, and use a trusted branch for the candidate. Auth
  Preview validation additionally needs a fixed Branch URL or dedicated domain,
  a branch-scoped exact `APP_ORIGIN`, a redeploy after configuration, and
  preferably a separate preview Supabase project because Site URL is
  project-wide.
- The public subscription limiter is deliberately warm-isolate-only. A real
  Vercel deployment must confirm that its edge overwrites the single
  `X-Forwarded-For` value, and Make delivery must be observed without redirects.
  Multiple isolates can still reset or multiply the local windows; persistent
  distributed abuse/cost control requires separately designed infrastructure
  before the endpoint is treated as globally rate-limited.
- Public AI is default-off and has no external operational proof. The seventh
  quota migration and RPC have not been applied to an external disposable or
  hosted Supabase project; no real Vercel/DeepSeek SSE stream, abort behavior,
  UTC quota rollover, cost alert, or limit response has been observed. Keep
  both public-AI enable flags false/unset until migration evidence, preview
  streaming, and owned cost monitoring exist. Local tests do not prove vendor
  behavior or cost containment.
- The candidate workflow is present but dormant while GitHub Actions is
  disabled. Repository secrets are empty, but the current verification jobs do
  not require deployment or provider credentials. Explicitly enable Actions,
  run the two jobs, and inspect the sanitized database artifact before claiming
  hosted evidence.
- CSP is observation-only. PayPal's browser SDK may require additional
  environment-specific script, frame, image, or connection hosts not yet seen
  in a real checkout. Do not replace `Content-Security-Policy-Report-Only` with
  an enforcing policy until production/preview reports are reviewed and the
  complete PayPal sandbox flow passes under the candidate policy. The report
  endpoint's in-memory limiter is abuse reduction for one warm Edge isolate,
  not a distributed quota.
- `20260723040000_opaque_auth_sessions.sql` has not been applied to a live or
  disposable Supabase project in this environment. Keep `AUTH_MODE=legacy`
  until the migration, a versioned 32-byte `SESSION_ENCRYPTION_KEY`, and exact
  `APP_ORIGIN` are deployed; then exercise `dual` pending migration, refresh
  concurrency, logout, expiry, and cross-user cookie/Bearer conflict before
  switching to `opaque`. Mock/contract/migration tests pass locally, but no
  live provider refresh rotation was available. The new `/auth/v1/user`
  rejection-versus-unavailability matrix is locally verified, including
  preservation of the SID and idle timestamp on transient failure, but no
  deployed Supabase timeout, abort, recovery, or provider-status behavior has
  been observed.
- `20260723050000_auth_login_transactions.sql` and the server PKCE routes have
  not been applied or exercised against a disposable/live Supabase project or a
  Vercel preview. Keep `AUTH_MODE=legacy` until the seven-migration Release Proof,
  exact callback allowlist, email and Google callback, cookie behavior, and
  provider exchange are verified end to end. A lost or uncertain response after
  a transaction is claimed requires a fresh login; completed-SID recovery is
  not implemented. The scanner-resistant landing/manual OTP template exists
  locally, but production readiness still requires deploying it (or an
  equivalent) in the Supabase Dashboard with exact Site URL, OTP expiry no
  greater than one hour, and tracking disabled. Both email verification paths
  require the initiating browser's flow cookie; cross-device email opens must
  return to that browser for OTP entry. Initial PKCE-challenge compatibility
  with direct `/verify` remains unproven outside local contracts.
- `20260723010000_future_report_payments.sql` and incremental
  `20260723020000_paypal_webhook_reconciliation.sql` have not been applied in
  this environment, and no live/sandbox PayPal credentials were available for an
  end-to-end checkout. The feature remains disabled by default: do not set
  `ENABLE_FUTURE_REPORT_PAYMENTS=true` or
  `VITE_ENABLE_FUTURE_REPORT_PAYMENTS=true`. Server-side chart-fact
  reconstruction is implemented and locally verified, but enabling remains
  blocked until the complete signed webhook, payout-settlement reconciliation,
  and reconstruction flow is deployed and verified together. Mock tests cover
  kill-switch handlers, owner-switch races, chart fingerprints, capture retry,
  422 error classification, and order/status/currency/amount/payee/final-capture
  validation. The migration's exceptions view covers local drift only; its SQL
  behavior suite was added but could not run here because PostgreSQL tooling is
  unavailable.
- All PayPal-provider-facing routes now use Node rather than Edge. PayPal OAuth
  and business fetches have a 15-second hard deadline that also settles when an
  injected fetch ignores abort. Reconciliation now starts at most 40 purchase
  reads by default, stops launching new work after 210 seconds, reports the
  deadline exit, and advances its durable keyset cursor only after completed
  handling. This closes the local timeout/batch pre-enable blocker; real sandbox
  credentials, applied migrations, signed webhook delivery, and an observed
  end-to-end PayPal recovery/reconciliation run are still required before either
  payment flag may be enabled.
- The database suites require a disposable Supabase-shaped PostgreSQL instance.
  The release-proof runner now automates the ordered migration transaction, SQL
  suites, and two-connection concurrency check. GitHub Actions is configured to
  create that isolated Fresh database and retain a sanitized artifact, but it
  has not run here and no hosted run has yet been inspected. Supabase CLI,
  `psql`, and Docker remain unavailable on this workstation. `Fresh` still requires
  Supabase's built-in auth schema/roles and `gen_random_uuid()`, not vanilla
  PostgreSQL. `Upgrade` must run against a sanitized production-like clone
  containing only the profiles baseline; it deliberately rejects unexpected
  `profiles.credits` values and partial candidate state. Lock duration,
  realistic row volume, pooler behavior, and provider integration remain
  external staging evidence.
- `CLAUDE.md` was never byte-corrupted; the earlier mojibake observation came
  from Windows PowerShell 5's default display decoding. Its stale duplicate
  guidance has now been replaced by a minimal pointer to the `AGENTS.md`
  startup protocol and locked by a contract test. Keep it as a pointer rather
  than restoring an independent, potentially divergent project guide.
- The birthplace matching experience depends on the quality and coverage of the
  local coordinate dataset.
- Direct Vercel deployment is not currently proven to wait for the candidate
  workflow. `main` is unprotected, Vercel Deployment Checks are empty, and
  automatic custom-production-domain assignment is enabled. Until required
  GitHub checks plus Vercel Deployment Checks, or an exact-SHA manual-promotion
  policy, are enforced, a successful Vercel build is deployment evidence but
  not verification-gate evidence.

## Next Useful Work

- Explicitly enable GitHub Actions for `qq314134306/cinnabar`, run the
  candidate-verification workflow, require both jobs to pass, and inspect the
  sanitized database artifact. Do not claim hosted proof from workflow YAML or
  local contract tests alone.
- Protect `main` after both check names have registered, then either import them
  into Vercel Deployment Checks or disable automatic production-domain
  assignment and manually promote the exact verified SHA. Do not merge the
  candidate while GitHub and Vercel can independently race to Production.
- Configure the missing runtime settings in an isolated Vercel Preview, keeping
  a stable Branch URL plus branch-scoped exact `APP_ORIGIN`; prefer a separate
  preview Supabase project for direct email-link proof. Keep public AI
  fail-closed until its migration, quotas, streaming behavior, and owned cost
  controls are verified. Review and promote through the authenticated direct
  Vercel project only after the hosted candidate gates pass.
- Apply and exercise the public-AI quota migration on an isolated Supabase
  target, then verify a real default-off-to-enabled preview with DeepSeek
  streaming, disconnect cancellation, quota rollover/denial, and cost alerts.
- Run the database Release Proof first in `Fresh` mode and then against a
  sanitized production-like clone in `Upgrade` mode after setting its
  database-side non-production marker. The configured GitHub job may supply the
  Fresh evidence only after a real successful run and artifact inspection;
  retain both sanitized JSON summaries.
- In an isolated preview, verify the exact server PKCE callback for email and
  Google, including one-use/expiry/cookie/error cases, before changing
  `AUTH_MODE`; deploy the scanner-resistant template/settings and prove both
  same-browser manual-OTP and explicit-click TokenHash paths. Also exercise
  `/auth/v1/user` rejection, `429`/`5xx`, malformed response, timeout, and
  request-abort cases, then prove a transient failure recovers with the same
  SID without an intervening last-seen write.
- Confirm the direct Vercel deployment's source commit, functions, logs, and
  environment scope after the next approved `main` deployment; do not infer
  candidate-gate success from deployment success.
- Keep the rebuilt `CLAUDE.md` limited to the `AGENTS.md` startup pointer and
  retain its contract test whenever the agent onboarding structure changes.
- Add feature-level tests whenever true solar time or birthplace matching behavior
  changes.
- Use GitHub issue templates for new feature, bug, and internal development work.
- Keep the in-app open source links pointed at the source repository unless the
  public repository strategy changes.

[PROTOCOL]: Update this file after each feature, fix, release, deployment change,
or notable verification run.
