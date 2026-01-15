# Video Wizard Architecture Overview

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│                   (Next.js App Router)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│   Features   │ │  Shared UI  │ │   API Routes │
│   Modules    │ │ Components  │ │  (HTTP Only) │
└──────┬───────┘ └─────────────┘ └──────┬───────┘
       │                                  │
       │                                  ▼
       │                         ┌────────────────┐
       │                         │    Server      │
       │                         │  (Business     │
       │                         │   Logic)       │
       │                         └────────┬───────┘
       │                                  │
       │                         ┌────────┼────────┐
       │                         │        │        │
       │                         ▼        ▼        ▼
       │                    ┌────────┬────────┬────────┐
       │                    │Services│ Types  │Prompts │
       │                    └────────┴────────┴────────┘
       │                                  │
       └──────────────────────────────────┤
                                          │
                  ┌───────────────────────┼───────────────┐
                  │                       │               │
                  ▼                       ▼               ▼
          ┌──────────────┐      ┌──────────────┐  ┌─────────┐
          │ OpenAI GPT-4 │      │   Python     │  │Database │
          │   (AI SDK)   │      │   Engine     │  │ (Future)│
          └──────────────┘      └──────────────┘  └─────────┘
```

## Feature Module Architecture (Screaming Architecture)

### Structure

```
apps/web/
├── app/                          # Next.js pages
│   ├── video-wizard/page.tsx    # Composes feature components
│   └── api/                      # HTTP handlers only
│       └── analyze-content/
│           └── route.ts
│
├── features/                     # 🎯 FEATURE MODULES
│   └── video/                    # Video processing feature
│       ├── components/           # Presentational components
│       │   ├── video-header.tsx
│       │   ├── video-uploader.tsx
│       │   ├── processing-progress.tsx
│       │   ├── transcription-results.tsx
│       │   ├── analysis-results.tsx
│       │   ├── video-how-it-works.tsx
│       │   └── index.ts
│       ├── hooks/
│       │   └── use-video-processing.ts  # State + workflow logic
│       ├── types/
│       │   └── index.ts          # Feature-specific types
│       ├── lib/
│       │   └── utils.ts          # Feature utilities
│       ├── index.ts              # Main export
│       └── README.md
│
├── server/                       # Server-side code
│   ├── services/                 # Business logic
│   │   └── content-analysis-service.ts
│   ├── types/                    # Schemas + types
│   │   └── content-analysis.ts
│   ├── config/                   # Configuration
│   │   └── ai.ts
│   ├── prompts/                  # AI prompts
│   │   └── viral-editor.ts
│   └── lib/                      # Server utilities
│       └── utils.ts
│
└── components/                   # Shared UI components
    └── ui/                       # shadcn/ui components
        ├── button.tsx
        ├── card.tsx
        └── ...
```

## Data Flow: Video Processing Workflow

```
1. User Interaction
   ┌──────────────────────────────────┐
   │  VideoWizardPage (app/page.tsx)  │
   │  - Composes feature components   │
   └───────────┬──────────────────────┘
               │ useVideoProcessing()
               ▼
2. Feature Hook
   ┌──────────────────────────────────┐
   │  useVideoProcessing (hook)       │
   │  - Manages state                 │
   │  - Orchestrates workflow         │
   │  - Handles errors                │
   └───────────┬──────────────────────┘
               │ processVideo()
               ▼
3. API Calls
   ┌────────────────┬─────────────────┐
   │ Upload Video   │ Transcribe      │ Analyze Content
   │ POST /upload   │ POST /transcribe│ POST /api/analyze-content
   └────────┬───────┴────────┬────────┴────────┬──────────
            │                │                 │
            ▼                ▼                 ▼
   ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
   │ Python       │ │ Python       │ │ Next.js API     │
   │ Engine       │ │ Engine       │ │ Route           │
   └──────────────┘ └──────────────┘ └────────┬────────┘
                                               │
                                               ▼
4. Business Logic                     ┌─────────────────────┐
                                      │ ContentAnalysis     │
                                      │ Service             │
                                      └──────────┬──────────┘
                                                 │
                                                 ▼
5. AI Processing                      ┌─────────────────────┐
                                      │ OpenAI GPT-4o       │
                                      │ (Vercel AI SDK)     │
                                      └─────────────────────┘
```

## Component Communication

### Presentational Component Pattern

```
┌────────────────────────────────────────────────────────────┐
│                     Page Component                          │
│                   (app/page.tsx)                            │
│                                                             │
│  const { state, actions } = useVideoProcessing();          │
│                                                             │
│  return (                                                   │
│    <>                                                       │
│      <VideoHeader />                                        │
│      <VideoUploader                                         │
│        file={state.file}                                    │
│        onFileSelect={actions.setFile}                       │
│        onProcess={actions.processVideo}                     │
│      />                                                     │
│      <ProcessingProgress currentStep={state.currentStep} />│
│      <TranscriptionResults transcription={state.trans...} />│
│      <AnalysisResults analysis={state.analysis} />         │
│    </>                                                      │
│  );                                                         │
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

✅ **Only** handles HTTP (request/response)
✅ Delegates to services
❌ No business logic

### Service (Business Logic Layer)

```typescript
// server/services/content-analysis-service.ts
export class ContentAnalysisService {
  async analyzeTranscript(transcript: string): Promise<ContentAnalysis> {
    // Validate
    // Call AI
    // Transform data
    // Return result
  }
}
```

✅ Contains business logic
✅ Reusable across routes
✅ Testable independently
❌ No HTTP concerns

### Feature Module (UI Layer)

```typescript
// features/video/hooks/use-video-processing.ts
export function useVideoProcessing() {
  // State management
  // Workflow orchestration
  // Error handling
  // Returns: state + actions
}
```

✅ Manages UI state
✅ Orchestrates API calls
✅ Provides callbacks
❌ No direct DB access

## Benefits of This Architecture

### 1. Discoverability (Screaming Architecture)

```
features/
├── video/          # "I handle video processing!"
├── analytics/      # "I handle analytics!" (future)
└── auth/           # "I handle authentication!" (future)
```

The folder structure "screams" what the application does.

### 2. Maintainability

- All video-related code in `features/video/`
- Easy to find and modify
- Changes isolated to feature

### 3. Reusability

- Components are atomic and reusable
- Services can be called from multiple routes
- Features can be extracted into libraries

### 4. Testability

- Services tested independently
- Components tested with props
- Features tested end-to-end

### 5. Scalability

- Add new features without conflicts
- Team members can own features
- Clear boundaries prevent coupling

## Future Enhancements

### Planned Features

```
features/
├── video/                    # ✅ Complete
├── content-intelligence/     # 🔄 To migrate
├── video-editor/            # 📅 Planned
├── clip-export/             # 📅 Planned
└── analytics/               # 📅 Planned
```

### Possible Improvements

1. Add container components (server-side data fetching)
2. Extract shared feature utilities
3. Create feature-specific tests
4. Add feature flags for gradual rollout
5. Implement cross-feature communication via events

## References

- [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
