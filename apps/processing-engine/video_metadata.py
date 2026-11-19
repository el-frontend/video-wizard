import json
from math import isfinite
from pathlib import Path
import subprocess
from tempfile import TemporaryFile


# Probe self-contained video containers without opening playlists or manifests.
FFPROBE = [
    "ffprobe", "-v", "error", "-protocol_whitelist", "file", "-format_whitelist",
    "mov,matroska,avi,asf,mpeg,mpegts,flv,ogg,rm,mxf",
]


def _seconds(value: str | None) -> float | None:
    if value is None or value == "N/A":
        return None
    seconds = float(value)
    return seconds if isfinite(seconds) else None


def _duration_from_packets(path: Path, stream_indices: set[str], start: float | None) -> float:
    first = float("inf")
    end = float("-inf")
    # Keep the packet listing off the heap even for long recordings.
    with TemporaryFile(mode="w+t") as packets:
        subprocess.run(
            [
                *FFPROBE, "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time",
                "-of", "compact=p=0", str(path),
            ],
            check=True,
            stdout=packets,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        packets.seek(0)
        for line in packets:
            fields = dict(field.split("=", 1) for field in line.rstrip().split("|") if "=" in field)
            if fields.get("stream_index") not in stream_indices:
                continue
            timestamp = _seconds(fields.get("pts_time"))
            if timestamp is None:
                timestamp = _seconds(fields.get("dts_time"))
            if timestamp is None:
                continue
            first = min(first, timestamp)
            end = max(end, timestamp + (_seconds(fields.get("duration_time")) or 0))

    return end - (first if start is None else start)


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
                *FFPROBE, "-show_entries",
                "stream=index,codec_type:stream_disposition=attached_pic,timed_thumbnails:format=duration,start_time",
                "-of", "json", str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        metadata = json.loads(result.stdout)
        video_indices = {
            str(stream["index"])
            for stream in metadata["streams"]
            if stream["codec_type"] == "video" and not any(stream.get("disposition", {}).values())
        }
        if not video_indices:
            raise ValueError("No video stream")

        container = metadata["format"]
        duration = _seconds(container.get("duration"))
        if duration is None or duration <= 0:
            audio_indices = {
                str(stream["index"])
                for stream in metadata["streams"]
                if stream["codec_type"] == "audio"
            }
            duration = _duration_from_packets(
                path, video_indices | audio_indices, _seconds(container.get("start_time"))
            )
    except (subprocess.SubprocessError, KeyError, ValueError) as exc:
        raise ValueError("Could not measure the source video duration") from exc

    if not isfinite(duration) or duration <= 0:
        raise ValueError("Could not measure the source video duration")

    return max(1, round(duration * 1000))
