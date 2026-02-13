# Video Wizard Architecture Overview

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│                   (Next.js App Router)                       │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │ Video Wizard │ │  Subtitle    │ │    Content        │   │
│  │ /video-wizard│ │  Generator   │ │    Intelligence   │   │
│  │              │ │ /subtitle-   │ │ /content-         │   │
│  │              │ │  generator   │ │  intelligence     │   │
│  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘   │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Feature Modules (video/)               │     │
│  │  Components │ Containers │ Hooks │ Types │ Utils    │     │
│  └──────────────────────┬─────────────────────────────┘     │
└─────────────────────────┼───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
   │   API Routes │ │  Shared UI  │ │   Layout     │
   │  (HTTP Only) │ │ Components  │ │  (Sidebar)   │
   └──────┬───────┘ └─────────────┘ └──────────────┘
          │
          ▼
   ┌────────────────┐
   │    Server      │
   │  (Business     │
   │   Logic)       │
   └────────┬───────┘
            │
   ┌────────┼────────────┐
   │        │            │
   ▼        ▼            ▼
┌────────┬────────┬────────────┐
│Services│ Types  │ Prompts    │
│        │ (Zod)  │ (AI)       │
└────────┴────────┴────────────┘
            │
   ┌────────┼────────────────────┐
   │        │                    │
   ▼        ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ OpenAI GPT   │  │   Python     │  │  Remotion    │
│ (Vercel AI   │  │   Engine     │  │  Server      │
│  SDK)        │  │ (FastAPI)    │  │ (Express)    │
└──────────────┘  └──────────────┘  └──────────────┘
                         │                  │
                         ▼                  ▼
                  ┌──────────────┐  ┌──────────────┐
                  │   FFmpeg     │  │  Remotion    │
                  │   Whisper    │  │ Compositions │
                  │   MediaPipe  │  │ (9 templates)│
                  └──────────────┘  └──────────────┘
```

## Feature Module Architecture (Screaming Architecture)

### Structure

```
apps/web/
├── app/                          # Next.js pages & API routes
│   ├── page.tsx                  # Dashboard (/)
│   ├── video-wizard/page.tsx     # Video Wizard
│   ├── subtitle-generator/page.tsx # Subtitle Generator
│   ├── content-intelligence/page.tsx # Content Intelligence
│   └── api/                      # 7 HTTP endpoints
│       ├── analyze-content/      # AI viral clip detection
│       ├── create-clip/          # Create vertical clips
│       ├── generate-subtitles/   # Generate subtitles
│       ├── render-video-subtitles/ # Render with subtitles
│       ├── render-with-subtitles/  # Re-render edited clips
│       ├── render-final/         # Final render (disabled)
│       └── transcribe/           # Proxy to Python
│
├── features/                     # FEATURE MODULES
│   └── video/                    # Video processing feature
│       ├── components/           # 15 presentational components
│       │   ├── analysis-results.tsx
│       │   ├── aspect-ratio-selector.tsx
│       │   ├── brand-kit-settings.tsx
│       │   ├── clip-card.tsx
│       │   ├── clip-edit-modal.tsx
│       │   ├── processing-progress.tsx
│       │   ├── remotion-preview.tsx
│       │   ├── silence-filler-panel.tsx
│       │   ├── subtitle-editor.tsx
│       │   ├── template-selector.tsx
│       │   ├── transcription-results.tsx
│       │   ├── video-header.tsx
│       │   ├── video-how-it-works.tsx
│       │   ├── video-uploader.tsx
│       │   └── index.ts
│       ├── containers/           # 2 page orchestrators
│       │   ├── subtitle-generator-container.tsx
│       │   └── video-container.tsx
│       ├── hooks/                # 3 state management hooks
│       │   ├── use-brand-kit.ts
│       │   ├── use-subtitle-generation.ts
│       │   └── use-video-processing.ts
│       ├── types/                # 3 type definition files
│       │   ├── brand-kit.ts
│       │   ├── silence-filler.ts
│       │   └── index.ts
│       └── lib/                  # 5 utility modules
│           ├── aspect-ratios.ts
│           ├── silence-filler-detection.ts
│           ├── subtitle-export.ts
│           ├── utils.ts
│           └── youtube.ts
│
├── server/                       # Server-side code
│   ├── services/                 # 4 business logic services
│   │   ├── content-analysis-service.ts
│   │   ├── subtitle-generation-service.ts
│   │   ├── clip-integration-service.ts
│   │   └── video-render-service.ts (legacy)
│   ├── types/                    # 3 Zod schema files
│   ├── config/                   # AI model configuration
│   ├── prompts/                  # AI prompts
│   └── lib/                      # Server utilities
│
├── components/                   # Shared UI components
│   ├── layout/
│   │   └── app-sidebar.tsx       # Fixed sidebar navigation
│   └── ui/                       # shadcn/ui components
└── lib/                          # Client utilities
```

## Data Flow: Video Wizard

```
1. User Interaction
   ┌──────────────────────────────────┐
   │  VideoContainer                   │
   │  (container component)            │
   └───────────┬──────────────────────┘
               │ useVideoProcessing()
               ▼
2. Feature Hook
   ┌──────────────────────────────────┐
   │  useVideoProcessing (hook)       │
   │  - Manages state machine         │
   │  - Orchestrates workflow          │
   │  - Supports file + YouTube input  │
   └───────────┬──────────────────────┘
               │ processVideo()
               ▼
3. API Calls
   ┌────────────────┬─────────────────┬──────────────────┐
   │ Upload Video   │ Transcribe      │ Analyze Content  │
   │ POST /upload   │ POST /transcribe│ POST /api/       │
   │ (Python)       │ (Python)        │ analyze-content  │
   └────────┬───────┴────────┬────────┴────────┬─────────┘
            │                │                 │
            ▼                ▼                 ▼
   ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
   │ Python       │ │ Whisper      │ │ Content         │
   │ Engine       │ │ Transcription│ │ Analysis        │
   │ (upload)     │ │              │ │ Service         │
   └──────────────┘ └──────────────┘ └────────┬────────┘
                                               │
                                               ▼
4. AI Processing                     ┌─────────────────────┐
                                     │ OpenAI GPT           │
                                     │ (Vercel AI SDK)      │
                                     │ Viral scoring 0-100  │
                                     └─────────────────────┘
```

## Data Flow: Subtitle Generator

```
1. User Interaction
   ┌──────────────────────────────────────┐
   │  SubtitleGeneratorContainer           │
   │  - File upload OR YouTube URL         │
   │  - Language selection                 │
   │  - Aspect ratio selection             │
   └───────────┬──────────────────────────┘
               │ useSubtitleGeneration()
               ▼
2. Generate Subtitles
   ┌──────────────────────────────────────┐
   │  POST /api/generate-subtitles        │
   │  → SubtitleGenerationService         │
   │  → Python /transcribe (Whisper)      │
   │  → Returns subtitles (milliseconds)   │
   └───────────┬──────────────────────────┘
               │
               ▼
3. User Editing
   ┌──────────────────────────────────────┐
   │  SubtitleEditor     TemplateSelector │
   │  SilenceFillerPanel AspectRatio      │
   │  BrandKitSettings                    │
   └───────────┬──────────────────────────┘
               │ renderVideo(brandKit)
               ▼
4. Render
   ┌──────────────────────────────────────┐
   │  POST /api/render-video-subtitles    │
   │  → SubtitleGenerationService         │
   │  → Remotion Server POST /renders     │
   │  → Poll /renders/{jobId} (30min max) │
   │  → Returns videoUrl                  │
   └──────────────────────────────────────┘
```

## Component Communication

### Presentational Component Pattern

```
┌────────────────────────────────────────────────────────────┐
│                     Container Component                      │
│                                                              │
│  const hook = useSubtitleGeneration();                       │
│  const { brandKit, setBrandKit } = useBrandKit();           │
│                                                              │
│  return (                                                    │
│    <>                                                        │
│      <VideoUploader ... />                                   │
│      <SubtitleEditor subtitles={...} onChange={...} />       │
│      <SilenceFillerPanel subtitles={...} onChange={...} />   │
│      <TemplateSelector selected={...} onChange={...} />      │
│      <AspectRatioSelector selected={...} onChange={...} />   │
│      <BrandKitSettings brandKit={brandKit} onChange={...} /> │
│    </>                                                       │
│  );                                                          │
└────────────────────────────────────────────────────────────┘
          │                          ▲
          │ Props (data)             │ Events (callbacks)
          ▼                          │
┌────────────────────────────────────────────────────────────┐
│             Presentational Components                       │
│                                                             │
│  - Atomic (single responsibility)                          │
│  - Receive data via props                                   │
│  - Emit events via callbacks                                │
│  - No business logic                                        │
│  - No API calls                                             │
│  - Highly reusable                                          │
└────────────────────────────────────────────────────────────┘
```

## Separation of Concerns

### API Route (HTTP Layer)

```typescript
// app/api/analyze-content/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await contentAnalysisService.analyzeTranscript(body.transcript);
  return NextResponse.json({ success: true, data });
}
```

- Only handles HTTP (request/response)
- Delegates to services
- No business logic

### Service (Business Logic Layer)

```typescript
// server/services/content-analysis-service.ts
export class ContentAnalysisService {
  async analyzeTranscript(transcript: string): Promise<ContentAnalysis> {
    // Validate → Call AI → Transform data → Return result
  }
}
```

- Contains business logic
- Reusable across routes
- Testable independently
- No HTTP concerns

### Feature Module (UI Layer)

```typescript
// features/video/hooks/use-video-processing.ts
export function useVideoProcessing() {
  // State management + Workflow orchestration + Error handling
  // Returns: state + actions
}
```

- Manages UI state
- Orchestrates API calls
- Provides callbacks
- No direct DB access

## Three-Service Architecture

### Web App (Next.js, port 3000)

- Frontend UI and API routes
- Business logic in services
- Delegates heavy processing to Python and Remotion

### Processing Engine (Python/FastAPI, port 8000)

- Video upload and storage
- Whisper transcription
- FFmpeg rendering and smart cropping
- Face detection (MediaPipe)
- YouTube video download

### Remotion Server (Express, port 3001)

- Video rendering with subtitle templates
- Job queue management
- 9 caption templates (viral, minimal, modern, etc.)
- Multi-aspect ratio support
- Brand kit overlay (logo, colors)

## Benefits of This Architecture

### 1. Discoverability (Screaming Architecture)

The folder structure "screams" what the application does.

### 2. Maintainability

All video-related code in `features/video/`. Changes isolated to feature.

### 3. Reusability

Components are atomic, services callable from multiple routes, features extractable.

### 4. Testability

Services tested independently, components tested with props, features tested end-to-end.

### 5. Scalability

Add new features without conflicts, clear boundaries prevent coupling.

## References

- [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
