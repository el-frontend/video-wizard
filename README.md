# Video Wizard 🎬

AI-powered video content analysis, viral clip identification, and subtitle generation platform.

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Remotion](https://img.shields.io/badge/Remotion-4.x-purple)](https://www.remotion.dev/)
[![Python](https://img.shields.io/badge/Python-3.9+-green)](https://www.python.org/)

## 🎯 Features

### 1. 🎬 Video Wizard (Full Pipeline)

Complete viral clip identification and generation workflow.

- Upload video → Transcribe → AI analysis → Extract clips (30-90s)
- Viral scoring (0-100) powered by GPT-4o
- Subtitle editing & template selection
- Professional video rendering

**Route**: [`/video-wizard`](http://localhost:3000/video-wizard)

### 2. 📝 Subtitle Generator ✅

Fast subtitle generation without content analysis.

- Upload → Transcribe → Edit → Select template → Render
- 9 professional templates (viral, minimal, modern, hormozi, mrbeast, etc.)
- Visual subtitle editor with merge/delete
- Synchronized timing (200ms offset)

**Route**: [`/subtitle-generator`](http://localhost:3000/subtitle-generator)

### 3. 🤖 Content Intelligence

AI-powered transcript analysis without video upload.

- Paste transcript → Analyze for viral moments
- Content scoring and insights
- Quick analysis workflow

**Route**: [`/content-intelligence`](http://localhost:3000/content-intelligence)

### 4. 🎨 Remotion Studio

Advanced video composition for developers.

**Route**: [`/remotion`](http://localhost:3000/remotion)

## 🏗️ Architecture

### Monorepo Structure

```
video-wizard/
├── apps/
│   ├── web/                      # Next.js 16 + TypeScript
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── generate-subtitles/      # ✅ Subtitle generation
│   │   │   │   ├── render-video-subtitles/  # ✅ Render with templates
│   │   │   │   └── analyze-content/         # AI analysis
│   │   │   ├── subtitle-generator/          # ✅ Subtitle feature page
│   │   │   ├── video-wizard/                # Full pipeline
│   │   │   └── content-intelligence/        # Transcript analysis
│   │   ├── features/
│   │   │   └── video/
│   │   │       ├── components/
│   │   │       │   ├── subtitle-editor.tsx       # ✅ Edit UI
│   │   │       │   └── template-selector.tsx     # ✅ Template picker
│   │   │       ├── containers/
│   │   │       │   └── subtitle-generator-container.tsx  # ✅
│   │   │       └── hooks/
│   │   │           ├── use-video-processing.ts
│   │   │           └── use-subtitle-generation.ts # ✅
│   │   ├── server/
│   │   │   └── services/
│   │   │       └── subtitle-generation-service.ts # ✅
│   │   └── components/
│   │       └── layout/
│   │           └── app-sidebar.tsx           # Navigation
│   ├── remotion-server/          # Express + Remotion
│   │   ├── server/
│   │   │   ├── index.ts          # API & job queue
│   │   │   └── render-queue.ts
│   │   └── renders/              # Output videos
│   └── processing-engine/        # Python + FastAPI
│       ├── main.py               # API server
│       ├── analyzer.py           # AI analysis
│       ├── renderer.py           # FFmpeg processing
│       └── audio_service.py      # Whisper transcription
├── packages/
│   ├── remotion-compositions/    # Video templates
│   │   ├── src/
│   │   │   ├── templates/        # 9 subtitle templates
│   │   │   ├── hooks/
│   │   │   │   └── useActiveSubtitle.ts  # Timing logic
│   │   │   └── Root.tsx          # Composition registry
│   ├── ui/                       # Shared components
│   └── tsconfig/                 # TypeScript configs
└── docs/                         # 📚 Documentation
│       ├── renderer.py           # Video rendering with FFmpeg
│       ├── audio_service.py      # Audio extraction & transcription
│       └── requirements.txt      # Python dependencies
├── packages/
│   ├── remotion-compositions/   # 📦 Remotion Compositions (NEW)
│   │   └── src/
│   │       ├── compositions/    # Video compositions
│   │       ├── templates/       # Caption templates
│   │       └── hooks/           # React hooks
│   ├── ui/                      # Shared UI components
│   └── tsconfig/                # Shared TypeScript configs
├── .copilot/                    # ✅ GitHub Copilot documentation
│   ├── project-instructions.md  # Project guidelines
│   ├── code-patterns.md         # Code templates
│   └── architecture-decisions.md # Technical decisions
├── ARCHITECTURE.md              # ✅ Architecture overview
├── FEATURE_GUIDE.md             # ✅ Feature development guide
└── turbo.json                   # Turborepo configuration
```

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `apps/web/app/page.tsx`. The page auto-updates as you edit the file.

## Available Scripts

- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Lint all packages
- `pnpm start` - Start all apps in production mode

### Working with specific packages

To run commands for a specific package:

```bash
# Run dev server for web app only
pnpm --filter web dev

# Build web app only
pnpm --filter web build

# Lint web app only
pnpm --filter web lint
```

### ✅ Video Processing Service

The Python-based video processing service runs independently:

```bash
# Navigate to the service
cd apps/processing-engine

# Quick setup
./setup.sh

# Activate virtual environment
source venv/bin/activate

# Start the service
python main.py

# Or use pnpm from root
pnpm --filter processing-engine dev
```

**Service runs on:** http://localhost:8000  
**API Documentation:** http://localhost:8000/docs

**Features:**

- 🎯 Smart crop 16:9 → 9:16 conversion
- 🤖 AI-powered face detection (MediaPipe)
- 🎬 Smooth camera tracking
- 🎙️ Audio extraction & transcription (Whisper)
- 📝 Timestamped subtitles generation
- ⚡ FastAPI REST endpoints
- 🎥 FFmpeg video rendering

### 🎬 Remotion Render Server (NEW)

The Remotion render server handles video rendering with professional subtitle templates:

```bash
# Navigate to the server
cd apps/remotion-server

# Install dependencies (from root)
pnpm install

# Start development server
pnpm dev

# Or from root
pnpm --filter remotion-server dev
```

**Server runs on:** http://localhost:3001
**Complete Guide:** [apps/remotion-server/QUICKSTART.md](apps/remotion-server/QUICKSTART.md)
**Infrastructure Overview:** [REMOTION_INFRASTRUCTURE.md](REMOTION_INFRASTRUCTURE.md)

**Features:**

- 📹 Video rendering with synchronized subtitles
- 🎨 **9 professional caption templates** (viral, minimal, modern, hormozi, mrbeast, etc.) ✅
- 📊 Job queue with progress tracking
- ❌ Cancel running render jobs
- 🐳 Docker support
- 🔄 REST API for render management
- ⏱️ **Subtitle timing adjustment** (200ms offset for perfect sync) ✅

**Quick Test:**

```bash
cd apps/remotion-server
node example-usage.js
```

**Preview Compositions:**

```bash
cd packages/remotion-compositions
pnpm studio
```

## ✅ Web Application Features

### 📍 Routes

- **`/`** - Home page with navigation to all features
- **`/subtitle-generator`** - ✅ **Standalone subtitle generation**
  - Upload video (max 500MB)
  - Automatic transcription (Whisper)
  - Visual subtitle editor (edit, merge, delete)
  - 9 professional templates
  - Fast rendering without AI analysis
  - **Perfect for**: Quick subtitle generation, template testing, simple workflows

- **`/video-wizard`** - 🎬 Complete automated pipeline
  - Upload video (max 500MB)
  - Automatic audio extraction
  - Transcription with timestamps
  - AI analysis for viral clips (GPT-4o)
  - All-in-one processing
  - **Perfect for**: Content creators, viral clip hunting, full analysis

- **`/content-intelligence`** - AI-powered transcript analysis
  - Upload transcript or use sample
  - GPT-4o analyzes content for viral potential
  - Identifies 30-90s clips with hooks and conclusions
  - Scores clips 0-100 for viral potential
  - **Perfect for**: Analyzing existing transcripts, quick insights

### Content Intelligence Module

Analyze transcripts to find viral-worthy clips:

```bash
cd apps/web

# Setup
cp .env.local.example .env.local
# Add your OPENAI_API_KEY

# Run
pnpm dev
```

Visit: http://localhost:3000/content-intelligence

**Features:**

- 🤖 GPT-4o powered analysis
- 📊 Viral score (0-100)
- 🎯 Hook & conclusion detection
- ⏱️ 30-90s optimal clip length
- 🎨 Visual score indicators

**Docs:** [apps/web/CONTENT_INTELLIGENCE.md](apps/web/CONTENT_INTELLIGENCE.md)

### ✅ Subtitle Generator - Standalone Feature

Fast and simple subtitle generation without content analysis:

```bash
# Ensure all services are running
pnpm dev
```

Visit: http://localhost:3000/subtitle-generator

**Workflow:**

1. 📤 Upload video file
2. 🎤 Automatic transcription (Whisper via Processing Engine)
3. ✏️ Edit subtitles visually
   - Click to edit text
   - Merge consecutive segments
   - Delete unwanted segments
4. 🎨 Select from 9 templates:
   - **Viral**: Bold, eye-catching (social media)
   - **Minimal**: Clean and simple
   - **Modern**: Contemporary with animations
   - **Hormozi**: High-impact (Alex Hormozi style)
   - **MrBeast**: Bold and energetic
   - **MrBeast Emoji**: With dynamic emoji reactions
   - **Highlight**: Key words in color
   - **Color Shift**: Dynamic color transitions
   - **Default**: Standard subtitles
5. 🎬 Render video with Remotion
6. 📥 Download final video

**Key Features:**

- ⚡ **Fast**: No AI analysis, straight to subtitles
- ✏️ **Visual Editor**: Edit, merge, delete segments
- 🎨 **9 Templates**: Professional styles for any content
- ⏱️ **Synchronized**: 200ms offset for perfect timing
- 🌍 **Multi-language**: Auto-detect or manual selection

**Time Formats:**

- Whisper returns: SECONDS
- Frontend stores: MILLISECONDS
- Remotion uses: SECONDS (automatic conversion)

**Timing Adjustment:**
Subtitles have a 200ms delay offset for better audio sync. Adjustable in:
`packages/remotion-compositions/src/hooks/useActiveSubtitle.ts:33`

**Documentation:**

- **Complete Guide**: [SUBTITLE_GENERATOR.md](SUBTITLE_GENERATOR.md)
- **Bug Fixes**: [SUBTITLE_FIX.md](SUBTITLE_FIX.md)
- **Timing Config**: [SUBTITLE_TIMING_ADJUSTMENT.md](SUBTITLE_TIMING_ADJUSTMENT.md)
- **Navigation**: [NAVIGATION_UPDATE.md](NAVIGATION_UPDATE.md)

**API Endpoints:**

- `POST /api/generate-subtitles` - Generate subtitles from video
- `POST /api/render-video-subtitles` - Render video with templates

**Service:**

- `apps/web/server/services/subtitle-generation-service.ts`

**Components:**

- `features/video/components/subtitle-editor.tsx` - Visual editor
- `features/video/components/template-selector.tsx` - Template picker
- `features/video/hooks/use-subtitle-generation.ts` - State management

**Common Issues:**

- Subtitles don't appear → See [SUBTITLE_FIX.md](SUBTITLE_FIX.md)
- Timing off → Adjust `SUBTITLE_OFFSET` in useActiveSubtitle.ts
- Template not working → Verify all 9 templates in Root.tsx schema

### Video Wizard - Full Pipeline

Complete end-to-end video processing:

```bash
# Terminal 1: Python backend
cd apps/processing-engine
docker-compose -f docker-compose.dev.yml up

# Terminal 2: Next.js frontend
cd apps/web
pnpm dev
```

Visit: http://localhost:3000/video-wizard

**Process:**

1. 📤 Upload video
2. 🎙️ Extract audio & transcribe
3. 🤖 AI analysis for viral clips
4. 📊 View results with scores

**Documentation:**

- [Video Wizard Overview](apps/web/VIDEO_WIZARD.md)
- [Quick Start Guide](apps/web/VIDEO_WIZARD_QUICKSTART.md)
- [Processing Engine Quick Start](apps/processing-engine/QUICKSTART.md)

## 📚 Documentation

### Main Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete Claude Code instructions (UPDATED 2026-01-30)
- **[README.md](README.md)** - This file
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture overview
- **[FEATURE_GUIDE.md](FEATURE_GUIDE.md)** - Guide for creating features

### ✅ Subtitle Generator Docs (NEW!)

- **[SUBTITLE_GENERATOR.md](SUBTITLE_GENERATOR.md)** - Complete feature guide
- **[SUBTITLE_FIX.md](SUBTITLE_FIX.md)** - Bug fixes and troubleshooting
- **[SUBTITLE_TIMING_ADJUSTMENT.md](SUBTITLE_TIMING_ADJUSTMENT.md)** - Timing configuration
- **[NAVIGATION_UPDATE.md](NAVIGATION_UPDATE.md)** - Navigation integration

### Development

- **[.copilot/project-instructions.md](.copilot/project-instructions.md)** - Project guidelines
- **[.copilot/code-patterns.md](.copilot/code-patterns.md)** - Code templates
- **[.copilot/architecture-decisions.md](.copilot/architecture-decisions.md)** - Technical decisions

### Git & Quality

- **[COMMIT_CONVENTIONS.md](COMMIT_CONVENTIONS.md)** - Commit message guidelines
- **[HUSKY_SETUP.md](HUSKY_SETUP.md)** - Git hooks setup and troubleshooting

### Features & Services

- **[features/video/README.md](apps/web/features/video/README.md)** - Video feature module
- **[server/README.md](apps/web/server/README.md)** - Server-side code
- **[apps/processing-engine/README.md](apps/processing-engine/README.md)** - Python engine
- **[REMOTION_INFRASTRUCTURE.md](REMOTION_INFRASTRUCTURE.md)** - Remotion setup

## 🔧 Code Quality

This project enforces code quality through automated checks:

### Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
# Interactive commit tool (recommended)
pnpm commit

# Or write commits manually
git commit -m "feat(video): add subtitle rendering"
```

### Pre-commit Checks

Automatically run on every commit:

- ✓ **ESLint**: Lints and fixes JavaScript/TypeScript
- ✓ **Prettier**: Formats all code files
- ✓ **Python linters**: Black and Flake8 for Python code
- ✓ **Commit validation**: Ensures proper commit message format

See [HUSKY_SETUP.md](HUSKY_SETUP.md) for detailed setup instructions.

## 🏗️ Architecture Highlights

### Screaming Architecture

The project uses **feature-based organization** where the structure "screams" what the application does:

```
features/
└── video/              # "I handle video processing!"
    ├── components/     # Presentational (atomic)
    ├── hooks/          # State management
    ├── types/          # Type definitions
    └── lib/            # Utilities
```

### Separation of Concerns

- **API Routes**: HTTP handling only
- **Services**: Business logic
- **Features**: UI modules with components + hooks
- **Components**: Presentational, atomic, reusable

### Type Safety

- TypeScript strict mode
- Zod schemas for validation
- Type inference throughout

## Learn More

To learn more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Turborepo Documentation](https://turbo.build/repo/docs) - learn about Turborepo
- [pnpm Workspaces](https://pnpm.io/workspaces) - learn about pnpm workspaces
- [FastAPI Documentation](https://fastapi.tiangolo.com/) - learn about FastAPI
- [MediaPipe](https://developers.google.com/mediapipe) - learn about MediaPipe

## Changelog

### 2026-02-09 - Documentation & Feature Consolidation

#### Documentation

- Comprehensive update of all documentation to reflect current system state
- Updated `CLAUDE.md` with complete API reference, Brand Kit, Silence/Filler, Aspect Ratio docs
- Updated `ARCHITECTURE.md` with three-service architecture and data flow diagrams
- Updated `IMPLEMENTATION_STATUS.md` with full feature matrix and stats
- Updated feature `README.md` with all 15 components, 3 hooks, 5 utility modules
- Updated server `README.md` with all 4 services and type schemas

### 2026-02-01 - Brand Kit & Cleanup Tools

#### New Features

- **Brand Kit System**: Persistent brand customization with localStorage
  - Logo URL, position (4 corners), and scale (0.1-2.0x)
  - Primary, secondary, text, and background colors
  - Font family selection (10 predefined options)
  - Collapsible settings UI with reset/clear actions
  - `useBrandKit()` hook with Zod validation

- **Silence/Filler Detection**: Automated subtitle cleanup
  - Detects silences (gaps > threshold), filler words (13 defaults), short segments
  - Auto-Clean All, Clean Filler Text, Remove Filler/Short Segments
  - Configurable thresholds (silence: 1000ms, min segment: 300ms)
  - Collapsible issues list with per-issue removal
  - Pure detection algorithms with no side effects

- **Aspect Ratio Selector**: Visual grid for output format
  - 9:16 (Vertical), 1:1 (Square), 4:5 (Portrait), 16:9 (Landscape)
  - Dimension preview, icon indicators, use-case descriptions

- **SRT/VTT Export**: Download subtitle files from the editor

### 2026-01-30 - Subtitle Generator Release

#### New Features

- **Subtitle Generator**: Standalone subtitle generation feature
  - Visual subtitle editor with edit/merge/delete
  - 9 professional templates
  - Fast workflow without AI analysis
  - Accessible via `/subtitle-generator`

- **Navigation Integration**:
  - Added to dashboard (4-column grid)
  - Added to sidebar navigation
  - Consistent UI across app

#### Bug Fixes

- **CRITICAL**: Fixed subtitle rendering bug in Remotion
  - Issue: Videos rendered at 0.06s instead of 60s
  - Cause: Incorrect time format conversion (dividing by 1000 twice)
  - Fix: Use seconds directly in `Root.tsx:66`

- **Schema Update**: Expanded template enum to include all 9 templates

#### Improvements

- **Subtitle Timing**: Added 200ms offset for better audio sync
- **Logging**: Added debug logs for Remotion and subtitle detection

#### Architecture

- New Service: `subtitle-generation-service.ts`
- New API Routes: `/api/generate-subtitles`, `/api/render-video-subtitles`
- New Hook: `use-subtitle-generation.ts`
- New Components: `SubtitleEditor`, `TemplateSelector`
- New Container: `SubtitleGeneratorContainer`

### Previous Updates

- Video Wizard full pipeline
- Content Intelligence feature
- Remotion integration with 9 templates
- Python processing engine with smart cropping
- Git hooks and quality tools

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

**Last Updated**: 2026-02-09
**Version**: 2.1.0 (Brand Kit + Cleanup Tools + Documentation Update)
