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

## D003 - Deployment Uses a Mirror Repository

`ruijayfeng/ziwei` is the development source. `ruijayfeng/zwknows` is the fork or
mirror connected to Vercel. The source repository syncs to the deployment mirror
through GitHub Actions.

Consequence: Vercel does not need to point at the source repository. Sync failures
should be debugged in GitHub Actions first, then by checking refs:

```powershell
git ls-remote origin refs/heads/main
git ls-remote zwknows refs/heads/main
```

## D004 - Sync Workflow Is Source-Repository Scoped

The sync workflow includes a repository guard so other forks do not push to the
user's deployment mirror.

Consequence: keep this condition unless the deployment model changes:

```yaml
if: github.repository == 'ruijayfeng/ziwei'
```

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

AI readings call `/api/interpret`, a Vercel Edge Function that forwards to
DeepSeek (`deepseek-chat`) and streams SSE back. `DEEPSEEK_API_KEY` is read only
from the server environment. The former in-browser multi-provider layer and the
API key settings panel were removed.

Consequence: deployments must set `DEEPSEEK_API_KEY` in the Vercel project
environment. Local `vite dev`/`vite preview` do not serve the function; use
`vercel dev` to exercise AI readings locally.

## D006 - Client-Side PayPal Checkout for the MVP Paywall

The Future Report paywall uses PayPal's Smart Payment Buttons with a
client-only integration: `createOrder`/`actions.order.capture()` run entirely
in the browser (`app/src/lib/paypal.ts`), with no server-side order
verification. The PayPal client ID is a public identifier (safe to ship in
the bundle, analogous to a Stripe publishable key).

Consequence: this is intentionally an MVP tradeoff — a malicious client could
in principle tamper with the charged amount before `createOrder`. Hardening
for production would move order creation and capture to a server endpoint
(mirroring the `/api/interpret` proxy pattern) that sets the amount from a
trusted tier lookup rather than trusting the client. Until then, treat
payment amounts as advisory, not authoritative.

## D007 - Email Capture Proxied Server-Side; Soul Card Unlock Is Optimistic

Email opt-ins post to `/api/subscribe`, a Vercel Edge Function that validates
the email, rate-limits, and forwards `{ email, source, created_at }` to the
Make webhook. `MAKE_WEBHOOK_URL` is read only on the server — mirroring the
`/api/interpret` pattern — so the webhook URL never ships in the client bundle.

The Soul Card's teaser is a growth/viral reward, not gated content: any share
action or email submit unlocks it *optimistically* in the browser, with no
server verification. The teaser is a deliberately hooky-but-shallow
self-discovery line and is entirely separate from the paid Future Report.

Consequence: deployments must set `MAKE_WEBHOOK_URL`. The unlock must never
reveal or gate the paid report, and Soul Card copy stays within
self-discovery / entertainment framing (no divination/fortune/psychic terms).
