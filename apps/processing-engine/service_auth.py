import os
import re
from dataclasses import dataclass
from uuid import UUID

import jwt

AUDIENCE = "video-wizard-processing"


@dataclass(frozen=True)
class Operation:
    owner_id: str
    job_id: str
    asset_id: str | None


def uuid_claim(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", value
    ):
        raise ValueError("Invalid service reference")
    item = UUID(value)
    if item.version not in range(1, 9):
        raise ValueError("Invalid service reference")
    return str(item)


def authorize(header, scope, *, source=False):
    secret = os.getenv("STUDIO_RENDER_SECRET", "")
    if len(secret.encode()) < 32 or secret == os.getenv("BETTER_AUTH_SECRET"):
        raise ValueError("Invalid service configuration")
    if not header.startswith("Bearer "):
        raise ValueError("Missing credential")
    token = header[7:]
    claims = jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience=AUDIENCE,
        issuer="video-wizard-backend",
        subject="video-wizard-worker",
        options={
            "strict_aud": True,
            "require": ["iat", "exp", "token_use", "scope", "ownerId", "jobId", "sub"],
        },
    )
    if (
        jwt.get_unverified_header(token).get("typ") != "JWT"
        or claims["token_use"] != "service"
        or claims["scope"] != scope
        or type(claims["iat"]) is not int
        or type(claims["exp"]) is not int
        or claims["exp"] - claims["iat"] != 300
    ):
        raise ValueError("Invalid service profile")
    permitted = {
        "iss",
        "sub",
        "aud",
        "jti",
        "iat",
        "exp",
        "token_use",
        "scope",
        "ownerId",
        "jobId",
    }
    if source:
        permitted.add("assetId")
    if set(claims) - permitted:
        raise ValueError("Unexpected operation references")
    return Operation(
        uuid_claim(claims["ownerId"]),
        uuid_claim(claims["jobId"]),
        uuid_claim(claims.get("assetId")) if source else None,
    )
