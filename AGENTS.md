# Claude Code Instructions for Video Wizard

## Project Overview

Video Wizard is a monorepo application for AI-powered video content analysis, viral clip identification, and subtitle generation. It consists of three main services:

1. **Web App** (Next.js 16 + TypeScript) - Frontend and API
2. **Remotion Server** (Express + Remotion) - Video rendering with subtitles
3. **Processing Engine** (Python + FastAPI) - Video processing and transcription

### Main Features

1. **Video Wizard** (`/video-wizard`) - Full viral clip analysis pipeline
   - Upload video or YouTube URL → Transcribe → AI analysis → Extract viral clips
   - Scoring system (0-100) for viral potential
   - Subtitle editing, template selection, aspect ratio support
   - Smart vertical clip creation with face detection

2. **Subtitle Generator** (`/subtitle-generator`) - Standalone subtitle generation
   - Upload video or YouTube URL → Generate subtitles → Edit → Select template → Render
   - 9 customizable templates (viral, minimal, modern, hormozi, mrbeast, etc.)
   - Visual subtitle editor with merge/delete/add
   - Silence/filler word detection and auto-cleanup
   - Multi-aspect ratio support (9:16, 1:1, 4:5, 16:9)
   - Brand kit customization (logo, colors, fonts)
   - SRT/VTT subtitle file export
   - Multi-language support with auto-detection

3. **Content Intelligence** (`/content-intelligence`) - AI-powered transcript analysis
   - Analyze existing transcripts (paste or sample)
   - Viral moment detection with scoring (0-100)
   - Hook and conclusion identification

4. **Remotion Studio** (`/remotion`) - Low-level video composition engine

## Tech Stack

### Frontend Stack
- **Framework**: Next.js 16.1.1 with App Router and Turbopack
- **Language**: TypeScript 5.x (strict mode enabled)
- **Styling**: Tailwind CSS with shadcn/ui components
- **AI**: Vercel AI SDK with OpenAI GPT-4o
- **Package Manager**: pnpm with Turborepo
- **Video**: Remotion for video rendering

### Backend Stack
- **Processing**: Python 3.x with FastAPI
- **Video Processing**: FFmpeg for video manipulation
- **AI Services**: OpenAI Whisper for transcription, MediaPipe for face detection
- **Render Server**: Express.js with Remotion

## Architecture Principles

### 1. Screaming Architecture (Feature-Based Organization)

The codebase uses feature modules that make it immediately clear what the application does:

```
apps/web/
├── features/
│   └── video/              # "I handle video processing!"
│       ├── components/     # Presentational only
│       ├── hooks/          # State & workflow
│       ├── types/          # Feature types
│       └── lib/            # Feature utilities
```

**When to use features:**
- Creating a new major capability (video editing, analytics, etc.)
- Need co-located components, hooks, and utilities
- Want clear ownership boundaries

### 2. Separation of Concerns

**API Routes** (HTTP Layer Only):
```typescript
// app/api/analyze-content/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await contentAnalysisService.analyzeTranscript(body.transcript);
  return NextResponse.json({ success: true, data });
}
```
- Only handle HTTP request/response
- Delegate to services immediately
- No business logic

**Services** (Business Logic Layer):
```typescript
// server/services/content-analysis-service.ts
export class ContentAnalysisService {
  async analyzeTranscript(transcript: string): Promise<ContentAnalysis> {
    // Validation, AI calls, data transformation
  }
}
```
- Contains ALL business logic
- Reusable across routes
- Independently testable
- No HTTP concerns

**Feature Hooks** (UI State Layer):
```typescript
// features/video/hooks/use-video-processing.ts
export function useVideoProcessing() {
  // State management
  // API orchestration
  // Error handling
  return { state, actions };
}
```
- Manages UI state
- Orchestrates API calls
- No direct service access

### 3. Presentational Components

All components should be:
- **Atomic**: Single responsibility
- **Props-driven**: Receive data via props
- **Event-emitting**: Use callbacks for actions
- **Logic-free**: No business logic
- **Reusable**: Can be used in multiple contexts

```typescript
interface VideoUploaderProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onProcess: () => void;
}

export function VideoUploader({ file, onFileSelect, onProcess }: VideoUploaderProps) {
  // Only presentation logic
}
```

## Project Structure

```
video-wizard/
├── apps/
│   ├── web/                      # Next.js application
│   │   ├── app/                  # App Router pages
│   │   │   ├── api/              # HTTP handlers only
│   │   │   │   ├── analyze-content/       # AI content analysis
│   │   │   │   ├── create-clip/           # Create vertical clips (Python)
│   │   │   │   ├── generate-subtitles/    # Generate subtitles only
│   │   │   │   ├── render-video-subtitles/ # Render with subtitles
│   │   │   │   ├── render-with-subtitles/ # Regenerate with edited subtitles
│   │   │   │   ├── render-final/          # Final render (disabled, 501)
│   │   │   │   └── transcribe/            # Proxy to Python transcription
│   │   │   ├── video-wizard/              # Full pipeline page
│   │   │   ├── subtitle-generator/        # Standalone subtitle generation
│   │   │   └── content-intelligence/      # Transcript analysis page
│   │   ├── features/             # Feature modules
│   │   │   └── video/            # Video processing feature
│   │   │       ├── components/   # UI components
│   │   │       │   ├── analysis-results.tsx       # AI analysis display
│   │   │       │   ├── aspect-ratio-selector.tsx  # Multi-ratio selector
│   │   │       │   ├── brand-kit-settings.tsx     # Brand customization UI
│   │   │       │   ├── clip-card.tsx               # Viral clip card
│   │   │       │   ├── clip-edit-modal.tsx         # Clip editing modal
│   │   │       │   ├── processing-progress.tsx    # Progress indicator
│   │   │       │   ├── remotion-preview.tsx        # Video preview player
│   │   │       │   ├── silence-filler-panel.tsx   # Cleanup tools panel
│   │   │       │   ├── subtitle-editor.tsx        # Edit subtitles
│   │   │       │   ├── template-selector.tsx      # Select templates (9)
│   │   │       │   ├── transcription-results.tsx  # Transcription display
│   │   │       │   ├── video-header.tsx           # Page header
│   │   │       │   ├── video-how-it-works.tsx     # Educational info
│   │   │       │   ├── video-uploader.tsx         # File upload
│   │   │       │   └── index.ts                   # Component exports
│   │   │       ├── containers/   # Page containers
│   │   │       │   ├── subtitle-generator-container.tsx # Subtitle flow
│   │   │       │   └── video-container.tsx        # Video Wizard flow
│   │   │       ├── hooks/        # React hooks
│   │   │       │   ├── use-brand-kit.ts           # Brand kit state (localStorage)
│   │   │       │   ├── use-subtitle-generation.ts # Subtitle workflow
│   │   │       │   └── use-video-processing.ts    # Video Wizard workflow
│   │   │       ├── types/        # Feature types
│   │   │       │   ├── brand-kit.ts               # BrandKit Zod schema
│   │   │       │   ├── silence-filler.ts          # Detection types
│   │   │       │   └── index.ts                   # Core types
│   │   │       └── lib/          # Feature utilities
│   │   │           ├── aspect-ratios.ts           # Ratio config & dimensions
│   │   │           ├── silence-filler-detection.ts # Detection algorithms
│   │   │           ├── subtitle-export.ts         # SRT/VTT export
│   │   │           ├── utils.ts                   # Common utilities
│   │   │           └── youtube.ts                 # YouTube URL validation
│   │   ├── server/               # Server-side code
│   │   │   ├── services/         # Business logic
│   │   │   │   ├── clip-integration-service.ts    # Clip creation/upload
│   │   │   │   ├── content-analysis-service.ts    # AI viral analysis
│   │   │   │   ├── subtitle-generation-service.ts # Subtitle generation
│   │   │   │   └── video-render-service.ts        # Video rendering (legacy)
│   │   │   ├── types/            # Zod schemas & types
│   │   │   │   ├── content-analysis.ts            # Viral clip schemas
│   │   │   │   ├── clip-render.ts                 # Clip render schemas
│   │   │   │   └── video-render.ts                # Render schemas
│   │   │   ├── config/           # Configuration
│   │   │   │   └── ai.ts                          # OpenAI model config
│   │   │   ├── prompts/          # AI prompts
│   │   │   │   └── viral-editor.ts                # Viral analysis prompt
│   │   │   └── lib/              # Server utilities
│   │   │       └── utils.ts                       # Error classes, logger
│   │   ├── components/           # Shared UI
│   │   │   ├── layout/
│   │   │   │   └── app-sidebar.tsx                # Fixed sidebar navigation
│   │   │   └── ui/               # shadcn/ui components
│   │   └── lib/                  # Client utilities
│   ├── remotion-server/          # Remotion render server
│   │   ├── server/               # Express API
│   │   │   ├── index.ts          # API endpoints & job queue
│   │   │   └── render-queue.ts   # Render job management
│   │   └── renders/              # Output directory
│   └── processing-engine/        # Python video service
│       ├── main.py               # FastAPI app (REST API)
│       ├── analyzer.py           # Face detection (MediaPipe)
│       ├── renderer.py           # FFmpeg rendering
│       ├── audio_service.py      # Whisper transcription
│       └── smart_clipper.py      # Intelligent cropping
├── packages/
│   ├── remotion-compositions/    # Shared Remotion templates
│   │   └── src/
│   │       ├── Root.tsx           # Composition registry
│   │       ├── compositions/     # VideoComposition, CaptionOverlay
│   │       ├── templates/        # 9 caption templates
│   │       ├── hooks/            # useActiveSubtitle
│   │       └── types.ts          # Remotion-level types
│   ├── ui/                       # Shared components
│   └── tsconfig/                 # Shared TypeScript configs
└── .copilot/                     # Additional documentation
```

## Coding Standards

### TypeScript Guidelines

1. **Strict Mode**: Always enabled, no `any` types
2. **Type Inference**: Let TypeScript infer when obvious
3. **Zod Schemas**: Define schemas first, infer types

```typescript
// server/types/content-analysis.ts
export const ContentAnalysisSchema = z.object({
  clips: z.array(ClipSchema),
  metadata: MetadataSchema,
});

export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
```

### Naming Conventions

- **Files**: `kebab-case.ts` or `kebab-case.tsx`
- **Components**: `PascalCase` (e.g., `VideoUploader`)
- **Functions/Variables**: `camelCase` (e.g., `processVideo`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
- **Types/Interfaces**: `PascalCase` (e.g., `VideoProcessingState`)

### Component Patterns

```typescript
'use client'; // Only when using hooks or browser APIs

interface MyComponentProps {
  title: string;
  onAction: (id: string) => void;
  optional?: boolean;
}

export function MyComponent({ title, onAction, optional = false }: MyComponentProps) {
  // Component implementation
}
```

### Error Handling

```typescript
// In services
try {
  return await operation();
} catch (error) {
  logger.error('Operation failed', error);
  throw new ServiceError('User-friendly message', error);
}

// In API routes
try {
  const result = await service.operation();
  return NextResponse.json({ success: true, data: result });
} catch (error) {
  logger.error('API error', error);
  return NextResponse.json(
    { success: false, error: 'User-friendly message' },
    { status: 500 }
  );
}
```

## Common Patterns

### Adding a New Feature

1. **Create Feature Module**:
   ```
   features/
   └── my-feature/
       ├── components/
       ├── hooks/
       ├── types/
       ├── lib/
       ├── index.ts
       └── README.md
   ```

2. **Create Service**:
   ```typescript
   // server/services/my-feature-service.ts
   export class MyFeatureService {
     async processData(input: InputType): Promise<OutputType> {
       // Business logic
     }
   }

   export const myFeatureService = new MyFeatureService();
   ```

3. **Create API Route**:
   ```typescript
   // app/api/my-feature/route.ts
   export async function POST(request: NextRequest) {
     const body = await request.json();
     const data = await myFeatureService.processData(body);
     return NextResponse.json({ success: true, data });
   }
   ```

4. **Create Page**:
   ```typescript
   // app/my-feature/page.tsx
   import { MyFeature } from '@/features/my-feature';

   export default function MyFeaturePage() {
     return <MyFeature />;
   }
   ```

### Adding a New API Endpoint

1. Define types in `server/types/`
2. Create service in `server/services/`
3. Create route in `app/api/`
4. Test with example data

### Working with AI

All AI interactions should:

1. **Use prompts from** `server/prompts/`
2. **Define schemas** for structured output
3. **Handle errors** gracefully
4. **Log interactions** for debugging

```typescript
const { output } = await generateText({
  model: AI_MODELS.contentAnalysis,
  output: Output.object({ schema: MySchema }),
  system: SYSTEM_PROMPT,
  prompt: buildPrompt(input),
});
```

## Development Workflow

### Running the Project

```bash
# Install dependencies
pnpm install

# Run all services
pnpm dev

# Run specific service
pnpm --filter web dev
pnpm --filter remotion-server dev
pnpm --filter processing-engine dev
```

### Service Ports

- **Web App**: http://localhost:3000
- **Remotion Server**: http://localhost:3001
- **Processing Engine**: http://localhost:8000

### Environment Variables

See full list in the **Environment Variables** section below.

## Testing Approach

1. **Services**: Unit test business logic independently
2. **API Routes**: Integration tests with mock services
3. **Components**: Component tests with React Testing Library
4. **Types**: Validate Zod schemas with test data

## Performance Considerations

1. **Server Components**: Default choice, add 'use client' only when needed
2. **Code Splitting**: Lazy load heavy components with `dynamic()`
3. **Caching**: Use Next.js caching strategies appropriately
4. **Images**: Always use Next.js `<Image>` component

## Key Application Flows

### Video Processing Pipeline (Video Wizard)

1. User uploads video → `processing-engine`
2. Engine extracts audio → Whisper transcription
3. Web app receives transcription
4. GPT-4o analyzes for viral clips (30-90s)
5. Clips scored 0-100 for viral potential
6. User edits subtitles and selects template
7. Remotion renders final video with subtitles

### NEW! Subtitle Generation Flow (Standalone)

1. User uploads video → `processing-engine`
2. Engine extracts audio → Whisper transcription
3. Web app receives subtitles (NO content analysis)
4. User edits subtitles in visual editor
5. User selects template (9 options: viral, minimal, modern, etc.)
6. Remotion renders video with subtitles
7. User downloads final video

**Key Difference**: No AI analysis for viral clips, just pure subtitle generation and rendering.

### Remotion Rendering Flow

1. Send render request to remotion-server with:
   - Video URL (from processing-engine)
   - Subtitles array (in SECONDS, not milliseconds)
   - Template name
   - Language code
   - Aspect ratio dimensions
   - Brand kit (optional)
2. Server creates job and returns jobId
3. Client polls job status every 2 seconds
4. Remotion renders video with captions (up to 30 min timeout)
5. Returns final video URL when complete

**Important**: Subtitles must be in SECONDS. The service converts from milliseconds to seconds before sending to Remotion.

## Important Notes

### What Claude Should Know

1. **All code and comments must be in English**
2. **Avoid over-engineering**: Only add what's needed
3. **No premature abstractions**: Three similar lines > wrong abstraction
4. **Delete unused code**: No backwards-compatibility hacks
5. **Trust the architecture**: Follow established patterns
6. **Services are the source of truth**: Business logic lives there

### Common Mistakes to Avoid

- ❌ Business logic in API routes
- ❌ Using `any` type
- ❌ Direct service imports in client components
- ❌ State management in presentational components
- ❌ Creating abstractions for single use cases
- ❌ Adding features that weren't requested

### When Uncertain

1. Check existing similar code patterns
2. Read the feature's README.md
3. Review `.copilot/` documentation
4. Ask for clarification before implementing

## Documentation References

- **Architecture**: `ARCHITECTURE.md` - System design overview
- **Feature Guide**: `FEATURE_GUIDE.md` - Creating new features
- **Code Patterns**: `.copilot/code-patterns.md` - Common templates
- **Remotion Guide**: `REMOTION_INFRASTRUCTURE.md` - Video rendering
- **Project Instructions**: `.copilot/project-instructions.md` - Detailed guidelines

## Key Packages

- `@ai-sdk/openai` - OpenAI integration
- `@remotion/lambda` - Video rendering
- `zod` - Schema validation
- `class-variance-authority` - Component variants
- `tailwindcss` - Styling

## Git Workflow

- **Branch naming**: `feature/name`, `fix/name`, `refactor/name`
- **Commits**: Clear, descriptive messages in English
- **Pull Requests**: Include description and testing notes

## Quick Reference

### Check if file exists before reading
```typescript
// Always safe to read directly - errors are handled
const content = await readFile(path);
```

### Create new service
```typescript
export class MyService {
  async method(): Promise<Result> {
    // Implementation
  }
}

export const myService = new MyService();
```

### Create API response
```typescript
// Success
return NextResponse.json({ success: true, data });

// Error
return NextResponse.json(
  { success: false, error: 'Message' },
  { status: 500 }
);
```

### Use feature hooks
```typescript
// Video Wizard (full pipeline with AI analysis)
const {
  file, youtubeUrl, inputMode, aspectRatio,
  currentStep, uploadedPath, transcription, analysis,
  language, error, progress,
  setFile, setYoutubeUrl, setInputMode, setAspectRatio,
  processVideo, resetState,
} = useVideoProcessing();

// Subtitle Generator (standalone, no AI analysis)
const {
  file, youtubeUrl, inputMode, aspectRatio,
  currentStep, subtitles, selectedTemplate,
  renderedVideoUrl, language, error, progress,
  setFile, setYoutubeUrl, setInputMode, setAspectRatio,
  setLanguage, setTemplate, updateSubtitles,
  generateSubtitles, renderVideo, resetState,
} = useSubtitleGeneration();

// Brand Kit (localStorage persisted)
const {
  brandKit, setBrandKit, updateBrandKit, clearBrandKit,
} = useBrandKit();
```

---

## Complete API Reference

### API Endpoints

| Method | Route | Description | Service |
|--------|-------|-------------|---------|
| POST | `/api/transcribe` | Proxy to Python transcription | ClipIntegrationService |
| POST | `/api/analyze-content` | AI viral clip detection | ContentAnalysisService |
| POST | `/api/create-clip` | Create vertical clip (smart crop) | ClipIntegrationService |
| POST | `/api/generate-subtitles` | Generate subtitles from video | SubtitleGenerationService |
| POST | `/api/render-video-subtitles` | Render video with subtitles | SubtitleGenerationService |
| POST | `/api/render-with-subtitles` | Re-render clip with edited subtitles | SubtitleGenerationService |
| POST | `/api/render-final` | Final render (disabled, returns 501) | — |

### Services

| Service | File | Methods |
|---------|------|---------|
| **ContentAnalysisService** | `server/services/content-analysis-service.ts` | `analyzeTranscript()`, `validateTranscript()` |
| **SubtitleGenerationService** | `server/services/subtitle-generation-service.ts` | `generateSubtitles()`, `renderWithSubtitles()`, `pollRenderJob()`, `getRenderStatus()` |
| **ClipIntegrationService** | `server/services/clip-integration-service.ts` | `createClip()`, `transcribeVideo()`, `uploadVideo()`, `getVideoUrl()` |
| **VideoRenderService** | `server/services/video-render-service.ts` | Legacy — server-side rendering disabled |

---

## Subtitle Generator Feature

### Overview

The Subtitle Generator is a standalone feature that allows users to generate and render subtitles without content analysis. It's a simpler, faster workflow for users who just need subtitles.

### Architecture

**Service Layer**:
- `apps/web/server/services/subtitle-generation-service.ts`
  - `generateSubtitles()` - Transcribe video with Whisper
  - `renderWithSubtitles()` - Render video with Remotion
  - `pollRenderJob()` - Poll job status until completion (30min timeout, 2s interval)
  - `getRenderStatus()` - Get current job status without polling

**API Routes**:
- `POST /api/generate-subtitles` - Generate subtitles from video
- `POST /api/render-video-subtitles` - Render video with subtitles

**Frontend**:
- Hook: `features/video/hooks/use-subtitle-generation.ts`
- Components:
  - `TemplateSelector` - Choose from 9 templates
  - `SubtitleEditor` - Edit, merge, delete subtitles + SRT/VTT export
  - `AspectRatioSelector` - Choose output aspect ratio (9:16, 1:1, 4:5, 16:9)
  - `BrandKitSettings` - Logo, colors, fonts customization
  - `SilenceFillerPanel` - Auto-detect and remove silences, fillers, short segments
- Container: `SubtitleGeneratorContainer` - Main page orchestration
- Page: `app/subtitle-generator/page.tsx`

### Available Templates

1. **viral** - Bold, eye-catching (social media)
2. **minimal** - Clean and simple
3. **modern** - Contemporary with animations
4. **default** - Standard subtitles
5. **highlight** - Key words in color
6. **colorshift** - Dynamic color transitions
7. **hormozi** - High-impact (Alex Hormozi style)
8. **mrbeast** - Bold and energetic
9. **mrbeastemoji** - MrBeast with dynamic emojis

### Workflow States

```typescript
type SubtitleGenerationStep =
  | 'idle'              // Initial state
  | 'uploading'         // Uploading video to server
  | 'generating-subtitles' // Transcribing with Whisper
  | 'editing'           // User editing subtitles
  | 'rendering'         // Remotion rendering video
  | 'complete'          // Ready to download
  | 'error';            // Error occurred
```

### Time Format Conversion

**CRITICAL**: Subtitles use different time formats at different stages:

```typescript
// 1. Whisper returns: SECONDS
{ start: 0.5, end: 2.3 }

// 2. Frontend stores: MILLISECONDS
{ start: 500, end: 2300 }

// 3. Service sends to Remotion: SECONDS
{ start: 0.5, end: 2.3 }

// 4. Remotion uses: SECONDS (for frame calculations)
currentTime (seconds) vs segment.start/end (seconds)
```

**Bug Fixed** (2026-01-30): Remotion was incorrectly dividing by 1000 again, causing 60s videos to render as 0.06s. Now uses seconds directly.

### Subtitle Timing Adjustment

Subtitles have a **200ms offset** to improve sync:

```typescript
// In packages/remotion-compositions/src/hooks/useActiveSubtitle.ts
const SUBTITLE_OFFSET = 0.2; // 200ms delay

// Adjustable values:
// - Increase (0.3-0.5) if subtitles too early
// - Decrease (0.0-0.1) if subtitles too late
// - Negative (-0.1 to -0.3) if need to advance
```

### Navigation Integration

The Subtitle Generator is accessible from:
1. **Dashboard** (`/`) - Card in 4-column grid
2. **Sidebar** - Always visible navigation item
3. **Direct URL** - `/subtitle-generator`

### Common Issues & Fixes

**Issue**: Subtitles don't appear in rendered video
- **Cause**: Time format mismatch or incorrect duration calculation
- **Fix**: Check `Root.tsx:66` uses `lastSubtitle.end` directly (not `/1000`)
- **Docs**: See `SUBTITLE_FIX.md`

**Issue**: Subtitles appear too early/late
- **Cause**: Timing offset needs adjustment
- **Fix**: Modify `SUBTITLE_OFFSET` in `useActiveSubtitle.ts:33`
- **Docs**: See `SUBTITLE_TIMING_ADJUSTMENT.md`

**Issue**: Template not recognized
- **Cause**: Schema doesn't include all templates
- **Fix**: Check `Root.tsx:29` includes all 9 templates
- **Fixed**: 2026-01-30

---

## Brand Kit System

### Overview

Persistent brand customization that applies across all subtitle templates. Stored in `localStorage` and sent to Remotion for rendering.

### Architecture

- **Types**: `features/video/types/brand-kit.ts` — Zod schema with validation
- **Hook**: `features/video/hooks/use-brand-kit.ts` — State + localStorage persistence
- **Component**: `features/video/components/brand-kit-settings.tsx` — Collapsible settings UI

### BrandKit Schema

```typescript
BrandKit {
  logoUrl?: string;              // URL to logo image
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; // default: 'top-right'
  logoScale: number;             // 0.1–2.0, default: 1
  primaryColor?: string;         // Hex #RRGGBB
  secondaryColor?: string;       // Hex #RRGGBB
  textColor?: string;            // Hex #RRGGBB
  backgroundColor?: string;      // Hex #RRGGBB
  fontFamily?: string;           // CSS font stack
}
```

### Font Options

10 predefined fonts: Impact, Montserrat, Helvetica Neue, System UI, Georgia, Oswald, Roboto, Inter, Poppins, Arial.

### Usage

```typescript
const { brandKit, setBrandKit, updateBrandKit, clearBrandKit } = useBrandKit();

// In render call
renderVideo(brandKit); // Passes brand kit to Remotion server
```

---

## Silence/Filler Detection System

### Overview

Automated detection and cleanup of silences, filler words, and short noise segments in subtitle data.

### Architecture

- **Types**: `features/video/types/silence-filler.ts` — Detection types, config schema
- **Utility**: `features/video/lib/silence-filler-detection.ts` — Pure detection algorithms
- **Component**: `features/video/components/silence-filler-panel.tsx` — Cleanup UI

### Detection Types

1. **Silence**: Gaps between consecutive segments > threshold (default: 1000ms)
2. **Filler Words**: Segments containing "um", "uh", "like", "you know", etc. (13 default fillers)
3. **Short Segments**: Segments shorter than threshold (default: 300ms)

### Configuration

```typescript
SilenceFillerConfig {
  silenceThresholdMs: number;       // default: 1000
  minSegmentDurationMs: number;     // default: 300
  fillerWords: string[];            // 13 defaults (um, uh, like, etc.)
  enableSilenceDetection: boolean;  // default: true
  enableFillerDetection: boolean;   // default: true
  enableShortSegmentDetection: boolean; // default: true
}
```

### API

```typescript
// Run detection
const result: DetectionResult = detectIssues(subtitles, config, timeScale);

// Remove detected segments
const cleaned = removeDetectedIssues(subtitles, result.issues);

// Strip filler words from text (keeping segments)
const cleaned = cleanFillerWordsFromText(subtitles, fillerWords);
```

### Time Scale Parameter

- `timeScale = 1` when subtitles are in milliseconds (Subtitle Generator)
- `timeScale = 1000` when subtitles are in seconds (Video Wizard)

---

## Multi-Aspect Ratio Support

### Supported Ratios

| Ratio | Dimensions | Label | Use Case |
|-------|-----------|-------|----------|
| 9:16 | 1080×1920 | Vertical | TikTok, Reels, Stories |
| 1:1 | 1080×1080 | Square | Instagram Posts |
| 4:5 | 1080×1350 | Portrait | Instagram Feed |
| 16:9 | 1920×1080 | Landscape | YouTube, Standard |

### Architecture

- **Config**: `features/video/lib/aspect-ratios.ts` — Dimensions, labels, CSS classes
- **Component**: `features/video/components/aspect-ratio-selector.tsx` — Visual grid selector
- **Default**: `9:16` (vertical, most common for short-form content)

### Usage

```typescript
import { ASPECT_RATIO_CONFIG, getDimensions, getAspectClass } from '@/features/video/lib/aspect-ratios';

const { width, height } = getDimensions('9:16'); // { width: 1080, height: 1920 }
const cssClass = getAspectClass('1:1'); // 'aspect-square'
```

---

## YouTube Integration

### Overview

Both Video Wizard and Subtitle Generator support YouTube URL input as an alternative to file upload.

### Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/v/VIDEO_ID`

### Architecture

- **Utility**: `features/video/lib/youtube.ts` — `isYouTubeUrl()`, `extractVideoId()`
- **Processing**: Python engine `POST /download-youtube` endpoint
- **UI**: Tab-based input mode in both containers (`file` | `youtube`)

---

## Subtitle Export

### Overview

Export edited subtitles as SRT or VTT files for use in external video editors.

### Supported Formats

- **SRT** (SubRip Text): `HH:MM:SS,mmm` timestamps
- **VTT** (WebVTT): `HH:MM:SS.mmm` timestamps with `WEBVTT` header

### API

```typescript
import { downloadSrt, downloadVtt } from '@/features/video/lib/subtitle-export';

downloadSrt(subtitles, 'my-video');  // Downloads my-video.srt
downloadVtt(subtitles, 'my-video');  // Downloads my-video.vtt
```

---

## Processing Engine (Python) Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Service info |
| GET | `/health` | Health check |
| POST | `/upload` | Video file upload |
| POST | `/transcribe` | Whisper transcription |
| POST | `/render-clip` | Smart vertical clip creation |
| POST | `/analyze-video` | Face/head tracking analysis |
| POST | `/render-video` | Apply crop data to video |
| POST | `/process-video` | Full analyze + render pipeline |
| POST | `/download-youtube` | Download YouTube video |
| GET | `/uploads/{path}` | Serve uploaded files |
| GET | `/output/{path}` | Serve rendered output |

## Remotion Server Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/renders` | Create render job |
| GET | `/renders/:jobId` | Get job status/video URL |
| GET | `/renders/*` | Serve rendered video files |

---

## Environment Variables

Required in `apps/web/.env.local`:
```bash
OPENAI_API_KEY=sk-...                           # OpenAI API key (required)
NEXT_PUBLIC_PYTHON_ENGINE_URL=http://localhost:8000  # Processing engine URL
REMOTION_SERVER_URL=http://localhost:3001            # Remotion render server
PYTHON_ENGINE_INTERNAL_URL=http://processing-engine:8000  # Docker container URL
```

---

## Testing the Features

```bash
# 1. Start all services
pnpm dev  # Or start individually

# 2. Test Subtitle Generator
open http://localhost:3000/subtitle-generator
# - Upload a short video (10-30s for quick testing)
# - Or paste a YouTube URL
# - Wait for subtitle generation
# - Test cleanup tools (silence/filler detection)
# - Edit subtitles in the editor
# - Select different templates and aspect ratios
# - Configure brand kit (optional)
# - Render and download

# 3. Test Video Wizard
open http://localhost:3000/video-wizard
# - Upload video → transcription → AI analysis
# - View viral clips with scores
# - Edit individual clips with template selection

# 4. Test Content Intelligence
open http://localhost:3000/content-intelligence
# - Paste transcript or use sample
# - View viral clip analysis

# 5. Verify logs
# Check Remotion Server console for:
# [Remotion] Calculated duration: { durationInSeconds: X }
# [useActiveSubtitle] Active segment: { currentTime: X }
```

---

**Remember**: This is a clean, well-architected codebase. Follow the established patterns, keep concerns separated, and maintain the screaming architecture approach. When in doubt, check existing code for examples.
