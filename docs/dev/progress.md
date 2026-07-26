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
  not copied or exposed. `MAKE_WEBHOOK_URL` is obsolete for the candidate after
  visitor-subscription retirement, but remains an observed deployed setting
  until a separate reviewed configuration change removes it.
- `APP_ORIGIN`, `AUTH_MODE`, `SESSION_ENCRYPTION_KEY`, both public-AI enable
  flags, and the quota variables are not configured in Vercel. The absent `AUTH_MODE`
  leaves the runtime on its code-level `legacy` fallback; public AI remains
  fail-closed. These are configuration gaps, not evidence for enabling either
  feature.
- GitHub Actions is enabled. Pull request #10 started the first observed hosted
  candidate run (`30183316408`) against `80da318`; both jobs failed and are not
  release evidence. The verify job exposed a new high-severity
  `brace-expansion` advisory. The Fresh database job uploaded a sanitized
  failure artifact after the Supabase `postgres` role was denied permission to
  alter the database object's default marker. Run `30183888687` proved the
  toolchain remediation through a successful `Verify candidate` job, but also
  showed that the role cannot persist its own custom database-scoped default.
  Marker persistence is now confined to local Supabase's built-in
  `supabase_admin`, with `PGUSER=postgres` restored before the proof starts.
  Run `30184030058` then proved the marker, target guard, prerequisites, and
  baseline state, but the ordered migration transaction failed. The prior
  runner suppressed the useful PostgreSQL error text. The repair sequence
  culminated in run `30185280458`, where both `Verify candidate` and `Prove
  database migrations on fresh Supabase` succeeded. Its downloaded sanitized
  artifact was inspected: `success=true`, all 13 ordered steps and cleanup
  passed, the run binding and migration SHA-256 matched, and Supabase CLI
  `2.84.2` remained pinned. That is the first accepted hosted Fresh proof for
  this candidate; earlier failed runs remain non-evidence.
- GitHub `main` is protected: merges require a pull request, an up-to-date
  branch, `Verify candidate`, and `Prove database migrations on fresh
  Supabase`; bypass, force pushes, and deletion are disallowed. Vercel has Git
  Fork Protection, Standard Deployment Protection, Build Logs protection, and
  Source protection enabled. Its native `Lint` and `Typecheck` Deployment
  Checks now block Production promotion and will first run on the next
  deployment. Automatic custom-production-domain assignment remains enabled,
  so the new Vercel checks still require an observed production-candidate run
  before the promotion sequence is considered proven.
- The candidate branch is pushed and tracked at
  `origin/codex/release-hardening`; pull request #10 targets `main`. Its trusted
  Vercel branch Preview is live and passed the default chart plus eight-cycle
  Major Luck browser check without console errors or horizontal overflow.
  Production remains commit `104de00`; no merge or production promotion is
  claimed here.

## Recently Completed

- Protected `main` after exact candidate head `4440e40` passed hosted run
  `30185445036`: pull requests, up-to-date branches, both candidate workflow
  jobs, and no bypass are now enforced. Vercel could not import PR-only GitHub
  checks before those check names exist on the default branch, so native
  blocking `Lint` and `Typecheck` Deployment Checks were configured instead.
  Added the compatible `typecheck` package script; both native checks will run
  for the next deployment and must be observed before Production promotion.
- Accepted hosted candidate run `30185280458`. The application job passed the
  audit, lint, 77 files / 659 tests, build, and whitespace gates. The Fresh
  database job passed migrations, migrated-state checks, six SQL behavior
  suites, credit-ledger concurrency, cleanup, finalized-summary validation,
  artifact upload, and the final gate. The downloaded
  `cinnabar-database-proof` artifact contains only the sanitized v2 contract,
  binds to source commit `e2cc05275cb52809c8292e6772de83254767085e`
  (GitHub's pull-request merge ref), run `30185280458`, migration fingerprint
  `3f196265095dfe938e4f91c63b45dd3d97d63afbf75d9d0c89e107c9edf559f1`,
  and CLI `2.84.2`; all 13 steps plus cleanup are `pass`, `success` is true,
  and `failureCode` is null. This proves Fresh only, not Upgrade against a
  sanitized production-like clone and not production promotion.
- Confirmed the GitHub authorization is now persisted for account
  `qq314134306`; local HEAD and `origin/codex/release-hardening` both resolve to
  `e75cd476aa3acf9292909efcc65fa7f9e5a34d04`. Added a bounded migration failure
  diagnostic to the Fresh database proof after run `30184030058` reached the
  real migration transaction and failed with only the generic
  `MIGRATION_TRANSACTION_FAILED` code. The warning retains only the first
  twelve recognized PostgreSQL error/detail/hint/context lines, redacts any
  database URL, replaces the repository root, truncates each retained line,
  and remains outside the sanitized JSON artifact.
- Hosted run `30184336242` proved that the bounded diagnostic works and located
  the first real migration defect in a credit balance `COALESCE` expression.
  Run `30184475956` clarified that the blocking issue was the invalid
  `pg_catalog.coalesce` qualification, not only the fallback type. PostgreSQL
  treats `COALESCE`, `GREATEST`, and `LEAST` as special SQL expressions rather
  than schema-qualified functions. The candidate migrations now leave those
  expressions unqualified, retain the explicit bigint credit fallback, and pin
  both rules in the release contract test. Both failed runs remain
  non-evidence; a new exact-head Fresh proof is required.
- Hosted run `30184584887` advanced materially: the complete ordered migration
  transaction and the first five SQL behavior suites passed. Only
  `public_ai_quota.sql` failed, but the runner did not yet surface SQL-test
  stderr. The same bounded, redacted PostgreSQL diagnostic is now applied to
  named SQL-test failures so the next exact-head run can expose the remaining
  assertion without leaking it into the retained artifact.
- Hosted run `30184748654` identified that final assertion. The quota behavior
  test created 101 stale rows while exercising two successful claims; because
  each success correctly performs a separately bounded cleanup of at most 100,
  no stale row remained. The fixture now creates 201 rows so two successes must
  leave exactly one, while the intervening rejected claims prove they do not
  trigger cleanup. A new exact-head Fresh proof remains required.
- Hosted run `30184856679` exposed a separate cold-run reliability issue in the
  candidate verifier: all 659 assertions reached completion except the workflow
  contract that launches the real PowerShell parser, whose default five-second
  Vitest timeout expired on the Ubuntu runner. The parser contract now has a
  scoped 20-second allowance; no production test timeout or global timeout was
  relaxed. Its Fresh database proof then passed every migration, all six SQL
  suites, and the credit-ledger concurrency test, but a deliberately handled
  non-zero `psql` assertion leaked through PowerShell's ambient
  `$LASTEXITCODE`; the workflow misclassified the otherwise successful proof as
  incomplete cleanup. The proof runner now explicitly exits zero after writing
  a no-failure pending-cleanup summary, while preserving exit one whenever a
  real `failureCode` exists. The run remains non-evidence because its final
  gates failed; a new exact-head run is required.
- Hosted run `30185010430` proved the full app verifier and every substantive
  Fresh database stage, including cleanup, strict finalized-summary validation,
  and artifact upload. Only the redundant Bash tail gate failed while
  re-reading intermediate step outcomes already folded into the successfully
  validated JSON. The tail gate now requires only finalized-summary validation
  and evidence upload; start, proof, cleanup, ordered steps, run binding, CLI
  pin, and migration fingerprint remain fail-closed inside that validator. The
  run itself remains non-evidence because the job conclusion was failure; a new
  exact-head run is required.
- Hosted run `30185160313` confirmed the final tail gate was correctly exposing
  a hidden validator failure: newer runner PowerShell materialized ISO JSON
  timestamps as `DateTime` values, so a post-deserialization `...Z` regex
  rejected valid evidence. UTC `Z` encoding is now verified on the raw JSON,
  while parsed values retain the chronological-order check. The failed run is
  not evidence; a new exact-head run is required.
- Exercised the release path for the first time through pushed pull request
  #10. The trusted Vercel Preview built and passed a real default-chart and
  Major Luck browser check. Hosted run `30183316408` correctly blocked the
  candidate on a newly published `brace-expansion` high-severity advisory and
  an over-privileged database-marker command. The compatible remediation moves
  the development toolchain to ESLint 10.8, `@eslint/js` 10.0.1,
  `typescript-eslint` 8.65, React Hooks 7.1.1, and React Refresh 0.5.3, with a
  clean `npm ci` and full-tree audit at zero vulnerabilities. Three newly
  recommended lint rules are explicitly held at the prior candidate baseline
  so the security update does not silently introduce behavior refactors. The
  database marker is persisted by the local stack's built-in administrative
  role, then the workflow restores the required `postgres` proof owner before
  invoking any release-proof code. Local
  lint, 77 files / 656 tests, and the strict production build pass after the
  changes. A new exact-head hosted run is still required; the failed initial
  run and its failure artifact are not release evidence.
- Added an opt-in BaZi Major Luck (Da Yun) navigator beneath the Four Pillars
  companion. It derives gender-dependent forward/reverse direction, the
  minute-aware start offset and start timestamp, and eight ten-year
  stem-branch cycles from the already true-solar-corrected birth timestamp.
  The adapter deliberately uses `lunar-typescript` sect 2 so the distance to
  the relevant solar term retains corrected minute precision. The 303.24 kB
  calendar engine is isolated behind the `Show Major Luck` action; it does not
  enter the initial chart load, while ChartDisplay remains 55.95 kB raw /
  16.23 kB gzip. The surface displays structure and calendar ranges only,
  labels approximate-time results provisional, and explicitly says the ranges
  are neither a lifespan forecast nor an outcome prediction. The complete app
  passes 77 test files / 656 tests, lint, and the strict production build. A
  real 1905-pixel-wide Chrome pass cast the default chart, loaded all eight
  cycles (Yi-Hai through Wu-Chen), found no document or panel overflow, and
  recorded no browser console errors. No push, pull request, deployment,
  payment, AI, persistence, strength judgment, or useful-element selection was
  added.
- Extended the provider-independent BaZi companion with visible-stem Ten Gods
  and ordered hidden stems plus their Day-Master-relative Ten Gods. The adapter
  preserves the already-verified `lunar-lite` Four Pillars as the only calendar
  boundary result, then uses a pure typed Five Element/Yin-Yang relationship
  helper and an explicit canonical twelve-branch hidden-stem table. It does not
  recast the date through a second calendar object, preventing a second Li Chun
  or day-boundary authority. Exhaustive tests cover all ten target stems for
  every Day Master and pin every hidden-stem sequence. Values are normalized
  into a closed typed English vocabulary; any unknown relationship fails the
  complete local result instead of displaying partial structure. Approximate
  time marks the Hour Pillar and its Ten Gods structure provisional. This adds
  no hidden-stem weighting, strength/useful-element judgment, luck cycles,
  prediction, AI, account, persistence, score, or network request. The complete
  app passes 76 test files / 653 tests, lint, the moderate audit with zero known
  vulnerabilities, and the strict production build. ChartDisplay remains lazy
  at 52.87 kB raw / 15.50 kB gzip, and every JavaScript chunk remains below
  500 kB. A real 1905-pixel-wide Chrome preview confirmed all four visible Ten
  Gods and hidden-stem groups, the expected default Bing Day Master
  relationships, no horizontal overflow, and the approximate-hour disclosure.
  A second 1990-02-01 pass retained the deliberate boundary separation: Zi Wei
  year Geng-Wu, BaZi Year Pillar Ji-Si, and BaZi Month Pillar Ding-Chou.
- Added a provider-independent BaZi Four Pillars companion beneath the natal
  chart after reviewing public GitHub agent skills and calculation projects.
  Prompt-only skills with stale or unverifiable source links were not copied
  into the product. The implementation instead declares the already
  iztro-aligned, MIT-licensed
  [lunar-lite](https://github.com/SylarLong/lunar-lite) calculation library as
  a direct dependency and uses its typed Four Pillars API. The panel derives
  Year, Month, Day, and Hour Pillars from the same true-solar-resolved date and
  two-hour block used by the Zi Wei chart, but deliberately requests BaZi's Li
  Chun year boundary and solar-term month boundary rather than reusing the Zi
  Wei lunar-year convention. It identifies the Day Master stem, polarity, and
  Five Element, translates all four pillars into English, and marks the Hour
  Pillar provisional for approximate birth times. It adds no Ten Gods, hidden
  stems, strength judgment, prediction, AI, account, persistence, or network
  request. The center label is now explicitly `Zi Wei year` so the two calendar
  conventions cannot be mistaken for one another. A clean `npm ci` and
  moderate audit found zero known vulnerabilities; the complete app passes 76
  test files / 650 tests, lint, and the strict production build. ChartDisplay
  remains lazy at 51.02 kB raw / 14.82 kB gzip, and every JavaScript chunk
  remains below 500 kB. A real 1905-pixel-wide Chrome preview confirmed all
  four default pillars, the Bing / Yang Fire Day Master, no horizontal
  overflow, and the calendar-boundary separation on 1990-02-01: the Zi Wei
  center showed Geng-Wu while BaZi correctly retained the pre-Li-Chun Ji-Si
  Year Pillar and Ding-Chou Month Pillar.
- Completed the selected-palace flying-transformation chain from source stem to
  transformed star to destination palace. The adapter now joins
  `mutagedPlaces()` with iztro's configuration-aware
  `getMutagensByHeavenlyStem()` output in canonical Lu/Quan/Ke/Ji order, so
  each card identifies both the affected major or minor star and its
  engine-owned destination. The existing target navigation, same-palace
  marker, explicit unavailable states, and non-predictive boundary remain
  unchanged. No heavenly-stem table, score, AI, account, or network dependency
  is added. Pure and rendered coverage verifies injected partial results, the
  configured real-engine mapping, English star labels, and destination
  navigation. The complete app passes 74 test files / 641 tests, lint, and the
  strict production build; ChartDisplay remains lazy at 46.86 kB raw /
  13.75 kB gzip, and every JavaScript chunk remains below 500 kB. A real
  1905-pixel-wide Chrome preview confirmed the default Life Palace chain
  Lu/Ju Men→Spouse, Quan/Tai Yang→Career, Ke/Wen Qu→Property, and
  Ji/Wen Chang→Children. Opening the Lu target selected the Spouse Palace with
  exactly one focus, one opposite, and two trines, and the document had no
  horizontal overflow.
- Added a provider-independent palace-origin Four Transformations map to each
  selected natal palace, using
  [qingnang.cc's public Zi Wei Dou Shu overview](https://www.qingnang.cc/wiki/ziwei/jichu/ziwei-doushu)
  as a structural product benchmark and
  [iztro's documented functional-palace capability](https://github.com/SylarLong/iztro)
  as the calculation authority. The panel keeps canonical Lu/Quan/Ke/Ji order,
  shows the engine-returned destination palace and branch, marks same-palace
  transformations, and opens an available destination in the existing palace,
  San Fang Si Zheng, and flanking context. It resolves the source with
  `chart.palace()` before calling `mutagedPlaces()`; a real-chart regression
  caught and prevented the raw-array path that left first-use destinations
  unresolved. Missing targets remain unavailable, and no copied stem table,
  score, supportive/difficult label, prediction, AI, account, or network work
  is added. Pure and rendered coverage includes canonical ordering, missing and
  same-palace results, engine failures, a real iztro chart, and destination
  navigation. The complete app passes 74 test files / 641 tests, lint, and the
  strict production build. ChartDisplay remains lazy at 46.56 kB raw /
  13.67 kB gzip, with every JavaScript chunk below 500 kB. A real
  1905-pixel-wide Chrome preview confirmed the default Life Palace map
  Lu→Spouse, Quan→Career, Ke→Property, Ji→Children; Lu navigation opened the
  Spouse Palace with exactly one focus, one opposite, and two trines. The same
  pass found no visitor-email field, exit-intent prompt, document-level
  horizontal overflow, browser warning, or browser error. The connected Chrome
  surface did not provide a mobile viewport override, so this pass makes no new
  mobile-layout acceptance claim.
- Retired visitor email collection now that account authentication owns the
  site's intentional email entry. The candidate removes the reading opt-in,
  desktop exit-intent prompt, Soul Card email unlock, `EmailCapture`,
  `/api/subscribe`, its Make forwarding/client chain, and the
  `email_capture` analytics event. Soul Card sharing remains local and can
  still reveal its teaser; login retains a side-effect-free email syntax
  validator. The deployable API set falls from 12 to 11 functions within the
  Hobby limit, and `MAKE_WEBHOOK_URL` is no longer read by candidate code.
  Focused UI/auth/function-budget coverage passes 33 tests; the complete app
  passes 73 test files / 634 tests, lint, and the strict production build.
  AIInterpretation decreases to 43.49 kB raw / 15.98 kB gzip, and every
  JavaScript chunk remains below 500 kB. This is candidate evidence only: the
  inspected production commit still serves the old subscription function and
  retains its variable name until a deliberate deployment/configuration change.
- Added a provider-independent flanking-palace context to every selected natal
  palace, using
  [qingnang.cc's public San Fang Si Zheng and flanking-palace article](https://www.qingnang.cc/wiki/ziwei/jichu/sanfang-sizheng)
  as a structural benchmark without copying its code, brand, design, or
  interpretive claims. One pure helper now resolves the immediately previous
  and next earthly branches with wraparound, while the selected-palace guide
  summarizes both engine-owned neighbors in a separate section. The existing
  San Fang Si Zheng chart highlight remains exactly one focus, one opposite,
  and two trines; flanks receive no chart highlight, score, supportive/difficult
  label, or outcome claim. Unknown branches and partial engine data remain
  unavailable rather than inferred. Pure tests cover all twelve branches,
  wraparound, uniqueness, reciprocity, and unknown values; rendered tests cover
  both neighboring summaries alongside the unchanged four-palace state. The
  complete app passes 75 test files / 722 tests, lint, and the strict
  production build. ChartDisplay remains lazy at 43.71 kB raw / 13.06 kB gzip,
  with every JavaScript chunk below 500 kB. A real 1920-pixel-wide Chrome
  preview confirmed the default Life Palace's Siblings/Parents flanks, four
  unchanged San Fang Si Zheng summaries, no document-level horizontal
  overflow, and no browser warning/error logs. The active Chrome viewport
  override did not apply the requested 390-by-844 dimensions, so a fresh
  mobile-browser acceptance claim is deliberately withheld.
- Added a provider-independent Major Limit & Year Lens to the natal chart,
  using [qingnang.cc's public Zi Wei Dou Shu overview](https://www.qingnang.cc/wiki/ziwei/jichu/ziwei-doushu)
  and its stated natal/Major Limit/annual layering as a product benchmark
  without copying its code, brand, design, or interpretive claims. Users can
  switch among the disclosed age 1–100 model years and inspect the engine-owned
  10-year Major Limit, annual Life Palace, and canonical Lu/Quan/Ke/Ji stars
  for both timing scopes. Every resolved item navigates back to its natal
  palace and existing San Fang Si Zheng context; changing the year clears the
  previous palace context. Missing indexes or star hosts stay unavailable.
  The browser layer and `buildYearlyChartFacts` now share one pure timing
  helper, so annual UI navigation and server-grounded facts use the same palace
  ownership. The helper still accepts later server-requested years, preventing
  the visible 1–100 browsing boundary from truncating an existing report.
  This layer adds no score, AI request, persistence, outcome claim, or lifespan
  estimate. The complete app passes 75 test files / 718 tests, lint, and the
  strict production build. ChartDisplay remains lazy at 41.89 kB raw /
  12.76 kB gzip, with every JavaScript chunk below 500 kB. A real production
  preview confirmed the default 2026 Major Limit and annual overlays, Annual Ji
  navigation to the Siblings Palace plus exactly one focus, one opposite, and
  two trines, stale-context cleanup on switching to 2027, no document-level
  horizontal overflow at desktop or 390-by-844 mobile, and no browser
  warning/error logs. This acceptance does not choose the final visual
  direction.
- Added a provider-independent natal Four Transformations navigation layer,
  using [qingnang.cc's public Zi Wei Dou Shu overview](https://www.qingnang.cc/wiki/ziwei/jichu/ziwei-doushu)
  and its treatment of Four Transformations as a core chart structure as a
  product benchmark without copying its code, brand, design, or interpretive
  claims. One shared extractor now supplies both the visible
  Lu/Quan/Ke/Ji index and the chart-facts prompt grounding, scanning major and
  minor stars in canonical order while retaining the engine-owned star,
  palace, branch, brightness, and star kind. Clicking an available
  transformation opens its existing palace explanation and San Fang Si Zheng
  context; missing or unknown values remain unavailable rather than inferred.
  The view creates no score or standalone good/bad verdict. Its selection state
  also distinguishes two transformations that share one palace, so only the
  exact item chosen is pressed while the palace relationship stays shared.
  The complete app passes 73 test files / 710 tests, lint, and the strict
  production build. ChartDisplay remains lazy at 34.38 kB raw / 10.99 kB gzip,
  with every JavaScript chunk below 500 kB. A real production preview confirmed
  all four default-chart entries, exactly one selected transformation, one
  focus, one opposite, two trines, the linked palace explanation, no
  document-level horizontal overflow at desktop or 390-by-844 mobile, and no
  browser warning/error logs. This acceptance does not choose the final visual
  direction.
- Added a provider-independent San Fang Si Zheng reading layer to the natal
  chart, using qingnang.cc's public emphasis on whole-chart reading as a product
  benchmark without copying its code, design, or interpretive claims. Selecting
  any palace now derives the focus, opposite, and two trine palaces from the
  fixed earthly-branch order, highlights all four existing palace cards, and
  summarizes their English palace names, branches, major stars, brightness,
  and Four Transformations in the same local explanation surface. Switching or
  closing selection replaces or clears the complete relationship state.
  Unknown branches receive no invented relationship, empty palaces remain
  explicit, and the view states that it organizes context rather than
  calculating strength or determining an outcome. Pure tests cover all twelve
  branches, uniqueness, reciprocity, and the unknown-value boundary; rendered
  tests cover the four-card state and cleanup. The complete app passes 72 test
  files / 706 tests, lint, and the strict production build. ChartDisplay remains
  lazy at 31.59 kB raw / 10.30 kB gzip, with every JavaScript chunk below
  500 kB. A real production preview confirmed exactly one focus, one opposite,
  two trines, four summaries, no document-level horizontal overflow at desktop
  or 390-by-844 mobile, and no browser warning/error logs. This acceptance does
  not choose the final visual direction.
- Added the first provider-independent 13-candidate birth-time shortlist inside
  the approximate-time sensitivity panel, using qingnang.cc's public
  寻时定盘 progression as a product benchmark without copying its design or
  accuracy framing. The separately lazy flow requires an exact bundled
  birthplace; independently true-solar-resolves early Rat, eleven intervening
  blocks, and late Rat; groups candidates that become the same engine chart;
  and asks at most five skippable, non-sensitive adult past-event questions.
  The deterministic model uses only annual Life Palace placement, Major Limit
  palace, and the natal-palace locations of annual Four Transformations.
  Results show evidence points and every non-zero contribution. A no-clear
  outcome exposes no arbitrary apply action, while a third-place score tie is
  disclosed as a complete tier instead of being truncated by sort order.
  Candidate-specific corrected clock, correction minutes, and crossed date
  remain visible even when several civil entries share one engine chart.
  Candidate and annual-fact work yields to the main thread in cancellable
  batches, and question/result transitions move keyboard focus predictably.
  The result now preserves user agency after early stopping: remaining
  questions can be completed, every prior answer can be revised with immediate
  deterministic rescoring, and a one-answer-removal check discloses whether
  the current leader depends on one remembered event. Twins/multiples are
  explicitly named as a limitation. The flow makes no probability or minute-
  level claim.
  The birth form also accepts a completely unknown hour. Noon exists only as
  an internal engine position: the palace chart, local snapshot, AI reading,
  timeline, sharing, paid report, and compatibility prefill do not consume or
  display it. The all-block finder remains available, and applying a real
  civil candidate clears the placeholder state before derived features unlock.
  Applying a candidate is explicit, preserves `birthTimeReliable=false`,
  atomically replaces chart plus birth input, and clears chart-derived caches.
  Paid-report access, checkout, and generation are also invalidated by the
  exact chart/persona request identity when an applied candidate replaces the
  chart, preventing an old asynchronous result from re-entering the cleared
  cache. Once payment capture begins, chart replacement, Start Over, and
  persona changes remain locked until verification finishes so a successful
  purchase cannot be silently detached mid-capture. The complete app passes
  71 test files / 701 tests, lint, the strict
  production build, and the dependency audit with zero known vulnerabilities.
  The finder is a 22.15 kB raw / 7.71 kB gzip lazy chunk; ChartDisplay remains
  28.90 kB raw / 9.53 kB gzip, and every JavaScript chunk remains below 500
  kB. A real desktop production preview prepared all Chengdu candidates in
  about 1.3 seconds, asked five questions, displayed a transparent ranked
  ledger, applied Dragon Hour as a Rabbit-Hour solar-resolved approximate
  chart, rejected a prefix-only birthplace, and showed no document-level
  horizontal overflow. The plain preview's expected Vercel Analytics load log
  is not a product error.
- Made Compatibility use the same true-solar-time boundary as the natal chart.
  Person A now prefills from the saved chart without trusting stored derived
  time data, and either person can keep a birthplace plus explicitly enable
  local true-solar correction. Each enabled birthplace must resolve to an exact
  bundled city match before comparison; both corrected birth inputs are then
  rebuilt independently for the local score and the optional server reading.
  Edits, retries, persona changes, overlapping clicks, and unmounts cannot
  commit stale local results. The result names the matched city, minute
  correction, corrected shichen, and any date crossing for each person.
  Provider requests carry only allowlisted user-authoritative fields, omit the
  birthplace when correction is off, and are locally preflighted before they
  can consume a request. The complete app passes 68 test files / 670 tests,
  lint, the strict production build, and the dependency audit with zero known
  vulnerabilities. MatchAnalysis remains lazy at 20.55 kB raw / 6.58 kB gzip,
  and every JavaScript chunk remains below 500 kB. A real production preview
  confirmed Chengdu (-67 minutes, Snake Hour) and New York (-56 minutes, Goat
  Hour), rejected a prefix-only city with fixed copy, restored Person A from
  the saved chart, and showed no document-level horizontal overflow at the
  available desktop viewport.
- Closed the birth-time reliability dead end in the provider-independent chart.
  Selecting “Approximate or uncertain” now defaults automatic true-solar
  correction off while leaving an explicit re-enable available. The resulting
  chart labels its hour as approximate and adds a passive Birth-Time
  Sensitivity Check for the previous, selected, and next two-hour windows.
  Each candidate shifts the entered wall clock first, crosses calendar dates
  correctly around Rat Hour, then independently reapplies a manually enabled
  correction from the already-resolved local birthplace. The comparison shows
  Life Palace stars, Body Palace branch, element class, and a stable/changed
  summary; it never replaces the selected chart or claims to determine the
  correct time. Failure is fixed-copy, local, and retryable. Focused tests cover
  both date-boundary directions, true-solar recomputation, stable and changed
  structures, zero-fetch rendering, recorded-time absence, failure recovery,
  the form default, and explicit correction re-enable. The complete app passes
  68 test files / 650 tests,
  lint, the strict production build, and the moderate audit with zero known
  vulnerabilities. ChartDisplay remains lazy at 25.31 kB raw / 8.37 kB gzip,
  and every JavaScript chunk remains below 500 kB. A real desktop production
  preview confirmed that a recorded time keeps the comparison absent, an
  approximate selection turns correction off, and the resulting chart exposes
  exactly Earlier / Chart used / Later summaries plus the non-rectification
  boundary with no document-level horizontal overflow.
- Finished the chart's previously inert palace selection as a useful local
  reading surface. All palace cards are now keyboard-focusable toggle buttons
  with selection state and a shared explanatory panel. The panel covers the
  twelve canonical palaces, the Friends-palace engine alias, all fourteen major
  stars, and the no-major-star case in fixed English reflective language. It
  invents nothing for unknown engine labels and explicitly rejects single-
  symbol outcomes plus medical, financial, relationship, and career promises.
  Focused rendered and coverage tests protect opening, replacement, closing,
  semantic state, empty-palace copy, English-only content, and complete local
  coverage. The complete app passes 66 test files / 639 tests, lint, the strict
  production build, and the moderate audit with zero known vulnerabilities.
  ChartDisplay remains lazy and is 19.64 kB raw / 6.69 kB gzip; every
  JavaScript chunk remains below 500 kB. A real desktop production preview cast
  the default chart, opened Life Palace, replaced it with Wealth Palace, and
  closed the guide with no stale selected state or document-level horizontal
  overflow.
- Completed the Share Card's mobile delivery loop without adding an account,
  API, or remote upload. Browsers that prove PNG file sharing through
  `navigator.canShare` now receive a native Share Image action; all others keep
  the existing local download. The first click attempts direct sharing, while
  an expired Web Share activation retains the already-rendered file in memory
  and turns the second click into an immediate share-sheet action. Card-content
  changes discard prepared files, cancellation is quiet, unexpected browser
  errors use fixed announced copy, and download remains available. Vercel's
  Permissions Policy now explicitly allows same-origin `web-share`. A real
  production preview showed both actions at desktop and 390-by-844, with no
  document overflow or browser warning/error logs; the OS share sheet was not
  opened during acceptance. The complete app passes 64 test files / 632 tests,
  lint, the strict production build, and the moderate audit with zero known
  vulnerabilities. The lazy ShareCard chunk remains small at 11.02 kB raw /
  3.92 kB gzip, and every JavaScript chunk remains below 500 kB.
- Added the first provider-independent `/learn/<slug>` growth surface without
  opening an account, AI, or payment dependency. The script-free “What Is Zi
  Wei Dou Shu?” page contains 400-800 words of structured English copy, its own
  canonical/title/description/Open Graph metadata, a free-chart CTA, and the
  required entertainment/self-discovery boundary. The app footer provides the
  internal link; sitemap and robots files provide crawler discovery. A Vercel
  rewrite preserves the clean public URL while the source remains a true
  static HTML artifact. Focused contracts pin the route, metadata, structure,
  word range, approved claim vocabulary, CTA, disclaimer, and discovery files.
  The complete app now passes 64 test files / 628 tests, lint, the strict
  TypeScript production build, and the moderate dependency audit with zero
  known vulnerabilities; the built article is a 9.76 kB static file and adds
  nothing to the JavaScript chunks.
- Accepted the provider-independent core against the real 2026-07-24
  production Vite build. Desktop navigation cast the default blank-place chart,
  rendered the deterministic snapshot, built the focused Life Timeline and
  score radar, generated the default local Compatibility result, and verified
  Share Card draft cancel plus save. At 390-by-844, mobile navigation reached
  the existing chart and timeline result with no document-level horizontal
  overflow. The browser warning/error log stayed empty. The harness does not
  serve Vercel `api/`, so its authentication-unavailable header is expected and
  is not server/provider evidence.
- Prevented lazy birthplace data from blocking the base chart. Blank birthplace
  and disabled true-solar correction now bypass the location index; a failed
  index promise releases its owned cache entry for a later retry. Background
  matching catches failures instead of creating an unhandled rejection and
  shows fixed, input-described, non-blocking recovery copy. A rendered test
  proves failure containment and successful retry after editing the city.
- Closed the natal-reading error boundary without changing its visual design.
  Server-owned `ReadingApiError` copy remains available for actionable
  validation/availability states, while unknown runtime exceptions now map to
  one fixed retry message. The active failure is announced and linked to the
  reading action; retry clears it. Rendered tests prove unknown-detail
  containment, stable service-message preservation, and failure-to-success
  recovery under the existing request ownership guards.
- Contained Soul Card share failures. Image generation is now imperatively
  single-flight, always removes its temporary anchor, and replaces the
  raw-detail browser alert with an action-linked announced retry state.
  Clipboard success is announced with bounded timer cleanup; clipboard failure
  exposes the canonical address for manual copying and keeps retry available.
  Four new rendered tests cover 2x PNG output, duplicate suppression,
  download-activation failure/recovery, and clipboard failure-to-success.
- Made Share Card quote editing reversible and export-bounded. The textarea now
  owns a separate draft, Cancel restores the previously committed quote, and
  Done trims and saves. An explicit accessible name, live count, and redundant
  state/textarea 240-character boundary protect the fixed export layout.
  Rendered tests cover save, cancel-after-save, and overlong programmatic input.
- Fixed a hidden Life Timeline failure path. A local calculation exception
  previously wrote error copy into a loading-only label and immediately hid it
  when the Build button returned. The feature now restores the enabled Build
  action with an action-linked announced alert, keeps the cache empty, and
  clears the stale error when retry begins. A rendered failure-to-success test
  verifies that the second attempt commits the timeline and reveals the year
  selector.
- Made local Share Card image export recoverable and single-flight. An
  imperative guard prevents concurrent html2canvas work even under duplicate
  activation, while the button exposes its busy state. Canvas, encoding, or
  download failure now restores the action and shows stable, action-linked,
  announced retry copy instead of a blocking browser alert or raw exception.
  Retrying clears the stale error, and the temporary download anchor is removed
  even if download activation throws. Focused tests cover the existing 2x PNG
  contract plus duplicate suppression and failure-to-success recovery.
- Split Life Timeline's radar visualization from its entry path. Opening the
  feature now loads the Recharts timeline shell, scope disclaimer, empty state,
  and build action without ECharts; ScoreRadar loads through a compact,
  failure-contained panel only after a timeline has an active year. The
  LifeKLine chunk fell from 842.58 kB / 272.38 kB gzip to
  351.80 kB / 105.52 kB gzip, while the deferred ScoreRadar is
  489.92 kB / 167.10 kB gzip. Every generated JavaScript chunk is now below
  500 kB, so the production build emits no large-chunk warning. Production-
  preview resource inspection found LifeKLine but no ScoreRadar request or
  canvas before Build; afterward ScoreRadar loaded, one ECharts canvas and the
  year selector rendered, the lifespan disclaimer remained visible, and the
  browser warning/error log stayed empty.
- Added local failure containment to every lazy product region. ChartDisplay,
  optional AI narrative, Life Timeline, Compatibility, and the populated Share
  Card now share an announced pending state plus an error boundary that keeps
  the app shell and unrelated features mounted. A failed module or render
  exposes stable recovery copy and an explicit page reload, which is required
  because React caches rejected lazy-import promises. Focused rendered tests
  cover both the loading status and contained failure/reload action. The
  production main script remains below the warning threshold; after the nested
  timeline split it is 487.20 kB / 140.51 kB gzip.
- Removed chart and secondary-surface work from the landing bundle without
  changing product behavior. BirthForm now renders its twelve shichen options
  from an engine-independent helper, then loads iztro and ChartDisplay only
  after submission. Optional AI narrative, Life Timeline, Compatibility, and
  the populated Share Card remain separate lazy boundaries with announced
  loading states; the no-chart Share Card recovery stays immediate. Navigation
  updates the document title with the existing analytics virtual route. The
  production main script fell from 1,416.78 kB / 421.89 kB gzip to
  485.86 kB / 140.04 kB gzip (65.7% raw and 66.8% gzip smaller). Browser
  resource inventory confirmed no `astro-*` request before submission and
  `astro-*` plus `ChartDisplay-*` requests afterward; the default chart, local
  snapshot, optional-AI state, Compatibility, and populated Share Card all
  rendered with correct titles and no warning/error log.
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

Earlier builds reported a non-fatal large-chunk warning. The current split
build keeps every generated JavaScript chunk below 500 kB and emits no such
warning.

Full local verification on 2026-07-23 passed `npm run lint`, all 43 Vitest
files / 363 tests in three consecutive full-suite runs, `npm run build`
(including the root-referenced strict API project), a direct `tsc -b`,
production and full-tree audits at zero after a clean `npm ci`, `actionlint`
v1.7.12, PowerShell AST parsing for all Release Proof scripts, the sanitized
no-`psql` failure exercise, and `git diff --check`. The existing large-chunk
warning remained non-fatal. These are local mock/contract/static checks, not a
hosted database run, deployment proof, or Supabase/PayPal/other provider proof.

The current cumulative local baseline passed 63 Vitest files / 624 tests in
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
chart scrolling, and a clean current-chunk warning/error log. The current build
emits no chunk-over-500-KB warning. This remains local
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

- Before expanding birth-time finding beyond five questions or its current
  structural evidence model, test the wording, understood confidence boundary,
  and usefulness with at least five people who genuinely lack an exact birth
  time. Treat event recall and the one-year probe inside each displayed
  three-year window as known limitations; do not add sensitive events, AI
  prose, persistence, probabilities, or a paid upgrade without a new reviewed
  decision.
- Expand `/learn/<slug>` only with an owner-approved topic or supplied outline;
  keep each page static, script-free, 400-800 English words, linked in the
  sitemap, and within the established claim boundary. Prove the first
  extensionless route in an isolated Vercel Preview before calling it live.
- Treat the next approved candidate as a provider-independent core release:
  keep both public-AI and Future Report payment flags false, run the hosted
  candidate gates, then repeat the accepted chart/timeline/compatibility/share
  flow in an isolated Vercel Preview before promotion.
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
- Before final UI design or polish begins, pause for owner participation and
  agree the visual direction, color/typography treatment, information density,
  and mobile character before implementing a style change.

[PROTOCOL]: Update this file after each feature, fix, release, deployment change,
or notable verification run.
