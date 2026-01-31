# Claude Code Instructions for Video Wizard

## Project Overview

Video Wizard is a monorepo application for AI-powered video content analysis, viral clip identification, and subtitle generation. It consists of three main services:

1. **Web App** (Next.js 16 + TypeScript) - Frontend and API
2. **Remotion Server** (Express + Remotion) - Video rendering with subtitles
3. **Processing Engine** (Python + FastAPI) - Video processing and transcription

### Main Features

1. **Video Wizard** (`/video-wizard`) - Full viral clip analysis pipeline
   - Upload video → Transcribe → AI analysis → Extract viral clips
   - Scoring system (0-100) for viral potential
   - Subtitle editing and template selection

2. **Subtitle Generator** (`/subtitle-generator`) - NEW! Standalone subtitle generation
   - Upload video → Generate subtitles → Select template → Render
   - 9 customizable templates (viral, minimal, modern, hormozi, mrbeast, etc.)
   - Real-time subtitle editing
   - No content analysis required

3. **Content Intelligence** (`/content-intelligence`) - AI-powered transcript analysis
   - Analyze existing transcripts
   - Viral moment detection
   - Engagement insights

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
│   │   │   │   ├── generate-subtitles/    # NEW! Generate subtitles only
│   │   │   │   ├── render-video-subtitles/ # NEW! Render with subtitles
│   │   │   │   └── render-with-subtitles/ # Regenerate with edited subtitles
│   │   │   ├── video-wizard/     # Full pipeline page
│   │   │   ├── subtitle-generator/ # NEW! Standalone subtitle generation
│   │   │   └── content-intelligence/  # Transcript analysis page
│   │   ├── features/             # Feature modules
│   │   │   └── video/            # Video processing feature
│   │   │       ├── components/   # UI components
│   │   │       │   ├── subtitle-editor.tsx      # NEW! Edit subtitles
│   │   │       │   └── template-selector.tsx    # NEW! Select templates
│   │   │       ├── containers/   # Page containers
│   │   │       │   └── subtitle-generator-container.tsx # NEW!
│   │   │       └── hooks/        # React hooks
│   │   │           └── use-subtitle-generation.ts # NEW! Subtitle workflow
│   │   ├── server/               # Server-side code
│   │   │   ├── services/         # Business logic
│   │   │   │   └── subtitle-generation-service.ts # NEW! Subtitle service
│   │   │   ├── types/            # Zod schemas & types
│   │   │   ├── config/           # Configuration
│   │   │   ├── prompts/          # AI prompts
│   │   │   └── lib/              # Server utilities
│   │   ├── components/           # Shared UI
│   │   │   └── ui/               # shadcn/ui components
│   │   └── lib/                  # Client utilities
│   ├── remotion-server/          # Remotion render server
│   │   ├── server/               # Express API
│   │   └── renders/              # Output directory
│   └── processing-engine/        # Python video service
│       ├── main.py               # FastAPI app
│       ├── analyzer.py           # AI video analysis
│       ├── renderer.py           # FFmpeg rendering
│       └── audio_service.py      # Transcription
├── packages/
│   ├── remotion-compositions/    # Shared Remotion templates
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

Required in `apps/web/.env.local`:
```bash
OPENAI_API_KEY=sk-...
```

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
   - Duration in frames
2. Server creates job and returns jobId
3. Client polls job status every 2 seconds
4. Remotion renders video with captions (up to 30 min timeout)
5. Returns final video URL when complete

**Important**: Subtitles must be in SECONDS. The service converts from milliseconds to seconds before sending to Remotion.
4. Returns video file or progress updates

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

### Use feature hook
```typescript
const { state, actions } = useVideoProcessing();

// NEW! For subtitle generation only
const {
  file,
  subtitles,
  selectedTemplate,
  setFile,
  setTemplate,
  updateSubtitles,
  generateSubtitles,
  renderVideo,
} = useSubtitleGeneration();
```

---

## NEW! Subtitle Generator Feature

### Overview

The Subtitle Generator is a standalone feature that allows users to generate and render subtitles without content analysis. It's a simpler, faster workflow for users who just need subtitles.

### Architecture

**Service Layer**:
- `apps/web/server/services/subtitle-generation-service.ts`
  - `generateSubtitles()` - Transcribe video with Whisper
  - `renderWithSubtitles()` - Render video with Remotion
  - `pollRenderJob()` - Poll job status until completion

**API Routes**:
- `POST /api/generate-subtitles` - Generate subtitles from video
- `POST /api/render-video-subtitles` - Render video with subtitles

**Frontend**:
- Hook: `features/video/hooks/use-subtitle-generation.ts`
- Components:
  - `TemplateSelector` - Choose from 9 templates
  - `SubtitleEditor` - Edit, merge, delete subtitles
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

### Testing the Feature

```bash
# 1. Start all services
pnpm dev  # Or start individually

# 2. Navigate to subtitle generator
open http://localhost:3000/subtitle-generator

# 3. Test workflow
# - Upload a short video (10-30s for quick testing)
# - Wait for subtitle generation
# - Edit a subtitle to verify editor works
# - Select different templates
# - Render and download

# 4. Verify logs
# Check Remotion Server console for:
# [Remotion] Calculated duration: { durationInSeconds: X }
# [useActiveSubtitle] Active segment: { currentTime: X }
```

### Example Usage

```typescript
// Programmatic usage of the service
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

// Generate subtitles
const result = await subtitleGenerationService.generateSubtitles({
  videoPath: 'uploads/my-video.mp4',
  language: 'en', // or 'auto'
});

// Render with template
const rendered = await subtitleGenerationService.renderWithSubtitles({
  videoPath: 'uploads/my-video.mp4',
  subtitles: result.subtitles,
  template: 'viral',
  language: 'en',
});

console.log('Video URL:', rendered.videoUrl);
```

### Documentation Files

- `SUBTITLE_GENERATOR.md` - Complete feature documentation
- `SUBTITLE_FIX.md` - Bug fixes and troubleshooting
- `SUBTITLE_TIMING_ADJUSTMENT.md` - Timing configuration guide
- `NAVIGATION_UPDATE.md` - Navigation integration details

---

**Remember**: This is a clean, well-architected codebase. Follow the established patterns, keep concerns separated, and maintain the screaming architecture approach. When in doubt, check existing code for examples.
