# Video Wizard Architecture Overview

## High-Level Architecture

The browser talks to Next for identity, projects, owner-scoped media and processing jobs. A sandboxed iframe talks to the separate preview origin with its instance capability. PostgreSQL stores the identities, revisions and queue. Web and worker use owner-bound service JWTs for Python processing and the containerized renderer. The private asset store is writable by web/worker and read-only in the renderer.

The route matrix, token profiles, iframe protocol and deployment boundaries are documented in the [authentication guide](./authentication.md).

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

## Video processing and subtitles

1. The browser uploads bytes to the Studio asset API or asks Next to import a YouTube source. Next registers the measured media under the signed-in owner.
2. Next resolves an owned source asset or a job with verified provenance. Python receives the source and an operation-scoped credential for transcription or cropping.
3. The editor accepts manual caption edits and clip ranges. AI analysis uses the configured provider when requested.
4. A legacy render enters the PostgreSQL queue. The worker signs each renderer request independently and ingests completed bytes as a private asset. Studio projects use revision-pinned snapshots for previews and renders.
5. The browser reads job status and downloads through private web routes. Browser media elements can send the session cookie on same-origin range requests.

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

Accepts authenticated service operations for local Whisper, source import and crop. Output reads check the owner and operation.

### Renderer (Express, port 3001)

Renders Remotion and HyperFrames snapshots. The container publishes only its main port on loopback and reads the private Studio volume. The browser receives a single-use ticket for an isolated preview instance.

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
