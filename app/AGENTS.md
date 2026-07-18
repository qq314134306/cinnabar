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
- ESLint
- iztro
- Vercel Analytics

## Commands

Run from `app/`:

```powershell
npm run dev
npm run lint
npm run test
npm run build
```

Targeted examples:

```powershell
npm run test -- true-solar-time
npm run test -- retrieve
npm run test -- sync-zwknows
```

## Member List

`src/main.tsx`: React entry point and app mounting.

`src/App.tsx`: Top-level application composition (Cinnabar shell: Your Chart,
Compatibility, Share Card; Yearly Fortune and Life K-Line remain in the codebase
but are hidden from navigation).

`api/interpret.ts`: Vercel Edge Function that proxies DeepSeek chat completions.
The only place `DEEPSEEK_API_KEY` is read; the key never reaches the browser.

`api/subscribe.ts`: Vercel Edge Function for email capture. The only place
`MAKE_WEBHOOK_URL` is read; it validates the email server-side, applies a body-size
cap and a best-effort in-memory rate limit, then forwards
`{ email, source, created_at }` to the Make webhook. Independent of the
DeepSeek/PayPal flow. Covered by `tests/subscribe.test.ts`.

`src/components/email/`: Reusable `EmailCapture` (posts to `/api/subscribe` with a
`source`) and `ExitIntentModal` (one desktop exit-intent invite per session).

`src/components/soul/SoulCard.tsx`: Shareable vertical Soul Card built from the
already-cast chart (Life Palace star + element + keywords via `src/lib/soul-card.ts`),
exported with html2canvas, with a homepage QR (qrcode), a locked self-discovery
teaser, and share/email optimistic unlock. Shown under the free reading; never
unlocks the paid Future Report.

`src/lib/soul-card.ts`: Derives Soul Card data (core star, element theme, keywords,
teaser) from the chart — reads and translates only, never invents.

`src/components/`: Feature UI components. Keep deterministic calculation logic in
`src/lib/` instead of embedding it in components. All user-facing text is
English; the iztro engine output stays zh-CN internally and is translated at the
presentation layer.

`src/components/ui/`: Small reusable UI primitives.

`src/components/OpenSourceLinks.tsx`: GitHub repository and license links for
open source attribution in the app shell.

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

`src/lib/llm.ts`: Streaming client for the `/api/interpret` proxy.

`src/lib/paypal.ts`: Client-side PayPal Smart Payment Buttons wrapper
(createOrder/capture — the standard MVP integration; no server order
verification, see decision D006).

`src/components/FutureReportPaywall.tsx`: Pricing tiers (1-Year/5-Year),
PayPal checkout, and the purchased report view rendered below the free
reading in `AIInterpretation.tsx`.

`src/lib/analytics.ts`: Guarded gtag.js wrapper. gtag.js loads in
`index.html` with automatic page_view disabled; `App.tsx` sends a manual
page_view per tab change, and components fire named custom events
(view_landing, start_reading, complete_reading, view_paywall,
begin_checkout, purchase_success, soul_card_view, share_click, email_capture).
The GA4 Measurement ID is public; no secrets belong here.

`src/lib/true-solar-time.ts`: True solar time and birthplace matching logic.
Accepts Chinese names, tolerant pinyin ("Zhu Zhou"/"zhuzhou"), and world-city
English names; UTC offsets are DST-aware via the built-in Intl API (China
entries default to Asia/Shanghai).

`src/lib/birthplace-data.json`: Local Chinese coordinate dataset used for
birthplace matching (pinyin keys generated at load via pinyin-pro).

`src/lib/world-cities.json`: Curated global city dataset (name, country,
longitude, IANA timezone, aliases) for overseas true-solar-time correction.

`src/knowledge-db/`: Structured guidance database and retrieval pipeline.

`src/knowledge/`: Static domain knowledge used by the app (zh-CN; used by the
hidden fortune/K-line features).

`src/stores/`: Zustand state boundaries. Settings persist only the reader
persona; API keys are no longer stored client-side.

`tests/`: Tests that sit outside `src`, including workflow contract tests.

## Change Rules

- UI behavior changes should keep form flows usable for non-technical users.
- True solar time changes must protect users from needing raw longitude, latitude,
  or manual minute correction unless explicitly requested later.
- Birthplace matching changes should be tested against realistic city input.
- Workflow changes should keep the source repository guard and deployment mirror
  intent intact.
- Documentation changes are required for meaningful app behavior, module, command,
  or workflow changes.

## Verification Guide

- Calculation helper change: run the matching targeted Vitest file and then
  `npm run test`.
- UI component change: run `npm run lint`, relevant tests, and browser-check the
  changed flow when practical.
- Build or dependency change: run `npm run build`.
- GitHub workflow change: run `npm run test -- sync-zwknows`.

[PROTOCOL]: Update this file when app structure, commands, key files, or app-level
development rules change.
