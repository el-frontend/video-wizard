"""Private media processing API for the Video Wizard backend."""

from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal, Optional
import re
import shutil
import uuid

import jwt
from fastapi import FastAPI, HTTPException, File, Form, Request, UploadFile
from fastapi.responses import Response
from private_media import private_media
from pydantic import BaseModel

from audio_service import get_audio_service
from config import WHISPER_MODEL, USE_OPENAI_API, OPENAI_API_KEY, ASPECT_RATIO_PRESETS
from service_auth import authorize
from smart_clipper import SmartClipper

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
get_clipper = lru_cache(maxsize=1)(SmartClipper)


@lru_cache(maxsize=1)
def audio():
    return get_audio_service(
        whisper_model=WHISPER_MODEL,
        use_openai_api=USE_OPENAI_API,
        openai_api_key=OPENAI_API_KEY,
    )


# Verify before multipart parsing, disk writes, model initialization or external downloads.
operations = {
    "/studio/transcribe-source": ("source.transcribe", True),
    "/studio/crop-source": ("source.crop", True),
    "/download-youtube": ("source.download", False),
}
crop_name = re.compile(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.mp4")
download_name = re.compile(r"yt_[a-zA-Z0-9_-]{11}_[0-9a-f]{8}\.mp4")


@app.middleware("http")
async def private_operations(request: Request, call_next):
    path = request.url.path
    if path == "/health" and request.method == "GET":
        return await call_next(request)
    operation = operations.get(path) if request.method == "POST" else None
    if request.method in ("GET", "HEAD"):
        prefix, _, name = path.rpartition("/")
        if prefix == "/output" and crop_name.fullmatch(name):
            operation = ("crop.read", True)
        if prefix == "/uploads" and download_name.fullmatch(name):
            operation = ("download.read", False)
    if not operation:
        return Response(status_code=404)
    try:
        if "x-studio-owner" in request.headers or "x-studio-project" in request.headers:
            raise ValueError("Unexpected identity header")
        request.state.operation = authorize(
            request.headers.get("authorization", ""), operation[0], source=operation[1]
        )
    except (jwt.InvalidTokenError, ValueError):
        return Response(status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "healthy"}


def result_directory(root, operation):
    directory = root / ".studio" / operation.owner_id / operation.job_id
    return directory / operation.asset_id if operation.asset_id else directory


@app.api_route("/uploads/{filename}", methods=["GET", "HEAD"])
@app.api_route("/output/{filename}", methods=["GET", "HEAD"])
def read_result(request: Request, filename: str):
    root = OUTPUT_DIR if request.url.path.startswith("/output/") else UPLOAD_DIR
    path = result_directory(root, request.state.operation) / filename
    return private_media(request, path)


class RenderClipResponse(BaseModel):
    success: bool
    output_path: Optional[str] = None
    output_url: Optional[str] = None  # HTTP URL to access the file
    crop_mode: Optional[str] = None
    duration: Optional[float] = None
    sourceDurationMs: Optional[int] = None
    crop_dimensions: Optional[dict] = None
    file_size: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None


class YouTubeDownloadRequest(BaseModel):
    url: str


@contextmanager
def temporary_studio_source(file: UploadFile):
    """Own the input and intermediate files for exactly one processing operation."""
    with TemporaryDirectory(prefix="studio-source-") as directory:
        path = Path(directory) / "source"
        with path.open("xb") as destination:
            shutil.copyfileobj(file.file, destination)
        yield path


@app.post("/studio/transcribe-source")
async def transcribe_studio_source(
    file: UploadFile = File(...), language: Optional[str] = Form(None)
):
    with temporary_studio_source(file) as source:
        result = audio().transcribe_video(
            str(source), language=language, work_dir=source.parent
        )
        return {**result, "video_path": "source", "audio_path": None}


@app.post(
    "/studio/crop-source",
    response_model=RenderClipResponse,
    response_model_exclude_none=True,
)
async def crop_studio_source(
    request: Request,
    file: UploadFile = File(...),
    start_ms: int = Form(..., ge=0),
    end_ms: int = Form(..., gt=0),
    crop_mode: Literal["dynamic", "static"] = Form(...),
    aspect_ratio: Literal["9:16", "1:1", "4:5", "16:9"] = Form(...),
):
    if end_ms <= start_ms:
        raise HTTPException(400, "Invalid interval")
    directory = result_directory(OUTPUT_DIR, request.state.operation)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.mp4"
    output = directory / filename
    try:
        with temporary_studio_source(file) as source:
            result = get_clipper().create_clip(
                video_path=str(source),
                start_time=start_ms / 1000,
                end_time=end_ms / 1000,
                output_path=str(output),
                crop_mode=crop_mode,
                aspect_ratio=ASPECT_RATIO_PRESETS[aspect_ratio],
            )
        if (
            not result.get("success")
            or result.get("output_path") != str(output)
            or not output.is_file()
        ):
            raise HTTPException(502, "Crop output unavailable")
        return {
            **result,
            "output_path": "output/" + filename,
            "output_url": "/output/" + filename,
        }
    except Exception:
        output.unlink(missing_ok=True)
        raise


@app.post("/download-youtube")
async def download_youtube(request: Request, body: YouTubeDownloadRequest):
    match = re.fullmatch(
        r"https://www\.youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})", body.url
    )
    if not match:
        raise HTTPException(400, "Invalid video ID")
    import yt_dlp

    directory = result_directory(UPLOAD_DIR, request.state.operation)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"yt_{match[1]}_{uuid.uuid4().hex[:8]}.mp4"
    with TemporaryDirectory(dir=directory) as temporary:
        path = Path(temporary) / filename
        with yt_dlp.YoutubeDL(
            {
                "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]",
                "outtmpl": str(path),
                "merge_output_format": "mp4",
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "max_filesize": 500 * 1024 * 1024,
            }
        ) as client:
            client.extract_info(body.url, download=True)
        if not path.is_file():
            raise HTTPException(502, "Download unavailable")
        path.replace(directory / filename)
        # Downloaders may preserve the source timestamp; admission expires from receipt creation.
        (directory / filename).touch()
    return {"filename": filename, "path": "uploads/" + filename}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
