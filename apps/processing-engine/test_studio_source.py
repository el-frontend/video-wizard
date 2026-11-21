from io import BytesIO
from pathlib import Path

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, audio_service, smart_clipper, temporary_studio_source


def upload(data):
    return UploadFile(
        file=BytesIO(data),
        filename="video.avi",
        headers=Headers({"content-type": "video/x-msvideo"}),
    )


def test_concurrent_operations_release_only_their_own_files_even_on_failure(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    old = tmp_path / "uploads" / "video.avi"
    old.parent.mkdir()
    old.write_bytes(b"legacy")
    with temporary_studio_source(upload(b"one")) as first:
        assert first.read_bytes() == b"one"
        with pytest.raises(RuntimeError):
            with temporary_studio_source(upload(b"two")) as second:
                assert first != second
                assert second.read_bytes() == b"two"
                raise RuntimeError("processing error")
        assert not second.exists()
        assert first.exists()
    assert not first.exists()
    assert old.read_bytes() == b"legacy"


@pytest.mark.parametrize("operation", ["transcribe", "crop"])
@pytest.mark.parametrize("fail", [False, True])
def test_route_removes_source_and_intermediates(monkeypatch, operation, fail):
    seen = []

    def track(video_path):
        path = Path(video_path)
        seen.append(path)
        assert path.read_bytes() == b"original"
        return path

    def transcribe(video_path, *, work_dir):
        path = track(video_path)
        assert path.parent == work_dir
        (work_dir / "source_audio.wav").write_bytes(b"wav")
        if fail:
            raise RuntimeError("transcription failed")
        return {
            "video_path": video_path,
            "audio_path": None,
            "language": "es",
            "full_text": "",
            "segment_count": 0,
            "segments": [],
        }

    def crop(**kwargs):
        track(kwargs["video_path"])
        if fail:
            raise RuntimeError("crop failed")
        return {"success": True, "output_path": kwargs["output_path"]}

    monkeypatch.setattr(audio_service, "transcribe_video", transcribe)
    monkeypatch.setattr(smart_clipper, "create_clip", crop)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            f"/studio/{operation}-source",
            files={"file": ("old.avi", b"original", "video/x-msvideo")},
            data={"start_ms": "0", "end_ms": "1000", "crop_mode": "static", "aspect_ratio": "9:16"},
        )
    assert response.status_code == (500 if fail else 200)
    assert len(seen) == 1 and not seen[0].parent.exists()


def test_crop_requires_the_exact_output_generated_for_this_operation(monkeypatch):
    monkeypatch.setattr(smart_clipper, "create_clip", lambda **_: {
        "success": True, "output_path": "output/older.mp4",
    })
    with TestClient(app) as client:
        response = client.post(
            "/studio/crop-source",
            files={"file": ("source", b"video", "video/x-msvideo")},
            data={"start_ms": "0", "end_ms": "1000", "crop_mode": "static", "aspect_ratio": "9:16"},
        )
    assert response.status_code == 502
