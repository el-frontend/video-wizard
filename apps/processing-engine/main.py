"""
Smart Crop & Video Processing Service
FastAPI application for analyzing and cropping videos
"""
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import shutil
from pathlib import Path
from typing import Optional
import logging

from analyzer import VideoAnalyzer
from renderer import VideoRenderer
from audio_service import get_audio_service
from smart_clipper import SmartClipper
from config import (
    WHISPER_MODEL, 
    USE_OPENAI_API, 
    OPENAI_API_KEY,
    DEFAULT_TRANSCRIPTION_LANGUAGE
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Video Processing Service",
    description="Smart crop and video processing using AI",
    version="1.0.0"
)

# CORS configuration for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static file directories for serving uploaded and output files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/output", StaticFiles(directory="output"), name="output")

# Create necessary directories
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Initialize services
analyzer = VideoAnalyzer()
renderer = VideoRenderer()
smart_clipper = SmartClipper()
audio_service = get_audio_service(
    whisper_model=WHISPER_MODEL,
    use_openai_api=USE_OPENAI_API,
    openai_api_key=OPENAI_API_KEY
)


class AnalyzeRequest(BaseModel):
    video_path: str


class AnalyzeResponse(BaseModel):
    video_metadata: dict
    crop_data: list
    smoothed_centers: list


class RenderRequest(BaseModel):
    video_path: str
    crop_data: list
    output_path: Optional[str] = None


class TranscribeRequest(BaseModel):
    video_path: str
    language: Optional[str] = None
    cleanup: Optional[bool] = True


class TranscribeResponse(BaseModel):
    video_path: str
    audio_path: Optional[str]
    segments: list
    full_text: str
    segment_count: int
    language: str  # Detected language code (e.g., "en", "es")


class RenderClipRequest(BaseModel):
    video_path: str
    start_time: float
    end_time: float
    crop_mode: Optional[str] = "dynamic"
    output_path: Optional[str] = None


class RenderClipResponse(BaseModel):
    success: bool
    output_path: Optional[str] = None
    output_url: Optional[str] = None  # HTTP URL to access the file
    crop_mode: Optional[str] = None
    duration: Optional[float] = None
    crop_dimensions: Optional[dict] = None
    file_size: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Video Processing Service",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Upload a video file for processing
    """
    try:
        # Validate file type
        if not file.content_type.startswith("video/"):
            raise HTTPException(status_code=400, detail="File must be a video")
        
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Uploaded file: {file.filename}")
        
        return {
            "filename": file.filename,
            "path": str(file_path),
            "message": "File uploaded successfully"
        }
    
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/analyze-video", response_model=AnalyzeResponse)
async def analyze_video(request: AnalyzeRequest):
    """
    Analyze video and generate crop coordinates for vertical format
    
    Input: Video path (16:9)
    Output: Crop data for 9:16 vertical shorts
    """
    try:
        video_path = request.video_path
        
        # Validate video file exists
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        logger.info(f"Analyzing video: {video_path}")
        
        # Analyze video
        result = analyzer.analyze(video_path)
        
        logger.info(f"Analysis complete. Found {len(result['crop_data'])} frames")
        
        return AnalyzeResponse(**result)
    
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/render-video")
async def render_video(request: RenderRequest):
    """
    Render cropped video using the analysis data
    """
    try:
        video_path = request.video_path
        crop_data = request.crop_data
        
        # Validate video file
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Generate output path if not provided
        if request.output_path:
            output_path = request.output_path
        else:
            filename = Path(video_path).stem
            output_path = str(OUTPUT_DIR / f"{filename}_cropped.mp4")
        
        logger.info(f"Rendering video: {video_path} -> {output_path}")
        
        # Render video
        result = renderer.render(video_path, crop_data, output_path)
        
        logger.info(f"Rendering complete: {output_path}")
        
        return result
    
    except Exception as e:
        logger.error(f"Rendering error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Rendering failed: {str(e)}")


@app.post("/process-video")
async def process_video(request: AnalyzeRequest):
    """
    Complete pipeline: Analyze + Render in one call
    """
    try:
        # First analyze
        analyze_result = await analyze_video(request)
        
        # Then render
        filename = Path(request.video_path).stem
        output_path = str(OUTPUT_DIR / f"{filename}_cropped.mp4")
        
        render_request = RenderRequest(
            video_path=request.video_path,
            crop_data=analyze_result.crop_data,
            output_path=output_path
        )
        
        render_result = await render_video(render_request)
        
        return {
            "analysis": analyze_result.dict(),
            "render": render_result,
            "output_path": output_path
        }
    
    except Exception as e:
        logger.error(f"Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_video(request: TranscribeRequest):
    """
    Extract audio from video and generate timestamped transcription
    
    Input: Video file path
    Output: JSON with transcript segments containing start/end timestamps and text
    
    Example response:
    {
        "video_path": "path/to/video.mp4",
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": 4.5,
                "text": "Welcome to this tutorial about NextJS."
            },
            ...
        ],
        "full_text": "Complete transcription...",
        "segment_count": 42
    }
    """
    try:
        video_path = request.video_path
        
        # Validate video file exists
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        logger.info(f"Starting transcription for: {video_path}")
        
        # Run transcription pipeline
        result = audio_service.transcribe_video(
            video_path=video_path,
            language=request.language,
            cleanup=request.cleanup
        )
        
        logger.info(f"Transcription complete. Generated {result['segment_count']} segments")
        
        return TranscribeResponse(**result)
    
    except FileNotFoundError as e:
        logger.error(f"File not found: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/render-clip", response_model=RenderClipResponse)
async def render_clip(request: RenderClipRequest):
    """
    Create a vertical short clip with smart cropping (Phase O)
    
    Extracts a segment from a source video, crops it to 9:16 aspect ratio,
    and applies intelligent face tracking to keep the speaker centered.
    
    Input:
    - video_path: Path to source video file
    - start_time: Start timestamp in seconds (e.g., 10.5)
    - end_time: End timestamp in seconds (e.g., 40.0)
    - crop_mode: "dynamic" for smooth face tracking or "static" for fixed center
    - output_path: Optional custom output path
    
    Output:
    - success: Boolean indicating if rendering succeeded
    - output_path: Path to the generated clip
    - crop_mode: The mode used for cropping
    - duration: Length of the clip in seconds
    - crop_dimensions: Width and height of the crop
    - file_size: Size of the output file in bytes
    
    Example request:
    {
        "video_path": "/uploads/my_video.mp4",
        "start_time": 10.5,
        "end_time": 40.0,
        "crop_mode": "dynamic"
    }
    
    Example response:
    {
        "success": true,
        "output_path": "/output/clip_1234.mp4",
        "crop_mode": "dynamic",
        "duration": 29.5,
        "crop_dimensions": {"width": 608, "height": 1080},
        "file_size": 5242880,
        "start_time": 10.5,
        "end_time": 40.0
    }
    """
    try:
        video_path = request.video_path
        
        # Validate video file exists
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Validate time range
        if request.start_time < 0:
            raise HTTPException(status_code=400, detail="start_time must be >= 0")
        
        if request.start_time >= request.end_time:
            raise HTTPException(status_code=400, detail="start_time must be less than end_time")
        
        # Validate crop mode
        if request.crop_mode not in ["dynamic", "static"]:
            raise HTTPException(status_code=400, detail="crop_mode must be 'dynamic' or 'static'")
        
        # Generate output path if not provided
        if request.output_path:
            output_path = request.output_path
        else:
            filename = Path(video_path).stem
            timestamp = int(request.start_time)
            output_path = str(OUTPUT_DIR / f"{filename}_clip_{timestamp}s.mp4")
        
        logger.info(
            f"Rendering clip: {video_path} "
            f"[{request.start_time}s - {request.end_time}s] "
            f"mode={request.crop_mode} -> {output_path}"
        )
        
        # Create the clip using SmartClipper
        result = smart_clipper.create_clip(
            video_path=video_path,
            start_time=request.start_time,
            end_time=request.end_time,
            output_path=output_path,
            crop_mode=request.crop_mode
        )
        
        # Generate accessible URL for the output file
        if result.get("success") and result.get("output_path"):
            # Convert local path to HTTP URL
            output_filename = Path(result["output_path"]).name
            result["output_url"] = f"/output/{output_filename}"
        
        logger.info(f"Clip rendering complete: {output_path}")
        
        return RenderClipResponse(**result)
    
    except FileNotFoundError as e:
        logger.error(f"File not found: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Clip rendering error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Clip rendering failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
