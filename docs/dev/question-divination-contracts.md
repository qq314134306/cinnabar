# Question Divination Fact Contracts

> L3 | Parent: `project-map.md`

## Scope

Question Charts captures one immutable event but currently fails closed before
chart calculation. The first foundation included deterministic placeholders;
they are not complete Liu Yao, Qi Men Dun Jia, or Da Liu Ren algorithms and are
not production fact sources. The production surface does not merge conclusions,
write an interpretation, rank a method, assign a score, or expose placeholder
facts.
User-facing copy is English for Western audiences
and uses the product boundary “For entertainment & self-discovery only. Not
professional advice.” It does not market fortune telling, psychic service, or
consulting.

## Immutable event

`question-event.v1` contains the trimmed question, one ISO instant, one valid
IANA timezone, and user-entered location evidence. The event and nested
evidence are frozen before any provider runs. Every result retains the exact
same event object.

## Independent facts

| Method | Contract | Local ruleset |
| --- | --- | --- |
| Liu Yao | `liuyao.facts.v1` | `time-seeded-local-v1` |
| Qi Men Dun Jia | `qimen.facts.v1` | `mainline-cn-v1-minimal` |
| Da Liu Ren | `liuren.facts.v1` | `cinnabar-liuren-local-v1` |

The versioned shapes remain development contracts for future verified engines.
Each unavailable production result carries `provider`, `providerVersion`, `contractVersion`, `status`,
an explicit free `question-structural-facts` entitlement, and a stable failure
category. Consumers must branch on `status`; missing facts
are not partial success. Production returns `ENGINE_UNAVAILABLE` with no facts
until each contract is backed by a complete, independently verified local
engine and golden fixtures.

## Provider and network boundary

Production has no remote fallback and does not call the development placeholder
calculators. Invalid event, timezone, ambiguous/nonexistent DST wall time, or
unavailable engine fails closed. The anonymous offline fixture in
`app/src/lib/question-divination.fixtures.ts` is the only golden sample in this
stage. AOV may be used out of band to review a fixed anonymous sample, but no
AOV request, response, prompt, secret, or availability dependency belongs in
the production path.

The browser currently produces no chart facts. A future DeepSeek English prose
layer may consume only facts from completed verified local engines at a separate
server-owned boundary; `DEEPSEEK_API_KEY` and provider prompts must never enter
this client module. The question event is not a birth profile and cannot read,
infer, backfill, or overwrite canonical birth time. Future free facts remain
independent of paid three-method synthesis and credit-accounting boundaries.

## Verification

The model test pins immutable event validation, IANA wall-clock conversion,
DST gap/fold rejection, versioned unavailable metadata, and the development
fixture. The component test proves all three production surfaces fail closed
without facts or external service use. The App test pins the lazy route.

[PROTOCOL]: Update this file when an event field, fact contract, provider,
ruleset, fixture, or failure category changes.
