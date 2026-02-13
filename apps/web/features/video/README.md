# Video Feature Module

This module implements the complete video processing workflows using a screaming architecture pattern.

## Overview

The video feature handles two main workflows:

1. **Video Wizard** — Full pipeline: upload → transcribe → AI analysis → viral clips → render
2. **Subtitle Generator** — Standalone: upload → transcribe → edit → render (no AI analysis)

Plus cross-cutting capabilities:

- Multi-aspect ratio output (9:16, 1:1, 4:5, 16:9)
- Brand kit customization (logo, colors, fonts)
- Silence/filler word detection and cleanup
- Subtitle export (SRT/VTT)
- YouTube URL support

## Architecture

This module follows the **screaming architecture** pattern with separation between:

- **Components** (`components/`): Atomic, presentational React components (client-side)
- **Containers** (`containers/`): Client-side components that orchestrate state and logic
- **Hooks** (`hooks/`): Custom React hooks for state management and side effects
- **Types** (`types/`): TypeScript interfaces, Zod schemas, and type definitions
- **Utils** (`lib/`): Utility functions and helpers

### Component Patterns

We use two component patterns:

#### Presentational Components

- Pure and atomic
- Receive data via props
- Emit events via callbacks
- Don't contain business logic
- Are highly reusable

#### Container Components

- Use 'use client' directive
- Manage state with hooks
- Orchestrate presentational components
- Handle lifecycle events
- Provide data to child components

## Module Structure

```
features/video/
├── components/                    # Presentational components
│   ├── analysis-results.tsx       # AI analysis display with clip list
│   ├── aspect-ratio-selector.tsx  # 4-ratio visual grid selector
│   ├── brand-kit-settings.tsx     # Logo, colors, fonts customization
│   ├── clip-card.tsx              # Individual viral clip card
│   ├── clip-edit-modal.tsx        # Modal for editing clip details
│   ├── processing-progress.tsx    # Step-by-step progress indicator
│   ├── remotion-preview.tsx       # Video preview with Remotion Player
│   ├── silence-filler-panel.tsx   # Cleanup tools (silence/filler detection)
│   ├── subtitle-editor.tsx        # Table-based subtitle editing + export
│   ├── template-selector.tsx      # Radio group with 9 templates
│   ├── transcription-results.tsx  # Transcription segment display
│   ├── video-header.tsx           # Page title and description
│   ├── video-how-it-works.tsx     # Educational information
│   ├── video-uploader.tsx         # Drag-and-drop file upload
│   └── index.ts                   # Component exports
├── containers/                    # Container components
│   ├── subtitle-generator-container.tsx  # Subtitle Generator orchestrator
│   └── video-container.tsx        # Video Wizard orchestrator
├── hooks/                         # Custom hooks
│   ├── use-brand-kit.ts           # Brand kit state (localStorage persistence)
│   ├── use-subtitle-generation.ts # Subtitle Generator workflow state
│   └── use-video-processing.ts    # Video Wizard workflow state
├── types/                         # Type definitions
│   ├── brand-kit.ts               # BrandKit Zod schema + types
│   ├── silence-filler.ts          # Detection types + config schema
│   └── index.ts                   # Core feature types
├── lib/                           # Utilities
│   ├── aspect-ratios.ts           # Aspect ratio config, dimensions, CSS
│   ├── silence-filler-detection.ts # Detection algorithms (pure functions)
│   ├── subtitle-export.ts         # SRT/VTT export + download
│   ├── utils.ts                   # formatTimestamp, validateVideoFile, etc.
│   └── youtube.ts                 # YouTube URL validation
├── index.ts                       # Main module export
└── README.md                      # This file
```

## Usage

### Recommended: Using Container Component (Server Page)

```tsx
// app/video-wizard/page.tsx (Server Component)
import { VideoContainer } from '@/features/video/containers/video-container';

export default function VideoWizardPage() {
  return <VideoContainer />;
}
```

```tsx
// app/subtitle-generator/page.tsx (Server Component)
import { SubtitleGeneratorContainer } from '@/features/video/containers/subtitle-generator-container';

export default function SubtitleGeneratorPage() {
  return <SubtitleGeneratorContainer />;
}
```

This is the **recommended approach** because:

- Pages remain server components by default
- Better performance (smaller client bundle)
- Follows Next.js App Router best practices
- Clean separation between server and client code

## Containers

### SubtitleGeneratorContainer

Main container for the `/subtitle-generator` page.

**Location**: `containers/subtitle-generator-container.tsx`

**Features**:

- 4-step workflow: Upload/Configure → Edit Subtitles → Configure Output → Download
- Tab-based input selection (file upload / YouTube URL)
- Language selector with 10+ languages
- AspectRatioSelector component
- TemplateSelector with 9 templates
- SubtitleEditor for manual editing
- SilenceFillerPanel for automatic cleanup
- BrandKitSettings integration
- Download buttons for rendered video

### VideoContainer

Main container for the `/video-wizard` page.

**Location**: `containers/video-container.tsx`

**Features**:

- Uses `useVideoProcessing` hook for state management
- Orchestrates: Upload → Transcribe → Analyze → Generate clips → Edit → Render
- Displays up to 5 top clips sorted by viral score
- Individual clip editing via ClipEditModal
- ClipCard components for each clip with template switching

## Components

### VideoUploader

Handles file selection and upload initiation.

- **Props**: `file`, `currentStep`, `onFileSelect`, `onProcess`, `onReset`, `error`
- **Validation**: File type (video/\*), size (max 5GB)

### SubtitleEditor

Table-based editor for subtitle segments.

- **Props**: `subtitles`, `onSubtitlesChange`, `disabled`
- **Features**: Edit text/timing, add/delete/merge segments, SRT/VTT export

### TemplateSelector

Radio group for selecting caption templates.

- **Props**: `selected`, `onChange`, `disabled`
- **Templates**: viral, minimal, modern, default, highlight, colorshift, hormozi, mrbeast, mrbeastemoji

### AspectRatioSelector

Visual grid for selecting output aspect ratio.

- **Props**: `selected`, `onChange`, `disabled`, `className`
- **Ratios**: 9:16 (Vertical), 1:1 (Square), 4:5 (Portrait), 16:9 (Landscape)

### BrandKitSettings

Collapsible settings for brand customization.

- **Props**: `brandKit`, `onBrandKitChange`, `disabled`
- **Sections**: Logo (URL, position, scale), Colors (primary, secondary, text, bg), Typography (font family)

### SilenceFillerPanel

Automated cleanup tools for subtitle quality.

- **Props**: `subtitles`, `onSubtitlesChange`, `disabled`, `timeScale`
- **Actions**: Auto-Clean All, Clean Filler Text, Remove Filler Segments, Remove Short Segments
- **Detection**: Silences, filler words (13 defaults), short segments
- **Settings**: Configurable silence threshold, min segment duration

### ClipCard

Displays an individual viral clip with metadata.

- **Props**: `clip`, `index`, `onEdit`, `onRender`
- **Info**: Viral score, duration, summary, hook, conclusion

### ClipEditModal

Modal for editing individual clip details.

- **Props**: `clip`, `isOpen`, `onClose`, `onSave`

### ProcessingProgress

Step-by-step progress indicator.

- **Props**: `currentStep`, `progress`, `error`

### RemotionPreview

Client-side video preview using Remotion Player.

### TranscriptionResults

Displays transcription segments with timestamps.

- **Props**: `transcription`
- **Format**: `[MM:SS - MM:SS] Text`

### AnalysisResults

Shows AI analysis summary and viral clip recommendations.

- **Props**: `analysis`, `onClipSelect`

### VideoHeader

Static header with title, description, and badges.

### VideoHowItWorks

Educational component explaining the workflow.

## Hooks

### useSubtitleGeneration

Manages the standalone subtitle generation workflow.

**State**:

```typescript
{
  file: File | null;
  youtubeUrl: string;
  inputMode: 'file' | 'youtube';
  aspectRatio: AspectRatio;            // '9:16' | '1:1' | '4:5' | '16:9'
  currentStep: SubtitleGenerationStep; // idle → uploading → generating → editing → rendering → complete
  uploadedPath: string;
  subtitles: SubtitleSegment[];        // Stored in MILLISECONDS
  language: string;
  selectedTemplate: CaptionTemplate;
  renderedVideoUrl: string;
  error: string;
  progress: string;
}
```

**Methods**:

- `setFile()`, `setYoutubeUrl()`, `setInputMode()`, `setAspectRatio()`, `setLanguage()`, `setTemplate()`
- `updateSubtitles()` — Update subtitle array
- `generateSubtitles()` — Upload video + transcribe
- `renderVideo(brandKit?)` — Render with Remotion
- `resetState()` — Reset to initial state

### useVideoProcessing

Manages the full Video Wizard workflow.

**State**:

```typescript
{
  file: File | null;
  youtubeUrl: string;
  inputMode: 'file' | 'youtube';
  aspectRatio: AspectRatio;
  currentStep: ProcessingStep; // idle → uploading → transcribing → analyzing → complete
  uploadedPath: string;
  transcription: TranscriptionResult | null;
  analysis: ContentAnalysis | null;
  language: string;
  error: string;
  progress: string;
}
```

**Methods**:

- `setFile()`, `setYoutubeUrl()`, `setInputMode()`, `setAspectRatio()`
- `processVideo()` — Upload → Transcribe → Analyze (full pipeline)
- `resetState()` — Reset to initial state

### useBrandKit

Manages brand kit state with localStorage persistence.

**Returns**:

```typescript
{
  brandKit: BrandKit | null;
  setBrandKit: (kit: BrandKit | null) => void;
  updateBrandKit: (updates: Partial<BrandKit>) => void;
  clearBrandKit: () => void;
}
```

## Types

### Core Types (`types/index.ts`)

```typescript
type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

type ProcessingStep = 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'error';

type SubtitleGenerationStep =
  | 'idle'
  | 'uploading'
  | 'generating-subtitles'
  | 'editing'
  | 'rendering'
  | 'complete'
  | 'error';

type SubtitleTemplate =
  | 'viral'
  | 'minimal'
  | 'modern'
  | 'default'
  | 'highlight'
  | 'colorshift'
  | 'hormozi'
  | 'mrbeast'
  | 'mrbeastemoji';

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  video_path: string;
  audio_path?: string;
  segments: TranscriptSegment[];
  full_text: string;
  segment_count: number;
  language: string;
}

interface GeneratedClip {
  index: number;
  summary: string;
  viralScore: number;
  startTime: number;
  endTime: number;
  duration: number;
  videoUrl?: string;
  clipPath?: string;
  renderedVideoUrl?: string;
  template?: SubtitleTemplate;
  language?: string;
  aspectRatio?: AspectRatio;
  isLoading: boolean;
  isRendering?: boolean;
  error?: string;
}
```

### Brand Kit Types (`types/brand-kit.ts`)

```typescript
BrandKit {
  logoUrl?: string;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoScale: number;       // 0.1–2.0
  primaryColor?: string;   // Hex #RRGGBB
  secondaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;     // CSS font stack
}
```

### Silence/Filler Types (`types/silence-filler.ts`)

```typescript
type DetectedIssueType = 'silence' | 'filler' | 'short-segment';

interface DetectedIssue {
  type: DetectedIssueType;
  segmentIndex: number;
  start: number;
  end: number;
  duration: number;
  description: string;
  matchedFillers?: string[];
  gapAfterIndex?: number;
}

interface DetectionResult {
  issues: DetectedIssue[];
  silenceCount: number;
  fillerCount: number;
  shortSegmentCount: number;
  totalSilenceDuration: number;
  totalFillerDuration: number;
}
```

## Utilities

### `lib/utils.ts`

- `formatTimestamp(seconds)` — Converts to `MM:SS` format
- `formatTranscriptForAI(segments)` — Formats as `[MM:SS - MM:SS] text` for AI
- `validateVideoFile(file)` — Validates type and size (max 5GB)
- `getPythonEngineUrl()` — Gets processing engine URL from env

### `lib/aspect-ratios.ts`

- `ASPECT_RATIO_CONFIG` — Dimensions, labels, descriptions, CSS classes for each ratio
- `getDimensions(ratio)` — Returns `{ width, height }` for a given ratio
- `getAspectClass(ratio)` — Returns Tailwind CSS class string

### `lib/subtitle-export.ts`

- `subtitlesToSrt(subtitles)` — Convert to SRT format string
- `subtitlesToVtt(subtitles)` — Convert to VTT format string
- `downloadSrt(subtitles, filename)` — Download as `.srt` file
- `downloadVtt(subtitles, filename)` — Download as `.vtt` file

### `lib/youtube.ts`

- `isYouTubeUrl(url)` — Validates YouTube URL format
- `extractVideoId(url)` — Extracts 11-character video ID

### `lib/silence-filler-detection.ts`

- `detectIssues(subtitles, config?, timeScale?)` — Run all enabled detectors
- `removeDetectedIssues(subtitles, issues)` — Remove affected segments
- `cleanFillerWordsFromText(subtitles, fillerWords?)` — Strip filler words from text
- `getDefaultFillerWords()` — Returns default filler word list

## Configuration

Environment variables used:

```env
NEXT_PUBLIC_PYTHON_ENGINE_URL=http://localhost:8000
```

## Integration

This feature integrates with:

- **Python Processing Engine**: Video upload, transcription, clip creation, YouTube download
- **Content Analysis Service**: AI-powered viral clip detection (`server/services/content-analysis-service.ts`)
- **Subtitle Generation Service**: Subtitle generation and Remotion rendering (`server/services/subtitle-generation-service.ts`)
- **Clip Integration Service**: Clip creation and file management (`server/services/clip-integration-service.ts`)
- **Remotion Compositions**: 9 caption templates (`packages/remotion-compositions/`)

## Related Documentation

- [Project Instructions](../../.copilot/project-instructions.md)
- [Code Patterns](../../.copilot/code-patterns.md)
- [Server Module](../../server/README.md)
- [Remotion Compositions](../../../../packages/remotion-compositions/README.md)
