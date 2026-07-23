# Claude Project Entry Point

This file is a compatibility entry point for Claude-based coding agents. The
authoritative project instructions live in `AGENTS.md` and `docs/dev/`; do not
use this file as a second project-status document.

## Required startup order

Before changing files, read these documents completely and in order:

1. [`AGENTS.md`](AGENTS.md) - project rules and the startup contract.
2. [`docs/dev/progress.md`](docs/dev/progress.md) - current state, recent work,
   and next risks.
3. [`docs/dev/project-map.md`](docs/dev/project-map.md) - architecture, module
   ownership, and data flow.
4. [`docs/dev/decisions.md`](docs/dev/decisions.md) - decisions that must not be
   rediscovered.
5. [`app/AGENTS.md`](app/AGENTS.md) - app-specific boundaries before touching
   `app/`.

If the task touches build, test, release, GitHub, Vercel, or deployment, also
read [`docs/dev/workflow.md`](docs/dev/workflow.md).

## Working contract

- Follow the closest applicable `AGENTS.md` for every file you change.
- Inspect before editing, and preserve unrelated user or parallel-agent changes.
- Use `docs/dev/progress.md` as the source of truth for current project state.
- Keep implementation, focused tests, and the authoritative documentation in
  agreement.
- Run app commands from `app/` unless the project instructions say otherwise.
- Keep this file encoded as UTF-8.

This compatibility file intentionally contains no roadmap, architecture
snapshot, credentials, or deployment-status claims. Update the authoritative
documents instead.
