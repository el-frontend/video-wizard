# Remotion Infrastructure Overview

## Architecture

The Video Wizard project now has a dedicated Remotion render server infrastructure:

```
video-wizard/
├── apps/
│   ├── remotion-server/          # 🎬 Render Server (NEW)
│   │   ├── server/               # Express.js server
│   │   ├── renders/              # Output videos
│   │   ├── Dockerfile            # Production deployment
│   │   ├── docker-compose.yml    # Production config
│   │   └── QUICKSTART.md         # Getting started guide
│   ├── web/                      # Next.js web app
│   └── processing-engine/        # Python video processing
└── packages/
    ├── remotion-compositions/    # 📦 Shared Compositions (NEW)
    │   └── src/
    │       ├── compositions/     # Video compositions
    │       ├── templates/        # Caption templates
    │       └── hooks/            # React hooks
    └── ui/                       # Shared UI components
```

## What's Been Created

### 1. Remotion Render Server (`apps/remotion-server`)

An Express.js server that handles video rendering jobs with a queue system.

**Features:**
- ✅ REST API for creating, monitoring, and canceling render jobs
- ✅ Job queue with progress tracking
- ✅ Automatic browser management
- ✅ Docker support for production deployment
- ✅ Health check endpoint
- ✅ Static file serving for rendered videos

**Key Files:**
- `server/index.ts` - Express server setup and API endpoints
- `server/render-queue.ts` - Job queue management with Remotion renderer
- `package.json` - Dependencies and scripts
- `QUICKSTART.md` - Complete usage guide
- `example-usage.js` - Working example script

### 2. Remotion Compositions Package (`packages/remotion-compositions`)

Shared Remotion compositions that can be used across the monorepo.

**Features:**
- ✅ VideoWithSubtitles composition with multiple templates
- ✅ 4 professional caption templates (default, viral, minimal, modern)
- ✅ Word-level subtitle synchronization
- ✅ Type-safe props with Zod schemas
- ✅ Reusable across multiple apps

**Components:**
- `VideoComposition.tsx` - Main composition combining video + subtitles
- `CaptionOverlay.tsx` - Subtitle rendering with template selection
- `templates/` - 4 different caption styles
- `hooks/useActiveSubtitle.ts` - Subtitle timing logic

## API Endpoints

### Create Render Job
```
POST /renders
```

**Request Body:**
```json
{
  "compositionId": "VideoWithSubtitles",
  "inputProps": {
    "videoUrl": "https://example.com/video.mp4",
    "subtitles": [...],
    "template": "viral",
    "backgroundColor": "#000000"
  }
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Get Job Status
```
GET /renders/:jobId
```

**Response:**
```json
{
  "status": "in-progress",
  "progress": 0.75,
  "data": { ... }
}
```

### Cancel Job
```
DELETE /renders/:jobId
```

### Health Check
```
GET /health
```

## Available Templates

### 1. Default Template
Professional design with text at the bottom. Clean and versatile.

### 2. Viral Template
High-impact design for social media:
- Large text chunks
- Yellow highlight backgrounds
- Animated word-by-word display
- Optimized for TikTok/Instagram Reels

### 3. Minimal Template
Ultra-clean design with minimal styling. Perfect for professional content.

### 4. Modern Template
Contemporary design with:
- Gradient backgrounds
- Smooth slide-up animations
- Modern typography
- Border accents

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start the Render Server

```bash
cd apps/remotion-server
pnpm dev
```

Server will start on http://localhost:3001

### 3. Test with Example Script

```bash
cd apps/remotion-server
node example-usage.js
```

### 4. Preview Compositions in Remotion Studio

```bash
cd packages/remotion-compositions
pnpm studio
```

## Docker Deployment

### Development
```bash
cd apps/remotion-server
docker-compose -f docker-compose.dev.yml up
```

### Production
```bash
cd apps/remotion-server
docker-compose up -d
```

## Integration with Web App

The Next.js web app can use the render server:

```typescript
// In your API route or server action
async function renderVideo(videoUrl: string, subtitles: SubtitleSegment[]) {
  const response = await fetch('http://localhost:3001/renders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compositionId: 'VideoWithSubtitles',
      inputProps: { videoUrl, subtitles, template: 'viral' }
    })
  });
  
  const { jobId } = await response.json();
  return jobId;
}
```

## Configuration

### Environment Variables

**Render Server (apps/remotion-server/.env):**
```
PORT=3001
RENDERS_DIR=./renders
REMOTION_SERVE_URL=  # Optional: pre-bundled compositions URL
```

### TypeScript Configuration

Both packages use strict TypeScript with:
- ESM modules
- React JSX transform
- Strict type checking
- Zod schema validation

## Technical Details

### Job Queue System

The render queue processes jobs sequentially to prevent resource exhaustion:

1. Job is created and added to queue
2. Job status: `queued`
3. Processing starts, status: `in-progress`
4. Progress updates sent via polling
5. On completion, status: `completed` with video URL
6. On error, status: `failed` with error details

### Render Pipeline

1. **Composition Selection** - Select composition with input props
2. **Browser Initialization** - Ensure Chromium is available
3. **Frame Rendering** - Render each frame of the video
4. **Encoding** - Encode frames to MP4 with H264 codec
5. **Output** - Save to renders directory
6. **Serving** - Video accessible via HTTP

### Resource Management

- Sequential processing prevents parallel render resource conflicts
- Automatic browser cleanup
- Configurable output directory
- Graceful cancellation support

## Next Steps

### Immediate Enhancements
- [ ] Add authentication to API endpoints
- [ ] Implement webhook callbacks for job completion
- [ ] Add S3/cloud storage integration
- [ ] Set up monitoring and logging
- [ ] Add rate limiting

### Future Features
- [ ] Multiple composition support
- [ ] Custom font loading
- [ ] Advanced subtitle animations
- [ ] Background music integration
- [ ] Batch rendering support

## Troubleshooting

### Server Won't Start
- Check if port 3001 is available
- Ensure dependencies are installed: `pnpm install`
- Verify Node.js version: 18+ required

### Browser Not Found
```bash
cd apps/remotion-server
pnpm exec remotion browser ensure
```

### Render Fails
- Check video URL is accessible
- Verify subtitle data format
- Check server logs for details
- Ensure sufficient memory (4GB+ recommended)

## Resources

- [Remotion Documentation](https://www.remotion.dev/docs)
- [Remotion Renderer API](https://www.remotion.dev/docs/renderer)
- [Template Repository](https://github.com/remotion-dev/template-render-server)
- [Express.js](https://expressjs.com/)

## Support

For issues or questions:
1. Check the QUICKSTART.md in apps/remotion-server
2. Review example-usage.js for working implementation
3. Consult Remotion documentation
4. Check server logs for error details

---

**Created:** January 13, 2026  
**Status:** ✅ Production Ready
