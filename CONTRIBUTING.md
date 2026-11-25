# Contributing to Video Wizard

Thanks for your interest in contributing! Video Wizard is a monorepo for
AI-powered video analysis, viral clip extraction and subtitle generation.
This guide gets you from clone to first PR.

## Development setup

For a new installation, follow the [Docker setup](./docs/DOCKER_SETUP.md). The [authentication guide](./docs/authentication.md) covers existing databases, host-side Next/Python development, explicit catalog seeding and isolated acceptance fixtures. Run the renderer in its Docker container.

## Project layout

Detailed architecture lives in [AGENTS.md](./AGENTS.md). The 30-second
version:

```
apps/
├── web/                      Next.js 16 + TS — UI, API routes, queue worker
│   ├── app/                  App Router pages + /api routes
│   ├── features/video/       Subtitle generator, video wizard hooks/components
│   ├── server/services/      Business logic (analysis, render, jobs, queue)
│   ├── server/worker/        Worker loop + handler registry
│   ├── server/db/            Drizzle schema + migrations
│   └── scripts/worker.ts     Worker entrypoint (`pnpm worker`)
├── processing-engine/        Python + FastAPI — Whisper, FFmpeg, face detection
└── remotion-server/          Express + Remotion — caption rendering
packages/
├── remotion-compositions/    9 caption templates (viral, hormozi, mrbeast, ...)
├── ui/                       Shared shadcn-style components
├── eslint-config/
└── typescript-config/
```

## Architecture rules of thumb

The repo follows **screaming architecture** — file structure tells you
what the app does. A few hard rules:

- **API routes are HTTP-only.** Parse the body, call a service, return.
  Business logic lives in `server/services/*`.
- **Services own business logic.** Reusable, no HTTP concerns,
  independently testable.
- **Long-running work goes through the queue.** If it takes more than a
  few seconds, create a job, enqueue it, return the job id. The render
  endpoint is the reference: `app/api/render-video-subtitles/route.ts` →
  `server/worker/handlers.ts`.
- **No `any`, no `alert()`, no business logic in components.** Use Zod
  schemas, Sonner toasts, and feature hooks.

Full guidance: [AGENTS.md](./AGENTS.md).

## Making a change

### Branch + commit conventions

- Branch names: `feature/<short-name>`, `fix/<short-name>`,
  `refactor/<short-name>`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  with the scopes already in use: `feat(auth)`, `fix(jobs)`,
  `refactor(worker)`, `docs(readme)`, etc. Husky enforces the format on
  commit. See [docs/COMMIT_CONVENTIONS.md](./docs/COMMIT_CONVENTIONS.md).
- Keep PRs focused. A 200-line PR with one concern is much easier to
  review than a 2000-line PR with five.

### Before opening a PR

```bash
pnpm --filter web lint        # Should report only pre-existing warnings
npx tsc --noEmit -p apps/web/tsconfig.json   # Should be silent
```

If you touched migrations, run `pnpm --filter web db:generate` and
commit the new SQL + snapshot under `apps/web/server/db/migrations/`.

### Opening the PR

Use the PR template. Prioritize:

1. **What** — one-paragraph summary.
2. **Why** — link an issue, or explain the user-visible payoff.
3. **Test plan** — how you verified it works locally. Screenshots /
   short clips welcome for UI changes.

## Where to start (for new contributors)

Browse the [`good first issue`](https://github.com/<owner>/<repo>/labels/good%20first%20issue)
label. If there's nothing there, high-leverage areas with low coupling:

- **Migrate the other endpoints to the queue.** `/api/generate-subtitles`
  and `/api/create-clip` still run synchronously. The render endpoint is
  the reference implementation.
- **New caption templates** in `packages/remotion-compositions/src/templates/`.
  Each template is a self-contained React component.
- **Tests.** The repo has zero automated tests today. Wins like a
  Playwright E2E for the subtitle-generator happy path are gold.
- **Storage abstraction.** Today everything lives on local disk. A
  pluggable interface (local | S3 | R2) unblocks any production deploy.

## Code of Conduct

Be kind, assume good intent, give specific feedback. Issues, PRs and
discussion threads should be useful to read months later.

## Questions

Open a [Discussion](https://github.com/<owner>/<repo>/discussions)
before a PR if you're not sure about an approach — saves both of us time.
