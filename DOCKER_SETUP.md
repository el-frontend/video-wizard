# Docker Setup Guide

This guide explains how to run the Video Wizard services using Docker.

## Architecture

The Video Wizard application consists of three main services:

1. **Web App** (`apps/web`) - Next.js frontend (runs on host)
2. **Processing Engine** (`apps/processing-engine`) - Python service for video processing (Docker)
3. **Remotion Server** (`apps/remotion-server`) - Node.js service for rendering videos with subtitles (Docker)

## Network Configuration

The Docker services run on a shared network called `video-wizard-network` to enable container-to-container communication.

### Important URLs

**For local development (all services on host):**
- Processing Engine: `http://localhost:8000`
- Remotion Server: `http://localhost:3001`
- Web App: `http://localhost:3000`

**For Docker container-to-container communication:**
- Processing Engine: `http://processing-engine:8000` (used by Remotion server)
- Remotion Server: `http://remotion-server:3001`

## Running with Docker

### Option 1: Run All Services with Docker Compose

From the project root:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Option 2: Run Individual Services

**Processing Engine only:**
```bash
cd apps/processing-engine
docker-compose -f docker-compose.dev.yml up -d
```

**Remotion Server only:**
```bash
cd apps/remotion-server
docker-compose -f docker-compose.dev.yml up -d
```

**Web App (on host):**
```bash
cd apps/web
pnpm dev
```

## Environment Variables

### Web App (.env.local)

```env
# Client-side access to processing engine
NEXT_PUBLIC_PYTHON_ENGINE_URL=http://localhost:8000

# Server-side access to Remotion
REMOTION_SERVER_URL=http://localhost:3001

# Container-to-container communication
# Use 'processing-engine' when Remotion runs in Docker
# Use 'localhost' when Remotion runs on host
PYTHON_ENGINE_INTERNAL_URL=http://processing-engine:8000
```

### When to Use Each URL

1. **NEXT_PUBLIC_PYTHON_ENGINE_URL**: 
   - Used by browser (client-side)
   - Always `http://localhost:8000`

2. **PYTHON_ENGINE_INTERNAL_URL**:
   - Used by Remotion server to access videos
   - `http://processing-engine:8000` when in Docker
   - `http://localhost:8000` when running locally

## Shared Volumes

The Remotion server needs access to video files from the processing engine:

```yaml
volumes:
  # Share output directory with processing engine
  - ./apps/processing-engine/output:/app/processing-engine/output
```

## Troubleshooting

### Connection Refused Error

**Error**: `ECONNREFUSED 127.0.0.1:8000`

**Cause**: Remotion server trying to access `localhost:8000` from inside container

**Solution**: 
- Ensure `PYTHON_ENGINE_INTERNAL_URL=http://processing-engine:8000` is set
- Both containers must be on the same Docker network
- Use the root `docker-compose.yml` to start services together

### Video File Not Found

**Error**: Remotion can't find video file

**Solution**:
- Ensure shared volume is mounted: `./apps/processing-engine/output`
- Check video path matches between services

### Port Already in Use

**Error**: Port 8000 or 3001 already in use

**Solution**:
```bash
# Find and kill process using port
lsof -ti:8000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

## Development Workflow

1. **Start backend services in Docker:**
   ```bash
   docker-compose up -d
   ```

2. **Start web app on host (for hot reload):**
   ```bash
   cd apps/web
   pnpm dev
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f processing-engine
   docker-compose logs -f remotion-server
   ```

4. **Restart a service:**
   ```bash
   docker-compose restart processing-engine
   docker-compose restart remotion-server
   ```

## Production Deployment

For production, update the URLs to use actual hostnames or load balancers:

```env
NEXT_PUBLIC_PYTHON_ENGINE_URL=https://api.yourdomain.com
REMOTION_SERVER_URL=https://render.yourdomain.com
PYTHON_ENGINE_INTERNAL_URL=http://processing-engine:8000  # Keep internal
```
