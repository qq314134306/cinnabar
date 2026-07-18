# Development Progress

> L2 | Parent: `AGENTS.md`

## Current State

- Branch: `main`
- Source repository: `ruijayfeng/ziwei`
- Deployment mirror: `ruijayfeng/zwknows`
- Vercel should remain connected to `zwknows/main`
- Latest known synced commit: `ec34916707b85fc70adc208ceac6f4ebd15cce48`
- Working tree was clean before this documentation task.

## Recently Completed

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
- Replaced the client-side multi-provider LLM layer with a Vercel Edge Function
  (`app/api/interpret.ts`) proxying DeepSeek; `DEEPSEEK_API_KEY` is read
  server-side only and the user-facing API key settings panel was removed.
- Rebuilt AI readings on an English prompt system (base system prompt, Scholar /
  Old Sage persona toggle, free-reading and compatibility templates) grounded in
  a generated English CHART FACTS block.
- Hid Yearly Fortune and Life K-Line from navigation (code retained, adapted to
  the new LLM client).
- Pointed `package-lock.json` resolved URLs at registry.npmjs.org (previously
  registry.npmmirror.com, which some build environments block).
- Added visible GitHub repository and MIT License links to the app shell (label
  since updated to GPLv3).
- Added true solar time correction support.
- Added free-text birthplace matching.
- Added local city and region coordinate dataset from `88250/city-geo`.
- Added Vercel Analytics.
- Added GitHub Actions workflow to sync `ziwei/main` to `zwknows/main`.
- Added workflow validation test for `sync-zwknows.yml`.
- Fixed sync workflow credential persistence by setting `persist-credentials: false`.
- Confirmed workflow succeeds with a classic PAT stored as `ZWKNOWS_SYNC_TOKEN`.

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

## Open Risks

- `CLAUDE.md` currently reads as mojibake in this environment and should not be
  treated as the primary agent entry point.
- The birthplace matching experience depends on the quality and coverage of the
  local coordinate dataset.
- The deployment mirror sync depends on the GitHub secret `ZWKNOWS_SYNC_TOKEN`
  retaining both `repo` and `workflow` permissions.

## Next Useful Work

- Confirm Vercel deployment status after the next real `main` push.
- Consider replacing or migrating the garbled `CLAUDE.md` once the new docs have
  been accepted.
- Add feature-level tests whenever true solar time or birthplace matching behavior
  changes.
- Use GitHub issue templates for new feature, bug, and internal development work.
- Keep the in-app open source links pointed at the source repository unless the
  public repository strategy changes.

[PROTOCOL]: Update this file after each feature, fix, release, deployment change,
or notable verification run.
