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

On the prepared Mac installation, run the following command from the monorepo root. The controller loads the shared `STUDIO_RENDER_SECRET` from the private renderer configuration, loads Python settings from `apps/processing-engine/.env.local`, and binds Uvicorn to `127.0.0.1:8000`. Set `USE_OPENAI_API=false` in the Python environment and install the Whisper base model for local transcription. [Local installation and prerequisites](../../docs/authentication.md#instalación-mac-existente)

```sh
node scripts/local-studio.mjs python
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

For the complete studio, follow the root Compose procedure. It passes the shared secret from the private `.env.docker` configuration to the services. Next and the worker reach Python at `http://processing-engine:8000`. [Docker installation](../../docs/DOCKER_SETUP.md)

To run only the processor with its own Compose file, work in `apps/processing-engine`. Create or update a private regular `.env` file with mode 0600. Set `STUDIO_RENDER_SECRET` to the existing service secret used by Next and the worker and set `USE_OPENAI_API=false` for local Whisper. The service Compose file loads this environment, mounts private `uploads` and `output` directories and publishes port 8000 on host loopback.

```sh
docker compose up -d --wait --build processing-engine
docker compose ps processing-engine
curl --fail --silent --show-error http://127.0.0.1:8000/health
```

The health response is `{"status":"healthy"}`. An authenticated operation from Next or the worker verifies the shared-secret configuration. Stop the standalone service with `docker compose stop processing-engine`.

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

Check which process owns the host port with `lsof -i :8000`. Use the processor already running for the installation or stop it before starting another. If you choose another host port, keep the binding on loopback (for example, `127.0.0.1:8001:8000`) and update `PYTHON_ENGINE_INTERNAL_URL` for host-side callers.

For standalone Compose, inspect `docker compose ps processing-engine` and the local service logs. A healthy processor returning 401 for a signed operation warrants checking that the shared service secret matches the web/worker configuration. For disk or permission errors, check free space and confirm the service user can write the private mounts.

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
docker compose build
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

Use the root Compose configuration for a complete studio installation. When adapting it to another environment, keep the processor on a private service network reachable by Next and the worker, inject their shared `STUDIO_RENDER_SECRET` through the deployment’s secret store, and give the service persistent private storage for its results. Configure its callers with the internal service URL. [Docker installation](../../docs/DOCKER_SETUP.md)

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

1. Check the minimal health response with `curl --fail --silent --show-error http://127.0.0.1:8000/health`. For the supported operations and credentials, consult the [service policy](../../docs/authentication.md#procesador-python).
2. Review logs for error messages
3. Verify FFmpeg installation
4. Ensure video file is accessible

---

Built with ❤️ using FastAPI, OpenCV, and MediaPipe
