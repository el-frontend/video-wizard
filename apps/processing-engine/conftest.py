import secrets
import time
from uuid import uuid4
import jwt
import pytest


@pytest.fixture
def machine(monkeypatch):
    secret = secrets.token_hex(40)
    monkeypatch.setenv("STUDIO_RENDER_SECRET", secret)
    defaults = dict(ownerId=str(uuid4()), jobId=str(uuid4()), assetId=str(uuid4()))

    def headers(scope, **changes):
        now = int(time.time())
        claims = dict(
            iss="video-wizard-backend",
            aud="video-wizard-processing",
            sub="video-wizard-worker",
            token_use="service",
            scope=scope,
            iat=now,
            exp=now + 300,
            **defaults,
        )
        if scope in ("source.download", "download.read"):
            del claims["assetId"]
        claims.update(changes)
        return {
            "Authorization": "Bearer " + jwt.encode(claims, secret, algorithm="HS256")
        }

    return headers
