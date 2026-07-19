# Project Map

> L2 | Parent: `AGENTS.md`

## Purpose

This file gives future agents a fast structural map before they touch code. Keep
it factual and compact.

## Application Shape

The app is a Vite React application under `app/`. It uses TypeScript, React 19,
Zustand, Tailwind CSS 4, Vitest, ESLint, iztro for Zi Wei Dou Shu charting, and
Vercel Analytics.

The public brand is Cinnabar ("Eastern Astrology, in English"). All user-facing
text is English; the iztro engine output stays zh-CN internally and is
translated at the presentation layer.

Primary runtime flow:

1. User enters birth data in the form.
2. Birth date and birthplace inputs are normalized.
3. True solar time correction can adjust the effective birth time.
4. iztro generates the chart (zh-CN keys internally).
5. App state stores the chart and user selections.
6. UI renders chart, match (Compatibility), share, and AI reading views through
   the English glossary layer. Fortune and K-line views exist but are hidden
   from navigation.
7. AI readings send an English CHART FACTS block plus persona prompts to
   `/api/interpret`, a Vercel Edge Function that proxies DeepSeek server-side.

## App Module Map

<directory>
app/api/ - Vercel Edge Functions (DeepSeek proxy; server-side API key).
app/src/components/ - React UI components grouped by feature.
app/src/components/ui/ - Small reusable UI primitives.
app/src/lib/ - Business logic helpers and calculation support.
app/src/stores/ - Zustand state.
app/src/knowledge-db/ - Structured guidance database and retrieval pipeline.
app/src/knowledge/ - Static Zi Wei Dou Shu knowledge modules.
app/tests/ - Tests outside source tree, currently including workflow validation.
</directory>

## Important Files

- `app/api/interpret.ts` - Edge proxy for DeepSeek; the only reader of `DEEPSEEK_API_KEY`.
- `app/src/components/BirthForm.tsx` - birth input, birthplace matching entry, and true solar time options.
- `app/src/components/OpenSourceLinks.tsx` - GitHub repository and license links for open source attribution.
- `app/src/lib/ziwei-glossary.ts` - Chinese→English terminology dictionaries (Cinnabar glossary).
- `app/src/lib/chart-facts.ts` - English CHART FACTS builder for AI prompts.
- `app/src/lib/ai-prompts.ts` - base system prompt, personas, reading templates (free reading, compatibility, paid Future Report).
- `app/src/lib/paypal.ts` - client-side PayPal Smart Payment Buttons (createOrder/capture; `onInitiate` fires begin_checkout).
- `app/src/lib/analytics.ts` - guarded gtag.js wrapper: manual SPA page_views + named GA4 custom events.
- `app/api/subscribe.ts` - Edge function relaying captured emails to the Make webhook (the only reader of `MAKE_WEBHOOK_URL`).
- `app/src/lib/supabase.ts` - browser Supabase client (public publishable key; guarded when env absent).
- `app/api/_supabase-admin.ts` - server-only service-role client (`SUPABASE_SECRET_KEY`; underscore = not a route; never imported by src/).
- `app/src/components/AuthModal.tsx` + `AuthControl.tsx` - magic-link sign-in modal and header sign-in/out control; `useAuthStore` in `src/stores`.
- `supabase/migrations/*.sql` - profiles table + auto-provision trigger + RLS (run manually in the Supabase SQL Editor).
- `app/src/lib/subscribe.ts` - client POST helper for `/api/subscribe`.
- `app/src/components/EmailCapture.tsx` - reusable, source-tagged email opt-in.
- `app/src/components/SoulCard.tsx` + `app/src/lib/soul-card.ts` - shareable Soul Card (deterministic derivation from the chart) with locked teaser + share/email unlock.
- `app/src/components/ExitIntentModal.tsx` - once-per-session exit-intent email capture.
- `app/src/components/FutureReportPaywall.tsx` - pricing tiers, checkout, and paid report display below the free reading.
- `app/src/lib/llm.ts` - streaming client for `/api/interpret`.
- `app/src/lib/true-solar-time.ts` - true solar time calculation and birthplace matching helpers (Chinese, pinyin, and world-city input; DST-aware offsets via Intl).
- `app/src/lib/birthplace-data.json` - local Chinese city/region coordinate dataset.
- `app/src/lib/world-cities.json` - curated global city dataset (name, country, longitude, IANA timezone, aliases).
- `app/src/lib/birth-date.ts` - birth date handling.
- `app/src/lib/astro.ts` - chart-facing astrology helpers.
- `app/src/knowledge-db/retrieval/retrieve.ts` - guidance retrieval.
- `.github/workflows/sync-zwknows.yml` - deployment mirror synchronization.

## Data Sources

- Birthplace coordinate data comes from the open source `88250/city-geo` dataset.
- License text is tracked in `docs/licenses/city-geo-MulanPSL2.txt`.
- Domain knowledge is stored in the numbered root folders and in app knowledge modules.

## Boundaries

- UI components should call business helpers instead of embedding calculation logic.
- `app/src/lib/` owns deterministic data transformation and calculation helpers.
- `app/src/knowledge-db/` owns retrieval data and prompt-grounding context.
- Workflow tests under `app/tests/` protect repository automation contracts.

[PROTOCOL]: Update this file when module ownership, data flow, important files, or
source data changes.
