import json
from math import isfinite
from pathlib import Path
import subprocess


# Probe self-contained video containers without opening playlists or manifests.
VIDEO_DEMUXERS = "mov,matroska,avi,asf,mpeg,mpegts,flv,ogg,rm,mxf"


def probe_video_duration_ms(video_path: str) -> int:
    parts = video_path.removeprefix("/").split("/")
    if (
        len(parts) < 2
        or parts[0] not in {"uploads", "output"}
        or any(part in {"", ".", ".."} for part in parts)
        or "\\" in video_path
        or "\0" in video_path
    ):
        raise ValueError("Invalid video path")

    media_root = Path(parts[0]).resolve()
    path = media_root.joinpath(*parts[1:]).resolve()
    if not path.is_relative_to(media_root):
        raise ValueError("Invalid video path")
    if not path.is_file():
        raise FileNotFoundError("Video file not found")

    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-protocol_whitelist", "file",
                "-format_whitelist", VIDEO_DEMUXERS, "-select_streams", "V:0",
                "-show_entries", "stream=codec_type:format=duration", "-of", "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        metadata = json.loads(result.stdout)
        duration_ms = float(metadata["format"]["duration"]) * 1000
    except (subprocess.SubprocessError, KeyError, ValueError) as exc:
        raise ValueError("Could not measure the source video duration") from exc

    if not metadata["streams"] or not isfinite(duration_ms) or duration_ms <= 0:
        raise ValueError("Could not measure the source video duration")

    return max(1, round(duration_ms))
