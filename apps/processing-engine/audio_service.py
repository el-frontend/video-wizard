"""
Audio Extraction & Transcription Service
Handles audio extraction from video files and speech-to-text transcription
"""
import os
import logging
from pathlib import Path
from typing import List, Dict, Optional
import ffmpeg
import whisper
import torch
from openai import OpenAI

logger = logging.getLogger(__name__)


class AudioService:
    """Service for handling audio extraction and transcription"""
    
    def __init__(
        self, 
        whisper_model: str = "base", 
        temp_dir: str = "temp",
        use_openai_api: bool = False,
        openai_api_key: Optional[str] = None
    ):
        """
        Initialize the audio service
        
        Args:
            whisper_model: Whisper model size ("tiny", "base", "small", "medium", "large")
            temp_dir: Directory for temporary audio files
            use_openai_api: Use OpenAI API instead of local Whisper (recommended for Spanish)
            openai_api_key: OpenAI API key (required if use_openai_api=True)
        """
        self.whisper_model_name = whisper_model
        self.temp_dir = Path(temp_dir)
        self.temp_dir.mkdir(exist_ok=True)
        self.use_openai_api = use_openai_api
        
        # Initialize OpenAI client if using API
        if use_openai_api:
            if not openai_api_key:
                openai_api_key = os.getenv("OPENAI_API_KEY")
            if not openai_api_key:
                raise ValueError("OpenAI API key required when use_openai_api=True. Set OPENAI_API_KEY env variable.")
            self.openai_client = OpenAI(api_key=openai_api_key)
            self._whisper_model = None
            logger.info("AudioService initialized with OpenAI API")
        else:
            # Initialize Whisper model lazily (loaded on first use)
            self._whisper_model = None
            self.openai_client = None
            logger.info(f"AudioService initialized with local Whisper model={whisper_model}")
    
    @property
    def whisper_model(self):
        """Lazy load Whisper model"""
        if self._whisper_model is None:
            logger.info(f"Loading Whisper model: {self.whisper_model_name}")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self._whisper_model = whisper.load_model(self.whisper_model_name, device=device)
            logger.info(f"Whisper model loaded on device: {device}")
        return self._whisper_model
    
    def extract_audio(
        self, 
        video_path: str, 
        output_format: str = "wav",
        sample_rate: int = 16000,
        audio_bitrate: str = "128k"
    ) -> str:
        """
        Extract audio track from video file using FFmpeg
        
        Args:
            video_path: Path to input video file
            output_format: Output audio format ("wav" or "mp3")
            sample_rate: Audio sample rate in Hz (16000 recommended for Whisper)
            audio_bitrate: Audio bitrate for mp3 format
        
        Returns:
            Path to extracted audio file
        
        Raises:
            FileNotFoundError: If video file doesn't exist
            RuntimeError: If audio extraction fails
        """
        # Validate input
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        # Generate output path
        video_name = Path(video_path).stem
        audio_filename = f"{video_name}_audio.{output_format}"
        audio_path = self.temp_dir / audio_filename
        
        logger.info(f"Extracting audio from {video_path} to {audio_path}")
        
        try:
            # Build FFmpeg command
            stream = ffmpeg.input(video_path)
            
            if output_format == "wav":
                # Extract as WAV with specific sample rate
                stream = ffmpeg.output(
                    stream.audio,
                    str(audio_path),
                    acodec='pcm_s16le',  # 16-bit PCM
                    ac=1,  # Mono audio
                    ar=sample_rate  # Sample rate
                )
            elif output_format == "mp3":
                # Extract as MP3
                stream = ffmpeg.output(
                    stream.audio,
                    str(audio_path),
                    acodec='libmp3lame',
                    audio_bitrate=audio_bitrate,
                    ar=sample_rate
                )
            else:
                raise ValueError(f"Unsupported audio format: {output_format}")
            
            # Run FFmpeg (overwrite output file if exists)
            ffmpeg.run(stream, overwrite_output=True, quiet=True)
            
            logger.info(f"Audio extracted successfully: {audio_path}")
            return str(audio_path)
        
        except ffmpeg.Error as e:
            error_msg = f"FFmpeg error during audio extraction: {e.stderr.decode() if e.stderr else str(e)}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        except Exception as e:
            error_msg = f"Unexpected error during audio extraction: {str(e)}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
    
    def transcribe_audio(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> tuple[List[Dict], str]:
        """
        Transcribe audio file using OpenAI Whisper (local or API)

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., "en", "es"). None for auto-detect
            task: "transcribe" or "translate" (translate to English)

        Returns:
            Tuple of (segments, detected_language):
            - segments: List of transcript segments with timestamps
            - detected_language: Language code detected by Whisper

        Raises:
            FileNotFoundError: If audio file doesn't exist
            RuntimeError: If transcription fails
        """
        # Validate input
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        logger.info(f"Transcribing audio: {audio_path} (method={'API' if self.use_openai_api else 'local'})")

        try:
            if self.use_openai_api:
                return self._transcribe_with_api(audio_path, language)
            else:
                return self._transcribe_local(audio_path, language, task)

        except Exception as e:
            error_msg = f"Error during transcription: {str(e)}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
    
    def _transcribe_with_api(self, audio_path: str, language: Optional[str]) -> tuple[List[Dict], str]:
        """
        Transcribe using OpenAI API

        Args:
            audio_path: Path to audio file
            language: Language code (defaults to None for auto-detect)

        Returns:
            Tuple of (segments list, detected language code)
        """
        logger.info("Using OpenAI API for transcription")

        with open(audio_path, "rb") as audio_file:
            # API call with timestamp granularity
            # If language not specified, let Whisper auto-detect
            transcript = self.openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language,  # None for auto-detect
                response_format="verbose_json",
                timestamp_granularities=["segment"]
            )

        # Get detected language from response
        detected_language = transcript.language or language or "en"

        # Format API response to match local format
        segments = []
        for idx, segment in enumerate(transcript.segments):
            segments.append({
                "id": idx,
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip()
            })

        logger.info(f"API transcription complete. Generated {len(segments)} segments. Language: {detected_language}")
        return segments, detected_language
    
    def _transcribe_local(
        self,
        audio_path: str,
        language: Optional[str],
        task: str
    ) -> tuple[List[Dict], str]:
        """
        Transcribe using local Whisper model

        Args:
            audio_path: Path to audio file
            language: Language code
            task: "transcribe" or "translate"

        Returns:
            Tuple of (segments list, detected language code)
        """
        logger.info("Using local Whisper model for transcription")

        # Transcribe using Whisper
        result = self.whisper_model.transcribe(
            audio_path,
            language=language,
            task=task,
            verbose=False
        )

        # Get detected language
        detected_language = result.get("language", language or "en")

        # Format output as structured JSON
        segments = []
        for idx, segment in enumerate(result["segments"]):
            segments.append({
                "id": idx,
                "start": round(segment["start"], 2),
                "end": round(segment["end"], 2),
                "text": segment["text"].strip()
            })

        logger.info(f"Local transcription complete. Generated {len(segments)} segments. Language: {detected_language}")
        return segments, detected_language
    
    def transcribe_video(
        self,
        video_path: str,
        language: Optional[str] = None,
        cleanup: bool = True
    ) -> Dict:
        """
        Complete pipeline: Extract audio from video and transcribe

        Args:
            video_path: Path to video file
            language: Language code for transcription. None for auto-detect
            cleanup: Whether to delete temporary audio file after transcription

        Returns:
            Dictionary containing:
            {
                "video_path": str,
                "audio_path": str,
                "segments": List[Dict],
                "full_text": str,
                "segment_count": int,
                "language": str  # Detected language code
            }
        """
        logger.info(f"Starting video transcription pipeline: {video_path}")

        try:
            # Step 1: Extract audio
            audio_path = self.extract_audio(video_path)

            # Step 2: Transcribe audio (returns segments and detected language)
            segments, detected_language = self.transcribe_audio(audio_path, language=language)

            # Generate full text
            full_text = " ".join(segment["text"] for segment in segments)

            # Step 3: Cleanup (optional)
            if cleanup and os.path.exists(audio_path):
                os.remove(audio_path)
                logger.info(f"Cleaned up temporary audio file: {audio_path}")

            result = {
                "video_path": video_path,
                "audio_path": audio_path if not cleanup else None,
                "segments": segments,
                "full_text": full_text,
                "segment_count": len(segments),
                "language": detected_language
            }

            logger.info(f"Video transcription complete: {len(segments)} segments. Language: {detected_language}")

            return result

        except Exception as e:
            logger.error(f"Video transcription pipeline failed: {str(e)}")
            raise
    
    def cleanup_temp_files(self):
        """Clean up all temporary audio files"""
        try:
            count = 0
            for file in self.temp_dir.glob("*_audio.*"):
                file.unlink()
                count += 1
            logger.info(f"Cleaned up {count} temporary audio files")
        except Exception as e:
            logger.warning(f"Error during cleanup: {str(e)}")


# Singleton instance
_audio_service = None


def get_audio_service(
    whisper_model: str = "base",
    use_openai_api: bool = False,
    openai_api_key: Optional[str] = None
) -> AudioService:
    """Get or create AudioService singleton"""
    global _audio_service
    if _audio_service is None:
        _audio_service = AudioService(
            whisper_model=whisper_model,
            use_openai_api=use_openai_api,
            openai_api_key=openai_api_key
        )
    return _audio_service
