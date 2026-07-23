# Decisions

> L2 | Parent: `AGENTS.md`

## D001 - True Solar Time Uses Birthplace Matching

Users should not need to know longitude, latitude, or minute-level correction
details. The app accepts a normal birthplace text input and resolves it against a
local coordinate dataset. The UI should keep this approachable for ordinary users.

Consequence: improvements should prefer better matching, aliases, and clear
fallbacks over asking users for raw coordinates.

## D002 - Coordinate Data Is Local

The app uses local coordinate data from `88250/city-geo` instead of relying on a
network geocoding API for every chart calculation.

Reasons:

- Works without a third-party API key.
- Avoids leaking birth location queries to an external service.
- Keeps chart generation deterministic.

Consequence: dataset license and source attribution must remain tracked under
`docs/licenses/`.

## D003 - Deployment Uses the Canonical Repository Directly

`qq314134306/cinnabar` is the canonical development and deployment source.
Authenticated Vercel inspection confirmed a direct Git connection to its
`main` branch with `app` as the Root Directory. A separate mirror repository is
not part of the release architecture.

The release order is candidate pull request, required GitHub verification,
merge to protected `main`, direct Vercel Git build, then a checked promotion to
production. Vercel does not consume or establish GitHub proof by default. The
exact `main` Actions run and Vercel build may start in parallel, so Vercel
Deployment Checks or an equivalent staged/manual promotion must hold the
production domain until both jobs for that commit succeed and the sanitized
database artifact is inspected.

Consequence: do not create a mirror PAT, sync source to another repository, or
force-push a deployment branch. Protect `main`, require the candidate jobs
before merge, gate production promotion on the exact `main` commit, and use its
SHA to correlate GitHub evidence with the resulting Vercel deployment.

## D004 - Candidate Automation Is Source-Repository Scoped

Candidate automation belongs only to the canonical repository and needs no
deployment credential. Fork and manual runs may validate code, but they cannot
authorize a production merge or deployment. The existing workflow and tests
retain a legacy `sync-zwknows` name, but the workflow itself now contains only
`verify` and `database-proof`; it has no sync/deploy job and uses no deployment
secret.

Consequence: keep an exact canonical-repository guard where a hosted candidate
needs provenance, configure `verify` and `database-proof` as required pull-
request checks, and never grant the workflow credentials to update another
repository. The canonical fork's current disabled-Actions state and empty
secret set mean the ready workflow still has no hosted execution evidence.

## D005 - Documentation Is Part of the Deliverable

Every meaningful implementation change must update development documentation in
the same change set. This keeps agent context cheap and prevents project memory
from living only inside chat history.

Consequence: do not mark future work complete until the relevant docs are updated.

## D006 - GitHub Templates Enforce Development Discipline

GitHub issue and pull request templates are used to make scope, verification, and
documentation impact explicit before work is accepted.

Consequence: feature, bug, and task issues should identify documentation impact.
Pull requests must treat documentation updates as part of the same deliverable as
code and tests.

[PROTOCOL]: Add a new decision when a choice affects future implementation,
deployment, product behavior, or contributor workflow.

## D007 - Credits Use an Append-Only Server-Written Ledger

Credit balance is the sum of immutable `credit_ledger.amount` entries, not a
mutable field on `profiles`. Each user receives one 30-credit registration entry
under a deterministic business key. Debits use an idempotent, atomic database
function that locks the user's profile row, rejects insufficient funds, and does
not depend on any particular product price.

Consequence: browser roles may read only their own ledger and balance and have no
write/RPC permission. Only server code holding `SUPABASE_SECRET_KEY`
(`service_role`) may call `spend_credits`; it must provide a trusted user ID,
server-selected amount, and stable business key. Payment verification and
product pricing remain separate concerns. The deprecated `profiles.credits`
column stays temporarily at its seed value for rolling-deployment compatibility
but must not be read as a balance.

The migration must run as the standard Supabase `postgres` owner. It rejects any
other owner because its `SECURITY DEFINER` functions deliberately execute with
that narrowly allowlisted authority. Even `service_role` has no direct
INSERT/UPDATE/DELETE privilege on the ledger; it receives only EXECUTE on
`spend_credits`.

Account deletion retains financial entries under an immutable pseudonymous
`account_id` and uses the `auth.users` foreign key's `ON DELETE SET NULL` action
to clear `user_id`. The append-only trigger permits only that nested FK
pseudonymization update; it continues to reject direct updates and deletes.
Deleted-account entries therefore disappear from owner reads without destroying
ledger history.

Browser reads do not receive whole-table SELECT. They have column privileges
only for `id`, `amount`, `entry_type`, and `created_at`, consumed through the
security-invoker `credit_activity` view. `account_id`, `user_id`,
`business_key`, and `metadata` remain unreadable, and `credit_balances` exposes
only the owner-filtered aggregate without its user ID.

## D008 - Credit Catalog and Account APIs Are Server-Trusted and Versioned

The immutable `2026-07-23.v1` server catalog defines packs (100/$4.90,
250/$9.90, 550/$19.90), registration grant (30), product costs (Love Pattern
100, Year Flow Snapshot 180), and a never-expire policy. Currency is USD and
pack prices use integer minor units. Any contract change requires a new catalog
version.

Consequence: clients may display the public catalog but cannot choose debit
amounts. Server product flows resolve a product ID through the catalog and
record the product/catalog identifiers in ledger metadata. The account endpoint
resolves the opaque BFF cookie, with an explicit Bearer fallback only in
legacy/dual rollback modes, and uses the resulting Supabase JWT on a
publishable-key client. This preserves ledger/view RLS without service-role
access or a request-supplied user ID. There is no public standalone debit
endpoint: a future
generation endpoint must own delivery and the idempotent debit as one product
transaction. Payment verification remains separate and is not implemented here.
The read API is governed by `docs/dev/credits-api.openapi.yaml`; response changes
must remain backward compatible or receive a new contract/catalog version.
Caller request IDs are echoed only when they are valid UUIDs or ULIDs. Account
pagination uses canonical decimal syntax and a positive PostgreSQL bigint
cursor. Unexpected failures return stable public errors and logs contain only
allowlisted categories, never raw dependency diagnostics. The account read
limit is an in-memory, per-user best-effort guard inside each warm Edge isolate;
it emits `Retry-After` but is not a global quota, and auth plus RLS remain the
actual security boundary.

## D004 - English-Only Presentation Over a zh-CN Engine Core

The iztro engine keeps producing zh-CN star/palace/branch names internally, and
every string comparison in the codebase stays keyed on those zh-CN values. All
translation to English happens at the presentation layer through
`app/src/lib/ziwei-glossary.ts`, following the Cinnabar glossary (majors as
pinyin + archetype, palaces as "X Palace", Four Transformations as
Prosperity/Power/Fame/Obstacle).

Consequence: never switch the engine's output language; add or adjust English
labels in the glossary instead. A coverage test asserts every engine-emittable
star and palace name translates without CJK remnants.

## D005 - Server-Side LLM Key Via Vercel Edge Proxy

AI readings call `/api/interpret`, a Vercel Function that forwards to
DeepSeek (`deepseek-chat`) and streams SSE back. `DEEPSEEK_API_KEY` is read only
from the server environment. The former in-browser multi-provider layer and the
API key settings panel were removed.

Consequence: deployments must set `DEEPSEEK_API_KEY` in the Vercel project
environment. Local `vite dev`/`vite preview` do not serve the function; use
`vercel dev` to exercise AI readings locally.

## D006 - Future Report Payments Are Server-Verified and Recoverable

The browser may select only `1-year` or `5-year`. Authenticated server APIs map
that tier to integer minor-unit USD pricing, create and capture PayPal Orders v2
with stable business idempotency IDs, then re-fetch PayPal and require
`COMPLETED` status plus the exact amount, currency, purchase reference, and one
completed capture. The redirect/approval callback alone never grants access.

Before capture, the browser supplies only strict birth/persona fields. The
server resolves canonical bundled location/timezone data and true solar time,
regenerates the iztro chart, selects exactly the tier's 2/5 forecast years, and
persists its own versioned facts snapshot in `future_report_purchases`.
Coordinates, timezone, forecast years, facts, fingerprints, and prompt text are
never accepted from the browser. The verified purchase,
generation state, and final report survive refresh and Start Over. Generation
uses the purchase ID, is claimed idempotently, and can be retried after failure
without invoking capture again. This table and migration are intentionally
separate from `credit_ledger`; Future Reports do not spend or recharge credits.
Recovery is additionally scoped to a server-produced SHA-256 fingerprint of
the canonical birth/chart identity;
the account's latest unrelated report must never appear on a newly cast chart.
Owner/token snapshots guard every async commit, and an account change remounts
the paywall and clears the legacy in-memory paid-content cache.

The database owns the monotonic payment/generation state machine, terminal
`refunded`/`disputed` states, atomic generation claim, three-attempt retry quota
with backoff, and a three-open-orders-per-user/hour quota. Account deletion
purges chart fingerprints, generation facts, and report text while retaining
minimum PayPal accounting evidence.

Consequence: the feature is fail-closed. Unless the server has the exact
`ENABLE_FUTURE_REPORT_PAYMENTS=true` and the client build has the exact
`VITE_ENABLE_FUTURE_REPORT_PAYMENTS=true`, no paywall renders and every payment
API returns `503 PAYMENTS_DISABLED`. Server-side chart reconstruction removes
the browser-facts trust blocker, but do not set either flag until the complete
signed webhook, payout reconciliation, and reconstruction flow is deployed and
verified end to end.

Webhook and bounded recent-purchase reconciliation safeguards now exist in
code, but have not been exercised against PayPal or an applied Supabase
migration. Webhook events never grant access from their body: the original
delivery headers and parsed raw event are sent to PayPal's official signature
verification API, and capture/order/dispute state is re-fetched before a
monotonic database RPC can update payment state. Refund, dispute, and denied
states are terminal. A dispute uses the re-fetched dispute's capture linkage
and becomes an irreversible tombstone even if it arrives before the local
completion write. Missing local linkage or lagging PayPal state fails retryably
instead of permanently consuming the event. Reconciliation persists a keyset
cursor so bounded runs rotate across the full recent backlog and persists
PayPal 429 backoff before resuming the same unverified purchase. Every PayPal
OAuth and business request has a 15-second hard timeout. Reconciliation starts
at most 40 purchase reads per default run, stops launching new work at its
210-second wall-clock budget, and advances the cursor only after a purchase is
fully handled so a deadline exit cannot skip an unverified record.

When those blockers are resolved, deployments also require
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`,
`PAYPAL_ENV=sandbox|live`, `SUPABASE_SECRET_KEY`, `DEEPSEEK_API_KEY`, and the
matching public `VITE_PAYPAL_CLIENT_ID`. Webhook/cron operation additionally
requires `PAYPAL_WEBHOOK_ID` and an independent `CRON_SECRET`. No credential
fallback is hardcoded.

## D009 - Browser Sessions Use an Opaque HttpOnly BFF Cookie

Supabase remains the identity provider, but browser-held Supabase access and
refresh tokens are a transitional login source rather than the durable
application session. In `AUTH_MODE=dual`, the browser submits its current
session once to `/api/auth/migrate`; the server validates the access token and
rotates the refresh token before storing both as purpose-bound AES-GCM
ciphertext. The browser then holds only a random
`__Host-cinnabar_sid; HttpOnly; Secure; SameSite=Lax; Path=/` cookie. SID and
CSRF values are stored only as SHA-256 hashes; the CSRF secret is additionally
encrypted so the session endpoint can return it after cookie authentication.

Every state-changing authenticated request checks the exact `APP_ORIGIN`,
requires `Sec-Fetch-Site: same-origin`, and verifies `X-CSRF` against the
session. Sessions have seven-day idle and 30-day absolute expiry, explicit
revocation (logout also attempts provider-local refresh-token revocation), a
minimal auth-event audit trail, and server-side Supabase refresh
rotation under a durable database lease/version. Refresh calls have an
aborting eight-second timeout inside a non-stealable 30-second lease;
competitors wait with jitter for up to ten seconds. Every commit, release, or
refresh-path revocation is bound to session ID + expected version + lease ID.
A failed commit reloads first: an advanced version is the winner and must be
used, never revoked by the old request. An abandoned same-version lease is
revoked rather than stolen because replaying its refresh token has an unknown
provider outcome.

Migration writes encrypted legacy credentials as a short-lived `pending` row
before asking Supabase to rotate. The rotated pair activates that exact row by
version/lease CAS. A confirmed pre-rotation failure may return
`MIGRATION_RETRYABLE`; a timeout, unknown outcome, or failed durable commit
returns stable `MIGRATION_REAUTH_REQUIRED` and must clear the legacy session
and require sign-in. Documentation and UI must never describe that latter case
as safely retryable. The versioned `SESSION_ENCRYPTION_KEY` never enters logs
or browser code.

Consequence: dual mode prefers the opaque cookie and rejects a simultaneously
supplied Bearer token for a different user. Bearer fallback remains only for
rollback-compatible credit reads and one-time migration. Payment APIs require
`AUTH_MODE=opaque` in addition to their independent disabled-by-default flags.
The browser magic-link/OAuth flow may bootstrap migration only in `legacy` or
for an existing dual-mode session. New login in `dual`/`opaque` follows D012's
complete server-owned PKCE boundary.

## D010 - Content Security Policy Starts in Report-Only Mode

Vercel applies a security-header baseline globally, but Content Security Policy
starts as `Content-Security-Policy-Report-Only`. GA4 initialization lives in the
local application bundle so the application does not require an inline-script
exception. CSP reports are accepted through a size-bounded, sanitized endpoint
that retains only directive/disposition tokens and URL hostnames.

Consequence: report telemetry may inform the final allowlist, but it is not an
authorization signal by itself. Do not switch to an enforcing CSP until preview
and production browser checks cover GA4, Supabase auth/session migration,
DeepSeek streaming, and the complete PayPal sandbox button/create/capture/
recovery flow. Full URLs, query strings, script samples, cookies, and request
content must never be logged by the CSP collector.

## D011 - Database Release Proof Requires a Marked Disposable Target

The seven `20260723` migrations are an ordered, one-shot chain rather than
idempotent setup scripts. Release verification therefore runs only against a
known Supabase-shaped baseline and never attempts to infer, repair, or reapply
a partially migrated database.

Consequence: `supabase/tests/invoke-release-proof.ps1` requires an explicit
non-production environment, disposable-target confirmation, exact database
name, the `postgres` migration owner, a primary server, and a database-side
`cinnabar.environment` marker before any write. Caller-controlled `PGOPTIONS`,
service settings, and unallowlisted connection options cannot supply or
redirect that check. The connection URI is parsed only in the parent script;
temporary `PG*` environment variables are restored after the run, and the URI
never enters a `psql` child command line. `Fresh` expects no application tables
and applies the profiles baseline plus all seven candidates; `Upgrade` expects
the profiles baseline and none of the candidates; `VerifyOnly` expects the
complete schema and reapplies no migration. Fresh and upgrade migrations
execute in one transaction and are followed by all SQL and concurrency suites.
A local contract test proves runner wiring, but only a sanitized JSON summary
from an actual disposable database run is release evidence.

## D012 - Server Login Uses a Database-Bound PKCE Transaction

New email and Google login in `AUTH_MODE=dual|opaque` is a server-owned
authorization-code + PKCE flow. A same-origin preflight creates a random
double-submit value: JavaScript echoes it in `X-CSRF`, while an HttpOnly,
Secure, SameSite=Strict `__Host-cinnabar_login_csrf` cookie binds the start
request. The start consumes that cookie and gives the browser only a random
HttpOnly/Secure/SameSite=Lax `__Host-cinnabar_auth_flow` handle. Its SHA-256
hash addresses a service-role-only `app_auth_login_transactions` row containing
the PKCE verifier as purpose-bound AES-GCM ciphertext. Email rows/cookies expire
after one hour; OAuth rows/cookies expire after ten minutes.

The only callback is the exact `${APP_ORIGIN}/api/auth/callback`. It accepts one
code, binds it to the flow cookie, atomically claims the unexpired transaction
before any upstream exchange, and creates an opaque app session. The redirect
contains only a fixed success/error marker; verifier material, Supabase tokens,
vendor errors, and account data never enter browser storage or the URL.
Supabase/GoTrue is the Google OAuth client and owns provider OAuth `state`, OIDC
nonce, and ID-token validation. Cinnabar must not override those parameters or
claim to validate them; its opaque flow handle is a login-transaction binding,
not a second OAuth `state`.

Consequence: replay and concurrent callbacks fail closed. Because the current
transaction is claimed before code exchange, an uncertain/lost exchange or
session-create response cannot be retried and requires the user to restart
login; completed-session recovery is not implemented and must not be claimed.

Email verification retains the same database PKCE transaction and provides two
explicit-user paths: manual six-digit OTP entry, or a scanner-resistant
confirmation page whose TokenHash exists only in the URL fragment. Passive
GET/HEAD never claims the transaction or calls Supabase. A valid landing GET may
only read the still-unclaimed transaction and rotate the pre-auth CSRF value;
the button's same-origin POST performs the one-use claim before `verifyOtp`.
Both paths require the original browser's opaque flow cookie. Cross-device
verification therefore means returning to that browser and entering the OTP,
not transferring transaction authority. Every failure after verification starts
is terminal and must return the user to a new email start.

Consequence: `supabase/templates/magic_link.html` (or content with the same
security properties) is deployment configuration, not merely a repository
example. The Supabase Dashboard Magic Link template must include both
`{{ .Token }}` and a fragment-only `{{ .TokenHash }}` link to the exact Site
URL; the Dashboard Site URL must equal `APP_ORIGIN`, OTP expiry must be no more
than one hour, and email link tracking must be disabled so the fragment link is
not rewritten. The installed auth-js version's manual and TokenHash `/verify`
request shapes are locally contract-tested. However, compatibility between the
initial PKCE challenge and direct `/verify` must be proven against an isolated
Supabase staging project; local request-shape tests are not live evidence. Keep
`AUTH_MODE=legacy`, CSP report-only, and both Future Report payment flags hard
off until the seven migrations, template configuration, and complete provider/
cookie/callback/verification paths pass staging.

## D013 - Direct Deployment Requires Source and Fresh-Database Proof

Every candidate pull request must pass two independent GitHub Actions gates
before merge. `verify` owns the locked Node install, lint, complete Vitest
suite, production build, whitespace check, payment flags closed, and
`AUTH_MODE=legacy`. `database-proof` owns a newly initialized disposable
Supabase database on Ubuntu, with Supabase CLI pinned to `2.84.2`, and executes
the Release Proof in strict `Fresh` mode. Protected `main` requires both checks;
after merge, the exact-commit workflow and Vercel's direct Git build may start
in parallel. Vercel Deployment Checks or an equivalent staged/manual promotion
must hold production until the two jobs succeed. No sync job or mirror
credential participates.

The database job initializes a sanitized failure JSON before setup. Release
Proof v2 binds every summary to the source commit, Actions run ID/attempt, the
ordered candidate-migration SHA-256 fingerprint, execution context, and exact
Supabase CLI version. Cleanup is a required evidence step: the job stops the
isolated database without backup and finalizes cleanup status before validating
and uploading the summary. The failure artifact is still schema-valid and
self-describing rather than an unbound placeholder. Database credentials,
PostgreSQL output, startup logs, identities, host, and URL are not artifact
content. PowerShell paths and native-process handling must remain portable
between local Windows and GitHub Linux/pwsh.

Consequence: workflow configuration and static contract tests are not proof
that the gate has executed. Actions are currently disabled on the canonical
fork and it has no Actions secrets, so the pure verification workflow is ready
but not operationally proven. A real pull-request and exact-main run must
succeed, both checks must be required by branch protection, production
promotion must wait for the exact-main result, and the sanitized artifact must
be inspected. A successful Vercel build cannot substitute for those controls.
The Fresh CI database does not replace an `Upgrade` run on a sanitized
production-like clone, provider/staging verification, or payment authorization.

## D014 - Root Build Owns API Type Safety and the Dependency Audit Gate

All production TypeScript, including Vercel functions under `app/api/`, belongs
to the root `tsc -b` build graph. `app/tsconfig.json` must retain its
`tsconfig.api.json` reference, and the API project must retain complete
production-source coverage, the shared Edge/Node runtime types, `noEmit`, and
the existing strict compiler options. The four API typecheck contracts protect
those invariants.

Consequence: an API type error is fixed at the real ownership, validation, or
serialization boundary. It must not be hidden by excluding a production file,
removing the root reference, adding unsafe `any`, or lowering strict compiler
settings. WebCrypto inputs in particular must have explicit owned
`ArrayBuffer` backing where required by the platform types, and external JSON
fields such as token expiry remain untrusted until validated.

The candidate `verify` job must run
`npm audit --audit-level=moderate` immediately after the locked `npm ci`
install. Moderate, high, and critical findings are release blockers. CI does
not mutate dependencies with `npm audit fix`, use `--force`, suppress findings,
or lower the threshold; remediation is a reviewed compatible dependency/
lockfile update followed by a clean install and the complete verification
baseline. The current clean-install baseline is zero vulnerabilities for both
production-only and full-tree audits.

Local build, audit, tests, workflow contracts, and `actionlint` prove the
repository configuration only. They do not constitute a hosted database run,
deployment result, or Supabase, PayPal, email, OAuth, or other provider proof.

## D015 - Public AI Accepts Only Server-Owned `reading.v1` Operations

`POST /api/interpret` no longer accepts browser-supplied chat messages. Its
complete public contract is the discriminated `reading.v1` union:
`natal`, `compatibility`, and `yearly`. The browser may submit only the
operation's allowlisted birth fields, Scholar/Old Sage persona where applicable,
and the requested yearly calendar year. It never submits prompts, messages,
chart facts, resolved birth time, coordinates, or timezone data.

The server validates the exact shape, enforces the shared 18+ rule, reconstructs
the canonical chart and operation prompt, and owns the fixed DeepSeek model,
`max_tokens`, and temperature policy. The unused Life K-Line path is not a
fourth AI operation; it now uses a deterministic local calculation.

Public AI is fail-closed. `ENABLE_PUBLIC_AI_READINGS` and
`VITE_ENABLE_PUBLIC_AI_READINGS` must both equal the exact string `true`, and
`APP_ORIGIN`, `DEEPSEEK_API_KEY`, Supabase service access, an applied quota
migration, `PUBLIC_AI_QUOTA_HMAC_KEY`, and positive IP/global daily limits
must all be valid. The database atomically claims both global and HMAC(IP)
buckets per UTC day. Raw IP addresses are neither persisted nor returned.
Claims are not refunded after an allowed request reaches upstream, which keeps
retry storms from bypassing cost limits.

Consequence: validation, disabled/configuration, quota, upstream, and timeout
failures return stable safe error codes/messages with `no-store`; DeepSeek error
bodies and response content never enter public errors or logs. The upstream
request has a bounded timeout and is cancelled when the browser disconnects.
Do not enable the flag until the seventh migration has external Supabase proof,
an actual DeepSeek stream has been observed in preview, and operational cost
alerts/limits are owned. Local tests prove only the repository contract.

## D016 - Provider Identity Rejection and Unavailability Are Different States

Every opaque-cookie or permitted legacy/dual Bearer authentication path
validates its access token against Supabase's `/auth/v1/user` endpoint before
trusting the returned identity. The request has an aborting eight-second
timeout, follows the incoming request's abort signal, and permits plain HTTP
only for the explicit local loopback hosts `localhost`, `127.0.0.1`, and
`[::1]`; non-loopback provider origins require HTTPS.

Only an explicit provider `401`/`403`, a successful response with a null user,
or an authenticated user ID that differs from the opaque row is authoritative
evidence of an invalid credential. Those cases return the stable application
`401`; the opaque path revokes only the same session/version by CAS, and the
session endpoint may then clear the SID cookie. A provider `429`, any other
non-`200`, malformed or invalid JSON, network failure, request abort, or timeout
is availability uncertainty instead. It returns `503` with
`AUTH_UPSTREAM_UNAVAILABLE`, does not revoke the opaque row, does not clear the
SID cookie, and must not be converted into an identity conflict.

`last_seen_at` is activity evidence, not an attempted-request timestamp. It may
advance only after provider identity validation succeeds, and the throttled
write must still compare the same session ID and version and require
`revoked_at` to remain null. An unavailable provider therefore cannot extend
idle lifetime or destroy a session. Bearer validation uses the same rejection
versus unavailability classification; it has no opaque row to revoke.

Consequence: clients may retry a transient `503` with the same SID or Bearer
credential. They must reauthenticate only after an authoritative `401`.
Repository tests prove this classification and mutation boundary locally, but
do not prove Supabase availability, latency, or provider behavior in a deployed
environment.

## D017 - Paid Generation Has a Bounded Delivery Lease

A paid Future Report may call DeepSeek only after the purchase row is
atomically claimed. That post-claim operation has one 45-second deadline
covering both `fetch` and complete response-body reading, follows the incoming
request abort signal, and accepts only JSON up to 512 KiB. Model, streaming,
token, and temperature settings are server-owned constants. Vendor status,
body content, network details, and parse errors never enter the public error or
log surface.

Any error after a successful claim attempts the existing
purchase-ID-plus-generation-start-time failure CAS. Cleanup has its own
seven-second abort deadline and does not inherit a cancelled browser signal.
Cleanup failure is logged only as a fixed event and cannot replace the original
safe `502`/`503` response or keep the request open indefinitely. A completed
stored report is returned before current DeepSeek configuration is required.

Consequence: the common upstream-hang path cannot hold a paid row in
`generating` until the database stale-claim window or silently consume all
automatic attempts. Platform hard termination and real vendor behavior remain
external risks, so payment flags stay off until sandbox/preview proof exists.

## D018 - Client Authentication Preserves Unknown Authority

Client session hydration is a resettable `Promise<void>` single-flight.
Provider `503`, transport failure, or malformed response means authority is
unknown, not signed out. Those outcomes preserve the current user, CSRF token,
session version, and paid-content cache, expose a retry state, and release the
single-flight for a later same-page attempt. Initial `authMode` is `null`; the
client must not guess `dual` or choose a login authority before hydration.

Only an explicit signed-out snapshot or authoritative `401` clears identity and
paid content. Monotonic state generations prevent an older hydration response
from replacing newer authentication, and listener generations prevent an
unsubscribed legacy Supabase callback from doing the same.

## D019 - Free Reading Cache Is Request-Keyed

The free natal-reading cache is the atomic pair of content and a stable key
derived from the exact serialized `reading.v1` request. Hydration occurs only
on initial component state and only when the stored key matches the current
birth input and persona. Retry first aborts the prior stream and clears both
cache fields, so an old reading cannot be revived or prefixed to new tokens.

Every streamed token, completion cache write, success analytic, and visible
error is guarded by the active controller, request key, and chart identity.
Persona, birth, or chart changes abort and clear the old context; persona
controls are disabled while loading. The cache remains in memory only and is
not a new persistence or token-storage surface.

## D020 - Cross-Tab Authentication Is a Revalidation Hint

Authentication changes are announced across same-origin tabs with the fixed,
versioned `cinnabar-auth-v1` BroadcastChannel protocol. Its only message means
"session may have changed"; it contains no user, email, SID, CSRF token,
provider token, session version, or paid content. A receiver never adopts or
clears identity from the message. It invokes the existing server session
hydration and accepts only that authoritative result.

Channel binding is module-idempotent, and focus plus visible-document events
provide recovery when BroadcastChannel is absent, blocked, or a notification
is missed. All three signals reuse the resettable authentication Promise
single-flight. Signals received while that Promise is in flight collapse into
one trailing revalidation, preventing the pre-signal response from becoming
the final state. Successful callback hydration, OTP verification,
legacy-to-BFF migration, and logout publish once; ordinary or remotely
triggered session initialization does not rebroadcast and therefore cannot
form a loop.

Consequence: transient `503`, transport, or malformed-response uncertainty
continues to preserve identity, CSRF/session version, and the paid-content
cache in every tab. Only an explicit signed-out snapshot or authoritative
`401` clears them. The channel is a freshness hint, never an authentication
authority or browser token store.

Legacy migration has a stricter token-rotation boundary than ordinary session
hydration. `MIGRATION_RETRYABLE` proves that rotation did not begin and
preserves the legacy session. `MIGRATION_REAUTH_REQUIRED`, or an unknown result
whose phase cannot be proven pre-rotation, destroys the uncertain browser token
family, commits signed-out, and broadcasts that terminal transition.

## D021 - Compatibility Streams Have Exact Request Ownership

Compatibility builds its request only through
`buildCompatibilityReadingRequest(person1, person2, persona)`. An active stream
is owned by its controller, serialized request key, and both input object
identities. Persona changes, either input change (including a same-key identity
replacement), retry, and unmount invalidate the controller reference before
aborting and clearing the old UI state.

Every token, completion boundary, and visible error must pass all ownership
checks. Request-defining persona, date, hour, and gender controls are disabled
while loading. Compatibility keeps no result cache and emits no analytics;
adding either would require a separate product/privacy decision and the same
request-key discipline.

## D022 - Email Capture Is a Bounded Public Relay

`POST /api/subscribe` accepts only exact `application/json` from the configured
same origin with `Sec-Fetch-Site: same-origin`. Its streamed request body is
capped at 2 KiB and must be exactly `{email, source}`. Email is
control-character-free, trimmed, lowercased, and bounded to 254 characters;
source is one of `reading`, `soul_card`, or `exit_intent`.

The Vercel-overwritten `X-Forwarded-For` value must be one canonical single
IPv4 or IPv6 address; comma chains and spoof-shaped values are rejected. A
bounded in-memory per-IP limiter, smaller missing-XFF/overflow buckets, and a
single-isolate global window limit abuse within one warm isolate. Exact body
validation runs first, and a request already denied by its IP bucket does not
consume the global allowance. This is deliberately only a best-effort brake:
it is not durable, coordinated across isolates, or evidence of a distributed
quota.

`MAKE_WEBHOOK_URL` permits only Make-owned `hook.make.com` or zoned
`hook.<zone>.make.com` hosts over default-port HTTPS. Explicit loopback HTTP is
available only with a localhost application origin in development/test.
Credentials, fragments, other ports/hosts, and redirects are rejected. A
three-second request-body read deadline actively cancels a stalled reader.
Separately, one ten-second deadline covers webhook fetch and response-body
cancellation even if an injected fetch ignores abort; incoming request abort
propagates through both phases. Only 2xx succeeds.
Vendor bodies, URL, email, IP, and transport details are never returned or
logged; responses use stable codes with `no-store`, and throttling includes
`Retry-After`.

Consequence: the endpoint is suitable as a bounded relay but not as a durable
subscription ledger or globally enforced abuse-control system. Production
delivery and distributed-rate evidence still require deployed Make/Vercel
observation; future persistence must be designed explicitly rather than
inferred from the warm-isolate map.

## D023 - Production Capabilities Roll Out Fail-Closed

Deployment configuration is recorded by variable name and scope only; secret
or environment values, project identifiers, and deployment identifiers never
belong in repository documentation. Authenticated inspection established that
Production and Preview currently contain `SUPABASE_SECRET_KEY`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `MAKE_WEBHOOK_URL`, and
`DEEPSEEK_API_KEY`. Presence does not prove that a value is current, correctly
scoped, or operational.

The same scopes currently lack `APP_ORIGIN`, `AUTH_MODE`,
`SESSION_ENCRYPTION_KEY`, `ENABLE_PUBLIC_AI_READINGS`,
`VITE_ENABLE_PUBLIC_AI_READINGS`,
`PUBLIC_AI_QUOTA_HMAC_KEY`, `PUBLIC_AI_DAILY_IP_LIMIT`, and
`PUBLIC_AI_DAILY_GLOBAL_LIMIT`. Rollout is therefore intentionally staged:

1. Enable candidate verification, require it before protected `main` merges,
   gate Vercel production promotion on the exact-main checks, and inspect the
   first hosted Fresh database artifact.
2. Configure exact origin and an explicit rollback-safe authentication mode.
   Apply and prove the session/login migrations, key custody, provider
   settings, and preview flows before advancing from `legacy` to `dual`, then
   `opaque`.
3. Apply and prove the public-AI quota migration, configure its HMAC key and
   positive limits, observe a real preview DeepSeek stream and cancellation,
   and establish owned cost alerts before setting the exact enable flag.
4. Observe Make delivery and Vercel forwarding behavior without treating the
   warm-isolate limiter as distributed proof.
5. Keep Future Report payments as the final rollout stage. Both payment flags
   remain disabled until their independent sandbox, database, webhook,
   reconciliation, opaque-auth, and recovery proofs pass.

Consequence: an existing provider credential or deployed function does not
enable its feature by implication. Missing gate/configuration evidence keeps
the corresponding capability off, and each stage requires retained external
evidence before the next risk boundary is enabled.

## D024 - Authentication Shares One Deployable Function

Authenticated inspection established that the deployment team uses Vercel
Hobby. For a direct non-framework `api/` project, each non-underscore TypeScript
entrypoint is a Function and the plan permits at most 12 per deployment. The
candidate originally had 20 and therefore could not produce a Preview.

All nine `/api/auth/*` paths now rewrite to `api/auth.ts`. That router accepts
only an exact allowlist, restores the original public pathname and query before
dispatch, and returns a stable `404` for unknown, nested, or ambiguous routes.
The existing endpoint implementations are underscore-prefixed
`_auth-route-*.ts` modules, so they remain independently testable without
becoming Functions. Exact callback/origin validation and every public URL stay
unchanged.

Consequence: the complete candidate uses exactly 12 deployable API entrypoints.
`tests/vercel-function-budget.test.ts` pins both that set and the rewrite; a new
entrypoint must first consolidate another domain or move to a plan with a
verified higher limit. Local counting and routing contracts make the candidate
eligible for a Hobby Preview, but only an actual Vercel deployment proves the
platform build.

Long-running, streaming, or PayPal-provider-facing routes are explicitly Node
Functions: `interpret.ts`, all four Future Report handlers,
`paypal-webhook.ts`, and `cron/paypal-reconciliation.ts`. Their route-specific
60-300-second limits are pinned in `vercel.json`; interpretation additionally
opts into request cancellation. Payment mutations intentionally do not opt
into platform disconnect termination. This avoids the Edge runtime's
25-second first-response constraint while retaining existing
application-level deadlines. The authenticated project has Fluid Compute
enabled, but a real Preview remains the runtime proof.

## D025 - Life Timeline Is a Focused Model, Not a Lifespan Prediction

The deterministic Life K-Line calculator is now exposed as Life Timeline. Its
default view covers the current age minus five through plus twenty-five years,
so the primary surface stays useful for present decisions. Users may opt into
the complete ages 1-100 model to inspect all ten decadal cycles.

The upper bound exists only to make the cycle model complete. Product copy must
state that it neither predicts lifespan nor implies that a person will live to
100. The timeline remains a local deterministic feature and must not acquire a
generic LLM request or a fourth public-AI operation.

## D026 - Compatibility Works Locally Before AI

Compatibility is a visible primary navigation surface, so the default-off
public-AI gate must not turn it into a dead end. The base product now generates
a deterministic local snapshot from both entered charts for communication,
shared direction, emotional rhythm, and resilience. The calculation is
symmetric, bounded, uncached, and requires no account, API, payment, or
analytics.

The UI labels this as a reflective model rather than scientific evidence,
relationship advice, or an outcome prediction. When public AI is enabled, the
existing compatibility stream remains an optional narrative layer with its
controller/request-key/input-identity ownership unchanged.

## D027 - Your Chart Works Locally Before AI

Your Chart is the primary product surface, so a disabled public-AI flag must
not reduce a completed chart to an availability message. After chart
generation, the default-off experience now derives a deterministic
current-model-year snapshot in the browser: an English chart identity, overall
score, and Career, Wealth, Relationships, and Well-being dimensions.

The snapshot requires no account, API, payment, cache, or analytics and is
explicitly a reflective model rather than scientific evidence or professional
advice. Public AI remains an optional narrative layer. Enabling or disabling it
must not be described as changing the underlying natal chart.
