# Video Wizard

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Remotion](https://img.shields.io/badge/Remotion-4.x-purple)](https://www.remotion.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://www.python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Open-source toolkit for AI-powered video content workflows: identify
viral clips, generate styled subtitles, and render social-ready vertical
videos. Self-hostable, local-first, no SaaS lock-in.

> **Status (May 2026):** Subtitle Generator is the most polished flow.
> Renders run on a real PostgreSQL-backed task queue with retry/backoff,
> so the UI stays responsive while a worker drains long jobs. Auth is
> email + bcrypt password against the local database.

## What you get

| Feature                            | Route                       | What it does                                                                                                  |
|------------------------------------|-----------------------------|---------------------------------------------------------------------------------------------------------------|
| **Subtitle Generator**             | `/subtitle-generator`       | Upload or paste YouTube → transcribe (Whisper) → edit subtitles → pick from 9 templates → render via Remotion |
| **Video Wizard**                   | `/video-wizard`             | Full pipeline: transcribe → GPT-4o scores 30-90s viral clips → render the winners                             |
| **Content Intelligence**           | `/content-intelligence`     | Paste a transcript → viral-clip analysis without uploading video                                              |
| **Job History**                    | `/jobs`                     | Per-user list of every transcription / render / clip / analysis with status, progress and error messages     |
| **Remotion Studio**                | `/remotion`                 | Low-level template authoring                                                                                  |

**Caption templates included:** viral, minimal, modern, default, highlight,
colorshift, hormozi, mrbeast, mrbeastemoji.

**Output formats:** vertical 9:16 (TikTok / Reels / Shorts), square 1:1,
portrait 4:5, landscape 16:9. Brand-kit overrides for logo, colors and
fonts apply to every template.

## Quick start (one command)

You need [Docker Desktop](https://docs.docker.com/get-docker/) (or any
compose-v2 runtime).

```bash
cp .env.docker.example .env.docker
# Edit two values:
#   AUTH_SECRET     — openssl rand -base64 32
#   OPENAI_API_KEY  — https://platform.openai.com/api-keys

docker compose up
```

Then open <http://localhost:3000/signup>, create an account, and run a
video through the Subtitle Generator. The `/jobs` page will show the
render progress in real time as the worker drains the queue.

For a manual / hybrid setup (Node on host, Python and Postgres in
Docker — faster iteration), see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Architecture

```
apps/
├── web/                Next.js 16 + TS — UI, /api routes, queue worker
├── processing-engine/  Python + FastAPI — Whisper, FFmpeg, MediaPipe
└── remotion-server/    Express + Remotion — caption rendering
packages/
└── remotion-compositions/  9 caption templates as React components
```

Three highlights worth knowing:

- **Screaming architecture** — file structure tells you what the app does.
  `features/video/` is "I handle video processing"; `server/services/`
  owns business logic; API routes are HTTP-only.
- **Real task queue** — long renders go through `task_queues` /
  `queue_tasks` Postgres tables. The worker (`pnpm worker`) claims tasks
  atomically via `SELECT ... FOR UPDATE SKIP LOCKED`, retries with
  exponential backoff, and forwards Remotion's per-frame progress to the
  user-facing job row so `/jobs` stays live.
- **Auth.js v5 + Drizzle** — email + bcrypt password stored in PostgreSQL.
  Auth.js OAuth tables are already in the schema for when you want to
  add Google / GitHub / etc.

Full details: [AGENTS.md](./AGENTS.md) (architecture & conventions),
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (system overview).

## Tech stack

- **Frontend:** Next.js 16 (App Router, Turbopack), TypeScript strict,
  Tailwind v4, shadcn-style components, Vercel AI SDK + GPT-4o,
  Auth.js v5 (Credentials provider).
- **Database:** PostgreSQL 17 + Drizzle ORM (`pnpm db:generate` /
  `db:migrate` / `db:studio`).
- **Queue / worker:** Postgres-backed (no Redis), drained by a
  standalone `tsx` script (`pnpm --filter web worker`).
- **Backend:** Python 3.11 + FastAPI, OpenAI Whisper, MediaPipe,
  FFmpeg.
- **Render:** Remotion 4, Express job queue.
- **Tooling:** pnpm + Turborepo, Husky + lint-staged + commitlint
  (Conventional Commits).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The TL;DR:

1. `cp .env.docker.example .env.docker` (set `AUTH_SECRET` + `OPENAI_API_KEY`).
2. `docker compose up`.
3. Pick something from the
   [`good first issue`](https://github.com/<owner>/<repo>/labels/good%20first%20issue)
   label or one of the suggested high-leverage areas in CONTRIBUTING.md.
4. Conventional Commits, focused PRs, screenshots for UI changes.

Ground rules live in [AGENTS.md](./AGENTS.md): no `any`, business logic
stays in services, long work goes through the queue.

## Documentation map

- [AGENTS.md](./AGENTS.md) — full architecture, API reference, all conventions
- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, PR flow, where to start
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system overview
- [docs/COMMIT_CONVENTIONS.md](./docs/COMMIT_CONVENTIONS.md) — Conventional Commits
- [docs/DOCKER_SETUP.md](./docs/DOCKER_SETUP.md) — Docker setup notes
- [docs/HUSKY_SETUP.md](./docs/HUSKY_SETUP.md) — Git hooks
- [docs/SUBTITLE_TIMING_ADJUSTMENT.md](./docs/SUBTITLE_TIMING_ADJUSTMENT.md) — caption sync tuning

## License

[MIT](./LICENSE) © Video Wizard Contributors.
