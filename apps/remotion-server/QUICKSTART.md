# Remotion Render Server - Quick Start Guide

## Overview

The Remotion Render Server is a standalone Express.js server that handles video rendering jobs with a queue system. Compositions are stored in `packages/remotion-compositions` for reusability across the monorepo.

## Architecture

```
video-wizard/
├── apps/
│   └── remotion-server/          # Render server application
│       ├── server/
│       │   ├── index.ts          # Express server setup
│       │   └── render-queue.ts   # Job queue management
│       ├── renders/              # Output directory
│       ├── package.json
│       └── README.md
└── packages/
    └── remotion-compositions/    # Shared compositions
        └── src/
            ├── index.ts          # Entry point
            ├── Root.tsx          # Composition registry
            ├── types.ts          # TypeScript types
            ├── compositions/     # Main components
            ├── templates/        # Caption templates
            └── hooks/            # React hooks
```

## Installation

### 1. Install Dependencies

From the root of the monorepo:

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env` file in `apps/remotion-server/`:

```bash
cp apps/remotion-server/.env.example apps/remotion-server/.env
```

Edit the `.env` file as needed:
- `PORT`: Server port (default: 3001)
- `RENDERS_DIR`: Output directory for rendered videos (default: ./renders)

## Running the Server

### Development Mode

```bash
cd apps/remotion-server
pnpm dev
```

The server will start with hot reload on port 3001.

### Production Mode

```bash
cd apps/remotion-server
pnpm build
pnpm start
```

## Using the API

### 1. Create a Render Job

```bash
curl -X POST http://localhost:3001/renders \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "VideoWithSubtitles",
    "inputProps": {
      "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      "subtitles": [
        {
          "id": 1,
          "start": 0,
          "end": 2,
          "text": "Hello World"
        },
        {
          "id": 2,
          "start": 2,
          "end": 4,
          "text": "This is a test"
        }
      ],
      "template": "viral",
      "backgroundColor": "#000000"
    }
  }'
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Check Job Status

```bash
curl http://localhost:3001/renders/550e8400-e29b-41d4-a716-446655440000
```

Response (in progress):
```json
{
  "status": "in-progress",
  "progress": 0.5,
  "data": { ... }
}
```

Response (completed):
```json
{
  "status": "completed",
  "videoUrl": "http://localhost:3001/renders/550e8400-e29b-41d4-a716-446655440000.mp4",
  "data": { ... }
}
```

### 3. Cancel a Job

```bash
curl -X DELETE http://localhost:3001/renders/550e8400-e29b-41d4-a716-446655440000
```

### 4. Health Check

```bash
curl http://localhost:3001/health
```

## Available Templates

- **default**: Professional design with text at the bottom
- **viral**: High-impact design for social media (TikTok, Instagram Reels)
- **minimal**: Ultra-clean design for professional content
- **modern**: Contemporary design with gradient accents

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

## Working with Remotion Studio

To preview and test compositions:

```bash
cd packages/remotion-compositions
pnpm studio
```

This opens the Remotion Studio where you can preview compositions and adjust props.

## Adding New Compositions

1. Create a new composition component in `packages/remotion-compositions/src/compositions/`
2. Add it to `Root.tsx` with a `<Composition>` element
3. Define the Zod schema for type safety
4. The server will automatically pick it up after restart

## Troubleshooting

### Browser Not Found

If you get a browser error, install it manually:

```bash
cd apps/remotion-server
pnpm exec remotion browser ensure
```

### Port Already in Use

Change the port in `.env`:

```
PORT=3002
```

### Render Fails

Check the logs for detailed error messages. Common issues:
- Invalid video URL
- Missing or malformed subtitle data
- Insufficient memory (increase Docker memory limit)

## Integration with Web App

The web app at `apps/web` can use this server to render videos:

```typescript
// In your web app
const response = await fetch('http://localhost:3001/renders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    compositionId: 'VideoWithSubtitles',
    inputProps: { /* ... */ }
  })
});

const { jobId } = await response.json();

// Poll for status
const checkStatus = async () => {
  const status = await fetch(`http://localhost:3001/renders/${jobId}`);
  return status.json();
};
```

## Performance Tips

1. **Pre-bundle compositions** for faster startup:
   ```bash
   cd packages/remotion-compositions
   pnpm exec remotion bundle
   ```
   Then set `REMOTION_SERVE_URL=build` in `.env`

2. **Use OffthreadVideo** instead of Html5Video for better performance (already implemented)

3. **Adjust concurrency** by setting `--concurrency` flag when needed

## Next Steps

- Add authentication to protect the API
- Implement webhook callbacks for job completion
- Add S3 upload integration for rendered videos
- Set up monitoring and logging

## Resources

- [Remotion Documentation](https://www.remotion.dev/docs)
- [Remotion Renderer API](https://www.remotion.dev/docs/renderer)
- [Express.js Documentation](https://expressjs.com/)
