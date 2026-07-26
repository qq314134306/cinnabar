# Ziwei Project Agent Guide

> L1 | Project constitution and startup map for agentic development.

## Startup Protocol

Read these files before changing code:

1. `AGENTS.md` - project rules, commands, current development contract.
2. `docs/dev/progress.md` - current state, recent work, next risks.
3. `docs/dev/project-map.md` - architecture, module ownership, data flow.
4. `docs/dev/decisions.md` - decisions that must not be rediscovered.
5. `app/AGENTS.md` - app-specific boundaries before touching `app/`.

If the task touches deployment, also read `docs/dev/workflow.md`.

## Project Position

Ziwei is a React + TypeScript + Vite Zi Wei Dou Shu charting application. It
combines chart generation, true solar time correction, birthplace coordinate
matching, structured knowledge retrieval, AI interpretation, and direct Vercel
deployment from the canonical GitHub repository.

## Repository Map

<directory>
app/ - Web application source, tests, build config, and frontend assets.
docs/ - User-facing docs, licenses, plans, and development memory.
supabase/ - Database migrations, auth email templates, and Release Proof tests.
.github/workflows/ - Candidate verification and database-proof automation.
</directory>

<config>
app/package.json - npm scripts and frontend dependencies.
app/vite.config.ts - Vite build and test configuration.
.github/workflows/sync-zwknows.yml - Legacy-named pure candidate verification and Fresh database proof; it has no deployment or mirror job.
</config>

## Commands

Run from `app/` unless noted:

```powershell
npm run dev
npm run lint
npm run test
npm run build
npm run test -- sync-zwknows
```

Useful repository checks from root:

```powershell
git status --short --branch
git log --oneline -n 8
git ls-remote origin refs/heads/main
```

## Documentation Is Code

Any meaningful code change must update documentation in the same work unit.
This is a project rule, not optional cleanup.

Update the nearest matching document:

- Behavior, product state, or development progress changes: `docs/dev/progress.md`
- Architecture, module ownership, or data flow changes: `docs/dev/project-map.md`
- Long-lived technical or product decision changes: `docs/dev/decisions.md`
- Build, test, release, GitHub, or Vercel flow changes: `docs/dev/workflow.md`
- App module boundaries or important app files change: `app/AGENTS.md`
- Top-level structure or project contract changes: this `AGENTS.md`

A change is not complete until code, tests, and documentation agree.

## Engineering Rules

- Inspect before editing.
- Keep changes scoped to the user request.
- Preserve existing behavior unless the user explicitly accepts a breaking change.
- Prefer simple data structures over special-case branching.
- Do not revert user changes unless explicitly asked.
- For frontend changes, verify visual behavior in a browser when practical.
- For business logic changes, add or update focused tests.
- For deployment automation changes, test the workflow file or the command path that
  exercises it.

## Current Deployment Model

`qq314134306/cinnabar` is the canonical source repository.
Authenticated deployment inspection confirmed that Vercel reads that
repository's `main` branch directly with `app` as its Root Directory. There is
no deployment mirror in the current architecture.

The intended release sequence is:

1. Open a candidate pull request in the canonical repository.
2. Require both the application `verify` job and isolated Fresh
   `database-proof` job before merge.
3. Merge the proven candidate into protected `main`; the exact `main` commit
   starts both the pure verification workflow and Vercel's direct Git build.
4. Hold production promotion or domain assignment behind Vercel Deployment
   Checks, or an equivalent staged/manual promotion, until both checks for that
   exact commit succeed and the sanitized database artifact is inspected.

Vercel deployment is downstream of the candidate gate, not a replacement for
it. The combination of branch protection and required pull-request checks
prevents unverified merges, while deployment checks or staged promotion prevent
the Vercel build and `main` Actions run from racing to production. The canonical
fork's Actions are currently disabled and its Actions secrets are empty, so
this candidate gate has no hosted execution evidence yet. The workflow itself
is pure verification and needs no deployment credential; do not create or
depend on a mirror PAT.

Workflow configuration and local contract tests are not evidence that the
hosted GitHub Actions run succeeded. Inspect the hosted run and its sanitized
database-proof artifact before claiming the gates are operational or a release
has proof. The current Vercel environment has the existing Supabase, Make, and
DeepSeek variable names, but still lacks `APP_ORIGIN`, `AUTH_MODE`,
`SESSION_ENCRYPTION_KEY`, and the complete public-AI enable/quota variable set.
Never record their values in repository documentation. Keep public AI
default-off and authentication on its rollback-safe legacy path until their
separate migration, preview, and provider proofs pass. Future Report payments
remain the final rollout stage and stay disabled.

[PROTOCOL]: Update this file when the top-level architecture, commands, deployment
model, or documentation contract changes.
