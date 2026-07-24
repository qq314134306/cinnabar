# Cinnabar

<p align="center">
  <img width="820" alt="Cinnabar" src="./assets/logo.en.svg" />
</p>

<p align="center">
  <strong>A modern Zi Wei Dou Shu chart and interpretation application</strong>
</p>

<p align="center">
  <a href="../README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  English
</p>

## What is available

- **Your Chart** — casts a 12-palace Zi Wei Dou Shu chart with `iztro`, local
  birthplace matching, and true solar time correction. An explicitly
  approximate time receives a local comparison of the neighboring traditional
  two-hour windows. It can also open an optional local shortlist across all 13
  civil-time entries, including early and late Rat Hour. Every entry is
  independently solar-resolved before up to five skippable past-event
  questions produce evidence points and an evidence ledger. Users can finish
  questions left by early stopping, revise any answer with immediate
  recalculation, and inspect whether the leader survives removal of any one
  scored answer. A completely unknown hour can enter this flow without
  pretending the internal noon placeholder is a natal chart; hour-dependent
  outputs stay locked until a candidate is explicitly applied. Equivalent
  resolved charts remain tied; the tool does not
  claim to identify an exact or correct birth time. Once
  cast, selecting any palace locally highlights its focus, opposite, and two
  trine palaces, then summarizes the four-palace San Fang Si Zheng structure
  and major stars without claiming a deterministic outcome. A natal Four
  Transformations index also maps Lu, Quan, Ke, and Ji to their engine-owned
  stars and palaces; choosing one opens that palace and its four-palace
  context without treating a label as a standalone verdict. A local Major
  Limit & Year Lens can switch among the age 1–100 model years, overlay the
  active 10-year Major Limit, annual Life Palace, and both transformation
  layers, then navigate any mapped item back to its natal palace and
  four-palace context. This range does not predict outcomes or lifespan. The
  chart also shows a deterministic current-model-year snapshot with
  an overall score and Career, Wealth, Relationships, and Well-being
  dimensions. These local features need no AI request, account, API, or
  payment.
- **Life Timeline** — builds a local deterministic cycle view, focused by
  default on five years before through 25 years after the current age. The
  optional age 1–100 model range covers ten decadal cycles; it does not estimate
  lifespan and requires no AI request, account, or payment.
- **AI Reading** — is an optional narrative layer over the local snapshot. When
  enabled, it sends only a versioned `reading.v1` birth/persona request to
  server-side `/api/interpret`. The server rebuilds the chart and prompt,
  enforces 18+ eligibility and persistent daily quotas, then streams DeepSeek.
  Browser requests contain no chat messages, prompts, chart facts, resolved
  time, coordinates, or timezone. `DEEPSEEK_API_KEY` stays on the server; there
  is no in-app API-key or model configuration.
- **Compatibility** — produces a four-dimension deterministic local comparison
  without an account or API. Person A can reuse the visible details from the
  current chart, and both people can apply locally calculated true solar time
  from an optional birthplace. The result shows whether and how each birth-hour
  band was corrected. When public AI is enabled, users may optionally add a
  narrative reading from the same allowlisted birth settings.
- **Share Card** — creates a shareable Soul Card from the calculated chart.

## Local development

Requirements: a current Node.js release supported by the lock file and npm.

```bash
git clone https://github.com/qq314134306/cinnabar.git
cd ziwei/app
npm ci
npm run dev
```

`npm run dev` starts Vite and covers the browser application only. It does not
serve the functions under `app/api/`, so AI readings and other server-backed
flows will not work end to end.

For the complete application, run `app/` with a Vercel-compatible functions
runtime, such as an installed and authenticated Vercel CLI:

```bash
cd app
vercel dev
```

## Verification

Run the project checks from `app/`:

```bash
npm ci
npm run lint
npm run test
npm run build
```

These checks are local evidence only. Database migrations, identity-provider
flows, and external payment behavior require isolated environment verification.
See the [development and release workflow](./dev/workflow.md).

## Environment configuration

Do not commit secret values. Variables prefixed with `VITE_` are public browser
configuration and must never contain a service-role key or other secret.

| Area | Variables | Notes |
| --- | --- | --- |
| AI reading | `ENABLE_PUBLIC_AI_READINGS`, `VITE_ENABLE_PUBLIC_AI_READINGS`, `APP_ORIGIN`, `DEEPSEEK_API_KEY`, `PUBLIC_AI_QUOTA_HMAC_KEY`, `PUBLIC_AI_DAILY_IP_LIMIT`, `PUBLIC_AI_DAILY_GLOBAL_LIMIT`, `SUPABASE_SECRET_KEY` | Default-off. Both server and browser enable flags must be exact lowercase `true`; apply the Supabase quota migration first. The HMAC key and DeepSeek/Supabase credentials stay server-only. |
| Supabase public config | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Public project URL and publishable key used by browser and server auth clients. |
| Supabase server access | `SUPABASE_SECRET_KEY` | Server-only service-role credential. |
| Opaque auth | `APP_ORIGIN`, `AUTH_MODE`, `SESSION_ENCRYPTION_KEY` | `APP_ORIGIN` must be an exact origin. Keep `AUTH_MODE=legacy` until the documented database and preview proofs pass; the encryption key is required for `dual`/`opaque`. |
| Email capture | `MAKE_WEBHOOK_URL` | Optional server-only Make webhook. |
| Dormant Future Report | `ENABLE_FUTURE_REPORT_PAYMENTS`, `VITE_ENABLE_FUTURE_REPORT_PAYMENTS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_ENV`, `VITE_PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `CRON_SECRET` | Keep both enable flags false unless the complete release checklist is satisfied. |

The Supabase schema and ordered migrations live under `supabase/migrations/`.
Server-owned email login also requires the scanner-resistant email template and
provider settings described in the development workflow.

Local contracts are not evidence of a real DeepSeek stream, externally applied
quota migration, or production cost alerts. Keep public AI disabled until those
checks are owned and verified in an isolated preview.

## Deployment status

Vercel is the supported full-stack target; set the project Root Directory to
`app`. The repository workflow verifies the application and is configured to
run a disposable Fresh database proof. It neither deploys nor syncs another
repository.
A configured workflow is not proof that a hosted run succeeded—inspect the
actual run and sanitized artifact.

Cloudflare Pages can host the static Vite output, but it does not provide the
Vercel Functions contract used by `app/api/`. A full deployment there needs
a separately implemented compatible backend; it is not a one-click full-stack
target.

## Future Report payments

The server-verified PayPal Future Report path is present but deliberately
disabled by default. It also requires opaque authentication. There is no
staging or live PayPal proof yet, so local tests and builds are not authorization
to enable either payment flag or advertise the paid report as available.

```text
ENABLE_FUTURE_REPORT_PAYMENTS=false
VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false
```

## License

This project is licensed under the
[GNU General Public License v3.0 (GPLv3)](../LICENSE).
