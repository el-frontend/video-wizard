# Smart Crop & Video Processing Service

A Python-based microservice for intelligently cropping 16:9 videos into 9:16 vertical shorts using AI-powered face tracking.

## 🎯 Overview

This service analyzes long-form videos, detects faces using Google MediaPipe, and generates optimal crop coordinates to create vertical shorts that keep the speaker centered. The crop window smoothly follows the active speaker, preventing jarring camera movements.

## 🛠 Technical Stack

- **FastAPI**: High-performance async web framework
- **OpenCV**: Video processing and frame manipulation
- **MediaPipe**: Real-time face detection (BlazeFace)
- **NumPy**: Mathematical operations and smoothing algorithms
- **FFmpeg**: Video rendering and encoding
- **Uvicorn**: ASGI server

## 📋 Prerequisites

- Python 3.11 or higher
- FFmpeg (for video rendering)

### Installing FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## 🚀 Installation

### 1. Create Virtual Environment

```bash
cd apps/processing-engine
python3 -m venv .venv
source .venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure the private service

Use the same dedicated `STUDIO_RENDER_SECRET` as Next and the worker. For local Whisper set `USE_OPENAI_API=false` and install the base model. Start the host process on loopback or use the [root Compose configuration](../../docs/DOCKER_SETUP.md).

```sh
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### HTTP interface

`GET /health` is public. Next or a background worker signs a fresh processing JWT before each operation. The private endpoints accept multipart sources for transcription and crop and a validated YouTube source for import. Results are read through owner- and job-scoped receipts. Uploads and downloads in the browser go through the web asset API. See the [route and service policy](../../docs/authentication.md).

## 🎨 How It Works

### 1. Video Analysis Pipeline

1. **Frame Sampling**: Process every 5th frame for performance
2. **Face Detection**: MediaPipe detects faces in each frame
3. **Center Calculation**: Calculate face center X-coordinate
4. **Smoothing**: Apply moving average filter to prevent jitter
5. **Interpolation**: Generate crop data for all frames
6. **Constraint**: Ensure crop window stays within frame bounds

### 2. Smoothing Algorithm

The service uses a **Moving Average Filter** to smooth camera movement:

- **Window Size**: 15 frames (configurable)
- **Purpose**: Prevents jittery movement when speaker moves slightly
- **Result**: Smooth, natural-looking camera drift

Alternative: **Kalman Filter** implementation included for more sophisticated tracking.

### 3. Crop Calculation

For 16:9 → 9:16 conversion:

- Input: 1920x1080 (16:9)
- Output: 607x1080 (9:16)
- Crop window follows face center
- Constrained to frame boundaries

## 🔧 Configuration

### Analyzer Settings

Edit `analyzer.py`:

```python
# Frame sampling rate (process every Nth frame)
analyzer = VideoAnalyzer(sample_rate=5)  # Higher = faster but less accurate

# Smoothing window
window_size = 15  # Higher = smoother but more lag
```

### MediaPipe Detection

```python
self.face_detection = self.mp_face_detection.FaceDetection(
    model_selection=1,  # 0: short-range, 1: full-range
    min_detection_confidence=0.5  # Detection threshold
)
```

## 📁 Project Structure

```
apps/processing-engine/
├── main.py              # FastAPI application & endpoints
├── analyzer.py          # Video analysis & face tracking
├── renderer.py          # Video rendering with FFmpeg
├── config.py            # Configuration settings
├── requirements.txt     # Python dependencies
├── package.json         # npm scripts for Turborepo
├── Dockerfile           # Docker container configuration
├── docker-compose.yml   # Docker orchestration
├── setup.sh             # Automated setup script
├── example_usage.py     # Usage examples
├── test_service.py      # Unit & integration tests
├── .gitignore          # Git ignore rules
├── README.md           # This file
├── QUICKSTART.md       # Quick start guide
├── ARCHITECTURE.md     # System architecture
├── uploads/            # Uploaded videos (auto-created)
└── output/             # Rendered videos (auto-created)
```

## 🐳 Docker Configuration

### Dockerfile Details

The service includes a production-ready Dockerfile with:

- **Base Image**: Python 3.11-slim (optimized for size)
- **FFmpeg**: Pre-installed for video processing
- **Dependencies**: All Python packages included
- **Health Check**: Automatic service monitoring
- **Volumes**: Persistent storage for uploads/outputs
- **Port**: Exposes 8000 for API access

### docker-compose.yml

```yaml
version: '3.8'

services:
  processing-engine:
    build: .
    container_name: video-processing-service
    ports:
      - '8000:8000'
    volumes:
      - ./uploads:/app/uploads
      - ./output:/app/output
    environment:
      - LOG_LEVEL=INFO
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8000/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

### Docker Commands Reference

```bash
# Build
docker-compose build

# Start in background
docker-compose up -d

# Start with logs
docker-compose up

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Execute command in container
docker-compose exec processing-engine python -c "print('Hello')"

# Remove all (including volumes)
docker-compose down -v
```

## 🐛 Troubleshooting

### FFmpeg Not Found (Local Installation)

```bash
# Verify FFmpeg installation
ffmpeg -version

# If not installed, install it first
brew install ffmpeg  # macOS
```

**Note:** When using Docker, FFmpeg is pre-installed in the container.

### Docker Issues

**Port Already in Use:**

```bash
# Check what's using port 8000
lsof -i :8000

# Use a different port
docker run -p 8001:8000 video-processing-service
```

**Container Won't Start:**

```bash
# Check logs
docker-compose logs

# Rebuild without cache
docker-compose build --no-cache

# Remove old containers
docker-compose down -v
docker-compose up --build
```

**Permission Issues with Volumes:**

```bash
# Ensure directories exist and have correct permissions
mkdir -p uploads output
chmod 755 uploads output
```

**Out of Disk Space:**

```bash
# Clean up Docker resources
docker system prune -a

# Remove unused volumes
docker volume prune
```

### MediaPipe Installation Issues (Local)

```bash
# Use specific version
pip install mediapipe==0.10.9

# Or try with --no-cache-dir
pip install --no-cache-dir mediapipe
```

### OpenCV Display Issues (macOS, Local)

```bash
# If GUI issues, install headless version
pip uninstall opencv-python
pip install opencv-python-headless
```

### Memory Issues with Large Videos

- Increase `sample_rate` in VideoAnalyzer (process fewer frames)
- Process shorter video segments
- Close other applications
- **Docker**: Increase container memory limits:
  ```yaml
  # In docker-compose.yml
  services:
    processing-engine:
      deploy:
        resources:
          limits:
            memory: 4G
  ```

## 🚀 Performance Optimization

### Speed vs Quality Tradeoffs

**Faster Processing:**

- Increase `sample_rate` (e.g., 10 = process every 10th frame)
- Use lower resolution input
- Reduce smoothing window size

**Better Quality:**

- Lower `sample_rate` (e.g., 3 = process every 3rd frame)
- Increase smoothing window for smoother motion
- Use AdvancedRenderer for frame-by-frame precision

### Docker Performance Tips

**Enable BuildKit for faster builds:**

```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

**Multi-stage builds (already implemented):**

- Optimized image size (~800MB vs 2GB+)
- Faster deployment and startup

**Resource Limits:**

```yaml
# In docker-compose.yml
services:
  processing-engine:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

**Use Docker volumes for better I/O:**

```bash
# Already configured in docker-compose.yml
volumes:
  - ./uploads:/app/uploads
  - ./output:/app/output
```

## 🚢 Deployment

### Production Deployment with Docker

**1. Build optimized image:**

```bash
docker build -t video-processor:v1.0 .
```

**2. Push to registry:**

```bash
# Docker Hub
docker tag video-processor:v1.0 yourusername/video-processor:v1.0
docker push yourusername/video-processor:v1.0

# AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ECR_URL
docker tag video-processor:v1.0 YOUR_ECR_URL/video-processor:v1.0
docker push YOUR_ECR_URL/video-processor:v1.0
```

**3. Deploy to cloud:**

**Docker Swarm:**

```bash
docker stack deploy -c docker-compose.yml video-processing
```

**Kubernetes:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: video-processor
  template:
    metadata:
      labels:
        app: video-processor
    spec:
      containers:
        - name: processor
          image: yourusername/video-processor:v1.0
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: storage
              mountPath: /app/uploads
            - name: output
              mountPath: /app/output
```

**Cloud Platforms:**

- **AWS ECS/Fargate**: Use the Docker image directly
- **Google Cloud Run**: Fully managed container platform
- **Azure Container Instances**: Quick deployment option
- **DigitalOcean App Platform**: Simple PaaS deployment

### Environment-Specific Configurations

**Development:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Production:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 🔮 Future Enhancements

- [ ] Multi-person tracking with priority selection
- [ ] Dynamic crop with FFmpeg zoompan expressions
- [ ] Scene change detection
- [ ] GPU acceleration support
- [ ] Real-time preview endpoint
- [ ] Batch processing queue
- [ ] Custom aspect ratio support
- [ ] Audio level detection for speaker identification

## 📝 License

MIT License - Part of Video Wizard Project

## 🤝 Contributing

This service is part of a larger Turborepo monorepo. Follow the main project's contribution guidelines.

## 📞 Support

For issues and questions:

1. Check the interactive API docs: http://localhost:8000/docs
2. Review logs for error messages
3. Verify FFmpeg installation
4. Ensure video file is accessible

---

Built with ❤️ using FastAPI, OpenCV, and MediaPipe
