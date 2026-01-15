# Video Wizard Monorepo

This is a Turborepo monorepo for the Video Wizard project, built with Next.js.

## What's inside?

This Turborepo includes the following packages and apps:

### Apps and Packages

- `apps/web`: The main Next.js web application
- `apps/remotion-server`: **🎬 Remotion render server** (Video rendering with subtitles)
- `apps/processing-engine`: **Python-based video processing service** (Smart Crop & AI Analysis)
- `packages/remotion-compositions`: **📦 Shared Remotion compositions** (Video templates & subtitles)
- `packages/ui`: Shared UI components (placeholder for future shared components)
- `packages/tsconfig`: Shared TypeScript configuration files

### Structure

```
video-wizard/
├── apps/
│   ├── web/                      # Next.js application
│   │   ├── app/                  # Next.js app router
│   │   │   ├── api/              # API routes (HTTP only)
│   │   │   ├── content-intelligence/  # 🤖 AI Content Analysis
│   │   │   └── video-wizard/    # 🎬 Full Video Processing Pipeline
│   │   ├── features/             # 🆕 Feature modules (screaming architecture)
│   │   │   └── video/            # Video processing feature
│   │   │       ├── components/   # Presentational components
│   │   │       ├── hooks/        # Custom hooks
│   │   │       ├── types/        # Type definitions
│   │   │       └── lib/          # Utilities
│   │   ├── server/               # 🆕 Server-side code
│   │   │   ├── services/         # Business logic
│   │   │   ├── types/            # Zod schemas & types
│   │   │   ├── config/           # Configuration
│   │   │   ├── prompts/          # AI prompts
│   │   │   └── lib/              # Server utilities
│   │   ├── components/           # Shared UI components
│   │   └── lib/                  # Client utilities
│   ├── remotion-server/          # 🎬 Remotion Render Server (NEW)
│   │   ├── server/               # Express.js server
│   │   │   ├── index.ts          # API endpoints
│   │   │   └── render-queue.ts   # Job queue
│   │   ├── renders/              # Output videos
│   │   └── QUICKSTART.md         # Usage guide
│   └── processing-engine/        # 🐍 Python Video Processing Service
│       ├── main.py               # FastAPI application
│       ├── analyzer.py           # AI-powered video analysis
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
├── .copilot/                    # 🆕 GitHub Copilot documentation
│   ├── project-instructions.md  # Project guidelines
│   ├── code-patterns.md         # Code templates
│   └── architecture-decisions.md # Technical decisions
├── ARCHITECTURE.md              # 🆕 Architecture overview
├── FEATURE_GUIDE.md             # 🆕 Feature development guide
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

### 🆕 Video Processing Service

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
- 🎨 4 professional caption templates (default, viral, minimal, modern)
- 📊 Job queue with progress tracking
- ❌ Cancel running render jobs
- 🐳 Docker support
- 🔄 REST API for render management

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

## 🆕 Web Application Features

### 📍 Routes

- **`/`** - Home page
- **`/content-intelligence`** - AI-powered transcript analysis
  - Upload transcript or use sample
  - GPT-4o analyzes content for viral potential
  - Identifies 30-90s clips with hooks and conclusions
  - Scores clips 0-100 for viral potential
  
- **`/video-wizard`** - 🎬 Complete automated pipeline
  - Upload video (max 500MB)
  - Automatic audio extraction
  - Transcription with timestamps
  - AI analysis for viral clips
  - All-in-one processing

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

### Architecture
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture overview
- **[FEATURE_GUIDE.md](FEATURE_GUIDE.md)** - Guide for creating features

### Development
- **[.copilot/project-instructions.md](.copilot/project-instructions.md)** - Project guidelines
- **[.copilot/code-patterns.md](.copilot/code-patterns.md)** - Code templates
- **[.copilot/architecture-decisions.md](.copilot/architecture-decisions.md)** - Technical decisions

### Features
- **[features/video/README.md](apps/web/features/video/README.md)** - Video feature module

### Services
- **[server/README.md](apps/web/server/README.md)** - Server-side code
- **[apps/processing-engine/README.md](apps/processing-engine/README.md)** - Python engine

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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
