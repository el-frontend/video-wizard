# Remotion Render Server

Express.js server for rendering Remotion video compositions with a job queue system.

## Features

- 📹 Render videos with customizable templates
- 📝 Dynamic subtitle generation
- 🎨 Multiple caption templates (default, viral, minimal, modern)
- 🔄 Job queue with progress tracking
- ❌ Cancel running render jobs
- 🐳 Docker support

## API Endpoints

### Create Render Job
```bash
POST /renders
Content-Type: application/json

{
  "compositionId": "VideoWithSubtitles",
  "inputProps": {
    "videoUrl": "https://example.com/video.mp4",
    "subtitles": [
      {
        "id": 1,
        "start": 0,
        "end": 2,
        "text": "Hello World"
      }
    ],
    "template": "viral",
    "backgroundColor": "#000000"
  }
}
```

### Get Render Status
```bash
GET /renders/:jobId
```

### Cancel Render Job
```bash
DELETE /renders/:jobId
```

## Getting Started

### Development

```bash
# Install dependencies
pnpm install

# Start the server in watch mode
pnpm dev
```

### Production

```bash
# Build the server
pnpm build

# Start the server
pnpm start
```

### Run Remotion Studio

```bash
pnpm remotion:studio
```

## Docker Support

```bash
# Build the Docker image
docker build -t remotion-render-server .

# Run the container
docker run -d -p 3001:3001 remotion-render-server
```

## Environment Variables

See `.env.example` for available configuration options.

## Project Structure

```
apps/remotion-server/
├── server/
│   ├── index.ts          # Express server setup
│   └── render-queue.ts   # Job queue management
├── renders/              # Output directory for rendered videos
├── package.json
├── tsconfig.json
└── README.md
```

## Compositions

Remotion compositions are stored in `packages/remotion-compositions` and include:

- VideoWithSubtitles: Main composition with video + subtitle templates
- Multiple caption templates: default, viral, minimal, modern

## License

See LICENSE in the root of the monorepo.
