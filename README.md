# Video Wizard

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Remotion](https://img.shields.io/badge/Remotion-4.x-purple)](https://www.remotion.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://www.python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Open-source toolkit for AI-powered video content workflows: identify
viral clips, generate styled subtitles, and render social-ready vertical
videos. Self-hostable, local-first, no SaaS lock-in.

Video Wizard is a self-hosted alternative to tools like Opus Clip and Submagic. It works as an AI video clipper, an automatic subtitle generator (auto-captions with Whisper) and a short-form video maker for TikTok, Instagram Reels and YouTube Shorts. Built with Next.js, FastAPI and Remotion.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/el-frontend/video-wizard?style=social)](https://github.com/el-frontend/video-wizard/stargazers)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](#quick-start)

The studio uses a single Better Auth account for projects, media, tools and jobs.

## What you get

| Feature                  | Route                   | What it does                                                                                                  |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Subtitle Generator**   | `/subtitle-generator`   | Upload or paste YouTube → transcribe (Whisper) → edit subtitles → pick from 9 templates → render via Remotion |
| **Video Wizard**         | `/video-wizard`         | Full pipeline: transcribe → GPT-4o scores 30-90s viral clips → render the winners                             |
| **Content Intelligence** | `/content-intelligence` | Paste a transcript → viral-clip analysis without uploading video                                              |
| **Job History**          | `/jobs`                 | Per-user list of every transcription / render / clip / analysis with status, progress and error messages      |
| **Remotion Studio**      | `/remotion`             | Reserved endpoint (501 after authentication)                                                                  |

**Caption templates included:** viral, minimal, modern, default, highlight,
colorshift, hormozi, mrbeast, mrbeastemoji.

**Output formats:** vertical 9:16 (TikTok / Reels / Shorts), square 1:1,
portrait 4:5, landscape 16:9. Brand-kit overrides for logo, colors and
fonts apply to every template.

## Application theme

The [shared UI stylesheet](./packages/ui/src/styles/globals.css) defines the Video Wizard
application theme. The Dashboard, sidebar, Studio and existing tools use the same semantic
color tokens and Geist typography. Selectable video style packs and brand kits define the
colors and typography inside the video preview and exported media.

## Quick start

Configure PostgreSQL and two independent private secrets, run the migration and seed the workspace explicitly. Open <http://localhost:3000/signin>. New accounts can also register at `/signup`. Local Whisper and manual clips work without provider keys.

- [Install, migrate and sign in](./docs/authentication.md)
- [Docker Compose setup](./docs/DOCKER_SETUP.md)

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
- **Better Auth + Drizzle** — email/password accounts, database sessions and scoped service credentials. Media downloads and preview snapshots are owner-scoped.

Full details: [AGENTS.md](./AGENTS.md) (architecture & conventions),
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (system overview).

## Tech stack

- **Frontend:** Next.js 16 (App Router, Turbopack), TypeScript strict,
  Tailwind v4, shadcn-style components, Vercel AI SDK + GPT-4o,
  Better Auth 1.7.27.
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

1. Follow the [local setup](./docs/DOCKER_SETUP.md).
2. Sign in and open a project.
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
