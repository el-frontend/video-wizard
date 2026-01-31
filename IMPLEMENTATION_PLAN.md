# Video Wizard - Implementation Plan

**Created**: 2026-01-30
**Status**: Draft for Review
**Version**: 1.0

## Executive Summary

This plan outlines prioritized improvements and new features for Video Wizard based on codebase analysis, identified gaps, and future scalability needs. Items are categorized by priority and include implementation details, affected files, and complexity estimates.

---

## Priority 1: Critical Issues & Security

### 1.1 Processing Engine Security
**Problem**: Processing Engine has no authentication, rate limiting, or request validation. Any client can send unlimited requests.

**Impact**: HIGH - Security vulnerability, potential abuse, resource exhaustion

**Solution**:
- Implement API key authentication
- Add rate limiting middleware (e.g., 10 requests/minute per client)
- Add request size validation
- Add CORS configuration

**Files to Modify**:
- `apps/processing-engine/main.py` - Add auth middleware
- `apps/processing-engine/requirements.txt` - Add slowapi for rate limiting
- `apps/web/.env.local` - Add `PROCESSING_ENGINE_API_KEY`
- `apps/web/server/config/index.ts` - Add API key to config

**Complexity**: Medium (2-3 days)

**Implementation**:
```python
# main.py
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

API_KEY = os.getenv("PROCESSING_ENGINE_API_KEY")
api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/upload", dependencies=[Depends(verify_api_key)])
@limiter.limit("10/minute")
async def upload_video(request: Request, file: UploadFile):
    # Existing code
```

### 1.2 Replace alert() with Proper Toast Notifications
**Problem**: Multiple components use browser `alert()` for error/success messages, creating poor UX.

**Impact**: MEDIUM - Poor user experience, unprofessional UI

**Locations**:
- `apps/web/features/video/containers/video-container.tsx:93, 170, 180, 199, 221, 257, 263, 288, 297`
- `apps/web/features/video/containers/subtitle-generator-container.tsx` (likely similar)

**Solution**:
- Install and configure `sonner` toast library (modern, accessible)
- Create reusable toast utility
- Replace all `alert()` calls with toast notifications

**Files to Modify**:
- `apps/web/package.json` - Add `sonner` dependency
- `apps/web/app/layout.tsx` - Add `<Toaster />` provider
- `apps/web/lib/toast.ts` - Create toast utility wrapper
- All container files using `alert()`

**Complexity**: Low (1 day)

**Implementation**:
```typescript
// lib/toast.ts
import { toast as sonnerToast } from 'sonner';

export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  info: (message: string) => sonnerToast.info(message),
  loading: (message: string) => sonnerToast.loading(message),
};

// Usage in containers:
// Replace: alert('Error occurred');
// With: toast.error('Error occurred');
```

### 1.3 Centralized Error Handling & Logging
**Problem**: Inconsistent error handling across API routes and services. No centralized logging.

**Impact**: MEDIUM - Difficult debugging, inconsistent error responses

**Solution**:
- Create error classes hierarchy
- Implement centralized error logger
- Standardize API error responses
- Add request ID tracking

**Files to Create**:
- `apps/web/server/lib/errors.ts` - Error classes
- `apps/web/server/lib/logger.ts` - Centralized logger
- `apps/web/server/middleware/error-handler.ts` - Error middleware

**Files to Modify**:
- All API routes in `apps/web/app/api/*` - Use error handler
- All services in `apps/web/server/services/*` - Use error classes

**Complexity**: Medium (2-3 days)

**Implementation**:
```typescript
// server/lib/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// server/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});
```

---

## Priority 2: Feature Completions & UX Improvements

### 2.1 Job History Dashboard
**Problem**: Users can't see past jobs, re-download videos, or track processing history.

**Impact**: MEDIUM - Users lose access to previous work, must re-process videos

**Solution**:
- Create jobs database table (SQLite or PostgreSQL)
- Store job metadata (video name, status, timestamps, outputs)
- Build job history UI page
- Add job detail view with re-download capability

**Files to Create**:
- `apps/web/server/db/schema.ts` - Database schema
- `apps/web/server/services/job-history-service.ts` - Job CRUD operations
- `apps/web/app/api/jobs/route.ts` - List jobs API
- `apps/web/app/api/jobs/[id]/route.ts` - Job detail API
- `apps/web/app/jobs/page.tsx` - Job history page
- `apps/web/features/jobs/` - Job feature module

**Files to Modify**:
- All render/process endpoints - Save job records
- `apps/web/components/layout/app-sidebar.tsx` - Add "Job History" nav item

**Complexity**: High (4-5 days)

**Database Schema**:
```typescript
// server/db/schema.ts
export const jobsTable = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'subtitle', 'clip', 'analysis'
  status: text('status').notNull(), // 'pending', 'processing', 'completed', 'failed'
  videoName: text('video_name').notNull(),
  videoPath: text('video_path'),
  outputPath: text('output_path'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  error: text('error'),
});
```

### 2.2 Dynamic Homepage Stats
**Problem**: Homepage shows hardcoded "0" stats instead of real data.

**Impact**: LOW - Misleading information, missed engagement opportunity

**Files to Modify**:
- `apps/web/app/page.tsx:103-113` - Replace hardcoded values
- `apps/web/app/api/stats/route.ts` (create) - Aggregate job data
- Requires 2.1 (Job History) to be completed first

**Complexity**: Low (1 day, after 2.1)

**Implementation**:
```typescript
// app/api/stats/route.ts
export async function GET() {
  const stats = await db.select({
    videosProcessed: count(jobsTable.id),
    clipsGenerated: sum(/* clip count from metadata */),
    hoursEstimated: /* calculation based on video lengths */,
  })
  .from(jobsTable)
  .where(eq(jobsTable.status, 'completed'));

  return NextResponse.json({ success: true, data: stats });
}

// app/page.tsx
export default async function HomePage() {
  const stats = await fetch('/api/stats').then(r => r.json());

  return (
    <div className="text-2xl font-bold">{stats.data.videosProcessed}</div>
  );
}
```

### 2.3 Template Preview Gallery
**Problem**: Users must guess what templates look like before selecting.

**Impact**: MEDIUM - Poor UX, trial-and-error workflow

**Solution**:
- Create preview images/videos for each template
- Build gallery component with visual previews
- Add "Preview" button to render 5-second sample

**Files to Create**:
- `apps/web/public/template-previews/` - Preview images/videos
- `apps/web/features/video/components/template-gallery.tsx` - Gallery component
- `apps/web/app/api/preview-template/route.ts` - Generate preview endpoint

**Files to Modify**:
- `apps/web/features/video/components/template-selector.tsx` - Integrate gallery
- `apps/web/features/video/containers/subtitle-generator-container.tsx` - Add preview option

**Complexity**: Medium (2-3 days)

**Implementation**:
```typescript
// components/template-gallery.tsx
interface TemplateGalleryProps {
  selectedTemplate: TemplateType;
  onSelect: (template: TemplateType) => void;
  onPreview?: (template: TemplateType) => void;
}

export function TemplateGallery({ selectedTemplate, onSelect, onPreview }: TemplateGalleryProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {TEMPLATES.map((template) => (
        <Card key={template.id} className={selectedTemplate === template.id ? 'border-primary' : ''}>
          <img src={`/template-previews/${template.id}.jpg`} alt={template.name} />
          <h3>{template.name}</h3>
          <Button onClick={() => onSelect(template.id)}>Select</Button>
          <Button variant="outline" onClick={() => onPreview?.(template.id)}>Preview</Button>
        </Card>
      ))}
    </div>
  );
}
```

### 2.4 Cross-Feature Integration: Clip → Subtitle Generator
**Problem**: Users must manually copy video info between Video Wizard clips and Subtitle Generator.

**Impact**: MEDIUM - Inefficient workflow, manual data entry

**Solution**:
- Add "Generate Subtitles" button to clip cards
- Pass video path and clip range to Subtitle Generator
- Pre-populate Subtitle Generator with clip data

**Files to Modify**:
- `apps/web/features/video/components/clip-card.tsx` - Add button
- `apps/web/app/subtitle-generator/page.tsx` - Accept URL params
- `apps/web/features/video/containers/subtitle-generator-container.tsx` - Handle pre-population

**Complexity**: Low (1-2 days)

**Implementation**:
```typescript
// clip-card.tsx
<Button
  onClick={() => {
    router.push(`/subtitle-generator?videoPath=${clip.videoPath}&start=${clip.start}&end=${clip.end}`);
  }}
>
  <Subtitles className="mr-2" />
  Generate Subtitles
</Button>

// subtitle-generator-container.tsx
const searchParams = useSearchParams();
const videoPath = searchParams.get('videoPath');
const clipStart = searchParams.get('start');
const clipEnd = searchParams.get('end');

useEffect(() => {
  if (videoPath) {
    // Pre-populate with clip data
    setState(prev => ({
      ...prev,
      uploadedPath: videoPath,
      clipRange: { start: Number(clipStart), end: Number(clipEnd) },
    }));
  }
}, [videoPath]);
```

### 2.5 Subtitle Export Formats (SRT, VTT, ASS)
**Problem**: Users can only get subtitles rendered into video, can't export raw subtitle files.

**Impact**: MEDIUM - Limits flexibility, can't use with other tools

**Solution**:
- Add export format selector
- Implement SRT, VTT, and ASS formatters
- Add download button for raw subtitle files

**Files to Create**:
- `apps/web/server/lib/subtitle-formatters.ts` - Format converters
- `apps/web/app/api/export-subtitles/route.ts` - Export endpoint

**Files to Modify**:
- `apps/web/features/video/containers/subtitle-generator-container.tsx` - Add export UI
- `apps/web/features/video/components/subtitle-editor.tsx` - Add export button

**Complexity**: Low (1-2 days)

**Implementation**:
```typescript
// server/lib/subtitle-formatters.ts
export function formatSRT(subtitles: SubtitleSegment[]): string {
  return subtitles.map((sub, i) => {
    const start = formatSRTTime(sub.start);
    const end = formatSRTTime(sub.end);
    return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
  }).join('\n');
}

export function formatVTT(subtitles: SubtitleSegment[]): string {
  const header = 'WEBVTT\n\n';
  const cues = subtitles.map((sub) => {
    const start = formatVTTTime(sub.start);
    const end = formatVTTTime(sub.end);
    return `${start} --> ${end}\n${sub.text}\n`;
  }).join('\n');
  return header + cues;
}

// Similar for ASS format
```

---

## Priority 3: Performance & Optimization

### 3.1 Parallel Clip Rendering
**Problem**: Clips render sequentially, wasting time when processing multiple clips.

**Impact**: MEDIUM - Long wait times for multi-clip videos

**Solution**:
- Use Promise.all() to render clips in parallel
- Add concurrency limit (max 3 concurrent renders)
- Show progress for each clip individually

**Files to Modify**:
- `apps/web/features/video/hooks/use-video-processing.ts:190-210` - Parallel rendering
- `apps/web/features/video/containers/video-container.tsx` - Multi-progress UI

**Complexity**: Medium (2 days)

**Implementation**:
```typescript
// use-video-processing.ts
const renderClips = async () => {
  const MAX_CONCURRENT = 3;
  const clipBatches = [];

  for (let i = 0; i < selectedClips.length; i += MAX_CONCURRENT) {
    clipBatches.push(selectedClips.slice(i, i + MAX_CONCURRENT));
  }

  for (const batch of clipBatches) {
    await Promise.all(
      batch.map(async (clip, index) => {
        const response = await fetch('/api/render-clip', {
          method: 'POST',
          body: JSON.stringify(clip),
        });

        updateClipProgress(clip.id, 'completed');
        return response.json();
      })
    );
  }
};
```

### 3.2 Transcription Result Caching
**Problem**: Re-uploading same video requires full re-transcription.

**Impact**: MEDIUM - Wasted API calls, slow re-processing

**Solution**:
- Cache transcription results by video hash
- Store in Redis or file-based cache
- Check cache before calling Whisper

**Files to Create**:
- `apps/web/server/lib/cache.ts` - Cache abstraction
- `apps/web/server/services/cache-service.ts` - Cache management

**Files to Modify**:
- `apps/web/server/services/subtitle-generation-service.ts` - Check cache
- `apps/web/server/services/content-analysis-service.ts` - Check cache

**Complexity**: Medium (2-3 days)

**Implementation**:
```typescript
// server/lib/cache.ts
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export class TranscriptionCache {
  private cacheDir = path.join(process.cwd(), '.cache/transcriptions');

  async get(videoPath: string): Promise<TranscriptionResult | null> {
    const hash = await this.hashFile(videoPath);
    const cachePath = path.join(this.cacheDir, `${hash}.json`);

    try {
      const data = await fs.readFile(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(videoPath: string, result: TranscriptionResult): Promise<void> {
    const hash = await this.hashFile(videoPath);
    const cachePath = path.join(this.cacheDir, `${hash}.json`);
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(result));
  }

  private async hashFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
```

### 3.3 WebSocket for Job Progress
**Problem**: Current polling every 2 seconds is inefficient and creates unnecessary load.

**Impact**: LOW - Inefficient, but functional

**Solution**:
- Implement WebSocket server for real-time updates
- Push progress events instead of polling
- Fallback to polling if WebSocket unavailable

**Files to Create**:
- `apps/remotion-server/server/websocket.ts` - WebSocket server
- `apps/web/lib/websocket-client.ts` - Client connection manager

**Files to Modify**:
- `apps/remotion-server/server/index.ts` - Initialize WebSocket
- `apps/web/features/video/hooks/use-video-processing.ts` - Use WebSocket
- `apps/web/server/services/subtitle-generation-service.ts` - Use WebSocket

**Complexity**: High (3-4 days)

**Implementation**:
```typescript
// remotion-server/server/websocket.ts
import { WebSocketServer } from 'ws';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const jobId = new URL(req.url!, 'http://localhost').searchParams.get('jobId');

    // Subscribe to job updates
    jobEmitter.on(`job:${jobId}:progress`, (progress) => {
      ws.send(JSON.stringify({ type: 'progress', data: progress }));
    });

    jobEmitter.on(`job:${jobId}:complete`, (result) => {
      ws.send(JSON.stringify({ type: 'complete', data: result }));
      ws.close();
    });
  });
}

// Client side
const ws = new WebSocket(`ws://localhost:3001/ws?jobId=${jobId}`);
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'progress') updateProgress(data);
  if (type === 'complete') setCompleted(data);
};
```

### 3.4 Dynamic Crop Implementation
**Problem**: TODO comment in renderer.py indicates feature not implemented.

**Impact**: MEDIUM - Missing promised feature

**Location**: `apps/processing-engine/renderer.py:175`

**Solution**:
- Implement MediaPipe face tracking for dynamic crop
- Calculate crop window based on face position per frame
- Apply crop filter with smooth transitions

**Files to Modify**:
- `apps/processing-engine/renderer.py:175-190` - Implement cropping
- `apps/processing-engine/analyzer.py` - Face detection integration

**Complexity**: High (4-5 days)

**Implementation**:
```python
# renderer.py
def apply_dynamic_crop(video_path: str, crop_data: list, output_path: str):
    """
    Apply dynamic crop based on face tracking data.

    Args:
        video_path: Input video path
        crop_data: List of crop boxes per frame [(x, y, w, h), ...]
        output_path: Output video path
    """
    cap = cv2.VideoCapture(video_path)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Target aspect ratio (9:16 for vertical)
    target_width = height * 9 // 16

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (target_width, height))

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Get crop box for this frame (with smoothing)
        x, y, w, h = smooth_crop_box(crop_data, frame_idx, window=5)

        # Center crop with face priority
        crop_x = max(0, x - (target_width - w) // 2)
        crop_x = min(crop_x, width - target_width)

        cropped = frame[:, crop_x:crop_x + target_width]
        out.write(cropped)
        frame_idx += 1

    cap.release()
    out.release()
```

---

## Priority 4: Infrastructure & DevOps

### 4.1 Environment Configuration Consolidation
**Problem**: Service URLs hardcoded in multiple places, difficult to configure.

**Impact**: LOW - Maintenance burden, error-prone

**Solution**:
- Centralize all URLs in environment variables
- Create config validation on startup
- Document all required variables

**Files to Create**:
- `apps/web/.env.example` - Template with all variables
- `apps/processing-engine/.env.example` - Python service template
- `apps/remotion-server/.env.example` - Remotion template

**Files to Modify**:
- `apps/web/server/config/index.ts` - Centralized config
- All services - Use config instead of hardcoded URLs

**Complexity**: Low (1 day)

**Implementation**:
```typescript
// server/config/index.ts
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  PROCESSING_ENGINE_URL: z.string().url().default('http://localhost:8000'),
  PROCESSING_ENGINE_API_KEY: z.string().min(1),
  REMOTION_SERVER_URL: z.string().url().default('http://localhost:3001'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const config = envSchema.parse(process.env);

// Usage:
// const response = await fetch(`${config.PROCESSING_ENGINE_URL}/upload`, {
//   headers: { 'X-API-Key': config.PROCESSING_ENGINE_API_KEY },
// });
```

### 4.2 Health Check Endpoints
**Problem**: No way to verify service availability or debug connectivity issues.

**Impact**: LOW - Difficult troubleshooting

**Solution**:
- Add /health endpoint to each service
- Include dependency checks (database, external APIs)
- Create health dashboard page

**Files to Create**:
- `apps/web/app/api/health/route.ts` - Web health check
- `apps/processing-engine/health.py` - Python health check
- `apps/remotion-server/server/health.ts` - Remotion health check
- `apps/web/app/admin/health/page.tsx` - Health dashboard

**Complexity**: Low (1-2 days)

**Implementation**:
```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    processingEngine: await checkService(config.PROCESSING_ENGINE_URL),
    remotionServer: await checkService(config.REMOTION_SERVER_URL),
    openai: await checkOpenAI(),
    database: await checkDatabase(),
  };

  const healthy = Object.values(checks).every(c => c.status === 'ok');

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
```

### 4.3 Docker Compose Improvements
**Problem**: Current docker-compose.yml exists but may need updates for new features.

**Impact**: LOW - Development experience

**Solution**:
- Add Redis service for caching
- Add PostgreSQL service for job history
- Add volume mounts for development
- Document setup process

**Files to Modify**:
- `docker-compose.yml` - Add services
- `DOCKER_SETUP.md` - Update documentation

**Complexity**: Low (1 day)

**Implementation**:
```yaml
# docker-compose.yml additions
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: video_wizard
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

---

## Priority 5: Advanced Features (Future)

### 5.1 Batch Processing
**Problem**: Can't process multiple videos at once.

**Impact**: LOW - Nice to have for power users

**Solution**:
- Multi-file upload component
- Queue management system
- Batch progress tracking

**Complexity**: High (5-6 days)

### 5.2 Cloud Storage Integration (S3, Cloudflare R2)
**Problem**: All files stored locally, no scalable storage.

**Impact**: LOW - Fine for MVP, needed for production

**Solution**:
- Abstract storage layer
- Support local, S3, and R2
- Automatic cleanup of old files

**Complexity**: Medium (3-4 days)

### 5.3 User Authentication & Multi-tenancy
**Problem**: No user accounts, all data shared.

**Impact**: LOW - Not needed for single-user deployment

**Solution**:
- Add NextAuth.js or Clerk
- User-scoped job history
- Usage quotas per user

**Complexity**: High (6-7 days)

### 5.4 Analytics Dashboard
**Problem**: No insights into usage patterns, popular templates, etc.

**Impact**: LOW - Nice to have for optimization

**Solution**:
- Track usage metrics
- Popular templates analysis
- Performance metrics (render times, success rates)

**Complexity**: Medium (3-4 days)

### 5.5 AI-Powered Subtitle Editing
**Problem**: Manual subtitle editing is tedious.

**Impact**: LOW - Current editing works fine

**Solution**:
- GPT-4 powered grammar correction
- Automatic punctuation enhancement
- Style consistency enforcement

**Complexity**: Medium (2-3 days)

---

## Implementation Sequence Recommendation

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Security, stability, professional UX

1. Processing Engine Security (1.1)
2. Replace alert() with toasts (1.2)
3. Centralized error handling (1.3)
4. Environment config consolidation (4.1)

**Deliverable**: Secure, stable foundation with professional error handling

### Phase 2: Core Features (Weeks 3-4)
**Goal**: Essential missing features

1. Job History Dashboard (2.1)
2. Dynamic homepage stats (2.2)
3. Template preview gallery (2.3)
4. Health check endpoints (4.2)

**Deliverable**: Complete core user experience with job tracking

### Phase 3: Workflow Improvements (Weeks 5-6)
**Goal**: Streamline user workflows

1. Clip → Subtitle Generator integration (2.4)
2. Subtitle export formats (2.5)
3. Parallel clip rendering (3.1)
4. Transcription caching (3.2)

**Deliverable**: Efficient, interconnected feature ecosystem

### Phase 4: Performance (Weeks 7-8)
**Goal**: Scale and optimize

1. WebSocket for job progress (3.3)
2. Dynamic crop implementation (3.4)
3. Docker compose improvements (4.3)

**Deliverable**: Production-ready performance characteristics

### Phase 5: Advanced (Weeks 9+)
**Goal**: Power user features

1. Batch processing (5.1)
2. Cloud storage integration (5.2)
3. User authentication (5.3) - if needed
4. Analytics dashboard (5.4)
5. AI subtitle editing (5.5)

**Deliverable**: Enterprise-grade feature set

---

## Success Metrics

### Phase 1 Metrics
- ✅ Zero security vulnerabilities on external scan
- ✅ All errors logged with context
- ✅ 100% of alert() calls replaced
- ✅ All services pass health checks

### Phase 2 Metrics
- ✅ Users can access all past jobs
- ✅ Homepage shows accurate stats
- ✅ 90% of users preview templates before selecting
- ✅ <1% error rate on API endpoints

### Phase 3 Metrics
- ✅ 50% reduction in workflow time (Clip → Subtitle)
- ✅ 70% reduction in re-processing (cache hits)
- ✅ 3x faster multi-clip rendering (parallel)
- ✅ Subtitle export used in 30% of sessions

### Phase 4 Metrics
- ✅ Real-time progress updates (<100ms latency)
- ✅ Dynamic crop used in 40% of renders
- ✅ 100% uptime for all services

---

## Risk Assessment

### High Risk Items
- **WebSocket implementation (3.3)**: Complex, requires careful testing of reconnection logic
- **Dynamic crop (3.4)**: Performance-intensive, may require GPU acceleration
- **User authentication (5.3)**: Security-critical, thorough testing required

### Medium Risk Items
- **Job history (2.1)**: Database migration complexity
- **Parallel rendering (3.1)**: Resource management challenges
- **Batch processing (5.1)**: Queue management complexity

### Low Risk Items
- **Toast notifications (1.2)**: Straightforward UI change
- **Template previews (2.3)**: Mostly frontend work
- **Subtitle export (2.5)**: Simple format conversion

---

## Technical Debt to Address

1. **Hardcoded URLs**: Scattered across codebase, consolidate to config
2. **Inconsistent error responses**: Standardize API response format
3. **No request validation**: Add Zod schemas to all API endpoints
4. **Missing TypeScript types**: Some `any` types remain in older code
5. **No integration tests**: Only manual testing currently
6. **Bundle size optimization**: Next.js bundle could be smaller

---

## Appendix: File Reference

### Critical Files by Priority

**Priority 1**:
- `apps/processing-engine/main.py`
- `apps/web/features/video/containers/*-container.tsx`
- `apps/web/server/lib/errors.ts` (create)

**Priority 2**:
- `apps/web/server/db/schema.ts` (create)
- `apps/web/app/jobs/page.tsx` (create)
- `apps/web/app/page.tsx`
- `apps/web/features/video/components/template-selector.tsx`

**Priority 3**:
- `apps/web/features/video/hooks/use-video-processing.ts`
- `apps/web/server/lib/cache.ts` (create)
- `apps/processing-engine/renderer.py`

**Priority 4**:
- `apps/web/server/config/index.ts`
- `docker-compose.yml`
- All `app/api/*/route.ts` files

---

**Next Steps**: Review this plan, prioritize based on business needs, and begin with Phase 1 implementation.
