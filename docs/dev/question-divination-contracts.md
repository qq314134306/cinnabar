# Question Divination Fact Contracts

> L3 | Parent: `project-map.md`

## Scope

Question Charts captures one event and calculates three independent structural
fact sets. This window does not merge conclusions, write an interpretation,
rank a method, or assign a score. Its versioned outputs are the stable input for
the separately owned first-release Question Three-Method synthesis boundary.
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

Each result carries `provider`, `providerVersion`, `contractVersion`, `status`,
an explicit free `question-structural-facts` entitlement, and a stable failure
category. Consumers must branch on `status`; missing facts
are not partial success. These v1 contracts intentionally expose only minimum
auditable structure and must not be described as a full scholarly
reconstruction.

## Provider and network boundary

Production uses only `cinnabar-local` and has no remote fallback. Invalid event,
timezone, or calculation input fails closed. The anonymous offline fixture in
`app/src/lib/question-divination.fixtures.ts` is the only golden sample in this
stage. AOV may be used out of band to review a fixed anonymous sample, but no
AOV request, response, prompt, secret, or availability dependency belongs in
the production path.

The browser produces verified facts only. The first-release DeepSeek English
prose layer is a separate server-owned boundary that receives only validated, versioned
facts; `DEEPSEEK_API_KEY` and provider prompts must never enter this client
module. The question event is not a birth profile and cannot read, infer,
backfill, or overwrite canonical birth time. Free facts remain independent of
paid three-method synthesis prose and credit-accounting boundaries. This window
exports the entitlement marker but does not spend credits or integrate payment.

## Verification

The model test pins immutability, validation, shared event identity,
independent versions, provider metadata, and the golden fixture. The component
test proves the complete event is required and three fact surfaces render
separately. The App test pins the lazy route.

[PROTOCOL]: Update this file when an event field, fact contract, provider,
ruleset, fixture, or failure category changes.
