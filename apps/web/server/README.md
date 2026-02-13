# Server Module

Organized server-side code following best practices and separation of concerns.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              API Routes (HTTP Layer)                │
│            app/api/*/route.ts                       │
│  - Request/Response handling                        │
│  - HTTP status codes                                │
│  - Input validation                                 │
└──────────────────┬──────────────────────────────────┘
                   │ imports
                   ▼
┌─────────────────────────────────────────────────────┐
│           Services (Business Logic)                 │
│          server/services/*.ts                       │
│  - Core business logic                              │
│  - Data processing                                  │
│  - External API calls                               │
└──────────────────┬──────────────────────────────────┘
                   │ uses
      ┌────────────┼────────────┐
      ▼            ▼            ▼
  ┌───────┐   ┌────────┐   ┌────────┐
  │ Types │   │ Config │   │Prompts │
  │       │   │        │   │   AI   │
  └───────┘   └────────┘   └────────┘
      │            │            │
      └────────────┴────────────┘
                   │
                   ▼
            ┌──────────┐
            │   Lib    │
            │ (Utils)  │
            └──────────┘
```

## Structure

```
server/
├── config/                        # Server configurations
│   └── ai.ts                     # OpenAI model config (gpt-5-mini)
├── services/                      # Business logic
│   ├── content-analysis-service.ts   # AI-powered viral clip detection
│   ├── subtitle-generation-service.ts # Subtitle generation + Remotion rendering
│   ├── clip-integration-service.ts   # Clip creation, upload, transcription
│   └── video-render-service.ts       # Video rendering (legacy, disabled)
├── types/                         # Zod schemas and TypeScript types
│   ├── content-analysis.ts       # ViralClip, ContentAnalysis schemas
│   ├── clip-render.ts            # ClipRenderRequest/Response schemas
│   └── video-render.ts           # SubtitleSegment, RenderRequest schemas
├── prompts/                       # AI prompts
│   └── viral-editor.ts           # Viral content analysis prompt (multi-language)
├── lib/                           # Utility functions
│   └── utils.ts                  # Error classes, logger, env helpers
├── index.ts                       # Central exports
└── README.md                      # This file
```

## Services

### ContentAnalysisService

AI-powered content analysis for viral clip detection.

**File**: `services/content-analysis-service.ts`

**Methods**:

- `analyzeTranscript(transcript: string, language?: string): Promise<ContentAnalysis>`
  - Uses GPT via Vercel AI SDK with structured Zod output
  - System prompt: `VIRAL_EDITOR_SYSTEM_PROMPT` (multi-language)
  - Returns: clips array with scores (0-100), analysis summary
- `validateTranscript(transcript: string): boolean`
  - Minimum 100 characters required
  - Throws descriptive error if invalid

**Used by**: `POST /api/analyze-content`

### SubtitleGenerationService

Handles subtitle generation and Remotion video rendering.

**File**: `services/subtitle-generation-service.ts`

**Methods**:

- `generateSubtitles(input): Promise<SubtitleGenerationResult>`
  - Calls Python `/transcribe` endpoint
  - Converts segments from seconds to milliseconds
  - Returns: subtitles array, language, totalSegments, videoDuration
- `renderWithSubtitles(input): Promise<RenderSubtitlesResult>`
  - Creates Remotion render job via `POST /renders`
  - Converts subtitles from milliseconds back to seconds for Remotion
  - Supports: template, aspectRatio, brandKit
  - Polls `/renders/{jobId}` until completion (30min timeout, 2s interval)
  - Returns: jobId, videoUrl
- `pollRenderJob(jobId): Promise<string>` — Private polling loop
- `getRenderStatus(jobId)` — Get current job status without polling

**Used by**: `POST /api/generate-subtitles`, `POST /api/render-video-subtitles`, `POST /api/render-with-subtitles`

### ClipIntegrationService

Handles communication with the Python processing engine.

**File**: `services/clip-integration-service.ts`

**Methods**:

- `createClip(request: ClipRenderRequest): Promise<ClipRenderResponse>`
  - Calls Python `/render-clip` for vertical clip creation with smart cropping
  - Supports: video_path, start_time, end_time, crop_mode ('dynamic'), aspect_ratio
- `transcribeVideo(videoPath, language?): Promise<TranscriptionResponse>`
  - Calls Python `/transcribe` for Whisper transcription
  - Returns: segments with timestamps, full_text, segment_count, language
- `uploadVideo(file: File): Promise<{path, filename}>`
  - Uploads video file to Python engine via FormData
- `getVideoUrl(relativePath): string`
  - Converts relative paths to full HTTP URLs

**Used by**: `POST /api/transcribe`, `POST /api/create-clip`

### VideoRenderService (Legacy)

Server-side rendering — currently disabled to avoid bundler conflicts.

**File**: `services/video-render-service.ts`

**Status**: Disabled. Uses Python FFmpeg backend or Remotion server instead.

## Types (Zod Schemas)

### content-analysis.ts

```typescript
ViralClip { start_time, end_time, viral_score (0-100), summary, hook, conclusion }
ContentAnalysis { clips: ViralClip[], total_clips, analysis_summary }
AnalyzeContentRequest { transcript, language? }
```

### clip-render.ts

```typescript
ClipRenderRequest { video_path, start_time, end_time, crop_mode, aspect_ratio }
ClipRenderResponse { success, output_path, duration, crop_dimensions }
TranscriptionResponse { segments, full_text, segment_count, language }
```

### video-render.ts

```typescript
SubtitleSegment { id, start, end, text, words? }
RenderRequest { videoUrl, subtitles, template, outputFormat, quality }
RenderResponse { success, outputUrl, fileSize, duration }
```

## Configuration

### AI Config (`config/ai.ts`)

- Model: `gpt-5-mini` via `@ai-sdk/openai`
- Validates `OPENAI_API_KEY` environment variable
- Exports: `AI_MODELS`, `validateAIConfig()`

### Viral Editor Prompt (`prompts/viral-editor.ts`)

- 7 evaluation criteria: hooks, complete thoughts, emotional impact, optimal length, conclusion, standalone value, shareability
- Scoring tiers: 90-100 (extremely viral), 70-89 (high), 50-69 (good), 30-49 (moderate), 0-29 (low)
- Optimal clip duration: 45-120s (preferred 90-120s)
- Multi-language support: 12 languages (en, es, fr, de, pt, it, ja, ko, zh, ru, ar, hi)
- Response language matches detected transcript language

## Utilities (`lib/utils.ts`)

- `ValidationError`, `ConfigurationError`, `ServiceError` — Custom error classes
- `requireEnv(key)` — Get required env var or throw
- `getEnv(key, defaultValue?)` — Get optional env var
- `validateString(value, config)` — Validate string min/max length
- `safeAsync(fn)` — Wrapper for async error handling
- `logger` — Structured JSON logging (info, warn, error)

## Principles

### Separation of Responsibilities

- **API Routes**: Only handle HTTP (request/response, status codes, input validation)
- **Services**: Contain all business logic, reusable across routes
- **Types**: Centralized Zod schemas and TypeScript types
- **Config**: Environment and model configurations
- **Prompts**: Versioned and documented AI prompts

### Conventions

- **File names**: kebab-case (`content-analysis-service.ts`)
- **Classes**: PascalCase (`ContentAnalysisService`)
- **Functions**: camelCase (`analyzeTranscript`)
- **Constants**: UPPER_SNAKE_CASE (`VIRAL_EDITOR_SYSTEM_PROMPT`)
- **Types**: PascalCase (`ContentAnalysis`)

## Usage

### From API Routes

```typescript
import { contentAnalysisService } from '@/server/services/content-analysis-service';
import type { AnalyzeContentRequest } from '@/server/types/content-analysis';

export async function POST(request: NextRequest) {
  const { transcript } = (await request.json()) as AnalyzeContentRequest;
  contentAnalysisService.validateTranscript(transcript);
  const data = await contentAnalysisService.analyzeTranscript(transcript);
  return NextResponse.json({ success: true, data });
}
```

## Adding a New Service

1. **Define types** in `types/my-service.ts` (Zod schemas)
2. **Create service** in `services/my-service.ts` (business logic)
3. **Add config** if needed in `config/`
4. **Create prompts** if using AI in `prompts/`
5. **Export** from `index.ts`
6. **Create API route** in `app/api/my-endpoint/route.ts`

## Testing

Services are designed for independent testing:

```typescript
import { ContentAnalysisService } from '@/server/services/content-analysis-service';

describe('ContentAnalysisService', () => {
  it('should validate transcript', () => {
    const service = new ContentAnalysisService();
    expect(() => service.validateTranscript('')).toThrow();
  });
});
```
