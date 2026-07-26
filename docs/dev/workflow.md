# Workflow

> L2 | Parent: `AGENTS.md`

## Local Development

From `app/`:

```powershell
npm run dev
```

Use the local URL printed by Vite. If a frontend behavior changes, verify it in a
browser when practical.

## Verification

From `app/`:

```powershell
npm ci
npm audit --audit-level=moderate
npm run lint
npm run test
npm run build
```

`npm run build` runs root `tsc -b` before Vite. The root reference graph must
include `tsconfig.app.json`, `tsconfig.api.json`, and `tsconfig.node.json`, so
the command strictly type-checks browser source, every production Vercel API,
and build configuration. Do not validate only the browser/Vite project and
mistake that narrower result for the production build.

For candidate-verification workflow edits:

```powershell
npm run test -- sync-zwknows
actionlint .github/workflows/sync-zwknows.yml
```

For cross-tab authentication or Compatibility streaming edits, run the
focused regressions before the full suite:

```powershell
npm run test -- src/stores/auth.test.ts src/components/AuthControl.test.ts
npm run test -- src/components/match/MatchAnalysis.test.ts
```

The visitor-subscription route has been retired. Login email belongs only to
the authentication flow; do not restore a public marketing-email endpoint
without a new explicit product/privacy decision.

## Candidate Verification Gate

`.github/workflows/sync-zwknows.yml` is the candidate-verification workflow. It
contains no mirror push or Vercel deployment step. When GitHub Actions is
enabled, it runs for pull requests targeting `main`, pushes to `main`, and
manual dispatches. Two independent jobs must pass. The `verify` job uses the
locked `app/package-lock.json` and runs:

```text
npm ci
npm audit --audit-level=moderate
npm run lint
npm run test
npm run build
candidate-range whitespace check
```

The audit runs against the clean locked install and blocks moderate, high, and
critical advisories before source verification. CI must not run `npm audit fix`,
use `--force`, lower the threshold, or mutate the lockfile. Remediate findings
through a reviewed compatible dependency/lockfile update, then repeat the clean
install, full audit, tests, and build.

The verification job explicitly sets both
`ENABLE_FUTURE_REPORT_PAYMENTS=false` and
`VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false`, so CI cannot produce a
payment-enabled candidate. `AUTH_MODE` also stays at the rollback-safe
`legacy` default. Public AI is separately fail-closed because
both `ENABLE_PUBLIC_AI_READINGS` and `VITE_ENABLE_PUBLIC_AI_READINGS` are
explicitly `false`; each accepts only exact lowercase `true` when an approved
rollout is ready.

The parallel `database-proof` job starts a fresh isolated Supabase database on
`ubuntu-latest`, using `supabase/setup-cli@v3` pinned to CLI `2.84.2` plus the
Ubuntu PostgreSQL client. It initializes a schema-valid sanitized v2 failure
summary before external setup, marks the disposable database as `test`, and
runs the complete Release Proof in `Fresh` mode. Cleanup is finalized before
artifact validation/upload. Its only uploaded artifact is
`cinnabar-database-proof-summary.json` under artifact name
`cinnabar-database-proof`, retained for 14 days. Upload and
`supabase stop --no-backup` run even after failure.

The workflow defines a source-quality gate and an isolated fresh-schema proof,
but the workflow file and local contract tests are not execution evidence.
Authenticated inspection on 2026-07-23 found GitHub Actions disabled for
`qq314134306/cinnabar` and no Actions secrets configured. Actions must be
explicitly enabled before either job can produce hosted proof. After enabling
it, require both jobs to succeed and inspect the sanitized artifact before
accepting the candidate.

The direct Vercel Git integration is a separate path and may deploy a `main`
push without waiting for this workflow. The workflow does not exercise
production/provider credentials or deploy a Vercel preview. Make these checks
required through repository/release controls, or use an explicit manual
promotion process, before treating them as a deployment gate.

## Database Release Proof

The seven `20260723` migrations must run in timestamp order. They are single-use
migrations and are not safe to replay as setup scripts:

1. `20260723000000_credit_ledger.sql`
2. `20260723010000_future_report_payments.sql`
3. `20260723020000_paypal_webhook_reconciliation.sql`
4. `20260723030000_future_report_server_chart.sql`
5. `20260723040000_opaque_auth_sessions.sql`
6. `20260723050000_auth_login_transactions.sql`
7. `20260723060000_public_ai_quota.sql`

Run the proof only against a disposable Supabase-shaped database. Vanilla empty
PostgreSQL is insufficient because the tests require Supabase's `auth` schema,
`anon`/`authenticated`/`service_role` roles, and `gen_random_uuid()`. An
authorized database owner must first persist an exact non-production marker;
reconnect after setting it:

```sql
alter database postgres set "cinnabar.environment" = 'staging';
```

Keep the connection URL in a task-specific environment variable. Invoke the
script in the current PowerShell process so the URL is neither printed nor
placed on a newly launched PowerShell process command line:

```powershell
& .\supabase\tests\invoke-release-proof.ps1 `
  -DatabaseUrl $env:CINNABAR_TEST_DATABASE_URL `
  -Environment staging `
  -ExpectedDatabaseName postgres `
  -Mode Upgrade `
  -ConfirmDisposableDatabase `
  -SummaryPath "$env:TEMP\cinnabar-release-proof.json"
```

Modes are deliberately strict:

- `Fresh`: no `profiles` or candidate tables; applies the profiles baseline and
  all seven migrations.
- `Upgrade`: `profiles` exists and no candidate table exists; applies only the
  seven candidates. Use this on a sanitized production-like clone.
- `VerifyOnly`: all expected tables exist; reapplies no migration and reruns
  SQL/concurrency behavior.

The runner rejects production-like host/database names, unallowlisted URL
options, unconfirmed targets, database-name mismatch, a non-`postgres` owner,
replicas, missing Supabase primitives, a mismatched server marker, and partial
migration state. It clears caller `PGOPTIONS` and service settings. The parsed
URL becomes temporary `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`,
and `PGSSLMODE` values that are restored after the run; `psql` never receives
the URL as an argument. Migration application is one transaction. The
`cinnabar.release-proof.v2` JSON summary includes environment, mode,
timestamps, named step status/duration, stable failure code, execution context,
source commit, run ID/attempt, the ordered candidate-migration SHA-256,
Supabase CLI version, and cleanup result/duration. It excludes URL, host,
database name, credentials, SQL output, and test identities.

Local proofs use `executionContext=local` and leave Actions-only run provenance
null. CI must provide all commit/run/attempt values together, use the exact
pinned CLI version, require cleanup, and recompute the migration fingerprint
from the checked-out files. Partial metadata fails closed. The Actions job
finalizes cleanup before validation and upload, so a successful artifact cannot
describe a still-running disposable database. Startup/proof/cleanup failures
still produce the same bounded, self-describing v2 schema rather than an
unbound ad hoc artifact.

The PowerShell implementation is shared by local Windows and GitHub-hosted
Linux/pwsh. Repository and migration/test paths use segment-by-segment
`Join-Path`; native `psql` exit codes are captured explicitly across PowerShell
versions; nested target guards restore `PG*` process state as a stack; and the
concurrency proof reports cleanup failure directly instead of depending on a
parent shell's stale `$LASTEXITCODE`. An invalid or unwritable summary path
still leaves a sanitized failure summary on stdout.

If the ordered migration transaction fails, the runner also emits one bounded
warning containing at most twelve recognized PostgreSQL diagnostic lines. It
redacts database URLs, replaces the repository root with `<repo>`, truncates
each line to 300 characters, and never adds the diagnostic to the retained JSON
artifact. This keeps the release gate actionable without turning CI logs into a
connection-detail channel.

CI's `database-proof` job creates its Supabase working directory outside the
checkout so repository migrations are not auto-applied before the runner checks
the `Fresh` baseline. It uses the local database's built-in `auth` schema,
`anon`/`authenticated`/`service_role` roles, `gen_random_uuid()`, and
`postgres` owner. The workflow uses the local stack's built-in
`supabase_admin` only to persist the database-scoped
`cinnabar.environment=test` marker, restores `PGUSER=postgres`, and then
reconnects through the runner. The administrative role is never passed to the
release-proof script. The pinned CLI version is `2.84.2`. Changing
that version, port, owner, marker, or startup model requires rerunning the
workflow contract and a real Actions proof.

If `psql` is unavailable, run only the local wiring check and report that no
database proof was produced:

```powershell
npm run test -- database-release-proof
```

This workstation has not run Docker, Supabase CLI, or a real disposable
database proof. The configured GitHub job likewise has no evidence until the
workflow actually runs. Retain and inspect the sanitized Actions artifact
before claiming Fresh proof. `Upgrade` remains a separate proof against a
sanitized production-like clone and is not covered by the CI Fresh job.

Public readings additionally require the seventh quota migration plus exact
`ENABLE_PUBLIC_AI_READINGS=true`, exact
`VITE_ENABLE_PUBLIC_AI_READINGS=true`, exact `APP_ORIGIN`,
`DEEPSEEK_API_KEY`, `SUPABASE_SECRET_KEY`, a 32-byte base64url
`PUBLIC_AI_QUOTA_HMAC_KEY`, and positive
`PUBLIC_AI_DAILY_IP_LIMIT` / `PUBLIC_AI_DAILY_GLOBAL_LIMIT` values. The RPC
atomically claims global and HMAC(IP) UTC-day buckets; raw IPs are not stored,
and an allowed claim is not refunded after upstream failure. Keep the feature
disabled until an external Supabase proof, real preview DeepSeek stream, and
cost monitoring/alerts exist.

Vercel Cron may call `GET /api/cron/paypal-reconciliation` with
`Authorization: Bearer $CRON_SECRET`. `CRON_SECRET` is independent from PayPal
and Supabase credentials. PayPal webhook delivery to
`POST /api/paypal-webhook` additionally requires the exact Developer Portal
`PAYPAL_WEBHOOK_ID`. These dormant paths still require the server PayPal and
Supabase credentials; documenting them does not authorize enabling the payment
feature flags. Reconciliation cursor/backoff state is persisted by
`20260723020000_paypal_webhook_reconciliation.sql`; do not schedule the cron
before that migration is applied.
The worker uses 15-second hard-bounded PayPal requests, starts no more than 40
purchase reads per default run, and stops launching new work at 210 seconds
while preserving its last completed keyset cursor. `deadlineReached: 1` is an
expected resumable outcome, not permission to discard or skip the next record.

`app/vercel.json` currently ships
`Content-Security-Policy-Report-Only` plus the non-CSP security headers. Keep it
in observation mode during preview and production browser verification. Review
the sanitized `/api/csp-report` telemetry for GA4, Supabase, DeepSeek, and the
complete PayPal sandbox button/create/capture/recovery flow before preparing an
enforcing policy. A local test/build pass alone is not authorization to replace
the report-only header. `Permissions-Policy` explicitly allows `web-share` only
for the same origin. In Preview, verify that a file-capable browser exposes
Share Image while an unsupported browser retains Save Share Image; do not open
or complete the operating-system share sheet merely to prove button presence.

Opaque sessions require migration
`20260723040000_opaque_auth_sessions.sql`; server-owned PKCE login additionally
requires `20260723050000_auth_login_transactions.sql`. Both use the server-only
`SESSION_ENCRYPTION_KEY=<version>:<base64url-32-byte-key>`, exact
`APP_ORIGIN=<https-origin-with-no-trailing-slash>`, and an explicit staged
`AUTH_MODE=dual|opaque`. Deploy the migration and key before switching to
`dual`; verify migration/session/logout and cross-user conflict behavior before
switching to `opaque`. Rotating the single configured key version intentionally
invalidates sessions encrypted under the prior version. Future Report payments
remain closed unless `AUTH_MODE=opaque` as well as both existing payment flags;
do not use a legacy/dual browser session to exercise checkout.

For `APP_ORIGIN`, only local development may use
`http://localhost[:port]`; non-local HTTP, IP loopback aliases, and other
schemes fail closed. For an isolated Vercel Preview, assign a stable Branch URL
or dedicated preview domain and set a branch-scoped Preview `APP_ORIGIN` to that
exact HTTPS origin, with no trailing slash, path, or query. Do not use the
changing Commit URL. Redeploy the candidate after changing the environment.
Migration
`MIGRATION_RETRYABLE` means no uncertain provider rotation remains and a retry
is allowed. `MIGRATION_REAUTH_REQUIRED` is terminal for the legacy session:
clear its storage and require a new sign-in rather than retrying the old refresh
token.

Every opaque session hydration and permitted legacy/dual Bearer read performs a
bounded `GET ${VITE_SUPABASE_URL}/auth/v1/user` with the publishable key and
access token. The provider request times out and aborts after eight seconds,
also follows the incoming request abort signal, and uses `cache: no-store`.
Provider URLs require HTTPS except for local Supabase at `localhost`,
`127.0.0.1`, or `[::1]`; user info, path, query, and fragment components are
rejected.

Treat provider rejection and provider availability as separate release cases:

1. Explicit `401`/`403`, a `200` response with a null user, or an opaque
   provider ID mismatch returns the stable application `401`. The opaque path
   CAS-revokes only that row/version; session hydration may then clear the SID.
2. `429`, every other non-`200`, invalid JSON or malformed non-null user data,
   network failure, request abort, and timeout return
   `503 AUTH_UPSTREAM_UNAVAILABLE`. They must not revoke the row, write
   `last_seen_at`, clear the SID, or be reported as an identity conflict.
3. Advance `last_seen_at` only after provider validation succeeds, and keep the
   write conditional on the same session ID/version with `revoked_at` still
   null. Bearer-only validation uses the same `401` versus `503` classification
   but has no opaque row to mutate.

Focused verification for this boundary is 11 auth-related files / 164 tests.
That local baseline does not replace preview checks against the configured
Supabase provider. Exercise authoritative rejection, transient provider
failure followed by recovery with the same SID, request cancellation, timeout,
and both IPv4/IPv6 loopback development URLs before enabling opaque mode.

Client hydration must preserve the same uncertainty boundary. `init()` is a
resettable Promise single-flight: `503`, network failure, and malformed
responses preserve any current identity, CSRF token, session version, and paid
cache, then allow a same-page retry. Only explicit `authenticated:false` or an
authoritative `401` clears them. Verify initial failure followed by recovery,
concurrent retry coalescing, stale-response rejection, and stale
legacy-listener rejection before changing `AUTH_MODE`.

Paid Future Report generation must finish its complete DeepSeek fetch/body
cycle inside 45 seconds, accept only JSON no larger than 512 KiB, and keep the
server-owned model policy fixed. Every post-claim error invokes the exact
purchase/timestamp failure CAS with an independent seven-second deadline.
Cleanup errors must not replace the original safe response. Exercise
never-settling fetch and reader mocks, request abort, oversized/non-JSON
responses, vendor statuses, cleanup timeout, save CAS failure, and completed
report recovery. These local tests do not replace a PayPal sandbox plus
DeepSeek preview run; both payment flags remain false.

Free natal-reading retries must clear the atomic content/request-key cache
before starting. Cache hydration is exact-key and initial-only. Persona, birth,
or chart changes abort the old stream, and late tokens, errors, completion
analytics, or cache writes must fail the active controller/key/chart guard.

For new login in `dual`/`opaque`, configure Supabase's allowed Redirect URL as
the exact `${APP_ORIGIN}/api/auth/callback` (no wildcard in production), enable
the Google provider when Google login is required, and keep email OTP expiry at
no more than one hour. Verify the preflight double-submit cookie/header, email
and Google starts, exact callback, opaque SID issuance, expiry, replay, duplicate
cookie, and fixed error redirect in an isolated preview. Supabase/GoTrue owns
Google OAuth state/nonce/ID-token validation; the Cinnabar flow cookie only
binds a browser to its database login transaction.

The callback claims the transaction before exchanging the one-use code. If the
exchange or durable session creation has an uncertain/lost response, restart
login; the current implementation does not recover a completed SID from that
transaction. Automated email-link scanners can also consume magic links unless
the repository's scanner-resistant email configuration is deployed.

In the Supabase Dashboard, deploy
`supabase/templates/magic_link.html` as the Magic Link template, or use
equivalent content that retains both `{{ .Token }}` and the fragment-only
`{{ .TokenHash }}` link. Set Site URL to the exact `APP_ORIGIN`, keep email OTP
expiry at one hour or less, and disable email link tracking so the provider
does not rewrite the fragment-bearing confirmation URL. Do not substitute
`{{ .ConfirmationURL }}`, put TokenHash in a query string, or add third-party
images/scripts/links. Because one Supabase project has one Site URL, a preview
that must validate direct email links should use a separate preview Supabase
project with the preview `APP_ORIGIN`; otherwise production and preview cannot
both prove the direct-link path against one project configuration.

Verification must cover both same-device paths:

1. Enter the six-digit OTP in the browser that initiated the email flow.
2. Open the fragment-only TokenHash link in that same browser, confirm that
   GET/HEAD stays passive, then explicitly press the button to perform the
   guarded claim + `verifyOtp` POST.

The flow cookie intentionally prevents a new device from acquiring transaction
authority. When email opens elsewhere, return to the initiating browser and
enter the OTP. Every failed claim/verification is terminal; request a new email
instead of retrying the claimed transaction.

Local contracts verify the installed auth-js request body for manual OTP and
TokenHash `/auth/v1/verify`, plus the template's lack of ConfirmationURL,
query-string secrets, and third-party resources. They do not prove that an
initial PKCE challenge is interoperable with direct `/verify` in the configured
Supabase project. Exercise both paths in isolated staging and retain evidence
before changing `AUTH_MODE` away from `legacy`. There is no staging/live login evidence
yet, and both Future Report payment flags remain hard off.

## Documentation Gate

Before finishing any meaningful change, update the matching development document:

- `docs/dev/progress.md` for current status, shipped work, risks, and verification.
- `docs/dev/project-map.md` for structure, module ownership, or data flow.
- `docs/dev/decisions.md` for durable product or technical choices.
- `docs/dev/workflow.md` for commands, release, GitHub, or Vercel process.
- `app/AGENTS.md` for app-level module and testing guidance.

Then check:

```powershell
git diff --stat
git status --short --branch
```

## GitHub Issue Rules

Use GitHub issue templates for incoming work:

- Bug reports must include symptom, reproduction steps, expected behavior, area,
  and documentation impact.
- Feature requests must include problem, smallest useful solution, acceptance
  criteria, area, and documentation impact.
- Development tasks must include scope, likely files or modules, verification
  plan, and documentation-as-code checklist.

Issues may start as rough notes, but implementation work should not begin until
scope, verification, and documentation impact are clear enough to execute.

## Pull Request Rules

Every PR must fill out `.github/PULL_REQUEST_TEMPLATE.md`.

The documentation-as-code checklist is part of review. A PR that changes behavior,
architecture, workflow, deployment, data sources, or development process without
matching documentation is incomplete.

For code changes, include fresh verification evidence. If a command is not run,
state the reason in the PR.

## Direct GitHub-to-Vercel Deployment

Authenticated inspection on 2026-07-23 confirmed the active deployment path:

- Vercel team: `cinnabarastrology`
- Vercel project: `cinnabar`
- Git repository: `qq314134306/cinnabar`
- production branch: `main`
- Root Directory: `app`
- current production source commit: `104de00`
- deployed functions include `interpret` and `subscribe`

Do not record the Vercel project identifier or any environment value in
repository documentation, logs, screenshots, or proof artifacts.

The Vercel project is connected directly to the canonical GitHub repository.
The historical `ruijayfeng/zwknows` mirror and its write credential are not
part of the current deployment path. Do not recreate a mirror dependency to
trigger Vercel.

Static learning pages live at `app/public/learn/<slug>.html`. The Vercel
configuration rewrites one-segment `/learn/:slug` requests to those artifacts,
while `public/sitemap.xml` advertises their extensionless canonical URLs. The
local contract verifies routing and page structure, but release evidence must
request the clean URL from an isolated Preview, confirm an HTML response with
the matching canonical, then verify the root CTA and sitemap URL before
promotion.

Authenticated Vercel inspection found these configured variable names, each
scoped to both Production and Preview:

- `SUPABASE_SECRET_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `MAKE_WEBHOOK_URL` (obsolete for the candidate after visitor subscription
  retirement; the inspected deployment still has the name)
- `DEEPSEEK_API_KEY`

The following required or staged settings were not configured:

- `APP_ORIGIN`
- `AUTH_MODE`
- `SESSION_ENCRYPTION_KEY`
- `ENABLE_PUBLIC_AI_READINGS`
- `VITE_ENABLE_PUBLIC_AI_READINGS`
- `PUBLIC_AI_QUOTA_HMAC_KEY`
- `PUBLIC_AI_DAILY_IP_LIMIT`
- `PUBLIC_AI_DAILY_GLOBAL_LIMIT`

Absence of `AUTH_MODE` currently invokes the code-level `legacy` fallback.
Absence of the public-AI flag and quota settings keeps public AI fail-closed.
Configure and verify these first in Preview according to the authentication and
public-AI rollout sections above; do not copy values into documentation.

Authenticated project inspection also found Git Fork Protection, Standard
Deployment Protection, Build Logs protection, and Source protection enabled.
The existing sensitive variables are available to Preview as well as
Production, so do not approve or expose an untrusted fork preview. Keep fork
protection enabled and use a trusted repository branch for the release
candidate.

GitHub Actions is enabled for `qq314134306/cinnabar`. Pull request #10 started
the first observed hosted candidate run (`30183316408`) against commit
`80da318`. That run proved the trigger and artifact path but did not pass: the
verify job found a newly published high-severity `brace-expansion` advisory,
and the database job showed that the local Supabase `postgres` role cannot
persist either database- or role-scoped defaults for the custom marker. Run
`30183888687` proved the compatible ESLint remediation, but confirmed the same
marker restriction. The candidate therefore upgrades the compatible ESLint
toolchain and confines marker persistence to the local stack's built-in
`supabase_admin`, restoring `postgres` before the proof starts. Neither failed
run is release evidence. Both jobs must pass on a new exact-head run, and its
sanitized `cinnabar-database-proof` artifact must be inspected before hosted
database proof is accepted.

Inspect recent runs without exposing logs that may contain sensitive values:

```powershell
gh run list --repo qq314134306/cinnabar --workflow "Cinnabar candidate verification" --limit 3 --json databaseId,status,conclusion,headSha,url
gh run view <run-id> --repo qq314134306/cinnabar --json status,conclusion,attempt,headSha,url
```

Vercel's direct Git integration does not by itself prove that these checks
passed. Authenticated inspection found no Deployment Checks configured and
automatic assignment of custom production domains enabled. The Vercel UI can
import GitHub checks, but that integration has not been configured or proven.

Use this release order:

1. Push a trusted non-`main` candidate branch and open a pull request to obtain
   a Preview without changing Production.
2. Enable Actions and let both `Verify candidate` and
   `Prove database migrations on fresh Supabase` register and pass for the pull
   request; inspect the sanitized database artifact.
3. Protect `main`: require a pull request, require both checks, require the
   branch to be up to date, and disallow force pushes, deletion, and bypass.
4. Before merge, either import both GitHub checks into Vercel Deployment Checks,
   or disable automatic custom-production-domain assignment and manually
   promote the exact verified SHA.
5. After deployment, verify the production source commit, expected functions,
   runtime logs, and environment scopes in the authenticated Vercel project.

Deployment success and hosted candidate verification remain separate pieces of
evidence until this sequencing is enforced and observed.

[PROTOCOL]: Update this file when commands, CI, GitHub, Vercel, or release flow
changes.
