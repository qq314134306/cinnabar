-- ============================================================
-- Cinnabar — server-authoritative Future Report chart snapshots
-- Apply after 20260723020000_paypal_webhook_reconciliation.sql.
-- ============================================================

-- The initial dormant payment schema accepted the old browser-built facts
-- shape. Payments were never enabled with that contract. Replace it with the
-- versioned server snapshot shape before the feature can be considered for
-- deployment.
alter table public.future_report_purchases
  drop constraint if exists future_report_generation_input_shape_check;

alter table public.future_report_purchases
  add constraint future_report_generation_input_shape_check check (
    generation_input is null
    or (
      jsonb_typeof(generation_input) = 'object'
      and generation_input ->> 'snapshotVersion' = 'future-report.server-chart.v1'
      and jsonb_typeof(generation_input -> 'birth') = 'object'
      and generation_input #>> '{birth,calendar}' = 'solar'
      and (generation_input #>> '{birth,date}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and jsonb_typeof(generation_input #> '{birth,hour}') = 'number'
      and (generation_input #>> '{birth,gender}') in ('male', 'female')
      and jsonb_typeof(generation_input #> '{birth,birthTimeReliable}') = 'boolean'
      and jsonb_typeof(generation_input #> '{birth,trueSolarEnabled}') = 'boolean'
      and (
        generation_input #> '{birth,location}' = 'null'::jsonb
        or (
          jsonb_typeof(generation_input #> '{birth,location}') = 'object'
          and jsonb_typeof(generation_input #> '{birth,location,name}') = 'string'
          and (
            generation_input #> '{birth,location,country}' = 'null'::jsonb
            or jsonb_typeof(generation_input #> '{birth,location,country}') = 'string'
          )
          and jsonb_typeof(generation_input #> '{birth,location,timezone}') = 'string'
          and jsonb_typeof(generation_input #> '{birth,location,longitude}') = 'number'
        )
      )
      and jsonb_typeof(generation_input #> '{birth,resolved}') = 'object'
      and (generation_input #>> '{birth,resolved,date}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and jsonb_typeof(generation_input #> '{birth,resolved,hour}') = 'number'
      and jsonb_typeof(generation_input #> '{birth,resolved,minute}') = 'number'
      and jsonb_typeof(generation_input #> '{birth,resolved,timeIndex}') = 'number'
      and jsonb_typeof(generation_input #> '{birth,resolved,correctionMinutes}') = 'number'
      and jsonb_typeof(generation_input #> '{birth,resolved,trueSolarApplied}') = 'boolean'
      and (generation_input ->> 'persona') in ('scholar', 'sage')
      and jsonb_typeof(generation_input -> 'currentYear') = 'number'
      and jsonb_typeof(generation_input -> 'years') = 'array'
      and (
        (tier = '1-year' and jsonb_array_length(generation_input -> 'years') = 2)
        or
        (tier = '5-year' and jsonb_array_length(generation_input -> 'years') = 5)
      )
      and jsonb_typeof(generation_input -> 'chartFacts') = 'string'
      and length(generation_input ->> 'chartFacts') between 1 and 30000
      and jsonb_typeof(generation_input -> 'yearlyFacts') = 'string'
      and length(generation_input ->> 'yearlyFacts') between 1 and 30000
      and (generation_input ->> 'chartFingerprint') ~ '^[0-9a-f]{64}$'
    )
  );

alter table public.future_report_purchases
  add constraint future_report_snapshot_fingerprint_match_check check (
    generation_input is null
    or (
      chart_fingerprint is not null
      and chart_fingerprint = generation_input ->> 'chartFingerprint'
    )
  );

comment on column public.future_report_purchases.generation_input is
  'Versioned server-rebuilt chart snapshot. Browser facts, requested years, coordinates, timezone, and prompts are never accepted.';
