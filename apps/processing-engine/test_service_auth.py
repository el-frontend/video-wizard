from fastapi.testclient import TestClient
from main import app


def test_private_routes_deny_anonymous_before_parsing():
    client = TestClient(app)
    for path in [
        "/studio/transcribe-source",
        "/studio/crop-source",
        "/download-youtube",
    ]:
        assert client.post(path).status_code == 401
    assert client.get("/health").status_code == 200


def test_claims_and_sibling_resources(machine, tmp_path, monkeypatch):
    import uuid
    from types import SimpleNamespace
    from pathlib import Path

    client = TestClient(app)
    monkeypatch.chdir(tmp_path)
    seen = []

    def crop(**kwargs):
        seen.append(True)
        Path(kwargs["output_path"]).write_bytes(b"technical")
        return dict(success=True, output_path=kwargs["output_path"])

    monkeypatch.setattr("main.get_clipper", lambda: SimpleNamespace(create_clip=crop))
    args = dict(
        files={"file": ("source", b"fixture")},
        data=dict(start_ms=0, end_ms=200, crop_mode="static", aspect_ratio="9:16"),
    )
    for invalid in [
        dict(aud="video-wizard-renderer"),
        dict(token_use="user"),
        dict(ownerId="invalid"),
        dict(exp=1),
    ]:
        assert (
            client.post(
                "/studio/crop-source", headers=machine("source.crop", **invalid), **args
            ).status_code
            == 401
        )
    other = str(uuid.uuid4())
    assert (
        client.post(
            "/studio/crop-source",
            headers={**machine("source.crop"), "X-Studio-Owner": other},
            **args,
        ).status_code
        == 401
    )
    assert not seen
    result = client.post("/studio/crop-source", headers=machine("source.crop"), **args)
    assert result.status_code == 200
    path = result.json()["output_url"]
    assert client.get(path).status_code == 401
    assert client.get(path, headers=machine("source.crop")).status_code == 401
    for claim in ["ownerId", "jobId", "assetId"]:
        assert (
            client.get(path, headers=machine("crop.read", **{claim: other})).status_code
            == 404
        )
    assert client.get(path, headers=machine("crop.read")).content == b"technical"


def test_cross_language_service_profile(machine):
    import subprocess
    from pathlib import Path
    from service_auth import authorize

    seed = machine("source.crop")["Authorization"][7:]
    script = """
      import {verifyServiceToken, signServiceToken} from '@workspace/service-auth';
      let token='';
      for await (const chunk of process.stdin) token+=chunk;
      const secret=process.env.STUDIO_RENDER_SECRET;
      const input=await verifyServiceToken(token,{secret,audience:'video-wizard-processing',scope:'source.crop'});
      process.stdout.write(await signServiceToken(input,{secret}));
    """
    web = Path(__file__).resolve().parents[1] / "remotion-server"
    exchanged = subprocess.run(
        ["node", "--import", "tsx", "--input-type=module", "-e", script],
        cwd=web,
        input=seed,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert exchanged.returncode == 0
    assert authorize(
        "Bearer " + exchanged.stdout, "source.crop", source=True
    ) == authorize("Bearer " + seed, "source.crop", source=True)


def test_real_http_crop_returns_only_this_operations_audio_video(
    machine, tmp_path, monkeypatch
):
    import json
    import socket
    import subprocess
    import threading
    import time
    import uuid
    import httpx
    import uvicorn

    monkeypatch.chdir(tmp_path)
    source = tmp_path / "synthetic.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=96x96:r=25:d=0.8",
            "-f",
            "lavfi",
            "-i",
            "sine=f=400:d=0.8",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(source),
        ],
        check=True,
    )
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    worker = threading.Thread(
        target=server.run, kwargs={"sockets": [sock]}, daemon=True
    )
    worker.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.01)
        with httpx.Client(
            base_url=f"http://127.0.0.1:{sock.getsockname()[1]}", timeout=60
        ) as client:
            assert client.get("/health").status_code == 200
            assert client.post("/studio/crop-source").status_code == 401
            assert (
                client.post(
                    "/studio/crop-source",
                    headers=machine("source.crop", aud="video-wizard-renderer"),
                ).status_code
                == 401
            )
            with source.open("rb") as f:
                receipt = client.post(
                    "/studio/crop-source",
                    headers=machine("source.crop"),
                    files={"file": ("source.mp4", f, "video/mp4")},
                    data={
                        "start_ms": 0,
                        "end_ms": 600,
                        "crop_mode": "static",
                        "aspect_ratio": "1:1",
                    },
                )
            assert receipt.status_code == 200
            path = receipt.json()["output_url"]
            assert (
                client.get(
                    path, headers=machine("crop.read", ownerId=str(uuid.uuid4()))
                ).status_code
                == 404
            )
            result = client.get(path, headers=machine("crop.read"))
            assert result.status_code == 200
            output = tmp_path / "receipt.mp4"
            output.write_bytes(result.content)
            probe = subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_type",
                    "-of",
                    "json",
                    str(output),
                ]
            )
            assert {s["codec_type"] for s in json.loads(probe)["streams"]} == {
                "audio",
                "video",
            }
    finally:
        server.should_exit = True
        worker.join(10)
        sock.close()
